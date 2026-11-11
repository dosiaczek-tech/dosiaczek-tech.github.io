// Run the actual coastal solver locally when published results cannot be refreshed.
const { readFile, mkdir, open } = require("node:fs/promises");
const { spawn } = require("node:child_process");
const path = require("node:path");
const M = require("../surf-model.js");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".dev-preview", "swan-data");
const cache = path.join(root, ".dev-preview", "swan-cache");

async function readJSON(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return null; throw error; }
}
function usableSwan(bundle, spot, now = Date.now()) {
  if (!Array.isArray(bundle?.hourly)) return false;
  const rows = bundle.hourly.filter(r => Number.isFinite(r?.time) && r.time >= Math.floor(now / 3600000) * 3600)
    .map(r => ({ time: r.time }));
  return M.applySimulation(rows, bundle, spot, now).some(r => r.simulation);
}
function historyCoverage(bundle, spot, now) {
  const current = Math.floor(now / 3600000) * 3600;
  const rows = Array.from({ length: 24 }, (_, i) => ({ time: current - (24 - i) * 3600 }));
  return M.applySimulation(rows, bundle, spot, now).filter(row => row.simulation).length;
}
async function runSolver() {
  await mkdir(path.dirname(output), { recursive: true });
  const log = await open(path.join(root, ".dev-preview", "swan-refresh.log"), "a");
  try {
    await log.write(`\nSWAN refresh ${new Date().toISOString()}\n`);
    await new Promise((resolve, reject) => {
      const child = spawn("python3", ["-u", "model/nearshore.py", "--cache", cache, "--output", output, "--workers", "4"],
        { cwd: root, detached: true, stdio: ["ignore", log.fd, log.fd] });
      const timer = setTimeout(() => {
        try { process.kill(-child.pid, "SIGTERM"); } catch { /* The process already exited. */ }
      }, 30 * 60000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`Lokalne obliczenia SWAN nie powiodły się (${signal || code}). Szczegóły: .dev-preview/swan-refresh.log`));
      });
    });
    return await readJSON(path.join(output, "status.json"));
  } finally { await log.close(); }
}
function createPreviewSwan({ spots, now = Date.now, run = runSolver,
  readResult = id => readJSON(path.join(output, "nearshore", `${id}.json`)),
  readStatus = () => readJSON(path.join(output, "status.json")), onRefresh = () => {}, onFailure = () => {} }) {
  const byId = new Map(spots.map(s => [s.id, s]));
  let pending = null, nextAttempt = 0, failure = null;
  const initialized = Promise.resolve().then(readStatus).then(status => {
    if (status?.version === M.SIMULATION_VERSION && status.spots === spots.length && status.available > 0 && Number.isFinite(status.generatedAt) && status.generatedAt * 1000 <= now())
      nextAttempt = status.generatedAt * 1000 + 6 * 3600000;
  }).catch(() => {});
  function refresh() {
    if (pending) return pending;
    if (now() < nextAttempt) return Promise.resolve();
    failure = null;
    pending = Promise.resolve().then(run).then(status => {
      nextAttempt = now() + 6 * 3600000;
      onRefresh(status);
    }).catch(error => {
      failure = error;
      nextAttempt = now() + 15 * 60000;
      onFailure(error);
    }).finally(() => { pending = null; });
    return pending;
  }
  async function get(id, published = null) {
    const spot = byId.get(id);
    if (!spot) throw new Error("Nieznany spot prognozy SWAN");
    await initialized;
    const local = await readResult(id);
    const candidates = [published, local].filter(value => usableSwan(value, spot, now()))
      .map(value => ({ value, history: historyCoverage(value, spot, now()) }));
    // Older formats contain six or twelve history samples. Keep a valid complete local run.
    candidates.sort((a, b) => Number(b.history === 24) - Number(a.history === 24) ||
      M.simulationAge(a.value, now()) - M.simulationAge(b.value, now()) || b.value.generatedAt - a.value.generatedAt);
    const chosen = candidates[0]?.value;
    // Start before the 18 h cutoff, leaving time to fetch inputs and calculate the coast.
    if (!chosen || candidates[0].history < 24 || M.simulationAge(chosen, now()) >= 12) refresh();
    const value = chosen || published || local || { schema: 2, status: "unavailable", spot: { id }, error: "Oczekiwanie na obliczenia SWAN." };
    return { ...value, ...(value === local ? { sourceType: "local" } : {}),
      refreshPending: Boolean(pending), refreshError: failure?.message,
      retryAfter: pending ? 15 : Math.max(15, Math.ceil((nextAttempt - now()) / 1000)) };
  }
  async function status(published = null) {
    const local = await readStatus();
    return local?.spots === spots.length && Number.isFinite(local.generatedAt) && local.generatedAt * 1000 <= now() + 300000 &&
      local.generatedAt > (published?.generatedAt || 0) ? { ...local, sourceType: "local" } : published;
  }
  // Background ticks must wait for the persisted cooldown, just like requests do.
  // refresh() shares an in-flight run and applies both success and failure backoff.
  async function maintain() { await initialized; await refresh(); }
  return { get, refresh, maintain, status, has: id => byId.has(id) };
}
module.exports = { createPreviewSwan, usableSwan };

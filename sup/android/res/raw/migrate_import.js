(function (snapshot, prefix) {
  const inserted = [];
  try {
    const values = JSON.parse(snapshot);
    for (const [key, value] of Object.entries(values)) {
      if (!key.startsWith(prefix) || typeof value !== 'string') throw new Error('Invalid storage');
      const existing = localStorage.getItem(key);
      // Never overwrite a different journal already saved at the destination.
      if (existing !== null && existing !== value) throw new Error('Storage conflict');
      if (existing === null) {
        localStorage.setItem(key, value);
        inserted.push(key);
        if (localStorage.getItem(key) !== value) throw new Error('Write failed');
      }
    }
    return true;
  } catch {
    for (const key of inserted) localStorage.removeItem(key);
    return false;
  }
})

(function (prefix) {
  try {
    const result = Object.create(null);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(prefix)) result[key] = localStorage.getItem(key);
    }
    return JSON.stringify(result);
  } catch { return null; }
})

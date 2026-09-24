function withTimeout(promise, ms, code = 'JOB_TIMEOUT') {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error(`${String(code).toLowerCase()}_timeout`), { code })),
        ms,
      );
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

module.exports = { withTimeout };
/**
 * Manual clock for the TimerApi used by debounce / save-state / row-flash, so
 * tests can step time without waiting. `advance(ms)` runs every due callback in
 * time order, including callbacks scheduled by callbacks.
 */
export function createFakeTimers() {
  let now = 0;
  let seq = 0;
  const tasks = new Map();

  return {
    api: {
      setTimeout(callback, ms) {
        const id = ++seq;
        tasks.set(id, { at: now + ms, callback });
        return id;
      },
      clearTimeout(id) {
        tasks.delete(id);
      }
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let next = null;
        for (const [id, task] of tasks) {
          if (task.at <= target && (next === null || task.at < next.task.at)) next = { id, task };
        }
        if (next === null) break;
        tasks.delete(next.id);
        now = next.task.at;
        next.task.callback();
      }
      now = target;
    },
    now: () => now,
    pending: () => tasks.size
  };
}

/** A promise plus its resolve/reject, for holding a request open in a test. */
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

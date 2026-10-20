type VisibilityDocument = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;

/** Native show() can resolve before WebKit dispatches visibilitychange.
 * Wait for visibility and two quiet rendering frames before attaching Player. */
export function whenVisible({doc = document, signal, frame = requestAnimationFrame, cancel = cancelAnimationFrame, timeout = 10000}: {
  doc?: VisibilityDocument; signal?: AbortSignal;
  frame?: typeof requestAnimationFrame; cancel?: typeof cancelAnimationFrame; timeout?: number;
} = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    let pending: number | undefined, quietFrames = 0, finished = false;
    const timer = setTimeout(() => finish(Error('Pet window did not become visible')), timeout);
    function finish(error?: Error) {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (pending !== undefined) cancel(pending);
      doc.removeEventListener('visibilitychange', changed);
      signal?.removeEventListener('abort', aborted);
      error ? reject(error) : resolve();
    }
    function aborted() { const error = Error('Pet visibility wait cancelled'); error.name = 'AbortError'; finish(error); }
    function painted() {
      pending = undefined;
      if (doc.hidden) { quietFrames = 0; return; }
      if (++quietFrames === 2) finish();
      else pending = frame(painted);
    }
    function changed() {
      if (pending !== undefined) cancel(pending);
      pending = undefined; quietFrames = 0;
      if (!doc.hidden) pending = frame(painted);
    }
    doc.addEventListener('visibilitychange', changed);
    signal?.addEventListener('abort', aborted, {once: true});
    if (signal?.aborted) aborted(); else changed();
  });
}

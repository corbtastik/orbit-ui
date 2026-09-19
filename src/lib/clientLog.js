// Ships uncaught browser errors to the server log.
//
// A stack trace sitting in a browser console is invisible to anyone not at
// that machine, and an async failure with no catch produces nothing on screen
// and nothing in the server log -- which is exactly how a silent failure in
// this view went undiagnosed for a long time.

let enabled = true;

export function clientLog(message, extra) {
  if (!enabled) return;
  // Deliberately fire-and-forget: diagnostics must never change the behaviour
  // of the thing being diagnosed.
  fetch('/chat/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `[client] ${message}`,
      stack: extra ? String(extra) : '',
    }),
  }).catch(() => {
    enabled = false; // server unreachable; stop trying
  });
}

export function installClientErrorReporting() {
  window.addEventListener('error', (e) => {
    clientLog(`window.error: ${e.message}`, e.error?.stack ?? `${e.filename}:${e.lineno}`);
  });

  // The one that matters here: an async failure with no catch produces
  // nothing on screen and nothing in the server log.
  window.addEventListener('unhandledrejection', (e) => {
    clientLog(`unhandledrejection: ${e.reason?.message ?? e.reason}`, e.reason?.stack);
  });
}

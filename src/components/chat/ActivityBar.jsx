import React, { useEffect, useState } from 'react';

// What the assistant is doing, and for how long.
//
// Answers here run 45-90 seconds across 20+ tool calls. A caret alone gives no
// signal that anything is happening, so a healthy run and a hung one look the
// same -- the single biggest reason this was hard to diagnose.
export default function ActivityBar({ activity }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activity) return undefined;
    const tick = () => setElapsed(Math.round((Date.now() - activity.startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activity]);

  if (!activity) return null;

  const { label, calls } = activity;

  return (
    <div className="chat__activity" role="status" aria-live="polite">
      <span className="chat__activity-spinner" aria-hidden="true" />
      <span className="chat__activity-label">
        {label === 'thinking' && 'Thinking'}
        {label === 'answering' && 'Answering'}
        {label !== 'thinking' && label !== 'answering' && (
          <>calling <code>{label}</code></>
        )}
      </span>
      {calls > 0 && <span className="chat__activity-count">{calls} tool call{calls === 1 ? '' : 's'}</span>}
      <span className="chat__activity-elapsed">{elapsed}s</span>
    </div>
  );
}

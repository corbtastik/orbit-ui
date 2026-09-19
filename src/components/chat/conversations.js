// Sidebar helpers. The sample data that used to live here went when the
// sidebar started loading from the API -- keeping fake conversations around
// alongside real ones is only a way to confuse the two.
//
// The document shape, for reference:
//
//   project      { id, name }
//   conversation { id, title, projectId, updatedAt, provider, messageCount }
//
// projectId === DEFAULT_PROJECT means the conversation is unfiled. That is a
// real state, not a placeholder: most chats never get filed anywhere.
export const DEFAULT_PROJECT = 'default';

// Short, relative, and stable enough to read at a glance. Absolute dates in a
// sidebar are noise; the only question being asked is "how recent".
export function relativeTime(iso, now = Date.now()) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

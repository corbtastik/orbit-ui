// Thin wrapper over the chat history endpoints. Vite proxies /chat to the
// visualizer's own server on :4000, so these are same-origin in development.

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${options.method ?? 'GET'} ${path} failed (${res.status})`);
  }
  return res.json();
}

export const listProjects = () =>
  request('/chat/projects').then((r) => r.projects);

export const createProject = (name) =>
  request('/chat/projects', { method: 'POST', body: JSON.stringify({ name }) })
    .then((r) => r.project);

export const listConversations = () =>
  request('/chat/conversations').then((r) => r.conversations);

export const getConversation = (id) =>
  request(`/chat/conversations/${id}`).then((r) => r.conversation);

export const createConversation = (body) =>
  request('/chat/conversations', { method: 'POST', body: JSON.stringify(body) })
    .then((r) => r.conversation);

export const updateConversation = (id, patch) =>
  request(`/chat/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    .then((r) => r.conversation);

export const appendTurns = (id, body) =>
  request(`/chat/conversations/${id}/turns`, { method: 'POST', body: JSON.stringify(body) })
    .then((r) => r.conversation);

export const deleteConversation = (id) =>
  request(`/chat/conversations/${id}`, { method: 'DELETE' });

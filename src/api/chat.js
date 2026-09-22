// Thin wrapper over the server's /chat endpoints. Vite proxies /chat to the
// API on :7002, so these are same-origin in development.

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

// Matches titles and message text. Returns each conversation plus a snippet
// of the match, so a result can say why it matched.
export const searchConversations = (q) =>
  request(`/chat/conversations/search?q=${encodeURIComponent(q)}`).then((r) => r.results);

export const setPinned = (id, pinned) =>
  request(`/chat/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ pinned }) })
    .then((r) => r.conversation);

export const deleteConversation = (id) =>
  request(`/chat/conversations/${id}`, { method: 'DELETE' });

// --- browsed clusters (the sidebar tree) ------------------------------------
// Read-only. Databases arrive with the cluster; collections are fetched when
// a database is expanded. See server/clusters/registry.js.

export const listClusters = () =>
  request('/chat/clusters').then((r) => r.clusters);

export const listCollections = (clusterId, dbName) =>
  request(`/chat/clusters/${clusterId}/databases/${encodeURIComponent(dbName)}/collections`)
    .then((r) => r.collections);

export const collectionStats = (clusterId, dbName) =>
  request(`/chat/clusters/${clusterId}/databases/${encodeURIComponent(dbName)}/stats`)
    .then((r) => r.collections);

export const listDocuments = (clusterId, dbName, collName, { skip = 0, limit = 25 } = {}) =>
  request(
    `/chat/clusters/${clusterId}/databases/${encodeURIComponent(dbName)}` +
      `/collections/${encodeURIComponent(collName)}/documents?skip=${skip}&limit=${limit}`
  );

// --- object storage (the sidebar tree) --------------------------------------
// Read-only. Buckets arrive with the store; objects are fetched when a bucket
// is opened. See server/storage/registry.js.

export const listStores = () =>
  request('/chat/storage').then((r) => r.stores);

// Paging is forward-only: `token` comes from a previous page's `nextToken` and
// there is no way to address a page without having walked to it.
export const listObjects = (storeId, bucket, { prefix = '', token = '', limit = 50 } = {}) => {
  const q = new URLSearchParams({ limit: String(limit) });
  if (prefix) q.set('prefix', prefix);
  if (token) q.set('token', token);
  return request(
    `/chat/storage/${storeId}/buckets/${encodeURIComponent(bucket)}/objects?${q}`
  );
};

export const statObject = (storeId, bucket, key) =>
  request(
    `/chat/storage/${storeId}/buckets/${encodeURIComponent(bucket)}/stat` +
      `?key=${encodeURIComponent(key)}`
  );

import express from "express";
import { ObjectId } from "mongodb";

// Chat history lives in the same database it queries -- no second connection,
// and a conversation sits beside the incidents it was about.
//
// Collections are created on first insert; there is no boot-time setup.
//
//   chat_projects      { _id, name, owner, createdAt }
//   chat_conversations { _id, title, projectId, provider, owner,
//                        createdAt, updatedAt, messages: [...] }
//
// Messages are embedded rather than a separate collection: a conversation is
// read and written as a unit and is never partially loaded. The 16MB document
// limit is thousands of turns.
//
// There is no simRunId anywhere here, deliberately. Chat history outlives the
// simulated data it discusses -- regenerating incidents must not erase what
// was asked about them.

const PROJECTS = "chat_projects";
const CONVERSATIONS = "chat_conversations";

// No auth in this demo, so everything belongs to one owner. Recording it now
// costs nothing and avoids a migration if that ever changes.
const OWNER = "local";

// Unfiled conversations carry the literal "default" rather than null. A field
// that is sometimes an ObjectId and sometimes absent is awkward to query and
// easy to get wrong at the edges; a sentinel is always present and always
// comparable.
const DEFAULT_PROJECT = "default";

const oid = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

// Accepts an ObjectId string, the sentinel, or nothing. Returns null only
// when the caller supplied something that is none of those.
function normaliseProjectId(value) {
  if (value === undefined || value === null || value === DEFAULT_PROJECT) {
    return DEFAULT_PROJECT;
  }
  return oid(value);
}

// The client works in strings; Mongo works in ObjectIds. Convert at the edge
// so neither has to know about the other's shape.
const outProject = (p) => ({ id: String(p._id), name: p.name, createdAt: p.createdAt });

const outConversation = (c, { withMessages = false } = {}) => ({
  id: String(c._id),
  title: c.title,
  projectId: c.projectId ? String(c.projectId) : DEFAULT_PROJECT,
  provider: c.provider ?? null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  // Null rather than absent when unpinned, so the client can sort on it
  // without special-casing conversations written before pinning existed.
  pinnedAt: c.pinnedAt ?? null,
  messageCount: c.messages?.length ?? 0,
  ...(withMessages ? { messages: c.messages ?? [] } : {}),
});

/** How much text to show either side of a match. */
const SNIPPET_PAD = 60;

/**
 * The first place the query appears, with a little context. Returns null when
 * only the title matched -- the title is already on screen, so repeating it as
 * a snippet says nothing.
 */
function snippet(conversation, rx) {
  for (const message of conversation.messages ?? []) {
    const text = typeof message?.text === "string" ? message.text : "";
    const at = text.search(rx);
    if (at === -1) continue;

    const from = Math.max(0, at - SNIPPET_PAD);
    const to = Math.min(text.length, at + SNIPPET_PAD);
    return {
      role: message.role ?? null,
      text: (from > 0 ? "…" : "") + text.slice(from, to).trim() + (to < text.length ? "…" : ""),
    };
  }
  return null;
}

export default function makeChatRouter({ getDb }) {
  const router = express.Router();
  const projects = () => getDb().collection(PROJECTS);
  const conversations = () => getDb().collection(CONVERSATIONS);

  const fail = (res, err, message, code = 500) => {
    // A database that is simply not connected is a 503 with its own message,
    // not a 500 blamed on the operation. The UI shows it as "history is
    // unavailable" rather than "could not list conversations", which is the
    // difference between a reader waiting for it to come back and a reader
    // thinking their chats are gone.
    if (err?.status === 503) {
      return res.status(503).json({ error: "chat history is unavailable" });
    }
    console.error(`[chat] ${message}:`, err?.message ?? err);
    res.status(code).json({ error: message });
  };

  // ---- projects ----------------------------------------------------------

  router.get("/chat/projects", async (_req, res) => {
    try {
      const rows = await projects().find({ owner: OWNER }).sort({ createdAt: 1 }).toArray();
      res.json({ projects: rows.map(outProject) });
    } catch (err) {
      fail(res, err, "could not list projects");
    }
  });

  router.post("/chat/projects", async (req, res) => {
    try {
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      const doc = { name, owner: OWNER, createdAt: new Date() };
      const { insertedId } = await projects().insertOne(doc);
      res.status(201).json({ project: outProject({ ...doc, _id: insertedId }) });
    } catch (err) {
      fail(res, err, "could not create the project");
    }
  });

  router.delete("/chat/projects/:id", async (req, res) => {
    try {
      const id = oid(req.params.id);
      if (!id) return res.status(400).json({ error: "invalid project id" });

      // Conversations outlive the project that held them -- deleting a folder
      // should not delete its contents. They fall back to default.
      await conversations().updateMany(
        { projectId: id, owner: OWNER },
        { $set: { projectId: DEFAULT_PROJECT } }
      );
      const { deletedCount } = await projects().deleteOne({ _id: id, owner: OWNER });
      if (!deletedCount) return res.status(404).json({ error: "project not found" });
      res.json({ ok: 1 });
    } catch (err) {
      fail(res, err, "could not delete the project");
    }
  });

  // ---- conversations ------------------------------------------------------

  router.get("/chat/conversations", async (_req, res) => {
    try {
      // Messages are excluded: the sidebar needs titles and timestamps, and
      // shipping every transcript to render a list would be absurd.
      const rows = await conversations()
        .find({ owner: OWNER }, { projection: { messages: 0 } })
        .sort({ updatedAt: -1 })
        .toArray();
      res.json({ conversations: rows.map((c) => outConversation(c)) });
    } catch (err) {
      fail(res, err, "could not list conversations");
    }
  });

  /**
   * GET /chat/conversations/search?q=...
   *
   * Searches titles and message text, and returns a snippet of the match so a
   * result says *why* it matched -- a list of titles is not much use when the
   * thing you remember is a sentence in the middle of a transcript.
   *
   * A case-insensitive regex, not a $text index. Text indexes stem and match
   * whole words, which is wrong for what people actually search here: cluster
   * and collection names, hyphenated identifiers, fragments like "corbs-".
   * Regex matches substrings, which is what the box appears to promise.
   *
   * The cost is a collection scan. Acceptable at the scale one person's chat
   * history reaches; if it stops being acceptable, the fix is a $text index
   * on title and messages.text plus a prefix index, not a bigger regex.
   */
  router.get("/chat/conversations/search", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ results: [] });

    try {
      // Escaped: a search box is user input, and an unescaped "(" is a
      // syntax error the driver would raise as a 500.
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      const rows = await conversations()
        .find(
          { owner: OWNER, $or: [{ title: rx }, { "messages.text": rx }] },
          { projection: { messages: { $slice: 200 } } }
        )
        .sort({ updatedAt: -1 })
        .limit(50)
        .toArray();

      res.json({ results: rows.map((c) => ({ ...outConversation(c), match: snippet(c, rx) })) });
    } catch (err) {
      fail(res, err, "could not search conversations");
    }
  });

  router.get("/chat/conversations/:id", async (req, res) => {
    try {
      const id = oid(req.params.id);
      if (!id) return res.status(400).json({ error: "invalid conversation id" });

      const doc = await conversations().findOne({ _id: id, owner: OWNER });
      if (!doc) return res.status(404).json({ error: "conversation not found" });
      res.json({ conversation: outConversation(doc, { withMessages: true }) });
    } catch (err) {
      fail(res, err, "could not read the conversation");
    }
  });

  router.post("/chat/conversations", async (req, res) => {
    try {
      const projectId = normaliseProjectId(req.body?.projectId);
      if (!projectId) return res.status(400).json({ error: "invalid project id" });

      const now = new Date();
      const doc = {
        title: String(req.body?.title ?? "New chat").slice(0, 200),
        projectId,
        provider: req.body?.provider ?? null,
        owner: OWNER,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      const { insertedId } = await conversations().insertOne(doc);
      res.status(201).json({ conversation: outConversation({ ...doc, _id: insertedId }) });
    } catch (err) {
      fail(res, err, "could not create the conversation");
    }
  });

  // Title, and moving between projects. projectId "default" unfiles it.
  router.patch("/chat/conversations/:id", async (req, res) => {
    try {
      const id = oid(req.params.id);
      if (!id) return res.status(400).json({ error: "invalid conversation id" });

      const set = {};
      // Pinning is not an edit. Bumping updatedAt would reorder the sidebar
      // and make pinning a chat look like using it.
      if (typeof req.body?.title === "string") {
        set.title = req.body.title.slice(0, 200);
        set.updatedAt = new Date();
      }
      if ("pinned" in (req.body ?? {})) {
        // A timestamp, not a flag: pinned chats sort by when they were
        // pinned, so the newest pin goes to the top of its own section.
        set.pinnedAt = req.body.pinned ? new Date() : null;
      }
      if ("projectId" in (req.body ?? {})) {
        const pid = normaliseProjectId(req.body.projectId);
        if (!pid) return res.status(400).json({ error: "invalid project id" });
        set.projectId = pid;
        set.updatedAt = new Date();
      }

      if (Object.keys(set).length === 0) {
        return res.status(400).json({ error: "nothing to update" });
      }

      const doc = await conversations().findOneAndUpdate(
        { _id: id, owner: OWNER },
        { $set: set },
        { returnDocument: "after", projection: { messages: 0 } }
      );
      const updated = doc?.value ?? doc;
      if (!updated) return res.status(404).json({ error: "conversation not found" });
      res.json({ conversation: outConversation(updated) });
    } catch (err) {
      fail(res, err, "could not update the conversation");
    }
  });

  /**
   * POST /chat/conversations/:id/turns
   *
   * One write per exchange, after the reply has finished -- never per token.
   * Streaming emits dozens of events a second and nobody reloads mid-sentence,
   * so persisting each one would be a great deal of traffic for no benefit.
   *
   * A stopped or failed reply is still worth keeping, so partial turns are
   * accepted and their state recorded.
   */
  router.post("/chat/conversations/:id/turns", async (req, res) => {
    try {
      const id = oid(req.params.id);
      if (!id) return res.status(400).json({ error: "invalid conversation id" });

      const turns = Array.isArray(req.body?.turns) ? req.body.turns : [];
      if (turns.length === 0) return res.status(400).json({ error: "turns are required" });

      const stamped = turns.map((t) => ({ ...t, at: new Date() }));
      const set = { updatedAt: new Date() };
      if (req.body?.title) set.title = String(req.body.title).slice(0, 200);
      if (req.body?.provider) set.provider = req.body.provider;

      const doc = await conversations().findOneAndUpdate(
        { _id: id, owner: OWNER },
        { $push: { messages: { $each: stamped } }, $set: set },
        { returnDocument: "after", projection: { messages: 0 } }
      );
      const updated = doc?.value ?? doc;
      if (!updated) return res.status(404).json({ error: "conversation not found" });
      res.json({ conversation: outConversation(updated) });
    } catch (err) {
      fail(res, err, "could not append the turns");
    }
  });

  router.delete("/chat/conversations/:id", async (req, res) => {
    try {
      const id = oid(req.params.id);
      if (!id) return res.status(400).json({ error: "invalid conversation id" });

      const { deletedCount } = await conversations().deleteOne({ _id: id, owner: OWNER });
      if (!deletedCount) return res.status(404).json({ error: "conversation not found" });
      res.json({ ok: 1 });
    } catch (err) {
      fail(res, err, "could not delete the conversation");
    }
  });

  return router;
}

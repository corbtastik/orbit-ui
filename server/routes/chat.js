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
  messageCount: c.messages?.length ?? 0,
  ...(withMessages ? { messages: c.messages ?? [] } : {}),
});

export default function makeChatRouter({ getDb }) {
  const router = express.Router();
  const projects = () => getDb().collection(PROJECTS);
  const conversations = () => getDb().collection(CONVERSATIONS);

  const fail = (res, err, message, code = 500) => {
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

      const set = { updatedAt: new Date() };
      if (typeof req.body?.title === "string") set.title = req.body.title.slice(0, 200);
      if ("projectId" in (req.body ?? {})) {
        const pid = normaliseProjectId(req.body.projectId);
        if (!pid) return res.status(400).json({ error: "invalid project id" });
        set.projectId = pid;
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

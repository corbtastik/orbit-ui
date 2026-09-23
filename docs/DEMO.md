# A ten-minute OrbitAI demo

Asking a 4.6-million-document Atlas database questions in plain English, and
watching it actually go and look.

Five questions, in order. Each builds on the one before, so resist the urge to
skip.

## Before you start

```bash
cd ~/dev/github/corbtastik/orbit && ./start-server.sh    # terminal 1
cd ~/dev/github/corbtastik/orbit-ui && ./start-all.sh    # terminal 2
```

Open <http://localhost:7001> and check two things before anyone is watching:

- The header says **Connected**. Amber "No databases" means the MCP server is
  up but has no registered connections — rebuild it (`npm run build` in the
  orbit repo) and restart.
- The sidebar lists **corbs-demo** with an `incidents` database under it.

Start a new chat so the transcript is empty.

## The one thing to say first

> "This isn't a chatbot that was trained on my data. It's Claude with tools
> that reach my actual Atlas cluster. Everything you're about to see, it looks
> up while you watch."

That framing is the demo. The rest is evidence.

---

## 1 — What's in here?

> **What collections are in the incidents database, and roughly how many
> documents does each hold?**

Fast, about fifteen seconds. Ten collections, ~4.6M incidents.

**Point at the tool calls** above the answer. Expand one. That panel is the
whole argument — it shows the actual call that was sent to MongoDB.

## 2 — The scale

> **How many incidents are in incident_events, and what are the ten most common
> issue types?**

Now it's aggregating over 4.6 million documents. Mention that nobody wrote this
query — the model chose the pipeline.

## 3 — The real one

> **Show me the five most recent incidents in Los Angeles.**

**This one takes about a minute. Don't fill the silence — narrate the tool
calls as they appear.** In a verified run it made ten calls in this order:

```
list-connections → connect → list-databases → list-collections
→ collection-schema → count → collection-indexes → find
```

Two of those are worth saying out loud:

- **`collection-schema`** — it didn't know what the documents looked like, so
  it went and found out before writing a filter.
- **`collection-indexes`** — it checked what was indexed before choosing how to
  query. There's a `city + ts` index, which is why this comes back quickly
  rather than scanning millions of rows.

**Point at the breadcrumb** in the top right. It now reads
`… / atlas / incidents / incident_events`. Nothing declared that — it's read
off the tool calls as they went past.

## 4 — The moment that lands

> **Now do the same for Atlanta.**

Six words. It keeps the cluster, the database, the collection, the filter shape
and the sort. This is the one people remember, so give it a beat.

## 5 — Something only the database knows

> **In fix_events, repairs are recorded as a repair_started event and then a
> fix event for the same incidentId. What's the median time between them, and
> does it differ by category?**

A genuine question with no canned answer — a self-join over 1.3M documents that
the model has to work out how to express.

If you have time, the follow-up is better still:

> **Which categories get repaired fastest, and which get left the longest?**

---

## While a long query runs

Open the sidebar tree and click into `incidents` → `incident_events`. The table
and document views are a normal database browser, sitting beside the chat.
It makes the point that the chat isn't a replacement for looking at your data —
it's a faster way in.

## If something goes wrong

| What you see | What it is |
|---|---|
| Header is amber, **No databases** | MCP server up, no connections registered. Usually a stale build in the orbit repo. |
| Header is red, **Disconnected** | MCP server isn't running. |
| An answer says it can't connect | Same as amber — check the header. |
| A query takes >90s | It's iterating. `ORBIT_MAX_ITERATIONS` caps it at 30 rounds. |

**Counts move between runs.** `fix_events` has a 30-day TTL, so repairs expire
while you watch — it dropped from 1,358,888 to 1,346,119 over two days of
writing these docs. If someone notices the number changed, that's the TTL
working, and it's a better answer than a static one.

## What to leave them with

> "Three of those questions I couldn't have written the query for myself
> without reading the schema first. It read the schema, checked the indexes,
> and wrote the query — and showed me every step, so I can check it."

---

Twenty more prompts, with notes on which are fast and why, are in
[EXAMPLES.md](EXAMPLES.md).

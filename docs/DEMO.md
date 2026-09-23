# Demo: are we actually fixing what breaks?

A simulator floods a MongoDB Atlas cluster with telecom incidents, and a repair
policy fixes some of them. Nobody has ever checked whether the repairs keep up.

That is the demo. Seven questions, each in plain English, ending in a finding
nobody in the room knew when you started. You never write a query.

**Budget ten to twelve minutes.** The early questions take seconds; the last
two take a minute each because they aggregate over millions of documents.

> Every number below was measured against this cluster while writing this.
> They will have drifted — the simulator keeps running and `fix_events` has a
> 30-day TTL. Drift is fine; the shape of the answer is what matters.

## Before anyone is watching

```bash
cd ~/dev/github/corbtastik/orbit && ./start-server.sh    # terminal 1
cd ~/dev/github/corbtastik/orbit-ui && ./start-all.sh    # terminal 2
```

Open <http://localhost:7001>. The header must say **Connected** — amber "No
databases" means the MCP server is up but has no registered connections, which
is usually a stale build in the orbit repo. Start a new chat.

## Act 1 — Where am I?

### 1. Summarize my Atlas project

> **Summarize my Atlas project — what clusters are in it, what tier, what
> region, and is backup on?**

This does not touch your data at all. It is the Atlas Admin API, and it comes
back in a few seconds with `corbs-demo`: an M30 replica set on GCP Central US,
MongoDB 9.0.2, backup enabled.

**Say:** *"I haven't told it anything about my environment. It went and asked
Atlas."*

### 2. What is in the database?

> **What databases are on that cluster, and what collections does the
> incidents database have? Roughly how big is each one?**

Ten collections. `incident_events` holds about 4.6 million documents;
`fix_events` about 1.3 million; `sim_runs` and `incident_media` are tiny.

**Say:** *"Now it's on the data plane — same conversation, different
credentials underneath."*

## Act 2 — What am I looking at?

### 3. What does an incident look like?

> **Show me the schema of incident_events. What does one incident document
> actually contain?**

This is the question that makes everything after it possible. It reports the
fields it finds: `city`, `ts`, a GeoJSON `loc`, `weight`, `simRunId`, and a
nested `serviceIssue` carrying `category`, `issue` and per-type details.

**This is the pivot.** Everyone in the room now shares a vocabulary with the
model, and nobody had to read a data dictionary to get it.

**Point at the tool calls** above the answer and expand one. That panel shows
the exact call sent to MongoDB — it is the difference between an answer and a
claim.

## Act 3 — Simple questions

### 4. How much, and of what?

> **Break the incidents down by serviceIssue.category. Which category
> generates the most?**

Infrastructure leads at ~1.39M, then consumer ~1.16M, then business,
emerging_tech and federal clustered near 695K each.

**Say:** *"That's a group-and-count over 4.6 million documents. I didn't write
it, and I didn't have to know that category is nested inside serviceIssue —
it read that two questions ago."*

### 5. Where?

> **Which cities have the most incidents? Top ten.**

Los Angeles, Chicago and New York lead at roughly 4,400 each, then a tier
around 3,000.

Cheap follow-up, and worth doing because it shows the conversation holding
its place:

> **Just Los Angeles — what are the most common issues there?**

## Act 4 — The finding

### 6. One issue does not look like the others

> **What are the ten most common issue types across all incidents?**

Here is the first thing worth noticing: `packet-loss` comes in around 280,000
while everything else sits near 163,000. One issue is nearly twice as common
as any other.

**Say:** *"Nobody designed that question to have an interesting answer. It just
does."*

### 7. Are the repairs keeping up?

Set it up in words first, then ask:

> **fix_events records repairs as a repair_started event and then a fix event
> for the same incidentId, and repair_started carries an expectedFixAt. For
> the most recent simulation run, how many incidents were raised, how many were
> actually repaired, and what was the median time from repair_started to fix
> broken down by category? Also tell me what fraction of repairs beat their
> expectedFixAt.**

**This is the long one — give it a minute.** It is a self-join by `incidentId`,
a median per group, and a ratio, over a collection of 1.3 million events.

Measured on run `20260918-1932Z-s45`:

| | |
|---|---|
| Incidents raised | 21,745 |
| Actually repaired | 13,718 (~63%) |
| Median time to fix | 59–61 seconds, **in every category** |
| Beat the expected fix time | **~21%** |

Two findings, and the second is the one that matters:

- **The repair policy is category-blind.** Federal public-safety incidents are
  repaired at the same speed as consumer broadband — 59 to 61 seconds, across
  the board. If those are supposed to have different priorities, they do not.
- **It misses its own estimate four times out of five.** The promised window
  clusters between 38 and 52 seconds; the actual median is about 60.

**Say:** *"That is a real operational finding, and it took one question. The
follow-up — 'is that true for every run, or just this one?' — is one more."*

## Closing line

> "I asked seven questions in English. It read the schema, chose the
> aggregations, ran them against 4.6 million documents, and showed me every
> call it made so I can check its work. The last answer is something none of us
> knew ten minutes ago."

---

## While the long ones run

Open the sidebar tree, click into `incidents` → `incident_events`, and page
through the documents. A normal database browser sitting beside the chat — the
point being that this does not replace looking at your data, it gets you to the
right question faster.

## If something goes wrong

| What you see | What it is |
|---|---|
| Header amber, **No databases** | MCP server up, no registered connections. Usually a stale build in the orbit repo — `npm run build`, then restart. |
| Header red, **Disconnected** | MCP server is not running. |
| "The most recent run has no repairs" | The TTL expired them. Ask for the most recent run that *has* fix events. |
| A query runs past 90 seconds | It is iterating; `ORBIT_MAX_ITERATIONS` caps it at 30 rounds. |

## Questions people ask

**"Did it already know the answer?"** No — expand any tool call. The panel shows
the query and the raw result it came back with.

**"Could it delete my data?"** The MCP server exposes 87 tools and 11 of them
write. Nothing in this demo calls one, but the boundary is the MCP server's to
enforce, not this UI's.

**"Why did that take a minute?"** It ran ten or more round trips — list the
collections, read the schema, check the indexes, then aggregate. You are
watching it work, not watching it think.

---

Twenty more prompts, with notes on which are fast and why, are in
[EXAMPLES.md](EXAMPLES.md).

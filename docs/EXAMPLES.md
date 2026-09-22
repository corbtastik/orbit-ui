# Demo prompts — the `incidents` database

Twenty prompts to paste into the chat, roughly in the order you would want to
run them in front of an audience: what is here, then what it says, then what it
means, then the questions no single collection can answer.

They are written against the data as it actually is, not against a tidied-up
version of it. Where a prompt is slow, or where the answer is likely to
surprise you, it says so.

## The data, briefly

One cluster, `corbs-demo`, database `incidents`. A traffic simulator writes
telecom service incidents across the US; a repair policy fixes some of them.

| Collection | Docs | What it holds |
| --- | --- | --- |
| `incident_events` | ~4.6M | Every incident. Geo point, city, `serviceIssue`, `simRunId` |
| `infrastructure_events` | ~1.8M | The infrastructure slice, by `incidentId` |
| `consumer_events` | ~1.5M | Broadband, wireless, wifi |
| `fix_events` | ~1.36M | `repair_started` and `fix`, paired by `incidentId` |
| `business_events` | ~904K | VoIP, enterprise, B2B |
| `emerging_tech_events` | ~904K | Smart city, IoT, edge |
| `federal_events` | ~903K | FirstNet, NG911, public safety |
| `incident_media` | 87 | Generated images with captions and embeddings |
| `sim_runs` | 141 | One doc per simulator run: seed, EPS target, notes |

An incident document looks like this:

```json
{
  "type": "incident",
  "ts": "2025-10-21T22:53:06.305Z",
  "city": "Alapaha",
  "loc": { "type": "Point", "coordinates": [-83.157, 31.382] },
  "lat": 31.382, "lng": -83.157,
  "weight": 1, "sigmaKm": 5,
  "serviceIssue": {
    "type": "smart-city", "category": "emerging_tech",
    "sensorId": "CAM-ALA-975", "issue": "connectivity-loss",
    "location": "Castle Road"
  },
  "simRunId": "20251021-2314Z-s123"
}
```

**What is indexed.** This decides which prompts return in a second and which
scan millions of documents:

- `incident_events` — `city + ts`, `simRunId + ts`, `ts`, and a **2dsphere** on
  `loc.coordinates`
- `fix_events` — `simRunId + ts`, a unique `simRunId + incidentId + type`, and a
  **30-day TTL on `ts`**
- `incident_media` — `incidentId`, `simRunId + ts`, `mediaType + category`
- The five category collections — `_id` and a unique `incidentId + type`, and
  nothing else

So filter `incident_events` by **city, time, or location** and it is fast.
Filter any category collection by `serviceIssue.issue` and it is a collection
scan over a million documents.

---

## 1 — Getting oriented

**1.** What databases are on this cluster, and how big is each one?

**2.** What collections are in the `incidents` database, and roughly how many
documents does each hold?

**3.** Show me the schema of `incident_events`. What fields does an incident
have, and what are the nested ones?

**4.** What indexes exist on `incident_events` and `fix_events`? Is there
anything unusual about them?

> Worth doing live — it finds the TTL index on `fix_events` and can explain
> that repairs older than 30 days delete themselves, which is why fix counts
> never match incident counts on old runs.

## 2 — Straightforward questions

**5.** How many incidents are in `incident_events`?

**6.** Show me the five most recent incidents in Los Angeles.

> Uses the `city + ts` index. The natural follow-up — "now do the same for
> Atlanta" — shows the conversation keeping its place.

**7.** What are the ten most common `serviceIssue.issue` values across
`incident_events`, and how many of each?

**8.** Which cities have the most incidents? Give me the top fifteen.

## 3 — Grouping and shape

**9.** Break incidents down by `serviceIssue.category`. Which category
generates the most, and what share of the total is it?

**10.** For the `federal` category, what are the most common issues, and which
agencies show up most often?

**11.** Plot incidents per hour for the most recent simulation run. Is the rate
steady, or does it spike?

**12.** What is the distribution of `weight` on incidents? Are high-weight
incidents concentrated in particular cities or categories?

## 4 — Geospatial

**13.** Find incidents within 50 km of downtown Atlanta and tell me which
issues dominate there.

> The 2dsphere index makes this quick. A good visual moment if you have the
> cluster view open beside the chat.

**14.** Compare incident density near Los Angeles against near Minneapolis,
within 100 km of each. Which is worse, and for which category?

**15.** Use a bounding box over the Pacific Northwest — roughly -125 to -116
longitude, 42 to 49 latitude — and break the incidents inside it down by
category.

> A different geo operator from prompt 13, and it shows the model picking
> `$geoWithin` over `$geoNear` on its own. Returns about 188,000 incidents,
> infrastructure first.

## 5 — Across collections

**16.** For simulation run `20251021-2314Z-s123`, how many incidents were
raised and how many were actually fixed?

> Look up the run in `sim_runs` first if you want a different one — that
> collection has only 141 documents and every incident carries its `simRunId`.

**17.** In `fix_events`, repairs are recorded as a `repair_started` event and
then a `fix` event for the same `incidentId`. What is the median time between
them, and does it differ by category?

**18.** Which incident categories get repaired fastest, and which get left
alone the longest? Compare `expectedFixAt` against when the `fix` event
actually landed.

> The interesting one. `repair_started` carries an `expectedFixAt`; whether
> reality matched it is a genuine question about the data, not a canned answer.

**19.** Take one incident in `federal_events` and show me everything the
database knows about it — the incident itself, any repair events, and any
media attached to it.

## 6 — The media collection

**20.** `incident_media` has 87 generated images, each with a written caption.
Break them down by category and type, then read me the federal captions and
summarise what kinds of public-safety failures the simulator invented.

> Only 87 documents, so anything over captions is cheap. Sixteen are federal.
> The `embedding` field is there for vector search, but nothing in this chat
> path can generate a query vector — ask for text matching, not "find similar
> images".

---

## Running the demo

**Start with 1–4.** They are fast, they show the tool calls happening, and they
build the context the later prompts lean on.

**Watch the tool calls, not just the answer.** Each one expands to show what
was actually sent to MongoDB. That is the part people do not believe until they
see it.

**Follow-ups are the point.** Ask 6, then "now Atlanta", then "which of those
were fixed?" — the model keeps the connection, database, and collection without
being told again.

**If something runs long,** it is almost certainly a filter on a category
collection, which has no index beyond `_id` and `incidentId`. Ask the same
question against `incident_events` filtered by `serviceIssue.category` instead.

**A caveat for prompts 16–18.** The TTL on `fix_events` deletes repair events
after 30 days, so an older run will show incidents with no repairs. That is the
TTL working, not missing data — and it is a decent thing to demo deliberately.

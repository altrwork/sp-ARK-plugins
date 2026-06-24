---
name: match-interns
description: Pull intern applications and member intern requests from BossHub, then use Claude to match interns to sp-ARK member companies based on skills, industry interests, availability, and what each member needs. Use when you want to see who to pair together.
argument-hint: "[min_match_score=good]"
---

## Overview

This skill reads both intern-side and member-side BossHub form submissions and produces a ranked match list — which intern fits which company, and why. Claude does the matching based on skills alignment, industry overlap, availability, and commitment fit.

## Trigger

Invoked via `/match-interns`. Also responds to natural language like "match interns to members", "who should we pair with which company", "find intern matches", or "which members have intern requests".

## Inputs

No required inputs. Optional:

| Input | Default | Notes |
|---|---|---|
| `min_match_score` | `good` | Filter threshold: `any`, `good`, or `strong`. Use `any` to see all possible pairs. |

## Connector

Uses `~~bosshub` (sp-ARK Operations MCP server) for all form data. No email or spreadsheet connector needed.

## Step-by-Step Process

### Step 1 — Pull intern applications

Use `~~bosshub` → `bosshub_list_submissions` with `form_id: "L1HP9RpcGXWoDgvqbft7"` and `limit: 100`.

For each submission extract:
- `name`, `email`
- `others.aSMghEt9tgSfHR9HQqvq` → education level
- `others.s4ZhDPQTqBivKyJCaRJm` → skills / functional areas (array)
- `others["2kHsjxdPCQkuhKoOl3tt"]` → industry interests (array)
- `others.MPY8DQdOwuom8YhPWqzv` → bio / about me
- `others.E9j0w34qjBB5SuXtQcEn` → availability description
- `others.XOUtBZgpKVKjxWvLQU0i` → desired start date
- `others.iiM0HWCj7CBPoItAi7eN` → commitment / duration

If zero applications are returned, tell the user and stop: *"No intern applications found yet. Check back once applications come in."*

### Step 2 — Pull member intern requests

Use `~~bosshub` → `bosshub_list_submissions` with `form_id: "a6hvDmip1mkYcrmFkhjw"` and `limit: 100`.

Extract whatever fields are returned. Typically expect:
- Member / company name
- Industry or sector
- What they need help with (functional area, project description)
- Preferred commitment / hours
- Preferred start date

If zero member requests are returned, tell the user: *"No member intern requests submitted yet. Members need to fill out the intern request form before matches can be made."* Then list the intern applicants on hand so the team knows who's available.

### Step 3 — Match

For each member request, evaluate every intern applicant against these criteria:

| Signal | Weight |
|---|---|
| Skills / functional area overlap | High |
| Industry interest alignment | High |
| Availability vs. commitment needed | Medium |
| Start date compatibility | Medium |
| Education level fit | Low |
| Bio / stated interests alignment | Low |

Assign each intern-member pair one of:
- **Strong match** — multiple high-weight signals align
- **Good match** — at least one high-weight and one medium-weight signal align
- **Possible** — some overlap but notable gaps
- **Not a fit** — no meaningful alignment

### Step 4 — Present results

Output a match report in this format:

---
**Intern Match Report**
*[N] intern applications · [N] member requests*

---

**[Member Company Name]** *(needs: [functional area])*

| Rank | Intern | Skills Match | Industry Match | Availability | Score |
|---|---|---|---|---|---|
| 1 | Luci Scaff | Marketing, Research ✓ | Energy ✓ | Tue/Thu/Fri | **Strong** |
| 2 | ... | ... | ... | ... | Good |

> **Recommendation:** Luci Scaff for [Company] — her interest in [X] aligns with their need for [Y]. Available starting [date], flexible commitment.

---

Repeat for each member with requests. If a member has no good matches, say so explicitly rather than forcing a weak pairing.

After the report, ask: *"Want me to draft introduction emails for any of these matches?"*

### Step 5 — Optional: Draft introductions

If the user confirms they want to proceed with specific matches, draft a short intro email for each:
- **To:** the member contact
- **Subject:** "Intern Match — [Intern Name] for [Company]"
- **Body:** 3–4 sentences introducing the intern, highlighting the specific alignment, and suggesting next steps

Save as drafts using `~~email` if available. Otherwise output the draft text for the user to send manually.

## Edge Cases

| Situation | Response |
|---|---|
| No member requests, interns waiting | List available interns with a summary of their skills so the team can proactively recruit member requests |
| No intern applications yet | Stop after Step 1 with a clear message |
| Intern has already been matched | Note it in the report so the same intern isn't double-booked |
| Member request is vague (no skills/industry specified) | Use the company name to infer industry if possible; flag as lower-confidence match |
| Strong match but availability conflict | Still surface it as a match; note the conflict explicitly so the team can discuss |

# Lindström Customer Value Review

A prep and meeting tool for Key Account Managers (KAMs). It rolls site-level service data up to one customer view, turns it into value the customer cares about, and produces an editable PowerPoint for the annual steering committee.

Built for the Since AI Hackathon 2026 on Lindström's synthetic data pack.

## Run it

No install, no server, no build step.

1. Unzip the folder.
2. Double-click `index.html` (Chrome, Edge or Firefox).

Everything runs in the browser on the bundled data. Notes, value lines and the action plan are saved in the browser per customer (local storage). "Reset this account" clears them.

To host it: upload the folder to any static host (GitHub Pages, Netlify, an internal web server). There is no back end.

## Built around the five steering-committee questions

The overview opens with a "Steering committee agenda": each question with a one-line answer from the data. The tabs follow the same order, and so does the PowerPoint.

| Question | Page | What it shows |
|---|---|---|
| 1. What outcomes has the customer achieved, and how are they measured? | Outcomes | Value vs baseline, KAM-entered value, service reliability; every figure has a status label |
| 2. What are the most important business and sustainability priorities for the next 6 to 12 months? | Priorities | Stated priorities, what the account team knows, focus for this meeting, what is coming (renewal, reporting, regulation) |
| 3. Which delivery issues, risks or unresolved commitments need steering-level intervention? | Risks & issues | Issues above escalation thresholds, commitments from the last meeting with status, items to monitor |
| 4. Which improvements or expansion opportunities offer the strongest customer value? | Opportunities | Each opportunity rated for cost, sustainability and operations (High/Medium/Low) with a combined score |
| 5. What decisions are needed today, who owns each action, and by when? | Decisions | Decision, owner and due date for each item; becomes the closing slide |

Commitments from the last meeting are synthetic demo data standing in for CRM meeting minutes. Escalation thresholds and impact ratings are rules documented on the Method page.

## Design after judge feedback

* **Simple first page.** "Who are you meeting?" (CFO, Procurement, Quality & HSE, Operations, Sustainability) sets four big numbers and three talking points for that person. A CFO sees total value, CO₂, continuity and garments kept in use; procurement sees avoided purchases, spare garments, garments per wearer and service requests.
* **Relationship up front.** Next meeting, renewal, last meeting, key contacts and what the KAM knows, plus a **30-second brief** button for a KAM on the move. Works on a phone.
* **Detail in layers.** Every big number opens its detail page (Value, Sites, Service, Talking points, Action plan, Method). The assistant opens as a side panel.
* **Export follows the counterpart.** The PowerPoint gets an "at a glance" slide with the same four numbers and topics.

## What it does

Organised around Lindström's own review model: **Look back → Show value → Build trust → Look forward → Agree actions**.

| Feedback from Lindström | Where it is in the tool |
|---|---|
| Consolidate site data to a customer view | Step 1: customer KPIs, wearers by country, sortable site table with drill-down |
| KAM adds what they know, including CRM | Review assistant (Prepare mode) and "Import CRM notes"; stored as account knowledge |
| KAM-entered value (e.g. €25,000 of reduced hygiene risk) | Step 2: "Value the account team knows about", or tell the assistant |
| Transparent numbers, KAM can disagree | Every figure has a status label and a "How was this calculated?" note; the repair assumption, thresholds and baseline are editable |
| Existing KPIs: on-time delivery, service utilization 30 to 60% | Step 3: reliability tiles and utilization band chart per site |
| Chat answering the customer's questions in the meeting | Review assistant, "In the meeting" mode |
| Rebalance, grow, replace low-repairability products | Step 4 signals: Fix / Grow / Prepare, ranked for who is in the room |
| Good PR for the customer | Shareable impact story (Step 4, export slide 7) |
| Annual report, not day-to-day | Reporting-year snapshot; no live feeds |
| PowerPoint first, PDF too | "Export PowerPoint" (editable .pptx) and "Print / PDF" |

### Two views

* **KAM view**: internal. Shows why each signal is ranked, and the commercial opportunity behind it.
* **Customer view**: the same findings worded as advice, without opportunities. Switching the assistant to "In the meeting" switches to this view. Print and PowerPoint always use customer wording.

### The assistant works both ways

* **KAM to assistant** (Prepare): "The CFO is joining", "Hygiene audit at the Polish sites", "Add €25,000 of reduced recall risk", "They already repair small things, be conservative", or paste CRM notes. It stores each note, then sets who to lead with, focus themes, focus sites, assumptions and value lines. Chips under the header show what it understood; click × to undo.
* **Assistant to KAM or customer**: "How did we do this year?", "How is Poznań doing?", "Which sites need attention?", "How does this compare with an in-house laundry?", "What should we focus on together next year?", "How did you calculate the avoided purchases?", "Can we use these numbers in tenders?", "Prepare five discussion points".

It runs **offline with rules**. It never invents a number: every figure it quotes comes from `js/calc.js`.

## AI assistant (Google Gemini)

With a Gemini API key the assistant becomes a full AI analyst over the **whole data pack**: all 14 data sheets, every column, about 23,000 rows (`js/data_full.js`, built by `scripts/build_full_data.py`).

* **Answers any question about the data**, for example: "Which 5 sites had the highest share of late deliveries?", "Which products get repaired most?", "How much CO2 did we save compared with a local laundry?", "Compare Finland and Poland on washing rate". It also answers in other languages and handles free wording.
* **Draws charts in the chat** (bar, ranking, line, donut, table, big number). Each chart has a "+ Dashboard" button.
* **Builds dashboards on request** ("Make a sustainability dashboard for the CFO"). They are saved on the new **Dashboards** page and always recalculate from the data.
* **Takes in what the KAM knows**: statements such as "Add €25,000 of reduced hygiene risk" still update value lines, focus and assumptions.
* **Stays traceable**: Gemini never sees the raw files. It gets the review summary and the table structure, and asks for data through five tools that run in the browser (`query_data`, `show_chart`, `create_dashboard`, `update_account`, `open_page`). Every number it states comes from a query result or the app's own calculations, labelled MEASURED, CALCULATED, ALLOCATED or ESTIMATE. In meeting mode it only sees the open customer's data.
* **Falls back to the offline rules** if there is no key, no internet or the limit is reached, and says so in the answer.

Settings: click the **AI** chip in the assistant panel to paste a key, choose a model, test or switch AI off. The default key and model live in `js/gemini.config.js`.

Limits: on Google's free tier, Gemini 3.5 Flash allows about 20 requests a day and 5 a minute, and one question uses 1 to 4 requests. The app waits automatically for the per-minute limit and switches to Gemini 3.5 Flash Lite (then 3.1 Flash Lite) when a model's daily limit is used up. For a live demo, turn on billing for the key's Google Cloud project to remove these limits; usage costs cents.

Security: a key in `js/gemini.config.js` can be read by anyone who opens the app. Use a key created for the hackathon, set a spending cap, and delete it afterwards. In production the key belongs on a server (see "Make it live").

## What the assistant can answer without AI (offline rules)

Tested with 50+ real questions. It answers from the bundled data, not live systems.

**Answers from the data**
* Value: "How did we do this year?", "How much money did we save?", "What value did Lindström give us?"
* Method: "How did you calculate the avoided purchases / CO₂ / water / utilization / wearers?"
* Comparisons: "Compared with our own laundry / home washing / a local laundry?", "Why not buy our own workwear?"
* Sites: "How is Poznań doing?", "Why is hygiene high in Lappeenranta?", "Which sites need attention?", "Top 3 sites by repairs / wearers / late deliveries"
* Countries: "How does Finland compare to Poland?"
* Topics: water, CO₂ footprint, energy, repairs, which products break most, garments per person, on-time delivery, utilization, busiest month
* Forward: "What should we focus on together next year?", "Can we use these numbers in tenders?"
* KAM prep: "Brief me before I walk in", "Prepare five discussion points", "What do you know about this account?", "When was the data last updated?"

**Takes in what the KAM knows** (prep mode): attendees and roles, worries, sites or countries to focus on, values to add ("add €40,000 of reduced recall risk"), assumption changes ("use 60% for repairs", "flag hygiene after 60 days"), CRM notes.

**Says plainly that the data is missing**: prices, spend and quotes; satisfaction scores; lost garments; previous years; compliance questions (it offers the footprint data instead).

**Offline rules cannot**: do what-if scenarios, write free-form text, answer in other languages or handle wording very different from the patterns above. The Gemini connection covers these.

## Demo script (3 minutes)

1. Open NorthStar Foods Group. Overview shows four big numbers for a CFO meeting.
2. Click **Procurement**: the numbers and talking points change to costs and value for money.
3. Click **30-second brief**: the assistant gives the walk-in summary.
4. In the assistant, type `Add €25,000 of reduced hygiene risk at the sites with wash gaps`, then `They already repair small things themselves, be conservative`. The first big number updates.
5. Click the first big number to open the Value page and "How was this calculated?".
6. Switch to **Customer view**, then the assistant to **In the meeting**, and ask "What should we focus on together next year?".
7. **Export PowerPoint**.

## Make it live

* **Real data**: produce the same tables as the data pack and run `python3 scripts/build_data.py <file.xlsx>` to regenerate `js/data.js`. In production, replace `js/data.js` with an API call that returns the same structure.
* **CRM**: replace `js/crm_demo.js` with notes fetched from Microsoft Dynamics for the selected account.
* **Language model**: `js/gemini.js` already connects Gemini from the browser. In production, move the Gemini call behind a small server endpoint so the key is not public, or replace `window.LVR_LLM` with your own model. The app calls it first and falls back to the offline rules if it fails or returns nothing.

```html
<script>
window.LVR_LLM = async function ({ message, mode, result, ranked, account }) {
  // Send the message plus the computed figures to your model (e.g. Gemini via a small proxy).
  // Keep the API key on the server, never in this file.
  const res = await fetch('/api/review-assistant', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, mode, kpis: result.kpis, value: result.value, signals: ranked.slice(0, 6), knowledge: account.knowledge })
  });
  if (!res.ok) return null;          // falls back to offline rules
  return (await res.json()).reply;   // a string, or { reply, changes }
};
</script>
```

  Instruct the model to quote only figures from the payload, so numbers stay traceable.

## Files

```
index.html              app shell
css/styles.css          Lindström colours (navy, cyan, green, orange, magenta) and Libre Franklin
js/data.js              synthetic data pack, generated (figures used by the review)
js/data_full.js         every data sheet and column, generated (queried by the AI)
js/query.js             safe query engine the AI uses (filter, group, sum, share, ratios)
js/charts.js            SVG charts for AI answers and dashboards
js/gemini.js            Gemini connection, tools, prompts, rate-limit handling
js/gemini.config.js     API key and model
js/calc.js              all calculations and signal rules
js/assistant.js         two-way assistant (offline rules, LLM hook)
js/views.js             what to show first for each meeting counterpart
js/crm_demo.js          synthetic CRM extracts for the demo
js/export.js            PowerPoint export (PptxGenJS)
js/app.js               state, rendering, interaction
vendor/pptxgen.bundle.js  PptxGenJS 4.0.1 (MIT licence)
scripts/build_data.py   xlsx → js/data.js
scripts/build_full_data.py  xlsx → js/data_full.js
data/                   the source data pack
METHODOLOGY.md          formulas, assumptions, status labels
DATA_READINESS.md       what production needs
```

Fonts load from Google Fonts when online; offline the app falls back to Arial.

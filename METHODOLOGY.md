# Methodology

All calculations live in `js/calc.js`. Every figure carries one of these labels:

| Label | Meaning |
|---|---|
| MEASURED | Counted directly in service or scan data |
| CALCULATED | Reproducible formula on measured data |
| ALLOCATED | Laundry-level figure shared out by the customer's share of washed kg |
| ESTIMATE | Depends on an assumption the KAM can change |
| KAM-ENTERED | Value entered by the account manager from their own knowledge, shown separately |
| RULE-BASED / CONTEXT | Signal from a rule, or a curated public source; not a calculation |

## Look back

* **Active wearers**: December, per site, the largest product row. The pack's sample output sums product rows (28,367 for NorthStar), which counts a person wearing a jacket and trousers twice. We report 9,607.
* **Garments in circulation**: allocated pieces in December. Scan share = active assets scanned ÷ allocated.
* **Washed kg, repairs, service requests**: sums over the year.
* **On-time delivery, turnaround**: share of wash cycles flagged ON_TIME; mean cycle hours.
* **Service utilization (weekly)**: monthly washing % (washed pieces ÷ allocated pieces × 100, per the data dictionary) ÷ 4.33 weeks. Healthy band 30 to 60% (Lindström KPI). *Definition to confirm.*

## Show value

* **Avoided replacement purchases** = Σ repairs per product × synthetic purchase price × replacement share. The pack's rule (A002) is 1 repair = 1 postponed replacement (100%). We default to 75% and show 50% to 100%, because not every repair would have led to a new purchase. Editable. Rental fees are not included, so this is not net savings.
* **CO₂e avoided** = washed kg × (baseline process + delivery factor) − allocated Lindström process and delivery emissions.
* **Water saved** = washed kg × baseline litres per kg − allocated Lindström water.
* **Production emissions avoided** = Σ estimated avoided product kgCO₂e (Repairs sheet) × replacement share.
* **Textile waste handled** = allocated textile waste, split by each laundry's treatment routes (recycling, reuse, energy recovery, incineration).
* **Baselines**: outsourced local laundry (default), home washing, in-house laundry, from the Baselines sheet. None repairs systematically.
* **KAM-entered value**: added by the KAM in the form or through the assistant. Never mixed into data-based figures; totals show both parts.

## Look forward: signals

| Signal | Rule (defaults editable in Step 3) |
|---|---|
| Hygiene gaps | Per RFID-tracked garment, the longest gap between two pickups; flagged above 90 days |
| Spare stock | Pieces per wearer per product above 1.3 (12-month average); spare = allocated − scanned |
| Under-supply | Pieces per wearer per product below 1.0; pieces needed to reach 1.0 |
| Product fit | Distribution centres without hi-vis, plants without coveralls, hospitals without tunics |
| Repairability | Product with the highest repair quotient: candidate for a more durable model at renewal |
| Utilization | Sites outside the 30 to 60% band (only shown if any) |
| Reporting pack | Allocated footprint ready for the customer's supplier-data requests |
| Regulatory radar | Curated: EU textile EPR schemes by 17 April 2028, Directive (EU) 2025/1892. Context, not legal advice |

**Ranking**: severity + 6 per theme the KAM put in focus + 3 per customer-stated priority + 1.5 per industry default (Industry_Priorities sheet). The KAM view shows why each signal ranks where it does.

## Assistant

Rule-based intent matching (`js/assistant.js`). Statements become account knowledge and settings; questions are answered only from `calc.js` results. An optional `window.LVR_LLM` hook allows a language model to phrase answers; the payload contains the computed figures so numbers stay traceable.

## Limits

All data is Lindström's synthetic hackathon pack. Prices, product footprints and baseline factors are illustrative. Allocated impacts assume emissions and water scale with washed kg. Thresholds are demo rules to be agreed with Lindström.

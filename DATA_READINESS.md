# Data readiness: what production needs

The prototype proves the concept on synthetic data. To run it on real accounts:

| Need | Why | Likely source |
|---|---|---|
| Customer hierarchy (parent → country → site) | Roll-up beyond single sites; country-level views | Master data / CRM |
| Account notes, renewal date, contacts by role | Feed the assistant with what the KAM already knows | Microsoft Dynamics |
| Contract prices per product and service | Net value instead of avoided purchase cost only | Pricing / ERP |
| Customer satisfaction scores | Existing KPI Lindström mentioned; not in the pack | Survey tool |
| Agreed definition of service utilization | The 30 to 60% band needs the exact formula | Operations |
| Approved product footprints | Replace synthetic kgCO₂e per product | Sustainability team |
| Market-specific baseline factors | Local laundry, in-house and home washing differ by country | Sustainability team |
| Garment retirement and repairability data | Show which products cannot be repaired | Laundry systems |
| Previous year's data | Year-on-year comparison in the annual review | Data warehouse |
| Other service lines (mats, washroom) | Whole-account value and cross-sell | Service systems |

Known issue in the synthetic pack: the sample output sums active wearers across product rows (28,367 for NorthStar). The tool deduplicates to 9,607.

Not in scope: legal or compliance advice. Regulatory notes are curated context with sources.

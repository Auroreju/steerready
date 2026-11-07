/*
 * SYNTHETIC CRM extracts for the demo. In production these would come from
 * Microsoft Dynamics (account notes, renewal date, contacts by role).
 * Nothing here describes a real company or person.
 */
window.LVR_CRM_DEMO = {
  CUST001: [
    'Account: NorthStar Foods Group. Segment: strategic, high value. Contract renewal planned for Q2 next year.',
    'Last steering committee: procurement asked why rental costs more than buying jackets outright.',
    'Quality manager mentioned an external food-safety audit at the Polish sites next spring.',
    'Their two largest retail customers now send supplier sustainability questionnaires, including CO2 per supplier.',
    'Site managers in Poland complained about trouser shortages after the summer peak.',
    'The CFO will attend the annual review for the first time.'
  ],
  CUST002: [
    'Account: Apex Industrial Systems. Contract renewal at end of next year.',
    'HSE lead is reviewing protective clothing standards across all plants.',
    'Procurement is under a cost-reduction target of 5% for indirect spend.',
    'Plant managers value fast turnaround; one late delivery last spring escalated to the plant director.'
  ],
  CUST003: [
    'Account: Mediora Health Network. Public hospital group; purchases through public tenders.',
    'Infection-control team wants evidence of garment wash frequency per ward.',
    'Next tender round scores suppliers on environmental impact and circularity.',
    'Hospital directors asked for one summary slide they can reuse in their own annual report.'
  ]
};

/* SYNTHETIC account header fields, as they would come from the CRM. */
window.LVR_CRM_ACCOUNT = {
  CUST001: { since: '2017', renewal: 'Q2 2026', nextMeeting: 'Annual steering committee, December', lastMeeting: 'Steering committee 2024: procurement questioned rental vs buying', contacts: ['CFO', 'Procurement manager', 'Quality manager', 'Site managers (Poland)'] },
  CUST002: { since: '2020', renewal: 'End of 2026', nextMeeting: 'Annual review, January', lastMeeting: 'QBR: one late delivery escalated to the plant director', contacts: ['Procurement lead', 'HSE lead', 'Plant managers'] },
  CUST003: { since: '2021', renewal: 'Next public tender round', nextMeeting: 'Annual review, February', lastMeeting: 'Infection-control team asked for wash-frequency evidence', contacts: ['Hospital directors', 'Infection-control lead', 'Procurement'] }
};

/* SYNTHETIC commitments from the last steering committee (would come from the CRM / meeting minutes). */
window.LVR_CRM_COMMITMENTS = {
  CUST001: [
    { text: 'Add an extended size range for production staff in Poland', owner: 'Lindström', due: '2025-09-30', status: 'Done' },
    { text: 'Monthly hygiene reporting for the food production sites', owner: 'Lindström', due: '2025-06-30', status: 'Overdue' },
    { text: 'Place return bins next to the changing rooms in Poznań', owner: 'NorthStar', due: '2025-10-31', status: 'Open' }
  ],
  CUST002: [
    { text: 'Restore 48-hour turnaround after the spring escalation', owner: 'Lindström', due: '2025-06-30', status: 'Done' },
    { text: 'Review hi-vis requirements at all plants', owner: 'Apex HSE', due: '2025-11-30', status: 'Open' }
  ],
  CUST003: [
    { text: 'Ward-level wash frequency evidence for infection control', owner: 'Lindström', due: '2025-08-31', status: 'Overdue' },
    { text: 'Environmental documentation for the next tender round', owner: 'Lindström', due: '2026-01-31', status: 'Open' }
  ]
};

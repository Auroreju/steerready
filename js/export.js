/*
 * Editable PowerPoint export (PptxGenJS). Uses customer-facing wording only:
 * no KAM opportunities or internal ranking reasons go into the file.
 */
(function () {
  'use strict';
  var F = window.LVR.FMT;
  var C = { navy: '003F72', cyan: '00A0C6', cyanDark: '00708A', green: '78BE20', greenDark: '3F6F0B', orange: 'FF7900', orangeDark: 'A34A00', magenta: 'CA005D', ink: '14212B', ink2: '3A4852', grey: '667780', line: 'DCE2E7', bg: 'F3F5F7', white: 'FFFFFF', kam: 'FDF5F9', kamText: '8C0040' };
  var FONT = 'Libre Franklin';

  function header(slide, step, title, color, ctx) {
    slide.background = { color: C.white };
    slide.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.magenta }, line: { color: C.magenta } });
    slide.addText(step.toUpperCase(), { x: 0.6, y: 0.35, w: 9, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: color, charSpacing: 2 });
    slide.addText(title, { x: 0.6, y: 0.62, w: 12.1, h: 0.75, fontFace: FONT, fontSize: 28, bold: true, color: C.navy });
    slide.addText('Lindström · Customer Value Review ' + ctx.r.year + ' · ' + ctx.r.customer.customer_name, { x: 0.6, y: 7.0, w: 8.5, h: 0.3, fontFace: FONT, fontSize: 9, color: C.grey });
    slide.addText('Data last updated ' + window.LVR.META.updatedLabel + ' · synthetic prototype data', { x: 8.6, y: 7.0, w: 4.1, h: 0.3, fontFace: FONT, fontSize: 9, color: C.grey, align: 'right' });
  }
  function kpi(slide, x, y, w, h, num, label, note, statusText, opts) {
    opts = opts || {};
    slide.addShape('roundRect', { x: x, y: y, w: w, h: h, rectRadius: 0.08, fill: { color: opts.fill || C.bg }, line: { color: opts.border || opts.fill || C.bg, width: opts.border ? 1.5 : 0.5 } });
    slide.addText(num, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.65, fontFace: FONT, fontSize: opts.size || 30, bold: true, color: C.navy, fit: 'shrink' });
    slide.addText(label, { x: x + 0.2, y: y + 0.8, w: w - 0.4, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    slide.addText(note, { x: x + 0.2, y: y + 1.13, w: w - 0.4, h: h - 1.5, fontFace: FONT, fontSize: 10.5, color: C.ink2, valign: 'top' });
    if (statusText) { slide.addText(statusText, { x: x + 0.2, y: y + h - 0.38, w: w - 0.4, h: 0.25, fontFace: FONT, fontSize: 8, bold: true, color: opts.statusColor || C.grey }); }
  }

  function build(r, ranked, state) {
    var pptx = new window.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Lindström';
    pptx.title = 'Customer Value Review ' + r.year + ' · ' + r.customer.customer_name;
    var ctx = { r: r };
    var k = r.kpis, v = r.value, S = r.settings, acct = state.acct;
    var kamValues = acct.kamValues || [];
    var kamSum = kamValues.reduce(function (s, x) { return s + x.amount; }, 0);

    // 1 cover
    var s1 = pptx.addSlide();
    s1.background = { color: C.navy };
    s1.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.magenta }, line: { color: C.magenta } });
    s1.addText('Lindström', { x: 0.7, y: 0.5, w: 4, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: C.white });
    s1.addText('ANNUAL STEERING COMMITTEE · ' + r.year, { x: 0.7, y: 1.9, w: 10, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: 'B9CEE0', charSpacing: 2 });
    s1.addText('Customer Value Review', { x: 0.7, y: 2.3, w: 11, h: 0.9, fontFace: FONT, fontSize: 44, bold: true, color: C.white });
    s1.addText(r.customer.customer_name, { x: 0.7, y: 3.2, w: 11, h: 0.6, fontFace: FONT, fontSize: 26, color: 'DCE8F2' });
    var V = window.LVR_VIEWS, aud = V.audienceOf(acct);
    s1.addText('Prepared for: ' + window.LVR_ASSISTANT.AUDIENCES[aud].label, { x: 0.7, y: 3.85, w: 11, h: 0.4, fontFace: FONT, fontSize: 15, color: 'B9CEE0' });
    s1.addText('Data ' + window.LVR.META.periodLabel + ' · dataset last updated ' + window.LVR.META.updatedLabel, { x: 0.7, y: 6.6, w: 11, h: 0.35, fontFace: FONT, fontSize: 11, color: 'B9CEE0' });
    var steps = [['Outcomes', C.cyanDark], ['Priorities', C.greenDark], ['Risks & issues', '0B5A97'], ['Opportunities', C.orangeDark], ['Decisions', C.magenta]];
    steps.forEach(function (st, i) {
      s1.addShape('roundRect', { x: 0.7 + i * 2.42, y: 5.1, w: 2.25, h: 1.0, rectRadius: 0.08, fill: { color: st[1] }, line: { color: st[1] } });
      s1.addText((i + 1) + '  ' + st[0], { x: 0.85 + i * 2.42, y: 5.1, w: 2.0, h: 1.0, fontFace: FONT, fontSize: 15, bold: true, color: C.white, valign: 'middle' });
    });
    s1.addNotes('Agenda follows the five steering-committee questions: outcomes, priorities, risks and issues, opportunities, decisions.');

    // at a glance: the four numbers and three topics chosen for this counterpart
    var sg0 = pptx.addSlide();
    header(sg0, 'At a glance', r.year + ' in four numbers', C.magenta, ctx);
    V.cards(r, acct).forEach(function (cd, i) {
      var x = 0.6 + i * 3.06, first = i === 0;
      sg0.addShape('roundRect', { x: x, y: 1.55, w: 2.9, h: 2.55, rectRadius: 0.1, fill: { color: first ? C.navy : C.bg }, line: { color: first ? C.navy : C.bg } });
      sg0.addText(cd.label, { x: x + 0.2, y: 1.7, w: 2.5, h: 0.4, fontFace: FONT, fontSize: 12, bold: true, color: first ? 'CFE0EE' : C.ink2 });
      sg0.addText(cd.value, { x: x + 0.2, y: 2.1, w: 2.5, h: 0.9, fontFace: FONT, fontSize: 36, bold: true, color: first ? C.white : C.navy, fit: 'shrink' });
      sg0.addText(cd.sub, { x: x + 0.2, y: 3.0, w: 2.5, h: 0.75, fontFace: FONT, fontSize: 10.5, color: first ? 'DCE8F2' : C.ink2, valign: 'top' });
      sg0.addText(cd.status, { x: x + 0.2, y: 3.75, w: 2.5, h: 0.25, fontFace: FONT, fontSize: 8, bold: true, color: first ? 'B9CEE0' : C.grey });
    });
    sg0.addText('What we would like to discuss', { x: 0.6, y: 4.35, w: 8, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: C.navy });
    V.points(r, ranked, acct, true).forEach(function (pt, i) {
      var y = 4.85 + i * 0.68;
      sg0.addShape('ellipse', { x: 0.6, y: y + 0.05, w: 0.42, h: 0.42, fill: { color: C.magenta }, line: { color: C.magenta } });
      sg0.addText(String(i + 1), { x: 0.6, y: y + 0.05, w: 0.42, h: 0.42, fontFace: FONT, fontSize: 13, bold: true, color: C.white, align: 'center', valign: 'middle' });
      sg0.addText([{ text: pt.title, options: { bold: true, color: C.ink, breakLine: true } }, { text: pt.body, options: { color: C.ink2, fontSize: 11 } }], { x: 1.2, y: y - 0.05, w: 11.5, h: 0.62, fontFace: FONT, fontSize: 13.5, valign: 'middle' });
    });

    // 2 look back
    var s2 = pptx.addSlide();
    header(s2, '1 · Outcomes', 'In ' + r.year + ', your workwear simply worked', C.cyanDark, ctx);
    var items = [
      [F.int(k.wearersDec), 'people kept dressed', 'across ' + k.sites + ' sites in ' + Object.keys(r.countries).join(', '), 'MEASURED'],
      [F.tonnes(k.washedKg), 'textiles washed', F.int(k.cycles) + ' tracked wash cycles, picked up and delivered on shared routes', 'MEASURED'],
      [F.pct(k.onTimePct, 1), 'delivered on time', 'average turnaround ' + Math.round(k.avgCycleHours) + ' hours', 'MEASURED'],
      [F.int(k.repairs), 'repairs', 'most common: ' + v.topRepairTypes.slice(0, 2).map(function (x) { return x.type.toLowerCase(); }).join(', '), 'MEASURED'],
      [F.tonnes(v.waste.total), 'end-of-life textiles handled', F.pct(v.waste.routes.recycling / (v.waste.total || 1) * 100) + ' recycled. None of it was your waste to manage.', 'ALLOCATED ESTIMATE'],
      [F.int(k.allocatedDec), 'garments in circulation', 'owned, maintained and tracked by Lindström', 'MEASURED']
    ];
    items.forEach(function (it, i) { kpi(s2, 0.6 + (i % 3) * 4.1, 1.6 + Math.floor(i / 3) * 2.6, 3.9, 2.4, it[0], it[1], it[2], it[3]); });

    // 3 show value
    var s3 = pptx.addSlide();
    header(s3, '1 · Outcomes', 'Value compared with ' + v.baseline.name.toLowerCase(), C.greenDark, ctx);
    kpi(s3, 0.6, 1.6, 6.0, 2.5, F.eur(v.avoidedLow) + ' to ' + F.eur(v.avoidedHigh), 'Avoided replacement purchases',
      F.int(k.repairs) + ' repairs × garment price × 50 to 100% that would otherwise have meant buying new. Base case (' + Math.round(S.repairShare * 100) + '%): ' + F.eur(v.avoidedSelected) + '. Not net of rental fees.', 'ESTIMATE', { fill: 'F6FBEF', border: C.green, statusColor: C.orangeDark, size: 30 });
    kpi(s3, 6.8, 1.6, 2.9, 2.5, F.tonnes(v.savings.co2), 'CO₂e avoided', 'Process and delivery, allocated by your share of washed kg', 'CALCULATED · ALLOCATED', { size: 26 });
    kpi(s3, 9.9, 1.6, 2.85, 2.5, F.litres(v.savings.water), 'Fresh water saved', 'About ' + F.one(v.footprint.waterPerKg) + ' L per kg with Lindström', 'CALCULATED · ALLOCATED', { size: 22 });
    if (kamValues.length) {
      var kh = 0.75 + (Math.min(4, kamValues.length) + 1) * 0.36;
      s3.addShape('roundRect', { x: 0.6, y: 4.35, w: 12.15, h: kh, rectRadius: 0.08, fill: { color: C.kam }, line: { color: 'E9B9D0', width: 1 } });
      s3.addText('Additional value estimated by your account team', { x: 0.85, y: 4.45, w: 9, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.kamText });
      var rows = kamValues.slice(0, 4).map(function (x) {
        return [{ text: x.label, options: { fontFace: FONT, fontSize: 12, color: C.ink } }, { text: x.kind, options: { fontFace: FONT, fontSize: 11, color: C.grey } }, { text: F.eurFull(x.amount), options: { fontFace: FONT, fontSize: 13, bold: true, color: C.navy, align: 'right' } }];
      });
      rows.push([{ text: 'Total value to discuss (data-based base case + account team estimates)', options: { fontFace: FONT, fontSize: 12, bold: true, color: C.ink } }, { text: '', options: {} }, { text: F.eur(v.avoidedSelected + kamSum), options: { fontFace: FONT, fontSize: 14, bold: true, color: C.navy, align: 'right' } }]);
      s3.addTable(rows, { x: 0.85, y: 4.9, w: 11.6, colW: [7.6, 2.0, 2.0], border: { type: 'none' }, rowH: 0.34 });
    } else {
      kpi(s3, 0.6, 4.35, 6.0, 2.4, F.tonnes(v.avoidedProductKg), 'Production emissions avoided', 'Garments that did not need to be produced thanks to repair (' + Math.round(S.repairShare * 100) + '% replacement share)', 'ESTIMATE', { statusColor: C.orangeDark, size: 28 });
      kpi(s3, 6.8, 4.35, 5.95, 2.4, F.tonnes(v.footprint.co2), 'Your workwear footprint with Lindström', 'Process ' + F.tonnes(v.footprint.process) + ', delivery ' + F.tonnes(v.footprint.delivery) + '. Ready for supplier data requests.', 'ALLOCATED ESTIMATE', { size: 28 });
    }
    s3.addNotes('Comparison baseline: ' + v.baseline.name + '. ' + v.baseline.note + ' Method for every figure is on the last slide.');

    // 4 build trust
    var s4 = pptx.addSlide();
    header(s4, '1 · Outcomes', 'Service you can rely on', C.navy, ctx);
    kpi(s4, 0.6, 1.6, 2.9, 2.3, F.pct(k.onTimePct, 1), 'on-time delivery', F.int(k.cycles) + ' tracked cycles', 'MEASURED');
    kpi(s4, 3.7, 1.6, 2.9, 2.3, Math.round(k.avgCycleHours) + ' h', 'average turnaround', 'pickup to delivery', 'MEASURED');
    kpi(s4, 6.8, 1.6, 2.9, 2.3, k.sitesInBand + ' / ' + k.sites, 'sites in healthy utilization', 'band ' + S.utilBand[0] + ' to ' + S.utilBand[1] + '% washed per week', 'ESTIMATE');
    kpi(s4, 9.9, 1.6, 2.85, 2.3, F.int(k.serviceRequests), 'service requests handled', 'repairs, size changes and returns', 'MEASURED');
    s4.addText('Weekly service utilization by site', { x: 0.6, y: 4.25, w: 8, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    s4.addShape('rect', { x: 0.6, y: 4.95, w: 12.1, h: 0.04, fill: { color: 'D3DBE1' }, line: { color: 'D3DBE1' } });
    s4.addShape('roundRect', { x: 0.6 + 12.1 * S.utilBand[0] / 100, y: 4.7, w: 12.1 * (S.utilBand[1] - S.utilBand[0]) / 100, h: 0.5, rectRadius: 0.05, fill: { color: 'E3F2D2' }, line: { color: 'E3F2D2' } });
    r.sites.forEach(function (st) {
      var out = st.utilWeekly < S.utilBand[0] || st.utilWeekly > S.utilBand[1];
      s4.addShape('ellipse', { x: 0.6 + 12.1 * Math.min(100, st.utilWeekly) / 100 - 0.08, y: 4.89, w: 0.16, h: 0.16, fill: { color: out ? C.orange : C.navy }, line: { color: C.white, width: 1 } });
    });
    ['0%', '25%', '50%', '75%', '100%'].forEach(function (t, i) { s4.addText(t, { x: 0.6 + 12.1 * i / 4 - 0.4, y: 5.25, w: 0.8, h: 0.25, fontFace: FONT, fontSize: 9, color: C.grey, align: 'center' }); });
    s4.addText('Each dot is one site. Green band = healthy range agreed with Lindström. Too high suggests too few garments; too low suggests garments are not being washed.', { x: 0.6, y: 5.65, w: 12.1, h: 0.6, fontFace: FONT, fontSize: 11, color: C.ink2 });

    var tblHead = function (cols) { return cols.map(function (h) { return { text: h, options: { bold: true, color: C.white, fill: { color: C.navy }, fontFace: FONT, fontSize: 11.5 } }; }); };
    var cell = function (t, o) { return { text: String(t == null ? '' : t), options: Object.assign({ fontFace: FONT, fontSize: 11.5, color: C.ink }, o || {}) }; };
    var risks = ranked.filter(function (x) { return x.kind === 'risk'; });
    var escl = risks.filter(function (x) { return x.escalate; });
    var opps = ranked.filter(function (x) { return x.kind === 'opportunity'; }).sort(function (x, y) { return y.valueScore - x.valueScore || y.score - x.score; });
    var commits = acct.commitments || (window.LVR_CRM_COMMITMENTS || {})[r.customer.customer_id] || [];

    // Q2 priorities
    var sP = pptx.addSlide();
    header(sP, '2 · Priorities', 'Your priorities for the next 6 to 12 months', C.cyanDark, ctx);
    var crmA = (window.LVR_CRM_ACCOUNT || {})[r.customer.customer_id] || {};
    var upcoming = ranked.filter(function (x) { return x.kind === 'upcoming' || x.id === 'reporting'; }).map(function (x) { return x.custTitle; });
    if (crmA.renewal) { upcoming.unshift('Contract renewal: ' + crmA.renewal); }
    var themes = (acct.focusThemes || []).concat(window.LVR_ASSISTANT.AUDIENCES[aud].themes).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
    [['What you told us', r.priorities, C.navy], ['Focus for this meeting', themes.map(function (t) { return t.charAt(0).toUpperCase() + t.slice(1); }), C.cyanDark], ['Coming up', upcoming, C.orangeDark]].forEach(function (col, i) {
      var x = 0.6 + i * 4.1;
      sP.addShape('roundRect', { x: x, y: 1.6, w: 3.9, h: 4.9, rectRadius: 0.08, fill: { color: C.bg }, line: { color: C.bg } });
      sP.addShape('rect', { x: x, y: 1.6, w: 3.9, h: 0.1, fill: { color: col[2] }, line: { color: col[2] } });
      sP.addText(col[0], { x: x + 0.25, y: 1.85, w: 3.4, h: 0.45, fontFace: FONT, fontSize: 16, bold: true, color: C.ink });
      sP.addText(col[1].map(function (t) { return { text: t, options: { bullet: true, breakLine: true } }; }), { x: x + 0.25, y: 2.4, w: 3.4, h: 3.9, fontFace: FONT, fontSize: 13, color: C.ink2, valign: 'top', paraSpaceAfter: 6 });
    });

    // Q3 risks and commitments
    var sR = pptx.addSlide();
    header(sR, '3 · Risks & issues', 'What needs a steering decision', C.orangeDark, ctx);
    var rRows = [tblHead(['Issue', 'Decision needed', 'Owner'])].concat((escl.length ? escl : risks.slice(0, 2)).map(function (x) { return [cell(x.custTitle, { bold: true }), cell(x.decision), cell(x.owner)]; }));
    sR.addTable(rRows, { x: 0.6, y: 1.55, w: 12.1, colW: [4.6, 5.2, 2.3], border: { type: 'solid', color: C.line, pt: 0.75 }, rowH: 0.5, valign: 'middle' });
    if (commits.length) {
      var cy = 1.75 + rRows.length * 0.55;
      sR.addText('Commitments from the last steering committee', { x: 0.6, y: cy, w: 10, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.ink });
      var stColor = { Done: C.greenDark, Open: C.orangeDark, Overdue: 'A11B1B' };
      sR.addTable([tblHead(['Commitment', 'Owner', 'Due', 'Status'])].concat(commits.map(function (c) { return [cell(c.text), cell(c.owner), cell(c.due), cell(c.status, { bold: true, color: stColor[c.status] || C.ink })]; })),
        { x: 0.6, y: cy + 0.45, w: 12.1, colW: [6.4, 2.3, 1.6, 1.8], border: { type: 'solid', color: C.line, pt: 0.75 }, rowH: 0.45, valign: 'middle' });
    }

    // Q4 opportunities
    var sO = pptx.addSlide();
    header(sO, '4 · Opportunities', 'Where we see the strongest value for you', C.greenDark, ctx);
    var L3 = { H: 'High', M: 'Medium', L: 'Low' }, LC = { H: C.greenDark, M: C.navy, L: C.grey };
    sO.addTable([tblHead(['Opportunity', 'Cost', 'Sustainability', 'Operations', 'Why'])].concat(opps.slice(0, 6).map(function (x) {
      return [cell(x.custTitle, { bold: true }), cell(L3[x.impact.cost], { bold: true, color: LC[x.impact.cost] }), cell(L3[x.impact.sust], { bold: true, color: LC[x.impact.sust] }), cell(L3[x.impact.ops], { bold: true, color: LC[x.impact.ops] }), cell(x.impact.note, { fontSize: 10.5, color: C.ink2 })];
    })), { x: 0.6, y: 1.55, w: 12.1, colW: [4.3, 1.2, 1.6, 1.4, 3.6], border: { type: 'solid', color: C.line, pt: 0.75 }, rowH: 0.55, valign: 'middle' });
    sO.addText('Ratings by rule from your data; see the method slide.', { x: 0.6, y: 6.45, w: 12, h: 0.3, fontFace: FONT, fontSize: 10, color: C.grey });

    // Q5 decisions
    var s6 = pptx.addSlide();
    header(s6, '5 · Decisions', 'Decisions to agree today', C.magenta, ctx);
    var acts = acct.actions && acct.actions.length ? acct.actions : escl.concat(opps.slice(0, 2)).map(function (sg) { return { decision: sg.decision, text: sg.action, owner: sg.owner, due: '', benefit: sg.benefit }; });
    var body = acts.slice(0, 7).map(function (a) { return [cell(a.decision || a.text, { bold: true }), cell(a.owner), cell(a.due || 'To agree'), cell(a.benefit || '')]; });
    s6.addTable([tblHead(['Decision', 'Owner', 'By when', 'What you get'])].concat(body), { x: 0.6, y: 1.55, w: 12.1, colW: [5.4, 2.5, 1.5, 2.7], border: { type: 'solid', color: C.line, pt: 0.75 }, rowH: 0.55, valign: 'middle' });

    // 7 impact story
    var s7 = pptx.addSlide();
    s7.background = { color: C.navy };
    s7.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.magenta }, line: { color: C.magenta } });
    s7.addText('OUR SHARED IMPACT STORY', { x: 0.6, y: 0.4, w: 9, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: 'F2B544', charSpacing: 2 });
    s7.addText('A result you can use in your own communication', { x: 0.6, y: 0.7, w: 12, h: 0.7, fontFace: FONT, fontSize: 28, bold: true, color: C.white });
    s7.addShape('roundRect', { x: 0.6, y: 1.7, w: 12.1, h: 2.4, rectRadius: 0.1, fill: { color: '0B5A97' }, line: { color: '0B5A97' } });
    s7.addText('“' + window.LVR_ASSISTANT.impactStatement(r) + '”', { x: 0.9, y: 1.8, w: 11.5, h: 2.2, fontFace: FONT, fontSize: 21, bold: true, color: C.white, valign: 'middle', fit: 'shrink' });
    [['Public tenders', 'Evidence of a supplier partnership with measurable environmental impact'], ['Sustainability report', 'A supplier example with numbers and a stated method'], ['Joint communication', 'A co-signed post or case story, if both sides agree']].forEach(function (b, i) {
      s7.addShape('roundRect', { x: 0.6 + i * 4.1, y: 4.45, w: 3.9, h: 1.6, rectRadius: 0.08, fill: { color: C.navy }, line: { color: '3D6A93', width: 1 } });
      s7.addText(b[0], { x: 0.8 + i * 4.1, y: 4.55, w: 3.5, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.white });
      s7.addText(b[1], { x: 0.8 + i * 4.1, y: 4.95, w: 3.5, h: 0.9, fontFace: FONT, fontSize: 11, color: 'D8E0EC', valign: 'top' });
    });
    s7.addText('Estimate, not audited. Wording to be approved by both companies before external use.', { x: 0.6, y: 6.5, w: 12, h: 0.35, fontFace: FONT, fontSize: 10, color: 'B9CEE0' });

    // 8 method
    var s8 = pptx.addSlide();
    header(s8, 'Appendix', 'How these numbers were made', C.grey, ctx);
    var mh = ['Figure', 'How it is calculated', 'Status'].map(function (h) { return { text: h, options: { bold: true, color: C.white, fill: { color: C.navy }, fontFace: FONT, fontSize: 11 } }; });
    var m = [
      ['Wearers, washes, repairs, deliveries', 'Counted from service and RFID scan data; wearers counted once per site (largest product row), not per garment type', 'Measured'],
      ['Avoided purchases', 'Repairs × garment price (synthetic) × share that would otherwise have been replaced (' + Math.round(S.repairShare * 100) + '% base, 50 to 100% range). Rental fees not included.', 'Estimate'],
      ['CO₂e and water saved', 'Washed kg × ' + v.baseline.name.toLowerCase() + ' factor, minus your allocated share of Lindström laundry and delivery impacts', 'Calculated, allocated'],
      ['Textile waste handled', 'Laundry-level waste allocated by your share of washed kg, split by treatment route', 'Allocated estimate'],
      ['Service utilization', 'Monthly washing % (washed ÷ allocated pieces) ÷ ' + S.weeksPerMonth + ' weeks; healthy band ' + S.utilBand[0] + ' to ' + S.utilBand[1] + '%', 'Estimate'],
      ['Findings', 'Wash gaps over ' + S.hygieneDays + ' days; under ' + S.underThreshold + ' or over ' + S.overThreshold + ' pieces per wearer per product; site type vs products in use', 'Rule-based']
    ];
    if (kamValues.length) { m.push(['Account team estimates', 'Entered by your Lindström account manager from their knowledge of your operations; shown separately from data-based figures', 'KAM-entered']); }
    s8.addTable([mh].concat(m.map(function (row) { return row.map(function (t, j) { return { text: t, options: { fontFace: FONT, fontSize: 10.5, color: C.ink, bold: j === 0 } }; }); })),
      { x: 0.6, y: 1.55, w: 12.1, colW: [2.8, 7.4, 1.9], border: { type: 'solid', color: C.line, pt: 0.75 }, rowH: 0.5, valign: 'middle' });
    s8.addText('Not audited. Supporting data for your own reporting, not a verified claim or compliance statement. Hackathon prototype on Lindström\'s synthetic data pack.', { x: 0.6, y: 6.35, w: 12.1, h: 0.45, fontFace: FONT, fontSize: 10, color: C.orangeDark, bold: true });

    return pptx;
  }

  function pptx(r, ranked, state) {
    var deck = build(r, ranked, state);
    var name = 'Lindstrom_Customer_Value_Review_' + r.year + '_' + r.customer.customer_name.replace(/[^A-Za-z0-9]+/g, '_') + '.pptx';
    return deck.writeFile({ fileName: name });
  }

  window.LVR_EXPORT = { pptx: pptx, build: build };
})();

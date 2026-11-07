/*
 * Counterpart views: what to show first depending on who the KAM is meeting.
 * A CFO gets the big picture (total value, risk, reporting); procurement gets
 * cost detail and value for money; quality, operations and sustainability get
 * their own headline numbers. Used by the overview page, the assistant's
 * 30-second brief and the PowerPoint "at a glance" slide.
 */
(function () {
  'use strict';
  var L = window.LVR, F = L.FMT;
  var AUD = window.LVR_ASSISTANT.AUDIENCES;

  var ORDER = ['cfo', 'procurement', 'quality', 'operations', 'sustainability'];
  var DESCRIBE = {
    cfo: 'Big picture: total value delivered, business continuity and what it means for their reporting.',
    procurement: 'Practical detail: costs avoided, garments per wearer, spare stock and value for money.',
    quality: 'Hygiene and safety: wash routines, sites to follow up and the right protection per role.',
    operations: 'Day-to-day service: deliveries, turnaround, shortages and utilization per site.',
    sustainability: 'Environmental impact: CO₂, water, recycling and data for their own reporting.'
  };

  function audienceOf(acct) { return acct.audience || 'cfo'; }
  function kamSum(acct) { return (acct.kamValues || []).reduce(function (s, v) { return s + v.amount; }, 0); }

  // Themes used to rank signals: what the KAM said plus what this counterpart cares about.
  function themesFor(acct) {
    var t = (acct.focusThemes || []).slice();
    (AUD[audienceOf(acct)].themes || []).forEach(function (x) { if (t.indexOf(x) === -1) { t.push(x); } });
    return t;
  }

  function cards(r, acct) {
    var k = r.kpis, v = r.value, S = r.settings, aud = audienceOf(acct), ks = kamSum(acct);
    var fitSites = r.sites.filter(function (s) { return s.flags.indexOf('Product fit') !== -1; }).length;
    var hygSites = r.sites.filter(function (s) { return s.hygienePct > 30; }).sort(function (a, b) { return b.hygienePct - a.hygienePct; });
    var c = {
      total: { label: 'Total value delivered', value: F.eur(v.avoidedSelected + ks), sub: ks ? 'Avoided purchases ' + F.eur(v.avoidedSelected) + ' + account team estimates ' + F.eur(ks) : 'Avoided replacement purchases (range ' + F.eur(v.avoidedLow) + ' to ' + F.eur(v.avoidedHigh) + ')', status: 'ESTIMATE', page: 'outcomes' },
      avoided: { label: 'Avoided purchases', value: F.eur(v.avoidedSelected), sub: 'Range ' + F.eur(v.avoidedLow) + ' to ' + F.eur(v.avoidedHigh) + ', before rental fees', status: 'ESTIMATE', page: 'outcomes' },
      co2: { label: 'CO₂e avoided', value: F.tonnes(v.savings.co2), sub: 'vs ' + v.baseline.name.toLowerCase(), status: 'CALCULATED', page: 'outcomes' },
      water: { label: 'Water saved', value: F.litres(v.savings.water).replace(' million', 'M'), sub: 'vs ' + v.baseline.name.toLowerCase(), status: 'CALCULATED', page: 'outcomes' },
      ontime: { label: 'Delivered on time', value: F.pct(k.onTimePct, 1), sub: 'Across ' + k.sites + ' sites, ' + F.int(k.cycles) + ' tracked cycles', status: 'MEASURED', page: 'outcomes' },
      repairs: { label: 'Garments kept in use', value: F.int(k.repairs), sub: 'Repaired instead of replaced', status: 'MEASURED', page: 'outcomes' },
      spare: { label: 'Spare garments', value: F.int(r.supply.overSpare), sub: r.supply.overSites.length ? 'At ' + r.supply.overSites.length + ' sites; can move to short sites at no extra cost' : 'No site holds clear surplus', status: 'CALCULATED', page: 'sites' },
      perWearer: { label: 'Garments per wearer', value: (k.allocatedDec / k.wearersDec).toFixed(1), sub: r.supply.underSites.length + ' sites short on at least one item', status: 'CALCULATED', page: 'sites' },
      requests: { label: 'Service requests handled', value: F.int(k.serviceRequests), sub: 'Repairs, size changes and returns', status: 'MEASURED', page: 'outcomes' },
      gaps: { label: 'Garments with long wash gaps', value: F.pct(r.hygiene.gapAssets / (r.hygiene.trackedAssets || 1) * 100), sub: S.hygieneDays + '+ days between washes; worst ' + (r.hygiene.top[0] ? r.hygiene.top[0].city : '-'), status: 'CALCULATED', page: 'risks' },
      hygSites: { label: 'Sites to follow up', value: String(hygSites.length), sub: hygSites.length ? 'Over 30% of garments with long gaps; worst ' + hygSites.slice(0, 3).map(function (s) { return s.city; }).join(', ') : 'None above 30%', status: 'CALCULATED', page: 'sites' },
      fit: { label: 'Sites to check protection', value: String(fitSites), sub: 'Warehouses and plants without hi-vis or coveralls', status: 'RULE-BASED', page: 'opportunities' },
      turnaround: { label: 'Average turnaround', value: Math.round(k.avgCycleHours) + ' h', sub: 'Pickup to delivery back to site', status: 'MEASURED', page: 'outcomes' },
      short: { label: 'Sites short of garments', value: String(r.supply.underSites.length), sub: 'About ' + F.int(r.supply.underPieces) + ' pieces to reach 1 per wearer', status: 'CALCULATED', page: 'sites' },
      util: { label: 'Service utilization', value: F.pct(k.utilWeekly), sub: k.sitesInBand + ' of ' + k.sites + ' sites in the 30 to 60% band', status: 'ESTIMATE', page: 'outcomes' },
      recycled: { label: 'Textiles recycled', value: F.pct(v.waste.routes.recycling / (v.waste.total || 1) * 100), sub: 'Of ' + F.tonnes(v.waste.total) + ' end-of-life textiles', status: 'ALLOCATED', page: 'outcomes' },
      footprint: { label: 'Workwear footprint', value: F.tonnes(v.footprint.co2), sub: 'Ready to share for supplier-data requests', status: 'ALLOCATED', page: 'outcomes' }
    };
    var pick = {
      cfo: ['total', 'co2', 'ontime', 'repairs'],
      procurement: ['avoided', 'spare', 'perWearer', 'requests'],
      quality: ['gaps', 'hygSites', fitSites ? 'fit' : 'repairs', 'ontime'],
      operations: ['ontime', 'turnaround', 'short', 'util'],
      sustainability: ['co2', 'water', 'recycled', 'footprint']
    }[aud];
    return pick.map(function (key) { return Object.assign({ key: key }, c[key]); });
  }

  function points(r, ranked, acct, customerMode) {
    var aud = audienceOf(acct), v = r.value, ks = kamSum(acct), out = [];
    if (aud === 'cfo') {
      out.push({ title: customerMode ? 'The value of the partnership in ' + r.year : 'Open with the value story', body: F.eur(v.avoidedSelected + ks) + ' in value, ' + F.tonnes(v.savings.co2) + ' CO₂e avoided, ' + F.pct(r.kpis.onTimePct, 1) + ' on time.', page: 'outcomes' });
    } else if (aud === 'procurement') {
      out.push({ title: customerMode ? 'Value for money' : 'Answer "why not buy?" with numbers', body: F.eur(v.avoidedLow) + ' to ' + F.eur(v.avoidedHigh) + ' in avoided purchases from ' + F.int(r.kpis.repairs) + ' repairs, before rental fees.', page: 'outcomes' });
    }
    ranked.forEach(function (s) {
      if (out.length >= 3) { return; }
      out.push({ title: customerMode ? s.custTitle : s.kamTitle, body: customerMode ? s.action + '.' : s.action + ' · ' + s.opportunity, page: s.kind === 'risk' ? 'risks' : 'opportunities', id: s.id });
    });
    return out;
  }

  function brief(r, ranked, acct) {
    var aud = audienceOf(acct), crm = (window.LVR_CRM_ACCOUNT || {})[r.customer.customer_id] || {};
    var cs = cards(r, acct), ps = points(r, ranked, acct, false);
    var lines = ['30-second brief: ' + r.customer.customer_name + ', meeting the ' + AUD[aud].label + '.'];
    if (crm.since) { lines.push('Customer since ' + crm.since + ' · renewal ' + crm.renewal + '.'); }
    lines.push('Lead with: ' + cs.slice(0, 2).map(function (c) { return c.label.toLowerCase() + ' ' + c.value; }).join(', ') + '.');
    lines.push('Talk about:');
    ps.forEach(function (p, i) { lines.push((i + 1) + '. ' + p.title); });
    var last = (acct.knowledge || []).slice(-1)[0];
    if (last) { lines.push('Remember: ' + last.text); } else if (crm.lastMeeting) { lines.push('Last time: ' + crm.lastMeeting + '.'); }
    return lines.join('\n');
  }

  window.LVR_VIEWS = { ORDER: ORDER, DESCRIBE: DESCRIBE, audienceOf: audienceOf, themesFor: themesFor, cards: cards, points: points, brief: brief, kamSum: kamSum };
})();

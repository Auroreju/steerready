/*
 * Calculation engine for the Customer Value Review.
 *
 * Every number shown in the app or the export comes from a function in this
 * file. The assistant never invents figures; it only quotes results from here.
 * Each figure carries a status label (MEASURED, CALCULATED, ALLOCATED, ESTIMATE,
 * KAM_ENTERED) so the KAM and the customer can see how solid it is.
 */
(function () {
  'use strict';

  // ---------- data access ----------
  function table(name) {
    var t = window.LVR_DATA[name];
    return t.rows.map(function (r) {
      var o = {};
      for (var i = 0; i < t.cols.length; i++) { o[t.cols[i]] = r[i]; }
      return o;
    });
  }

  var DB = {};
  ['Customers', 'Sites', 'Products', 'Laundries', 'Industry_Priorities', 'Baselines', 'Assumptions',
    'Data_Quality', 'Service_Activity', 'Repairs', 'Service_Cycles', 'Customer_Impacts',
    'Laundry_Resources', 'Waste_Circularity'].forEach(function (n) { DB[n] = table(n); });

  var byId = function (rows, key) { var m = {}; rows.forEach(function (r) { m[r[key]] = r; }); return m; };
  var PRODUCTS = byId(DB.Products, 'product_id');
  var SITES = byId(DB.Sites, 'site_id');
  var BASELINES = byId(DB.Baselines, 'baseline_id');

  function sumBy(rows, f) { var s = 0; for (var i = 0; i < rows.length; i++) { s += Number(typeof f === 'function' ? f(rows[i]) : rows[i][f]) || 0; } return s; }
  function groupBy(rows, key) {
    var m = {};
    rows.forEach(function (r) { var k = typeof key === 'function' ? key(r) : r[key]; (m[k] = m[k] || []).push(r); });
    return m;
  }
  function mean(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }

  // ---------- defaults ----------
  var DEFAULT_SETTINGS = {
    baseline: 'B_LOCAL',          // comparison scenario (Baselines sheet)
    repairShare: 0.75,            // share of repairs assumed to replace a purchase (A002 sensitivity)
    hygieneDays: 90,              // a garment gap above this many days between pickups is flagged
    underThreshold: 1.0,          // pieces per wearer per product below this = under-supplied
    overThreshold: 1.3,           // pieces per wearer per product above this = spare stock
    utilBand: [30, 60],           // healthy weekly service utilization band (Lindström KPI)
    weeksPerMonth: 4.33
  };

  // Which products a site type would normally need (rule for the product-fit signal).
  var SITE_TYPE_NEEDS = {
    'Distribution Center': { product: 'P1003', reason: 'forklift and loading work' },
    'Production Plant': { product: 'P1006', reason: 'production-line work' },
    'Manufacturing Plant': { product: 'P1006', reason: 'production-line work' },
    'Hospital': { product: 'P1005', reason: 'clinical work' }
  };

  // Map words used in priorities to the themes signals are tagged with.
  var THEME_WORDS = {
    hygiene: ['hygiene', 'compliance', 'traceability', 'food safety', 'infection'],
    cost: ['cost', 'allocation', 'budget', 'price', 'utilization', 'utilisation'],
    service: ['service', 'continuity', 'reliability', 'availability', 'delivery'],
    water: ['water'],
    emissions: ['emission', 'co2', 'carbon', 'scope 3', 'climate', 'footprint'],
    circularity: ['repair', 'circular', 'lifetime', 'waste', 'recycl'],
    safety: ['safety', 'hi-vis', 'protective'],
    reporting: ['scope 3', 'evidence', 'reporting', 'tender', 'esg', 'compliance-ready']
  };

  function themesFromText(text) {
    var t = String(text || '').toLowerCase();
    return Object.keys(THEME_WORDS).filter(function (k) {
      return THEME_WORDS[k].some(function (w) { return t.indexOf(w) !== -1; });
    });
  }

  // ---------- formatting ----------
  var nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  var FMT = {
    int: function (n) { return nf0.format(Math.round(n)); },
    one: function (n) { return nf1.format(n); },
    pct: function (n, d) { return (d === 1 ? nf1.format(n) : nf0.format(Math.round(n))) + '%'; },
    eur: function (n) {
      if (Math.abs(n) >= 1e6) { return '€' + nf1.format(n / 1e6) + 'M'; }
      if (Math.abs(n) >= 1e3) { return '€' + nf0.format(Math.round(n / 1e3)) + 'k'; }
      return '€' + nf0.format(Math.round(n));
    },
    eurFull: function (n) { return '€' + nf0.format(Math.round(n)); },
    tonnes: function (kg) { return kg >= 10000 ? nf0.format(Math.round(kg / 1000)) + ' t' : nf1.format(kg / 1000) + ' t'; },
    litres: function (l) {
      if (l >= 1e6) { return nf1.format(l / 1e6) + ' million L'; }
      if (l >= 1e3) { return nf0.format(Math.round(l / 1e3)) + ' thousand L'; }
      return nf0.format(Math.round(l)) + ' L';
    }
  };

  // ---------- core computation ----------
  function computeCustomer(customerId, settingsIn) {
    var S = Object.assign({}, DEFAULT_SETTINGS, settingsIn || {});
    var customer = DB.Customers.filter(function (c) { return c.customer_id === customerId; })[0];
    var sites = DB.Sites.filter(function (s) { return s.customer_id === customerId; });
    var siteIds = {}; sites.forEach(function (s) { siteIds[s.site_id] = true; });
    var act = DB.Service_Activity.filter(function (r) { return r.customer_id === customerId; });
    var rep = DB.Repairs.filter(function (r) { return r.customer_id === customerId; });
    var cyc = DB.Service_Cycles.filter(function (r) { return r.customer_id === customerId; });
    var imp = DB.Customer_Impacts.filter(function (r) { return r.customer_id === customerId; });
    var months = act.map(function (r) { return r.month; }).sort();
    var lastMonth = months[months.length - 1];
    var year = String(lastMonth).slice(0, 4);

    var priorities = String(customer.priority_topics || '').split('|').filter(Boolean);
    var industryPriorities = DB.Industry_Priorities.filter(function (p) { return p.industry === customer.industry; })
      .sort(function (a, b) { return a.priority_rank - b.priority_rank; });

    // --- look back KPIs ---
    var dec = act.filter(function (r) { return r.month === lastMonth; });
    var decBySite = groupBy(dec, 'site_id');
    // Wearers: one person can wear several product types, so take the largest product row per site
    // instead of summing rows (the pack's sample output sums rows and double counts).
    var wearersDec = 0;
    Object.keys(decBySite).forEach(function (sid) {
      wearersDec += Math.max.apply(null, decBySite[sid].map(function (r) { return r.active_wearers; }));
    });
    var wearersRowSum = sumBy(dec, 'active_wearers');
    var allocatedDec = sumBy(dec, 'allocated_pieces');
    var scannedDec = sumBy(dec, 'active_assets_scanned');
    var washedKg = sumBy(act, 'customer_washed_kg');
    var washedPieces = sumBy(act, 'washed_pieces');
    var serviceRequests = sumBy(act, 'service_requests');
    var repairs = sumBy(rep, 'repair_count');
    var onTime = cyc.filter(function (c) { return c.performance_flag === 'ON_TIME'; }).length;
    var onTimePct = cyc.length ? onTime / cyc.length * 100 : 0;
    var avgCycleHours = mean(cyc.map(function (c) { return c.cycle_hours; }));
    var utilWeekly = mean(act.map(function (r) { return r.washing_pct; })) / S.weeksPerMonth;

    var countries = {};
    sites.forEach(function (s) { countries[s.country] = (countries[s.country] || 0) + 1; });

    // --- hygiene: longest gap between pickups per tracked garment ---
    var cycByAsset = groupBy(cyc, 'asset_id');
    var assetGap = {}; // asset -> {site, maxGap}
    Object.keys(cycByAsset).forEach(function (a) {
      var list = cycByAsset[a].map(function (c) { return { t: Date.parse(c.pickup_timestamp), site: c.site_id }; })
        .sort(function (x, y) { return x.t - y.t; });
      var maxGap = 0;
      for (var i = 1; i < list.length; i++) { maxGap = Math.max(maxGap, (list[i].t - list[i - 1].t) / 86400000); }
      assetGap[a] = { site: list[0].site, maxGap: maxGap, cycles: list.length };
    });
    var trackedAssets = Object.keys(assetGap).length;
    var gapAssets = Object.keys(assetGap).filter(function (a) { return assetGap[a].maxGap > S.hygieneDays; });
    var medianGap = (function () {
      var g = []; Object.keys(cycByAsset).forEach(function (a) {
        var l = cycByAsset[a].map(function (c) { return Date.parse(c.pickup_timestamp); }).sort(function (x, y) { return x - y; });
        for (var i = 1; i < l.length; i++) { g.push((l[i] - l[i - 1]) / 86400000); }
      });
      g.sort(function (a, b) { return a - b; });
      return g.length ? g[Math.floor(g.length / 2)] : 0;
    })();

    // --- per site/product supply ---
    var avgBySiteProduct = groupBy(act, function (r) { return r.site_id + '|' + r.product_id; });
    var supplyRows = Object.keys(avgBySiteProduct).map(function (k) {
      var rows = avgBySiteProduct[k];
      var w = mean(rows.map(function (r) { return r.active_wearers; }));
      var al = mean(rows.map(function (r) { return r.allocated_pieces; }));
      var sc = mean(rows.map(function (r) { return r.active_assets_scanned; }));
      return { site_id: rows[0].site_id, product_id: rows[0].product_id, wearers: w, allocated: al, scanned: sc, perWearer: al / w };
    });
    var under = supplyRows.filter(function (r) { return r.perWearer < S.underThreshold; });
    var over = supplyRows.filter(function (r) { return r.perWearer > S.overThreshold; });
    var underPieces = sumBy(under, function (r) { return r.wearers * S.underThreshold - r.allocated; });
    var overSpare = sumBy(over, function (r) { return r.allocated - r.scanned; });
    var uniq = function (arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); };
    var underSites = uniq(under.map(function (r) { return r.site_id; }));
    var overSites = uniq(over.map(function (r) { return r.site_id; }));
    var worstUnder = under.slice().sort(function (a, b) { return a.perWearer - b.perWearer; })[0];

    // --- site table ---
    var cycBySite = groupBy(cyc, 'site_id');
    var actBySite = groupBy(act, 'site_id');
    var repBySite = groupBy(rep, 'site_id');
    var impBySite = groupBy(imp, 'site_id');
    var siteRows = sites.map(function (s) {
      var a = actBySite[s.site_id] || [];
      var c = cycBySite[s.site_id] || [];
      var d = decBySite[s.site_id] || [];
      var assets = Object.keys(assetGap).filter(function (k) { return assetGap[k].site === s.site_id; });
      var gaps = assets.filter(function (k) { return assetGap[k].maxGap > S.hygieneDays; });
      var sp = supplyRows.filter(function (r) { return r.site_id === s.site_id; });
      var products = uniq(a.map(function (r) { return r.product_id; }));
      var row = {
        site_id: s.site_id, name: s.site_name, city: s.city, country: s.country, type: s.site_type,
        wearers: d.length ? Math.max.apply(null, d.map(function (r) { return r.active_wearers; })) : 0,
        allocated: sumBy(d, 'allocated_pieces'),
        scanShare: sumBy(a, 'allocated_pieces') ? sumBy(a, 'active_assets_scanned') / sumBy(a, 'allocated_pieces') * 100 : 0,
        utilWeekly: mean(a.map(function (r) { return r.washing_pct; })) / S.weeksPerMonth,
        washedKg: sumBy(a, 'customer_washed_kg'),
        repairs: sumBy(repBySite[s.site_id] || [], 'repair_count'),
        serviceRequests: sumBy(a, 'service_requests'),
        latePct: c.length ? c.filter(function (x) { return x.performance_flag === 'LATE'; }).length / c.length * 100 : 0,
        hygienePct: assets.length ? gaps.length / assets.length * 100 : 0,
        trackedAssets: assets.length,
        minPerWearer: sp.length ? Math.min.apply(null, sp.map(function (r) { return r.perWearer; })) : 0,
        maxPerWearer: sp.length ? Math.max.apply(null, sp.map(function (r) { return r.perWearer; })) : 0,
        products: products.map(function (p) { return PRODUCTS[p].product_name; }),
        productIds: products,
        co2Kg: sumBy(impBySite[s.site_id] || [], function (r) { return r.allocated_process_kgco2e + r.allocated_delivery_kgco2e; }),
        supply: sp.map(function (r) { return { product: PRODUCTS[r.product_id].product_name, perWearer: r.perWearer, wearers: r.wearers, allocated: r.allocated }; })
      };
      row.flags = [];
      if (row.hygienePct > 30) { row.flags.push('Hygiene'); }
      if (row.minPerWearer < S.underThreshold) { row.flags.push('Under-supply'); }
      if (row.maxPerWearer > S.overThreshold) { row.flags.push('Spare stock'); }
      if (row.utilWeekly < S.utilBand[0] || row.utilWeekly > S.utilBand[1]) { row.flags.push('Utilization'); }
      var need = SITE_TYPE_NEEDS[s.site_type];
      if (need && products.indexOf(need.product) === -1) { row.flags.push('Product fit'); }
      row.attention = row.hygienePct / 10 + Math.max(0, (S.underThreshold - row.minPerWearer) * 10) + row.latePct + row.flags.length;
      return row;
    });

    // --- value vs baseline ---
    var base = BASELINES[S.baseline];
    var allocWater = sumBy(imp, 'allocated_water_l');
    var allocEnergy = sumBy(imp, 'allocated_energy_kwh');
    var allocProc = sumBy(imp, 'allocated_process_kgco2e');
    var allocDeliv = sumBy(imp, 'allocated_delivery_kgco2e');
    var allocWaste = sumBy(imp, 'allocated_textile_waste_kg');
    var impKg = sumBy(imp, 'customer_washed_kg');
    function savingsFor(b) {
      return {
        water: impKg * b.water_l_per_kg - allocWater,
        energy: impKg * b.energy_kwh_per_kg - allocEnergy,
        co2: impKg * (b.process_kgco2e_per_kg + b.delivery_kgco2e_per_kg) - allocProc - allocDeliv
      };
    }
    var savings = savingsFor(base);
    var allBaselines = DB.Baselines.map(function (b) {
      return { id: b.baseline_id, name: b.baseline_name, note: b.assumption_note, values: savingsFor(b) };
    });

    var repByProduct = groupBy(rep, 'product_id');
    var avoided = Object.keys(repByProduct).map(function (pid) {
      var n = sumBy(repByProduct[pid], 'repair_count');
      var q = mean(repByProduct[pid].map(function (r) { return r.repair_quotient_pct; }));
      return {
        product_id: pid, product: PRODUCTS[pid].product_name, repairs: n,
        unitCost: PRODUCTS[pid].synthetic_purchase_cost_eur, full: n * PRODUCTS[pid].synthetic_purchase_cost_eur,
        repairRate: q, avoidedProductKg: sumBy(repByProduct[pid], 'estimated_avoided_product_kgco2e')
      };
    }).sort(function (a, b) { return b.full - a.full; });
    var avoidedFull = sumBy(avoided, 'full');
    var avoidedProductKg = sumBy(avoided, 'avoidedProductKg');
    var repairTypes = groupBy(rep, 'repair_type');
    var topRepairTypes = Object.keys(repairTypes).map(function (k) { return { type: k, n: sumBy(repairTypes[k], 'repair_count') }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 4);

    // Waste: customer share of each laundry's waste, split by that laundry's treatment routes.
    var wasteRoutes = { recycling: 0, reuse: 0, energy_recovery: 0, incineration: 0 };
    var impByLaundry = groupBy(imp, 'laundry_id');
    Object.keys(impByLaundry).forEach(function (lid) {
      var custWaste = sumBy(impByLaundry[lid], 'allocated_textile_waste_kg');
      var w = DB.Waste_Circularity.filter(function (r) { return r.laundry_id === lid; });
      var tot = sumBy(w, 'textile_waste_total_kg');
      if (!tot) { return; }
      wasteRoutes.recycling += custWaste * sumBy(w, 'recycling_kg') / tot;
      wasteRoutes.reuse += custWaste * sumBy(w, 'reuse_kg') / tot;
      wasteRoutes.energy_recovery += custWaste * sumBy(w, 'energy_recovery_kg') / tot;
      wasteRoutes.incineration += custWaste * sumBy(w, 'incineration_kg') / tot;
    });

    // --- signals ---
    var sitesSorted = function (key) { return siteRows.slice().sort(function (a, b) { return b[key] - a[key]; }); };
    var hygieneTop = sitesSorted('hygienePct').slice(0, 3);
    var siteName = function (id) { return SITES[id].city; };
    var signals = [];
    var food = customer.industry === 'Food & Beverage';
    var health = customer.industry === 'Healthcare';

    if (gapAssets.length) {
      var pctAll = gapAssets.length / trackedAssets * 100;
      signals.push({
        id: 'hygiene', group: 'Fix', themes: ['hygiene', 'service'], severity: Math.min(10, pctAll / 4 + (food || health ? 3 : 0)),
        kamTitle: 'Hygiene gaps: ' + FMT.pct(pctAll) + ' of tracked garments went ' + S.hygieneDays + '+ days without a wash',
        kamBody: FMT.int(gapAssets.length) + ' of ' + FMT.int(trackedAssets) + ' tracked garments had at least one gap of more than ' + S.hygieneDays + ' days between pickups. Worst: ' +
          hygieneTop.map(function (s) { return s.city + ' ' + FMT.pct(s.hygienePct); }).join(', ') + '.' + (food ? ' Hygiene is the #1 priority for food customers.' : health ? ' Hygiene and traceability are the #1 priority in healthcare.' : ''),
        custTitle: 'Some garments are falling out of the wash routine',
        custBody: 'At ' + hygieneTop.map(function (s) { return s.city; }).join(', ') + ', a notable share of tracked garments went more than ' + S.hygieneDays + ' days between washes. We suggest a short walk-through with each site lead and a follow-up at the mid-year review.',
        action: 'Hygiene follow-up at ' + hygieneTop.map(function (s) { return s.city; }).join(', '),
        owner: 'Site leads + Lindström', benefit: 'Audit-ready hygiene evidence',
        evidence: 'RFID wash-cycle scans (Service_Cycles), ' + FMT.int(trackedAssets) + ' tracked garments', status: 'CALCULATED',
        opportunity: 'Hygiene follow-up service or higher pickup frequency',
        sites: hygieneTop.map(function (s) { return s.site_id; })
      });
    }
    if (over.length) {
      signals.push({
        id: 'spare', group: 'Grow', themes: ['cost'], severity: Math.min(10, overSpare / 200 + 2),
        kamTitle: 'About ' + FMT.int(overSpare) + ' garments paid for but not in use',
        kamBody: overSites.length + ' sites hold more than ' + S.overThreshold + ' pieces per wearer for at least one product. Moving the surplus to short sites keeps the revenue and fixes shortages. A strong trust signal for procurement.',
        custTitle: 'Rebalance garments between sites',
        custBody: overSites.length + ' sites have more garments than their wearers need (about ' + FMT.int(overSpare) + ' pieces not in regular use). We suggest moving them to sites that are short, at no extra cost to you.',
        action: 'Move about ' + FMT.int(overSpare) + ' spare pieces from ' + overSites.length + ' sites to short sites',
        owner: 'Lindström', benefit: 'Fewer shortages, no extra cost',
        evidence: 'Allocation vs scans (Service_Activity), 12-month average', status: 'CALCULATED',
        opportunity: 'Trust builder that protects the renewal', sites: overSites
      });
    }
    if (under.length) {
      signals.push({
        id: 'under', group: 'Fix', themes: ['service', 'hygiene', 'safety'], severity: Math.min(10, under.length / 3 + 2),
        kamTitle: 'Under-supply at ' + underSites.length + ' sites',
        kamBody: under.length + ' site and product combinations have fewer than ' + S.underThreshold + ' piece per wearer. Lowest: ' + siteName(worstUnder.site_id) + ' ' + PRODUCTS[worstUnder.product_id].product_name.toLowerCase() + ' at ' + worstUnder.perWearer.toFixed(2) + '. About ' + FMT.int(underPieces) + ' pieces needed to reach the threshold.',
        custTitle: 'Some teams are short of garments',
        custBody: 'At ' + underSites.length + ' sites, some products have fewer pieces than people wearing them, which leads to sharing or longer wear between washes. We recommend topping these up, starting with ' + siteName(worstUnder.site_id) + '.',
        action: 'Top up shortages at ' + underSites.length + ' sites (about ' + FMT.int(underPieces) + ' pieces)',
        owner: 'Jointly', benefit: 'No sharing of garments',
        evidence: 'Allocated pieces vs active wearers per product (Service_Activity)', status: 'CALCULATED · DEMO THRESHOLD',
        opportunity: 'About ' + FMT.int(underPieces) + ' additional pieces', sites: underSites
      });
    }
    var fitGaps = siteRows.filter(function (r) { return r.flags.indexOf('Product fit') !== -1; });
    if (fitGaps.length) {
      var byType = groupBy(fitGaps, 'type');
      var parts = Object.keys(byType).map(function (t) { return byType[t].length + ' ' + t.toLowerCase() + (byType[t].length > 1 ? 's' : ''); });
      var needs = uniq(fitGaps.map(function (r) { return PRODUCTS[SITE_TYPE_NEEDS[r.type].product].product_name; }));
      signals.push({
        id: 'fit', group: 'Grow', themes: ['safety', 'service'], severity: Math.min(10, fitGaps.length / 2 + 2),
        kamTitle: 'Product fit: ' + fitGaps.length + ' sites without ' + needs.join(' or ').toLowerCase(),
        kamBody: parts.join(' and ') + ' use the same products as offices. ' + needs.join(' and ') + ' are in the catalogue but not in use there.',
        custTitle: 'Check protection at ' + parts.join(' and '),
        custBody: 'These sites use the same garments as offices. We suggest a short safety review with your HSE team to see whether ' + needs.join(' or ').toLowerCase() + ' would suit the work better.',
        action: 'Safety review of garments at ' + parts.join(' and '),
        owner: 'Customer HSE + Lindström', benefit: 'Right protection per role',
        evidence: 'Site types (Sites) vs products in use (Service_Activity)', status: 'RULE-BASED',
        opportunity: 'New product lines via safety review', sites: fitGaps.map(function (r) { return r.site_id; })
      });
    }
    if (avoided.length > 1) {
      var worstRepair = avoided.slice().sort(function (a, b) { return b.repairRate - a.repairRate; })[0];
      var bestRepair = avoided.slice().sort(function (a, b) { return a.repairRate - b.repairRate; })[0];
      signals.push({
        id: 'repair', group: 'Grow', themes: ['circularity', 'cost'], severity: 3,
        kamTitle: worstRepair.product + ' needs repair most often',
        kamBody: worstRepair.product + ' has the highest repair rate (' + worstRepair.repairRate.toFixed(2) + '% vs ' + bestRepair.repairRate.toFixed(2) + '% for ' + bestRepair.product.toLowerCase() + '): ' + FMT.int(worstRepair.repairs) + ' repairs in ' + year + '. A more durable model at renewal could lower repair load and refresh the contract.',
        custTitle: 'Review the ' + worstRepair.product.toLowerCase() + ' at the next renewal',
        custBody: 'Your ' + worstRepair.product.toLowerCase() + ' needed repair more often than other garments. At the next renewal we suggest testing a more durable model at one or two sites.',
        action: 'Pilot a more durable ' + worstRepair.product.toLowerCase() + ' at renewal',
        owner: 'Lindström', benefit: 'Longer garment life, fewer repairs',
        evidence: 'Repair quotient by product (Repairs)', status: 'MEASURED',
        opportunity: 'Product upgrade at renewal', sites: []
      });
    }
    var outBand = siteRows.filter(function (r) { return r.utilWeekly < S.utilBand[0] || r.utilWeekly > S.utilBand[1]; });
    if (outBand.length) {
      signals.push({
        id: 'util', group: 'Fix', themes: ['cost', 'hygiene'], severity: 4 + outBand.length,
        kamTitle: outBand.length + ' sites outside the ' + S.utilBand[0] + ' to ' + S.utilBand[1] + '% utilization band',
        kamBody: outBand.map(function (r) { return r.city + ' ' + FMT.pct(r.utilWeekly); }).join(', ') + '. Too high suggests too few garments; too low suggests garments are not being washed.',
        custTitle: 'Utilization outside the healthy range at ' + outBand.length + ' sites',
        custBody: 'At ' + outBand.map(function (r) { return r.city; }).join(', ') + ' garments are washed ' + 'more or less often than the healthy range. We suggest adjusting garment quantities there.',
        action: 'Adjust quantities at sites outside the utilization band', owner: 'Lindström', benefit: 'Right number of garments per site',
        evidence: 'Washing % (Service_Activity) ÷ ' + S.weeksPerMonth + ' weeks', status: 'ESTIMATE · DEFINITION TO CONFIRM',
        opportunity: 'Allocation adjustment', sites: outBand.map(function (r) { return r.site_id; })
      });
    }
    signals.push({
      id: 'reporting', group: 'Prepare', themes: ['reporting', 'emissions'], severity: 3,
      kamTitle: 'Workwear footprint ready for their reporting',
      kamBody: 'Offer the footprint pack: ' + FMT.tonnes(allocProc + allocDeliv) + ' CO₂e attributed for ' + year + ', by site, with method. Helps them answer supplier-data requests from their own customers, lenders and tenders.',
      custTitle: 'Your workwear footprint, ready for data requests',
      custBody: 'When your customers, lenders or tender teams ask for supplier emissions data, your ' + year + ' workwear footprint (' + FMT.tonnes(allocProc + allocDeliv) + ' CO₂e, by site, with method) is ready to share. Supporting data, not an audited figure.',
      action: 'Quarterly workwear footprint pack for data requests', owner: 'Lindström', benefit: 'Workwear numbers off your plate',
      evidence: 'Customer_Impacts (allocated by share of washed kg)', status: 'ALLOCATED ESTIMATE',
      opportunity: 'Reporting pack add-on', sites: []
    });
    signals.push({
      id: 'regulation', group: 'Prepare', themes: ['circularity', 'reporting', 'cost'], severity: 2,
      kamTitle: 'Regulatory radar: textile producer fees from 2028',
      kamBody: 'EU textile producer responsibility schemes must be running by 17 April 2028 (Directive (EU) 2025/1892). Owned workwear is likely to get more expensive; with rental, end-of-life handling stays with Lindström. Context only, not legal advice.',
      custTitle: 'What is changing for workwear',
      custBody: 'EU rules on textile waste are tightening, with producer responsibility schemes due by April 2028 (Directive (EU) 2025/1892). With rental, end-of-life handling stays with Lindström. Context only, not legal advice.',
      action: 'Note textile EPR timeline in the renewal discussion', owner: 'Lindström', benefit: 'No end-of-life duties for you',
      evidence: 'Curated public source: Directive (EU) 2025/1892', status: 'CONTEXT',
      opportunity: 'Renewal argument versus buying', sites: [], source: 'https://eur-lex.europa.eu/eli/dir/2025/1892/oj'
    });

    var worstLateSite = sitesSorted('latePct')[0];
    if (worstLateSite && worstLateSite.latePct >= 2.5) {
      signals.push({
        id: 'late', group: 'Fix', themes: ['service'], severity: 3 + worstLateSite.latePct,
        kamTitle: 'Late deliveries concentrated at ' + worstLateSite.city + ' (' + FMT.pct(worstLateSite.latePct, 1) + ')',
        kamBody: 'Overall on-time delivery is strong, but ' + worstLateSite.city + ' has the highest share of late cycles. Check route and laundry capacity before the customer raises it.',
        custTitle: 'Delivery reliability at ' + worstLateSite.city,
        custBody: FMT.pct(worstLateSite.latePct, 1) + ' of cycles at ' + worstLateSite.city + ' were late in ' + year + ', against ' + FMT.pct(100 - (cyc.length ? onTimePct : 100), 1) + ' across all sites. We will review the route and report back.',
        action: 'Route and capacity review for ' + worstLateSite.city, owner: 'Lindström', benefit: 'Reliable deliveries at every site',
        evidence: 'Wash-cycle performance flags (Service_Cycles)', status: 'MEASURED', opportunity: 'Protects service reputation', sites: [worstLateSite.site_id]
      });
    }
    var DECISION = {
      hygiene: 'Agree a hygiene follow-up owner at each flagged site',
      spare: 'Approve moving spare garments to short sites',
      under: 'Approve topping up garments at short sites',
      fit: 'Agree the scope of a garment safety review',
      repair: 'Agree pilot sites for a more durable model',
      util: 'Approve quantity adjustments at out-of-band sites',
      late: 'Agree a delivery review and reporting date',
      reporting: 'Agree a quarterly workwear footprint pack',
      regulation: 'Note the 2028 textile EPR timeline in the renewal plan'
    };
    var IMPACT = {
      hygiene: { cost: 'L', sust: 'L', ops: 'H', note: 'Audit risk reduced; wash routine restored' },
      spare: { cost: 'H', sust: 'M', ops: 'M', note: 'About ' + FMT.int(overSpare) + ' pieces reused instead of added' },
      under: { cost: 'L', sust: 'L', ops: 'H', note: 'No sharing of garments at ' + underSites.length + ' sites' },
      fit: { cost: 'L', sust: 'L', ops: 'H', note: 'Right protection per role' },
      repair: { cost: 'M', sust: 'H', ops: 'M', note: 'Fewer repairs and replacements over the garment life' },
      util: { cost: 'M', sust: 'L', ops: 'M', note: 'Right quantities per site' },
      late: { cost: 'L', sust: 'L', ops: 'H', note: 'Fewer service interruptions' },
      reporting: { cost: 'L', sust: 'H', ops: 'M', note: 'Ready answers for supplier-data requests' },
      regulation: { cost: 'M', sust: 'M', ops: 'L', note: 'No end-of-life duties under rental' }
    };
    var pts = { H: 3, M: 2, L: 1 };
    signals.forEach(function (sg) {
      sg.decision = DECISION[sg.id] || sg.action;
      sg.impact = IMPACT[sg.id] || { cost: 'L', sust: 'L', ops: 'L', note: '' };
      sg.valueScore = pts[sg.impact.cost] + pts[sg.impact.sust] + pts[sg.impact.ops];
      sg.escalate = (sg.id === 'hygiene' && gapAssets.length / Math.max(1, trackedAssets) >= 0.2) ||
        (sg.id === 'under' && underSites.length >= 10) || (sg.id === 'util' && outBand.length >= 3) ||
        (sg.id === 'late' && worstLateSite.latePct >= 3);
      sg.kind = (sg.group === 'Fix' || sg.id === 'under') ? 'risk' : sg.id === 'regulation' ? 'upcoming' : 'opportunity';
      if (sg.id === 'spare') { sg.kind = 'opportunity'; }
    });

    // --- trust facts (Build trust step) ---
    var inBand = siteRows.filter(function (r) { return r.utilWeekly >= S.utilBand[0] && r.utilWeekly <= S.utilBand[1]; }).length;
    var worstLate = worstLateSite;

    return {
      settings: S, year: year, lastMonth: lastMonth, customer: customer, priorities: priorities,
      industryPriorities: industryPriorities, sites: siteRows, countries: countries,
      kpis: {
        sites: sites.length, wearersDec: wearersDec, wearersRowSum: wearersRowSum, allocatedDec: allocatedDec,
        scannedDec: scannedDec, scanShare: allocatedDec ? scannedDec / allocatedDec * 100 : 0, washedKg: washedKg,
        washedPieces: washedPieces, repairs: repairs, serviceRequests: serviceRequests, cycles: cyc.length,
        onTimePct: onTimePct, avgCycleHours: avgCycleHours, utilWeekly: utilWeekly, trackedAssets: trackedAssets,
        medianGapDays: medianGap, sitesInBand: inBand, worstLateSite: worstLate
      },
      value: {
        baseline: { id: base.baseline_id, name: base.baseline_name, note: base.assumption_note },
        savings: savings, allBaselines: allBaselines,
        footprint: { co2: allocProc + allocDeliv, process: allocProc, delivery: allocDeliv, water: allocWater, energy: allocEnergy, waterPerKg: allocWater / impKg },
        avoided: avoided, avoidedFull: avoidedFull, avoidedSelected: avoidedFull * S.repairShare,
        avoidedLow: avoidedFull * 0.5, avoidedBase: avoidedFull * 0.75, avoidedHigh: avoidedFull,
        avoidedProductKg: avoidedProductKg * S.repairShare, topRepairTypes: topRepairTypes,
        waste: { total: allocWaste, routes: wasteRoutes }
      },
      supply: { under: under, over: over, underPieces: underPieces, overSpare: overSpare, underSites: underSites, overSites: overSites },
      hygiene: { gapAssets: gapAssets.length, trackedAssets: trackedAssets, top: hygieneTop },
      signals: signals
    };
  }

  // Rank signals for the people in the room: KAM focus themes count most, then the customer's own
  // stated priorities, then the industry default.
  function rankSignals(result, focusThemes, audienceThemes) {
    audienceThemes = audienceThemes || [];
    var custThemes = themesFromText(result.priorities.join(' '));
    var indThemes = themesFromText(result.industryPriorities.map(function (p) { return p.priority_theme; }).join(' '));
    focusThemes = focusThemes || [];
    return result.signals.map(function (s) {
      var score = s.severity;
      var why = [];
      s.themes.forEach(function (t) {
        if (audienceThemes.indexOf(t) !== -1) { score += 10; why.push('matters to this counterpart: ' + t); }
        if (focusThemes.indexOf(t) !== -1) { score += 6; why.push('KAM focus: ' + t); }
        if (custThemes.indexOf(t) !== -1) { score += 3; why.push('customer priority: ' + t); }
        if (indThemes.indexOf(t) !== -1) { score += 1.5; }
      });
      return Object.assign({}, s, { score: score, why: uniqStr(why) });
    }).sort(function (a, b) { return b.score - a.score; });
  }
  function uniqStr(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  var META = window.LVR_DATA.meta || {};
  function fmtDate(iso) {
    if (!iso) { return 'unknown'; }
    var d = new Date(iso + 'T00:00:00');
    return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtMonth(ym) {
    var p = String(ym || '').split('-');
    return p.length < 2 ? '' : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] + ' ' + p[0];
  }
  META.updatedLabel = fmtDate(META.sourceLastUpdated);
  META.periodLabel = fmtMonth(META.periodStart) + ' to ' + fmtMonth(META.periodEnd);

  window.LVR = { META: META,
    DB: DB, PRODUCTS: PRODUCTS, SITES: SITES, FMT: FMT, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    THEME_WORDS: THEME_WORDS, themesFromText: themesFromText,
    computeCustomer: computeCustomer, rankSignals: rankSignals
  };
})();

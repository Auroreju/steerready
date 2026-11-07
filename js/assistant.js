/*
 * Review assistant: works both ways.
 *
 *  1. KAM -> assistant: the KAM shares what they know about the customer (their own
 *     knowledge, or notes pasted from the CRM). The assistant stores it as account
 *     knowledge and turns it into settings: who to lead with, focus themes and sites,
 *     comparison baseline, assumptions and KAM-entered value lines.
 *  2. Assistant -> KAM / customer: it answers questions using only numbers from the
 *     calculation engine (calc.js), and always says how a number was made.
 *
 * Runs fully offline with rules. To use a language model later, define
 * window.LVR_LLM (see README); the app will call it first and fall back to these rules.
 */
(function () {
  'use strict';
  var L = window.LVR;
  var F = L.FMT;

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  }
  function has(t, words) { return words.some(function (w) { return t.indexOf(w) !== -1; }); }

  var AUDIENCES = {
    cfo: { label: 'CFO / finance', short: 'CFO', words: ['cfo', 'finance director', 'chief financial', 'ceo', 'managing director', 'board'], themes: ['cost', 'reporting'] },
    procurement: { label: 'Procurement', short: 'Procurement', words: ['procurement', 'purchasing', 'buyer', 'category manager', 'cost-reduction', 'cost reduction', 'budget'], themes: ['cost'] },
    quality: { label: 'Quality & HSE', short: 'Quality & HSE', words: ['hse', 'quality', 'audit', 'infection', 'food safety', 'safety manager', 'hygiene manager'], themes: ['hygiene', 'safety'] },
    operations: { label: 'Site operations', short: 'Operations', words: ['site manager', 'plant manager', 'operations', 'plant director', 'shortage', 'turnaround', 'hospital director'], themes: ['service'] },
    sustainability: { label: 'Sustainability', short: 'Sustainability', words: ['sustainab', 'esg', 'questionnaire', 'co2', 'scope 3', 'tender', 'environmental'], themes: ['emissions', 'reporting'] }
  };

  var QUESTION_START = ['how', 'what', 'why', 'which', 'where', 'when', 'who', 'can ', 'could', 'should', 'is ', 'are ', 'do ', 'does', 'show', 'compare', 'summar', 'give', 'prepare', 'list', 'explain', 'tell me'];
  function isQuestion(t) {
    return /\?\s*$/.test(t) || QUESTION_START.some(function (w) { return t.indexOf(w) === 0; });
  }

  function findSites(t, result) {
    return result.sites.filter(function (s) { return t.indexOf(norm(s.city)) !== -1; });
  }
  function findCountry(t, result) {
    var map = { finland: 'Finland', finnish: 'Finland', sweden: 'Sweden', swedish: 'Sweden', poland: 'Poland', polish: 'Poland' };
    var hit = Object.keys(map).filter(function (k) { return t.indexOf(k) !== -1; })[0];
    if (!hit) { return null; }
    var c = map[hit];
    return result.countries[c] ? c : null;
  }

  function impactStatement(r) {
    var v = r.value;
    return 'In ' + r.year + ', ' + r.customer.customer_name + ' and Lindström kept ' + F.int(r.kpis.repairs) +
      ' garments in use through repair and cut workwear emissions by an estimated ' + F.tonnes(v.savings.co2) +
      ' CO₂e compared with ' + v.baseline.name.toLowerCase() + ', across ' + r.kpis.sites + ' sites' +
      (Object.keys(r.countries).length > 1 ? ' in ' + Object.keys(r.countries).length + ' countries.' : '.');
  }

  function methodFor(t, r) {
    var v = r.value, k = r.kpis, S = r.settings;
    if (has(t, ['avoid', 'purchase', 'money', 'saving', '€', 'euro', 'saved'])) {
      return 'Avoided replacement purchases = repairs × product purchase price × share of repairs assumed to replace a new item (now ' + Math.round(S.repairShare * 100) + '%).\n' +
        v.avoided.map(function (a) { return '• ' + a.product + ': ' + F.int(a.repairs) + ' × €' + a.unitCost; }).join('\n') +
        '\n= ' + F.eur(v.avoidedFull) + ' at 100%, ' + F.eur(v.avoidedSelected) + ' at ' + Math.round(S.repairShare * 100) + '%.\nPrices are illustrative, not contract prices. Rental fees are not included, so this is not net savings. Status: ESTIMATE.';
    }
    if (has(t, ['co2', 'emission', 'carbon', 'footprint'])) {
      return 'CO₂e avoided = washed kg × (' + v.baseline.name.toLowerCase() + ' process + delivery factor) − this customer\'s allocated share of Lindström laundry and delivery emissions.\n' +
        F.int(k.washedKg) + ' kg washed; Lindström footprint ' + F.tonnes(v.footprint.co2) + ' (process ' + F.tonnes(v.footprint.process) + ', delivery ' + F.tonnes(v.footprint.delivery) + ').\nAllocation is by share of washed kg in each laundry. Status: CALCULATED, ALLOCATED.';
    }
    if (has(t, ['water'])) {
      return 'Water saved = washed kg × baseline litres per kg − allocated Lindström water use. Lindström used about ' + F.one(v.footprint.waterPerKg) + ' L per kg in ' + r.year + '. Status: CALCULATED, ALLOCATED.';
    }
    if (has(t, ['waste', 'recycl'])) {
      return 'Textile waste is measured per laundry and allocated to this customer by share of washed kg, then split by that laundry\'s treatment routes (recycling, reuse, energy recovery, incineration). Status: ALLOCATED ESTIMATE.';
    }
    if (has(t, ['utiliz', 'utilis'])) {
      return 'Weekly utilization = monthly washing % (washed pieces ÷ allocated pieces) ÷ ' + S.weeksPerMonth + ' weeks. Healthy band ' + S.utilBand[0] + ' to ' + S.utilBand[1] + '%. Definition to confirm with Lindström.';
    }
    if (has(t, ['wearer', 'people'])) {
      return 'Active wearers are counted once per site: the largest product row in December, not the sum of all product rows (summing would count one person several times: ' + F.int(k.wearersRowSum) + ' instead of ' + F.int(k.wearersDec) + ').';
    }
    if (has(t, ['hygiene', 'wash gap', 'not washed', '90'])) {
      return 'For each RFID-tracked garment we find the longest gap between two pickups. A gap above ' + S.hygieneDays + ' days is flagged. ' + F.int(r.hygiene.gapAssets) + ' of ' + F.int(r.hygiene.trackedAssets) + ' tracked garments were flagged. The threshold is editable.';
    }
    return null;
  }

  function siteDetail(s, r, customerMode) {
    var S = r.settings;
    var lines = [s.name + ' (' + s.type.toLowerCase() + ', ' + s.country + '): ' + F.int(s.wearers) + ' wearers, ' + F.int(s.allocated) + ' garments, ' + F.tonnes(s.washedKg) + ' washed in ' + r.year + '.'];
    lines.push('• Garments with a ' + S.hygieneDays + '+ day wash gap: ' + F.pct(s.hygienePct) + ' of ' + s.trackedAssets + ' tracked');
    lines.push('• Lowest pieces per wearer: ' + s.minPerWearer.toFixed(2) + (s.minPerWearer < S.underThreshold ? ' (below ' + S.underThreshold + ')' : ''));
    lines.push('• Weekly utilization: ' + F.pct(s.utilWeekly) + ' (band ' + S.utilBand[0] + ' to ' + S.utilBand[1] + '%)');
    lines.push('• Late deliveries: ' + F.pct(s.latePct, 1) + ' · repairs: ' + F.int(s.repairs));
    if (s.hygienePct > 30) {
      lines.push(customerMode
        ? 'The scan data shows the gap, not the reason. Common causes worth checking together: garments kept in personal lockers, spares not in use, or return points far from changing rooms.'
        : 'The scan data shows the gap, not the cause. Suggest a site walk-through before the meeting; likely causes are lockers, unused spares or badly placed return points.');
    }
    return lines.join('\n');
  }

  function topSites(r, n) {
    return r.sites.slice().sort(function (a, b) { return b.attention - a.attention; }).slice(0, n || 3);
  }

  function planText(ranked, customerMode) {
    return ranked.slice(0, 5).map(function (s, i) { return (i + 1) + '. ' + s.action + (customerMode ? ' (' + s.benefit.toLowerCase() + ')' : '') + '.'; }).join('\n');
  }

  function summary(r, customerMode) {
    var k = r.kpis, v = r.value;
    return (customerMode ? 'Your ' : r.customer.customer_name + ' · ') + r.year + ' in brief:\n' +
      '• ' + F.int(k.wearersDec) + ' people kept dressed across ' + k.sites + ' sites\n' +
      '• ' + F.tonnes(k.washedKg) + ' washed, ' + F.pct(k.onTimePct, 1) + ' delivered on time\n' +
      '• ' + F.int(k.repairs) + ' repairs: ' + F.eur(v.avoidedLow) + ' to ' + F.eur(v.avoidedHigh) + ' in avoided purchases (estimate)\n' +
      '• ' + F.tonnes(v.savings.co2) + ' CO₂e and ' + F.litres(v.savings.water) + ' of water saved vs ' + v.baseline.name.toLowerCase();
  }

  /**
   * Handle one message. Returns { reply, changes } where changes is a partial
   * state update the app applies (knowledge, focus, settings, value lines...).
   */
  function handle(message, ctx) {
    var raw = String(message || '').trim();
    var t = norm(raw);
    var r = ctx.result, st = ctx.state, ranked = ctx.ranked;
    var meeting = st.mode === 'meeting';
    var changes = {};
    var out = [];
    if (!t) { return { reply: '', changes: changes }; }

    var sitesHit = findSites(t, r);
    var countryHit = findCountry(t, r);

    if (has(t, ['brief me', '30-second', '30 second', 'before i walk in', 'quick brief', 'elevator'])) {
      return { reply: window.LVR_VIEWS ? window.LVR_VIEWS.brief(r, ranked, st) : summary(r, false), changes: changes };
    }

    if (has(t, ['last updated', 'how old', 'how recent', 'data from', 'when was the data', 'up to date', 'data date'])) {
      return { reply: 'This review uses data for ' + L.META.periodLabel + '. The dataset was last updated on ' + L.META.updatedLabel + ' (' + (L.META.sourceFile || 'data pack') + '). It is an annual snapshot, not a live feed.', changes: changes };
    }

    // ---------- questions ----------
    if (isQuestion(t) || meeting) {
      if (/^(hi|hello|hey|moi|hei)\b/.test(t) && t.length < 20) {
        return { reply: 'Hi! Ask me about ' + r.customer.customer_name + '\'s ' + r.year + ' value, any site, deliveries, hygiene, repairs or next year\'s focus.', changes: changes };
      }
      if (has(t, ['in finnish', 'in swedish', 'in polish', 'suomeksi', 'pa svenska', 'translate'])) {
        return { reply: 'For now I answer in English. Multilingual answers come with the language-model connection (see README).', changes: changes };
      }
      var other = L.DB.Customers.filter(function (c) { return c.customer_id !== r.customer.customer_id && t.indexOf(norm(c.customer_name.split(' ')[0])) !== -1; })[0];
      if (other) { return { reply: 'I am set up for ' + r.customer.customer_name + '. To review ' + other.customer_name + ', switch customer in the top bar.', changes: changes }; }
      var metricMap = [['repair', 'repairs', 'repairs'], ['wearer', 'wearers', 'wearers'], ['late', 'latePct', '% late'], ['hygiene', 'hygienePct', '% with long wash gaps'], ['wash gap', 'hygienePct', '% with long wash gaps'], ['washed', 'washedKg', 'kg washed'], ['garment', 'allocated', 'garments'], ['utiliz', 'utilWeekly', '% weekly utilization']];
      if (has(t, ['top ', 'most ', 'highest', 'largest', 'biggest', 'lowest', 'least', 'rank']) && has(t, ['site'])) {
        var mm = metricMap.filter(function (m) { return t.indexOf(m[0]) !== -1; })[0];
        if (mm) {
          var asc = has(t, ['lowest', 'least']);
          var n = parseInt((t.match(/\b(\d{1,2})\b/) || [])[1] || '3', 10);
          var list = r.sites.slice().sort(function (a, b2) { return asc ? a[mm[1]] - b2[mm[1]] : b2[mm[1]] - a[mm[1]]; }).slice(0, Math.min(10, n));
          return { reply: (asc ? 'Lowest ' : 'Top ') + list.length + ' sites by ' + mm[2] + ':\n' + list.map(function (x, i) { var v = x[mm[1]]; return (i + 1) + '. ' + x.city + ': ' + (mm[1] === 'washedKg' ? F.tonnes(v) : /Pct|util/i.test(mm[1]) ? F.pct(v, 1) : F.int(v)); }).join('\n'), changes: changes };
        }
      }
      if (has(t, ['month', 'trend', 'over the year', 'seasonal', 'busiest', 'quietest', 'peak']) && !has(t, ['priorit', 'risk', 'opportunit', 'decision', 'outcome'])) {
        var act = L.DB.Service_Activity.filter(function (x) { return x.customer_id === r.customer.customer_id; });
        var byM = {};
        act.forEach(function (x) { byM[x.month] = (byM[x.month] || 0) + x.customer_washed_kg; });
        var ms = Object.keys(byM).sort();
        var top = ms.slice().sort(function (a, b2) { return byM[b2] - byM[a]; });
        var cyc = L.DB.Service_Cycles.filter(function (x) { return x.customer_id === r.customer.customer_id; });
        var half = function (h) { var c = cyc.filter(function (x) { return (String(x.pickup_timestamp).slice(5, 7) <= '06') === (h === 1); }); return c.filter(function (x) { return x.performance_flag === 'ON_TIME'; }).length / Math.max(1, c.length) * 100; };
        var mn = function (m) { return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m.slice(5, 7) - 1]; };
        top = top.map(mn);
        byM = Object.keys(byM).reduce(function (o, k) { o[mn(k)] = byM[k]; return o; }, {});
        return { reply: 'Over ' + r.year + ': busiest month ' + top[0] + ' (' + F.tonnes(byM[top[0]]) + ' washed), quietest ' + top[top.length - 1] + ' (' + F.tonnes(byM[top[top.length - 1]]) + '). On-time delivery ' + F.pct(half(1), 1) + ' in the first half vs ' + F.pct(half(2), 1) + ' in the second half.', changes: changes };
      }
      if (has(t, ['energy'])) {
        return { reply: F.int(r.value.savings.energy) + ' kWh of energy saved vs ' + r.value.baseline.name.toLowerCase() + ' in ' + r.year + ' (allocated estimate).', changes: changes };
      }
      if (has(t, ['what does', 'what is meant', 'mean by', 'definition', 'define'])) {
        var mdef = methodFor(t, r);
        if (mdef) { return { reply: mdef, changes: changes }; }
      }
      // the five steering-committee questions
      var L3 = { H: 'high', M: 'medium', L: 'low' };
      if (has(t, ['risk', 'issue', 'escalat', 'unresolved', 'commitment', 'intervention', 'problem'])) {
        var esc2 = r.signals.filter(function (x) { return x.kind === 'risk' && x.escalate; });
        var cm = st.commitments || (window.LVR_CRM_COMMITMENTS || {})[r.customer.customer_id] || [];
        var open = cm.filter(function (c) { return c.status !== 'Done'; });
        return { reply: (esc2.length ? 'Needs a steering decision:\n' + esc2.map(function (x) { return '• ' + (meeting ? x.custTitle : x.kamTitle) + ' → ' + x.decision; }).join('\n') : 'No issue above the escalation thresholds.') +
          (open.length ? '\nOpen commitments from the last meeting:\n' + open.map(function (c) { return '• ' + c.text + ' (' + c.owner + ', due ' + c.due + ', ' + c.status.toLowerCase() + ')'; }).join('\n') : ''), changes: changes };
      }
      if (has(t, ['opportunit', 'expansion', 'improvement', 'improve value', 'strongest value'])) {
        var opp = r.signals.filter(function (x) { return x.kind === 'opportunity'; }).sort(function (x, y) { return y.valueScore - x.valueScore; }).slice(0, 3);
        return { reply: 'Strongest opportunities (cost / sustainability / operations):\n' + opp.map(function (x, i) { return (i + 1) + '. ' + (meeting ? x.custTitle : x.kamTitle) + ': ' + L3[x.impact.cost] + ' / ' + L3[x.impact.sust] + ' / ' + L3[x.impact.ops] + '. ' + x.impact.note + '.'; }).join('\n'), changes: changes };
      }
      if (has(t, ['decision', 'who owns', 'owner', 'by when', 'deadline', 'agree today'])) {
        var acts = st.actions || [];
        if (acts.length) { return { reply: 'Decisions prepared for today:\n' + acts.map(function (x, i) { return (i + 1) + '. ' + (x.decision || x.text) + ' · ' + x.owner + (x.due ? ' · by ' + x.due : ''); }).join('\n'), changes: changes }; }
        var sug = r.signals.filter(function (x) { return x.kind === 'risk' && x.escalate; }).concat(r.signals.filter(function (x) { return x.kind === 'opportunity'; }).sort(function (x, y) { return y.valueScore - x.valueScore; }).slice(0, 2));
        return { reply: 'No decisions prepared yet. Suggested:\n' + sug.map(function (x, i) { return (i + 1) + '. ' + x.decision + ' (' + x.owner + ')'; }).join('\n') + '\nUse "Suggest decisions" on the Decisions page to add them with owners and dates.', changes: changes };
      }
      if (has(t, ['priorit'])) {
        return { reply: 'Stated priorities: ' + r.priorities.join(', ') + '.' + (st.knowledge && st.knowledge.length && !meeting ? '\nFrom the account team: ' + st.knowledge.slice(-3).map(function (k) { return k.text; }).join(' / ') : '') + '\nComing up: ' + r.signals.filter(function (x) { return x.kind === 'upcoming' || x.id === 'reporting'; }).map(function (x) { return meeting ? x.custTitle : x.kamTitle; }).join('; ') + '.', changes: changes };
      }
      if (has(t, ['outcome', 'achieved', 'since the last', 'delivered for us'])) {
        return { reply: summary(r, meeting), changes: changes };
      }
      // honest answers for things the dataset does not contain
      var GAPS = [
        [['spend', 'spent', 'invoice', 'contract value', 'price per', 'how much do we pay', 'what do we pay', 'cost to add', 'cost of adding', 'quote', 'pricing'], 'Prices and contract values are not in this dataset, so I cannot answer that from the data. Your Lindström KAM can prepare a quote. (Production version: connect contract prices from the pricing system.)'],
        [['satisf', 'nps', 'happy with', 'feedback score', 'survey'], 'Customer and wearer satisfaction scores are not in this dataset yet. They are on the list of data to connect for the production version.'],
        [['compliant', 'compliance', 'csrd', 'legal requirement', 'are we required', 'regulation require'], 'I cannot give compliance or legal advice. What I can provide is your workwear footprint (' + F.tonnes(r.value.footprint.co2) + ' CO₂e in ' + r.year + ', by site, with method) as supporting data for your own reporting.'],
        [['lost', 'missing garment', 'stolen', 'disappear'], 'Lost or missing garments are not recorded in this dataset. The closest signal: ' + F.pct(r.kpis.scanShare) + ' of garments were scanned in use in December, and ' + F.int(r.hygiene.gapAssets) + ' tracked garments had a gap of more than ' + r.settings.hygieneDays + ' days between washes.']
      ];
      for (var gi = 0; gi < GAPS.length; gi++) { if (has(t, GAPS[gi][0])) { return { reply: GAPS[gi][1], changes: changes }; } }
      var yrs = (t.match(/20\d\d/g) || []).filter(function (y) { return y !== r.year; });
      if (yrs.length && has(t, ['compare', 'versus', ' vs', 'last year', 'previous', 'change', 'better', 'worse', 'improve'])) {
        return { reply: 'This dataset only covers ' + L.META.periodLabel + ', so I cannot compare with ' + yrs.join(', ') + ' yet. Previous-year data is on the list for the production version.', changes: changes };
      }
      var cs = Object.keys(r.countries).filter(function (c) { return t.indexOf(norm(c)) !== -1 || t.indexOf({ Finland: 'finnish', Sweden: 'swedish', Poland: 'polish' }[c]) !== -1; });
      if (cs.length >= 2 || (cs.length === 1 && has(t, ['compare', 'country', 'how is', 'how are', 'doing']))) {
        var lines2 = (cs.length >= 2 ? cs : Object.keys(r.countries)).map(function (c) {
          var ss = r.sites.filter(function (x) { return x.country === c; });
          var w = ss.reduce(function (a, x) { return a + x.wearers; }, 0);
          var hy = ss.reduce(function (a, x) { return a + x.hygienePct * x.trackedAssets; }, 0) / Math.max(1, ss.reduce(function (a, x) { return a + x.trackedAssets; }, 0));
          var late = ss.reduce(function (a, x) { return a + x.latePct; }, 0) / ss.length;
          var under = ss.filter(function (x) { return x.minPerWearer < r.settings.underThreshold; }).length;
          return '• ' + c + ': ' + ss.length + ' sites, ' + F.int(w) + ' wearers, ' + F.pct(hy) + ' of tracked garments with long wash gaps, ' + F.pct(late, 1) + ' late cycles, ' + under + ' sites short of garments';
        });
        return { reply: 'By country, ' + r.year + ':\n' + lines2.join('\n'), changes: changes };
      }
      if (has(t, ['per person', 'per wearer', 'per employee', 'garments per', 'how many garments do'])) {
        return { reply: 'On average ' + (r.kpis.allocatedDec / r.kpis.wearersDec).toFixed(1) + ' garments per wearer across all products (' + F.int(r.kpis.allocatedDec) + ' garments, ' + F.int(r.kpis.wearersDec) + ' wearers in December). ' + r.supply.underSites.length + ' sites have fewer than ' + r.settings.underThreshold + ' piece per wearer for at least one product; ' + r.supply.overSites.length + ' sites hold spare stock.', changes: changes };
      }
      if (has(t, ['break', 'wear out', 'most repair', 'repaired most', 'which product', 'durab', 'quality of the garment'])) {
        var byRate = r.value.avoided.slice().sort(function (a, b2) { return b2.repairRate - a.repairRate; });
        return { reply: 'Repair rate by product (' + r.year + '):\n' + byRate.map(function (x) { return '• ' + x.product + ': ' + x.repairRate.toFixed(2) + '% of washes, ' + F.int(x.repairs) + ' repairs'; }).join('\n') + '\nMost common repairs: ' + r.value.topRepairTypes.slice(0, 3).map(function (x) { return x.type.toLowerCase(); }).join(', ') + '.', changes: changes };
      }
      if (has(t, ['money', 'save', 'saved', 'saving', 'worth it', 'value for money', 'roi'])) {
        return { reply: 'The data-based saving is avoided replacement purchases: ' + F.eur(r.value.avoidedLow) + ' to ' + F.eur(r.value.avoidedHigh) + ' (base ' + F.eur(r.value.avoidedSelected) + ') from ' + F.int(r.kpis.repairs) + ' repairs. This is before rental fees, so it is not net savings; contract prices are not in this dataset.' + (st.kamValues.length ? ' Your account team also estimates ' + F.eur(st.kamValues.reduce(function (a, v) { return a + v.amount; }, 0)) + ' of additional value.' : ''), changes: changes };
      }
      if (has(t, ['what do you know', 'what have i told', 'account knowledge', 'what do we know'])) {
        if (!st.knowledge.length) { return { reply: 'Nothing stored yet for this account. Tell me what you know, or import notes from the CRM.', changes: changes }; }
        return { reply: 'What I know about ' + r.customer.customer_name + ':\n' + st.knowledge.map(function (k) { return '• [' + k.source + '] ' + k.text; }).join('\n'), changes: changes };
      }
      if (has(t, ['how did you', 'how was', 'how is this calculated', 'how do you calculate', 'calculat', 'where does', 'explain', 'method'])) {
        var m = methodFor(t, r);
        if (m) { return { reply: m, changes: changes }; }
      }
      if (sitesHit.length && (has(t, ['why', 'how is', 'how are', 'what about', 'tell me', 'doing', 'detail']) || isQuestion(t))) {
        return { reply: sitesHit.map(function (s) { return siteDetail(s, r, meeting); }).join('\n\n'), changes: { focusSites: sitesHit.map(function (s) { return s.site_id; }) } };
      }
      if (has(t, ['which site', 'what site', 'where should', 'worst', 'focus on first', 'problem site', 'attention'])) {
        return {
          reply: 'Sites that need the most attention:\n' + topSites(r, 3).map(function (s) {
            return '• ' + s.name + ': ' + (s.flags.length ? s.flags.join(', ') : 'no flags') + ' (wash gaps ' + F.pct(s.hygienePct) + ', lowest pieces per wearer ' + s.minPerWearer.toFixed(2) + ')';
          }).join('\n'), changes: { focusSites: topSites(r, 3).map(function (s) { return s.site_id; }) }
        };
      }
      if (has(t, ['compare', 'versus', ' vs', 'in-house', 'inhouse', 'own laundry', 'home wash', 'wash at home', 'washed at home', 'at home', 'local laundry', 'alternative', 'instead of rent', 'buy our own', 'buying'])) {
        var b = has(t, ['in-house', 'inhouse', 'own laundry', 'buy our own', 'buying']) ? 'B_INHOUSE' : has(t, ['home']) ? 'B_HOME' : has(t, ['local']) ? 'B_LOCAL' : null;
        if (b) { changes.settings = { baseline: b }; }
        return {
          reply: 'Compared with each alternative in ' + r.year + ' (CALCULATED, ALLOCATED):\n' + r.value.allBaselines.map(function (x) {
            return '• ' + x.name + ': ' + F.tonnes(x.values.co2) + ' CO₂e and ' + F.litres(x.values.water) + ' water saved';
          }).join('\n') + '\nNone of these alternatives repairs systematically, so the ' + F.eur(r.value.avoidedLow) + ' to ' + F.eur(r.value.avoidedHigh) + ' in avoided purchases applies to all three.' + (b ? '\nThe value section now uses this comparison.' : ''),
          changes: changes
        };
      }
      if (has(t, ['next year', '2027', '2026', 'improve', 'together', 'plan', 'what should we', 'what next', 'differently', 'future'])) {
        return { reply: (meeting ? 'Suggested focus for next year, based on your data:\n' : 'Proposed actions, ranked for this audience:\n') + planText(ranked, meeting), changes: changes };
      }
      if (has(t, ['discussion point', 'talking point', 'steering', 'prepare', 'agenda', 'five points', '5 points'])) {
        var pts = [summary(r, false).split('\n')[3].replace('• ', 'Proof of value: ')];
        ranked.slice(0, 4).forEach(function (s) { pts.push(s.kamTitle); });
        return { reply: 'Five discussion points:\n' + pts.map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n'), changes: changes };
      }
      if (/\bpr\b/.test(t) || has(t, ['tender', 'linkedin', 'publicity', 'communicat', 'annual report', 'press'])) {
        return { reply: 'Shareable impact story (estimate, not audited; both companies approve the wording before use):\n"' + impactStatement(r) + '"\nUseful for tender answers, the sustainability report or a joint post. The method travels with it.', changes: changes };
      }
      if (has(t, ['value', 'summary', 'overview', 'how did we do', 'how did it go', 'results', 'in brief'])) {
        return { reply: summary(r, meeting), changes: changes };
      }
      if (has(t, ['water'])) { return { reply: F.litres(r.value.savings.water) + ' of water saved vs ' + r.value.baseline.name.toLowerCase() + ' in ' + r.year + '. Lindström used about ' + F.one(r.value.footprint.waterPerKg) + ' L per kg washed.', changes: changes }; }
      if (has(t, ['co2', 'emission', 'carbon', 'footprint'])) { return { reply: 'Workwear footprint with Lindström: ' + F.tonnes(r.value.footprint.co2) + ' CO₂e in ' + r.year + '. That is ' + F.tonnes(r.value.savings.co2) + ' less than ' + r.value.baseline.name.toLowerCase() + '. Status: allocated estimate.', changes: changes }; }
      if (has(t, ['repair'])) { return { reply: F.int(r.kpis.repairs) + ' repairs in ' + r.year + '. Most common: ' + r.value.topRepairTypes.map(function (x) { return x.type.toLowerCase() + ' (' + F.int(x.n) + ')'; }).join(', ') + '. Estimated avoided purchases ' + F.eur(r.value.avoidedLow) + ' to ' + F.eur(r.value.avoidedHigh) + '.', changes: changes }; }
      if (has(t, ['hygiene', 'wash', 'clean'])) { return { reply: 'Median time between pickups for a tracked garment: ' + Math.round(r.kpis.medianGapDays) + ' days. ' + F.int(r.hygiene.gapAssets) + ' of ' + F.int(r.hygiene.trackedAssets) + ' tracked garments had a gap above ' + r.settings.hygieneDays + ' days. Worst sites: ' + r.hygiene.top.map(function (s) { return s.city + ' ' + F.pct(s.hygienePct); }).join(', ') + '.', changes: changes }; }
      if (has(t, ['on time', 'delivery', 'deliveries', 'late', 'turnaround'])) { return { reply: F.pct(r.kpis.onTimePct, 1) + ' of wash cycles delivered on time, average turnaround ' + Math.round(r.kpis.avgCycleHours) + ' hours. Most late cycles: ' + r.kpis.worstLateSite.city + ' (' + F.pct(r.kpis.worstLateSite.latePct, 1) + ').', changes: changes }; }
      if (has(t, ['utiliz', 'utilis', 'too many', 'too few'])) { return { reply: 'Average weekly utilization ' + F.pct(r.kpis.utilWeekly) + '. ' + r.kpis.sitesInBand + ' of ' + r.kpis.sites + ' sites are inside the healthy ' + r.settings.utilBand[0] + ' to ' + r.settings.utilBand[1] + '% band.', changes: changes }; }
      if (meeting && !isQuestion(t)) {
        // statements in meeting mode still get captured
      } else {
        return { reply: 'I can answer from this account\'s ' + r.year + ' data: value created, comparisons (local laundry, in-house, home washing), any site by name, hygiene, repairs, deliveries, utilization, next year\'s focus, discussion points, or how a number was calculated.', changes: changes };
      }
    }

    // ---------- KAM shares knowledge ----------
    var themes = L.themesFromText(t);
    var knowledgeItem = { id: 'k' + Date.now(), text: raw, source: ctx.source || 'KAM', themes: themes, date: new Date().toISOString().slice(0, 10) };
    changes.knowledge = st.knowledge.concat([knowledgeItem]);
    out.push('Noted in account knowledge' + (ctx.source === 'CRM' ? ' (from CRM)' : '') + '.');

    // value line
    var amt = t.replace(/,/g, '').replace(/(\d)\s+(\d{3})/g, '$1$2').match(/(?:€|eur\s*)?\s*(\d+(?:\.\d+)?)\s*(k|m|thousand|million)?\s*(?:€|eur|euro)?/);
    var money = /€|eur|euro|\bk\b|worth|value|risk|cost|save/.test(t);
    if (amt && money && has(t, ['add', 'worth', 'value', 'risk', 'saves', 'saving', 'cost'])) {
      var mult = amt[2] === 'k' || amt[2] === 'thousand' ? 1e3 : amt[2] === 'm' || amt[2] === 'million' ? 1e6 : 1;
      var value = parseFloat(amt[1]) * mult;
      if (value >= 100) {
        var kind = has(t, ['risk', 'audit', 'recall', 'fine', 'incident']) ? 'Risk reduced' : has(t, ['time', 'hours', 'admin']) ? 'Time saved' : 'Cost avoided';
        var label = raw.replace(/^(please\s+)?add\s+/i, '').replace(/€\s*[\d,.\s]+(k|m)?|[\d,.\s]+(k|m)?\s*(€|eur|euro)s?/i, '').replace(/^\s*(of|for)\s+/i, '').trim();
        label = label.charAt(0).toUpperCase() + label.slice(1);
        if (label.length < 4) { label = kind; }
        changes.kamValues = st.kamValues.concat([{ id: 'v' + Date.now(), label: label, amount: value, kind: kind, source: ctx.source || 'KAM' }]);
        out.push('Added a KAM-entered value line: ' + label + ', ' + F.eurFull(value) + ' (' + kind.toLowerCase() + '). It is shown separately from the data-based figures and in the export as "account team estimate".');
      }
    }

    // assumptions
    var share = t.match(/(\d{2,3})\s*%/);
    if (share && has(t, ['repair', 'share', 'assum'])) {
      var p = Math.min(100, Math.max(10, parseInt(share[1], 10)));
      changes.settings = Object.assign({}, changes.settings, { repairShare: p / 100 });
      out.push('Repair assumption set to ' + p + '%: avoided purchases now ' + F.eur(r.value.avoidedFull * p / 100) + '.');
    } else if (has(t, ['conservative', 'already repair', 'repair small', 'repair themselves', 'too high', 'overstat'])) {
      changes.settings = Object.assign({}, changes.settings, { repairShare: 0.5 });
      out.push('Repair assumption lowered to 50%: avoided purchases now ' + F.eur(r.value.avoidedLow) + '.');
    }
    var days = t.match(/(\d{2,3})\s*days?/);
    if (days && has(t, ['hygiene', 'wash', 'flag', 'gap'])) {
      changes.settings = Object.assign({}, changes.settings, { hygieneDays: parseInt(days[1], 10) });
      out.push('Hygiene flag now triggers after ' + days[1] + ' days without a wash.');
    }
    if (has(t, ['in-house', 'inhouse', 'own laundry', 'wash it themselves', 'wash themselves'])) {
      changes.settings = Object.assign({}, changes.settings, { baseline: 'B_INHOUSE' });
      out.push('Comparison switched to an in-house laundry.');
    } else if (has(t, ['home wash', 'wash at home', 'take it home', 'take them home'])) {
      changes.settings = Object.assign({}, changes.settings, { baseline: 'B_HOME' });
      out.push('Comparison switched to home washing.');
    }

    // audience and focus
    var aud = Object.keys(AUDIENCES).filter(function (a) { return has(t, AUDIENCES[a].words); });
    var newThemes = themes.slice();
    aud.forEach(function (a) { newThemes = newThemes.concat(AUDIENCES[a].themes); });
    if (aud.length) {
      changes.audience = aud[0];
      out.push('Leading with what matters to ' + aud.map(function (a) { return AUDIENCES[a].label; }).join(' and ') + '.');
    }
    if (newThemes.length) {
      var merged = st.focusThemes.slice();
      newThemes.forEach(function (th) { if (merged.indexOf(th) === -1) { merged.push(th); } });
      changes.focusThemes = merged;
      out.push('Focus themes: ' + merged.join(', ') + '. Signals and export are re-ranked.');
    }
    if (sitesHit.length || countryHit) {
      var ids = sitesHit.map(function (s) { return s.site_id; });
      if (countryHit) { ids = ids.concat(r.sites.filter(function (s) { return s.country === countryHit; }).map(function (s) { return s.site_id; })); }
      changes.focusSites = ids.filter(function (v, i) { return ids.indexOf(v) === i; });
      out.push('Focus sites: ' + changes.focusSites.map(function (id) { return L.SITES[id].city; }).join(', ') + '.');
    }
    if (out.length === 1) {
      out.push('I did not change any settings. You can also tell me who is attending, what they worry about, a value to add ("add €25,000 of reduced hygiene risk"), or ask a question.');
    }
    return { reply: out.join('\n'), changes: changes };
  }

  // Merge several handle() results (used for CRM import, one note per line).
  function importNotes(lines, ctx) {
    var st = Object.assign({}, ctx.state);
    var all = {};
    var valueLines = 0;
    lines.map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (line) {
      var res = handle(line.replace(/\?$/, '.'), { result: ctx.result, ranked: ctx.ranked, state: Object.assign({}, st, { mode: 'prep' }), source: 'CRM' });
      if (res.changes.kamValues) { valueLines++; }
      Object.keys(res.changes).forEach(function (k) {
        if (k === 'settings') { all.settings = Object.assign({}, all.settings, res.changes.settings); st.settings = Object.assign({}, st.settings, res.changes.settings); }
        else { all[k] = res.changes[k]; st[k] = res.changes[k]; }
      });
    });
    var n = lines.filter(function (l) { return l.trim(); }).length;
    var out = ['Imported ' + n + ' CRM notes into account knowledge.'];
    if (all.audience) { out.push('• Leading with: ' + AUDIENCES[all.audience].label + ' (from the most recent note about attendees)'); }
    if (all.focusThemes) { out.push('• Focus themes: ' + all.focusThemes.join(', ')); }
    if (all.focusSites) { out.push('• Focus sites: ' + all.focusSites.map(function (id) { return L.SITES[id].city; }).join(', ')); }
    if (all.settings) { out.push('• Assumptions updated: ' + Object.keys(all.settings).join(', ')); }
    if (valueLines) { out.push('• ' + valueLines + ' value line(s) added'); }
    out.push('Check the chips above and remove anything that does not fit.');
    return { reply: out.join('\n'), changes: all };
  }

  window.LVR_ASSISTANT = { handle: handle, importNotes: importNotes, impactStatement: impactStatement, AUDIENCES: AUDIENCES, summary: summary };
})();

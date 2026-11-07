/* Customer Value Review: app state, rendering and interaction. */
(function () {
  'use strict';
  var L = window.LVR, A = window.LVR_ASSISTANT, V = window.LVR_VIEWS, F = L.FMT, I = window.LVR_ICONS;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- state ----------
  var STORE_KEY = 'lvr:v3:';
  var state = { customerId: 'CUST001', view: 'kam', mode: 'prep', page: 'overview', drawer: false, ui: { expanded: null, sort: 'attention', dir: -1, country: 'all' }, acct: null };
  var result, ranked;

  function freshAccount() {
    return { settings: {}, knowledge: [], kamValues: [], actions: [], focusThemes: [], audience: null, focusSites: [], messages: [], storyEdited: null, dashboards: [] };
  }
  function load(id) {
    try { var raw = window.localStorage.getItem(STORE_KEY + id); if (raw) { return Object.assign(freshAccount(), JSON.parse(raw)); } } catch (e) { /* storage unavailable */ }
    return freshAccount();
  }
  function save() {
    try { window.localStorage.setItem(STORE_KEY + state.customerId, JSON.stringify(state.acct)); } catch (e) { /* ignore */ }
  }
  function compute() {
    result = L.computeCustomer(state.customerId, state.acct.settings);
    ranked = L.rankSignals(result, state.acct.focusThemes, A.AUDIENCES[V.audienceOf(state.acct)].themes);
  }
  function applyChanges(ch) {
    var a = state.acct;
    Object.keys(ch || {}).forEach(function (k) {
      if (k === 'settings') { a.settings = Object.assign({}, a.settings, ch.settings); }
      else { a[k] = ch[k]; }
    });
  }

  function toast(text) {
    var t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  // ---------- assistant ----------
  function greeting() {
    var c = result.customer;
    return state.mode === 'meeting'
      ? 'Meeting mode. I answer in customer-friendly language, using only ' + c.customer_name + '\'s ' + result.year + ' figures, and I always say how a number was made. You can still note feedback from the room; I will store it.'
      : 'Hi! Let\'s prepare the ' + result.year + ' review for ' + c.customer_name + ' (' + c.industry + ', ' + result.kpis.sites + ' sites). Tell me what you know: who is attending, what they care about, anything from the CRM, or value you know of that the data cannot see. I will reorder the review and adjust assumptions. You can overrule everything.';
  }
  function quickPrompts() {
    var worstHyg = result.hygiene.top[0];
    var top = result.sites.slice().sort(function (a, b) { return b.attention - a.attention; })[0];
    var countries = Object.keys(result.countries);
    if (state.mode === 'meeting') {
      return ['What outcomes did we achieve?', 'Which issues need a decision today?', 'What are the strongest opportunities?', 'What should we focus on together next year?',
        worstHyg ? 'Why is the hygiene number high in ' + worstHyg.city + '?' : 'How is hygiene?',
        'How does this compare with running our own laundry?', 'Can we use these numbers in tenders and PR?',
        'How did you calculate the avoided purchases?'];
    }
    var p = ['The CFO is joining and thinks buying jackets would be cheaper.',
      'Add €25,000 of reduced hygiene risk at the sites with wash gaps',
      'They already repair small things themselves, so be conservative.'];
    if (countries.length > 1) { p.push('Focus on the ' + { Poland: 'Polish', Sweden: 'Swedish', Finland: 'Finnish' }[countries[countries.length - 1]] + ' sites.'); }
    p.push('How is ' + top.city + ' doing?', 'Prepare five discussion points', 'What do you know about this account?');
    return p;
  }

  function renderAssistant() {
    document.querySelectorAll('[data-action="mode"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === state.mode)); });
    $('modeHint').textContent = state.mode === 'meeting'
      ? 'Answers the customer\'s questions live, from this account\'s data.'
      : 'Brief it with what you know about the customer. Settings below show what it understood.';
    $('chatInput').placeholder = state.mode === 'meeting' ? 'Type the customer\'s question…' : 'e.g. "Hygiene audit in Q2 at the Polish sites"';
    var a = state.acct, chips = [];
    if (a.audience) { chips.push('<span class="chip">Leading with: ' + esc(A.AUDIENCES[a.audience].label) + '<button type="button" data-action="clear-audience" aria-label="Clear audience">×</button></span>'); }
    a.focusThemes.forEach(function (t) { chips.push('<span class="chip theme">' + esc(t) + '<button type="button" data-action="remove-theme" data-value="' + esc(t) + '" aria-label="Remove focus ' + esc(t) + '">×</button></span>'); });
    if (a.focusSites.length) { chips.push('<span class="chip site">Sites: ' + esc(a.focusSites.map(function (id) { return L.SITES[id].city; }).join(', ')) + '<button type="button" data-action="clear-sites" aria-label="Clear focus sites">×</button></span>'); }
    if (!chips.length) { chips.push('<span class="chip muted">Industry default: ' + esc(result.industryPriorities.map(function (p) { return p.priority_theme.toLowerCase(); }).join(', ')) + '</span>'); }
    $('contextChips').innerHTML = chips.join('');
    var msgs = a.messages.length ? a.messages : [{ who: 'assistant', text: greeting() }];
    $('messages').innerHTML = msgs.map(function (m, mi) {
      var who = m.who === 'assistant' ? 'Assistant' : m.who === 'customer' ? 'Question in the meeting' : 'You (KAM)';
      if (m.pending) { return '<div class="msg m-assistant pending"><span class="who">Assistant</span><span class="dots" aria-label="Thinking"><i></i><i></i><i></i></span><span class="as-sub">Looking through the data…</span></div>'; }
      var charts = (m.charts || []).map(function (w, ci) {
        return window.LVR_CHARTS.render(w, runWidget(w), { cls: 'in-chat', compact: true, actions: state.view === 'kam' ? '<button type="button" class="pin" data-action="pin-chart" data-mi="' + mi + '" data-ci="' + ci + '" title="Add to a dashboard">+ Dashboard</button>' : '' });
      }).join('');
      var dash = m.dashboard ? '<button type="button" class="btn btn-line btn-sm open-dash" data-action="go" data-value="dashboards">Open dashboard</button>' : '';
      var body = m.who === 'assistant' ? fmtReply(m.text) : esc(m.text);
      return '<div class="msg m-' + m.who + (charts ? ' has-chart' : '') + '"><span class="who">' + who + (m.source === 'gemini' ? ' <span class="ai-tag">Gemini</span>' : '') + '</span>' + body + charts + dash + '</div>';
    }).join('');
    $('messages').scrollTop = $('messages').scrollHeight;
    $('quick').innerHTML = quickPrompts().map(function (q) { return '<button type="button" data-action="quick" data-msg="' + esc(q) + '">' + esc(q) + '</button>'; }).join('');
    $('knowledgeTitle').textContent = 'Account knowledge (' + a.knowledge.length + ')';
    var ai = $('aiStatus'); if (ai) { ai.textContent = aiLabel(); ai.classList.toggle('on', !!(window.LVR_GEMINI && window.LVR_GEMINI.enabled())); }
    $('chatInput').disabled = busy;
    $('knowledge').innerHTML = a.knowledge.length ? a.knowledge.map(function (k, i) {
      return '<div class="know-item"><span class="src ' + esc(k.source) + '">' + esc(k.source) + '</span><p>' + esc(k.text) + '</p><button type="button" class="icon-btn" data-action="remove-knowledge" data-index="' + i + '" aria-label="Remove note">×</button></div>';
    }).join('') : '<p class="as-sub" style="margin:6px 0">Nothing yet. Tell the assistant what you know, or import CRM notes.</p>';
  }

  var busy = false;
  function aiTools() {
    return {
      applyStatement: function (stmt) {
        var a = state.acct;
        var res = A.handle(stmt, { result: result, ranked: ranked, state: Object.assign({}, a, { mode: state.mode }) });
        applyChanges(res.changes); save(); compute();
        return res.reply;
      },
      saveDashboard: function (d) {
        var a = state.acct; a.dashboards = a.dashboards || [];
        d.id = 'd' + Date.now(); d.created = new Date().toISOString().slice(0, 10);
        a.dashboards.unshift(d); save();
        return d.id;
      },
      goPage: function (page) { state.page = page; state.pendingScrollTop = true; },
      status: function (t) { var el = document.querySelector('#messages .pending .as-sub'); if (el) { el.textContent = t; } }
    };
  }
  function send(text) {
    text = String(text || '').trim();
    if (!text || busy) { return; }
    var a = state.acct;
    if (!a.messages.length) { a.messages.push({ who: 'assistant', text: greeting() }); }
    a.messages.push({ who: state.mode === 'meeting' ? 'customer' : 'kam', text: text });
    var ctx = { result: result, ranked: ranked, state: Object.assign({}, a, { mode: state.mode }) };
    var finish = function (res) {
      busy = false;
      a.messages = a.messages.filter(function (m) { return !m.pending; });
      applyChanges(res.changes);
      var msg = { who: 'assistant', text: res.reply };
      if (res.charts && res.charts.length) { msg.charts = res.charts; }
      if (res.dashboard) { msg.dashboard = res.dashboard; }
      if (res.source) { msg.source = res.source; }
      a.messages.push(msg);
      save(); compute();
      if (state.pendingScrollTop) { state.pendingScrollTop = false; renderAll(); window.scrollTo(0, 0); }
      else { state.keepScroll = true; renderAll(); }
    };
    var G = window.LVR_GEMINI;
    if (typeof window.LVR_LLM === 'function' && (!G || G.enabled())) {
      busy = true;
      a.messages.push({ who: 'assistant', pending: true, text: '' });
      state.keepScroll = true; renderAll();
      Promise.resolve(window.LVR_LLM({ message: text, mode: state.mode, result: result, ranked: ranked, account: a, tools: aiTools() }))
        .then(function (out) {
          if (!out) { throw new Error('empty'); }
          finish(typeof out === 'string' ? { reply: out, changes: {} } : out);
        })
        .catch(function (err) {
          console.warn('AI assistant unavailable, using offline rules:', err);
          var res = A.handle(text, ctx);
          var why = err && err.message && err.message !== 'empty' ? err.message : '';
          res.reply += '\n\n(Offline answer, because Gemini did not respond' + (why ? ': ' + why : '') + '. ' + (/daily/.test(why) ? 'The AI answers return when the key\'s daily limit resets.' : 'Try again in a minute.') + ')';
          finish(res);
        });
    } else {
      finish(A.handle(text, ctx));
    }
  }

  // Light formatting for assistant replies: escape, then **bold** and "- " bullets.
  function fmtReply(t) {
    var lines = esc(t).split('\n'), html = '', inList = false;
    lines.forEach(function (ln) {
      var m = ln.match(/^\s*(?:[-*\u2022]|\d+\.)\s+(.*)$/);
      if (m) { if (!inList) { html += '<ul class="md">'; inList = true; } html += '<li>' + m[1] + '</li>'; return; }
      if (inList) { html += '</ul>'; inList = false; }
      html += ln + '\n';
    });
    if (inList) { html += '</ul>'; }
    return html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n+$/, '');
  }
  function aiScope() { return { customerId: state.customerId, allowAllCustomers: state.mode !== 'meeting' }; }
  function runWidget(w) {
    try { return window.LVR_QUERY.run(w.query, aiScope()); } catch (e) { return { error: e.message }; }
  }
  function aiLabel() {
    var G = window.LVR_GEMINI;
    if (!G) { return 'Offline rules'; }
    var c = G.config();
    return G.enabled() ? 'AI: ' + c.model.replace(/^gemini-/, 'Gemini ').replace(/-/g, ' ') : 'Offline rules';
  }

  // ---------- content ----------
  function status(s) {
    var key = /KAM/.test(s) ? 'KAM' : /ESTIMATE/.test(s) ? 'ESTIMATE' : /ALLOCATED/.test(s) ? 'ALLOCATED' : /CALCULATED/.test(s) ? 'CALCULATED' : /MEASURED/.test(s) ? 'MEASURED' : /RULE/.test(s) ? 'RULE' : 'CONTEXT';
    return '<span class="status st-' + key + '">' + esc(s) + '</span>';
  }
  function tile(label, num, note, st, cls) {
    return '<div class="tile ' + (cls || '') + '"><span class="label">' + label + '</span><span class="num">' + num + '</span><span class="note">' + note + '</span>' + (st ? status(st) : '') + '</div>';
  }
  function kamTotal() { return state.acct.kamValues.reduce(function (s, v) { return s + v.amount; }, 0); }

  function secLookBack() {
    var r = result, k = r.kpis, c = r.customer;
    var countries = Object.keys(r.countries);
    var maxW = 0, byCountry = countries.map(function (cn) {
      var ss = r.sites.filter(function (s) { return s.country === cn; });
      var w = ss.reduce(function (t, s) { return t + s.wearers; }, 0); maxW = Math.max(maxW, w);
      return { c: cn, n: ss.length, w: w };
    });
    var sorted = r.sites.slice();
    var key = state.ui.sort, dir = state.ui.dir;
    sorted.sort(function (a, b) { var x = a[key], y = b[key]; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir; });
    if (state.ui.country !== 'all') { sorted = sorted.filter(function (s) { return s.country === state.ui.country; }); }
    var focus = state.acct.focusSites;
    var NUMS = ['wearers', 'allocated', 'hygienePct', 'minPerWearer', 'utilWeekly', 'latePct', 'repairs'];
    var head = function (k2, label) { return '<th scope="col"' + (NUMS.indexOf(k2) !== -1 ? ' class="num"' : '') + '><button type="button" data-action="sort" data-value="' + k2 + '">' + label + (state.ui.sort === k2 ? (state.ui.dir < 0 ? ' ↓' : ' ↑') : '') + '</button></th>'; };
    var S = r.settings;
    var rows = sorted.map(function (s) {
      var open = state.ui.expanded === s.site_id;
      var row = '<tr class="site-row' + (focus.indexOf(s.site_id) !== -1 ? ' focus' : '') + '" data-action="toggle-site" data-value="' + s.site_id + '" aria-expanded="' + open + '">' +
        '<td><b>' + esc(s.city) + '</b><br><span class="as-sub">' + esc(s.type) + '</span></td><td>' + esc(s.country) + '</td><td class="num">' + F.int(s.wearers) + '</td><td class="num">' + F.int(s.allocated) + '</td>' +
        '<td class="num ' + (s.hygienePct > 30 ? 'warn' : '') + '">' + F.pct(s.hygienePct) + '</td>' +
        '<td class="num ' + (s.minPerWearer < S.underThreshold ? 'warn' : '') + '">' + s.minPerWearer.toFixed(2) + '</td>' +
        '<td class="num ' + (s.utilWeekly < S.utilBand[0] || s.utilWeekly > S.utilBand[1] ? 'warn' : 'ok') + '">' + F.pct(s.utilWeekly) + '</td>' +
        '<td class="num">' + F.pct(s.latePct, 1) + '</td><td class="num">' + F.int(s.repairs) + '</td>' +
        '<td>' + (s.flags.length ? s.flags.map(function (f) { return '<span class="flag">' + esc(f) + '</span>'; }).join('') : '<span class="ok">No flags</span>') + '</td></tr>';
      if (open) {
        row += '<tr class="detail"><td colspan="10"><div class="grid g4">' +
          '<div><b>Products in use</b><br>' + s.supply.map(function (p) { return esc(p.product) + ': ' + p.perWearer.toFixed(2) + ' per wearer'; }).join('<br>') + '</div>' +
          '<div><b>Washed in ' + r.year + '</b><br>' + F.tonnes(s.washedKg) + '<br>Garments scanned in use: ' + F.pct(s.scanShare) + '</div>' +
          '<div><b>Hygiene tracking</b><br>' + s.trackedAssets + ' RFID-tracked garments<br>' + F.pct(s.hygienePct) + ' with a ' + S.hygieneDays + '+ day gap</div>' +
          '<div><b>Footprint</b><br>' + F.tonnes(s.co2Kg) + ' CO₂e allocated<br>' + s.serviceRequests + ' service requests</div>' +
          '</div><div class="as-row no-print" style="margin-top:10px"><button type="button" class="btn btn-line btn-sm" data-action="ask-site" data-value="' + esc(s.city) + '">Ask the assistant about ' + esc(s.city) + '</button></div></td></tr>';
      }
      return row;
    }).join('');
    return '<section class="section" id="step1">' +
      '<div class="section-head"><div><span class="eyebrow e1">Sites and usage</span><h2>' + r.year + ' for the whole account</h2>' +
      '<p class="lead">All ' + k.sites + ' delivery sites rolled up to one customer view. Click a site for detail.</p></div></div>' +
      '<div class="meta"><span><b>' + esc(c.customer_name) + '</b></span><span>' + esc(c.industry) + '</span><span>' + esc(c.segment) + '</span><span>HQ ' + esc(c.hq_country) + '</span>' +
      '<span>Customer priorities: ' + r.priorities.map(function (p) { return '<span class="chip muted">' + esc(p) + '</span>'; }).join(' ') + '</span></div>' +
      '<div class="grid g6">' +
      tile('Active wearers (Dec)', F.int(k.wearersDec), 'Counted once per person. Summing product rows would say ' + F.int(k.wearersRowSum) + '.', 'CALCULATED') +
      tile('Garments in circulation', F.int(k.allocatedDec), F.pct(k.scanShare) + ' scanned in use in December', 'MEASURED') +
      tile('Textiles washed', F.tonnes(k.washedKg), F.int(k.cycles) + ' tracked wash cycles', 'MEASURED') +
      tile('Repairs done', F.int(k.repairs), 'Most common: ' + esc(r.value.topRepairTypes.slice(0, 2).map(function (x) { return x.type.toLowerCase(); }).join(', ')), 'MEASURED') +
      tile('Delivered on time', F.pct(k.onTimePct, 1), 'Average turnaround ' + Math.round(k.avgCycleHours) + ' h · ' + F.int(k.serviceRequests) + ' service requests', 'MEASURED') +
      tile('Service utilization (weekly)', F.pct(k.utilWeekly), k.sitesInBand + ' of ' + k.sites + ' sites in the ' + S.utilBand[0] + ' to ' + S.utilBand[1] + '% band (definition to confirm)', 'ESTIMATE') +
      '</div>' +
      (countries.length > 1 ? '<div style="margin-top:18px"><b style="font-size:14px">Wearers by country</b><div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;max-width:620px">' +
        byCountry.map(function (b) { return '<div class="hbar" title="' + esc(b.c) + ': ' + F.int(b.w) + ' wearers at ' + b.n + ' sites"><span>' + esc(b.c) + '</span><div class="track"><div class="bar" style="width:' + (b.w / maxW * 100).toFixed(1) + '%"></div></div><span>' + F.int(b.w) + '</span></div>'; }).join('') + '</div></div>' : '') +
      '<div style="margin-top:20px"><div class="toolbar"><b style="font-size:14px;margin-right:auto">Sites</b><label for="countryFilter">Country</label><select id="countryFilter" data-change="country"><option value="all">All countries</option>' +
      countries.map(function (cn) { return '<option' + (state.ui.country === cn ? ' selected' : '') + '>' + esc(cn) + '</option>'; }).join('') + '</select></div>' +
      '<div class="table-wrap"><table><thead><tr>' + head('city', 'Site') + head('country', 'Country') + head('wearers', 'Wearers') + head('allocated', 'Garments') +
      head('hygienePct', S.hygieneDays + '+ day wash gap') + head('minPerWearer', 'Lowest pcs / wearer') + head('utilWeekly', 'Weekly utilization') + head('latePct', 'Late') + head('repairs', 'Repairs') + head('attention', 'Flags') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div></section>';
  }

  function secValue() {
    var r = result, v = r.value, S = r.settings;
    var share = Math.round(S.repairShare * 100);
    var baseBtns = r.value.allBaselines.map(function (b) {
      return '<button type="button" data-action="baseline" data-value="' + b.id + '" aria-pressed="' + (b.id === v.baseline.id) + '">' + esc(b.name) + '</button>';
    }).join('');
    var routes = v.waste.routes, wt = v.waste.total || 1;
    var routeCols = [['recycling', 'Recycled', 'var(--green)'], ['reuse', 'Reused', 'var(--cyan)'], ['energy_recovery', 'Energy recovery', 'var(--navy)'], ['incineration', 'Incineration', '#9AA8B2']];
    var kv = state.acct.kamValues;
    var kamHtml = kv.map(function (x) {
      return '<div class="kam-line"><span class="status st-KAM">KAM-ENTERED</span><span class="what">' + esc(x.label) + '</span><span class="as-sub">' + esc(x.kind) + ' · ' + esc(x.source || 'KAM') + '</span><span class="amt">' + F.eurFull(x.amount) + '</span>' +
        '<button type="button" class="icon-btn no-print" data-action="remove-value" data-value="' + esc(x.id) + '" aria-label="Remove value line">×</button></div>';
    }).join('');
    return '<section class="section" id="step2">' +
      '<div class="section-head"><div><span class="eyebrow e2">Value</span><h2>Value compared with ' + esc(v.baseline.name.toLowerCase()) + '</h2>' +
      '<p class="lead">' + esc(v.baseline.note) + '</p></div>' +
      '<div class="no-print"><span class="as-sub">Compare with</span><div class="seg" style="border-color:var(--line)" role="group" aria-label="Comparison baseline">' + baseBtns.replace(/<button/g, '<button style="color:var(--navy)"') + '</div></div></div>' +
      '<div class="grid g4">' +
      '<div class="tile hero"><span class="label">Avoided replacement purchases</span><span class="num">' + F.eur(v.avoidedSelected) + '</span>' +
      '<div class="range" title="Low 50%: ' + F.eur(v.avoidedLow) + ' · High 100%: ' + F.eur(v.avoidedHigh) + '"><div class="fill" style="left:50%;width:50%;opacity:.45"></div><div class="tick" style="left:calc(' + share + '% - 2px)"></div></div>' +
      '<div class="range-labels"><span>' + F.eur(v.avoidedLow) + ' (50%)</span><span>' + F.eur(v.avoidedHigh) + ' (100%)</span></div>' +
      '<div class="slider no-print"><label for="shareRange">Repairs that replaced a purchase</label><input id="shareRange" type="range" min="30" max="100" step="5" value="' + share + '" data-change="share"><b>' + share + '%</b></div>' +
      '<details class="method"><summary>How was this calculated?</summary><p>' + v.avoided.map(function (a) { return esc(a.product) + ': ' + F.int(a.repairs) + ' repairs × €' + a.unitCost; }).join('; ') +
      '. Then × ' + share + '%. Prices are illustrative (synthetic), not contract prices. Rental fees are not included, so this is not net savings.</p></details>' + status('ESTIMATE') + '</div>' +
      tile('CO₂e avoided', F.tonnes(v.savings.co2), 'Your workwear footprint with Lindström: ' + F.tonnes(v.footprint.co2) + ' (process ' + F.tonnes(v.footprint.process) + ', delivery ' + F.tonnes(v.footprint.delivery) + ')', 'CALCULATED · ALLOCATED') +
      tile('Fresh water saved', F.litres(v.savings.water), 'Lindström used about ' + F.one(v.footprint.waterPerKg) + ' L per kg washed', 'CALCULATED · ALLOCATED') +
      tile('Production emissions avoided', F.tonnes(v.avoidedProductKg), 'Garments not produced thanks to repair, at ' + share + '% replacement share', 'ESTIMATE') +
      '</div>' +
      '<div class="tile" style="margin-top:14px"><span class="label">End-of-life textiles handled for you: ' + F.tonnes(v.waste.total) + '</span>' +
      '<div class="stack" role="img" aria-label="Treatment routes">' + routeCols.map(function (rc) { return '<span title="' + rc[1] + ': ' + F.tonnes(routes[rc[0]]) + '" style="width:' + (routes[rc[0]] / wt * 100).toFixed(1) + '%;background:' + rc[2] + '"></span>'; }).join('') + '</div>' +
      '<div class="legend">' + routeCols.map(function (rc) { return '<span><i style="background:' + rc[2] + '"></i>' + rc[1] + ' ' + F.pct(routes[rc[0]] / wt * 100) + '</span>'; }).join('') + '</div>' +
      '<span class="note">With owned workwear this would be your own textile waste to sort and hand over. ' + status('ALLOCATED ESTIMATE') + '</span></div>' +
      '<div class="kam-box"><div class="section-head" style="margin-bottom:4px"><div><b style="font-size:16px;color:var(--navy)">Value the account team knows about</b><p class="lead">Added by the KAM from their own knowledge (e.g. risk reduced, admin time saved). Shown separately from data-based figures. Also possible via the assistant: "add €25,000 of reduced hygiene risk".</p></div></div>' +
      (kamHtml || '<p class="as-sub">No KAM-entered value yet.</p>') +
      '<form class="form no-print" data-submit="add-value"><label>What is it worth to the customer?<input name="label" required placeholder="e.g. Reduced hygiene audit risk" style="min-width:260px"></label>' +
      '<label>Amount (€)<input name="amount" type="number" min="1" required placeholder="25000" style="width:130px"></label>' +
      '<label>Type<select name="kind"><option>Risk reduced</option><option>Cost avoided</option><option>Time saved</option></select></label>' +
      '<button type="submit" class="btn btn-navy">Add value line</button></form>' +
      '<div class="totals"><span>Data-based (avoided purchases): <b>' + F.eur(v.avoidedSelected) + '</b></span><span>Account team estimates: <b>' + F.eur(kamTotal()) + '</b></span><span>Total value to discuss: <b>' + F.eur(v.avoidedSelected + kamTotal()) + '</b></span></div></div>' +
      '</section>';
  }

  function secTrust() {
    var r = result, k = r.kpis, S = r.settings;
    var dots = r.sites.map(function (s) {
      var out = s.utilWeekly < S.utilBand[0] || s.utilWeekly > S.utilBand[1];
      return '<span class="dot' + (out ? ' out' : '') + '" style="left:' + Math.min(100, s.utilWeekly).toFixed(1) + '%" title="' + esc(s.city) + ': ' + F.pct(s.utilWeekly, 1) + (out ? ' (outside band)' : '') + '"></span>';
    }).join('');
    return '<section class="section" id="step3">' +
      '<div class="section-head"><div><span class="eyebrow e3">Service</span><h2>Service you can rely on</h2>' +
      '<p class="lead">Reliability and healthy utilization across all sites.</p></div></div>' +
      '<div class="grid g4">' +
      tile('On-time delivery', F.pct(k.onTimePct, 1), F.int(k.cycles) + ' tracked wash cycles in ' + r.year, 'MEASURED') +
      tile('Average turnaround', Math.round(k.avgCycleHours) + ' h', 'Pickup to delivery back to site', 'MEASURED') +
      tile('Most late cycles', esc(k.worstLateSite.city), F.pct(k.worstLateSite.latePct, 1) + ' of its cycles late', 'MEASURED') +
      tile('Sites in healthy utilization', k.sitesInBand + ' / ' + k.sites, 'Band ' + S.utilBand[0] + ' to ' + S.utilBand[1] + '% washed per week', 'ESTIMATE') +
      '</div>' +
      '<div class="tile" style="margin-top:14px"><span class="label">Weekly service utilization by site (dot = one site, green band = healthy ' + S.utilBand[0] + ' to ' + S.utilBand[1] + '%)</span>' +
      '<div class="band-chart" role="img" aria-label="' + k.sitesInBand + ' of ' + k.sites + ' sites inside the healthy band"><div class="axis"></div><div class="band" style="left:' + S.utilBand[0] + '%;width:' + (S.utilBand[1] - S.utilBand[0]) + '%"></div>' + dots + '</div>' +
      '<div class="band-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>' +
      '<span class="note">Too high suggests too few garments; too low suggests garments are not being washed. Weekly = monthly washing % ÷ ' + S.weeksPerMonth + '; definition to confirm with Lindström.</span></div>' +
      '</section>';
  }

  // ---------- the five steering-committee questions ----------
  var QUESTIONS = [
    ['outcomes', 'Outcomes', 'What outcomes has the customer achieved since the last steering committee, and how are they measured?', 'euro'],
    ['priorities', 'Priorities', 'What are the customer\'s most important business and sustainability priorities for the next 6 to 12 months?', 'calendar'],
    ['risks', 'Risks & issues', 'Which delivery issues, risks or unresolved commitments need steering-level intervention?', 'alert'],
    ['opportunities', 'Opportunities', 'Which improvements or expansion opportunities offer the strongest customer value across cost, sustainability and operations?', 'sparkle'],
    ['decisions', 'Decisions', 'What decisions are needed today, who owns each action, and by when will it be done?', 'list']
  ];
  function qHead(id, extra) {
    var i = QUESTIONS.map(function (q) { return q[0]; }).indexOf(id), q = QUESTIONS[i];
    return '<div class="section-head"><div><span class="eyebrow e' + (i + 1) + '">Steering question ' + (i + 1) + ' · ' + q[1] + '</span><h2>' + esc(q[2]) + '</h2>' + (extra ? '<p class="lead">' + extra + '</p>' : '') + '</div></div>';
  }
  function inPlan(id) { return state.acct.actions.map(function (x) { return x.from; }).indexOf(id) !== -1; }
  function planBtn(s) {
    var on = inPlan(s.id);
    return '<button type="button" class="btn btn-sm ' + (on ? 'btn-navy' : 'btn-line') + ' no-print" data-action="toggle-action" data-value="' + s.id + '">' + (on ? '✓ In decisions' : '+ Add to decisions') + '</button>';
  }
  function signalCard(s) {
    var cust = state.view === 'customer';
    var gl = cust ? { Fix: 'Resolve together', Grow: 'Suggestion', Prepare: 'Be ready' }[s.group] : s.group;
    return '<article class="signal"><div><span class="grp grp-' + s.group + '">' + gl + '</span>' + (s.escalate ? '<div style="margin-top:8px"><span class="badge red" style="margin:0">Steering decision</span></div>' : '') +
      '<div class="rank kam-only">' + (s.why.length ? esc(s.why.slice(0, 2).join(', ')) : '') + '</div></div>' +
      '<div><h3>' + esc(cust ? s.custTitle : s.kamTitle) + '</h3><p>' + esc(cust ? s.custBody : s.kamBody) + '</p>' +
      '<p style="margin:4px 0 6px"><b style="color:var(--ink-strong)">Decision needed:</b> ' + esc(s.decision) + '</p>' +
      '<span class="ev">' + esc(s.evidence) + ' · </span>' + status(s.status) + (s.source ? ' <a class="ev" href="' + esc(s.source) + '" target="_blank" rel="noopener">Source</a>' : '') + '</div>' +
      '<div class="side"><div class="opp kam-only"><span>Opportunity</span>' + esc(s.opportunity) + '</div>' + planBtn(s) + '</div></article>';
  }
  function commitments() {
    var a = state.acct;
    if (!a.commitments) { a.commitments = JSON.parse(JSON.stringify((window.LVR_CRM_COMMITMENTS || {})[state.customerId] || [])); }
    return a.commitments;
  }
  function riskSignals() { return ranked.filter(function (s) { return s.kind === 'risk'; }); }
  function oppSignals() { return ranked.filter(function (s) { return s.kind === 'opportunity'; }).sort(function (x, y) { return y.valueScore - x.valueScore || y.score - x.score; }); }

  // Q1 outcomes
  function secOutcomes() {
    return '<section class="section">' + qHead('outcomes', 'Every figure below carries a status label: measured, calculated, allocated, estimate or account-team entered. Formulas are on the Method page.') + '</section>' +
      secValue() + secTrust();
  }

  // Q2 priorities
  function secPriorities() {
    var r = result, a = state.acct, aud = V.audienceOf(a), crm = (window.LVR_CRM_ACCOUNT || {})[state.customerId] || {};
    var stated = r.priorities.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
    var know = a.knowledge.slice(-5).reverse().map(function (k) { return '<li><span class="src ' + esc(k.source) + '">' + esc(k.source) + '</span> ' + esc(k.text) + '</li>'; }).join('');
    var themes = a.focusThemes.concat(A.AUDIENCES[aud].themes).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    var upcoming = ranked.filter(function (s) { return s.kind === 'upcoming' || s.id === 'reporting'; });
    var cust = state.view === 'customer';
    return '<section class="section">' + qHead('priorities', 'What the customer has told us, what the account team knows, and what is coming up.') +
      '<div class="prio-grid">' +
      '<div class="prio"><h3><span class="ico-tile t0">' + I.svg('people', 18) + '</span>Customer\'s stated priorities</h3><ul>' + stated + '</ul><span class="as-sub">From the customer record</span></div>' +
      '<div class="prio kam-only"><h3><span class="ico-tile t4">' + I.svg('chat', 18) + '</span>What the account team knows</h3>' + (know ? '<ul class="know">' + know + '</ul>' : '<p class="as-sub" style="margin:0">Nothing captured yet. Tell the assistant or import CRM notes.</p>') +
      '<div class="as-row no-print" style="margin-top:auto"><button type="button" class="btn btn-line btn-sm" data-action="drawer">Add a priority</button><button type="button" class="btn btn-line btn-sm" data-action="open-crm">Import CRM notes</button></div></div>' +
      '<div class="prio"><h3><span class="ico-tile t2">' + I.svg('sparkle', 18) + '</span>Focus for this meeting</h3><ul><li>Meeting with: ' + esc(A.AUDIENCES[aud].label) + '</li>' + themes.map(function (t) { return '<li>' + esc(t.charAt(0).toUpperCase() + t.slice(1)) + '</li>'; }).join('') + '</ul><span class="as-sub">Industry default: ' + r.industryPriorities.map(function (p) { return esc(p.priority_theme.toLowerCase()); }).join(', ') + '</span></div>' +
      '<div class="prio"><h3><span class="ico-tile t3">' + I.svg('calendar', 18) + '</span>Next 6 to 12 months</h3><ul>' +
      (crm.renewal ? '<li>Contract renewal: ' + esc(crm.renewal) + '</li>' : '') +
      upcoming.map(function (s) { return '<li>' + esc(cust ? s.custTitle : s.kamTitle) + '</li>'; }).join('') + '</ul></div>' +
      '</div></section>';
  }

  // Q3 risks and issues
  function secRisks() {
    var risks = riskSignals(), escl = risks.filter(function (s) { return s.escalate; }), watch = risks.filter(function (s) { return !s.escalate; });
    var cm = commitments();
    var stOpts = ['Open', 'Overdue', 'Done'];
    var rows = cm.map(function (c, i) {
      var cls = c.status === 'Overdue' ? 'red' : c.status === 'Open' ? 'amber' : 'green';
      return '<tr><td><b>' + esc(c.text) + '</b></td><td>' + esc(c.owner) + '</td><td class="num">' + esc(c.due) + '</td><td><span class="badge ' + cls + '" style="margin:0 8px 0 0">' + esc(c.status) + '</span>' +
        '<select class="no-print kam-only" aria-label="Status" data-change="commit-status" data-index="' + i + '">' + stOpts.map(function (o) { return '<option' + (o === c.status ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></td></tr>';
    }).join('');
    var openN = cm.filter(function (c) { return c.status !== 'Done'; }).length;
    return '<section class="section">' + qHead('risks', escl.length + ' issue' + (escl.length === 1 ? '' : 's') + ' need a steering decision · ' + openN + ' commitment' + (openN === 1 ? '' : 's') + ' from the last meeting still open') +
      '<h3 class="subhead">Needs a steering-level decision</h3>' +
      (escl.length ? escl.map(signalCard).join('') : '<p class="as-sub">No issue above the escalation thresholds.</p>') +
      '<h3 class="subhead">Commitments from the last steering committee</h3>' +
      (cm.length ? '<div class="table-wrap"><table><thead><tr><th>Commitment</th><th>Owner</th><th class="num">Due</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="as-sub" style="margin-top:6px">From CRM meeting notes (synthetic demo). Update the status before the meeting.</p>' : '<p class="as-sub">No commitments recorded.</p>') +
      (watch.length ? '<h3 class="subhead">To monitor</h3>' + watch.map(signalCard).join('') : '') +
      '<p class="footnote kam-only">Escalation rules: 20%+ of tracked garments with long wash gaps, 10+ sites short of garments, 3+ sites outside the utilization band, or a site with 3%+ late cycles.</p>' +
      '</section>';
  }

  // Q4 opportunities
  function secOpportunities() {
    var opps = oppSignals(), cust = state.view === 'customer';
    var L3 = { H: 'High', M: 'Medium', L: 'Low' };
    var rows = opps.map(function (s) {
      return '<tr><td><b>' + esc(cust ? s.custTitle : s.kamTitle) + '</b><br><span class="as-sub">' + esc(s.impact.note) + '</span></td>' +
        ['cost', 'sust', 'ops'].map(function (k) { return '<td><span class="impact ' + s.impact[k] + '">' + L3[s.impact[k]] + '</span></td>'; }).join('') +
        '<td class="num"><b>' + s.valueScore + ' / 9</b></td><td class="no-print">' + planBtn(s) + '</td></tr>';
    }).join('');
    var story = A.impactStatement(result);
    return '<section class="section">' + qHead('opportunities', 'Ranked by combined customer value. Cost, sustainability and operational benefit are rated by rule; the note says why.') +
      '<div class="table-wrap"><table><thead><tr><th>Opportunity</th><th>Cost</th><th>Sustainability</th><th>Operations</th><th class="num">Value</th><th class="no-print"></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h3 class="subhead">Details</h3>' + opps.map(signalCard).join('') +
      '<div class="story"><span class="eyebrow" style="color:#9ED3E6">Shareable impact story · for tenders, reports and PR</span><q>' + esc(story) + '</q>' +
      '<div class="chips"><span class="chip">Public tender answers</span><span class="chip">Sustainability report</span><span class="chip">Joint LinkedIn post</span></div>' +
      '<small>Estimate, not audited. The method travels with it. Both companies approve the wording before external use.</small>' +
      '<div class="no-print"><button type="button" class="btn btn-primary btn-sm" data-action="copy-story">Copy statement</button></div></div>' +
      '</section>';
  }

  // Q5 decisions
  function defaultDue(days) { var d = new Date(); d.setDate(d.getDate() + (days || 90)); return d.toISOString().slice(0, 10); }
  function secDecisions() {
    var acts = state.acct.actions;
    var rows = acts.map(function (x, i) {
      return '<tr><td data-label="Action"><b>' + esc(x.decision || x.text) + '</b>' + (x.decision && x.text !== x.decision ? '<br><span class="as-sub">' + esc(x.text) + '</span>' : '') + '</td>' +
        '<td data-label="Owner"><input aria-label="Owner" value="' + esc(x.owner) + '" data-change="action-owner" data-index="' + i + '"></td>' +
        '<td data-label="When"><input type="date" aria-label="Due date" value="' + esc(x.due || '') + '" data-change="action-due" data-index="' + i + '"></td>' +
        '<td data-label="What you get">' + esc(x.benefit || '') + '</td><td class="no-print"><button type="button" class="icon-btn" data-action="remove-action" data-index="' + i + '" aria-label="Remove">×</button></td></tr>';
    }).join('');
    return '<section class="section">' + qHead('decisions', 'Add decisions from Risks & issues and Opportunities, or let the tool suggest them. Set an owner and a due date for each; this table becomes the closing slide.') +
      '<div class="as-row no-print" style="margin-bottom:12px"><button type="button" class="btn btn-line" data-action="auto-plan">Suggest decisions</button><button type="button" class="btn btn-navy" data-action="export-pptx">' + I.svg('download', 18) + 'Export PowerPoint</button></div>' +
      (acts.length ? '<div class="table-wrap plan-wrap"><table class="plan"><thead><tr><th>Decision</th><th>Owner</th><th>Due date</th><th>What the customer gets</th><th class="no-print"></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="as-sub">No decisions yet. Click "Suggest decisions" to start from the escalated risks and the strongest opportunities.</p>') +
      '<form class="form no-print" data-submit="add-action"><label>Other decision<input name="text" required placeholder="e.g. Quarterly check-in with site leads" style="min-width:320px"></label><label>Owner<input name="owner" value="Lindström"></label><button type="submit" class="btn btn-navy">Add</button></form>' +
      '<p class="footnote">Prototype on Lindström\'s synthetic data pack. Figures are labelled by status; estimates are not audited and are not compliance statements.</p>' +
      '</section>';
  }

  // agenda on the overview: one line per question
  function agendaItems() {
    var r = result, a = state.acct, v = r.value, cust = state.view === 'customer';
    var escN = riskSignals().filter(function (s) { return s.escalate; }).length;
    var cm = commitments(), openN = cm.filter(function (c) { return c.status !== 'Done'; }).length, overdue = cm.filter(function (c) { return c.status === 'Overdue'; }).length;
    var top = oppSignals()[0];
    var ks = V.kamSum(a);
    return [
      { id: 'outcomes', head: F.eur(v.avoidedSelected + ks) + ' value, ' + F.tonnes(v.savings.co2) + ' CO₂e avoided, ' + F.pct(r.kpis.onTimePct, 1) + ' on time', badge: null },
      { id: 'priorities', head: r.priorities.join(', ') + (a.knowledge.length && !cust ? ' · ' + a.knowledge.length + ' notes from the account team' : ''), badge: null },
      { id: 'risks', head: escN + ' issue' + (escN === 1 ? '' : 's') + ' for a steering decision · ' + openN + ' open commitment' + (openN === 1 ? '' : 's'), badge: (escN || overdue) ? ['red', overdue ? overdue + ' overdue' : 'Decision needed'] : ['green', 'On track'] },
      { id: 'opportunities', head: top ? (cust ? top.custTitle : top.kamTitle) + ' (value ' + top.valueScore + '/9)' : 'No opportunities flagged', badge: null },
      { id: 'decisions', head: a.actions.length ? a.actions.length + ' decision' + (a.actions.length === 1 ? '' : 's') + ' prepared, ' + a.actions.filter(function (x) { return x.owner && x.due; }).length + ' with owner and date' : 'None prepared yet', badge: a.actions.length ? ['green', 'Ready'] : ['amber', 'To prepare'] }
    ];
  }

  function secMethod() {
    var r = result, S = r.settings;
    var assumptions = L.DB.Assumptions.map(function (a) { return '<tr><td><b>' + esc(a.assumption) + '</b></td><td>' + esc(a.value_or_rule) + '</td><td>' + esc(a.confidence) + '</td><td>' + esc(a.treatment) + '</td></tr>'; }).join('');
    var labels = [['MEASURED', 'Counted directly in service or scan data'], ['CALCULATED', 'Reproducible formula on measured data'], ['ALLOCATED', 'Laundry-level figure shared by this customer\'s share of washed kg'], ['ESTIMATE', 'Depends on an assumption you can change'], ['KAM-ENTERED', 'Entered by the account manager, shown separately'], ['RULE-BASED', 'Finding from a rule or a curated public source']];
    return '<section class="section">' +
      '<div class="section-head"><div><span class="eyebrow e3">Method</span><h2>How the numbers are made</h2><p class="lead">Every figure carries a status label. Thresholds can be changed here and everything updates.</p></div></div>' +
      '<div class="legend-grid">' + labels.map(function (l) { return status(l[0]) + '<span class="as-sub" style="color:var(--ink-2);font-size:13.5px">' + l[1] + '</span>'; }).join('') + '</div>' +
      '<div class="form kam-only" style="margin-top:18px"><label>Hygiene flag after (days)<input type="number" min="30" max="365" value="' + S.hygieneDays + '" data-change="hygieneDays"></label>' +
      '<label>Under-supply below (pieces per wearer)<input type="number" step="0.1" min="0.2" max="3" value="' + S.underThreshold + '" data-change="underThreshold"></label>' +
      '<label>Spare stock above (pieces per wearer)<input type="number" step="0.1" min="0.5" max="5" value="' + S.overThreshold + '" data-change="overThreshold"></label></div>' +
      '<div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Assumption</th><th>Value or rule</th><th>Confidence</th><th>Treatment</th></tr></thead><tbody>' + assumptions + '</tbody></table></div>' +
      '<p class="footnote"><b>Data source:</b> ' + esc(L.META.sourceFile || '') + ' · covers ' + esc(L.META.periodLabel) + ' · dataset last updated ' + esc(L.META.updatedLabel) + ' · loaded into the app ' + esc(L.META.generatedAt || '') + '.</p>' +
      '<p class="footnote">All data is Lindström\'s synthetic hackathon pack. Production use needs contract prices, customer satisfaction scores, Microsoft Dynamics account data, approved product footprints and the agreed definition of service utilization.</p></section>';
  }

  function secOverview() {
    var r = result, a = state.acct, aud = V.audienceOf(a), cust = state.view === 'customer';
    var crm = (window.LVR_CRM_ACCOUNT || {})[state.customerId] || {};
    var cards = V.cards(r, a), pts = V.points(r, ranked, a, cust);
    var pills = V.ORDER.map(function (k) {
      return '<button type="button" class="pill" data-action="audience" data-value="' + k + '" aria-pressed="' + (k === aud) + '">' + esc(A.AUDIENCES[k].short) + '</button>';
    }).join('');
    var ICON = { total: 'euro', avoided: 'euro', co2: 'leaf', water: 'drop', ontime: 'clock', repairs: 'repeat', spare: 'box', perWearer: 'shirt', requests: 'chat', gaps: 'alert', hygSites: 'pin', fit: 'shield', turnaround: 'truck', short: 'people', util: 'gauge', recycled: 'repeat', footprint: 'leaf' };
    var bigs = cards.map(function (c, i) {
      return '<button type="button" class="big" data-action="go" data-value="' + c.page + '" aria-label="' + esc(c.label + ': ' + c.value + '. Open details') + '">' +
        '<span class="big-top"><span class="ico-tile t' + (i % 4) + '">' + I.svg(ICON[c.key] || 'info', 20) + '</span><span class="big-label">' + esc(c.label) + '</span></span><span class="big-num">' + esc(c.value) + '</span><span class="big-sub">' + esc(c.sub) + '</span>' +
        '<span class="big-foot">' + status(c.status) + '<span class="more">Details ' + I.svg('arrow', 16) + '</span></span></button>';
    }).join('');
    var agenda = agendaItems().map(function (it, i) {
      var q = QUESTIONS[i];
      return '<li><span class="ico-tile t' + (i % 5) + '">' + I.svg(q[3], 18) + '</span><div><span class="q">' + (i + 1) + '. ' + esc(q[2]) + '</span><b>' + esc(it.head) + (it.badge ? '<span class="badge ' + it.badge[0] + '">' + esc(it.badge[1]) + '</span>' : '') + '</b></div>' +
        '<button type="button" class="btn btn-line btn-sm no-print" data-action="go" data-value="' + it.id + '">Open</button></li>';
    }).join('');
    var know = a.knowledge.slice(-2).reverse().map(function (k) { return '<li><span class="src ' + esc(k.source) + '">' + esc(k.source) + '</span> ' + esc(k.text) + '</li>'; }).join('');
    return '<section class="hero">' +
      '<div class="hero-top"><div><span class="eyebrow" style="color:var(--cyan-dark)">Annual review ' + r.year + '</span><h1>' + esc(r.customer.customer_name) + '</h1>' +
      '<p class="hero-meta">' + esc(r.customer.industry) + ' · ' + r.kpis.sites + ' sites · ' + Object.keys(r.countries).join(', ') + '</p>' +
      '<p class="data-date">' + I.svg('calendar', 16) + '<span>Data ' + esc(L.META.periodLabel) + ' · dataset last updated ' + esc(L.META.updatedLabel) + '</span></p>' +
      '</div></div>' +
      '<div class="who"><span class="who-label">' + (cust ? 'Prepared for' : 'Who are you meeting?') + '</span><div class="pills" role="group" aria-label="Meeting counterpart">' + pills + '</div>' +
      '<p class="who-desc">' + esc(V.DESCRIBE[aud]) + '</p></div></section>' +
      '<div class="ov-grid"><div class="ov-main">' +
      '<div class="bigs">' + bigs + '</div>' +
      '<div class="talk agenda"><div class="as-row" style="justify-content:space-between"><h2>' + (cust ? 'Today\'s agenda' : 'Steering committee agenda') + '</h2>' +
      '<span class="as-sub">The five questions this review answers</span></div><ol>' + agenda + '</ol></div></div>' +
      '<aside class="ov-side kam-only"><div class="rel"><h2>Relationship</h2><dl>' +
      '<dt>Next meeting</dt><dd>' + esc(crm.nextMeeting || '–') + '</dd><dt>Contract renewal</dt><dd>' + esc(crm.renewal || '–') + '</dd>' +
      '<dt class="extra">Last meeting</dt><dd class="extra">' + esc(crm.lastMeeting || '–') + '</dd><dt class="extra">Customer since</dt><dd class="extra">' + esc(crm.since || '–') + '</dd>' +
      '<dt class="extra">Key contacts</dt><dd class="extra">' + esc((crm.contacts || []).join(', ') || '–') + '</dd></dl>' +
      '<span class="as-sub extra">From CRM (synthetic demo)</span>' +
      '<div class="extra"><h3>What you know (' + a.knowledge.length + ')</h3>' + (know ? '<ul class="know">' + know + '</ul>' : '<p class="as-sub">Nothing noted yet.</p>') + '</div>' +
      '<div class="rel-actions"><button type="button" class="btn btn-primary" data-action="brief">30-second brief</button>' +
      '<button type="button" class="btn btn-navy" data-action="drawer">Tell the assistant</button>' +
      '<button type="button" class="btn btn-line extra" data-action="open-crm">Import CRM notes</button></div></div></aside></div>';
  }

  var PAGES = [['overview', 'Overview', 'grid']].concat(QUESTIONS.map(function (q, i) { return [q[0], q[1], q[3], i + 1]; })).concat([['sep'], ['sites', 'Sites', 'pin'], ['dashboards', 'Dashboards', 'chart'], ['method', 'Method', 'info']]);
  function tabsHtml() {
    return PAGES.map(function (p) {
      if (p[0] === 'sep') { return '<span class="sep" aria-hidden="true"></span>'; }
      return '<button type="button" data-action="go" data-value="' + p[0] + '"' + (state.page === p[0] ? ' aria-current="page"' : '') + '>' +
        (p[3] ? '<span class="qn">' + p[3] + '</span>' : '<span class="ico">' + I.svg(p[2], 18) + '</span>') + '<span>' + p[1] + '</span></button>';
    }).join('');
  }

  function secDashboards() {
    var a = state.acct, list = a.dashboards || [];
    var on = window.LVR_GEMINI && window.LVR_GEMINI.enabled();
    var ideas = ['Build a sustainability dashboard for the CFO', 'Make a dashboard of delivery performance by site', 'Dashboard: repairs by product and month', 'Show water and CO2 savings vs local laundry by country'];
    var head = '<div class="section-head"><div><span class="eyebrow">Dashboards</span><h2>Dashboards made with the assistant</h2>' +
      '<p class="lead">Ask the assistant for any view of ' + esc(result.customer.customer_name) + '\'s data, for example "make a dashboard of delivery performance by site". It queries the full data pack and saves the result here. Charts always recalculate from the data.</p></div></div>' +
      '<div class="dash-ideas no-print">' + ideas.map(function (q) { return '<button type="button" class="chip-btn" data-action="ask-ai" data-msg="' + esc(q) + '">' + I.svg('sparkle', 16) + esc(q) + '</button>'; }).join('') + '</div>' +
      (on ? '' : '<p class="as-sub" style="margin-top:10px">The AI connection is off, so new dashboards cannot be made. Turn it on under AI settings in the assistant.</p>');
    if (!list.length) { return head + '<section class="tile empty-dash"><p>No dashboards yet. Pick a suggestion above or ask the assistant.</p></section>'; }
    return head + list.map(function (d) {
      return '<section class="tile dash"><div class="dash-head"><div><h3>' + esc(d.title) + '</h3>' + (d.description ? '<p class="sub">' + esc(d.description) + '</p>' : '') + '<p class="as-sub">Created ' + esc(d.created || '') + ' · ' + d.widgets.length + ' widgets · data last updated ' + esc(L.META.updatedLabel) + '</p></div>' +
        '<button type="button" class="btn btn-line btn-sm no-print" data-action="delete-dashboard" data-value="' + esc(d.id) + '">Delete</button></div>' +
        '<div class="dash-grid">' + d.widgets.map(function (w) { return window.LVR_CHARTS.render(w, runWidget(w), { cls: w.type === 'kpi' ? 'w-kpi' : (w.type === 'table' || w.type === 'line' ? 'w-wide' : ''), wide: w.type === 'line' }); }).join('') + '</div></section>';
    }).join('');
  }

  function renderContent() {
    var y = window.scrollY, html;
    switch (state.page) {
      case 'outcomes': html = secOutcomes(); break;
      case 'priorities': html = secPriorities(); break;
      case 'risks': html = secRisks(); break;
      case 'opportunities': html = secOpportunities(); break;
      case 'decisions': html = secDecisions(); break;
      case 'sites': html = secLookBack(); break;
      case 'method': html = secMethod(); break;
      case 'dashboards': html = secDashboards(); break;
      case 'print': html = secOverview() + secOutcomes() + secPriorities() + secRisks() + secOpportunities() + secDecisions(); break;
      default: html = secOverview();
    }
    var back = state.page !== 'overview' && state.page !== 'print' ? '<button type="button" class="back no-print" data-action="go" data-value="overview">' + I.svg('arrow', 16).replace('<svg', '<svg style="transform:rotate(180deg)"') + 'Overview</button>' : '';
    $('tabsHost').innerHTML = tabsHtml();
    $('content').innerHTML = '<div class="print-head"><b style="font-size:18px;color:var(--navy)">Lindström · Customer Value Review ' + result.year + '</b> · ' + esc(result.customer.customer_name) + ' · data last updated ' + esc(L.META.updatedLabel) + '</div>' + back + html;
    I.hydrate(document);
    if (state.keepScroll) { window.scrollTo(0, y); }
    state.keepScroll = false;
  }

  function renderAll() {
    document.body.classList.toggle('customer-view', state.view === 'customer');
    document.body.classList.toggle('kam-view', state.view === 'kam');
    document.body.classList.toggle('drawer-open', state.drawer);
    document.querySelectorAll('[data-action="view"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === state.view)); });
    renderAssistant();
    renderContent();
  }

  function switchCustomer(id) {
    state.customerId = id; state.acct = load(id); state.ui.expanded = null; state.ui.country = 'all';
    compute(); renderAll();
  }

  function openAiSettings() {
    var G = window.LVR_GEMINI; if (!G) { return; }
    var c = G.config();
    $('aiKey').value = c.apiKey; $('aiModel').value = c.model;
    $('aiMsg').textContent = G.enabled() ? 'Connected. Questions go to ' + c.model + ', with the offline rules as backup.' : 'Off. The assistant uses the offline rules only.';
    $('aiModal').classList.add('open');
  }
  function aiSettingsAction(act) {
    var G = window.LVR_GEMINI, cfg = { apiKey: $('aiKey').value.trim(), model: $('aiModel').value.trim() || G.DEFAULT_MODEL, disabled: act === 'ai-off' };
    if (act === 'ai-test') {
      $('aiMsg').textContent = 'Testing…';
      G.test(cfg).then(function () { $('aiMsg').textContent = 'Works: ' + cfg.model + ' answered.'; }, function (e) { $('aiMsg').textContent = 'Did not work: ' + e.message; });
      return;
    }
    G.saveConfig(cfg); $('aiModal').classList.remove('open'); renderAssistant();
    toast(act === 'ai-off' ? 'AI off: offline rules only' : 'AI settings saved');
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) { return; }
    var act = el.getAttribute('data-action'), val = el.getAttribute('data-value'), a = state.acct;
    switch (act) {
      case 'view': state.view = val; state.keepScroll = true; renderAll(); break;
      case 'go': state.page = val; renderAll(); window.scrollTo(0, 0); break;
      case 'audience': a.audience = val; save(); compute(); state.keepScroll = true; renderAll(); break;
      case 'drawer': state.drawer = !state.drawer; renderAll(); if (state.drawer) { setTimeout(function () { $('chatInput').focus(); }, 50); } break;
      case 'close-drawer': state.drawer = false; renderAll(); break;
      case 'brief': state.drawer = true; state.mode = 'prep'; send('Brief me before I walk in'); break;
      case 'mode':
        if (state.mode !== val) {
          state.mode = val; state.view = val === 'meeting' ? 'customer' : 'kam';
          if (a.messages.length) { a.messages.push({ who: 'assistant', text: greeting() }); }
          save(); renderAll();
        }
        break;
      case 'send': send($('chatInput').value); $('chatInput').value = ''; break;
      case 'quick': send(el.getAttribute('data-msg')); break;
      case 'ask-ai': state.drawer = true; if (state.mode !== 'prep') { state.mode = 'prep'; state.view = 'kam'; } send(el.getAttribute('data-msg')); break;
      case 'pin-chart': {
        var pm = a.messages[+el.getAttribute('data-mi')], pc = pm && pm.charts && pm.charts[+el.getAttribute('data-ci')];
        if (!pc) { break; }
        a.dashboards = a.dashboards || [];
        var pinned = a.dashboards.filter(function (d) { return d.pinned; })[0];
        if (!pinned) { pinned = { id: 'pinned', pinned: true, title: 'Pinned charts', description: 'Charts you added from the assistant.', widgets: [], created: new Date().toISOString().slice(0, 10) }; a.dashboards.unshift(pinned); }
        pinned.widgets.push(JSON.parse(JSON.stringify(pc)));
        save(); toast('Added to Pinned charts on the Dashboards page'); if (state.page === 'dashboards') { state.keepScroll = true; renderContent(); }
        break;
      }
      case 'delete-dashboard':
        if (window.confirm('Delete this dashboard?')) { a.dashboards = (a.dashboards || []).filter(function (d) { return d.id !== val; }); save(); state.keepScroll = true; renderContent(); }
        break;
      case 'ai-settings': openAiSettings(); break;
      case 'close-ai': $('aiModal').classList.remove('open'); break;
      case 'ai-save': case 'ai-off': case 'ai-test': aiSettingsAction(act); break;
      case 'ask-site': state.mode = 'prep'; state.drawer = true; send('How is ' + val + ' doing?'); break;
      case 'clear-audience': a.audience = null; save(); compute(); renderAll(); break;
      case 'remove-theme': a.focusThemes = a.focusThemes.filter(function (t) { return t !== val; }); save(); compute(); renderAll(); break;
      case 'clear-sites': a.focusSites = []; save(); renderAll(); break;
      case 'remove-knowledge': a.knowledge.splice(+el.getAttribute('data-index'), 1); save(); renderAssistant(); break;
      case 'reset':
        if (window.confirm('Clear the knowledge, value lines, actions and chat for this customer?')) { state.acct = freshAccount(); save(); compute(); renderAll(); }
        break;
      case 'open-crm':
        $('crmText').value = (window.LVR_CRM_DEMO[state.customerId] || []).join('\n');
        $('crmModal').classList.add('open'); $('crmText').focus(); break;
      case 'close-crm': $('crmModal').classList.remove('open'); break;
      case 'import-crm': {
        var lines = $('crmText').value.split(/\n+/);
        $('crmModal').classList.remove('open');
        if (!a.messages.length) { a.messages.push({ who: 'assistant', text: greeting() }); }
        var res = A.importNotes(lines, { result: result, ranked: ranked, state: a });
        applyChanges(res.changes); a.messages.push({ who: 'assistant', text: res.reply });
        save(); compute(); renderAll(); toast('CRM notes imported');
        break;
      }
      case 'baseline': a.settings = Object.assign({}, a.settings, { baseline: val }); save(); compute(); renderAll(); break;
      case 'remove-value': a.kamValues = a.kamValues.filter(function (x) { return x.id !== val; }); save(); renderAll(); break;
      case 'toggle-site': state.ui.expanded = state.ui.expanded === val ? null : val; state.keepScroll = true; renderContent(); break;
      case 'sort':
        if (state.ui.sort === val) { state.ui.dir = -state.ui.dir; } else { state.ui.sort = val; state.ui.dir = -1; }
        state.keepScroll = true; renderContent(); break;
      case 'toggle-action': {
        var s = ranked.filter(function (x) { return x.id === val; })[0];
        var idx = a.actions.map(function (x) { return x.from; }).indexOf(val);
        if (idx !== -1) { a.actions.splice(idx, 1); } else if (s) { a.actions.push({ from: s.id, decision: s.decision, text: s.action, owner: s.owner, due: defaultDue(s.escalate ? 45 : 90), benefit: s.benefit }); }
        save(); state.keepScroll = true; renderContent(); break;
      }
      case 'auto-plan':
        riskSignals().filter(function (s) { return s.escalate; }).concat(oppSignals().slice(0, 2)).forEach(function (s) {
          if (a.actions.map(function (x) { return x.from; }).indexOf(s.id) === -1) { a.actions.push({ from: s.id, decision: s.decision, text: s.action, owner: s.owner, due: defaultDue(s.escalate ? 45 : 90), benefit: s.benefit }); }
        });
        save(); renderContent(); break;
      case 'remove-action': a.actions.splice(+el.getAttribute('data-index'), 1); save(); renderContent(); break;
      case 'copy-story': {
        var txt = A.impactStatement(result);
        if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(function () { toast('Statement copied'); }, function () { toast('Copy not allowed here'); }); }
        break;
      }
      case 'export-pptx':
        toast('Building PowerPoint…');
        window.LVR_EXPORT.pptx(result, ranked, state).then(function () { toast('PowerPoint downloaded'); }, function (err) { console.error(err); toast('Export failed: ' + err.message); });
        break;
      case 'print': {
        var prev = state.view, prevPage = state.page; state.view = 'customer'; state.page = 'print'; renderAll();
        setTimeout(function () { window.print(); state.view = prev; state.page = prevPage; renderAll(); }, 200);
        break;
      }
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target, key = el.getAttribute('data-change'), a = state.acct;
    if (!key) { return; }
    if (key === 'country') { state.ui.country = el.value; renderContent(); return; }
    if (key === 'share') { a.settings = Object.assign({}, a.settings, { repairShare: +el.value / 100 }); }
    if (key === 'hygieneDays' || key === 'underThreshold' || key === 'overThreshold') {
      var o = {}; o[key] = +el.value; a.settings = Object.assign({}, a.settings, o);
    }
    if (key === 'action-owner') { a.actions[+el.getAttribute('data-index')].owner = el.value; save(); return; }
    if (key === 'action-due') { a.actions[+el.getAttribute('data-index')].due = el.value; save(); return; }
    if (key === 'commit-status') { commitments()[+el.getAttribute('data-index')].status = el.value; save(); state.keepScroll = true; renderContent(); return; }
    save(); compute(); state.keepScroll = true; renderAll();
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'shareRange') { e.target.nextElementSibling.textContent = e.target.value + '%'; }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target, kind = f.getAttribute('data-submit'), a = state.acct;
    if (!kind) { return; }
    e.preventDefault();
    var d = new FormData(f);
    if (kind === 'add-value') {
      a.kamValues.push({ id: 'v' + Date.now(), label: String(d.get('label')), amount: +d.get('amount'), kind: String(d.get('kind')), source: 'KAM' });
    } else if (kind === 'add-action') {
      a.actions.push({ from: 'custom-' + Date.now(), decision: String(d.get('text')), text: String(d.get('text')), owner: String(d.get('owner') || 'Lindström'), due: defaultDue(90), benefit: '' });
    }
    save(); state.keepScroll = true; renderAll();
  });
  $('chatInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(this.value); this.value = ''; }
  });
  $('customerSelect').addEventListener('change', function () { switchCustomer(this.value); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('crmModal').classList.remove('open'); $('aiModal').classList.remove('open'); if (state.drawer) { state.drawer = false; renderAll(); } } });

  // ---------- start ----------
  $('customerSelect').innerHTML = L.DB.Customers.map(function (c) { return '<option value="' + c.customer_id + '">' + esc(c.customer_name) + '</option>'; }).join('');
  switchCustomer('CUST001');
})();

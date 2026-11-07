/* Gemini connection for the review assistant.
 * Sets window.LVR_LLM so the app sends every assistant message to Gemini first and falls back to
 * the offline rules (assistant.js) if Gemini is not configured or fails.
 *
 * Gemini gets: the account's computed review (kpis, value, ranked findings, KAM knowledge),
 * the schema of every table in the data pack, and five tools that run here in the browser:
 *   query_data       aggregate or list rows from any table (always scoped to the open customer)
 *   show_chart       draw a chart in the chat from a query
 *   create_dashboard save a multi-chart dashboard to the Dashboards page
 *   update_account   store something the KAM says (knowledge, value lines, focus, assumptions)
 *   open_page        move the main view to a page of the review
 * The data itself never leaves the browser in bulk: Gemini only sees query results it asks for.
 */
(function () {
  'use strict';
  var Q = window.LVR_QUERY, C = window.LVR_CHARTS;
  var STORE = 'lvr:gemini';
  var DEFAULT_MODEL = 'gemini-3.5-flash';
  // If a model's limit is used up (free tier: about 20 requests a day for Flash), try the next one.
  var FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];
  var EXHAUSTED = 'lvr:gemini-exhausted';
  function exhausted() { try { var o = JSON.parse(localStorage.getItem(EXHAUSTED) || '{}'), now = Date.now(); Object.keys(o).forEach(function (k) { if (o[k] < now) { delete o[k]; } }); return o; } catch (e) { return {}; } }
  function markExhausted(model, seconds) { try { var o = exhausted(); o[model] = Date.now() + seconds * 1000; localStorage.setItem(EXHAUSTED, JSON.stringify(o)); } catch (e) { /* ignore */ } }
  function modelChain(cfg) {
    var ex = exhausted();
    var list = [cfg.model].concat(FALLBACK_MODELS.filter(function (m) { return m !== cfg.model; }));
    var ok = list.filter(function (m) { return !ex[m]; });
    return ok.length ? ok : [cfg.model];
  }
  var ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

  function config() {
    var base = window.LVR_GEMINI_CONFIG || {}, local = {};
    try { local = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { local = {}; }
    return {
      apiKey: local.apiKey || base.apiKey || '',
      model: local.model || base.model || DEFAULT_MODEL,
      disabled: !!local.disabled
    };
  }
  function saveConfig(c) { try { localStorage.setItem(STORE, JSON.stringify(c)); } catch (e) { /* storage unavailable */ } }
  function enabled() { var c = config(); return !!c.apiKey && !c.disabled; }

  var SCHEMA_TEXT = null;
  function schemaText() { if (!SCHEMA_TEXT) { SCHEMA_TEXT = Q.schema(); } return SCHEMA_TEXT; }

  // ---------- tool declarations ----------
  var S = { o: 'OBJECT', s: 'STRING', n: 'NUMBER', i: 'INTEGER', b: 'BOOLEAN', a: 'ARRAY' };
  function querySchema() {
    return {
      type: S.o, description: 'A query over one table of the data pack. Rows of tables with customer_id are automatically limited to the open customer.',
      properties: {
        table: { type: S.s, enum: Q.tables(), description: 'Table name' },
        filters: {
          type: S.a, description: 'All filters must match (AND).',
          items: {
            type: S.o, properties: {
              column: { type: S.s },
              op: { type: S.s, enum: ['eq', 'neq', 'in', 'not_in', 'contains', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'not_null'] },
              value: { type: S.s, description: 'Single value (numbers as text are fine)' },
              values: { type: S.a, items: { type: S.s }, description: 'For in / not_in, or [low, high] for between' }
            }, required: ['column', 'op']
          }
        },
        group_by: { type: S.a, items: { type: S.s }, description: 'Columns to group by, e.g. ["month"] or ["city"]' },
        metrics: {
          type: S.a, description: 'Aggregations per group. Without group_by they aggregate all matching rows into one row.',
          items: { type: S.o, properties: { op: { type: S.s, enum: ['sum', 'avg', 'min', 'max', 'median', 'count', 'count_distinct', 'count_if', 'share'], description: 'share = % of rows in the group where column equals value; count_if = number of such rows' }, column: { type: S.s }, value: { type: S.s, description: 'Only for count_if / share, e.g. LATE' }, multiply: { type: S.n, description: 'Optional factor applied after aggregation, e.g. the repair share 0.75, or 0.001 to turn kg into tonnes' }, as: { type: S.s, description: 'Output column name' } }, required: ['op'] }
        },
        ratios: {
          type: S.a, description: 'Computed after aggregation: numerator / denominator * multiply (use multiply 100 for percentages).',
          items: { type: S.o, properties: { as: { type: S.s }, numerator: { type: S.s }, denominator: { type: S.s }, multiply: { type: S.n } }, required: ['as', 'numerator', 'denominator'] }
        },
        sort: { type: S.o, properties: { by: { type: S.s }, dir: { type: S.s, enum: ['asc', 'desc'] } } },
        limit: { type: S.i },
        columns: { type: S.a, items: { type: S.s }, description: 'Columns to return when listing raw rows (no group_by/metrics)' },
        all_customers: { type: S.b, description: 'Prep mode only: include every customer, e.g. for a benchmark. Ignored in meeting mode.' }
      },
      required: ['table']
    };
  }
  function widgetSchema() {
    return {
      type: S.o,
      properties: {
        title: { type: S.s },
        type: { type: S.s, enum: ['bar', 'hbar', 'line', 'pie', 'table', 'kpi'], description: 'line for months/trends, hbar for rankings of sites/products, bar for few categories, pie for shares of a total, kpi for one big number, table for detail' },
        x: { type: S.s, description: 'Category / x column from the query output' },
        y: { type: S.a, items: { type: S.s }, description: 'Value column(s) from the query output' },
        unit: { type: S.s, description: 'e.g. €, %, kg, t CO2e, L, h' },
        subtitle: { type: S.s, description: 'Short line under a kpi value' },
        note: { type: S.s, description: 'One short line: what it shows and how it was calculated' },
        status: { type: S.s, enum: ['MEASURED', 'CALCULATED', 'ALLOCATED', 'ESTIMATE'], description: 'How the figure was made' },
        query: querySchema()
      },
      required: ['title', 'type', 'query']
    };
  }
  function tools(mode) {
    var decl = [
      { name: 'query_data', description: 'Run a query on the data pack and get the rows back. Use it for every number you state that is not already in the review summary.', parameters: { type: S.o, properties: { query: querySchema() }, required: ['query'] } },
      { name: 'show_chart', description: 'Draw a chart or table in the chat from a query. Use whenever the user asks to show, chart, plot, compare or visualise something, or when a trend or ranking is easier to see than read.', parameters: widgetSchema() },
      { name: 'create_dashboard', description: 'Create and save a dashboard (3 to 8 widgets, usually starting with 2 to 4 kpi widgets) on the Dashboards page. Use when the user asks for a dashboard, overview page or report view.', parameters: { type: S.o, properties: { title: { type: S.s }, description: { type: S.s }, widgets: { type: S.a, items: widgetSchema() } }, required: ['title', 'widgets'] } },
      { name: 'open_page', description: 'Show a page of the review in the main view.', parameters: { type: S.o, properties: { page: { type: S.s, enum: ['overview', 'outcomes', 'priorities', 'risks', 'opportunities', 'decisions', 'sites', 'dashboards', 'method'] } }, required: ['page'] } }
    ];
    decl.push({ name: 'update_account', description: 'Store what the KAM or the customer says about the account so the review adapts: who attends the meeting, customer priorities or focus topics, focus sites, value the data cannot see (for example "add €25,000 of reduced hygiene risk"), assumptions ("they repair small things themselves, be conservative"), CRM facts. Pass the statement in plain words, one fact per call.', parameters: { type: S.o, properties: { statement: { type: S.s } }, required: ['statement'] } });
    return [{ functionDeclarations: decl }];
  }

  // ---------- context ----------
  function summary(p) {
    var r = p.result, a = p.account, k = r.kpis, v = r.value || {};
    var pick = function (o, keys) { var x = {}; keys.forEach(function (key) { if (o && o[key] !== undefined && typeof o[key] !== 'object') { x[key] = o[key]; } }); return x; };
    var commitments = (a.commitments && a.commitments.length ? a.commitments : (window.LVR_CRM_COMMITMENTS || []).filter(function (c) { return !c.customer_id || c.customer_id === r.customer.customer_id; }));
    var s = {
      customer: r.customer, year: r.year, period: window.LVR && window.LVR.META ? window.LVR.META.periodLabel : '',
      data_last_updated: window.LVR && window.LVR.META ? window.LVR.META.updatedLabel : '',
      customer_priorities: r.priorities, industry_priorities: (r.industryPriorities || []).map(function (x) { return x.priority_theme; }),
      kpis: k,
      value: pick(v, Object.keys(v || {})),
      settings: Object.assign({}, r.settings || {}, a.settings || {}),
      findings_ranked: (p.ranked || []).slice(0, 10).map(function (s) {
        return { id: s.id, group: s.group, kind: s.kind, title_kam: s.kamTitle, title_customer: s.custTitle, detail: s.kamBody, decision: s.decision || s.action, owner: s.owner, benefit: s.benefit, status: s.status, escalate: !!s.escalate, impact: s.impact, evidence: s.evidence };
      }),
      kam_value_lines: a.kamValues, kam_knowledge: (a.knowledge || []).map(function (x) { return x.text; }),
      focus_themes: a.focusThemes, audience: a.audience, agreed_actions: a.actions, commitments: commitments,
      crm_account: window.LVR_CRM_ACCOUNT || null,
      dashboards: (a.dashboards || []).map(function (d) { return d.title; })
    };
    var txt = JSON.stringify(s);
    return txt.length > 60000 ? txt.slice(0, 60000) : txt;
  }

  function system(p) {
    var meeting = p.mode === 'meeting';
    var name = p.result.customer.customer_name;
    return [
      'You are SteerReady, the review assistant inside Lindström\'s Customer Value Review. Lindström rents, washes, repairs and recycles workwear for business customers.',
      'The user is ' + (meeting ? 'in a live steering committee meeting with ' + name + '. Messages are the CUSTOMER\'s questions, typed by the key account manager (KAM). Answer the customer directly in friendly, plain language, as advice from Lindström. Only use ' + name + '\'s own data. Never mention other customers, internal sales tactics, upsell or margins.' : 'a Lindström key account manager (KAM) preparing the annual review for ' + name + '. Be a sharp, practical colleague: lead with what matters for the meeting, suggest how to frame it, and point out risks and growth opportunities.'),
      '',
      'HOW TO ANSWER',
      '- Be short: 2 to 6 sentences or a few bullets. Lead with the answer and the number.',
      '- Every number you state must come from the review summary below or from a query_data / show_chart / create_dashboard result in this conversation. Never invent or estimate numbers yourself. If the data cannot answer, say what is missing (for example contract prices, satisfaction surveys, compliance status and lost garments are not in this data) and suggest what the KAM could add.',
      '- Say how a figure was made when it matters: MEASURED (counted in the data), CALCULATED (derived from measured data), ALLOCATED (Lindström laundry totals shared by the customer\'s share of washed kg), ESTIMATE (relies on assumptions, e.g. one repair postpones one replacement; give the range).',
      '- Sustainability figures are supporting evidence for the customer\'s own reporting, not verified claims and not compliance advice. Never say a customer is compliant with a regulation.',
      '- The data is a synthetic prototype data pack for ' + (p.result.year || 2025) + '. Say so if asked whether the data is real.',
      '- Format: plain text. You may use **bold** and lines starting with "- " for bullets. No headings, no markdown tables (use show_chart with type table instead), no emojis. Never use em dashes; use commas, colons or full stops instead.',
      '- Reply in the language the user writes in.',
      '- Do not explain WHY a number moved (seasonality, holidays, staffing) unless the data or the KAM says so. You may suggest it as a question to ask the customer.',
      '',
      'TOOLS',
      '- query_data for any figure not in the summary. Group by month for trends, by city or site_name for site comparisons, by product_name for products. For "share of X" use the share metric, e.g. late-delivery share by site: table Service_Cycles, group_by ["site_name"], metrics [{op:"share", column:"performance_flag", value:"LATE", as:"late_pct"}, {op:"count", as:"cycles"}], sort {by:"late_pct", dir:"desc"}, limit 5. Use ratios to divide two summed columns. For "top N" always set sort and limit N.',
      '- show_chart when the user asks to show, chart, plot, visualise or compare, or when a trend or ranking is clearer as a picture. Call show_chart directly (it returns the data, so you do not need query_data first). The chart must show exactly the figures in your answer: if you rank sites by a share or rate, the chart query must compute that same ratio (with ratios), sort by it and set y to the ratio column, so the chart shows the same sites in the same order. Never chart a raw count when your answer is about a share. After a chart, add one or two sentences on what it shows.',
      '- Save requests: the API key has a low per-minute limit. Do everything a question needs in as few rounds as possible: call several tools in the same turn when they are independent, and do not repeat queries you already ran.',
      '- create_dashboard when the user asks for a dashboard: call it directly in your first turn (it checks every query and tells you if one fails), together with open_page "dashboards". Start with 2 to 4 kpi widgets, then 2 to 4 charts. Give each widget a note and status. Then summarise in two or three sentences what the dashboard shows.',
      meeting ? '- update_account only to store feedback or facts the customer shares in the meeting.' : '- update_account whenever the KAM tells you something about the account (attendees, priorities, focus, value the data cannot see, assumptions, CRM notes). One fact per call. Then confirm briefly what changed.',
      '- Useful joins are already done: tables with site_id also have site_name, city, country, site_type; product_id has product_name, product_group; month has quarter; Service_Cycles has month from pickup_timestamp.',
      '- Key definitions: Service_Cycles.performance_flag LATE / ON_TIME gives delivery punctuality; cycle_hours is pickup to delivery. Service_Activity.washing_pct is the monthly washing rate (washed pieces vs allocated pieces). Repairs.repair_count counts repairs; estimated_replacements_postponed and estimated_avoided_product_kgco2e are estimates. Customer_Impacts.*_saving_vs_local_* compare Lindström with an outsourced local laundry baseline (ALLOCATED / ESTIMATE). Laundry_Resources and Waste_Circularity are laundry-level, not customer-level.',
      '- Repairs.estimated_replacements_postponed and estimated_avoided_product_kgco2e assume EVERY repair postpones a replacement (upper bound). The review applies the repair share in settings.repairShare (for example 0.75). When you report, chart or put these on a dashboard, use metrics multiply = settings.repairShare so the numbers match the review, and say it is an ESTIMATE. Prefer figures already in the review summary over recalculating them.',
      '- Large kg figures read better in tonnes: use multiply 0.001 and unit "t CO2e" or "t".',
      '',
      'REVIEW SUMMARY (already calculated by the app, JSON):',
      summary(p),
      '',
      'DATA PACK README:',
      (Q.readme || '').slice(0, 2500),
      '',
      'TABLES AND COLUMNS:',
      schemaText()
    ].join('\n');
  }

  function history(p) {
    var msgs = (p.account.messages || []).filter(function (m) { return !m.pending; });
    var out = [];
    msgs.slice(-14).forEach(function (m) {
      var role = m.who === 'assistant' ? 'model' : 'user';
      var text = m.text || '';
      if (m.charts && m.charts.length) { text += '\n[Charts shown: ' + m.charts.map(function (c) { return c.title; }).join('; ') + ']'; }
      if (!text) { return; }
      if (out.length && out[out.length - 1].role === role) { out[out.length - 1].parts[0].text += '\n\n' + text; }
      else { out.push({ role: role, parts: [{ text: text }] }); }
    });
    while (out.length && out[0].role === 'model') { out.shift(); }
    // The newest user message is already the last entry (app adds it before calling us).
    return out;
  }

  // ---------- tool execution ----------
  function scope(p) { return { customerId: p.result.customer.customer_id, allowAllCustomers: p.mode !== 'meeting' }; }
  function safeRun(q, p) {
    try { return Q.run(q, scope(p)); } catch (e) { return { error: e.message }; }
  }
  function forModel(res, max) {
    if (res.error) { return { error: res.error }; }
    return { columns: res.columns, rows: res.rows.slice(0, max || 200), total_rows: res.total_rows, truncated: res.total_rows > (max || 200), matched_source_rows: res.matched_source_rows, note: res.note || undefined };
  }
  function cleanWidget(w) {
    return { title: w.title, type: w.type || 'bar', x: w.x, y: w.y ? [].concat(w.y) : undefined, unit: w.unit, subtitle: w.subtitle, note: w.note, status: w.status, query: w.query };
  }

  function exec(call, p, out) {
    var a = call.args || {};
    switch (call.name) {
      case 'query_data':
        return forModel(safeRun(a.query || a, p));
      case 'show_chart': {
        var w = cleanWidget(a), res = safeRun(w.query, p);
        if (res.error) { return { error: res.error }; }
        var key = JSON.stringify(w.query) + w.type;
        if (out.charts.some(function (c) { return JSON.stringify(c.query) + c.type === key || c.title === w.title; })) { return { shown: true, note: 'Already shown, not repeated.' }; }
        if (out.charts.length >= 3) { return { shown: false, note: 'At most three charts per answer.' }; }
        out.charts.push(w);
        return { shown: true, preview: forModel(res, 40) };
      }
      case 'create_dashboard': {
        var widgets = (a.widgets || []).map(cleanWidget), errors = [];
        widgets.forEach(function (w, i) { var r = safeRun(w.query, p); if (r.error) { errors.push('widget ' + (i + 1) + ' (' + w.title + '): ' + r.error); } });
        if (errors.length) { return { saved: false, errors: errors, hint: 'Fix the queries and call create_dashboard again.' }; }
        var id = p.tools.saveDashboard({ title: a.title || 'Dashboard', description: a.description || '', widgets: widgets });
        out.dashboard = id;
        return { saved: true, id: id, widgets: widgets.length };
      }
      case 'update_account': {
        var reply = p.tools.applyStatement(String(a.statement || ''));
        out.updated = true;
        return { stored: true, app_reply: reply };
      }
      case 'open_page':
        out.page = a.page; p.tools.goPage(a.page);
        return { opened: a.page };
      default:
        return { error: 'Unknown tool ' + call.name };
    }
  }

  // ---------- API ----------
  function retryDelay(j) {
    var d = 0;
    ((j.error && j.error.details) || []).forEach(function (x) { if (x.retryDelay) { d = parseFloat(x.retryDelay) || d; } });
    if (!d) { var m = /retry in ([\d.]+)s/i.exec((j.error && j.error.message) || ''); if (m) { d = parseFloat(m[1]); } }
    return d || 20;
  }
  function friendly(status, j) {
    var msg = (j.error && j.error.message) || ('HTTP ' + status);
    if (status === 429) { return 'the API key\'s rate limit was reached'; }
    if (status === 400 && /API key/i.test(msg)) { return 'the API key was not accepted'; }
    if (status === 403) { return 'the API key is not allowed to use this model'; }
    if (status === 404) { return 'this model is not available for the API key'; }
    return msg.split('\n')[0].slice(0, 160);
  }
  // One request, with a 60 s timeout and automatic waiting when the per-minute limit is hit.
  function post(cfg, body, onWait, waited) {
    waited = waited || 0;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) { ctrl.abort(); } }, 60000);
    return fetch(ENDPOINT + encodeURIComponent(cfg.model) + ':generateContent', {
      method: 'POST', signal: ctrl && ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify(body)
    }).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 429 || r.status === 503) {
          var d = Math.ceil(retryDelay(j)) + 1;
          if (d <= 61 && waited + d <= 120) {
            if (onWait) { onWait(d, r.status); }
            return new Promise(function (res) { setTimeout(res, d * 1000); }).then(function () { return post(cfg, body, onWait, waited + d); });
          }
        }
        if (!r.ok) {
          var daily = r.status === 429 && retryDelay(j) > 61;
          var e = new Error(daily ? 'the API key\'s daily limit is used up' : friendly(r.status, j));
          e.status = r.status; e.switchModel = daily || r.status === 404;
          if (daily) { markExhausted(cfg.model, retryDelay(j)); }
          throw e;
        }
        return j;
      });
    }, function (e) {
      clearTimeout(timer);
      throw (e && e.name === 'AbortError') ? new Error('Gemini took too long to answer') : e;
    });
  }

  function ask(p) {
    var base = config();
    if (!base.apiKey || base.disabled) { return Promise.resolve(null); }
    var chain = modelChain(base), mi = 0;
    var cfg = { apiKey: base.apiKey, model: chain[0] };
    var contents = history(p);
    var sys = system(p);
    var out = { charts: [], dashboard: null, page: null, updated: false };
    var rounds = 0;
    var onWait = function (d, st) { if (p.tools.status) { p.tools.status(st === 503 ? 'Gemini is busy, trying again in ' + d + ' s…' : 'Waiting ' + d + ' s for the Gemini rate limit (free tier allows a few requests per minute)…'); } };

    function step() {
      rounds += 1;
      return post(cfg, {
        systemInstruction: { parts: [{ text: sys }] },
        contents: contents,
        tools: tools(p.mode),
        generationConfig: { temperature: 0.3 }
      }, onWait).catch(function (e) {
        if (e.switchModel && mi + 1 < chain.length) {
          mi += 1; cfg = { apiKey: base.apiKey, model: chain[mi] }; rounds -= 1;
          if (p.tools.status) { p.tools.status('Switching to ' + cfg.model + '…'); }
          return step();
        }
        throw e;
      }).then(function (j) {
        if (j && j.__done) { return j; }
        var cand = j.candidates && j.candidates[0];
        if (!cand || !cand.content) {
          var why = (j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason) || 'no answer';
          throw new Error('Gemini returned ' + why);
        }
        var parts = cand.content.parts || [];
        var calls = parts.filter(function (x) { return x.functionCall; }).map(function (x) { return x.functionCall; });
        contents.push({ role: 'model', parts: parts });
        if (calls.length && rounds < 8) {
          if (p.tools.status) { p.tools.status(calls.some(function (c) { return c.name === 'create_dashboard'; }) ? 'Building the dashboard…' : calls.some(function (c) { return c.name === 'show_chart'; }) ? 'Drawing the chart…' : 'Querying the data…'); }
          var responses = calls.map(function (c) {
            var res;
            try { res = exec(c, p, out); } catch (e) { res = { error: e.message }; }
            var fr = { name: c.name, response: res };
            if (c.id) { fr.id = c.id; }
            return { functionResponse: fr };
          });
          contents.push({ role: 'user', parts: responses });
          return step();
        }
        var text = parts.filter(function (x) { return x.text && !x.thought; }).map(function (x) { return x.text; }).join('').trim();
        if (!text) {
          text = out.dashboard ? 'Your dashboard is saved on the Dashboards page.' : out.charts.length ? 'Here is ' + out.charts.map(function (c) { return c.title; }).join(' and ') + '.' : 'Done.';
        }
        return { reply: text.replace(/\s*—\s*/g, ', '), changes: {}, charts: out.charts, dashboard: out.dashboard, page: out.page, source: 'gemini', model: cfg.model, __done: true };
      });
    }
    return step();
  }

  function test(cfg) {
    return post(cfg, { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }] }, null, 999).then(function (j) {
      var t = j.candidates && j.candidates[0] && j.candidates[0].content && (j.candidates[0].content.parts || []).map(function (x) { return x.text || ''; }).join('');
      return (t || '').trim() || 'OK';
    });
  }

  window.LVR_GEMINI = { config: config, saveConfig: saveConfig, enabled: enabled, ask: ask, test: test, DEFAULT_MODEL: DEFAULT_MODEL };
  window.LVR_LLM = function (p) { return enabled() ? ask(p) : Promise.resolve(null); };
})();

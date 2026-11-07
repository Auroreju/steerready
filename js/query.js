/* Query engine over the full data pack (window.LVR_FULL).
 * The AI assistant never sees raw files: it asks for data with a small, safe query spec
 * (table, filters, group_by, metrics, sort, limit) and this file runs it in the browser.
 * Every row is enriched with readable names (site, city, product, laundry) so answers
 * and charts can use them directly.
 */
(function () {
  'use strict';
  var F = window.LVR_FULL || { tables: {}, dictionary: [] };
  var T = F.tables;
  var cache = {};

  function index(table, key) {
    var t = T[table], out = {};
    if (!t) { return out; }
    var ki = t.cols.indexOf(key);
    t.rows.forEach(function (r) {
      var o = {}; t.cols.forEach(function (c, i) { o[c] = r[i]; }); out[r[ki]] = o;
    });
    return out;
  }
  var SITES = index('Sites', 'site_id'), PRODUCTS = index('Products', 'product_id'),
    LAUNDRIES = index('Laundries', 'laundry_id'), CUSTOMERS = index('Customers', 'customer_id');

  // Virtual columns added to each table (computed once).
  function enrich(table, o) {
    if (o.site_id && SITES[o.site_id]) {
      var s = SITES[o.site_id];
      o.site_name = s.site_name; o.city = s.city; o.site_type = s.site_type;
      if (o.country === undefined) { o.country = s.country; }
    }
    if (o.product_id && PRODUCTS[o.product_id]) { o.product_name = PRODUCTS[o.product_id].product_name; o.product_group = PRODUCTS[o.product_id].product_group; }
    if (o.laundry_id && LAUNDRIES[o.laundry_id] && o.laundry_name === undefined) { o.laundry_name = LAUNDRIES[o.laundry_id].laundry_name; }
    if (o.customer_id && CUSTOMERS[o.customer_id] && o.customer_name === undefined) { o.customer_name = CUSTOMERS[o.customer_id].customer_name; }
    if (table === 'Service_Cycles' && o.pickup_timestamp) { o.month = String(o.pickup_timestamp).slice(0, 7); }
    if (typeof o.month === 'string' && /^\d{4}-\d{2}/.test(o.month)) {
      o.quarter = o.month.slice(0, 4) + '-Q' + (Math.floor((+o.month.slice(5, 7) - 1) / 3) + 1);
    }
    return o;
  }
  function rows(table) {
    if (cache[table]) { return cache[table]; }
    var t = T[table];
    if (!t) { throw new Error('Unknown table "' + table + '". Tables: ' + Object.keys(T).join(', ')); }
    cache[table] = t.rows.map(function (r) {
      var o = {}; t.cols.forEach(function (c, i) { o[c] = r[i]; }); return enrich(table, o);
    });
    return cache[table];
  }
  function columns(table) { var r = rows(table); return r.length ? Object.keys(r[0]) : T[table].cols; }

  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; }
  function eq(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }
  function test(o, f) {
    var v = o[f.column], val = f.values && f.values.length ? (f.values.length === 1 && f.op !== 'between' ? f.values[0] : f.values) : f.value;
    switch (f.op || 'eq') {
      case 'eq': return eq(v, val);
      case 'neq': return !eq(v, val);
      case 'in': return [].concat(val).some(function (x) { return eq(v, x); });
      case 'not_in': return ![].concat(val).some(function (x) { return eq(v, x); });
      case 'contains': return String(v == null ? '' : v).toLowerCase().indexOf(String(val).toLowerCase()) >= 0;
      case 'gt': return num(v) !== null && num(v) > num(val);
      case 'gte': return num(v) !== null && num(v) >= num(val);
      case 'lt': return num(v) !== null && num(v) < num(val);
      case 'lte': return num(v) !== null && num(v) <= num(val);
      case 'between': val = [].concat(val); if (num(v) !== null && num(val[0]) !== null && num(val[1]) !== null && typeof v === 'number') { return v >= num(val[0]) && v <= num(val[1]); } return String(v) >= String(val[0]) && String(v) <= String(val[1]);
      case 'is_null': return v === null || v === undefined || v === '';
      case 'not_null': return !(v === null || v === undefined || v === '');
      default: throw new Error('Unknown filter op "' + f.op + '"');
    }
  }
  function agg(list, m) {
    var op = m.op || 'sum';
    if (op === 'count') { return list.length; }
    if (op === 'count_if' || op === 'share') {
      var hit = list.filter(function (o) { return [].concat(m.value).some(function (x) { return eq(o[m.column], x); }); }).length;
      return op === 'count_if' ? hit : (list.length ? hit / list.length * 100 : null);
    }
    if (op === 'count_distinct') { var s = {}; list.forEach(function (o) { s[o[m.column]] = 1; }); return Object.keys(s).length; }
    var vals = list.map(function (o) { return num(o[m.column]); }).filter(function (v) { return v !== null; });
    if (!vals.length) { return null; }
    switch (op) {
      case 'sum': return vals.reduce(function (a, b) { return a + b; }, 0);
      case 'avg': return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      case 'min': return Math.min.apply(null, vals);
      case 'max': return Math.max.apply(null, vals);
      case 'median': vals.sort(function (a, b) { return a - b; }); var h = vals.length >> 1; return vals.length % 2 ? vals[h] : (vals[h - 1] + vals[h]) / 2;
      default: throw new Error('Unknown metric op "' + op + '"');
    }
  }
  function round(v) { return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v; }

  /**
   * run(spec, scope) -> { columns, rows, total_rows, truncated, table, note }
   * spec: { table, filters:[{column,op,value}], group_by:[col], metrics:[{op,column,as}],
   *         ratios:[{as,numerator,denominator,multiply}], sort:{by,dir}, limit, columns:[col], all_customers }
   * scope: { customerId, allowAllCustomers }
   */
  function run(spec, scope) {
    spec = spec || {}; scope = scope || {};
    var table = spec.table;
    var data = rows(table);
    var cols = columns(table);
    var filters = (spec.filters || []).slice();
    var note = [];
    if (cols.indexOf('customer_id') >= 0) {
      if (spec.all_customers && scope.allowAllCustomers) { note.push('all customers'); }
      else {
        filters.push({ column: 'customer_id', op: 'eq', value: scope.customerId });
        if (spec.all_customers) { note.push('limited to the current customer (other customers are not shown in this mode)'); }
      }
    }
    var allCols = cols.concat(['customer_id']);
    filters.forEach(function (f) { if (allCols.indexOf(f.column) < 0) { throw new Error('Unknown column "' + f.column + '" in ' + table + '. Columns: ' + cols.join(', ')); } });
    var list = data.filter(function (o) { return filters.every(function (f) { return test(o, f); }); });
    var out, outCols;
    var groups = spec.group_by ? [].concat(spec.group_by) : [];
    var metrics = spec.metrics || [];
    groups.concat(metrics.filter(function (m) { return m.column; }).map(function (m) { return m.column; })).forEach(function (c) {
      if (cols.indexOf(c) < 0) { throw new Error('Unknown column "' + c + '" in ' + table + '. Columns: ' + cols.join(', ')); }
    });
    if (groups.length || metrics.length) {
      if (!metrics.length) { metrics = [{ op: 'count', as: 'rows' }]; }
      metrics.forEach(function (m) {
        if ((m.op === 'share' || m.op === 'count_if') && (m.value === undefined || m.value === null || m.value === '')) { throw new Error('Metric "' + m.op + '" needs a value, e.g. {op:"share", column:"performance_flag", value:"LATE"}'); }
        m.as = m.as || (m.op + (m.column ? '_' + m.column : ''));
      });
      var map = {}, order = [];
      list.forEach(function (o) {
        var k = groups.map(function (g) { return o[g]; }).join('\u0001');
        if (!map[k]) { map[k] = []; order.push(k); }
        map[k].push(o);
      });
      if (!groups.length && !order.length) { order.push(''); map[''] = []; }
      out = order.map(function (k) {
        var g = map[k], r = {};
        groups.forEach(function (c) { r[c] = g.length ? g[0][c] : null; });
        metrics.forEach(function (m) { var v = agg(g, m); if (typeof v === 'number' && m.multiply !== undefined && m.multiply !== null && isFinite(+m.multiply)) { v = v * +m.multiply; } r[m.as] = round(v); });
        return r;
      });
      (spec.ratios || []).forEach(function (q) {
        out.forEach(function (r) {
          var a = num(r[q.numerator]), b = num(r[q.denominator]);
          r[q.as] = a !== null && b ? round(a / b * (q.multiply || 1)) : null;
        });
      });
      outCols = groups.concat(metrics.map(function (m) { return m.as; })).concat((spec.ratios || []).map(function (q) { return q.as; }));
    } else {
      outCols = spec.columns && spec.columns.length ? spec.columns : cols;
      out = list.map(function (o) { var r = {}; outCols.forEach(function (c) { r[c] = o[c]; }); return r; });
    }
    if (spec.sort && spec.sort.by) {
      var by = spec.sort.by, dir = /desc/i.test(spec.sort.dir || '') ? -1 : 1;
      out.sort(function (a, b) {
        var x = a[by], y = b[by];
        if (typeof x === 'number' && typeof y === 'number') { return (x - y) * dir; }
        return String(x).localeCompare(String(y)) * dir;
      });
    } else if (groups.length) {
      out.sort(function (a, b) { return String(a[groups[0]]).localeCompare(String(b[groups[0]])); });
    }
    var total = out.length, limit = Math.min(spec.limit || (groups.length || metrics.length ? 500 : 50), 1000);
    return { table: table, columns: outCols, rows: out.slice(0, limit), total_rows: total, truncated: total > limit, matched_source_rows: list.length, note: note.join('; ') };
  }

  // Compact description of every table for the model.
  function schema() {
    var dict = {};
    (F.dictionary || []).forEach(function (d) { (dict[d.sheet] = dict[d.sheet] || {})[d.field] = d.definition; });
    return Object.keys(T).map(function (t) {
      var r = rows(t), cs = columns(t);
      var desc = cs.map(function (c) {
        var vals = r.map(function (o) { return o[c]; }).filter(function (v) { return v !== null && v !== undefined && v !== ''; });
        var info = c;
        var nums = vals.filter(function (v) { return typeof v === 'number'; });
        if (nums.length && nums.length === vals.length) {
          info += ' (number ' + round(Math.min.apply(null, nums.slice(0, 20000))) + '..' + round(Math.max.apply(null, nums.slice(0, 20000))) + ')';
        } else {
          var u = {}; vals.forEach(function (v) { u[v] = 1; }); var k = Object.keys(u);
          info += k.length <= 12 ? ' [' + k.join(' | ') + ']' : ' (text, ' + k.length + ' distinct, e.g. ' + k.slice(0, 3).join(', ') + ')';
        }
        if (dict[t] && dict[t][c] && !/^See sheet context/.test(dict[t][c])) { info += ': ' + dict[t][c]; }
        return info;
      });
      return '### ' + t + ' (' + r.length + ' rows)\n- ' + desc.join('\n- ');
    }).join('\n\n');
  }

  window.LVR_QUERY = { run: run, schema: schema, tables: function () { return Object.keys(T); }, readme: F.readme || '' };
})();

/* Small SVG chart renderer for AI-made charts and dashboards (no external library, works offline).
 * render(widget, result) -> HTML string.
 * widget: { type: bar|hbar|line|pie|table|kpi, title, x, y:[cols], unit, note, status }
 * result: output of LVR_QUERY.run
 */
(function () {
  'use strict';
  var COLORS = ['#003F72', '#00A0C6', '#78BE20', '#FF7900', '#CA005D', '#6B8BA4', '#4FC3DD', '#A7D86A'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(v, unit) {
    if (v === null || v === undefined || v === '') { return 'n/a'; }
    if (typeof v !== 'number') { return esc(v); }
    var a = Math.abs(v), s;
    if (a >= 1e6) { s = (v / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M'; }
    else if (a >= 1e4) { s = (v / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'k'; }
    else if (a >= 100) { s = Math.round(v).toLocaleString('en-US'); }
    else { s = (Math.round(v * 10) / 10).toLocaleString('en-US'); }
    if (!unit) { return s; }
    if (unit === '€' || unit === 'EUR') { return '€' + s; }
    if (unit === '%') { return s + '%'; }
    return s + ' ' + esc(unit);
  }
  function label(s, max) { s = String(s == null ? '' : s); return s.length > max ? s.slice(0, max - 1) + '…' : s; }
  function pickY(w, res) {
    var y = w.y ? [].concat(w.y) : [];
    if (!y.length) { y = res.columns.filter(function (c) { return c !== w.x && res.rows.length && typeof res.rows[0][c] === 'number'; }).slice(0, 1); }
    return y.filter(function (c) { return res.columns.indexOf(c) >= 0; });
  }
  function pickX(w, res) { return w.x && res.columns.indexOf(w.x) >= 0 ? w.x : res.columns[0]; }
  function nice(max) {
    if (max <= 0) { return 1; }
    var p = Math.pow(10, Math.floor(Math.log10(max))), n = max / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function legend(ys) {
    if (ys.length < 2) { return ''; }
    return '<div class="ch-legend">' + ys.map(function (y, i) { return '<span><i style="background:' + COLORS[i % COLORS.length] + '"></i>' + esc(y.replace(/_/g, ' ')) + '</span>'; }).join('') + '</div>';
  }

  function bar(w, res, o) {
    var x = pickX(w, res), ys = pickY(w, res), rows = res.rows.slice(0, 40);
    var W = o && o.compact ? 420 : o && o.wide ? 1100 : 640, H = 260, L = 52, B = 56, Tp = 12, R = 8;
    var max = 0; rows.forEach(function (r) { ys.forEach(function (y) { max = Math.max(max, +r[y] || 0); }); });
    var top = nice(max / 4) * 4, iw = W - L - R, ih = H - Tp - B, band = iw / Math.max(rows.length, 1), bw = Math.min(46, band * 0.75 / ys.length);
    var g = '';
    for (var t = 0; t <= 4; t++) { var yy = Tp + ih - ih * t / 4; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="ch-grid"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" class="ch-ax" text-anchor="end">' + fmt(top * t / 4, w.unit === '%' ? '' : '') + '</text>'; }
    var step = Math.ceil(rows.length / (W < 500 ? 9 : 14));
    rows.forEach(function (r, i) {
      var cx = L + band * i + band / 2;
      ys.forEach(function (y, j) {
        var v = +r[y] || 0, h = ih * v / top, bx = cx - bw * ys.length / 2 + bw * j;
        g += '<rect x="' + bx.toFixed(1) + '" y="' + (Tp + ih - h).toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + Math.max(h, 0).toFixed(1) + '" rx="3" fill="' + COLORS[j % COLORS.length] + '"><title>' + esc(r[x]) + ': ' + fmt(r[y], w.unit) + '</title></rect>';
        if (rows.length <= 12 && ys.length === 1) { g += '<text x="' + cx + '" y="' + (Tp + ih - h - 5) + '" class="ch-val" text-anchor="middle">' + fmt(v, w.unit) + '</text>'; }
      });
      if (i % step === 0) {
        var rot = rows.length > 6;
        g += '<text class="ch-ax" ' + (rot ? 'transform="translate(' + cx + ',' + (Tp + ih + 12) + ') rotate(-35)" text-anchor="end"' : 'x="' + cx + '" y="' + (Tp + ih + 18) + '" text-anchor="middle"') + '>' + esc(label(r[x], rot ? 14 : 16)) + '</text>';
      }
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ch-svg" role="img">' + g + '</svg>' + legend(ys);
  }

  function hbar(w, res) {
    var x = pickX(w, res), y = pickY(w, res)[0], rows = res.rows.slice(0, 25);
    var max = 0; rows.forEach(function (r) { max = Math.max(max, +r[y] || 0); });
    return '<div class="ch-hbar">' + rows.map(function (r, i) {
      var v = +r[y] || 0, pct = max ? v / max * 100 : 0;
      return '<div class="hb-row"><span class="hb-l" title="' + esc(r[x]) + '">' + esc(label(r[x], 26)) + '</span><span class="hb-track"><span class="hb-fill" style="width:' + pct.toFixed(1) + '%;background:' + (i === 0 ? COLORS[0] : COLORS[1]) + '"></span></span><span class="hb-v">' + fmt(r[y], w.unit) + '</span></div>';
    }).join('') + '</div>';
  }

  function line(w, res, o) {
    var x = pickX(w, res), ys = pickY(w, res), rows = res.rows;
    var W = o && o.compact ? 420 : o && o.wide ? 1100 : 640, H = 250, L = 52, B = 40, Tp = 14, R = 14;
    var max = 0, min = 0; rows.forEach(function (r) { ys.forEach(function (y) { max = Math.max(max, +r[y] || 0); min = Math.min(min, +r[y] || 0); }); });
    var top = nice(max / 4) * 4, iw = W - L - R, ih = H - Tp - B, n = Math.max(rows.length - 1, 1), g = '';
    for (var t = 0; t <= 4; t++) { var yy = Tp + ih - ih * t / 4; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="ch-grid"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" class="ch-ax" text-anchor="end">' + fmt(top * t / 4) + '</text>'; }
    var step = Math.ceil(rows.length / (W < 500 ? 6 : 12));
    rows.forEach(function (r, i) { if (i % step === 0) { var lx = String(r[x]); if (/^\d{4}-\d{2}$/.test(lx)) { lx = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+lx.slice(5) - 1] + (rows.length > 12 ? ' ' + lx.slice(2, 4) : ''); } g += '<text x="' + (L + iw * i / n) + '" y="' + (Tp + ih + 18) + '" class="ch-ax" text-anchor="middle">' + esc(label(lx, 10)) + '</text>'; } });
    ys.forEach(function (y, j) {
      var pts = rows.map(function (r, i) { return [L + iw * i / n, Tp + ih - ih * (+r[y] || 0) / top]; });
      var c = COLORS[j % COLORS.length];
      if (ys.length === 1) { g += '<path d="M' + pts[0][0] + ',' + (Tp + ih) + ' L' + pts.map(function (p) { return p.join(','); }).join(' L') + ' L' + pts[pts.length - 1][0] + ',' + (Tp + ih) + 'Z" fill="' + c + '" opacity=".08"/>'; }
      g += '<polyline points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2.5" stroke-linejoin="round"/>';
      pts.forEach(function (p, i) { g += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="#fff" stroke="' + c + '" stroke-width="2"><title>' + esc(rows[i][x]) + ': ' + fmt(rows[i][y], w.unit) + '</title></circle>'; });
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ch-svg" role="img">' + g + '</svg>' + legend(ys);
  }

  function pie(w, res) {
    var x = pickX(w, res), y = pickY(w, res)[0], rows = res.rows.slice().sort(function (a, b) { return (+b[y] || 0) - (+a[y] || 0); });
    if (rows.length > 7) { var rest = rows.slice(6).reduce(function (s, r) { return s + (+r[y] || 0); }, 0); rows = rows.slice(0, 6); var o = {}; o[x] = 'Other'; o[y] = rest; rows.push(o); }
    var total = rows.reduce(function (s, r) { return s + (+r[y] || 0); }, 0) || 1, a0 = -Math.PI / 2, g = '';
    rows.forEach(function (r, i) {
      var v = +r[y] || 0, a1 = a0 + v / total * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
      var p = function (a, rad) { return (90 + rad * Math.cos(a)).toFixed(2) + ',' + (90 + rad * Math.sin(a)).toFixed(2); };
      if (v / total > 0.9999) { g += '<circle cx="90" cy="90" r="80" fill="' + COLORS[i % COLORS.length] + '"/>'; }
      else { g += '<path d="M' + p(a0, 80) + ' A80,80 0 ' + large + ' 1 ' + p(a1, 80) + ' L' + p(a1, 48) + ' A48,48 0 ' + large + ' 0 ' + p(a0, 48) + 'Z" fill="' + COLORS[i % COLORS.length] + '"><title>' + esc(r[x]) + ': ' + fmt(v, w.unit) + '</title></path>'; }
      a0 = a1;
    });
    var leg = rows.map(function (r, i) { return '<li><i style="background:' + COLORS[i % COLORS.length] + '"></i><span>' + esc(label(r[x], 28)) + '</span><b>' + Math.round((+r[y] || 0) / total * 100) + '%</b></li>'; }).join('');
    return '<div class="ch-pie"><svg viewBox="0 0 180 180" class="ch-donut"><g>' + g + '</g><text x="90" y="88" text-anchor="middle" class="ch-dn">' + fmt(total, w.unit) + '</text><text x="90" y="106" text-anchor="middle" class="ch-ax">total</text></svg><ul>' + leg + '</ul></div>';
  }

  function table(w, res) {
    var cols = res.columns.slice(0, 8), rows = res.rows.slice(0, 30);
    return '<div class="ch-table"><table><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c.replace(/_/g, ' ')) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + cols.map(function (c) { var v = r[c]; return '<td' + (typeof v === 'number' ? ' class="num"' : '') + '>' + (typeof v === 'number' ? fmt(v) : esc(v)) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table>' + (res.total_rows > rows.length ? '<p class="ch-more">Showing ' + rows.length + ' of ' + res.total_rows + ' rows</p>' : '') + '</div>';
  }

  function kpi(w, res) {
    var y = pickY(w, res)[0] || res.columns[res.columns.length - 1], v = res.rows.length ? res.rows[0][y] : null;
    return '<div class="ch-kpi"><span class="ch-kv">' + fmt(v, w.unit) + '</span>' + (w.subtitle ? '<span class="ch-ks">' + esc(w.subtitle) + '</span>' : '') + '</div>';
  }

  function render(w, res, opts) {
    opts = opts || {};
    var body;
    if (!res || res.error) { body = '<p class="ch-err">Could not build this chart: ' + esc(res && res.error) + '</p>'; }
    else if (!res.rows.length) { body = '<p class="ch-err">No matching data.</p>'; }
    else {
      try {
        body = ({ bar: bar, column: bar, hbar: hbar, line: line, pie: pie, donut: pie, table: table, kpi: kpi }[w.type] || bar)(w, res, opts);
      } catch (e) { body = '<p class="ch-err">Could not draw this chart: ' + esc(e.message) + '</p>'; }
    }
    var st = w.status ? '<span class="status st-' + esc(String(w.status).toUpperCase().split(/[ _]/)[0]) + '">' + esc(w.status) + '</span>' : '';
    return '<figure class="chart type-' + esc(w.type || 'bar') + (opts.cls ? ' ' + opts.cls : '') + '">' +
      '<figcaption><b>' + esc(w.title || 'Chart') + '</b>' + (opts.actions || '') + '</figcaption>' + body +
      ((w.note || st) ? '<p class="ch-note">' + st + (w.note ? '<span>' + esc(w.note) + '</span>' : '') + '</p>' : '') + '</figure>';
  }

  window.LVR_CHARTS = { render: render, fmt: fmt, COLORS: COLORS };
})();

/* Simple stroke icons (24×24), drawn for this app. */
(function () {
  'use strict';
  var P = {
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    euro: '<path d="M17.5 6.5A6.5 6.5 0 1 0 17.5 17.5"/><path d="M4 10h10M4 14h10"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    truck: '<path d="M3 6.5h11v9.5H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    chat: '<path d="M4 5h16v11H9.5L4 20z"/><path d="M8 9.5h8M8 12.5h5"/>',
    list: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.4"/>',
    sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16v4M16.5 18h4"/>',
    upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v4.5h16V15"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4 15v4.5h16V15"/>',
    leaf: '<path d="M5 19.5C5 11 11 5 20 4.5c0 9-6 15-14.5 15"/><path d="M5 19.5l7.5-7.5"/>',
    drop: '<path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    repeat: '<path d="M4.5 11.5a7.5 7.5 0 0 1 13.2-4.6L19.5 9"/><path d="M19.5 4.5V9H15"/><path d="M19.5 12.5a7.5 7.5 0 0 1-13.2 4.6L4.5 15"/><path d="M4.5 19.5V15H9"/>',
    shirt: '<path d="M8.5 4L12 6l3.5-2 4.5 3.2-2.2 3.8-2.3-1.2V20h-7V9.8L6.2 11 4 7.2z"/>',
    people: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5"/><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.3c1.8.6 3 2.6 3 5.2"/>',
    alert: '<path d="M12 4l8.5 15h-17z"/><path d="M12 10v4.2M12 16.8v.4"/>',
    shield: '<path d="M12 3.5l7.5 3v5.7c0 4.6-3.2 7.7-7.5 8.8-4.3-1.1-7.5-4.2-7.5-8.8V6.5z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    gauge: '<path d="M4 17.5a8 8 0 1 1 16 0"/><path d="M12 17.5l4-5.5"/>',
    box: '<path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9"/>',
    arrow: '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'
  };
  function svg(name, size) {
    var s = size || 20;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.info) + '</svg>';
  }
  function hydrate(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
      if (!el.firstChild) { el.innerHTML = svg(el.getAttribute('data-icon'), +el.getAttribute('data-size') || 20); }
    });
  }
  window.LVR_ICONS = { svg: svg, hydrate: hydrate };
})();

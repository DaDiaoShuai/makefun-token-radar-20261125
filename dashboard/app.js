// Token Radar dashboard: renders window.RADAR (written by main.ts) with no
// network. Board, detail view, live-token comparison and the model page are
// one static page; the URL hash carries the view, so a link opens the same
// board, detail or filter a screenshot shows.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R || !R.rows) {
    document.body.innerHTML = '<p style="padding:40px">Radar data did not load.</p>';
    return;
  }
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n === null || n === undefined) return '&mdash;';
    var cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function age(n) {
    if (n === null || n === undefined) return '&mdash;';
    if (n >= 365) return (n / 365).toFixed(1) + 'y';
    return n + 'd';
  }

  // ---- header, stats ------------------------------------------------------
  $('asof').textContent = R.as_of;
  $('modelver').textContent = R.model_version;
  var top = R.rows[0];
  var medianImplied = R.rows.slice().sort(function (a, b) { return a.implied_value_usd - b.implied_value_usd; })[Math.floor(R.rows.length / 2)].implied_value_usd;
  $('stats').innerHTML =
    stat(R.board_size, 'protocols ranked') +
    stat(R.watchlist_size, 'on the watchlist') +
    stat(R.early_size, 'early finds below the floor') +
    stat(money(medianImplied), 'median implied value');
  function stat(b, label) {
    return '<div class="stat"><b>' + esc(b) + '</b><span>' + esc(label) + '</span></div>';
  }

  // ---- filter controls ----------------------------------------------------
  var cats = [], chains = [];
  R.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  cats.forEach(function (c) { $('cat').appendChild(opt(c, c)); });
  chains.forEach(function (c) { $('chain').appendChild(opt(c, c)); });
  function opt(v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; return o; }

  var state = { q: '', cat: '', chain: '', sort: 'implied', watch: false, detail: null, view: 'board' };
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv.length !== 2) return;
      var k = kv[0], v = decodeURIComponent(kv[1].replace(/\+/g, ' '));
      if (k === 'q') state.q = v;
      if (k === 'cat') state.cat = v;
      if (k === 'chain') state.chain = v;
      if (k === 'sort') state.sort = v;
      if (k === 'watch') state.watch = v === '1';
      if (k === 'detail') state.detail = v;
      if (k === 'view') state.view = v;
    });
  }
  function writeHash() {
    var parts = [];
    if (state.view !== 'board') parts.push('view=' + state.view);
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain) parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.sort !== 'implied') parts.push('sort=' + state.sort);
    if (state.watch) parts.push('watch=1');
    if (state.detail) parts.push('detail=' + encodeURIComponent(state.detail));
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : '#');
  }
  readHash();
  $('q').value = state.q; $('cat').value = state.cat; $('chain').value = state.chain;
  $('sort').value = state.sort; $('watch').checked = state.watch;

  // ---- board ---------------------------------------------------------------
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = R.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    if (state.sort === 'tvl') list.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (state.sort === 'growth') list.sort(function (a, b) { return (b.change_7d || -9999) - (a.change_7d || -9999); });
    else if (state.sort === 'age') list.sort(function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); });
    else list.sort(function (a, b) { return a.rank - b.rank; });
    return list;
  }

  function renderBoard() {
    var list = filtered();
    $('count').textContent = 'Showing ' + list.length + ' of ' + R.rows.length + ' ranked protocols' +
      (state.watch ? ' (watchlist only)' : '') + (state.cat ? ' in ' + state.cat : '') +
      (state.chain ? ' on ' + state.chain : '') + '.';
    $('rows').innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
        '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '&mdash;') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num">' + r.sector_multiple.toFixed(3) + '&times;</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td></tr>';
    }).join('');
    Array.prototype.forEach.call($('rows').querySelectorAll('tr'), function (tr) {
      tr.addEventListener('click', function () { select(tr.getAttribute('data-slug'), true); });
    });
  }

  function select(slug, scroll) {
    state.detail = slug;
    var r = null;
    R.rows.forEach(function (row) { if (row.slug === slug) r = row; });
    var box = $('detail');
    if (!r) { box.hidden = true; return; }
    var m = r.model;
    box.innerHTML =
      '<h2>#' + r.rank + ' &middot; ' + esc(r.name) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorised') + ' &middot; ' + esc(r.chains.join(', ')) +
      ' &middot; TVL ' + money(r.tvl_usd) + ' &middot; 7-day ' + (r.change_7d === null ? 'not reported' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') +
      ' &middot; tracked ' + (r.age_days === null ? 'since an unknown date' : 'for ' + r.age_days + ' days') +
      ' with no token recorded.</p>' +
      '<h3>Why it is worth ' + money(r.implied_value_usd) + '</h3>' +
      '<div class="breakdown">' +
      factor(money(r.tvl_usd), 'TVL, the base') +
      factor(r.sector_multiple.toFixed(3) + '&times;', 'sector multiple &middot; ' + r.sector_peers + ' live peers') +
      factor(m.growth_multiplier.toFixed(2) + '&times;', 'growth &middot; ' + m.growth_pct.toFixed(1) + '% in 7 days') +
      factor(m.maturity_multiplier.toFixed(2) + '&times;', 'maturity &middot; ' + age(r.age_days) + ' with no token') +
      factor(m.breadth_multiplier.toFixed(2) + '&times;', 'breadth &middot; ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's')) +
      '</div>' +
      '<p class="meta">Sector multiple: the median market-cap / TVL of live ' + esc(r.category || 'Uncategorised') +
      ' protocols in this snapshot' + (r.sector_peers < 5 ? ', falling back to the whole live set (median ' + R.global_multiple.toFixed(3) + '&times;)' : '') +
      '. Implied value is the model&rsquo;s claim from these figures, not a prediction of a launch or a price.</p>' +
      '<h3>Farm plan &middot; 7 steps</h3>' +
      '<ol class="steps">' + r.farm_plan.map(function (s) {
        return '<li>' + esc(s.text) + '<span class="cost">Cost: ' + esc(s.cost) + ' &middot; Time: ' + esc(s.time) + '</span></li>';
      }).join('') + '</ol>';
    box.hidden = false;
    renderBoardSel();
    writeHash();
    if (scroll) window.scrollTo(0, box.getBoundingClientRect().top + window.scrollY - 16);
  }
  function factor(b, label) {
    return '<div class="factor"><b>' + b + '</b><span>' + label + '</span></div>';
  }
  function renderBoardSel() {
    Array.prototype.forEach.call($('rows').querySelectorAll('tr'), function (tr) {
      tr.classList.toggle('sel', tr.getAttribute('data-slug') === state.detail);
    });
  }

  // ---- live view ------------------------------------------------------------
  $('live-rows').innerHTML = R.live.map(function (p) {
    return '<tr><td><strong>' + esc(p.name) + '</strong><br><span class="slug">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '&mdash;') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + p.mcap_tvl.toFixed(3) + '&times;</td>' +
      '<td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  // ---- model view -----------------------------------------------------------
  var M = R.model;
  $('factors').innerHTML =
    factorCard('Sector multiple', 'Median market-cap / TVL of live protocols in the same category (min. ' + M.min_peers + ' peers, else the live set&rsquo;s median ' + R.global_multiple.toFixed(3) + '&times;), clamped to ' + M.sector_min + '&ndash;' + M.sector_max + '.') +
    factorCard('Growth', '1 + ' + M.growth_weight + ' &times; 7-day TVL change, clamped to ' + M.growth_floor + '%&hellip;+' + M.growth_cap + '%. A protocol growing 50% in a week scores 1.30&times;.') +
    factorCard('Maturity', '0.75 + 0.25 &times; min(age, ' + M.maturity_days + ' days) / ' + M.maturity_days + '. Two years with no token scores the full 1.00&times;; an unknown listing date scores ' + M.unknown_age_mult + '&times;.') +
    factorCard('Breadth', '1 + ' + M.breadth_step + ' per extra chain, up to ' + M.breadth_max_extra + ' extra chains (max 1.20&times;). More chains means more places a token would land.');
  function factorCard(b, label) {
    return '<div class="factor"><b>' + b + '</b><span>' + label + '</span></div>';
  }
  $('sector-rows').innerHTML = R.sectors.map(function (s) {
    return '<tr><td>' + esc(s.category) + '</td><td class="num">' + s.peers + '</td><td class="num">' + s.multiple.toFixed(3) + '&times;</td><td>' + (s.from_category ? 'This category&rsquo;s live peers' : 'Whole live set (too few peers)') + '</td></tr>';
  }).join('');
  $('coverage').textContent = 'The board ranks ' + R.board_size + ' protocols: all ' + R.watchlist_size +
    ' on the watchlist, plus ' + R.early_size + ' early protocols below the $' + (R.floor_usd / 1e6) +
    'M floor, found by TVL. Protocols above the floor that the house screen left out (wrapped, staked, bridged, versioned or exchange products) are not re-ranked: the snapshot&rsquo;s screen already settled them.';

  // ---- tabs + controls ------------------------------------------------------
  function showView(v) {
    state.view = v;
    ['board', 'live', 'model'].forEach(function (name) {
      $('view-' + name).hidden = name !== v;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('on', t.getAttribute('data-view') === v);
    });
    writeHash();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.addEventListener('click', function () { showView(t.getAttribute('data-view')); });
  });
  $('q').addEventListener('input', function () { state.q = $('q').value; renderBoard(); writeHash(); });
  $('cat').addEventListener('change', function () { state.cat = $('cat').value; renderBoard(); writeHash(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; renderBoard(); writeHash(); });
  $('sort').addEventListener('change', function () { state.sort = $('sort').value; renderBoard(); writeHash(); });
  $('watch').addEventListener('change', function () { state.watch = $('watch').checked; renderBoard(); writeHash(); });

  renderBoard();
  showView(['board', 'live', 'model'].indexOf(state.view) >= 0 ? state.view : 'board');
  if (state.detail) select(state.detail, true);
})();

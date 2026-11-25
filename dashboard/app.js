// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, wlOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // Value tier from rank: the board's top 10 are the S tier, the next 40 A, the next 100 B, the rest C.
  function tierOf(rank) {
    if (rank <= 10) return 'S';
    if (rank <= 50) return 'A';
    if (rank <= 150) return 'B';
    return 'C';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The category median is recomputed here from the board's own rows, as main.ts computes it.
  function categoryMedian(category) {
    var values = DATA.rows.filter(function (r) { return (r.category || 'Other') === category && r.change_7d !== null && r.change_7d !== undefined && isFinite(r.change_7d); }).map(function (r) { return r.change_7d; }).sort(function (a, b) { return a - b; });
    if (values.length < DATA.model.relative_min_count) return null;
    var mid = Math.floor(values.length / 2);
    return values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  }
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var extraChains = Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains);
    var breadth = 1 + extraChains * model.breadth_step;
    var velocity = growth > model.velocity_threshold && age < model.velocity_age_days ? model.velocity_multiplier : 1;
    var median = categoryMedian(row.category || 'Other');
    var relGrowth = median === null ? 0 : Math.min(model.relative_cap, Math.max(model.relative_floor, growth - median));
    var relative = 1 + (relGrowth / 100) * model.relative_weight;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * breadth * velocity * relative));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + "'s chain and use it in the chain's main app.";
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Load $' + capital + ' onto ' + name + ' on ' + chain + ' and spend a small amount through it.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $20 against the deposit on ' + name + ' and repay it the same week, so the position shows both sides.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Swap $25 through ' + name + "'s main pool on " + chain + ' once, using the same wallet as the liquidity position.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $25 back the other way through ' + name + ' once, so the wallet shows a round trip.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim or restake the staking rewards on ' + name + ' once, so the wallet shows an active stake.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return 'Close the hedge on ' + name + ' after two weeks and open a fresh one half the size.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market on ' + name + ' and place a second position in a different market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit a further $25 into a second ' + name + ' vault on ' + chain + ' in the second month.';
    if (c.indexOf('stable') >= 0) return 'Swap $25 of the stable asset through ' + name + ' on ' + chain + ' once, from the same wallet.';
    if (c.indexOf('rwa') >= 0) return 'Reinvest the first yield payout from ' + name + ' back into the same asset on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Renew or top up the cover on ' + name + ' once before the first policy ends.';
    if (c.indexOf('chain') >= 0) return 'Make one swap and one transfer on ' + name + "'s chain from the same wallet in the first month.";
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Make a second small spend through ' + name + ' in a different week from the first.';
    return 'Make one extra on-chain action on ' + name + ' on ' + chain + ', such as a swap or a vote, from the same wallet.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, chain), cost: 'about $2 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind in two halves a week apart.', cost: 'nothing but the log, plus about $4 of gas to exit', time: '5 minutes to log, 15 minutes to exit' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('min')) state.minTvl = parseInt(params.get('min'), 10) || 0;
    if (params.get('wl') === '1') state.wlOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('min', String(state.minTvl));
    if (state.wlOnly) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wlOnly && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, down to the smallest in the snapshot. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function topThree() {
    var top = DATA.rows.slice(0, 3);
    return el('section', { class: 'top3', 'aria-label': 'Top three by implied value' },
      top.map(function (r) {
        return el('button', { class: 'top3-card', type: 'button', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'top3-rank', text: '#' + r.rank + '  ·  Tier ' + tierOf(r.rank) }),
          el('b', { class: 'top3-name', text: r.name }),
          el('span', { class: 'num top3-value', text: fmtUsd(r.implied_value_usd) + ' implied' }),
          el('span', { class: 'sub', text: fmtUsd(r.tvl_usd) + ' TVL  ·  ' + fmtPct(r.change_7d) + ' in 7d  ·  ' + (r.chains && r.chains.length ? r.chains[0] : 'one chain') })
        );
      })
    );
  }

  // Fastest movers: the board's five quickest growers over seven days, whatever their rank. A small
  // protocol moving fast is the early signal; its rank says whether the value has caught up yet.
  function movers() {
    var fast = DATA.rows.filter(function (r) { return r.change_7d !== null && r.change_7d !== undefined && isFinite(r.change_7d); })
      .sort(function (a, b) { return b.change_7d - a.change_7d || b.implied_value_usd - a.implied_value_usd; })
      .slice(0, 5);
    return el('section', { class: 'movers', 'aria-label': 'Fastest movers over seven days' },
      el('h2', { class: 'movers-title', text: 'Fastest movers · 7d' }),
      fast.map(function (r) {
        return el('button', { class: 'mover', type: 'button', onclick: function () { openDetail(r.slug); } },
          el('b', { text: r.name }),
          el('span', { class: 'num ' + (r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
          el('span', { class: 'sub', text: 'Rank ' + r.rank + ' · ' + fmtUsd(r.implied_value_usd) })
        );
      })
    );
  }

  // Category summary: how many board rows each large category holds, its median seven-day growth,
  // and its strongest protocol. The medians are the same ones the relative factor uses.
  function categorySummary() {
    var groups = {};
    DATA.rows.forEach(function (r) {
      var key = r.category || 'Other';
      if (!groups[key]) groups[key] = { name: key, rows: [], growths: [] };
      groups[key].rows.push(r);
      if (r.change_7d !== null && r.change_7d !== undefined && isFinite(r.change_7d)) groups[key].growths.push(r.change_7d);
    });
    var list = Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return b.rows.length - a.rows.length; })
      .slice(0, 6);
    var tbody = el('tbody');
    list.forEach(function (g) {
      var sorted = g.growths.slice().sort(function (a, b) { return a - b; });
      var mid = Math.floor(sorted.length / 2);
      var median = sorted.length === 0 ? null : sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      tbody.appendChild(el('tr', null,
        el('td', null, el('b', { text: g.name })),
        el('td', { class: 'num', text: String(g.rows.length) }),
        el('td', { class: 'num ' + (median !== null && median >= 0 ? 'pos' : 'neg'), text: fmtPct(median) }),
        el('td', null, el('span', { text: g.rows[0].name + ' (' + fmtUsd(g.rows[0].implied_value_usd) + ')' }))
      ));
    });
    return el('div', { class: 'cats' },
      el('h3', { text: 'Categories on the board' }),
      el('table', { class: 'cats-table' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Category' }),
          el('th', { scope: 'col', text: 'Rows' }),
          el('th', { scope: 'col', text: 'Median 7d' }),
          el('th', { scope: 'col', text: 'Strongest' })
        )),
        tbody
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search the board', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'mintvl', 'aria-label': 'Minimum TVL' },
      [['0', 'Any TVL'], ['50000000', '$50M+ TVL'], ['100000000', '$100M+ TVL'], ['1000000000', '$1B+ TVL']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: String(state.minTvl) === o[0] ? 'selected' : null });
      })
    );
    tvlSelect.addEventListener('change', function () { state.minTvl = parseInt(tvlSelect.value, 10) || 0; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'wl', checked: state.wlOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.wlOnly = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Minimum TVL' }), tvlSelect),
      el('label', { class: 'check' }, wl, ' Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.wlOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.watchlist ? '  ·  watchlist' : '') })
        )),
        el('td', null, el('span', { class: 'tier tier-' + tierOf(r.rank).toLowerCase(), text: tierOf(r.rank) })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            el('th', { scope: 'col', text: 'Tier' }),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x breadth x velocity x relative )'
      ),
      el('p', { class: 'sub', text: 'Breadth is 1 + 0.03 per extra chain, up to 5 extra chains: a protocol live on more chains is distributed more widely. Velocity is 1.10 when seven-day growth tops 25% and the protocol is under two years old: young and fast-growing is the early signal this radar is for. Relative is 1 + clamp(growth - category median, -30, 60) / 100 x 0.3: a protocol growing faster than its own category earns a premium, one lagging its peers pays for it; a category with fewer than 3 protocols reporting growth scores a neutral 1. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol in the snapshot, not just the watchlist, and the live-token protocols are set aside with their market caps shown.' }),
      categorySummary()
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function multBar(label, value, max) {
    var pct = Math.max(4, Math.min(100, Math.round((value / max) * 100)));
    return el('div', { class: 'mult' },
      el('span', { text: label }),
      el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + pct + '%' })),
      el('b', { class: 'num', text: value.toFixed(2) + 'x' })
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + '  ·  Tier ' + tierOf(row.rank) + (row.watchlist ? '  ·  Watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('div', { class: 'mults' },
        multBar('Growth', row.growth_multiplier, 1.72),
        multBar('Maturity', row.maturity_multiplier, 1),
        multBar('Breadth', row.breadth_multiplier, 1.15),
        multBar('Velocity', row.velocity_multiplier, 1.1),
        multBar('Relative', row.relative_multiplier, 1.18)
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Notes on the record' }),
      el('ul', { class: 'notes' }, (row.notes || ['A steady record: no single figure in the snapshot stands out, for better or worse.']).map(function (n) {
        return el('li', { text: n });
      })),
      el('p', { class: 'sub', text: 'Notes follow from the snapshot figures alone: chains, seven-day growth, age and TVL. They are readings, not advice, and never a promise of a token.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // How to use this radar: a short guide for a reader who just arrived, in the order they need it.
  function guidePanel() {
    return el('section', { class: 'panel guide' },
      el('h2', { text: 'How to use this radar' }),
      el('ol', { class: 'guide-steps' },
        el('li', null, el('b', { text: 'Start at the top. ' }), 'Rank 1 is the strongest implied value; the S tier is the board\'s head, the C tier its long tail.'),
        el('li', null, el('b', { text: 'Check the movers. ' }), 'A small protocol growing fast can be the early find; its rank says whether the value has caught up yet.'),
        el('li', null, el('b', { text: 'Open the detail. ' }), 'Every row shows the five multipliers behind its number, the farm plan with costs and times, and notes on its record.'),
        el('li', null, el('b', { text: 'Filter before you farm. ' }), 'Search, category, chain, minimum TVL and watchlist-only narrow the board to what fits your wallet and chains.'),
        el('li', null, el('b', { text: 'Remember what it is. ' }), 'An implied value is the entry\'s own model, not a price and not a promise that a token is coming.')
      ),
      el('h2', { text: 'What each multiplier means' }),
      el('ol', { class: 'guide-steps' },
        el('li', null, el('b', { text: 'Growth. ' }), 'Seven-day TVL change, clamped between -60% and +120%: the momentum the snapshot can see.'),
        el('li', null, el('b', { text: 'Maturity. ' }), 'Time running with no token on record, up to three years: the longer the record, the more the waiting itself is worth.'),
        el('li', null, el('b', { text: 'Breadth. ' }), 'One chain earns the base; each extra chain adds 3%, up to five chains: distribution against a single-chain halt.'),
        el('li', null, el('b', { text: 'Velocity. ' }), 'A 10% premium for a young protocol growing fast, where growth is a signal rather than a habit.'),
        el('li', null, el('b', { text: 'Relative. ' }), 'Growth above or below the protocol\'s own category median: a rise that beats its peers is worth more than one that follows them.')
      )
    );
  }

  // The page footer: where the numbers came from, which model scored them, and what they are not.
  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '; model ' + DATA.model_version + ' scores every row from the snapshot figures alone.' }),
      el('p', { text: 'Implied value is the entry\'s own claim, never a price and never a promise that a token is coming. A protocol is described as recording no token, never as having none.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(topThree());
    if (state.tab === 'pre-token') shell.appendChild(movers());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    if (state.tab === 'pre-token') shell.appendChild(guidePanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();

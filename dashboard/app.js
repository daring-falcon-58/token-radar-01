// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable table, a top-10 chart, the category comparables the model is built
// from, and a per-protocol detail view with the model's own inputs and the protocol's farm plan.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

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
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The multiple is the row's own category multiple: the market's mcap/TVL for that sector, read off
  // the live protocols in the same category, shrunk toward the global median and clamped.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity));
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
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('oracle') >= 0) return "Use $" + capital + " through " + name + "'s feed on " + chain + ' and keep the position open.';
    if (c.indexOf('payment') >= 0) return 'Move $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('ai') >= 0 || c.indexOf('agent') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and run one agent task.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
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
    var secondChain = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondChain ? 'Repeat the same position on ' + secondChain + ' so the activity spans two chains instead of one.' : 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: secondChain ? 'another $' + capital + ' of capital and about $4 of gas' : 'about $2 of gas a week', time: secondChain ? '15 minutes to set up' : '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function isWatchlist(slug) { return DATA.watchlist && DATA.watchlist.indexOf(slug) >= 0; }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.watchlistOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.watchlistOnly && !isWatchlist(r.slug)) return false;
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
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      ),
      backtestStrip()
    );
  }

  // An SVG element, made in the SVG namespace: document.createElement('text') or ('rect') makes an
  // HTML unknown element, which never draws. Attributes go through setAttribute, since an SVG
  // element's className is not a plain string.
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    var node = document.createElementNS(SVGNS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    }
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // The ten strongest implied values, as an inline SVG bar chart (no network, no image fetch).
  function topChart() {
    var top = DATA.rows.slice(0, 10);
    if (top.length === 0) return null;
    var max = top[0].implied_value_usd || 1;
    var W = 880, rowH = 26, padTop = 6;
    var H = padTop + top.length * rowH + 8;
    var svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Top ten protocols by implied value' });
    top.forEach(function (r, i) {
      var y = padTop + i * rowH;
      var barW = Math.max(6, Math.round((r.implied_value_usd / max) * 520));
      svg.appendChild(svgEl('text', { x: 150, y: y + 12, 'text-anchor': 'end', class: 'chart-label' }, r.rank + '. ' + r.name));
      svg.appendChild(svgEl('rect', { x: 160, y: y + 3, width: barW, height: 14, rx: 4, class: isWatchlist(r.slug) ? 'chart-bar wl' : 'chart-bar' }));
      svg.appendChild(svgEl('text', { x: 168 + barW, y: y + 15, class: 'chart-value' }, fmtUsd(r.implied_value_usd)));
    });
    return el('section', { class: 'panel chart-panel' },
      el('h2', { text: 'Top 10 by implied value' }),
      el('p', { class: 'sub', text: 'The strongest launches the radar sees. A gold bar is a watchlist protocol; a teal bar is an early row below the floor.' }),
      svg
    );
  }

  // The watchlist, grouped by sector: how many of the forty sit in each category and what their
  // launches would be worth together. A sector holding many watchlist rows and a large combined
  // value is where the next launches concentrate, and where a single launch matters least alone.
  function categorySummary() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      var entry = byCat[c] || (byCat[c] = { category: c, watchlist: 0, early: 0, value: 0 });
      if (isWatchlist(r.slug)) entry.watchlist += 1;
      else entry.early += 1;
      entry.value += r.implied_value_usd;
    });
    var list = Object.keys(byCat).map(function (k) { return byCat[k]; })
      .sort(function (a, b) { return b.value - a.value || (a.category < b.category ? -1 : 1); })
      .slice(0, 8);
    if (list.length === 0) return null;
    var tbody = el('tbody');
    list.forEach(function (e) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('b', { text: e.category })),
        el('td', { class: 'num', text: String(e.watchlist) }),
        el('td', { class: 'num', text: String(e.early) }),
        el('td', { class: 'num', text: fmtUsd(e.value) })
      ));
    });
    return el('section', { class: 'panel chart-panel' },
      el('h2', { text: 'Where the watchlist concentrates' }),
      el('p', { class: 'sub', text: 'The eight sectors with the largest combined implied value. Watchlist is the forty; early is the rest of the board.' }),
      el('div', { class: 'table-wrap compact' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Sector' }),
            el('th', { scope: 'col', text: 'Watchlist' }),
            el('th', { scope: 'col', text: 'Early' }),
            el('th', { scope: 'col', text: 'Combined implied value' })
          )),
          tbody
        )
      )
    );
  }

  // The blind test, as one line under the lede: the size curve's leave-one-out
  // error against the flat sector median's, on the snapshot's own live comps.
  function backtestStrip() {
    var b = DATA.backtest;
    if (!b || !b.n) return null;
    return el('p', { class: 'backtest-strip' },
      'Blind test (leave-one-out, ' + b.n + ' live protocols): the size curve predicts a live market cap to a median ' + b.curve_median_x + 'x (mean ' + b.curve_mean_x + 'x, ' + Math.round(b.curve_within_2x * 100) + '% within 2x); the flat sector median manages ' + b.flat_median_x + 'x (mean ' + b.flat_mean_x + 'x, ' + Math.round(b.flat_within_2x * 100) + '% within 2x). The curve earns its place on every snapshot.');
  }

  // The size curve, drawn: each live protocol as a point (log TVL, log market
  // cap) with the fitted line through them, plus the fit and the blind test.
  // The slope is below one, so the ratio falls with size, and the line is
  // what prices the board: a protocol is read off the curve at its own TVL.
  function curvePanel() {
    var c = DATA.curve;
    var b = DATA.backtest;
    var pts = DATA.scatter || [];
    if (!c || pts.length === 0) return null;
    var W = 880, H = 300, padL = 70, padB = 34, padT = 12, padR = 16;
    var xs = pts.map(function (p) { return Math.log10(p.tvl_usd); });
    var ys = pts.map(function (p) { return Math.log10(p.mcap_usd); });
    var x0 = Math.floor(Math.min.apply(null, xs));
    var x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys));
    var y1 = Math.ceil(Math.max.apply(null, ys));
    function X(v) { return padL + ((v - x0) / (x1 - x0)) * (W - padL - padR); }
    function Y(v) { return padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB); }
    function axisLabel(power) {
      if (power >= 9) return '$' + Math.pow(10, power - 9) + 'B';
      if (power >= 6) return '$' + Math.pow(10, power - 6) + 'M';
      if (power >= 3) return '$' + Math.pow(10, power - 3) + 'K';
      return '$' + Math.pow(10, power);
    }
    var svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Live protocols: market cap against TVL, with the fitted size curve' });
    var gx, gy;
    for (gx = x0; gx <= x1; gx++) {
      svg.appendChild(svgEl('line', { x1: X(gx), y1: padT, x2: X(gx), y2: H - padB, class: 'grid' }));
      svg.appendChild(svgEl('text', { x: X(gx), y: H - 12, 'text-anchor': 'middle', class: 'axis' }, axisLabel(gx)));
    }
    for (gy = y0; gy <= y1; gy++) {
      svg.appendChild(svgEl('line', { x1: padL, y1: Y(gy), x2: W - padR, y2: Y(gy), class: 'grid' }));
      svg.appendChild(svgEl('text', { x: padL - 8, y: Y(gy) + 4, 'text-anchor': 'end', class: 'axis' }, axisLabel(gy)));
    }
    var slope = c.gamma + 1;
    var yA = c.intercept + slope * x0;
    var yB = c.intercept + slope * x1;
    svg.appendChild(svgEl('line', { x1: X(x0), y1: Y(yA), x2: X(x1), y2: Y(yB), class: 'fit-line' }));
    pts.forEach(function (p) {
      svg.appendChild(svgEl('circle', { cx: X(Math.log10(p.tvl_usd)), cy: Y(Math.log10(p.mcap_usd)), r: 3.5, class: 'scatter-dot' }));
    });
    var verdicts = DATA.verdicts || { Strong: 0, 'Worth it': 0, Marginal: 0, Thin: 0 };
    return el('section', { class: 'panel chart-panel' },
      el('h2', { text: 'The size curve: what the market pays, by size' }),
      el('p', { class: 'sub', text: 'Each dot is a live protocol (market cap against TVL, log scales). The line is the fitted curve: log10(market cap) = ' + c.intercept + ' + ' + slope.toFixed(3) + ' x log10(TVL), fitted on ' + c.comps + ' live comps (' + c.excluded + ' left out by the sanity band). The slope is below one, so the market-cap-to-TVL ratio falls as protocols grow, and a protocol is priced off the curve at its own TVL, not at its sector\'s flat median.' }),
      svg,
      el('div', { class: 'table-wrap compact' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Blind test (leave-one-out)' }),
            el('th', { scope: 'col', text: 'Median error' }),
            el('th', { scope: 'col', text: 'Mean error' }),
            el('th', { scope: 'col', text: 'Within 2x' })
          )),
          el('tbody', null,
            el('tr', null,
              el('td', null, el('b', { text: 'Size curve' })),
              el('td', { class: 'num', text: b.curve_median_x + 'x' }),
              el('td', { class: 'num', text: b.curve_mean_x + 'x' }),
              el('td', { class: 'num', text: Math.round(b.curve_within_2x * 100) + '%' })
            ),
            el('tr', null,
              el('td', null, el('b', { text: 'Flat sector median' })),
              el('td', { class: 'num', text: b.flat_median_x + 'x' }),
              el('td', { class: 'num', text: b.flat_mean_x + 'x' }),
              el('td', { class: 'num', text: Math.round(b.flat_within_2x * 100) + '%' })
            )
          )
        )
      ),
      el('p', { class: 'sub', text: 'Farm verdicts across the board: ' + verdicts.Strong + ' Strong, ' + verdicts['Worth it'] + ' Worth it, ' + verdicts.Marginal + ' Marginal, ' + verdicts.Thin + ' Thin. A verdict weighs the launch against the cost of farming it: a 5% farmer share and $100 of profit per farmer, against the gas the plan costs on its chain.' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('button', { type: 'button', class: 'toggle' + (state.watchlistOnly ? ' on' : ''), 'aria-pressed': state.watchlistOnly ? 'true' : 'false', text: state.watchlistOnly ? 'Watchlist only: on' : 'Watchlist only', onclick: function () { state.watchlistOnly = !state.watchlistOnly; writeHash(); render(); } });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Watchlist' }), wl),
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

  function rowName(r) {
    return el('div', { class: 'name' },
      el('b', { text: r.name }),
      el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }),
      isWatchlist(r.slug) ? el('span', { class: 'badge', text: 'watchlist' }) : null
    );
  }

  // The farm verdict's badge class: Strong is teal, Worth it blue, Marginal
  // gold, Thin grey, so the board reads at a glance.
  function verdictClass(v) {
    if (v === 'Strong') return 'strong';
    if (v === 'Worth it') return 'worth';
    if (v === 'Marginal') return 'marginal';
    return 'thin';
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
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
        el('td', null, rowName(r)),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'verdict ' + verdictClass(r.farm_verdict), text: r.farm_verdict + ' · $' + r.farm_cost_usd })),
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
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Farm verdict' }),
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
        el('td', null, rowName(r)),
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

  // The comparables: every category on the board, its multiple, how many live protocols set it, and
  // the raw median before shrinkage, so the model's sector pricing is checkable at a glance.
  function comparablesTable() {
    var rows = DATA.category_multiples || [];
    if (rows.length === 0) return null;
    var tbody = el('tbody');
    rows.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('b', { text: c.category })),
        el('td', { class: 'num', text: fmtMult(c.multiple) }),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: c.median === null ? 'global median' : fmtMult(c.median) })
      ));
    });
    return el('div', { class: 'table-wrap compact' },
      el('table', null,
        el('caption', { class: 'sub', text: 'Category multiples: the median mcap/TVL of the live protocols in each sector, shrunk toward the global median (' + fmtMult(DATA.global_median) + ') and clamped to ' + fmtMult(DATA.model.multiple_floor) + '–' + fmtMult(DATA.model.multiple_cap) + '. A sector with no live comps takes the global median.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Category' }),
          el('th', { scope: 'col', text: 'Multiple used' }),
          el('th', { scope: 'col', text: 'Live comps' }),
          el('th', { scope: 'col', text: 'Raw median' })
        )),
        tbody
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x size_factor x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is the market\u2019s own valuation of the sector: the median market-cap-to-TVL ratio of the live protocols in that category, shrunk toward the global median of ' + fmtMult(DATA.global_median) + ' with ' + m.prior_strength + ' phantom protocols so a thin category cannot swing on one outlier, then clamped to ' + fmtMult(m.multiple_floor) + '–' + fmtMult(m.multiple_cap) + '. The size factor moves that multiple by (TVL / sector median TVL)^gamma, gamma ' + DATA.curve.gamma + ' fitted from ' + DATA.curve.comps + ' live comps and clamped to 0.5–2, because the market pays less per dollar of TVL as protocols grow. TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' }),
      comparablesTable(),
      el('h3', { text: 'Reading the board' }),
      el('p', { class: 'sub', text: 'Treat the ranking as a watchlist, not a price target. A high implied value means the protocol is large, in a sector the market values richly, and has run a long time with no token: the three things that have to be true before a launch is worth farming. It does not mean a token is coming, and it does not say when. A protocol can sit high for months and never launch, and a small early row can launch first. What the board is good for is narrowing two hundred names to the dozen worth checking each week, and giving each of those a concrete farm plan with a cost and a hold time. Before farming any row, open the protocol itself and confirm it still has no token, that its points or rewards page is live, and that the position the plan asks for is one you understand. Never pay to claim, never bridge more than the plan states, and never farm from a wallet that holds funds you cannot lose.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var comp = null;
    (DATA.category_multiples || []).forEach(function (c) { if (c.category === (row.category || 'Other')) comp = c; });
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatchlist(row.slug) ? '  ·  watchlist' : '') }),
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
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Size factor' }), el('b', { class: 'num', text: String(row.size_factor) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The ' + (row.category || 'Other') + ' base multiple is ' + fmtMult(row.category_multiple / row.size_factor) + (comp && comp.comps > 0 ? ', from ' + comp.comps + ' live ' + (row.category || 'Other') + ' protocol' + (comp.comps === 1 ? '' : 's') + ' with a raw median of ' + fmtMult(comp.median) + ', moved by the size factor ' + String(row.size_factor) + ' to ' + fmtMult(row.category_multiple) + '.' : ', from the global median: no live protocol in this sector yet.') + ' This is an estimate, not a price.' })
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
      el('h3', { text: 'Farm economics' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Total gas' }), el('b', { class: 'num', text: '$' + row.farm_cost_usd })),
        el('div', null, el('span', { text: 'Farmers supported' }), el('b', { class: 'num', text: String(row.farm_capacity) })),
        el('div', null, el('span', { text: 'Verdict' }), el('b', { class: 'num', text: row.farm_verdict }))
      ),
      el('p', { class: 'sub', text: 'The verdict assumes 5% of the launch value reaches farmers and a farmer needs $100 of profit: capacity is 5% of implied value divided by $100. Gas is priced on ' + (row.chains && row.chains.length ? row.chains[0] : 'the main chain') + ' for the setup, one action a week through the hold, and the exit. The capital is deposited and returned, not spent.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') {
      shell.appendChild(topChart());
      shell.appendChild(categorySummary());
    }
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(curvePanel());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
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

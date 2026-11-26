/**
 * app.js — HeadsUp Market
 * A glanceable crypto ticker designed for the Even G2's constraints:
 * one idea per screen, huge type, 576x288, green monochrome, no charts
 * (a unicode sparkline is the most the panel can honestly show).
 *
 * Data: CoinGecko free public API (no key). If the fetch fails (offline,
 * rate limit, CORS), the app falls back to clearly-labelled demo data so
 * the demo video can always be recorded.
 */
(function () {
  'use strict';

  var COINS = [
    { id: 'bitcoin',  sym: 'BTC', name: 'Bitcoin' },
    { id: 'ethereum', sym: 'ETH', name: 'Ethereum' },
    { id: 'solana',   sym: 'SOL', name: 'Solana' }
  ];
  var REFRESH_MS = 60 * 1000;
  var API = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd' +
            '&ids=bitcoin,ethereum,solana&sparkline=true&price_change_percentage=24h,7d';

  // Fallback snapshot (labelled DEMO on screen when used).
  var DEMO = {
    bitcoin:  { current_price: 91240, price_change_percentage_24h: 2.34,
                price_change_percentage_7d_in_currency: 6.10,
                high_24h: 92800, low_24h: 88410, sparkline_in_7d: { price: [] } },
    ethereum: { current_price: 3312, price_change_percentage_24h: -1.12,
                price_change_percentage_7d_in_currency: 3.42,
                high_24h: 3410, low_24h: 3255, sparkline_in_7d: { price: [] } },
    solana:   { current_price: 214.6, price_change_percentage_24h: 5.87,
                price_change_percentage_7d_in_currency: 12.30,
                high_24h: 219.4, low_24h: 198.2, sparkline_in_7d: { price: [] } }
  };

  var state = { idx: 0, showDetail: false, data: null, live: false, updatedAt: null };

  var el = {
    clock: document.getElementById('clock'),
    net: document.getElementById('netstate'),
    name: document.getElementById('coin-name'),
    price: document.getElementById('coin-price'),
    change: document.getElementById('coin-change'),
    spark: document.getElementById('spark'),
    detail: document.getElementById('detail'),
    log: document.getElementById('log')
  };

  function log(msg) {
    el.log.textContent = msg;
    if (window.console) console.log('[headsup] ' + msg);
  }

  var hub = window.HeadsUpBridge.init(onAction, log);

  function fmtPrice(p) {
    if (p == null) return '$-----';
    return '$' + p.toLocaleString('en-US', {
      minimumFractionDigits: p < 10 ? 3 : 2, maximumFractionDigits: p < 10 ? 3 : 2
    });
  }
  function fmtPct(x) {
    if (x == null) return '—';
    return (x >= 0 ? '▲ +' : '▼ ') + x.toFixed(2) + '%';
  }
  function sparkline(prices) {
    if (!prices || prices.length < 8) return '';
    var step = Math.max(1, Math.floor(prices.length / 24));
    var pts = [];
    for (var i = 0; i < prices.length; i += step) pts.push(prices[i]);
    var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
    var blocks = '▁▂▃▄▅▆▇█';
    return pts.map(function (p) {
      var t = max === min ? 0.5 : (p - min) / (max - min);
      return blocks[Math.min(7, Math.floor(t * 8))];
    }).join('');
  }

  function current() {
    var c = COINS[state.idx];
    var d = state.data && state.data[c.id];
    return { coin: c, d: d };
  }

  /** Plain-text rendering for the glasses text container (firmware-rendered). */
  function glassesText() {
    var cur = current();
    if (!cur.d) return 'HeadsUp Market\n\nLoading…';
    var lines = [
      cur.coin.sym + '  ' + (state.live ? 'LIVE' : 'DEMO'),
      fmtPrice(cur.d.current_price),
      '24h ' + fmtPct(cur.d.price_change_percentage_24h)
    ];
    if (state.showDetail) {
      lines.push('7d  ' + fmtPct(cur.d.price_change_percentage_7d_in_currency));
      lines.push('H ' + fmtPrice(cur.d.high_24h) + '  L ' + fmtPrice(cur.d.low_24h));
    }
    lines.push('Swipe: switch · Tap: details · 2xTap: exit');
    return lines.join('\n');
  }

  function render() {
    var cur = current();
    el.net.textContent = state.live ? '● LIVE' : '● DEMO DATA';
    if (!cur.d) { el.name.textContent = cur.coin.sym; el.price.textContent = 'Loading…'; return; }
    el.name.textContent = cur.coin.sym + ' / USD';
    el.price.textContent = fmtPrice(cur.d.current_price);
    el.change.textContent = '24h ' + fmtPct(cur.d.price_change_percentage_24h);
    el.change.className = cur.d.price_change_percentage_24h >= 0 ? 'up' : 'down';
    el.spark.textContent = sparkline(cur.d.sparkline_in_7d && cur.d.sparkline_in_7d.price);
    el.detail.textContent = state.showDetail
      ? '7d  ' + fmtPct(cur.d.price_change_percentage_7d_in_currency) +
        '\n24h high ' + fmtPrice(cur.d.high_24h) + ' · low ' + fmtPrice(cur.d.low_24h)
      : '';
    hub.pushText(glassesText());
  }

  function tickClock() {
    var d = new Date();
    el.clock.textContent =
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function load() {
    log('fetching CoinGecko…');
    fetch(API, { headers: { 'accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) {
        var map = {};
        rows.forEach(function (row) { map[row.id] = row; });
        state.data = map; state.live = true; state.updatedAt = new Date();
        log('live data OK · updated ' + state.updatedAt.toLocaleTimeString() +
            ' · auto-refresh 60s · mode: ' + hub.mode);
        render();
      })
      .catch(function (err) {
        state.data = DEMO; state.live = false;
        log('live fetch failed (' + err.message + ') → demo data shown. ' +
            'Check network / CoinGecko rate limit, then reload.');
        render();
      });
  }

  function onAction(action) {
    if (action === 'next') { state.idx = (state.idx + 1) % COINS.length; render(); }
    else if (action === 'prev') { state.idx = (state.idx + COINS.length - 1) % COINS.length; render(); }
    else if (action === 'select') { state.showDetail = !state.showDetail; render(); }
    else if (action === 'exit') { hub.exit(); }
  }

  // Browser-preview input: keyboard + click stand in for temple/R1 gestures.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') onAction('next');
    else if (e.key === 'ArrowUp') onAction('prev');
    else if (e.key === 'Enter') onAction('select');
    else if (e.key === 'Escape') onAction('exit');
  });
  document.getElementById('glasses').addEventListener('click', function () { onAction('select'); });
  document.getElementById('glasses').addEventListener('wheel', function (e) {
    onAction(e.deltaY > 0 ? 'next' : 'prev');
  }, { passive: true });

  tickClock(); setInterval(tickClock, 20000);
  render(); load(); setInterval(load, REFRESH_MS);
})();

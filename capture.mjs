// capture.mjs — drive HeadsUp Market in headless Chromium via CDP and capture
// screenshots of each state (BTC/ETH/SOL main + detail). No dependencies:
// uses Node 24's built-in WebSocket.
// Usage: node capture.mjs <port> <outdir> [live|demo]
//   live: intercept CoinGecko requests and fulfill them with real data fetched
//         by Node (this VM's egress proxy works for curl/node, not for Chrome's
//         network stack). The app code is untouched; only the HTTP response is
//         supplied by the harness, so the app shows genuine live prices.
//   demo: no interception; the fetch fails and the app shows labelled DEMO DATA.
// Env: BASE_URL (default http://127.0.0.1:8000/)
import { writeFileSync, mkdirSync } from 'node:fs';

const port = process.argv[2] || '9222';
const outdir = process.argv[3] || '/home/hatch/workspace/even-realities/docs';
const mode = process.argv[4] || 'live';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000/';
mkdirSync(outdir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
async function handleFetch(p) {
  try {
    const res = await fetch(p.request.url);
    const body = await res.text();
    const headers = [];
    res.headers.forEach((v, k) => headers.push({ name: k, value: v }));
    await send('Fetch.fulfillRequest', {
      requestId: p.requestId, responseCode: res.status,
      responseHeaders: headers, body: Buffer.from(body).toString('base64'),
    });
    console.log('intercepted', p.request.url, '->', res.status);
  } catch (e) {
    console.log('intercept failed', e.message);
    await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' });
  }
}
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === 'Fetch.requestPaused') { handleFetch(d.params); }
};
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
async function shot(name, clip) {
  const params = clip ? { format: 'png', clip } : { format: 'png' };
  const r = await send('Page.captureScreenshot', params);
  if (r.error) throw new Error('captureScreenshot failed: ' + JSON.stringify(r.error));
  writeFileSync(`${outdir}/${name}`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
}
async function key(k, code, vk) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(700);
}

await send('Page.enable');
await send('Runtime.enable');
if (mode === 'live') {
  await send('Fetch.enable', { patterns: [{ urlPattern: '*api.coingecko.com*', requestStage: 'Request' }] });
}
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(6000); // let CoinGecko fetch settle

const state = await evalJs(`JSON.stringify({
  net: document.getElementById('netstate')?.textContent,
  coin: document.getElementById('coin-name')?.textContent,
  price: document.getElementById('coin-price')?.textContent,
  change: document.getElementById('coin-change')?.textContent,
  log: document.getElementById('log')?.textContent
})`);
console.log('STATE:', state);

const rect = JSON.parse(await evalJs(`(() => { const r = document.getElementById('glasses').getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,width:r.width,height:r.height}); })()`));
console.log('RECT:', JSON.stringify(rect));
const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 2 };

if (mode === 'demo') {
  await shot('sim-demo-data.png', clip);
} else {
  await shot('sim-btc.png', clip);
  await key('ArrowDown', 'ArrowDown', 40);
  await shot('sim-eth.png', clip);
  await key('ArrowDown', 'ArrowDown', 40);
  await shot('sim-sol.png', clip);
  await key('Enter', 'Enter', 13);
  await shot('sim-sol-detail.png', clip);
  await key('Enter', 'Enter', 13);
  await key('ArrowUp', 'ArrowUp', 38);
  await key('ArrowUp', 'ArrowUp', 38);
  await key('Enter', 'Enter', 13);
  await shot('sim-btc-detail.png', clip);
  await shot('sim-fullpage.png');
}
ws.close();
console.log('DONE', mode);

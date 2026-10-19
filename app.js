const API = 'https://script.google.com/macros/s/AKfycbzQnVGYorslhr9cS_yy7OiRFiGxwFJ3xGiBhS8V5E02I3MkPrpJIUSQ-nhuvDMzat_LZQ/exec'; // Apps Script web app URL
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const FN = ['Procurement', 'Planning', 'Warehousing', 'Logistics', 'Transportation'];
let key = sessionStorage.getItem('k') || '', D = null, locs = [], charts = {}, map, layer, timer;

const call = async body => {
  const r = body ? await fetch(API, { method: 'POST', body: JSON.stringify({ key, ...body }) })
                 : await fetch(API + '?key=' + encodeURIComponent(key));
  return r.json();
};
const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); setTimeout(() => e.classList.remove('on'), 2400); };
const count = (el, to, fmt = v => v.toLocaleString()) => {
  const from = +el.dataset.v || 0, t0 = performance.now(); el.dataset.v = to;
  (function f(t) { const p = Math.min((t - t0) / 900, 1), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(f); })(t0);
};

async function load(first) {
  try {
    const d = await call();
    if (d.error) return false;
    D = d; locs = d.locations.map(l => ({ ...l })); render(); return true;
  } catch (e) { if (!first) console.warn(e); return false; }
}

function render() {
  const c = D.current, n = k => +c[k] || 0;
  count($('#v-spend'), n('spend'), v => 'LKR ' + v.toLocaleString());
  count($('#v-wh'), n('warehouses')); count($('#v-fleet'), n('fleet'));
  const sl = D.locations.filter(l => l.type === 'Sri Lanka').length, os = D.locations.length - sl;
  count($('#v-loc'), D.locations.length); $('#v-sl').textContent = sl; $('#v-os').textContent = os;
  const st = FN.map(f => n('staff_' + f.toLowerCase()));
  $('#v-staff').textContent = '· ' + st.reduce((a, b) => a + b, 0) + ' total';
  $('#upd').textContent = new Date().toLocaleTimeString();
  drawCharts(st, sl, os); drawMap();
  $$('#entry input[name]').forEach(i => { if (document.activeElement !== i) i.value = c[i.name] ?? ''; });
  drawLocs();
  $('#hist').innerHTML = D.history.slice(0, 12).map(h =>
    `<tr><td>${new Date(h.time).toLocaleString()}</td><td>${h.metric}</td><td>${h.value}</td></tr>`).join('');
}

function drawCharts(st, sl, os) {
  const dark = document.documentElement.dataset.theme === 'dark', tx = dark ? '#8e8e99' : '#85858f', gr = dark ? '#2a2a31' : '#ececf0';
  Chart.defaults.color = tx;
  const mk = (id, cfg) => { if (charts[id]) { charts[id].data = cfg.data; charts[id].update(); } else charts[id] = new Chart($('#' + id), cfg); };
  mk('c-staff', { type: 'bar', data: { labels: FN, datasets: [{ data: st, backgroundColor: '#f26a2e', borderRadius: 10 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: gr }, beginAtZero: true }, x: { grid: { display: false } } } } });
  mk('c-loc', { type: 'doughnut', data: { labels: ['Sri Lanka', 'Overseas'], datasets: [{ data: [sl, os], backgroundColor: ['#f26a2e', dark ? '#f4f4f6' : '#111'], borderWidth: 0 }] },
    options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom' } } } });
}

function drawMap() {
  if (!map) { map = L.map('map', { scrollWheelZoom: false }).setView([7.8, 80.7], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map); layer = L.layerGroup().addTo(map); }
  layer.clearLayers();
  const pts = D.locations.filter(l => l.lat !== '' && l.lng !== '');
  pts.forEach(l => L.circleMarker([l.lat, l.lng], { radius: 9, color: '#fff', weight: 2, fillColor: l.type === 'Sri Lanka' ? '#f26a2e' : '#111', fillOpacity: 1 })
    .bindTooltip(`${l.name} (${l.type})`).addTo(layer));
  if (pts.length) map.fitBounds(pts.map(l => [l.lat, l.lng]), { padding: [40, 40], maxZoom: 6 });
  setTimeout(() => map.invalidateSize(), 100);
}

function drawLocs() {
  $('#ll').innerHTML = locs.map((l, i) => `<li><span>${l.name} · ${l.type} · ${(+l.lat).toFixed(3)}, ${(+l.lng).toFixed(3)}</span><button data-i="${i}">Remove</button></li>`).join('');
}

$('#ll').onclick = e => { if (e.target.dataset.i) { locs.splice(e.target.dataset.i, 1); drawLocs(); } };
$('#find').onclick = async () => {
  const q = $('#ln').value.trim(); if (!q) return;
  const r = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q))).json();
  if (r[0]) { $('#la').value = (+r[0].lat).toFixed(4); $('#lo').value = (+r[0].lon).toFixed(4); } else toast('Not found - enter lat/lng manually');
};
$('#add').onclick = () => {
  const name = $('#ln').value.trim(), lat = $('#la').value, lng = $('#lo').value;
  if (!name || lat === '' || lng === '') return toast('Add a name and coordinates');
  locs.push({ name, type: $('#lt').value, lat: +lat, lng: +lng }); drawLocs(); ['#ln', '#la', '#lo'].forEach(s => $(s).value = '');
};
$('#saveL').onclick = async () => { await call({ action: 'locations', locations: locs }); toast('Locations saved'); load(); };
$$('form[data-f]').forEach(f => f.onsubmit = async e => {
  e.preventDefault(); const values = {};
  [...f.querySelectorAll('input')].forEach(i => values[i.name] = i.value);
  try { await call({ action: 'save', values }); toast('Saved'); load(); } catch { toast('Save failed'); }
});

$('#lf').onsubmit = async e => {
  e.preventDefault(); key = $('#pw').value;
  if (await load(true)) { sessionStorage.setItem('k', key); start(); } else $('#lerr').textContent = 'Wrong passcode or connection problem';
};
function start() {
  $('#login').hidden = true; $('#app').hidden = false; clearInterval(timer); timer = setInterval(load, 30000); setTimeout(() => map && map.invalidateSize(), 200);
}
$$('nav button').forEach(b => b.onclick = () => {
  $$('nav button').forEach(x => x.classList.toggle('on', x === b));
  $$('.page').forEach(p => p.classList.remove('show')); void document.body.offsetWidth; $('#' + b.dataset.p).classList.add('show');
  if (map) setTimeout(() => map.invalidateSize(), 150);
});
const setTheme = t => { document.documentElement.dataset.theme = t; localStorage.setItem('t', t); $('#theme').textContent = t === 'dark' ? '☾' : '☀';
  Object.values(charts).forEach(c => c.destroy()); charts = {}; if (D) render(); };
$('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
setTheme(localStorage.getItem('t') || 'light');
if (key) load(true).then(ok => ok ? start() : null);

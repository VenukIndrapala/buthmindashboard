const API = 'https://script.google.com/macros/s/AKfycbx5qjUu2iMBPwE-5SbSWUe4pcg8_MX9K62MJ3hrfaJWt7d2ywsdbYtH3zpeuQwpJe2B-Q/exec'; // Apps Script web app URL
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const FN = ['Procurement', 'Planning', 'Warehousing', 'Logistics', 'Transportation'];
// Folders searched for logo files, relative to index.html ('' = same folder as index.html). Add your folder here if needed.
const LOGO_DIRS = ['', 'logos/'];
const WA = n => 'WhatsApp Image 2026-10-20 at 13.14.01' + n + '.jpeg'; // original file names from the zip
// [company name, initials, logo file names to try (optional)]
const COMPANIES = [['LankaTiles','LT'],['LankaWallTiles','LW'],
  ['Rocell - Horana','RH',[WA(' (4)'),'rocell.png']],['Rocell - Eheliyagoda','RE',[WA(' (4)'),'rocell.png']],
  ['Rocell Bathware','RB',[WA(' (3)'),'rocell-bathware.png']],['Swisstek Aluminium','SA',[WA(' (2)'),'swisstek-aluminium.png']],
  ['Swisstek Ceylon','SC',[WA(' (1)'),'swisstek-ceylon.png']],['Unidil','UN',[WA(' (5)'),'unidil.png']]];

/* ---- Logo loading: finds the file, trims white margins in the browser ---- */
const tryLoad = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
const trimLogo = im => {
  try {
    const w = im.naturalWidth, h = im.naturalHeight, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 0 && (255 - d[i] > 30 || 255 - d[i + 1] > 30 || 255 - d[i + 2] > 30)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < x0) return im.src;
    const p = 3; x0 = Math.max(x0 - p, 0); y0 = Math.max(y0 - p, 0); x1 = Math.min(x1 + p, w - 1); y1 = Math.min(y1 + p, h - 1);
    const c2 = document.createElement('canvas'); c2.width = x1 - x0 + 1; c2.height = y1 - y0 + 1;
    c2.getContext('2d').drawImage(im, x0, y0, c2.width, c2.height, 0, 0, c2.width, c2.height);
    return c2.toDataURL('image/png');
  } catch (e) { return im.src; }
};
const LOGOS = {};
const getLogo = c => LOGOS[c[0]] || (LOGOS[c[0]] = (async () => {
  if (!c[2]) return null;
  for (const f of c[2]) for (const dir of LOGO_DIRS) { const im = await tryLoad(dir + encodeURI(f)); if (im) return trimLogo(im); }
  return null;
})());
const RED = '#C51D34', NOIR = '#2E2E30', GREY = '#808080', GRID = '#e6e6e8';
let company = sessionStorage.getItem('c') || COMPANIES[0][0];
let ACCESS = [];
let key = sessionStorage.getItem('k') || '', D = null, locs = [], charts = {}, map, layer, timer;

const call = async body => {
  const r = body ? await fetch(API, { method: 'POST', body: JSON.stringify({ key, company, ...body }) })
                 : await fetch(API + '?key=' + encodeURIComponent(key) + '&company=' + encodeURIComponent(company));
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
    const c0 = company;
    const d = await call();
    if (c0 !== company) return false;
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
    `<tr><td>${new Date(h.time).toLocaleString()}</td><td>${h.metric}</td><td>${h.by || ''}</td><td>${h.value}</td></tr>`).join('');
}

function drawCharts(st, sl, os) {
  Chart.defaults.color = GREY;
  const mk = (id, cfg) => { if (charts[id]) { charts[id].data = cfg.data; charts[id].update(); } else charts[id] = new Chart($('#' + id), cfg); };
  mk('c-staff', { type: 'bar', data: { labels: FN, datasets: [{ data: st, backgroundColor: RED, borderRadius: 10 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: GRID }, beginAtZero: true }, x: { grid: { display: false } } } } });
  mk('c-loc', { type: 'doughnut', data: { labels: ['Sri Lanka', 'Overseas'], datasets: [{ data: [sl, os], backgroundColor: [RED, NOIR], borderWidth: 0 }] },
    options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom' } } } });
}

function drawMap() {
  if (!map) { map = L.map('map', { scrollWheelZoom: false }).setView([7.8, 80.7], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map); layer = L.layerGroup().addTo(map); }
  layer.clearLayers();
  const pts = D.locations.filter(l => l.lat !== '' && l.lng !== '');
  pts.forEach(l => L.circleMarker([l.lat, l.lng], { radius: 9, color: '#fff', weight: 2, fillColor: l.type === 'Sri Lanka' ? RED : NOIR, fillOpacity: 1 })
    .bindTooltip(`${l.name} (${l.type})`).addTo(layer));
  if (pts.length) map.fitBounds(pts.map(l => [l.lat, l.lng]), { padding: [40, 40], maxZoom: 6 });
  setTimeout(() => map.invalidateSize(), 100);
}

function drawLocs() {
  $('#ll').innerHTML = locs.map((l, i) => `<li><span>${l.name} · ${l.type} · ${(+l.lat).toFixed(3)}, ${(+l.lng).toFixed(3)}</span><button class="mag" data-i="${i}">Remove</button></li>`).join('');
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
  if (await enter()) { sessionStorage.setItem('k', key); start(); } else $('#lerr').textContent = 'Wrong passcode or connection problem';
};
function start() {
  $('#login').hidden = true; $('#app').hidden = false; clearInterval(timer); timer = setInterval(load, 30000); setTimeout(() => map && map.invalidateSize(), 200);
}
$$('nav button').forEach(b => b.onclick = () => {
  $$('nav button').forEach(x => x.classList.toggle('on', x === b));
  $$('.page').forEach(p => p.classList.remove('show')); void document.body.offsetWidth; $('#' + b.dataset.p).classList.add('show');
  if (map) setTimeout(() => map.invalidateSize(), 150);
});
if (key) enter().then(ok => (ok ? start() : null));

/* ---- Magnify animation ---- */
document.querySelectorAll('.brand,nav button,#entry .btn,#lf .btn').forEach(el => el.classList.add('mag'));
document.querySelectorAll('#lf .btn').forEach(el => el.classList.add('mag-solo'));

function dock(box, sel, o) {
  const max = (o && o.max) || 1.2, radius = (o && o.radius) || 95, axis = (o && o.axis) || 'x';
  box.addEventListener('mousemove', e => box.querySelectorAll(sel).forEach(b => {
    const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const d = axis === 'x' ? Math.abs(e.clientX - cx) : axis === 'y' ? Math.abs(e.clientY - cy) : Math.hypot(e.clientX - cx, e.clientY - cy);
    const t = Math.max(0, 1 - d / radius);
    b.style.scale = (1 + (max - 1) * t * t * (3 - 2 * t)).toFixed(3);
  }));
  box.addEventListener('mouseleave', () => box.querySelectorAll(sel).forEach(b => (b.style.scale = '')));
}
if (!matchMedia('(hover:none)').matches) {
  dock($('header'), '.brand', { max: 1.1, radius: 70, axis: 'x' });
  dock($('nav'), 'nav button', { max: 1.22, radius: 90, axis: 'x' });
  dock($('#entry'), '#entry .mag', { max: 1.12, radius: 90, axis: 'xy' });
}

document.addEventListener('click', e => {
  const m = e.target.closest('.mag');
  if (!m) return;
  m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
});

const lens = document.createElement('span');
lens.className = 'lens';
$('nav').prepend(lens);
let hoverBtn = null;
function lensTo() {
  const nav = $('nav'), b = hoverBtn || nav.querySelector('button.on');
  if (!b || !nav.offsetWidth) return;
  const n = nav.getBoundingClientRect(), r = b.getBoundingClientRect();
  lens.style.transform = 'translateX(' + (r.left - n.left) + 'px)';
  lens.style.width = r.width + 'px';
}
$('nav').addEventListener('mousemove', e => {
  let best = null, bd = Infinity;
  $$('nav button').forEach(b => {
    const r = b.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2));
    if (d < bd) { bd = d; best = b; }
  });
  if (best !== hoverBtn) { hoverBtn = best; lensTo(); }
});
$('nav').addEventListener('mouseleave', () => { hoverBtn = null; lensTo(); });
$$('nav button').forEach(b => b.addEventListener('click', () => { hoverBtn = null; setTimeout(lensTo, 0); }));
new ResizeObserver(() => { lens.style.transition = 'none'; lensTo(); void lens.offsetWidth; lens.style.transition = ''; }).observe($('nav'));

/* ---- Company sidebar ---- */
const side = $('#side');
function buildSide() {
  side.innerHTML = COMPANIES.filter(c => ACCESS.indexOf(c[0]) >= 0).map(c => `<button class="mag" data-c="${c[0]}" data-name="${c[0]}" title="${c[0]}">${c[1]}</button>`).join('');
  side.querySelectorAll('button').forEach(b => {
    const c = COMPANIES.find(x => x[0] === b.dataset.c);
    if (c && c[2]) getLogo(c).then(src => { if (!src) return; const im = new Image(); im.alt = c[1]; im.src = src; b.textContent = ''; b.classList.add('lg'); b.appendChild(im); });
  });
  $('#app').classList.toggle('solo', ACCESS.length < 2);
  side.hidden = ACCESS.length < 2;
  setCompanyUI();
}
async function enter() {
  try {
    const info = await (await fetch(API + '?key=' + encodeURIComponent(key))).json();
    if (info.error || !info.access || !info.access.length) return false;
    ACCESS = info.access;
    if (ACCESS.indexOf(company) < 0) company = ACCESS[0];
    sessionStorage.setItem('c', company);
    buildSide();
    return await load(true);
  } catch (e) { return false; }
}
function setLogo(c, el) {
  el.classList.remove('ini'); el.textContent = ''; el.dataset.c = c[0];
  const ini = () => { el.classList.add('ini'); el.textContent = c[1]; };
  if (!c[2]) return ini();
  getLogo(c).then(src => {
    if (el.dataset.c !== c[0]) return;
    if (!src) return ini();
    const im = new Image(); im.alt = c[0] + ' logo'; im.src = src; el.appendChild(im);
  });
}
function setCompanyUI() {
  $$('#side button').forEach(b => b.classList.toggle('on', b.dataset.c === company));
  const co = COMPANIES.find(c => c[0] === company);
  if (co) $$('.clogo').forEach(el => setLogo(co, el));
  $('#dash h1').textContent = company;
  $('#dash .head p').textContent = 'Supply Chain Overview · FY 2025/26';
  $('#entry .head p').textContent = 'Entering data for ' + company + '. Saved values appear on its dashboard instantly.';
}
side.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.dataset.c === company) return;
  company = b.dataset.c;
  sessionStorage.setItem('c', company);
  setCompanyUI();
  $('#upd').textContent = 'Loading…';
  load();
});
if (!matchMedia('(hover:none)').matches) dock(side, '#side button', { max: 1.2, radius: 70, axis: 'y' });
setCompanyUI();

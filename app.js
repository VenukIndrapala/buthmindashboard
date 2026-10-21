const API = 'https://script.google.com/macros/s/AKfycbxS2vdHDmFbAo9rGI0tggipRpx6ngtcyY0R1P_yDchzlBg2OQz6TImaW3RfYDx4c8ihmQ/exec'; // Apps Script web app URL
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const FN = ['Procurement', 'Planning', 'Warehousing', 'Logistics', 'Transportation'];
// Folders searched for logo files, relative to index.html ('' = same folder as index.html). Add your folder here if needed.
const LOGO_DIRS = ['', 'logos/'];
const WA = n => 'WhatsApp Image 2026-10-20 at 13.14.01' + n + '.jpeg'; // original file names from the zip
// [company name, initials, logo file names to try (optional)]
// 4th item (optional) = different file(s) for the small sidebar button (null = same as the heading logo)
// 5th item (optional) = small text under the sidebar logo (defaults to the initials when a 4th item is given)
const COMPANIES = [['LankaTiles','LT',['lankatiles.png'],['lankatiles-icon.png']],['LankaWallTiles','LW',['lankatiles.png'],['lankatiles-icon.png']],
  ['Rocell - Horana','RH',[WA(' (4)'),'rocell.png'],null,'Horana'],['Rocell - Eheliyagoda','RE',[WA(' (4)'),'rocell.png'],null,'Eheliyagoda'],
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
const getLogo = (c, small) => LOGOS[c[0] + (small ? '#s' : '')] || (LOGOS[c[0] + (small ? '#s' : '')] = (async () => {
  const files = small && c[3] ? c[3] : c[2];
  if (!files) return null;
  for (const f of files) for (const dir of LOGO_DIRS) { const im = await tryLoad(dir + encodeURI(f)); if (im) return trimLogo(im); }
  return null;
})());
const RED = '#C51D34', NOIR = '#2E2E30', GREY = '#808080', GRID = '#e6e6e8';
let company = sessionStorage.getItem('c') || COMPANIES[0][0];
let ACCESS = [];
let key = sessionStorage.getItem('k') || '', D = null, locs = [], charts = {}, map, layer, timer;

/* ---- Month helpers + filter state ---- */
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mLabel = (m, long) => { const [y, mo] = m.split('-'); return long ? MN[+mo - 1] + ' ' + y : MN[+mo - 1] + ' \u2019' + y.slice(2); };
const num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
const STAFF_K = FN.map(f => 'staff_' + f.toLowerCase());
const SNAP_K = ['warehouses', 'fleet', ...STAFF_K]; // counts: show the latest month in the filter, never a sum
let flt = { all: true, sel: new Set() };             // month filter; resets when the company changes
const resetFilter = () => { flt = { all: true, sel: new Set() }; $$('#entry input[name]').forEach(i => { delete i.dataset.d; i.value = ''; }); };

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
    d.months = d.months || []; D = d; locs = d.locations.map(l => ({ ...l }));
    if (!sysSaving) {                                   // keep the draft safe while saving
      SYS = normSys(d.systems);
      if (!drDirty && JSON.stringify(DR) !== JSON.stringify(SYS)) { DR = clone(SYS); renderSysEdit(); }
    }
    render(); return true;
  } catch (e) { if (!first) console.warn(e); return false; }
}

const allMonths = () => ((D && D.months) || []).filter(m => m.month).sort((x, y) => x.month < y.month ? -1 : 1);
function picked() {
  const all = allMonths();
  if (flt.all) return all;
  const p = all.filter(m => flt.sel.has(m.month));
  if (p.length) return p;
  flt = { all: true, sel: new Set() }; return all;
}
// spend = SUM over the selected months; counts (warehouses, fleet, staff) = value from the latest selected month that has one
function summary(p) {
  const S = { spend: 0, v: {}, asof: {} };
  p.forEach(m => { const s = num(m.spend); if (s !== null) S.spend += s; });
  SNAP_K.forEach(k => { for (let i = p.length - 1; i >= 0; i--) { const v = num(p[i][k]); if (v !== null) { S.v[k] = v; S.asof[k] = p[i].month; break; } } });
  return S;
}
const asOf = m => m ? 'As of ' + mLabel(m, 1) : 'No data yet';
function periodText(p) {
  if (!p.length) return 'No data entered yet';
  if (p.length === 1) return mLabel(p[0].month, 1);
  if (flt.all) return 'All ' + p.length + ' months · ' + mLabel(p[0].month) + ' – ' + mLabel(p[p.length - 1].month);
  return p.length <= 3 ? p.map(m => mLabel(m.month)).join(', ') + ' · ' + p.length + ' months' : p.length + ' months selected';
}

function renderKpis() {
  const p = picked(), S = summary(p), n = k => S.v[k] || 0;
  count($('#v-spend'), S.spend, v => 'LKR ' + v.toLocaleString());
  count($('#v-wh'), n('warehouses')); count($('#v-fleet'), n('fleet'));
  $('#v-wh-m').textContent = asOf(S.asof.warehouses); $('#v-fleet-m').textContent = asOf(S.asof.fleet);
  $('#v-period').textContent = periodText(p);
  const st = STAFF_K.map(k => n(k)), sa = STAFF_K.map(k => S.asof[k]).filter(Boolean).sort().pop();
  $('#v-staff').textContent = '· ' + st.reduce((x, y) => x + y, 0) + ' total' + (sa ? ' · ' + mLabel(sa, 1) : '');
  const sl = D.locations.filter(l => l.type === 'Sri Lanka').length;
  drawCharts(st, sl, D.locations.length - sl);
}

function drawFilter() {
  const all = allMonths(), p = picked(), on = new Set(p.map(m => m.month));
  $('#fchips').innerHTML = all.map(m => `<button type="button" class="chip${on.has(m.month) ? ' on' : ''}" data-m="${m.month}" title="${mLabel(m.month, 1)}">${mLabel(m.month)}</button>`).join('');
  $('#fall').classList.toggle('on', flt.all && all.length > 0); $('#fall').disabled = !all.length;
  $('#fsum').textContent = !all.length ? 'No data yet. Add a month in Enter Data.'
    : flt.all ? 'Showing all ' + all.length + (all.length === 1 ? ' month' : ' months') : p.length + ' of ' + all.length + ' months selected';
}
$('#fchips').onclick = e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const m = b.dataset.m, all = allMonths().map(x => x.month);
  if (flt.all) flt = { all: false, sel: new Set([m]) };           // first click from "all" = just that month
  else {
    flt.sel.has(m) ? flt.sel.delete(m) : flt.sel.add(m);          // then click more months to add / remove them
    if (!all.some(x => flt.sel.has(x)) || all.every(x => flt.sel.has(x))) flt = { all: true, sel: new Set() };
  }
  drawFilter(); renderKpis();
};
$('#fall').onclick = () => { flt = { all: true, sel: new Set() }; drawFilter(); renderKpis(); };

/* ---- Enter Data: month picker + prefill of the chosen month ---- */
const entryMonth = () => $('#mo-y').value + '-' + $('#mo-m').value;
function fillEntry(force) {
  const row = ((D && D.months) || []).find(m => m.month === entryMonth());
  $$('#entry input[name]').forEach(i => {
    if (!force && (document.activeElement === i || i.dataset.d)) return; // don't overwrite what the user is typing
    i.value = row && num(row[i.name]) !== null ? row[i.name] : ''; delete i.dataset.d;
  });
  $('#mo-note').textContent = row ? 'This month already has data. Saving replaces the values you edit.' : 'No data saved for this month yet.';
}
$('#mo-m').onchange = $('#mo-y').onchange = () => fillEntry(true);
$('#entry').addEventListener('input', e => { if (e.target.name) e.target.dataset.d = 1; });

function render() {
  const sl = D.locations.filter(l => l.type === 'Sri Lanka').length, os = D.locations.length - sl;
  count($('#v-loc'), D.locations.length); $('#v-sl').textContent = sl; $('#v-os').textContent = os;
  $('#upd').textContent = new Date().toLocaleTimeString();
  drawFilter(); renderKpis(); drawMap();
  fillEntry(false);
  drawLocs();
  updateSys();
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
  const month = entryMonth();
  try {
    const r = await call({ action: 'save', month, values });
    if (r.error) throw new Error(r.error);
    [...f.querySelectorAll('input')].forEach(i => delete i.dataset.d);
    toast('Saved \u00b7 ' + mLabel(month, 1)); load();
  } catch { toast('Save failed'); }
});

$('#lf').onsubmit = async e => {
  e.preventDefault(); key = $('#pw').value;
  if (await enter()) { sessionStorage.setItem('k', key); start(); } else $('#lerr').textContent = 'Wrong passcode or connection problem';
};
function start() {
  showBg();
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
    if (c && c[2]) getLogo(c, true).then(src => {
      if (!src) return;
      const im = new Image(); im.alt = c[1]; im.src = src; b.textContent = ''; b.classList.add('lg'); b.appendChild(im);
      const cap = c[4] || (c[3] ? c[1] : '');
      if (cap) { b.classList.add('cap'); const t = document.createElement('i'); t.textContent = cap; b.appendChild(t); }
    });
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
  const ttl = el.parentNode;
  ttl.classList.toggle('has-logo', !!c[2]);
  const ini = () => { ttl.classList.remove('has-logo'); el.classList.add('ini'); el.textContent = c[1]; };
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
  $('#dash .cname').textContent = company;
  $('#dash .head p').textContent = 'Supply Chain Overview · FY 2025/26';
  $('#entry .head p').textContent = 'Entering data for ' + company + '. Choose the month first; saving a month again replaces its earlier values.';
}
side.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.dataset.c === company) return;
  if (drDirty && !confirm('You have unsaved systems changes. Switch company and discard them?')) return;
  drDirty = false;
  company = b.dataset.c;
  sessionStorage.setItem('c', company);
  SYS = normSys(null); DR = normSys(null); renderSysEdit(); updateSys(); setSt('');
  resetFilter();
  setCompanyUI();
  replay();
  $('#upd').textContent = 'Loading…';
  load();
});
if (!matchMedia('(hover:none)').matches) dock(side, '#side button', { max: 1.1, radius: 60, axis: 'y' });
setCompanyUI();

/* ---- Replays the slide-in animation (used when switching company) ---- */
function replay() {
  const p = $('.page.show'); if (!p) return;
  p.classList.remove('show'); void p.offsetWidth; p.classList.add('show');
  if (map) setTimeout(() => map.invalidateSize(), 150);
}

/* ---- Background video (shown after login) ---- */
const bgv = document.createElement('video');
bgv.id = 'bgv'; bgv.src = 'background.mp4'; bgv.poster = 'background-poster.jpg';
bgv.muted = true; bgv.loop = true; bgv.playsInline = true; bgv.setAttribute('aria-hidden', 'true'); bgv.hidden = true;
document.body.prepend(bgv);
function showBg() {
  bgv.hidden = false;
  if (!matchMedia('(prefers-reduced-motion:reduce)').matches) bgv.play().catch(() => {});
}

/* ---- Month picker setup (defaults to the current month) ---- */
(function () {
  const now = new Date(), y = now.getFullYear();
  $('#mo-m').innerHTML = MN.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${m}</option>`).join('');
  let ys = ''; for (let k = 2020; k <= y + 1; k++) ys += `<option>${k}</option>`;
  $('#mo-y').innerHTML = ys; $('#mo-y').value = y; $('#mo-m').value = String(now.getMonth() + 1).padStart(2, '0');
})();

/* ================= Systems used across business functions =================
   Latest values live in Apps Script's script properties (read by the dashboard);
   every save is also logged to a separate Google Sheet by the Apps Script.
   The dashboard shows SYS (last saved, read-only). Enter Data edits DR (a draft) and sends it with "Save systems". */
const DV = ['SAP', 'Oracle', 'Microsoft', 'Other'];           // fixed vendors ('Other' always stays last)
const SYS_PAL = [RED, '#3a3d42', '#9a9da1', '#8c1b2b', '#e98a96', '#5f6368', '#b9a3a7', '#2f6f8f'];
const SYS_LIGHT = ['#d4d5d8', '#e98a96', '#b9a3a7', '#9a9da1'];  // segments that need dark text
const vcol = (v, i) => v === 'Other' ? '#d4d5d8' : SYS_PAL[i % SYS_PAL.length];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
let SYS = null, DR = null, drDirty = false, sysSaving = false;   // SYS = saved (dashboard), DR = draft (Enter Data)

function normSys(s) {
  s = s || {};
  const uniq = a => { const o = []; (Array.isArray(a) ? a : []).forEach(x => { x = String(x).trim(); if (x && !o.some(y => sameName(x, y))) o.push(x); }); return o; };
  const V = [...DV.slice(0, -1), ...uniq(s.vendors).filter(v => !DV.some(d => sameName(d, v))), 'Other'];
  const F = [...FN, ...uniq(s.funcs).filter(f => !FN.some(d => sameName(d, f)))];
  const n = x => { x = Math.floor(+x); return x > 0 ? x : 0; };
  const grid = {}, un = {};
  F.forEach(f => { grid[f] = {}; V.forEach(v => grid[f][v] = n(s.grid && s.grid[f] && s.grid[f][v])); });
  V.forEach(v => { const u = s.uniq && s.uniq[v]; un[v] = (u === '' || u == null) ? '' : n(u); });
  return { vendors: V, funcs: F, grid, uniq: un };
}
SYS = normSys(null); DR = normSys(null);
const setSt = t => { $('#sysst').textContent = t ? '\u00b7 ' + t : ''; };
const clone = o => JSON.parse(JSON.stringify(o));

// totals. "Unique systems" cells left blank fall back to that vendor's column total.
function sysCalc(S) {
  const V = S.vendors, F = S.funcs, sum = a => a.reduce((x, y) => x + y, 0);
  const rt = F.map(f => sum(V.map(v => S.grid[f][v])));
  const ct = V.map(v => sum(F.map(f => S.grid[f][v])));
  const un = V.map((v, i) => S.uniq[v] === '' ? ct[i] : S.uniq[v]);
  return { rt, ct, un, grand: sum(ct), uTot: sum(un), fn: rt.filter(x => x > 0).length, vn: V.filter((v, i) => ct[i] > 0 || un[i] > 0).length };
}
// edit = false: read-only table (dashboard); edit = true: inputs + remove buttons (Enter Data)
function sysTable(S, edit) {
  const V = S.vendors, F = S.funcs, C = sysCalc(S);
  const x = (a, i) => edit ? `<button type="button" class="x" ${a}="${i}" title="Remove">\u00d7</button>` : '';
  const inp = (v, at, ph) => `<input type="number" min="0" step="1" inputmode="numeric" placeholder="${ph}" ${at} value="${v}">`;
  return `<thead><tr><th>Business function</th>${V.map((v, i) => `<th>${esc(v)}${DV.includes(v) ? '' : x('data-rv', i)}</th>`).join('')}<th>Total</th></tr></thead><tbody>`
    + F.map((f, r) => `<tr><td>${esc(f)}${FN.includes(f) ? '' : x('data-rf', r)}</td>${V.map((v, c) => `<td>${edit ? inp(S.grid[f][v] || '', `data-r="${r}" data-c="${c}"`, 0) : S.grid[f][v]}</td>`).join('')}<td data-rt="${r}">${C.rt[r]}</td></tr>`).join('')
    + `<tr class="tot"><td>Total</td>${V.map((v, c) => `<td data-ct="${c}">${C.ct[c]}</td>`).join('')}<td data-gt>${C.grand}</td></tr>`
    + `<tr class="uq"><td title="Distinct systems per vendor. Leave blank to use the column total.">Unique systems</td>${V.map((v, i) => `<td>${edit ? inp(S.uniq[v], `data-u="${i}"`, C.ct[i]) : C.un[i]}</td>`).join('')}<td data-ut>${C.uTot}</td></tr></tbody>`;
}
const renderSysTable = () => { $('#systbl').innerHTML = sysTable(SYS, false); };            // dashboard (read-only)
const renderSysEdit = () => { $('#systbl-e').innerHTML = sysTable(DR, true); updateEdit(); }; // Enter Data (editable)

const sysPlug = {
  id: 'sysBar',
  afterDatasetsDraw(ch) {
    const g = ch.ctx, ds = ch.data.datasets; g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 12px Inter,system-ui,sans-serif';
    ch.data.labels.forEach((_, i) => {
      let tot = 0, top = null;
      ds.forEach((d, k) => { const v = d.data[i]; if (!v) return; tot += v; const el = ch.getDatasetMeta(k).data[i];
        if (el && Math.abs(el.base - el.y) >= 15) { g.fillStyle = SYS_LIGHT.includes(d.backgroundColor) ? NOIR : '#fff'; g.fillText(v, el.x, (el.y + el.base) / 2); }
        if (el) top = top === null ? el.y : Math.min(top, el.y); });
      if (tot) { g.fillStyle = NOIR; g.font = '700 13px Inter,system-ui,sans-serif'; g.fillText(tot, ch.getDatasetMeta(0).data[i].x, top - 12); g.font = '600 12px Inter,system-ui,sans-serif'; }
    });
    g.restore();
  }
};
const donutPlug = {
  id: 'sysDon',
  afterDatasetsDraw(ch) {
    const o = ch.options.plugins.sysDon || {}, a = ch.chartArea, g = ch.ctx, cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
    g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = NOIR; g.font = '700 28px Inter,system-ui,sans-serif'; g.fillText(o.total || 0, cx, cy - 8);
    g.fillStyle = GREY; g.font = '400 13px Inter,system-ui,sans-serif'; g.fillText('Total Systems', cx, cy + 16);
    if (o.total) { g.font = '600 12px Inter,system-ui,sans-serif';
      ch.getDatasetMeta(0).data.forEach((el, i) => { const v = ch.data.datasets[0].data[i], p = v / o.total * 100; if (p < 5) return;
        const t = el.tooltipPosition(); g.fillStyle = SYS_LIGHT.includes(ch.data.datasets[0].backgroundColor[i]) ? NOIR : '#fff'; g.fillText(Math.round(p) + '%', t.x, t.y); }); }
    g.restore();
  }
};
function sysChart(id, cfg) {
  if (charts[id]) { charts[id].data = cfg.data; charts[id].options = cfg.options; charts[id].update(); }
  else charts[id] = new Chart($('#' + id), cfg);
}
// Dashboard: table, KPI cards, legend and charts all come from the last SAVED data (SYS)
function updateSys() {
  renderSysTable();
  const C = sysCalc(SYS), V = SYS.vendors, F = SYS.funcs, col = V.map(vcol);
  count($('#s-tot'), C.uTot); count($('#s-dep'), C.grand); count($('#s-fn'), C.fn); count($('#s-vn'), C.vn);
  $('#s-leg').innerHTML = V.map((v, i) => `<li><i style="background:${col[i]}"></i><span>${esc(v)}</span><b>${C.un[i]}</b></li>`).join('');
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = GREY;
  sysChart('c-sys-bar', { type: 'bar', plugins: [sysPlug],
    data: { labels: F, datasets: V.map((v, i) => ({ label: v, data: F.map(f => SYS.grid[f][v]), backgroundColor: col[i], borderWidth: 0 })) },
    options: { maintainAspectRatio: false, layout: { padding: { top: 18 } },
      plugins: { legend: { position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8 } } },
      scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 11 } } }, y: { stacked: true, beginAtZero: true, grace: '8%', grid: { color: GRID }, ticks: { precision: 0 }, title: { display: true, text: 'Number of systems' } } } } });
  const empty = C.uTot === 0;
  sysChart('c-sys-don', { type: 'doughnut', plugins: [donutPlug],
    data: { labels: empty ? ['No data'] : V, datasets: [{ data: empty ? [1] : C.un, backgroundColor: empty ? ['#ececee'] : col, borderWidth: 0 }] },
    options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: !empty }, sysDon: { total: C.uTot } } } });
}

/* ---- editing (Enter Data) + explicit save ---- */
function updateEdit() {
  const C = sysCalc(DR);
  $$('#systbl-e [data-rt]').forEach(td => td.textContent = C.rt[+td.dataset.rt]);
  $$('#systbl-e [data-ct]').forEach(td => td.textContent = C.ct[+td.dataset.ct]);
  $('#systbl-e [data-gt]').textContent = C.grand; $('#systbl-e [data-ut]').textContent = C.uTot;
  $$('#systbl-e input[data-u]').forEach(i => i.placeholder = C.ct[+i.dataset.u]);
}
const markDirty = () => { drDirty = true; setSt('Unsaved changes'); };
const cellVal = t => t.dataset.u != null ? DR.uniq[DR.vendors[+t.dataset.u]] : DR.grid[DR.funcs[+t.dataset.r]][DR.vendors[+t.dataset.c]];
$('#systbl-e').addEventListener('input', e => {
  const t = e.target; if (t.tagName !== 'INPUT') return;
  const v = t.value === '' ? '' : Math.max(0, Math.floor(+t.value) || 0);
  if (t.dataset.u != null) DR.uniq[DR.vendors[+t.dataset.u]] = v;
  else DR.grid[DR.funcs[+t.dataset.r]][DR.vendors[+t.dataset.c]] = v === '' ? 0 : v;
  updateEdit(); markDirty();
});
$('#systbl-e').addEventListener('change', e => {          // tidy what is shown once the cell is left
  const t = e.target; if (t.tagName !== 'INPUT') return;
  const s = cellVal(t); t.value = s === '' || s === 0 ? '' : s;
});
$('#systbl-e').addEventListener('click', e => {
  const b = e.target.closest('.x'); if (!b) return;
  const isV = b.dataset.rv != null, name = isV ? DR.vendors[+b.dataset.rv] : DR.funcs[+b.dataset.rf];
  if (!confirm('Remove "' + name + '"? Its numbers will be deleted.')) return;
  if (isV) { DR.vendors = DR.vendors.filter(v => v !== name); DR.funcs.forEach(f => delete DR.grid[f][name]); delete DR.uniq[name]; }
  else { DR.funcs = DR.funcs.filter(f => f !== name); delete DR.grid[name]; }
  renderSysEdit(); markDirty();
});
function addSys(kind) {
  const inp = $(kind === 'vendors' ? '#nv' : '#nf'), name = inp.value.trim(), list = DR[kind];
  if (!name) return;
  if (list.some(x => sameName(x, name))) return toast('"' + name + '" is already in the table');
  if (list.length >= (kind === 'vendors' ? 10 : 12)) return toast('Limit reached. Remove one first.');
  if (kind === 'vendors') { list.splice(list.length - 1, 0, name); DR.funcs.forEach(f => DR.grid[f][name] = 0); DR.uniq[name] = ''; }  // keeps "Other" last
  else { list.push(name); DR.grid[name] = {}; DR.vendors.forEach(v => DR.grid[name][v] = 0); }
  inp.value = ''; renderSysEdit(); markDirty();
}
$('#addv').onclick = () => addSys('vendors'); $('#addf').onclick = () => addSys('funcs');
$('#nv').onkeydown = e => { if (e.key === 'Enter') addSys('vendors'); }; $('#nf').onkeydown = e => { if (e.key === 'Enter') addSys('funcs'); };

$('#sysSave').onclick = async () => {
  const co = company, data = clone(DR), btn = $('#sysSave');
  sysSaving = true; btn.disabled = true; setSt('Saving\u2026');
  try {
    const r = await call({ action: 'systems', company: co, systems: data });
    if (r.error) throw new Error(r.error);
    if (co === company) { SYS = data; drDirty = false; updateSys(); }
    setSt('Saved'); toast('Systems saved');
  } catch { toast('Systems not saved. Check your connection.'); setSt('Not saved'); }
  finally { sysSaving = false; btn.disabled = false; }
};
addEventListener('beforeunload', e => { if (drDirty) { e.preventDefault(); e.returnValue = ''; } });
renderSysTable(); renderSysEdit();

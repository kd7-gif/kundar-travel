/* =========================================================
   Kundar Travel — interactions
   ========================================================= */
(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const naira = n => '₦' + n.toLocaleString('en-NG');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (location.search.includes('rec')) root.classList.add('rec');
root.classList.add('intro');

/* ---------------------------------------------------------
   DATA
   Listings come from the API (see api/). FALLBACK is used only when the
   API can't be reached, so the static site still works on its own.
   --------------------------------------------------------- */
// <meta name="kundar-api"> says where the API is:
//   "auto" — on this machine: same hostname on port 4000 (so the login cookie is same-site);
//            when deployed: same origin, because Netlify proxies /api and /uploads to the API
//   "off"  — no API; the site uses its built-in listings
//   a URL  — call the API there directly
const API = (() => {
  const v = (document.querySelector('meta[name="kundar-api"]')?.content || 'auto').trim();
  if (v === 'off') return null;
  if (v === 'auto') {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    return local ? `${location.protocol}//${location.hostname}:4000` : '';
  }
  return v.replace(/\/$/, '');
})();
const DASHBOARD = (() => {
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return 'http://localhost:5190';
  const v = (document.querySelector('meta[name="kundar-dashboard"]')?.content || '').trim();
  return v === 'auto' ? '' : v.replace(/\/$/, '');
})();
if (DASHBOARD) document.getElementById('navHost').href = DASHBOARD;
const FALLBACK = [
  { id: 1, name: 'Lekki Pool Terrace', area: 'Lekki Phase 1, Lagos', type: 'Apartments', price: 185000, rating: 4.9, reviews: 142, img: 'stay-1',
    about: 'A bright two-bedroom with its own plunge pool and a deep terrace, tucked into a quiet close off Admiralty Way. The canopy walk at Lekki Conservation Centre and the sand at Elegushi Beach are both a short drive away. In the evening there is suya from the corner spot, a swim under the palms, and the Link Bridge lighting up across the water.' },
  { id: 2, name: 'Ikoyi Lagoon Suite', area: 'Ikoyi, Lagos', type: 'Apartments', price: 150000, rating: 4.8, reviews: 128, img: 'stay-2',
    about: 'A high-floor suite with a glass balcony that looks straight over the Lagos lagoon to the Lekki–Ikoyi Link Bridge. Awolowo Road’s cafés and boutiques are minutes away, and Falomo is close for an easy run to Victoria Island. Mornings are slow coffee on the balcony while the ferries cut across the water.' },
  { id: 3, name: 'Maitama Garden House', area: 'Maitama, Abuja', type: 'Houses', price: 240000, rating: 4.9, reviews: 96, img: 'stay-3',
    about: 'A four-bedroom family house on a leafy Maitama street, with a walled garden and a shaded veranda made for long lunches. Millennium Park is close by for evening walks, and on clear days Aso Rock fills the view on the drive home. Great for families and small teams visiting the capital.' },
  { id: 4, name: 'Wuse Palm Court', area: 'Wuse II, Abuja', type: 'Apartments', price: 95000, rating: 4.7, reviews: 211, img: 'stay-4',
    about: 'Calm serviced apartments set around a palm-lined courtyard in the middle of Wuse II. Restaurants and lounges on Aminu Kano Crescent are a short walk away, and Banex Plaza and Wuse Market are close for shopping. A practical base for work trips with reliable power and fast Wi-Fi.' },
  { id: 5, name: 'Asokoro Warm Loft', area: 'Asokoro, Abuja', type: 'Apartments', price: 120000, rating: 4.8, reviews: 74, img: 'stay-5',
    about: 'An open-plan loft in warm wood and linen, in one of Abuja’s quietest districts at the foot of Aso Rock. The dining nook catches the late light, and the bedroom is tucked away for proper rest. It is ten minutes to the city centre and an easy run to the airport road.' },
  { id: 6, name: 'Bodija Reading Flat', area: 'Bodija, Ibadan', type: 'Apartments', price: 45000, rating: 4.7, reviews: 58, img: 'stay-6',
    about: 'A cosy flat lined with books and soft lamps, close to Bodija Market and a short ride to the University of Ibadan. Spend a morning at Agodi Gardens, then head to Dugbe to see Cocoa House, the city’s old landmark. Ideal for long stays, writers and visiting family.' },
  { id: 7, name: 'GRA Garden Duplex', area: 'Old GRA, Port Harcourt', type: 'Houses', price: 130000, rating: 4.8, reviews: 67, img: 'stay-7',
    about: 'A three-bedroom duplex on a tree-lined street in Old GRA, with a gated compound and parking for two cars. Isaac Boro Park and the city’s best boli-and-fish spots are close by. The house has a generator and inverter backup, so the AC keeps humming through the night.' },
  { id: 8, name: 'Victoria Island Sky Flat', area: 'Victoria Island, Lagos', type: 'Apartments', price: 160000, rating: 4.9, reviews: 183, img: 'stay-8',
    about: 'A sleek one-bedroom high in a Victoria Island tower, with city lights to the north and the Atlantic to the south. Eko Atlantic’s new waterfront is a few minutes away, and boats to Tarkwa Bay leave from the nearby jetty. Comes with a concierge, a gym and a rooftop pool.' }
];

const MAX_GUESTS = { 1: 6, 2: 3, 3: 8, 4: 4, 5: 3, 6: 2, 7: 6, 8: 2 };
const fromFallback = s => ({ ...s, city: s.area.split(', ').pop(), maxGuests: MAX_GUESTS[s.id],
  img700: `img/${s.img}-700.jpg`, img1400: `img/${s.img}-1400.jpg` });
const fromApi = l => ({ id: l.id, name: l.name, area: l.area, city: l.city, type: l.type, price: l.price,
  rating: l.rating, reviews: l.reviews, about: l.about, maxGuests: l.maxGuests,
  img700: l.image.small, img1400: l.image.large });

let ALL = FALLBACK.map(fromFallback);   // every listing (for detail + similar)
let apiOnline = false;

async function api(path, { method = 'GET', body } = {}) {
  if (API === null) throw Object.assign(new Error('No API configured'), { status: 0 });
  const res = await fetch(API + path, {
    method,
    credentials: 'include',              // send the session cookie
    headers: { Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error?.message || `HTTP ${res.status}`), { status: res.status, code: data.error?.code });
  }
  return data;
}

const SLIDES = [
  { thumb: 2, title: 'Discover Lagos', desc: 'Discover Lagos’s best places to stay and visit. Find suitable ones for you and your family' },
  { thumb: 1, title: 'Places to stay', desc: 'Lagoon-view suites, garden duplexes and quiet Abuja lofts picked for you' },
  { thumb: 0, title: 'Places to go', desc: 'Explore Abuja, Ibadan and Port Harcourt through the eyes of the people who live there' }
];

const liked = new Set();

/* ---------------------------------------------------------
   PROCEDURAL CLOUDS — white on black, used with screen blend
   --------------------------------------------------------- */
function makeClouds() {
  const W = 960, H = 440;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;

  // seeded value noise
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const perm = new Uint8Array(512), vals = new Float32Array(256);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) vals[i] = rnd();
  const sm = t => t * t * (3 - 2 * t);
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = vals[perm[(xi & 255) + perm[yi & 255]]], b = vals[perm[((xi + 1) & 255) + perm[yi & 255]]];
    const e = vals[perm[(xi & 255) + perm[(yi + 1) & 255]]], f = vals[perm[((xi + 1) & 255) + perm[(yi + 1) & 255]]];
    const u = sm(xf), v = sm(yf);
    return (a + (b - a) * u) + ((e + (f - e) * u) - (a + (b - a) * u)) * v;
  };
  const fbm = (x, y) => {
    let s = 0, amp = .5, f = 1;
    for (let o = 0; o < 6; o++) { s += vn(x * f, y * f) * amp; f *= 2.03; amp *= .5; }
    return s / .984;
  };
  const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  for (let y = 0; y < H; y++) {
    const g = y / H;
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 150, y / 110);
      const dens = n + Math.pow(g, 1.6) * 1.05 - .78; // sparse puffs up top, dense bank at the bottom
      let v = sst(.0, .5, dens);
      const shade = .72 + .28 * sst(.3, .75, fbm(x / 60 + 40, y / 50 + 9)); // inner volume
      v *= shade;
      const k = (y * W + x) * 4, c8 = v * 255;
      d[k] = c8; d[k + 1] = c8; d[k + 2] = c8; d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  root.style.setProperty('--cloud', `url(${c.toDataURL('image/jpeg', .9)})`);
}
makeClouds();

/* ---------------------------------------------------------
   CURSOR
   --------------------------------------------------------- */
const cursor = $('#cursor');
if (matchMedia('(pointer:fine)').matches) {
  const HOV = 'a,button,label,input,.card,.thumb,.field,.d-th,[data-hover]';
  addEventListener('pointermove', e => {
    cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    cursor.classList.add('show');
    cursor.classList.toggle('hover', !!e.target.closest(HOV));
  }, { passive: true });
  addEventListener('pointerdown', () => cursor.classList.add('down'));
  addEventListener('pointerup', () => cursor.classList.remove('down'));
  document.addEventListener('pointerleave', () => cursor.classList.remove('show'));
}

/* ---------------------------------------------------------
   HERO — rail layout
   --------------------------------------------------------- */
const hero = $('#hero');
const slides = $$('.slide');
const phs = slides.map(s => $('.ph', s));
const thumbs = $$('.thumb');
const ring1 = $('#ring1'), ring2 = $('#ring2');
const connector = $('#connector'), caption = $('#caption');
const capBar = $('.cap-bar'), capTitle = $('#capTitle'), capDesc = $('#capDesc');
let cur = 0;

function layoutRail(slideIdx) {
  const vw = innerWidth, H = hero.offsetHeight;
  const A = clamp(vw * .113, 96, 190), s = clamp(vw * .054, 46, 92), gap = Math.max(8, vw * .009);
  const cx = vw * .855;
  const activeThumb = SLIDES[slideIdx].thumb;
  let y = 74 + H * .085, ac = null;
  thumbs.forEach((t, i) => {
    const sz = i === activeThumb ? A : s;
    t.style.width = t.style.height = sz + 'px';
    t.style.left = (cx - sz / 2) + 'px';
    t.style.top = y + 'px';
    t.classList.toggle('active', i === activeThumb);
    if (i === activeThumb) ac = { x: cx, y: y + sz / 2, left: cx - sz / 2 };
    y += sz + gap;
  });
  [[ring1, A / 2 + vw * .05], [ring2, A / 2 + vw * .108]].forEach(([r, rad]) => {
    r.style.width = r.style.height = rad * 2 + 'px';
    r.style.left = (ac.x - rad) + 'px';
    r.style.top = (ac.y - rad) + 'px';
  });
  const cw = Math.max(40, vw * .047), cRight = ac.left - vw * .008;
  connector.style.width = cw + 'px';
  connector.style.left = (cRight - cw) + 'px';
  connector.style.top = (ac.y - 1.5) + 'px';
  const barH = Math.max(84, vw * .065);
  capBar.style.height = barH + 'px';
  caption.style.right = (vw - (cRight - cw - 16)) + 'px';
  caption.style.top = (ac.y - barH / 2) + 'px';
}

function setCaption(i) {
  capTitle.textContent = SLIDES[i].title;
  capDesc.textContent = SLIDES[i].desc;
}
function showCaption(on) {
  connector.classList.toggle('show', on);
  caption.classList.toggle('show', on);
}

/* ---------------------------------------------------------
   HERO — misty right-to-left wipe
   --------------------------------------------------------- */
const mist = $('#mist');
let trans = null, liveStart = performance.now();
let autoTimer = null;
const ptr = { x: 0, y: 0, sx: 0, sy: 0 };

function goTo(next) {
  if (trans || next === cur) return;
  const out = cur;
  slides[out].classList.remove('is-live');
  slides[out].classList.add('is-out');
  slides[next].classList.add('is-in');
  trans = { from: out, to: next, start: performance.now(), outScale: currentScale(), outX: ptr.sx * .6, outY: ptr.sy * .5 };
  cur = next;
  layoutRail(next);
  showCaption(false);
  setTimeout(() => { setCaption(next); showCaption(true); }, 650);
  scheduleAuto();
}

function currentScale() {
  return 1.04 + Math.min(12, (performance.now() - liveStart) / 1000) * .0035;
}

function scheduleAuto() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (!detailOpen && !document.hidden) goTo((cur + 1) % slides.length);
    else scheduleAuto();
  }, 5200);
}

function frame(now) {
  // smooth pointer parallax
  ptr.sx += (ptr.x - ptr.sx) * .05;
  ptr.sy += (ptr.y - ptr.sy) * .05;

  if (trans) {
    const t = clamp((now - trans.start) / 1250, 0, 1), p = easeIO(t);
    const a = p * 135 - 35, b = p * 135, m = (a + b) / 2;
    const mask = `linear-gradient(to left, #000 ${a}%, rgba(0,0,0,.6) ${m}%, transparent ${b}%)`;
    const inc = slides[trans.to];
    inc.style.webkitMaskImage = inc.style.maskImage = mask;
    phs[trans.to].style.transform = `translateX(${2 * (1 - p)}%) scale(${1.12 - .08 * p})`;
    phs[trans.from].style.transform = `translate(${trans.outX - 2 * p}%, ${trans.outY}%) scale(${trans.outScale + .05 * p})`;
    const vw = innerWidth, mw = vw * .34;
    mist.style.transform = `translateX(${vw * (1 - m / 100) - mw / 2}px)`;
    mist.style.opacity = (.95 * Math.sin(Math.PI * t)).toFixed(3);
    if (t >= 1) {
      inc.style.webkitMaskImage = inc.style.maskImage = '';
      inc.classList.remove('is-in'); inc.classList.add('is-live');
      slides[trans.from].classList.remove('is-out');
      phs[trans.from].style.transform = '';
      mist.style.opacity = 0;
      trans = null;
      liveStart = now;
      ptr.sx = ptr.sy = 0;
    }
  } else if (!reduced && !detailOpen) {
    const ramp = Math.min(1, (now - liveStart) / 1200);
    phs[cur].style.transform = `translate(${ptr.sx * .6 * ramp}%, ${ptr.sy * .5 * ramp}%) scale(${currentScale()})`;
  }
  requestAnimationFrame(frame);
}

addEventListener('pointermove', e => {
  ptr.x = (e.clientX / innerWidth) * 2 - 1;
  ptr.y = (e.clientY / innerHeight) * 2 - 1;
}, { passive: true });

thumbs.forEach(t => t.addEventListener('click', () => goTo(+t.dataset.slide)));

/* ---------------------------------------------------------
   SCROLL CHOREOGRAPHY
   --------------------------------------------------------- */
const nav = $('#nav'), slidesEl = $('#slides'), cbank = $('#cbank'), ctop = $('#ctop'), rail = $('#rail');
let ticking = false;
function onScroll() {
  const sy = scrollY, vh = innerHeight;
  nav.classList.toggle('solid', detailOpen || sy > vh * .3);
  if (sy < hero.offsetHeight * 1.2) {
    slidesEl.style.transform = `translateY(${sy * .42}px)`;
    cbank.style.transform = `translateY(${-sy * .38}px) scale(${1 + .35 * sy / vh})`;
    ctop.style.opacity = clamp(sy / (vh * .45), 0, 1).toFixed(3);
    ctop.style.transform = `translateY(${-sy * .25}px)`;
    rail.style.transform = `translateY(${sy * .2}px)`;
    rail.style.opacity = clamp(1 - sy / (vh * .5), 0, 1).toFixed(3);
  }
  ticking = false;
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

/* ---------------------------------------------------------
   SEARCH BAR
   --------------------------------------------------------- */
const search = $('#search');
const fields = $$('.field', search);
const popDest = $('#popDest'), popCal = $('#popCal'), popGuests = $('#popGuests');
const state = { city: 'Lagos', cin: null, cout: null, picking: 'in', adults: 0, children: 0 };
const today = new Date(); today.setHours(0, 0, 0, 0);
let view = new Date(today.getFullYear(), today.getMonth(), 1);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function setOn(name) { fields.forEach(f => f.classList.toggle('on', f.dataset.field === name)); }
function closePops() { [popDest, popCal, popGuests].forEach(p => p.classList.remove('open')); }
function openPop(p, anchor) {
  closePops();
  if (p === popCal && innerWidth > 640) {
    const sr = search.getBoundingClientRect(), fr = anchor.getBoundingClientRect();
    p.style.left = Math.min(fr.left - sr.left, sr.width - 309) + 'px';
  }
  p.classList.add('open');
}

fields.forEach(f => f.addEventListener('click', e => {
  e.stopPropagation();
  const k = f.dataset.field;
  setOn(k);
  if (k === 'dest') openPop(popDest, f);
  else if (k === 'in') { state.picking = 'in'; renderCal(); openPop(popCal, f); }
  else if (k === 'out') { state.picking = state.cin ? 'out' : 'in'; if (!state.cin) setOn('in'); renderCal(); openPop(popCal, fields[1]); }
  else openPop(popGuests, f);
}));

popDest.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.city = b.dataset.city;
  $('#destLabel').textContent = state.city;
  $$('button', popDest).forEach(x => x.classList.toggle('sel', x === b));
  setOn('in'); state.picking = 'in'; renderCal(); openPop(popCal, fields[1]);
  e.stopPropagation();
});

function renderCal() {
  const y = view.getFullYear(), m = view.getMonth();
  $('#calMonth').textContent = `${MONTHS[m]} ${y}`;
  $('.cal-nav[data-dir="-1"]').disabled = y === today.getFullYear() && m === today.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7;   // Monday first
  const days = new Date(y, m + 1, 0).getDate();
  let html = '';
  for (let i = 0; i < first; i++) html += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const dt = new Date(y, m, d), t = dt.getTime();
    let cls = '';
    const dis = dt < today || (state.picking === 'out' && state.cin && t <= state.cin.getTime());
    if (state.cin && t === state.cin.getTime()) cls = 'end';
    if (state.cout && t === state.cout.getTime()) cls = 'end';
    if (state.cin && state.cout && t > state.cin.getTime() && t < state.cout.getTime()) cls = 'mid';
    if (t === today.getTime()) cls += ' today';
    html += `<button type="button" data-t="${t}" class="${cls}" ${dis ? 'disabled' : ''}>${d}</button>`;
  }
  $('#calGrid').innerHTML = html;
}

popCal.addEventListener('click', e => {
  e.stopPropagation();
  const nav = e.target.closest('.cal-nav');
  if (nav) { view = new Date(view.getFullYear(), view.getMonth() + +nav.dataset.dir, 1); renderCal(); return; }
  const b = e.target.closest('button[data-t]'); if (!b || b.disabled) return;
  const d = new Date(+b.dataset.t);
  if (state.picking === 'in') {
    state.cin = d; state.cout = null; state.picking = 'out';
    $('#inSub').textContent = fmt(d); $('#outSub').textContent = 'Add date';
    setOn('out'); renderCal();
  } else {
    state.cout = d;
    $('#outSub').textContent = fmt(d);
    renderCal();
    setTimeout(() => { setOn('guests'); openPop(popGuests, fields[3]); }, 220);
  }
});

popGuests.addEventListener('click', e => {
  e.stopPropagation();
  const b = e.target.closest('.step button'); if (!b) return;
  const k = b.closest('.step').dataset.k;
  state[k] = clamp(state[k] + +b.dataset.d, 0, k === 'adults' ? 16 : 10);
  renderGuests();
});
function renderGuests() {
  $$('.step', popGuests).forEach(s => {
    const k = s.dataset.k;
    $('output', s).textContent = state[k];
    $('button[data-d="-1"]', s).disabled = state[k] === 0;
  });
  const n = state.adults + state.children;
  $('#guestSub').textContent = n ? `${n} guest${n > 1 ? 's' : ''}` : 'Add guests';
}
renderGuests();

document.addEventListener('click', e => { if (!e.target.closest('#search')) closePops(); });
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const modal = $('.modal.open');
  if (modal) return closeModal(modal);
  if (!$('#acctMenu').hidden) return toggleMenu(false);
  closePops();
  if (detailOpen) closeStay();
});

$('#send').addEventListener('click', e => {
  e.stopPropagation(); closePops();
  runSearch();
  $('#stays').scrollIntoView({ behavior: 'smooth' });
});

/* ---------------------------------------------------------
   CARDS
   --------------------------------------------------------- */
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5-4.8-4.5 6.5-.8z"/></svg>';
const HEART = '<svg viewBox="0 0 24 24"><path d="M12 20.5s-8-4.9-8-11A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8 2.9c0 6.1-8 11-8 11z"/></svg>';
const PIN = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 14.5s5-4.6 5-8.3A5 5 0 0 0 3 6.2c0 3.7 5 8.3 5 8.3z"/><circle cx="8" cy="6.2" r="1.8"/></svg>';

function cardHTML(s) {
  const name = esc(s.name), area = esc(s.area);
  return `<article class="card" data-id="${s.id}" tabindex="0" aria-label="${name}, ${area}">
    <img src="${esc(s.img700)}" alt="${name}, ${area}" loading="lazy">
    <div class="price">${naira(s.price)}<small>/night</small></div>
    <button class="heart ${liked.has(s.id) ? 'on' : ''}" type="button" aria-label="Save ${name}">${HEART}</button>
    <div class="c-info">
      <div class="c-name">${name}</div>
      <div class="c-area">${PIN}${area}</div>
      <div class="c-rate">${s.reviews ? `<span class="stars">${STAR.repeat(5)}</span>${s.rating.toFixed(1)}` : 'New on Kundar'}</div>
    </div>
  </article>`;
}

const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    const card = en.target, grid = card.parentElement;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const idx = [...grid.children].indexOf(card);
    card.style.setProperty('--d', (idx % cols) * .09 + 's');
    card.classList.add('in');
    io.unobserve(card);
  });
}, { threshold: .15 });

function renderGrid(el, list) {
  el.innerHTML = list.map(cardHTML).join('');
  $$('.card', el).forEach(c => io.observe(c));
}
renderGrid($('#grid'), ALL);

const secTitle = $('#stays .sec-head h2');
const DEFAULT_TITLE = secTitle.textContent;

// Free hosting sleeps when idle, so the first call can time out while the API wakes up.
// Keep the built-in listings on screen and quietly retry a few times.
let listingTries = 0;
async function loadListings() {
  listingTries++;
  try {
    const data = await api('/api/listings');
    ALL = data.listings.map(fromApi);
    apiOnline = true;
    renderGrid($('#grid'), ALL);
    // a stay opened from the URL before the API answered: swap in live data
    if (detailOpen && currentStay) {
      currentStay = ALL.find(x => x.id === currentStay.id) || currentStay;
      loadUnavailable(currentStay);
    }
    initSession();
  } catch (err) {
    if (API === null) return;
    if (listingTries < 5) setTimeout(loadListings, 6000 * listingTries);
    else console.info('[Kundar] API unavailable, showing built-in listings:', err.message);
  }
}

function showAll() {
  secTitle.textContent = DEFAULT_TITLE;
  $('#searchNote').hidden = true;
  renderGrid($('#grid'), ALL);
}

async function runSearch() {
  const guests = state.adults + state.children;
  const q = new URLSearchParams({ city: state.city });
  if (state.cin && state.cout) { q.set('checkin', toIso(state.cin)); q.set('checkout', toIso(state.cout)); }
  if (guests) q.set('guests', guests);

  let results;
  if (apiOnline) {
    try { results = (await api('/api/listings?' + q)).listings.map(fromApi); }
    catch (err) { return showNote(err.message); }
  } else {
    // offline: filter by city and size only (no availability without the API)
    results = ALL.filter(s => s.city === state.city && (!guests || s.maxGuests >= guests));
  }

  const parts = [];
  if (state.cin && state.cout) parts.push(`${fmt(state.cin)} – ${fmt(state.cout)}`);
  if (guests) parts.push(`${guests} guest${guests > 1 ? 's' : ''}`);
  parts.push(`${results.length} stay${results.length === 1 ? '' : 's'}`);
  secTitle.textContent = `Available in ${state.city}`;
  showNote(parts.join(' · ') + (results.length ? '' : ' — try other dates or another city.'));
  renderGrid($('#grid'), results);
}

function showNote(text) {
  const n = $('#searchNote');
  n.textContent = text;
  n.hidden = false;
}

$('.see-all').addEventListener('click', e => { e.preventDefault(); showAll(); $('#stays').scrollIntoView({ behavior: 'smooth' }); });

function toggleLike(id, btn) {
  liked.has(id) ? liked.delete(id) : liked.add(id);
  const on = liked.has(id);
  $$(`.card[data-id="${id}"] .heart`).forEach(h => h.classList.toggle('on', on));
  if (currentStay && currentStay.id === id) $('#dHeart').classList.toggle('on', on);
  btn.classList.add('pop');
  setTimeout(() => btn.classList.remove('pop'), 260);
}

document.addEventListener('click', e => {
  const heart = e.target.closest('.card .heart');
  if (heart) { e.stopPropagation(); toggleLike(+heart.closest('.card').dataset.id, heart); return; }
  const card = e.target.closest('.card');
  if (card) openStay(+card.dataset.id, card);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList?.contains('card')) openStay(+e.target.dataset.id, e.target);
});

/* ---------------------------------------------------------
   DETAIL PAGE + SHARED-ELEMENT FLIGHT
   --------------------------------------------------------- */
const detail = $('#detail'), dMain = $('#dMain'), dLo = $('#dMainLo'), dHi = $('#dMainHi');
let detailOpen = false, currentStay = null, bGuests = 2;
const toIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function defaultDates() {
  let cin = new Date(2026, 11, 22), cout = new Date(2026, 11, 27);
  if (cin < today) { cin = addD(today, 14); cout = addD(cin, 5); }
  return { cin, cout };
}
// booking-card state: chosen dates, nights already taken, and the live hold (if any)
const bk = { cin: null, cout: null, unavailable: new Set(), hold: null, timer: null };
const longFmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function fillDetail(s) {
  currentStay = s;
  $('#crumbType').textContent = s.type;
  $('#crumbName').textContent = `${s.name}, ${s.area}`;
  $('#dName').textContent = s.name;
  $('#dAboutTitle').textContent = `About ${s.name}`;
  $('#dCopy').textContent = s.about;
  $('#bPrice').textContent = naira(s.price);
  $('#rScore').textContent = s.reviews ? s.rating.toFixed(1) : 'New';
  $('#rCount').textContent = s.reviews ? `(${s.reviews} reviews)` : 'No reviews yet';
  $('#rStars').innerHTML = s.reviews ? STAR.repeat(5) : '';
  $('#dHeart').innerHTML = HEART;
  $('#dHeart').classList.toggle('on', liked.has(s.id));
  dLo.src = s.img700; dLo.alt = s.name;
  dHi.classList.remove('ok');
  dHi.onload = () => dHi.classList.add('ok');
  dHi.src = s.img1400; dHi.alt = s.name;
  const total = state.adults + state.children;
  bGuests = clamp(total || 2, 1, s.maxGuests);
  resetBookingCard(s);
  // similar: same city first, then the rest
  const others = ALL.filter(x => x.id !== s.id);
  const sim = [...others.filter(x => x.city === s.city), ...others.filter(x => x.city !== s.city)].slice(0, 4);
  renderGrid($('#simGrid'), sim);
}

function renderBooking() {
  const s = currentStay;
  const nights = Math.max(1, Math.round((bk.cout - bk.cin) / 864e5));
  $('#bIn').textContent = longFmt(bk.cin);
  $('#bOut').textContent = longFmt(bk.cout);
  const inI = $('#bInInput'), outI = $('#bOutInput');
  inI.value = toIso(bk.cin); inI.min = toIso(today);
  outI.value = toIso(bk.cout); outI.min = toIso(addD(bk.cin, 1)); outI.max = toIso(addD(bk.cin, 60));
  $('#bGuests').textContent = bGuests;
  $('#bStep [data-d="-1"]').disabled = !!bk.hold || bGuests <= 1;
  $('#bStep [data-d="1"]').disabled = !!bk.hold || bGuests >= s.maxGuests;
  $('#bCalc').textContent = `${naira(s.price)} × ${nights} night${nights > 1 ? 's' : ''}`;
  $('#bTotal').textContent = naira(s.price * nights);
  if (!bk.hold) checkAvailability();
}

function setMsg(text, ok = false) {
  const m = $('#bMsg');
  m.textContent = text || '';
  m.hidden = !text;
  m.classList.toggle('ok', ok);
}

function rangeTaken() {
  for (let d = bk.cin; d < bk.cout; d = addD(d, 1)) if (bk.unavailable.has(toIso(d))) return true;
  return false;
}
function checkAvailability() {
  const taken = rangeTaken();
  $('#bBtn').disabled = taken;
  if (taken) setMsg('Not available on those dates — try different ones.');
  else if ($('#bMsg').textContent.startsWith('Not available')) setMsg('');
}

async function loadUnavailable(s) {
  if (!apiOnline) return;
  try {
    const r = await api(`/api/listings/${s.id}/unavailable?from=${toIso(today)}&to=${toIso(addD(today, 366))}`);
    if (currentStay !== s) return;
    bk.unavailable = new Set(r.nights);
    if (!bk.hold) checkAvailability();
  } catch { /* calendar hints are optional */ }
}

function resetBookingCard(s) {
  stopTimer();
  bk.hold = null;
  const d = state.cin && state.cout ? { cin: state.cin, cout: state.cout } : defaultDates();
  bk.cin = d.cin; bk.cout = d.cout;
  bk.unavailable = new Set();
  $('.book').classList.remove('is-held');
  $('#bBtn').hidden = false;
  $('#bHold').hidden = true;
  setMsg('');
  renderBooking();
  loadUnavailable(s);
  restoreHold(s);
}

$('#bStep').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || bk.hold) return;
  bGuests = clamp(bGuests + +b.dataset.d, 1, currentStay.maxGuests);
  renderBooking();
});

// the date boxes are native date inputs laid over the labels
['#bInInput', '#bOutInput'].forEach(sel => $(sel).addEventListener('click', e => { try { e.target.showPicker(); } catch {} }));
$('#bInInput').addEventListener('change', e => {
  if (!e.target.value) return renderBooking();
  const d = fromIso(e.target.value);
  if (d < today) return renderBooking();
  const nights = Math.round((bk.cout - bk.cin) / 864e5);
  bk.cin = d;
  if (bk.cout <= d || Math.round((bk.cout - d) / 864e5) > 60) bk.cout = addD(d, clamp(nights, 1, 60));
  renderBooking();
});
$('#bOutInput').addEventListener('change', e => {
  if (!e.target.value) return renderBooking();
  const d = fromIso(e.target.value);
  if (d > bk.cin && Math.round((d - bk.cin) / 864e5) <= 60) bk.cout = d;
  renderBooking();
});

$('#bBtn').addEventListener('click', () => {
  if (!apiOnline) return setMsg('Booking is offline right now — the Kundar API isn’t reachable.');
  if (!currentUser) return openAuth('login', 'Log in to hold these dates.', placeHold);
  placeHold();
});

async function placeHold() {
  const s = currentStay, btn = $('#bBtn');
  btn.classList.add('busy'); btn.textContent = 'Holding your dates…'; setMsg('');
  try {
    const { booking } = await api('/api/bookings', {
      method: 'POST',
      body: { listingId: s.id, checkIn: toIso(bk.cin), checkOut: toIso(bk.cout), guests: bGuests }
    });
    upsertMine(booking);
    if (currentStay === s) showHold(booking);
  } catch (err) {
    if (err.status === 401) { setUser(null); return openAuth('login', 'Your session ended. Log in to hold these dates.', placeHold); }
    if (err.code === 'dates_unavailable') loadUnavailable(s);
    setMsg(err.message);
  } finally {
    btn.classList.remove('busy'); btn.textContent = 'Book Now';
  }
}

function showHold(b) {
  bk.hold = b;
  bk.cin = fromIso(b.checkIn); bk.cout = fromIso(b.checkOut); bGuests = b.guests;
  $('.book').classList.add('is-held');
  $('#bBtn').hidden = true;
  $('#bHold').hidden = false;
  $('#bPaywall').hidden = true;
  $('#bPay').hidden = false;
  setMsg('');
  renderBooking();
  startTimer();
}

function startTimer() {
  stopTimer();
  const tick = () => {
    const left = new Date(bk.hold.holdExpiresAt) - Date.now();
    if (left <= 0) { markMine(bk.hold.id, 'expired'); return endHold('Your hold ran out, so the dates were released.'); }
    $('#bTimer').textContent = mmss(left);
  };
  tick();
  bk.timer = setInterval(tick, 1000);
}
function stopTimer() { clearInterval(bk.timer); bk.timer = null; }

function endHold(msg, ok) {
  stopTimer();
  bk.hold = null;
  $('.book').classList.remove('is-held');
  $('#bHold').hidden = true;
  $('#bBtn').hidden = false;
  renderBooking();
  loadUnavailable(currentStay);
  setMsg(msg, ok);
}

$('#bPay').addEventListener('click', async e => {
  const btn = e.currentTarget;
  if (!bk.hold) return;
  btn.classList.add('busy'); btn.textContent = 'Opening payment…';
  try {
    await api(`/api/bookings/${bk.hold.id}/pay`, { method: 'POST', body: {} });
  } catch (err) {
    if (err.code === 'payments_unavailable') {
      $('#bPaywallTitle').textContent = err.message;
      $('#bPaywall').hidden = false;
      btn.hidden = true;
    } else if (err.code === 'not_found' || err.status === 401) {
      endHold('This hold is no longer active.');
    } else setMsg(err.message);
  } finally {
    btn.classList.remove('busy'); btn.textContent = 'Continue to payment';
  }
});

$('#bRelease').addEventListener('click', async e => {
  const id = bk.hold?.id, btn = e.currentTarget; if (!id) return;
  btn.classList.add('busy');
  try {
    const { booking } = await api(`/api/bookings/${id}`, { method: 'DELETE' });
    upsertMine(booking);
    endHold('Dates released — they’re free for anyone to book again.', true);
  } catch (err) {
    if (err.code === 'not_held') { markMine(id, 'expired'); endHold('This hold had already ended.'); }
    else setMsg(err.message);
  } finally {
    btn.classList.remove('busy');
  }
});

$('#dHeart').addEventListener('click', e => { if (currentStay) toggleLike(currentStay.id, e.currentTarget); });

function openStay(id, cardEl, instant) {
  const s = ALL.find(x => x.id === id); if (!s) return;
  const fromImg = cardEl && $('img', cardEl);
  const from = fromImg && fromImg.getBoundingClientRect();
  fillDetail(s);
  detail.scrollTop = 0;
  detail.setAttribute('aria-hidden', 'false');
  detailOpen = true;
  root.classList.add('lock');
  onScroll();
  closePops();
  if (location.hash !== '#stay-' + id) history.pushState({ stay: id }, '', '#stay-' + id);

  $$('.rise', detail).forEach((el, i) => el.style.setProperty('--d', (.25 + i * .07) + 's'));
  detail.classList.add('open');
  requestAnimationFrame(() => detail.classList.add('shown'));

  if (!from || instant || reduced) { dMain.classList.remove('hidden'); return; }

  dMain.classList.add('hidden');
  requestAnimationFrame(() => {
    const to = dMain.getBoundingClientRect();
    const fly = document.createElement('img');
    fly.className = 'fly';
    fly.src = fromImg.currentSrc || fromImg.src;
    document.body.appendChild(fly);
    const t0 = performance.now();
    const step = now => {
      const t = clamp((now - t0) / 900, 0, 1), p = easeIO(t);
      const L = (a, b) => a + (b - a) * p;
      fly.style.left = L(from.left, to.left) + 'px';
      fly.style.top = L(from.top, to.top) + 'px';
      fly.style.width = L(from.width, to.width) + 'px';
      fly.style.height = L(from.height, to.height) + 'px';
      fly.style.borderRadius = L(12, 10) + 'px';
      if (t < 1) requestAnimationFrame(step);
      else { dMain.classList.remove('hidden'); requestAnimationFrame(() => fly.remove()); }
    };
    requestAnimationFrame(step);
  });
}

function closeStay(fromPop) {
  if (!detailOpen) return;
  detailOpen = false;
  stopTimer();
  detail.classList.remove('open', 'shown');
  detail.setAttribute('aria-hidden', 'true');
  root.classList.remove('lock');
  onScroll();
  if (!fromPop && location.hash.startsWith('#stay-')) history.pushState({}, '', location.pathname + location.search);
  liveStart = performance.now();
  scheduleAuto();
}

addEventListener('popstate', () => {
  const m = location.hash.match(/^#stay-(\d+)$/);
  if (m) openStay(+m[1], null, true); else closeStay(true);
});

$('#logo').addEventListener('click', e => {
  e.preventDefault();
  if (detailOpen) closeStay(); else scrollTo({ top: 0, behavior: 'smooth' });
});
$('#crumbHome').addEventListener('click', e => { e.preventDefault(); closeStay(); });
$$('.nav-links a, .see-all').forEach(a => a.addEventListener('click', e => {
  if (detailOpen) { e.preventDefault(); closeStay(); setTimeout(() => $(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth' }), 400); }
}));

/* ---------------------------------------------------------
   ACCOUNT: session, log-in dialog, account menu, "My stays"
   --------------------------------------------------------- */
let currentUser = null, myBookings = [];
const acctMenu = $('#acctMenu'), navPill = $('#navPill'), navUser = $('#navUser');
const USER_ICON = navUser.innerHTML;
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const fmtIso = s => fmt(fromIso(s));
const isLive = b => b.status === 'held' && new Date(b.holdExpiresAt) > Date.now();

function setUser(u) {
  currentUser = u;
  acctMenu.classList.toggle('signed-in', !!u);
  const head = $('#acctHead');
  head.hidden = !u;
  head.innerHTML = u ? `<b>${esc(u.name)}</b>${esc(u.email)}` : '';
  if (u) { navUser.textContent = initials(u.name); navUser.classList.add('initials'); }
  else { navUser.innerHTML = USER_ICON; navUser.classList.remove('initials'); myBookings = []; }
  navPill.setAttribute('aria-label', u ? `Account menu for ${u.name}` : 'Account menu');
}

async function initSession() {
  try {
    const { user } = await api('/api/auth/me');
    setUser(user);
    await loadMine();
    if (detailOpen && currentStay && !bk.hold) restoreHold(currentStay);
  } catch { /* stay logged out */ }
}

async function loadMine() {
  if (!currentUser) return;
  try { myBookings = (await api('/api/bookings/mine')).bookings; } catch { /* keep what we had */ }
}
function upsertMine(b) {
  const i = myBookings.findIndex(x => x.id === b.id);
  if (i >= 0) myBookings[i] = b; else myBookings.unshift(b);
}
function markMine(id, status) {
  const b = myBookings.find(x => x.id === id);
  if (b) b.status = status;
}
function restoreHold(s) {
  const h = myBookings.find(b => b.listing.id === s.id && isLive(b));
  if (h) showHold(h);
}

// menu
function toggleMenu(open) {
  acctMenu.hidden = !open;
  navPill.setAttribute('aria-expanded', String(open));
}
navPill.addEventListener('click', e => { e.stopPropagation(); toggleMenu(acctMenu.hidden); });
document.addEventListener('click', e => { if (!e.target.closest('.acct-wrap')) toggleMenu(false); });
acctMenu.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  toggleMenu(false);
  const act = b.dataset.act;
  if (act === 'login' || act === 'signup') openAuth(act);
  else if (act === 'stays') openDrawer();
  else if (act === 'logout') {
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* clear locally anyway */ }
    setUser(null);
    if (detailOpen && currentStay && bk.hold) endHold('');
  }
});

// modals
let lastFocus = null;
function openModal(m) {
  lastFocus = document.activeElement;
  m.hidden = false;
  requestAnimationFrame(() => m.classList.add('open'));
}
function closeModal(m) {
  m.classList.remove('open');
  setTimeout(() => { if (!m.classList.contains('open')) m.hidden = true; }, 260);
  if (m.id === 'drawer') clearInterval(drawerTimer);
  if (m.id === 'authModal') afterAuth = null;
  lastFocus?.focus?.({ preventScroll: true });
}
$$('.modal').forEach(m => m.addEventListener('click', e => {
  if (e.target === m || e.target.closest('[data-close]')) closeModal(m);
}));

// log in / sign up
let authMode = 'login', afterAuth = null;
function setAuthMode(mode) {
  authMode = mode;
  $$('#authModal .tabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $('#nameRow').hidden = mode !== 'signup';
  $('#authTitle').textContent = mode === 'signup' ? 'Create your account' : 'Welcome back';
  $('#authSubmit').textContent = mode === 'signup' ? 'Sign up' : 'Log in';
  $('#authForm [name=password]').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
}
function openAuth(mode = 'login', sub, then) {
  setAuthMode(mode);
  $('#authSub').textContent = sub || (mode === 'signup' ? 'Create an account to hold dates at a Kundar stay.' : 'Log in to hold dates at a Kundar stay.');
  $('#authErr').hidden = true;
  openModal($('#authModal'));
  afterAuth = then || null;
  setTimeout(() => $(`#authForm [name=${mode === 'signup' ? 'name' : 'email'}]`).focus(), 80);
}
$$('#authModal .tabs button').forEach(b => b.addEventListener('click', () => { setAuthMode(b.dataset.mode); $('#authErr').hidden = true; }));
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.currentTarget, btn = $('#authSubmit'), errEl = $('#authErr');
  const showErr = t => { errEl.textContent = t; errEl.hidden = false; };
  const data = Object.fromEntries(new FormData(form));
  if (authMode !== 'signup') delete data.name;
  if (authMode === 'signup' && (data.name || '').trim().length < 2) return showErr('Enter your full name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) return showErr('Enter a valid email address');
  if ((data.password || '').length < 8) return showErr('Password must be at least 8 characters');
  if (!apiOnline) return showErr('Accounts are offline right now — the Kundar API isn’t reachable.');
  btn.classList.add('busy');
  try {
    const { user } = await api(`/api/auth/${authMode}`, { method: 'POST', body: data });
    setUser(user);
    await loadMine();
    form.reset();
    const next = afterAuth;
    closeModal($('#authModal'));
    if (detailOpen && currentStay && !bk.hold) restoreHold(currentStay);
    if (next && !bk.hold) next();
  } catch (err) {
    showErr(err.message);
  } finally {
    btn.classList.remove('busy');
  }
});

// My stays drawer
let drawerTimer = null;
async function openDrawer() {
  openModal($('#drawer'));
  renderDrawer();
  await loadMine();
  renderDrawer();
  clearInterval(drawerTimer);
  drawerTimer = setInterval(() => {
    let changed = false;
    $$('#drawerList .chip.held').forEach(c => {
      const left = new Date(c.dataset.exp) - Date.now();
      if (left <= 0) { markMine(+c.dataset.id, 'expired'); changed = true; }
      else c.textContent = `On hold · ${mmss(left)}`;
    });
    if (changed) renderDrawer();
  }, 1000);
}
function renderDrawer() {
  const list = $('#drawerList');
  if (!myBookings.length) {
    list.innerHTML = '<p class="drawer-empty">No stays yet. Open a place you like and press Book Now to hold your dates.</p>';
    return;
  }
  list.innerHTML = myBookings.map(b => {
    const chip = isLive(b)
      ? `<span class="chip held" data-id="${b.id}" data-exp="${esc(b.holdExpiresAt)}">On hold · ${mmss(new Date(b.holdExpiresAt) - Date.now())}</span>`
      : `<span class="chip">${b.status === 'cancelled' ? 'Released' : 'Expired'}</span>`;
    return `<article class="trip">
      <img src="${esc(b.listing.image || '')}" alt="">
      <div>
        <h3>${esc(b.listing.name)}</h3>
        <p>${fmtIso(b.checkIn)} – ${fmtIso(b.checkOut)} · ${b.guests} guest${b.guests > 1 ? 's' : ''} · ${naira(b.total)}</p>
        <div class="trip-row">${chip}<button class="link" type="button" data-open="${b.listing.id}">View place</button></div>
      </div>
    </article>`;
  }).join('');
}
$('#drawerList').addEventListener('click', e => {
  const b = e.target.closest('[data-open]'); if (!b) return;
  closeModal($('#drawer'));
  const id = +b.dataset.open;
  if (detailOpen) { if (currentStay?.id !== id) { fillDetail(ALL.find(x => x.id === id)); detail.scrollTop = 0; } }
  else openStay(id, null, true);
});

/* ---------------------------------------------------------
   INTRO + BOOT
   --------------------------------------------------------- */
function boot() {
  setCaption(0);
  layoutRail(0);
  $$('.slide[data-i="0"] .wi').forEach((w, i) => w.style.setProperty('--d', i * .09 + 's'));
  thumbs.forEach((t, i) => $('.thumb-in', t).style.setProperty('--d', (.35 + i * .14) + 's'));
  setTimeout(() => {
    root.classList.remove('intro');
    setTimeout(() => showCaption(true), 900);
    setTimeout(() => thumbs.forEach(t => $('.thumb-in', t).style.setProperty('--d', '0s')), 1800);
  }, 250);
  onScroll();
  requestAnimationFrame(frame);
  scheduleAuto();
  loadListings();
  const m = location.hash.match(/^#stay-(\d+)$/);
  if (m) openStay(+m[1], null, true);
}

let rz;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { layoutRail(cur); onScroll(); }, 80); });

const first = new Image();
first.onload = first.onerror = boot;
first.src = 'img/slide-lagos.jpg';
// preload the other slides
['img/slide-stay.jpg', 'img/slide-abuja.jpg'].forEach(src => { const i = new Image(); i.src = src; });

})();

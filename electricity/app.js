/* ============ Электричество для Игоря — логика и анимации ============ */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const nfm = new Intl.NumberFormat('ru-RU');
const nf = (n, d = 0) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n);
const TAU = Math.PI * 2;
const TARIFF = 4.32;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const vh = () => window.innerHeight;

function fmtW(w) { return w >= 1000 ? nf(w / 1000, 2) + ' кВт' : nf(w, 0) + ' Вт'; }
function fmtA(a) { return a < 1 ? nf(a * 1000, 0) + ' мА' : a >= 100 ? nf(a, 0) + ' А' : nf(a, 2) + ' А'; }
function fmtT(s) {
  if (s < 0.1) return nf(s * 1000, 0) + ' мс';
  if (s < 1) return nf(s, 2) + ' с';
  if (s < 90) return nf(s, 0) + ' с';
  if (s < 5400) return nf(s / 60, 0) + ' мин';
  return nf(s / 3600, 1) + ' ч';
}
function fmtH(h) {
  if (h < 1) return nf(h * 60, 0) + ' мин';
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (hh >= 48) return nf(h / 24, 1) + ' сут';
  return hh + ' ч' + (mm ? ' ' + mm + ' мин' : '');
}
function setVerdict(el, cls, html) { el.className = 'verdict ' + cls; el.innerHTML = html; }
function paint(el) { el.style.setProperty('--v', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); }
$$('input[type=range]').forEach(r => { paint(r); r.addEventListener('input', () => paint(r)); });
function bind(ids, fn) { ids.forEach(id => { const e = $('#' + id); if (e) e.addEventListener('input', fn); }); }

/* ---------- canvas helper ---------- */
function fit(cv) {
  if (!cv._h) cv._h = +(cv.dataset.h || cv.getAttribute('height')) || 260;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 600, h = cv._h;
  cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cv._w = w; cv._ctx = ctx;
  return ctx;
}
const vis = new Map();
const visIO = new IntersectionObserver(es => es.forEach(e => vis.set(e.target, e.isIntersecting)), { rootMargin: '80px' });
function watch(el) { vis.set(el, false); visIO.observe(el); }
const isVis = el => vis.get(el);
const canvases = [];
function regCanvas(id, onResize) {
  const cv = $('#' + id); fit(cv); watch(cv); canvases.push({ cv, onResize }); return cv;
}
let rzT; addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { canvases.forEach(c => { fit(c.cv); c.onResize && c.onResize(); }); sparksResize(); }, 120); });

/* =========================================================
   ЛЕНТА СКРОЛЛА: прогресс, HUD, главы, сцены
   ========================================================= */
const progress = $('#progress'), hud = $('#hud'), hudFill = $('#hudFill'), hudPct = $('#hudPct');
const chapters = $$('[data-nav]');
const dots = $('#dots');
chapters.forEach(ch => {
  const a = document.createElement('a'); a.href = '#' + ch.id; a.innerHTML = '<span>' + ch.dataset.nav + '</span>'; dots.appendChild(a);
});
const dotEls = $$('a', dots);
let targetHue = 45, curHue = 45;

const sceneHandlers = {};
const scenes = $$('[data-scene]');
function sceneP(el) {
  const r = el.getBoundingClientRect();
  return clamp(-r.top / Math.max(1, r.height - vh()));
}

/* scrub-текст */
const scrubEls = $$('.scrub').map(el => {
  const parts = el.dataset.text.split(/(\*[^*]+\*)/).filter(Boolean);
  const words = [];
  parts.forEach(p => {
    const hl = p.startsWith('*');
    (hl ? p.slice(1, -1) : p).split(/\s+/).filter(Boolean).forEach(w => {
      const s = document.createElement('span'); s.className = 'w' + (hl ? ' hl' : ''); s.textContent = w;
      el.appendChild(s); el.appendChild(document.createTextNode(' ')); words.push(s);
    });
  });
  return { el, words };
});

let ticking = false, lastY = scrollY, vel = 0;
function onScroll() {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => { ticking = false; update(); });
}
function update() {
  const y = scrollY, H = document.documentElement.scrollHeight - vh();
  const p = H > 0 ? clamp(y / H) : 0;
  vel = lerp(vel, clamp(Math.abs(y - lastY) / 80), .5); lastY = y;
  progress.style.transform = 'scaleX(' + p + ')';
  hudFill.style.width = (p * 100) + '%';
  hudFill.style.background = p < .33 ? 'var(--bad)' : p < .66 ? 'var(--warn)' : p < .98 ? 'var(--volt)' : 'var(--ok)';
  hudPct.textContent = Math.round(p * 100) + '%';
  hud.classList.toggle('full', p > .985);

  let act = 0;
  chapters.forEach((c, i) => { if (c.getBoundingClientRect().top < vh() * .5) act = i; });
  dotEls.forEach((d, i) => d.classList.toggle('on', i === act));
  targetHue = +chapters[act].dataset.hue || 45;
  if (scrollY < vh() * .6) targetHue = 45;

  scenes.forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.bottom < -50 || r.top > vh() + 50) return;
    const fn = sceneHandlers[el.dataset.scene]; if (fn) fn(sceneP(el));
  });

  scrubEls.forEach(({ el, words }) => {
    const r = el.getBoundingClientRect();
    const q = clamp((vh() * .85 - r.top) / (vh() * .55));
    const n = words.length * q;
    words.forEach((w, i) => w.classList.toggle('on', i < n));
  });
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);

/* reveal */
const rvIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rvIO.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
$$('.rv').forEach(el => rvIO.observe(el));

/* счётчики */
$$('[data-count]').forEach(el => {
  const end = +el.dataset.count;
  const io = new IntersectionObserver(es => {
    if (!es[0].isIntersecting) return; io.disconnect();
    const t0 = performance.now(), D = 1700;
    (function step(t) {
      const k = clamp((t - t0) / D);
      el.textContent = nfm.format(Math.round(end * easeOut(k)));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }, { threshold: .6 });
  io.observe(el);
});

/* =========================================================
   HERO: искры, разлетающиеся при скролле
   ========================================================= */
const sp = $('#sparks'); const sctx = sp.getContext('2d');
let sw = 0, sh = 0; const SN = 170;
const sparks = Array.from({ length: SN }, (_, i) => ({
  a: Math.random() * TAU, r0: 60 + Math.random() * 260, sp: .25 + Math.random() * 1.1,
  sz: .6 + Math.random() * 2.2, ph: Math.random() * TAU,
  hue: [48, 48, 42, 190, 330][i % 5]
}));
function sparksResize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  sw = sp.clientWidth; sh = sp.clientHeight; sp.width = sw * dpr; sp.height = sh * dpr; sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sparksResize();
let heroP = 0; const heroEl = $('#hero'), heroIn = $('#heroIn'), hint = $('#hint');
sceneHandlers.hero = p => {
  heroP = p;
  const q = clamp(p * 1.6);
  heroIn.style.transform = 'translateY(' + (-p * 90) + 'px) scale(' + (1 + p * .5) + ')';
  heroIn.style.opacity = 1 - clamp(p * 1.7);
  hint.style.opacity = 1 - clamp(p * 6);
};
let bolts = []; let lastBolt = 0;
function mkBolt(cx, cy) {
  const a1 = Math.random() * TAU, a2 = a1 + (Math.random() - .5) * 1.4;
  const r1 = 90 + Math.random() * 60, r2 = 260 + Math.random() * 260;
  let x1 = cx + Math.cos(a1) * r1, y1 = cy + Math.sin(a1) * r1;
  const x2 = cx + Math.cos(a2) * r2, y2 = cy + Math.sin(a2) * r2;
  const pts = [[x1, y1]]; const n = 9;
  for (let i = 1; i < n; i++) {
    const t = i / n, j = (1 - t * .3) * 26;
    pts.push([lerp(x1, x2, t) + (Math.random() - .5) * j * 2, lerp(y1, y2, t) + (Math.random() - .5) * j * 2]);
  }
  pts.push([x2, y2]);
  return { pts, life: 1 };
}
function drawSparks(t, dt) {
  sctx.clearRect(0, 0, sw, sh);
  const cx = sw / 2, cy = sh / 2, maxD = Math.hypot(sw, sh) * .7, P = ease(heroP);
  sctx.globalCompositeOperation = 'lighter';
  const g = sctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(sw, sh) * .6);
  g.addColorStop(0, 'rgba(255,200,0,' + (.22 * (1 - P)) + ')'); g.addColorStop(1, 'rgba(255,200,0,0)');
  sctx.fillStyle = g; sctx.fillRect(0, 0, sw, sh);
  const boost = 1 + vel * 2;
  for (const s of sparks) {
    const swirl = reduce ? 0 : Math.sin(t * 1.1 + s.ph) * 14;
    const ang = s.a + (reduce ? 0 : t * .07 * (s.sp - .6));
    const rr = s.r0 + swirl + P * maxD * s.sp * boost;
    const x = cx + Math.cos(ang) * rr * (sw > sh ? 1.25 : .8), y = cy + Math.sin(ang) * rr * .78;
    const len = 3 + P * 90 * s.sp + vel * 40;
    const x0 = x - Math.cos(ang) * len * (sw > sh ? 1.25 : .8), y0 = y - Math.sin(ang) * len * .78;
    const al = clamp((1 - P * .95) * (.35 + .65 * Math.abs(Math.sin(t * 2 + s.ph))));
    sctx.strokeStyle = 'hsla(' + s.hue + ',100%,62%,' + al + ')'; sctx.lineWidth = s.sz;
    sctx.lineCap = 'round'; sctx.beginPath(); sctx.moveTo(x0, y0); sctx.lineTo(x, y); sctx.stroke();
  }
  if (!reduce && P < .85 && t - lastBolt > .13) { lastBolt = t; bolts.push(mkBolt(cx, cy)); if (Math.random() < .5) bolts.push(mkBolt(cx, cy)); }
  bolts = bolts.filter(b => (b.life -= dt * 4.5) > 0);
  for (const b of bolts) {
    sctx.strokeStyle = 'rgba(120,225,255,' + clamp(b.life) * (1 - P) + ')'; sctx.lineWidth = 1.8; sctx.shadowColor = '#3dd9ff'; sctx.shadowBlur = 14;
    sctx.beginPath(); b.pts.forEach((p, i) => i ? sctx.lineTo(p[0], p[1]) : sctx.moveTo(p[0], p[1])); sctx.stroke(); sctx.shadowBlur = 0;
  }
  sctx.globalCompositeOperation = 'source-over';
}
watch(sp);

/* =========================================================
   Словарик
   ========================================================= */
const gl = [
  ['кВт·ч', 'Киловатт-час', 'Энергия. Её пишет счётчик. 1 кВт·ч = 1000 Вт за час.'],
  ['ВА', 'Вольт-ампер', 'Полная мощность. Для ИБП. Ватты = ВА × cos φ.'],
  ['Гц', 'Герц', 'Сколько раз в секунду ток меняет направление. В сети — 50.'],
  ['cos φ', 'Коэф. мощности', 'Доля пользы. Чайник — 1. Моторы — 0,8.']
];
$('#gloss').innerHTML = gl.map((g, i) => `<div class="g rv" style="--d:${i * .05}s"><div class="g-in"><div class="g-f"><div class="sym ${['ok', 'amp', 'watt', 'volt'][i]}">${g[0]}</div><div class="nm">${g[1]}</div></div><div class="g-b">${g[2]}</div></div></div>`).join('');
$$('.g').forEach(g => { rvIO.observe(g); g.addEventListener('click', () => g.classList.toggle('flip')); });

/* =========================================================
   1. ЗАКОН ОМА
   ========================================================= */
const ohmCv = regCanvas('ohmCv');
const ohm = { U: 230, R: 529, I: 0, P: 0, parts: Array.from({ length: 56 }, (_, i) => i / 56), last: 0 };
function ohmCalc() {
  ohm.U = +$('#ohmU').value; ohm.R = Math.pow(10, +$('#ohmR').value / 100);
  ohm.I = ohm.U / ohm.R; ohm.P = ohm.U * ohm.I;
  const R = ohm.R; $('#vU').textContent = ohm.U + ' В';
  $('#vR').textContent = (R < 1 ? nf(R, 2) : R < 10 ? nf(R, 1) : nf(R, 0)) + ' Ом';
  $('#oI').textContent = fmtA(ohm.I); $('#oP').textContent = fmtW(ohm.P);
  const k = ohm.I / 16, P = ohm.P;
  const what = P < 15 ? 'как зарядка телефона' : P < 200 ? 'как лампочка или ноутбук' : P < 3000 ? 'как бытовой нагреватель' : 'как промышленная установка';
  if (ohm.I > 80) setVerdict($('#ohmVerdict'), 'bad', '💥 Замыкание! ' + fmtA(ohm.I) + ' — это <b>' + nf(k, 0) + '×</b> от 16 А. Автомат выбьет за 10 мс.');
  else if (ohm.I > 16) setVerdict($('#ohmVerdict'), 'bad', '🚨 ' + fmtA(ohm.I) + ' — выше 16 А. Автомат отключит. Нагрузка ' + what + '.');
  else if (ohm.I > 12) setVerdict($('#ohmVerdict'), 'warn', '⚠️ ' + fmtA(ohm.I) + ' — почти предел 16 А. Нагрузка ' + what + '.');
  else setVerdict($('#ohmVerdict'), 'good', '✅ ' + fmtA(ohm.I) + ' — спокойно. Нагрузка ' + what + (ohm.U < 50 ? '. Напряжение безопасное' : '') + '.');
}
bind(['ohmU', 'ohmR'], ohmCalc);
$$('[data-u]').forEach(b => b.addEventListener('click', () => {
  $('#ohmU').value = b.dataset.u; $('#ohmR').value = Math.round(Math.log10(+b.dataset.r) * 100);
  paint($('#ohmU')); paint($('#ohmR')); ohmCalc();
}));
ohmCalc();
function drawOhm(t) {
  const c = ohmCv._ctx, w = ohmCv._w, h = ohmCv._h; const dt = Math.min(.05, t - ohm.last); ohm.last = t;
  c.clearRect(0, 0, w, h);
  const m = 44, x0 = m, y0 = 46, x1 = w - m, y1 = h - 46;
  c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineJoin = 'round';
  c.beginPath(); c.roundRect(x0, y0, x1 - x0, y1 - y0, 26); c.stroke();
  const frac = clamp(Math.log10(ohm.I * 1000 + 1) / 5.4), heat = clamp(Math.log10(ohm.P + 1) / 4.5);
  const v = .03 + .26 * frac;
  const W = x1 - x0, H = y1 - y0, L = 2 * (W + H);
  const posAt = s => { let d = (s % 1) * L; if (d < W) return [x0 + d, y0]; d -= W; if (d < H) return [x1, y0 + d]; d -= H; if (d < W) return [x1 - d, y1]; d -= W; return [x0, y1 - d]; };
  // резистор
  const xm = (x0 + x1) / 2; c.clearRect(xm - 66, y0 - 16, 132, 32);
  const hc = `rgb(${Math.round(lerp(61, 255, heat))},${Math.round(lerp(217, 84, heat))},${Math.round(lerp(255, 70, heat))})`;
  c.shadowColor = hc; c.shadowBlur = 8 + heat * 40; c.strokeStyle = hc; c.lineWidth = 4;
  c.beginPath(); c.moveTo(xm - 66, y0);
  for (let i = 0; i < 7; i++) c.lineTo(xm - 54 + i * 18, y0 + (i % 2 ? 13 : -13));
  c.lineTo(xm + 66, y0); c.stroke(); c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '600 13px ui-monospace,monospace'; c.textAlign = 'center';
  c.fillText('R', xm, y0 - 24);
  // батарейка
  const ym = (y0 + y1) / 2; c.clearRect(x0 - 12, ym - 28, 24, 56);
  c.strokeStyle = '#ffd60a'; c.lineWidth = 4; c.beginPath(); c.moveTo(x0 - 14, ym - 6); c.lineTo(x0 + 14, ym - 6); c.stroke();
  c.lineWidth = 7; c.beginPath(); c.moveTo(x0 - 7, ym + 8); c.lineTo(x0 + 7, ym + 8); c.stroke();
  c.fillStyle = '#ffd60a'; c.textAlign = 'left'; c.fillText('U', x0 + 18, ym + 4);
  // заряды
  ohm.parts = ohm.parts.map(s => (s + v * dt) % 1);
  c.shadowColor = '#ffd60a'; c.shadowBlur = 10; c.fillStyle = '#ffd60a';
  for (const s of ohm.parts) { const [x, y] = posAt(s); c.beginPath(); c.arc(x, y, 3.4, 0, TAU); c.fill(); }
  c.shadowBlur = 0;
  c.fillStyle = '#3dd9ff'; c.font = '800 28px ui-monospace,monospace'; c.textAlign = 'center';
  c.fillText(fmtA(ohm.I), w / 2, h / 2 + 4);
  c.fillStyle = 'rgba(255,255,255,.5)'; c.font = '600 12px ui-monospace,monospace'; c.fillText('ток в цепи', w / 2, h / 2 + 26);
}


/* карточки-«пилларсы»: нажми — пример */
$$('.pillar').forEach(p => { p.querySelector('.ex').textContent = p.dataset.ex; p.addEventListener('click', () => p.classList.toggle('open')); });

/* калькулятор: знаешь два — получишь два */
const Q4 = { U: ['В', 'Вольт', 'volt'], I: ['А', 'Ампер', 'amp'], R: ['Ом', 'Ом', 'watt'], P: ['Вт', 'Ватт', 'volt'] };
let k4 = ['U', 'P'], v4 = { U: 230, I: 0, R: 0, P: 2000 };
const f4 = x => !isFinite(x) ? '—' : nf(x, x < 10 ? 2 : x < 1000 ? 1 : 0);
function calc4Solve() {
  const [a, b] = k4, has = (x, y) => (a === x && b === y) || (a === y && b === x), v = v4;
  if (has('U', 'I')) { v.R = v.U / v.I; v.P = v.U * v.I; }
  else if (has('U', 'R')) { v.I = v.U / v.R; v.P = v.U * v.U / v.R; }
  else if (has('U', 'P')) { v.I = v.P / v.U; v.R = v.U * v.U / v.P; }
  else if (has('I', 'R')) { v.U = v.I * v.R; v.P = v.I * v.I * v.R; }
  else if (has('I', 'P')) { v.U = v.P / v.I; v.R = v.P / (v.I * v.I); }
  else { v.U = Math.sqrt(v.P * v.R); v.I = Math.sqrt(v.P / v.R); }
}
function calc4Update() {
  calc4Solve();
  ['U', 'I', 'R', 'P'].forEach(k => { const e = $('#c4v-' + k); if (e && e.tagName !== 'INPUT') e.textContent = f4(v4[k]); });
  const I = v4.I;
  if (!isFinite(I)) setVerdict($('#calc4V'), 'warn', 'Введи числа больше нуля.');
  else if (I > 16) setVerdict($('#calc4V'), 'bad', `Ток ${f4(I)} А — автомат 16 А выбьет.`);
  else setVerdict($('#calc4V'), 'good', `Ток ${f4(I)} А — линия 16 А тянет.`);
}
function calc4Render() {
  calc4Solve();
  $('#calc4').innerHTML = ['U', 'I', 'R', 'P'].map(k => {
    const kn = k4.includes(k);
    return `<div class="ft${kn ? ' known' : ''}" data-k="${k}"><div class="sy ${Q4[k][2]}">${k}</div><div class="nm">${Q4[k][1]}</div><div class="val">${kn ? `<input type="number" id="c4v-${k}" value="${+(+v4[k]).toPrecision(5)}" step="any" min="0">` : `<span id="c4v-${k}">${f4(v4[k])}</span>`}<span class="muted small">${Q4[k][0]}</span></div><div class="tg">${kn ? '✓ знаю' : 'нажми — знаю'}</div></div>`;
  }).join('');
  calc4Update();
}
$('#calc4').addEventListener('click', e => {
  const t = e.target.closest('.ft'); if (!t || e.target.tagName === 'INPUT') return;
  const k = t.dataset.k; if (k4.includes(k)) return;
  k4 = [k4[1], k]; calc4Render();
});
$('#calc4').addEventListener('input', e => {
  if (e.target.tagName !== 'INPUT') return;
  const k = e.target.id.slice(4); v4[k] = Math.max(1e-6, +e.target.value || 0); calc4Update();
});
calc4Render();

/* =========================================================
   2. БАТАРЕЯ (sticky) и калькулятор
   ========================================================= */
const bats = $('#batBolts');
const batBolts = Array.from({ length: 10 }, (_, i) => {
  const e = document.createElement('div'); e.className = 'bolt'; e.textContent = '⚡'; e.style.left = '50%'; e.style.top = '50%'; bats.appendChild(e);
  return { e, ang: (i / 10) * TAU + .3, dist: 38 + (i % 3) * 8 };
});
const batFill = $('#batFill'), batWave = $('#batWave'), batNum = $('#batNum'), batH = $('#batH'), batP = $('#batP');
let batLevel = 0;
sceneHandlers.bat = p => {
  const lv = clamp(p * 1.08); batLevel = lv;
  const hh = 260 * lv; batFill.setAttribute('y', 308 - hh); batFill.setAttribute('height', hh);
  const E = 15 * Math.pow(10000 / 15, lv);
  batNum.textContent = E < 1000 ? nf(E, 0) + ' Вт·ч' : nf(E / 1000, 1) + ' кВт·ч';
  const st = E < 35 ? ['📱 Телефон', '≈ 15 Вт·ч — хватит на день'] : E < 150 ? ['💻 Ноутбук', '≈ 60 Вт·ч — 5–8 часов работы'] : E < 800 ? ['⛺ Портативная станция', '≈ 500 Вт·ч — холодильник проработает полсуток'] : E < 4500 ? ['🔋 Домашняя батарея', '≈ 3 кВт·ч — вечер со светом и телевизором'] : ['🏠 Большая домашняя батарея', '≈ 10 кВт·ч — квартира на сутки без розетки'];
  if (batH.textContent !== st[0]) { batH.textContent = st[0]; batP.textContent = st[1]; }
  batBolts.forEach((b, i) => {
    const q = (p * 3.2 + i / 10) % 1;
    const k = 1 - q;
    b.e.style.transform = `translate(calc(-50% + ${Math.cos(b.ang) * b.dist * k}vw),calc(-50% + ${Math.sin(b.ang) * b.dist * k * .9}vh)) rotate(${(1 - k) * 360}deg) scale(${.5 + q})`;
    b.e.style.opacity = p > 0.01 && p < 0.99 ? Math.sin(q * Math.PI) : 0;
  });
};
sceneHandlers.bat(0);
function waveTick(t) {
  if (!isVis(bat_svg)) return;
  const y = 308 - 260 * batLevel; let d = `M22 ${y}`;
  for (let x = 22; x <= 178; x += 6) d += ` L${x} ${y + Math.sin(x * .09 + t * 3) * 3}`;
  d += ' L178 310 L22 310 Z'; batWave.setAttribute('d', d);
}
const bat_svg = $('#bat-svg'); watch(bat_svg);

function energyCalc() {
  const W = +$('#eW').value, H = +$('#eH').value, T = TARIFF;
  $('#veW').textContent = nf(W) + ' Вт'; $('#veH').textContent = nf(H, 1) + ' ч';
  const d = W * H / 1000; $('#eD').textContent = nf(d, 2) + ' кВт·ч'; $('#eM').textContent = nf(d * 30, 1) + ' кВт·ч'; $('#eC').textContent = nf(d * 30 * T, 0) + ' грн';
  const kitchen = W >= 1000;
  setVerdict($('#eV'), d * 30 * T > 500 ? 'warn' : 'good', `${fmtW(W)} × ${nf(H, 1)} ч = <b>${nf(d, 2)} кВт·ч</b> в сутки. За год: <b>${nf(d * 365 * T, 0)} грн</b>.`);
}
bind(['eW', 'eH'], energyCalc); energyCalc();

/* =========================================================
   3. ДОМ
   ========================================================= */
const DEVS = [
  ['fridge', '🧊', 'Холодильник', 150, 24, .3, 1], ['kettle', '☕', 'Чайник', 2000, .4, 1, 0], ['micro', '🍲', 'Микроволновка', 1200, .3, 1, 0],
  ['washer', '🧺', 'Стиральная', 2000, .8, .45, 0], ['dish', '🍽️', 'Посудомойка', 2000, 1.2, .45, 0], ['oven', '🔥', 'Духовка', 2500, .8, .6, 0],
  ['hob', '🍳', 'Плита (2 конф.)', 3500, 1, .7, 0], ['tv', '📺', 'Телевизор', 100, 5, 1, 1], ['pc', '🖥️', 'Игровой ПК', 450, 4, 1, 0],
  ['laptop', '💻', 'Ноутбук', 60, 6, 1, 1], ['router', '📡', 'Роутер', 10, 24, 1, 1], ['phone', '📱', 'Зарядка телефона', 15, 2, 1, 0],
  ['led', '💡', 'LED-свет', 80, 5, 1, 1], ['ac', '❄️', 'Кондиционер', 900, 8, .5, 0], ['heater', '🔆', 'Масл. радиатор', 1500, 6, .5, 0],
  ['dryer', '💨', 'Фен', 1800, .2, 1, 0], ['iron', '👔', 'Утюг', 2000, .3, .5, 0], ['vac', '🧹', 'Пылесос', 1500, .3, 1, 0], ['boiler', '🚿', 'Бойлер 80 л', 1500, 3, .7, 0]
].map(d => ({ id: d[0], e: d[1], n: d[2], w: d[3], h: d[4], duty: d[5], on: !!d[6] }));
const devsEl = $('#devs');
devsEl.innerHTML = DEVS.map(d => `<div class="dev${d.on ? ' on' : ''}" data-id="${d.id}" tabindex="0" role="button"><span class="sw"></span><span class="e">${d.e}</span><span class="nm">${d.n}</span><span class="pw">${nf(d.w)} Вт</span><span class="hrs"><input type="number" min="0" max="24" step="0.1" value="${d.h}" aria-label="часов в сутки"> ч/сут</span></div>`).join('');
let homeBk = 25;
$('#homeBk').innerHTML = [16, 25, 32, 40, 63].map(n => `<button class="chip${n === homeBk ? ' on' : ''}" data-n="${n}">${n} А</button>`).join('');
function homeCalc() {
  let W = 0, kwh = 0;
  DEVS.forEach(d => { if (d.on) { W += d.w; kwh += d.w * d.h * d.duty * 30 / 1000; } });
  const A = W / 230, max = homeBk * 230, pct = W / max, T = TARIFF;
  $('#homeW').textContent = fmtW(W); $('#homeA').textContent = nf(A, 1) + ' А'; $('#homeM').textContent = nf(kwh, 0); $('#homeC').textContent = nf(kwh * T, 0) + ' грн';
  const g = $('#homeGauge'); g.style.width = clamp(pct) * 100 + '%'; g.classList.toggle('hot', pct > .8);
  $('#homeMax').textContent = fmtW(max); $('#homeGl').textContent = nf(pct * 100, 0) + ' % от автомата ' + homeBk + ' А';
  if (pct > 1) setVerdict($('#homeV'), 'bad', `💥 Выбьет! ${nf(A, 1)} А > ${homeBk} А. Выключи что-то греющее.`);
  else if (pct > .8) setVerdict($('#homeV'), 'warn', `⚠️ ${nf(A, 1)} А из ${homeBk} А. На пределе.`);
  else setVerdict($('#homeV'), 'good', `✅ ${nf(A, 1)} А из ${homeBk} А. Запас есть.`);
}
devsEl.addEventListener('click', e => {
  const c = e.target.closest('.dev'); if (!c || e.target.tagName === 'INPUT') return;
  const d = DEVS.find(x => x.id === c.dataset.id); d.on = !d.on; c.classList.toggle('on', d.on); homeCalc();
});
devsEl.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('dev')) { e.preventDefault(); e.target.click(); } });
devsEl.addEventListener('input', e => { if (e.target.tagName === 'INPUT') { const c = e.target.closest('.dev'); DEVS.find(x => x.id === c.dataset.id).h = clamp(+e.target.value || 0, 0, 24); homeCalc(); } });
$('#homeBk').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; homeBk = +b.dataset.n; $$('#homeBk .chip').forEach(x => x.classList.toggle('on', x === b)); homeCalc(); });
homeCalc();

/* =========================================================
   4. АВТОМАТЫ
   ========================================================= */
const STD = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100];
const CABLE = { 6: 1.5, 10: 1.5, 16: 2.5, 20: 2.5, 25: 4, 32: 6, 40: 10, 50: 10, 63: 16, 80: 25, 100: 35 };
let phase = 1;
function bkCalc() {
  const P = +$('#bkP').value; $('#vbkP').textContent = fmtW(P);
  const I = phase === 1 ? P / 230 : P / (Math.sqrt(3) * 400);
  const rec = STD.find(n => n >= I);
  $('#bkI').textContent = nf(I, 1) + ' А';
  $('#bkRec').textContent = rec ? 'C' + rec : '> 100';
  $('#bkCab').textContent = rec ? CABLE[rec] : '—';
  if (!rec) { setVerdict($('#bkV'), 'bad', 'Это уровень здания. Нужен проектировщик.'); return; }
  const load = I / rec;
  const txt = `<b>${nf(I, 1)} А</b> → автомат <b>${rec} А</b>, медь <b>${CABLE[rec]} мм²</b>.`;
  if (load > .9) setVerdict($('#bkV'), 'warn', txt + ' ⚠️ Почти под завязку — раздели на две линии.');
  else setVerdict($('#bkV'), 'good', txt);
}
bind(['bkP'], bkCalc);
$('#bkPh').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; phase = +b.dataset.ph; $$('#bkPh .chip').forEach(x => x.classList.toggle('on', x === b)); bkCalc(); });
$$('[data-bp]').forEach(b => b.addEventListener('click', () => { $('#bkP').value = b.dataset.bp; paint($('#bkP')); if (+b.dataset.bp >= 11000) { phase = 3; $$('#bkPh .chip').forEach(x => x.classList.toggle('on', +x.dataset.ph === 3)); } else { phase = 1; $$('#bkPh .chip').forEach(x => x.classList.toggle('on', +x.dataset.ph === 1)); } bkCalc(); }));
bkCalc();

/* кривая срабатывания */
const CURVES = { B: [3, 5], C: [5, 10], D: [10, 20] };
let curve = 'C';
const tripCv = regCanvas('tripCv', () => drawTrip());
const tripT = k => 3600 * Math.pow((1.45 * 1.45 - 1) / (k * k - 1), 3);
function drawTrip() {
  const c = tripCv._ctx, w = tripCv._w, h = tripCv._h; c.clearRect(0, 0, w, h);
  const L = 50, R = 14, T = 14, B = 36, Kmax = 30;
  const X = k => L + Math.log(k) / Math.log(Kmax) * (w - L - R);
  const Y = t => T + (1 - (Math.log10(clamp(t, .005, 10000)) + 2.3) / 6.3) * (h - T - B);
  c.font = '11px ui-monospace,monospace'; c.fillStyle = 'rgba(255,255,255,.5)'; c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1;
  [1, 2, 3, 5, 10, 20, 30].forEach(k => { c.beginPath(); c.moveTo(X(k), T); c.lineTo(X(k), h - B); c.stroke(); c.textAlign = 'center'; c.fillText(k + '×', X(k), h - B + 16); });
  [[.01, '10 мс'], [.1, '0,1 с'], [1, '1 с'], [10, '10 с'], [100, '100 с'], [1000, '17 мин'], [10000, '3 ч']].forEach(([t, l]) => { c.beginPath(); c.moveTo(L, Y(t)); c.lineTo(w - R, Y(t)); c.stroke(); c.textAlign = 'right'; c.fillText(l, L - 6, Y(t) + 4); });
  const [k1, k2] = CURVES[curve], k = +$('#bkK').value / 100;
  c.fillStyle = 'rgba(61,220,132,.07)'; c.fillRect(X(1), T, X(1.13) - X(1), h - T - B);
  c.fillStyle = 'rgba(255,162,77,.2)'; c.fillRect(X(k1), Y(.2), X(k2) - X(k1), Y(.005) - Y(.2));
  c.strokeStyle = '#3dd9ff'; c.lineWidth = 3; c.beginPath();
  let first = true;
  for (let kk = 1.14; kk < k1; kk += .02) { const y = Y(tripT(kk)), x = X(kk); first ? c.moveTo(x, y) : c.lineTo(x, y); first = false; }
  c.lineTo(X(k1), Y(tripT(k1 - .001))); c.lineTo(X(k1), Y(.02)); c.lineTo(X(Kmax), Y(.02)); c.stroke();
  // маркер
  let ty = k < 1.14 ? Y(10000) : k < k1 ? Y(tripT(k)) : Y(.02);
  c.setLineDash([5, 5]); c.strokeStyle = '#ffd60a'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(k), T); c.lineTo(X(k), h - B); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#ffd60a'; c.shadowColor = '#ffd60a'; c.shadowBlur = 14; c.beginPath(); c.arc(X(k), ty, 7, 0, TAU); c.fill(); c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,255,255,.55)'; c.textAlign = 'left'; c.fillText('кратность тока →', L + 4, T + 10);
}
function tripCalc() {
  const k = +$('#bkK').value / 100; $('#vbkK').textContent = nf(k, 1) + ' ×';
  const [k1, k2] = CURVES[curve]; const A = nf(k * 16, 0);
  let cls, msg;
  if (k < 1.13) { cls = 'good'; msg = 'Не отключится <b>никогда</b>. Ток ниже 1,13 ×.'; }
  else if (k < 1.45) { cls = 'warn'; msg = 'Серая зона. Если и отключит — <b>не раньше чем через час</b>.'; }
  else if (k < k1) { cls = 'warn'; msg = `Отключит через <b>${fmtT(tripT(k))}</b>. Для C16 это ${A} А.`; }
  else if (k < k2) { cls = 'warn'; msg = `Зона ${k1}–${k2}×: может выбить <b>мгновенно</b>, а может подумать пару секунд.`; }
  else { cls = 'bad'; msg = `⚡ Выше ${k2}× — <b>выбьет за 10 мс</b>. Это КЗ. Для C16 — ${A} А.`; }
  setVerdict($('#tripV'), cls, msg); drawTrip();
}
bind(['bkK'], tripCalc);
$('#curves').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; curve = b.dataset.c; $$('#curves .chip').forEach(x => x.classList.toggle('on', x === b)); tripCalc(); });
tripCalc();

/* =========================================================
   5. БЛОКИ ПИТАНИЯ
   ========================================================= */
const HS = {
  model: ['Модель', 'Название. По нему найдёшь параметры в интернете.'],
  'in-v': ['100–240 В ~', 'Вход. «~» — переменный ток. Блок импульсный и работает в любой стране.'],
  'in-hz': ['50/60 Гц', 'Частота сети. Блок понимает обе.'],
  'in-a': ['1,2 А на входе', 'Ток <b>из розетки</b> при максимуме. Это не то, что отдаёт блок.'],
  'out-v': ['12 В ⎓', 'Выход. «⎓» — постоянный ток. Должен <b>точно</b> совпасть с прибором.'],
  'out-a': ['3 А на выходе', 'Максимум, который отдаст блок. Прибор берёт сколько ему надо. Бери с запасом 20–30 %.'],
  'out-w': ['36 Вт', '12 В × 3 А = 36 Вт. P = U × I.'],
  pol: ['Полярность', 'Где плюс: в центре штекера или снаружи. Перепутал — сжёг плату.'],
  cl2: ['Двойная изоляция', 'Два квадрата — без заземления, но безопасно.'],
  eff: ['Level VI', 'Класс КПД. VI — самый строгий. Блок почти не греется.']
};
$('.psu-label').addEventListener('click', e => {
  const b = e.target.closest('.hs'); if (!b) return;
  $$('.hs').forEach(x => x.classList.toggle('on', x === b));
  const [t, d] = HS[b.dataset.i]; $('#hsInfo').innerHTML = `<b>${t}</b><br>${d}`;
});
const PD = [['📡 Роутер', 12, 1], ['🍓 Raspberry Pi 5', 5, 5], ['💻 Ноутбук 65 Вт', 19, 3.42], ['💡 LED-лента 5 м', 12, 6], ['📷 Камера', 12, 1], ['📺 ТВ-приставка', 5, 2]];
$('#psuDevs').innerHTML = PD.map((d, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-i="${i}">${d[0]}</button>`).join('');
const PSUA = [.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40];
function psuCalc() {
  const U = +$('#psuU').value, I = +$('#psuIn').value, have = +$('#psuHave').value / 10;
  $('#vpsuHave').textContent = nf(have, 1) + ' А';
  $('#psuW').textContent = fmtW(U * I);
  const rec = PSUA.find(a => a >= I * 1.25) || Math.ceil(I * 1.25);
  $('#psuRec').textContent = nf(U, 1) + ' В · ' + rec + ' А';
  const load = I / have; const g = $('#psuGauge'); g.style.width = clamp(load) * 100 + '%'; g.classList.toggle('hot', load > .8);
  if (load > 1) setVerdict($('#psuV'), 'bad', `❌ Нужно ${nf(I, 2)} А, а блок даёт ${nf(have, 1)} А. Перегрев и перезагрузки. Бери от ${rec} А.`);
  else if (load > .8) setVerdict($('#psuV'), 'warn', `⚠️ Загрузка ${nf(load * 100, 0)} %. Будет горячий. Нужен запас 20–30 %.`);
  else setVerdict($('#psuV'), 'good', `✅ Загрузка ${nf(load * 100, 0)} %. Вольты — ровно <b>${nf(U, 1)} В</b>.`);
}
$('#psuDevs').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; const d = PD[b.dataset.i]; $('#psuU').value = d[1]; $('#psuIn').value = d[2]; $$('#psuDevs .chip').forEach(x => x.classList.toggle('on', x === b)); psuCalc(); });
bind(['psuU', 'psuIn', 'psuHave'], psuCalc); psuCalc();

/* =========================================================
   6. ПУСКОВОЙ ТОК
   ========================================================= */
const INR = [
  ['🧊 Холодильник', 150, 6, .35, 'Мотор стартует с места: ток ×6. Автомату всё равно. Слабому инвертору — нет.'],
  ['💡 Лампа накаливания', 100, 12, .1, 'Холодная нить — почти без сопротивления. ×12 на 0,1 с. Перегорают именно при включении.'],
  ['💻 БП ноутбука', 65, 100, .0015, 'Конденсаторы как пустые бочки. 1–2 мс ток до 30 А. Для этого в БП ставят NTC.'],
  ['🔊 Тороидальный трансформатор', 300, 15, .08, 'Сердечник намагничивается. Пик ×15 и больше. Поэтому усилители выбивают автомат.'],
  ['🚰 Насос 750 Вт', 750, 7, .6, 'Мотор под нагрузкой: ×7. Нужна кривая C или D. Для генератора — запас ×3.'],
  ['❄️ Кондиционер (обычный)', 1000, 6, .5, 'Компрессор стартует в лоб. Рабочий 4 А, пик 25 А.'],
  ['❄️ Кондиционер инверторный', 900, 1.3, 1.5, 'Инвертор плавно разгоняет компрессор. Пика почти нет. Это главный плюс.'],
  ['💡 LED-лампа 9 Вт', 9, 25, .002, 'Внутри мини-БП. Пик 1–2 мс. 50 ламп на линии — пики складываются.']
];
let inrI = 0, inrS = 0, inrT0 = 0;
$('#inrDevs').innerHTML = INR.map((d, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-i="${i}">${d[0]}</button>`).join('');
const inrCv = regCanvas('inrCv', () => drawInr(1));
function inrInfo() {
  const [n, W, k, tau, note] = INR[inrI]; const Ir = W / 230;
  $('#inrPeak').textContent = fmtA(Ir * k); $('#inrRun').textContent = fmtA(Ir); $('#inrK').textContent = '×' + nf(k, 1); $('#inrT').textContent = '≈ ' + fmtT(tau * 3);
  setVerdict($('#inrV'), k > 8 ? 'warn' : 'good', note);
}
function inrReplay() { inrT0 = performance.now(); }
$('#inrDevs').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; inrI = +b.dataset.i; $$('#inrDevs .chip').forEach(x => x.classList.toggle('on', x === b)); inrInfo(); inrReplay(); });
$('#inrReplay').addEventListener('click', inrReplay); inrInfo();
function drawInr(prog) {
  const c = inrCv._ctx, w = inrCv._w, h = inrCv._h; c.clearRect(0, 0, w, h);
  const [n, W, k, tau] = INR[inrI]; const Ir = W / 230, Tw = tau * 6;
  const L = 56, R = 16, T = 20, B = 36, yz = (h - B + T) / 2 + T / 2;
  const maxA = Math.max(Ir * k, Ir * 1.5) * 1.15;
  const X = t => L + (t / Tw) * (w - L - R), Y = a => yz - (a / maxA) * (yz - T);
  c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1; c.fillStyle = 'rgba(255,255,255,.5)'; c.font = '11px ui-monospace,monospace';
  for (let i = 0; i <= 6; i++) { const t = Tw * i / 6; c.beginPath(); c.moveTo(X(t), T); c.lineTo(X(t), h - B); c.stroke(); c.textAlign = 'center'; if (i % 2 === 0) c.fillText(fmtT(t), X(t), h - B + 16); }
  c.beginPath(); c.moveTo(L, yz); c.lineTo(w - R, yz); c.stroke();
  c.textAlign = 'right'; c.fillText(fmtA(Ir * k), L - 6, Y(Ir * k) + 4); c.fillText('0', L - 6, yz + 4);
  const env = t => Ir * (1 + (k - 1) * Math.exp(-t / tau));
  const N = 260, last = Math.floor(N * prog);
  // заливка + верхняя/нижняя огибающая (как на осциллографе)
  c.fillStyle = 'rgba(255,214,10,.18)'; c.beginPath(); c.moveTo(X(0), yz);
  for (let i = 0; i <= last; i++) { const t = Tw * i / N; c.lineTo(X(t), Y(env(t))); } c.lineTo(X(Tw * last / N), yz);
  for (let i = last; i >= 0; i--) { const t = Tw * i / N; c.lineTo(X(t), yz + (yz - Y(env(t)))); } c.closePath(); c.fill();
  c.strokeStyle = '#ffd60a'; c.lineWidth = 3; c.shadowColor = '#ffd60a'; c.shadowBlur = 10;
  [1, -1].forEach(sg => { c.beginPath(); for (let i = 0; i <= last; i++) { const t = Tw * i / N, y = yz - sg * (yz - Y(env(t))); i ? c.lineTo(X(t), y) : c.moveTo(X(t), y); } c.stroke(); });
  c.shadowBlur = 0;
  c.setLineDash([6, 6]); c.strokeStyle = '#3dd9ff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L, Y(Ir)); c.lineTo(w - R, Y(Ir)); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#3dd9ff'; c.textAlign = 'left'; c.fillText('рабочий ток ' + fmtA(Ir), L + 6, Y(Ir) - 6);
}
/* генератор / инвертор */
const SG = [['🧊', 'Холодильник', 150, 5, 1], ['📺', 'Телевизор', 100, 1, 1], ['💻', 'Ноутбук', 65, 1, 1], ['💡', 'LED-свет', 80, 1, 1], ['🍲', 'Микроволновка', 1200, 1.5, 0], ['☕', 'Чайник', 2000, 1, 0], ['🚰', 'Насос 750 Вт', 750, 6, 0], ['🪚', 'Болгарка', 1100, 3, 0], ['❄️', 'Кондиционер', 1000, 6, 0], ['🌀', 'Инверт. кондиц.', 900, 1.5, 0], ['♨️', 'Насос котла', 100, 3, 1]].map((d, i) => ({ e: d[0], n: d[1], w: d[2], k: d[3], on: !!d[4] }));
$('#surgeList').innerHTML = SG.map((d, i) => `<div class="dev${d.on ? ' on' : ''}" data-i="${i}" tabindex="0" role="button"><span class="sw"></span><span class="e">${d.e}</span><span class="nm">${d.n}</span><span class="pw">${nf(d.w)} Вт · пуск ×${d.k}</span></div>`).join('');
function sgCalc() {
  const on = SG.filter(d => d.on); const run = on.reduce((s, d) => s + d.w, 0);
  let extra = 0, who = null; on.forEach(d => { const e = d.w * (d.k - 1); if (e > extra) { extra = e; who = d; } });
  const peak = run + extra, inv = Math.ceil(Math.max(run * 1.25, peak / 2) / 100) * 100;
  $('#sgRun').textContent = fmtW(run); $('#sgPeak').textContent = fmtW(peak); $('#sgInv').textContent = on.length ? fmtW(inv) : '—';
  if (!on.length) setVerdict($('#sgV'), 'good', 'Отметь приборы.');
  else setVerdict($('#sgV'), extra > run * .6 ? 'warn' : 'good', `Работа <b>${fmtW(run)}</b>. На старте${who && extra > 0 ? ` <b>${who.n.toLowerCase()}</b>` : ''} даст пик <b>${fmtW(peak)}</b>. Бери инвертор <b>от ${fmtW(inv)}</b>.`);
}
$('#surgeList').addEventListener('click', e => { const c = e.target.closest('.dev'); if (!c) return; const d = SG[c.dataset.i]; d.on = !d.on; c.classList.toggle('on', d.on); sgCalc(); });
$('#surgeList').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('dev')) { e.preventDefault(); e.target.click(); } });
sgCalc();

/* =========================================================
   7. КПД
   ========================================================= */
function effCalc() {
  const P = +$('#effP').value, E = +$('#effE').value / 100, H = +$('#effH').value;
  $('#veffP').textContent = nf(P) + ' Вт'; $('#veffE').textContent = Math.round(E * 100) + ' %'; $('#veffH').textContent = H + ' ч';
  const Pin = P / E, heat = Pin - P, yr = heat * H * 365 / 1000;
  $('#effIn').textContent = fmtW(Pin); $('#effHeat').textContent = fmtW(heat); $('#effYear').textContent = nf(yr, 0) + ' кВт·ч';
  $('#effUse').style.width = E * 100 + '%';
  setVerdict($('#effV'), E < .6 ? 'bad' : E < .85 ? 'warn' : 'good', `Из розетки <b>${fmtW(Pin)}</b>. Дело: <b>${fmtW(P)}</b>. Тепло: <b>${fmtW(heat)}</b>. Потери за год ≈ <b>${nf(yr * TARIFF, 0)} грн</b>.${E < .6 ? ' 🔥 Это печка.' : ''}`);
}
bind(['effP', 'effE', 'effH'], effCalc);
$$('[data-ee]').forEach(b => b.addEventListener('click', () => { $('#effE').value = b.dataset.ee; paint($('#effE')); effCalc(); })); effCalc();

const CH = [
  ['☀️ Солнце → розетка 230 В', [['Контроллер MPPT', 98], ['Аккумулятор (заряд + разряд)', 94], ['Инвертор', 92], ['Провода и клеммы', 99]]],
  ['🔌 Розетка → ноутбук', [['Удлинитель и кабель', 99], ['Блок питания', 90], ['Преобразователь на плате', 92], ['Процессор → тепло', 100]]],
  ['🚗 Домашняя зарядка авто', [['Wallbox и кабель', 98], ['Бортовой зарядник', 93], ['Батарея (заряд + разряд)', 95], ['Инвертор + мотор', 90]]]
];
let chI = 0, chV = CH[0][1].map(s => s[1]);
$('#chainPre').innerHTML = CH.map((c, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-i="${i}">${c[0]}</button>`).join('');
function chainRender() {
  const st = CH[chI][1];
  $('#chainBox').innerHTML = `<div class="gl" style="margin-bottom:6px"><span>Вход</span><span>100 %</span></div><div class="gauge" style="height:14px;margin-top:0"><i style="width:100%;background:var(--amp)"></i></div>` +
    st.map((s, i) => `<div class="ctl" style="margin-top:16px"><label>${s[0]} <b id="cl${i}"></b></label><input type="range" min="50" max="100" value="${chV[i]}" data-i="${i}" style="--c:var(--ok)"><div class="gauge" style="height:14px;margin:8px 0 0"><i id="cb${i}"></i></div></div>`).join('');
  $$('#chainBox input').forEach(r => { paint(r); r.addEventListener('input', () => { chV[+r.dataset.i] = +r.value; paint(r); chainCalc(); }); });
  chainCalc();
}
function chainCalc() {
  let cum = 1; chV.forEach((v, i) => { cum *= v / 100; $('#cl' + i).textContent = v + ' % → осталось ' + nf(cum * 100, 1) + ' %'; const b = $('#cb' + i); b.style.width = cum * 100 + '%'; b.classList.toggle('hot', cum < .7); });
  setVerdict($('#chainV'), cum > .85 ? 'good' : cum > .7 ? 'warn' : 'bad', `Общий КПД: <b>${nf(cum * 100, 1)} %</b>. Из 100 Вт доходит <b>${nf(cum * 100, 0)}</b>, в тепло уходит <b>${nf(100 - cum * 100, 0)}</b>.`);
}
$('#chainPre').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; chI = +b.dataset.i; chV = CH[chI][1].map(s => s[1]); $$('#chainPre .chip').forEach(x => x.classList.toggle('on', x === b)); chainRender(); });
chainRender();

/* =========================================================
   8. ИНВЕРТОРЫ
   ========================================================= */
let wave = 'sine';
const sineCv = regCanvas('sineCv');
const WV = { sine: ['good', 'Как в розетке. Подходит всему. Бери, если есть выбор.'], mod: ['warn', 'Ступеньки. Чайник и лампы ок. Моторы гудят, котёл может глючить.'], sq: ['bad', 'Дешёвый прямоугольник. Электроника и моторы страдают.'] };
function waveY(ph) { // ph в циклах, вернёт -1..1
  const f = ph - Math.floor(ph);
  if (wave === 'sine') return Math.sin(f * TAU);
  if (wave === 'sq') return f < .5 ? 1 : -1;
  return f < .08 ? Math.sin(f / .08 * Math.PI / 2) * 0 + 0 : f < .35 ? 1 : f < .5 ? 0 : f < .85 ? -1 : 0;
}
function drawWave(t) {
  const c = sineCv._ctx, w = sineCv._w, h = sineCv._h; c.clearRect(0, 0, w, h);
  const mid = h / 2, A = h * .36, cycles = 2.5;
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1;
  for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(w * i / 8, 0); c.lineTo(w * i / 8, h); c.stroke(); }
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, h * i / 4); c.lineTo(w, h * i / 4); c.stroke(); }
  const ph0 = reduce ? 0 : t * .35;
  c.setLineDash([6, 6]); c.strokeStyle = 'rgba(61,217,255,.5)'; c.lineWidth = 2; c.beginPath();
  for (let x = 0; x <= w; x += 3) { const y = mid - Math.sin((x / w * cycles - ph0) * TAU) * A; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.setLineDash([]);
  c.strokeStyle = '#ffd60a'; c.lineWidth = 4; c.shadowColor = '#ffd60a'; c.shadowBlur = 16; c.lineJoin = 'round'; c.beginPath();
  for (let x = 0; x <= w; x += 1) { const y = mid - waveY(x / w * cycles - ph0) * A; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '12px ui-monospace,monospace'; c.fillText('жёлтая — инвертор · голубая — розетка', 12, h - 10);
}
function waveInfo() { setVerdict($('#waveV'), WV[wave][0], WV[wave][1]); }
$('#waves').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; wave = b.dataset.w; $$('#waves .chip').forEach(x => x.classList.toggle('on', x === b)); waveInfo(); });
waveInfo();

let invV = 12, invD = .9;
const WIRE = [4, 6, 10, 16, 25, 35, 50, 70, 95, 120];
function invCalc() {
  const P = +$('#invP').value, Ah = +$('#invAh').value; $('#vinvP').textContent = fmtW(P); $('#vinvAh').textContent = Ah + ' А·ч';
  const I = P / (invV * .9), S = WIRE.find(s => s >= I / 4) || '>120';
  const hrs = Ah * invV * invD * .9 / P;
  $('#invI').textContent = nf(I, 0) + ' А'; $('#invS').textContent = S; $('#invT').textContent = fmtH(hrs);
  const kwh = Ah * invV / 1000;
  if (I > 100) setVerdict($('#invVd'), 'bad', `🔥 ${nf(I, 0)} А — провод толщиной с палец. Переходи на <b>${invV === 12 ? '24 или 48' : '48'} В</b>.`);
  else if (I > 50) setVerdict($('#invVd'), 'warn', `⚠️ ${nf(I, 0)} А. Нужен толстый провод и предохранитель на ${Math.ceil(I * 1.25 / 10) * 10} А.`);
  else setVerdict($('#invVd'), 'good', `✅ ${nf(I, 0)} А — спокойно. Батарея ${nf(kwh, 1)} кВт·ч. Хватит на <b>${fmtH(hrs)}</b>.`);
}
bind(['invP', 'invAh'], invCalc);
$('#invV').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; invV = +b.dataset.v; $$('#invV .chip').forEach(x => x.classList.toggle('on', x === b)); invCalc(); });
$('#invC').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; invD = +b.dataset.d; $$('#invC .chip').forEach(x => x.classList.toggle('on', x === b)); invCalc(); });
invCalc();

/* =========================================================
   9. ЭЛЕКТРОКАР
   ========================================================= */
const car = $('#car'), carPack = $('#carPack'), cableBase = $('#cableBase'), cableFlow = $('#cableFlow'), plug = $('#plug');
const wA = $('#wA'), wB = $('#wB'), chgTxt = $('#chgTxt'), chgLed = $('#chgLed'), carNum = $('#carNum'), carH = $('#carH'), carP = $('#carP'), carStep = $('#carStep'), roadDash = $('#roadDash');
sceneHandlers.car = p => {
  const dr = ease(clamp(p / .3)), x = lerp(-460, 330, dr);
  car.setAttribute('transform', `translate(${x},196)`);
  const rot = x * 1.6; wA.setAttribute('transform', `rotate(${rot} 96 118)`); wB.setAttribute('transform', `rotate(${rot} 300 118)`);
  roadDash.setAttribute('stroke-dashoffset', -x * 1.0);
  const pl = clamp((p - .3) / .1);
  cableBase.setAttribute('stroke-dashoffset', 1 - pl); plug.setAttribute('r', pl >= 1 ? 8 : 0);
  const cp = clamp((p - .4) / .55), lv = 10 + 90 * cp;
  carPack.setAttribute('width', 258 * lv / 100);
  cableFlow.setAttribute('opacity', p > .4 && p < .97 ? 1 : 0);
  chgTxt.textContent = Math.round(lv) + '%'; chgLed.setAttribute('fill', p > .4 ? (p > .97 ? '#3ddc84' : '#ffd60a') : '#ff5470');
  carNum.textContent = Math.round(lv) + '%';
  let s;
  if (p < .3) s = ['Подъезжает', 'Батарея почти пуста', 'Едет к зарядке…'];
  else if (p < .4) s = ['Втыкаем кабель', 'Wallbox 7,4 кВт', 'Подключение'];
  else if (p < .97) s = ['Заряжается', `${nf(60 * (lv - 10) / 100, 1)} кВт·ч закачано`, 'Заряжается ⚡'];
  else s = ['100 % — поехали!', '≈ 0,7 грн за км', 'Заряжена'];
  carH.textContent = s[0]; carP.textContent = s[1]; carStep.textContent = s[2];
};
sceneHandlers.car(0);

const CHG = [['🔌 Розетка · 2,3 кВт', 2.3, 0], ['🏠 Wallbox · 7,4 кВт', 7.4, 0], ['🏠 Wallbox 3ф · 11 кВт', 11, 0], ['🏢 AC 22 кВт', 22, 0], ['⚡ DC · 50 кВт', 50, 1], ['🚀 DC · 150 кВт', 150, 1]];
let evC = 1;
$('#evCh').innerHTML = CHG.map((c, i) => `<button class="chip${i === evC ? ' on' : ''}" data-i="${i}">${c[0]}</button>`).join('');
function evCalc(src) {
  let F = +$('#evF').value, T = +$('#evT').value;
  if (T < F + 5) { if (src === 'F') { T = Math.min(100, F + 5); $('#evT').value = T; if (T - F < 5) { F = T - 5; $('#evF').value = F; } } else { F = Math.max(0, T - 5); $('#evF').value = F; } paint($('#evT')); paint($('#evF')); }
  const B = +$('#evB').value, tar = TARIFF, [name, P, dc] = CHG[evC];
  $('#vevB').textContent = B + ' кВт·ч'; $('#vevR').textContent = F + ' % → ' + T + ' %'; $('#evFromTxt').textContent = F + '%'; $('#evToTxt').textContent = T + '%';
  const e = B * (T - F) / 100; let grid, time;
  if (!dc) { grid = e / .9; time = grid / P; }
  else {
    grid = e / .93; const pe = Math.min(P, B * 2);
    const lo = B * Math.max(0, Math.min(T, 80) - F) / 100, hi = B * Math.max(0, T - Math.max(F, 80)) / 100;
    time = lo / (pe * .8) + hi / (pe * .3);
  }
  $('#evTime').textContent = fmtH(time); $('#evKwh').textContent = nf(grid, 1) + ' кВт·ч'; $('#evKm').textContent = nf(e / .16, 0) + ' км'; $('#evCost').textContent = nf(grid * tar, 0) + ' грн';
  const b = $('#evBar'); b.style.left = F + '%'; b.style.width = (T - F) + '%';
  let cls = 'good', msg;
  if (P < 3) { cls = time > 12 ? 'warn' : 'good'; msg = `10 А <b>часами подряд</b>. Нужна отдельная линия и хорошая розетка. Следи, не греется ли вилка. Время: ${fmtH(time)}.`; }
  else if (!dc) msg = `${fmtH(time)}. Ток ≈ ${nf(P * 1000 / 230, 0)} А. Нужна отдельная линия.`;
  else { cls = 'warn'; msg = `${fmtH(time)}. До 80 % быстро, дальше медленнее. Обычно дороже, чем дома.`; }
  setVerdict($('#evV'), cls, msg);
}
bind(['evB'], () => evCalc()); $('#evF').addEventListener('input', () => evCalc('F')); $('#evT').addEventListener('input', () => evCalc('T'));
$('#evCh').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; evC = +b.dataset.i; $$('#evCh .chip').forEach(x => x.classList.toggle('on', x === b)); evCalc(); });
evCalc();

/* =========================================================
   КВИЗ + сертификат
   ========================================================= */
const QZ = [
  ['Что измеряют в амперах?', ['Давление электричества', 'Силу тока — «расход»', 'Сопротивление', 'Запас энергии'], 1, 'Ампер — сила тока: сколько заряда протекает в секунду. Именно её ограничивают автоматы.'],
  ['Чайник на 2000 Вт работает полчаса. Сколько энергии потратит?', ['0,5 кВт·ч', '1 кВт·ч', '2 кВт·ч', '4 кВт·ч'], 1, '2 кВт × 0,5 ч = 1 кВт·ч. Мощность × время.'],
  ['Примерный ток обогревателя 2300 Вт в сети 230 В?', ['1 А', '5 А', '10 А', '23 А'], 2, 'I = P / U = 2300 / 230 = 10 А.'],
  ['Для чего на самом деле нужен автомат на 16 А?', ['Чтобы прибор не сломался', 'Чтобы защитить провод от перегрева', 'Чтобы экономить энергию', 'Чтобы убирать скачки напряжения'], 1, 'Автомат защищает проводку: провод не должен перегреваться. Поэтому его подбирают под сечение кабеля.'],
  ['Прибору нужно 12 В / 1 А. У тебя есть БП 12 В / 3 А. Что будет?', ['Прибор сгорит — ток слишком большой', 'Всё нормально, прибор возьмёт сколько нужно', 'Не включится', 'Будет работать втрое быстрее'], 1, 'Напряжение должно совпасть, а ток БП может быть больше — прибор сам берёт сколько ему надо.'],
  ['Что такое пусковой ток?', ['Ток, который течёт при полной нагрузке', 'Кратковременный пик при включении', 'Ток утечки на землю', 'Максимум автомата'], 1, 'Моторы, лампы накаливания и блоки питания берут при старте ток в разы выше рабочего — на доли секунды.'],
  ['Инвертор 2000 Вт питается от аккумулятора 12 В. Какой ток из АКБ?', ['≈ 17 А', '≈ 45 А', '≈ 190 А', '≈ 2000 А'], 2, 'I = P / (U × КПД) = 2000 / (12 × 0,9) ≈ 185 А. Поэтому мощные инверторы делают на 24 и 48 В.'],
  ['КПД блока питания 80 %, на выходе 80 Вт. Сколько берёт из розетки?', ['64 Вт', '80 Вт', '100 Вт', '160 Вт'], 2, 'P вход = 80 / 0,8 = 100 Вт. 20 Вт уходят в тепло.']
];
let qi = 0, score = 0;
function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]]; } return b; }
function quizShow() {
  $('#qBar').style.width = (qi / QZ.length * 100) + '%';
  if (qi >= QZ.length) { quizEnd(); return; }
  const q = QZ[qi]; const opts = shuffle(q[1].map((t, i) => ({ t, ok: i === q[2] })));
  $('#quiz').innerHTML = `<div class="muted small" style="margin-bottom:8px">Вопрос ${qi + 1} из ${QZ.length}</div><h3 style="margin-bottom:20px">${q[0]}</h3>` + opts.map((o, i) => `<button class="q-opt" data-ok="${o.ok ? 1 : 0}">${o.t}</button>`).join('') + '<div id="qExp"></div>';
  $$('.q-opt').forEach(b => b.addEventListener('click', () => {
    const ok = b.dataset.ok === '1'; if (ok) score++;
    $$('.q-opt').forEach(x => { x.disabled = true; if (x.dataset.ok === '1') x.classList.add('right'); });
    if (!ok) b.classList.add('wrong');
    $('#qExp').innerHTML = `<div class="verdict ${ok ? 'good' : 'warn'}" style="margin-top:14px">${ok ? '✅ Верно! ' : '🙈 Почти. '}${q[3]}</div><button class="btn" style="margin-top:16px" id="qNext">${qi === QZ.length - 1 ? 'Получить сертификат ⚡' : 'Дальше →'}</button>`;
    $('#qNext').addEventListener('click', () => { qi++; quizShow(); });
  }));
}
function quizEnd() {
  $('#quizCard').style.display = 'none';
  const lv = score >= 8 ? ['ЗАРЯЖЕН НА 100 %', 'Электрик-самоучка. Козырной тип. Розетки трепещут.'] : score >= 6 ? ['ЗАРЯЖЕН НА 85 %', 'Почти гуру. Пара нюансов — и ты босс щитка.'] : score >= 4 ? ['ИДЁТ ЗАРЯДКА…', 'Отличная база. Перечитай главы про пусковой ток и автоматы.'] : ['НУЖНА ПОДЗАРЯДКА', 'Всё впереди! Пролистай курс ещё раз — теперь внимательно ⚡'];
  const box = $('#certBox'); box.style.display = 'block';
  box.innerHTML = `<div class="cert"><div class="muted" style="letter-spacing:.2em;text-transform:uppercase">Сертификат</div><div class="name">Игорь Козлов</div><div class="st">${lv[0]}</div><p style="margin:22px auto 6px;max-width:520px;font-size:18px">${lv[1]}</p><p class="muted">Результат: <b class="volt">${score} из ${QZ.length}</b></p><div style="margin-top:26px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap"><button class="btn" id="qAgain">↻ Ещё раз</button><button class="btn ghost" id="qTop">↑ В начало курса</button></div></div>`;
  $('#qAgain').addEventListener('click', () => { box.style.display = 'none'; $('#quizCard').style.display = ''; qi = 0; score = 0; quizShow(); });
  $('#qTop').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  if (score >= 4) boom();
  setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}
quizShow();

/* конфетти-молнии */
const cf = $('#confetti'), cctx = cf.getContext('2d'); let cps = [], cRun = false;
function boom() {
  cf.width = innerWidth; cf.height = innerHeight; cps = [];
  for (let i = 0; i < 160; i++) cps.push({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .65, vx: (Math.random() - .5) * 18, vy: -8 - Math.random() * 14, r: Math.random() * TAU, vr: (Math.random() - .5) * .4, s: 10 + Math.random() * 14, c: ['#ffd60a', '#3dd9ff', '#ff4d8d', '#3ddc84', '#fff'][i % 5], bolt: i % 4 === 0 });
  if (!cRun) { cRun = true; requestAnimationFrame(cfLoop); }
}
function cfLoop() {
  cctx.clearRect(0, 0, cf.width, cf.height);
  cps.forEach(p => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= .99; cctx.save(); cctx.translate(p.x, p.y); cctx.rotate(p.r); cctx.fillStyle = p.c; if (p.bolt) { cctx.font = p.s * 1.6 + 'px serif'; cctx.fillText('⚡', -p.s / 2, p.s / 2); } else cctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cctx.restore(); });
  cps = cps.filter(p => p.y < cf.height + 40);
  if (cps.length) requestAnimationFrame(cfLoop); else { cRun = false; cctx.clearRect(0, 0, cf.width, cf.height); }
}

/* =========================================================
   ГЛАВНЫЙ ЦИКЛ
   ========================================================= */
let lastT = 0;
function loop(ms) {
  const t = ms / 1000, dt = Math.min(.05, t - lastT); lastT = t;
  vel *= .94;
  if (Math.abs(targetHue - curHue) > .3) {
    let d = ((targetHue - curHue + 540) % 360) - 180; curHue = (curHue + d * .04 + 360) % 360;
    document.body.style.setProperty('--hue', curHue.toFixed(1));
  }
  if (isVis(sp)) drawSparks(t, dt);
  if (isVis(ohmCv)) drawOhm(t);
  if (isVis(bat_svg) && !reduce) waveTick(t);
  if (isVis(sineCv)) drawWave(t);
  if (isVis(inrCv)) { const pr = clamp((performance.now() - inrT0) / 1800); drawInr(easeOut(pr)); }
  requestAnimationFrame(loop);
}
inrReplay();
update();
requestAnimationFrame(loop);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
})();

(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- Появление при скролле (один раз) ---------- */
let pending = $$('.rv');
const reveal = () => {
  pending = pending.filter(el => {
    if (el.getBoundingClientRect().top < innerHeight * .9) { el.classList.add('in'); return false; }
    return true;
  });
};
let tick = false;
addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; reveal(); }); } }, { passive: true });
addEventListener('resize', reveal); reveal(); setTimeout(reveal, 300);

/* ---------- Тулбар: активный раздел ---------- */
const links = $$('.toolbar [data-to]');
const sections = links.map(a => document.getElementById(a.dataset.to)).filter(Boolean);
const setActive = () => {
  const y = innerHeight * .4; let cur = null;
  sections.forEach(s => { const r = s.getBoundingClientRect(); if (r.top <= y && r.bottom > y) cur = s.id; });
  links.forEach(a => a.classList.toggle('on', a.dataset.to === cur));
};
addEventListener('scroll', setActive, { passive: true }); setActive();

/* ---------- Рамка выделения по наведению (desktop) ---------- */
if (fine) {
  const sel = document.createElement('div');
  sel.className = 'sel'; sel.innerHTML = '<i></i><i></i><i></i><i></i><b></b>';
  document.body.appendChild(sel);
  const label = $('b', sel); let target = null;
  const place = () => {
    if (!target) return;
    const r = target.getBoundingClientRect();
    sel.style.left = (r.left + scrollX) + 'px'; sel.style.top = (r.top + scrollY) + 'px';
    sel.style.width = r.width + 'px'; sel.style.height = r.height + 'px';
    label.textContent = Math.round(r.width) + ' × ' + Math.round(r.height);
  };
  $$('[data-sel]').forEach(el => {
    el.addEventListener('mouseenter', () => { target = el; place(); sel.classList.add('on'); });
    el.addEventListener('mouseleave', () => { target = null; sel.classList.remove('on'); });
  });
  addEventListener('resize', place);
}

/* ---------- Шесть минут ---------- */
const six = $('#six');
if (six) {
  const clock = $('#clock'), steps = $$('[data-step]', six), end = $('#six-end'), hint = $('#hint');
  const times = ['12:00', '12:01', '12:06'];
  let cur = 0;
  const update = () => {
    const r = six.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
    const step = p < .28 ? 0 : p < .56 ? 1 : 2;
    if (step !== cur) {
      cur = step;
      if (reduce) clock.textContent = times[step];
      else { clock.classList.add('flip'); setTimeout(() => { clock.textContent = times[step]; clock.classList.remove('flip'); }, 180); }
    }
    steps.forEach((s, i) => s.classList.toggle('on', i <= step));
    end.classList.toggle('on', p > .78);
    if (hint) hint.style.opacity = p > .05 ? 0 : 1;
  };
  addEventListener('scroll', update, { passive: true }); update();
}

/* =========================================================
   Первый экран: настоящий экран из Figma, разобранный на слои.
   Наведение (desktop) или тап (touch) раскладывает экран на
   компоненты с выносками и размерами в pt; линейки Figma
   подсвечивают выбранный слой; курсор-соавтор один раз
   показывает, как это работает.
   ========================================================= */
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const tween = (ms, fn) => new Promise(res => {
  const t0 = performance.now();
  const step = now => { const t = Math.min(1, (now - t0) / ms); fn(ease(t)); t < 1 ? requestAnimationFrame(step) : res(); };
  requestAnimationFrame(step);
});
const heroEl = $('#top'), board = $('#board'), ex = $('#ex');

if (board && ex) {
  const obj = $('.ex-obj', ex), scene = $('.ex-scene', ex), svg = $('.ex-lines', ex), labelsEl = $('.ex-labels', ex);
  const hint = $('.ex-hint', ex);
  const layers = $$('.ex-l', ex);
  // «desktop» пересчитывается при каждом изменении размера окна
  const wide = matchMedia('(min-width: 1101px)');
  let desktop = fine && wide.matches;
  const LAB = 150, GAP = 24;
  if (hint) hint.textContent = fine ? hint.dataset.fine : hint.dataset.touch;
  layers.forEach((l, i) => l.style.setProperty('--i', i));

  // выноски
  const labels = layers.map((l, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ex-label ' + (l.dataset.side === 'l' ? 'l' : 'r');
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = l.dataset.name;
    b.querySelector('span').textContent = l.dataset.size + ' pt';
    labelsEl.appendChild(b);
    b.addEventListener('mouseenter', () => focusLayer(i));
    b.addEventListener('focus', () => { setOpen(true); focusLayer(i); });
    b.addEventListener('mouseleave', () => focusLayer(-1));
    b.addEventListener('click', e => { e.stopPropagation(); setOpen(true); focusLayer(focused === i ? -1 : i); });
    return b;
  });

  let open = false, focused = -1, tilt = { x: 0, y: 0 }, follow = null;
  const angles = () => {
    const rx = (open ? 8 : 0) + tilt.y * (open ? 4 : 6);
    const ry = (open ? 28 : 0) + tilt.x * (open ? 5 : 8);
    obj.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    obj.style.setProperty('--ry', ry.toFixed(2) + 'deg');
  };

  // раскладка: ширина объекта по доступной высоте первого экрана
  const size = () => {
    desktop = fine && wide.matches;
    const bw = board.clientWidth;
    // выноски по обе стороны: экрану остаётся ширина минус две колонки подписей
    const byWidth = bw - 2 * (LAB + GAP) - 16;
    const list = bw < 560 || byWidth < 220;
    ex.classList.toggle('list', list);
    let w;
    if (wide.matches) {
      const top = scene.getBoundingClientRect().top - heroEl.getBoundingClientRect().top;
      const availH = Math.max(280, innerHeight - top - 150); // место под подсказку и тулбар
      w = Math.min(400, availH * 508 / 1022, list ? bw * .6 : byWidth);
    } else {
      w = Math.min(280, bw * (list ? .62 : .5));
      if (innerWidth > 900) { // планшет/узкий ноутбук: телефон целиком в первом экране
        const top = scene.getBoundingClientRect().top - heroEl.getBoundingClientRect().top;
        w = Math.min(w, Math.max(260, innerHeight - top - 150) * 508 / 1022);
      }
    }
    ex.style.setProperty('--ex-w', Math.round(w) + 'px');
    heroEl.classList.toggle('live', desktop); board.classList.toggle('live', desktop);
  };

  // позиции выносок по реальным (спроецированным) прямоугольникам слоёв
  const placeLabels = () => {
    const er = ex.getBoundingClientRect();
    if (ex.classList.contains('list')) { svg.innerHTML = ''; return; }
    const or = obj.getBoundingClientRect();
    const items = layers.map((l, i) => {
      const r = l.getBoundingClientRect();
      const left = l.dataset.side === 'l';
      return { i, left, ax: (left ? r.left : r.right) - er.left, ay: r.top + r.height / 2 - er.top };
    });
    // разводим выноски по вертикали, чтобы не слипались
    ['r', 'l'].forEach(side => {
      const col = items.filter(it => (side === 'l') === it.left).sort((a, b) => a.ay - b.ay);
      let prev = -Infinity;
      col.forEach(it => { it.ly = Math.max(it.ay, prev + 40); prev = it.ly; });
    });
    // колонка выносок — правее самого выдвинутого слоя, чтобы подписи не ложились на экран
    const maxR = Math.max(or.right, ...layers.map(l => l.getBoundingClientRect().right));
    const minL = Math.min(or.left, ...layers.map(l => l.getBoundingClientRect().left));
    // и не дальше края окна: подпись целиком остаётся в кадре
    let xr = maxR - er.left + GAP, xl = minL - er.left - GAP;
    xr = Math.min(xr, innerWidth - 16 - LAB - er.left);
    xl = Math.max(xl, 16 + LAB - er.left);
    let html = '';
    items.forEach(it => {
      const lx = it.left ? xl : xr;
      const lab = labels[it.i];
      lab.style.left = lx + 'px'; lab.style.top = it.ly + 'px';
      const ex2 = it.left ? lx + 8 : lx - 8;
      const hl = it.i === focused ? ' class="hl"' : '';
      html += `<line${hl} x1="${it.ax.toFixed(1)}" y1="${it.ay.toFixed(1)}" x2="${ex2.toFixed(1)}" y2="${it.ly.toFixed(1)}"/><circle${hl} cx="${it.ax.toFixed(1)}" cy="${it.ay.toFixed(1)}" r="2"/>`;
    });
    svg.innerHTML = html;
  };
  // во время 3D-перехода пересчитываем выноски каждый кадр
  let follow_until = 0;
  const followFor = ms => {
    follow_until = Math.max(follow_until, performance.now() + ms);
    if (follow) return;
    const loop = () => { placeLabels(); queueRulers(); follow = performance.now() < follow_until ? requestAnimationFrame(loop) : null; };
    follow = requestAnimationFrame(loop);
  };

  function setOpen(v) {
    if (open === v) return;
    open = v;
    ex.classList.toggle('open', v);
    if (v) setTimeout(() => { if (open) ex.classList.add('labels-on'); }, 350);
    else { ex.classList.remove('labels-on'); focusLayer(-1); }
    angles(); followFor(1100);
  }
  function focusLayer(i) {
    focused = i;
    ex.classList.toggle('focus', i >= 0);
    layers.forEach((l, k) => l.classList.toggle('hl', k === i));
    labels.forEach((b, k) => b.classList.toggle('hl', k === i));
    placeLabels(); queueRulers();
  }

  // взаимодействие
  if (fine) {
    ex.addEventListener('pointerenter', () => setOpen(true));
    ex.addEventListener('pointerleave', () => { if (!introOn) { setOpen(false); tilt = { x: 0, y: 0 }; ex.classList.remove('track'); angles(); followFor(1000); } });
    scene.addEventListener('pointermove', e => {
      if (introOn) return;
      const r = scene.getBoundingClientRect();
      tilt = { x: (e.clientX - r.left) / r.width - .5, y: .5 - (e.clientY - r.top) / r.height };
      ex.classList.add('track'); angles(); followFor(300);
    });
    layers.forEach((l, i) => { l.addEventListener('pointerenter', () => open && focusLayer(i)); l.addEventListener('pointerleave', () => focusLayer(-1)); });
  } else {
    ex.addEventListener('click', () => setOpen(!open));
  }
  ex.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); }
    if (e.key === 'Escape') setOpen(false);
  });

  /* --- линейки Figma (desktop) --- */
  const rx = $('.ruler-x', heroEl), ry = $('.ruler-y', heroEl);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let mouse = null, rTick = false;
  const drawRulers = () => {
    if (!desktop) return;
    const hr = heroEl.getBoundingClientRect(), br = obj.getBoundingClientRect();
    // начало координат — левый край колонки контента и верх заголовка, как у холста в Figma
    const hin = heroEl.querySelector('.hero-in'), ttl = heroEl.querySelector('.hero-title');
    const ox = hin.getBoundingClientRect().left + parseFloat(getComputedStyle(hin).paddingLeft) - hr.left;
    const oy = (ttl ? ttl.getBoundingClientRect().top : br.top) - hr.top;
    let range = null;
    if (focused >= 0) { const r = layers[focused].getBoundingClientRect(); range = { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height }; }
    else if (open) range = { x: br.left - hr.left, y: br.top - hr.top, w: br.width, h: br.height };
    const muted = css('--muted'), ink = css('--ink'), guide = css('--sel');
    [[rx, hr.width, 20, ox, true], [ry, 20, hr.height, oy, false]].forEach(([cv, w, h, o, horiz]) => {
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      const len = horiz ? w : h;
      if (range) {
        const a = horiz ? range.x : range.y, b = a + (horiz ? range.w : range.h);
        c.fillStyle = guide; c.globalAlpha = .16;
        horiz ? c.fillRect(a, 0, b - a, h) : c.fillRect(0, a, w, b - a);
        c.globalAlpha = 1;
      }
      c.fillStyle = muted; c.font = '500 10px Onest, sans-serif'; c.textBaseline = 'top';
      for (let u = Math.floor(-o / 10) * 10; o + u < len; u += 10) {
        const p = Math.round(o + u) + .5, t = u % 100 === 0 ? 8 : u % 50 === 0 ? 5 : 3;
        c.globalAlpha = .7;
        horiz ? c.fillRect(p, h - t, 1, t) : c.fillRect(w - t, p, t, 1);
        if (u % 100 === 0) {
          c.globalAlpha = .9;
          if (horiz) c.fillText(u, p + 3, 3);
          else { c.save(); c.translate(3, p - 3); c.rotate(-Math.PI / 2); c.fillText(u, 0, 0); c.restore(); }
        }
      }
      c.globalAlpha = 1;
      if (range) {
        c.fillStyle = guide;
        const a = horiz ? range.x : range.y, b = a + (horiz ? range.w : range.h);
        if (horiz) { c.fillText(Math.round(a - o), a + 3, 3); c.fillText(Math.round(b - o), b + 3, 3); }
      }
      if (mouse) {
        const m = horiz ? mouse.x : mouse.y, v = Math.round(m - o);
        c.fillStyle = ink;
        if (horiz) { c.fillRect(Math.round(m), 0, 1, h); c.fillText(v, m + 4, 3); }
        else { c.fillRect(0, Math.round(m), w, 1); c.save(); c.translate(3, m - 4); c.rotate(-Math.PI / 2); c.fillText(v, 0, 0); c.restore(); }
      }
    });
  };
  function queueRulers() { if (desktop && !rTick) { rTick = true; requestAnimationFrame(() => { rTick = false; drawRulers(); }); } }
  if (fine) {
    heroEl.addEventListener('pointermove', e => { const r = heroEl.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; queueRulers(); });
    heroEl.addEventListener('pointerleave', () => { mouse = null; queueRulers(); });
    new MutationObserver(queueRulers).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  const relayout = () => { size(); angles(); placeLabels(); queueRulers(); };
  relayout();
  addEventListener('resize', relayout);
  document.fonts && document.fonts.ready.then(relayout);
  $$('img', ex).forEach(img => img.complete || img.addEventListener('load', relayout, { once: true }));

  /* --- курсор-соавтор: один раз за сессию разбирает экран --- */
  var introOn = false;
  let seen = false;
  try { seen = sessionStorage.getItem('intro') === '1'; } catch (e) {}
  const co = $('.coauthor', board);
  if (desktop && !reduce && !seen && co) {
    introOn = true;
    const at = (el, fx, fy) => { const b = board.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - b.left + r.width * fx, y: r.top - b.top + r.height * fy }; };
    const cur = { x: board.clientWidth + 40, y: board.clientHeight * .75 };
    const placeCo = () => { co.style.transform = `translate(${cur.x}px, ${cur.y}px)`; };
    const glide = async (to, ms) => { const c0 = { ...cur }; await tween(ms, t => { cur.x = c0.x + (to.x - c0.x) * t; cur.y = c0.y + (to.y - c0.y) * t; placeCo(); }); };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const cancel = () => { introOn = false; };
    ex.addEventListener('pointerdown', cancel, { once: true });
    placeCo();
    (async () => {
      await wait(1600); if (!introOn) return;
      co.classList.add('on');
      await glide(at(obj, .62, .32), 800); if (!introOn) return co.classList.remove('on');
      setOpen(true);
      await wait(1100); if (!introOn) return co.classList.remove('on');
      await glide(at(layers[4], .7, .5), 700); if (!introOn) return co.classList.remove('on');
      focusLayer(4);
      await wait(1300); if (!introOn) return co.classList.remove('on');
      focusLayer(-1);
      await glide(at(layers[3], .75, .45), 600); if (!introOn) return co.classList.remove('on');
      focusLayer(3);
      await wait(1100);
      focusLayer(-1);
      co.classList.remove('on');
      await glide({ x: cur.x + 70, y: cur.y + 60 }, 500);
      introOn = false;
      if (!ex.matches(':hover')) setOpen(false);
      try { sessionStorage.setItem('intro', '1'); } catch (e) {}
    })();
  }
}

/* =========================================================
   Первый экран v5: «Слои продукта». Наведение (тап) раскладывает
   продукт в изометрию: токены → компоненты → экраны → пользователь.
   Легенда подсвечивает слой; токены меняют все слои сразу.
   Линейки Figma подсвечивают выбранный слой.
   ========================================================= */
const la = $('#la');
if (la) {
  const hero = $('#top'), scene = $('.la-scene', la);
  let focused = null;
  if (!fine) { const h = $('.la-hint', la); if (h) h.textContent = 'Нажмите — продукт разберётся на слои'; }
  const setOpen = v => { la.classList.toggle('open', v); followRulers(1100); };
  const focus = l => {
    focused = l;
    la.classList.toggle('focus', !!l);
    $$('[data-l]', la).forEach(el => el.classList.toggle('hl', el.dataset.l === l));
    queueRulers();
  };
  if (fine) {
    scene.addEventListener('pointerenter', () => setOpen(true));
    la.addEventListener('pointerleave', () => { setOpen(false); focus(null); });
  } else {
    scene.addEventListener('click', () => setOpen(!la.classList.contains('open')));
  }
  la.addEventListener('keydown', e => {
    if (e.target.closest('.tk')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!la.classList.contains('open')); }
    if (e.key === 'Escape') { setOpen(false); focus(null); }
  });
  $$('.la-legend li', la).forEach(li => {
    li.addEventListener('mouseenter', () => { setOpen(true); focus(li.dataset.l); });
    li.addEventListener('mouseleave', () => focus(null));
    li.addEventListener('click', () => { setOpen(true); focus(focused === li.dataset.l ? null : li.dataset.l); });
  });

  // токены: одно изменение проходит через все слои
  const sets = {
    accent: [['Графит', { '--ac': 'var(--ink)' }], ['Шампань', { '--ac': '#C9B48A' }], ['Синий', { '--ac': '#3D6BFF' }]],
    radius: [['12', { '--rc': '12px' }], ['20', { '--rc': '20px' }], ['4', { '--rc': '4px' }]],
    density: [['Средняя', { '--gp': '10px' }], ['Свободная', { '--gp': '14px' }], ['Плотная', { '--gp': '6px' }]],
  };
  const idx = { accent: 0, radius: 0, density: 0 };
  let tkTimers = [];
  $$('.tk', la).forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k; idx[k] = (idx[k] + 1) % 3;
    const [name, v] = sets[k][idx[k]];
    Object.entries(v).forEach(([p, val]) => la.style.setProperty(p, val));
    $('em', b).textContent = name;
    tkTimers.forEach(clearTimeout);
    setOpen(true); focus('tokens');
    if (!reduce) tkTimers = [setTimeout(() => focus('comps'), 450), setTimeout(() => focus('screens'), 900), setTimeout(() => focus(null), 1700)];
    else focus(null);
  }));

  /* --- линейки Figma (desktop с мышью) --- */
  const desktop = fine && matchMedia('(min-width: 901px)').matches;
  const rx = $('.ruler-x', hero), ry = $('.ruler-y', hero);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let mouse = null, rTick = false, follow = null, followUntil = 0;
  function drawRulers() {
    if (!desktop || !rx) return;
    const hr = hero.getBoundingClientRect();
    const hin = $('.hero-in', hero), ttl = $('.hero-title', hero);
    const ox = hin.getBoundingClientRect().left + parseFloat(getComputedStyle(hin).paddingLeft) - hr.left;
    const oy = ttl.getBoundingClientRect().top - hr.top;
    let range = null;
    const el = focused ? $(`.plate[data-l="${focused}"]`, la) : (la.classList.contains('open') ? $('.la-stack', la) : null);
    if (el) { const r = el.getBoundingClientRect(); range = { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height }; }
    const muted = css('--muted'), ink = css('--ink'), hl = css('--accent');
    [[rx, hr.width, 20, ox, true], [ry, 20, hr.height, oy, false]].forEach(([cv, w, h, o, horiz]) => {
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      if (range) { c.fillStyle = hl; c.globalAlpha = .14; horiz ? c.fillRect(range.x, 0, range.w, h) : c.fillRect(0, range.y, w, range.h); c.globalAlpha = 1; }
      c.fillStyle = muted; c.font = '500 10px Onest, sans-serif'; c.textBaseline = 'top';
      const len = horiz ? w : h;
      for (let u = Math.floor(-o / 10) * 10; o + u < len; u += 10) {
        const p = Math.round(o + u) + .5, t = u % 100 === 0 ? 8 : u % 50 === 0 ? 5 : 3;
        c.globalAlpha = .7; horiz ? c.fillRect(p, h - t, 1, t) : c.fillRect(w - t, p, t, 1);
        if (u % 100 === 0) {
          c.globalAlpha = .9;
          if (horiz) c.fillText(u, p + 3, 3); else { c.save(); c.translate(3, p - 3); c.rotate(-Math.PI / 2); c.fillText(u, 0, 0); c.restore(); }
        }
      }
      c.globalAlpha = 1;
      if (mouse) {
        const m = horiz ? mouse.x : mouse.y, v = Math.round(m - o);
        c.fillStyle = ink;
        if (horiz) { c.fillRect(Math.round(m), 0, 1, h); c.fillText(v, m + 4, 3); }
        else { c.fillRect(0, Math.round(m), w, 1); c.save(); c.translate(3, m - 4); c.rotate(-Math.PI / 2); c.fillText(v, 0, 0); c.restore(); }
      }
    });
  }
  function queueRulers() { if (desktop && !rTick) { rTick = true; requestAnimationFrame(() => { rTick = false; drawRulers(); }); } }
  // во время 3D-перехода диапазон на линейках следует за слоем
  function followRulers(ms) {
    if (!desktop) return;
    followUntil = Math.max(followUntil, performance.now() + ms);
    if (follow) return;
    const loop = () => { drawRulers(); follow = performance.now() < followUntil ? requestAnimationFrame(loop) : null; };
    follow = requestAnimationFrame(loop);
  }
  if (desktop) {
    hero.classList.add('live');
    hero.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; queueRulers(); });
    hero.addEventListener('pointerleave', () => { mouse = null; queueRulers(); });
    addEventListener('resize', queueRulers);
    document.fonts && document.fonts.ready.then(queueRulers);
    new MutationObserver(queueRulers).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    queueRulers();
  }
}

/* ---------- Обложка: слова заголовка и строки во всю ширину ---------- */
if (heroEl) {
  const title = $('.hero-title', heroEl), words = $$('.word', heroEl), ctx = $$('.hero-ctx [data-for]', heroEl);
  let openWord = null;
  // выделение — черта под словом, растёт слева направо (CSS .word::after)
  // выделение — рамка Figma с обрезкой по x-высоте и базовой линии (как vertical trim в Figma):
  // у всех слов одна высота рамки и ровный воздух, хвосты «д» и «у» свисают ниже, как в макете
  const sel = document.createElement('div');
  sel.className = 'hero-sel'; sel.setAttribute('aria-hidden', 'true');
  sel.innerHTML = '<i></i><i></i><i></i><i></i>';
  if (title) title.appendChild(sel);
  const mcv = document.createElement('canvas'), mctx = mcv.getContext('2d', { willReadFrequently: true });
  // реальные чернила слова: рисуем в канвас и ищем крайние закрашенные пиксели по горизонтали
  const inkX = (text, font, ls, fs) => {
    const W = Math.ceil(fs * text.length), H = Math.ceil(fs * 2), y0 = Math.round(fs * 1.2), x0 = Math.round(fs * .5);
    mcv.width = W; mcv.height = H;
    mctx.font = font; if ('letterSpacing' in mctx) mctx.letterSpacing = ls;
    mctx.textBaseline = 'alphabetic'; mctx.fillStyle = '#000'; mctx.fillText(text, x0, y0);
    const d = mctx.getImageData(0, 0, W, H).data;
    let l = W, r = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 60) { if (x < l) l = x; if (x > r) r = x; }
    return { l: l - x0, r: r + 1 - x0 };
  };
  const cache = new Map();
  const placeSel = () => {
    if (!openWord || !title) return;
    const tr = title.getBoundingClientRect(), r = openWord.getBoundingClientRect();
    const cs = getComputedStyle(openWord), fs = parseFloat(cs.fontSize);
    const font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
    const key = font + cs.letterSpacing + openWord.textContent;
    if (!cache.has(key)) cache.set(key, inkX(openWord.textContent, font, cs.letterSpacing, fs));
    const ink = cache.get(key);
    mctx.font = font;
    const fm = mctx.measureText('о'), xh = fm.actualBoundingBoxAscent, over = fm.actualBoundingBoxDescent;
    // базовая линия inline-block: строка центрирует «коробку» шрифта по line-height
    const lh = parseFloat(cs.lineHeight) || r.height;
    const base = r.top + (lh - (fm.fontBoundingBoxAscent + fm.fontBoundingBoxDescent)) / 2 + fm.fontBoundingBoxAscent;
    const pad = fs * .08;
    const left = r.left + ink.l - pad, right = r.left + ink.r + pad;
    const top = base - xh - pad, bottom = base + over + pad;
    sel.style.left = (left - tr.left) + 'px'; sel.style.top = (top - tr.top) + 'px';
    sel.style.width = (right - left) + 'px'; sel.style.height = (bottom - top) + 'px';
  };
  let hideT = 0;
  const set = w => {
    clearTimeout(hideT);
    const was = sel.classList.contains('on');
    openWord = w;
    words.forEach(x => x.classList.toggle('on', x === w));
    ctx.forEach(c => c.classList.toggle('on', !!w && c.dataset.for === w.dataset.peek));
    if (w) {
      // из пустоты — появляется на месте, между словами — переезжает
      sel.classList.toggle('jump', !was);
      placeSel();
      sel.offsetWidth; sel.classList.remove('jump');
    }
    sel.classList.toggle('on', !!w);
  };
  // короткая пауза перед скрытием: при переходе на соседнее слово рамка переезжает, а не мигает
  const leave = () => { clearTimeout(hideT); hideT = setTimeout(() => set(null), 160); };
  words.forEach(w => {
    if (fine) { w.addEventListener('mouseenter', () => set(w)); w.addEventListener('mouseleave', leave); }
    w.addEventListener('focus', () => set(w)); w.addEventListener('blur', () => set(null));
    w.addEventListener('click', e => { e.preventDefault(); if (!fine) set(openWord === w ? null : w); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') set(null); });
  document.addEventListener('pointerdown', e => { if (!fine && !e.target.closest('.word')) set(null); });

  // каждая строка заголовка — ровно во всю ширину (на телефоне — обычный перенос)
  const fit = () => {
    if (!title) return;
    const lines = $$('.mask', title);
    if (innerWidth <= 600) { lines.forEach(l => l.style.fontSize = ''); return; }
    const w = title.clientWidth;
    // один кегль на обе строки: по самой длинной, она встаёт ровно в ширину
    lines.forEach(l => l.style.fontSize = '');
    title.style.fontSize = '100px';
    const widest = Math.max(...lines.map(l => l.firstElementChild.scrollWidth));
    title.style.fontSize = Math.min(98 * w / widest, innerHeight * .22) + 'px';
  };
  fit();
  addEventListener('resize', () => { fit(); sel.classList.add('jump'); placeSel(); });
  document.fonts && document.fonts.ready.then(fit);

  /* --- разметка: линейки Figma (desktop с мышью) --- */
  const rx = $('.ruler-x', heroEl), ry = $('.ruler-y', heroEl);
  if (rx && ry && fine && !board) {
    const wideQ = matchMedia('(min-width: 901px)');
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    let mouse = null, rTick = false;
    const draw = () => {
      const on = wideQ.matches;
      heroEl.classList.toggle('live', on);
      if (!on) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const hr = heroEl.getBoundingClientRect(), hin = $('.hero-in', heroEl);
      // начало координат — левый край колонки контента и верх заголовка
      const ox = hin.getBoundingClientRect().left + parseFloat(getComputedStyle(hin).paddingLeft) - hr.left;
      const oy = (title ? title.getBoundingClientRect().top : hr.top) - hr.top;
      const r = openWord && openWord.getBoundingClientRect();
      const range = r ? { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height } : null;
      const muted = css('--muted'), ink = css('--ink'), hl = css('--accent');
      [[rx, hr.width, 20, ox, true], [ry, 20, hr.height, oy, false]].forEach(([cv, w, h, o, horiz]) => {
        cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
        const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
        const len = horiz ? w : h;
        if (range) {
          const a = horiz ? range.x : range.y, b = a + (horiz ? range.w : range.h);
          c.fillStyle = hl; c.globalAlpha = .16;
          horiz ? c.fillRect(a, 0, b - a, h) : c.fillRect(0, a, w, b - a);
          c.globalAlpha = 1;
        }
        c.fillStyle = muted; c.font = '500 10px Onest, sans-serif'; c.textBaseline = 'top';
        // угол 20×20 — общий для обеих линеек, как в Figma: делений и подписей в нём нет
        for (let u = Math.floor(-o / 10) * 10; o + u < len; u += 10) {
          const p = Math.round(o + u) + .5, t = u % 100 === 0 ? 8 : u % 50 === 0 ? 5 : 3;
          if (p < 20) continue;
          c.globalAlpha = .7;
          horiz ? c.fillRect(p, h - t, 1, t) : c.fillRect(w - t, p, t, 1);
          if (u % 100 === 0 && (horiz || p - 3 - c.measureText(u).width >= 22)) {
            c.globalAlpha = .9;
            if (horiz) c.fillText(u, p + 3, 3);
            else { c.save(); c.translate(3, p - 3); c.rotate(-Math.PI / 2); c.fillText(u, 0, 0); c.restore(); }
          }
        }
        c.globalAlpha = 1;
        if (range && horiz) {
          c.fillStyle = hl;
          c.fillText(Math.round(range.x - o), range.x + 3, 3);
          c.fillText(Math.round(range.x + range.w - o), range.x + range.w + 3, 3);
        }
        if (mouse && (horiz ? mouse.x : mouse.y) > 20) {
          const m = horiz ? mouse.x : mouse.y, v = Math.round(m - o);
          c.fillStyle = ink;
          if (horiz) { c.fillRect(Math.round(m), 0, 1, h); c.fillText(v, m + 4, 3); }
          else { c.fillRect(0, Math.round(m), w, 1); c.save(); c.translate(3, m - 4); c.rotate(-Math.PI / 2); c.fillText(v, 0, 0); c.restore(); }
        }
      });
    };
    const queue = () => { if (!rTick) { rTick = true; requestAnimationFrame(() => { rTick = false; draw(); }); } };
    heroEl.addEventListener('pointermove', e => { const b = heroEl.getBoundingClientRect(); mouse = { x: e.clientX - b.left, y: e.clientY - b.top }; queue(); });
    heroEl.addEventListener('pointerleave', () => { mouse = null; queue(); });
    words.forEach(w => { w.addEventListener('mouseenter', queue); w.addEventListener('mouseleave', queue); w.addEventListener('focus', queue); w.addEventListener('blur', queue); });
    new MutationObserver(queue).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    addEventListener('resize', queue);
    document.fonts && document.fonts.ready.then(queue);
    queue();
  }
}

/* ---------- Строки кейсов: раскрытие по клику ---------- */
$$('.row[aria-controls]').forEach(btn => {
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', open);
    panel.hidden = !open;
  });
});

/* ---------- Тема: авто → светлая → тёмная ---------- */
const modes = ['auto', 'light', 'dark'], names = { auto: 'авто', light: 'светлая', dark: 'тёмная' };
const root = document.documentElement;
let mode = root.dataset.theme || 'auto';
const paint = () => $$('[data-theme-toggle]').forEach(b => { b.textContent = 'Тема: ' + names[mode]; });
paint();
$$('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
  mode = modes[(modes.indexOf(mode) + 1) % 3];
  if (mode === 'auto') delete root.dataset.theme; else root.dataset.theme = mode;
  try { if (mode === 'auto') localStorage.removeItem('theme'); else localStorage.setItem('theme', mode); } catch (e) {}
  paint();
}));

/* ---------- Копировать email ---------- */
$$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
  const v = b.dataset.copy, txt = b.textContent;
  try { await navigator.clipboard.writeText(v); b.textContent = 'Скопировано'; setTimeout(() => { b.textContent = txt; }, 1400); }
  catch (e) { location.href = 'mailto:' + v; }
}));
})();

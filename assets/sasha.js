/* =========================================================
   Саша — персонаж сайта. Стиль outlined cartoon:
   плоские заливки, тёплый чернильный контур в три толщины
   (силуэт / части / детали), складки — заострённые «щепки»,
   большая голова, белые глаза в круглых очках, румянец.
   В тёмной теме — светлая обводка-наклейка (фильтр, см. sasha.css).
   Риг на углах суставов, кадр собирается в JS.
   Углы: 0 — вниз, 90 — вправо, 180 — вверх, −90 — влево.
   Правило сайта: двигается только в ответ на человека,
   плюс одно короткое приветствие за сессию.
   ========================================================= */
(() => {
const NS = 'http://www.w3.org/2000/svg';
const SRC = (document.currentScript && document.currentScript.src) || location.href;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* --- пропорции (единицы рига): короткие ноги и торс, голова ≈ 39 % роста --- */
const LEG1 = 40, LEG2 = 38, FOOT = 7, HIP = LEG1 + LEG2 + FOOT; // таз на высоте 85
const ARM1 = 24, ARM2 = 23, SHX = 18, SHY = -56, NECK = -70, SEAT = 12;
const HAIR_TOP = 95;                       // макушка-кок над основанием головы
const H_TOP = HIP - NECK + HAIR_TOP;       // полный рост стоя: 250
const R = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const vec = (a, l) => [Math.sin(a * R) * l, Math.cos(a * R) * l];
const f = v => Math.round(v * 10) / 10;

const ease = {
  io: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t,
  sine: t => .5 - Math.cos(Math.PI * t) / 2,
  back: t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

/* IK на две кости: углы плеча и локтя, чтобы кисть попала в (tx, ty) в системе торса */
function reach(side, tx, ty, prefer = 'down') {
  const sx = side * SHX, sy = SHY, dx = tx - sx, dy = ty - sy;
  const d = clamp(Math.hypot(dx, dy), 1, ARM1 + ARM2 - .01);
  const base = Math.atan2(dx, dy) / R;
  const A = Math.acos(clamp((ARM1 * ARM1 + d * d - ARM2 * ARM2) / (2 * ARM1 * d), -1, 1)) / R;
  const E = 180 - Math.acos(clamp((ARM1 * ARM1 + ARM2 * ARM2 - d * d) / (2 * ARM1 * ARM2), -1, 1)) / R;
  const sols = [[base + A, -E], [base - A, E]];
  const score = ([s]) => {
    const [ex, ey] = vec(s, 1);
    return prefer === 'down' ? ey : prefer === 'up' ? -ey : prefer === 'out' ? ex * side : -ex * side;
  };
  return score(sols[0]) >= score(sols[1]) ? sols[0] : sols[1];
}
const handA = (x, y, p) => { const [s, e] = reach(-1, x, y, p); return { sA: s, eA: e }; };
const handB = (x, y, p) => { const [s, e] = reach(1, x, y, p); return { sB: s, eB: e }; };

/* =========================================================
   Рисунок. Палитра и толщины — из стиля outlined cartoon.
   Толщины в единицах рига: на сайте масштаб ≈ .56,
   поэтому 3.6 / 2.8 / 2 дают на экране ≈ 2 / 1.6 / 1.1 px.
   ========================================================= */
const INK = '#1e1b1b';
const WO = 3.6, W = 2.8, WI = 2;
const C = {
  white: '#ffffff', tee: '#e6e3ee', teeF: '#c9c6d6',
  blue: '#6b7fd4', blueD: '#4c5fb6', glass: '#dfe4f8',
  red: '#e5281d', redD: '#a9180f', yel: '#f6c343', yelD: '#d99a1e',
  pink: '#f6a3b6', steel: '#e6e3ee', mouth: '#8a1b1b', tongue: '#ec7d78',
  hair: '#2b2525', hairS: '#5a4c4c',
  skin: '#fbd2c0', skinD: '#e39c86', blush: '#f2898a', wood: '#f3d9a8',
};
const at = (p, n = '') => `<path${n ? ` data-p="${n}"` : ''} ${p}/>`;
const stroke = (w, col = INK) => `stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const P = (d, fill, sw, n) => at(`d="${d}" fill="${fill}"${sw ? ' ' + stroke(sw) : ''}`, n);
/* «щепка»: заострённый с двух концов мазок, толщина w в середине */
const sl = (a, b, c, w, col = INK) => {
  const dx = c[0] - a[0], dy = c[1] - a[1], m = Math.hypot(dx, dy) || 1, nx = -dy / m * w, ny = dx / m * w;
  return `<path d="M${f(a[0])} ${f(a[1])}Q${f(b[0] + nx)} ${f(b[1] + ny)} ${f(c[0])} ${f(c[1])}Q${f(b[0] - nx)} ${f(b[1] - ny)} ${f(a[0])} ${f(a[1])}Z" fill="${col}"/>`;
};
/* цепочка дуг: пушистый контур волос */
const scallop = (pts, k = .62) => {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1, kk = k] = pts[i];
    const r = f(Math.hypot(x1 - x0, y1 - y0) * kk);
    d += `A${r} ${r} 0 0 1 ${x1} ${y1}`;
  }
  return d;
};

/* --- голова (0,0 — основание шеи; подбородок на +7) --- */
const FACE = 'M-30 -30C-31 -10 -22 2 -10 5.5Q0 8 10 5.5C22 2 31 -10 30 -30C30 -62 -30 -62 -30 -30Z';
const HAIR = scallop([[-31, -26], [-35, -50, .6], [-21, -71, .62], [0, -79, .6], [9, -98, .58], [29, -89, .6], [35, -63, .62], [31, -38, .7], [30, -26]])
  + scallop([[30, -26], [28, -46, 1.3], [12, -56.5, .7], [-6, -55, .7], [-22, -50.5, .7], [-31, -26, 1.3]]).replace(/^M[^A]+/, '') + 'Z';
const EYE = (x, k) => `<g data-p="eye${k}" data-cx="${x}">
  <ellipse cx="${x}" cy="-24" rx="5.6" ry="6.6" fill="${C.white}" ${stroke(WI)}/>
  <g data-p="pup${k}"><circle cx="${x}" cy="-23.4" r="3.3" fill="${INK}"/><circle cx="${x + 1.2}" cy="-24.8" r="1.2" fill="${C.white}"/></g>
  ${sl([x - 6.2, -24.6], [x - 1.2, -30.4], [x + 6, -26.2], 2.2)}
</g>`;
const HEAD = `
  <g transform="translate(34 -28) rotate(18)">
    ${P('M-3.4 -22H3.4V-2H-3.4Z', C.yel, W)}${P('M-3.4 -22H3.4V-27Q3.4 -29.5 0 -29.5Q-3.4 -29.5 -3.4 -27Z', C.pink, W)}
    ${sl([-1.2, -20], [-1.6, -12], [-1.2, -4], 1.4, C.yelD)}
  </g>
  <ellipse cx="-30.5" cy="-19" rx="5.6" ry="7.6" fill="${C.skin}" ${stroke(W)}/>
  <ellipse cx="30.5" cy="-19" rx="5.6" ry="7.6" fill="${C.skin}" ${stroke(W)}/>
  ${sl([-29.5, -23.5], [-33.4, -19], [-29.5, -14.5], 1.3, C.skinD)}${sl([29.5, -14.5], [33.4, -19], [29.5, -23.5], 1.3, C.skinD)}
  ${P(FACE, C.skin, WO)}
  <g data-p="feat">
    <ellipse cx="-19" cy="-9" rx="5" ry="3" fill="${C.blush}"/><ellipse cx="19" cy="-9" rx="5" ry="3" fill="${C.blush}"/>
    <circle cx="-13.5" cy="-24" r="12.4" fill="${C.glass}" fill-opacity=".3"/><circle cx="13.5" cy="-24" r="12.4" fill="${C.glass}" fill-opacity=".3"/>
    ${EYE(-13.5, 'A')}${EYE(13.5, 'B')}
    <path d="M-25.9 -25L-30.5 -26.5M25.9 -25L30.5 -26.5M-1.1 -26Q0 -27.6 1.1 -26" fill="none" ${stroke(W)}/>
    <circle cx="-13.5" cy="-24" r="12.4" fill="none" ${stroke(W)}/><circle cx="13.5" cy="-24" r="12.4" fill="none" ${stroke(W)}/>
    ${sl([-21, -30.5], [-18.6, -33.6], [-14, -34.6], 1.6, C.white)}${sl([6, -30.5], [8.4, -33.6], [13, -34.6], 1.6, C.white)}
    <g data-p="brows">${sl([-22, -39.5], [-14, -44], [-5.5, -41.5], 4)}${sl([5.5, -41.5], [14, -44], [22, -39.5], 3.6)}</g>
    ${sl([1, -14.5], [4.4, -10], [-.5, -8.4], 1.8)}
    <g data-p="m0">${sl([-5, -2], [0, -.4], [5, -2], 2.2)}</g>
    <g data-p="m1">
      ${P('M-6.5 -3C-2 -1.8 3 -2 7 -3.8C6.6 1.8 3.4 4.8 0 4.8C-3.6 4.8 -6.4 1.8 -6.5 -3Z', C.mouth)}
      ${P('M-3.6 3C-1.8 1 2.4 1 4.2 2.6C3 4.2 1.6 4.6 0 4.6C-1.6 4.6 -2.8 4.1 -3.6 3Z', C.tongue)}
      ${P('M-6.5 -3C-2 -1.8 3 -2 7 -3.8C6.6 1.8 3.4 4.8 0 4.8C-3.6 4.8 -6.4 1.8 -6.5 -3Z', 'none', 2.2)}
    </g>
    <g data-p="m2">
      ${P('M-9 -5C-4 -3.4 4 -3.4 9 -5C9 2 4.5 6 0 6C-4.5 6 -9 2 -9 -5Z', C.mouth)}
      ${P('M-8 -3.8C-3 -2.4 3 -2.4 8 -3.8L7.6 -1.2C3 -.2 -3 -.2 -7.6 -1.2Z', C.white)}
      ${P('M-5.2 3C-3 .6 3 .6 5.2 3C3.8 5 2 5.6 0 5.6C-2 5.6 -3.8 5 -5.2 3Z', C.tongue)}
      ${P('M-9 -5C-4 -3.4 4 -3.4 9 -5C9 2 4.5 6 0 6C-4.5 6 -9 2 -9 -5Z', 'none', 2.2)}
    </g>
  </g>
  ${P(HAIR, C.hair, WO)}
  ${sl([0, -53], [8, -70], [20, -86], 1.6, C.hairS)}${sl([-14, -49], [-10, -61], [-2, -72], 1.5, C.hairS)}${sl([22, -50], [27, -62], [30, -74], 1.4, C.hairS)}
  ${sl([4, -84], [9, -91], [16, -93], 2.4, C.white)}${sl([-24, -60], [-17, -68], [-9, -72], 2, C.white)}
  <circle cx="25" cy="-84" r="1.5" fill="${C.white}"/>`;

/* --- торс, футболка (система торса: 0 — таз, плечи на −56) --- */
const BODY = 'M-23 -52Q-22 -61 -10 -62.5Q0 -56 10 -62.5Q22 -61 23 -52C25 -34 24.5 -14 22.5 4Q0 7 -22.5 4C-24.5 -14 -25 -34 -23 -52Z';
const TORSO = `
  ${P('M-6.5 -54V-73H6.5V-54Z', C.skin, W)}${sl([-6, -61], [0, -58.6], [6, -61], 2, C.skinD)}
  ${at(`d="${BODY}" fill="${INK}" ${stroke(WO * 2)}`)}${P(BODY, C.white)}
  ${P('M21.5 -50C23.5 -32 23 -14 21 3.6Q17 4.6 13.5 5C15.5 -14 16.5 -34 14 -54Q19 -53 21.5 -50Z', C.tee)}
  ${sl([-8, -58.4], [0, -51.6], [8, -58.4], 1.6, C.teeF)}
  ${sl([-10.5, 5.4], [-9, -.5], [-4.5, -4.5], 1.7, C.teeF)}${sl([6, 6], [7.5, 1], [10.5, -2], 1.5, C.teeF)}${sl([-21, -30], [-18, -24], [-17.5, -16], 1.5, C.teeF)}`;

/* --- ноутбук: крышка смотрит на зрителя, экран — на Сашу --- */
const LAPTOP = `
  <rect x="-31" y="-1" width="62" height="6" rx="3" fill="${C.steel}" ${stroke(W)}/>
  <rect x="-27" y="-36" width="54" height="36" rx="4" fill="${C.yel}" ${stroke(WO)}/>
  ${sl([-24, -3.2], [0, -2.4], [24, -3.2], 1.6, C.yelD)}
  <circle cx="0" cy="-18" r="4.4" fill="${C.red}" ${stroke(WI)}/>
  ${sl([-22, -28], [-20.5, -31.5], [-15, -32.5], 2.2, C.white)}`;

/* --- рука: кисть в своей системе (запястье — 0,0, пальцы по +y, большой палец по +x) --- */
const PALM = 'M-5.5 0C-6.6 4 -6.6 9 -5 12.6C-3.4 15.2 3.4 15.2 5 12.6C6.6 9 6.6 4 5.5 0Z';
const THUMB = 'M4 1.6C8 2.2 10.2 6.4 9.2 9.4C8.4 11.2 5.8 10.6 4.8 8.4Z';
const ARM = k => `<g data-p="${k}">
  <path data-r="ink" fill="none" ${stroke(8 + W * 2)}/>
  <g data-r="hi">${at(`d="${PALM}" fill="${INK}" ${stroke(W * 2)}`)}${at(`d="${THUMB}" fill="${INK}" ${stroke(W * 2)}`)}</g>
  <path data-r="skin" fill="none" ${stroke(8, C.skin)}/>
  <g data-r="hf">${P(THUMB, C.skin)}${P(PALM, C.skin)}${sl([-2, 15], [-2.2, 13], [-2, 11], 1.2)}${sl([1.8, 15], [2, 13], [1.8, 11], 1.2)}${sl([-4, 3], [-4.6, 6], [-4, 9], 1.1, C.skinD)}</g>
  <path data-r="sleeve" fill="none" stroke="${C.white}" stroke-width="15" stroke-linecap="butt"/>
  <path data-r="cuff" fill="none" ${stroke(WI + .4)}/>
</g>`;

/* --- кеды: в профиль (носок по +x) и анфас; 0,0 — щиколотка, подошва на +7 --- */
const SHOE = `<g data-r="prof">
    ${P('M-11 1.5H19.5C21.6 1.5 22 7 19.5 7H-9.5C-12 7 -12.5 1.5 -11 1.5Z', C.white, WO)}
    ${P('M-10 3C-11 -2 -10 -7 -6 -8.5C-3 -10 1 -9.5 2.5 -7.5C4.5 -5.5 7 -4.4 10 -3.8C14 -3 17 -2 18 .5C18.6 2 18.3 3 17.8 3Z', C.red, WO)}
    ${P('M12 -3.3C15 -2.6 17.4 -1.4 18 .6C18.4 1.8 18.2 2.6 17.8 3L11.4 3C10.8 1 11 -1.4 12 -3.3Z', C.white, W)}
    <path d="M.6 -8l-1.2 3M4.4 -6l-1.2 3" fill="none" ${stroke(1.6, C.white)}/>
    ${sl([-7, -6.5], [-8, -2], [-7.4, 2], 1.6, C.redD)}
  </g><g data-r="front">
    ${P('M-11.5 1.5H11.5C13.6 1.5 14 7 11.5 7H-11.5C-14 7 -13.6 1.5 -11.5 1.5Z', C.white, WO)}
    ${P('M-10.5 3C-11 -3 -6.5 -8.5 0 -8.5C6.5 -8.5 11 -3 10.5 3Z', C.red, WO)}
    ${P('M-6 3C-6 -.5 -3 -2.2 0 -2.2C3 -2.2 6 -.5 6 3Z', C.white, W)}
    <path d="M-3 -6.2H3M-3.4 -4H3.4" fill="none" ${stroke(1.5, C.white)}/>
  </g>`;
const LEG = k => `<path data-p="leg${k}" fill="none" ${stroke(17, C.blue)}/>`;
const LEGINK = k => `<path data-p="li${k}" fill="none" ${stroke(17 + WO * 2)}/>`;
const HEM = k => `<g data-p="hem${k}"><path fill="none" stroke="${INK}" stroke-width="${20 + W * 2}" stroke-linecap="butt"/><path fill="none" stroke="${C.blue}" stroke-width="20" stroke-linecap="butt"/><path fill="none" stroke="${C.blueD}" stroke-width="1.4" stroke-linecap="round"/></g>`;

/* «искры» у машущей руки — три штриха и маленький плюс */
const SPARK = `<g data-p="spark" fill="none" ${stroke(2.2)}>
  <path d="M3 -15L4.4 -22M10 -11L15 -16M14 -4L21 -5.5"/>
  <path d="M19 -21H25M22 -24V-18" stroke-width="1.8"/>
</g>`;

let UID = 0;
const MARKUP = id => `
<defs><filter id="${id}" x="-15%" y="-15%" width="130%" height="130%">
  <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="d"/>
  <feFlood class="sa-kl"/><feComposite in2="d" operator="in"/>
  <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
</filter></defs>
<g data-p="root" filter="url(#${id})">
  <g>
    ${LEGINK('A')}${LEGINK('B')}
    <rect data-p="waistI" x="-19.5" width="39" height="15" rx="5" fill="${INK}" ${stroke(WO * 2)}/>
    ${LEG('A')}${LEG('B')}
    <rect data-p="waist" x="-19.5" width="39" height="15" rx="5" fill="${C.blue}"/>
    <path data-p="crA" fill="${C.blueD}"/><path data-p="crB" fill="${C.blueD}"/>
    ${HEM('A')}${HEM('B')}
    <g data-p="shoeA">${SHOE}</g><g data-p="shoeB">${SHOE}</g>
  </g>
  <g data-p="torso">
    <path data-p="slA" fill="none" stroke="${INK}" stroke-width="${15 + W * 2}" stroke-linecap="butt"/>
    <path data-p="slB" fill="none" stroke="${INK}" stroke-width="${15 + W * 2}" stroke-linecap="butt"/>
    ${TORSO}
    <g data-p="laptop">${LAPTOP}</g>
    <g data-p="head">${HEAD}</g>
    ${ARM('armA')}${ARM('armB')}
    ${SPARK}
  </g>
  <g data-p="think">
    <circle cx="0" cy="0" r="3" fill="${C.white}" ${stroke(W)}/>
    <circle cx="7.5" cy="-10" r="4.6" fill="${C.white}" ${stroke(W)}/>
    <rect x="10" y="-44" width="56" height="28" rx="14" fill="${C.white}" ${stroke(WO)}/>
    <circle data-p="d1" cx="24" cy="-30" r="3.4" fill="${C.red}"/>
    <circle data-p="d2" cx="38" cy="-30" r="3.4" fill="${C.yel}"/>
    <circle data-p="d3" cx="52" cy="-30" r="3.4" fill="${C.blue}"/>
  </g>
  <rect class="sa-hit" data-p="hit" x="-60" y="-262" width="120" height="268"/>
</g>`;

const DEF = {
  x: 0, y: 0, bob: 0, sit: 0, thigh: 1, lean: 0,
  head: 0, turn: 0, lx: 0, ly: 0, brow: 0, mouth: 0, blink: 0,
  hipA: -2, kneeA: 0, hipB: 2, kneeB: 0, toeA: 0, toeB: 0,
  sA: -8, eA: 6, sB: 8, eB: -6,
  lap: 0, lapX: 0, lapY: 0, lapR: 0,
  think: 0, dots: 0, side: 1, spark: 0,
};

function makeRig(svg) {
  svg.innerHTML = MARKUP('sa-kl-' + (++UID));
  const P = {};
  svg.querySelectorAll('[data-p]').forEach(e => { P[e.dataset.p] = e; });
  const part = (g, r) => g.querySelector(`[data-r="${r}"]`);
  const arms = ['A', 'B'].map(k => {
    const g = P['arm' + k];
    return { ink: part(g, 'ink'), hi: part(g, 'hi'), skin: part(g, 'skin'), hf: part(g, 'hf'), sleeve: part(g, 'sleeve'), cuff: part(g, 'cuff'), so: P['sl' + k] };
  });
  const shoes = ['A', 'B'].map(k => ({ g: P['shoe' + k], prof: part(P['shoe' + k], 'prof'), front: part(P['shoe' + k], 'front') }));
  const hems = ['A', 'B'].map(k => [...P['hem' + k].children]);
  const eyes = ['A', 'B'].map(k => ({ g: P['eye' + k], pup: P['pup' + k], cx: +P['eye' + k].dataset.cx }));
  const tip = [0, 0];
  const pose = { ...DEF };
  let gen = 0;

  const leg = (i, side, hip, knee, toe, hy) => {
    const ink = P[i ? 'liB' : 'liA'], path = P[i ? 'legB' : 'legA'], cr = P[i ? 'crB' : 'crA'];
    const hx = side * 9.5;
    const [kx, ky] = vec(hip, LEG1 * pose.thigh), [ax, ay] = vec(hip + knee, LEG2);
    const K = [hx + kx, hy + ky], A = [K[0] + ax, K[1] + ay];
    const [ux, uy] = vec(hip + knee, 1), [px, py] = [-uy, ux];
    // штанина кончается над кедом, чтобы круглый торец не вылезал из-под подошвы
    const d = `M${f(hx)} ${f(hy)}L${f(K[0])} ${f(K[1])}L${f(A[0] - ux * 7)} ${f(A[1] - uy * 7)}`;
    ink.setAttribute('d', d); path.setAttribute('d', d);
    // складка у колена — щепка поперёк штанины
    const c0 = [K[0] + px * 5.5 - ux, K[1] + py * 5.5 - uy], c2 = [K[0] - px * 5.5 - ux, K[1] - py * 5.5 - uy];
    const m = [K[0] + ux * 2.4, K[1] + uy * 2.4], nx = -(c2[1] - c0[1]) / 11 * 1.7, ny = (c2[0] - c0[0]) / 11 * 1.7;
    cr.setAttribute('d', `M${f(c0[0])} ${f(c0[1])}Q${f(m[0] + nx)} ${f(m[1] + ny)} ${f(c2[0])} ${f(c2[1])}Q${f(m[0] - nx)} ${f(m[1] - ny)} ${f(c0[0])} ${f(c0[1])}Z`);
    // подвёрнутый низ брючины
    const seg = (a, b) => `M${f(A[0] - ux * a)} ${f(A[1] - uy * a)}L${f(A[0] - ux * b)} ${f(A[1] - uy * b)}`;
    hems[i][0].setAttribute('d', seg(15.4, 4.6));
    hems[i][1].setAttribute('d', seg(14, 6));
    const mx = A[0] - ux * 10, my = A[1] - uy * 10;
    hems[i][2].setAttribute('d', `M${f(mx + px * 7)} ${f(my + py * 7)}L${f(mx - px * 7)} ${f(my - py * 7)}`);
    // кед: в профиль, если идёт, анфас — если стоит или сидит
    const prof = Math.abs(toe) > .3, s = shoes[i];
    s.prof.style.display = prof ? '' : 'none';
    s.front.style.display = prof ? 'none' : '';
    s.g.setAttribute('transform', `translate(${f(A[0])} ${f(A[1])})${prof && toe < 0 ? ' scale(-1 1)' : ''}`);
  };
  const arm = (a, side, s, e) => {
    const sx = side * SHX, sy = SHY;
    const [ex, ey] = vec(s, ARM1), [wx, wy] = vec(s + e, ARM2);
    const E = [sx + ex, sy + ey], Wr = [E[0] + wx, E[1] + wy];
    const d = `M${f(sx)} ${f(sy)}L${f(E[0])} ${f(E[1])}L${f(Wr[0])} ${f(Wr[1])}`;
    a.ink.setAttribute('d', d); a.skin.setAttribute('d', d);
    // кисть: поворот по предплечью; большой палец — к середине тела (зеркалим, когда рука поднята)
    const fa = s + e, c = Math.cos(fa * R), mx = -side * (c >= 0 ? 1 : -1);
    const tf = `translate(${f(Wr[0])} ${f(Wr[1])}) rotate(${f(-fa)}) scale(${mx} 1)`;
    a.hi.setAttribute('transform', tf); a.hf.setAttribute('transform', tf);
    // рукав футболки: начинается внутри торса, срез прямой, с чернильной линией
    const [ux, uy] = vec(s, 1), bx = sx - ux * 6, by = sy - uy * 6, cx = sx + ux * 12, cy = sy + uy * 12;
    const sl = `M${f(bx)} ${f(by)}L${f(cx)} ${f(cy)}`;
    a.so.setAttribute('d', sl); a.sleeve.setAttribute('d', sl);
    a.cuff.setAttribute('d', `M${f(cx - uy * 9.6)} ${f(cy + ux * 9.6)}L${f(cx + uy * 9.6)} ${f(cy - ux * 9.6)}`);
    const [tx, ty] = vec(fa, 15);
    tip[0] = Wr[0] + tx; tip[1] = Wr[1] + ty;
  };

  const render = () => {
    const p = pose;
    const hy = -HIP + p.bob + p.sit * (HIP - SEAT);
    P.root.setAttribute('transform', `translate(${f(p.x)} ${f(p.y)})`);
    leg(0, -1, p.hipA, p.kneeA, p.toeA, hy);
    leg(1, 1, p.hipB, p.kneeB, p.toeB, hy);
    P.waist.setAttribute('y', f(hy - 9)); P.waistI.setAttribute('y', f(hy - 9));
    P.torso.setAttribute('transform', `translate(0 ${f(hy)}) rotate(${f(p.lean)})`);
    P.head.setAttribute('transform', `translate(0 ${NECK}) rotate(${f(p.head)})`);
    P.feat.setAttribute('transform', `translate(${f(p.turn * 4)} 0)`);
    const sy = Math.max(.08, 1 - p.blink);
    for (const e of eyes) {
      e.g.setAttribute('transform', `translate(0 -24) scale(1 ${f(sy * 100) / 100}) translate(0 24)`);
      e.pup.setAttribute('transform', `translate(${f(p.lx * 1.2)} ${f(p.ly * 1.1)})`);
    }
    P.brows.setAttribute('transform', `translate(0 ${f(-p.brow * 2.8)})`);
    const m = Math.round(p.mouth);
    P.m0.style.display = m === 0 ? '' : 'none';
    P.m1.style.display = m === 1 ? '' : 'none';
    P.m2.style.display = m === 2 ? '' : 'none';
    arm(arms[0], -1, p.sA, p.eA); arm(arms[1], 1, p.sB, p.eB);
    P.spark.style.display = p.spark > .01 ? '' : 'none';
    P.spark.style.opacity = f(p.spark);
    P.spark.setAttribute('transform', `translate(${f(tip[0])} ${f(tip[1])})`);
    P.laptop.style.display = p.lap > .01 ? '' : 'none';
    P.laptop.style.opacity = f(p.lap);
    P.laptop.setAttribute('transform', `translate(${f(p.lapX)} ${f(p.lapY)}) rotate(${f(p.lapR)})`);
    P.think.style.display = p.think > .01 ? '' : 'none';
    P.think.style.opacity = f(p.think);
    P.think.setAttribute('transform', `translate(${f(p.side * 40)} ${f(hy - 150)}) scale(${p.side < 0 ? -1 : 1} 1)`);
    ['d1', 'd2', 'd3'].forEach((k, i) => { P[k].style.opacity = f(clamp(p.dots - i, 0, 1)); });
  };

  const rig = {
    svg, pose, hit: P.hit,
    get gen() { return gen; },
    set(p) { Object.assign(pose, p); render(); return rig; },
    cancel() { gen++; return rig; },
    to(target, ms, fn = ease.io) {
      const my = gen;
      if (reduce || ms <= 0) { rig.set(target); return Promise.resolve(true); }
      const from = {};
      for (const k in target) from[k] = pose[k];
      return new Promise(res => {
        const t0 = performance.now();
        const step = now => {
          if (my !== gen) return res(false);
          const t = Math.min(1, (now - t0) / ms), k = fn(t), p = {};
          for (const key in target) {
            const a = from[key], b = target[key];
            p[key] = typeof b === 'number' && typeof a === 'number' ? a + (b - a) * k : (t >= .5 ? b : a);
          }
          rig.set(p);
          t < 1 ? requestAnimationFrame(step) : res(true);
        };
        requestAnimationFrame(step);
      });
    },
    wait(ms) { const my = gen; return new Promise(res => setTimeout(() => res(my === gen), reduce ? 0 : ms)); },
  };
  render();
  return rig;
}

/* сцена: svg во весь элемент; 1 единица рига = scale px;
   низ элемента — это y = bottom в единицах рига, x = 0 — по центру или слева */
function stage(el, opt) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'sa');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  el.appendChild(svg);
  const r = makeRig(svg);
  r.fit = () => {
    const W = el.clientWidth, H = el.clientHeight, sc = opt.scale();
    const by = typeof opt.bottom === 'function' ? opt.bottom(sc) : opt.bottom;
    const ox = opt.originX === 'center' ? W / 2 : 0;
    svg.setAttribute('viewBox', `${f(-ox / sc)} ${f(by - H / sc)} ${f(W / sc)} ${f(H / sc)}`);
    r.sc = sc; r.W = W / sc;
  };
  r.fit();
  addEventListener('resize', r.fit);
  STAGES.push(r);
  return r;
}
const STAGES = [];

/* =========================================================
   Сцены
   ========================================================= */

/* 1. Выглядывает из-за края. Край — y = EDGE (низ сцены): руки лежат на нём на уровне плеч. */
const EDGE = -(HIP + 60);
const HEAD_ABOVE_EDGE = H_TOP + EDGE; // сколько единиц макушка выше края в позе «встал»
const P_HIDE = { y: HEAD_ABOVE_EDGE + 8, head: 0, turn: 0, lx: 0, ly: 0, brow: 0, mouth: 0, blink: 0, lap: 0, think: 0, spark: 0, ...handA(-26, -12, 'down'), ...handB(26, -12, 'down') };
const P_EYES = { y: 30, head: -6, brow: .7 };
const P_UP = { y: 0, head: 0, lx: 0, ly: 0, brow: .9, mouth: 1, ...handA(-30, EDGE + HIP, 'down'), ...handB(30, EDGE + HIP, 'down') };
const P_WAVE = { sB: 122, eB: 38, mouth: 2, head: 4, brow: 1 };

async function wave(r, times = 3) {
  if (!await r.to({ ...P_WAVE, spark: 1 }, 240, ease.out)) return false;
  for (let i = 0; i < times; i++) {
    if (!await r.to({ eB: 60 }, 170, ease.sine)) return false;
    if (!await r.to({ eB: 20 }, 170, ease.sine)) return false;
  }
  return r.to({ eB: 38, spark: 0 }, 160, ease.sine);
}
const blink = async r => (await r.to({ blink: 1 }, 60)) && r.to({ blink: 0 }, 90);

async function greet(r, say) {
  r.cancel().set({ ...DEF, ...P_HIDE });
  const show = on => say && say.classList.toggle('on', on);
  try {
    if (!await r.to({ ...P_EYES, lx: -1.8 }, 560, ease.out)) return;
    if (!await r.wait(260)) return;
    if (!await blink(r)) return;
    if (!await r.to({ lx: 1.8 }, 240, ease.io)) return;
    if (!await r.wait(240)) return;
    if (!await r.to(P_UP, 480, ease.back)) return;
    show(true);
    if (!await wave(r, 3)) return;
    if (!await r.to({ mouth: 1, head: 2 }, 200)) return;
    if (!await r.wait(1600)) return;
    show(false);
    if (!await r.to({ ...handB(30, EDGE + HIP, 'down'), head: 0 }, 300, ease.io)) return;
    if (!await r.wait(160)) return;
    await r.to(P_HIDE, 360, ease.in);
  } finally { show(false); }
}
async function peekHi(r) {
  r.cancel();
  if (!await r.to(P_UP, 380, ease.back)) return;
  if (!await wave(r, 1)) return;
  await r.to({ ...handB(30, EDGE + HIP, 'down'), mouth: 1, head: 0, spark: 0 }, 260, ease.io);
}
const duck = r => r.cancel().to(P_HIDE, 320, ease.in);

/* 2. Ходит с ноутбуком и думает */
const STAND = { hipA: -2, kneeA: 0, hipB: 2, kneeB: 0, bob: 0, toeA: 0, toeB: 0, sit: 0, thigh: 1 };
const READ = F => ({
  lap: 1, lapX: 0, lapY: -14, lapR: 0, ...handA(-28, -12, 'out'), ...handB(28, -12, 'out'),
  head: 0, turn: .6 * F, lx: .8 * F, ly: 1.7, brow: 0, mouth: 0, side: F,
});
const STRIDE = 4 * (LEG1 + LEG2) * Math.sin(22 * R); // путь за цикл из двух шагов

function walkTo(r, x1, period = 860) {
  const x0 = r.pose.x, F = Math.sign(x1 - x0) || 1, dist = Math.abs(x1 - x0);
  const cycles = Math.max(1, Math.round(dist / STRIDE)), T = cycles * period, my = r.gen;
  if (reduce) { r.set({ x: x1, ...STAND }); return Promise.resolve(true); }
  return new Promise(res => {
    const t0 = performance.now();
    const step = now => {
      if (my !== r.gen) return res(false);
      const t = Math.min(1, (now - t0) / T), th = t * cycles * 2 * Math.PI;
      const s = Math.sin(th), c = Math.cos(th);
      const amp = Math.min(1, t * cycles * 3, (1 - t) * cycles * 3);
      r.set({
        x: x0 + (x1 - x0) * t,
        hipA: F * 22 * s * amp, kneeA: -F * 38 * Math.max(0, c) * amp,
        hipB: -F * 22 * s * amp, kneeB: -F * 38 * Math.max(0, -c) * amp,
        bob: -2.4 * Math.cos(2 * th) * amp, toeA: F, toeB: F,
      });
      t < 1 ? requestAnimationFrame(step) : res(true);
    };
    requestAnimationFrame(step);
  });
}
async function thinking(r, isOn) {
  if (!await r.wait(500) || !isOn()) return;
  if (!await r.to({ think: 1, dots: 0 }, 240) || !isOn()) return;
  for (let i = 1; i <= 3; i++) {
    if (!await r.to({ dots: i }, 180) || !isOn()) return;
    if (!await r.wait(240) || !isOn()) return;
  }
}
async function stroll(r, x1) {
  r.cancel();
  const F = Math.sign(x1 - r.pose.x) || 1;
  r.set({ ...STAND, ...READ(F), think: 0, dots: 0 });
  let on = true;
  thinking(r, () => on);
  const ok = await walkTo(r, x1);
  on = false;
  if (!ok) return false;
  return r.to({ ...STAND, turn: .3 * F, think: 0, dots: 0 }, 300, ease.out);
}

/* 3. Сидит по-турецки на линии, ноутбук на коленях */
const SQUAT = { sit: (HIP - (.707 * LEG1 + .607 * LEG2 + FOOT)) / (HIP - SEAT), thigh: 1, hipA: -45, kneeA: 97.6, hipB: 45, kneeB: -97.6, toeA: 0, toeB: 0, bob: 0 };
const SIT = {
  ...STAND, sit: 1, thigh: .86, hipA: -76, kneeA: 172, hipB: 76, kneeB: -172,
  lap: 1, lapX: 0, lapY: 0, lapR: 0,
  ...handA(-4, -52, 'down'), ...handB(28, -26, 'out'),
  head: -7, turn: -.2, lx: 1.6, ly: -1.8, brow: .5, mouth: 0, think: 0, dots: 0, spark: 0,
};
async function arrive(r, x1) {
  r.cancel();
  if (reduce) { r.set({ ...SIT, x: x1 }); return true; }
  const F = Math.sign(x1 - r.pose.x) || -1;
  r.set({ ...STAND, ...READ(F), think: 0, dots: 0 });
  let on = true;
  thinking(r, () => on);
  const ok = await walkTo(r, x1);
  on = false;
  if (!ok) return false;
  if (!await r.to({ ...STAND, turn: 0, think: 0, dots: 0 }, 260, ease.out)) return false;
  if (!await r.to(SQUAT, 300, ease.io)) return false;
  if (!await r.to(SIT, 560, ease.out)) return false;
  if (!await r.wait(500)) return false;
  return blink(r);
}
async function sitHi(r) {
  r.cancel();
  if (!await r.to({ head: 2, turn: 0, lx: 0, ly: 0, brow: 1, mouth: 1 }, 220, ease.out)) return;
  if (!await wave(r, 2)) return;
  await r.to({ ...handB(28, -26, 'out'), mouth: 1, head: 0, spark: 0 }, 320, ease.io);
}
const sitBack = r => r.cancel().to(SIT, 420, ease.io);

window.Sasha = {
  stage, ease, reduce, fine, EDGE, HEAD_ABOVE_EDGE, DEF,
  poses: { P_HIDE, P_EYES, P_UP, P_WAVE, STAND, READ, SQUAT, SIT },
  scenes: { greet, peekHi, duck, wave, blink, walkTo, stroll, arrive, sitHi, sitBack },
  rigs: {}, // риги сцен на странице — для отладки из консоли
};

/* =========================================================
   На сайте. Всё своё создаёт сам: стили, сцену у тулбара,
   сцену на линии подвала. В HTML — только подключение скрипта.
   ========================================================= */
const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('sasha.css', SRC).href;
css.addEventListener('load', () => STAGES.forEach(r => r.fit()));
document.head.appendChild(css);

const firstTime = key => {
  try { if (sessionStorage.getItem(key) === '1') return false; sessionStorage.setItem(key, '1'); } catch (e) {}
  return true;
};
const force = /[?&]hi\b/.test(location.search);
const mk = (cls, parent, before) => {
  const el = document.createElement('div');
  el.className = cls; el.setAttribute('aria-hidden', 'true');
  before ? parent.insertBefore(el, before) : parent.appendChild(el);
  return el;
};

/* Курсор-соавтор на первом экране (main.js) тоже показывается один раз.
   Чтобы не двигались две вещи сразу, Саша ждёт, пока курсор закончит. */
const afterCoauthor = () => new Promise(res => {
  const co = document.querySelector('.coauthor');
  let seen = false;
  try { seen = sessionStorage.getItem('intro') === '1'; } catch (e) {}
  const desktop = fine && matchMedia('(min-width: 901px)').matches;
  if (!co || seen || !desktop) return res();
  let shown = false;
  const done = () => { mo.disconnect(); clearTimeout(t1); clearTimeout(t2); res(); };
  const mo = new MutationObserver(() => {
    if (co.classList.contains('on')) shown = true;
    else if (shown) setTimeout(done, 500);
  });
  mo.observe(co, { attributes: true, attributeFilter: ['class'] });
  const t1 = setTimeout(() => { if (!shown) done(); }, 2600); // курсор так и не появился
  const t2 = setTimeout(done, 14000);
});

/* 1. Привет из-за тулбара: Саша выглядывает над иконкой-курсором */
let hello = Promise.resolve();
const anchor = document.querySelector('.toolbar .mono-mark');
const bar = anchor && anchor.closest('.toolbar');
if (anchor && bar) {
  const peekEl = mk('sasha-peek', document.body);
  Object.assign(peekEl.style, { position: 'fixed', width: '220px', height: '190px' });
  const say = mk('sa-say', document.body);
  say.textContent = 'Привет! Я Саша';
  const sc = () => innerWidth < 600 ? .48 : .58;
  const r = stage(peekEl, { scale: sc, bottom: EDGE, originX: 'center' });
  r.set(P_HIDE);
  window.Sasha.rigs.peek = r; window.Sasha.say = say;
  const place = () => {
    const a = anchor.getBoundingClientRect(), t = bar.getBoundingClientRect();
    const cx = a.left + a.width / 2;
    peekEl.style.left = f(cx - peekEl.offsetWidth / 2) + 'px';
    peekEl.style.top = f(t.top - peekEl.offsetHeight) + 'px';
    say.style.left = f(cx + 6) + 'px';
    say.style.top = f(t.top - HEAD_ABOVE_EDGE * sc() - 8) + 'px';
  };
  addEventListener('resize', place);
  bar.addEventListener('scroll', place, { passive: true });
  css.addEventListener('load', place);
  place();

  if (!reduce && (force || firstTime('sasha-hi'))) {
    hello = Promise.all([afterCoauthor(), new Promise(res => setTimeout(res, 1000))])
      .then(() => { place(); return greet(r, say); });
  }
  const up = () => { place(); say.classList.remove('on'); peekHi(r); };
  const down = () => { say.classList.remove('on'); duck(r); };
  if (fine) { anchor.addEventListener('mouseenter', up); anchor.addEventListener('mouseleave', down); }
  anchor.addEventListener('focus', up);
  anchor.addEventListener('blur', down);
}
window.sashaHello = hello;

/* 2. Подвал: приходит с ноутбуком и садится на линию подумать */
const foot = document.querySelector('body > footer');
if (foot) {
  const deskEl = mk('sasha-desk', foot, foot.firstChild);
  if (getComputedStyle(foot).position === 'static') foot.style.position = 'relative';
  Object.assign(deskEl.style, { position: 'absolute', left: '0', right: '0', top: '-200px', height: '210px' });
  const BELOW = 10; // сцена заходит под линию на 10px (см. sasha.css)
  const sc = () => innerWidth < 600 ? .42 : .56;
  const r = stage(deskEl, { scale: sc, bottom: s => BELOW / s, originX: 0 });
  window.Sasha.rigs.desk = r;
  const spot = () => {
    const W = deskEl.clientWidth;
    return (innerWidth < 600 ? W - 48 : Math.min(W - 180, W * .76)) / r.sc;
  };
  let state = 'away';
  r.set({ ...DEF, x: r.W + 120 });
  const start = async () => {
    state = 'walk';
    r.set({ x: r.W + 60 });
    if (await arrive(r, spot())) state = 'sit';
  };
  if (reduce) { r.set({ ...SIT, x: spot() }); state = 'sit'; }
  else {
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(foot);
  }
  addEventListener('resize', () => { if (state === 'sit') r.set({ x: spot() }); });
  r.hit.addEventListener('pointerenter', () => { if (state === 'sit' && fine) sitHi(r); });
  r.hit.addEventListener('pointerleave', () => { if (state === 'sit' && fine) sitBack(r); });
  r.hit.addEventListener('click', async () => {
    if (state !== 'sit' || fine) return;
    await sitHi(r);
    if (await r.wait(900)) sitBack(r);
  });
}
})();

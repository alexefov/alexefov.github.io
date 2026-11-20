/* Общий скрипт прототипов: шрифт заголовков и тема.
   Шрифт выбирается через ?head=<ключ> или запоминается в localStorage. */
(() => {
  const FONTS = {
    lora:      { name: 'Lora',               q: 'Lora:wght@400;500' },
    literata:  { name: 'Literata',           q: 'Literata:opsz,wght@7..72,400;7..72,500' },
    ptserif:   { name: 'PT Serif',           q: 'PT+Serif:wght@400;700' },
    spectral:  { name: 'Spectral',           q: 'Spectral:wght@400;500' },
    source:    { name: 'Source Serif 4',     q: 'Source+Serif+4:opsz,wght@8..60,400;8..60,500' },
    playfair:  { name: 'Playfair Display',   q: 'Playfair+Display:wght@400;500' },
    cormorant: { name: 'Cormorant Garamond', q: 'Cormorant+Garamond:wght@400;500' },
    prata:     { name: 'Prata',              q: 'Prata' },
    noto:      { name: 'Noto Serif Display', q: 'Noto+Serif+Display:wght@400;500' },
    onest:     { name: 'Onest',              q: null }
  };
  window.GARDEN_FONTS = FONTS;
  const root = document.documentElement;
  const loaded = new Set();
  const load = k => {
    const f = FONTS[k];
    if (!f || !f.q || loaded.has(k)) return;
    loaded.add(k);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${f.q}&display=swap`;
    document.head.appendChild(l);
  };
  window.gardenLoadFont = load;

  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  const applyHead = k => {
    if (!FONTS[k]) k = 'lora';
    load(k);
    root.style.setProperty('--head', `"${FONTS[k].name}",Georgia,serif`);
    if (k === 'onest') root.dataset.head = 'onest'; else delete root.dataset.head;
    set('lab-head', k);
    const sel = document.querySelector('.tune select');
    if (sel) sel.value = k;
  };
  const q = new URLSearchParams(location.search).get('head');
  applyHead(q || get('lab-head') || 'lora');

  /* Панель прототипа, если она есть на странице */
  const tune = document.querySelector('.tune');
  if (!tune) return;
  const sel = tune.querySelector('select');
  if (sel) {
    sel.innerHTML = Object.entries(FONTS).map(([k, f]) => `<option value="${k}">${f.name}</option>`).join('');
    sel.value = get('lab-head') || 'lora';
    sel.addEventListener('change', () => applyHead(sel.value));
  }
  const syncTheme = () => tune.querySelectorAll('[data-theme-v]').forEach(b =>
    b.setAttribute('aria-pressed', String((root.dataset.theme || '') === b.dataset.themeV)));
  tune.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('tune-t')) {
      const on = tune.classList.toggle('on');
      b.setAttribute('aria-expanded', String(on));
      return;
    }
    if (b.dataset.themeV !== undefined) {
      root.dataset.theme = b.dataset.themeV;
      set('theme', b.dataset.themeV);
      syncTheme();
    }
  });
  syncTheme();
})();

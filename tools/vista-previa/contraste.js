/**
 * Contraste de verdad de cada texto de la vista previa contra el fondo que tiene detrás (docs/modo-oscuro.md).
 *
 *   node tools/vista-previa/contraste.js                     (todas las escenas, en oscuro)
 *   node tools/vista-previa/contraste.js vehiculos lineas    (algunas)
 *   opciones:  --claro        en modo claro
 *              --todos        lista cada caso (sin él, los 40 peores grupos)
 *              --json=ruta    guarda el detalle
 *
 * Cada texto visible se mide con APCA (Lc, el método propuesto para WCAG 3, que sí distingue texto claro sobre
 * oscuro) y con la razón de WCAG 2. El fondo es el que queda al encimar los fondos de sus contenedores (con su
 * transparencia); un texto sobre una imagen o un degradado no se mide. Mínimos (Lc, según tamaño y grosor):
 *   texto de lectura y datos   60     texto de 24px+, o 16px+ en negrita   45
 *   lo deshabilitado y los placeholders no cuentan (no tienen que leerse igual).
 * Termina con error si algún texto queda debajo de su mínimo.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { construir } = require('./construir');

const NAVEGADORES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const args = process.argv.slice(2);
const opcion = (n, d) => { const a = args.find((x) => x === '--' + n || x.startsWith('--' + n + '=')); return !a ? d : a.includes('=') ? a.split('=')[1] : true; };
let escenas = args.filter((a) => !a.startsWith('--'));
const claro = !!opcion('claro', false);
const todos = !!opcion('todos', false);
const json = opcion('json', '');

/** Corre dentro de la página: cada texto visible con su color, su fondo efectivo y su Lc */
function medirContraste() {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const sobre = (arriba, abajo) => ({
    r: arriba.r * arriba.a + abajo.r * (1 - arriba.a),
    g: arriba.g * arriba.a + abajo.g * (1 - arriba.a),
    b: arriba.b * arriba.a + abajo.b * (1 - arriba.a), a: 1,
  });
  // APCA 0.0.98G-4g (base de W3 Silver)
  const Y = (c) => {
    const f = (v) => Math.pow(v / 255, 2.4);
    const y = 0.2126729 * f(c.r) + 0.7151522 * f(c.g) + 0.0721750 * f(c.b);
    return y < 0.022 ? y + Math.pow(0.022 - y, 1.414) : y;
  };
  const apca = (t, f) => {
    const yt = Y(t), yf = Y(f);
    if (Math.abs(yf - yt) < 0.0005) return 0;
    if (yf > yt) { const c = (Math.pow(yf, 0.56) - Math.pow(yt, 0.57)) * 1.14; return c < 0.1 ? 0 : (c - 0.027) * 100; }
    const c = (Math.pow(yf, 0.65) - Math.pow(yt, 0.62)) * 1.14; return c > -0.1 ? 0 : -(c + 0.027) * 100;
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const wcag = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  // El fondo que queda detrás de un elemento: sus fondos y los de sus contenedores, encimados
  const fondoDe = (el) => {
    const capas = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      // Una imagen o un degradado detrás (antes de llegar a un fondo sólido): no se puede medir
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !(c && c.a >= 1)) return null;
      if (c && c.a > 0) { capas.push(c); if (c.a >= 1) break; }
    }
    let f = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = capas.length - 1; i >= 0; i--) f = sobre(capas[i], f);
    return f;
  };
  const opacidad = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const describir = (el) => {
    const partes = [];
    for (let e = el; e && partes.length < 3 && e.id !== 'view-container'; e = e.parentElement) {
      const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter((c) => c && !/^(ico|lucide)/.test(c)).slice(0, 2) : [];
      partes.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (cls.length ? '.' + cls.join('.') : ''));
    }
    return partes.join(' > ');
  };

  const salida = [];
  const vistos = new Set();
  const caminar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = caminar.nextNode(); n; n = caminar.nextNode()) {
    const texto = n.textContent.trim();
    const el = n.parentElement;
    if (!texto || !el || vistos.has(el) || el.closest('script, style, svg, [hidden], [aria-hidden="true"], #sidebar, .dm-escena')) continue;
    vistos.add(el);
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight * 3) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest(':disabled, [disabled], [aria-disabled="true"], .deshabilitado')) continue;
    const color = parse(cs.color);
    const fondo = fondoDe(el);
    if (!color || !fondo) continue;
    const o = opacidad(el) * color.a;
    if (o < 0.05) continue;   // escondido a propósito (p. ej. el filtro por tipo recogido)
    const visto = sobre({ ...color, a: o }, fondo);
    const lc = Math.abs(apca(visto, fondo));
    const tam = parseFloat(cs.fontSize);
    const grueso = Number(cs.fontWeight) >= 600;
    const minimo = tam >= 24 || (tam >= 16 && grueso) ? 45 : 60;
    salida.push({
      donde: describir(el), texto: texto.slice(0, 40), color: hex(visto), fondo: hex(fondo),
      lc: Math.round(lc * 10) / 10, wcag: Math.round(wcag(visto, fondo) * 100) / 100, tam, minimo, ok: lc >= minimo,
    });
  }
  return salida;
}

(async () => {
  const navegador = NAVEGADORES.find((n) => fs.existsSync(n));
  if (!navegador) throw new Error('No encontré Chrome ni Edge instalados');
  const pagina = construir();
  const browser = await puppeteer.launch({ executablePath: navegador, headless: 'new', args: ['--allow-file-access-from-files'] });
  const fallas = [];
  let medidos = 0;
  try {
    if (!escenas.length || escenas[0] === 'todas') {
      const p = await browser.newPage();
      await p.goto('file:///' + pagina.replace(/\\/g, '/'));
      escenas = await p.evaluate(() => window.__ESCENAS);
      await p.close();
    }
    for (const escena of escenas) {
      const p = await browser.newPage();
      await p.setViewport({ width: 1500, height: 1000 });
      await p.goto('file:///' + pagina.replace(/\\/g, '/') + '#escena=' + escena + (claro ? '' : '&tema=oscuro'));
      try {
        await p.waitForFunction(() => document.title === 'LISTO', { timeout: 30000 });
      } catch (e) { console.log('  ? ' + escena + ': no terminó de cargar'); await p.close(); continue; }
      await new Promise((r) => setTimeout(r, 600));   // transiciones de color (.35s)
      const r = await p.evaluate(medirContraste);
      medidos += r.length;
      const malos = r.filter((x) => !x.ok);
      malos.forEach((m) => fallas.push({ escena, ...m }));
      console.log((malos.length ? '  ✘ ' : '  ✔ ') + escena + ': ' + r.length + ' textos' + (malos.length ? ', ' + malos.length + ' bajo el mínimo' : ''));
      await p.close();
    }
  } finally {
    await browser.close();
  }
  // Agrupados por dónde + colores: el mismo problema en 30 renglones de una tabla es uno solo
  const grupos = new Map();
  fallas.forEach((f) => {
    const clave = f.donde.replace(/#[\w-]+/g, '') + ' | ' + f.color + ' sobre ' + f.fondo;
    const g = grupos.get(clave) || { clave, lc: f.lc, wcag: f.wcag, minimo: f.minimo, ejemplo: f.texto, escenas: new Set(), veces: 0 };
    g.veces++; g.escenas.add(f.escena); grupos.set(clave, g);
  });
  const lista = [...grupos.values()].sort((a, b) => a.lc - b.lc);
  (todos ? lista : lista.slice(0, 40)).forEach((g) => {
    console.log(`\nLc ${g.lc} (mín ${g.minimo}, WCAG ${g.wcag}:1) ×${g.veces}  «${g.ejemplo}»\n   ${g.clave}\n   en: ${[...g.escenas].slice(0, 6).join(', ')}`);
  });
  if (json) fs.writeFileSync(json, JSON.stringify(fallas, null, 2));
  console.log(`\n${medidos} textos medidos en ${escenas.length} escenas (${claro ? 'claro' : 'oscuro'}): ${fallas.length} bajo el mínimo, ${lista.length} grupos`);
  if (fallas.length) process.exitCode = 1;
})().catch((e) => { console.error(e.message); process.exit(1); });

/**
 * Capturas de pantalla de escenas de la vista previa, con el Chrome (o Edge) instalado.
 *
 *   node tools/vista-previa/capturar.js inspecciones-firmas
 *   node tools/vista-previa/capturar.js sensores-form hologramas-form        (varias)
 *   node tools/vista-previa/capturar.js todas                                (todas las escenas)
 *   opciones:  --ancho=390 --alto=844 (celular)   --oscuro   --completa (toda la vista, con scroll)
 *              --tactil       simula pantalla de dedo (pointer: coarse); sale solo con --ancho ≤ 1024
 *              --matriz       cada escena en celular (390×844), tableta vertical (768×1024) y
 *                             tableta horizontal (1024×768), las tres táctiles
 *              --revisar      además de la captura, dice si algo se sale de lo ancho de la
 *                             pantalla (la página se puede deslizar de lado) y qué elemento es.
 *                             Termina con error si alguna escena se sale.
 *              --carpeta=antes  guarda en salida/antes/ (para comparar antes y después de un cambio)
 *
 * Deja los PNG en tools/vista-previa/salida/. Usa puppeteer-core: maneja el navegador que
 * ya está instalado, no descarga otro.
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
const opcion = (nombre, defecto) => {
  const a = args.find((x) => x === '--' + nombre || x.startsWith('--' + nombre + '='));
  if (!a) return defecto;
  return a.includes('=') ? a.split('=')[1] : true;
};
let escenas = args.filter((a) => !a.startsWith('--'));
const oscuro = !!opcion('oscuro', false);
const completa = !!opcion('completa', false);
const revisar = !!opcion('revisar', false);
const carpeta = opcion('carpeta', '');

// Los mismos cortes que src/html/js/componentes/pantalla.html
const MATRIZ = [
  { ancho: 390, alto: 844, tactil: true },
  { ancho: 768, alto: 1024, tactil: true },
  { ancho: 1024, alto: 768, tactil: true },
];
const pantallas = opcion('matriz', false) ? MATRIZ : [(() => {
  const ancho = Number(opcion('ancho', 1500));
  return { ancho, alto: Number(opcion('alto', 1000)), tactil: !!opcion('tactil', false) || ancho <= 1024 };
})()];

/**
 * Corre dentro de la página: ¿algo hace que la vista se deslice de lado?
 * Dos casos:
 *  1. Algo se sale de lo ancho de la pantalla (la página entera se mueve de lado).
 *  2. Una caja que no está pensada para deslizarse de lado (un formulario, el cuerpo de una
 *     ventana) trae contenido más ancho que ella: se corta o se desliza dentro de la caja.
 * Lo que SÍ se desliza de lado a propósito no cuenta: la tabla (.dt-scroll, .table-scroll), las
 * franjas de KPIs, las pestañas, o cualquier caja marcada con data-scroll-x.
 * De cada grupo que se sale solo se reporta el de más afuera.
 */
function medirDesborde() {
  const INTENCIONAL = '.dt-scroll, .table-scroll, .stat-row, .kpi-chips, .tabs-simple, .form-pasos, [data-scroll-x]';
  const vw = document.documentElement.clientWidth;
  const vc = document.getElementById('view-container');
  const esquema = new Set([document.documentElement, document.body, document.getElementById('app'), document.getElementById('main'), vc]);
  const recorta = (el) => !esquema.has(el) && /(auto|scroll|hidden|clip)/.test(getComputedStyle(el).overflowX);
  const describir = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const fuera = [];
  // 2. Cajas que se deslizan de lado sin querer (fuera del menú lateral, que recorta a propósito)
  for (const caja of document.querySelectorAll('#view-container *, body > .modal-backdrop *')) {
    if (caja.scrollWidth <= caja.clientWidth + 1 || !/(auto|scroll)/.test(getComputedStyle(caja).overflowX)) continue;
    if (!caja.getClientRects().length || caja.matches(INTENCIONAL) || caja.closest('[data-scroll-x]')) continue;
    if (fuera.some((f) => f.el.contains(caja))) continue;
    fuera.push({ el: caja, texto: describir(caja) + ' (se desliza de lado: ' + caja.scrollWidth + 'px en ' + caja.clientWidth + 'px)' });
  }
  for (const el of document.querySelectorAll('#app-shell *, body > .modal-backdrop *, body > .modal-backdrop')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= vw + 1) continue;
    let p = el.parentElement;
    let recortado = false;
    while (p && p !== document.body) { if (recorta(p)) { recortado = true; break; } p = p.parentElement; }
    if (recortado || fuera.some((f) => f.el.contains(el))) continue;
    fuera.push({ el, texto: describir(el) + ' (llega a ' + Math.round(r.right) + 'px)' });
  }
  return {
    vw,
    pagina: document.documentElement.scrollWidth > vw + 1,
    vista: !!vc && vc.scrollWidth > vc.clientWidth + 1,
    fuera: fuera.slice(0, 6).map((f) => f.texto),
  };
}

(async () => {
  const navegador = NAVEGADORES.find((n) => fs.existsSync(n));
  if (!navegador) throw new Error('No encontré Chrome ni Edge instalados');
  const pagina = construir();
  const destinoDir = carpeta ? path.join(path.dirname(pagina), carpeta) : path.dirname(pagina);
  fs.mkdirSync(destinoDir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: navegador, headless: 'new', args: ['--allow-file-access-from-files'] });
  const desbordes = [];
  try {
    if (!escenas.length || escenas[0] === 'todas') {
      const p = await browser.newPage();
      await p.goto('file:///' + pagina.replace(/\\/g, '/'));
      escenas = await p.evaluate(() => window.__ESCENAS);
      await p.close();
    }
    for (const pantalla of pantallas) {
      for (const escena of escenas) {
        const p = await browser.newPage();
        // isMobile + hasTouch: el navegador responde (pointer: coarse) como un celular de verdad
        await p.setViewport({ width: pantalla.ancho, height: pantalla.alto, isMobile: pantalla.tactil, hasTouch: pantalla.tactil });
        p.on('console', (m) => { if (m.type() === 'error') console.error(`  [${escena}] ${m.text()}`); });
        p.on('pageerror', (e) => console.error(`  [${escena}] ${e.message}`));
        await p.goto('file:///' + pagina.replace(/\\/g, '/') + '#escena=' + escena + (oscuro ? '&tema=oscuro' : ''));
        await p.waitForFunction(() => document.title === 'LISTO', { timeout: 30000 });
        await new Promise((r) => setTimeout(r, 400));   // animaciones de entrada
        if (revisar) {
          const r = await p.evaluate(medirDesborde);
          if (r.pagina || r.vista || r.fuera.length) {
            desbordes.push(escena + ' @' + pantalla.ancho);
            console.log(`  ✘ ${escena} @${pantalla.ancho}: se sale de lo ancho${r.fuera.length ? ' → ' + r.fuera.join(' · ') : ''}`);
          } else {
            console.log(`  ✔ ${escena} @${pantalla.ancho}`);
          }
        }
        if (completa) {
          // El contenido hace scroll dentro de #view-container: se estira para que salga todo
          // (#app y #main miden 100vh con overflow oculto: se sueltan para que crezcan)
          await p.evaluate(() => {
            ['app', 'main', 'view-container'].forEach((id) => {
              const el = document.getElementById(id);
              el.style.height = 'auto';
              el.style.overflow = 'visible';
            });
            document.getElementById('sidebar').style.height = 'auto';
          });
        }
        const sufijo = (pantalla.ancho !== 1500 ? '-' + pantalla.ancho : '') + (oscuro ? '-oscuro' : '') + (completa ? '-completa' : '');
        const destino = path.join(destinoDir, escena + sufijo + '.png');
        await p.screenshot({ path: destino, fullPage: completa });
        if (!revisar) console.log(destino);
        await p.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (revisar) {
    console.log(desbordes.length ? `\n${desbordes.length} escena(s) se salen de lo ancho` : '\nNinguna escena se sale de lo ancho');
    if (desbordes.length) process.exitCode = 1;
  }
})().catch((e) => { console.error(e.message); process.exit(1); });

/**
 * Capturas de pantalla de escenas de la vista previa, con el Chrome (o Edge) instalado.
 *
 *   node tools/vista-previa/capturar.js inspecciones-firmas
 *   node tools/vista-previa/capturar.js sensores-form hologramas-form        (varias)
 *   node tools/vista-previa/capturar.js todas                                (todas las escenas)
 *   opciones:  --ancho=390 --alto=844 (celular)   --oscuro   --completa (toda la vista, con scroll)
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
  const a = args.find((x) => x.startsWith('--' + nombre));
  if (!a) return defecto;
  return a.includes('=') ? a.split('=')[1] : true;
};
let escenas = args.filter((a) => !a.startsWith('--'));
const ancho = Number(opcion('ancho', 1500));
const alto = Number(opcion('alto', 1000));
const oscuro = !!opcion('oscuro', false);
const completa = !!opcion('completa', false);

(async () => {
  const navegador = NAVEGADORES.find((n) => fs.existsSync(n));
  if (!navegador) throw new Error('No encontré Chrome ni Edge instalados');
  const pagina = construir();
  const browser = await puppeteer.launch({ executablePath: navegador, headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    if (!escenas.length || escenas[0] === 'todas') {
      const p = await browser.newPage();
      await p.goto('file:///' + pagina.replace(/\\/g, '/'));
      escenas = await p.evaluate(() => window.__ESCENAS);
      await p.close();
    }
    for (const escena of escenas) {
      const p = await browser.newPage();
      await p.setViewport({ width: ancho, height: alto });
      p.on('console', (m) => { if (m.type() === 'error') console.error(`  [${escena}] ${m.text()}`); });
      p.on('pageerror', (e) => console.error(`  [${escena}] ${e.message}`));
      await p.goto('file:///' + pagina.replace(/\\/g, '/') + '#escena=' + escena + (oscuro ? '&tema=oscuro' : ''));
      await p.waitForFunction(() => document.title === 'LISTO', { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 400));   // animaciones de entrada
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
      const sufijo = (ancho !== 1500 ? '-' + ancho : '') + (oscuro ? '-oscuro' : '') + (completa ? '-completa' : '');
      const destino = path.join(path.dirname(pagina), escena + sufijo + '.png');
      await p.screenshot({ path: destino, fullPage: completa });
      console.log(destino);
      await p.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });

/**
 * tools/pdf/html/local.js — arma en esta máquina los PDF de un documento en HTML, sin subir nada a un DEV (10-nov-2026).
 *
 *   node tools/pdf/html/local.js responsiva-celular [r03]
 *   uv run … python tools/pdf/html/comparar.py responsiva-celular --local --imagenes
 *
 * El convertidor de Apps Script es Chromium (sus PDF dicen «Skia/PDF … Chromium»): aquí se llena la plantilla con el
 * mismo PdfHtml.llenar y el mismo adaptador del servicio (cargados en vm), con las tipografías y logos de
 * tools/pdf/.cache/recursos (las deja recursos.py), y Chrome la imprime a .cache/<documento>/H<caso>.pdf. Sirve para
 * calibrar rápido; lo que se da por bueno se confirma con pedir.js (el convertidor de verdad) antes de encenderlo.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const raiz = path.join(__dirname, '..', '..', '..');
const cache = path.join(raiz, 'tools', 'pdf', '.cache');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

// Lo poco de Apps Script que usan PdfHtml.llenar y los adaptadores
const Utilities = {
  base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
  formatDate: (d, zona, formato) => {
    const p = new Intl.DateTimeFormat('es-MX', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d).reduce((o, x) => Object.assign(o, { [x.type]: x.value }), {});
    return formato.replace('dd', p.day).replace('MM', p.month).replace('yyyy', p.year).replace(/^d$/, String(Number(p.day)));
  },
};
const ctx = vm.createContext({ Buffer, Utilities, console });
vm.runInContext(leer('src/utils/PdfHtml.gs') + '\nthis.PdfHtml = PdfHtml;', ctx);

// El adaptador de cada documento: el mismo del servicio (como ADAPTADORES de src/pruebas/PruebasPdfHtml.gs)
const ADAPTADORES = {
  'responsiva-celular': () => {
    vm.runInContext(leer('src/services/lineas/LineasUtil.gs') + '\n' + leer('src/services/lineas/LineasCaptura.gs') +
      '\nthis.LineasCaptura = LineasCaptura; this.LineasUtil = LineasUtil;', ctx);
    // Líneas lee la hoja con las abreviaturas de CH completas (LineasDatos: «QRO» → «QUERETARO»)
    return (d) => ctx.LineasCaptura.datosHtml(Object.keys(d).reduce((o, k) => { o[k] = ctx.LineasUtil.mostrarCH(k, d[k]); return o; }, {}));
  },
};

function recursos() {
  const dir = path.join(cache, 'recursos');
  const r = { fuentes: {}, logos: {} };
  fs.readdirSync(dir).forEach((n) => {
    let x = /^(.+)-(regular|bold|italic|boldItalic)\.ttf$/.exec(n);
    if (x) (r.fuentes[x[1]] = r.fuentes[x[1]] || {})[x[2]] = fs.readFileSync(path.join(dir, n)).toString('base64');
    x = /^logo-(.+)\.png$/.exec(n);
    if (x) r.logos[x[1]] = { base64: fs.readFileSync(path.join(dir, n)).toString('base64'), mimeType: 'image/png' };
  });
  return r;
}

(async () => {
  const [documento, caso] = process.argv.slice(2);
  if (!documento) throw new Error('Uso: node tools/pdf/html/local.js <documento> [caso]');
  const plantilla = leer('src/html/pdf/' + documento + '.html');
  const adaptar = ADAPTADORES[documento] ? ADAPTADORES[documento]() : (d) => d;
  const casos = JSON.parse(fs.readFileSync(path.join(cache, documento, 'casos.json'), 'utf8')).casos
    .filter((c) => !caso || c.nombre === caso);
  const r = recursos();
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
    .find((p) => fs.existsSync(p));
  const nav = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
  try {
    const pagina = await nav.newPage();
    for (const c of casos) {
      const datos = adaptar(c.datos);
      let html = ctx.PdfHtml.llenar(plantilla, datos, c.firmas, r);
      // Lo que hace LineasPdf.generarPdfHtml: si la hoja 1 no alcanza, otra vez sin el salto
      await pagina.setContent(html, { waitUntil: 'load' });
      let pdf = await pagina.pdf({ preferCSSPageSize: true, printBackground: true });
      const hojas = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page(?![a-z])/g) || []).length;
      if (datos.SALTO && hojas > 2) {
        html = ctx.PdfHtml.llenar(plantilla, Object.assign({}, datos, { SALTO: '' }), c.firmas, r);
        await pagina.setContent(html, { waitUntil: 'load' });
        pdf = await pagina.pdf({ preferCSSPageSize: true, printBackground: true });
      }
      fs.writeFileSync(path.join(cache, documento, 'H' + c.nombre + '.pdf'), pdf);
      const faltan = ctx.PdfHtml.faltantes(plantilla, datos);
      console.log(c.nombre, hojas + ' hojas', faltan.length ? 'sin dato: ' + faltan.join(', ') : '');
    }
  } finally {
    await nav.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });

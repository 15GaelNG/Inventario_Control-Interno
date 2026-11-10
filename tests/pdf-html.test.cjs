/**
 * PdfHtml (src/utils/PdfHtml.gs): llenar una plantilla HTML de documento. El experimento del 10-nov (responsiva
 * vehicular en HTML convertida por Apps Script, src/pruebas/PruebasPdfHtml.gs).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const ctx = vm.createContext({ Buffer });
vm.runInContext(fs.readFileSync(path.join(raiz, 'src/utils/PdfHtml.gs'), 'utf8') + '\nthis.PdfHtml = PdfHtml;', ctx);
const { PdfHtml } = ctx;

// PNG de 4 × 2 px (solo importa el encabezado)
const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b);
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b.toString('base64');
};

test('llena los campos escapados, con fechas como las escribe el documento', () => {
  const html = PdfHtml.llenar('<p>{{NOMBRE}} · {{VIGENCIA}} · {{FECHA}} · {{NADA}}</p>',
    { NOMBRE: 'A & <B>', VIGENCIA: '2026-12-29', FECHA: new Date(2027, 8, 4) });
  assert.strictEqual(html, '<p>A &amp; &lt;B&gt; · 29/12/2026 · 04/09/2027 · </p>');
});

test('las casillas SI / NO ponen la palomita solo en la que corresponde', () => {
  const p = '{{SI:GATO}}|{{NO:GATO}}|{{SI:CRUZ}}|{{NO:CRUZ}}|{{SI:OTRO}}|{{NO:OTRO}}';
  assert.strictEqual(PdfHtml.llenar(p, { GATO: 'SI', CRUZ: ' no ', OTRO: '' }), '✓|||✓||');
});

test('la firma cabe en su caja sin deformarse (agranda o achica, como Docs) y sin firma no pinta nada', () => {
  const caja = '{{IMG:FIRMA:150x60}}';
  const ancha = PdfHtml.llenar(caja, {}, { FIRMA: { base64: png(600, 100), mimeType: 'image/png' } });
  assert.match(ancha, /width:150\.00pt;height:25\.00pt/);
  const alta = PdfHtml.llenar(caja, {}, { FIRMA: { base64: png(40, 30) } });
  assert.match(alta, /width:80\.00pt;height:60\.00pt/);
  assert.strictEqual(PdfHtml.llenar(caja, {}, {}), '');
});

test('las tipografías van en su propio <style> al inicio del <head> (el compresor tira un marcador dentro del CSS)', () => {
  const html = PdfHtml.llenar('<html><head><style>p{}</style></head></html>', {}, {}, { fuentes: { regular: 'AAA', bold: 'BBB' } });
  assert.match(html, /^<html><head><style>@font-face\{[^}]*base64,AAA[^}]*font-weight:400[^}]*\}@font-face\{[^}]*base64,BBB[^}]*font-weight:700/);
  assert.strictEqual(PdfHtml.llenar('<head></head>', {}), '<head></head>', 'sin fuentes no agrega nada');
});

test('la plantilla de la responsiva vehicular: carta, sin redondeo de letras y con todos sus campos', () => {
  const html = fs.readFileSync(path.join(raiz, 'src/html/pdf/responsiva-vehicular.html'), 'utf8');
  assert.match(html, /@page \{ size: 612pt 792pt; margin: 0; \}/);
  // Sin geometricPrecision el convertidor de Apps Script redondea cada letra a pixeles y los renglones cortan distinto
  assert.match(html, /text-rendering: geometricPrecision/);
  assert.doesNotMatch(html, /\{\{FUENTES\}\}/);
  ['RESPONSABLE', 'NUCCO', 'SERIE VEHICULO', 'ESTADO DE ENTREGA', 'NOMBRE JEFE', 'NOMBRE CI', 'SI:PARASOL', 'NO:CUBIERTA BATEA',
    'IMG:FIRMA RESPONSABLE:150x60', 'IMG:FIRMA JEFE:150x60', 'IMG:FIRMA CI:150x60'].forEach((m) => assert.ok(html.includes('{{' + m + '}}'), m));
});

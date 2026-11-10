/**
 * PdfHtml (src/utils/PdfHtml.gs): los documentos del sistema como HTML convertido a PDF (10-nov-2026). Aquí, lo que
 * corre sin Drive: llenar la plantilla. Cómo se compara cada documento con sus PDF reales: docs/pdf-motor.md.
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

// Un PNG del que solo importa el encabezado (ancho y alto)
const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b);
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b.toString('base64');
};

test('llena los campos escapados (también los que llevan /), con fechas como las escribe el documento', () => {
  const html = PdfHtml.llenar('<p>{{NOMBRE}} · {{VIGENCIA}} · {{FECHA}} · {{OFICINA / DESARROLLO}} · {{NADA}}</p>',
    { NOMBRE: 'A & <B>', VIGENCIA: '2026-12-29', FECHA: new Date(2027, 8, 4), 'OFICINA / DESARROLLO': 'BQ1' });
  assert.strictEqual(html, '<p>A &amp; &lt;B&gt; · 29/12/2026 · 04/09/2027 · BQ1 · </p>');
});

test('las casillas SI / NO ponen la palomita solo en la que corresponde', () => {
  const p = '{{SI:GATO}}|{{NO:GATO}}|{{SI:CRUZ}}|{{NO:CRUZ}}|{{SI:OTRO}}|{{NO:OTRO}}';
  assert.strictEqual(PdfHtml.llenar(p, { GATO: 'SI', CRUZ: ' no ', OTRO: '' }), '✓|||✓||');
});

test('bloques según el campo: {{#SI}} si trae algo, {{#VACIO}} si no', () => {
  const p = '[{{#SI OBS}}obs: {{OBS}}{{/SI}}{{#VACIO OBS}}sin obs{{/VACIO}}]';
  assert.strictEqual(PdfHtml.llenar(p, { OBS: 'raspón' }), '[obs: raspón]');
  assert.strictEqual(PdfHtml.llenar(p, { OBS: '  ' }), '[sin obs]');
});

test('{{HTML:CLAVE}} pega lo que armó el servicio, sin volver a escapar', () => {
  assert.strictEqual(PdfHtml.llenar('<div>{{HTML:TABLA}}</div>', { TABLA: '<tr><td>a &amp; b</td></tr>' }), '<div><tr><td>a &amp; b</td></tr></div>');
});

test('la firma cabe en su caja sin deformarse (agranda o achica, como Docs) y sin firma no pinta nada', () => {
  const caja = '{{IMG:FIRMA:150x60}}';
  assert.match(PdfHtml.llenar(caja, {}, { FIRMA: { base64: png(600, 100), mimeType: 'image/png' } }), /width:150\.00pt;height:25\.00pt/);
  assert.match(PdfHtml.llenar(caja, {}, { FIRMA: { base64: png(40, 30) } }), /width:80\.00pt;height:60\.00pt/);
  assert.strictEqual(PdfHtml.llenar(caja, {}, {}), '');
  // :tope (Líneas): nunca más grande que su tamaño natural, 1 pixel = 0.75 pt; si no cabe, igual se achica
  const tope = '{{IMG:PATRON:42x42:tope}}';
  assert.match(PdfHtml.llenar(tope, {}, { PATRON: { base64: png(20, 20) } }), /width:15\.00pt;height:15\.00pt/);
  assert.match(PdfHtml.llenar(tope, {}, { PATRON: { base64: png(300, 300) } }), /width:42\.00pt;height:42\.00pt/);
  // :linea: en su renglón cuenta su alto ÷ 1.211 (margen negativo arriba), como en Docs con el interlineado de AppSheet
  assert.match(PdfHtml.llenar('{{IMG:F:120x52.5:tope:linea}}', {}, { F: { base64: png(400, 175) } }),
    /width:120\.00pt;height:52\.50pt;margin-top:-9\.15pt/);
});

test('tipografías: solo las familias que el documento nombra, en su propio <style> al inicio del <head>', () => {
  const recursos = { fuentes: { CenturyGothic: { regular: 'AAA', bold: 'BBB' }, Otra: { regular: 'ZZZ' } } };
  const html = PdfHtml.llenar('<html><head><style>body{font-family:"CenturyGothic"}</style></head></html>', {}, {}, recursos);
  assert.match(html, /^<html><head><style>@font-face\{font-family:"CenturyGothic";src:url\(data:font\/ttf;base64,AAA\)[^}]*font-weight:400[^}]*\}@font-face\{[^}]*BBB[^}]*font-weight:700/);
  assert.doesNotMatch(html, /ZZZ/, 'la familia que no se usa no se incrusta');
  assert.strictEqual(PdfHtml.llenar('<head></head>', {}), '<head></head>', 'sin recursos no agrega nada');
});

test('el logo por nombre y el aviso de vista previa', () => {
  const recursos = { logos: { 'ciudad-maderas': { base64: 'LLL', mimeType: 'image/png' } } };
  assert.strictEqual(PdfHtml.llenar('{{LOGO:ciudad-maderas}}', {}, {}, recursos), 'data:image/png;base64,LLL');
  const previa = PdfHtml.llenar('<body class="x"><p>a</p></body>', {}, {}, {}, { aviso: 'VISTA PREVIA — AÚN SIN FIRMAR' });
  assert.match(previa, /^<body class="x"><div style="position:absolute[^"]*">VISTA PREVIA — AÚN SIN FIRMAR<\/div><p>a<\/p>/);
});

test('faltantes: los campos que la plantilla pide y no llegaron (como sinResolver del motor de Docs)', () => {
  const p = '{{A}} {{SI:B}} {{#SI C}}x{{/SI}} {{IMG:FIRMA:1x1}} {{LOGO:x}} {{HTML:D}}';
  assert.deepStrictEqual(Array.from(PdfHtml.faltantes(p, { A: 1, C: '' })).sort(), ['B', 'D']);
});

test('la plantilla de la responsiva vehicular: carta, sin redondeo de letras, su tipografía y todos sus campos', () => {
  const html = fs.readFileSync(path.join(raiz, 'src/html/pdf/responsiva-vehicular.html'), 'utf8');
  assert.match(html, /@page \{ size: 612pt 792pt; margin: 0; \}/);
  // Sin geometricPrecision el convertidor de Apps Script redondea cada letra a pixeles y los renglones cortan distinto
  assert.match(html, /text-rendering: geometricPrecision/);
  assert.match(html, /font-family: "CenturyGothic"/);
  ['RESPONSABLE', 'NUCCO', 'SERIE VEHICULO', 'ESTADO DE ENTREGA', 'NOMBRE JEFE', 'NOMBRE CI', 'SI:PARASOL', 'NO:CUBIERTA BATEA',
    'IMG:FIRMA RESPONSABLE:150x60', 'IMG:FIRMA JEFE:150x60', 'IMG:FIRMA CI:150x60', 'LOGO:ciudad-maderas']
    .forEach((m) => assert.ok(html.includes('{{' + m + '}}'), m));
});

test('cada documento encendido tiene su plantilla (carta, sin redondeo de letras), y en producción ninguno sin autorización', () => {
  Object.keys(PdfHtml.DOCUMENTOS).forEach((d) => {
    const archivo = path.join(raiz, 'src/html/pdf', d + '.html');
    assert.ok(fs.existsSync(archivo), d + ': falta src/html/pdf/' + d + '.html');
    const html = fs.readFileSync(archivo, 'utf8');
    // Carta (responsiva, adherente) o A4 (el arqueo, como lo imprimía AppSheet)
    assert.match(html, /@page \{ size: (612pt 792pt|595\.3pt 841\.9pt); margin: 0; \}/, d);
    assert.match(html, /text-rendering: geometricPrecision/, d);
    // Un marcador dentro del CSS lo tira el compresor: las tipografías las pone llenar()
    assert.doesNotMatch(html.slice(html.indexOf('<style>'), html.indexOf('</style>')), /\{\{/, d + ': un marcador dentro del CSS');
  });
  ['ADHERENTE', 'IMG:FIRMA ADHERENTE:150x60', 'NOMBRE JEFE', 'ESTADO DE ENTREGA'].forEach((m) =>
    assert.ok(fs.readFileSync(path.join(raiz, 'src/html/pdf/adherente-vehicular.html'), 'utf8').includes('{{' + m + '}}'), 'adherente: ' + m));
  const arqueo = fs.readFileSync(path.join(raiz, 'src/html/pdf/arqueo.html'), 'utf8');
  ['ID ARQUEO', 'OBSERVACIONES FINALES', 'CALIFICACION_AUDITORIA_FINAL', 'SUBTOTAL B 500,00', 'IMG:FIRMA RESPONSABLE:100x100',
    'FIRMA ASISTENTE TEXTO'].forEach((m) => assert.ok(arqueo.includes('{{' + m + '}}'), 'arqueo: ' + m));
  // Sin tipografía ni datos en el repo: solo marcadores
  assert.doesNotMatch(arqueo, /&lt;&lt;|@import|base64,/, 'arqueo: quedó algo de Docs o un dato');
  // Encender uno en prod es decisión del usuario: este número solo cambia cuando lo autoriza
  assert.strictEqual(Object.keys(PdfHtml.DOCUMENTOS).filter((d) => PdfHtml.DOCUMENTOS[d].prod).length, 0);
});

test('la responsiva de celular: sus campos, y los valores como los ponía LineasPdf (LineasCaptura.datosHtml)', () => {
  const html = fs.readFileSync(path.join(raiz, 'src/html/pdf/responsiva-celular.html'), 'utf8');
  ['NUCO4', 'RESPONSABLE', 'No EMPLEADO', 'OFICINA / DESARROLLO', 'PIN EQUIPO', 'TICKET', 'IMG:CONTRASEÑA:42x42:tope',
    'IMG:FIRMA CI:120x52.5:tope:linea', '#SI ADICIONALES', 'LOGO:ciudad-maderas-celular'].forEach((m) => assert.ok(html.includes('{{' + m + '}}'), m));
  assert.match(html, /class="\{\{SALTO\}\}"/);
  const c = vm.createContext({ Utilities: { formatDate: () => '04/11/2026' } });
  vm.runInContext(fs.readFileSync(path.join(raiz, 'src/services/lineas/LineasCaptura.gs'), 'utf8') + '\nthis.L = LineasCaptura;', c);
  // Columnas sin distinguir mayúsculas, el NUCO a 4 cifras, varios responsables juntos con « / »
  const d = c.L.datosHtml({ 'NUCO': 83, 'No EMPLEADO': 'A1', 'RESPONSABLE': 'ANA', 'NOMBRE SEGUNDO RESPONSABLE': 'LUIS',
    'NO EMPLEADO SEGUNDO RESPONSABLE': 'B2', 'FECHA RESPONSIVA': new Date(2026, 10, 4), 'MODELO': 'G15', 'IMEI': '1' });
  assert.strictEqual(d['NUCO4'], '0083');
  assert.strictEqual(d['No EMPLEADO'], 'A1 / B2');
  assert.strictEqual(d['RESPONSABLE'], 'ANA / LUIS');
  assert.strictEqual(d['ADICIONALES'], 'SI');
  assert.strictEqual(d['SALTO'], 'salto');
  assert.deepStrictEqual(Array.from(PdfHtml.faltantes(html, d)), []);
  // La línea sin equipo: «NO APLICA», no «000»
  const sola = c.L.datosHtml({ 'FECHA RESPONSIVA': new Date(), 'NUCO': '', 'MODELO': 'NO APLICA', 'IMEI': 'NO APLICA', 'RESPONSABLE': 'ANA' });
  assert.strictEqual(sola['NUCO4'], 'NO APLICA');
  assert.strictEqual(sola['ADICIONALES'], '');
});

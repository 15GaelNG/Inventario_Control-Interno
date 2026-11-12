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

test('{{ES:CAMPO:VALOR}} pone la palomita si el valor es ese, y una columna se encuentra sin distinguir mayúsculas', () => {
  const p = '{{ES:DESEMPEÑO:BUENO}}|{{ES:DESEMPEÑO:MALO}}|{{ES:GPS:N/A}}|{{ES:WHATSAPP:INSTALADA}}|{{No EMPLEADO}}';
  assert.strictEqual(PdfHtml.llenar(p, { 'DESEMPEÑO': 'bueno', GPS: 'N/A', WHATSAPP: '', 'NO EMPLEADO': 'A1' }), '✓||✓||A1');
  assert.deepStrictEqual(Array.from(PdfHtml.faltantes(p, { 'DESEMPEÑO': 'x', GPS: '', 'no  empleado': 'A1' })), ['WHATSAPP']);
});

test('bloques según el campo: {{#SI}} si trae algo, {{#VACIO}} si no', () => {
  const p = '[{{#SI OBS}}obs: {{OBS}}{{/SI}}{{#VACIO OBS}}sin obs{{/VACIO}}]';
  assert.strictEqual(PdfHtml.llenar(p, { OBS: 'raspón' }), '[obs: raspón]');
  assert.strictEqual(PdfHtml.llenar(p, { OBS: '  ' }), '[sin obs]');
});

test('un salto de renglón del dato sale como renglón aparte (las observaciones), igual que en Docs', () => {
  assert.strictEqual(PdfHtml.llenar('<p>{{OBS}}</p>', { OBS: '-UNO\r\n-<DOS>\n-' }), '<p>-UNO<br>-&lt;DOS&gt;<br>-</p>');
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
    // Carta (responsivas, adherente), A4 (el arqueo, como lo imprimía AppSheet) o A4 horizontal (la inspección de celular);
    // la inspección vehicular con los márgenes de AppSheet (27 pt arriba y abajo, 20 a los lados): corre a varias hojas
    assert.match(html, /@page \{ size: (612pt 792pt|595\.3pt 841\.9pt|841\.9pt 595\.3pt); margin: (0|27pt 20pt); \}/, d);
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
  // Encender uno en prod es decisión del usuario: este número solo cambia cuando lo autoriza (10-nov: los 7)
  assert.strictEqual(Object.keys(PdfHtml.DOCUMENTOS).filter((d) => PdfHtml.DOCUMENTOS[d].prod).length, 7);
});

test('la responsiva de celular: sus campos, y los valores como los ponía LineasPdf (LineasCaptura.datosHtml)', () => {
  const html = fs.readFileSync(path.join(raiz, 'src/html/pdf/responsiva-celular.html'), 'utf8');
  ['NUCO4', 'RESPONSABLE', 'No EMPLEADO', 'OFICINA / DESARROLLO', 'PIN EQUIPO', 'TICKET', 'IMG:CONTRASEÑA:42x42:tope',
    'IMG:FIRMA CI:67.5x30:tope:linea', 'LOGO:ciudad-maderas-celular'].forEach((m) => assert.ok(html.includes('{{' + m + '}}'), m));
  // Plantilla «PRUEBA RESPONSABLE 05-nov» (6-nov): cada responsable con su casilla y su nombre, en las dos hojas; todas las
  // firmas a lo más 90 × 40 px, como LineasPdf
  ['FIRMA RESPONSABLE', 'FIRMA RESPONSABLE 2', 'FIRMA RESPONSABLE 3', 'FIRMA RESPONSABLE 4', 'FIRMA RESPONSABLE 5'].forEach((f) =>
    assert.strictEqual(html.split('{{IMG:' + f + ':67.5x30:tope').length - 1, 2, f + ' en la hoja 1 y en la de sanciones'));
  [1, 2, 3, 4, 5].forEach((i) => assert.strictEqual(html.split('{{RESPONSABLE ' + i + '}}').length - 1, 2, 'RESPONSABLE ' + i));
  // La raya bajo cada nombre, negra (11-nov: la del responsable 4 de la hoja 2 venía del azul del fondo y no se veía)
  const nombres = html.match(/<td\b[^>]*>(?:(?!<\/td>)[\s\S])*?\{\{(?:RESPONSABLE [1-5]|NOMBRE CI)\}\}/g) || [];
  assert.strictEqual(nombres.length, 11);
  nombres.forEach((td) => assert.match(td.slice(0, td.indexOf('>') + 1), /border-bottom-color:#000000;[^"]*border-bottom-width:1pt/, td.slice(-20)));
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
  assert.strictEqual(d['RESPONSABLE 1'], 'ANA');
  assert.strictEqual(d['RESPONSABLE 2'], 'LUIS');
  assert.strictEqual(d['RESPONSABLE 3'], 'N/A', 'la casilla que no se ocupó dice N/A (usuario, 6-nov)');
  assert.strictEqual(d['SALTO'], 'salto');
  assert.deepStrictEqual(Array.from(PdfHtml.faltantes(html, d)), []);
  // La línea sin equipo: «NO APLICA», no «000»
  const sola = c.L.datosHtml({ 'FECHA RESPONSIVA': new Date(), 'NUCO': '', 'MODELO': 'NO APLICA', 'IMEI': 'NO APLICA', 'RESPONSABLE': 'ANA' });
  assert.strictEqual(sola['NUCO4'], 'NO APLICA');
  assert.strictEqual(sola['ADICIONALES'], '');
});

test('la inspección de celular (sus dos variantes): las casillas de la plantilla de Docs y sus imágenes', () => {
  ['inspeccion-celular', 'inspeccion-celular-checklist'].forEach((doc) => {
    const html = fs.readFileSync(path.join(raiz, 'src/html/pdf', doc + '.html'), 'utf8');
    ['ES:DESEMPEÑO:BUENO', 'ES:GPS:N/A', 'ES:WHATSAPP:INSTALADA', 'IMG:FIRMA INSPECTOR:67.5x30:tope',
      'IMG:PATRON:42x42:tope', 'CALIFICACION', 'FECHA DE REGISTRO', 'NUCO', 'LOGO:inspeccion-celular-1']
      .forEach((m) => assert.ok(html.includes('{{' + m + '}}'), doc + ': ' + m));
    assert.doesNotMatch(html, /&lt;&lt;|translateZ/, doc);
  });
  const antes = fs.readFileSync(path.join(raiz, 'src/html/pdf/inspeccion-celular-checklist.html'), 'utf8');
  assert.ok(antes.includes('{{ES:CUBO:SI}}'));
  assert.ok(antes.includes('{{IMG:FIRMA RESPONSABLE:67.5x30:tope}}'), 'la de antes: una sola casilla de responsable');
  // La actual («Copia de … ACCESORIOS 22-oct», 6-nov): una casilla por responsable, con su nombre
  const actual = fs.readFileSync(path.join(raiz, 'src/html/pdf/inspeccion-celular.html'), 'utf8');
  [1, 2, 3, 4, 5].forEach((i) => {
    assert.ok(actual.includes('{{IMG:FIRMA RESPONSABLE ' + i + ':67.5x30:tope}}'), 'FIRMA RESPONSABLE ' + i);
    assert.ok(actual.includes('{{RESPONSABLE ' + i + '}}'), 'RESPONSABLE ' + i);
  });
  // Sus cuatro imágenes fijas son las de la de antes, aunque la exportación de la copia las numere en otro orden
  [1, 2, 3, 4].forEach((n) => assert.ok(actual.includes('{{LOGO:inspeccion-celular-' + n + '}}'), 'logo ' + n));
});

test('la inspección vehicular: una plantilla para los 18 tipos, con el formato de cada uno (InspeccionHtml.datos)', () => {
  const html = fs.readFileSync(path.join(raiz, 'src/html/pdf/inspeccion-vehicular.html'), 'utf8');
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(raiz, 'src/config/InspeccionFormatos.gs'), 'utf8') + '\n' +
    fs.readFileSync(path.join(raiz, 'src/services/InspeccionHtml.gs'), 'utf8') + '\nthis.F = InspeccionFormatos; this.H = InspeccionHtml;', c);
  assert.strictEqual(c.F.tipos().length, 18);
  assert.doesNotMatch(html, /&lt;&lt;|base64,/, 'quedó algo de Docs o un dato');
  // Lo que viene de la fila tal cual (encabezado, firmas); lo demás lo pone InspeccionHtml.datos
  const fila = {};
  ['NUCO', 'FECHA', 'RESPONSABLE', 'DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO', 'CONDUCTOR', 'JEFE DIRECTO', 'VEHICULO',
    'NO SERIE', 'MODELO / AÑO', 'PLACAS', 'FECHA ULTIMO SERVICIO', 'HOLOGRAMA', 'TIPO COMBUSTIBLE', 'PUNTAJE FINAL INSPECCION',
    'OBSERVACIONES', 'NOMBRE INSPECTOR', 'VOLTAJE'].forEach((k) => { fila[k] = 'x'; });
  c.F.tipos().forEach((t) => {
    const f = c.F.de(t);
    const d = c.H.datos(Object.assign({}, fila, { VOLTAJE: '12.5' }), t);
    assert.deepStrictEqual(Array.from(PdfHtml.faltantes(html, d)), [], t);
    ['DOCUMENTACION', 'CRISTALERIA', 'NEUMATICOS', 'LATONERIA', 'INVENTARIOS', 'SISTEMAS INTERIORES', 'BATERIA'].forEach((s) =>
      assert.ok(d[s].length > 0, t + ': ' + s));
    assert.strictEqual(d['DIAGRAMA 1'], 'INS FRONTAL', t);
    assert.strictEqual(d['SEMAFORO VERTICAL'], f.llantas.length >= 4 ? 'SI' : '', t);
    assert.strictEqual(d['VOLTAJE COLOR'], '#fcd618', t);
  });
  // Las llantas: el color por profundidad, sin huecos entre rangos (en Docs un 1.65 salía sin color)
  const d = c.H.datos({ 'LLANTA DD': '1,5', 'llanta di': '4', 'LLANTA TD': '4.1', 'LLANTA TI': '' }, 'L200');
  assert.strictEqual(d['LLANTA1 ETIQUETA'], 'Delantera derecha');
  assert.strictEqual(d['LLANTA1 COLOR'], '#ff0000');
  assert.strictEqual(d['LLANTAS RESTO'].map((l) => l.color).join(' '), '#fcd618 #000000 #38761d');
  assert.strictEqual(d['FILAS SEMAFORO'], 11);   // como el rowspan del Doc: 4 llantas + 5 piezas de Neumáticos + 2
  assert.strictEqual(c.H.colorLlanta('1.65'), '#ff0000');
  assert.strictEqual(c.H.colorVoltaje('12.3'), '#ff0000');
  assert.strictEqual(c.H.colorVoltaje('12.7'), '#38761d');
  assert.strictEqual(d['DOCUMENTACION'][0].etiqueta, 'Gafette');
  // Moto: las llantas en su lista, sin semáforo vertical; los diagramas en el orden de su Vector (frontal y trasera arriba)
  const m = c.H.datos({ 'LLANTA D': '3' }, 'honda 150xr');
  assert.strictEqual(m['SEMAFORO VERTICAL'], '');
  assert.strictEqual(m['LLANTAS'][0].valor, '3');
  assert.strictEqual(m['DIAGRAMA 2'], 'INS TRASERA');
  assert.throws(() => c.H.datos({}, 'TRACTOR'), /no tiene formato HTML/);
});

// Daños del equipo (usuario, 12-nov): el dibujo del celular rayado va en lugar del de siempre, del mismo tamaño
test('inspección de celular: con DIAGRAMA DAÑOS va el dibujo rayado; sin él, el dibujo en blanco de siempre', () => {
  ['inspeccion-celular', 'inspeccion-celular-checklist'].forEach((doc) => {
    const p = fs.readFileSync(path.join(raiz, 'src/html/pdf/' + doc + '.html'), 'utf8');
    assert.ok(p.includes('{{#SI DIAGRAMA DAÑOS}}{{IMG:DIAGRAMA DAÑOS:198.37x77.23}}{{/SI}}{{#VACIO DIAGRAMA DAÑOS}}<img alt="" src="{{LOGO:inspeccion-celular-3}}"'), doc);
    // Todos los logos (uno que falta toma el primero)
    const logos = { 'inspeccion-celular-1': { base64: 'L1' }, 'inspeccion-celular-2': { base64: 'L2' }, 'inspeccion-celular-3': { base64: 'BLANCO', mimeType: 'image/png' },
      'inspeccion-celular-4': { base64: 'L4' } };
    const sin = PdfHtml.llenar(p, { 'DIAGRAMA DAÑOS': '' }, {}, { logos });
    assert.ok(sin.includes('src="data:image/png;base64,BLANCO"'), doc + ': sin rayar, el de siempre');
    const rayado = png(620, 241);
    const con = PdfHtml.llenar(p, { 'DIAGRAMA DAÑOS': 'SI' }, { 'DIAGRAMA DAÑOS': { base64: rayado, mimeType: 'image/png' } }, { logos });
    assert.ok(!con.includes('base64,BLANCO'), doc + ': rayado, sin el de siempre');
    assert.match(con, new RegExp('<img src="data:image/png;base64,' + rayado.replace(/[+/=]/g, '\$&') + '" style="width:198\.37pt;height:77\.11pt">'));
    assert.ok(!PdfHtml.faltantes(p, Object.assign({ 'DIAGRAMA DAÑOS': '' })).includes('DIAGRAMA DAÑOS'));
  });
  // El paso de Docs a HTML lo vuelve a poner si se convierte otra vez
  const retoques = fs.readFileSync(path.join(raiz, 'tools/pdf/html/retoques.py'), 'utf8');
  assert.match(retoques, /s = _DIBUJO_CELULAR\.sub\(lambda m: _DIBUJO_RAYADO % m\.group\(0\), s\)/);
});

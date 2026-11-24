const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const LINEAS = require('./lineas-fuente');

// «Subir carta» en Cancelaciones (usuario, 10-nov; LineasCarta.gs + LineasResguardos.vistaCarta / cartaEnviada).
// Los textos de las cartas son inventados (el repo es público): copian la forma de las de Telcel y AT&T.
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const LineasCarta = new Function('LineasResguardos', 'DriveUtils', 'Utilities', 'LineasDatos', 'LineasArchivos',
  read('src/services/lineas/LineasCarta.gs') + '\nreturn LineasCarta;')({}, {}, {}, {}, {});

const TELCEL = `Santiago de Querétaro, Querétaro.
21 octubre de 2026.
Asunto: Cancelación de línea
RADIOMÓVIL DIPSA, S.A. DE C.V.
A QUIEN CORRESPONDA:
solicita la cancelación de la siguiente línea:
REGIÓN CUENTA PADRE NÚMERO RAZÓN SOCIAL ASESOR
6 11122233 4420000001 EMPRESA UNO SERVICIOS SC ALFREDO
6 11122233 4420000002 EMPRESA UNO SERVICIOS SC ALFREDO
7 44455566 (Hija) 2220000003 EMPRESA UNO SERVICIOS SC ALFREDO
6 11122233 4420000001 EMPRESA UNO SERVICIOS SC ALFREDO
ATENTAMENTE`;

const ATT = `Santiago de Querétaro, Querétaro.
21 de octubre de 2026.
AT&T Comercialización Móvil, S de R.L de C.V.
6 507000111 442 000 0004 EMPRESA DOS SA DE CV KARLA
8 507000111 999-000-0005 EMPRESA DOS SA DE CV KARLA
EMPRESA DOS S.A DE C.V., REPRESENTADA EN ESTE ACTO`;

test('interpretar: los números de 10 dígitos de la tabla, sin la cuenta ni la región, sin repetir y en orden', () => {
  const t = LineasCarta.interpretar(TELCEL);
  assert.deepEqual(t.numeros, ['4420000001', '4420000002', '2220000003']);
  assert.equal(t.fecha, '2026-10-21');
  assert.equal(t.proveedor, 'TELCEL');
  const a = LineasCarta.interpretar(ATT);
  assert.deepEqual(a.numeros, ['4420000004', '9990000005'], 'también separados como se escribe un teléfono');
  assert.equal(a.fecha, '2026-10-21');
  assert.equal(a.proveedor, 'AT&T');
  assert.deepEqual(LineasCarta.interpretar('').numeros, []);
  assert.equal(LineasCarta.interpretar('Querétaro, 05/11/2026').fecha, '2026-11-05');
});

test('avisos: otra compañía o una razón social que no está escrita en la carta (las siglas no cuentan)', () => {
  const l = LineasCarta.interpretar(ATT);
  assert.deepEqual(LineasCarta.avisos({ estado: 'AVANZA', compania: 'ATT', razon: 'EMPRESA DOS SA DE CV' }, l, ATT), []);
  assert.deepEqual(LineasCarta.avisos({ estado: 'AVANZA', compania: 'TELCEL', razon: 'EMPRESA DOS S.A. DE C.V.' }, l, ATT),
    ['La carta es para AT&T y la línea es TELCEL']);
  assert.match(LineasCarta.avisos({ estado: 'LIGA', compania: 'AT&T', razon: 'EMPRESA TRES SC' }, l, ATT)[0], /no aparece en la carta/);
  assert.deepEqual(LineasCarta.avisos({ estado: 'YA', compania: 'TELCEL', razon: 'OTRA' }, l, ATT), [], 'lo que no cambia no avisa');
});

// La bandeja y el inventario en memoria, como lineas-resguardo-cancelacion.test.cjs
function cargar(inventario, bandeja, lineas) {
  const tablas = { 'LINEAS TELEFONICAS': inventario, APP_RESGUARDOS: bandeja, LINEAS: lineas || [], MOVIMIENTOS: [] };
  const escritas = { columnas: [] };
  const LineasDatos = {
    ZONA_APP: 'America/Mexico_City', normCol: (c) => String(c).toUpperCase().trim(),
    conCandado: (fn) => fn(), existeTabla: (n) => !!tablas[n], asegurarPestana: (n) => { tablas[n] = tablas[n] || []; },
    asegurarColumnas: (n, cols) => { escritas.columnas.push([n].concat(cols)); return []; },
    leerTabla: (n) => (tablas[n] || []).map((f, i) => (n === 'LINEAS TELEFONICAS' ? Object.assign(f, { _fila: i + 2 }) : Object.assign({ _fila: i + 2 }, f))),
    idsDeFila: (f) => [String(f['ID'])],
    actualizarFila: (n, fila, cambios) => { Object.assign(tablas[n][fila - 2], cambios); },
    actualizarFilas: (n, lista) => lista.forEach((x) => Object.assign(tablas[n][x.fila - 2], x.cambios)),
    recordar: (clave, nombres, armar) => armar(),
  };
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')(LineasDatos, {});
  const LineasRepo = { TAB: { LINEAS: 'LINEAS TELEFONICAS', MOV: 'MOVIMIENTOS', CAMBIOS: 'CAMBIOS' }, TIPOS_CON_EQUIPO: {} };
  const Notif = { PARA_APROBADORES: 'APROBADORES', crear: () => {}, _diaFinPlan: () => '' };
  const Utilities = { formatDate: () => '2026-11-10' };
  const R = new Function('LineasUtil', 'LineasNotificaciones', 'LineasDatos', 'LineasRepo', 'Utilities', 'CARTA_COLUMNA', 'CARTA_LINK_COLUMNA',
    read('src/services/lineas/LineasResguardos.gs') + '\nreturn LineasResguardos;')(LineasUtil, Notif, LineasDatos, LineasRepo, Utilities,
    'CARTA DE CANCELACION', 'LINK CARTA DE CANCELACION');
  return { R, tablas, escritas };
}

const pau = { correo: 'pau@x', nombre: 'PAU', puedeAprobar: true };
const linea = (id, numero, extra) => Object.assign({ 'ID': id, 'ID LINEA': id, 'TIPO': 'LINEA', 'NUMERO TELEFONO': numero, 'COMPAÑIA': 'TELCEL',
  'RAZON SOCIAL': 'EMPRESA UNO SERVICIOS SC', 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' }, extra || {});
const renglon = (id, idLinea, numero, fase, extra) => Object.assign({ 'ID': id, 'ID_LINEA': idLinea, 'NUMERO': numero, 'CANCELACION': fase, 'ESTADO': '' }, extra || {});
const LIGA = 'https://drive.google.com/file/d/CARTA1/view';

function escenario() {
  return cargar(
    [linea('LIN-1', '4420000001'), linea('LIN-2', '4420000002'), linea('LIN-3', '2220000003'), linea('LIN-4', '4420000009', { 'ESTATUS LINEA': 'USO' }),
      linea('LIN-5', '4420000006')],
    [renglon('R1', 'LIN-1', '4420000001', 'POR FIRMAR'), renglon('R2', 'LIN-2', '4420000002', 'CARTA ENVIADA'),
      renglon('R3', 'LIN-3', '2220000003', 'CANCELADA', { CARTA: 'https://drive.google.com/file/d/VIEJA/view' }),
      // Se retiró y se volvió a mandar: cuenta el que sigue en curso
      renglon('R5a', 'LIN-5', '4420000006', 'RETIRADA'), renglon('R5b', 'LIN-5', '4420000006', 'CARTA FIRMADA')],
    [{ 'ID': 'LIN-1', 'NUMERO TELEFONO': '4420000001' }, { 'ID': 'LIN-2', 'NUMERO TELEFONO': '4420000002', 'LINK CARTA DE CANCELACION': 'https://otra' },
      { 'ID': 'LIN-5', 'NUMERO TELEFONO': '4420000006' }]);
}

test('vistaCarta: qué le pasa a cada número, sin escribir nada', () => {
  const t = escenario();
  const v = t.R.vistaCarta(['4420000001', '4420000002', '2220000003', '4420000009', '5550000000', '4420000006'], 'abc', pau);
  assert.deepEqual(v.numeros.map((x) => [x.numero, x.estado, x.id || '']), [
    ['4420000001', 'AVANZA', 'R1'], ['4420000002', 'LIGA', 'R2'], ['2220000003', 'YA', 'R3'],
    ['4420000009', 'FUERA', ''], ['5550000000', 'NO_INVENTARIO', ''], ['4420000006', 'AVANZA', 'R5b']]);
  assert.equal(v.numeros[3].estatus, 'USO');
  assert.equal(v.duplicada, null);
  assert.equal(t.tablas.APP_RESGUARDOS[0].CANCELACION, 'POR FIRMAR', 'solo lee');
  assert.throws(() => t.R.vistaCarta([], '', { puedeAprobar: false }), /Solo puedes consultar/);
});

test('cartaEnviada: POR FIRMAR y CARTA FIRMADA avanzan; la enviada sin carta solo se liga; la liga queda en LINEAS', () => {
  const t = escenario();
  const enviada = new Date(2026, 9, 21, 12);
  const r = t.R.cartaEnviada(['R1', 'R2', 'R3', 'R5b', 'R5a'], { carta: LIGA, huella: 'abc', enviadaEn: enviada, asunto: 'Bajas octubre' }, pau);
  assert.deepEqual(r.hechos.map((h) => h.id), ['R1', 'R2', 'R5b']);
  assert.deepEqual(r.omitidos.map((o) => [o.id, o.motivo]), [['R3', 'Ya tiene su carta'], ['R5a', 'Se retiró su cancelación']]);
  assert.equal(r.lineas.length, 3, 'la compañía y razón social de lo que sí se ligó (para el nombre de la carta)');
  const b = (id) => t.tablas.APP_RESGUARDOS.filter((x) => x.ID === id)[0];
  assert.equal(b('R1').CANCELACION, 'CARTA ENVIADA');
  assert.equal(b('R1').CARTA_ENVIADA_EN, enviada);
  assert.equal(b('R1').CARTA, LIGA);
  assert.equal(b('R1').CARTA_HUELLA, 'abc');
  assert.equal(b('R1').CANCELACION_ASUNTO, 'Bajas octubre');
  // Ya enviada: se liga, su fase y su fecha no cambian
  assert.equal(b('R2').CANCELACION, 'CARTA ENVIADA');
  assert.equal(b('R2').CARTA_ENVIADA_EN, undefined);
  assert.equal(b('R2').CARTA, LIGA);
  // En el inventario: SI y la liga, sumada a la que ya tenía
  const l = (id) => t.tablas.LINEAS.filter((x) => x.ID === id)[0];
  assert.equal(l('LIN-1')['CARTA DE CANCELACION'], 'SI');
  assert.equal(l('LIN-1')['LINK CARTA DE CANCELACION'], LIGA);
  assert.equal(l('LIN-2')['LINK CARTA DE CANCELACION'], 'https://otra\n' + LIGA);
  assert.equal(l('LIN-5')['LINK CARTA DE CANCELACION'], LIGA);
  assert.deepEqual(t.escritas.columnas.filter((c) => c[0] === 'LINEAS'), [['LINEAS', 'CARTA DE CANCELACION', 'LINK CARTA DE CANCELACION']]);
  // La misma carta otra vez: se avisa que ya se subió
  const v = t.R.vistaCarta(['4420000001'], 'abc', pau);
  assert.deepEqual(v.duplicada, { lineas: 3, fecha: enviada });
  assert.equal(v.numeros[0].estado, 'YA');
  // La bandeja muestra la carta del trámite
  assert.equal(t.R.bandeja(pau).filas.filter((f) => f.ID === 'R1')[0].CARTAS, LIGA);
  // Sin carta o sin permiso, nada
  assert.throws(() => t.R.cartaEnviada(['R1'], { carta: 'javascript:alert(1)' }, pau), /Falta la carta/);
  assert.throws(() => t.R.cartaEnviada(['R1'], { carta: LIGA }, { puedeAprobar: false }), /Solo puedes consultar/);
});

test('la pantalla: «Subir carta» junto al Excel de Cancelaciones, solo para quien aprueba, y las llamadas con token', () => {
  // La guía de 4 pasos (13-nov): Preparar y Subir carta viven ahí, solo para quien aprueba (pintarGuia la esconde a los demás)
  assert.match(LINEAS, /if \(puede\) activarGuia\(\);\s*pintarGuia\(\);/);
  // Solo si hay líneas que esperan su carta (usuario, 13-nov: si no, ni aparece)
  assert.match(LINEAS, /const ver = vista === 'CANCELACIONES' && !!\(datos && datos\.puedeAprobar\) && \(sinCarta > 0 \|\| recienPreparada\);/);
  assert.match(read('src/html/views/lineas/lineas-resguardos.html'), /<ol class="lnr-guia" id="lnr-guia"[^>]*data-scroll-x hidden><\/ol>/);
  // «Preparar carta»: lo filtrado si trae algo que espera su carta; si no, todo; solo pide el borrador (no cambia fase)
  assert.match(LINEAS, /if \(que === 'preparar'\) prepararCarta\(tabla && tabla\.getFiltradas\(\)\.some\(esperaCarta\) \? tabla\.getFiltradas\(\) : filasVista\(\)\);/);
  // Varias cartas a la vez, una ventana por PDF
  assert.match(LINEAS, /entradaCarta\.multiple = true;/);
  assert.match(LINEAS, /texto: 'Preparar carta'[\s\S]*?visible: \(filas\) => filas\.every\(esperaCarta\), alHacer: \(filas\) => prepararCarta\(filas\)/);
  assert.match(LINEAS, /alConfirmar: \(d\) => llamar\('apiLineasPrepararCarta', d\.ids, d\.fecha, d\.firmante\)/);
  assert.match(read('src/api/Lineas.gs'), /function apiLineasPrepararCarta\(token, ids, fecha, firmante\) \{\r?\n  return TelefoniaService\.prepararCarta\(token, ids, fecha, firmante\);/);
  assert.match(LINEAS, /llamar\('apiLineasLeerCarta', archivo\.name, b64\)/);
  assert.match(LINEAS, /llamar\('apiLineasAplicarCarta', lectura\.archivoId, d\.ids, \{ fecha: d\.fecha, asunto: d\.asunto \}\)/);
  const api = read('src/api/Lineas.gs');
  assert.match(api, /function apiLineasLeerCarta\(token, nombre, base64\) \{\r?\n  return TelefoniaService\.leerCarta\(token, nombre, base64\);/);
  assert.match(api, /function apiLineasAplicarCarta\(token, archivoId, ids, datos\) \{\r?\n  return TelefoniaService\.aplicarCarta\(token, archivoId, ids, datos\);/);
  const tel = read('src/services/TelefoniaService.gs');
  assert.match(tel, /function leerCarta\(token, nombre, base64\) \{\r?\n    const sesion = sinAlcance_\(Permisos\.puedeLeer\(token, MODULO_RESGUARDOS\)\);/);
  // La carta se lee con OCR por DriveUtils y se guarda en su carpeta de la raíz (revisarEntorno la pide en producción)
  const carta = read('src/services/lineas/LineasCarta.gs');
  assert.match(carta, /DriveUtils\.copiarConApi\([\s\S]*?\{ temporal: true \}\)/);
  assert.match(carta, /DriveUtils\.carpetaEnRaiz\('CARTAS DE CANCELACION'\)/);
  assert.match(read('src/Diagnostico.gs'), /'CARTAS DE CANCELACION',/);
  // 17-nov: producción guarda en la carpeta de siempre ("Cartas de Cancelación de Líneas"); un DEV nunca la tiene
  assert.match(carta, /leerConfig_\('LINEAS_CARTAS_CARPETA'\)/);
  const diag = read('src/Diagnostico.gs');
  assert.match(diag, /LINEAS_CARTAS_CARPETA: \{\},/);
  assert.match(diag, /REVISION_EN_RAIZ_SALVO = \{ 'CARTAS DE CANCELACION': 'LINEAS_CARTAS_CARPETA' \}/);
  const bloques = read('src/config/Entornos.gs').replace(/\r\n/g, '\n').split(/\n  '[\w-]{30,}': \{/).slice(1);
  const prod = bloques.filter((b) => /ENTORNO: 'PROD'/.test(b));
  assert.equal(prod.length, 1);
  assert.match(prod[0], /LINEAS_CARTAS_CARPETA: '10aPUK3K9ZyaJCn9rqyU0lU3KZN6y0n-h'/);
  bloques.filter((b) => !/ENTORNO: 'PROD'/.test(b)).forEach((b) => assert.doesNotMatch(b, /LINEAS_CARTAS_CARPETA/));
});

// ------------------------------------------------------------------ «Preparar carta»: el borrador (11-nov)
// Un solo camino a CARTA ENVIADA: el borrador no cambia ninguna fase; la carta firmada se sube con «Subir carta».

function cartaCon(dobles) {
  const d = Object.assign({ LineasResguardos: {}, PdfHtml: {}, leerConfig_: () => null, Utilities: {}, LineasDatos: { ZONA_APP: 'America/Mexico_City' } }, dobles);
  const LineasUtil = { digitos: (v) => String(v == null ? '' : v).replace(/\D/g, '') || null };
  return new Function('LineasResguardos', 'DriveUtils', 'Utilities', 'LineasDatos', 'LineasArchivos', 'LineasUtil', 'PdfHtml', 'leerConfig_',
    read('src/services/lineas/LineasCarta.gs') + '\nreturn LineasCarta;')(d.LineasResguardos, {}, d.Utilities, d.LineasDatos, {}, LineasUtil, d.PdfHtml, d.leerConfig_);
}
const fila = (compania, razon, numero, extra) => Object.assign({ COMPANIA: compania, RAZON_SOCIAL: razon, NUMERO: numero, REGION: '6',
  CUENTA_PADRE: '11122233', ASESOR: 'alfredo' }, extra || {});

test('el borrador: una carta por proveedor + razón social (TELCEL primero), la fecha en letra y el nombre del archivo', () => {
  const C = cartaCon();
  assert.equal(C.fechaEnLetra('2026-10-21'), '21 de octubre de 2026');
  assert.equal(C.fechaEnLetra('2026-01-05'), '5 de enero de 2026');
  assert.equal(C.fechaEnLetra('mañana'), '');
  assert.deepEqual(['TELCEL', 'Telcel', 'AT&T', 'ATT', 'MOVISTAR', ''].map(C.proveedorDeCompania), ['TELCEL', 'TELCEL', 'AT&T', 'AT&T', '', '']);
  const g = C.agrupar([
    fila('AT&T', 'EMPRESA DOS SA DE CV', '4420000004'),
    fila('TELCEL', 'EMPRESA UNO SERVICIOS SC', '4420000002', { REGION: '8' }),
    fila('TELCEL', 'Empresa Uno Servicios SC', '4420000001'),
    fila('MOVISTAR', 'EMPRESA UNO SERVICIOS SC', '4420000009'),
  ]);
  assert.deepEqual(g.grupos.map((x) => [x.proveedor, x.razon, x.filas.map((f) => f.NUMERO)]), [
    ['TELCEL', 'EMPRESA UNO SERVICIOS SC', ['4420000001', '4420000002']],   // por región: 6 antes que 8
    ['AT&T', 'EMPRESA DOS SA DE CV', ['4420000004']]]);
  assert.deepEqual(g.fuera.map((f) => f.NUMERO), ['4420000009']);
  assert.equal(C.nombreCarta('AT&T', 'EMPRESA DOS SA DE CV', '2026-11-11'), 'CARTA CANCELACION ATT EMPRESA DOS SA DE CV 2026-11-11.pdf');
});

// 13-nov: la carta subida se guarda con el mismo nombre que el borrador, con lo que dicen sus líneas
test('nombreGuardada: la compañía y la razón social que más se repiten en sus líneas', () => {
  const C = cartaCon();
  assert.equal(C.nombreGuardada([{ compania: 'TELCEL', razon: 'empresa uno sc' }, { compania: 'TELCEL', razon: 'EMPRESA UNO SC' },
    { compania: 'AT&T', razon: 'EMPRESA DOS SA DE CV' }], '2026-11-13'), 'CARTA CANCELACION TELCEL EMPRESA UNO SC 2026-11-13.pdf');
  assert.equal(C.nombreGuardada([], '2026-11-13'), 'CARTA CANCELACION LINEAS SIN RAZON SOCIAL 2026-11-13.pdf');
});

test('el borrador: la redacción de cada proveedor (singular y plural) y sin firmante el espacio en blanco', () => {
  const C = cartaCon();
  const g = C.agrupar([fila('TELCEL', 'EMPRESA UNO SERVICIOS SC', '442 000 0001'), fila('TELCEL', 'EMPRESA UNO SERVICIOS SC', '4420000002'),
    fila('AT&T', 'EMPRESA DOS SA DE CV', '4420000004', { CUENTA_PADRE: '507000111', ASESOR: 'KARLA' })]).grupos;
  const t = C.datosCarta(g[0], '2026-10-21', 'Lic. Persona De Prueba');
  assert.equal(t.FECHA_LETRA, '21 de octubre de 2026');
  assert.equal(t.ASUNTO, 'Cancelación de líneas');
  assert.equal(t.PROVEEDOR_LEGAL, 'RADIOMÓVIL DIPSA, S.A. DE C.V.');
  assert.equal(t.TITULO_CUENTA, 'CUENTA PADRE');
  assert.match(t.SOLICITUD, /^la cancelación de las siguientes líneas debido a que .* ya no serán necesarias:$/);
  assert.equal(t.DESPUES, '');
  assert.equal(t.FIRMA_RAZON, '');
  // HIJA: la cuenta hija (Telcel la pidió, 20-nov); sin ella, vacía
  assert.deepEqual(t.LINEAS[0], { REGION: '6', CUENTA: '11122233', HIJA: '', NUMERO: '4420000001', RAZON: 'EMPRESA UNO SERVICIOS SC', ASESOR: 'ALFREDO' });
  assert.equal(C.datosCarta(C.agrupar([fila('TELCEL', 'EMPRESA UNO SERVICIOS SC', '4420000001', { CUENTA_HIJA: '1.20034567' })]).grupos[0], '2026-10-21', '').LINEAS[0].HIJA,
    '1.20034567');
  assert.match(read('src/html/pdf/carta-cancelacion.html'), /<th>\{\{TITULO_CUENTA\}\}<\/th><th>CUENTA HIJA<\/th>/);
  assert.match(read('src/html/pdf/carta-cancelacion.html'), /<td>\{\{CUENTA\}\}<\/td><td>\{\{HIJA\}\}<\/td>/);
  const a = C.datosCarta(g[1], '2026-10-21', '');
  assert.equal(a.ASUNTO, 'Cancelación de línea');
  assert.equal(a.PROVEEDOR_LEGAL, 'AT&T Comercialización Móvil, S de R.L de C.V.');
  assert.equal(a.TITULO_CUENTA, 'CUENTA');
  assert.equal(a.SOLICITUD, 'la cancelación de la línea que a continuación se indica:');
  assert.match(a.DESPUES, /^La solicitud de la baja se debe a que ya no requerimos la línea y ha culminado/);
  assert.equal(a.FIRMA_RAZON, 'EMPRESA DOS SA DE CV, REPRESENTADA EN ESTE ACTO POR CONDUCTO DE SU APODERADA LEGAL');
  assert.match(a.FIRMANTE, /^_+$/, 'sin firmante: la raya para escribirlo');
  // La plantilla pide justo eso: nada se queda sin dato
  const PdfHtml = new Function(read('src/utils/PdfHtml.gs') + '\nreturn PdfHtml;')();
  const plantilla = read('src/html/pdf/carta-cancelacion.html');
  assert.deepEqual(PdfHtml.faltantes(plantilla, t), []);
  const html = PdfHtml.llenar(plantilla, t, {}, { fuentes: {}, logos: {} });
  assert.match(html, /<td>4420000002<\/td>/);
  assert.match(html, /Lic\. Persona De Prueba, en representación del Grupo Comercial Ciudad Maderas/);
  assert.doesNotMatch(PdfHtml.llenar(plantilla, a, {}, {}), /\{\{/);
});

test('preparar: solo lo que espera su carta, un PDF por carta, sin escribir nada; sin permiso o apagado, nada', () => {
  const pdfs = [];
  const filas = [fila('TELCEL', 'EMPRESA UNO SERVICIOS SC', '4420000001'), fila('MOVISTAR', 'EMPRESA UNO SERVICIOS SC', '4420000009')];
  const C = cartaCon({
    LineasResguardos: { puedeAprobar: (u) => !!u.puedeAprobar, filasParaCarta: (ids) => ({ filas: filas, omitidas: [{ id: 'R2', numero: '4420000002', motivo: 'Ya tiene su carta' }] }) },
    PdfHtml: { encendido: (d) => d === 'carta-cancelacion', pdf: (doc, datos) => { pdfs.push([doc, datos]); return { blob: { getBytes: () => [37, 80] } }; } },
    leerConfig_: (k) => (k === 'LINEAS_CARTA_FIRMANTE' ? 'Lic. Persona De Prueba' : null),
    Utilities: { base64Encode: () => 'JVA=', formatDate: () => '2026-11-11' },
  });
  const r = C.preparar(['R1', 'R2', 'R9'], '', pau);
  assert.equal(r.fecha, '2026-11-11', 'sin fecha: hoy');
  assert.equal(r.sinFirmante, false);
  assert.deepEqual(r.cartas.map((c) => [c.nombre, c.lineas, c.asesores, c.base64]),
    [['CARTA CANCELACION TELCEL EMPRESA UNO SERVICIOS SC 2026-11-11.pdf', 1, ['ALFREDO'], 'JVA=']]);
  assert.deepEqual(r.omitidas.map((o) => o.numero), ['4420000002', '4420000009']);
  assert.match(r.omitidas[1].motivo, /solo para TELCEL y AT&T \(MOVISTAR\)/);
  assert.equal(pdfs[0][0], 'carta-cancelacion');
  assert.equal(pdfs[0][1].FIRMANTE, 'Lic. Persona De Prueba');
  assert.equal(C.preparar(['R1'], '2026-10-21', pau).fecha, '2026-10-21');
  assert.throws(() => C.preparar(['R1'], '', { puedeAprobar: false }), /Solo puedes consultar/);
  const apagado = cartaCon({ LineasResguardos: { puedeAprobar: () => true }, PdfHtml: { encendido: () => false } });
  assert.throws(() => apagado.preparar(['R1'], '', pau), /todavía no está disponible/);
});

test('filasParaCarta: POR FIRMAR y CARTA FIRMADA sin carta; lo demás con su motivo', () => {
  const t = escenario();
  const r = t.R.filasParaCarta(['R1', 'R2', 'R3', 'R5a', 'R5b'], pau);
  assert.deepEqual(r.filas.map((f) => f.ID).sort(), ['R1', 'R5b']);
  assert.deepEqual(r.omitidas.map((o) => [o.id, o.motivo]).sort(),
    [['R2', 'Está en CARTA ENVIADA'], ['R3', 'Ya tiene su carta'], ['R5a', 'Está en RETIRADA']]);
  assert.equal(t.tablas.APP_RESGUARDOS[0].CANCELACION, 'POR FIRMAR', 'solo lee');
  assert.throws(() => t.R.filasParaCarta(['R1'], { puedeAprobar: false }), /Solo puedes consultar/);
});

// 13-nov: en 25 de las 42 cartas de antes la tabla venía como imagen dentro de un PDF con texto; Drive solo lee la capa de
// texto. Sin números, se lee también la imagen de la primera página (la miniatura en grande), con los permisos de siempre
test('lectura: sin números en el texto, la imagen de la página; las cartas de antes se ligan sin mover ni cambiar fase', () => {
  const carta = read('src/services/lineas/LineasCarta.gs');
  assert.match(carta, /if \(CON_NUMERO\.test\(texto\)\) return texto;/);
  assert.ok(carta.includes("enlace.replace(/=s\\d+$/, '=s2400')"), 'la miniatura se pide en grande');
  assert.match(carta, /DriveUtils\.crearConApi\(\{ name: 'OCR pagina '/);
  const manifiesto = JSON.parse(read('src/appsscript.json'));
  ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/script.external_request']
    .forEach((s) => assert.ok(manifiesto.oauthScopes.includes(s), 'ya estaba: ' + s));
  // Cartas de antes: solo LIGA (CARTA ENVIADA o CANCELADA sin carta), nunca cambia fase ni mueve el PDF
  const viejas = carta.slice(carta.indexOf('function cargarViejas('), carta.indexOf('return { leer,'));
  assert.match(viejas, /if \(x\.estado === 'LIGA'\) cuenta\.LIGA\.push\(x\.id\);/);
  assert.doesNotMatch(viejas, /DriveUtils\.(mover|renombrar)/);
  assert.match(carta, /function lineasCartasAntesAplicar\(confirmacion, idCarpeta\) \{\r?\n  soloEditor_\(\);/);
});

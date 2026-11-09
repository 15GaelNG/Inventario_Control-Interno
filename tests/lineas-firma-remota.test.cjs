/**
 * Pruebas de LineasFirmaRemota.gs (firma a distancia de la Responsiva y la Inspección de Líneas,
 * varios firmantes): guardar con 0/1/varios roles diferidos, completar en cualquier orden, el PDF
 * se genera hasta que el ÚLTIMO pendiente se completa, token vencido/reusado y el resguardo de no
 * cerrar si falta leer una imagen temp. Con Apps Script simulado (Drive y la hoja de RESPONSIVAS
 * LINEAS en memoria). Las pruebas usan el documento RESPONSIVA; `lineas-firma-remota-inspeccion`
 * (si existe) cubre que el mismo motor también sirva a INSPECCIONES LINEAS.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** Entorno de Apps Script simulado: una tabla RESPONSIVAS LINEAS en memoria y un "Drive" de archivos. */
function entorno(filasIniciales) {
  const filas = (filasIniciales || []).map((f, i) => Object.assign({ _fila: i + 2 }, f));
  const drive = new Map(); // id -> { bytes: Buffer, mimeType }
  let siguienteId = 1;
  const llamadasGenerarPdf = [];

  const archivo = (id) => {
    const a = drive.get(id);
    if (!a) throw new Error('Archivo no encontrado: ' + id);
    return { getId: () => id, getBlob: () => ({ getBytes: () => a.bytes }), setTrashed: () => drive.delete(id) };
  };

  const ctx = vm.createContext({
    console, Date: Date,
    LineasUtil: { nucoVisible: (v) => (v ? String(v).padStart(4, '0') : '') },
    Utilities: {
      getUuid: () => 'tok-' + (siguienteId++),
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      base64Decode: (b64) => Buffer.from(b64, 'base64'),
      newBlob: (bytes, mimeType, nombre) => ({ bytes: bytes, mimeType: mimeType, nombre: nombre }),
    },
    DriveApp: {
      getFileById: (id) => archivo(id),
    },
    DriveUtils: {
      carpetaEnRaiz: (nombre) => ({ nombre: nombre }),
      crearArchivo: (carpeta, blob) => {
        const id = 'drv-' + (siguienteId++);
        drive.set(id, { bytes: Buffer.from(blob.bytes), mimeType: blob.mimeType });
        return { getId: () => id };
      },
      aPapelera: (archivoObj) => archivoObj.setTrashed(),
    },
    Config: { urlFirmaPublica: () => 'https://firma.publica/exec' },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://dev.exec' }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'quien-firma@x.com' }) },
    Permisos: { puedeEditar: () => ({ nombre: 'OPERADOR' }) },
    LineasRepo: { TAB: { RESP: 'RESPONSIVAS LINEAS', INSP: 'INSPECCIONES LINEAS' } },
    LineasDatos: {
      leerTabla: (nombre) => { if (nombre !== 'RESPONSIVAS LINEAS') throw new Error('tabla inesperada'); return filas; },
      actualizarFila: (nombre, numFila, cambios) => {
        const fila = filas.find((f) => f._fila === numFila);
        if (!fila) throw new Error('fila no encontrada: ' + numFila);
        Object.assign(fila, cambios);
      },
      asegurarColumnas: () => [],
      conCandado: (fn) => fn(),
      buscarFilasPorId: (nombre, id) => { const f = filas.find((x) => x.ID === id); return f ? [f._fila] : []; },
      leerFilas: (peticiones) => peticiones.map((p) => p.filas.map((n) => filas.find((f) => f._fila === n))),
    },
    LineasPdf: {
      PLANTILLAS: { RESPONSIVA_CELULAR: 'plantilla-resp' },
      plantillaInspeccion: () => 'plantilla-insp',
      generarPdfDesdePlantilla: (plantillaId, registro, imagenes, carpeta, nombre) => {
        const id = 'pdf-' + (siguienteId++);
        drive.set(id, { bytes: Buffer.from('PDF-FALSO'), mimeType: 'application/pdf' });
        return { id: id, nombre: nombre, url: 'https://drive/' + id };
      },
    },
    LineasCaptura: {
      _registroPlantilla: (fila) => Object.assign({}, fila),
      generarPdf: (tipo, id, forzar, usuario, firmasNuevas) => {
        llamadasGenerarPdf.push({ tipo: tipo, id: id, forzar: forzar, firmasNuevas: firmasNuevas });
        return { url: 'https://drive/pdf-final-' + id };
      },
    },
  });
  vm.runInContext(read('src/services/lineas/LineasFirmaRemota.gs') + '\nthis.F = LineasFirmaRemota;', ctx);
  return { F: ctx.F, DOC: ctx.F.DOCUMENTOS.RESPONSIVA, filas: filas, drive: drive, llamadasGenerarPdf: llamadasGenerarPdf };
}

test('generarPendientes_: sin diferir nada no hay nada que hacer (0 roles)', () => {
  const { F, DOC } = entorno([]);
  const cambios = F.generarPendientes_(DOC, [], { CI: 'base64-ci' });
  assert.equal(cambios['ESTADO FIRMA'], 'PENDIENTE');
  // CI siempre se guarda en TEMP aunque no se difiera nada más (igual que Vehicular guarda FIRMA CI TEMP)
  assert.ok(cambios['FIRMA CI TEMP']);
  assert.ok(!cambios['TOKEN FIRMA']);
});

test('generarPendientes_: 1 rol diferido (PRINCIPAL) genera su token y dura 15 días', () => {
  const { F, DOC } = entorno([]);
  const cambios = F.generarPendientes_(DOC, ['PRINCIPAL'], { CI: 'base64-ci' });
  assert.ok(cambios['TOKEN FIRMA']);
  assert.ok(cambios['TOKEN FIRMA EXPIRA'] instanceof Date);
  const dias = (cambios['TOKEN FIRMA EXPIRA'].getTime() - Date.now()) / 86400000;
  assert.ok(dias > 14.9 && dias < 15.1, 'vence en ~15 días');
  assert.equal(cambios['TOKEN FIRMA SEGUNDO'], undefined);
});

test('generarPendientes_: varios roles diferidos (PRINCIPAL, SEGUNDO, TERCER) generan un token cada uno', () => {
  const { F, DOC } = entorno([]);
  const cambios = F.generarPendientes_(DOC, ['PRINCIPAL', 'SEGUNDO', 'TERCER'], { CI: 'ci64' });
  ['TOKEN FIRMA', 'TOKEN FIRMA SEGUNDO', 'TOKEN FIRMA TERCER'].forEach((c) => assert.ok(cambios[c], c));
  assert.notEqual(cambios['TOKEN FIRMA'], cambios['TOKEN FIRMA SEGUNDO']);
  assert.equal(cambios['TOKEN FIRMA CUARTO'], undefined);
});

test('buscarPorToken_ encuentra la fila y el rol correctos; ninguno si el token no existe', () => {
  const { F, DOC } = entorno([
    { ID: 'RES-1', 'TOKEN FIRMA': 'tok-a', 'TOKEN FIRMA SEGUNDO': 'tok-b' },
    { ID: 'RES-2', 'TOKEN FIRMA TERCER': 'tok-c' },
  ]);
  assert.deepEqual([F._buscarPorToken(DOC, 'tok-a').fila.ID, F._buscarPorToken(DOC, 'tok-a').rol], ['RES-1', 'PRINCIPAL']);
  assert.deepEqual([F._buscarPorToken(DOC, 'tok-b').fila.ID, F._buscarPorToken(DOC, 'tok-b').rol], ['RES-1', 'SEGUNDO']);
  assert.deepEqual([F._buscarPorToken(DOC, 'tok-c').fila.ID, F._buscarPorToken(DOC, 'tok-c').rol], ['RES-2', 'TERCER']);
  assert.equal(F._buscarPorToken(DOC, 'no-existe'), null);
});

test('obtenerPendientePorToken: liga vigente trae nombre y detalles; vencida o inexistente avisa el motivo', () => {
  const vence = new Date(Date.now() + 15 * 86400000);
  const vencio = new Date(Date.now() - 1000);
  const { F, DOC } = entorno([
    { ID: 'RES-1', RESPONSABLE: 'ANA TORRES', 'No TELEFONO': '4421234567', MODELO: 'MOTO G', NUCO: '12', 'TOKEN FIRMA': 'tok-a', 'TOKEN FIRMA EXPIRA': vence },
    { ID: 'RES-2', 'NOMBRE SEGUNDO RESPONSABLE': 'LUIS', 'TOKEN FIRMA SEGUNDO': 'tok-b', 'TOKEN FIRMA SEGUNDO EXPIRA': vencio },
  ]);
  const a = F.obtenerPendientePorToken(DOC, 'tok-a');
  assert.equal(a.vigente, true);
  assert.equal(a.nombre, 'ANA TORRES');
  assert.equal(a.documento, DOC.documento);
  assert.ok(Array.isArray(a.detalles));
  assert.ok(a.detalles.some((d) => d.etiqueta === 'Número' && d.valor === '4421234567'));
  const b = F.obtenerPendientePorToken(DOC, 'tok-b');
  assert.equal(b.vigente, false);
  assert.equal(b.motivo, 'vencido');
  const c = F.obtenerPendientePorToken(DOC, 'nada');
  assert.equal(c.vigente, false);
  assert.equal(c.motivo, 'no-existe');
});

test('completarFirma: con 2 pendientes, completar el primero solo guarda y espera -- no genera PDF', () => {
  const vence = new Date(Date.now() + 86400000);
  const { F, DOC, llamadasGenerarPdf } = entorno([
    { ID: 'RES-1', 'ESTADO FIRMA': 'PENDIENTE', 'TOKEN FIRMA': 'tok-a', 'TOKEN FIRMA EXPIRA': vence,
      'TOKEN FIRMA SEGUNDO': 'tok-b', 'TOKEN FIRMA SEGUNDO EXPIRA': vence, 'FIRMA CI TEMP': '' },
  ]);
  const r = F.completarFirma(DOC, 'tok-a', 'base64-firma-principal');
  assert.equal(r.pendiente, true);
  assert.equal(llamadasGenerarPdf.length, 0, 'todavía falta SEGUNDO: no se genera el PDF');
  assert.equal(F.obtenerPendientePorToken(DOC, 'tok-a').motivo, 'no-existe', 'el token ya se limpió, no se puede reusar');
  // El segundo (el que sigue pendiente) debe seguir encontrándose
  assert.equal(F._buscarPorToken(DOC, 'tok-b').rol, 'SEGUNDO');
});

test('_base64DeImagen: acepta el string plano de Líneas y el { base64, mimeType } de FirmaExterna.html/Vehicular', () => {
  const { F } = entorno([]);
  assert.equal(F._base64DeImagen('abc123'), 'abc123');
  assert.equal(F._base64DeImagen({ base64: 'abc123', mimeType: 'image/png' }), 'abc123');
  assert.equal(F._base64DeImagen(null), null);
});

test('completarFirma: bug real (6-nov) -- FirmaExterna.html manda { base64, mimeType } (como Vehicular), no un string plano', () => {
  const vence = new Date(Date.now() + 86400000);
  const { F, DOC, drive } = entorno([
    { ID: 'RES-1', 'ESTADO FIRMA': 'PENDIENTE', 'TOKEN FIRMA': 'tok-a', 'TOKEN FIRMA EXPIRA': vence,
      'TOKEN FIRMA SEGUNDO': 'tok-b', 'TOKEN FIRMA SEGUNDO EXPIRA': vence, 'FIRMA CI TEMP': '' },
  ]);
  const trazo = (texto) => Buffer.from(texto).toString('base64');
  const r = F.completarFirma(DOC, 'tok-a', { base64: trazo('trazo-de-verdad'), mimeType: 'image/png' });
  assert.equal(r.pendiente, true);
  // Antes del arreglo esto guardaba Utilities.base64Decode("[object Object]") -- bytes que no son una
  // imagen real pero que no truenan al guardarse, solo hasta que algo intenta insertarlas en el PDF
  const guardado = [...drive.values()][0];
  assert.ok(guardado, 'se guardó un archivo en el Drive de mentira');
  assert.equal(guardado.bytes.toString('utf8'), 'trazo-de-verdad', 'son los bytes reales del trazo, no "[object Object]"');
});

test('completarFirma: al completar el ÚLTIMO pendiente, se arma firmasNuevas y se genera el PDF una sola vez', () => {
  const { F, DOC, llamadasGenerarPdf, filas } = entorno([]);
  const trazo = (texto) => Buffer.from(texto).toString('base64'); // un "trazo" cualquiera, como base64 válido
  // CI firmó en vivo al guardar (como siempre): su imagen ya quedó en TEMP por generarPendientes_
  const cambiosIniciales = F.generarPendientes_(DOC, ['PRINCIPAL', 'SEGUNDO'], { CI: trazo('trazo-ci') });
  filas.push(Object.assign({ _fila: 2, ID: 'RES-1', 'ESTADO FIRMA': 'PENDIENTE' }, cambiosIniciales));

  const r1 = F.completarFirma(DOC, cambiosIniciales['TOKEN FIRMA'], trazo('trazo-principal'));
  assert.equal(r1.pendiente, true);
  assert.equal(llamadasGenerarPdf.length, 0);

  const r2 = F.completarFirma(DOC, cambiosIniciales['TOKEN FIRMA SEGUNDO'], trazo('trazo-segundo'));
  assert.equal(r2.pendiente, false);
  assert.equal(llamadasGenerarPdf.length, 1);
  const llamada = llamadasGenerarPdf[0];
  assert.equal(llamada.tipo, 'RESPONSIVA');
  assert.equal(llamada.id, 'RES-1');
  assert.equal(llamada.forzar, false);
  // Las 3 firmas (CI la que ya traía, principal y segundo las que llegaron por liga) llegan como base64 plano
  assert.equal(Buffer.from(llamada.firmasNuevas.ci, 'base64').toString(), 'trazo-ci');
  assert.equal(Buffer.from(llamada.firmasNuevas.responsable, 'base64').toString(), 'trazo-principal');
  assert.equal(Buffer.from(llamada.firmasNuevas.segundo, 'base64').toString(), 'trazo-segundo');
  // El documento queda FIRMADO y los archivos temporales se borraron (no se guardan como archivo permanente, 18-sep)
  const fila = filas.find((f) => f.ID === 'RES-1');
  assert.equal(fila['ESTADO FIRMA'], 'FIRMADO');
  ['FIRMA RESPONSABLE TEMP', 'FIRMA SEGUNDO RESPONSABLE TEMP', 'FIRMA CI TEMP'].forEach((c) => assert.equal(fila[c], ''));
});

test('completarFirma: token vencido o ya usado truena, sin tocar nada', () => {
  const { F, DOC } = entorno([
    { ID: 'RES-1', 'TOKEN FIRMA': 'tok-vencido', 'TOKEN FIRMA EXPIRA': new Date(Date.now() - 1000) },
  ]);
  assert.throws(() => F.completarFirma(DOC, 'tok-vencido', 'firma'), /venció/);
  assert.throws(() => F.completarFirma(DOC, 'no-existe', 'firma'), /no es válida/);
  assert.throws(() => F.completarFirma(DOC, 'tok-a', ''), /Falta la firma/);
});

test('completarFirma: si una TEMP ya guardada no se puede leer (archivo borrado), NO cierra el documento', () => {
  const { F, DOC, llamadasGenerarPdf, filas, drive } = entorno([]);
  const cambiosIniciales = F.generarPendientes_(DOC, ['PRINCIPAL'], { CI: 'ci-base64' });
  filas.push(Object.assign({ _fila: 2, ID: 'RES-1', 'ESTADO FIRMA': 'PENDIENTE' }, cambiosIniciales));
  // El archivo de CI "se perdió" en Drive antes de que el principal complete su liga
  const idCi = JSON.parse(cambiosIniciales['FIRMA CI TEMP']).archivoId;
  drive.delete(idCi);

  const r = F.completarFirma(DOC, cambiosIniciales['TOKEN FIRMA'], 'firma-principal-base64');
  assert.equal(r.pendiente, true);
  assert.match(r.aviso, /no se pudo leer otra firma/);
  assert.equal(llamadasGenerarPdf.length, 0, 'no se cierra el documento con una firma ilegible');
  const fila = filas.find((f) => f.ID === 'RES-1');
  assert.equal(fila['ESTADO FIRMA'], 'PENDIENTE', 'se queda pendiente para reintentar, no FIRMADO a medias');
});

test('vistaPrevia: arma un PDF con lo que ya hay, sin guardar nada (se tira enseguida)', () => {
  const vence = new Date(Date.now() + 86400000);
  const { F, DOC, drive } = entorno([
    { ID: 'RES-1', COMENTARIO: 'un comentario', 'TOKEN FIRMA': 'tok-a', 'TOKEN FIRMA EXPIRA': vence },
  ]);
  const antes = drive.size;
  const pdf = F.vistaPrevia(DOC, 'tok-a');
  assert.equal(pdf.mimeType, 'application/pdf');
  assert.ok(pdf.base64);
  assert.equal(drive.size, antes, 'el PDF de la vista previa se tira enseguida, no queda en Drive');
  assert.throws(() => F.vistaPrevia(DOC, 'no-existe'), /no es válida/);
});

test('regenerarLiga: solo si ese rol tenía liga (no presencial) y el documento sigue PENDIENTE', () => {
  const vence = new Date(Date.now() + 86400000);
  const { F, DOC, filas } = entorno([
    { ID: 'RES-1', 'ESTADO FIRMA': 'PENDIENTE', 'TOKEN FIRMA': 'tok-viejo', 'TOKEN FIRMA EXPIRA': vence },
    { ID: 'RES-2', 'ESTADO FIRMA': 'FIRMADO' },
    { ID: 'RES-3', 'ESTADO FIRMA': 'PENDIENTE' }, // SEGUNDO nunca tuvo liga (firmó presencial)
  ]);
  const ligaNueva = F.regenerarLiga(DOC, 'tok-ses', 'RES-1', 'PRINCIPAL');
  assert.match(ligaNueva, /tipo=lineas-responsiva/);
  assert.notEqual(filas[0]['TOKEN FIRMA'], 'tok-viejo', 'el token viejo ya no sirve');
  assert.throws(() => F.regenerarLiga(DOC, 'tok-ses', 'RES-2', 'PRINCIPAL'), /ya quedó firmado/);
  assert.throws(() => F.regenerarLiga(DOC, 'tok-ses', 'RES-3', 'SEGUNDO'), /firmó presencial/);
  assert.throws(() => F.regenerarLiga(DOC, 'tok-ses', 'RES-1', 'CI'), /Rol inválido/);
});

test('copiarLiga: la liga siempre se arma en el servidor (Config.urlFirmaPublica), nunca en el navegador', () => {
  const vence = new Date(Date.now() + 86400000);
  const { F, DOC } = entorno([{ ID: 'RES-1', 'TOKEN FIRMA SEGUNDO': 'tok-b', 'TOKEN FIRMA SEGUNDO EXPIRA': vence }]);
  const liga = F.copiarLiga(DOC, 'tok-ses', 'RES-1', 'SEGUNDO');
  assert.equal(liga, 'https://firma.publica/exec?firmar=1&tipo=lineas-responsiva&token=tok-b');
  assert.throws(() => F.copiarLiga(DOC, 'tok-ses', 'RES-404', 'SEGUNDO'), /No se encontró/);
});

// Usuario, 6-nov: "Ver ligas de firma" en Documentos -- con el nombre de cada quien (no "Responsable (segundo)"),
// para volver a copiar o regenerar una liga después de cerrar el recuadro que aparece al guardar.
test('estadoLigas: el nombre y el estado de cada rol que SÍ se difirió; el que firmó presencial no sale', () => {
  const vence = new Date(Date.now() + 86400000);
  const { F, DOC } = entorno([{
    ID: 'RES-1', RESPONSABLE: 'ANA PEREZ', 'TOKEN FIRMA': 'tok-a', 'TOKEN FIRMA EXPIRA': vence,
    'NOMBRE SEGUNDO RESPONSABLE': 'AYRTON SEPULVEDA', 'FIRMADO POR SEGUNDO': 'ayrton@x.com', // ya firmó por su liga
    'NOMBRE TERCER RESPONSABLE': 'EMMANUEL CHAVEZ', // nunca tuvo liga: firmó presencial
  }]);
  const estados = JSON.parse(JSON.stringify(F.estadoLigas(DOC, 'tok-ses', 'RES-1')));
  assert.deepEqual(estados, [
    { rol: 'PRINCIPAL', nombre: 'ANA PEREZ', estado: 'PENDIENTE', liga: 'https://firma.publica/exec?firmar=1&tipo=lineas-responsiva&token=tok-a', vencida: false },
    { rol: 'SEGUNDO', nombre: 'AYRTON SEPULVEDA', estado: 'FIRMADO', liga: '', vencida: false },
  ]);
  assert.throws(() => F.estadoLigas(DOC, 'tok-ses', 'RES-404'), /No se encontró/);
});

// Usuario, 9-nov: si pasan los 15 días, la tabla de Documentos ofrece "Nueva liga" en vez de copiar la que ya no sirve.
test('estadoLigas: la liga que pasó sus días sale vencida (y la que no tiene fecha también)', () => {
  const ayer = new Date(Date.now() - 86400000);
  const { F, DOC } = entorno([{
    ID: 'RES-1', RESPONSABLE: 'ANA PEREZ', 'TOKEN FIRMA': 'tok-a', 'TOKEN FIRMA EXPIRA': ayer,
    'NOMBRE SEGUNDO RESPONSABLE': 'AYRTON SEPULVEDA', 'TOKEN FIRMA SEGUNDO': 'tok-b', // sin fecha de vencimiento
  }]);
  const estados = JSON.parse(JSON.stringify(F.estadoLigas(DOC, 'tok-ses', 'RES-1')));
  assert.deepEqual(estados.map((e) => [e.rol, e.estado, e.vencida]), [['PRINCIPAL', 'PENDIENTE', true], ['SEGUNDO', 'PENDIENTE', true]]);
});

test('ligasDeDocumentos: las de varios documentos de una vez, por ID; el que no existe no sale', () => {
  const vence = new Date(Date.now() + 86400000);
  const { F } = entorno([
    { ID: 'RES-1', RESPONSABLE: 'ANA PEREZ', 'TOKEN FIRMA': 'tok-a', 'TOKEN FIRMA EXPIRA': vence },
    { ID: 'RES-2', RESPONSABLE: 'LUIS GARCIA', 'TOKEN FIRMA': 'tok-c', 'TOKEN FIRMA EXPIRA': vence },
  ]);
  const ligas = JSON.parse(JSON.stringify(F.ligasDeDocumentos('RESPONSIVA', ['RES-2', 'RES-404', 'RES-1'])));
  assert.deepEqual(Object.keys(ligas).sort(), ['RES-1', 'RES-2']);
  assert.equal(ligas['RES-1'][0].nombre, 'ANA PEREZ');
  assert.equal(ligas['RES-2'][0].liga, 'https://firma.publica/exec?firmar=1&tipo=lineas-responsiva&token=tok-c');
  assert.deepEqual(JSON.parse(JSON.stringify(F.ligasDeDocumentos('RESPONSIVA', []))), {});
});

test('DOCUMENTOS.INSPECCION: su rol CI usa NOMBRE INSPECTOR/FIRMA INSPECTOR y la clave "inspector" para generarPdf', () => {
  const { F } = entorno([]);
  const DOC_INSP = F.DOCUMENTOS.INSPECCION;
  assert.equal(DOC_INSP.tipoPdf, 'INSPECCION');
  assert.equal(DOC_INSP.tipoLiga, 'lineas-inspeccion');
  assert.equal(DOC_INSP.colNombreCI, 'NOMBRE INSPECTOR');
  assert.equal(DOC_INSP.marcadorCI, 'FIRMA INSPECTOR');
  const cambios = F.generarPendientes_(DOC_INSP, ['PRINCIPAL'], { CI: 'base64-inspector' });
  assert.ok(cambios['FIRMA INSPECTOR TEMP'], 'CI de Inspección se guarda en su propia columna TEMP');
});

// ---------------------------------------------------------------------------------------------
// La integración dentro de LineasCaptura.gs (guardarResponsiva/guardarResponsivaEnCandado_ y
// guardarInspeccion): sin simular todo su entorno (identificaciones, Drive, catálogos…), se
// revisa en el código fuente -- mismo estilo que tests/lineas-responsiva-unica.test.cjs.
test('guardarResponsiva/guardarResponsivaEnCandado_: diferir no afecta el camino de hoy; CI sigue obligatorio', () => {
  const cap = read('src/services/lineas/LineasCaptura.gs');
  // CI nunca se agrega a diferir (sigue firmando presencial, como antes) y su firma sigue obligatoria
  assert.match(cap, /if \(!datos\.firmaCiBase64\) throw new Error\('FIRMA RESPONSABLE DE ' \+ MARCA_LINEAS_\(\) \+ ' es obligatorio'\);/);
  const rolesFn = cap.slice(cap.indexOf('function rolesADiferir_('), cap.indexOf('function guardarResponsiva('));
  assert.match(rolesFn, /LineasFirmaRemota\.ROLES_DIFERIBLES\.filter/);
  // Compartida por Responsiva e Inspección: PRINCIPAL se ignora igual que un adicional sin nombre
  assert.match(rolesFn, /valores\[rol === 'PRINCIPAL' \? 'RESPONSABLE' : \('NOMBRE ' \+ rol \+ ' RESPONSABLE'\)\]/);
  const candado = cap.slice(cap.indexOf('function guardarResponsivaEnCandado_('), cap.indexOf('function exigirInspeccion('));
  // El insert de la fila (contrato de lineas-responsiva-unica.test.cjs) no cambió: el parche de firma va DESPUÉS
  assert.match(candado, /LineasDatos\.agregarFilas\(LineasRepo\.TAB\.RESP, \[fila\]\);\s*\/\/ Firma a distancia/);
  assert.match(candado, /if \(diferir && diferir\.length\) \{/);
  assert.match(candado, /LineasFirmaRemota\.generarPendientes_\(DOC, diferir, imagenesYaCapturadas\)/);
  assert.match(candado, /LineasDatos\.asegurarColumnas\(LineasRepo\.TAB\.RESP, LineasFirmaRemota\.columnasNuevas_\(DOC\)\)/);
  assert.match(candado, /ligas = LineasFirmaRemota\.ligasDe_\(DOC, cambiosFirma\)/);
  assert.match(candado, /return \{ obj: obj, hecho: hecho, ligas: ligas \};/);
});

test('guardarInspeccion: mismo mecanismo de diferir que la Responsiva (usuario, 6-nov)', () => {
  const cap = read('src/services/lineas/LineasCaptura.gs');
  const fn = cap.slice(cap.indexOf('function guardarInspeccion('), cap.indexOf('function rolesADiferir_('));
  assert.match(fn, /const diferir = rolesADiferir_\(datos, datos\.valores \|\| \{\}\);/);
  assert.match(fn, /LineasFirmaRemota\.DOCUMENTOS\.INSPECCION/);
  assert.match(fn, /LineasFirmaRemota\.generarPendientes_\(DOC, diferir, imagenesYaCapturadas\)/);
  assert.match(fn, /if \(diferir\.length\) \{[\s\S]*?return \{ id: id, pendiente: true, ligas: res\.ligas \|\| \{\}, filas: filas \};/);
  // El camino de siempre (nada diferido) sigue exactamente igual
  assert.match(fn, /firmasCache_\('INSPECCION', id, \{ inspector: datos\.firmaInspectorBase64, responsable: datos\.firmaResponsableBase64 \|\| null, patron: datos\.patronBase64 \|\| null,/);
});

test('firmarPresencial ("Firmar aquí", 9-nov): firma sin la liga, aunque haya vencido, y con la última genera el PDF', () => {
  const { F, DOC, llamadasGenerarPdf, filas } = entorno([]);
  const trazo = (texto) => Buffer.from(texto).toString('base64');
  const cambiosIniciales = F.generarPendientes_(DOC, ['PRINCIPAL', 'SEGUNDO'], { CI: trazo('trazo-ci') });
  // La liga del principal ya venció: presencial sí puede firmar (la persona está ahí)
  cambiosIniciales['TOKEN FIRMA EXPIRA'] = new Date(Date.now() - 1000);
  filas.push(Object.assign({ _fila: 2, ID: 'RES-1', 'ESTADO FIRMA': 'PENDIENTE' }, cambiosIniciales));

  const r1 = F.firmarPresencial(DOC, 'sesion', 'RES-1', 'PRINCIPAL', trazo('trazo-principal'));
  assert.equal(r1.pendiente, true);
  const fila = filas.find((f) => f.ID === 'RES-1');
  assert.equal(fila['TOKEN FIRMA'], '', 'su liga deja de servir');
  assert.equal(fila['FIRMADO POR'], 'PRESENCIAL: OPERADOR');
  assert.equal(llamadasGenerarPdf.length, 0);
  // Ya firmó: ni otra vez presencial ni por la liga vieja
  assert.throws(() => F.firmarPresencial(DOC, 'sesion', 'RES-1', 'PRINCIPAL', trazo('otra')), /ya firmó/);
  assert.throws(() => F.completarFirma(DOC, cambiosIniciales['TOKEN FIRMA'], trazo('otra')), /no es válida/);

  // La última (SEGUNDO) cierra el documento igual que por liga
  const r2 = F.firmarPresencial(DOC, 'sesion', 'RES-1', 'SEGUNDO', { base64: trazo('trazo-segundo'), mimeType: 'image/png' });
  assert.equal(r2.pendiente, false);
  assert.equal(llamadasGenerarPdf.length, 1);
  assert.equal(Buffer.from(llamadasGenerarPdf[0].firmasNuevas.responsable, 'base64').toString(), 'trazo-principal');
  assert.equal(Buffer.from(llamadasGenerarPdf[0].firmasNuevas.segundo, 'base64').toString(), 'trazo-segundo');
  assert.equal(fila['ESTADO FIRMA'], 'FIRMADO');
  assert.throws(() => F.firmarPresencial(DOC, 'sesion', 'RES-1', 'SEGUNDO', trazo('x')), /ya quedó firmado/);
});

test('firmarPresencial: rol inválido, sin firma o documento inexistente truenan sin tocar nada', () => {
  const { F, DOC } = entorno([{ ID: 'RES-1', 'ESTADO FIRMA': 'PENDIENTE', 'TOKEN FIRMA': 'tok-a' }]);
  assert.throws(() => F.firmarPresencial(DOC, 'sesion', 'RES-1', 'CI', 'x'), /Rol inválido/);
  assert.throws(() => F.firmarPresencial(DOC, 'sesion', 'RES-1', 'PRINCIPAL', ''), /Falta la firma/);
  assert.throws(() => F.firmarPresencial(DOC, 'sesion', 'RES-9', 'PRINCIPAL', 'eA=='), /No se encontró/);
});

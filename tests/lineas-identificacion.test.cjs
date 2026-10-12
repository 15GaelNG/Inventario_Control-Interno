// Identificación de cada responsable en la responsiva (usuario, 9-oct; pendiente 2.27, paso 1): fotos o un PDF por
// responsable; las fotos se juntan en un PDF en el navegador y se guardan en la carpeta de la responsiva en NUCOS, con
// un renglón en APP_IDENTIFICACIONES por ID PERSONA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r/g, '');

const PDF = Buffer.from('%PDF-1.4\n%prueba\n').toString('base64');
const VALORES = { 'RESPONSABLE': 'juan perez lopez', 'No EMPLEADO': 'HA00059', 'IDENTIFICACION': 'INE', 'CORREO': 'juan@x.com',
  'NOMBRE SEGUNDO RESPONSABLE': 'ANA RUIZ', 'NO EMPLEADO SEGUNDO RESPONSABLE': 'CIB01608' };

/** LineasIdentificaciones con Drive, hojas y Capital Humano simulados. */
function modulo(opciones) {
  const o = opciones || {};
  const creados = [];
  const papelera = [];
  const filas = [];
  const carpetas = [];
  const copias = [];
  const registro = o.registro || []; // renglones de APP_IDENTIFICACIONES (paso 3)
  const carpeta = (id) => ({
    getId: () => id,
    createFile: (blob) => {
      if (o.fallaAlCrear && creados.length >= o.fallaAlCrear) throw new Error('Drive no responde');
      const f = { id: 'ARCH' + (creados.length + 1), nombre: blob.nombre, mime: blob.mime, carpeta: id };
      creados.push(f);
      return { getId: () => f.id, setTrashed: () => papelera.push(f.id) };
    },
  });
  const ctx = vm.createContext({
    console: { warn: () => {}, error: () => {}, log: () => {} },
    Utilities: {
      base64Decode: (s) => Array.from(Buffer.from(String(s), 'base64')),
      newBlob: (bytes, mime, nombre) => ({ bytes, mime, nombre }),
    },
    MimeType: { PDF: 'application/pdf' },
    DriveApp: {
      getFolderById: (id) => carpeta(id),
      getFileById: (id) => ({
        setTrashed: () => papelera.push(id),
        isTrashed: () => (o.enPapelera || []).indexOf(id) >= 0,
        makeCopy: (nombre, destino) => { copias.push({ de: id, nombre, carpeta: destino.getId() }); return { getId: () => 'COPIA' + copias.length }; },
      }),
    },
    DriveUtils: { marcarAutor: (f) => f },
    CapitalHumano: { idPara: (hoja, r) => (r['RESPONSABLE'] === 'JUAN PEREZ LOPEZ' ? 'PER-000123' : '') },
    LineasUtil: {
      nuco4: (n) => (/^\d+$/.test(String(n || '').trim()) ? String(n).trim().padStart(4, '0') : ''),
      nucoVisible: (n) => String(n || ''),
    },
    LineasRepo: { TAB: { LINEAS: 'LINEAS TELEFONICAS' } },
    LineasArchivos: {
      carpetaEvidenciaNuco: (tipo, nuco, fecha) => {
        carpetas.push({ tipo, nuco, fecha });
        return { carpetaId: 'RESP' + nuco, ruta: nuco + '/CARTA RESPONSIVA/2026/RESP 09 10' };
      },
      carpetaDeApp: (ruta) => carpeta('APP_' + ruta),
      descartarCarpeta: (id) => papelera.push(id),
      olvidarNuco: () => {},
    },
    LineasDatos: {
      existeTabla: () => true,
      asegurarPestana: () => {},
      agregarFilas: (hoja, nuevas) => { nuevas.forEach((f) => filas.push(Object.assign({ _hoja: hoja }, f))); },
      buscarFilasVarios: (hoja, columna, valores) => registro.map((f, i) => (valores.indexOf(f[columna]) >= 0 ? i + 2 : 0)).filter(Boolean),
      leerFilas: (peticiones) => peticiones.map((q) => q.filas.map((n) => registro[n - 2])),
      leerTabla: () => registro.slice(),
    },
  });
  vm.runInContext(read('src/services/lineas/LineasIdentificaciones.gs') + '\nthis.I = LineasIdentificaciones;', ctx);
  return { I: ctx.I, creados, papelera, filas, carpetas, copias };
}

test('revisar: solo PDF, de un responsable que está en la responsiva, uno por responsable', () => {
  const { I } = modulo();
  assert.deepEqual(Array.from(I.revisar(null, VALORES)), []);
  const lista = I.revisar([{ orden: 0, base64: PDF }, { orden: 1, tipo: 'licencia de conducir', base64: PDF }], VALORES);
  assert.equal(lista.length, 2);
  assert.equal(lista[0].tipo, 'INE', 'el del principal sale de IDENTIFICACION');
  assert.equal(lista[0].persona.nombre, 'JUAN PEREZ LOPEZ');
  assert.equal(lista[1].tipo, 'LICENCIA DE CONDUCIR', 'los demás eligen el suyo');
  assert.equal(lista[1].persona.noEmpleado, 'CIB01608');
  const foto = Buffer.from('\xff\xd8\xff\xe0 jpeg', 'latin1').toString('base64');
  assert.throws(() => I.revisar([{ orden: 0, base64: foto }], VALORES), /no es un PDF/);
  assert.throws(() => I.revisar([{ orden: 2, base64: PDF }], VALORES), /Falta el nombre del responsable 3/);
  assert.throws(() => I.revisar([{ orden: 0, base64: PDF }, { orden: 0, base64: PDF }], VALORES), /dos veces/);
  assert.throws(() => I.revisar([{ orden: 7, base64: PDF }], VALORES), /no existe/);
  assert.throws(() => I.revisar([{ orden: 0, base64: '' }], VALORES), /vacía/);
});

test('nombre del archivo: tipo, nombre y ID PERSONA (el número de empleado puede cambiar)', () => {
  const { I } = modulo();
  assert.equal(I.nombreArchivo('INE', 'JUAN PEREZ LOPEZ', 'PER-000123'), 'INE - JUAN PEREZ LOPEZ - PER-000123.pdf');
  assert.equal(I.nombreArchivo('INE', 'ANA RUIZ', ''), 'INE - ANA RUIZ.pdf', 'sin ID PERSONA (no está en Capital Humano), solo el nombre');
  assert.equal(I.nombreArchivo('', 'A/B: C', ''), 'INE - A B C.pdf', 'sin caracteres que Drive no acepta');
});

test('escribir: en la carpeta de la responsiva en NUCOS (RESP DD MM) y un renglón por persona', () => {
  const { I, creados, filas, carpetas } = modulo();
  const lista = I.revisar([{ orden: 0, base64: PDF }, { orden: 1, base64: PDF }], VALORES);
  const fecha = I.fechaDe('2026-10-09T10:30');
  const escritos = I.escribir(lista, '12', fecha, 'Files');
  assert.equal(carpetas[0].tipo, 'RESPONSIVA');
  assert.equal(carpetas[0].nuco, '0012');
  assert.equal(escritos.carpetaId, 'RESP0012');
  assert.deepEqual(creados.map((f) => [f.nombre, f.carpeta, f.mime]), [
    ['INE - JUAN PEREZ LOPEZ - PER-000123.pdf', 'RESP0012', 'application/pdf'],
    ['INE - ANA RUIZ.pdf', 'RESP0012', 'application/pdf'],
  ]);
  I.registrar(escritos, 'RES-1', { id: 'EQU-1', nuco: '0012' }, { correo: 'ci@x.com' }, new Date());
  assert.equal(filas.length, 2);
  assert.equal(filas[0]._hoja, 'APP_IDENTIFICACIONES');
  assert.equal(filas[0]['ID PERSONA'], 'PER-000123');
  assert.equal(filas[0]['ID RESPONSIVA'], 'RES-1');
  assert.equal(filas[0]['ARCHIVO ID'], 'ARCH1');
  assert.equal(filas[1]['NO EMPLEADO'], 'CIB01608');
  assert.equal(filas[1]['ORIGEN'], 'RESPONSIVA');
});

test('sin NUCO va a la carpeta de la app; si Drive falla a la mitad, no queda nada', () => {
  const sinNuco = modulo();
  const escritos = sinNuco.I.escribir(sinNuco.I.revisar([{ orden: 0, base64: PDF }], VALORES), '', new Date(), 'Files');
  assert.equal(escritos.carpetaId, '');
  assert.equal(sinNuco.creados[0].carpeta, 'APP_Files');
  sinNuco.I.descartar(escritos);
  assert.deepEqual(sinNuco.papelera, ['ARCH1'], 'sin carpeta propia: los archivos sueltos a la papelera');

  const falla = modulo({ fallaAlCrear: 1 });
  assert.throws(() => falla.I.escribir(falla.I.revisar([{ orden: 0, base64: PDF }, { orden: 1, base64: PDF }], VALORES), '12', new Date(), 'Files'),
    /No se pudo guardar la identificación: Drive no responde/);
  assert.deepEqual(falla.papelera, ['RESP0012'], 'la carpeta nueva de la responsiva, a la papelera');
});

test('la responsiva: la identificación se escribe antes y se descarta si la responsiva no se guarda', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const fn = captura.slice(captura.indexOf('  function guardarResponsiva('), captura.indexOf('  function exigirInspeccion('));
  const escribe = fn.indexOf('LineasIdentificaciones.escribir(');
  const guarda = fn.indexOf('guardarResponsivaEnCandado_(datos');
  assert.ok(escribe > 0 && guarda > escribe, 'primero los archivos, después la responsiva');
  assert.match(fn, /\} catch \(e\) \{\n\s+LineasIdentificaciones\.descartar\(escritos\);\n\s+throw e;/);
  // La carpeta de la responsiva es la de su identificación: su PDF va ahí (destinoPdf_ usa CARPETA_ID)
  assert.match(fn, /'CARPETA_ID': escritos \? escritos\.carpetaId : '', 'RUTA': escritos \? escritos\.ruta : ''/);
  assert.match(fn, /LineasIdentificaciones\.registrar\(escritos, id, obj\.reg, usuario, ahora\);/);
  // El formulario: una para el principal y una debajo del nombre de cada responsable adicional
  assert.match(captura, /campo_\('IDENTIFICACION', 'Identificación', 'listaAbierta'[^\n]*\n\s+archivoIdentificacion_\(0\),/);
  assert.match(captura, /conIdentificacionAdicional_\(LineasRegistros\.camposAdicionales\(/);
  assert.match(captura, /e\.tipo === 'campo' && e\.control !== 'identificacion'/);
  // La página de la responsiva las ofrece
  assert.match(read('src/services/TelefoniaService.gs'), /if \(!esInspeccion\) salida\.identificaciones = LineasIdentificaciones\.deResponsiva\(\[id\]\);/);
  // La hoja se crea sola: no se pide antes de desplegar
  assert.match(read('src/config/Entidades.gs'), /'APP_IDENTIFICACIONES': \{ prefijo: 'IDN'/);
  assert.match(read('src/Diagnostico.gs'), /if \(hoja === 'APP_IDENTIFICACIONES'\) return true;/);
});

test('pantalla: fotos o PDF por responsable, se ven antes de guardar y viajan con la responsiva', () => {
  const pantalla = read('src/html/js/lineas.html');
  assert.match(pantalla, /\} else if \(e\.control === 'identificacion'\) \{\n\s+control = htmlIdentificacion\(e, id\);/);
  assert.match(pantalla, /accept="image\/\*,application\/pdf" multiple data-ine-archivo/);
  assert.match(pantalla, /if \(pdfs\.length && fotos\.length\) return error\('Elige fotos o un PDF, no los dos\.'\);/);
  assert.match(pantalla, /activarIdentificaciones\(\$\('#ln-captura-cuerpo', raiz\)\);/);
  assert.match(pantalla, /leerIdentificaciones\(\$\('#ln-captura-cuerpo', raiz\), valores\)\]\)\.then\(\(\[responsable, ci, identificaciones\]\)/);
  assert.match(pantalla, /usarFirmaGuardada: !!firmaCi\.guardada, identificaciones: identificaciones,/);
  // Las listas del cuerpo del modal se escuchan una sola vez (el cuerpo se reutiliza)
  assert.match(pantalla, /if \(cuerpo\._identificacionesActivas\) return;/);
});

/** armarPdfDeJpeg de la pantalla, en Node. */
function armarPdf() {
  const pantalla = read('src/html/js/lineas.html');
  const inicio = pantalla.indexOf('    function armarPdfDeJpeg(fotos) {');
  const fin = pantalla.indexOf('\n    }\n', inicio) + 6;
  const ctx = vm.createContext({ TextEncoder, Uint8Array });
  vm.runInContext(pantalla.slice(inicio, fin) + '\nthis.armar = armarPdfDeJpeg;', ctx);
  return ctx.armar;
}

test('fotos → PDF: carta, dos por hoja, el JPEG va tal cual y la tabla xref apunta a cada objeto', () => {
  const armar = armarPdf();
  const jpeg = (n) => Uint8Array.from(Buffer.from('\xff\xd8\xff\xe0JPEG' + n + '\xff\xd9', 'latin1'));
  const fotos = [{ ancho: 2400, alto: 1500, bytes: jpeg(1) }, { ancho: 1500, alto: 2400, bytes: jpeg(2) }, { ancho: 800, alto: 600, bytes: jpeg(3) }];
  const pdf = Buffer.from(armar(fotos));
  const txt = pdf.toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4\n'));
  assert.ok(txt.endsWith('%%EOF\n'));
  assert.match(txt, /\/Count 2 >>/, 'tres fotos: dos hojas');
  assert.equal((txt.match(/\/MediaBox \[0 0 612 792\]/g) || []).length, 2, 'tamaño carta');
  assert.equal((txt.match(/\/Filter \/DCTDecode/g) || []).length, 3);
  [1, 2, 3].forEach((n) => assert.ok(txt.includes('\xff\xd8\xff\xe0JPEG' + n + '\xff\xd9'), 'la foto ' + n + ' va sin volver a comprimirse'));
  // La tabla xref: cada posición apunta a «N 0 obj»
  const xref = Number(txt.match(/startxref\n(\d+)\n/)[1]);
  assert.ok(txt.slice(xref).startsWith('xref\n0 '));
  const entradas = txt.slice(xref).split('\n').slice(3).filter((l) => / 00000 n $/.test(l));
  assert.equal(entradas.length, 9, 'catálogo, páginas y por hoja página, contenido y sus fotos (2 + 4 + 3)');
  entradas.forEach((l, i) => assert.ok(txt.slice(Number(l.slice(0, 10))).startsWith((i + 1) + ' 0 obj\n'), 'objeto ' + (i + 1)));
  // /Length de cada flujo = sus bytes
  for (const m of txt.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const desde = m.index + m[0].length;
    assert.equal(txt.slice(desde + Number(m[1]), desde + Number(m[1]) + 10), '\nendstream');
  }
  // Una sola foto ocupa la hoja (sin la mitad vacía)
  const una = Buffer.from(armar([fotos[0]])).toString('latin1');
  assert.match(una, /\/Count 1 >>/);
  const cm = una.match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/);
  assert.equal(Number(cm[1]), 540, 'a todo lo ancho entre márgenes');
});

test('el campo de archivos se queda dentro de su botón (cuadro blanco al regresar de elegir, 9-oct)', () => {
  const css = read('src/html/lineas-estilos.html');
  assert.match(css, /\.ln-upload \{\n\s+position: relative; overflow: hidden;/);
  assert.match(css, /\.ln-upload input \{ position: absolute; top: 0; left: 0;/);
  assert.match(read('src/services/lineas/LineasCaptura.gs'), /campo_\('_IDENTIFICACION_' \+ orden, 'Identificación', 'identificacion',/);
});

test('fotos de la inspección: miniatura desde que se eligen, espera encima, clic en grande y X para quitar (usuario, 9-oct)', () => {
  const pantalla = read('src/html/js/lineas.html');
  const fn = pantalla.slice(pantalla.indexOf('      function subirImagenCaptura('), pantalla.indexOf('      function manejarSubidaArchivo('));
  assert.match(fn, /caja\.className = 'ln-miniatura ln-foto-subiendo';/, 'guardar sigue esperando a .ln-foto-subiendo');
  assert.match(fn, /<img src="' \+ esc\(url\) \+ '" alt="' \+ esc\(archivo\.name\) \+ '" data-ver-foto \/>/);
  assert.match(fn, /data-quitar-foto="' \+ esc\(subido\.id\) \+ '"/);
  assert.match(fn, /caja\.className = 'ln-miniatura ln-miniatura-error';/);
  assert.match(pantalla, /const verFoto = ev\.target\.closest\('\[data-ver-foto\]'\);\n\s+if \(verFoto\) \{ verFotoEnGrande\(verFoto\.getAttribute\('src'\)\); return; \}/);
  assert.match(pantalla, /const caja = quitarFoto\.closest\('\.ln-miniatura, \.ln-foto-chip'\);/);
});

// Paso 3 (pendiente 2.29): la identificación que la persona ya tiene en el registro se ofrece con «¿Es correcta?»
const JUAN = { 'ID PERSONA': 'PER-000123', 'NOMBRE': 'JUAN PÉREZ LÓPEZ', 'NO EMPLEADO': 'HA00059', 'TIPO': 'INE' };
const REGISTRO = [
  Object.assign({ 'ID': 'IDN-VIEJA', 'ARCHIVO ID': 'A-VIEJA', 'NUCO': '0003', 'FECHA': '2025-03-01 10:00:00' }, JUAN),
  Object.assign({ 'ID': 'IDN-NUEVA', 'ARCHIVO ID': 'A-NUEVA', 'NUCO': '0012', 'FECHA': '2026-05-02 10:00:00' }, JUAN),
  Object.assign({ 'ID': 'IDN-TIRADA', 'ARCHIVO ID': 'A-TIRADA', 'NUCO': '0099', 'FECHA': '2026-09-01 10:00:00' }, JUAN),
  { 'ID': 'IDN-OTRA', 'ID PERSONA': 'PER-999', 'NOMBRE': 'LUIS SOTO', 'NO EMPLEADO': 'X1', 'ARCHIVO ID': 'A-OTRA', 'TIPO': 'INE', 'NUCO': '0050', 'FECHA': '2026-09-09 10:00:00' },
  { 'ID': 'IDN-HOM1', 'ID PERSONA': 'PER-1', 'NOMBRE': 'MARIA LOPEZ', 'NO EMPLEADO': 'M1', 'ARCHIVO ID': 'A-HOM1', 'TIPO': 'INE', 'NUCO': '0060', 'FECHA': '2026-01-01 10:00:00' },
  { 'ID': 'IDN-HOM2', 'ID PERSONA': 'PER-2', 'NOMBRE': 'MARIA LOPEZ', 'NO EMPLEADO': 'M2', 'ARCHIVO ID': 'A-HOM2', 'TIPO': 'INE', 'NUCO': '0061', 'FECHA': '2026-01-02 10:00:00' },
];

test('paso 3: la registrada es la más reciente de la persona (por nombre, sin acentos; homónimos por número) que sigue en Drive', () => {
  const { I } = modulo({ registro: REGISTRO, enPapelera: ['A-TIRADA'] });
  const r = I.registradas([{ orden: 0, nombre: 'juan perez lopez', noEmpleado: 'HA00059' }, { orden: 1, nombre: 'ANA RUIZ' }, { orden: 2, nombre: '' },
    { orden: 3, nombre: 'MARIA LOPEZ', noEmpleado: 'M2' }, { orden: 4, nombre: 'MARIA LOPEZ', noEmpleado: '' }]);
  assert.equal(r.length, 5);
  assert.equal(r[0].registrada.registro, 'IDN-NUEVA', 'la más reciente; la de la papelera no cuenta');
  assert.equal(r[0].registrada.archivoId, 'A-NUEVA');
  assert.equal(r[0].registrada.nuco, '0012');
  assert.equal(r[0].registrada.fecha, '2026-05-02');
  assert.equal(r[1].registrada, null, 'ANA RUIZ no tiene ninguna');
  assert.equal(r[2].registrada, null);
  assert.equal(r[3].registrada.registro, 'IDN-HOM2', 'dos personas con el mismo nombre: la del número');
  assert.equal(r[4].registrada, null, 'sin número no se adivina cuál');
});

test('paso 3: «Sí» copia la registrada a la carpeta de la responsiva nueva, solo si es de esa persona; ORIGEN REUTILIZADA', () => {
  const m = modulo({ registro: REGISTRO });
  const lista = m.I.revisar([{ orden: 0, reutilizar: 'IDN-NUEVA' }], VALORES);
  assert.equal(lista[0].reutilizar, 'IDN-NUEVA');
  const escritos = m.I.escribir(lista, '15', m.I.fechaDe('2026-10-09T10:30'), 'Files');
  assert.deepEqual(m.copias, [{ de: 'A-NUEVA', nombre: 'INE - JUAN PEREZ LOPEZ - PER-000123.pdf', carpeta: 'RESP0015' }]);
  assert.equal(m.creados.length, 0, 'no se sube nada nuevo');
  m.I.registrar(escritos, 'RES-2', { id: 'EQU-2', nuco: '0015' }, { correo: 'ci@x.com' }, new Date());
  assert.equal(m.filas[0]['ORIGEN'], 'REUTILIZADA');
  assert.equal(m.filas[0]['ARCHIVO ID'], 'COPIA1');
  // La de otra persona no se puede usar (aunque la pantalla mandara su ID)
  const otra = modulo({ registro: REGISTRO });
  assert.throws(() => otra.I.escribir(otra.I.revisar([{ orden: 0, reutilizar: 'IDN-OTRA' }], VALORES), '15', new Date(), 'Files'), /no es de JUAN PEREZ LOPEZ/);
  assert.equal(otra.copias.length, 0);
  // Sin ID PERSONA tampoco
  const sinId = modulo({ registro: REGISTRO });
  assert.throws(() => sinId.I.escribir(sinId.I.revisar([{ orden: 1, reutilizar: 'IDN-NUEVA' }], VALORES), '15', new Date(), 'Files'), /no es de ANA RUIZ/);
});

test('paso 3 en la pantalla: busca al cambiar el responsable, pregunta «¿Es correcta?» y manda reutilizar', () => {
  const pantalla = read('src/html/js/lineas.html');
  const estilos = read('src/html/lineas-estilos.html');
  const tiene = (texto, trozo, porque) => assert.ok(texto.includes(trozo), porque || trozo);
  tiene(pantalla, "llamar('apiLineasIdentificacionesRegistradas', ");
  tiene(pantalla, '<span class="ln-ine-pregunta">¿Es correcta?</span>');
  tiene(pantalla, 'data-ine-registrada="si"');
  tiene(pantalla, "if (s.reutilizar) return { orden: Number(caja.dataset.ineOrden), tipo: tipo ? tipo.value : '', reutilizar: s.reutilizar };");
  tiene(pantalla, 'if (!caja || !pedida || caja._clave !== pedida.clave || !x.registrada) return;', 'una respuesta vieja no pinta a otra persona');
  tiene(estilos, '.ln-ine [hidden] { display: none !important; }', 'los botones (display: grid) sí se ocultan');
  tiene(pantalla, "if (captura.pasos) captura.pasos.irAlCampo('_IDENTIFICACION_' + sinContestar.dataset.ineOrden);", 'sin contestar no se guarda: lleva a la pregunta');
  tiene(read('src/ClientApi.gs'), 'function apiLineasIdentificacionesRegistradas(token, personas) {\n  return TelefoniaService.identificacionesRegistradas(token, personas);');
  tiene(read('src/services/TelefoniaService.gs'), 'function identificacionesRegistradas(token, personas) {\n    operar_(token);', 'con permiso de operar Líneas');
});

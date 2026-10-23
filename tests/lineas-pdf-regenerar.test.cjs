// Regenerar PDF (usuario, 5-oct): la responsiva se vuelve a hacer sin llenar el formulario. Queda como versión nueva del
// mismo PDF; si las firmas de la captura ya no están (caché 6 h) se piden de nuevo, y el patrón lo dibuja el servidor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');
const LINEAS = require('./lineas-fuente');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function patronPng() {
  const ctx = vm.createContext({ Utilities: { newBlob: (bytes, mime, nombre) => ({ bytes, mime, nombre }) } });
  vm.runInContext(read('src/services/lineas/LineasPatronPng.gs') + '\nthis.P = LineasPatronPng;', ctx);
  return ctx.P;
}

/** PNG de paleta → { ancho, alto, color(x, y) → [r, g, b] }. */
function leerPng(bytes) {
  const b = Buffer.from(bytes);
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let i = 8; let ihdr; let plte; const idat = [];
  while (i < b.length) {
    const n = b.readUInt32BE(i); const tipo = b.toString('latin1', i + 4, i + 8); const datos = b.subarray(i + 8, i + 8 + n);
    assert.equal(b.readUInt32BE(i + 8 + n), zlib.crc32(b.subarray(i + 4, i + 8 + n)), 'CRC de ' + tipo);
    if (tipo === 'IHDR') ihdr = datos; if (tipo === 'PLTE') plte = datos; if (tipo === 'IDAT') idat.push(datos);
    i += 12 + n;
  }
  const ancho = ihdr.readUInt32BE(0); const alto = ihdr.readUInt32BE(4);
  const crudo = zlib.inflateSync(Buffer.concat(idat));
  assert.equal(crudo.length, alto * (ancho + 1));
  return { ancho, alto, color: (x, y) => { const k = crudo[y * (ancho + 1) + 1 + x]; return [...plte.subarray(k * 3, k * 3 + 3)]; } };
}

test('patrón: solo puntos "1-5-9"; una ruta de imagen del AppSheet no es patrón', () => {
  const P = patronPng();
  assert.deepEqual([...P.puntos('1-5-9')], [1, 5, 9]);
  assert.equal(P.puntos('RESPONSIVAS LINEAS_Images/abc.CONTRASEÑA.png'), null);
  assert.equal(P.puntos(''), null);
  assert.equal(P.blob('', '#ffffff'), null);
});

test('patrón: PNG válido de 300 × 300 con el dibujo del formulario (trazo, inicio con anillo, número y fondo de la celda)', () => {
  const P = patronPng();
  const png = leerPng(P.dibujar([1, 5, 9], '#ddebf7'));
  assert.equal(png.ancho, 300);
  assert.equal(png.alto, 300);
  assert.deepEqual(png.color(5, 5), [0xdd, 0xeb, 0xf7]);        // fondo de la celda de la inspección
  assert.deepEqual(png.color(250, 236), [0x0b, 0x5d, 0x7a]);    // punto 9 (abajo a la derecha)
  assert.deepEqual(png.color(50, 30), [0xc9, 0xa2, 0x27]);      // anillo del inicio (punto 1)
  assert.deepEqual(png.color(50, 51), [0xff, 0xff, 0xff]);      // el "1" dentro del punto
  // Los 9 puntos como en pantalla (usuario, 6-oct): el 3 no se usa y sale gris y chico
  assert.deepEqual(png.color(250, 50), [0xb8, 0xc4, 0xca]);
  assert.deepEqual(png.color(250, 64), [0xdd, 0xeb, 0xf7]);
  // Un tramo 1→3 pasa por el 2: el punto gris va encima del trazo
  assert.deepEqual(leerPng(P.dibujar([1, 3], '#ffffff')).color(150, 50), [0xb8, 0xc4, 0xca]);
  const blob = P.blob('1-5-9', '#ffffff', 'patron.png');
  assert.equal(blob.mime, 'image/png');
  assert.ok(blob.bytes.every((x) => x >= -128 && x <= 127), 'bytes con signo para Utilities.newBlob');
});

function captura(fila, opciones) {
  const o = opciones || {};
  const hechos = { generados: [], reemplazos: [], movimientos: [], papelera: [], ligados: [] };
  const archivos = {
    PDF1: { getId: () => 'PDF1', getName: () => 'RESP 0012 05 10.pdf', getUrl: () => 'url1', isTrashed: () => false },
    NUEVO: { getBlob: () => ({ getBytes: () => [37, 80, 68, 70] }), setTrashed: (v) => hechos.papelera.push(['NUEVO', v]) },
  };
  const ev = { origen: 'SISTEMA', carpetaId: 'CAR', pdfs: o.sinPdf ? [] : [{ id: 'PDF1', nombre: 'RESP 0012 05 10.pdf' }], fecha: new Date('2026-10-05T12:00:00') };
  const cache = {};
  const ctx = vm.createContext({
    console,
    Utilities: {
      base64Decode: (b) => Array.from(Buffer.from(b, 'base64')),
      newBlob: (bytes, mime, nombre) => ({ bytes, mime, nombre }),
      formatDate: () => '05 10',
    },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    DriveApp: {
      getFolderById: () => ({ getName: () => 'RESP 05 10' }),
      getFileById: (id) => archivos[id],
    },
    LineasRepo: {
      TAB: { INSP: 'INSP', RESP: 'RESP', APP_EVID: 'APP_EVID' },
      evidenciaDesdeFila: () => ev,
      revisarPdfsLigados: () => {},
      registrarMovimiento: (...a) => hechos.movimientos.push(a),
      indiceColaboradores: () => ({ columnas: ['nombre', 'correo'], filas: [] }),
    },
    LineasFirmas: { png: (c) => (o.firmaGuardada && c === o.firmaGuardada.correo ? o.firmaGuardada.png : null), tiene: (c) => !!(o.firmaGuardada && c === o.firmaGuardada.correo) },
    LineasDatos: {
      buscarFilasPorId: () => [2], leerFilas: () => [[fila]], idsDeFila: () => [fila.ID], existeTabla: () => true,
      buscarFilasVarios: () => [7], conCandado: (f) => f(), actualizarFila: (...a) => hechos.ligados.push(a),
    },
    LineasUtil: { col: (f, c) => (c in f ? f[c] : null), nuco4: (n) => String(n).padStart(4, '0'),
      patronVigente: (pin, p) => (!pin || /^PATR[OÓ]N$/i.test(pin) ? (p || '') : '') },
    LineasArchivos: {
      blob: () => null, enNucos: () => true, enLineas: () => false, olvidarNuco: () => {},
      reemplazarPdf: (id, bytes) => { hechos.reemplazos.push([id, bytes.length]); return { id, name: 'RESP 0012 05 10.pdf' }; },
    },
    LineasPdf: {
      PLANTILLAS: { RESPONSIVA_CELULAR: 'R', INSPECCION_CELULAR: 'I' },
      plantillaInspeccion: (registro) => (registro.CUBO ? 'I-CHECKLIST' : 'I'),
      generarPdfDesdePlantilla: (plantilla, registro, imagenes, carpeta, nombre) => {
        hechos.generados.push({ plantilla, imagenes, nombre });
        return { id: 'NUEVO', nombre, url: 'url-nuevo', avisos: [] };
      },
    },
  });
  vm.runInContext(read('src/services/lineas/LineasPatronPng.gs') + '\n' + read('src/services/lineas/LineasCaptura.gs') + '\nthis.C = LineasCaptura;', ctx);
  return { C: ctx.C, hechos };
}

const FILA = { ID: 'RES-9', 'ID LINEA': 'EQU-1', NUCO: 12, RESPONSABLE: 'ANA PEREZ', 'NOMBRE CI': 'DAFNE DONIS', 'FIRMA CI': '', CONTRASEÑA: '1-5-9' };
const USUARIO = { correo: 'a@b.mx', nombre: 'A' };

test('regenerar sin las firmas de la captura: no hace el PDF y pide las firmas con los nombres', () => {
  const { C, hechos } = captura(Object.assign({}, FILA));
  const r = C.generarPdf('RESPONSIVA', 'RES-9', true, USUARIO, null);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { faltanFirmas: true, nombres: { ci: 'DAFNE DONIS', responsable: 'ANA PEREZ' } });
  assert.equal(hechos.generados.length, 0);
  assert.equal(hechos.reemplazos.length, 0);
});

test('regenerar: versión nueva del mismo PDF, el patrón dibujado en el servidor y queda en el historial', () => {
  const { C, hechos } = captura(Object.assign({}, FILA));
  const firma = Buffer.from('png').toString('base64');
  const r = C.generarPdf('RESPONSIVA', 'RES-9', true, USUARIO, { ci: firma, responsable: null, patron: null });
  assert.equal(hechos.generados.length, 1);
  const img = hechos.generados[0].imagenes;
  assert.equal(img['CONTRASEÑA'].mime, 'image/png');
  assert.ok(img['CONTRASEÑA'].bytes.length > 90000, 'patrón 300 × 300 dibujado con los puntos de la hoja');
  assert.equal(img['FIRMA CI'].nombre, 'firma-ci.png');
  assert.equal(img['FIRMA RESPONSABLE'], null);
  assert.deepEqual(hechos.reemplazos, [['PDF1', 4]]);
  assert.deepEqual(hechos.papelera, [['NUEVO', true]]);
  assert.equal(hechos.ligados.length, 0, 'la hoja ya tiene el enlace del mismo archivo');
  assert.equal(r.id, 'PDF1');
  assert.equal(hechos.movimientos.length, 1);
  const [tipo, , quien, , extra] = hechos.movimientos[0];
  assert.equal(tipo, 'PDF_REGENERADO');
  assert.equal(quien, USUARIO);
  assert.deepEqual(JSON.parse(JSON.stringify(extra)), { refs: ['EQU-1'], nuco: 12,
    detalle: { responsivaId: 'RES-9', cambios: [{ campo: 'PDF', antes: '', despues: 'RESP 0012 05 10.pdf' }] } });
  assert.match(read('src/services/lineas/LineasRepo.gs'), /PDF_REGENERADO: 'PDF regenerado'/);
});

test('regenerar una inspección (usuario, 22-oct, NUCO 0820): quien la hizo y es el responsable no vuelve a firmar y el patrón sale dibujado', () => {
  const firma = Buffer.from('png').toString('base64');
  const gamaliel = { correo: 'g@b.mx', nombre: 'GAMALIEL JAIR MORA GONZALEZ' };
  const fila = { ID: 'ILI-9', 'ID LINEA': 'EQU-1', NUCO: 820, RESPONSABLE: 'GAMALIEL JAIR MORA GONZALEZ', 'NOMBRE INSPECTOR': 'GAMALIEL JAIR MORA GONZALEZ',
    'FIRMA INSPECTOR': '', 'FIRMA RESPONSABLE': '', 'PIN EQUIPO': 'PATRON', PATRON: '1-7-9' };
  // Otra persona, sin las firmas de la captura: se le piden las dos y no se toca el PDF
  const otro = captura(Object.assign({}, fila), { firmaGuardada: { correo: 'g@b.mx', png: firma } });
  const r0 = otro.C.generarPdf('INSPECCION', 'ILI-9', true, USUARIO, null);
  assert.deepEqual(JSON.parse(JSON.stringify(r0)), { faltanFirmas: true, nombres: { inspector: fila['NOMBRE INSPECTOR'], responsable: fila.RESPONSABLE } });
  assert.equal(otro.hechos.reemplazos.length, 0);
  const { C, hechos } = captura(Object.assign({}, fila), { firmaGuardada: { correo: 'g@b.mx', png: firma } });
  const r = C.generarPdf('INSPECCION', 'ILI-9', true, gamaliel, null);
  assert.equal(r.faltanFirmas, undefined);
  assert.equal(hechos.generados[0].plantilla, 'I');
  const img = hechos.generados[0].imagenes;
  assert.equal(img['FIRMA INSPECTOR'].nombre, 'firma-inspector.png');
  assert.equal(img['FIRMA RESPONSABLE'].nombre, 'firma-responsable.png');
  assert.ok(img.PATRON.bytes.length > 90000, 'patrón «1-7-9» dibujado con los puntos de la hoja');
  assert.deepEqual(hechos.reemplazos, [['PDF1', 4]], 'versión nueva del mismo archivo');
  assert.equal(hechos.movimientos[0][0], 'PDF_REGENERADO');
  assert.equal(hechos.movimientos[0][4].detalle.inspeccionId, 'ILI-9');
});

test('las firmas de la captura (caché) bastan para regenerar sin pedirlas', () => {
  const { C, hechos } = captura(Object.assign({}, FILA));
  const firma = Buffer.from('png').toString('base64');
  C.generarPdf('RESPONSIVA', 'RES-9', true, USUARIO, { ci: firma, responsable: firma, patron: firma }); // guardar: llegan con la captura
  const r = C.generarPdf('RESPONSIVA', 'RES-9', true, USUARIO, null);
  assert.equal(r.faltanFirmas, undefined);
  assert.equal(hechos.generados.length, 2);
  assert.equal(hechos.generados[1].imagenes['CONTRASEÑA'].nombre, 'patron.png');
  assert.equal(hechos.generados[1].imagenes['CONTRASEÑA'].bytes.length, 3, 'el patrón de la captura, no uno nuevo');
});

test('la pantalla: «Regenerar PDF» en inspecciones y responsivas del sistema con PDF y con permiso de operar; pide solo las firmas', () => {
  const cliente = LINEAS;
  // Fuera de la barra: en el ⋮ y el clic derecho (usuario, 12-oct; pendiente 2.34). Inspecciones también (22-oct)
  assert.match(cliente, /doc\('refresh-ccw', 'Regenerar PDF', 'pdf', false, \(d\) => operar && d\.origen === 'SISTEMA' && !!d\.pdfId,\r?\n\s+\(d\) => regenerarPdf\(d\)\)/);
  const regenerar = cliente.slice(cliente.indexOf('function regenerarPdf('), cliente.indexOf('function pedirFirmasPdf('));
  assert.match(regenerar, /esInspeccion \? 'Inspección de telefonía' : 'Responsiva de entrega'/);
  assert.match(cliente, /refrescarDespuesDeCaptura\(registroId \|\| pila\[pila\.length - 1\]\.id, d\.tipoPdf, d\.id, true\);/);
  assert.match(cliente, /llamar\('apiLineasGenerarPdf', tipo, nuevoId, !!regenerar, sesionCaptura\.pdfFirmas \|\| null\)/);
  assert.match(cliente, /if \(pdf && pdf\.faltanFirmas\) \{ pedirFirmasPdf\(sesionCaptura, tipo, pdf\.nombres \|\| \{\}, generar, !!pdf\.soloResponsable\); return; \}/);
  const fn = cliente.slice(cliente.indexOf('function pedirFirmasPdf('), cliente.indexOf('/** `regenerar`'));
  assert.match(fn, /if \(ci && ci\.estaVacia\(\)\) \{ mostrarErrorCaptura\('Falta la firma de Control Interno\.'\); return; \}/);
  assert.match(fn, /patron: null/);
  assert.match(cliente, /'PDF regenerado': 'refresh-ccw'/);
});

// Usuario, 22-oct: con la firma del responsable puesta con «Usar foto» (PNG de megas) la caché no la guardaba y al pulsar
// «Generar PDF» después el recuadro del responsable salía vacío sin avisar
test('sin la firma del responsable en caché (y sí la de Control Interno): pide solo esa, no saca el recuadro vacío', () => {
  const { C, hechos } = captura(Object.assign({}, FILA));
  const firma = Buffer.from('png').toString('base64');
  C.generarPdf('RESPONSIVA', 'RES-9', true, USUARIO, { ci: firma, responsable: null, patron: null }); // la caché solo con la de CI
  const r = C.generarPdf('RESPONSIVA', 'RES-9', true, USUARIO, null);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { faltanFirmas: true, soloResponsable: true, nombres: { responsable: 'ANA PEREZ' } });
  assert.equal(hechos.generados.length, 1, 'solo el del primer llamado');
  // Lo que regresa la ventana (aunque la deje vacía) ya no se vuelve a pedir
  C.generarPdf('RESPONSIVA', 'RES-9', true, USUARIO, { ci: null, responsable: null, patron: null });
  assert.equal(hechos.generados.length, 2);
  assert.equal(hechos.generados[1].imagenes['FIRMA CI'].nombre, 'firma-ci.png', 'la de Control Interno de la caché');
});

test('si al capturar el responsable no firmó (sinResponsable en caché) no se le pide', () => {
  const { C, hechos } = captura(Object.assign({}, FILA));
  const firma = Buffer.from('png').toString('base64');
  C.generarPdf('RESPONSIVA', 'RES-9', true, USUARIO, { ci: firma, responsable: null, patron: null, sinResponsable: true });
  const r = C.generarPdf('RESPONSIVA', 'RES-9', true, USUARIO, null);
  assert.equal(r.faltanFirmas, undefined);
  assert.equal(hechos.generados.length, 2);
  assert.equal(hechos.generados[1].imagenes['FIRMA RESPONSABLE'], null);
  const fuente = read('src/services/lineas/LineasCaptura.gs');
  assert.equal((fuente.match(/sinResponsable: !datos\.firmaResponsableBase64/g) || []).length, 2, 'inspección y responsiva lo marcan al guardar');
});

test('una firma que llega como JPEG (foto achicada en la pantalla) va al PDF como JPEG', () => {
  const { C, hechos } = captura(Object.assign({}, FILA));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  const png = Buffer.from('png').toString('base64');
  C.generarPdf('RESPONSIVA', 'RES-9', true, USUARIO, { ci: png, responsable: jpeg, patron: null });
  const img = hechos.generados[0].imagenes;
  assert.equal(img['FIRMA RESPONSABLE'].mime, 'image/jpeg');
  assert.equal(img['FIRMA CI'].mime, 'image/png');
});

test('la pantalla: la firma que pasa del tope (una foto) se manda como JPEG más chico', () => {
  const cliente = LINEAS;
  assert.match(cliente, /const TOPE_FIRMA = 40000;/);
  const fn = cliente.slice(cliente.indexOf('function crearFirma('), cliente.indexOf('function crearFirma(') + 1600);
  assert.match(fn, /resolve\(png\.length <= TOPE_FIRMA \? png : firmaAchicada\(img, fondo\)\);/);
  const achicar = cliente.slice(cliente.indexOf('function firmaAchicada('), cliente.indexOf('function crearFirma('));
  assert.match(achicar, /toDataURL\('image\/jpeg', calidad\)/);
  assert.match(achicar, /if \(salida\.length <= TOPE_FIRMA\) break;/);
  const pedir = cliente.slice(cliente.indexOf('function pedirFirmasPdf('), cliente.indexOf('/** `regenerar`'));
  assert.match(pedir, /const ci = soloResponsable \? null : crearFirma/);
});

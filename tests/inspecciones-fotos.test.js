/**
 * Fotos por sección de la inspección vehicular (InspeccionesService, 22-oct) con un Drive en memoria: la carpeta
 * temporal de una captura, que registrar no guarde si falta una sección, que las mueva a <inspección>/<SECCIÓN>/ con su
 * nombre, y que al editar nunca se quite la última foto de una sección.
 * Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- Drive en memoria ----
let n = 0;
const nodos = {};
function iter(lista) { let i = 0; return { hasNext: () => i < lista.length, next: () => lista[i++] }; }
function carpeta(nombre, padre) {
  const c = { tipo: 'carpeta', id: 'c' + (++n), nombre, padre: padre ? padre.id : null, papelera: false, act: Date.now() };
  Object.assign(c, {
    getId: () => c.id, getName: () => c.nombre, getLastUpdated: () => new Date(c.act),
    getParents: () => iter(c.padre ? [nodos[c.padre]] : []),
    getFolders: () => iter(Object.values(nodos).filter((x) => x.tipo === 'carpeta' && x.padre === c.id && !x.papelera)),
    getFiles: () => iter(Object.values(nodos).filter((x) => x.tipo === 'archivo' && x.padre === c.id && !x.papelera)),
    createFolder: (nom) => carpeta(nom, c),
    createFile: (blob) => archivo(blob.nombre, c),
    setTrashed: (v) => { c.papelera = v; },
  });
  nodos[c.id] = c;
  return c;
}
function archivo(nombre, padre) {
  const a = { tipo: 'archivo', id: 'a' + (++n), nombre, padre: padre.id, papelera: false };
  Object.assign(a, {
    getId: () => a.id, getName: () => a.nombre, setName: (x) => { a.nombre = x; return a; },
    getParents: () => iter([nodos[a.padre]]), moveTo: (c) => { a.padre = c.id; }, setTrashed: (v) => { a.papelera = v; },
    isTrashed: () => a.papelera,
    getUrl: () => 'https:' + '/' + '/drive.google.com/file/d/' + a.id + '/view',
  });
  nodos[a.id] = a;
  return a;
}
const hijos = (c) => Object.values(nodos).filter((x) => x.padre === c.id && !x.papelera);
const vivo = (x) => { for (let y = x; y; y = y.padre && nodos[y.padre]) if (y.papelera) return false; return true; };
const raiz = carpeta('RAIZ DEV');
const inspeccion = carpeta('4TO TRIMESTRE');   // 4.-INSPECCIONES/2026/4TO TRIMESTRE del NUCO 25
const pdf = archivo('INSPECCION-0025 2026-10-22.pdf', inspeccion);
const subcarpeta = (padre, nombre) => hijos(padre).find((x) => x.tipo === 'carpeta' && x.nombre === nombre) || carpeta(nombre, padre);

let fila = null;
// Lo que cuesta guardar: llamadas a Drive.Files.update, archivos abiertos uno por uno y secciones numeradas
const costo = { update: [], abiertos: 0, numerados: [] };
const cacheFalsa = {};
const ESTRUCTURA = {
  tipo: 'HONDA 150XR', plantillaId: 'doc', carpeta: 'INSPECCIONES HONDA 150XR',
  secciones: [{ titulo: 'Cristalería', peso: 100, campos: [{ campo: 'PARABRISAS', opciones: ['BUENO', 'REGULAR', 'MALO', 'N/A'] }] }],
  llantas: [], diagramas: [], piezas: 1,
  fotos: [{ id: 'NEUMATICOS', titulo: 'Neumáticos' }, { id: 'LATONERIA Y PINTURA', titulo: 'Latonería y pintura' }],
};
const contexto = vm.createContext({
  Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'libro' }, DRIVE_FOLDERS: { RAIZ: () => raiz.id, REPORTES: () => 'formatos', MODELOS: () => 'm' } },
  Permisos: { puedeEditar: () => ({ nombre: 'INSPECTOR' }), puedeLeer: () => ({}) },
  // La estructura del tipo viene de la caché; lo demás (carpetas ya revisadas) se guarda de verdad
  CacheService: { getScriptCache: () => ({
    get: (k) => (/^inspeccion_tipo/.test(k) ? JSON.stringify(ESTRUCTURA) : cacheFalsa[k] || null),
    put: (k, v) => { cacheFalsa[k] = v; }, remove: (k) => { delete cacheFalsa[k]; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  Session: { getScriptTimeZone: () => 'America/Mexico_City' },
  Utilities: { formatDate: () => '2026-10-22', getUuid: () => 'abcd1234-0000' },
  DriveApp: {
    getFolderById: (id) => { if (!nodos[id] || nodos[id].tipo !== 'carpeta') throw new Error('no existe'); return nodos[id]; },
    getFileById: (id) => { costo.abiertos++; return nodos[id]; },
  },
  // Drive v3: mover y renombrar en una llamada (moverFotos_). Sin Files.create, crearFoto_ usa createFile
  Drive: { Files: { update: (cambio, id, media, op) => {
    const a = nodos[id];
    if (op.removeParents !== a.padre) throw new Error('removeParents no es la carpeta de la foto');
    costo.update.push(id);
    a.padre = op.addParents; a.nombre = cambio.name;
    return { id };
  } } },
  SheetUtils: {
    normalizarEncabezado_: (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(),
    // Ya trae PUNTAJE MAXIMO: registrar no tiene que crearla (eso se prueba en inspecciones-registrar)
    getSheetByColumns: () => ({
      getName: () => 'INSPECCION VEHICULAR', getLastColumn: () => 2,
      getRange: () => ({ getValues: () => [['ID INSPECCION', 'PUNTAJE MAXIMO']] }),
    }),
    indiceDeColumnas: (enc, nombres) => nombres.reduce((m, n) => (m[n] = enc.indexOf(n), m), {}),
    leerColumnas: () => ({ filas: 0, datos: { 'ID INSPECCION': [] } }),
    findById: (libro, hoja, id, col) => (col === 'ID INSPECCION'
      ? { data: { 'ID INSPECCION': id, NUCO: '25', TIPO: 'HONDA 150XR', FECHA: new Date(), 'FORMATO INSPECCION VEHICULAR': pdf.getUrl() } }
      : { data: { ID: 'VEH-1', FOLIO: 'AUT0025', NUCCO: '25', PLACA: 'X' } }),
    insert: (id, hoja, datos) => { fila = datos; },
    update: () => {},
  },
  ExpedienteNuco: {
    FIRMAS_Y_DIAGRAMAS: 'FIRMAS Y DIAGRAMAS',
    tieneNuco: () => true,
    carpetaInspeccion: () => inspeccion,
    subcarpeta: subcarpeta,
    nombreConFecha: (c, prefijo) => prefijo + '-0025 2026-10-22 (' + (hijos(c).length + 1) + ').jpg',
    // Como el de verdad: lee la carpeta una vez y numera en memoria
    numerador: (c, prefijo) => {
      costo.numerados.push(prefijo);
      const usados = new Set(hijos(c).map((a) => a.nombre));
      return (ext) => {
        let nom = prefijo + '-0025 2026-10-22' + ext;
        for (let i = 2; usados.has(nom); i++) nom = prefijo + '-0025 2026-10-22 (' + i + ')' + ext;
        usados.add(nom);
        return nom;
      };
    },
    guardar: (blob, c, prefijo) => archivo(prefijo + '-0025 2026-10-22.jpg', c),
    fotosPorSeccion: (id) => {
      const out = {};
      hijos(nodos[id]).filter((x) => x.tipo === 'carpeta').forEach((s) => { out[s.nombre] = hijos(s).map((a) => ({ id: a.id, nombre: a.nombre, carpeta: s.id })); });
      return out;
    },
    idDeLiga: (liga) => (/\/d\/([^/]+)/.exec(liga) || [])[1] || null,
    olvidar: () => {}, olvidarFotos: () => {},
  },
  DriveUtils: {
    blobRevisado: (a, permitidos) => {
      if (permitidos.indexOf(a.mimeType) === -1) throw new Error('Solo se aceptan imágenes');
      return { blob: { nombre: 'x', setName(nom) { this.nombre = nom; return this; } }, extension: '.jpg' };
    },
    marcarAutor: (f) => f, eliminar: () => {},
  },
  PdfService: { generar: () => ({ url: 'https://pdf', nombre: 'x.pdf', sinResolver: [] }), nombreArchivo: (p) => p.join(' '), fechaParaNombre: () => 'f' },
  VehiculosService: { nuccoEnAlcance: () => true },
  Plantilla: {}, DocumentApp: {},
});
// Escribe en Drive por DriveUtils (28-oct): las primitivas de verdad, con el Drive de esta prueba
contexto.DriveUtils = Object.assign(require('./drive-utils-real')({ Drive: contexto.Drive, DriveApp: contexto.DriveApp }), contexto.DriveUtils);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'InspeccionesService.gs'), 'utf8') +
  '\nthis.S = InspeccionesService;', contexto);
const S = contexto.S;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const truena = (fn, patron) => { try { fn(); return false; } catch (e) { return patron.test(e.message); } };
const foto = { nombre: 'a.jpg', mime: 'image/jpeg', base64: 'eA==' };
const datos = (carpetaId) => ({ FOLIO: 'AUT0025', TIPO: 'HONDA 150XR', checklist: { PARABRISAS: 'BUENO' }, llantas: {}, fotosCarpetaId: carpetaId });

console.log('1. Las secciones de un tipo');
ok(S.seccionesFotos_({}).length === 8 && S.seccionesFotos_({}).some((s) => s.id === 'LATONERIA Y PINTURA'), 'columna vacía: las 8 del expediente');
const dos = S.seccionesFotos_({ 'SECCIONES FOTOS': 'neumáticos, Latonería y Pintura' });
ok(dos.map((s) => s.id).join() === 'NEUMATICOS,LATONERIA Y PINTURA' && dos[0].titulo === 'Neumáticos',
  'escritas a mano (acentos, mayúsculas) se reconocen como las del expediente');

console.log('2. La carpeta temporal de una captura');
const { carpetaId } = S.fotosPreparar('t');
const temporal = nodos[carpetaId];
ok(nodos[temporal.padre].nombre === 'FOTOS DE INSPECCION' && nodos[nodos[temporal.padre].padre].nombre === 'TEMP', 'vive en RAIZ/TEMP/FOTOS DE INSPECCION');
const f1 = S.fotosSubir('t', carpetaId, 'NEUMATICOS', foto);
ok(nodos[nodos[f1.id].padre].nombre === 'NEUMATICOS', 'cada foto va a la carpeta de su sección');
ok(truena(() => S.fotosSubir('t', inspeccion.id, 'NEUMATICOS', foto), /no es de fotos/), 'no sube a una carpeta que no es temporal');
ok(truena(() => S.fotosSubir('t', carpetaId, 'NEUMATICOS', { nombre: 'x.pdf', mime: 'application/pdf', base64: 'eA==' }), /imágenes/), 'solo imágenes');
ok(truena(() => S.fotosSubir('t', carpetaId, '../OTRA', foto), /inválida/), 'una sección con / no pasa');

console.log('3. Guardar con una sección vacía no escribe nada');
ok(truena(() => S.registrar('t', datos(carpetaId), {}), /Latonería y pintura/) && fila === null, 'dice cuál falta y la hoja queda igual');
ok(truena(() => S.registrar('t', datos(null), {}), /Faltan las fotos/), 'sin carpeta de fotos tampoco');

console.log('4. Completa: se guarda y las fotos pasan a la carpeta de la inspección');
S.fotosSubir('t', carpetaId, 'LATONERIA Y PINTURA', foto);
S.fotosSubir('t', carpetaId, 'NEUMATICOS', foto);
Object.assign(costo, { update: [], abiertos: 0, numerados: [] });
const r = S.registrar('t', datos(carpetaId), {});
ok(fila !== null && !r.advertencia, 'la fila se escribió sin avisos');
const secs = hijos(inspeccion).filter((x) => x.tipo === 'carpeta').map((c) => c.nombre + ':' + hijos(c).length).sort();
ok(secs.join() === 'LATONERIA Y PINTURA:1,NEUMATICOS:2', 'en <inspección>/<SECCIÓN>/: 2 de neumáticos y 1 de latonería');
ok(hijos(subcarpeta(inspeccion, 'NEUMATICOS')).every((a) => /^NEUMATICOS-0025 2026-10-22/.test(a.nombre)), 'con su nombre: NEUMATICOS-0025 2026-10-22 (n)');
ok(!vivo(temporal), 'la carpeta temporal se fue a la papelera');
ok(costo.update.length === 3 && costo.abiertos === 0, 'cada foto es UNA llamada a Drive (mover y renombrar), sin abrirlas una por una');
ok(costo.numerados.sort().join() === 'LATONERIA Y PINTURA,NEUMATICOS', 'cada sección lee sus nombres una sola vez');
ok(hijos(subcarpeta(inspeccion, 'NEUMATICOS')).map((a) => a.nombre).sort().join() === 'NEUMATICOS-0025 2026-10-22 (2).jpg,NEUMATICOS-0025 2026-10-22.jpg',
  'dos fotos de la misma sección no repiten nombre');

console.log('5. Editar una inspección guardada');
const de = S.fotosDe('t', 'INS-1');
ok(de.fotos.NEUMATICOS.length === 2 && de.secciones.length === 2, 'fotosDe: las de cada sección');
const nueva = S.fotosAgregar('t', 'INS-1', 'LATONERIA Y PINTURA', foto);
ok(nodos[nodos[nueva.id].padre].nombre === 'LATONERIA Y PINTURA', 'agregar va directo a su sección');
S.fotosQuitar('t', 'INS-1', nueva.id);
ok(!vivo(nodos[nueva.id]), 'quitar la manda a la papelera');
const ultima = hijos(subcarpeta(inspeccion, 'LATONERIA Y PINTURA'))[0];
ok(truena(() => S.fotosQuitar('t', 'INS-1', ultima.id), /al menos una/) && vivo(ultima), 'la última de una sección no se puede quitar');
ok(truena(() => S.fotosQuitar('t', 'INS-1', pdf.id), /no es de esta inspección/), 'ni algo que no es una foto de sus secciones');

console.log('5a. Solo pasan las fotos que la pantalla tiene (fotosIds)');
// Una foto llegó a Drive pero la respuesta se perdió: la pantalla la marcó "No subió" y la volvió a subir
const cap = S.fotosPreparar('t').carpetaId;
const buena = S.fotosSubir('t', cap, 'NEUMATICOS', foto);
const colada = S.fotosSubir('t', cap, 'NEUMATICOS', foto);
const sola = S.fotosSubir('t', cap, 'LATONERIA Y PINTURA', foto);
const antes = hijos(subcarpeta(inspeccion, 'NEUMATICOS')).length;
ok(truena(() => S.registrar('t', Object.assign(datos(cap), { fotosIds: [buena.id, colada.id] }), {}), /Latonería y pintura/),
  'una sección cuenta solo con las de la pantalla: la que está en Drive pero no en pantalla no la completa');
S.registrar('t', Object.assign(datos(cap), { fotosIds: [buena.id, sola.id] }), {});
ok(hijos(subcarpeta(inspeccion, 'NEUMATICOS')).length === antes + 1 && nodos[nodos[buena.id].padre].nombre === 'NEUMATICOS' &&
  nodos[nodos[buena.id].padre].padre === inspeccion.id, 'pasa la de la pantalla');
ok(nodos[colada.id].padre !== subcarpeta(inspeccion, 'NEUMATICOS').id && !vivo(nodos[colada.id]),
  'la que se coló no llega al expediente: se va a la papelera con la temporal');

console.log('5b. Máximo 20 fotos por sección');
const llena = S.fotosPreparar('t').carpetaId;
for (let i = 0; i < 20; i++) S.fotosSubir('t', llena, 'NEUMATICOS', foto);
ok(truena(() => S.fotosSubir('t', llena, 'NEUMATICOS', foto), /Máximo 20/), 'la foto 21 de una sección se rechaza');
ok(!!S.fotosSubir('t', llena, 'INTERIORES', foto), 'otra sección sigue aceptando');

console.log('5c. Varias fotos en una llamada');
const lote = S.fotosPreparar('t').carpetaId;
const pdfFalso = { nombre: 'x.pdf', mime: 'application/pdf', base64: 'eA==' };
const rs = S.fotosSubirVarias('t', lote, [{ seccion: 'NEUMATICOS', archivo: foto }, { seccion: 'NEUMATICOS', archivo: pdfFalso }, { seccion: 'INTERIORES', archivo: foto }]);
ok(rs.length === 3 && rs[0].id && rs[1].error && rs[2].id, 'cada foto regresa lo suyo: la mala no tira a las demás');
ok(nodos[nodos[rs[2].id].padre].nombre === 'INTERIORES', 'y cada una va a su sección');
const muchas = Array.from({ length: 10 }, () => ({ seccion: 'NEUMATICOS', archivo: foto }));
S.fotosSubirVarias('t', lote, muchas);
const tope = S.fotosSubirVarias('t', lote, muchas);
ok(tope.filter((r) => r.id).length === 9 && tope.filter((r) => /Máximo 20/.test(r.error || '')).length === 1, 'el máximo de 20 se cuenta dentro del lote (1+10+9 = 20)');
ok(truena(() => S.fotosSubirVarias('t', lote, muchas.concat(muchas)), /Lote/), 'más de 10 por llamada no');

console.log('6. Cancelar una captura');
const otra = S.fotosPreparar('t').carpetaId;
S.fotosCancelar('t', otra);
ok(!vivo(nodos[otra]), 'la temporal a la papelera');

if (fallas) { console.error('\n' + fallas + ' falla(s)'); process.exit(1); }
console.log('\nTODO OK');

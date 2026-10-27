/**
 * Pruebas de InspeccionesService.registrar con Apps Script simulado: qué se escribe en la
 * hoja, qué se sube a Drive y qué recibe el PDF (diagramas, firmas y fechas).
 * Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fila = null;           // lo que se escribió en la hoja
let paraPdf = null;        // lo que recibió PdfService.generar
const subidas = [];        // lo que se guardó en Drive por la ruta de antes (vehículo sin NUCCO)
const guardados = [];      // lo que se guardó en el expediente del NUCO
const buscadas = [];       // en qué carpeta raíz se buscó cada dibujo en blanco
let actualizado = null;    // lo que se escribió después (la liga del PDF)
let nuccoVehiculo = '25';
const encabezadosHoja = ['ID INSPECCION', 'FOLIO', 'TIPO', 'PUNTAJE FINAL INSPECCION'];
let candados = 0;
const carpetaFalsa = (ruta) => ({ ruta, getId: () => 'id:' + ruta });

const ESTRUCTURA = {
  tipo: 'HONDA 150XR', plantillaId: 'doc', carpeta: 'INSPECCIONES HONDA 150XR',
  secciones: [{ titulo: 'Cristalería', peso: 100, campos: [{ campo: 'PARABRISAS', opciones: ['BUENO', 'REGULAR', 'MALO', 'N/A'] }] }],
  llantas: [],
  diagramas: [
    { campo: 'INS FRONTAL', etiqueta: 'Frontal', ruta: 'MODELOS INSPECCION/HONDA 150XR/FRONTAL.png' },
    { campo: 'INS TRASERA', etiqueta: 'Trasera', ruta: 'MODELOS INSPECCION/HONDA 150XR/TRASERA.png' },
    { campo: 'INS IZQUIERDA', etiqueta: 'Izquierda', ruta: 'MODELOS INSPECCION/HONDA 150XR/IZQUIERDA.png' },
  ],
  piezas: 1,
};

const contexto = vm.createContext({
  Config: {
    SPREADSHEET_IDS: { VEHICULOS: () => 'libro' },
    DRIVE_FOLDERS: { INSPECCIONES_IMAGENES: () => 'imagenes', RAIZ: () => 'raiz-pruebas', REPORTES: () => 'formatos', MODELOS: () => 'raiz-prod' },
  },
  Permisos: { puedeEditar: () => ({ nombre: 'INSPECTOR PRUEBA' }), puedeLeer: () => ({}) },
  CacheService: { getScriptCache: () => ({ get: () => JSON.stringify(ESTRUCTURA), put: () => {} }) },
  SheetUtils: {
    normalizarEncabezado_: (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(),
    // Sin PUNTAJE MAXIMO, como la hoja de prod: registrar la agrega al final
    getSheetByColumns: () => ({
      getName: () => 'INSPECCION VEHICULAR',
      getLastColumn: () => encabezadosHoja.length,
      getRange: (r, c) => ({
        getValues: () => [encabezadosHoja.slice()],
        setValue: (v) => { encabezadosHoja[c - 1] = v; },
      }),
    }),
    indiceDeColumnas: (enc, nombres) => nombres.reduce((m, n) => (m[n] = enc.indexOf(n), m), {}),
    leerColumnas: () => ({ filas: 0, datos: { 'ID INSPECCION': [] } }),
    // 'ID' va aquí porque la inspección nueva guarda la llave foránea del vehículo, y el
    // servicio se niega a registrar si el vehículo no tiene ID (libro sin migrar).
    findById: () => ({ data: { ID: 'VEH-00000000AAAAAA', FOLIO: 'AUT0025', NUCCO: nuccoVehiculo, 'RESPONSABLE VEHICULO': 'JORGE AVECILLA', PLACA: 'GGR658F' } }),
    insert: (id, hoja, datos) => { fila = datos; },
    update: (libro, hoja, id, cambios) => { actualizado = cambios; },
  },
  ExpedienteNuco: {
    FIRMAS_Y_DIAGRAMAS: 'FIRMAS Y DIAGRAMAS',
    tieneNuco: (n) => /^[0-9]+$/.test(String(n == null ? '' : n).trim()),
    carpetaInspeccion: () => carpetaFalsa('25/4.-INSPECCIONES/2026/4TO TRIMESTRE'),
    subcarpeta: (c, nombre) => carpetaFalsa(c.ruta + '/' + nombre),
    nombreConFecha: (c, prefijo, n, ext) => prefijo + '-0025 2026-10-12' + ext,
    guardar: (blob, c, prefijo, n, f, ext) => {
      guardados.push({ ruta: c.ruta, prefijo, ext });
      return { getId: () => 'g' + guardados.length, getUrl: () => 'https:' + '/' + '/drive.google.com/file/d/G' + guardados.length + '/view' };
    },
    olvidar: () => {},
  },
  DriveUtils: {
    blobRevisado: (archivo) => ({ blob: { archivo }, extension: '.png' }),
    guardarArchivoAppSheet: (p) => {
      subidas.push(p);
      return { ruta: p.carpetaRelativa + '/' + p.idFila + '.' + p.columna + '.120000.png', fileId: 'f' + subidas.length };
    },
    // TRASERA existe en Drive; IZQUIERDA no (como hoy en el ambiente de pruebas)
    archivoDeRutaProfunda: (ruta, raiz) => { buscadas.push(raiz); return /TRASERA/.test(ruta) ? { getBlob: () => 'blob-trasera' } : null; },
    previsualizarRutaProfunda: (ruta, raiz) => ({ raiz: raiz }),
    eliminar: () => {},
  },
  PdfService: {
    generar: (p) => { paraPdf = p; return { url: 'https://pdf', nombre: 'INSPECCION.pdf', sinResolver: [] }; },
    nombreArchivo: (partes) => partes.join(' '),
    fechaParaNombre: () => '2026-09-18',
  },
  Plantilla: {}, DocumentApp: {}, Utilities: {},
  Candado: { con: (fn) => { candados++; return fn(); } },
});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'InspeccionesService.gs'), 'utf8') +
  '\nthis.InspeccionesService = InspeccionesService;',
  contexto
);

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const esFecha = (v) => Object.prototype.toString.call(v) === '[object Date]';

const resultado = contexto.InspeccionesService.registrar('token', {
  FOLIO: 'AUT0025', TIPO: 'HONDA 150XR', checklist: { PARABRISAS: 'BUENO' }, llantas: {},
  ULTIMO_SERVICIO: '2026-09-14', CONDUCTOR: 'PEPE',
}, {
  'INS FRONTAL': { base64: 'TRAZO', mimeType: 'image/png' },
  'FIRMA INSPECTOR': { base64: 'FIRMA', mimeType: 'image/png' },
});

console.log('0. La inspección nace amarrada al vehículo por ID');
ok(fila['ID VEHICULO'] === 'VEH-00000000AAAAAA',
  'guarda ID VEHICULO, no solo el folio: el folio se puede editar y el ID no');
ok(fila['FOLIO'] === 'AUT0025', 'y el folio también, para que la hoja se lea');

console.log('\n1. Diagramas');
ok(/^https:.*drive\.google\.com\/file\/d\//.test(fila['INS FRONTAL']),
  'el diagrama marcado se guarda en el expediente del NUCO y la hoja guarda su liga: ' + fila['INS FRONTAL']);
ok(fila['INS TRASERA'] === ESTRUCTURA.diagramas[1].ruta && paraPdf.imagenes['INS TRASERA'].blob === 'blob-trasera',
  'el que no se marcó guarda la ruta del dibujo en blanco y el PDF lleva ese dibujo');
ok(fila['INS IZQUIERDA'] === ESTRUCTURA.diagramas[2].ruta, 'si el dibujo en blanco no está en Drive, la fila igual guarda su ruta (como AppSheet)');
ok(paraPdf.datos['INS IZQUIERDA'] === '' && !paraPdf.imagenes['INS IZQUIERDA'],
  'pero en el PDF su marcador queda vacío: ya no se imprime la ruta como texto');
ok(/Izquierda/.test(resultado.advertencia) && !/Trasera/.test(resultado.advertencia),
  'y se avisa cuál faltó (solo esa)');

console.log('1b. Los dibujos en blanco se LEEN de producción; todo lo demás, de pruebas');
ok(buscadas.length === 2 && buscadas.every((r) => r === 'raiz-prod'), 'los dibujos en blanco se buscan en la raíz de MODELOS (prod)');
ok(subidas.length === 0 && guardados.length === 2 && guardados.every((g) => g.ruta === '25/4.-INSPECCIONES/2026/4TO TRIMESTRE/FIRMAS Y DIAGRAMAS'),
  'lo dibujado y firmado va a FIRMAS Y DIAGRAMAS de su trimestre, en el NUCO (nada a la carpeta suelta)');
const vista = (ruta) => contexto.InspeccionesService.previsualizarImagen('token', ruta).raiz;
ok(vista('MODELOS INSPECCION/PIPA/IZQUIERDA.png') === 'raiz-prod', 'la vista previa de un dibujo en blanco sale de prod');
ok(vista('INSPECCION VEHICULAR_Images/2026_25_291.FIRMA INSPECTOR.120000.png') === 'raiz-pruebas',
  'la de una firma o un diagrama marcado sale de pruebas');

console.log('2. Firmas');
ok(guardados.some((g) => g.prefijo === 'FIRMA INSPECTOR'), 'la firma del inspector se guarda en Drive');
ok(paraPdf.imagenes['FIRMA INSPECTOR'].ancho === 150 && paraPdf.imagenes['FIRMA INSPECTOR'].alto === 60,
  'en el PDF va en una caja de 150 × 60 pt, como en los formatos de AppSheet');
ok(!paraPdf.imagenes['INS FRONTAL'].alto, 'los diagramas no se encogen a esa caja');
ok(paraPdf.datos['FIRMA RESPONSABLE'] === '' && !fila['FIRMA RESPONSABLE'],
  'la firma que no llegó deja su espacio en blanco');

console.log('3. Datos capturados');
const servicio = fila['FECHA ULTIMO SERVICIO'];
ok(esFecha(servicio) && servicio.getFullYear() === 2026 && servicio.getMonth() === 8 && servicio.getDate() === 14,
  'la fecha del último servicio se guarda como fecha, no como el texto "2026-09-14"');
ok(fila['NOMBRE INSPECTOR'] === 'INSPECTOR PRUEBA', 'el inspector es quien tiene la sesión');
ok(fila['PLACAS'] === 'GGR658F' && fila['RESPONSABLE'] === 'JORGE AVECILLA', 'los datos del vehículo vienen del catálogo');
ok(resultado.puntaje === 100 && resultado.pdf === 'https://pdf', 'regresa el puntaje y la liga del PDF');

console.log('4. El PDF va al expediente del NUCO');
ok(paraPdf.carpetaId === 'id:25/4.-INSPECCIONES/2026/4TO TRIMESTRE' && !paraPdf.subcarpeta,
  'se genera en 4.-INSPECCIONES/<año>/<trimestre> del NUCO, no en REPORTES');
ok(paraPdf.nombre === 'INSPECCION-0025 2026-10-12', 'con el nombre de la homologación: INSPECCION-<NUCO> <fecha>');
ok(actualizado && actualizado['FORMATO INSPECCION VEHICULAR'] === 'https://pdf', 'y la hoja guarda la liga del PDF');

console.log('5. Un vehículo sin NUCCO usa las carpetas de antes (rutas)');
nuccoVehiculo = '';
guardados.length = 0;
contexto.InspeccionesService.registrar('token', {
  FOLIO: 'AUT0025', TIPO: 'HONDA 150XR', checklist: { PARABRISAS: 'BUENO' }, llantas: {},
}, { 'INS FRONTAL': { base64: 'TRAZO', mimeType: 'image/png' } });
ok(guardados.length === 0 && subidas.length === 1 && subidas[0].carpetaId === 'imagenes', 'la imagen va a la carpeta de antes');
ok(/^INSPECCION VEHICULAR_Images\/.+\.INS FRONTAL\.\d+\.png$/.test(fila['INS FRONTAL']), 'con la ruta de AppSheet');
ok(paraPdf.carpetaId === 'formatos' && paraPdf.subcarpeta === ESTRUCTURA.carpeta, 'y el PDF a REPORTES, como antes');
ok(actualizado['FORMATO INSPECCION VEHICULAR'] === 'INSPECCIONES VEHICULARES/' + ESTRUCTURA.carpeta + '/INSPECCION.pdf', 'con su ruta');

console.log('6. La calificación va en porcentaje en todos lados (27-oct: las secciones salían en decimal)');
ok(fila['PUNTUACION_CRISTALERIA'] === '100.00%' && fila['PUNTAJE FINAL INSPECCION'] === '100.00%',
  'la sección se escribe igual que el total: "100.00%", no 1');

ok(fila['PUNTAJE MAXIMO'] === '100.00%', 'guarda lo más que podía sacar esa unidad');
ok(encabezadosHoja.filter((e) => e === 'PUNTAJE MAXIMO').length === 1 && candados === 1,
  'la columna se crea una sola vez, bajo el candado, aunque se registren varias');

console.log('7. El máximo no cuenta las secciones todas N/A');
const DOS = [
  { titulo: 'Cristalería', peso: 10, campos: [{ campo: 'PARABRISAS', opciones: ['BUENO', 'REGULAR', 'MALO', 'N/A'] }] },
  { titulo: 'Inventarios', peso: 10, campos: [{ campo: 'GATO', opciones: ['BUENO', 'REGULAR', 'MALO', 'N/A'] }] },
];
const conNA = contexto.InspeccionesService.calcularPuntaje_(DOS, { PARABRISAS: 'BUENO', GATO: 'N/A' });
ok(conNA.final === 10 && conNA.maximo === 10, 'Inventarios toda N/A: sacó 10 de 10 posibles, no de 20');
ok(contexto.InspeccionesService.calcularPuntaje_(DOS, { PARABRISAS: 'MALO', GATO: 'BUENO' }).maximo === 20,
  'con algo evaluado en las dos, el máximo es la suma de sus pesos');

const CRUDO = { 'ID INSPECCION': 'I1', 'PUNTAJE FINAL INSPECCION': 0.7909, 'PUNTAJE MAXIMO': 0.9, 'PUNTUACION_NEUMATICOS': 0.15,
  'PUNTUACION_LIMPIEZA': '2.50%', 'PUNTUACION_NIVELES': '', 'FOLIO': 'AUT0025' };
contexto.HojaServicio = { completo: () => [CRUDO], buscarPorId: () => CRUDO };
const exportado = contexto.InspeccionesService.completo('token')[0];
ok(exportado['PUNTAJE FINAL INSPECCION'] === '79.09%' && exportado['PUNTUACION_NEUMATICOS'] === '15.00%' &&
  exportado['PUNTUACION_LIMPIEZA'] === '2.50%' && exportado['PUNTAJE MAXIMO'] === '90.00%', 'al exportar, el total y las secciones salen en porcentaje (de AppSheet o de la app)');
ok(exportado['PUNTUACION_NIVELES'] === '' && exportado['FOLIO'] === 'AUT0025', 'lo vacío y lo demás no cambian');
ok(CRUDO['PUNTAJE FINAL INSPECCION'] === 0.7909, 'sin tocar el renglón de la caché');
ok(contexto.InspeccionesService.buscarPorId('token', 'I1')['PUNTUACION_NEUMATICOS'] === '15.00%', '"Ver completo" también');

// La hoja: dos columnas (total y Neumáticos) con lo que hay hoy mezclado
const columnas = { 'PUNTAJE FINAL INSPECCION': [[0.845], ['84.50%'], [''], ['n/d']], 'PUNTUACION_NEUMATICOS': [[0.15], [0.075], [''], ['']] };
const formatos = { 'PUNTAJE FINAL INSPECCION': '0.00%', 'PUNTUACION_NEUMATICOS': '0.###############' };
const escrito = {};
const encabezados = Object.keys(columnas);
contexto.SheetUtils.getSheetByColumns = () => ({
  getName: () => 'INSPECCION VEHICULAR', getLastRow: () => 5, getLastColumn: () => encabezados.length,
  getRange: (fila1, col, filas) => {
    if (fila1 === 1) return { getValues: () => [encabezados] };
    const nombre = encabezados[col - 1];
    return {
      getValues: () => columnas[nombre],
      getNumberFormats: () => columnas[nombre].map((_, i) => [i === 0 ? formatos[nombre] : '0.00%']),
      setValues: (v) => { escrito[nombre] = v; },
      setNumberFormat: (f) => { escrito[nombre + ' formato'] = f; },
    };
  },
});
contexto.SheetUtils.indiceDeColumnas = (enc, nombres) => nombres.reduce((m, n) => (m[n] = enc.indexOf(n), m), {});
let tocada = false;
contexto.CacheHojas = { tocarHoja: () => { tocada = true; } };
const revisado = contexto.InspeccionesService.puntajesAPorcentaje(false);
ok(revisado.celdas === 5 && revisado.cambian === 2 && revisado.raras === 1 && Object.keys(escrito).length === 0,
  'revisar cuenta (el texto "84.50%" y la sección sin formato) y no escribe: ' + JSON.stringify(revisado));
ok(revisado.faltan.length === 11, 'y dice qué columnas de sección no están en la hoja');
contexto.InspeccionesService.puntajesAPorcentaje(true);
ok(JSON.stringify(escrito['PUNTAJE FINAL INSPECCION']) === JSON.stringify([[0.845], [0.845], [''], ['n/d']]) &&
  escrito['PUNTUACION_NEUMATICOS formato'] === '0.00%' && tocada,
  'aplicar deja la fracción con formato 0.00%, no toca lo vacío ni lo que no es número, e invalida la caché');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

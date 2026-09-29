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
const subidas = [];        // lo que se guardó en Drive
const buscadas = [];       // en qué carpeta raíz se buscó cada dibujo en blanco

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
    getSheetByColumns: () => ({ getName: () => 'INSPECCION VEHICULAR' }),
    leerColumnas: () => ({ filas: 0, datos: { 'ID INSPECCION': [] } }),
    findById: () => ({ data: { FOLIO: 'AUT0025', NUCCO: '25', 'RESPONSABLE VEHICULO': 'JORGE AVECILLA', PLACA: 'GGR658F' } }),
    insert: (id, hoja, datos) => { fila = datos; },
    update: () => {},
  },
  DriveUtils: {
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

console.log('1. Diagramas');
ok(/^INSPECCION VEHICULAR_Images\/.+\.INS FRONTAL\.\d+\.png$/.test(fila['INS FRONTAL']),
  'el diagrama marcado se sube con la ruta de AppSheet: ' + fila['INS FRONTAL']);
ok(fila['INS TRASERA'] === ESTRUCTURA.diagramas[1].ruta && paraPdf.imagenes['INS TRASERA'].blob === 'blob-trasera',
  'el que no se marcó guarda la ruta del dibujo en blanco y el PDF lleva ese dibujo');
ok(fila['INS IZQUIERDA'] === ESTRUCTURA.diagramas[2].ruta, 'si el dibujo en blanco no está en Drive, la fila igual guarda su ruta (como AppSheet)');
ok(paraPdf.datos['INS IZQUIERDA'] === '' && !paraPdf.imagenes['INS IZQUIERDA'],
  'pero en el PDF su marcador queda vacío: ya no se imprime la ruta como texto');
ok(/Izquierda/.test(resultado.advertencia) && !/Trasera/.test(resultado.advertencia),
  'y se avisa cuál faltó (solo esa)');

console.log('1b. Los dibujos en blanco se LEEN de producción; todo lo demás, de pruebas');
ok(buscadas.length === 2 && buscadas.every((r) => r === 'raiz-prod'), 'los dibujos en blanco se buscan en la raíz de MODELOS (prod)');
ok(subidas.every((p) => p.carpetaId === 'imagenes'), 'lo que se escribe va a la carpeta de pruebas');
const vista = (ruta) => contexto.InspeccionesService.previsualizarImagen('token', ruta).raiz;
ok(vista('MODELOS INSPECCION/PIPA/IZQUIERDA.png') === 'raiz-prod', 'la vista previa de un dibujo en blanco sale de prod');
ok(vista('INSPECCION VEHICULAR_Images/2026_25_291.FIRMA INSPECTOR.120000.png') === 'raiz-pruebas',
  'la de una firma o un diagrama marcado sale de pruebas');

console.log('2. Firmas');
ok(subidas.some((s) => s.columna === 'FIRMA INSPECTOR'), 'la firma del inspector se guarda en Drive');
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

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

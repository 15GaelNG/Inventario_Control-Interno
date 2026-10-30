/**
 * Pruebas de InspeccionesService.actualizar (editar una inspección ya guardada), con Apps Script
 * simulado: recalcula el puntaje mezclando lo guardado + lo nuevo, nunca toca lo que no debe
 * (TIPO, FOLIO, vehículo, inspector, firmas y diagramas), regenera el PDF con las imágenes YA
 * guardadas (sin que el cliente las reenvíe) y nunca manda el correo de aviso.
 * Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ESTRUCTURA = {
  tipo: 'HONDA 150XR', plantillaId: 'doc-plantilla', carpeta: 'INSPECCIONES HONDA 150XR',
  secciones: [
    { titulo: 'Cristalería', peso: 50, campos: [{ campo: 'PARABRISAS', opciones: ['BUENO', 'REGULAR', 'MALO', 'N/A'] }] },
    { titulo: 'Inventarios', peso: 50, campos: [{ campo: 'GATO', opciones: ['BUENO', 'REGULAR', 'MALO', 'N/A'] }] },
  ],
  llantas: [], diagramas: [], piezas: 2,
};

let filaGuardada;
const resetFila = () => {
  filaGuardada = {
    'ID INSPECCION': 'INS-EXIST1', 'TIPO': 'HONDA 150XR', 'FOLIO': 'AUT0025', 'ID VEHICULO': 'VEH-000000AAAAAA',
    'NUCO': '25', 'FECHA': new Date('2026-10-01'), 'RESPONSABLE': 'JORGE AVECILLA', 'DEPARTAMENTO': 'CI', 'SEDE': 'QRO',
    'PLACAS': 'GGR658F', 'PARABRISAS': 'BUENO', 'GATO': 'BUENO',
    'CONDUCTOR': 'PEPE VIEJO', 'JEFE DIRECTO': '', 'AREA': '', 'HOLOGRAMA': '', 'VOLTAJE': '',
    'OBSERVACIONES': 'obs vieja', 'NOMBRE INSPECTOR': 'INSPECTOR ORIGINAL',
    'FORMATO INSPECCION VEHICULAR': 'https://drive.google.com/file/d/OLDPDF/view',
    'INS FRONTAL': 'https://drive.google.com/file/d/FRONTALID/view',
    'INS TRASERA': 'MODELOS INSPECCION/HONDA 150XR/TRASERA.png',
    'INS IZQUIERDA': '', 'INS DERECHA': '',
    'FIRMA RESPONSABLE': 'https://drive.google.com/file/d/FIRMARESPID/view', 'FIRMA INSPECTOR': '',
  };
};
resetFila();

let llamadasUpdate = [];
let llamadasPdf = [];
let correosEnviados = 0;
let candados = 0;
let tokenPermitido = true;

const contexto = vm.createContext({
  Config: {
    SPREADSHEET_IDS: { VEHICULOS: () => 'libro' },
    DRIVE_FOLDERS: { MODELOS: () => 'raiz-prod', RAIZ: () => 'raiz-pruebas', REPORTES: () => 'formatos' },
  },
  Permisos: {
    puedeEditar: (token) => { if (!tokenPermitido) throw new Error('Sin permiso'); return { nombre: 'QUIEN EDITA' }; },
    puedeLeer: () => ({}),
  },
  CacheService: { getScriptCache: () => ({ get: () => JSON.stringify(ESTRUCTURA), put: () => {}, remove: () => {} }) },
  Candado: { con: (fn) => { candados++; return fn(); } },
  SheetUtils: {
    normalizarEncabezado_: (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(),
    getSheetByColumns: () => ({ getName: () => 'INSPECCION VEHICULAR' }),
    findById: (ssid, hoja, id, idCol) => (id === filaGuardada[idCol] ? { data: Object.assign({}, filaGuardada) } : null),
    update: (ssid, hoja, id, cambios, idCol) => {
      llamadasUpdate.push({ cambios: Object.assign({}, cambios), idCol });
      Object.assign(filaGuardada, cambios);
      return Object.assign({}, filaGuardada);
    },
  },
  ExpedienteNuco: {
    tieneNuco: (n) => /^[0-9]+$/.test(String(n == null ? '' : n).trim()),
    carpetaInspeccion: () => ({ getId: () => 'carpeta-nuco' }),
    olvidar: () => {},
  },
  DriveApp: {
    getFileById: (id) => ({ getBlob: () => 'blob:' + id }),
  },
  DriveUtils: {
    archivoDeRutaProfunda: (ruta) => (/TRASERA/.test(ruta) ? { getBlob: () => 'blob:trasera' } : null),
  },
  PdfService: {
    generar: (p) => { llamadasPdf.push(p); return { url: 'https://pdf/nuevo.pdf', nombre: 'INSPECCION.pdf', sinResolver: [] }; },
    nombreArchivo: (partes) => partes.join(' '),
    fechaParaNombre: () => '2026-10-30',
  },
  MailApp: { sendEmail: () => { correosEnviados++; } },
  Plantilla: {}, DocumentApp: {},
});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'InspeccionesService.gs'), 'utf8') +
  '\nthis.InspeccionesService = InspeccionesService;',
  contexto
);
const { InspeccionesService } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

console.log('1. Recalcula el puntaje mezclando lo guardado + lo nuevo');
llamadasUpdate = [];
const r1 = InspeccionesService.actualizar('token', 'INS-EXIST1', { checklist: { PARABRISAS: 'MALO' } });
const cambiosGrandes = llamadasUpdate[0].cambios;
ok(cambiosGrandes['PARABRISAS'] === 'MALO', 'escribe la pieza que sí cambió');
ok(cambiosGrandes['GATO'] === undefined, 'no reescribe una pieza que no mandó el cliente (se queda con la de la hoja)');
ok(cambiosGrandes['PUNTAJE FINAL INSPECCION'] === '50.00%',
  'Cristalería en MALO (0) + Inventarios sin tocar, BUENO (1): 50% relativo -- ' + cambiosGrandes['PUNTAJE FINAL INSPECCION']);
ok(r1.puntaje === 50, 'el resultado regresa el mismo puntaje');
ok(candados === 1, 'la lectura + recálculo + escritura corren bajo Candado.con');

console.log('2. Nunca toca lo que no debe (TIPO, FOLIO, vehículo, inspector) aunque el cliente lo mande');
resetFila(); llamadasUpdate = [];
InspeccionesService.actualizar('token', 'INS-EXIST1', {
  TIPO: 'OTRO TIPO', FOLIO: 'HACKEADO', ID_VEHICULO: 'VEH-OTRO', NOMBRE_INSPECTOR: 'OTRO',
  checklist: { PARABRISAS: 'REGULAR' },
});
const cambios2 = llamadasUpdate[0].cambios;
['TIPO', 'FOLIO', 'ID VEHICULO', 'NOMBRE INSPECTOR', 'NUCO', 'RESPONSABLE', 'DEPARTAMENTO', 'PLACAS']
  .forEach((col) => ok(cambios2[col] === undefined, 'no escribe la columna "' + col + '" aunque venga en p'));
ok(filaGuardada['TIPO'] === 'HONDA 150XR' && filaGuardada['NOMBRE INSPECTOR'] === 'INSPECTOR ORIGINAL',
  'la fila real conserva TIPO y el inspector original');

console.log('3. Firmas y diagramas: no se piden al cliente ni se escriben');
resetFila(); llamadasUpdate = [];
InspeccionesService.actualizar('token', 'INS-EXIST1', { checklist: { PARABRISAS: 'BUENO' } });
['INS FRONTAL', 'INS TRASERA', 'INS IZQUIERDA', 'INS DERECHA', 'FIRMA RESPONSABLE', 'FIRMA INSPECTOR']
  .forEach((col) => ok(llamadasUpdate.every((u) => u.cambios[col] === undefined), 'nunca escribe "' + col + '"'));

console.log('4. El PDF se regenera con las imágenes YA guardadas (releídas de Drive), sin pedirlas al cliente');
resetFila(); llamadasPdf = [];
InspeccionesService.actualizar('token', 'INS-EXIST1', { checklist: { PARABRISAS: 'BUENO' } });
ok(llamadasPdf.length === 1, 'llama a PdfService.generar una vez');
const imgs = llamadasPdf[0].imagenes;
ok(imgs['INS FRONTAL'] && imgs['INS FRONTAL'].blob === 'blob:FRONTALID', 'relee el diagrama marcado por su URL (DriveApp.getFileById)');
ok(imgs['INS TRASERA'] && imgs['INS TRASERA'].blob === 'blob:trasera', 'relee una ruta relativa por DriveUtils.archivoDeRutaProfunda');
ok(imgs['FIRMA RESPONSABLE'] && imgs['FIRMA RESPONSABLE'].blob === 'blob:FIRMARESPID' &&
  imgs['FIRMA RESPONSABLE'].ancho === 150 && imgs['FIRMA RESPONSABLE'].alto === 60,
  'la firma releída lleva la caja de 150×60 pt, igual que al registrar');
ok(!imgs['FIRMA INSPECTOR'] && !imgs['INS IZQUIERDA'] && !imgs['INS DERECHA'], 'lo que nunca se guardó sigue vacío');
ok(llamadasUpdate.some((u) => u.cambios['FORMATO INSPECCION VEHICULAR'] === 'https://pdf/nuevo.pdf'),
  'parcha la columna del PDF con la liga nueva, igual que registrar()');

console.log('5. Exige permiso de edición');
resetFila(); tokenPermitido = false;
let error = null;
try { InspeccionesService.actualizar('token-malo', 'INS-EXIST1', { checklist: {} }); } catch (e) { error = e; }
ok(error && /sin permiso/i.test(error.message), 'truena si Permisos.puedeEditar rechaza el token');
tokenPermitido = true;

console.log('6. Nunca manda el correo de aviso al editar');
resetFila(); correosEnviados = 0;
InspeccionesService.actualizar('token', 'INS-EXIST1', { checklist: { PARABRISAS: 'BUENO' }, OBSERVACIONES: 'ya quedó bien' });
ok(correosEnviados === 0, 'MailApp.sendEmail no se llama al editar (solo al registrar la primera vez)');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

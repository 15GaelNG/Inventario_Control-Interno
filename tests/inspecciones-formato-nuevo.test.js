/**
 * Inspecciones con una plantilla del formato nuevo (MotorPlantillas, 29-oct): la estructura del checklist sale de las
 * tablas (no del texto ni de REAGRUPAR_SECCIONES), el contrato son las columnas de la hoja más las imágenes y el estado
 * calculado de cada llanta, y presentar_ llena ese estado para el PDF.
 *
 * Correr: node tests/inspecciones-formato-nuevo.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const D = require('./docs-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const COLUMNAS = ['ID INSPECCION', 'FOLIO', 'TIPO', 'FECHA', 'PLACAS', 'PARABRISAS', 'MEDALLON', 'GAFETTE', 'RINES', 'LLANTA DD', 'LLANTA DI', 'FIRMA INSPECTOR'];

function plantillaAutos(pieza) {
  const cristal = D.tabla([
    ['Cristalería 10%', 'Bueno', 'Regular', 'Malo', 'N/A'],
    ['Parabrisas {{PARABRISAS}}', '', '', '', ''],
    ['Medallón {{' + (pieza || 'MEDALLÓN') + '}}', '', '', '', ''],
  ]);
  const docs = D.tabla([['Documentación 5%', 'Presenta', 'No presenta', 'N/A'], ['Gafette {{GAFETTE}}', '', '', '']]);
  const llantas = D.tabla([
    ['Neumáticos 15%', 'Bueno', 'Regular', 'Malo'],
    ['Delantera derecha {{LLANTA DD ESTADO}}', '', '', ''],
    ['Delantera izquierda {{LLANTA DI ESTADO}}', '', '', ''],
    ['Rines {{RINES}}', '', '', ''],
  ]);
  return D.cuerpo([D.tabla([[D.celda('', [D.tabla([['Placas:', '{{PLACAS}}']]), cristal]), D.celda('', [docs, llantas])]]), '{{FIRMA INSPECTOR}}']);
}

function cargar(cuerpo) {
  const hoja = {
    getLastColumn: () => COLUMNAS.length,
    getRange: () => ({ getValues: () => [COLUMNAS] }),
  };
  const ctx = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' }, DRIVE_FOLDERS: {} },
    SheetUtils: {
      getAll: (ss, nombre) => (nombre === 'MODELOS INSPECCION' ? [{ TIPO: 'AUTOS', PLANTILLA: 'DOC-AUTOS' }] : []),
      getSheetByColumns: () => hoja,
      normalizarEncabezado_: (s) => String(s == null ? '' : s).trim().toUpperCase(),
    },
    Permisos: { puedeLeer: () => ({}) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    DocumentApp: Object.assign({}, D.DocumentApp, { openById: () => ({ getBody: () => cuerpo }) }),
    DriveUtils: {}, Plantilla: {}, Utilities: {},
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'MotorPlantillas.gs'), 'utf8') + '\n' +
    fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'InspeccionesService.gs'), 'utf8') +
    '\nthis.S = InspeccionesService;', ctx);
  return ctx.S;
}

console.log('1. La estructura sale de las tablas de la plantilla');
{
  const S = cargar(plantillaAutos());
  const e = S.estructuraDeTipo('t', 'AUTOS');
  ok(e.formato === 'nuevo', 'la estructura dice que es del formato nuevo (para llenar con su contrato)');
  ok(e.secciones.map((s) => s.titulo + ' ' + s.peso).join(' | ') === 'Cristalería 10 | Documentación 5 | Neumáticos 15', 'las secciones y sus pesos, en el orden del documento');
  ok(e.secciones[0].campos.map((c) => c.campo).join(',') === 'PARABRISAS,MEDALLON', 'cada pieza con el nombre de su columna ("MEDALLÓN" en el Doc → MEDALLON)');
  ok(e.secciones[0].campos[0].opciones.join(',') === 'BUENO,REGULAR,MALO,N/A' && e.secciones[1].campos[0].opciones.join(',') === 'PRESENTA,NO PRESENTA,N/A',
    'las opciones salen del encabezado, en mayúsculas como las guarda la hoja');
  ok(e.secciones[2].campos.map((c) => c.campo).join(',') === 'RINES', 'el estado de las llantas es calculado: no se le pregunta al inspector');
  ok(e.llantas.map((l) => l.campo).join(',') === 'LLANTA DD,LLANTA DI', 'las llantas que lleva el tipo salen de sus marcas');
  ok(e.piezas === 4, 'cuenta las piezas que se capturan');
}

console.log('2. Una plantilla con errores no arma el formulario: dice todo lo que hay que corregir');
{
  const S = cargar(plantillaAutos('MEDALON'));
  let error = '';
  try { S.estructuraDeTipo('t', 'AUTOS'); } catch (e) { error = e.message; }
  ok(/La plantilla del tipo "AUTOS" tiene errores:/.test(error) && /no existe el campo MEDALON\. ¿Quisiste decir MEDALLON\?/.test(error),
    'el campo que no es columna, con su sugerencia');
}

console.log('3. Lo calculado para el PDF');
{
  const S = cargar(plantillaAutos());
  const datos = S.presentar_({ 'LLANTA DD': '1.4', 'LLANTA DI': '5', PLACAS: 'X' });
  ok(datos['LLANTA DD ESTADO'] === 'MALO' && datos['LLANTA DI ESTADO'] === 'BUENO' && datos['LLANTA TD ESTADO'] === '',
    'el estado de cada llanta con el mismo semáforo del puntaje (sin medir: vacío)');
  ok(datos.PLACAS === 'X' && datos['LLANTA DD'] === '1.4', 'lo demás, igual');
  ok(datos['LLANTA DD MALO'] === 'SI' && datos['LLANTA DD REGULAR'] === '' && datos['LLANTA DI BUENO'] === 'SI' && datos['LLANTA TD MALO'] === '',
    'y un "SI" por rango, para los bloques {{si LLANTA DD MALO}} (cada uno con su color en la plantilla)');
  const c = S.contrato_();
  ok(c.campos.PLACAS === 'texto' && c.campos['FIRMA INSPECTOR'] === 'imagen' && c.campos['LLANTA DD ESTADO'].marca === 'LLANTA DD',
    'el contrato: columnas (texto), imágenes y el estado calculado de cada llanta (con sus mm como marca)');
}

console.log('4. De punta a punta: el PDF se llena con la estructura y lo calculado');
{
  const cuerpo = plantillaAutos();
  const S = cargar(cuerpo);
  const ctx = vm.createContext({ DocumentApp: D.DocumentApp });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'MotorPlantillas.gs'), 'utf8') + '\nthis.Motor = MotorPlantillas;', ctx);
  ctx.Motor.llenar(cuerpo, S.presentar_({ PLACAS: 'ABC', PARABRISAS: 'BUENO', MEDALLON: 'N/A', GAFETTE: 'PRESENTA', RINES: 'MALO', 'LLANTA DD': '3.2' }), S.contrato_());
  const llantas = cuerpo.hijos[0].filas[0].celdas[1].hijos[2];
  ok(D.textos(llantas)[1].join('|') === 'Delantera derecha||3.2|' && D.textos(llantas)[2].join('|') === 'Delantera izquierda|||',
    'la llanta medida: sus mm en la columna de su estado; la que no se midió, vacía');
  ok(D.textos(llantas)[3].join('|') === 'Rines|||✓', 'y las piezas, su palomita');
}

console.log('5. El PDF de prueba: el mismo camino que registrar, sin escribir en la hoja');
{
  const hoja = { getLastColumn: () => COLUMNAS.length, getRange: () => ({ getValues: () => [COLUMNAS] }) };
  let pedido = null;
  let escrituras = 0;
  const ctx = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' }, DRIVE_FOLDERS: { MODELOS: () => 'MOD', RAIZ: () => 'RAIZ' } },
    SheetUtils: {
      getAll: (ss, nombre) => (nombre === 'MODELOS INSPECCION' ? [{ TIPO: 'AUTOS', PLANTILLA: 'DOC-AUTOS', FRONTAL: 'MODELOS INSPECCION/AUTOS/FRONTAL.png' }] : []),
      getSheetByColumns: () => hoja, normalizarEncabezado_: (s) => String(s == null ? '' : s).trim().toUpperCase(),
      insert: () => { escrituras++; }, update: () => { escrituras++; },
    },
    Permisos: { puedeLeer: () => ({}) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    DocumentApp: Object.assign({}, D.DocumentApp, { openById: () => ({ getBody: () => plantillaAutos() }) }),
    DriveUtils: { archivoDeRutaProfunda: (ruta) => ({ getBlob: () => 'dibujo:' + ruta }) },
    PdfService: { generar: (p) => { pedido = p; return { url: 'https://pdf', sinResolver: [] }; } },
    Plantilla: {}, Utilities: {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'MotorPlantillas.gs'), 'utf8') + '\n' +
    fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'InspeccionesService.gs'), 'utf8') + '\nthis.S = InspeccionesService;', ctx);
  const r = ctx.S.pdfDePrueba_('AUTOS', { PLACAS: 'ABC', 'LLANTA DD': '1.4' }, { 'FIRMA INSPECTOR': 'firma' }, 'CARPETA', 'PRUEBA AUTOS');
  ok(r.url === 'https://pdf' && pedido.plantillaId === 'DOC-AUTOS' && pedido.carpetaId === 'CARPETA' && pedido.nombre === 'PRUEBA AUTOS', 'genera con la plantilla del tipo, donde y como se le pide');
  ok(pedido.contrato && pedido.contrato.campos.PLACAS === 'texto' && pedido.datos['LLANTA DD MALO'] === 'SI', 'con su contrato y lo calculado (presentar_)');
  ok(pedido.imagenes['INS FRONTAL'].blob === 'dibujo:MODELOS INSPECCION/AUTOS/FRONTAL.png' && pedido.imagenes['FIRMA INSPECTOR'].ancho === 150 &&
    pedido.datos['FIRMA RESPONSABLE'] === '', 'el dibujo en blanco del tipo, la firma en su caja de 150 × 60 y la que no llegó, vacía');
  ok(pedido.formato && pedido.formato.fuente === 'Arial', 'con el formato del PDF de la app (Arial y sus márgenes)');
  ok(escrituras === 0, 'y no escribe nada en la hoja');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');

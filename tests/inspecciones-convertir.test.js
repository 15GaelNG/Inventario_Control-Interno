/**
 * Convertir una plantilla de inspección del formato de AppSheet al nuevo, con el oráculo (src/InspeccionesPlantillasDev.gs):
 * corre de verdad Plantilla.gs, MotorPlantillas, PdfService e InspeccionesService sobre el Docs simulado, con una
 * plantilla como la de AUTOS (datos, una sección sin N/A, otra con N/A, las llantas con sus tres bloques de color y el
 * acomodo a dos columnas). El oráculo llena la vieja y la nueva con los mismos datos y las compara celda por celda.
 *
 * Correr: node tests/inspecciones-convertir.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const D = require('./docs-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const SI = (pieza, op) => '<<IF([' + pieza + '] ="' + op + '", "✓", "")>>';
const piezas = (pieza, ops) => ops.map((o) => SI(pieza, o));
const LLANTA = '<<If:([LLANTA DD] <= 1.6)>> <<[LLANTA DD]>> <<EndIf>><<If:(AND([LLANTA DD] >= 1.7, [LLANTA DD] <= 4.0))>> <<[LLANTA DD]>> <<EndIf>><<If:([LLANTA DD] >= 4.1)>> <<[LLANTA DD]>> <<EndIf>>';
const COLUMNAS = ['FECHA', 'PLACAS', 'PARABRISAS', 'MEDALLON', 'GATO MECANICO', 'RINES', 'LLANTA DD', 'PUNTAJE FINAL INSPECCION', 'FIRMA INSPECTOR'];

/** La plantilla de AppSheet, como la de AUTOS (en chico) */
function plantillaVieja(extra) {
  const datos = D.tabla([['Fecha:', '<<[FECHA]>>'], ['Placas:', '<<[PLACAS]>>']]);
  const cristal = D.tabla([
    ['Cristalería 10%', 'Bueno', 'Regular', 'Malo'],
    ['Parabrisas'].concat(piezas('PARABRISAS', ['BUENO', 'REGULAR', 'MALO'])),
    ['Medallón'].concat(piezas('MEDALLON', ['BUENO', 'REGULAR', 'MALO'])),
  ], [140, 46.7, 46.7, 46.6]);
  const inventario = D.tabla([
    ['Inventarios 10%', 'Bueno', 'Regular', 'Malo', 'N/A'],
    ['Gato mecánico'].concat(piezas('GATO MECANICO', ['BUENO', 'REGULAR', 'MALO', 'N/A'])),
  ], [100, 30, 30, 30, 30]);
  const llantas = D.tabla([
    ['Neumáticos 15%', 'mm', '', 'mm', '', '', '', ''],
    ['', '6.5', '', 'Delantera derecha', LLANTA, '', '', ''],
    ['', '', '', '', 'Bueno', 'Regular', 'Malo', 'N/A'],
    ['', '', '', 'Rines'].concat(piezas('RINES', ['BUENO', 'REGULAR', 'MALO', 'N/A'])),
  ], [60, 20, 10, 80, 30, 30, 30, 30]);
  return D.cuerpo([
    D.tabla([[D.celda('', [datos, cristal]), D.celda('', [inventario, llantas])]]),
    'Puntaje: <<PUNTAJE FINAL INSPECCION>>' + (extra || ''),
    '<<[FIRMA INSPECTOR]>>',
  ]);
}

/** Todo el entorno: un Drive de documentos en memoria, la hoja MODELOS INSPECCION y las propiedades */
function armar(cuerpoViejo) {
  const docs = { 'COPIA-AUTOS': { nombre: 'Copia de FORMATO AUTOS (DEV)', cuerpo: cuerpoViejo } };
  let n = 0;
  const archivo = (id) => ({ getId: () => id, getName: () => docs[id].nombre });
  const props = {
    INSPECCIONES_PLANTILLAS_ORIGINALES: JSON.stringify({ AUTOS: 'ORIG-AUTOS' }),
  };
  const modelos = [{ TIPO: 'AUTOS', PLANTILLA: 'COPIA-AUTOS' }];
  const papelera = [];
  const hoja = { getLastColumn: () => COLUMNAS.length, getRange: () => ({ getValues: () => [COLUMNAS] }) };
  const ctx = vm.createContext({
    soloEditor_: () => {}, Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    Config: { ENTORNO: 'DEV', SPREADSHEET_IDS: { VEHICULOS: () => 'SS' }, DRIVE_FOLDERS: { RAIZ: () => 'RAIZ' } },
    SheetUtils: {
      getAll: (ss, nombre) => (nombre === 'MODELOS INSPECCION' ? modelos.map((f) => Object.assign({}, f)) : []),
      getSheetByColumns: () => hoja,
      normalizarEncabezado_: (s) => String(s == null ? '' : s).trim().toUpperCase(),
      tabla: () => ({}),
      cambiarCeldas: (t, cambios) => cambios.forEach((c) => Object.assign(modelos[c.fila - 2], c.cambios)),
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; },
    }) },
    CacheService: { getScriptCache: () => ({ removeAll: () => {}, get: () => null, put: () => {} }) },
    Candado: { con: (fn) => fn() },
    Permisos: { puedeLeer: () => ({}) },
    DriveApp: { getFileById: archivo, getFolderById: () => ({}) },
    DriveUtils: {
      subcarpeta: () => ({ carpeta: 'PLANTILLAS INSPECCION DEV' }),
      copiar: (a, nombre) => { const id = 'DOC' + (++n); docs[id] = { nombre: nombre, cuerpo: docs[a.getId()].cuerpo.copy() }; return archivo(id); },
      aPapelera: (a) => { papelera.push(a.getId()); },
    },
    DocumentApp: Object.assign({}, D.DocumentApp, {
      openById: (id) => ({ getBody: () => docs[id].cuerpo, getName: () => docs[id].nombre, saveAndClose: () => {} }),
    }),
    Utilities: {},
  });
  const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
  vm.runInContext([lee('services', 'Plantilla.gs'), lee('services', 'MotorPlantillas.gs'), lee('services', 'PdfService.gs'),
    lee('services', 'InspeccionesService.gs'), lee('InspeccionesPlantillasDev.gs')].join('\n'), ctx);
  return { ctx, docs, props, modelos, papelera };
}

console.log('1. Ensayo: convierte, revisa y el oráculo da lo mismo, sin dejar nada');
{
  const x = armar(plantillaVieja());
  const r = x.ctx.inspeccionesConvertir1EnsayoAutos();
  ok(/✔ AUTOS: 4 piezas, 3 bloques y \d+ valores convertidos · N\/A nuevo en 1 secciones · la estructura y el oráculo dan lo mismo/.test(r), 'el reporte: ' + r.split('\n')[2]);
  ok(x.modelos[0].PLANTILLA === 'COPIA-AUTOS' && !x.props.INSPECCIONES_PLANTILLAS_DEV_APPSHEET, 'el ensayo no cambia la hoja');
  ok(x.papelera.length === 3, 'y tira lo que hizo (la convertida y las dos del oráculo)');
  ok(D.textos(x.docs['COPIA-AUTOS'].cuerpo.hijos[0].filas[0].celdas[0].hijos[2])[1][1] === SI('PARABRISAS', 'BUENO'), 'la copia de AppSheet no se toca');
}

console.log('2. Escribir: el DEV pasa a la convertida, y se puede volver');
{
  const x = armar(plantillaVieja());
  const r = x.ctx.inspeccionesConvertir2EscribirAutos();
  const nuevoId = x.modelos[0].PLANTILLA;
  ok(nuevoId !== 'COPIA-AUTOS' && x.docs[nuevoId].nombre === 'Copia de FORMATO AUTOS (DEV NUEVO)', 'MODELOS INSPECCION apunta a la "(DEV NUEVO)"');
  ok(JSON.parse(x.props.INSPECCIONES_PLANTILLAS_DEV_APPSHEET).AUTOS === 'COPIA-AUTOS' && /inspeccionesPlantillasAAppSheet/.test(r), 'y recuerda su copia de AppSheet');
  const cuerpo = x.docs[nuevoId].cuerpo;
  const [izq, der] = cuerpo.hijos[0].filas[0].celdas;
  ok(D.textos(izq.hijos[2]).map((f) => f.join('|')).join(' / ') ===
    'Cristalería 10%|Bueno|Regular|Malo|N/A / Parabrisas {{PARABRISAS}}|||| / Medallón {{MEDALLON}}||||', 'el checklist: una marca por pieza, celdas vacías y la columna N/A');
  ok(D.textos(der.hijos[2])[1][4] === '{{si LLANTA DD MALO}} {{LLANTA DD}} {{fin}}{{si LLANTA DD REGULAR}} {{LLANTA DD}} {{fin}}{{si LLANTA DD BUENO}} {{LLANTA DD}} {{fin}}',
    'las llantas: un bloque por rango, con su campo calculado');
  ok(cuerpo.hijos[1].getText() === 'Puntaje: {{PUNTAJE FINAL INSPECCION}}' && cuerpo.hijos[2].getText() === '{{FIRMA INSPECTOR}}', 'los valores y la imagen');
  ok(!/<</.test(cuerpo.getText()), 'no queda nada del formato de AppSheet');
  ok(/= AUTOS: ya usa su plantilla del formato nuevo/.test(x.ctx.inspeccionesConvertir3EscribirTodas()), 'correrla otra vez no la vuelve a convertir');
  x.ctx.inspeccionesPlantillasAAppSheet();
  ok(x.modelos[0].PLANTILLA === 'COPIA-AUTOS' && !x.props.INSPECCIONES_PLANTILLAS_DEV_APPSHEET, 'inspeccionesPlantillasAAppSheet la regresa');
}

console.log('3. Con algo que no sabe traducir, no deja nada');
{
  const x = armar(plantillaVieja(' <<UPPER([PLACAS])>>'));
  const r = x.ctx.inspeccionesConvertir2EscribirAutos();
  ok(/✘ AUTOS/.test(r) && /PENDIENTE una marca sin traducción: <<UPPER\(\[PLACAS\]\)>>/.test(r), 'una marca sin traducción es pendiente');
  ok(x.modelos[0].PLANTILLA === 'COPIA-AUTOS' && x.papelera.length === 1, 'y la convertida se tira; el DEV sigue igual');
}

console.log('4. El oráculo encuentra una diferencia');
{
  const x = armar(plantillaVieja());
  const viejo = plantillaVieja();
  const nuevo = plantillaVieja();
  nuevo.hijos[0].filas[0].celdas[0].hijos[2].filas[1].celdas[2].setText('✓');
  const d = x.ctx.inspDevComparar_(viejo, nuevo);
  ok(d.length === 1 && /«Cristalería 10%», renglón 2, celda 3/.test(d[0]), 'dice dónde: ' + d[0]);
  const conNA = plantillaVieja();
  conNA.hijos[0].filas[0].celdas[0].hijos[2].filas.forEach((f, i) => f.appendTableCell(D.celda(i ? '' : 'N/A')));
  ok(x.ctx.inspDevComparar_(viejo, conNA).length === 0, 'la columna N/A nueva (vacía, "N/A" en el encabezado) no es diferencia');
}

console.log('4b. La estructura nueva contra la de hoy (REAGRUPAR_SECCIONES)');
{
  // El peso impreso en el Doc no es el que fija REAGRUPAR_SECCIONES: la calificación cambiaría
  const vieja = plantillaVieja();
  vieja.hijos[0].filas[0].celdas[0].hijos[2].filas[0].celdas[0].setText('Cristalería 15%');
  const x = armar(vieja);
  const r = x.ctx.inspeccionesConvertir2EscribirAutos();
  ok(/DIFERENCIA estructura: «Cristalería»: peso 10% → 15%/.test(r) && x.modelos[0].PLANTILLA === 'COPIA-AUTOS',
    'un peso distinto al de hoy se dice y no se convierte (cambiaría la calificación)');
}

console.log('5. Las condiciones que sabe traducir');
{
  const x = armar(plantillaVieja());
  const c = (t) => x.ctx.inspDevCondicion_(t);
  ok(c('([LLANTA DD] <= 1.6)') === 'LLANTA DD MALO' && c('(AND([LLANTA TII] >= 1.7, [LLANTA TII] <= 4.0))') === 'LLANTA TII REGULAR' &&
    c('([LLANTA T] >= 4.1)') === 'LLANTA T BUENO', 'los tres rangos de cada llanta');
  ok(c('AND([LLANTA DD] >= 1.7, [LLANTA DI] <= 4.0)') === null && c('([VOLTAJE] <= 11)') === null, 'cualquier otra: ninguna (pendiente)');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');

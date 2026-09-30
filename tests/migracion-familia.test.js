/**
 * Pruebas del orquestador por familia (src/MigracionFamilia.gs).
 *
 * Lo que de verdad protege esto: que un paso de SOLO LECTURA nunca reciba escribir:true, y
 * que si la revisión previa encuentra problemas, la corrida que escribe se detenga ANTES de
 * tocar nada. Los seis pasos ya tienen sus propias pruebas; aquí se prueba el orden, el
 * filtro de familia y los frenos.
 *
 * Correr: node tests/migracion-familia.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
function ok(condicion, descripcion) {
  console.log('  ' + (condicion ? '✔' : '✘') + ' ' + descripcion);
  if (!condicion) fallas++;
}
function truena(fn, texto, descripcion) {
  let msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  ok(msg !== null && (!texto || msg.indexOf(texto) !== -1),
     descripcion + (msg === null ? ' (NO tronó)' : ''));
  return msg;
}

/**
 * Carga el orquestador con los seis pasos reemplazados por espías.
 * `salidas` permite hacer que un paso devuelva un texto con marca de problema, o truene.
 */
function cargar(salidas) {
  const llamadas = [];
  const espia = (nombre) => (o) => {
    llamadas.push({ paso: nombre, familia: o.familia, escribir: o.escribir });
    const s = (salidas || {})[nombre];
    if (s instanceof Error) throw s;
    return s || ('salida de ' + nombre);
  };
  const logueado = [];
  const ctx = vm.createContext({
    console,
    Logger: { log: () => {} },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS_LAB' } },
    pipeLog_: (ssId, paso, modo, res, resumen) => logueado.push({ paso, modo, res, resumen }),
    revisarAntesDeMigrar: espia('revisar'),
    asignarIds: espia('ids'),
    reescribirReferencias: espia('referencias'),
    moverIdsAlInicio: espia('mover'),
    limpiarRespaldoRedundante: espia('respaldo'),
    auditarIds: espia('auditar'),
  });
  const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
  vm.runInContext(lee('config', 'Entidades.gs'), ctx);
  vm.runInContext(lee('MigracionFamilia.gs') +
    '\nthis.api = { correrFamilia, familiasEstado, vehiculos1Ensayo, vehiculos2Escribir, FAM_PASOS };',
    ctx);
  return { api: ctx.api, llamadas, logueado };
}

// ------------------------------------------------------------------------- pruebas

console.log('1. Una familia que no existe no corre nada');
{
  const { api, llamadas } = cargar();
  const msg = truena(() => api.correrFamilia('camiones'), 'No conozco la familia',
    'truena con un nombre inventado');
  ok(msg.indexOf('vehiculos') !== -1, 'y le dice cuáles sí hay: ' + (msg || '').slice(-60));
  ok(llamadas.length === 0, 'sin llamar a un solo paso');
}

console.log('\n2. El ensayo corre los seis pasos, y ninguno escribe');
{
  const { api, llamadas } = cargar();
  api.correrFamilia('vehiculos');
  ok(llamadas.length === 6, 'corrió los 6 pasos');
  ok(llamadas.map((l) => l.paso).join(',') === 'revisar,ids,referencias,mover,respaldo,auditar',
     'en el orden correcto: ' + llamadas.map((l) => l.paso).join(' → '));
  ok(llamadas.every((l) => l.escribir === false), 'ninguno recibió escribir:true');
  ok(llamadas.every((l) => l.familia === 'vehiculos'), 'todos recibieron la familia');
}

console.log('\n3. Escribiendo, los pasos de SOLO LECTURA siguen sin escribir');
{
  const { api, llamadas } = cargar();
  api.correrFamilia('vehiculos', { escribir: true });
  const soloLee = ['revisar', 'auditar'];
  ok(llamadas.filter((l) => soloLee.indexOf(l.paso) !== -1).every((l) => l.escribir === false),
     'revisar y auditar reciben escribir:false aunque la corrida escriba');
  ok(llamadas.filter((l) => soloLee.indexOf(l.paso) === -1).every((l) => l.escribir === true),
     'y los otros cuatro sí reciben escribir:true');
}

console.log('\n4. El nombre de la familia se normaliza');
{
  const { api, llamadas } = cargar();
  api.correrFamilia('  VEHICULOS  ');
  ok(llamadas.length === 6 && llamadas[0].familia === 'vehiculos',
     'con espacios y mayúsculas corre igual, y pasa la familia en minúsculas');
}

console.log('\n5. Si la revisión previa encuentra problemas, ESCRIBIENDO se detiene');
{
  const { api, llamadas } = cargar({ revisar: 'REVISIÓN\n\nPROBLEMAS (3):\n  - algo' });
  const rep = api.correrFamilia('vehiculos', { escribir: true });
  ok(llamadas.length === 1 && llamadas[0].paso === 'revisar',
     'solo corrió la revisión: ' + llamadas.map((l) => l.paso).join(', '));
  ok(rep.indexOf('SE DETUVO en "revisar"') !== -1, 'y el reporte lo dice');
  ok(rep.indexOf('No se corrieron los pasos siguientes') !== -1, 'aclarando que fue a propósito');
}

console.log('\n6. Pero en ENSAYO no se detiene: se quiere ver todo');
{
  const { api, llamadas } = cargar({ revisar: 'REVISIÓN\n\nPROBLEMAS (3):\n  - algo' });
  const rep = api.correrFamilia('vehiculos');
  ok(llamadas.length === 6, 'corrió los 6 para dar el panorama completo');
  ok(rep.indexOf('en ensayo seguimos para ver todo') !== -1, 'y explica por qué siguió');
}

console.log('\n7. Si un paso truena, se para ahí');
{
  const { api, llamadas } = cargar({ referencias: new Error('no existe la columna X') });
  const rep = api.correrFamilia('vehiculos', { escribir: true });
  ok(llamadas.length === 3, 'corrió revisar, ids y referencias, y ya');
  ok(rep.indexOf('TRONÓ: no existe la columna X') !== -1, 'el reporte trae el error');
  ok(rep.indexOf('SE DETUVO en "referencias"') !== -1, 'y dice dónde se detuvo');
  ok(rep.indexOf('pasos corridos: 2 de 6') !== -1,
     'el que tronó no cuenta como corrido');
}

console.log('\n7b. En ENSAYO, un paso que no se puede ensayar NO tumba la corrida');
{
  // Esto paso de verdad el 30/09/2026 en el laboratorio: en ensayo el paso 2 no escribe la
  // columna ID, asi que el 3 no la encuentra y tronaba. No es un error: es "esto se ensaya
  // despues de escribir el paso 2". Antes, el orquestador lo trataba como caida y se paraba.
  const { api, llamadas } = cargar({
    referencias: new Error('"VEHICULOS" todavía no tiene columna ID: corre asignarIds primero'),
  });
  const rep = api.correrFamilia('vehiculos');
  ok(llamadas.length === 6, 'siguió con los 6 pasos en vez de pararse: ' + llamadas.length);
  ok(rep.indexOf('NO SE PUDO ENSAYAR') !== -1, 'lo reporta como no ensayable');
  ok(rep.indexOf('SE DETUVO') === -1, 'y NO dice que se detuvo, porque no se detuvo');
  ok(rep.indexOf('no ensayables todavía: referencias') !== -1,
     'el resumen los junta: los que leen lo que escribe el paso 2');
  ok(rep.indexOf('No es un error') !== -1, 'y lo dice con esas palabras, para no asustar');
  ok(rep.indexOf('pasos corridos: 5 de 6') !== -1,
     'el no ensayable no cuenta como corrido');
}

console.log('\n8. La auditoría con fallas se reporta, pero ya no hay nada que detener');
{
  const { api, llamadas } = cargar({ auditar: 'AUDITORÍA\n\nFALLAS (2):\n  - algo' });
  const rep = api.correrFamilia('vehiculos', { escribir: true });
  ok(llamadas.length === 6, 'corrieron los 6: la auditoría es el último');
  ok(rep.indexOf('SE DETUVO en "auditar"') !== -1, 'se marca como detenido para que se note');
}

console.log('\n9. Queda constancia en la bitácora');
{
  const { api, logueado } = cargar();
  api.correrFamilia('vehiculos', { escribir: true });
  ok(logueado.length === 1, 'una entrada');
  ok(logueado[0].paso === 'homologarFamilia:vehiculos', 'con la familia en el nombre del paso');
  ok(logueado[0].modo === 'ESCRIBIR' && logueado[0].res === 'OK', 'y el modo y el resultado');
  ok(logueado[0].resumen.indexOf('6/6 pasos') !== -1, 'más el resumen: ' + logueado[0].resumen);
}

console.log('\n10. familiasEstado enseña el reparto sin tocar nada');
{
  const { api, llamadas } = cargar();
  const rep = api.familiasEstado();
  ok(llamadas.length === 0, 'no corre ningún paso');
  ok(rep.indexOf('vehiculos  (8 hojas)') !== -1, 'dice cuántas hojas tiene vehículos');
  ok(rep.indexOf('INSTALACION DE SENSORES [SEN]') !== -1, 'y las nombra con su prefijo');
  ok(rep.indexOf('lineas  (10 hojas)') !== -1, 'y también las otras familias');
}

console.log('\n11. Los atajos del editor apuntan a donde dicen');
{
  const { api, llamadas } = cargar();
  api.vehiculos1Ensayo();
  ok(llamadas.every((l) => l.familia === 'vehiculos' && l.escribir === false),
     'vehiculos1Ensayo: familia vehiculos, sin escribir');
  llamadas.length = 0;
  api.vehiculos2Escribir();
  ok(llamadas.filter((l) => l.paso === 'ids')[0].escribir === true,
     'vehiculos2Escribir: el paso de ids sí escribe');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

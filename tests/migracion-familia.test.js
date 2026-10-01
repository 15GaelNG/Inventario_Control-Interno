/**
 * Pruebas de los cuatro pipelines (src/MigracionFamilia.gs).
 *
 *   1. IDS, todas las hojas      ids1Ensayo / ids2Escribir
 *   2. HOMOLOGAR VEHICULOS       vehiculos1Ensayo / vehiculos2Escribir
 *   3. HOMOLOGAR LINEAS          lineas1Ensayo / lineas2Escribir
 *   4. HOMOLOGAR CAJA CHICA      cajaChica1Ensayo / cajaChica2Escribir
 *
 * Lo que de verdad protege esto: que un paso de SOLO LECTURA nunca reciba escribir:true;
 * que el pipeline 1 NO filtre por familia (si lo hiciera, dejaría hojas sin ID); que los de
 * homologación SÍ filtren (si no, homologar vehículos tocaría Líneas); y que si la revisión
 * previa encuentra problemas, la corrida que escribe se detenga antes de tocar nada.
 * Los pasos por dentro ya tienen sus propias pruebas.
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

/** Carga los pipelines con los pasos reemplazados por espías. */
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
    renombrarLlaveAnterior: espia('renombrar'),
    asignarIds: espia('ids'),
    moverIdsAlInicio: espia('mover'),
    limpiarRespaldoRedundante: espia('respaldo'),
    reescribirReferencias: espia('referencias'),
    auditarIds: espia('auditar'),
  });
  const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
  vm.runInContext(lee('config', 'Entidades.gs'), ctx);
  vm.runInContext(lee('MigracionFamilia.gs') +
    '\nthis.api = { correrIdsTodo, correrFamilia, pipelinesEstado,' +
    ' ids1Ensayo, ids2Escribir, vehiculos1Ensayo, vehiculos2Escribir,' +
    ' lineas1Ensayo, cajaChica1Ensayo, PASOS_IDS, PASOS_HOMOLOGA };', ctx);
  return { api: ctx.api, llamadas, logueado };
}

const pasos = (llamadas) => llamadas.map((l) => l.paso).join(',');

// ==================================================== PIPELINE 1: los IDs

console.log('1. PIPELINE 1 corre los seis pasos de IDs, en orden');
{
  const { api, llamadas } = cargar();
  api.correrIdsTodo();
  ok(llamadas.length === 6, 'seis pasos');
  ok(pasos(llamadas) === 'revisar,renombrar,ids,mover,respaldo,auditar',
     'en orden: ' + llamadas.map((l) => l.paso).join(' → '));
  ok(llamadas[1].paso === 'renombrar' && llamadas[2].paso === 'ids',
     'renombrar va ANTES de ids: la hoja queda sin ID y el paso siguiente crea uno limpio');
}

console.log('\n2. El PIPELINE 1 NO filtra por familia: son TODAS las hojas');
{
  const { api, llamadas } = cargar();
  api.correrIdsTodo();
  ok(llamadas.every((l) => l.familia === undefined),
     'ningún paso recibe familia, así que cada uno recorre las 20 hojas');
  // Si esto se rompiera, el pipeline de IDs dejaría hojas sin ID y las
  // homologaciones fallarían después sin decir por qué.
}

console.log('\n3. Escribiendo, los pasos de SOLO LECTURA siguen sin escribir');
{
  const { api, llamadas } = cargar();
  api.correrIdsTodo({ escribir: true });
  const soloLee = ['revisar', 'auditar'];
  ok(llamadas.filter((l) => soloLee.indexOf(l.paso) !== -1).every((l) => l.escribir === false),
     'revisar y auditar reciben escribir:false aunque la corrida escriba');
  ok(llamadas.filter((l) => soloLee.indexOf(l.paso) === -1).every((l) => l.escribir === true),
     'renombrar, ids, mover y respaldo sí escriben');
}

console.log('\n4. Si la revisión previa encuentra problemas, ESCRIBIENDO se detiene');
{
  const { api, llamadas } = cargar({ revisar: 'REVISIÓN\n\nPROBLEMAS (3):\n  - algo' });
  const rep = api.correrIdsTodo({ escribir: true });
  ok(llamadas.length === 1 && llamadas[0].paso === 'revisar',
     'solo corrió la revisión: ' + pasos(llamadas));
  ok(rep.indexOf('SE DETUVO en "revisar"') !== -1, 'y el reporte lo dice');
  ok(rep.indexOf('No se corrieron los pasos siguientes') !== -1, 'aclarando que fue a propósito');
}

console.log('\n5. Y si renombrar reporta problemas, tampoco llega a los ids');
{
  const { api, llamadas } = cargar({ renombrar: 'RENOMBRANDO\n\nPROBLEMAS (1):\n  - no encuentro' });
  api.correrIdsTodo({ escribir: true });
  ok(pasos(llamadas) === 'revisar,renombrar',
     'se paró antes de asignar IDs: ' + pasos(llamadas));
}

console.log('\n6. En ENSAYO no se detiene: se quiere ver todo');
{
  const { api, llamadas } = cargar({ revisar: 'REVISIÓN\n\nPROBLEMAS (3):\n  - algo' });
  const rep = api.correrIdsTodo();
  ok(llamadas.length === 6, 'corrió los seis para dar el panorama completo');
  ok(rep.indexOf('en ensayo seguimos para ver todo') !== -1, 'y explica por qué siguió');
}

console.log('\n7. En ENSAYO, un paso que no se puede ensayar NO tumba la corrida');
{
  // Paso de verdad en el laboratorio el 30/09/2026: en ensayo el paso de ids no escribe la
  // columna, así que los que la leen tronaban y el orquestador se paraba.
  const { api, llamadas } = cargar({
    mover: new Error('"VEHICULOS" todavía no tiene columna ID: corre asignarIds primero'),
  });
  const rep = api.correrIdsTodo();
  ok(llamadas.length === 6, 'siguió con los seis en vez de pararse');
  ok(rep.indexOf('NO SE PUDO ENSAYAR') !== -1, 'lo reporta como no ensayable');
  ok(rep.indexOf('SE DETUVO') === -1, 'y NO dice que se detuvo, porque no se detuvo');
  ok(rep.indexOf('no ensayables todavía: mover') !== -1, 'el resumen los junta');
  ok(rep.indexOf('No es un error') !== -1, 'y lo dice con esas palabras, para no asustar');
  ok(rep.indexOf('pasos corridos: 5 de 6') !== -1, 'el no ensayable no cuenta como corrido');
}

console.log('\n8. Si un paso truena escribiendo, se para ahí');
{
  const { api, llamadas } = cargar({ ids: new Error('se acabó el tiempo') });
  const rep = api.correrIdsTodo({ escribir: true });
  ok(pasos(llamadas) === 'revisar,renombrar,ids', 'corrió hasta el que tronó');
  ok(rep.indexOf('TRONÓ: se acabó el tiempo') !== -1, 'el reporte trae el error');
  ok(rep.indexOf('pasos corridos: 2 de 6') !== -1, 'el que tronó no cuenta como corrido');
}

// ==================================== PIPELINES 2, 3 y 4: la homologación

console.log('\n9. Los pipelines de homologación SÍ filtran por familia');
{
  const { api, llamadas } = cargar();
  api.correrFamilia('vehiculos');
  ok(pasos(llamadas) === 'referencias,auditar', 'dos pasos: ' + pasos(llamadas));
  ok(llamadas.every((l) => l.familia === 'vehiculos'),
     'los dos reciben la familia, así que homologar vehículos NO toca Líneas');
}

console.log('\n10. Y no repiten el trabajo del pipeline 1');
{
  const { api, llamadas } = cargar();
  api.correrFamilia('vehiculos', { escribir: true });
  ok(llamadas.every((l) => ['ids', 'renombrar', 'mover', 'respaldo'].indexOf(l.paso) === -1),
     'no vuelven a asignar IDs ni a renombrar: eso ya lo hizo el pipeline 1');
  ok(llamadas.filter((l) => l.paso === 'referencias')[0].escribir === true,
     'referencias sí escribe');
  ok(llamadas.filter((l) => l.paso === 'auditar')[0].escribir === false,
     'y auditar no, porque solo lee');
}

console.log('\n11. Una familia que no existe no corre nada');
{
  const { api, llamadas } = cargar();
  const msg = truena(() => api.correrFamilia('camiones'), 'No conozco la familia',
    'truena con un nombre inventado');
  ok(msg.indexOf('vehiculos') !== -1, 'y le dice cuáles sí hay');
  ok(llamadas.length === 0, 'sin llamar a un solo paso');
}

console.log('\n12. El nombre de la familia se normaliza');
{
  const { api, llamadas } = cargar();
  api.correrFamilia('  VEHICULOS  ');
  ok(llamadas.length === 2 && llamadas[0].familia === 'vehiculos',
     'con espacios y mayúsculas corre igual, y pasa la familia en minúsculas');
}

console.log('\n13. Queda constancia en la bitácora, y se distingue cuál pipeline fue');
{
  const a = cargar();
  a.api.correrIdsTodo({ escribir: true });
  ok(a.logueado.length === 1 && a.logueado[0].paso === 'pipelineIds',
     'el de IDs se registra como "pipelineIds"');
  ok(a.logueado[0].resumen.indexOf('6/6 pasos') !== -1, 'con su resumen: ' + a.logueado[0].resumen);

  const b = cargar();
  b.api.correrFamilia('lineas', { escribir: true });
  ok(b.logueado[0].paso === 'homologarFamilia:lineas',
     'y el de homologación trae la familia en el nombre');
  // 6, no 10: el 30/09/2026 se eliminaron 4 pestañas de Líneas (ver Entidades.gs).
  ok(b.logueado[0].resumen.indexOf('6 hojas') !== -1, 'y cuántas hojas tocó');
}

console.log('\n14. pipelinesEstado enseña los cuatro sin tocar nada');
{
  const { api, llamadas } = cargar();
  const rep = api.pipelinesEstado();
  ok(llamadas.length === 0, 'no corre ningún paso');
  ok(rep.indexOf('1. IDS, todas las hojas (20)') !== -1, 'el pipeline 1, con las 20 hojas');
  ok(rep.indexOf('ids1Ensayo') !== -1 && rep.indexOf('vehiculos1Ensayo') !== -1 &&
     rep.indexOf('cajaChica1Ensayo') !== -1, 'los atajos de cada uno');
  ok(rep.indexOf('HOMOLOGAR VEHICULOS (8 hojas)') !== -1, 'vehículos con sus 8');
  ok(rep.indexOf('HOMOLOGAR LINEAS (6 hojas)') !== -1, 'líneas con sus 6, ya sin las 4 eliminadas');
  ok(rep.indexOf('INSTALACION DE SENSORES [SEN]') !== -1, 'y las nombra con su prefijo');
  ok(rep.indexOf('El pipeline 1 va PRIMERO') !== -1, 'y dice el orden');
}

console.log('\n15. Los atajos del editor apuntan a donde dicen');
{
  const { api, llamadas } = cargar();
  api.ids1Ensayo();
  ok(llamadas.length === 6 && llamadas.every((l) => l.escribir === false),
     'ids1Ensayo: los seis pasos, ninguno escribe');
  llamadas.length = 0;
  api.ids2Escribir();
  ok(llamadas.filter((l) => l.paso === 'ids')[0].escribir === true, 'ids2Escribir sí escribe');
  llamadas.length = 0;
  api.vehiculos1Ensayo();
  ok(pasos(llamadas) === 'referencias,auditar' && llamadas[0].familia === 'vehiculos',
     'vehiculos1Ensayo: homologación de vehículos');
  llamadas.length = 0;
  api.cajaChica1Ensayo();
  ok(llamadas[0].familia === 'cajachica', 'cajaChica1Ensayo: familia cajachica');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

/**
 * Accesorios de cada unidad (AccesoriosVehiculoService, 16-oct-2026): el estado sale del último movimiento de cada
 * pieza, desde la app solo hay ALTA y BAJA, y no se puede dar de alta lo que ya tiene ni de baja lo que no tiene.
 * Hojas en memoria (apps-script-simulado). Correr: npm test
 */
const { crearEntorno } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const truena = (fn, patron) => { try { fn(); return false; } catch (err) { return patron.test(err.message); } };

const ENC_MOV = ['ID', 'FECHA', 'ID VEHICULO', 'NUCCO', 'ACCESORIO', 'MOVIMIENTO', 'TIENE', 'MOTIVO', 'ORIGEN', 'EVIDENCIA', 'REGISTRO'];
let e;
e = crearEntorno({
  libros: {
    veh: {
      VEHICULOS: [['ID', 'FOLIO', 'NUCCO'], ['VEH-1', 'AUT0088', '88'], ['VEH-2', 'AUT0090', '90']],
      'CATALOGO ACCESORIOS VEHICULOS': [['ID', 'CLAVE', 'NOMBRE', 'ORDEN', 'ACTIVO'],
        ['CAV-1', 'GATO HIDRAULICO', 'Gato hidráulico', 1, 'SI'], ['CAV-2', 'LLANTA REFACCION', 'Llanta de refacción', 2, 'SI'],
        ['CAV-3', 'PARASOL', 'Parasol', 3, 'SI'], ['CAV-4', 'CUBIERTA BATEA', 'Cubierta de batea', 4, 'NO']],
      'MOVIMIENTOS ACCESORIOS VEHICULOS': [ENC_MOV],
    },
  },
});
const f = e.fecha;
// La carga inicial de la unidad 88 (lo que subiría el script de Jorge)
const mov = e.libros.veh.getSheetByName('MOVIMIENTOS ACCESORIOS VEHICULOS');
mov.appendRow(['MAV-0001', f('2025-03-12'), 'VEH-1', '88', 'GATO HIDRAULICO', 'CARGA INICIAL', 'SI', '', 'RESPONSIVA-0088.pdf', '', 'jorge@x.com']);
mov.appendRow(['MAV-0002', f('2025-03-12'), 'VEH-1', '88', 'LLANTA REFACCION', 'CARGA INICIAL', 'NO', '', 'RESPONSIVA-0088.pdf', '', 'jorge@x.com']);

e.cargar('src/utils/CacheHojas.gs', 'src/utils/Ids.gs', 'src/config/Entidades.gs', 'src/utils/SheetUtils.gs', {
  nombre: 'falsos.js',
  codigo: `
    var Config = { SPREADSHEET_IDS: { VEHICULOS: () => 'veh' } };
    var puede = { editar: true };
    var Permisos = {
      puedeLeer: (t) => ({ correo: t }),
      puedeEditar: (t) => { if (!puede.editar) throw new Error('No tienes acceso a este módulo.'); return { correo: t }; },
    };
  `,
}, 'src/utils/HojaServicio.gs', 'src/services/AccesoriosVehiculoService.gs');
const S = e.global('AccesoriosVehiculoService');
const pieza = (r, clave) => r.estado.find((x) => x.CLAVE === clave);

console.log('1. El estado sale del último movimiento de cada pieza');
let r = S.deVehiculo('ana@x.com', 'VEH-1');
ok(r.estado.map((x) => x.CLAVE).join() === 'GATO HIDRAULICO,LLANTA REFACCION,PARASOL', 'las piezas del catálogo en su orden (sin la inactiva)');
ok(pieza(r, 'GATO HIDRAULICO').TIENE === 'SI' && pieza(r, 'LLANTA REFACCION').TIENE === 'NO', 'lo de la carga inicial: SI y NO');
ok(pieza(r, 'PARASOL').TIENE === '', 'una pieza sin movimientos es «sin dato», no «no tiene»');
ok(r.historial.length === 2, 'la historia de la unidad');
ok(S.deVehiculo('ana@x.com', 'VEH-2').historial.length === 0, 'otra unidad no ve lo de la primera');

console.log('2. Alta y baja desde la ficha');
const alta = S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-1', ACCESORIO: 'LLANTA REFACCION', MOVIMIENTO: 'ALTA', FECHA: '2026-10-01' });
ok(/^MAV-/.test(alta.ID), 'el movimiento nace con su ID MAV-');
r = S.deVehiculo('ana@x.com', 'VEH-1');
ok(pieza(r, 'LLANTA REFACCION').TIENE === 'SI', 'después del ALTA la unidad tiene la llanta');
const fila = r.historial[0];
ok(fila.MOVIMIENTO === 'ALTA' && fila.NUCCO === '88' && fila.REGISTRO === 'ana@x.com' && fila.ORIGEN === 'MANUAL',
  'el servidor pone el NUCCO, quién lo registró y ORIGEN MANUAL (lo más nuevo primero)');
S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-1', ACCESORIO: 'GATO HIDRAULICO', MOVIMIENTO: 'BAJA', MOTIVO: 'Extravío', FECHA: '2026-10-02' });
r = S.deVehiculo('ana@x.com', 'VEH-1');
ok(pieza(r, 'GATO HIDRAULICO').TIENE === 'NO' && pieza(r, 'GATO HIDRAULICO').DESDE.slice(0, 10) === '2026-10-02',
  'después de la BAJA no la tiene, desde esa fecha');

console.log('3. Lo que no tiene sentido no pasa');
ok(truena(() => S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-1', ACCESORIO: 'LLANTA REFACCION', MOVIMIENTO: 'ALTA' }), /ya tiene/),
  'no se da de alta lo que ya tiene');
ok(truena(() => S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-1', ACCESORIO: 'PARASOL', MOVIMIENTO: 'BAJA', MOTIVO: 'x' }), /no tiene registrado/),
  'ni de baja lo que no tiene (sin dato tampoco)');
ok(truena(() => S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-1', ACCESORIO: 'LLANTA REFACCION', MOVIMIENTO: 'BAJA' }), /motivo/),
  'la baja pide motivo');
ok(truena(() => S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-1', ACCESORIO: 'PARASOL', MOVIMIENTO: 'CARGA INICIAL' }), /ALTA o BAJA/),
  'la CARGA INICIAL no se hace desde la app');
ok(truena(() => S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-1', ACCESORIO: 'TAPETES', MOVIMIENTO: 'ALTA' }), /no está en el catálogo/),
  'una pieza que no está en el catálogo');
ok(truena(() => S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-1', ACCESORIO: 'CUBIERTA BATEA', MOVIMIENTO: 'ALTA' }), /ya no se usa/),
  'una pieza inactiva no se da de alta');
ok(truena(() => S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-9', ACCESORIO: 'PARASOL', MOVIMIENTO: 'ALTA' }), /No se encontró la unidad/),
  'una unidad que no existe');
ok(truena(() => S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-1', ACCESORIO: 'PARASOL', MOVIMIENTO: 'ALTA', FECHA: '2027-01-01' }), /futura/),
  'una fecha futura');
e.contexto.puede.editar = false;
ok(truena(() => S.registrar('ana@x.com', { ID_VEHICULO: 'VEH-1', ACCESORIO: 'PARASOL', MOVIMIENTO: 'ALTA' }), /No tienes acceso/),
  'sin permiso de edición no escribe');
ok(e.libros.veh.getSheetByName('MOVIMIENTOS ACCESORIOS VEHICULOS').getLastRow() === 5, 'solo quedaron los 2 de la carga y los 2 válidos');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

/**
 * El Inicio (DashboardService.resumen) y la campanita (NotificacionesService.listar) se guardan
 * ya calculados (CacheHojas.calculo): se comparten entre quienes ven los mismos módulos y se
 * rehacen solos cuando cambia una hoja de la que salen. Los servicios de cada módulo son de
 * mentira, pero leen por CacheHojas.recordar como los de verdad. Correr: npm test
 */
const { crearEntorno } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const e = crearEntorno();
e.cargar('src/utils/CacheHojas.gs', {
  nombre: 'servicios-falsos.js',
  codigo: `
    var lecturas = {};           // cuántas veces se "leyó la hoja" de cada lista
    var sinPermiso = {};         // modulo -> true: esa persona no lo puede ver
    var rota = {};               // modulo -> true: falla por algo pasajero
    var permisosDe = { 'a@x': ['vehiculos', 'tickets', 'incidencias', 'inspecciones'], 'b@x': ['inspecciones', 'incidencias', 'tickets', 'vehiculos'], 'c@x': ['vehiculos'] };
    var quien = 'a@x';
    function lista_(modulo, hoja, filas, nombre) {
      if (rota[modulo]) throw new Error('Service invoked too many times');
      if (permisosDe[quien].indexOf(modulo) === -1) throw new Error('No tienes acceso a este módulo. Pídeselo a quien administra los permisos.');
      return CacheHojas.recordar('l_' + (nombre || hoja), [['libro', hoja]], () => { lecturas[hoja] = (lecturas[hoja] || 0) + 1; return filas(); });
    }
    var hoy = new Date().toISOString();
    var Auth = { validarSesion: (t) => ({ correo: t }) };
    var Permisos = {
      firmaDeLectura: (c) => permisosDe[c].slice().sort().join(','),
      esFaltaDePermiso: (e) => /No tienes acceso/.test(e.message),
    };
    var HojaServicio = { fechaISO: (v) => v };
    var VehiculosService = {
      listarResumen: () => lista_('vehiculos', 'VEHICULOS', () => [{ ID_VEHICULO: 'VEH-1', FOLIO: 'A1', NUCCO: '0001', ESTATUS: 'ACTIVO' }, { ID_VEHICULO: 'VEH-2', FOLIO: 'A2', ESTATUS: 'BAJA VEHICULAR' }]),
      vencimientosSeguro: () => lista_('vehiculos', 'VEHICULOS', () => [{ FOLIO: 'A1', NUCCO: '0001', ESTATUS: 'ACTIVO', 'FECHA VENCIMIENTO SEGURO': hoy }], 'SEGURO'),
    };
    var TicketsService = { listarResumen: () => lista_('tickets', 'TICKETS', () => [{ 'FECHA DE REGISTRO': hoy, SOLICITANTE: 'Ana' }]) };
    var IncidenciasService = { listar: () => lista_('incidencias', 'INCIDENCIAS', () => []) };
    var CajasChicasService = { listarResumen: () => lista_('caja-chica', 'CAJAS CHICAS', () => []) };
    var VerificacionesService = { listar: () => lista_('verificaciones', 'VERIFICACIONES', () => []) };
    var InspeccionesService = { listar: () => lista_('inspecciones', 'INSPECCIONES', () => []) };
    var ArqueosService = { listarResumen: () => lista_('arqueos', 'ARQUEOS', () => []) };
    var lineasRota = false;
    var TelefoniaService = {
      notificaciones: (token, limite) => {
        if (lineasRota) throw new Error('Service invoked too many times');
        const items = [{ id: 'N1', tipo: 'ADENDUM', titulo: 'Adendum', leida: false }, { id: 'N2', tipo: 'RESGUARDO', titulo: 'R', leida: true }];
        return { noLeidas: 1, total: 2, items: limite ? items.slice(0, limite) : items };
      },
    };
  `,
}, 'src/services/DashboardService.gs', 'src/services/NotificacionesService.gs');

const g = (n) => e.global(n);
const como = (correo) => { e.contexto.quien = correo; return correo; };
const lecturas = (hoja) => g('lecturas')[hoja] || 0;

console.log('1. Inicio');
const r1 = g('DashboardService').resumen(como('a@x'));
ok(r1.vehiculos.total === 2 && r1.vehiculos.baja === 1, 'calcula los KPIs');
ok(r1.cajasChicas === null, 'una sección sin permiso llega vacía');
const vehAntes = lecturas('VEHICULOS');
g('DashboardService').resumen(como('a@x'));
ok(lecturas('VEHICULOS') === vehAntes, 'la segunda vez no vuelve a pedir ninguna lista (sale ya calculado)');
const r2 = g('DashboardService').resumen(como('b@x'));
ok(r2.vehiculos.total === 2 && lecturas('VEHICULOS') === vehAntes, 'otra persona con los mismos módulos comparte lo calculado');
const r3 = g('DashboardService').resumen(como('c@x'));
ok(r3.ticketsIncidencias === null && r3.vehiculos.total === 2, 'con otros permisos es otro cálculo: no ve los tickets de nadie');

console.log('2. Se rehace al cambiar una hoja de la que sale');
g('CacheHojas').tocar('libro', 'VEHICULOS');
g('DashboardService').resumen(como('a@x'));
ok(lecturas('VEHICULOS') === vehAntes + 1, 'escribir en VEHICULOS lo recalcula');
const ticAntes = lecturas('TICKETS');
g('CacheHojas').tocar('libro', 'UBER');
g('DashboardService').resumen(como('a@x'));
ok(lecturas('TICKETS') === ticAntes, 'escribir en una hoja que no usa no lo toca');

console.log('3. Un error pasajero no se queda guardado');
g('CacheHojas').tocar('libro', 'TICKETS');
e.contexto.rota.tickets = true;
const roto = g('DashboardService').resumen(como('a@x'));
ok(roto.ticketsIncidencias === null, 'la sección que falló llega vacía (como antes)');
delete e.contexto.rota.tickets;
const sano = g('DashboardService').resumen(como('a@x'));
ok(sano.ticketsIncidencias !== null && sano.ticketsIncidencias.ticketsRecientes === 1, 'y a la siguiente se vuelve a calcular, ya bien');

console.log('4. Campanita');
const n1 = g('NotificacionesService').listar(como('a@x'));
ok(n1.some((i) => i.tipo === 'seguro' && i.folio === 'A1'), 'avisa el seguro por vencer');
ok(n1.some((i) => i.tipo === 'inspeccion' && i.folio === 'A1') && !n1.some((i) => i.folio === 'A2'), 'inspección atrasada solo de los activos');
const vehCamp = lecturas('VEHICULOS');
const n2 = g('NotificacionesService').listar(como('b@x'));
ok(n2.length === n1.length && lecturas('VEHICULOS') === vehCamp, 'se comparte entre los mismos permisos');
g('CacheHojas').tocar('libro', 'VEHICULOS');
g('NotificacionesService').listar(como('a@x'));
ok(lecturas('VEHICULOS') > vehCamp, 'escribir en VEHICULOS la recalcula');

console.log('5. La campana completa: una fuente por módulo, con la misma forma (fase 5.5)');
const c1 = g('NotificacionesService').campana(como('a@x'), 1);
ok(c1.lineas.items.length === 1 && c1.lineas.noLeidas === 1 && c1.lineas.items[0].modulo === 'lineas', 'Líneas: sus avisos (con el límite) y sus no leídas');
const seg = c1.vehiculos.items.find((n) => n.tipo === 'VEH_SEGURO');
ok(seg && seg.id === 'veh-seguro-A1' && seg.modulo === 'vehiculos' && seg.titulo === 'Seguro · Nucco 0001 (A1)' && seg.fecha === null,
  'Vehículos: con la forma de un aviso (id, tipo, título) como lo armaba la pantalla');
ok(!('leida' in seg), 'la "leída" de Vehículos no la decide el servidor (es del navegador)');
e.contexto.lineasRota = true;
const c2 = g('NotificacionesService').campana(como('a@x'), 8);
ok(c2.lineas === null && c2.vehiculos.items.length === c1.vehiculos.items.length, 'si Líneas falla llega null y Vehículos sigue');
e.contexto.lineasRota = false;

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

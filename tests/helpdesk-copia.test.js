/**
 * La copia de los tickets del helpdesk en APP_HELPDESK y el registro en Tickets
 * (src/services/HelpdeskService.gs), con HelpdeskApi, TicketsService y HojaServicio reales sobre
 * hojas simuladas y el helpdesk simulado. Tickets inventados, con la forma de los reales.
 *
 * Correr: node tests/helpdesk-copia.test.js
 */
const { crearEntorno, AHORA } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const truena = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (email) => [b64url({ alg: 'HS256' }), b64url({ name: 'Ana', email, exp: AHORA / 1000 + 86400 }), 'firma'].join('.');

const ticket = (id, extra) => Object.assign({
  idTicket: id, title: 'Ticket ' + id, notes: 'Descripción ' + id, idStatus: 1, nameStatus: 'Abierto', namePriority: 'Baja',
  colorPriority: '#A0D76A', nameUser: 'Solicitante ' + id, email: 's' + id + '@ejemplo.com', nameAgent: 'Agente', nameDepartment: 'COMPRAS',
  nameToArea: 'SENSORES', nameArea: 'SUMINISTROS', nameBranch: 'Sensores', dateCreationDB: '2026-10-02', dateClose: null,
  nameForm: 'Incidencia | Solicitud - Sensores', cantUnseenMessages: 0,
}, extra || {});

function entorno() {
  const e = crearEntorno({ libros: { libro: { TICKETS: [['ID', 'TICKET', 'QUIEN ATENDIO', 'FECHA DE REGISTRO', 'FECHA', 'DEPARTAMENTO', 'SOLICITANTE', 'TIPO ATENCION', 'PLACA', 'COMENTARIO'],
    ['TCK-1', '700', 'ANA', '', '', '', '', 'NIP EOX', '', '']] } } });
  const llamadas = [];
  const estado = { lista: [ticket(901), ticket(902)] };
  const sesiones = {
    'tok-ana': { correo: 'ana@ejemplo.com', nombre: 'ANA' },        // edita Tickets
    'tok-luis': { correo: 'luis@ejemplo.com', nombre: 'LUIS' },     // solo ve Help Desk
  };
  const permiso = (nivel) => (t, m) => {
    if (!sesiones[t]) throw new Error('Sesión expirada');
    if (m === 'tickets' && t !== 'tok-ana') throw new Error(nivel === 'leer' ? 'No tienes acceso a este módulo.' : 'Solo puedes consultar este módulo, no modificarlo.');
    return sesiones[t];
  };
  Object.assign(e.contexto, {
    Auth: { validarSesion: (t) => { if (!sesiones[t]) throw new Error('Sesión expirada'); return sesiones[t]; } },
    Permisos: { puedeLeer: permiso('leer'), puedeEditar: permiso('editar') },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'libro' } },
    Entidades: { prefijo: (h) => ({ APP_HELPDESK: 'HDK', TICKETS: 'TCK' })[h] },
    Ids: (() => { let n = 0; return { nuevo: (p) => p + '-N' + (++n) }; })(),
    Relaciones: { protegeBorrado: () => false },
    UrlFetchApp: {
      fetch: (url, op) => {
        llamadas.push(url.replace(/^.*\.com/, ''));
        const cuerpo = /autoLogin$/.test(url) ? { status: 1, data: { email: JSON.parse(Buffer.from(op.headers.authorization.split('.')[1], 'base64')).email } }
          : /tickets\/list$/.test(url) ? { cantTotalTickets: estado.lista.length, tickets: estado.lista }
            : /getTicket$/.test(url) ? { tickets: [estado.lista.find((t) => t.idTicket === JSON.parse(op.payload).idTicket)] }
              : /getConversationTickets$/.test(url) ? { conversation: [{ idConversation: 1, nameAnswer: 'X', dateCreation: '2026-10-03T10:00:00Z', notes: '<p>MENSAJE SECRETO</p>' }] } : {};
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(cuerpo), getHeaders: () => ({}) };
      },
    },
  });
  e.cargar('src/utils/SheetUtils.gs', 'src/utils/CacheHojas.gs', 'src/utils/HojaServicio.gs', 'src/services/TicketsService.gs',
    'src/services/HelpdeskApi.gs', 'src/services/HelpdeskService.gs');
  const api = e.global('HelpdeskApi');
  const srv = e.global('HelpdeskService');
  const copia = () => e.hojaComoTexto('libro', 'APP_HELPDESK');
  const col = (n) => copia()[0].indexOf(n);
  const fila = (hd) => copia().find((f) => String(f[col('ID TICKET HD')]) === String(hd));
  ['tok-ana', 'tok-luis'].forEach((t) => { e.avanzar(2100); api.conectar(t, jwt(e.contexto.Auth.validarSesion(t).correo)); });
  return { e, api, srv, llamadas, estado, copia, col, fila };
}

// ---------------------------------------------------------------------------------- 1
console.log('1. La copia se llena sola, sin llamar de más al helpdesk');
{
  const { e, api, llamadas, copia, col, fila } = entorno();
  ok(e.libros.libro.getSheetByName('APP_HELPDESK') === null, 'antes de ver tickets, la hoja no existe');
  e.avanzar(2100);
  const antes = llamadas.length;
  api.listarTickets('tok-luis');
  ok(llamadas.length - antes === 1, 'ver la lista es UNA llamada al helpdesk (la copia no agrega ninguna)');
  ok(copia()[0].join('|').startsWith('ID|ID TICKET HD|TITULO'), 'la hoja se creó sola, con sus encabezados');
  ok(copia().length === 3 && fila(901)[col('ID')] === 'HDK-N1', 'un renglón por ticket, con ID del sistema');
  ok(fila(901)[col('FECHA CREACION')] === '2026-10-02T06:00:00.000Z' && fila(901)[col('GRUPO')] === 'Sensores', 'fechas como fecha (medianoche local) y el grupo');
  ok(fila(901)[col('ACTUALIZADO POR')] === 'luis@ejemplo.com', 'quién lo vio (cualquiera puede llenarla: es automática)');

  api.listarTickets('tok-luis');
  ok(llamadas.length - antes === 1 && copia().length === 3, 'si la lista sale de la caché, no se llama ni se escribe nada');
}
{
  const { e, api, estado, copia, col, fila } = entorno();
  e.avanzar(2100);
  api.listarTickets('tok-luis');
  const actualizado902 = fila(902)[col('ACTUALIZADO')];
  estado.lista = [ticket(901, { idStatus: 4, nameStatus: 'Cerrado', dateClose: '2026-10-04T15:00:00.000Z' }), ticket(902), ticket(903)];
  e.avanzar(5 * 60000);
  api.listarTickets('tok-ana', null, true);
  ok(copia().length === 4, 'el nuevo (903) se agrega; ninguno se duplica');
  ok(fila(901)[col('ESTATUS')] === 'Cerrado' && fila(901)[col('FECHA CIERRE')] === '2026-10-04T15:00:00.000Z' && fila(901)[col('ACTUALIZADO POR')] === 'ana@ejemplo.com',
    'el que cambió (901 se cerró) se actualiza');
  ok(fila(902)[col('ACTUALIZADO')] === actualizado902, 'el que no cambió (902) no se toca');

  e.avanzar(2100);
  const d = api.detalle('tok-ana', 903);
  ok(d.MENSAJES.length === 1, 'el detalle trae la conversación…');
  ok(!JSON.stringify(copia()).includes('MENSAJE SECRETO'), '…pero la conversación NO se copia a la hoja');
}
{
  const { e, api } = entorno();
  // Otro proceso tiene el candado: HelpdeskApi.pedirTurno_ también lo pide, así que solo se le
  // niega a la copia (el primer tryLock es el del turno)
  let pedidos = 0;
  e.contexto.LockService = { getScriptLock: () => ({ tryLock: () => (++pedidos === 1), waitLock: () => {}, releaseLock: () => {} }) };
  e.avanzar(2100);
  const r = api.listarTickets('tok-luis');
  ok(r.tickets.length === 2 && e.libros.libro.getSheetByName('APP_HELPDESK') === null,
    'sin candado: la copia se salta (la siguiente consulta la pone al día) y la pantalla igual recibe su lista');
}

{
  // La lista del inicio del helpdesk trae menos campos: lo que no trae no borra lo guardado
  const { e, srv, fila, col } = entorno();
  srv.sincronizar_([{ ID: 950, TITULO: 'Uno', CORREO_SOLICITANTE: 'a@ejemplo.com', ESTATUS: 'Abierto', FORMULARIO: 'F' }], 'ana@ejemplo.com');
  e.avanzar(60000);
  srv.sincronizar_([{ ID: 950, TITULO: 'Uno', CORREO_SOLICITANTE: '', ESTATUS: 'Resuelto', FORMULARIO: '' }], 'luis@ejemplo.com', true);
  ok(fila(950)[col('ESTATUS')] === 'Resuelto' && fila(950)[col('CORREO SOLICITANTE')] === 'a@ejemplo.com' && fila(950)[col('FORMULARIO')] === 'F',
    'parcial: actualiza lo que sí vino (estatus) y no borra lo que no vino (correo, formulario)');
  srv.sincronizar_([{ ID: 950, TITULO: 'Uno', CORREO_SOLICITANTE: '', ESTATUS: 'Resuelto', FORMULARIO: '' }], 'luis@ejemplo.com');
  ok(fila(950)[col('CORREO SOLICITANTE')] === '', 'completo (lista o detalle): lo vacío sí cuenta');
}

// ---------------------------------------------------------------------------------- 2
console.log('\n2. Registrar en Tickets');
{
  const { e, api, srv, copia, col, fila } = entorno();
  e.avanzar(2100);
  api.listarTickets('tok-ana');
  const datos = { 'TIPO ATENCION': 'NIP EDENRED', FECHA: '2026-10-02', DEPARTAMENTO: 'COMPRAS', SOLICITANTE: 'Solicitante 901', COMENTARIO: 'Ticket 901', TICKET: 'otro' };
  ok(/Solo puedes consultar/.test(truena(() => srv.registrarEnTickets('tok-luis', 901, datos))), 'quien no edita Tickets no puede registrar');
  ok(/Abre el ticket/.test(truena(() => srv.registrarEnTickets('tok-ana', 555, datos))), 'uno que no está en la copia: lo pide abrir primero');
  const r = srv.registrarEnTickets('tok-ana', 901, datos);
  const t = e.hojaComoTexto('libro', 'TICKETS').find((f) => f[0] === r.ID);
  ok(t && t[1] === '901' && t[7] === 'NIP EDENRED' && t[9] === 'Ticket 901', 'crea el ticket con el número del helpdesk (aunque manden otro) y lo capturado');
  ok(t[4] === '2026-10-02T06:00:00.000Z', 'la fecha, como medianoche local (por HojaServicio)');
  ok(fila(901)[col('ID TICKET CI')] === r.ID, 'y la copia queda ligada a ese ticket: ' + r.ID);
  ok(/ya está registrado/.test(truena(() => srv.registrarEnTickets('tok-ana', 901, datos))), 'no se registra dos veces');
  ok(JSON.stringify(srv.registrados('tok-luis', [901, 902])) === JSON.stringify({ 901: r.ID }), 'registrados() dice cuáles ya están (para la pantalla)');
}
{
  const { e, api, srv, col, fila } = entorno();
  e.avanzar(2100);
  e.libros.libro.getSheetByName('TICKETS')._datos.push(['TCK-9', '902', '', '', '', '', '', 'NIP EOX', '', '']);
  api.listarTickets('tok-ana');
  ok(/ya hay un registro con el ticket 902 \(TCK-9\)/.test(truena(() => srv.registrarEnTickets('tok-ana', 902, { 'TIPO ATENCION': 'NIP EOX' }))),
    'si alguien ya lo había capturado a mano en Tickets, no se duplica…');
  ok(fila(902)[col('ID TICKET CI')] === 'TCK-9', '…y se liga a ese');
}

// ---------------------------------------------------------------------------------- 3
console.log('\n3. Guardados');
{
  const { e, api, srv } = entorno();
  ok(Array.isArray(srv.listarGuardados('tok-ana')) && srv.listarGuardados('tok-ana').length === 0, 'sin hoja todavía: lista vacía, sin tronar');
  e.avanzar(2100);
  api.listarTickets('tok-luis');
  const g = srv.listarGuardados('tok-ana');
  ok(g.length === 2 && g[0]['ID TICKET HD'] && typeof g[0]['FECHA CREACION'] === 'string', 'quien lee Tickets ve la copia (fechas en ISO)');
  ok(/No tienes acceso/.test(truena(() => srv.listarGuardados('tok-luis'))), 'quien no lee Tickets no ve la copia (junta tickets que cada quien ve allá)');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

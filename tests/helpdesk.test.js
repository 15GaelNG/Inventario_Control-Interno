/**
 * Pruebas de HelpdeskApi (src/services/HelpdeskApi.gs) con el helpdesk simulado: que el token
 * sea de quien lo pega, que nunca se escape, que se borre si el helpdesk lo rechaza, que la
 * lista salga en nuestro formato y, sobre todo, que la app NO sature al helpdesk.
 * Los tickets son inventados, con la forma de los reales (medida el 05/10/2026).
 *
 * Correr: node tests/helpdesk.test.js
 */
const { crearEntorno, AHORA } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const truena = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (email, horas) => [b64url({ alg: 'HS256', typ: 'JWT' }),
  b64url({ idUser: 9, name: 'Persona Prueba', rol: 'Agente Sr.', email, iat: AHORA / 1000, exp: AHORA / 1000 + horas * 3600 }), 'firmaFalsa'].join('.');

const TICKET = {
  idTicket: 900001, idForm: 148, title: 'RIFTER  ABC123 | Fundaciones', notes: 'Hola equipo\n\nla unidad marca alertas', idStatus: 1, idPriority: 1,
  namePriority: 'Baja', colorPriority: '#A0D76A', nameStatus: 'Abierto', nameUser: 'PERSONA  SOLICITANTE', email: 'Solicita@Ejemplo.com',
  nameAgent: 'Agente Inventado', nameDepartment: 'COMPRAS', nameToDepartment: 'CONTROL INTERNO', nameToArea: 'SENSORES',
  nameArea: 'SUMINISTROS', dateCreation: 'viernes, 02 octubre 2026  09:28:17 ', dateCreationDB: '2026-10-02', dateClose: null,
  lastRes: 'Respuesta hace 41 minutos.', cantUnseenMessages: 1, nameAreaUser: null, nameDepartmentUser: null,
  nameForm: 'Incidencia | Solicitud - Sensores',
};
const CERRADO = Object.assign({}, TICKET, { idTicket: 900002, nameStatus: 'Cerrado', idStatus: 4, dateClose: '2026-10-01T14:19:58.000Z',
  cantUnseenMessages: null, colorPriority: 'javascript:alert(1)' });

function entorno(responder) {
  const e = crearEntorno({ libros: {} });
  const llamadas = [];
  const sesiones = { 'tok-ana': { correo: 'Ana@Ejemplo.com', nombre: 'ANA' }, 'tok-luis': { correo: 'luis@ejemplo.com', nombre: 'LUIS' } };
  Object.assign(e.contexto, {
    // Todos los que tienen sesión pueden usar Help Desk: no se pide permiso de un módulo
    Auth: { validarSesion: (t) => { if (!sesiones[t]) throw new Error('Sesión expirada'); return sesiones[t]; } },
    UrlFetchApp: {
      fetch: (url, op) => {
        llamadas.push({ url, op });
        const r = responder(url, op, llamadas.length);
        return { getResponseCode: () => r.codigo || 200, getContentText: () => (typeof r.cuerpo === 'string' ? r.cuerpo : JSON.stringify(r.cuerpo)), getHeaders: () => r.encabezados || {} };
      },
    },
  });
  e.cargar('src/services/HelpdeskApi.gs');
  return { e, H: e.global('HelpdeskApi'), llamadas };
}

// Forma medida del HAR del 05/10/2026, con datos inventados
const FILTROS = {
  status: [
    { idStatus: 1, name: 'Abierto', color: '#4caf50', status: 1 }, { idStatus: 2, name: 'Pendiente', color: '#2196f3', status: 1 },
    { idStatus: 4, name: 'Cerrado', color: '#f44336', status: 1 }, { idStatus: 9, name: 'Viejo', color: '#000', status: 0 },
  ],
  priority: [{ idPriority: 1, name: 'Baja', color: '#A0D76A', status: 1 }, { idPriority: 4, name: 'Urgente', color: 'red;}', status: 1 }],
  forms: [{ idForm: 148, notes: 'Incidencia | Solicitud - Sensores', status: 1, isDelete: 0 }, { idForm: 119, notes: 'Prueba', status: 1, isDelete: 1 }],
  branches: [{ idBranch: 226, name: 'Sensores', status: 1 }],
};
const CONVERSACION = [
  { idConversation: 1, nameAnswer: 'Persona  Uno', email: ' Uno@Ejemplo.com', dateCreation: '2026-09-04T12:13:03.480Z', isPrivate: 0, attachNames: null,
    notes: '<p data-x="1"><strong>Hola</strong>, equipo &amp; amigos&nbsp;✨</p><p>Ver <a href="https://ejemplo.com/x">la guía</a><br>gracias</p>' +
      '<img src="x" onerror="alert(1)"><script>alert(2)</script><h4>Fin</h4>' },
  { idConversation: 2, nameAnswer: 'Agente', dateCreation: '2026-09-05T10:00:00.000Z', isPrivate: 1, attachNames: 'foto.png, nota.pdf', notes: 'texto &lt;b&gt; plano' },
  // Imágenes pegadas como las manda su editor (medido el 07/10/2026); una de OTRO ticket no se acepta
  { idConversation: 3, idTicket: 900002, nameAnswer: 'Agente', dateCreation: '2026-09-06T10:00:00.000Z', isPrivate: 0,
    notes: '<p>Va la foto</p><p><img src="tickets/900002/conversation3/file1.png" alt="Image" style="width: 300;"></p>' +
      '<img src="tickets/900002/conversation3/file1.png"><img src="tickets/111/conversation9/file1.png"><img src="https://otro.com/x.png">' },
];
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
// La lista del inicio (getTicketsListHome): menos campos y otros nombres
const DE_INICIO = {
  idTicket: 900100, title: 'SUMAR ADHERENTE', notes: 'SUMAR ADHERENTE', idStatus: 1, idPriority: 1, idForm: 148, idBranch: 226,
  areaName: 'GESTORÍA VEHICULAR', dateCreate: 'miércoles, 07 octubre 2026  08:43:30 ', date: '07-10-2026 08:43 AM',
  nameAgent: 'Agente Inventado', nameStatus: 'Abierto', colorStatus: '#4caf50', nameUserDepartment: 'MARIO  PRUEBA ', cantUnseenMessages: 2,
};
const RESUELTO_INICIO = Object.assign({}, DE_INICIO, { idTicket: 900099, idStatus: 3, nameStatus: 'Resuelto' });
const pagina = (desde, n) => Array.from({ length: n }, (_, i) => Object.assign({}, TICKET, { idTicket: desde - i }));
const DETALLE = Object.assign({}, CERRADO, { idTicket: 900002, intervalTime: '7', dateStart: '28 agosto 2026', dateEnd: '04 septiembre 2026' });

const normal = (url, op) => {
  if (/autoLogin$/.test(url)) return { cuerpo: { status: 1, message: 'Sesión activa', data: { email: JSON.parse(Buffer.from(op.headers.authorization.split('.')[1], 'base64')).email, name: 'Persona Prueba', rol: 'Agente Sr.' } } };
  if (/tickets\/list$/.test(url)) return { cuerpo: { cantTotalTickets: 288, tickets: [TICKET, CERRADO] } };
  if (/getFilters$/.test(url)) return { cuerpo: FILTROS };
  if (/getTicket$/.test(url)) return { cuerpo: { tickets: ({ 900002: [DETALLE], 900003: [Object.assign({}, DETALLE, { idTicket: 900003 })] })[JSON.parse(op.payload).idTicket] || [] } };
  if (/getConversationTickets$/.test(url)) return { cuerpo: { conversation: CONVERSACION, task: [] } };
  if (/chat\/getAllUsers$/.test(url)) {
    return { cuerpo: { users: [{ idUser: 1, name: 'Todos  Los Demás', email: 'x@ejemplo.com', status: 1 }],
      usersInvolved: [{ idUser: 7, name: 'Agente  Inventado', email: ' Agente@Ejemplo.com', status: 1 }, { idUser: 8, name: null }] } };
  }
  if (/getTicketsListHome$/.test(url)) return { cuerpo: { totalTickets: 9458, tickets: [DE_INICIO, RESUELTO_INICIO] } };
  if (/chat\/getCloudFile$/.test(url)) return { cuerpo: PNG };
  return { codigo: 404, cuerpo: '' };
};

// ---------------------------------------------------------------------------------- 1
console.log('1. Conectar: el token tiene que ser de quien lo pega');
{
  const { e, H, llamadas } = entorno(normal);
  ok(/Eso no parece un token/.test(truena(() => H.conectar('tok-ana', 'hola'))), 'algo que no es token se rechaza sin llamar al helpdesk');
  ok(/es de otra cuenta/.test(truena(() => H.conectar('tok-ana', jwt('luis@ejemplo.com', 24)))), 'el token de otra persona se rechaza');
  ok(/ya venció/.test(truena(() => H.conectar('tok-ana', jwt('ana@ejemplo.com', -1)))), 'un token vencido se rechaza');
  ok(llamadas.length === 0, 'y en ninguno de esos casos se llamó al helpdesk');
  const r = H.conectar('tok-ana', '  ' + jwt('ana@ejemplo.com', 24) + '  ');
  ok(r.conectado && r.nombre === 'Persona Prueba' && !JSON.stringify(r).includes('firmaFalsa'), 'conecta y regresa nombre y vencimiento, nunca el token');
  ok(llamadas.length === 1 && /\/login\/autoLogin$/.test(llamadas[0].url) && llamadas[0].op.followRedirects === false && llamadas[0].op.muteHttpExceptions,
    'una sola llamada a autoLogin, sin seguir redirecciones');
  ok(e.propiedades.get('HELPDESK_TOKEN:ana@ejemplo.com') === jwt('ana@ejemplo.com', 24), 'el token se guarda a nombre del correo (en minúsculas), sin espacios');
  const est = H.estado('tok-ana');
  ok(est.conectado && est.vence === new Date(AHORA + 24 * 3600 * 1000).toISOString() && llamadas.length === 1, 'estado() lee el vencimiento del token, sin llamar al helpdesk');
  ok(H.estado('tok-luis').conectado === false, 'otra persona no ve la conexión de Ana');
  H.desconectar('tok-ana');
  ok(!e.propiedades.has('HELPDESK_TOKEN:ana@ejemplo.com') && H.estado('tok-ana').conectado === false, 'desconectar borra el token');
}

// ---------------------------------------------------------------------------------- 2
console.log('\n2. La lista, en nuestro formato');
{
  const { e, H, llamadas } = entorno(normal);
  ok(/Conecta tu cuenta/.test(truena(() => H.listarTickets('tok-ana'))), 'sin conectar, lo pide');
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  e.avanzar(3000);
  const r = H.listarTickets('tok-ana');
  const pedido = JSON.parse(llamadas[1].op.payload);
  ok(pedido.pagination.rowsPerPage === 25 && Array.isArray(pedido.filters.idStatus) && pedido.filters.idStatus.length === 0,
    'pide UNA página de 25, sin filtros, con la forma que usa su página');
  ok(r.total === 288 && r.tickets.length === 2, 'regresa el total y los tickets');
  const t = r.tickets[0];
  ok(t.ID === 900001 && t.TITULO === 'RIFTER ABC123 | Fundaciones' && t.SOLICITANTE === 'PERSONA SOLICITANTE', 'espacios de más fuera');
  ok(t.DESCRIPCION === 'Hola equipo\n\nla unidad marca alertas', 'la descripción conserva sus párrafos');
  ok(t.CORREO_SOLICITANTE === 'solicita@ejemplo.com' && t.AREA_SOLICITANTE === 'SUMINISTROS' && t.DEPARTAMENTO_SOLICITANTE === 'COMPRAS',
    'área y departamento del solicitante, aunque vengan en el otro campo');
  ok(t.FECHA_CREACION === '2026-10-02' && t.ABIERTO === true && t.FECHA_CIERRE === '' && t.SIN_LEER === 1, 'fechas y estado de un abierto');
  const c = r.tickets[1];
  ok(c.ABIERTO === false && c.FECHA_CIERRE === '2026-10-01T14:19:58.000Z' && c.SIN_LEER === 0, 'un cerrado trae su fecha de cierre');
  ok(c.COLOR_PRIORIDAD === '' && t.COLOR_PRIORIDAD === '#A0D76A', 'un color que no es #hex no pasa (va a ir a un style)');
  H.listarTickets('tok-ana');
  ok(llamadas.length === 2, 'la segunda vez sale de la caché: el helpdesk no se entera');
}

// ---------------------------------------------------------------------------------- 2b
console.log('\n2b. Filtros y detalle');
{
  const { e, H, llamadas } = entorno(normal);
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  e.avanzar(2100);
  H.listarTickets('tok-ana', { estatus: [1, '2', 'x', -3], grupos: [226], formularios: [148], prioridades: [], otro: [1] });
  const f = JSON.parse(llamadas[1].op.payload).filters;
  ok(JSON.stringify(f.idStatus) === '[1,2]' && JSON.stringify(f.idBranch) === '[226]' && JSON.stringify(f.idForm) === '[148]',
    'los filtros van con la forma de su página, y solo ids numéricos válidos');
  e.avanzar(2100);
  H.listarTickets('tok-ana', { estatus: [4] });
  ok(llamadas.length === 3, 'otro filtro es otra consulta (no sale de la caché del primero)');

  e.avanzar(2100);
  const fi = H.filtros('tok-ana');
  ok(fi.estatus.map((s) => s.nombre).join() === 'Abierto,Pendiente,Cerrado', 'estatus activos (el inactivo no)');
  ok(fi.prioridades[1].color === '' && fi.prioridades[0].color === '#A0D76A', 'un color raro no pasa');
  ok(fi.formularios.length === 1 && fi.grupos[0].nombre === 'Sensores', 'formularios sin los borrados, y grupos');
  const antes = llamadas.length;
  H.filtros('tok-ana');
  ok(llamadas.length === antes, 'los filtros salen de la caché (una llamada por hora)');

  e.avanzar(2100);
  const d = H.detalle('tok-ana', '900002');
  const rutas = llamadas.slice(antes).map((l) => l.url.replace(/^.*\.com/, ''));
  ok(rutas.join() === '/tickets/getConversationTickets', 'un ticket que llegó en la lista es UNA llamada (su ficha ya está): ' + rutas.join(', '));
  ok(!llamadas.some((l) => /markMessageAsSeen/.test(l.url)), 'NUNCA marca como leído (verlo aquí no cambia nada allá)');
  ok(d.ID === 900002 && d.ESTATUS === 'Cerrado' && d.MENSAJES.length === 3, 'trae la ficha (de la lista) y sus mensajes');
  ok(JSON.stringify(d.INVOLUCRADOS) === '[{"NOMBRE":"PERSONA SOLICITANTE","CORREO":"solicita@ejemplo.com"},{"NOMBRE":"Persona Uno","CORREO":"uno@ejemplo.com"},{"NOMBRE":"Agente","CORREO":""}]',
    'involucrados: quien lo pidió y quien escribió, sin repetir y sin llamar a getAllUsers: ' + JSON.stringify(d.INVOLUCRADOS));
  ok(!llamadas.some((l) => /getAllUsers/.test(l.url)), 'nunca pide la lista de TODOS los usuarios');
  const img = d.MENSAJES[2].ARCHIVOS;
  ok(img.length === 1 && img[0].RUTA === 'tickets/900002/conversation3/file1' && img[0].IMAGEN && img[0].NOMBRE === 'Imagen 1',
    'la imagen pegada sale como archivo, sin extensión (como la pide su página), una vez, y no las de otro ticket ni de otra página');
  ok(d.MENSAJES[0].ARCHIVOS.length === 0 && d.MENSAJES[2].TEXTO === 'Va la foto', 'un <img> que no es del helpdesk no es archivo, y el texto queda sin imágenes');
  const m = d.MENSAJES[0];
  ok(!/[<>]/.test(m.TEXTO.replace('<b>', '')) && !/alert|onerror|script/.test(m.TEXTO), 'el HTML del mensaje se vuelve texto: sin etiquetas, sin scripts, sin imágenes');
  ok(m.TEXTO === 'Hola, equipo & amigos ✨\nVer la guía (https://ejemplo.com/x)\ngracias\nFin', 'conserva párrafos, ligas y acentos: ' + JSON.stringify(m.TEXTO));
  ok(d.MENSAJES[1].TEXTO === 'texto <b> plano' && d.MENSAJES[1].PRIVADO && d.MENSAJES[1].ADJUNTOS.join('|') === 'foto.png|nota.pdf',
    'lo escapado se lee como texto; privado y adjuntos (nombres)');
  ok(m.AUTOR === 'Persona Uno' && m.FECHA === '2026-09-04T12:13:03.480Z', 'autor y fecha');
  const n = llamadas.length;
  H.detalle('tok-ana', 900002);
  ok(llamadas.length === n, 'abrirlo otra vez sale de la caché');
  e.avanzar(2100);
  ok(/no regresó ese ticket/.test(truena(() => H.detalle('tok-ana', 123))), 'un ticket que el helpdesk no le da: se dice');
  e.avanzar(2100);
  const antesFolio = llamadas.length;
  const porFolio = H.detalle('tok-ana', 900003);
  ok(llamadas.slice(antesFolio).map((l) => l.url.replace(/^.*.com/, '')).join() === '/tickets/getTicket,/tickets/getConversationTickets' && porFolio.DURACION_DIAS === 7,
    'uno que NO llegó en una lista (por folio): dos llamadas, y trae su duración');
  ok(/Ticket inválido/.test(truena(() => H.detalle('tok-ana', 'abc'))), 'un id que no es número ni llega al helpdesk');
}

// ---------------------------------------------------------------------------------- 2c
console.log('\n2c. Páginas, fechas, agente, departamento y las vistas del inicio');
{
  let paginas = { primera: pagina(900025, 25), segunda: pagina(900000, 25) };
  const { e, H, llamadas } = entorno((url, op) => {
    if (/tickets\/list$/.test(url)) {
      const p = JSON.parse(op.payload).pagination;
      return { cuerpo: { cantTotalTickets: 60, tickets: p.nextPageLastIdTicket ? paginas.segunda : paginas.primera } };
    }
    return normal(url, op);
  });
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  e.avanzar(2100);
  H.filtros('tok-ana');   // el catálogo queda en la caché: con él se completan nombres de la lista del inicio
  e.avanzar(2100);
  const r1 = H.listarTickets('tok-ana', { agentes: [7], departamentos: ['18'], desde: '2026-10-16', hasta: '2026-10-01' });
  const f = JSON.parse(llamadas[llamadas.length - 1].op.payload);
  ok(JSON.stringify(f.filters.idAgent) === '[7]' && JSON.stringify(f.filters.idDepartmentCustomer) === '[18]',
    'agente y departamento del solicitante van como idAgent / idDepartmentCustomer');
  ok(f.filters.dateCreation === '2026-10-01' && f.filters.dateCreationEnd === '2026-10-16', 'las fechas van en orden aunque lleguen al revés');
  ok(!('nextPageLastIdTicket' in f.pagination), 'la primera página no lleva cursor');
  ok(r1.tickets.length === 25 && r1.siguiente === 900001, 'página llena: regresa el cursor (el último ID) para "Cargar más"');
  e.avanzar(2100);
  const r2 = H.listarTickets('tok-ana', { agentes: [7], departamentos: [18], desde: '2026-10-01', hasta: '2026-10-16', despuesDe: r1.siguiente });
  ok(JSON.parse(llamadas[llamadas.length - 1].op.payload).pagination.nextPageLastIdTicket === 900001, 'la siguiente página manda nextPageLastIdTicket');
  ok(r2.siguiente === 899976, 'y trae su propio cursor');
  paginas = { primera: paginas.primera, segunda: pagina(900030, 25) };   // un helpdesk que no avanza
  e.avanzar(2100);
  const r3 = H.listarTickets('tok-ana', { despuesDe: 900001 });
  ok(r3.siguiente === null, 'si el cursor no baja, no se ofrece otra página (nunca un ciclo)');
  e.avanzar(2100);
  paginas = { primera: pagina(900025, 3), segunda: [] };
  ok(H.listarTickets('tok-ana', { estatus: [2] }).siguiente === null, 'una página incompleta no tiene siguiente');
  e.avanzar(2100);
  ok(H.listarTickets('tok-ana', { desde: 'ayer' }) && JSON.parse(llamadas[llamadas.length - 1].op.payload).filters.dateCreation === null,
    'una fecha que no es yyyy-MM-dd no se manda');

  e.avanzar(2100);
  const antes = llamadas.length;
  const d = H.listarTickets('tok-ana', { vista: 'departamento', estatus: [1], despuesDe: 5 });
  const pedido = JSON.parse(llamadas[antes].op.payload);
  ok(/getTicketsListHome$/.test(llamadas[antes].url) && pedido.get === 'departmentTickets' && pedido.pagination.rowsPerPage === 25,
    '"Mi departamento" es la pestaña departmentTickets de su inicio');
  ok(d.total === 9458 && d.siguiente === null, 'el total de su departamento, sin "Cargar más" (no se sabe cómo pagina esa lista)');
  const t = d.tickets[0];
  ok(t.SOLICITANTE === 'MARIO PRUEBA' && t.AREA_DESTINO === 'GESTORÍA VEHICULAR' && t.FECHA_CREACION === '2026-10-07' && t.COLOR_ESTATUS === '#4caf50',
    'su forma corta se normaliza igual (solicitante, área, fecha dd-MM-yyyy)');
  ok(t.PRIORIDAD === 'Baja' && t.FORMULARIO === 'Incidencia | Solicitud - Sensores' && t.GRUPO === 'Sensores',
    'prioridad, formulario y grupo salen del catálogo que ya estaba en la caché');
  ok(t.ABIERTO === true && d.tickets[1].ABIERTO === false, 'sin dateClose, abierto/cerrado sale del estatus');
  e.avanzar(2100);
  H.listarTickets('tok-ana', { vista: 'mios' });
  ok(JSON.parse(llamadas[llamadas.length - 1].op.payload).get === 'myTickets', '"Los que yo levanté" es myTickets');
  const n = llamadas.length;
  H.listarTickets('tok-ana', { vista: 'departamento', grupos: [3] });
  ok(llamadas.length === n, 'en las vistas del inicio los filtros no cuentan: sale de la caché');
  const fi = H.filtros('tok-ana');
  ok(Array.isArray(fi.agentes) && Array.isArray(fi.departamentos), 'filtros trae agentes y departamentos');
}
{
  const { e, H } = entorno((url, op) => (/getFilters$/.test(url)
    ? { cuerpo: Object.assign({}, FILTROS, {
      agents: [{ idUser: 7, name: 'Zoe  Agente', idBranch: 9 }, { idUser: 7, name: 'Zoe Agente', idBranch: 36 }, { idUser: 2, name: 'Ana Agente', idBranch: 9 }],
      departmentCustomers: [{ idDepartment: 3, name: 'CONTROL INTERNO' }, { idDepartment: 2, name: 'COMPRAS' }] }) }
    : normal(url, op)));
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  e.avanzar(2100);
  const fi = H.filtros('tok-ana');
  ok(fi.agentes.map((a) => a.id + ':' + a.nombre).join() === '2:Ana Agente,7:Zoe Agente', 'un agente de varios grupos sale una vez, en orden');
  ok(fi.departamentos.map((a) => a.nombre).join() === 'COMPRAS,CONTROL INTERNO', 'departamentos de los solicitantes, en orden');
}

// ---------------------------------------------------------------------------------- 2d
console.log('\n2d. Archivos de la conversación');
{
  let respuesta = PNG;
  const { e, H, llamadas } = entorno((url, op) => (/getCloudFile$/.test(url) ? { cuerpo: respuesta } : normal(url, op)));
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  const RUTA = 'tickets/900002/conversation3/file1';
  e.avanzar(2100);
  ok(/Abre el ticket otra vez/.test(truena(() => H.archivo('tok-ana', 900002, RUTA))), 'sin abrir el ticket, no se pide ningún archivo');
  ok(/Archivo inválido/.test(truena(() => H.archivo('tok-ana', 900002, 'tickets/900002/../../etc'))), 'una ruta rara ni se intenta');
  ok(/Archivo inválido/.test(truena(() => H.archivo('tok-ana', 900002, 'tickets/111/conversation9/file1'))), 'ni la de otro ticket');
  H.detalle('tok-ana', 900002);
  e.avanzar(2100);
  const antes = llamadas.length;
  const a = H.archivo('tok-ana', '900002', RUTA);
  ok(a.tipo === 'image/png' && a.base64 === PNG, 'después de abrirlo, la imagen llega en base64 con su tipo');
  ok(llamadas.length === antes + 1 && JSON.parse(llamadas[antes].op.payload).path === RUTA, 'una llamada a getCloudFile con la ruta sin extensión');
  e.avanzar(10);
  H.conectar('tok-luis', jwt('luis@ejemplo.com', 24));
  ok(/Abre el ticket otra vez/.test(truena(() => H.archivo('tok-luis', 900002, RUTA))), 'otra persona no puede pedir los archivos que Ana abrió');
  e.avanzar(2100);
  respuesta = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
  ok(/no se puede ver aquí/.test(truena(() => H.archivo('tok-ana', 900002, RUTA))), 'un SVG (o lo que no sea imagen o PDF) no se manda a la pantalla');
  e.avanzar(2100);
  respuesta = '<html>error</html>';
  ok(/no regresó el archivo/.test(truena(() => H.archivo('tok-ana', 900002, RUTA))), 'si no es base64, se dice');
  e.avanzar(2100);
  respuesta = 'JVBERi0' + 'A'.repeat(H.LIMITES.MAX_ARCHIVO_B64);
  ok(/muy grande/.test(truena(() => H.archivo('tok-ana', 900002, RUTA))), 'uno muy grande no viaja a la pantalla');
  ok(H.tipoDe_('JVBERi0xLjQ=') === 'application/pdf' && H.tipoDe_('/9j/4AAQ') === 'image/jpeg', 'reconoce PDF y JPG por sus primeros bytes');
}

// ---------------------------------------------------------------------------------- 2e
console.log('\n2e. Las respuestas del formulario ("Ver formulario")');
{
  // Forma medida el 05/10/2026 (getNewTicketCatalogs), con datos inventados
  const CATALOGOS = { fields: {
    arrayForm: { arrayForm: { note: 'Incidencia | Solicitud - Sensores', fields: [
      { idField: 1083, tagAgent: 'Departamento  Solicitante', type: 'select', canSee: 1 },
      { idField: 420, tagAgent: 'No. de Serie Vehículo', type: 'text', canSee: 1 },
      { idField: 424, tagAgent: 'Fecha de Incidencia', type: 'date', canSee: 1 },
      { idField: 999, tagAgent: 'Oculto', type: 'text', canSee: 0 },
    ] } },
    datas: { dataAnswer: [{ idField: 1083, value: 'POST VENTA' }, { idField: 420, value: ' 93Y1R5F52RJ649008 ' }, { idField: 999, value: 'no' }] },
  } };
  const { e, H, llamadas } = entorno((url, op) => (/getNewTicketCatalogs$/.test(url) ? { cuerpo: CATALOGOS } : normal(url, op)));
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  e.avanzar(2100);
  ok(/No se sabe de qué formulario/.test(truena(() => H.formulario('tok-ana', 900001))), 'sin la ficha ni el formulario, no se adivina');
  H.listarTickets('tok-ana');
  e.avanzar(2100);
  const antes = llamadas.length;
  const f = H.formulario('tok-ana', 900001);
  const pedido = JSON.parse(llamadas[antes].op.payload);
  ok(llamadas.length === antes + 1 && pedido.idForm === 148 && pedido.idTicket === 900001,
    'UNA llamada, con el idTicket y el formulario de su ficha');
  ok(f.FORMULARIO === 'Incidencia | Solicitud - Sensores' && f.CAMPOS.length === 3, 'el nombre del formulario y sus campos visibles (el oculto no)');
  ok(f.CAMPOS[0].ETIQUETA === 'Departamento Solicitante' && f.CAMPOS[0].VALOR === 'POST VENTA' && f.CAMPOS[1].VALOR === '93Y1R5F52RJ649008' && f.CAMPOS[2].VALOR === '',
    'cada campo con su respuesta (vacía si no la contestó)');
  H.formulario('tok-ana', 900001);
  ok(llamadas.length === antes + 1, 'la segunda vez sale de la caché');
}

// ---------------------------------------------------------------------------------- 3
console.log('\n3. No saturar al helpdesk');
{
  const { e, H, llamadas } = entorno(normal);
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  ok(/Espera un par de segundos/.test(truena(() => H.listarTickets('tok-ana', null, true))), 'dos llamadas de la misma persona en menos de 1 s: la segunda no sale');
  let salieron = 1;
  for (let i = 0; i < 15; i++) {
    e.avanzar(2100);
    if (!truena(() => H.listarTickets('tok-ana', null, true))) salieron++;
  }
  ok(salieron <= 15 && llamadas.length === salieron, 'a lo más 15 por minuto por persona (salieron ' + salieron + ' de 16 intentos)');
  ok(/veces en este minuto/.test(truena(() => { e.avanzar(2100); H.listarTickets('tok-ana', null, true); })), 'y lo dice claro');
}
{
  // 3 personas jalando a la vez: el tope de toda la app
  const { e, H, llamadas } = entorno(normal);
  const tokens = [];
  for (let i = 0; i < 4; i++) tokens.push('tok-' + i);
  Object.assign(e.contexto.Auth, { validarSesion: (t) => ({ correo: t.replace('tok-', 'p') + '@ejemplo.com' }) });
  tokens.forEach((t) => { e.avanzar(10); H.conectar(t, jwt(t.replace('tok-', 'p') + '@ejemplo.com', 24)); });
  let intentos = 0;
  for (let i = 0; i < 12; i++) {
    e.avanzar(2100);
    tokens.forEach((t) => { intentos++; truena(() => H.listarTickets(t, null, true)); });
    if (e.registro.locks > 200) break;
  }
  ok(llamadas.length === 40, 'entre toda la app, a lo más 40 por minuto, contando las de conectar (' + llamadas.length + ' llamadas de ' + (intentos + 4) + ' intentos en ~25 s)');
}
{
  // El helpdesk dice "ya basta": toda la app se detiene, sin reintentos
  let pedirPausa = true;
  const { e, H, llamadas } = entorno((url, op) => (/tickets/.test(url) && pedirPausa
    ? { codigo: 429, cuerpo: '', encabezados: { 'Retry-After': '300' } } : normal(url, op)));
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  e.avanzar(2100);
  ok(/no está respondiendo \(HTTP 429\)/.test(truena(() => H.listarTickets('tok-ana', null, true))), '429: avisa');
  const antes = llamadas.length;
  e.avanzar(2100);
  ok(/pidió esperar/.test(truena(() => H.listarTickets('tok-ana', null, true))) && llamadas.length === antes, 'y durante la pausa NADIE llama (ni reintenta)');
  pedirPausa = false;
  e.avanzar(301 * 1000);
  ok(!truena(() => H.listarTickets('tok-ana', null, true)), 'pasado el Retry-After, vuelve a consultar');
}
{
  // 401: el token ya no sirve
  const { e, H } = entorno((url, op) => (/tickets/.test(url) ? { codigo: 401, cuerpo: '' } : normal(url, op)));
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  e.avanzar(2100);
  const msg = truena(() => H.listarTickets('tok-ana', null, true));
  ok(/venció/.test(msg) && !e.propiedades.has('HELPDESK_TOKEN:ana@ejemplo.com'), '401: borra el token y pide uno nuevo');
  ok(!/firmaFalsa|eyJ/.test(msg), 'el mensaje no trae el token');
}
{
  // Respuestas raras
  const { e, H } = entorno((url, op) => (/tickets/.test(url) ? { cuerpo: { otraCosa: [] } } : normal(url, op)));
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  e.avanzar(2100);
  ok(/cambió la forma/.test(truena(() => H.listarTickets('tok-ana', null, true))), 'si cambian la forma de la lista, se dice, no se adivina');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

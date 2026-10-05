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
  idTicket: 900001, title: 'RIFTER  ABC123 | Fundaciones', notes: 'Hola equipo\n\nla unidad marca alertas', idStatus: 1, idPriority: 1,
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
    Permisos: { puedeLeer: (t, m) => { if (m !== 'helpdesk') throw new Error('módulo equivocado ' + m); if (!sesiones[t]) throw new Error('Sin permiso'); return sesiones[t]; } },
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
  { idConversation: 1, nameAnswer: 'Persona  Uno', dateCreation: '2026-09-04T12:13:03.480Z', isPrivate: 0, attachNames: null,
    notes: '<p data-x="1"><strong>Hola</strong>, equipo &amp; amigos&nbsp;✨</p><p>Ver <a href="https://ejemplo.com/x">la guía</a><br>gracias</p>' +
      '<img src="x" onerror="alert(1)"><script>alert(2)</script><h4>Fin</h4>' },
  { idConversation: 2, nameAnswer: 'Agente', dateCreation: '2026-09-05T10:00:00.000Z', isPrivate: 1, attachNames: 'foto.png, nota.pdf', notes: 'texto &lt;b&gt; plano' },
];
const DETALLE = Object.assign({}, CERRADO, { idTicket: 900002, intervalTime: '7', dateStart: '28 agosto 2026', dateEnd: '04 septiembre 2026' });

const normal = (url, op) => {
  if (/autoLogin$/.test(url)) return { cuerpo: { status: 1, message: 'Sesión activa', data: { email: JSON.parse(Buffer.from(op.headers.authorization.split('.')[1], 'base64')).email, name: 'Persona Prueba', rol: 'Agente Sr.' } } };
  if (/tickets\/list$/.test(url)) return { cuerpo: { cantTotalTickets: 288, tickets: [TICKET, CERRADO] } };
  if (/getFilters$/.test(url)) return { cuerpo: FILTROS };
  if (/getTicket$/.test(url)) return { cuerpo: { tickets: JSON.parse(op.payload).idTicket === 900002 ? [DETALLE] : [] } };
  if (/getConversationTickets$/.test(url)) return { cuerpo: { conversation: CONVERSACION, task: [] } };
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
  ok(rutas.join() === '/tickets/getTicket,/tickets/getConversationTickets', 'el detalle son 2 llamadas: ' + rutas.join(', '));
  ok(!llamadas.some((l) => /markMessageAsSeen/.test(l.url)), 'NUNCA marca como leído (verlo aquí no cambia nada allá)');
  ok(d.ID === 900002 && d.DURACION_DIAS === 7 && d.MENSAJES.length === 2, 'trae el ticket, su duración y sus mensajes');
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
  ok(/Ticket inválido/.test(truena(() => H.detalle('tok-ana', 'abc'))), 'un id que no es número ni llega al helpdesk');
}

// ---------------------------------------------------------------------------------- 3
console.log('\n3. No saturar al helpdesk');
{
  const { e, H, llamadas } = entorno(normal);
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  ok(/Espera un par de segundos/.test(truena(() => H.listarTickets('tok-ana', null, true))), 'dos llamadas de la misma persona en menos de 2 s: la segunda no sale');
  let salieron = 1;
  for (let i = 0; i < 15; i++) {
    e.avanzar(2100);
    if (!truena(() => H.listarTickets('tok-ana', null, true))) salieron++;
  }
  ok(salieron <= 10 && llamadas.length === salieron, 'a lo más 10 por minuto por persona (salieron ' + salieron + ' de 16 intentos)');
  ok(/veces en este minuto/.test(truena(() => { e.avanzar(2100); H.listarTickets('tok-ana', null, true); })), 'y lo dice claro');
}
{
  // 3 personas jalando a la vez: el tope de toda la app
  const { e, H, llamadas } = entorno(normal);
  const tokens = [];
  for (let i = 0; i < 4; i++) tokens.push('tok-' + i);
  Object.assign(e.contexto.Permisos, { puedeLeer: (t) => ({ correo: t.replace('tok-', 'p') + '@ejemplo.com' }) });
  tokens.forEach((t) => { e.avanzar(10); H.conectar(t, jwt(t.replace('tok-', 'p') + '@ejemplo.com', 24)); });
  let intentos = 0;
  for (let i = 0; i < 12; i++) {
    e.avanzar(2100);
    tokens.forEach((t) => { intentos++; truena(() => H.listarTickets(t, null, true)); });
    if (e.registro.locks > 200) break;
  }
  ok(llamadas.length === 30, 'entre toda la app, a lo más 30 por minuto, contando las de conectar (' + llamadas.length + ' llamadas de ' + (intentos + 4) + ' intentos en ~25 s)');
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

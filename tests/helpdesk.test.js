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

const normal = (url, op) => {
  if (/autoLogin$/.test(url)) return { cuerpo: { status: 1, message: 'Sesión activa', data: { email: JSON.parse(Buffer.from(op.headers.authorization.split('.')[1], 'base64')).email, name: 'Persona Prueba', rol: 'Agente Sr.' } } };
  if (/tickets\/list$/.test(url)) return { cuerpo: { cantTotalTickets: 288, tickets: [TICKET, CERRADO] } };
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
  ok(pedido.pagination.rowsPerPage === 25 && pedido.filters.finishLoad === false, 'pide UNA página de 25, como la página del helpdesk');
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

// ---------------------------------------------------------------------------------- 3
console.log('\n3. No saturar al helpdesk');
{
  const { e, H, llamadas } = entorno(normal);
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  ok(/Espera un par de segundos/.test(truena(() => H.listarTickets('tok-ana', true))), 'dos llamadas de la misma persona en menos de 2 s: la segunda no sale');
  let salieron = 1;
  for (let i = 0; i < 15; i++) {
    e.avanzar(2100);
    if (!truena(() => H.listarTickets('tok-ana', true))) salieron++;
  }
  ok(salieron <= 10 && llamadas.length === salieron, 'a lo más 10 por minuto por persona (salieron ' + salieron + ' de 16 intentos)');
  ok(/veces en este minuto/.test(truena(() => { e.avanzar(2100); H.listarTickets('tok-ana', true); })), 'y lo dice claro');
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
    tokens.forEach((t) => { intentos++; truena(() => H.listarTickets(t, true)); });
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
  ok(/no está respondiendo \(HTTP 429\)/.test(truena(() => H.listarTickets('tok-ana', true))), '429: avisa');
  const antes = llamadas.length;
  e.avanzar(2100);
  ok(/pidió esperar/.test(truena(() => H.listarTickets('tok-ana', true))) && llamadas.length === antes, 'y durante la pausa NADIE llama (ni reintenta)');
  pedirPausa = false;
  e.avanzar(301 * 1000);
  ok(!truena(() => H.listarTickets('tok-ana', true)), 'pasado el Retry-After, vuelve a consultar');
}
{
  // 401: el token ya no sirve
  const { e, H } = entorno((url, op) => (/tickets/.test(url) ? { codigo: 401, cuerpo: '' } : normal(url, op)));
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  e.avanzar(2100);
  const msg = truena(() => H.listarTickets('tok-ana', true));
  ok(/venció/.test(msg) && !e.propiedades.has('HELPDESK_TOKEN:ana@ejemplo.com'), '401: borra el token y pide uno nuevo');
  ok(!/firmaFalsa|eyJ/.test(msg), 'el mensaje no trae el token');
}
{
  // Respuestas raras
  const { e, H } = entorno((url, op) => (/tickets/.test(url) ? { cuerpo: { otraCosa: [] } } : normal(url, op)));
  H.conectar('tok-ana', jwt('ana@ejemplo.com', 24));
  e.avanzar(2100);
  ok(/cambió la forma/.test(truena(() => H.listarTickets('tok-ana', true))), 'si cambian la forma de la lista, se dice, no se adivina');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

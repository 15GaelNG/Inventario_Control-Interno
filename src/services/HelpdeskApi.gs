/**
 * HelpdeskApi.gs
 * Lo ÚNICO que habla con el helpdesk de TI (helpdesk-maderas.gphsis.com). Su API no es pública:
 * cuando TI la cambie sin avisar, se arregla aquí y las pantallas no se enteran. Plan completo
 * y por qué así: docs/helpdesk-integracion.md.
 *
 * Cómo entra: cada persona pega el token de SU sesión del helpdesk (dura 24 h). Se guarda en el
 * servidor, a nombre de su correo, y el servidor consulta el helpdesk por ella. Medido el
 * 05/10/2026 desde el navegador:
 *   - backend https://helpdesk-backend.gphsis.com, encabezado `authorization: <token>` (sin Bearer)
 *   - POST /login/autoLogin  → { status: 1, message: 'Sesión activa', data: { email, name, rol… } }
 *   - POST /tickets/list     → { cantTotalTickets, tickets: [...] }, con { filters, pagination }.
 *     Pagina por cursor (medido el 07/10/2026): pagination.nextPageLastIdTicket = el idTicket del
 *     último de la página anterior. Filtra también por fechas (dateCreation / dateCreationEnd,
 *     yyyy-MM-dd), agente (idAgent) y departamento del solicitante (idDepartmentCustomer).
 *   - POST /tickets/getTicketsListHome { get: 'departmentTickets' | 'myTickets', applyFilters,
 *     pagination } → { totalTickets, tickets } (las pestañas de su inicio; forma más corta)
 *   - POST /tickets/getFilters { isTramite: 0 } → estatus, prioridades, formularios, grupos,
 *     agentes y departamentos de los solicitantes (departmentCustomers)
 *   - POST /tickets/getTicket { idTicket, isTramite: 0 } → { tickets: [uno] }
 *   - POST /tickets/getConversationTickets { idTicket } → { conversation: [...] } (notes en HTML;
 *     las imágenes van ahí como <img src="tickets/<id>/conversation<n>/file1.png">)
 *   - POST /chat/getAllUsers { idTicket } → { users: [todos], usersInvolved: [los del ticket] }
 *   - POST /chat/getCloudFile { path: 'tickets/<id>/conversation<n>/file1' } (sin extensión) →
 *     el archivo en base64, como texto (no JSON)
 *   Su página además llama POST /tickets/markMessageAsSeen al abrir un ticket: ESCRIBE (lo marca
 *   como leído). Aquí NO se llama nunca: ver desde Control Interno no cambia nada allá.
 *
 * Acceso: todos los que tienen sesión en la app (decisión del 05/10/2026); cada quien ve solo lo
 * que SU token ve en el helpdesk. Lo que llega fresco se copia a APP_HELPDESK (HelpdeskService).
 *
 * Seguridad
 *   - El token se guarda en Script Properties con llave por correo (la app corre como quien la
 *     desplegó: getUserProperties sería la misma para todos). Nunca regresa al navegador ni va a
 *     una hoja, a Logger o a un mensaje de error. Lo pueden ver los editores del proyecto: se
 *     acepta y está documentado.
 *   - Solo se acepta un token cuyo correo sea el de la sesión de la app y que no haya vencido:
 *     nadie puede pegar el de otro para ver sus tickets.
 *   - 401/403 → el token ya no sirve: se borra y se pide uno nuevo. Sin reintentos.
 *
 * Cuidar al helpdesk (no es nuestro: saturarlo no es una opción)
 *   - La lista de cada persona se reutiliza CACHE_SEG segundos.
 *   - Entre dos llamadas de la misma persona, al menos MIN_ENTRE_MS; y a lo más MAX_POR_MINUTO por
 *     persona y MAX_POR_MINUTO_TODOS entre toda la app.
 *   - Una página por llamada, del tamaño que usa su propia página (POR_PAGINA). Nunca un ciclo:
 *     la siguiente página la pide la persona con "Cargar más".
 *   - Un archivo (imagen de la conversación) solo cuando la persona lo pide, y solo uno que venga
 *     en un ticket que abrió (RUTAS_SEG); a lo más MAX_ARCHIVO_B64 caracteres.
 *   - CERO reintentos automáticos. Si responde 429 o 5xx, TODA la app se detiene el tiempo que pida
 *     (Retry-After) o PAUSA_SEG.
 */

const HelpdeskApi = (function () {
  // En un .gs la URL va normal (el bug del "//" es solo de los .html, ver CLAUDE.md)
  const BASE_POR_OMISION = 'https://helpdesk-backend.gphsis.com';
  const PREFIJO_TOKEN = 'HELPDESK_TOKEN:';

  const CACHE_SEG = 60;
  const MIN_ENTRE_MS = 1000;
  const MAX_POR_MINUTO = 15;
  const MAX_POR_MINUTO_TODOS = 40;
  const PAUSA_SEG = 120;
  const POR_PAGINA = 25;
  const FILTROS_SEG = 3600;   // estatus, prioridades, formularios y grupos casi no cambian
  const RUTAS_SEG = 6 * 3600;
  const TICKET_SEG = 15 * 60;     // la ficha de cada ticket de una lista: abrirlo no la vuelve a pedir
  const FORMULARIO_SEG = 30 * 60; // las respuestas del formulario casi no cambian // los archivos de un ticket abierto se pueden pedir este tiempo
  const MAX_ARCHIVO_B64 = 4 * 1024 * 1024;   // ~3 MB de archivo
  // De qué lista sale cada vista: 'grupos' es /tickets/list; las otras, las pestañas de su inicio
  const VISTAS_INICIO = { departamento: 'departmentTickets', mios: 'myTickets' };
  // Un archivo de la conversación: tickets/<idTicket>/conversation<n>/<nombre>
  const RUTA_ARCHIVO = /^tickets\/(\d+)\/conversation\d+\/[A-Za-z0-9_-]+$/;

  const base_ = () => (typeof leerConfig_ === 'function' && leerConfig_('HELPDESK_URL')) || BASE_POR_OMISION;
  const cache_ = () => CacheService.getScriptCache();
  const props_ = () => PropertiesService.getScriptProperties();
  const correoDe_ = (sesion) => String((sesion && sesion.correo) || '').trim().toLowerCase();
  const ahora_ = () => Date.now();

  // ------------------------------------------------------------------ el token

  /** El contenido de un JWT (sin verificar la firma: eso lo hace el helpdesk), o null */
  function contenido_(token) {
    const partes = String(token || '').trim().split('.');
    if (partes.length !== 3 || partes.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return null;
    try {
      const b64 = partes[1] + '==='.slice((partes[1].length + 3) % 4);
      return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b64)).getDataAsString());
    } catch (e) {
      return null;
    }
  }

  /** Revisa que el token sea de quien lo pega y que siga vivo; regresa su contenido */
  function validarToken_(token, correo) {
    if (String(token || '').length > 4000) throw new Error('Eso no parece un token del helpdesk.');
    const c = contenido_(token);
    if (!c) throw new Error('Eso no parece un token del helpdesk. Cópialo con el botón "Token helpdesk".');
    if (String(c.email || '').trim().toLowerCase() !== correo) {
      throw new Error('Ese token es de otra cuenta del helpdesk. Pega el tuyo (el de ' + correo + ').');
    }
    if (!c.exp || c.exp * 1000 <= ahora_()) throw new Error('Ese token ya venció. Entra al helpdesk y cópialo de nuevo.');
    return c;
  }

  const llaveToken_ = (correo) => PREFIJO_TOKEN + correo;
  const tokenDe_ = (correo) => props_().getProperty(llaveToken_(correo));
  function olvidarToken_(correo) {
    props_().deleteProperty(llaveToken_(correo));
    cache_().removeAll(['hd_lista_' + correo, 'hd_filtros_' + correo]);
  }

  const llaveFicha_ = (correo, id) => 'hd_ficha_' + correo + '_' + id;
  /**
   * La ficha de cada ticket que llegó en una lista, para que abrirlo cueste una llamada y no dos.
   * Las de la lista del inicio vienen incompletas: no pisan una completa.
   */
  function guardarFichas_(correo, tickets, parcial) {
    const valores = {};
    tickets.forEach((t) => {
      if (!t || !t.ID) return;
      if (parcial && cache_().get(llaveFicha_(correo, t.ID))) return;
      valores[llaveFicha_(correo, t.ID)] = JSON.stringify(t);
    });
    try { if (Object.keys(valores).length) cache_().putAll(valores, TICKET_SEG); } catch (e) { /* no cupo */ }
  }

  /** Lo guardado en la caché (o null), y guardar sin tronar si no cabe */
  const deCache_ = (llave) => { const v = cache_().get(llave); return v ? JSON.parse(v) : null; };
  const aCache_ = (llave, valor, seg) => { try { cache_().put(llave, JSON.stringify(valor), seg); } catch (e) { /* no cupo */ } };
  /** Llave corta y estable para un objeto (los filtros de la lista) */
  function huella_(obj) {
    const t = JSON.stringify(obj);
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // ------------------------------------------------------------------ cuidar al helpdesk

  const minuto_ = () => Math.floor(ahora_() / 60000);

  /**
   * ¿Se pueden hacer `n` llamadas ahora (una operación: el detalle son 2)? Truena con el motivo si
   * no. Las cuenta bajo candado para que dos personas a la vez no se brinquen el límite (si no se
   * consigue el candado, no se llama). La espera mínima (MIN_ENTRE_MS) es entre operaciones, no entre sus llamadas.
   */
  function pedirTurno_(correo, n) {
    const cuantas = n || 1;
    const c = cache_();
    const pausa = Number(c.get('hd_pausa') || 0);
    if (pausa > ahora_()) {
      throw new Error('El helpdesk pidió esperar. Vuelve a intentar en ' + Math.ceil((pausa - ahora_()) / 1000) + ' s.');
    }
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) throw new Error('El helpdesk está ocupado con otras consultas. Intenta en unos segundos.');
    try {
      const ultima = Number(c.get('hd_ultima_' + correo) || 0);
      if (ahora_() - ultima < MIN_ENTRE_MS) throw new Error('Espera un par de segundos entre consultas al helpdesk.');
      const k = minuto_();
      const llaveMia = 'hd_n_' + correo + '_' + k;
      const llaveTodos = 'hd_n_todos_' + k;
      const mias = Number(c.get(llaveMia) || 0);
      const todas = Number(c.get(llaveTodos) || 0);
      if (mias + cuantas > MAX_POR_MINUTO) throw new Error('Ya consultaste el helpdesk ' + mias + ' veces en este minuto. Espera un momento.');
      if (todas + cuantas > MAX_POR_MINUTO_TODOS) throw new Error('El helpdesk está recibiendo muchas consultas de la app. Intenta en un minuto.');
      c.putAll({ [llaveMia]: String(mias + cuantas), [llaveTodos]: String(todas + cuantas), ['hd_ultima_' + correo]: String(ahora_()) }, 120);
    } finally {
      lock.releaseLock();
    }
  }

  /** Respuesta 429/5xx: toda la app deja de llamar el tiempo que pida */
  function pausar_(respuesta) {
    const encabezados = respuesta.getHeaders() || {};
    const pedido = Number(encabezados['Retry-After'] || encabezados['retry-after']);
    const seg = Math.min(Math.max(isNaN(pedido) ? PAUSA_SEG : pedido, 30), 900);
    cache_().put('hd_pausa', String(ahora_() + seg * 1000), seg);
  }

  // ------------------------------------------------------------------ transporte

  /**
   * Una llamada al helpdesk. Sin reintentos. El token nunca aparece en un error.
   * conTurno: la operación ya pidió turno para esta llamada (ver detalle).
   * crudo: regresa el texto tal cual (getCloudFile no responde JSON).
   */
  function llamar_(correo, token, ruta, cuerpo, conTurno, crudo) {
    if (!conTurno) pedirTurno_(correo);
    let respuesta;
    try {
      respuesta = UrlFetchApp.fetch(base_() + ruta, {
        method: 'post',
        contentType: 'application/json;charset=UTF-8',
        headers: { authorization: token },
        payload: JSON.stringify(cuerpo || {}),
        muteHttpExceptions: true,
        followRedirects: false,
      });
    } catch (e) {
      throw new Error('No se pudo contactar al helpdesk. Revisa más tarde.');
    }
    const codigo = respuesta.getResponseCode();
    if (codigo === 401 || codigo === 403) {
      olvidarToken_(correo);
      throw new Error('Tu sesión del helpdesk venció. Entra al helpdesk, copia tu token y conéctate de nuevo.');
    }
    if (codigo === 429 || codigo >= 500) {
      pausar_(respuesta);
      throw new Error('El helpdesk no está respondiendo (HTTP ' + codigo + '). Se pausan las consultas unos minutos.');
    }
    if (codigo !== 200) throw new Error('El helpdesk respondió algo inesperado (HTTP ' + codigo + '). Avisa a sistemas.');
    if (crudo) return respuesta.getContentText();
    try {
      return JSON.parse(respuesta.getContentText());
    } catch (e) {
      throw new Error('El helpdesk respondió algo que no se pudo leer. Avisa a sistemas.');
    }
  }

  // ------------------------------------------------------------------ formato propio

  const color_ = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '');
  const id_ = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const numero_ = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));

  /**
   * Un ticket del helpdesk → nuestro formato. Las pantallas solo ven esto, nunca el JSON crudo.
   * Sirve para /tickets/list, getTicket y getTicketsListHome (esta trae menos campos y otros
   * nombres: nameUserDepartment, areaName, date "07-10-2026 08:43 AM", colorStatus).
   */
  function normalizar_(t) {
    const texto = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
    const cierre = t.dateClose ? new Date(t.dateClose) : null;
    // "viernes, 02 octubre 2026 09:28:17" es para leer; dateCreationDB es la fecha de verdad, y en
    // la lista del inicio solo viene "dd-MM-yyyy hh:mm AM"
    const dmy = String(t.date || '').match(/^(\d{2})-(\d{2})-(\d{4})\b/);
    const creado = /^\d{4}-\d{2}-\d{2}$/.test(String(t.dateCreationDB || '')) ? t.dateCreationDB
      : dmy ? dmy[3] + '-' + dmy[2] + '-' + dmy[1] : '';
    return {
      ID: t.idTicket,
      TITULO: texto(t.title),
      DESCRIPCION: t.notes === null || t.notes === undefined ? '' : String(t.notes).trim(),
      ESTATUS: texto(t.nameStatus),
      ID_ESTATUS: t.idStatus,
      COLOR_ESTATUS: color_(t.colorStatus),
      PRIORIDAD: texto(t.namePriority),
      ID_PRIORIDAD: id_(t.idPriority),
      COLOR_PRIORIDAD: color_(t.colorPriority),
      FORMULARIO: texto(t.nameForm),
      ID_FORMULARIO: id_(t.idForm),
      GRUPO: texto(t.nameBranch),
      ID_GRUPO: id_(t.idBranch),
      SOLICITANTE: texto(t.nameUser || t.nameUserDepartment),
      CORREO_SOLICITANTE: texto(t.email).toLowerCase(),
      AREA_SOLICITANTE: texto(t.nameAreaUser || t.nameArea),
      DEPARTAMENTO_SOLICITANTE: texto(t.nameDepartmentUser || t.nameDepartment),
      AGENTE: texto(t.nameAgent),
      AREA_DESTINO: texto(t.nameToArea || t.areaName),
      DEPARTAMENTO_DESTINO: texto(t.nameToDepartment),
      FECHA_CREACION: creado,
      FECHA_CIERRE: cierre && !isNaN(cierre.getTime()) ? cierre.toISOString() : '',
      ULTIMA_RESPUESTA: texto(t.lastRes),
      SIN_LEER: Number(t.cantUnseenMessages) || 0,
      // Los tiempos que mide el helpdesk, en minutos y al momento de pedirlos (MEDIDO_EN: la
      // pantalla le suma lo que ha pasado, porque la lista y la ficha se reutilizan de la caché).
      // nextAnswer: minutos desde la última respuesta; diffLastResponse: los que faltan para su
      // meta (negativo = ya pasó). La suma es la meta: 120 en todas las prioridades (medido en los
      // HAR del 05 y 07/10/2026). La lista del inicio no los trae: null.
      MIN_SIN_RESPUESTA: numero_(t.nextAnswer),
      META_RESPUESTA_MIN: numero_(t.nextAnswer) !== null && numero_(t.diffLastResponse) !== null ? numero_(t.nextAnswer) + numero_(t.diffLastResponse) : null,
      MEDIDO_EN: new Date(ahora_()).toISOString(),
      // La lista del inicio no trae dateClose: ahí se sabe por el estatus (3 Resuelto, 4 Cerrado)
      ABIERTO: 'dateClose' in t ? !t.dateClose : [3, 4].indexOf(Number(t.idStatus)) < 0,
    };
  }

  /**
   * Los nombres que la lista del inicio no trae (prioridad, formulario, grupo), del catálogo de
   * filtros que ya está en la caché. Sin catálogo se quedan vacíos: no se llama al helpdesk por eso.
   */
  function completar_(tickets, correo) {
    const cat = deCache_('hd_filtros_' + correo);
    if (!cat) return tickets;
    const nombre = (lista, id) => ((lista || []).find((x) => x.id === id) || {}).nombre || '';
    tickets.forEach((t) => {
      if (!t.PRIORIDAD && t.ID_PRIORIDAD) t.PRIORIDAD = nombre(cat.prioridades, t.ID_PRIORIDAD);
      if (!t.FORMULARIO && t.ID_FORMULARIO) t.FORMULARIO = nombre(cat.formularios, t.ID_FORMULARIO);
      if (!t.GRUPO && t.ID_GRUPO) t.GRUPO = nombre(cat.grupos, t.ID_GRUPO);
    });
    return tickets;
  }

  /**
   * HTML de un mensaje del helpdesk → texto plano. Los mensajes traen <p>, <strong>, <a>, <img>…
   * de correos y del editor: pintarlos tal cual en nuestra app dejaría correr lo que alguien
   * mande en un correo. Se conservan los párrafos y las ligas (como texto); las imágenes no.
   */
  function textoDeHtml_(html) {
    const entidades = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return String(html == null ? '' : html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_, url, texto) => { const t = texto.replace(/<[^>]*>/g, '').trim(); return t && t !== url ? t + ' (' + url + ')' : url; })
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]*>/g, '')
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (todo, e) => {
        if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(n) ? todo : String.fromCodePoint(n); }
        return entidades[e.toLowerCase()] !== undefined ? entidades[e.toLowerCase()] : todo;
      })
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * Los archivos de un mensaje que se pueden pedir a getCloudFile: las imágenes pegadas en su HTML
   * (<img src="tickets/<id>/conversation<n>/file1.png">, medido) y, si vienen, attachPaths (con
   * attachNames, separados por coma; todavía no se ha visto uno lleno). La ruta va SIN extensión,
   * como la pide su página. Solo rutas de este mismo ticket.
   */
  function archivosDe_(m) {
    const lista = [];
    const vistos = {};
    const agregar = (ruta, nombre) => {
      const limpia = String(ruta || '').trim();
      const ext = (limpia.match(/\.([A-Za-z0-9]{1,5})$/) || ['', ''])[1].toLowerCase();
      const sin = ext ? limpia.slice(0, -ext.length - 1) : limpia;
      const coincide = sin.match(RUTA_ARCHIVO);
      if (!coincide || Number(coincide[1]) !== Number(m.idTicket) || vistos[sin]) return;
      vistos[sin] = true;
      const imagen = /^(png|jpe?g|gif|webp)$/.test(ext);
      lista.push({ RUTA: sin, NOMBRE: String(nombre || '').trim() || (imagen ? 'Imagen ' + (lista.length + 1) : sin.split('/').pop()), IMAGEN: imagen });
    };
    String(m.notes || '').replace(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi, (_, src) => agregar(src));
    const partes = (v) => String(v || '').split(',').map((x) => x.trim());
    const nombres = partes(m.attachNames);
    partes(m.attachPaths).forEach((ruta, i) => { if (ruta) agregar(ruta, nombres[i]); });
    return lista;
  }

  /** Un mensaje de la conversación → nuestro formato */
  function normalizarMensaje_(m) {
    const fecha = m.dateCreation ? new Date(m.dateCreation) : null;
    return {
      ID: m.idConversation,
      AUTOR: String(m.nameAnswer || '').replace(/\s+/g, ' ').trim(),
      CORREO: String(m.email || '').trim().toLowerCase(),   // para su foto (Avatar)
      FECHA: fecha && !isNaN(fecha.getTime()) ? fecha.toISOString() : '',
      TEXTO: textoDeHtml_(m.notes),
      PRIVADO: Number(m.isPrivate) === 1,
      ADJUNTOS: String(m.attachNames || '').split(',').map((n) => n.trim()).filter(Boolean),
      ARCHIVOS: archivosDe_(m),
    };
  }

  /** Qué es un archivo en base64, por sus primeros bytes. Solo lo que se puede mostrar sin riesgo (sin SVG). */
  function tipoDe_(b64) {
    const firmas = [['iVBORw0KGgo', 'image/png'], ['/9j/', 'image/jpeg'], ['R0lGOD', 'image/gif'], ['JVBERi0', 'application/pdf']];
    const f = firmas.find((x) => b64.indexOf(x[0]) === 0);
    if (f) return f[1];
    // WEBP: "RIFF....WEBP" → UklGR + 4 bytes + V0VCUA
    return /^UklGR.{6}V0VCUA/.test(b64) ? 'image/webp' : '';
  }

  /**
   * Lo que llegó fresco del helpdesk, a la copia en APP_HELPDESK. Si falla, la pantalla sigue.
   * parcial: la lista del inicio no trae todos los campos; lo que no trae no borra lo guardado.
   */
  function copiar_(tickets, correo, parcial) {
    try {
      if (typeof HelpdeskService !== 'undefined') HelpdeskService.sincronizar_(tickets, correo, parcial);
    } catch (e) {
      console.error('Help Desk: no se pudo guardar la copia de los tickets: ' + e.message);
    }
  }

  /**
   * Filtros de la lista que manda la pantalla → solo números, fechas yyyy-MM-dd, y pocos.
   * vista: 'grupos' (lo de /tickets/list, con todos los filtros y páginas), 'departamento' o
   * 'mios' (las pestañas de su inicio: sin filtros ni páginas, y así se guardan en la caché).
   * despuesDe: el último ID de la página anterior (para "Cargar más").
   */
  function filtrosValidos_(f) {
    const ids = (v) => (Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
    const dia = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
    const o = f || {};
    if (VISTAS_INICIO[o.vista]) return { vista: o.vista };
    let desde = dia(o.desde);
    let hasta = dia(o.hasta);
    if (desde && hasta && desde > hasta) { const x = desde; desde = hasta; hasta = x; }
    return {
      vista: 'grupos', estatus: ids(o.estatus), grupos: ids(o.grupos), formularios: ids(o.formularios), prioridades: ids(o.prioridades),
      agentes: ids(o.agentes), departamentos: ids(o.departamentos), desde: desde, hasta: hasta, despuesDe: id_(o.despuesDe),
    };
  }

  // ------------------------------------------------------------------ lo que usa la app

  /** Valida el token con el helpdesk (una llamada) y lo guarda a nombre de quien tiene la sesión */
  function conectar(token, tokenHelpdesk) {
    const sesion = Auth.validarSesion(token);
    const correo = correoDe_(sesion);
    if (!correo) throw new Error('No se pudo saber quién eres. Vuelve a iniciar sesión.');
    const limpio = String(tokenHelpdesk || '').trim();
    const c = validarToken_(limpio, correo);
    const r = llamar_(correo, limpio, '/login/autoLogin', { token: limpio });
    const datos = (r && r.data) || {};
    if (r.status !== 1 || String(datos.email || '').trim().toLowerCase() !== correo) {
      throw new Error('El helpdesk no reconoció ese token como tuyo.');
    }
    props_().setProperty(llaveToken_(correo), limpio);
    cache_().remove('hd_lista_' + correo);
    return { conectado: true, nombre: String(datos.name || c.name || ''), rol: String(datos.rol || ''), vence: new Date(c.exp * 1000).toISOString() };
  }

  function desconectar(token) {
    const sesion = Auth.validarSesion(token);
    olvidarToken_(correoDe_(sesion));
    return { conectado: false };
  }

  /** ¿Hay un token vivo? Sin llamar al helpdesk: se lee del propio token */
  function estado(token) {
    const sesion = Auth.validarSesion(token);
    const correo = correoDe_(sesion);
    const guardado = tokenDe_(correo);
    const c = guardado ? contenido_(guardado) : null;
    if (!c || !c.exp || c.exp * 1000 <= ahora_()) {
      if (guardado) olvidarToken_(correo);
      return { conectado: false };
    }
    return { conectado: true, nombre: String(c.name || ''), rol: String(c.rol || ''), vence: new Date(c.exp * 1000).toISOString() };
  }

  /** El correo y el token guardado de quien tiene la sesión (truena si no se ha conectado) */
  function conectado_(token) {
    const correo = correoDe_(Auth.validarSesion(token));
    const guardado = tokenDe_(correo);
    if (!guardado) throw new Error('Conecta tu cuenta del helpdesk primero.');
    return { correo: correo, token: guardado };
  }

  /**
   * Una página (POR_PAGINA) de los tickets que el helpdesk le muestra a esta persona (lo mismo que
   * vería en su página), en nuestro formato. filtros: ver filtrosValidos_ (los ids salen de
   * filtros()). Regresa { total, tickets, siguiente, consultado }: `siguiente` es el cursor para
   * pedir la página que sigue (despuesDe), o null si no hay más. Se reutiliza CACHE_SEG segundos;
   * `forzar` la pide de nuevo (igual respetando los límites).
   */
  function listarTickets(token, filtros, forzar) {
    const yo = conectado_(token);
    const f = filtrosValidos_(filtros);
    const llave = 'hd_lista_' + yo.correo + '_' + huella_(f);
    if (!forzar) { const guardada = deCache_(llave); if (guardada) return guardada; }
    const inicio = VISTAS_INICIO[f.vista];
    let r;
    let total;
    if (inicio) {
      // Las pestañas de su inicio (medido el 07/10/2026); no se conoce cómo pagina: solo la primera
      r = llamar_(yo.correo, yo.token, '/tickets/getTicketsListHome', {
        get: inicio, applyFilters: inicio === 'departmentTickets' ? { name: '' } : [], pagination: { rowsPerPage: POR_PAGINA },
      });
      if (!r || !Array.isArray(r.tickets)) throw new Error('El helpdesk cambió la forma de su lista. Avisa a sistemas.');
      total = Number(r.totalTickets);
    } else {
      // La misma forma que manda su página al filtrar y al pasar de página (medida el 07/10/2026)
      const paginacion = { rowsPerPage: POR_PAGINA };
      if (f.despuesDe) paginacion.nextPageLastIdTicket = f.despuesDe;
      r = llamar_(yo.correo, yo.token, '/tickets/list', {
        filters: {
          idHeadquarter: [], idAgent: f.agentes, idArea: [], idBranch: f.grupos, idForm: f.formularios, toIdDepartment: [],
          idPriority: f.prioridades, idStatus: f.estatus, dateCreation: f.desde, dateCreationEnd: f.hasta, idUser: [], idCrea: [],
          idTicket: [], headC: [], firstAnswer: null, nextAnswer: null, idProyecto: null, idCondominio: null, idLote: null,
          myTickets: null, departamento: [], area: [], idDepartmentCustomer: f.departamentos,
        },
        pagination: paginacion,
      });
      if (!r || !Array.isArray(r.tickets)) throw new Error('El helpdesk cambió la forma de su lista. Avisa a sistemas.');
      total = Number(r.cantTotalTickets);
    }
    const tickets = completar_(r.tickets.map(normalizar_), yo.correo);
    const ultimo = tickets.length ? id_(tickets[tickets.length - 1].ID) : null;
    const resultado = {
      total: total || tickets.length,
      tickets: tickets,
      // Página llena = puede haber más. El cursor tiene que ir bajando: si no, se corta (nunca un ciclo)
      siguiente: !inicio && tickets.length >= POR_PAGINA && ultimo && (!f.despuesDe || ultimo < f.despuesDe) ? ultimo : null,
      consultado: new Date(ahora_()).toISOString(),
    };
    aCache_(llave, resultado, CACHE_SEG);
    guardarFichas_(yo.correo, tickets, !!inicio);
    copiar_(resultado.tickets, yo.correo, !!inicio);
    return resultado;
  }

  /**
   * Estatus, prioridades, formularios, grupos, agentes y departamentos de los solicitantes para
   * los filtros de la pantalla (una llamada por hora)
   */
  function filtros(token) {
    const yo = conectado_(token);
    const llave = 'hd_filtros_' + yo.correo;
    const guardados = deCache_(llave);
    if (guardados) return guardados;
    const r = llamar_(yo.correo, yo.token, '/tickets/getFilters', { isTramite: 0 });
    if (!r || !Array.isArray(r.status)) throw new Error('El helpdesk cambió la forma de sus filtros. Avisa a sistemas.');
    const lista = (v, id, nombre, extra) => {
      const vistos = {};
      return (Array.isArray(v) ? v : [])
        .filter((x) => x && x[id] && x.status !== 0 && x.isDelete !== 1 && !vistos[x[id]] && (vistos[x[id]] = true))
        .map((x) => Object.assign({ id: x[id], nombre: String(x[nombre] || '').replace(/\s+/g, ' ').trim() }, extra ? extra(x) : {}));
    };
    const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
    const resultado = {
      estatus: lista(r.status, 'idStatus', 'name', (x) => ({ color: color_(x.color) })),
      prioridades: lista(r.priority, 'idPriority', 'name', (x) => ({ color: color_(x.color) })),
      formularios: lista(r.forms, 'idForm', 'notes'),
      grupos: lista(r.branches, 'idBranch', 'name'),
      // Un agente viene una vez por cada grupo suyo
      agentes: lista(r.agents, 'idUser', 'name').sort(porNombre),
      departamentos: lista(r.departmentCustomers, 'idDepartment', 'name').sort(porNombre),
    };
    aCache_(llave, resultado, FILTROS_SEG);
    return resultado;
  }

  /**
   * Un ticket con su conversación. Solo lee: NO se llama markMessageAsSeen, así que verlo aquí no
   * lo marca como leído allá. Cuida las llamadas (07/10/2026):
   *   - si el ticket llegó en una lista hace poco (TICKET_SEG), su ficha ya está: UNA llamada (la
   *     conversación). Si no (se abrió por folio), dos: getTicket + la conversación.
   *   - quiénes están en él salen de la misma conversación (autores y quien lo pidió), no de
   *     chat/getAllUsers (que además trae a TODOS los usuarios del helpdesk).
   * Los archivos de la conversación quedan apuntados RUTAS_SEG para poder pedirlos con archivo().
   */
  function detalle(token, idTicket) {
    const yo = conectado_(token);
    const id = Number(idTicket);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Ticket inválido.');
    const llave = 'hd_ticket_' + yo.correo + '_' + id;
    const guardado = deCache_(llave);
    if (guardado) return guardado;
    let ficha = deCache_(llaveFicha_(yo.correo, id));
    let duracion = '';
    pedirTurno_(yo.correo, ficha ? 1 : 2);
    if (!ficha) {
      const r = llamar_(yo.correo, yo.token, '/tickets/getTicket', { idTicket: id, isTramite: 0 }, true);
      const t = r && Array.isArray(r.tickets) ? r.tickets[0] : null;
      if (!t) throw new Error('El helpdesk no regresó ese ticket (puede que no tengas acceso a él allá).');
      ficha = normalizar_(t);
      duracion = t.intervalTime === null || t.intervalTime === undefined || t.intervalTime === '' ? '' : Number(t.intervalTime);
      copiar_([ficha], yo.correo);   // la de una lista ya se copió al listar
    }
    const c = llamar_(yo.correo, yo.token, '/tickets/getConversationTickets', { idTicket: id }, true);
    if (!c || !Array.isArray(c.conversation)) throw new Error('El helpdesk cambió la forma de la conversación. Avisa a sistemas.');
    const mensajes = c.conversation.map((m) => normalizarMensaje_(Object.assign({ idTicket: id }, m)));
    const resultado = Object.assign({}, ficha, { DURACION_DIAS: duracion, MENSAJES: mensajes, INVOLUCRADOS: involucrados_(ficha, mensajes) });
    aCache_(llave, resultado, CACHE_SEG);
    const rutas = [].concat.apply([], mensajes.map((m) => m.ARCHIVOS.map((a) => a.RUTA)));
    if (rutas.length) aCache_('hd_rutas_' + yo.correo + '_' + id, rutas, RUTAS_SEG);
    return resultado;
  }

  /** Quién pidió el ticket y quién ha escrito en él, sin repetir (por correo, o por nombre si no hay) */
  function involucrados_(ficha, mensajes) {
    const vistos = {};
    const lista = [];
    const agregar = (nombre, correo) => {
      const n = String(nombre || '').replace(/\s+/g, ' ').trim();
      const c = String(correo || '').trim().toLowerCase();
      const clave = c || n.toLowerCase();
      if (!n || vistos[clave]) return;
      vistos[clave] = true;
      lista.push({ NOMBRE: n, CORREO: c });
    };
    agregar(ficha.SOLICITANTE, ficha.CORREO_SOLICITANTE);
    mensajes.forEach((m) => agregar(m.AUTOR, m.CORREO));
    return lista;
  }

  /**
   * Las respuestas del formulario de un ticket (los campos que llenó quien lo pidió): una llamada,
   * solo cuando la persona lo pide ("Ver formulario"). Casi nunca cambian: FORMULARIO_SEG.
   * POST /homeT/getNewTicketCatalogs (medido el 05/10/2026): fields.arrayForm.arrayForm.fields
   * (los campos) y fields.datas.dataAnswer ({ idField, value } de ESE ticket).
   * idForm sale de la ficha guardada; si no está, el que mande la pantalla (solo es para leer).
   */
  function formulario(token, idTicket, idForm) {
    const yo = conectado_(token);
    const id = Number(idTicket);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Ticket inválido.');
    const llave = 'hd_form_' + yo.correo + '_' + id;
    const guardado = deCache_(llave);
    if (guardado) return guardado;
    const ficha = deCache_(llaveFicha_(yo.correo, id)) || deCache_('hd_ticket_' + yo.correo + '_' + id);
    const form = id_(ficha && ficha.ID_FORMULARIO) || id_(idForm);
    if (!form) throw new Error('No se sabe de qué formulario es este ticket. Ábrelo de nuevo.');
    const r = llamar_(yo.correo, yo.token, '/homeT/getNewTicketCatalogs', { isTramite: null, idForm: form, idTicket: id, desarrollo: null, condominio: null });
    const f = r && r.fields;
    const def = f && f.arrayForm && f.arrayForm.arrayForm;
    if (!def || !Array.isArray(def.fields)) throw new Error('El helpdesk cambió la forma de sus formularios. Avisa a sistemas.');
    const respuestas = {};
    ((f.datas && f.datas.dataAnswer) || []).forEach((a) => { if (a && a.idField) respuestas[a.idField] = a.value; });
    const resultado = {
      FORMULARIO: String(def.note || '').trim(),
      CAMPOS: def.fields.filter((c) => c && c.idField && Number(c.canSee) !== 0).map((c) => ({
        ID: c.idField,
        ETIQUETA: String(c.tagAgent || c.tagCustomer || '').replace(/\s+/g, ' ').trim(),
        TIPO: String(c.type || ''),
        VALOR: respuestas[c.idField] === null || respuestas[c.idField] === undefined ? '' : String(respuestas[c.idField]).trim(),
      })),
    };
    aCache_(llave, resultado, FORMULARIO_SEG);
    return resultado;
  }

  /**
   * Un archivo de la conversación (una llamada), solo si viene en un ticket que esta persona abrió
   * hace poco (detalle lo apunta): nadie pide por aquí rutas inventadas. Regresa { tipo, base64 }.
   * Solo imágenes (sin SVG) y PDF; lo demás se abre en el helpdesk.
   */
  function archivo(token, idTicket, ruta) {
    const yo = conectado_(token);
    const id = Number(idTicket);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Ticket inválido.');
    const r = String(ruta || '');
    const coincide = r.match(RUTA_ARCHIVO);
    if (!coincide || Number(coincide[1]) !== id) throw new Error('Archivo inválido.');
    const permitidas = deCache_('hd_rutas_' + yo.correo + '_' + id) || [];
    if (permitidas.indexOf(r) < 0) throw new Error('Abre el ticket otra vez para ver sus archivos.');
    const texto = String(llamar_(yo.correo, yo.token, '/chat/getCloudFile', { path: r }, false, true) || '')
      .replace(/^"|"$/g, '').replace(/\s+/g, '');
    if (texto.length > MAX_ARCHIVO_B64) throw new Error('El archivo es muy grande para verlo aquí. Ábrelo en el helpdesk.');
    if (!texto || !/^[A-Za-z0-9+/]+={0,2}$/.test(texto)) throw new Error('El helpdesk no regresó el archivo. Ábrelo en el helpdesk.');
    const tipo = tipoDe_(texto);
    if (!tipo) throw new Error('Ese tipo de archivo no se puede ver aquí. Ábrelo en el helpdesk.');
    return { tipo: tipo, base64: texto };
  }

  return {
    conectar, desconectar, estado, listarTickets, filtros, detalle, formulario, archivo,
    // expuestas para las pruebas
    normalizar_, normalizarMensaje_, textoDeHtml_, contenido_, tipoDe_,
    LIMITES: { CACHE_SEG, MIN_ENTRE_MS, MAX_POR_MINUTO, MAX_POR_MINUTO_TODOS, PAUSA_SEG, POR_PAGINA, FILTROS_SEG, RUTAS_SEG, MAX_ARCHIVO_B64, TICKET_SEG, FORMULARIO_SEG },
  };
})();

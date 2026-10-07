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
 *     No pagina: siempre los primeros 25 del filtro (estatus, grupo, formulario, prioridad).
 *   - POST /tickets/getFilters { isTramite: 0 } → estatus, prioridades, formularios y grupos
 *   - POST /tickets/getTicket { idTicket, isTramite: 0 } → { tickets: [uno] }
 *   - POST /tickets/getConversationTickets { idTicket } → { conversation: [...] } (notes en HTML)
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
 *   - Una página por llamada, del tamaño que usa su propia página (POR_PAGINA). Nunca un ciclo.
 *   - CERO reintentos automáticos. Si responde 429 o 5xx, TODA la app se detiene el tiempo que pida
 *     (Retry-After) o PAUSA_SEG.
 */

const HelpdeskApi = (function () {
  // En un .gs la URL va normal (el bug del "//" es solo de los .html, ver CLAUDE.md)
  const BASE_POR_OMISION = 'https://helpdesk-backend.gphsis.com';
  const PREFIJO_TOKEN = 'HELPDESK_TOKEN:';

  const CACHE_SEG = 60;
  const MIN_ENTRE_MS = 2000;
  const MAX_POR_MINUTO = 10;
  const MAX_POR_MINUTO_TODOS = 30;
  const PAUSA_SEG = 120;
  const POR_PAGINA = 25;
  const FILTROS_SEG = 3600;   // estatus, prioridades, formularios y grupos casi no cambian

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
   * consigue el candado, no se llama). Los 2 s mínimos son entre operaciones, no entre sus llamadas.
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
   */
  function llamar_(correo, token, ruta, cuerpo, conTurno) {
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
    try {
      return JSON.parse(respuesta.getContentText());
    } catch (e) {
      throw new Error('El helpdesk respondió algo que no se pudo leer. Avisa a sistemas.');
    }
  }

  // ------------------------------------------------------------------ formato propio

  /** Un ticket del helpdesk → nuestro formato. Las pantallas solo ven esto, nunca el JSON crudo. */
  function normalizar_(t) {
    const texto = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
    const cierre = t.dateClose ? new Date(t.dateClose) : null;
    return {
      ID: t.idTicket,
      TITULO: texto(t.title),
      DESCRIPCION: t.notes === null || t.notes === undefined ? '' : String(t.notes).trim(),
      ESTATUS: texto(t.nameStatus),
      ID_ESTATUS: t.idStatus,
      PRIORIDAD: texto(t.namePriority),
      COLOR_PRIORIDAD: /^#[0-9a-f]{3,8}$/i.test(String(t.colorPriority || '')) ? t.colorPriority : '',
      FORMULARIO: texto(t.nameForm),
      GRUPO: texto(t.nameBranch),
      SOLICITANTE: texto(t.nameUser),
      CORREO_SOLICITANTE: texto(t.email).toLowerCase(),
      AREA_SOLICITANTE: texto(t.nameAreaUser || t.nameArea),
      DEPARTAMENTO_SOLICITANTE: texto(t.nameDepartmentUser || t.nameDepartment),
      AGENTE: texto(t.nameAgent),
      AREA_DESTINO: texto(t.nameToArea),
      DEPARTAMENTO_DESTINO: texto(t.nameToDepartment),
      // "viernes, 02 octubre 2026 09:28:17" es para leer; dateCreationDB es la fecha de verdad
      FECHA_CREACION: /^\d{4}-\d{2}-\d{2}$/.test(String(t.dateCreationDB || '')) ? t.dateCreationDB : '',
      FECHA_CIERRE: cierre && !isNaN(cierre.getTime()) ? cierre.toISOString() : '',
      ULTIMA_RESPUESTA: texto(t.lastRes),
      SIN_LEER: Number(t.cantUnseenMessages) || 0,
      ABIERTO: !t.dateClose,
    };
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

  /** Un mensaje de la conversación → nuestro formato */
  function normalizarMensaje_(m) {
    const fecha = m.dateCreation ? new Date(m.dateCreation) : null;
    return {
      ID: m.idConversation,
      AUTOR: String(m.nameAnswer || '').replace(/\s+/g, ' ').trim(),
      FECHA: fecha && !isNaN(fecha.getTime()) ? fecha.toISOString() : '',
      TEXTO: textoDeHtml_(m.notes),
      PRIVADO: Number(m.isPrivate) === 1,
      ADJUNTOS: String(m.attachNames || '').split(',').map((n) => n.trim()).filter(Boolean),
    };
  }

  /** Lo que llegó fresco del helpdesk, a la copia en APP_HELPDESK. Si falla, la pantalla sigue. */
  function copiar_(tickets, correo) {
    try {
      if (typeof HelpdeskService !== 'undefined') HelpdeskService.sincronizar_(tickets, correo);
    } catch (e) {
      console.error('Help Desk: no se pudo guardar la copia de los tickets: ' + e.message);
    }
  }

  /** Filtros de la lista que manda la pantalla → solo números, y pocos */
  function filtrosValidos_(f) {
    const ids = (v) => (Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
    const o = f || {};
    return { estatus: ids(o.estatus), grupos: ids(o.grupos), formularios: ids(o.formularios), prioridades: ids(o.prioridades) };
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
   * Los primeros 25 tickets que el helpdesk le muestra a esta persona con esos filtros (lo mismo
   * que vería en su página), en nuestro formato. filtros = { estatus, grupos, formularios,
   * prioridades }: listas de ids de filtros(). Se reutiliza CACHE_SEG segundos; `forzar` la pide
   * de nuevo (igual respetando los límites).
   */
  function listarTickets(token, filtros, forzar) {
    const yo = conectado_(token);
    const f = filtrosValidos_(filtros);
    const llave = 'hd_lista_' + yo.correo + '_' + huella_(f);
    if (!forzar) { const guardada = deCache_(llave); if (guardada) return guardada; }
    // La misma forma que manda su página al filtrar (medida el 05/10/2026)
    const r = llamar_(yo.correo, yo.token, '/tickets/list', {
      filters: {
        idHeadquarter: [], idAgent: [], idArea: [], idBranch: f.grupos, idForm: f.formularios, toIdDepartment: [],
        idPriority: f.prioridades, idStatus: f.estatus, dateCreation: null, dateCreationEnd: null, idUser: [], idCrea: [],
        idTicket: [], headC: [], firstAnswer: null, nextAnswer: null, idProyecto: null, idCondominio: null, idLote: null,
        myTickets: null, departamento: [], area: [], idDepartmentCustomer: [],
      },
      pagination: { rowsPerPage: POR_PAGINA },
    });
    if (!r || !Array.isArray(r.tickets)) throw new Error('El helpdesk cambió la forma de su lista. Avisa a sistemas.');
    const resultado = {
      total: Number(r.cantTotalTickets) || r.tickets.length,
      tickets: r.tickets.map(normalizar_),
      consultado: new Date(ahora_()).toISOString(),
    };
    aCache_(llave, resultado, CACHE_SEG);
    copiar_(resultado.tickets, yo.correo);
    return resultado;
  }

  /** Estatus, prioridades, formularios y grupos para los filtros de la pantalla (una llamada por hora) */
  function filtros(token) {
    const yo = conectado_(token);
    const llave = 'hd_filtros_' + yo.correo;
    const guardados = deCache_(llave);
    if (guardados) return guardados;
    const r = llamar_(yo.correo, yo.token, '/tickets/getFilters', { isTramite: 0 });
    if (!r || !Array.isArray(r.status)) throw new Error('El helpdesk cambió la forma de sus filtros. Avisa a sistemas.');
    const color = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '');
    const lista = (v, id, nombre, extra) => (Array.isArray(v) ? v : [])
      .filter((x) => x && x[id] && x.status !== 0 && x.isDelete !== 1)
      .map((x) => Object.assign({ id: x[id], nombre: String(x[nombre] || '').trim() }, extra ? extra(x) : {}));
    const resultado = {
      estatus: lista(r.status, 'idStatus', 'name', (x) => ({ color: color(x.color) })),
      prioridades: lista(r.priority, 'idPriority', 'name', (x) => ({ color: color(x.color) })),
      formularios: lista(r.forms, 'idForm', 'notes'),
      grupos: lista(r.branches, 'idBranch', 'name'),
    };
    aCache_(llave, resultado, FILTROS_SEG);
    return resultado;
  }

  /**
   * Un ticket con su conversación (dos llamadas, cada una con su turno). Solo lee: NO se llama
   * markMessageAsSeen, así que verlo aquí no lo marca como leído allá.
   */
  function detalle(token, idTicket) {
    const yo = conectado_(token);
    const id = Number(idTicket);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Ticket inválido.');
    const llave = 'hd_ticket_' + yo.correo + '_' + id;
    const guardado = deCache_(llave);
    if (guardado) return guardado;
    pedirTurno_(yo.correo, 2);
    const r = llamar_(yo.correo, yo.token, '/tickets/getTicket', { idTicket: id, isTramite: 0 }, true);
    const t = r && Array.isArray(r.tickets) ? r.tickets[0] : null;
    if (!t) throw new Error('El helpdesk no regresó ese ticket (puede que no tengas acceso a él allá).');
    const c = llamar_(yo.correo, yo.token, '/tickets/getConversationTickets', { idTicket: id }, true);
    if (!c || !Array.isArray(c.conversation)) throw new Error('El helpdesk cambió la forma de la conversación. Avisa a sistemas.');
    const resultado = Object.assign(normalizar_(t), {
      DURACION_DIAS: t.intervalTime === null || t.intervalTime === undefined || t.intervalTime === '' ? '' : Number(t.intervalTime),
      MENSAJES: c.conversation.map(normalizarMensaje_),
    });
    aCache_(llave, resultado, CACHE_SEG);
    copiar_([resultado], yo.correo);   // la ficha; la conversación no se copia
    return resultado;
  }

  return {
    conectar, desconectar, estado, listarTickets, filtros, detalle,
    // expuestas para las pruebas
    normalizar_, normalizarMensaje_, textoDeHtml_, contenido_,
    LIMITES: { CACHE_SEG, MIN_ENTRE_MS, MAX_POR_MINUTO, MAX_POR_MINUTO_TODOS, PAUSA_SEG, POR_PAGINA, FILTROS_SEG },
  };
})();

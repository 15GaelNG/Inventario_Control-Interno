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
 *   - POST /tickets/list     → { cantTotalTickets, tickets: [...] }, con { filters, pagination }
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
  const MODULO = 'helpdesk';
  // En un .gs la URL va normal (el bug del "//" es solo de los .html, ver CLAUDE.md)
  const BASE_POR_OMISION = 'https://helpdesk-backend.gphsis.com';
  const PREFIJO_TOKEN = 'HELPDESK_TOKEN:';

  const CACHE_SEG = 60;
  const MIN_ENTRE_MS = 2000;
  const MAX_POR_MINUTO = 10;
  const MAX_POR_MINUTO_TODOS = 30;
  const PAUSA_SEG = 120;
  const POR_PAGINA = 25;

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
    cache_().remove('hd_lista_' + correo);
  }

  // ------------------------------------------------------------------ cuidar al helpdesk

  const minuto_ = () => Math.floor(ahora_() / 60000);

  /**
   * ¿Se puede llamar ahora? Truena con el motivo si no. Cuenta la llamada bajo candado para que
   * dos personas a la vez no se brinquen el límite (si no se consigue el candado, no se llama).
   */
  function pedirTurno_(correo) {
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
      if (mias >= MAX_POR_MINUTO) throw new Error('Ya consultaste el helpdesk ' + mias + ' veces en este minuto. Espera un momento.');
      if (todas >= MAX_POR_MINUTO_TODOS) throw new Error('El helpdesk está recibiendo muchas consultas de la app. Intenta en un minuto.');
      c.putAll({ [llaveMia]: String(mias + 1), [llaveTodos]: String(todas + 1), ['hd_ultima_' + correo]: String(ahora_()) }, 120);
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

  /** Una llamada al helpdesk. Sin reintentos. El token nunca aparece en un error. */
  function llamar_(correo, token, ruta, cuerpo) {
    pedirTurno_(correo);
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

  // ------------------------------------------------------------------ lo que usa la app

  /** Valida el token con el helpdesk (una llamada) y lo guarda a nombre de quien tiene la sesión */
  function conectar(token, tokenHelpdesk) {
    const sesion = Permisos.puedeLeer(token, MODULO);
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
    const sesion = Permisos.puedeLeer(token, MODULO);
    olvidarToken_(correoDe_(sesion));
    return { conectado: false };
  }

  /** ¿Hay un token vivo? Sin llamar al helpdesk: se lee del propio token */
  function estado(token) {
    const sesion = Permisos.puedeLeer(token, MODULO);
    const correo = correoDe_(sesion);
    const guardado = tokenDe_(correo);
    const c = guardado ? contenido_(guardado) : null;
    if (!c || !c.exp || c.exp * 1000 <= ahora_()) {
      if (guardado) olvidarToken_(correo);
      return { conectado: false };
    }
    return { conectado: true, nombre: String(c.name || ''), rol: String(c.rol || ''), vence: new Date(c.exp * 1000).toISOString() };
  }

  /**
   * La primera página de tickets que el helpdesk le muestra a esta persona (lo mismo que ve en
   * su página), en nuestro formato. Se reutiliza CACHE_SEG segundos; `forzar` la pide de nuevo
   * (igual respetando los límites).
   */
  function listarTickets(token, forzar) {
    const sesion = Permisos.puedeLeer(token, MODULO);
    const correo = correoDe_(sesion);
    const guardado = tokenDe_(correo);
    if (!guardado) throw new Error('Conecta tu cuenta del helpdesk primero.');
    const llave = 'hd_lista_' + correo;
    if (!forzar) {
      const enCache = cache_().get(llave);
      if (enCache) return JSON.parse(enCache);
    }
    const r = llamar_(correo, guardado, '/tickets/list', {
      filters: {
        agents: [], branches: [], forms: [], areas: [], department: [], customer: [],
        departmentCustomers: [], idTicket: [], status: [], priority: [], finishLoad: false,
      },
      pagination: { rowsPerPage: POR_PAGINA },
    });
    if (!r || !Array.isArray(r.tickets)) throw new Error('El helpdesk cambió la forma de su lista. Avisa a sistemas.');
    const resultado = {
      total: Number(r.cantTotalTickets) || r.tickets.length,
      tickets: r.tickets.map(normalizar_),
      consultado: new Date(ahora_()).toISOString(),
    };
    try { cache_().put(llave, JSON.stringify(resultado), CACHE_SEG); } catch (e) { /* si no cabe, la siguiente consulta respeta los límites */ }
    return resultado;
  }

  return {
    conectar, desconectar, estado, listarTickets,
    // expuestas para las pruebas
    normalizar_, contenido_, LIMITES: { CACHE_SEG, MIN_ENTRE_MS, MAX_POR_MINUTO, MAX_POR_MINUTO_TODOS, PAUSA_SEG, POR_PAGINA },
  };
})();

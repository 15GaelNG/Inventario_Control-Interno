
const Auth = (function () {
  // Nombre real de la pestaña ya confirmado ("USUARIOS") — se busca directo
  // por nombre, no por firma de columnas (SheetUtils.getSheetByColumns).
  // Esto SÍ importa para la velocidad: ese spreadsheet tiene ~50 pestañas
  // (es el mismo compartido de AppSheet), y buscar por columnas implica
  // abrir y leer los encabezados de CADA UNA hasta encontrar la que
  // coincide — lento la primera vez que se pide en el día (después queda
  // 6h en caché, pero la detección automática de Google al abrir el login
  // es justo la más sensible a esa primera vez lenta).
  const NOMBRE_HOJA_USUARIOS = 'USUARIOS';

  function hojaUsuarios_() {
    return SheetUtils.getSheet(Config.SPREADSHEET_IDS.USUARIOS(), NOMBRE_HOJA_USUARIOS);
  }

  /** Al crear un usuario a mano (SetupInicial): la huella v2 va completa en PASSWORD_HASH (Credenciales.gs) */
  function crearHashParaUsuario(password) {
    return { salt: '', hash: Credenciales.crear(password) };
  }

  /** El spreadsheet original solo distingue ADMIN / USER; todo lo que no sea ADMIN opera como OPERADOR */
  function mapearRol_(rolOriginal) {
    // Dentro de la función (no al cargar el archivo): Config.gs podría cargarse después que Auth.gs
    const roles = {
      ADMIN: Config.ROLES.ADMIN,
      SUPER: Config.ROLES.ADMIN,
      USER: Config.ROLES.OPERADOR,
      VIEWER: Config.ROLES.LECTURA,
      CLIENT: Config.ROLES.CLIENTE,
    };
    return roles[String(rolOriginal || '').trim().toUpperCase()] || Config.ROLES.LECTURA;
  }

  function buscarUsuarioPorCorreo_(correo) {
    const ssId = Config.SPREADSHEET_IDS.USUARIOS();
    const hoja = hojaUsuarios_();
    return SheetUtils.getAll(ssId, hoja.getName())
      .find((u) => String(u.CORREO).toLowerCase().trim() === String(correo).toLowerCase().trim());
  }

  // ---------------------------------------------------------------- la sesión (23-oct)
  // Vive en CacheService con su token. Vence a los Config.SESION_INACTIVIDAD_MIN sin usar la app (cada llamada de la
  // persona la renueva, a lo más cada RENOVAR_CADA_MIN) y nunca pasa de Config.SESION_DURACION_HORAS desde que se creó.
  // Las llamadas automáticas (el vigía, la campanita, sensores en vivo) llaman Auth.automatica() antes: validan sin
  // renovar; si no, una pestaña abierta nunca se cerraría.
  // Cada persona tiene una VERSIÓN de sesión (ScriptProperties, copiada en caché): cerrarSesiones la sube y las sesiones
  // con la vieja dejan de servir aunque sigan en la caché (cambiar o restablecer la contraseña, quitar dispositivos).
  const RENOVAR_CADA_MIN = 5;
  const SEG_VERSION_EN_CACHE = 21600;   // 6 h, lo más que guarda CacheService; la de verdad está en ScriptProperties
  const claveVersion_ = (correo) => 'sesion_version_' + String(correo || '').trim().toLowerCase();
  const maximoMs_ = () => Config.SESION_DURACION_HORAS * 3600000;
  const inactividadSeg_ = () => Math.max(60, Math.round((Config.SESION_INACTIVIDAD_MIN || 60) * 60));

  function versionDe_(correo) {
    const k = claveVersion_(correo);
    const cache = CacheService.getScriptCache();
    const guardada = cache.get(k);
    if (guardada !== null) return Number(guardada);
    const v = Number(PropertiesService.getScriptProperties().getProperty(k) || 0);
    cache.put(k, String(v), SEG_VERSION_EN_CACHE);
    return v;
  }

  /** La guarda con lo que le queda: lo menor entre la inactividad y lo que falta para el máximo absoluto */
  function guardarSesion_(token, sesion) {
    const restanteSeg = Math.floor((maximoMs_() - (Date.now() - sesion.creada)) / 1000);
    const seg = Math.min(inactividadSeg_(), restanteSeg);
    if (seg < 1) return false;
    CacheService.getScriptCache().put('sesion_' + token, JSON.stringify(sesion), seg);
    return true;
  }

  // Global por ejecución: cada llamada de google.script.run empieza sin marca
  let automatica_ = false;
  /** Esta llamada la hizo un temporizador de la pantalla, no la persona: valida la sesión sin renovarla */
  function automatica() { automatica_ = true; }
  /**
   * Empieza otra llamada dentro de la misma ejecución (apiLote, ClientApi.gs): sin la marca de automática, como si fuera
   * su propia ejecución. Si no, la consulta del vigía dejaría sin renovar la sesión a las demás partes del lote.
   */
  function llamadaNueva() { automatica_ = false; }

  /** Crea el token de sesión a partir de una fila de usuario ya validada (login manual o con Google) */
  function construirSesion_(found) {
    const token = Utilities.getUuid();
    const ahora = Date.now();
    const sesion = {
      correo: found.CORREO,
      nombre: found.NOMBRE,
      rol: mapearRol_(found.ROL),
      departamento: found.AREA || found.COORDINACION || '',
      dptosPermitidos: found['DPTOS PERMITIDOS'] || '',
      v: versionDe_(found.CORREO),
      creada: ahora,
      renovada: ahora,
    };
    guardarSesion_(token, sesion);
    return Object.assign({ token: token }, sesion);
  }

  /**
   * Cierra todas las sesiones de un correo (sube su versión). conservar: el token de quien lo hizo, que sigue
   * trabajando con uno nuevo → regresa esa sesión ({ token, … }, para la pantalla); sin conservar → null.
   */
  function cerrarSesiones(correo, opciones) {
    const o = opciones || {};
    const k = claveVersion_(correo);
    const nueva = versionDe_(correo) + 1;
    PropertiesService.getScriptProperties().setProperty(k, String(nueva));
    CacheService.getScriptCache().put(k, String(nueva), SEG_VERSION_EN_CACHE);
    if (!o.conservar) return null;
    const raw = leerSesion_(o.conservar);
    logout(o.conservar);
    if (!raw) return null;
    const sesion = Object.assign(JSON.parse(raw), { v: nueva, renovada: Date.now() });
    if (!sesion.creada) sesion.creada = Date.now();
    const token = Utilities.getUuid();
    return guardarSesion_(token, sesion) ? Object.assign({ token: token }, sesion) : null;
  }

  // Intentos fallidos por correo (23-oct): con la web app abierta a cualquier cuenta de Google (POST VENTA, de gph), que
  // nadie pruebe contraseñas sin fin. 5 fallos seguidos bloquean ese correo 15 min; entrar bien borra la cuenta.
  const MAX_FALLOS = 5;
  const SEG_BLOQUEO = 15 * 60;
  const claveFallos_ = (correo) => 'login_fallos_' + String(correo || '').trim().toLowerCase();
  function fallosDe_(correo) {
    return Number(CacheService.getScriptCache().get(claveFallos_(correo)) || 0);
  }
  function anotarFallo_(correo) {
    CacheService.getScriptCache().put(claveFallos_(correo), String(fallosDe_(correo) + 1), SEG_BLOQUEO);
  }

  /**
   * Lo que falta antes de la sesión (23-oct). Con una contraseña temporal (DEBE CAMBIAR CONTRASEÑA, la que puso un
   * admin) no hay sesión todavía: se regresa { pendiente: 'cambiar', reto } y la pantalla pide una nueva. El reto vive
   * 10 min en CacheService y solo sirve para ese correo y ese paso.
   */
  const SEG_RETO = 10 * 60;
  function nuevoReto_(datos) {
    const id = Utilities.getUuid();
    CacheService.getScriptCache().put('login_reto_' + id, JSON.stringify(datos), SEG_RETO);
    return id;
  }
  function leerReto_(id, paso) {
    const raw = id ? CacheService.getScriptCache().get('login_reto_' + String(id)) : null;
    const r = raw ? JSON.parse(raw) : null;
    if (!r || r.paso !== paso) throw new Error('Ese paso ya venció. Vuelve a iniciar sesión.');
    return r;
  }
  /**
   * En orden: el código por correo si el dispositivo es nuevo o algo se ve raro (Verificacion.gs), la contraseña nueva
   * si entró con una temporal, y la sesión. verificado: ya pasó el código (no se vuelve a preguntar).
   */
  // La bitácora de entradas (Accesos.gs): nunca truena ni impide entrar
  function anotar_(correo, metodo, resultado, dispositivo) {
    if (typeof Accesos !== 'undefined') Accesos.anotar(correo, metodo, resultado, dispositivo && dispositivo.nombre);
  }

  /**
   * DEBE CAMBIAR CONTRASEÑA: 'TRUE' = la temporal que dio un admin (en persona); 'VIEJA' = su contraseña de antes, que
   * pudo verse en la hoja (Credenciales.pedirCambio, 26-oct): con ella se confirma primero con el código por correo, aunque
   * la verificación esté apagada. Con Google (ya probó que el correo es suyo) cualquiera de las dos pide elegir la nueva.
   */
  function cambioPendiente_(found) {
    const v = String(found['DEBE CAMBIAR CONTRASEÑA'] || '').trim().toUpperCase();
    return v === 'TRUE' ? 'temporal' : v === 'VIEJA' ? 'vieja' : '';
  }

  function continuar_(found, metodo, dispositivo, verificado) {
    const cambio = cambioPendiente_(found);
    if (!verificado) {
      const paso = Verificacion.decidir(found, metodo, dispositivo, { confirmar: metodo === 'contrasena' && cambio === 'vieja' });
      if (paso) return paso;
    }
    if (cambio && (metodo === 'contrasena' || metodo === 'google')) {
      return { pendiente: 'cambiar', reto: nuevoReto_({ correo: found.CORREO, paso: 'cambiar' }), minimo: Credenciales.MINIMO,
        motivo: metodo === 'google' ? 'google' : cambio };
    }
    anotar_(found.CORREO, metodo, 'entro', dispositivo);
    return construirSesion_(found);
  }

  /** La contraseña nueva en lugar de la temporal (o la vieja, o la primera de quien entró con Google); con eso, la sesión */
  function cambiarContrasenaInicial(reto, nueva) {
    const r = leerReto_(reto, 'cambiar');
    const found = buscarUsuarioPorCorreo_(r.correo);
    if (!found || String(found.ACTIVO).toUpperCase() !== 'TRUE') throw new Error('Usuario inactivo, contacta al administrador');
    if (Credenciales.verificar(found, nueva).ok) throw new Error('La contraseña nueva debe ser distinta de la que tenías.');
    Credenciales.revisarNueva(nueva, { correo: found.CORREO, nombre: found.NOMBRE });
    Credenciales.guardar(found.CORREO, nueva, { debeCambiar: false });
    Credenciales.avisar_(found, 'cambiada');
    CacheService.getScriptCache().remove('login_reto_' + String(reto));
    return construirSesion_(found);
  }

  /**
   * El código del correo. Bueno → lo que sigue (contraseña nueva o la sesión), con la llave del dispositivo si se pidió
   * recordarlo: { …, dispositivo: { llave } } (la pantalla la guarda en el navegador; el servidor solo su huella).
   */
  function verificarCodigo(reto, codigo, recordar) {
    const v = Verificacion.verificarCodigo(reto, codigo, recordar);
    const found = buscarUsuarioPorCorreo_(v.correo);
    if (!found || String(found.ACTIVO).toUpperCase() !== 'TRUE') throw new Error('Usuario inactivo, contacta al administrador');
    const siguiente = continuar_(found, v.metodo, null, true);
    return v.llave ? Object.assign({}, siguiente, { dispositivo: { correo: found.CORREO, llave: v.llave } }) : siguiente;
  }

  function login(correo, password, dispositivo) {
    if (fallosDe_(correo) >= MAX_FALLOS) {
      anotar_(correo, 'contrasena', 'bloqueado', dispositivo);
      throw new Error('Demasiados intentos con este correo. Espera 15 minutos o pide a un administrador que revise tu contraseña.');
    }
    const found = buscarUsuarioPorCorreo_(correo);
    // Un correo que no existe cuenta igual que una contraseña mala: el mensaje no dice cuál de las dos fue
    if (!found) { anotarFallo_(correo); anotar_(correo, 'contrasena', 'correo-desconocido', dispositivo); throw new Error('Usuario o contraseña incorrectos'); }
    if (String(found.ACTIVO).toUpperCase() !== 'TRUE') throw new Error('Usuario inactivo, contacta al administrador');
    const revisada = Credenciales.verificar(found, password);
    if (!revisada.ok) { anotarFallo_(correo); anotar_(correo, 'contrasena', 'contrasena-mala', dispositivo); throw new Error('Usuario o contraseña incorrectos'); }
    CacheService.getScriptCache().remove(claveFallos_(correo));
    // Entró con la de texto plano o una huella vieja: se guarda la nueva y se borra CONTRASEÑA. Si escribir falla, entra
    // igual (se intenta otra vez la siguiente)
    if (revisada.migrar) {
      try { Credenciales.guardar(found.CORREO, password); } catch (e) { console.warn('login, pasar a hash: ' + e.message); }
    }
    return continuar_(found, 'contrasena', dispositivo);
  }

  /**
   * Identidad de Google detectada automáticamente (la webapp ya exige estar
   * logueado con una cuenta @ciudadmaderas.com por el acceso restringido a
   * dominio). Se usa para mostrar el botón "Continuar como [nombre]" sin
   * pedir nada más — solo si ese correo existe y está activo en la hoja.
   */
  function identidadGoogle() {
    const correoDetectado = Session.getActiveUser().getEmail();
    if (!correoDetectado) return { coincide: false };

    const found = buscarUsuarioPorCorreo_(correoDetectado);
    if (!found || String(found.ACTIVO).toUpperCase() !== 'TRUE') {
      return { coincide: false, correo: correoDetectado };
    }
    // Bloqueada por seguridad (se sospecha que tomaron su cuenta de Google): sin "Continuar como…"
    if (Credenciales.bloqueado(found)) return { coincide: false, correo: correoDetectado };
    // La foto, solo si ya está guardada (FotosDirectorio.de no llama a Google: la entrada no espera)
    let foto = '';
    try { foto = FotosDirectorio.de(correoDetectado); } catch (e) { /* sin foto: iniciales */ }
    return { coincide: true, correo: correoDetectado, nombre: found.NOMBRE, foto: foto };
  }

  function loginConGoogle(dispositivo) {
    const correoDetectado = Session.getActiveUser().getEmail();
    if (!correoDetectado) throw new Error('No se pudo detectar tu cuenta de Google en esta sesión.');

    const found = buscarUsuarioPorCorreo_(correoDetectado);
    if (!found) throw new Error('Tu cuenta (' + correoDetectado + ') no está registrada en el sistema.');
    if (String(found.ACTIVO).toUpperCase() !== 'TRUE') throw new Error('Usuario inactivo, contacta al administrador');
    if (Credenciales.bloqueado(found)) {
      anotar_(found.CORREO, 'google', 'google-bloqueado', dispositivo);
      throw new Error('Tu cuenta está en revisión de seguridad: entra con tu correo y la contraseña que te dio Control Interno.');
    }

    return continuar_(found, 'google', dispositivo);
  }

  function validarSesion(token) {
    const raw = leerSesion_(token);
    if (!raw) throw new Error('Sesión expirada, inicia sesión de nuevo');
    const sesion = JSON.parse(raw);
    const ahora = Date.now();
    // Las de antes del 23-oct no traen creada ni v: cuentan desde ahora y como versión 0 (nadie sale al desplegar)
    if (sesion.creada && ahora - sesion.creada > maximoMs_()) {
      logout(token);
      throw new Error('Sesión expirada, inicia sesión de nuevo');
    }
    if ((sesion.v || 0) !== versionDe_(sesion.correo)) {
      logout(token);
      throw new Error('Sesión expirada: se cerró desde otro dispositivo o cambió tu contraseña. Inicia sesión de nuevo.');
    }
    if (!automatica_ && (!sesion.renovada || ahora - sesion.renovada > RENOVAR_CADA_MIN * 60000)) {
      sesion.renovada = ahora;
      if (!sesion.creada) sesion.creada = ahora;
      try { guardarSesion_(token, sesion); } catch (e) { /* sin renovar: vence a su hora, no truena la llamada */ }
    }
    // Quién hace lo que siga en esta llamada (la bitácora lo anota)
    if (typeof Bitacora !== 'undefined') Bitacora.sesion(sesion);
    return sesion;
  }

  /**
   * CacheService a veces tarda de más del lado de Google y truena con "error en el servidor al leer desde el
   * almacenamiento… DEADLINE_EXCEEDED" (pasajero). Cada llamada lee la sesión: se reintenta dos veces antes de rendirse,
   * para que una lectura lenta no se vuelva un error en pantalla.
   */
  function leerSesion_(token) {
    for (let intento = 1; ; intento++) {
      try {
        return CacheService.getScriptCache().get('sesion_' + token);
      } catch (e) {
        if (intento >= 3) throw e;
        Utilities.sleep(250 * intento);
      }
    }
  }

  function requiereRol(token, rolesPermitidos) {
    const sesion = validarSesion(token);
    if (rolesPermitidos.indexOf(sesion.rol) === -1) {
      throw new Error('No tienes permisos para realizar esta acción');
    }
    return sesion;
  }

  function logout(token) {
    CacheService.getScriptCache().remove('sesion_' + token);
  }

  return { login, identidadGoogle, loginConGoogle, cambiarContrasenaInicial, verificarCodigo, validarSesion, requiereRol, logout,
    crearHashParaUsuario, cerrarSesiones, automatica, llamadaNueva };
})();

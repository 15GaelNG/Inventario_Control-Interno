
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

  /** Crea el token de sesión a partir de una fila de usuario ya validada (login manual o con Google) */
  function construirSesion_(found) {
    const token = Utilities.getUuid();
    const sesion = {
      correo: found.CORREO,
      nombre: found.NOMBRE,
      rol: mapearRol_(found.ROL),
      departamento: found.AREA || found.COORDINACION || '',
      dptosPermitidos: found['DPTOS PERMITIDOS'] || '',
    };

    CacheService.getScriptCache().put(
      'sesion_' + token,
      JSON.stringify(sesion),
      Config.SESION_DURACION_HORAS * 60 * 60
    );

    return Object.assign({ token: token }, sesion);
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

  function login(correo, password) {
    if (fallosDe_(correo) >= MAX_FALLOS) {
      throw new Error('Demasiados intentos con este correo. Espera 15 minutos o pide a un administrador que revise tu contraseña.');
    }
    const found = buscarUsuarioPorCorreo_(correo);
    // Un correo que no existe cuenta igual que una contraseña mala: el mensaje no dice cuál de las dos fue
    if (!found) { anotarFallo_(correo); throw new Error('Usuario o contraseña incorrectos'); }
    if (String(found.ACTIVO).toUpperCase() !== 'TRUE') throw new Error('Usuario inactivo, contacta al administrador');
    const revisada = Credenciales.verificar(found, password);
    if (!revisada.ok) { anotarFallo_(correo); throw new Error('Usuario o contraseña incorrectos'); }
    CacheService.getScriptCache().remove(claveFallos_(correo));
    // Entró con la de texto plano o una huella vieja: se guarda la nueva y se borra CONTRASEÑA. Si escribir falla, entra
    // igual (se intenta otra vez la siguiente)
    if (revisada.migrar) {
      try { Credenciales.guardar(found.CORREO, password); } catch (e) { console.warn('login, pasar a hash: ' + e.message); }
    }
    return construirSesion_(found);
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
    // La foto, solo si ya está guardada (FotosDirectorio.de no llama a Google: la entrada no espera)
    let foto = '';
    try { foto = FotosDirectorio.de(correoDetectado); } catch (e) { /* sin foto: iniciales */ }
    return { coincide: true, correo: correoDetectado, nombre: found.NOMBRE, foto: foto };
  }

  function loginConGoogle() {
    const correoDetectado = Session.getActiveUser().getEmail();
    if (!correoDetectado) throw new Error('No se pudo detectar tu cuenta de Google en esta sesión.');

    const found = buscarUsuarioPorCorreo_(correoDetectado);
    if (!found) throw new Error('Tu cuenta (' + correoDetectado + ') no está registrada en el sistema.');
    if (String(found.ACTIVO).toUpperCase() !== 'TRUE') throw new Error('Usuario inactivo, contacta al administrador');

    return construirSesion_(found);
  }

  function validarSesion(token) {
    const raw = leerSesion_(token);
    if (!raw) throw new Error('Sesión expirada, inicia sesión de nuevo');
    return JSON.parse(raw);
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

  return { login, identidadGoogle, loginConGoogle, validarSesion, requiereRol, logout, crearHashParaUsuario };
})();

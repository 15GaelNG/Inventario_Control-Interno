
const Auth = (function () {
  const COLUMNAS_USUARIOS = ['CORREO', 'ROL'];

  function hojaUsuarios_() {
    return SheetUtils.getSheetByColumns(Config.SPREADSHEET_IDS.USUARIOS(), COLUMNAS_USUARIOS);
  }

  function hashPassword_(password, salt) {
    const digest = Utilities.computeHmacSha256Signature(password, salt);
    return digest.map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
  }

  /** Se usa una sola vez al crear/resetear un usuario (esquema propio con hash) */
  function crearHashParaUsuario(password) {
    const salt = Utilities.getUuid();
    return { salt: salt, hash: hashPassword_(password, salt) };
  }

  function compararSeguro_(a, b) {
    a = String(a || '');
    b = String(b || '');
    let diferencia = a.length ^ b.length;
    const longitud = Math.max(a.length, b.length);
    for (let i = 0; i < longitud; i++) diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diferencia === 0;
  }

  /** Acepta el esquema nuevo con hash y mantiene compatibilidad con la hoja histórica. */
  function passwordValido_(found, password) {
    if (found.SALT && found.PASSWORD_HASH) {
      return compararSeguro_(hashPassword_(String(password), String(found.SALT)), found.PASSWORD_HASH);
    }
    if (found['CONTRASEÑA'] !== undefined && found['CONTRASEÑA'] !== '') {
      return compararSeguro_(found['CONTRASEÑA'], password);
    }
    return false;
  }

  /** El spreadsheet original solo distingue ADMIN / USER; todo lo que no sea ADMIN opera como OPERADOR */
  function mapearRol_(rolOriginal) {
    return String(rolOriginal || '').toUpperCase() === 'ADMIN' ? Config.ROLES.ADMIN : Config.ROLES.OPERADOR;
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

  function login(correo, password) {
    const found = buscarUsuarioPorCorreo_(correo);
    if (!found) throw new Error('Usuario o contraseña incorrectos');
    if (String(found.ACTIVO).toUpperCase() !== 'TRUE') throw new Error('Usuario inactivo, contacta al administrador');
    if (!passwordValido_(found, password)) throw new Error('Usuario o contraseña incorrectos');
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
    return { coincide: true, correo: correoDetectado, nombre: found.NOMBRE };
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
    const raw = CacheService.getScriptCache().get('sesion_' + token);
    if (!raw) throw new Error('Sesión expirada, inicia sesión de nuevo');
    return JSON.parse(raw);
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

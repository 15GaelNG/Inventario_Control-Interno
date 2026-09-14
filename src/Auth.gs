/**
 * Auth.gs
 * Login propio (correo + contraseña) contra la hoja USUARIOS.
 * Las contraseñas se guardan como hash (SHA-256 + salt por usuario), nunca en texto plano.
 * La sesión se guarda en CacheService con un token, y se manda al cliente en cada
 * llamada de google.script.run para validar rol/permisos.
 */

const Auth = (function () {
  const SHEET_USUARIOS = 'USUARIOS';

  function hashPassword_(password, salt) {
    const digest = Utilities.computeHmacSha256Signature(password, salt);
    return digest.map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
  }

  /** Se usa una sola vez al crear/resetear un usuario */
  function crearHashParaUsuario(password) {
    const salt = Utilities.getUuid();
    return { salt: salt, hash: hashPassword_(password, salt) };
  }

  function login(correo, password) {
    const ssId = Config.SPREADSHEET_IDS.USUARIOS();
    const found = SheetUtils.getAll(ssId, SHEET_USUARIOS)
      .find((u) => String(u.CORREO).toLowerCase() === String(correo).toLowerCase());

    if (!found) throw new Error('Usuario o contraseña incorrectos');
    if (String(found.ACTIVO).toUpperCase() !== 'TRUE') throw new Error('Usuario inactivo, contacta al administrador');

    const hashCalculado = hashPassword_(password, found.SALT);
    if (hashCalculado !== found.PASSWORD_HASH) throw new Error('Usuario o contraseña incorrectos');

    const token = Utilities.getUuid();
    const sesion = {
      correo: found.CORREO,
      nombre: found.NOMBRE,
      rol: found.ROL,
      departamento: found.DEPARTAMENTO,
      dptosPermitidos: found.DPTOS_PERMITIDOS,
    };

    CacheService.getScriptCache().put(
      'sesion_' + token,
      JSON.stringify(sesion),
      Config.SESION_DURACION_HORAS * 60 * 60
    );

    return Object.assign({ token: token }, sesion);
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

  return { login, validarSesion, requiereRol, logout, crearHashParaUsuario };
})();

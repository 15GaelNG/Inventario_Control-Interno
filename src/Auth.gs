/**
 * Auth.gs
 * Login propio (correo + contraseña) contra la hoja de usuarios.
 *
 * IMPORTANTE: por decisión explícita del usuario (2026-09-14), este módulo
 * está conectado al spreadsheet ORIGINAL de AppSheet (en vivo), no a una copia
 * propia. Esa hoja guarda la contraseña en texto plano en la columna
 * CONTRASEÑA — por eso aquí se compara texto plano en vez de hash+salt.
 * hashPassword_/crearHashParaUsuario se dejan por si en el futuro se vuelve
 * a un spreadsheet propio con el esquema hasheado (ver UsuariosService.gs).
 *
 * La sesión se guarda en CacheService con un token, y se manda al cliente en
 * cada llamada de google.script.run para validar rol/permisos.
 */

const Auth = (function () {
  const COLUMNAS_USUARIOS = ['CORREO', 'CONTRASEÑA', 'ROL'];

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

  /** El spreadsheet original solo distingue ADMIN / USER; todo lo que no sea ADMIN opera como OPERADOR */
  function mapearRol_(rolOriginal) {
    return String(rolOriginal || '').toUpperCase() === 'ADMIN' ? Config.ROLES.ADMIN : Config.ROLES.OPERADOR;
  }

  function login(correo, password) {
    const ssId = Config.SPREADSHEET_IDS.USUARIOS();
    const hoja = hojaUsuarios_();
    const found = SheetUtils.getAll(ssId, hoja.getName())
      .find((u) => String(u.CORREO).toLowerCase().trim() === String(correo).toLowerCase().trim());

    if (!found) throw new Error('Usuario o contraseña incorrectos');
    if (String(found.ACTIVO).toUpperCase() !== 'TRUE') throw new Error('Usuario inactivo, contacta al administrador');
    if (String(found['CONTRASEÑA']) !== String(password)) throw new Error('Usuario o contraseña incorrectos');

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

/**
 * UsuariosService.gs
 * Administración de usuarios del sistema (alta, rol, departamento permitido).
 * El login vive en Auth.gs; este Service es para que un ADMIN gestione la
 * tabla de usuarios desde la propia app.
 *
 * Hoja esperada en Config.SPREADSHEET_IDS.USUARIOS():
 *   USUARIOS: ID | CORREO | NOMBRE | SALT | PASSWORD_HASH | ROL | ACTIVO
 *             | DEPARTAMENTO | DPTOS_PERMITIDOS
 */

const UsuariosService = (function () {
  const SHEET_USUARIOS = 'USUARIOS';

  function ssId() {
    return Config.SPREADSHEET_IDS.USUARIOS();
  }

  function listar(token) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    // Nunca regresar SALT/PASSWORD_HASH al cliente
    return SheetUtils.getAll(ssId(), SHEET_USUARIOS)
      .map(({ SALT, PASSWORD_HASH, ...resto }) => resto);
  }

  function crear(token, datos, passwordInicial) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    const credenciales = Auth.crearHashParaUsuario(passwordInicial);
    return SheetUtils.insert(ssId(), SHEET_USUARIOS, Object.assign({}, datos, {
      SALT: credenciales.salt,
      PASSWORD_HASH: credenciales.hash,
      ACTIVO: true,
    }));
  }

  function resetearPassword(token, id, nuevoPassword) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    const credenciales = Auth.crearHashParaUsuario(nuevoPassword);
    return SheetUtils.update(ssId(), SHEET_USUARIOS, id, {
      SALT: credenciales.salt,
      PASSWORD_HASH: credenciales.hash,
    });
  }

  function cambiarEstatus(token, id, activo) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    return SheetUtils.update(ssId(), SHEET_USUARIOS, id, { ACTIVO: activo });
  }

  return { listar, crear, resetearPassword, cambiarEstatus };
})();

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
    Permisos.puedeEditar(token, 'usuarios');
    // Nunca regresar SALT/PASSWORD_HASH al cliente
    return SheetUtils.getAll(ssId(), SHEET_USUARIOS)
      .map(({ SALT, PASSWORD_HASH, ...resto }) => resto);
  }

  function crear(token, datos, passwordInicial) {
    Permisos.puedeEditar(token, 'usuarios');
    const credenciales = Auth.crearHashParaUsuario(passwordInicial);
    return SheetUtils.insert(ssId(), SHEET_USUARIOS, Object.assign({}, datos, {
      SALT: credenciales.salt,
      PASSWORD_HASH: credenciales.hash,
      ACTIVO: true,
    }));
  }

  function resetearPassword(token, id, nuevoPassword) {
    Permisos.puedeEditar(token, 'usuarios');
    const credenciales = Auth.crearHashParaUsuario(nuevoPassword);
    return SheetUtils.update(ssId(), SHEET_USUARIOS, id, {
      SALT: credenciales.salt,
      PASSWORD_HASH: credenciales.hash,
    });
  }

  function cambiarEstatus(token, id, activo) {
    Permisos.puedeEditar(token, 'usuarios');
    return SheetUtils.update(ssId(), SHEET_USUARIOS, id, { ACTIVO: activo });
  }

  /**
   * "Mi perfil" (el usuario al pie del menú): lo de quien entró, sin pedir el permiso de Usuarios.
   * Su renglón de USUARIOS (sin SALT ni PASSWORD_HASH), su empleo en Capital Humano y sus módulos.
   * Capital Humano por correo; por nombre solo si hay una sola persona con ese nombre (nunca se
   * adivina entre homónimos). Sin renglón en CH, ch = null y la pantalla lo dice.
   */
  function miPerfil(token) {
    const sesion = Auth.validarSesion(token);
    const clave = (v) => String(v == null ? '' : v).trim().toLowerCase();
    const correo = clave(sesion.correo);
    const usuario = SheetUtils.getAll(ssId(), SHEET_USUARIOS).find((u) => clave(u.CORREO) === correo) || {};
    let ch = null;
    try {
      const activos = CapitalHumano.activos();
      const porCorreo = activos.filter((c) => clave(c.CORREO) === correo);
      const nombre = CapitalHumano.nombreComparable(sesion.nombre);
      const porNombre = nombre ? activos.filter((c) => CapitalHumano.nombreComparable(c.NOMBRE) === nombre) : [];
      ch = porCorreo[0] || (porNombre.length === 1 ? porNombre[0] : null);
    } catch (e) {
      ch = null;   // sin la lista de CH (un DEV sin cargarla): el perfil sale con lo de la cuenta
    }
    const mios = Permisos.mios(token);
    return {
      correo: sesion.correo,
      nombre: sesion.nombre,
      rol: sesion.rol,
      area: String(usuario.AREA || sesion.departamento || '').trim(),
      activo: String(usuario.ACTIVO).toUpperCase() === 'TRUE',
      ch: ch && {
        idPersona: ch.ID_PERSONA, noEmpleado: ch.NO_EMPLEADO, puesto: ch.PUESTO, departamento: ch.DEPARTAMENTO,
        area: ch.AREA, sede: ch.SEDE, oficina: ch.OFICINA, jefeDirecto: ch.JEFE_DIRECTO,
      },
      grupos: mios.grupos.map((g) => ({
        etiqueta: g.etiqueta, icono: g.icono,
        modulos: g.modulos.map((m) => ({ id: m.id, etiqueta: m.etiqueta, nivel: mios.permisos[m.id] })),
      })),
    };
  }

  return { listar, crear, resetearPassword, cambiarEstatus, miPerfil };
})();

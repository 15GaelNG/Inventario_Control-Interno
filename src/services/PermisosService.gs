/**
 * PermisosService.gs
 * Quién puede entrar a qué módulo y qué puede hacer ahí.
 *
 * Dos niveles y nada más:
 *   LECTURA  — ve el módulo y puede exportar
 *   EDICION  — además captura, corrige y elimina
 * (sin permiso, el módulo no existe para esa persona: ni en el menú ni en el servidor)
 *
 * Dónde vive la configuración: la hoja "PERMISOS" del libro de USUARIOS, un renglón por
 * regla. La hoja USUARIOS no se toca (AppSheet la sigue usando):
 *
 *      QUIEN                  | MODULO       | PERMISO  | NOTA
 *      CI                     | vehiculos    | EDICION  | AppSheet: VEHICULOS
 *      ANALISIS DE DATOS      | verificaciones | LECTURA |
 *      alguien@ciudadmaderas… | arqueos      | NINGUNO  | excepción de una persona
 *
 * QUIEN es un AREA (la columna AREA de USUARIOS) o un correo. Así se resuelve:
 *   1. Inactivo o no registrado: nada.
 *   2. ROL ADMIN: edición en todo. ROL SUPER: edición en todo menos Usuarios y permisos.
 *      Va en código, no en la hoja, para que un error en la hoja no deje fuera a quien la arregla.
 *   3. Las filas de su AREA son la base (si un módulo se repite, gana el nivel más alto).
 *   4. Las filas de su correo reemplazan a la base, módulo por módulo: sirven para dar y
 *      para quitar (NINGUNO).
 *   5. ROL VIEWER: todo se topa en LECTURA.
 *
 * Sin la hoja PERMISOS se usa PERMISOS_SEMILLA (config/PermisosSemilla.gs): las mismas
 * reglas, traducidas de AppSheet. `permisosCrearHoja()` la crea con esa semilla.
 *
 * Los permisos se leen por petición con caché corto: cambiar un permiso aplica en
 * minutos, sin que la persona tenga que cerrar sesión.
 *
 * Cada cambio hecho desde la pantalla deja un renglón en PERMISOS_HISTORIAL (mismo libro):
 * cuándo, quién lo hizo, a quién (área o correo), el módulo y el nivel antes y después.
 * '' en ANTES / DESPUES = sin regla (la persona tiene lo de su área; el área, sin acceso).
 */

const Permisos = (function () {
  const HOJA_PERMISOS = 'PERMISOS';
  const HOJA_USUARIOS = 'USUARIOS';
  const ENCABEZADOS = ['QUIEN', 'MODULO', 'PERMISO', 'NOTA'];
  const SEGUNDOS_CACHE = 300;   // 5 minutos
  const HOJA_HISTORIAL = 'PERMISOS_HISTORIAL';
  const ENCABEZADOS_HISTORIAL = ['FECHA', 'CORREO', 'NOMBRE', 'QUIEN', 'MODULO', 'ANTES', 'DESPUES'];
  /** Lo que la pantalla recibe del historial: los más recientes (la hoja guarda todo) */
  const HISTORIAL_EN_PANTALLA = 1000;

  const NINGUNO = 'NINGUNO';
  const LECTURA = 'LECTURA';
  const EDICION = 'EDICION';
  const NIVEL = { NINGUNO: 0, LECTURA: 1, EDICION: 2 };

  /** Módulo de administración: solo ADMIN */
  const MODULO_USUARIOS = 'usuarios';

  const limpiar_ = (v) => String(v == null ? '' : v).trim();
  const clave_ = (v) => limpiar_(v).toUpperCase();
  /** Para comparar áreas: sin acentos, mayúsculas y un solo espacio ("Análisis  de datos" = "ANALISIS DE DATOS") */
  const area_ = (v) => clave_(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  const esCorreo_ = (quien) => limpiar_(quien).indexOf('@') !== -1;
  /**
   * En la hoja se puede escribir el id ("hologramas") o el nombre del menú
   * ("Control de Cambios - Líneas"); Modulos.resolver los lleva al mismo id.
   * Lo que no corresponda a ningún módulo se conserva tal cual para que
   * revisarCatalogo() lo pueda reportar en vez de tragárselo en silencio.
   */
  const idModulo_ = (v) => Modulos.resolver(v) || limpiar_(v).toLowerCase().replace(/\s+/g, '-');
  const nivelValido_ = (v) => (NIVEL[clave_(v)] === undefined ? null : clave_(v));
  const mayor_ = (a, b) => (NIVEL[a] >= NIVEL[b] ? a : b);
  /** Una regla es la misma si es del mismo área (o correo) y módulo, se escriba como se escriba */
  const llaveRegla_ = (quien, modulo) => (esCorreo_(quien) ? clave_(quien) : area_(quien)) + '|' + idModulo_(modulo);

  function ssId() {
    return Config.SPREADSHEET_IDS.USUARIOS();
  }

  /**
   * Las reglas como [QUIEN, MODULO, PERMISO]: de la hoja PERMISOS, o de la semilla si no existe.
   * Guardadas (CacheHojas) mientras la hoja no cambie: cada llamada de la app revisa permisos y,
   * al vencer los 5 min de deCorreo, leía la hoja entera otra vez. `fresco` (al guardar) lee la
   * hoja sí o sí: lo que se reescribe no puede salir de una copia.
   */
  function reglas_(fresco) {
    if (fresco) return reglasDeLaHoja_();
    return CacheHojas.recordar('permisos_reglas_v1', [[ssId(), HOJA_PERMISOS]], reglasDeLaHoja_);
  }

  function reglasDeLaHoja_() {
    try {
      SheetUtils.getSheet(ssId(), HOJA_PERMISOS);
    } catch (e) {
      // Solo la hoja faltante cae a la semilla; un libro que no abre debe tronar, no esconderse
      if (String(e.message).indexOf('No existe la hoja') === -1) throw e;
      return { fuente: 'semilla', filas: PERMISOS_SEMILLA };
    }
    const filas = SheetUtils.getAll(ssId(), HOJA_PERMISOS)
      .map((f) => [f['QUIEN'], f['MODULO'], f['PERMISO'], f['NOTA']]);
    return { fuente: 'hoja', filas: filas };
  }

  /**
   * Permisos de una persona: { modulo: 'LECTURA' | 'EDICION' }. Función pura respecto a
   * las hojas (recibe ya leídos usuario y reglas) para poder probarla sin Sheets.
   */
  function resolver_(usuario, reglas, modulosConocidos) {
    if (!usuario || clave_(usuario['ACTIVO']) !== 'TRUE') return {};
    const rol = clave_(usuario['ROL']);

    if (rol === 'ADMIN' || rol === 'SUPER') {
      const todo = {};
      (modulosConocidos || []).forEach((m) => { todo[idModulo_(m)] = EDICION; });
      if (rol === 'ADMIN') todo[MODULO_USUARIOS] = EDICION;
      else delete todo[MODULO_USUARIOS];
      return todo;
    }

    const area = area_(usuario['AREA']);
    const correo = clave_(usuario['CORREO']);
    const base = {};
    const propias = {};
    (reglas || []).forEach((r) => {
      const modulo = idModulo_(r[1]);
      const permiso = nivelValido_(r[2]);
      if (!limpiar_(r[0]) || !modulo || !permiso) return;
      if (esCorreo_(r[0])) {
        if (clave_(r[0]) === correo) propias[modulo] = mayor_(permiso, propias[modulo] || NINGUNO);
      } else if (area && area_(r[0]) === area) {
        base[modulo] = mayor_(permiso, base[modulo] || NINGUNO);
      }
    });

    const mapa = Object.assign(base, propias);
    Object.keys(mapa).forEach((modulo) => {
      if (rol === 'VIEWER' && mapa[modulo] === EDICION) mapa[modulo] = LECTURA;
      // NINGUNO no se guarda: un módulo sin permiso simplemente no aparece
      if (mapa[modulo] === NINGUNO) delete mapa[modulo];
    });
    return mapa;
  }

  /**
   * Las personas de USUARIOS, solo con lo que usan los permisos y la pantalla de permisos: sin
   * contraseña, hash ni sal (esto se guarda en CacheService). Guardadas mientras la hoja no
   * cambie; lo que se edite a mano en la hoja se ve a más tardar en 10 min.
   */
  const COLUMNAS_USUARIO = ['CORREO', 'NOMBRE', 'AREA', 'ROL', 'ACTIVO', 'NO_EMPLEADO', 'OFICINA', 'SEDE'];
  function usuarios_() {
    return CacheHojas.recordar('permisos_usuarios_v1', [[ssId(), HOJA_USUARIOS]], () =>
      SheetUtils.getAll(ssId(), HOJA_USUARIOS).map((u) => {
        const r = {};
        COLUMNAS_USUARIO.forEach((c) => { r[c] = u[c] === undefined || u[c] === null ? '' : u[c]; });
        return r;
      }));
  }

  /** Permisos de un correo, con caché corto para no leer las hojas en cada petición */
  function deCorreo(correo, modulosConocidos) {
    const clave = 'permisos_' + clave_(correo);
    const guardado = CacheService.getScriptCache().get(clave);
    if (guardado) {
      try { return JSON.parse(guardado); } catch (e) { /* recargar */ }
    }
    const usuario = usuarios_().find((u) => clave_(u['CORREO']) === clave_(correo));
    const mapa = resolver_(usuario, reglas_().filas, modulosConocidos || Modulos.ids());
    try { CacheService.getScriptCache().put(clave, JSON.stringify(mapa), SEGUNDOS_CACHE); } catch (e) { /* no-op */ }
    return mapa;
  }

  /** Olvida lo cacheado de alguien (al cambiarle permisos, para que aplique de inmediato) */
  function olvidar(correo) {
    CacheService.getScriptCache().remove('permisos_' + clave_(correo));
  }

  /**
   * Exige un permiso. Es la única forma de proteger de verdad: esconder el menú no sirve,
   * porque cualquiera puede llamar al servidor desde la consola del navegador.
   * @return {Object} la sesión, para no tener que validarla dos veces
   */
  function exigir(token, modulo, nivel) {
    const sesion = Auth.validarSesion(token);
    const permisos = deCorreo(sesion.correo);
    const tiene = permisos[idModulo_(modulo)] || NINGUNO;
    if (NIVEL[tiene] < NIVEL[nivelValido_(nivel) || EDICION]) {
      throw new Error(nivel === LECTURA
        ? 'No tienes acceso a este módulo. Pídeselo a quien administra los permisos.'
        : 'Solo puedes consultar este módulo, no modificarlo.');
    }
    return Object.assign({}, sesion, { permisos: permisos });
  }

  /**
   * Una huella corta de los módulos que alguien puede ver: dos personas con la misma huella
   * ven exactamente lo mismo en lo que se arma de varios módulos (el Inicio, la campanita),
   * así que pueden compartir lo ya calculado (CacheHojas.calculo).
   */
  function firmaDeLectura(correo) {
    const texto = Object.keys(deCorreo(correo)).sort().join(',');
    let h = 5381;
    for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /** ¿El error es porque no tiene permiso? (eso no cambia de una vez a otra; un error pasajero sí) */
  const esFaltaDePermiso = (err) => /No tienes acceso a este módulo|Solo puedes consultar este módulo/.test(String((err && err.message) || err));

  const puedeLeer = (token, modulo) => exigir(token, modulo, LECTURA);
  const puedeEditar = (token, modulo) => exigir(token, modulo, EDICION);

  /**
   * Datos de REFERENCIA de un módulo (no su pantalla): los puede leer quien tenga cualquier
   * módulo de su familia (Modulos.familia). P. ej. quien solo tiene Sensores necesita el
   * catálogo de vehículos para elegir la unidad. La pantalla del módulo sigue pidiendo su
   * propio permiso; esto es solo para las lecturas marcadas como referencia.
   */
  function puedeLeerFamilia(token, modulo) {
    return puedeLeerAlguno(token, Modulos.familia(idModulo_(modulo)));
  }

  /** Para datos que comparten varios módulos (el índice de Líneas): basta con ver uno */
  function puedeLeerAlguno(token, modulos) {
    const sesion = Auth.validarSesion(token);
    const permisos = deCorreo(sesion.correo);
    if (!modulos.some((m) => permisos[idModulo_(m)])) {
      throw new Error('No tienes acceso a este módulo. Pídeselo a quien administra los permisos.');
    }
    return Object.assign({}, sesion, { permisos: permisos });
  }

  /** Lo que la app necesita para armar el menú y decidir qué botones mostrar */
  function mios(token) {
    const sesion = Auth.validarSesion(token);
    const permisos = deCorreo(sesion.correo);
    const grupos = Modulos.GRUPOS
      .map((g) => Object.assign({}, g, { modulos: g.modulos.filter((m) => permisos[m.id]) }))
      .filter((g) => g.modulos.length);
    return { correo: sesion.correo, permisos: permisos, grupos: grupos };
  }

  /**
   * Revisa las reglas: un módulo mal escrito, un permiso que no existe o un QUIEN que no es
   * ni un área ni un correo de USUARIOS dejan a alguien sin permiso y nadie se entera.
   * Se corre desde el editor (Diagnóstico) o desde el módulo de Usuarios.
   */
  function revisarCatalogo() {
    const reglas = reglas_();
    const usuarios = usuarios_();
    const areas = new Set(usuarios.map((u) => area_(u['AREA'])).filter(Boolean));
    const correos = new Set(usuarios.map((u) => clave_(u['CORREO'])));
    const problemas = [];
    reglas.filas.forEach((r, i) => {
      const donde = (reglas.fuente === 'hoja' ? 'renglón ' + (i + 2) : 'semilla #' + (i + 1)) + ' (' + limpiar_(r[0]) + ')';
      if (!Modulos.existe(r[1])) problemas.push(donde + ': el módulo "' + limpiar_(r[1]) + '" no existe');
      if (!nivelValido_(r[2])) problemas.push(donde + ': el permiso "' + limpiar_(r[2]) + '" no es LECTURA, EDICION ni NINGUNO');
      if (esCorreo_(r[0]) ? !correos.has(clave_(r[0])) : !areas.has(area_(r[0]))) {
        problemas.push(donde + ': "' + limpiar_(r[0]) + '" no es ' + (esCorreo_(r[0]) ? 'un correo' : 'un AREA') + ' de USUARIOS');
      }
    });
    return {
      fuente: reglas.fuente,
      reglas: reglas.filas.length,
      problemas: problemas,
      mensaje: (reglas.fuente === 'hoja'
        ? 'Hoja PERMISOS: ' : 'No existe la hoja PERMISOS; se usa la semilla del código: ') +
        reglas.filas.length + ' reglas. ' +
        (problemas.length ? problemas.length + ' problema(s):\n  - ' + problemas.join('\n  - ') : 'Sin problemas.'),
    };
  }

  /** Crea la hoja PERMISOS con la semilla. Si ya existe, no la toca. */
  function crearHoja() {
    const ss = SpreadsheetApp.openById(ssId());
    if (ss.getSheetByName(HOJA_PERMISOS)) {
      return 'La hoja PERMISOS ya existe en "' + ss.getName() + '": no se tocó.';
    }
    escribirHoja_(ss.insertSheet(HOJA_PERMISOS), PERMISOS_SEMILLA);
    return 'Hoja PERMISOS creada en "' + ss.getName() + '" con ' + PERMISOS_SEMILLA.length + ' reglas.';
  }

  /** Reemplaza el contenido de la hoja PERMISOS por estas reglas ([QUIEN, MODULO, PERMISO, NOTA]) */
  function escribirHoja_(hoja, reglas) {
    const filas = [ENCABEZADOS].concat(reglas.map((r) => [0, 1, 2, 3].map((i) => (r[i] == null ? '' : r[i]))));
    hoja.clearContents();
    hoja.getRange(1, 1, filas.length, ENCABEZADOS.length).setValues(filas);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight('bold');
    CacheHojas.tocarHoja(hoja);   // las reglas guardadas (reglas_) se vuelven a leer ya
  }

  // ------------------------------------------------------------ pantalla de administración

  /**
   * Todo lo que necesita la pantalla "Usuarios y permisos": el catálogo de módulos (sin
   * Usuarios y permisos, que es de ADMIN por código), las áreas y personas de USUARIOS, y las
   * reglas. Solo ADMIN. Las contraseñas no salen de aquí.
   */
  function panel(token) {
    puedeEditar(token, MODULO_USUARIOS);
    const usuarios = usuarios_();
    const porArea = {};
    usuarios.forEach((u) => {
      const a = limpiar_(u['AREA']);
      if (a) porArea[area_(a)] = porArea[area_(a)] || { nombre: a, personas: 0 };
      if (a && clave_(u['ACTIVO']) === 'TRUE') porArea[area_(a)].personas++;
    });
    const reglas = reglas_();
    return {
      fuente: reglas.fuente,
      grupos: Modulos.GRUPOS.map((g) => ({
        id: g.id, etiqueta: g.etiqueta, icono: g.icono,
        // referencia / editaEn: lo que el permiso implica fuera de su pantalla (Modulos.gs)
        modulos: g.modulos.filter((m) => m.id !== MODULO_USUARIOS)
          .map((m) => ({ id: m.id, etiqueta: m.etiqueta, icono: m.icono || '', referencia: m.referencia || '', editaEn: m.editaEn || [] })),
      })).filter((g) => g.modulos.length),
      areas: Object.keys(porArea).sort().map((k) => porArea[k]),
      // Campo por campo, a propósito: CONTRASEÑA (y SALT/PASSWORD_HASH) nunca salen de aquí
      personas: usuarios.filter((u) => limpiar_(u['CORREO'])).map((u) => ({
        correo: limpiar_(u['CORREO']), nombre: limpiar_(u['NOMBRE']).replace(/\s+/g, ' '), area: limpiar_(u['AREA']),
        rol: clave_(u['ROL']) || 'USER', activo: clave_(u['ACTIVO']) === 'TRUE',
        noEmpleado: limpiar_(u['NO_EMPLEADO']), oficina: limpiar_(u['OFICINA']), sede: limpiar_(u['SEDE']),
        coordinacion: limpiar_(u['COORDINACION']), dptosPermitidos: limpiar_(u['DPTOS PERMITIDOS']),
      })),
      reglas: reglas.filas
        .filter((r) => limpiar_(r[0]) && nivelValido_(r[2]))
        .map((r) => ({ quien: limpiar_(r[0]), modulo: idModulo_(r[1]), permiso: nivelValido_(r[2]), nota: limpiar_(r[3]) })),
      historial: historial_(),
    };
  }

  /**
   * Aplica cambios a las reglas, sin tocar Sheets (para poder probarlo). Cada cambio es
   * { quien, modulo, permiso }: permiso null borra la regla (la persona vuelve a lo de su área;
   * el área, a no tener acceso). Para un área, NINGUNO también la borra: es lo mismo que no
   * tener regla, y así la hoja no se llena de renglones que no dicen nada.
   */
  function aplicarCambios_(reglas, cambios, nota) {
    const resultado = reglas.map((r) => r.slice(0, 4));
    cambios.forEach((c) => {
      const k = llaveRegla_(c.quien, c.modulo);
      for (let i = resultado.length - 1; i >= 0; i--) {
        if (llaveRegla_(resultado[i][0], resultado[i][1]) === k) resultado.splice(i, 1);
      }
      const permiso = c.permiso == null ? null : nivelValido_(c.permiso);
      if (!permiso || (permiso === NINGUNO && !esCorreo_(c.quien))) return;
      resultado.push([limpiar_(c.quien), idModulo_(c.modulo), permiso, nota]);
    });
    return resultado;
  }

  /**
   * Lo que cambia de verdad con estos cambios, regla por regla (sin tocar Sheets, para probarlo):
   * [{ quien, modulo, antes, despues }] con '' = sin regla. Un cambio que deja lo mismo no cuenta.
   */
  function diferencias_(reglas, cambios) {
    /** El nivel de esa regla en estas reglas ('' sin regla; NINGUNO de un área es lo mismo) */
    const nivelEn = (lista, quien, modulo) => {
      const k = llaveRegla_(quien, modulo);
      const nivel = lista.reduce((n, r) => {
        const p = nivelValido_(r[2]);
        return p && llaveRegla_(r[0], r[1]) === k ? (n ? mayor_(p, n) : p) : n;
      }, '');
      return nivel === NINGUNO && !esCorreo_(quien) ? '' : nivel;
    };
    const nuevas = aplicarCambios_(reglas, cambios, '');
    const vistas = {};
    return cambios
      .filter((c) => !vistas[llaveRegla_(c.quien, c.modulo)] && (vistas[llaveRegla_(c.quien, c.modulo)] = true))
      .map((c) => ({
        quien: limpiar_(c.quien), modulo: idModulo_(c.modulo),
        antes: nivelEn(reglas, c.quien, c.modulo), despues: nivelEn(nuevas, c.quien, c.modulo),
      }))
      .filter((d) => d.antes !== d.despues);
  }

  /** Agrega los cambios al final de PERMISOS_HISTORIAL (la crea si falta) */
  function anotarHistorial_(ss, sesion, difs) {
    if (!difs.length) return;
    let hoja = ss.getSheetByName(HOJA_HISTORIAL);
    if (!hoja) {
      hoja = ss.insertSheet(HOJA_HISTORIAL);
      hoja.getRange(1, 1, 1, ENCABEZADOS_HISTORIAL.length).setValues([ENCABEZADOS_HISTORIAL]).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    const ahora = new Date();
    const filas = difs.map((d) => [ahora, sesion.correo || '', sesion.nombre || '', d.quien, d.modulo, d.antes, d.despues]);
    hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, ENCABEZADOS_HISTORIAL.length).setValues(filas);
    CacheHojas.tocarHoja(hoja);
  }

  /** Los cambios más recientes primero, para la pantalla ([] si la hoja aún no existe) */
  function historial_() {
    return CacheHojas.recordar('permisos_historial_v1', [[ssId(), HOJA_HISTORIAL]], () => {
      try {
        SheetUtils.getSheet(ssId(), HOJA_HISTORIAL);
      } catch (e) {
        if (String(e.message).indexOf('No existe la hoja') === -1) throw e;
        return [];
      }
      return SheetUtils.getAll(ssId(), HOJA_HISTORIAL).slice(-HISTORIAL_EN_PANTALLA).reverse().map((f) => ({
        fecha: HojaServicio.fechaISO(f['FECHA']), correo: limpiar_(f['CORREO']), nombre: limpiar_(f['NOMBRE']),
        quien: limpiar_(f['QUIEN']), modulo: idModulo_(f['MODULO']), antes: nivelValido_(f['ANTES']) || '', despues: nivelValido_(f['DESPUES']) || '',
      }));
    });
  }

  /** Guarda los cambios de la pantalla en la hoja PERMISOS (la crea con la semilla si falta) */
  function guardar(token, cambios) {
    const sesion = puedeEditar(token, MODULO_USUARIOS);
    if (!Array.isArray(cambios) || !cambios.length) throw new Error('No hay cambios que guardar.');
    const usuarios = usuarios_();
    const areas = new Set(usuarios.map((u) => area_(u['AREA'])).filter(Boolean));
    const correos = new Set(usuarios.map((u) => clave_(u['CORREO'])));
    cambios.forEach((c) => {
      if (!Modulos.existe(c.modulo) || idModulo_(c.modulo) === MODULO_USUARIOS) {
        throw new Error('El módulo "' + c.modulo + '" no se puede asignar.');
      }
      if (c.permiso != null && !nivelValido_(c.permiso)) throw new Error('Permiso inválido: ' + c.permiso);
      if (esCorreo_(c.quien) ? !correos.has(clave_(c.quien)) : !areas.has(area_(c.quien))) {
        throw new Error('"' + c.quien + '" no es un área ni un correo de USUARIOS.');
      }
    });

    const candado = LockService.getScriptLock();
    candado.waitLock(20000);
    try {
      // Primero las reglas vigentes: si la hoja no existe son las de la semilla, y se crea con ellas
      const vigentes = reglas_(true).filas;
      const ss = SpreadsheetApp.openById(ssId());
      const hoja = ss.getSheetByName(HOJA_PERMISOS) || ss.insertSheet(HOJA_PERMISOS);
      const nota = 'Cambiado por ' + (sesion.nombre || sesion.correo) + ' el ' +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
      escribirHoja_(hoja, aplicarCambios_(vigentes, cambios, nota));
      anotarHistorial_(ss, sesion, diferencias_(vigentes, cambios));
      SpreadsheetApp.flush();
    } finally {
      candado.releaseLock();
    }
    // Que el cambio aplique ya, no en 5 minutos
    CacheService.getScriptCache().removeAll(usuarios.map((u) => 'permisos_' + clave_(u['CORREO'])));
    return panel(token);
  }

  return {
    LECTURA, EDICION, NINGUNO, MODULO_USUARIOS,
    deCorreo, olvidar, exigir, puedeLeer, puedeEditar, puedeLeerAlguno, puedeLeerFamilia, mios, revisarCatalogo, crearHoja,
    firmaDeLectura, esFaltaDePermiso,
    panel, guardar,
    resolver_, aplicarCambios_, diferencias_,   // expuestas para las pruebas
  };
})();

/**
 * Crea la hoja PERMISOS en el libro de USUARIOS, con la traducción de AppSheet
 * (config/PermisosSemilla.gs). Correr desde el editor: no hace nada si ya existe.
 */
function permisosCrearHoja() {
  soloEditor_();
  const mensaje = Permisos.crearHoja();
  Logger.log(mensaje);
  return mensaje;
}

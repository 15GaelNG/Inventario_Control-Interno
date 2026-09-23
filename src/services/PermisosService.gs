/**
 * PermisosService.gs
 * Quién puede entrar a qué módulo y qué puede hacer ahí.
 *
 * Dos niveles y nada más:
 *   LECTURA  — ve el módulo y puede exportar
 *   EDICION  — además captura, corrige y elimina
 * (sin permiso, el módulo no existe para esa persona: ni en el menú ni en el servidor)
 *
 * Dónde vive la configuración (hoja de USUARIOS, la misma que ya usa AppSheet):
 *
 *   Hoja "PERFILES" — qué toca cada perfil, un renglón por módulo:
 *      PERFIL              | MODULO                | PERMISO
 *      Control vehicular   | vehiculos             | EDICION
 *      Control vehicular   | hologramas            | LECTURA
 *      Auditorías          | vehiculos             | LECTURA
 *
 *   Hoja "USUARIOS" — dos columnas:
 *      PERFILES        "Control vehicular, Auditorías"   ← lo normal
 *      PERMISOS EXTRA  "caja-chica:LECTURA, uber:NINGUNO" ← excepciones de UNA persona
 *
 * Por qué perfiles y no una matriz de usuarios × módulos: con 51 personas y 18 módulos,
 * la matriz son ~900 celdas que hay que mantener a mano; los perfiles son unas 60 filas
 * y dar de alta a alguien es escribir su perfil, no 18 celdas.
 *
 * Solo hay dos roles en la hoja de usuarios:
 *   ADMIN — entra a TODO, sin perfiles (son los dos o tres que administran el sistema)
 *   USER  — solo lo que digan sus perfiles
 *
 * Reglas:
 * - Si la persona tiene varios perfiles, gana el permiso MÁS ALTO de todos.
 * - PERMISOS EXTRA gana siempre sobre los perfiles (sirve para dar y para quitar).
 * - Mientras no exista la hoja PERFILES, se usa el ROL viejo (ADMIN/SUPER = edición en
 *   todo, USER = edición, VIEWER = lectura). Así nada se rompe durante la migración.
 * - Los permisos se leen por petición con caché corto: cambiar un permiso aplica en
 *   minutos, sin que la persona tenga que cerrar sesión.
 */

const Permisos = (function () {
  const HOJA_PERFILES = 'PERFILES';
  const COL_PERFILES = 'PERFILES';
  const COL_EXTRA = 'PERMISOS EXTRA';
  const SEGUNDOS_CACHE = 300;   // 5 minutos

  const NINGUNO = 'NINGUNO';
  const LECTURA = 'LECTURA';
  const EDICION = 'EDICION';
  const NIVEL = { NINGUNO: 0, LECTURA: 1, EDICION: 2 };

  /** Módulo de administración: solo quien administra usuarios y permisos */
  const MODULO_USUARIOS = 'usuarios';

  const limpiar_ = (v) => String(v == null ? '' : v).trim();
  const clave_ = (v) => limpiar_(v).toUpperCase();
  /**
   * En la hoja se puede escribir el id ("hologramas") o el nombre del menú
   * ("Control de Reasignaciones - Líneas"); Modulos.resolver los lleva al mismo id.
   * Lo que no corresponda a ningún módulo se conserva tal cual para que
   * revisarCatalogo() lo pueda reportar en vez de tragárselo en silencio.
   */
  const idModulo_ = (v) => Modulos.resolver(v) || limpiar_(v).toLowerCase().replace(/\s+/g, '-');
  const nivelValido_ = (v) => (NIVEL[clave_(v)] === undefined ? null : clave_(v));
  const mayor_ = (a, b) => (NIVEL[a] >= NIVEL[b] ? a : b);
  const lista_ = (texto) => limpiar_(texto).split(',').map(limpiar_).filter(Boolean);

  function ssId() {
    return Config.SPREADSHEET_IDS.USUARIOS();
  }

  /** Perfiles declarados: { 'control vehicular': { vehiculos: 'EDICION', … } } o null si no hay hoja */
  function perfiles_() {
    let hoja;
    try {
      hoja = SheetUtils.getSheet(ssId(), HOJA_PERFILES);
    } catch (e) {
      return null;   // todavía no existe: se usa el ROL viejo
    }
    const mapa = {};
    SheetUtils.getAll(ssId(), hoja.getName()).forEach((fila) => {
      const perfil = clave_(fila['PERFIL']);
      const modulo = idModulo_(fila['MODULO']);
      const permiso = nivelValido_(fila['PERMISO']);
      if (!perfil || !modulo || !permiso) return;
      if (!mapa[perfil]) mapa[perfil] = {};
      mapa[perfil][modulo] = mayor_(permiso, mapa[perfil][modulo] || NINGUNO);
    });
    return mapa;
  }

  /** "caja-chica:LECTURA, uber:NINGUNO" → { 'caja-chica': 'LECTURA', uber: 'NINGUNO' } */
  function extras_(texto) {
    const mapa = {};
    lista_(texto).forEach((par) => {
      const partes = par.split(':');
      const modulo = idModulo_(partes[0]);
      const permiso = nivelValido_(partes[1]);
      if (modulo && permiso) mapa[modulo] = permiso;
    });
    return mapa;
  }

  /** Solo hay dos roles: ADMIN (todo) y USER (lo que digan sus perfiles). SUPER es ADMIN por herencia. */
  const esAdmin_ = (rol) => clave_(rol) === 'ADMIN' || clave_(rol) === 'SUPER';

  /** Compatibilidad mientras no exista la hoja PERFILES */
  function porRolViejo_(rol, modulos) {
    const permiso = { USER: EDICION, VIEWER: LECTURA }[clave_(rol)] || LECTURA;
    const mapa = {};
    (modulos || []).forEach((m) => { mapa[idModulo_(m)] = permiso; });
    return mapa;
  }

  /**
   * Permisos de una persona: { modulo: 'LECTURA' | 'EDICION' }. Función pura respecto a
   * las hojas (recibe ya leídos usuario y perfiles) para poder probarla sin Sheets.
   */
  function resolver_(usuario, perfilesDeclarados, modulosConocidos) {
    if (!usuario || clave_(usuario['ACTIVO']) !== 'TRUE') return {};

    // ADMIN entra a todo, sin perfiles de por medio: son los dos o tres que administran
    // el sistema, y andarles dando módulo por módulo solo sería trabajo extra.
    if (esAdmin_(usuario['ROL'])) {
      const todo = {};
      (modulosConocidos || []).forEach((m) => { todo[idModulo_(m)] = EDICION; });
      todo[MODULO_USUARIOS] = EDICION;
      return todo;
    }

    const mapa = perfilesDeclarados === null
      ? porRolViejo_(usuario['ROL'], modulosConocidos)
      : (() => {
        const acumulado = {};
        lista_(usuario[COL_PERFILES]).forEach((nombre) => {
          const perfil = perfilesDeclarados[clave_(nombre)];
          if (!perfil) return;
          Object.keys(perfil).forEach((modulo) => {
            acumulado[modulo] = mayor_(perfil[modulo], acumulado[modulo] || NINGUNO);
          });
        });
        return acumulado;
      })();

    // Las excepciones de la persona ganan sobre sus perfiles (sirven para dar y para quitar)
    const excepciones = extras_(usuario[COL_EXTRA]);
    Object.keys(excepciones).forEach((modulo) => { mapa[modulo] = excepciones[modulo]; });

    // NINGUNO no se guarda: un módulo sin permiso simplemente no aparece
    Object.keys(mapa).forEach((modulo) => { if (mapa[modulo] === NINGUNO) delete mapa[modulo]; });
    return mapa;
  }

  /** Permisos de un correo, con caché corto para no leer las hojas en cada petición */
  function deCorreo(correo, modulosConocidos) {
    const clave = 'permisos_' + clave_(correo);
    const guardado = CacheService.getScriptCache().get(clave);
    if (guardado) {
      try { return JSON.parse(guardado); } catch (e) { /* recargar */ }
    }
    const usuario = SheetUtils.getAll(ssId(), SheetUtils.getSheetByColumns(ssId(), ['CORREO', 'ROL']).getName())
      .find((u) => clave_(u['CORREO']) === clave_(correo));
    const mapa = resolver_(usuario, perfiles_(), modulosConocidos || Modulos.ids());
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

  const puedeLeer = (token, modulo) => exigir(token, modulo, LECTURA);
  const puedeEditar = (token, modulo) => exigir(token, modulo, EDICION);

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
   * Revisa que la hoja PERFILES no tenga módulos mal escritos. Sin esto, un "Vehiculos"
   * en vez de "vehiculos" deja a alguien sin permiso y nadie se entera.
   * Se corre desde el editor o desde el módulo de Usuarios.
   */
  function revisarCatalogo() {
    const declarados = perfiles_();
    if (declarados === null) return { hoja: false, mensaje: 'Todavía no existe la hoja PERFILES: se está usando el ROL viejo.' };
    const desconocidos = [];
    Object.keys(declarados).forEach((perfil) => {
      Object.keys(declarados[perfil]).forEach((modulo) => {
        if (!Modulos.existe(modulo)) desconocidos.push({ perfil: perfil, modulo: modulo });
      });
    });
    return {
      hoja: true,
      perfiles: Object.keys(declarados).length,
      desconocidos: desconocidos,
      mensaje: desconocidos.length
        ? 'Hay ' + desconocidos.length + ' módulo(s) que no existen en el catálogo: ' +
          desconocidos.map((d) => d.modulo + ' (perfil ' + d.perfil + ')').join(', ')
        : 'Todos los módulos de la hoja PERFILES existen en el catálogo.',
    };
  }

  return {
    LECTURA, EDICION, NINGUNO, MODULO_USUARIOS,
    deCorreo, olvidar, exigir, puedeLeer, puedeEditar, mios, revisarCatalogo,
    resolver_, extras_,   // expuestas para las pruebas
  };
})();

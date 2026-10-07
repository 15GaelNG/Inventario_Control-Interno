/**
 * HojaServicio.gs
 * Lo que repetían todos los servicios de una hoja: listar con caché, completo, buscar por ID,
 * crear, actualizar y eliminar, con el permiso del módulo revisado siempre en el servidor.
 * Cada servicio declara su hoja en un objeto (solo datos y funciones propias) y llama aquí:
 *
 *   const TICKETS = {
 *     modulo: 'tickets', nombre: 'el ticket',
 *     libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
 *     hoja: 'TICKETS',
 *     columnas: ['ID', 'TICKET', 'FECHA', …],
 *     orden: { campo: 'FECHA', desc: true },
 *     fechas: ['FECHA'],
 *     obligatorios: { 'TIPO ATENCION': 'El tipo de atención es obligatorio' },
 *     alCrear: () => ({ 'FECHA DE REGISTRO': new Date() }),
 *     noEditables: ['FECHA DE REGISTRO'],
 *   };
 *   …
 *   return {
 *     listarResumen: (token) => HojaServicio.listar(TICKETS, token),
 *     crear: (token, datos) => HojaServicio.crear(TICKETS, token, datos),
 *     …
 *   };
 *
 * Por qué funciones que reciben la definición y no un objeto armado al cargar: Apps Script no
 * garantiza en qué orden carga los archivos, y un servicio que llamara HojaServicio mientras se
 * carga podía encontrarlo sin definir (y tirar TODA la app). Así nada corre hasta que se usa.
 * Por lo mismo, la definición no llama a HojaServicio fuera de una función (el orden es un
 * objeto, no HojaServicio.algo('FECHA')). tests/hoja-servicio.test.js lo revisa.
 *
 * ---------------------------------------------------------------------- la definición
 * De la hoja
 *   modulo       id de Modulos.gs: su permiso se revisa en cada llamada (Permisos)
 *   nombre       cómo se nombra un registro en los errores ("el ticket"); por omisión "el registro"
 *   libro        () => id del spreadsheet
 *   hoja         nombre real de la pestaña (también es la llave de la caché)
 *   huella       opcional: columnas que identifican la pestaña, si se busca por ellas
 *                (SheetUtils.getSheetByColumns) en vez de por nombre
 *   id           columna llave; por omisión 'ID'
 * Al leer (listar)
 *   columnas     leer solo estas (más rápido); sin esto se lee la hoja entera
 *   fila(r, preparado)  renglón → objeto de la lista; por omisión el renglón con las fechas en ISO
 *   preparar()   lo que fila() necesita una sola vez por lista (un índice de otra hoja…); si lee
 *                otra hoja, ponla en tambienLee
 *   incluir(r)   qué renglones cuentan; por omisión los que tienen id
 *   referencia   true: es un catálogo que toda la familia del módulo necesita para trabajar (el
 *                básico de vehículos, la lista de cajas): listar / listarPor / buscarPorId
 *                los lee quien tenga cualquier módulo de la familia, no solo este
 *   orden        { campo, desc } (como texto; las fechas ya van en ISO), { campo, numero: true },
 *                o una función (a, b) => …
 *   ultimosPrimero  el orden de la hoja al revés (bitácoras que solo crecen)
 *   maximo       cuántos regresa como mucho
 *   tambienLee   otras hojas del mismo libro que usa fila(): si cambian, la caché se rehace
 *                (la llave de la caché sale de la definición: dos listas distintas de la misma
 *                hoja no se pisan)
 * Al escribir (crear / actualizar)
 *   campos       { CLAVE_QUE_MANDA_EL_CLIENTE: 'COLUMNA' }: solo eso se acepta, ya traducido
 *   fechas       columnas que llegan como texto ("yyyy-MM-dd" = medianoche local) y se guardan
 *                como fecha
 *   obligatorios { COLUMNA: 'mensaje' } al crear
 *   noEditables  columnas que no se cambian al actualizar (el id nunca)
 *   deOtroModulo { modulo: ['COLUMNA', …] }: columnas que son de otro módulo (p. ej. la sección
 *                de sensor en Vehículos). Solo las cambia quien tiene EDICION en ese módulo; a
 *                quien no, se le ignoran al crear y al actualizar. Es el espejo de editaModulo
 *                en CamposHoja (la pantalla las bloquea; esto es por si llegan de la consola).
 *   archivos     { COLUMNA: 'ETIQUETA' }: el cliente manda '<COLUMNA>_FILE_ID' del archivo que
 *                ya subió, y aquí se renombra a "<id>_<ETIQUETA>_<fecha>.ext" al guardar
 *   candadoAlCrear  crear bajo el candado del script (consecutivos calculados aquí)
 *   alCrear(fila, ctx) / alActualizar(cambios, ctx)
 *                lo propio del módulo: regresan columnas a poner encima (o cambian el objeto).
 *                ctx = { token, sesion, hoja, datos, id, actual, opciones }
 *   despues(registro, ctx)  después de guardar, fuera del candado (PDF, propagar, bitácora);
 *                ctx.accion = 'crear' | 'actualizar'
 *   despuesDeEliminar(registros, ctx)  con los renglones como estaban antes de borrarse
 *
 * Borrar: si Relaciones protege la hoja (alguien más apunta a sus registros), se borra por
 * Relaciones.borrar, que se niega y explica por qué; si no, SheetUtils.removeMany.
 */

const HojaServicio = (function () {
  const ZONA_HORARIA = () => Session.getScriptTimeZone();

  // ------------------------------------------------------------------ valores

  /**
   * Fecha de la hoja → texto ISO ('' si no es fecha). google.script.run pierde arreglos que
   * traen Date crudos, por eso todo sale como texto. Acepta Date, "dd/mm/yyyy[ hh:mm[:ss]]"
   * (como AppSheet deja algunas celdas) y cualquier texto que Date entienda.
   */
  function fechaISO(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    if (valor instanceof Date) return isNaN(valor.getTime()) ? '' : valor.toISOString();
    const texto = String(valor).trim();
    const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    const f = m
      ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
      : new Date(texto);
    return isNaN(f.getTime()) ? '' : f.toISOString();
  }

  /**
   * Texto que manda el formulario → Date para la hoja. "yyyy-MM-dd" (input type=date) es
   * medianoche en la zona del script: new Date('yyyy-MM-dd') lo leería en UTC y en México
   * caería a las 18:00 del día anterior. Vacío → ''.
   */
  function fechaDeEntrada(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    if (valor instanceof Date) return valor;
    const texto = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return Utilities.parseDate(texto, ZONA_HORARIA(), 'yyyy-MM-dd');
    const f = new Date(texto);
    if (isNaN(f.getTime())) throw new Error('La fecha "' + texto + '" no es válida');
    return f;
  }

  /** Como fechaDeEntrada, pero obligatoria y solo "yyyy-MM-dd" (los campos de fecha sola) */
  function fechaObligatoria(texto, nombreCampo) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto || ''))) throw new Error('Falta o es inválida la ' + nombreCampo);
    return Utilities.parseDate(texto, ZONA_HORARIA(), 'yyyy-MM-dd');
  }

  /** El renglón con las fechas como texto ISO (lo que puede viajar al navegador) */
  function sinFechas(registro) {
    const limpio = {};
    Object.keys(registro || {}).forEach((k) => {
      const v = registro[k];
      limpio[k] = v instanceof Date ? v.toISOString() : v;
    });
    return limpio;
  }

  // ------------------------------------------------------------------ orden

  /**
   * El comparador de def.orden. Se declara como datos para que la definición no llame nada
   * al cargarse: { campo, desc } compara como texto (las fechas ya van en ISO, así que el
   * texto ordena bien; las vacías quedan al final en desc), { campo, numero: true } como número.
   * También acepta una función (a, b) => …
   */
  function comparador_(orden) {
    if (typeof orden === 'function') return orden;
    const campo = orden.campo;
    if (orden.numero) return (a, b) => (Number(a[campo]) - Number(b[campo])) * (orden.desc ? -1 : 1);
    const texto = (v) => String(v === undefined || v === null ? '' : v);
    return orden.desc
      ? (a, b) => texto(b[campo]).localeCompare(texto(a[campo]))
      : (a, b) => texto(a[campo]).localeCompare(texto(b[campo]));
  }

  // ------------------------------------------------------------------ la hoja

  const libro = (def) => def.libro();
  const columnaId = (def) => def.id || 'ID';
  const nombre = (def) => def.nombre || 'el registro';

  /** La pestaña (Sheet). Por nombre, o por su huella de columnas si la definición la trae */
  function hoja(def) {
    return def.huella
      ? SheetUtils.getSheetByColumns(libro(def), def.huella)
      : SheetUtils.getSheet(libro(def), def.hoja);
  }

  /** Nombre real de la pestaña, para SheetUtils (con huella puede ser otro que def.hoja) */
  const nombreHoja = (def) => (def.huella ? hoja(def).getName() : def.hoja);

  /** Los renglones como objetos {columna: valor}: las columnas pedidas, o todas */
  function renglones_(def) {
    if (!def.columnas) return SheetUtils.getAll(libro(def), nombreHoja(def));
    const { filas, datos } = SheetUtils.leerColumnas(hoja(def), def.columnas);
    const resultado = [];
    for (let i = 0; i < filas; i++) {
      const r = {};
      // Una columna que no está en la hoja llega vacía, no undefined (que el JSON se come)
      def.columnas.forEach((c) => { r[c] = datos[c][i] === undefined ? '' : datos[c][i]; });
      resultado.push(r);
    }
    return resultado;
  }

  /** Lo que regresa listar(), sin caché ni permiso. `prueba` filtra antes de cortar en maximo */
  function armarLista_(def, prueba, maximo) {
    const incluir = def.incluir || ((r) => !!r[columnaId(def)]);
    const preparado = def.preparar ? def.preparar() : undefined;
    const aFila = def.fila ? (r) => def.fila(r, preparado) : sinFechas;
    let filas = renglones_(def);
    if (def.ultimosPrimero) filas.reverse();
    const lista = [];
    const tope = maximo || Infinity;
    for (let i = 0; i < filas.length && lista.length < tope; i++) {
      if (!incluir(filas[i])) continue;
      const fila = aFila(filas[i]);
      if (prueba && !prueba(fila)) continue;
      lista.push(fila);
    }
    return def.orden ? lista.sort(comparador_(def.orden)) : lista;
  }

  // ------------------------------------------------------------------ leer

  /** La lista del módulo, guardada mientras la hoja (y las de tambienLee) no cambie */
  /**
   * Leer: con el permiso del módulo; una lista de referencia (def.referencia) con el de
   * cualquier módulo de su familia (Permisos.puedeLeerFamilia). Exportar (completo) siempre
   * pide el del módulo.
   */
  function leer_(def, token) {
    return def.referencia ? Permisos.puedeLeerFamilia(token, def.modulo) : Permisos.puedeLeer(token, def.modulo);
  }

  function listar(def, token) {
    leer_(def, token);
    return listaGuardada_(def);
  }

  function listaGuardada_(def, rehacer) {
    const hojas = [def.hoja].concat(def.tambienLee || []).map((h) => [libro(def), h]);
    return CacheHojas.recordar(claveCache_(def), hojas, () => armarLista_(def, null, def.maximo),
      rehacer ? SEG_CALIENTE : undefined, rehacer);
  }

  /**
   * La vuelve a armar desde la hoja y la deja guardada, sin permiso (no hay persona: lo corre
   * el activador de Calentador.gs). Así nadie espera a que se lea la hoja: lo que se escribió
   * fuera de la app (AppSheet, a mano) se recoge aquí cada vuelta del activador.
   */
  const SEG_CALIENTE = 25 * 60;   // más que la vuelta del activador (10 min): nunca queda un hueco
  function calentar(def) {
    listaGuardada_(def, true);
  }

  /**
   * La llave de la caché sale de cómo se arma la lista (columnas, fila, orden…): dos
   * definiciones de la misma hoja que la arman distinto (el catálogo básico y el resumen de
   * Vehículos) nunca comparten lo guardado, sin que nadie tenga que inventarles un nombre.
   */
  function claveCache_(def) {
    const forma = [def.columnas, def.orden, def.maximo, def.ultimosPrimero, def.tambienLee]
      .map((v) => JSON.stringify(v === undefined ? null : v))
      .concat([def.fila, def.incluir, def.preparar, typeof def.orden === 'function' ? def.orden : null].map(String))
      .join('|');
    let h = 5381;
    for (let i = 0; i < forma.length; i++) h = ((h * 33) ^ forma.charCodeAt(i)) >>> 0;
    return 'hs_' + def.hoja + '_' + h.toString(36);
  }

  /**
   * Los de la lista cuyo `campo` (ya como sale de fila()) vale `valor`: la ficha de un
   * vehículo, de una caja… Si la lista está cortada (maximo), se busca en toda la hoja.
   */
  function listarPor(def, token, campo, valor, opciones) {
    leer_(def, token);
    if (!valor) return [];
    const tope = (opciones && opciones.maximo) || 0;
    const coincide = (f) => String(f[campo] === undefined ? '' : f[campo]) === String(valor);
    if (def.maximo) return armarLista_(def, coincide, tope);
    const lista = listaGuardada_(def).filter(coincide);
    return tope ? lista.slice(0, tope) : lista;
  }

  /** Todas las columnas de todos los renglones (exportar / "Vista"), sin caché */
  function completo(def, token) {
    Permisos.puedeLeer(token, def.modulo);
    return SheetUtils.getAll(libro(def), nombreHoja(def));
  }

  /** El renglón completo (todas las columnas, fechas en ISO), o null */
  function buscarPorId(def, token, id) {
    leer_(def, token);
    const encontrado = SheetUtils.findById(libro(def), nombreHoja(def), id, columnaId(def));
    return encontrado ? sinFechas(encontrado.data) : null;
  }

  // ------------------------------------------------------------------ escribir

  /** Lo que mandó el cliente, ya como columnas: traducido (campos) y sin los _FILE_ID */
  function entrada_(def, datos) {
    const fila = {};
    if (def.campos) {
      Object.keys(def.campos).forEach((clave) => {
        if (datos[clave] !== undefined) fila[def.campos[clave]] = datos[clave];
      });
    } else {
      Object.assign(fila, datos);
    }
    const archivos = {};
    Object.keys(def.archivos || {}).forEach((columna) => {
      const clave = columna + '_FILE_ID';
      if (datos[clave]) archivos[columna] = datos[clave];
      delete fila[clave];
    });
    (def.fechas || []).forEach((c) => { if (fila[c] !== undefined) fila[c] = fechaDeEntrada(fila[c]); });
    return { fila: fila, archivos: archivos };
  }

  /** Lo que regresa un gancho (alCrear/alActualizar) se pone encima */
  function aplicar_(gancho, objeto, ctx) {
    if (!gancho) return;
    const extra = gancho(objeto, ctx);
    if (extra && typeof extra === 'object') Object.assign(objeto, extra);
  }

  /** Lo que ve el cliente después de guardar: el renglón como en la lista, con su ID */
  const respuesta_ = (def, registro, id) => Object.assign({},
    def.fila ? def.fila(registro, def.preparar ? def.preparar() : undefined) : sinFechas(registro), { ID: id });

  function renombrarArchivos_(def, archivos, id) {
    Object.keys(archivos).forEach((columna) => renombrarArchivo(archivos[columna], id, def.archivos[columna]));
  }

  /** Lo de def.deOtroModulo que esta persona no puede editar (no tiene EDICION en ese módulo) */
  function quitarDeOtroModulo_(def, datos, sesion) {
    const permisos = (sesion && sesion.permisos) || {};
    Object.keys(def.deOtroModulo || {}).forEach((modulo) => {
      if (permisos[modulo] === Permisos.EDICION) return;
      def.deOtroModulo[modulo].forEach((c) => { delete datos[c]; });
    });
  }

  function crear(def, token, datos) {
    const sesion = Permisos.puedeEditar(token, def.modulo);
    const { fila, archivos } = entrada_(def, datos || {});
    quitarDeOtroModulo_(def, fila, sesion);
    Object.keys(def.obligatorios || {}).forEach((columna) => {
      if (fila[columna] === undefined || fila[columna] === null || String(fila[columna]).trim() === '') {
        throw new Error(def.obligatorios[columna]);
      }
    });

    const ctx = { token: token, sesion: sesion, datos: datos || {}, accion: 'crear' };
    const lock = def.candadoAlCrear ? LockService.getScriptLock() : null;
    if (lock) lock.waitLock(30000);
    try {
      ctx.hoja = hoja(def);
      aplicar_(def.alCrear, fila, ctx);
      // El id lo pone SheetUtils.insert con el formato del sistema si el gancho no lo puso
      SheetUtils.insert(libro(def), ctx.hoja.getName(), fila);
    } finally {
      if (lock) lock.releaseLock();
    }
    const id = fila[columnaId(def)];
    renombrarArchivos_(def, archivos, id);
    if (def.despues) def.despues(fila, ctx);
    return respuesta_(def, fila, id);
  }

  function actualizar(def, token, id, cambios, opciones) {
    const sesion = Permisos.puedeEditar(token, def.modulo);
    const { fila: datos, archivos } = entrada_(def, cambios || {});
    delete datos[columnaId(def)];
    (def.noEditables || []).forEach((c) => { delete datos[c]; });
    quitarDeOtroModulo_(def, datos, sesion);

    const nombreReal = nombreHoja(def);
    // El renglón de antes solo se lee si un gancho lo usa: SheetUtils.update ya lo busca y
    // truena si no existe, y cada búsqueda es leer la hoja entera
    let actual = null;
    if (def.alActualizar || def.despues) {
      const encontrado = SheetUtils.findById(libro(def), nombreReal, id, columnaId(def));
      if (!encontrado) throw new Error('No se encontró ' + nombre(def) + ' con ' + columnaId(def) + '=' + id);
      actual = encontrado.data;
    }
    const ctx = {
      token: token, sesion: sesion, datos: cambios || {}, id: id, actual: actual,
      opciones: opciones || {}, accion: 'actualizar',
    };
    aplicar_(def.alActualizar, datos, ctx);

    const registro = SheetUtils.update(libro(def), nombreReal, id, datos, columnaId(def));
    renombrarArchivos_(def, archivos, id);
    if (def.despues) def.despues(registro, Object.assign(ctx, { cambios: datos }));
    return respuesta_(def, registro, id);
  }

  /**
   * Un id → { ID } (y truena si no existía). Varios → { eliminadas: n }.
   * Si Relaciones protege la hoja, se niega a borrar lo que tenga registros que dependan de él.
   */
  function eliminar(def, token, idOIds) {
    Permisos.puedeEditar(token, def.modulo);
    const varios = Array.isArray(idOIds);
    const ids = varios ? idOIds : [idOIds];
    if (!ids.length || ids.some((x) => x === undefined || x === null || x === '')) {
      throw new Error('No se indicaron registros a eliminar');
    }
    const nombreReal = nombreHoja(def);
    const antes = def.despuesDeEliminar
      ? ids.map((x) => SheetUtils.findById(libro(def), nombreReal, x, columnaId(def))).filter(Boolean).map((f) => f.data)
      : null;

    const eliminadas = Relaciones.protegeBorrado(def.hoja)
      ? Relaciones.borrar(def.hoja, ids).eliminadas
      : SheetUtils.removeMany(libro(def), nombreReal, ids, columnaId(def));

    if (antes) def.despuesDeEliminar(antes, { token: token });
    if (varios) return { eliminadas: eliminadas };
    if (!eliminadas) throw new Error('No se encontró ' + nombre(def) + ' con ' + columnaId(def) + '=' + idOIds);
    return { ID: idOIds };
  }

  // ------------------------------------------------------------------ archivos en Drive

  /**
   * Renombra en Drive un archivo recién subido a "<id>_<etiqueta>_<fecha>.ext" (conserva la
   * extensión). Regresa el nombre nuevo, o null si no se pudo: no bloquea el guardado, el
   * archivo ya quedó en Drive con el nombre que traía.
   */
  function renombrarArchivo(fileId, id, etiqueta) {
    if (!fileId || !id) return null;
    try {
      const archivo = DriveApp.getFileById(fileId);
      const extension = (archivo.getName().match(/\.[^.]+$/) || [''])[0];
      const fecha = Utilities.formatDate(new Date(), ZONA_HORARIA(), 'yyyy-MM-dd');
      const nuevo = id + '_' + etiqueta + '_' + fecha + extension;
      archivo.setName(nuevo);
      return nuevo;
    } catch (e) {
      console.warn('No se pudo renombrar el archivo ' + fileId + ' (' + etiqueta + '): ' + e.message);
      return null;
    }
  }

  /**
   * Igual, para los archivos que la hoja guarda como ruta de AppSheet ("CARPETA/archivo.ext"):
   * regresa la ruta con el nombre nuevo, o la misma si no se pudo renombrar.
   */
  function renombrarRuta(fileId, id, etiqueta, ruta) {
    const nuevo = renombrarArchivo(fileId, id, etiqueta);
    return nuevo ? String(ruta).split('/')[0] + '/' + nuevo : ruta;
  }

  const TAMANO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  /**
   * Sube un archivo (base64) a una carpeta de Drive y regresa { url, id, nombre }.
   * `deQue` completa los mensajes de error: "de solicitudes de Uber", "de adjuntos de Vehículos".
   */
  function subirArchivo(carpetaId, deQue, nombreArchivo, mimeType, base64Data) {
    if (!base64Data) throw new Error('No se recibió ningún archivo.');
    const bytes = Utilities.base64Decode(base64Data);
    if (bytes.length > TAMANO_MAX_BYTES) throw new Error('El archivo pesa más de 10 MB — súbelo más ligero.');

    const blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', nombreArchivo || 'archivo');
    // El "Acceso denegado" de Drive no dice qué cuenta ni en qué paso falló: aquí sí
    const cuenta = () => Session.getEffectiveUser().getEmail();
    let carpeta, archivo;
    try {
      carpeta = DriveApp.getFolderById(carpetaId);
    } catch (e) {
      throw new Error('No se pudo abrir la carpeta ' + deQue + ' en Drive. La cuenta con la que ' +
        'corre la app ahora mismo (' + cuenta() + ') no tiene acceso a esa carpeta.');
    }
    try {
      archivo = DriveUtils.marcarAutor(carpeta.createFile(blob));
    } catch (e) {
      throw new Error('Se pudo abrir la carpeta ' + deQue + ', pero no crear el archivo ahí. La cuenta ' +
        cuenta() + ' necesita permiso de editor (no solo lector) en esa carpeta. Error original: ' + e.message);
    }
    // Mejor esfuerzo: la carpeta ya tiene acceso general y casi siempre lo hereda. Si una
    // política de Workspace bloquea el compartir explícito, no vale la pena tronar el registro.
    if (!DriveUtils.compartirLoMasAmplioPosible(archivo)) {
      console.warn('No se pudo compartir explícitamente el archivo (cuenta ' + cuenta() +
        '); se deja como quedó por default de la carpeta ' + deQue + '. Archivo: ' + archivo.getUrl());
    }
    return { url: archivo.getUrl(), id: archivo.getId(), nombre: nombreArchivo };
  }

  return {
    // leer y escribir
    listar, listarPor, completo, buscarPorId, crear, actualizar, eliminar, calentar,
    // la hoja, para lo propio de cada servicio
    hoja, libro, nombreHoja,
    // valores
    fechaISO, fechaDeEntrada, fechaObligatoria, sinFechas,
    // archivos
    renombrarArchivo, renombrarRuta, subirArchivo,
  };
})();

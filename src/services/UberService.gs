/**
 * UberService.gs
 * Catálogo de usuarios autorizados para usar Uber (viáticos). Vive en el
 * mismo spreadsheet original de AppSheet que Vehículos/Incidencias.
 *
 * Columnas reales (15): ID | RAZON SOCIAL | NOMBRE COMPLETO |
 *   ESTAUS USUARIO | ROL | FECHA DE ALTA | CORREO ELECTRONICO |
 *   NUMERO TELEFONO | SEDE | OFICINA/DESARROLLO | DEPARTAMENTO | PUESTO |
 *   SOLICITUD | DIAS AUTORIZADOS | HORARIO AUTORIZADO
 *
 * (Sí, "ESTAUS" es un typo real de la hoja original — se respeta tal cual,
 * es el nombre exacto de la columna.)
 */

const UberService = (function () {
  // Las 15 columnas reales completas: el catálogo no es grande, así que el panel de detalle
  // no necesita un segundo viaje.
  const COLUMNAS_LISTA = [
    'ID', 'RAZON SOCIAL', 'NOMBRE COMPLETO', 'ESTAUS USUARIO', 'ROL', 'FECHA DE ALTA',
    'CORREO ELECTRONICO', 'NUMERO TELEFONO', 'SEDE', 'OFICINA/DESARROLLO', 'DEPARTAMENTO',
    'PUESTO', 'SOLICITUD', 'DIAS AUTORIZADOS', 'HORARIO AUTORIZADO',
  ];

  // Carpeta de Drive para el archivo de "Solicitud" (distinta a la de Vehículos): UBER_Files_ en
  // la raíz de la app (DriveUtils.carpetaEnRaiz). No se cambia la seguridad del archivo: hereda
  // los permisos que ya tenga esa carpeta compartida.
  const CARPETA_SOLICITUDES = 'UBER_Files_';

  /** La hoja, para HojaServicio */
  const UBER = {
    modulo: 'uber',
    nombre: 'el usuario',
    libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    // Ojo: no confundir con la pestaña "UBER JUANITO", que es otra cosa con otras columnas
    hoja: 'UBER',
    // ID PERSONA de quien se capturó, calculado de su nombre (CapitalHumano.LIGAS)
    persona: true,
    columnas: COLUMNAS_LISTA,
    fila: (r) => {
      const fila = { NOMBRE_COMPLETO: r['NOMBRE COMPLETO'] || '', RAZON_SOCIAL: r['RAZON SOCIAL'] || '', ESTATUS: r['ESTAUS USUARIO'] || '' };
      COLUMNAS_LISTA.forEach((c) => { fila[c] = r[c] instanceof Date ? r[c].toISOString() : r[c]; });
      return fila;
    },
    orden: { campo: 'NOMBRE_COMPLETO' },
    obligatorios: { 'NOMBRE COMPLETO': 'El nombre completo es obligatorio' },
    // El archivo ya subido se renombra a "<ID>_SOLICITUD_<fecha>.ext" al guardar
    archivos: { 'SOLICITUD': 'SOLICITUD' },
    // FECHA DE ALTA siempre es "hoy": no la manda el cliente ni se edita
    alCrear: () => ({ 'FECHA DE ALTA': new Date() }),
    noEditables: ['FECHA DE ALTA'],
  };

  // Hoja aparte (mismo libro) donde se anota, sin tocar nunca "ESTAUS USUARIO", a quién se le
  // detectó ACTIVO en Uber pero ya no activo en Capital Humano. El usuario pidió explícitamente
  // (23-oct-2026) que esto NUNCA cambie el estatus solo -- que se quede como una etiqueta aparte
  // para que alguien lo revise y decida. La hoja se crea sola la primera vez (como
  // PERMISOS_HISTORIAL en PermisosService.gs).
  const HOJA_DETECCION = 'UBER BAJAS DETECTADAS';
  const ENCABEZADOS_DETECCION = ['ID', 'NOMBRE COMPLETO', 'FECHA DETECCION'];
  // A la semana de detectado, la etiqueta se deja de mostrar sola (pedido del usuario): no se
  // vuelve a poner para el mismo caso -- el renglón no se borra al expirar, solo deja de contar
  // como vigente (ver advertenciasPendientes_). Si se borrara, el siguiente paso del Calentador
  // la volvería a crear de inmediato con fecha de hoy, y nunca se iría.
  const DIAS_ETIQUETA = 7;
  const ETIQUETA_ADVERTENCIA = 'Baja, quitar de Uber';

  function hojaDeteccion_() {
    const ss = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.VEHICULOS());
    let hoja = ss.getSheetByName(HOJA_DETECCION);
    if (!hoja) {
      hoja = ss.insertSheet(HOJA_DETECCION);
      hoja.getRange(1, 1, 1, ENCABEZADOS_DETECCION.length).setValues([ENCABEZADOS_DETECCION]).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    return hoja;
  }

  /**
   * YA NO pone BAJA sola (así era antes) -- el usuario pidió que jamás se toque el estatus
   * automáticamente. Ahora solo detecta a quién le toca la etiqueta "Baja, quitar de Uber" y la
   * anota en HOJA_DETECCION; alguien la revisa y decide a mano si lo pasa a BAJA de verdad.
   *
   * Candidato: sigue ACTIVO en Uber pero ya no está activo en Capital Humano
   * (CapitalHumano.activos()). Compara por nombre con CapitalHumano.nombreComparable (el mismo
   * criterio tolerante a acentos/títulos que usa el resto del sistema para identificar
   * personas), no por ID -- Uber no tiene columna de persona ligada.
   *
   * A propósito NO toca BAJA (ya está) ni PENDIENTE (alguien lo dejó así aposta, a la espera de
   * revisar su solicitud -- no es a este activador a quien le toca decidir eso). Solo ACTIVO.
   *
   * Si alguien deja de ser candidato (Capital Humano lo reactivó, o alguien ya cambió su
   * ESTAUS USUARIO a mano) se quita su renglón de HOJA_DETECCION -- así, si vuelve a irse más
   * adelante, es un caso nuevo con fecha nueva, no el aviso viejo reviviendo.
   *
   * Sin sesión (lo corre el Calentador cada 10 min, pasosCalentador_() en Calentador.gs) --
   * mismo criterio que el resto de lo automático sin persona detrás (completarFirmaArqueo).
   * Regresa cuántos renglones tocó (para el registro del calentador).
   */
  function detectarBajasPendientes() {
    hojaDeteccion_();
    const activos = new Set(CapitalHumano.activos().map((c) => CapitalHumano.nombreComparable(c.NOMBRE)));
    const filasUber = SheetUtils.getAll(Config.SPREADSHEET_IDS.VEHICULOS(), 'UBER');
    const candidatos = {};
    filasUber
      .filter((f) => String(f['ESTAUS USUARIO'] || '').toUpperCase() === 'ACTIVO')
      .forEach((f) => {
        const nombre = CapitalHumano.nombreComparable(f['NOMBRE COMPLETO'] || '');
        if (nombre && !activos.has(nombre)) candidatos[f['ID']] = f['NOMBRE COMPLETO'] || '';
      });

    const existentes = SheetUtils.getAll(Config.SPREADSHEET_IDS.VEHICULOS(), HOJA_DETECCION);
    const yaTiene = {};
    existentes.forEach((f) => { yaTiene[f['ID']] = true; });

    const aQuitar = existentes.filter((f) => !candidatos[f['ID']]).map((f) => f['ID']);
    const aAgregar = Object.keys(candidatos).filter((id) => !yaTiene[id]);

    let cambios = 0;
    if (aQuitar.length) {
      cambios += SheetUtils.removeMany(Config.SPREADSHEET_IDS.VEHICULOS(), HOJA_DETECCION, aQuitar, 'ID');
    }
    const hoy = new Date();
    aAgregar.forEach((id) => {
      SheetUtils.insert(Config.SPREADSHEET_IDS.VEHICULOS(), HOJA_DETECCION, { ID: id, 'NOMBRE COMPLETO': candidatos[id], 'FECHA DETECCION': hoy });
      cambios++;
    });
    return cambios;
  }

  /** IDs de Uber con la etiqueta todavía vigente (detectados hace menos de DIAS_ETIQUETA días) */
  function advertenciasVigentes_() {
    let filas;
    try {
      filas = SheetUtils.getAll(Config.SPREADSHEET_IDS.VEHICULOS(), HOJA_DETECCION);
    } catch (e) {
      if (String(e.message).indexOf('No existe la hoja') === -1) throw e;
      return {};
    }
    const limite = Date.now() - DIAS_ETIQUETA * 24 * 60 * 60 * 1000;
    const vigentes = {};
    filas.forEach((f) => {
      const fecha = f['FECHA DETECCION'] instanceof Date ? f['FECHA DETECCION'] : new Date(f['FECHA DETECCION']);
      if (fecha.getTime() > limite) vigentes[f['ID']] = true;
    });
    return vigentes;
  }

  /** Agrega ADVERTENCIA = 'Baja, quitar de Uber' (o '') a cada fila, sin tocar nada más */
  function conAdvertencias_(filas) {
    const vigentes = advertenciasVigentes_();
    filas.forEach((f) => { f.ADVERTENCIA = vigentes[f.ID] ? ETIQUETA_ADVERTENCIA : ''; });
    return filas;
  }

  return {
    /** Catálogo con las 15 columnas reales (nombres tal cual la hoja) */
    listarResumen: (token) => conAdvertencias_(HojaServicio.listar(UBER, token)),
    /** Para el activador (Calentador.gs): la deja armada sin esperar a nadie */
    calentar: () => HojaServicio.calentar(UBER),
    detectarBajasPendientes,
    /** Todas las columnas de TODOS los usuarios (para "Vista": mostrar/exportar cualquier columna) */
    completo: (token) => conAdvertencias_(HojaServicio.completo(UBER, token)),
    calentarCompleto: () => HojaServicio.calentarCompleto(UBER),
    buscarPorId: (token, id) => HojaServicio.buscarPorId(UBER, token, id),
    crear: (token, datos) => HojaServicio.crear(UBER, token, datos),
    actualizar: (token, id, cambios) => HojaServicio.actualizar(UBER, token, id, cambios),
    eliminar: (token, id) => HojaServicio.eliminar(UBER, token, id),
    /** Sube la solicitud (PDF/imagen) en base64 a su carpeta y regresa su URL */
    subirArchivo(token, nombreArchivo, mimeType, base64Data) {
      Permisos.puedeEditar(token, 'uber');
      return HojaServicio.subirArchivo(DriveUtils.carpetaEnRaiz(CARPETA_SOLICITUDES).getId(), 'de solicitudes de Uber', nombreArchivo, mimeType, base64Data);
    },
  };
})();

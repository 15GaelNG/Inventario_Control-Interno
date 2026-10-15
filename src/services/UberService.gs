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

  /**
   * Pone en BAJA automático a quien sigue ACTIVO en Uber pero ya no está activo en Capital
   * Humano (CapitalHumano.activos(), lo mismo que ya usa el resto de la app para saber quién
   * sigue aquí) -- así nadie tiene que acordarse de entrar a Uber y darlo de baja a mano cuando
   * alguien deja la empresa. Compara por nombre con CapitalHumano.nombreComparable (el mismo
   * criterio tolerante a acentos/títulos que usa el resto del sistema para identificar
   * personas), no por ID -- Uber no tiene columna de persona ligada.
   *
   * A propósito NO toca BAJA (ya está) ni PENDIENTE (alguien lo dejó así aposta, a la espera de
   * revisar su solicitud -- no es a este activador a quien le toca decidir eso). Solo ACTIVO.
   *
   * Sin sesión (lo corre el Calentador cada 10 min, pasosCalentador_() en Calentador.gs) --
   * mismo criterio que el resto de lo automático sin persona detrás (completarFirmaArqueo).
   * Junta todos los cambios y los manda con SheetUtils.updateMany en una sola pasada (no uno
   * por uno con SheetUtils.update): la primera vez que corrió este sincronizador encontró de
   * jalón a todo el atraso de quien había dejado la empresa sin darse de baja en Uber, y un
   * update() por renglón tardó casi un minuto -- updateMany lee y escribe la hoja una sola vez
   * sin importar cuántos renglones cambien.
   * Regresa cuántos renglones cambió (para el registro del calentador).
   */
  function sincronizarBajas() {
    const activos = new Set(CapitalHumano.activos().map((c) => CapitalHumano.nombreComparable(c.NOMBRE)));
    const filas = SheetUtils.getAll(Config.SPREADSHEET_IDS.VEHICULOS(), 'UBER');
    const porBajar = filas
      .filter((f) => String(f['ESTAUS USUARIO'] || '').toUpperCase() === 'ACTIVO')
      .filter((f) => {
        const nombre = CapitalHumano.nombreComparable(f['NOMBRE COMPLETO'] || '');
        return nombre && !activos.has(nombre);
      })
      .map((f) => ({ id: f['ID'], changes: { 'ESTAUS USUARIO': 'BAJA' } }));
    if (!porBajar.length) return 0;
    return SheetUtils.updateMany(Config.SPREADSHEET_IDS.VEHICULOS(), 'UBER', porBajar, 'ID');
  }

  return {
    /** Catálogo con las 15 columnas reales (nombres tal cual la hoja) */
    listarResumen: (token) => HojaServicio.listar(UBER, token),
    /** Para el activador (Calentador.gs): la deja armada sin esperar a nadie */
    calentar: () => HojaServicio.calentar(UBER),
    sincronizarBajas,
    /** Todas las columnas de TODOS los usuarios (para "Vista": mostrar/exportar cualquier columna) */
    completo: (token) => HojaServicio.completo(UBER, token),
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

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

  // Carpeta de Drive para el archivo de "Solicitud" (distinta a la de Vehículos). No se cambia
  // la seguridad del archivo: hereda los permisos que ya tenga esa carpeta compartida.
  const CARPETA_SOLICITUDES_ID = '14TxSIYntjxGCEKN8yMDKJ4oGobmUT8At';

  /** La hoja, para HojaServicio */
  const UBER = {
    modulo: 'uber',
    nombre: 'el usuario',
    libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    // Ojo: no confundir con la pestaña "UBER JUANITO", que es otra cosa con otras columnas
    hoja: 'UBER',
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

  return {
    /** Catálogo con las 15 columnas reales (nombres tal cual la hoja) */
    listarResumen: (token) => HojaServicio.listar(UBER, token),
    /** Todas las columnas de TODOS los usuarios (para "Vista": mostrar/exportar cualquier columna) */
    completo: (token) => HojaServicio.completo(UBER, token),
    buscarPorId: (token, id) => HojaServicio.buscarPorId(UBER, token, id),
    crear: (token, datos) => HojaServicio.crear(UBER, token, datos),
    actualizar: (token, id, cambios) => HojaServicio.actualizar(UBER, token, id, cambios),
    eliminar: (token, id) => HojaServicio.eliminar(UBER, token, id),
    /** Sube la solicitud (PDF/imagen) en base64 a su carpeta y regresa su URL */
    subirArchivo(token, nombreArchivo, mimeType, base64Data) {
      Permisos.puedeEditar(token, 'uber');
      return HojaServicio.subirArchivo(CARPETA_SOLICITUDES_ID, 'de solicitudes de Uber', nombreArchivo, mimeType, base64Data);
    },
  };
})();

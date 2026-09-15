/**
 * VehiculosService.gs
 * Módulo de vehículos: alta, reasignación, verificaciones, servicios e inspección
 * con checklist de daños (diagrama + firma). Pendiente de finalizar esquema de columnas
 * (ver mapeo de tablas originales del AppSheet en /docs/mapeo-modulos.md).
 *
 * Hojas previstas en Config.SPREADSHEET_IDS.VEHICULOS():
 *   VEHICULOS          — catálogo de unidades
 *   REASIGNACIONES     — historial de cambio de responsable
 *   VERIFICACIONES     — verificación vehicular periódica
 *   SERVICIOS          — mantenimiento (aceite, llantas, etc.)
 *   INSPECCIONES       — checklist de daños + referencia a imagen anotada (ver PdfService)
 */

const VehiculosService = (function () {
  const SHEET_VEHICULOS = 'VEHICULOS';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function listar(token) {
    Auth.validarSesion(token);
    return SheetUtils.getAll(ssId(), SHEET_VEHICULOS);
  }

  /**
   * Catálogo ligero (FOLIO + datos clave) para autocompletar otros módulos
   * que referencian un vehículo por folio (ej. Incidencias). Excluye
   * vehículos dados de baja. MODELO en esta hoja es el año del vehículo,
   * no el nombre del modelo (ese es LINEA VEHICULO).
   */
  function listarBasico(token) {
    Auth.validarSesion(token);
    return SheetUtils.getAll(ssId(), SHEET_VEHICULOS)
      .filter((v) => v['FOLIO'] && String(v['ESTATUS'] || '').toUpperCase() !== 'BAJA VEHICULAR')
      .map((v) => ({
        FOLIO: v['FOLIO'],
        DEPARTAMENTO: v['DEPARTAMENTO'] || '',
        MARCA: v['MARCA'] || '',
        LINEA_VEHICULO: v['LINEA VEHICULO'] || '',
        MODELO: v['MODELO'] || '',
      }))
      .sort((a, b) => String(a.FOLIO).localeCompare(String(b.FOLIO)));
  }

  /**
   * Regresa el registro completo de un vehículo (todas sus columnas) por
   * FOLIO, o null. Optimizado: en vez de leer las 648 filas x 41 columnas
   * completas (SheetUtils.getAll) solo para buscar una, primero lee nada
   * más la columna FOLIO para ubicar el renglón, y luego lee solo esa fila.
   */
  function buscarPorFolio(token, folio) {
    Auth.validarSesion(token);
    if (!folio) return null;

    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const folioCol = headers.indexOf('FOLIO');
    if (folioCol === -1) return null;

    const folios = sheet.getRange(2, folioCol + 1, lastRow - 1, 1).getValues();
    let rowIndex = -1;
    for (let i = 0; i < folios.length; i++) {
      if (String(folios[i][0]) === String(folio)) {
        rowIndex = i + 2;
        break;
      }
    }
    if (rowIndex === -1) return null;

    const fila = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    const limpio = {};
    headers.forEach((h, i) => {
      const valor = fila[i];
      // google.script.run puede fallar con Date crudo — se manda como texto ISO.
      limpio[h] = valor instanceof Date ? valor.toISOString() : valor;
    });
    return limpio;
  }

  function crear(token, vehiculo) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    return SheetUtils.insert(ssId(), SHEET_VEHICULOS, vehiculo);
  }

  function actualizar(token, id, cambios) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    return SheetUtils.update(ssId(), SHEET_VEHICULOS, id, cambios);
  }

  // TODO: reasignarResponsable, registrarVerificacion, registrarServicio,
  //       guardarInspeccion (usa PdfService.generarReporteDanios)

  return { listar, listarBasico, buscarPorFolio, crear, actualizar };
})();

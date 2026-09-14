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

  return { listar, listarBasico, crear, actualizar };
})();

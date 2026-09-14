/**
 * CajaChicaService.gs
 * Módulo de caja chica: cuentas por responsable, arqueos (conteo de efectivo)
 * y auditorías. Pendiente de finalizar esquema de columnas.
 *
 * Hojas previstas en Config.SPREADSHEET_IDS.CAJACHICA():
 *   CUENTAS   — una por responsable/departamento
 *   ARQUEOS   — conteo periódico de efectivo + auditoría
 */

const CajaChicaService = (function () {
  const SHEET_CUENTAS = 'CUENTAS';

  function ssId() {
    return Config.SPREADSHEET_IDS.CAJACHICA();
  }

  function listarCuentas(token) {
    Auth.validarSesion(token);
    return SheetUtils.getAll(ssId(), SHEET_CUENTAS);
  }

  // TODO: crearCuenta, registrarArqueo, listarArqueos, registrarAuditoria

  return { listarCuentas };
})();

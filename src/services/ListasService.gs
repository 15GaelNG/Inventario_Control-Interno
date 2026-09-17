/**
 * ListasService.gs
 * Listas de referencia/catálogo compartidas entre módulos (ej. el catálogo
 * real de departamentos de la empresa) — viven en la pestaña "LISTAS
 * VEHICULOS" del mismo spreadsheet original de AppSheet. Solo lectura.
 */

const ListasService = (function () {
  const SHEET_LISTAS = 'LISTAS VEHICULOS';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  /** Valores únicos, no vacíos y ordenados de una columna de "LISTAS VEHICULOS". */
  function listarColumna_(nombreColumna) {
    const sheet = SheetUtils.getSheet(ssId(), SHEET_LISTAS);
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, [nombreColumna]);
    const valores = new Set();
    for (let i = 0; i < filas; i++) {
      const v = datos[nombreColumna][i];
      if (v) valores.add(String(v).trim());
    }
    return Array.from(valores).sort((a, b) => a.localeCompare(b));
  }

  function listarDepartamentos(token) {
    Auth.validarSesion(token);
    return listarColumna_('DEPARTAMENTO');
  }

  function listarRazonesSociales(token) {
    Auth.validarSesion(token);
    return listarColumna_('RAZON SOCIAL');
  }

  function listarSedes(token) {
    Auth.validarSesion(token);
    return listarColumna_('SEDE');
  }

  function listarOficinasDesarrollo(token) {
    Auth.validarSesion(token);
    return listarColumna_('OFICINA/DESARROLLO');
  }

  return { listarDepartamentos, listarRazonesSociales, listarSedes, listarOficinasDesarrollo };
})();

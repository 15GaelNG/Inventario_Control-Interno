/**
 * ListasService.gs
 * Listas de referencia/catálogo compartidas entre módulos — viven en hojas
 * de solo-lectura del mismo spreadsheet original de AppSheet. Hay más de
 * una hoja de catálogos, cada una con su propio propósito:
 *   "LISTAS VEHICULOS" — Departamento/Sede/Oficina/Razón social/Marca para
 *                         Vehículos, Uber y Tickets.
 *   "DEPARTAMENTOS"    — Departamento/Sede/Oficina para Caja Chica (mismo
 *                         concepto, pero es una hoja distinta con sus
 *                         propios datos — no reusar la de arriba).
 */

const ListasService = (function () {
  const SHEET_LISTAS = 'LISTAS VEHICULOS';
  const SHEET_DEPARTAMENTOS = 'DEPARTAMENTOS';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  /** Valores únicos, no vacíos y ordenados de una columna de cualquier hoja de catálogo. */
  function listarColumnaDeHoja_(nombreHoja, nombreColumna) {
    const sheet = SheetUtils.getSheet(ssId(), nombreHoja);
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, [nombreColumna]);
    const valores = new Set();
    for (let i = 0; i < filas; i++) {
      const v = datos[nombreColumna][i];
      if (v) valores.add(String(v).trim());
    }
    return Array.from(valores).sort((a, b) => a.localeCompare(b));
  }

  function listarColumna_(nombreColumna) {
    return listarColumnaDeHoja_(SHEET_LISTAS, nombreColumna);
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
    // Ojo: en "LISTAS VEHICULOS" la columna lleva espacios alrededor de la
    // diagonal ("OFICINA / DESARROLLO"), a diferencia de la hoja de Uber
    // ("OFICINA/DESARROLLO", sin espacios) — son nombres reales distintos.
    return listarColumna_('OFICINA / DESARROLLO');
  }

  /**
   * Ubicación (Vehículos) NO es un catálogo plano — depende de la Sede
   * elegida. En AppSheet el Valid If de "UBICACION" era:
   *   SELECT(LISTAS VEHICULOS[SEDE 2], [SEDE]=[_THISROW].[SEDE])
   * Es decir, cada fila de "LISTAS VEHICULOS" trae una Sede y, en la
   * columna "SEDE 2", la ubicación específica de esa sede (ej. Sede
   * "AGUASCALIENTES" trae filas con SEDE 2 = "CDMAGS", "AGS COWORKING",
   * "AGUASCALIENTES"). Se manda el mapa {SEDE: [ubicaciones]} completo de
   * una sola vez — así el cliente filtra localmente al cambiar la Sede en
   * el formulario, en vez de pedir un endpoint nuevo por cada cambio.
   */
  function mapaUbicacionesPorSede_() {
    const sheet = SheetUtils.getSheet(ssId(), SHEET_LISTAS);
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, ['SEDE', 'SEDE 2']);
    const mapa = {};
    for (let i = 0; i < filas; i++) {
      const sede = String(datos.SEDE[i] || '').trim();
      const ubicacion = String(datos['SEDE 2'][i] || '').trim();
      if (!sede || !ubicacion) continue;
      if (!mapa[sede]) mapa[sede] = new Set();
      mapa[sede].add(ubicacion);
    }
    const resultado = {};
    Object.keys(mapa).forEach((sede) => {
      resultado[sede] = Array.from(mapa[sede]).sort((a, b) => a.localeCompare(b));
    });
    return resultado;
  }

  function listarUbicacionesPorSede(token) {
    Auth.validarSesion(token);
    return mapaUbicacionesPorSede_();
  }

  function listarMarcas(token) {
    Auth.validarSesion(token);
    return listarColumna_('MARCA');
  }

  // --- Catálogos de la hoja "DEPARTAMENTOS" (Caja Chica) ---
  function listarDepartamentosCCH(token) {
    Auth.validarSesion(token);
    return listarColumnaDeHoja_(SHEET_DEPARTAMENTOS, 'DEPARTAMENTO');
  }

  function listarSedesCCH(token) {
    Auth.validarSesion(token);
    return listarColumnaDeHoja_(SHEET_DEPARTAMENTOS, 'SEDE');
  }

  function listarOficinasCCH(token) {
    Auth.validarSesion(token);
    return listarColumnaDeHoja_(SHEET_DEPARTAMENTOS, 'OFICINA / DESARROLLO');
  }

  return {
    listarDepartamentos, listarRazonesSociales, listarSedes, listarOficinasDesarrollo, listarMarcas,
    listarUbicacionesPorSede,
    listarDepartamentosCCH, listarSedesCCH, listarOficinasCCH,
  };
})();

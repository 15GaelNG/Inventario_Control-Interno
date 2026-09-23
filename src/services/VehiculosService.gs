/**
 * VehiculosService.gs
 * Módulo de vehículos: alta, reasignación, verificaciones e inspección
 * con checklist de daños (diagrama + firma). Pendiente de finalizar esquema de columnas
 * (ver mapeo de tablas originales del AppSheet en /docs/mapeo-modulos.md).
 *
 * Hojas previstas en Config.SPREADSHEET_IDS.VEHICULOS():
 *   VEHICULOS          — catálogo de unidades
 *   REASIGNACIONES     — historial de cambio de responsable
 *   VERIFICACIONES     — verificación vehicular periódica
 *   (SERVICIOS existe en la hoja, pero el módulo se descartó — 2026-09-17)
 *   INSPECCIONES       — checklist de daños + referencia a imagen anotada (ver PdfService)
 */

const VehiculosService = (function () {
  const SHEET_VEHICULOS = 'VEHICULOS';
  // La columna ID real de esta hoja es ID_VEHICULO, no "ID" (a diferencia de
  // las hojas nuevas) — hay que pasarla explícitamente a SheetUtils.update/remove.
  const ID_COLUMN = 'ID_VEHICULO';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function limpiarValor_(valor) {
    // google.script.run puede fallar (entrega null) con arreglos de objetos
    // que traen Date crudo — se manda todo como texto ISO.
    return valor instanceof Date ? valor.toISOString() : valor;
  }

  /** Catálogo completo, todas las columnas. Pesado (648 filas x 41 columnas) —
   * usar listarResumen() para listas/tarjetas y buscarPorFolio() para detalle. */
  function listar(token) {
    Permisos.puedeLeer(token, 'vehiculos');
    return SheetUtils.getAll(ssId(), SHEET_VEHICULOS).map((row) => {
      const limpio = {};
      Object.keys(row).forEach((k) => { limpio[k] = limpiarValor_(row[k]); });
      return limpio;
    });
  }

  /**
   * Catálogo ligero (FOLIO + datos clave) para autocompletar otros módulos
   * que referencian un vehículo por folio (ej. Incidencias). Excluye
   * vehículos dados de baja. MODELO en esta hoja es el año del vehículo,
   * no el nombre del modelo (ese es LINEA VEHICULO).
   *
   * Optimizado: en vez de leer las 41 columnas completas (SheetUtils.getAll)
   * solo para quedarse con 6, lee únicamente esas 6 columnas — de ~26,500
   * celdas a ~3,900.
   */
  function listarBasico(token) {
    Permisos.puedeLeer(token, 'vehiculos');
    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const { filas, datos } = leerColumnas_(sheet,
      ['FOLIO', 'DEPARTAMENTO', 'MARCA', 'LINEA VEHICULO', 'MODELO', 'PLACA', 'ESTATUS']);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      const folio = datos['FOLIO'][i];
      if (!folio) continue;
      if (String(datos['ESTATUS'][i] || '').toUpperCase() === 'BAJA VEHICULAR') continue;
      resultado.push({
        FOLIO: folio,
        DEPARTAMENTO: datos['DEPARTAMENTO'][i] || '',
        MARCA: datos['MARCA'][i] || '',
        LINEA_VEHICULO: datos['LINEA VEHICULO'][i] || '',
        MODELO: datos['MODELO'][i] || '',
        PLACA: datos['PLACA'][i] || '',
      });
    }
    return resultado.sort((a, b) => String(a.FOLIO).localeCompare(String(b.FOLIO)));
  }

  const COLUMNAS_RESUMEN = [
    'ID_VEHICULO', 'FOLIO', 'DEPARTAMENTO', 'NO ECONOMICO', 'MARCA', 'CLASE',
    'LINEA VEHICULO', 'MODELO', 'COLOR', 'PLACA', 'SEDE', 'ESTATUS',
  ];

  /** Lee solo las columnas dadas (no toda la hoja) — {filas, datos: {columna: [valores]}} */
  function leerColumnas_(sheet, columnas) {
    return SheetUtils.leerColumnas(sheet, columnas);
  }

  /**
   * Catálogo ligero para la lista/tarjetas del módulo (solo las columnas que
   * se muestran, no las 41) — incluye vehículos de baja (a diferencia de
   * listarBasico, que es para autocompletar y los excluye).
   */
  function listarResumen(token) {
    Permisos.puedeLeer(token, 'vehiculos');
    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const { filas, datos } = leerColumnas_(sheet, COLUMNAS_RESUMEN);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      if (!datos['FOLIO'][i]) continue;
      resultado.push({
        ID_VEHICULO: datos['ID_VEHICULO'][i],
        FOLIO: datos['FOLIO'][i],
        DEPARTAMENTO: datos['DEPARTAMENTO'][i] || '',
        NO_ECONOMICO: datos['NO ECONOMICO'][i] || '',
        MARCA: datos['MARCA'][i] || '',
        CLASE: datos['CLASE'][i] || '',
        LINEA_VEHICULO: datos['LINEA VEHICULO'][i] || '',
        MODELO: datos['MODELO'][i] || '',
        COLOR: datos['COLOR'][i] || '',
        PLACA: datos['PLACA'][i] || '',
        SEDE: datos['SEDE'][i] || '',
        ESTATUS: datos['ESTATUS'][i] || '',
      });
    }
    return resultado.sort((a, b) => String(a.FOLIO).localeCompare(String(b.FOLIO)));
  }

  /**
   * Regresa el registro completo de un vehículo (todas sus columnas) por
   * FOLIO, o null. Optimizado: en vez de leer las 648 filas x 41 columnas
   * completas (SheetUtils.getAll) solo para buscar una, primero lee nada
   * más la columna FOLIO para ubicar el renglón, y luego lee solo esa fila.
   */
  function buscarPorFolio(token, folio) {
    Permisos.puedeLeer(token, 'vehiculos');
    if (!folio) return null;

    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const folioCol = SheetUtils.indiceDeColumnas(headers, ['FOLIO'])['FOLIO'];
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
      // Clave sin espacios sobrantes (igual que SheetUtils.getAll): "PLACA " → 'PLACA'
      limpio[String(h).replace(/\s+/g, ' ').trim()] = valor instanceof Date ? valor.toISOString() : valor;
    });
    return limpio;
  }

  /** Da de alta un vehículo. La columna ID_VEHICULO no la trae SheetUtils.insert
   * sola (solo autogenera si la columna se llama literalmente "ID") — se genera aquí. */
  function crear(token, datos) {
    Permisos.puedeEditar(token, 'vehiculos');
    if (!datos.FOLIO) throw new Error('El folio es obligatorio');
    const fila = Object.assign({}, datos);
    fila[ID_COLUMN] = Utilities.getUuid().slice(0, 8);
    SheetUtils.insert(ssId(), SHEET_VEHICULOS, fila);
    return { ID: fila[ID_COLUMN] };
  }

  function actualizar(token, id, cambios) {
    Permisos.puedeEditar(token, 'vehiculos');
    SheetUtils.update(ssId(), SHEET_VEHICULOS, id, cambios, ID_COLUMN);
    return { ID: id };
  }

  /** Elimina por completo un vehículo (borrado físico) — solo ADMIN.
   * OJO: el negocio normalmente "da de baja" (ESTATUS = BAJA VEHICULAR) en
   * vez de borrar — esto es un borrado real, para altas hechas por error. */
  function eliminar(token, id) {
    Permisos.puedeEditar(token, 'vehiculos');
    const ok = SheetUtils.remove(ssId(), SHEET_VEHICULOS, id, ID_COLUMN);
    if (!ok) throw new Error('No se encontró el vehículo con ID=' + id);
    return { ID: id };
  }

  // TODO: reasignarResponsable, registrarVerificacion, registrarServicio,
  //       guardarInspeccion (usa PdfService.generarReporteDanios)

  return { listar, listarBasico, listarResumen, buscarPorFolio, crear, actualizar, eliminar };
})();

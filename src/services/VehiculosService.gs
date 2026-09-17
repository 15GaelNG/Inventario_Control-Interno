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
    Auth.validarSesion(token);
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
    Auth.validarSesion(token);
    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = (nombre) => headers.indexOf(nombre);
    const leerColumna = (nombre) => {
      const col = idx(nombre);
      return col === -1 ? [] : sheet.getRange(2, col + 1, lastRow - 1, 1).getValues().map((f) => f[0]);
    };

    const folios = leerColumna('FOLIO');
    const deptos = leerColumna('DEPARTAMENTO');
    const marcas = leerColumna('MARCA');
    const lineas = leerColumna('LINEA VEHICULO');
    const modelos = leerColumna('MODELO');
    const estatus = leerColumna('ESTATUS');

    const resultado = [];
    for (let i = 0; i < folios.length; i++) {
      if (!folios[i]) continue;
      if (String(estatus[i] || '').toUpperCase() === 'BAJA VEHICULAR') continue;
      resultado.push({
        FOLIO: folios[i],
        DEPARTAMENTO: deptos[i] || '',
        MARCA: marcas[i] || '',
        LINEA_VEHICULO: lineas[i] || '',
        MODELO: modelos[i] || '',
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
    const lastRow = sheet.getLastRow();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const datos = {};
    columnas.forEach((nombre) => {
      const col = headers.indexOf(nombre);
      datos[nombre] = (col === -1 || lastRow < 2)
        ? []
        : sheet.getRange(2, col + 1, lastRow - 1, 1).getValues().map((f) => f[0]);
    });
    return { filas: Math.max(0, lastRow - 1), datos: datos };
  }

  /**
   * Catálogo ligero para la lista/tarjetas del módulo (solo las columnas que
   * se muestran, no las 41) — incluye vehículos de baja (a diferencia de
   * listarBasico, que es para autocompletar y los excluye).
   */
  function listarResumen(token) {
    Auth.validarSesion(token);
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

  /** Da de alta un vehículo. La columna ID_VEHICULO no la trae SheetUtils.insert
   * sola (solo autogenera si la columna se llama literalmente "ID") — se genera aquí. */
  function crear(token, datos) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    if (!datos.FOLIO) throw new Error('El folio es obligatorio');
    const fila = Object.assign({}, datos);
    fila[ID_COLUMN] = Utilities.getUuid().slice(0, 8);
    SheetUtils.insert(ssId(), SHEET_VEHICULOS, fila);
    return { ID: fila[ID_COLUMN] };
  }

  function actualizar(token, id, cambios) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    SheetUtils.update(ssId(), SHEET_VEHICULOS, id, cambios, ID_COLUMN);
    return { ID: id };
  }

  /** Elimina por completo un vehículo (borrado físico) — solo ADMIN.
   * OJO: el negocio normalmente "da de baja" (ESTATUS = BAJA VEHICULAR) en
   * vez de borrar — esto es un borrado real, para altas hechas por error. */
  function eliminar(token, id) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    const ok = SheetUtils.remove(ssId(), SHEET_VEHICULOS, id, ID_COLUMN);
    if (!ok) throw new Error('No se encontró el vehículo con ID=' + id);
    return { ID: id };
  }

  // TODO: reasignarResponsable, registrarVerificacion, registrarServicio,
  //       guardarInspeccion (usa PdfService.generarReporteDanios)

  // Carpeta de Drive donde se guardan los archivos adjuntos (responsiva,
  // documento de baja, archivo de tenencia). No se cambia la seguridad del
  // archivo — hereda los permisos que ya tenga esa carpeta compartida.
  const CARPETA_ADJUNTOS_ID = '1gmu5Gs6thEwOv7tcwe0KWQaWTRhFr4-l';
  const TAMANO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  /**
   * Sube un archivo (PDF/imagen) codificado en base64 a la carpeta de Drive
   * de adjuntos y regresa su URL — el cliente guarda esa URL en la columna
   * correspondiente (RESPONSIVA / DOCUMENTO BAJA / ARCHIVO TENENCIA) al
   * llamar crear()/actualizar(), igual que cualquier otro campo de texto.
   */
  function subirArchivo(token, nombreArchivo, mimeType, base64Data) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    if (!base64Data) throw new Error('No se recibió ningún archivo.');

    const bytes = Utilities.base64Decode(base64Data);
    if (bytes.length > TAMANO_MAX_BYTES) {
      throw new Error('El archivo pesa más de 10 MB — súbelo más ligero.');
    }

    const blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', nombreArchivo || 'archivo');
    const carpeta = DriveApp.getFolderById(CARPETA_ADJUNTOS_ID);
    const archivo = carpeta.createFile(blob);

    return { url: archivo.getUrl(), id: archivo.getId(), nombre: nombreArchivo };
  }

  return { listar, listarBasico, listarResumen, buscarPorFolio, crear, actualizar, eliminar, subirArchivo };
})();

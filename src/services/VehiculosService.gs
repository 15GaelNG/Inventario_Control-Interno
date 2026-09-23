/**
 * VehiculosService.gs
 * Módulo de vehículos: alta, reasignación, verificaciones, servicios e inspección
 * con checklist de daños (diagrama + firma). Pendiente de finalizar esquema de columnas
 * (ver mapeo de tablas originales del AppSheet en /docs/mapeo-modulos.md).
 *
 * Hojas previstas en Config.SPREADSHEET_IDS.VEHICULOS():
 *   VEHICULOS          — catálogo de unidades
 *   CAMBIOS VEHICULOS  — bitácora automática de ediciones (ver
 *                         CambiosVehiculosService, se llena sola desde
 *                         actualizar(), nadie la captura a mano)
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
    Permisos.puedeLeer(token, 'vehiculos');
    return SheetUtils.getAll(ssId(), SHEET_VEHICULOS).map((row) => {
      const limpio = {};
      Object.keys(row).forEach((k) => { limpio[k] = limpiarValor_(row[k]); });
      return limpio;
    });
  }

  /**
   * Catálogo ligero (FOLIO + datos clave) para autocompletar otros módulos
   * que referencian un vehículo por folio (ej. Incidencias, Reasignaciones
   * Vehiculares). Excluye vehículos dados de baja. MODELO en esta hoja es
   * el año del vehículo, no el nombre del modelo (ese es LINEA VEHICULO).
   *
   * Optimizado: en vez de leer las 41 columnas completas (SheetUtils.getAll)
   * solo para quedarse con unas cuantas, lee únicamente esas columnas — de
   * ~26,500 celdas a ~5,800.
   */
  const COLUMNAS_BASICO = [
    'FOLIO', 'DEPARTAMENTO', 'MARCA', 'LINEA VEHICULO', 'MODELO', 'ESTATUS',
    'RESPONSABLE VEHICULO', 'NO EMPLEADO', 'SERIE VEHICULO', 'NUCCO',
  ];

  function listarBasico(token) {
    Permisos.puedeLeer(token, 'vehiculos');
    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_BASICO);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      if (!datos['FOLIO'][i]) continue;
      if (String(datos['ESTATUS'][i] || '').toUpperCase() === 'BAJA VEHICULAR') continue;
      resultado.push({
        FOLIO: datos['FOLIO'][i],
        DEPARTAMENTO: datos['DEPARTAMENTO'][i] || '',
        MARCA: datos['MARCA'][i] || '',
        LINEA_VEHICULO: datos['LINEA VEHICULO'][i] || '',
        MODELO: datos['MODELO'][i] || '',
        RESPONSABLE_VEHICULO: datos['RESPONSABLE VEHICULO'][i] || '',
        NO_EMPLEADO: datos['NO EMPLEADO'][i] || '',
        VIN: datos['SERIE VEHICULO'][i] || '',
        NUCO: datos['NUCCO'][i] || '',
      });
    }
    return resultado.sort((a, b) => String(a.FOLIO).localeCompare(String(b.FOLIO)));
  }

  const COLUMNAS_RESUMEN = [
    'ID_VEHICULO', 'FOLIO', 'NUCCO', 'DEPARTAMENTO', 'NO ECONOMICO', 'MARCA', 'CLASE',
    'LINEA VEHICULO', 'MODELO', 'COLOR', 'PLACA', 'SEDE', 'ESTATUS',
  ];

  /**
   * Catálogo ligero para la lista/tarjetas del módulo (solo las columnas que
   * se muestran, no las 41) — incluye vehículos de baja (a diferencia de
   * listarBasico, que es para autocompletar y los excluye).
   */
  function listarResumen(token) {
    Permisos.puedeLeer(token, 'vehiculos');
    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_RESUMEN);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      if (!datos['FOLIO'][i]) continue;
      resultado.push({
        ID_VEHICULO: datos['ID_VEHICULO'][i],
        FOLIO: datos['FOLIO'][i],
        NUCCO: datos['NUCCO'][i] || '',
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

  // Prefijo de folio según Clase — folio = PREFIJO + consecutivo de 4 dígitos,
  // el siguiente disponible para ESE prefijo (no se reutilizan aunque se
  // borre a la mitad un vehículo). Clases sin prefijo propio (CUATRIMOTO,
  // NUCO SIN INFORMACION, MOTOCARRO, etc.) caen en el prefijo genérico "FOL".
  const PREFIJOS_CLASE = {
    AUTOMOVIL: 'AUT',
    CAMION: 'CON',
    CAMIONETA: 'CTA',
    MOTOCICLETA: 'MOT',
    REMOLQUE: 'REM',
    'MAQUINARIA MENOR': 'MAQ',
  };
  const PREFIJO_POR_DEFECTO = 'FOL';

  /** Calcula el siguiente folio disponible para el prefijo de una Clase dada. */
  function generarFolio_(clase) {
    const prefijo = PREFIJOS_CLASE[String(clase || '').toUpperCase().trim()] || PREFIJO_POR_DEFECTO;
    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const lastRow = sheet.getLastRow();
    let maximo = 0;
    if (lastRow >= 2) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const col = headers.indexOf('FOLIO');
      if (col !== -1) {
        const patron = new RegExp('^' + prefijo + '(\\d+)$', 'i');
        sheet.getRange(2, col + 1, lastRow - 1, 1).getValues().forEach((fila) => {
          const match = patron.exec(String(fila[0] || '').trim());
          if (match) maximo = Math.max(maximo, parseInt(match[1], 10));
        });
      }
    }
    return prefijo + String(maximo + 1).padStart(4, '0');
  }

  /** Solo para mostrarlo en el formulario de Registrar mientras se llena (el
   * campo Folio es de solo lectura) — NO reserva el folio, es una vista previa;
   * el que de verdad queda asignado se recalcula bajo candado dentro de crear(). */
  function previsualizarFolio(token, clase) {
    Permisos.puedeLeer(token, 'vehiculos');
    return generarFolio_(clase);
  }

  /** NUCCO: consecutivo simple (no depende de la Clase, a diferencia del
   * Folio) — el siguiente número disponible es el máximo NUCCO numérico ya
   * usado + 1, con ceros a la izquierda a 5 dígitos (00001, 00002…). Valores
   * viejos que no sean puramente numéricos se ignoran al calcular el máximo. */
  function generarNucco_() {
    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const lastRow = sheet.getLastRow();
    let maximo = 0;
    if (lastRow >= 2) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const col = headers.indexOf('NUCCO');
      if (col !== -1) {
        sheet.getRange(2, col + 1, lastRow - 1, 1).getValues().forEach((fila) => {
          const texto = String(fila[0] || '').trim();
          if (/^\d+$/.test(texto)) maximo = Math.max(maximo, parseInt(texto, 10));
        });
      }
    }
    return String(maximo + 1).padStart(5, '0');
  }

  /** Vista previa de NUCCO para el formulario de Registrar (mismo criterio que
   * previsualizarFolio: no reserva nada, el valor real se recalcula bajo
   * candado dentro de crear()). No depende de ningún otro campo del formulario,
   * así que se pide una sola vez al abrir el módulo. */
  function previsualizarNucco(token) {
    Permisos.puedeLeer(token, 'vehiculos');
    return generarNucco_();
  }

  /** Da de alta un vehículo. El FOLIO no lo manda el cliente — se calcula aquí
   * a partir de la Clase (ver generarFolio_) — y la columna ID_VEHICULO no la
   * trae SheetUtils.insert sola (solo autogenera si la columna se llama
   * literalmente "ID") — se genera aquí también. FECHA REGISTRO SISTEMA CI
   * siempre es "hoy" (no la manda el cliente, mismo patrón que FECHA DE
   * REGISTRO en Tickets). NUCCO también se calcula aquí (ver generarNucco_).
   * Con LockService: dos altas al mismo tiempo no deben terminar con el mismo
   * folio NI el mismo NUCCO. */
  function crear(token, datos) {
    Permisos.puedeEditar(token, 'vehiculos');
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const fila = Object.assign({}, datos);
      fila.FOLIO = generarFolio_(datos.CLASE);
      fila.NUCCO = generarNucco_();
      fila[ID_COLUMN] = Utilities.getUuid().slice(0, 8);
      fila['FECHA REGISTRO SISTEMA CI'] = new Date();
      SheetUtils.insert(ssId(), SHEET_VEHICULOS, fila);
      return { ID: fila[ID_COLUMN], FOLIO: fila.FOLIO };
    } finally {
      lock.releaseLock();
    }
  }

  /** Edita un vehículo. Además de guardar, compara contra el registro que
   * había antes y manda la diferencia campo por campo a la bitácora de
   * Cambios Vehículos (ver CambiosVehiculosService) — así queda quién
   * cambió qué y cuándo, sin que nadie tenga que anotarlo a mano. */
  function actualizar(token, id, cambios) {
    const sesion = Permisos.puedeEditar(token, 'vehiculos');
    const datos = Object.assign({}, cambios);
    delete datos.FOLIO; // no se edita, se fija solo al crear
    delete datos.NUCCO; // ídem
    delete datos['FECHA REGISTRO SISTEMA CI']; // ídem

    const encontrado = SheetUtils.findById(ssId(), SHEET_VEHICULOS, id, ID_COLUMN);
    SheetUtils.update(ssId(), SHEET_VEHICULOS, id, datos, ID_COLUMN);

    if (encontrado) {
      CambiosVehiculosService.registrarCambios(encontrado.data.FOLIO, encontrado.data, datos, sesion.nombre);
    }
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
    Permisos.puedeEditar(token, 'vehiculos');
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

  return { listar, listarBasico, listarResumen, buscarPorFolio, previsualizarFolio, previsualizarNucco, crear, actualizar, eliminar, subirArchivo };
})();

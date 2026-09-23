/**
 * CajasChicasService.gs
 * Catálogo de cajas chicas — un registro por responsable, referenciado por
 * ID CCH desde los módulos de Arqueos y del historial de cambios de monto
 * (ambos pendientes de construir). Vive en el mismo spreadsheet original de
 * AppSheet que Vehículos/Uber/Tickets — la pestaña real se ubica por firma
 * de columnas, no por nombre fijo.
 *
 * Columnas reales (28): ID CCH | ESTATUS | EMPRESA ORIGEN |
 *   RESPONSABLE DE CAJA CHICA | PUESTO DE RESPONSABLE |
 *   JEFE INMEDIATO DEL REPSONSABLE | ADMINISTRADA POR |
 *   CAPTURISTA DE CAJA CHICA | PUESTO DE CAPTURISTA | DEPARTAMENTO | OFICINA |
 *   SEDE | FECHA DE APERTURA | FECHA DE CIERRE | FECHA DE RESPONSIVA CI |
 *   TIPO DE AUTORIZACIÓN | MONTO ACTUAL | METODO DE REEMBOLSO |
 *   CORREO ELECTRONICO DE RESPONSABLE | CORREO ELECTRONICO CAPTURISTA |
 *   TELEFONO DE RESPONSABLE | TELEFONO DE CAPTURISTA |
 *   TIPO IDENTIFICACION RESPONSABLE |
 *   VIGENCIA IDENTIFICACION OFICIAL RESPONSABLE |
 *   TIPO IDENTIFICACION JEFE DIRECTO |
 *   VIGENCIA IDENTIFICACION OFICIAL JEFE DIRECTO | OBSERVACIONES |
 *   CALIFICACION PROMEDIO
 *
 * (Sí, "REPSONSABLE" es un typo real de la hoja original — se respeta tal
 * cual, es el nombre exacto de la columna. CALIFICACION PROMEDIO no se
 * expone para editar: es un promedio calculado a partir de los Arqueos,
 * que todavía no existen en el sistema.)
 */

const CajasChicasService = (function () {
  // Nombre real ya confirmado ("CAJAS CHICAS") — directo por nombre, no
  // por firma de columnas (ver mismo comentario en ArqueosService).
  const NOMBRE_HOJA = 'CAJAS CHICAS';
  const ID_COLUMN = 'ID CCH';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function hoja_() {
    return SheetUtils.getSheet(ssId(), NOMBRE_HOJA);
  }

  function limpiarValor_(valor) {
    // google.script.run puede fallar (entrega null) con arreglos de objetos
    // que traen Date crudo — se manda todo como texto ISO.
    return valor instanceof Date ? valor.toISOString() : valor;
  }

  // Las 27 columnas capturables completas (todo menos CALIFICACION PROMEDIO,
  // que es un promedio calculado a partir de Arqueos) — antes solo se traían
  // 10 para la tabla y el detalle/editar pedía las demás aparte con
  // buscarPorId; el catálogo de Cajas Chicas no es tan grande como el de
  // Vehículos, así que traerlas todas de una vez evita ese segundo viaje
  // para pintar el panel de detalle. Se mantienen además los alias en
  // MAYUSCULAS_CON_GUION (ID_CCH, RESPONSABLE, MONTO_ACTUAL...) porque
  // Arqueos y Cambios de Monto ya los usan para su selector de Caja Chica.
  const COLUMNAS_RESUMEN = [
    'ID CCH', 'ESTATUS', 'EMPRESA ORIGEN', 'RESPONSABLE DE CAJA CHICA', 'PUESTO DE RESPONSABLE',
    'JEFE INMEDIATO DEL REPSONSABLE', 'ADMINISTRADA POR', 'CAPTURISTA DE CAJA CHICA', 'PUESTO DE CAPTURISTA',
    'DEPARTAMENTO', 'OFICINA', 'SEDE', 'FECHA DE APERTURA', 'FECHA DE CIERRE', 'FECHA DE RESPONSIVA CI',
    'TIPO DE AUTORIZACIÓN', 'MONTO ACTUAL', 'METODO DE REEMBOLSO', 'CORREO ELECTRONICO DE RESPONSABLE',
    'CORREO ELECTRONICO CAPTURISTA', 'TELEFONO DE RESPONSABLE', 'TELEFONO DE CAPTURISTA',
    'TIPO IDENTIFICACION RESPONSABLE', 'VIGENCIA IDENTIFICACION OFICIAL RESPONSABLE',
    'TIPO IDENTIFICACION JEFE DIRECTO', 'VIGENCIA IDENTIFICACION OFICIAL JEFE DIRECTO', 'OBSERVACIONES',
  ];

  /** Catálogo con las 27 columnas capturables (nombres tal cual la hoja, + alias). */
  function listarResumen(token) {
    Permisos.puedeLeer(token, 'caja-chica');
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_RESUMEN);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      if (!datos['ID CCH'][i]) continue;
      const fila = {
        ID_CCH: datos['ID CCH'][i],
        RESPONSABLE: datos['RESPONSABLE DE CAJA CHICA'][i] || '',
        PUESTO: datos['PUESTO DE RESPONSABLE'][i] || '',
        EMPRESA_ORIGEN: datos['EMPRESA ORIGEN'][i] || '',
        MONTO_ACTUAL: datos['MONTO ACTUAL'][i] || '',
        METODO_REEMBOLSO: datos['METODO DE REEMBOLSO'][i] || '',
      };
      COLUMNAS_RESUMEN.forEach((clave) => { fila[clave] = limpiarValor_(datos[clave][i]) || ''; });
      resultado.push(fila);
    }
    return resultado.sort((a, b) => Number(a.ID_CCH) - Number(b.ID_CCH));
  }

  /** Registro completo por ID CCH (para el modal de detalle/editar). */
  function buscarPorId(token, id) {
    Permisos.puedeLeer(token, 'caja-chica');
    const encontrado = SheetUtils.findById(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!encontrado) return null;
    const limpio = {};
    Object.keys(encontrado.data).forEach((k) => { limpio[k] = limpiarValor_(encontrado.data[k]); });
    return limpio;
  }

  /** Calcula el siguiente ID CCH disponible — consecutivo simple (1, 2, 3…),
   * no un UUID: los módulos de Arqueos y de historial de cambios lo van a
   * referenciar tal cual como llave foránea. */
  function generarIdCch_(sheet) {
    const lastRow = sheet.getLastRow();
    let maximo = 0;
    if (lastRow >= 2) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const col = headers.indexOf(ID_COLUMN);
      if (col !== -1) {
        sheet.getRange(2, col + 1, lastRow - 1, 1).getValues().forEach((fila) => {
          const n = parseInt(fila[0], 10);
          if (!isNaN(n)) maximo = Math.max(maximo, n);
        });
      }
    }
    return String(maximo + 1);
  }

  /**
   * Da de alta una caja chica. El ID CCH no lo manda el cliente — se calcula
   * aquí bajo candado (LockService), para que dos altas al mismo tiempo no
   * terminen con el mismo ID.
   *
   * ESTATUS también se fuerza a "VIGENTE" aquí, igual que en AppSheet: su
   * "Valid If" original era
   *   IF(IN([ID CCH], CAJAS CHICAS[ID CCH]), LIST("VIGENTE","CERRADA","EN PROCESO DE CIERRE"), LIST("VIGENTE"))
   * — solo "VIGENTE" es válido mientras el ID CCH todavía no existe en la
   * tabla (o sea, al crear); las otras 2 opciones solo aplican al editar.
   */
  function crear(token, datos) {
    Permisos.puedeEditar(token, 'caja-chica');
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const sheet = hoja_();
      const fila = Object.assign({}, datos);
      fila[ID_COLUMN] = generarIdCch_(sheet);
      fila['ESTATUS'] = 'VIGENTE';
      SheetUtils.insert(ssId(), sheet.getName(), fila);
      return { ID: fila[ID_COLUMN] };
    } finally {
      lock.releaseLock();
    }
  }

  function actualizar(token, id, cambios) {
    Permisos.puedeEditar(token, 'caja-chica');
    const datos = Object.assign({}, cambios);
    delete datos[ID_COLUMN]; // no se edita, se fija solo al crear
    SheetUtils.update(ssId(), hoja_().getName(), id, datos, ID_COLUMN);
    return { ID: id };
  }

  function eliminar(token, id) {
    Permisos.puedeEditar(token, 'caja-chica');
    const ok = SheetUtils.remove(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!ok) throw new Error('No se encontró la caja chica con ID CCH=' + id);
    return { ID: id };
  }

  return { listarResumen, buscarPorId, crear, actualizar, eliminar };
})();

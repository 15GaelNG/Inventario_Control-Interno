/**
 * CajasChicasService.gs
 * Catálogo de cajas chicas — un registro por responsable, referenciado por
 * ID CCH desde Arqueos y del historial de cambios de monto. Vive en el mismo
 * spreadsheet original de AppSheet que Vehículos/Uber/Tickets.
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
 * expone para editar: es un promedio calculado a partir de los Arqueos.)
 */

const CajasChicasService = (function () {
  const ID_COLUMN = 'ID CCH';

  // Las 27 columnas capturables (todo menos CALIFICACION PROMEDIO). Se mantienen además los
  // alias en MAYUSCULAS_CON_GUION (ID_CCH, RESPONSABLE, MONTO_ACTUAL...) porque Arqueos y
  // Cambios de Monto los usan para su selector de Caja Chica.
  const COLUMNAS_LISTA = [
    'ID CCH', 'ESTATUS', 'EMPRESA ORIGEN', 'RESPONSABLE DE CAJA CHICA', 'PUESTO DE RESPONSABLE',
    'JEFE INMEDIATO DEL REPSONSABLE', 'ADMINISTRADA POR', 'CAPTURISTA DE CAJA CHICA', 'PUESTO DE CAPTURISTA',
    'DEPARTAMENTO', 'OFICINA', 'SEDE', 'FECHA DE APERTURA', 'FECHA DE CIERRE', 'FECHA DE RESPONSIVA CI',
    'TIPO DE AUTORIZACIÓN', 'MONTO ACTUAL', 'METODO DE REEMBOLSO', 'CORREO ELECTRONICO DE RESPONSABLE',
    'CORREO ELECTRONICO CAPTURISTA', 'TELEFONO DE RESPONSABLE', 'TELEFONO DE CAPTURISTA',
    'TIPO IDENTIFICACION RESPONSABLE', 'VIGENCIA IDENTIFICACION OFICIAL RESPONSABLE',
    'TIPO IDENTIFICACION JEFE DIRECTO', 'VIGENCIA IDENTIFICACION OFICIAL JEFE DIRECTO', 'OBSERVACIONES',
  ];

  /** Calcula el siguiente ID CCH disponible — consecutivo simple (1, 2, 3…), no un UUID:
   * Arqueos y el historial de cambios lo referencian tal cual. Corre bajo candado. */
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
   * ID PERSONA no se captura: se calcula del responsable y su correo (CapitalHumano,
   * decisión del 01/10/2026). Si cambiaron, se recalcula y va en el mismo renglón; si
   * todavía no hay PERSONAS, no se toca y Salud lo pone al día después.
   */
  function conPersona_(datos, registro) {
    delete datos[CapitalHumano.COLUMNA];
    if (!CapitalHumano.columnasDePersona('CAJAS CHICAS').some((c) => datos[c] !== undefined)) return;
    try {
      const id = CapitalHumano.idPara('CAJAS CHICAS', registro);
      if (id !== null) datos[CapitalHumano.COLUMNA] = id;
    } catch (err) {
      console.error('CapitalHumano: no se pudo calcular la persona de la caja: ' + err.message);
    }
  }

  /** La hoja, para HojaServicio */
  const CAJAS_CHICAS = {
    modulo: 'caja-chica',
    nombre: 'la caja chica',
    libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    hoja: 'CAJAS CHICAS',
    id: ID_COLUMN,
    columnas: COLUMNAS_LISTA,
    fila: (r) => {
      const fila = {
        ID_CCH: r['ID CCH'],
        RESPONSABLE: r['RESPONSABLE DE CAJA CHICA'] || '',
        PUESTO: r['PUESTO DE RESPONSABLE'] || '',
        EMPRESA_ORIGEN: r['EMPRESA ORIGEN'] || '',
        MONTO_ACTUAL: r['MONTO ACTUAL'] || '',
        METODO_REEMBOLSO: r['METODO DE REEMBOLSO'] || '',
      };
      COLUMNAS_LISTA.forEach((c) => { fila[c] = (r[c] instanceof Date ? r[c].toISOString() : r[c]) || ''; });
      return fila;
    },
    orden: { campo: 'ID_CCH', numero: true },
    candadoAlCrear: true,
    /**
     * El ID CCH no lo manda el cliente: se calcula bajo candado, para que dos altas a la vez no
     * terminen con el mismo. ESTATUS se fuerza a "VIGENTE", igual que en AppSheet: su "Valid If"
     * solo permitía VIGENTE mientras el ID CCH no existía (CERRADA y EN PROCESO DE CIERRE son
     * para editar).
     */
    alCrear: (fila, ctx) => {
      fila[ID_COLUMN] = generarIdCch_(ctx.hoja);
      fila['ESTATUS'] = 'VIGENTE';
      conPersona_(fila, fila);
    },
    alActualizar: (cambios, ctx) => conPersona_(cambios, Object.assign({}, ctx.actual, cambios)),
  };

  return {
    /** Catálogo con las 27 columnas capturables (nombres tal cual la hoja, + alias) */
    listarResumen: (token) => HojaServicio.listar(CAJAS_CHICAS, token),
    /** Para el activador (Calentador.gs): la deja armada sin esperar a nadie */
    calentar: () => HojaServicio.calentar(CAJAS_CHICAS),
    /** Todas las columnas de TODAS las cajas chicas (para "Vista": mostrar/exportar cualquier columna) */
    completo: (token) => HojaServicio.completo(CAJAS_CHICAS, token),
    /** Registro completo por ID CCH (para el modal de detalle/editar) */
    buscarPorId: (token, id) => HojaServicio.buscarPorId(CAJAS_CHICAS, token, id),
    crear: (token, datos) => HojaServicio.crear(CAJAS_CHICAS, token, datos),
    actualizar: (token, id, cambios) => HojaServicio.actualizar(CAJAS_CHICAS, token, id, cambios),
    // Por Relaciones (lo hace HojaServicio): se niega si la caja tiene arqueos o cambios de monto
    eliminar: (token, id) => HojaServicio.eliminar(CAJAS_CHICAS, token, id),
  };
})();

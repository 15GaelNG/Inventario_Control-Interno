/**
 * CambiosMontoCCHService.gs
 * Historial de cambios de monto asignado a una Caja Chica (incrementos y
 * reducciones) — referencia el ID CCH del catálogo de Cajas Chicas.
 *
 * Columnas reales (8): ID | ID CCH | TIPO | CANTIDAD | CANTIDAD ANTERIOR |
 *   CANTIDAD ACTUALIZADA | FECHA | QUIEN REALIZO
 *
 * A propósito, es un registro de solo alta (no se edita): cambiar a mano un
 * "cambio de monto" ya guardado desincronizaría el historial con el MONTO
 * ACTUAL real de la Caja Chica. Sí se puede eliminar (solo ADMIN), para
 * corregir un error de captura.
 *
 * TIPO, CANTIDAD, CANTIDAD ANTERIOR, FECHA y QUIEN REALIZO NO los manda el
 * cliente — se calculan/derivan aquí siempre:
 *   - CANTIDAD ANTERIOR se relee del MONTO ACTUAL real de la Caja Chica en
 *     este momento (no el que mandó el cliente, por si ya cambió).
 *   - TIPO se deriva comparando anterior vs. actualizada (INCREMENTO si
 *     sube, REDUCCION si baja) — no hay ambigüedad posible, así que no se
 *     le pregunta al usuario.
 *   - CANTIDAD es la diferencia absoluta entre ambas.
 *   - FECHA es "ahora"; QUIEN REALIZO sale de la sesión, no de un campo de texto.
 * Dar de alta un cambio también actualiza el MONTO ACTUAL de esa Caja
 * Chica en la misma operación (bajo candado, para que dos cambios
 * simultáneos a la misma caja no se pisen).
 */

const CambiosMontoCCHService = (function () {
  /** La hoja, para HojaServicio */
  const INCREMENTOS = {
    modulo: 'caja-chica',
    libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    // Nombre real de la pestaña, a pesar del nombre del módulo
    hoja: 'INCREMENTOS',
    columnas: ['ID', 'ID CCH', 'TIPO', 'CANTIDAD', 'CANTIDAD ANTERIOR', 'CANTIDAD ACTUALIZADA', 'FECHA', 'QUIEN REALIZO'],
    fila: (r) => ({
      ID: r['ID'],
      ID_CCH: r['ID CCH'] || '',
      TIPO: r['TIPO'] || '',
      CANTIDAD: r['CANTIDAD'] || '',
      CANTIDAD_ANTERIOR: r['CANTIDAD ANTERIOR'] || '',
      CANTIDAD_ACTUALIZADA: r['CANTIDAD ACTUALIZADA'] || '',
      FECHA: HojaServicio.fechaISO(r['FECHA']),
      QUIEN_REALIZO: r['QUIEN REALIZO'] || '',
    }),
    orden: { campo: 'FECHA', desc: true },
  };

  /**
   * Registra un cambio de monto para una Caja Chica y, en la misma
   * operación, actualiza su MONTO ACTUAL. Escrito a mano y no con HojaServicio.crear: son dos
   * hojas que tienen que cambiar juntas, bajo el mismo candado.
   */
  function crear(token, datos) {
    const sesion = Permisos.puedeEditar(token, 'caja-chica');
    const idCch = datos['ID CCH'];
    if (!idCch) throw new Error('Selecciona la caja chica.');
    const nueva = Number(datos['CANTIDAD ACTUALIZADA']);
    if (isNaN(nueva)) throw new Error('La cantidad actualizada debe ser un número.');

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const cajaActual = CajasChicasService.buscarPorId(token, idCch);
      if (!cajaActual) throw new Error('No se encontró la caja chica con ID CCH=' + idCch);
      const anterior = Number(cajaActual['MONTO ACTUAL']) || 0;
      if (nueva === anterior) {
        throw new Error('La cantidad actualizada es igual a la actual — no hay cambio que registrar.');
      }

      // 'ID CAJA CHICA' es la llave foránea; 'ID CCH' se queda porque es dato de negocio.
      const idCaja = cajaActual['ID'];
      if (!idCaja) {
        throw new Error('La caja chica con ID CCH=' + idCch + ' no tiene ID. Corre el ' +
          'pipeline de IDs sobre este libro antes de registrar cambios de monto.');
      }
      // El ID lo pone SheetUtils.insert con el formato del sistema (ver docs/ids-asignacion.md)
      const fila = {
        'ID CAJA CHICA': idCaja,
        'ID CCH': idCch,
        'TIPO': nueva > anterior ? 'INCREMENTO' : 'REDUCCION',
        'CANTIDAD': Math.abs(nueva - anterior),
        'CANTIDAD ANTERIOR': anterior,
        'CANTIDAD ACTUALIZADA': nueva,
        'FECHA': new Date(),
        'QUIEN REALIZO': sesion.nombre,
      };
      SheetUtils.insert(HojaServicio.libro(INCREMENTOS), INCREMENTOS.hoja, fila);
      CajasChicasService.actualizar(token, idCch, { 'MONTO ACTUAL': nueva });
      return { ID: fila['ID'] };
    } finally {
      lock.releaseLock();
    }
  }

  return {
    /** Historial completo (ya son solo 8 columnas, no hace falta un "resumen" más ligero) */
    listarResumen: (token) => HojaServicio.listar(INCREMENTOS, token),
    /** Todas las columnas de la hoja (para "Vista": mostrar/exportar cualquier columna) */
    completo: (token) => HojaServicio.completo(INCREMENTOS, token),
    /** Cambios de monto de una sola caja chica (ficha de Caja Chica) */
    listarPorIdCch: (token, idCch) => HojaServicio.listarPor(INCREMENTOS, token, 'ID_CCH', idCch),
    /** Registro completo (todas las columnas) por ID -- "Ver completo" desde la ficha de Caja Chica */
    buscarPorId: (token, id) => HojaServicio.buscarPorId(INCREMENTOS, token, id),
    crear,
    eliminar: (token, id) => HojaServicio.eliminar(INCREMENTOS, token, id),
  };
})();

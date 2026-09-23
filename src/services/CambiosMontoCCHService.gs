/**
 * CambiosMontoCCHService.gs
 * Historial de cambios de monto asignado a una Caja Chica (incrementos y
 * reducciones) — referencia el ID CCH del catálogo de Cajas Chicas. Vive en
 * el mismo spreadsheet original de AppSheet que el resto de los módulos —
 * la pestaña real se ubica por firma de columnas, no por nombre fijo.
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
  // Nombre real ya confirmado ("INCREMENTOS", a pesar del nombre del
  // módulo/Service) — directo por nombre, no por firma de columnas (ver
  // mismo comentario en ArqueosService).
  const NOMBRE_HOJA = 'INCREMENTOS';
  const ID_COLUMN = 'ID';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function hoja_() {
    return SheetUtils.getSheet(ssId(), NOMBRE_HOJA);
  }

  function fechaISO_(valor) {
    if (!valor) return '';
    const f = valor instanceof Date ? valor : new Date(valor);
    return isNaN(f.getTime()) ? '' : f.toISOString();
  }

  const COLUMNAS_RESUMEN = [
    'ID', 'ID CCH', 'TIPO', 'CANTIDAD', 'CANTIDAD ANTERIOR', 'CANTIDAD ACTUALIZADA', 'FECHA', 'QUIEN REALIZO',
  ];

  /** Historial completo (ya son solo 8 columnas, no hace falta un "resumen" más ligero). */
  function listarResumen(token) {
    Auth.validarSesion(token);
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_RESUMEN);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      if (!datos['ID'][i]) continue;
      resultado.push({
        ID: datos['ID'][i],
        ID_CCH: datos['ID CCH'][i] || '',
        TIPO: datos['TIPO'][i] || '',
        CANTIDAD: datos['CANTIDAD'][i] || '',
        CANTIDAD_ANTERIOR: datos['CANTIDAD ANTERIOR'][i] || '',
        CANTIDAD_ACTUALIZADA: datos['CANTIDAD ACTUALIZADA'][i] || '',
        FECHA: fechaISO_(datos['FECHA'][i]),
        QUIEN_REALIZO: datos['QUIEN REALIZO'][i] || '',
      });
    }
    return resultado.sort((a, b) => new Date(b.FECHA) - new Date(a.FECHA));
  }

  /**
   * Registra un cambio de monto para una Caja Chica y, en la misma
   * operación, actualiza su MONTO ACTUAL.
   */
  function crear(token, datos) {
    const sesion = Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
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

      const fila = {};
      fila[ID_COLUMN] = Utilities.getUuid().slice(0, 8);
      fila['ID CCH'] = idCch;
      fila['TIPO'] = nueva > anterior ? 'INCREMENTO' : 'REDUCCION';
      fila['CANTIDAD'] = Math.abs(nueva - anterior);
      fila['CANTIDAD ANTERIOR'] = anterior;
      fila['CANTIDAD ACTUALIZADA'] = nueva;
      fila['FECHA'] = new Date();
      fila['QUIEN REALIZO'] = sesion.nombre;

      SheetUtils.insert(ssId(), hoja_().getName(), fila);
      CajasChicasService.actualizar(token, idCch, { 'MONTO ACTUAL': nueva });

      return { ID: fila[ID_COLUMN] };
    } finally {
      lock.releaseLock();
    }
  }

  function eliminar(token, id) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    const ok = SheetUtils.remove(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!ok) throw new Error('No se encontró el registro con ID=' + id);
    return { ID: id };
  }

  return { listarResumen, crear, eliminar };
})();

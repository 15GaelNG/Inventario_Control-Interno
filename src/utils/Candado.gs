/**
 * Candado.gs — el candado del script, reentrante. Todo lo que escribe en las hojas lo pide aquí.
 *
 *   return Candado.con(() => { ...leer y escribir... });       // espera hasta 30 s; si no, error que se entiende
 *   Candado.con(fn, { siOcupado: () => ({ saltado: true }) })  // lo que se puede saltar: espera 5 s y si no, esto
 *   Candado.con(fn, { mensaje: 'Otro texto si está ocupado' })
 *   Candado.tomado()                                           // ¿este hilo ya lo tiene?
 *
 * Por qué existe: waitLock() NO es reentrante. Si un servicio toma el candado y desde ahí llama a otro que
 * también lo pide (Cambios de Monto → CajasChicas.actualizar → SheetUtils.update; Reasignaciones →
 * Vehiculos.actualizar → Relaciones.propagar), el segundo se cuelga hasta el timeout y truena. Aquí, si el hilo
 * ya lo tiene, solo se corre fn: no hacen falta versiones "sin candado" ni avisar que ya se tiene.
 *
 * Solo dos esperas, a propósito: la normal para lo que la persona está guardando y la corta para lo que tiene
 * salida propia (la copia del Help Desk se salta y la pone al día la siguiente consulta).
 *
 * Solo sirve si TODOS lo piden aquí: un LockService.getScriptLock() suelto no sabe que este hilo ya lo
 * tiene (source-contracts lo revisa).
 */
const Candado = (function () {
  const ESPERA = 30000;
  const ESPERA_CORTA = 5000;
  const OCUPADO = 'El sistema está guardando otro cambio; intenta de nuevo en unos segundos.';
  let profundidad = 0;   // global por ejecución: cada llamada de google.script.run empieza en 0

  function con(fn, opciones) {
    const o = opciones || {};
    if (profundidad > 0) {
      profundidad++;
      try { return fn(); } finally { profundidad--; }
    }
    const lock = LockService.getScriptLock();
    if (o.siOcupado) {
      if (!lock.tryLock(ESPERA_CORTA)) return o.siOcupado();
    } else {
      try {
        lock.waitLock(ESPERA);
      } catch (e) {
        throw new Error(o.mensaje || OCUPADO);
      }
    }
    profundidad = 1;
    try {
      return fn();
    } finally {
      profundidad = 0;
      lock.releaseLock();
    }
  }

  return {
    con,
    tomado: () => profundidad > 0,
  };
})();

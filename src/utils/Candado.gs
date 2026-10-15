/**
 * Candado.gs — el candado del script, reentrante. Todo lo que escribe en las hojas lo pide aquí.
 *
 *   return Candado.con(() => { ...leer y escribir... });
 *   Candado.con(fn, { espera: 30000 })                       // cuánto esperar (ms; 20 s si no se dice)
 *   Candado.con(fn, { siOcupado: () => ({ saltado: true }) }) // no esperar de más: si está ocupado, esto
 *   Candado.tomado()                                          // ¿este hilo ya lo tiene?
 *
 * Por qué existe: waitLock() NO es reentrante. Si un servicio toma el candado y desde ahí llama a otro que
 * también lo pide (Cambios de Monto → CajasChicas.actualizar → SheetUtils.update; Reasignaciones →
 * Vehiculos.actualizar → Relaciones.propagar), el segundo se cuelga hasta el timeout y truena. Antes eso se
 * esquivaba con versiones "SinCandado" de cada función; aquí, si el hilo ya lo tiene, solo se corre fn.
 *
 * Solo sirve si TODOS lo piden aquí: un LockService.getScriptLock() suelto no sabe que este hilo ya lo
 * tiene (source-contracts lo revisa).
 */
const Candado = (function () {
  const ESPERA = 20000;
  const OCUPADO = 'El sistema está guardando otro cambio; intenta de nuevo en unos segundos.';
  let profundidad = 0;   // global por ejecución: cada llamada de google.script.run empieza en 0

  function con(fn, opciones) {
    const o = opciones || {};
    if (profundidad > 0) {
      profundidad++;
      try { return fn(); } finally { profundidad--; }
    }
    const lock = LockService.getScriptLock();
    const espera = o.espera || ESPERA;
    if (o.siOcupado) {
      if (!lock.tryLock(espera)) return o.siOcupado();
    } else {
      try {
        lock.waitLock(espera);
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

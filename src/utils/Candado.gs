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
 *
 * Bitácora de esperas (24-nov, lentitud en prod): cuando alguien espera el candado 1 s o más, lo retiene 2 s o más, o se
 * queda sin él, se escribe una línea `[candado]` en el registro con quién lo pidió (las funciones de la pila), cuánto esperó
 * y cuánto lo retuvo. Así se ve qué operación frena a las demás o si nadie lo tiene y la lentitud es de Google. No cambia
 * lo que hace el candado.
 */
const Candado = (function () {
  const ESPERA = 30000;
  const ESPERA_CORTA = 5000;
  const OCUPADO = 'El sistema está guardando otro cambio; intenta de nuevo en unos segundos.';
  let profundidad = 0;   // global por ejecución: cada llamada de google.script.run empieza en 0
  const AVISO_ESPERA = 1000;
  const AVISO_RETENIDO = 2000;

  /** Quién pidió el candado: las primeras funciones de la pila fuera de este archivo («Vehiculos.actualizar < apiVehiculosGuardar»). */
  function quien_() {
    // Cada renglón de la pila: «at Vehiculos.actualizar (services/VehiculosService:120:9)»; se saltan los de este archivo
    const pila = String((new Error()).stack || '').split(/\r?\n/).slice(1)
      .map((l) => l.match(/at (?:Object\.)?([\w$.]+) \(([^:)]*)/))
      .filter((m) => m && !/(^|\/)Candado$/.test(m[2]) && ['quien_', 'anotar_', 'con'].indexOf(m[1]) < 0)
      .map((m) => m[1]);
    return pila.slice(0, 4).join(' < ') || '?';
  }

  /** Una línea en el registro, solo si vale la pena verla; nunca truena por anotar. */
  function anotar_(espero, retuvo, resultado) {
    if (espero < AVISO_ESPERA && retuvo < AVISO_RETENIDO && resultado === 'ok') return;
    try {
      if (typeof console !== 'undefined') {
        console.log('[candado] ' + quien_() + ' · esperó ' + espero + ' ms · lo retuvo ' + retuvo + ' ms' + (resultado === 'ok' ? '' : ' · ' + resultado));
      }
    } catch (e) { /* solo es diagnóstico */ }
  }

  function con(fn, opciones) {
    const o = opciones || {};
    if (profundidad > 0) {
      profundidad++;
      try { return fn(); } finally { profundidad--; }
    }
    const lock = LockService.getScriptLock();
    const t0 = Date.now();
    if (o.siOcupado) {
      if (!lock.tryLock(ESPERA_CORTA)) { anotar_(Date.now() - t0, 0, 'ocupado: se saltó'); return o.siOcupado(); }
    } else {
      try {
        lock.waitLock(ESPERA);
      } catch (e) {
        anotar_(Date.now() - t0, 0, 'ocupado: no lo obtuvo');
        throw new Error(o.mensaje || OCUPADO);
      }
    }
    const t1 = Date.now();
    profundidad = 1;
    try {
      return fn();
    } finally {
      // Lo que se juntó para la bitácora sale antes de soltar el candado: sus huellas nunca se cruzan (Bitacora.gs)
      if (typeof Bitacora !== 'undefined' && Bitacora.vaciar) {
        try { Bitacora.vaciar(); } catch (e) { console.error('Bitácora al soltar el candado: ' + e.message); }
      }
      profundidad = 0;
      lock.releaseLock();
      anotar_(t1 - t0, Date.now() - t1, 'ok');
    }
  }

  return {
    con,
    tomado: () => profundidad > 0,
  };
})();

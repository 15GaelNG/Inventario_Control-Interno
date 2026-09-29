/**
 * Ids.gs
 * El único lugar donde nacen los IDs del sistema. Ver docs/ids-asignacion.md.
 *
 *   Ids.nuevo('VEH')        → 'VEH-1M3K8QB07F4XC2'
 *   Ids.es('VEH', v)        → valida prefijo y forma
 *   Ids.prefijo(v)          → 'VEH'
 *   Ids.fecha(v)            → Date de creación, o null si es de legado
 *   Ids.esLegado(v)         → true si viene de la migración (no se sabe su fecha real)
 *   Ids.deLegado('VEH', i)  → el ID del renglón i al migrar (solo lo usa MigracionIds)
 *
 * Forma: PRE-TTTTTTTTRRRRRR
 *   PRE  3 letras de la hoja. Junto con el guion garantiza que Sheets nunca lo lea
 *        como número, y hace visible una referencia puesta en la columna equivocada.
 *   TTTT 8 símbolos de tiempo: milisegundos desde 2020-01-01, con ceros a la izquierda.
 *        El ancho fijo es lo que hace que ordenar alfabéticamente sea ordenar por fecha.
 *   RRRR 6 símbolos al azar: mil millones de opciones DENTRO del mismo milisegundo.
 *
 * Antes teníamos 8 hexadecimales aleatorios y no alcanzaban: con 20,000 renglones en una
 * tabla la probabilidad de que dos chocaran era 4.6%, y sube con el tamaño. Al meter el
 * tiempo, dos registros solo pueden chocar si se crearon en el MISMO milisegundo, así que
 * la probabilidad deja de crecer con la tabla.
 */

const Ids = (function () {
  /** Base32 de Crockford: sin I, L, O (se confunden con 1 y 0) ni U (para que el azar
   *  no forme groserías en un ID que va impreso en un PDF que ve el cliente). */
  const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const EPOCA_MS = Date.UTC(2020, 0, 1);   // 1577836800000
  const LARGO_TIEMPO = 8;                  // 40 bits ≈ 34.8 años: alcanza hasta 2054
  const LARGO_AZAR = 6;                    // 30 bits = 1,073,741,824 por milisegundo
  /** Los IDs de la migración caben en el primer día de la época (la hoja más grande son
   *  20,000 renglones = 20 segundos). Todo lo que caiga aquí es "no sé su fecha real". */
  const LEGADO_LIMITE_MS = 24 * 60 * 60 * 1000;

  const FORMA = /^[A-Z]{3}-[0-9A-HJKMNP-TV-Z]{14}$/;

  /** Un entero a base32, rellenado con ceros a la izquierda hasta `largo` símbolos */
  function aBase32_(numero, largo) {
    let n = Math.floor(numero);
    let salida = '';
    while (n > 0) {
      salida = ALFABETO.charAt(n % 32) + salida;
      n = Math.floor(n / 32);
    }
    while (salida.length < largo) salida = '0' + salida;
    if (salida.length > largo) throw new Error('El número ' + numero + ' no cabe en ' + largo + ' símbolos base32');
    return salida;
  }

  function deBase32_(texto) {
    let n = 0;
    for (let i = 0; i < texto.length; i++) {
      const v = ALFABETO.indexOf(texto.charAt(i).toUpperCase());
      if (v === -1) return NaN;
      n = n * 32 + v;
    }
    return n;
  }

  /** `largo` símbolos al azar. Math.random da 52 bits; con 6 símbolos usamos 30. */
  function azar_(largo) {
    let salida = '';
    for (let i = 0; i < largo; i++) {
      salida += ALFABETO.charAt(Math.floor(Math.random() * 32));
    }
    return salida;
  }

  const limpio_ = (v) => String(v == null ? '' : v).trim().toUpperCase();

  function validarPrefijo_(prefijo) {
    const p = limpio_(prefijo);
    if (!/^[A-Z]{3}$/.test(p)) throw new Error('El prefijo debe ser 3 letras, no "' + prefijo + '"');
    return p;
  }

  /** Un ID nuevo, con la hora del servidor. NUNCA se genera en el navegador: con un
   *  componente de reloj, 46 celulares con su propia hora serían 46 relojes distintos. */
  function nuevo(prefijo) {
    const t = Date.now() - EPOCA_MS;
    if (t < LEGADO_LIMITE_MS) {
      // Solo pasaría con el reloj del servidor mal puesto; mejor tronar que mezclar
      // IDs nuevos con el bloque reservado de la migración.
      throw new Error('El reloj del servidor está antes de 2020: no se puede generar un ID');
    }
    return validarPrefijo_(prefijo) + '-' + aBase32_(t, LARGO_TIEMPO) + azar_(LARGO_AZAR);
  }

  /**
   * El ID que le toca al renglón `indice` (0, 1, 2, … en el orden de la hoja) al migrar.
   * No lleva fecha real porque no la sabemos: lleva su POSICIÓN, para que el histórico
   * quede en el mismo orden que la hoja y ordene antes que todo lo nuevo. Inventarle una
   * fecha que se vea real haría que Ids.fecha() devolviera una mentira con cara de dato.
   */
  function deLegado(prefijo, indice) {
    if (!(indice >= 0) || Math.floor(indice) !== indice) {
      throw new Error('El índice del renglón debe ser un entero desde 0, no "' + indice + '"');
    }
    if (indice >= LEGADO_LIMITE_MS) throw new Error('Demasiados renglones para el bloque de legado');
    return validarPrefijo_(prefijo) + '-' + aBase32_(indice, LARGO_TIEMPO) + azar_(LARGO_AZAR);
  }

  const tieneForma = (v) => FORMA.test(limpio_(v));
  const prefijo = (v) => (tieneForma(v) ? limpio_(v).slice(0, 3) : null);
  const es = (pre, v) => tieneForma(v) && limpio_(v).slice(0, 3) === validarPrefijo_(pre);

  /** Los milisegundos desde la época que trae el ID, o NaN si no tiene forma de ID */
  function tiempo_(v) {
    if (!tieneForma(v)) return NaN;
    return deBase32_(limpio_(v).slice(4, 4 + LARGO_TIEMPO));
  }

  /** Viene de la migración: solo conocemos su orden, no su fecha */
  const esLegado = (v) => {
    const t = tiempo_(v);
    return !isNaN(t) && t < LEGADO_LIMITE_MS;
  };

  /**
   * Cuándo se creó el registro, leído del propio ID.
   * Devuelve null para los de legado: es la diferencia entre "no sé cuándo se creó" y
   * una fecha inventada que se ve real.
   */
  function fecha(v) {
    const t = tiempo_(v);
    if (isNaN(t) || t < LEGADO_LIMITE_MS) return null;
    return new Date(EPOCA_MS + t);
  }

  return {
    nuevo, deLegado, es, tieneForma, prefijo, fecha, esLegado,
    ALFABETO, EPOCA_MS, LEGADO_LIMITE_MS, FORMA,
    aBase32_, deBase32_,   // expuestas para las pruebas
  };
})();

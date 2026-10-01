/**
 * LineasUtil.gs
 * Normalización de valores de la hoja del AppSheet (N/A, ceros de relleno, NUCO a 4 dígitos…)
 * y carpeta de cada NUCO en NUCOS de producción (LineasArchivos, solo lectura).
 */

const LineasUtil = (function () {
  const VALORES_NO_APLICA = ['', 'N/A', 'NA', 'NO APLICA', 'SOLO LINEA', 'N / A', '-', 'NINGUNO', 'NULL'];
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

  /** Texto limpio o null si es vacío / "no aplica". */
  function txt(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    const s = String(v).trim();
    return VALORES_NO_APLICA.indexOf(s.toUpperCase()) >= 0 ? null : s;
  }

  /** Solo dígitos, o null. "0", "000"… se usan como relleno en la hoja: se tratan como vacío. */
  function digitos(v) {
    const s = txt(v);
    if (s === null || s instanceof Date) return null;
    const d = String(s).replace(/\D/g, '');
    return d && !/^0+$/.test(d) ? d : null;
  }

  /** NUCO normalizado a 4 dígitos ("599" → "0599"), o null. */
  function nuco4(v) {
    const d = digitos(v);
    if (!d) return null;
    return d.length >= 4 ? d : ('0000' + d).slice(-4);
  }

  /**
   * NUCO para mostrar: siempre a 4 dígitos ("234" o 234 → "0234"). Lo que no es un número (p. ej. "N/A") se deja
   * igual; vacío → null. No cambia lo guardado en la hoja.
   */
  function nucoVisible(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    return /^\d+$/.test(s) ? (s.length >= 4 ? s : ('0000' + s).slice(-4)) : s;
  }

  function fecha(v) {
    return v instanceof Date && !isNaN(v.getTime()) ? v : null;
  }

  function numero(v) {
    if (typeof v === 'number') return v;
    const s = txt(v);
    if (s === null) return null;
    const n = Number(String(s).replace(/[$,%\s]/g, ''));
    return isNaN(n) ? null : n;
  }

  // Encabezados ya normalizados: una columna que no está con el nombre exacto recorre toda la fila, y sin esto se
  // normalizaba cada encabezado otra vez en cada fila (al leer LINEAS TELEFONICAS completa eran ~2 s de 3).
  const normalizados_ = new Map();
  const norm_ = (k) => {
    let n = normalizados_.get(k);
    if (n === undefined) { n = LineasDatos.normCol(k); normalizados_.set(k, n); }
    return n;
  };

  /** Valor de una columna tolerando espacios y mayúsculas en el encabezado. */
  function col(fila, nombre) {
    if (nombre in fila) return fila[nombre];
    const buscado = norm_(nombre);
    for (const k in fila) {
      if (norm_(k) === buscado) return fila[k];
    }
    return undefined;
  }

  function mesNumero(v) {
    if (typeof v === 'number') return v;
    const i = MESES.indexOf(String(v || '').toUpperCase().trim());
    return i >= 0 ? i + 1 : Number(v) || null;
  }

  /** Serializa para google.script.run (Date → texto ISO; un Date crudo en arreglos llega como null). */
  function paraCliente(obj) {
    return JSON.parse(JSON.stringify(obj === undefined ? null : obj));
  }

  /** NUCO → id de su carpeta en NUCOS de producción (solo lectura; caché 6 h). Sin acceso: {} y la ficha no muestra el enlace. */
  function carpetasNucos() {
    try { return LineasArchivos.carpetasNucos(); } catch (e) { console.warn('carpetasNucos: ' + e.message); return {}; }
  }

  return { txt, digitos, nuco4, nucoVisible, fecha, numero, col, mesNumero, paraCliente, carpetasNucos };
})();

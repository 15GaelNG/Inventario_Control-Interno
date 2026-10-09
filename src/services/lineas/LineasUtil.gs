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

  /**
   * Abreviaturas de Capital Humano que se muestran con su nombre completo (confirmadas por el usuario el 2-oct-2026;
   * solo las 100 % seguras: OOAM, GPH, las oficinas en clave e ILLINIOS se quedan como vienen). En la hoja se guarda
   * como lo escribe CH ("QRO"); el sistema lo muestra completo ("QUERETARO"). Va por columna: "ADMINISTRACION DE
   * OFICINAS" también es un DEPARTAMENTO de CH y ese no se toca. Ver migracion/PLAN_REESTRUCTURA_LINEAS.md §3.5.
   */
  const ABREVIATURAS_CH = {
    'SEDE': { 'QRO': 'QUERETARO', 'SLP': 'SAN LUIS POTOSI', 'EDO. MEXICO': 'ESTADO DE MEXICO' },
    'AREA': { 'ADMON DE OFICINAS': 'ADMINISTRACION DE OFICINAS' },
  };
  /**
   * En OFICINA / DESARROLLO la abreviatura va DENTRO del nombre ("CARRANZA SLP", "CALZADA DEL VALLE - MTY", "AGS"):
   * se cambia como palabra suelta, separada por espacio, guion, diagonal, paréntesis o coma. Las claves que solo la
   * contienen (CMSLP, CDMAGS.OC5, TX.MTY) no se tocan. Confirmadas por el usuario el 3-oct-2026.
   */
  const PALABRAS_CH = {
    'OFICINA/DESARROLLO': { 'AGS': 'AGUASCALIENTES', 'MTY': 'MONTERREY', 'SLP': 'SAN LUIS POTOSI' },
  };
  const invertir_ = (m) => Object.keys(m).reduce((o, c) => {
    o[c] = {};
    Object.keys(m[c]).forEach((ab) => { o[c][m[c][ab]] = ab; });
    return o;
  }, {});
  const NOMBRES_CH = invertir_(ABREVIATURAS_CH);
  const PALABRAS_NOMBRE_CH = invertir_(PALABRAS_CH);
  // "OFICINA / DESARROLLO" (inventario) y "OFICINA/DESARROLLO" (COLABORADORES) son la misma columna
  const columnaCH_ = (columna) => String(columna || '').split('|').pop().toUpperCase().replace(/\s+/g, '');
  const SEP_ = '[\\s\\-/(),]';
  const escRegex_ = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function cambiarPalabras_(valor, m) {
    let s = valor;
    Object.keys(m).sort((a, b) => b.length - a.length).forEach((de) => {
      s = s.replace(new RegExp('(^|' + SEP_ + ')' + escRegex_(de) + '(?=$|' + SEP_ + ')', 'gi'), (_, antes) => antes + m[de]);
    });
    return s;
  }

  /** Valor de la hoja → como se muestra ("QRO" → "QUERETARO", "CARRANZA SLP" → "CARRANZA SAN LUIS POTOSI"). */
  function mostrarCH(columna, valor) {
    if (typeof valor !== 'string') return valor;
    const c = columnaCH_(columna);
    if (PALABRAS_CH[c]) return cambiarPalabras_(valor, PALABRAS_CH[c]);
    const m = ABREVIATURAS_CH[c];
    return m ? m[valor.trim().toUpperCase()] || valor : valor;
  }

  /** Valor capturado → como se guarda, igual que CH ("QUERETARO" → "QRO"). Lo demás pasa igual. */
  function guardarCH(columna, valor) {
    if (typeof valor !== 'string') return valor;
    const c = columnaCH_(columna);
    if (PALABRAS_NOMBRE_CH[c]) return cambiarPalabras_(valor, PALABRAS_NOMBRE_CH[c]);
    const m = NOMBRES_CH[c];
    return m ? m[valor.trim().toUpperCase()] || valor : valor;
  }

  /**
   * PIN del equipo (usuario, 7-oct): con el bloqueo «PIN» solo lleva números; la contraseña acepta todo. El tipo de bloqueo
   * es de la pantalla (PIN y contraseña van en la misma columna PIN EQUIPO): llega aparte, en `datos.bloqueo`. Editar, la
   * inspección y la responsiva; la pantalla hace lo mismo (errorPinBloqueo en lineas.html).
   */
  function exigirPinEquipo(datos) {
    // Obligatorio cuando el formulario tiene la lista y se ve (usuario, 9-oct); sin ella no llega (null)
    if (datos && datos.bloqueo === '') throw new Error('TIPO DE BLOQUEO DEL EQUIPO es obligatorio');
    const pin = String(((datos && datos.valores) || {})['PIN EQUIPO'] || '').trim();
    if (String((datos && datos.bloqueo) || '').trim().toUpperCase() === 'PIN' && pin && !/^\d+$/.test(pin)) throw new Error('PIN DEL EQUIPO: SOLO NUMEROS');
  }

  return { txt, digitos, nuco4, nucoVisible, fecha, numero, col, mesNumero, paraCliente, carpetasNucos, ABREVIATURAS_CH, PALABRAS_CH, mostrarCH, guardarCH, exigirPinEquipo };
})();

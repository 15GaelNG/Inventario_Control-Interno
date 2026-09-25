/**
 * LineasUtil.gs
 * Normalización de valores de la hoja del AppSheet (N/A, ceros de relleno, NUCO a 4 dígitos…)
 * y lectura del inventario de carpetas de evidencias (NUCOS) en Drive.
 *
 * Script Properties opcionales:
 *   LINEAS_DRIVE_CARPETA_RAIZ   carpeta con los inventarios JSON de NUCOS (inventario_NUCOS_*.json)
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

  /** Valor de una columna tolerando espacios y mayúsculas en el encabezado. */
  function col(fila, nombre) {
    if (nombre in fila) return fila[nombre];
    const buscado = LineasDatos.normCol(nombre);
    for (const k in fila) {
      if (LineasDatos.normCol(k) === buscado) return fila[k];
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

  /** Último inventario JSON de la carpeta NUCOS (lista plana de carpetas/archivos). */
  function leerInventarioNucos_() {
    const raiz = PropertiesService.getScriptProperties().getProperty('LINEAS_DRIVE_CARPETA_RAIZ');
    if (!raiz) return null;
    const archivos = DriveApp.getFolderById(raiz).getFilesByType('application/json');
    let ultimo = null;
    while (archivos.hasNext()) {
      const f = archivos.next();
      if (/^inventario_NUCOS_/.test(f.getName()) && (!ultimo || f.getDateCreated() > ultimo.getDateCreated())) ultimo = f;
    }
    return ultimo ? JSON.parse(ultimo.getBlob().getDataAsString()).elementos : null;
  }

  /** NUCO → id de su carpeta en NUCOS (del último inventario; caché 6 h). */
  function carpetasNucos() {
    // La carpeta NUCOS de producción (solo lectura); el inventario JSON queda de respaldo si no se puede leer
    try { return LineasArchivos.carpetasNucos(); } catch (e) { console.warn('carpetasNucos: ' + e.message); }
    let mapa = LineasDatos.cacheLeer('carpetas_nucos');
    if (mapa) return mapa;
    mapa = {};
    try {
      (leerInventarioNucos_() || []).forEach((x) => {
        if (x.nivel === 1 && x.mimeType === 'application/vnd.google-apps.folder' && /^\d+$/.test(x.name.trim())) {
          mapa[nuco4(x.name)] = x.id;
        }
      });
    } catch (e) {
      // Sin inventario accesible: la ficha simplemente no muestra el enlace a la carpeta.
    }
    LineasDatos.cacheGuardar('carpetas_nucos', mapa, 21600);
    return mapa;
  }

  return { txt, digitos, nuco4, fecha, numero, col, mesNumero, paraCliente, carpetasNucos };
})();

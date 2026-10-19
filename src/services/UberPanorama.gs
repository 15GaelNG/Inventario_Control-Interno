/**
 * UberPanorama.gs
 * Panorama de Uber (control interno, 19-oct-2026): KPIs y gráficas sobre los viajes
 * justificados de Uber, leídos EN VIVO y SOLO LECTURA de "BD JUSTIFICACIONES UBER" -- la
 * lleva otra área (dueña: ejecutivogestionyadquisicionvehicular.ci@ciudadmaderas.com) y la
 * sigue alimentando cada semana. Este módulo NUNCA escribe ahí ni la mueve/renombra: si algún
 * día cambia de dueño o de ID, solo hay que actualizar SHEET_ID.
 *
 * Columnas reales de la pestaña "BASE UBER" (24): USUARIO FINAL, CLAVE, NOMBRE COMPLETO,
 * ID. DE VIAJE/PEDIDO, FECHA DE PEDIDO (LOCAL), HORA DE PEDIDO (LOCAL), FECHA DE LLEGADA
 * (LOCAL), HORA DE LLEGADA (LOCAL), OBSERVACIÓN, MOTIVO, AUTORIZACIÓN, JUSTIFICACIÓN,
 * DIRECCIÓN DEL PUNTO DE PARTIDA, DIRECCIÓN DE DESTINO, MONTO DE LA TRANSACCIÓN EN MXN (SE
 * INCLUYEN IMPUESTOS), MES, SEMANA, AÑO, CATEGORIA, SUBCATEGORIA, VEHICULO DISPONIBLE,
 * CANTIDAD DE VEHICULOS , RESULTADO, COMENTARIOS ANALISTA. El encabezado real no siempre está
 * en la fila 1 (ya ha traído una fila en blanco arriba): se busca por nombre, no por número de
 * fila fija.
 *
 * La pestaña "SEDES" trae el catálogo CLAVE → DEPARTAMENTO/SEDE: se usa aquí para dar dos
 * dimensiones (Departamento, Sede) en vez de una sola "CLAVE" mezclada. Lo que no tenga match
 * se queda con DEPARTAMENTO = CLAVE y SEDE = "SIN SEDE".
 *
 * AUTORIZACIÓN normalizada (hallazgo de control interno, 19-oct-2026): la hoja trae "SI", "SÍ",
 * "Sí" e "IS" (typo de transposición) como 4 valores distintos para la misma respuesta -- aquí
 * se fusionan en "SÍ". "NO"/"No"/"NO " se fusionan en "NO". Blanco → "SIN DATO"; "-" y
 * "AUTORIZADO POR DA" se respetan tal cual (no son lo mismo que "sí"/"no").
 */
const UberPanorama = (function () {
  // Hoja de alguien más (Drive): https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit
  const SHEET_ID = '1jN6nsx4qFOofu2jb3_dgSoUevbKW5vpFwXjoaXOYfN8';
  const HOJA_BASE = 'BASE UBER';
  const HOJA_SEDES = 'SEDES';
  const CLAVE_CACHE = 'uber_panorama_v1';
  const SEG_CACHE = 30 * 60;

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());

  function normalizaAutorizacion_(v) {
    const s = txt(v).toUpperCase();
    if (s === 'SI' || s === 'SÍ' || s === 'IS') return 'SÍ';
    if (s === 'NO') return 'NO';
    if (!s) return 'SIN DATO';
    return s; // '-', 'AUTORIZADO POR DA' u otro valor que aparezca
  }

  /** Monto: casi siempre ya es number (Sheets lo guarda así aunque lo muestre con coma decimal,
   *  solo formato); por si acaso llegara como texto ("$ 70,30" o "$ 1,234.56"). */
  function numero_(v) {
    if (typeof v === 'number') return v;
    const s = txt(v).replace(/[^0-9,.-]/g, '');
    if (!s) return null;
    const limpio = (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) ? s.replace(/,/g, '') : s.replace(',', '.');
    const n = Number(limpio);
    return isNaN(n) ? null : n;
  }

  /** La fila (1-based) donde la columna A dice `buscado`, buscando en las primeras `limite` filas. 0 si no está. */
  function filaConEncabezado_(hoja, buscado, limite) {
    const col = hoja.getRange(1, 1, Math.min(hoja.getLastRow(), limite), 1).getValues();
    for (let i = 0; i < col.length; i++) {
      if (txt(col[i][0]).toUpperCase() === buscado) return i + 1;
    }
    return 0;
  }

  /** { CLAVE: { DEPARTAMENTO, SEDE } }; {} si la pestaña no existe o no se encuentra su encabezado. */
  function sedesPorClave_(ss) {
    const mapa = {};
    const hoja = ss.getSheetByName(HOJA_SEDES);
    if (!hoja) return mapa;
    const filaEnc = filaConEncabezado_(hoja, 'CLAVE', 10);
    if (!filaEnc) return mapa;
    const encabezados = hoja.getRange(filaEnc, 1, 1, hoja.getLastColumn()).getValues()[0].map((h) => txt(h).toUpperCase());
    const iClave = encabezados.indexOf('CLAVE');
    const iDepto = encabezados.indexOf('DEPARTAMENTO');
    const iSede = encabezados.indexOf('SEDE');
    const ultima = hoja.getLastRow();
    if (ultima <= filaEnc) return mapa;
    hoja.getRange(filaEnc + 1, 1, ultima - filaEnc, hoja.getLastColumn()).getValues().forEach((f) => {
      const clave = txt(f[iClave]).toUpperCase();
      if (clave) mapa[clave] = { DEPARTAMENTO: txt(f[iDepto]) || clave, SEDE: txt(f[iSede]) || '' };
    });
    return mapa;
  }

  function calcular_() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const hoja = ss.getSheetByName(HOJA_BASE);
    if (!hoja) throw new Error('No se encontró la pestaña "' + HOJA_BASE + '" en la hoja de Uber (¿le cambiaron el nombre?)');
    const filaEnc = filaConEncabezado_(hoja, 'USUARIO FINAL', 20);
    if (!filaEnc) throw new Error('No se encontró el encabezado "USUARIO FINAL" en "' + HOJA_BASE + '"');
    const encabezados = hoja.getRange(filaEnc, 1, 1, hoja.getLastColumn()).getValues()[0].map((h) => txt(h).toUpperCase());
    const ix = (nombre) => encabezados.indexOf(nombre);
    const iClave = ix('CLAVE');
    const iNombre = ix('NOMBRE COMPLETO');
    const iFecha = ix('FECHA DE PEDIDO (LOCAL)');
    const iAutorizacion = ix('AUTORIZACIÓN');
    const iMonto = ix('MONTO DE LA TRANSACCIÓN EN MXN (SE INCLUYEN IMPUESTOS)');
    const iMes = ix('MES');
    const iSemana = ix('SEMANA');
    const iCategoria = ix('CATEGORIA');
    const iVehiculoDisp = ix('VEHICULO DISPONIBLE');
    const iCantidadVeh = encabezados.findIndex((h) => h.indexOf('CANTIDAD DE VEHICULOS') === 0);
    const iResultado = ix('RESULTADO');

    const sedes = sedesPorClave_(ss);
    const ultimaFila = hoja.getLastRow();
    const datos = ultimaFila > filaEnc ? hoja.getRange(filaEnc + 1, 1, ultimaFila - filaEnc, hoja.getLastColumn()).getValues() : [];

    const filas = [];
    datos.forEach((f) => {
      if (f.every((v) => v === '' || v === null)) return; // relleno al final de la hoja, no es un viaje
      const clave = txt(f[iClave]).toUpperCase();
      const s = sedes[clave] || { DEPARTAMENTO: clave || 'SIN CLAVE', SEDE: '' };
      filas.push({
        CLAVE: clave || 'SIN CLAVE',
        DEPARTAMENTO: s.DEPARTAMENTO,
        SEDE: s.SEDE || 'SIN SEDE',
        NOMBRE_COMPLETO: txt(f[iNombre]) || 'SIN DATO',
        CATEGORIA: txt(f[iCategoria]).toUpperCase() || 'SIN CATEGORÍA',
        ESTATUS: txt(f[iResultado]).toUpperCase() || 'SIN ESTATUS',
        AUTORIZACION: normalizaAutorizacion_(f[iAutorizacion]),
        MES: txt(f[iMes]).toUpperCase() || 'SIN MES',
        SEMANA: txt(f[iSemana]).toUpperCase() || 'SIN SEMANA',
        MONTO: numero_(f[iMonto]),
        VEHICULO_DISPONIBLE: txt(f[iVehiculoDisp]).toUpperCase() || 'SIN DATO',
        CANTIDAD_VEHICULOS: iCantidadVeh !== -1 && f[iCantidadVeh] !== '' ? Number(f[iCantidadVeh]) : null,
        FECHA_PEDIDO: f[iFecha] instanceof Date ? f[iFecha].toISOString() : txt(f[iFecha]),
      });
    });

    return { generadoEn: new Date(), total: filas.length, filas: filas };
  }

  /** Panorama con caché de 30 min (`forzar` la rehace) -- la hoja la alimentan cada semana, no hace falta leerla en vivo cada vez. */
  function panorama(token, forzar) {
    Permisos.puedeLeer(token, 'panorama-uber');
    if (!forzar) {
      const enCache = CacheHojas.leer(CLAVE_CACHE);
      if (enCache) return enCache;
    }
    const r = calcular_();
    CacheHojas.guardar(CLAVE_CACHE, r, SEG_CACHE);
    return r;
  }

  return { panorama };
})();

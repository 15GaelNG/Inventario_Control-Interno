/**
 * Un libro de Google Sheets en memoria, con la parte de SpreadsheetApp que usan los pasos de
 * la migración (MigracionIds.gs). Sirve de ORÁCULO: corre el código de Apps Script tal cual
 * sobre un JSON, para comparar celda por celda contra el port de Python
 * (tools/migracion/libro.py, LibroMemoria), que lee y escribe el MISMO formato.
 *
 * Formato del JSON (igual en los dos lados):
 *
 *   {
 *     "id": "LIBRO", "nombre": "Inventario Reemplazable", "sellado": false,
 *     "hojas": {
 *       "VEHICULOS": { "valores": [["ID_VEHICULO", "FOLIO"], ["E5818DE5", "CTA0100"], []],
 *                      "maxFilas": 1000, "maxColumnas": 26, "texto": [3] }
 *     }
 *   }
 *
 *   valores      renglones de arriba a abajo, el primero es el encabezado. Pueden venir
 *                disparejos (la API de Sheets corta las celdas vacías del final): lo que
 *                falta es ''.
 *   maxFilas/    el tamaño de la rejilla (getMaxRows/getMaxColumns), que no es lo mismo que
 *   maxColumnas  lo que tiene datos (getLastRow/getLastColumn).
 *   texto        columnas (base 1) con formato de texto '@'. Se compara en la paridad: una
 *                columna de IDs sin él es la que perdió un cero a la izquierda.
 */

const vacio = (v) => v === '' || v === null || v === undefined;

function hojaEnMemoria(nombre, def) {
  const filas = (def.valores || []).map((f) => f.slice());
  let maxFilas = Math.max(def.maxFilas || 0, filas.length, 1);
  let maxCols = Math.max(def.maxColumnas || 0, ...filas.map((f) => f.length), 1);
  const texto = new Set(def.texto || []);

  const celda = (r, c) => {
    const f = filas[r - 1];
    if (!f) return '';
    const v = f[c - 1];
    return vacio(v) ? '' : v;
  };
  const poner = (r, c, v) => {
    if (r > maxFilas || c > maxCols) {
      throw new Error('Fuera de la rejilla de "' + nombre + '": fila ' + r + ', columna ' + c +
        ' (la hoja mide ' + maxFilas + ' × ' + maxCols + ')');
    }
    while (filas.length < r) filas.push([]);
    const f = filas[r - 1];
    while (f.length < c) f.push('');
    f[c - 1] = vacio(v) ? '' : v;
  };
  const ultimaFila = () => {
    for (let r = filas.length; r >= 1; r--) {
      if (filas[r - 1].some((v) => !vacio(v))) return r;
    }
    return 0;
  };
  const ultimaColumna = () => {
    let m = 0;
    filas.forEach((f) => {
      for (let c = f.length; c > m; c--) {
        if (!vacio(f[c - 1])) { m = c; break; }
      }
    });
    return m;
  };

  const hoja = {
    getName: () => nombre,
    getLastRow: ultimaFila,
    getLastColumn: ultimaColumna,
    getMaxRows: () => maxFilas,
    getMaxColumns: () => maxCols,
    getRange: (r, c, nr, nc) => {
      nr = nr || 1; nc = nc || 1;
      return {
        getColumn: () => c,
        getRow: () => r,
        getValues: () => {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const f = [];
            for (let j = 0; j < nc; j++) f.push(celda(r + i, c + j));
            out.push(f);
          }
          return out;
        },
        getValue: () => celda(r, c),
        setValues: (vals) => {
          if (vals.length !== nr || vals.some((f) => f.length !== nc)) {
            throw new Error('setValues: el tamaño de los datos no coincide con el del rango');
          }
          vals.forEach((f, i) => f.forEach((v, j) => poner(r + i, c + j, v)));
        },
        setValue: (v) => poner(r, c, v),
        setNumberFormat: (fmt) => {
          if (fmt === '@') for (let j = 0; j < nc; j++) texto.add(c + j);
        },
        setFontWeight: () => {},
      };
    },
    insertColumnsAfter: (despuesDe, cuantas) => {
      // Las columnas nuevas entran vacías y recorren a la derecha lo que había
      filas.forEach((f) => {
        if (f.length > despuesDe) f.splice(despuesDe, 0, ...new Array(cuantas).fill(''));
      });
      const corridas = [...texto].map((c) => (c > despuesDe ? c + cuantas : c));
      texto.clear(); corridas.forEach((c) => texto.add(c));
      maxCols += cuantas;
    },
    deleteColumn: (pos) => {
      filas.forEach((f) => { if (f.length >= pos) f.splice(pos - 1, 1); });
      const corridas = [...texto].filter((c) => c !== pos).map((c) => (c > pos ? c - 1 : c));
      texto.clear(); corridas.forEach((c) => texto.add(c));
      maxCols -= 1;
    },
    /**
     * moveColumns(rango, destino): como Apps Script, `destino` es la posición (base 1) ANTES
     * de la cual queda la columna, contada sobre la hoja original. Solo se usa con destino 1.
     */
    moveColumns: (rango, destino) => {
      const desde = rango.getColumn();
      const hacia = destino > desde ? destino - 1 : destino;
      filas.forEach((f) => {
        while (f.length < desde) f.push('');
        const [v] = f.splice(desde - 1, 1);
        f.splice(hacia - 1, 0, v);
      });
      const tenia = texto.has(desde);
      const corridas = [...texto].filter((c) => c !== desde).map((c) => {
        let x = c > desde ? c - 1 : c;
        return x >= hacia ? x + 1 : x;
      });
      texto.clear(); corridas.forEach((c) => texto.add(c));
      if (tenia) texto.add(hacia);
    },
    setFrozenRows: () => {},
    /** Para escribir el JSON de salida */
    _aJson: () => {
      const ult = ultimaFila();
      const valores = filas.slice(0, ult).map((f) => {
        const g = f.map((v) => (vacio(v) ? '' : v));
        while (g.length && g[g.length - 1] === '') g.pop();
        return g;
      });
      return { valores, maxFilas, maxColumnas: maxCols, texto: [...texto].sort((a, b) => a - b) };
    },
  };
  return hoja;
}

function libroEnMemoria(def) {
  const hojas = {};
  Object.keys(def.hojas || {}).forEach((n) => { hojas[n] = hojaEnMemoria(n, def.hojas[n]); });
  return {
    getId: () => def.id,
    getName: () => def.nombre,
    getSheetByName: (n) => hojas[n] || null,
    getSheets: () => Object.keys(hojas).map((n) => hojas[n]),
    _aJson: () => {
      const out = { id: def.id, nombre: def.nombre, sellado: !!def.sellado, hojas: {} };
      Object.keys(hojas).forEach((n) => { out.hojas[n] = hojas[n]._aJson(); });
      return out;
    },
  };
}

/**
 * Generador con semilla (mulberry32). El MISMO algoritmo está en tools/migracion/ids.py
 * (Azar): con la misma semilla, los dos lados sacan los mismos IDs, y la paridad puede
 * exigir celdas idénticas en vez de "con la misma forma".
 */
function mulberry32(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { libroEnMemoria, hojaEnMemoria, mulberry32 };

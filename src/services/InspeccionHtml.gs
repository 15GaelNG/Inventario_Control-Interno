/**
 * InspeccionHtml.gs — los datos de una inspección vehicular para su documento HTML (11-nov-2026).
 *
 * Una sola plantilla (src/html/pdf/inspeccion-vehicular.html) para los 18 tipos de unidad: lo que cambia por tipo está en
 * el catálogo (src/config/InspeccionFormatos.gs, generado de las plantillas de Docs) y aquí se vuelve datos:
 *   - cada sección, una lista [{ etiqueta, valor }] en el orden del formato (los moldes {{#CADA SECCION}});
 *   - las llantas [{ etiqueta, valor, color }]; con semáforo vertical (4 o más llantas) la primera va aparte
 *     (LLANTA1 …, comparte renglón con el semáforo, que baja FILAS SEMAFORO renglones) y las demás en LLANTAS RESTO;
 *   - el color del voltaje, el ícono del vehículo y la barra de voltaje (con su recorte), y qué vista va en cada lugar
 *     de los diagramas (DIAGRAMA 1…4 = el nombre de la columna de la imagen).
 * Lo que en el Doc eran fórmulas <<IF(…)>> (los colores de la llanta y del voltaje) se calcula aquí, sin huecos entre
 * rangos: la plantilla de Docs decía ≤1.6 / 1.7–4.0 / ≥4.1 y un 1.65 no salía.
 *
 * Sin Drive ni hojas: también corre en node (tests/pdf-html.test.cjs, tools/pdf/html/local.js).
 */
const InspeccionHtml = (function () {
  const ROJO = '#ff0000';
  const AMARILLO = '#fcd618';
  const VERDE = '#38761d';
  const NEGRO = '#000000';

  /** El valor de una columna de la fila: tal cual o sin distinguir mayúsculas ni espacios de más */
  function valor_(fila, columna) {
    if (fila[columna] !== undefined) return fila[columna];
    const b = String(columna).toUpperCase().replace(/\s+/g, ' ').trim();
    const k = Object.keys(fila).filter((x) => String(x).toUpperCase().replace(/\s+/g, ' ').trim() === b)[0];
    return k === undefined || fila[k] == null ? '' : fila[k];
  }

  function numero_(v) {
    const t = String(v == null ? '' : v).replace(',', '.').trim();
    const n = parseFloat(t);
    return t === '' || isNaN(n) ? null : n;
  }

  /** Profundidad de la llanta (mm): menos de 1.7 rojo, hasta 4.0 amarillo, más verde */
  function colorLlanta(v) {
    const n = numero_(v);
    if (n === null) return NEGRO;
    return n < 1.7 ? ROJO : n <= 4.0 ? AMARILLO : VERDE;
  }

  /** Voltaje de la batería: menos de 12.4 rojo, hasta 12.6 amarillo, más verde */
  function colorVoltaje(v) {
    const n = numero_(v);
    if (n === null) return NEGRO;
    return n < 12.4 ? ROJO : n <= 12.6 ? AMARILLO : VERDE;
  }

  /**
   * @param {Object} fila  la fila de INSPECCION VEHICULAR (columnas → valores)
   * @param {string} tipo  el TIPO de la unidad (hoja MODELOS INSPECCION)
   * @return {Object} la fila más lo que pide la plantilla
   */
  function datos(fila, tipo) {
    const f = InspeccionFormatos.de(tipo);
    if (!f) throw new Error('El tipo "' + tipo + '" no tiene formato HTML (InspeccionFormatos.gs)');
    const d = Object.assign({}, fila);

    Object.keys(f.secciones).forEach((s) => {
      d[s] = f.secciones[s].map(([etiqueta, columna]) => ({ etiqueta: etiqueta, valor: valor_(fila, columna) }));
    });

    const llantas = f.llantas.map(([etiqueta, columna]) => {
      const v = valor_(fila, columna);
      return { etiqueta: etiqueta, valor: v, color: colorLlanta(v) };
    });
    d['LLANTAS'] = llantas;
    d['SEMAFORO VERTICAL'] = f.semaforoVertical ? 'SI' : '';
    if (f.semaforoVertical) {
      const primera = llantas[0] || { etiqueta: '', valor: '', color: NEGRO };
      d['LLANTA1 ETIQUETA'] = primera.etiqueta;
      d['LLANTA1 VALOR'] = primera.valor;
      d['LLANTA1 COLOR'] = primera.color;
      d['LLANTAS RESTO'] = llantas.slice(1);
      // El semáforo baja por las llantas, el renglón de títulos, las piezas de Neumáticos y el de cierre
      d['FILAS SEMAFORO'] = llantas.length + (f.secciones['NEUMATICOS'] || []).length + 2;
    } else {
      d['LLANTA1 ETIQUETA'] = d['LLANTA1 VALOR'] = '';
      d['LLANTA1 COLOR'] = NEGRO;
      d['LLANTAS RESTO'] = [];
      d['FILAS SEMAFORO'] = 1;
    }

    d['VOLTAJE COLOR'] = colorVoltaje(valor_(fila, 'VOLTAJE'));

    ['W', 'H', 'IW', 'IH', 'X', 'Y'].forEach((k) => {
      d['ICONO ' + k] = f.icono[k.toLowerCase()];
      d['BATERIA ' + k] = f.bateria[k.toLowerCase()];
    });
    d['ICONO LOGO'] = f.icono.logo;

    [0, 1, 2, 3].forEach((i) => { d['DIAGRAMA ' + (i + 1)] = f.diagramas[i] || ''; });
    return d;
  }

  return { datos, colorLlanta, colorVoltaje };
})();

/**
 * Cronometro.gs
 * Cuánto tarda cada paso de algo lento (generar un PDF, armar una lista), para optimizar con números y no a ojo
 * (5-nov, plan del motor único de PDF: fase 0). Medir nunca cambia el resultado ni lo tumba.
 *
 *   const c = Cronometro.iniciar('pdf RESPONSIVA RESP-123', (paso, ms) => …);   // el segundo argumento es opcional
 *   …copiar…   c.marcar('copiar');
 *   …convertir… c.marcar('convertir');
 *   c.tiempos()  → [{ paso: 'copiar', ms: 812 }, { paso: 'convertir', ms: 2310 }]
 *   c.anotar()   → una línea en el registro de ejecuciones:
 *                  [tiempo] pdf RESPONSIVA RESP-123 · total 3122 ms · copiar 812 · convertir 2310
 *
 * Cada marca mide desde la marca anterior (o desde iniciar). Nada corre al cargar.
 *
 * anotar() además guarda la medición en la caché del proyecto (las últimas 60, 6 h), para no tener que abrir cada
 * ejecución: en el editor, `cronometroResumen()` (este archivo) deja todas juntas en el registro, listas para copiar.
 * Dos que terminan al mismo tiempo pueden pisarse en la caché (se pierde una); para medir, da igual.
 */
const Cronometro = (function () {
  const CLAVE_ = 'cronometro_ultimos';
  const MAXIMO_ = 60;
  const SEGUNDOS_ = 6 * 60 * 60;

  function guardar_(registro) {
    const cache = CacheService.getScriptCache();
    let lista = [];
    try { lista = JSON.parse(cache.get(CLAVE_) || '[]'); } catch (e) { lista = []; }
    lista.push(registro);
    cache.put(CLAVE_, JSON.stringify(lista.slice(-MAXIMO_)), SEGUNDOS_);
  }

  /** Las mediciones guardadas, de la más vieja a la más nueva: [{ fecha, nombre, total, pasos: [{ paso, ms }] }] */
  function ultimos() {
    try { return JSON.parse(CacheService.getScriptCache().get(CLAVE_) || '[]'); } catch (e) { return []; }
  }

  function iniciar(nombre, alMarcar) {
    const inicio = Date.now();
    let ultimo = inicio;
    const pasos = [];
    const total = () => Date.now() - inicio;
    const linea = () => '[tiempo] ' + nombre + ' · total ' + total() + ' ms' +
      pasos.map((p) => ' · ' + p.paso + ' ' + p.ms).join('');
    return {
      marcar(paso) {
        const ahora = Date.now();
        const ms = ahora - ultimo;
        ultimo = ahora;
        pasos.push({ paso: paso, ms: ms });
        if (alMarcar) {
          try { alMarcar(paso, ms); } catch (e) { /* medir nunca tumba lo que se mide */ }
        }
        return ms;
      },
      tiempos: () => pasos.slice(),
      total: total,
      linea: linea,
      anotar: () => {
        try { console.log(linea()); } catch (e) { /* sin consola: nada */ }
        try {
          guardar_({ fecha: new Date(inicio).toISOString(), nombre: nombre, total: total(), pasos: pasos.slice() });
        } catch (e) { /* sin caché (pruebas, cuota): solo queda la línea */ }
      },
    };
  }

  /**
   * Texto para copiar: una línea por medición y, al final, el promedio de cada paso por tipo de documento
   * (el nombre hasta el primer número o ID: «pdf RESPONSIVA», «pdf INSPECCION JUAN…» se agrupa por sus dos primeras palabras).
   */
  function resumen(lista) {
    const mediciones = lista || ultimos();
    if (!mediciones.length) return 'Sin mediciones en las últimas 6 h: genera algún PDF y vuelve a correr cronometroResumen().';
    const grupoDe = (nombre) => String(nombre).split(' ').slice(0, 2).join(' ');
    const grupos = {};
    mediciones.forEach((m) => {
      const g = grupos[grupoDe(m.nombre)] || (grupos[grupoDe(m.nombre)] = { n: 0, total: 0, pasos: {} });
      g.n++;
      g.total += m.total;
      (m.pasos || []).forEach((p) => { g.pasos[p.paso] = (g.pasos[p.paso] || 0) + p.ms; });
    });
    const lineas = mediciones.map((m) => m.fecha.slice(11, 19) + ' · ' + m.nombre + ' · total ' + m.total + ' ms' +
      (m.pasos || []).map((p) => ' · ' + p.paso + ' ' + p.ms).join(''));
    lineas.push('', 'PROMEDIOS (ms)');
    Object.keys(grupos).forEach((nombre) => {
      const g = grupos[nombre];
      const pasos = Object.keys(g.pasos).sort((a, b) => g.pasos[b] - g.pasos[a])
        .map((p) => p + ' ' + Math.round(g.pasos[p] / g.n));
      lineas.push(nombre + ' (' + g.n + ') · total ' + Math.round(g.total / g.n) + ' · ' + pasos.join(' · '));
    });
    return lineas.join('\n');
  }

  return { iniciar, ultimos, resumen };
})();

/**
 * Desde el editor: todas las mediciones de las últimas 6 h (PDF de Vehículos, Líneas y Arqueos) en el registro de
 * ejecución, para copiarlas de una vez. Solo lee la caché.
 */
function cronometroResumen() {
  soloEditor_();
  const texto = Cronometro.resumen();
  console.log(texto);
  return texto;
}

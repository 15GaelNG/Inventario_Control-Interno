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
 */
const Cronometro = (function () {
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
      anotar: () => { try { console.log(linea()); } catch (e) { /* sin consola: nada */ } },
    };
  }

  return { iniciar };
})();

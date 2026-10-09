/**
 * CacheHojas.gs
 * Caché del servidor que se invalida sola cuando cambia la hoja de la que sale.
 *
 * Cada hoja tiene una "versión" (un token en CacheService). Escribir en ella le pone una
 * versión nueva (tocar). Lo que se guarda con recordar() lleva en su clave las versiones de
 * las hojas de las que depende: si alguna cambió, la clave ya es otra y se vuelve a armar.
 * Nadie tiene que acordarse de borrar nada a mano.
 *
 *   const filas = CacheHojas.recordar('veh_resumen', [[ssId, 'VEHICULOS']], () => armarFilas());
 *
 * Dónde se toca: SheetUtils (insert/update/remove/removeMany), LineasDatos (actualizarFila/
 * agregarFilas) y los pocos que escriben directo en una hoja. Lo que se escribe FUERA de la
 * app (AppSheet, alguien en la hoja a mano) no toca nada: por eso todo vence a los
 * SEG_DEFECTO segundos, que es lo más que tarda en verse.
 *
 * Los valores se guardan como JSON con gzip, en trozos de 90 KB (CacheService acepta 100 KB
 * por valor). Ojo: al pasar por JSON, las fechas (Date) salen como texto ISO.
 */

const CacheHojas = (function () {
  const SEG_VERSION = 21600;   // 6 h, lo más que guarda CacheService
  const SEG_DEFECTO = 600;     // 10 min: lo más que tarda en verse una escritura de fuera
  const TROZO = 90000;

  const cache = () => CacheService.getScriptCache();
  const versionesEnEjecucion = {};   // cada llamada de google.script.run empieza de cero
  const anotando_ = [];              // calculos() en curso: qué versiones de hoja consultan

  const claveVersion_ = (ssId, hoja) => 'ver_' + String(ssId).slice(0, 10) + '_' + String(hoja).trim().toUpperCase();
  const nuevaVersion_ = () => Utilities.getUuid().slice(0, 8);

  /** Versiones de varias hojas [[ssId, hoja], …] en una sola ida a CacheService */
  function versiones(hojas) {
    const claves = hojas.map((h) => claveVersion_(h[0], h[1]));
    const faltan = claves.filter((k) => !versionesEnEjecucion[k]);
    if (faltan.length) {
      const guardadas = cache().getAll(faltan);
      const nuevas = {};
      faltan.forEach((k) => {
        versionesEnEjecucion[k] = guardadas[k] || (nuevas[k] = nuevaVersion_());
      });
      if (Object.keys(nuevas).length) cache().putAll(nuevas, SEG_VERSION);
    }
    anotando_.forEach((deps) => claves.forEach((k) => { deps[k] = versionesEnEjecucion[k]; }));
    return claves.map((k) => versionesEnEjecucion[k]);
  }

  /** La hoja cambió: todo lo que dependa de ella se vuelve a armar en la siguiente lectura */
  function tocar(ssId, hoja) {
    try {
      const k = claveVersion_(ssId, hoja);
      versionesEnEjecucion[k] = nuevaVersion_();
      cache().put(k, versionesEnEjecucion[k], SEG_VERSION);
    } catch (e) { /* sin caché, nada que invalidar */ }
  }

  /** tocar() para quien ya tiene la hoja en la mano (las escrituras directas, fuera de SheetUtils) */
  function tocarHoja(hoja) {
    try { tocar(hoja.getParent().getId(), hoja.getName()); } catch (e) { /* no-op */ }
  }

  // ---------------------------------------------------------------- guardar en trozos

  function guardar(clave, obj, segundos) {
    try {
      const texto = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(obj), 'application/json')).getBytes());
      const trozos = {};
      const n = Math.ceil(texto.length / TROZO);
      for (let i = 0; i < n; i++) trozos[clave + '_' + i] = texto.slice(i * TROZO, (i + 1) * TROZO);
      trozos[clave + '_n'] = String(n);
      cache().putAll(trozos, segundos || SEG_DEFECTO);
      return true;
    } catch (e) {
      return false;   // si no cabe, simplemente se vuelve a leer de la hoja
    }
  }

  function leer(clave) {
    try {
      const n = Number(cache().get(clave + '_n'));
      if (!n) return null;
      const claves = [];
      for (let i = 0; i < n; i++) claves.push(clave + '_' + i);
      const valores = cache().getAll(claves);
      if (Object.keys(valores).length !== n) return null;
      const bytes = Utilities.base64Decode(claves.map((c) => valores[c]).join(''));
      return JSON.parse(Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString());
    } catch (e) {
      return null;
    }
  }

  function borrar(clave) {
    try {
      const n = Number(cache().get(clave + '_n')) || 0;
      const claves = [clave + '_n'];
      for (let i = 0; i < n; i++) claves.push(clave + '_' + i);
      cache().removeAll(claves);
    } catch (e) { /* no-op */ }
  }

  /**
   * Lo que devuelve armar(), guardado mientras ninguna de `hojas` cambie (y a lo más
   * `segundos`). hojas: [[ssId, 'NOMBRE'], …] — TODAS las que lee armar().
   */
  function recordar(clave, hojas, armar, segundos, rehacer) {
    let k;
    try {
      k = 'rec_' + clave + '_' + versiones(hojas).join('.');
    } catch (e) {
      return armar();   // sin CacheService (o falla): como si no hubiera caché
    }
    if (!rehacer) {
      const guardado = leer(k);
      if (guardado) return guardado.v;
    }
    // Se regresa ya pasado por JSON, igual que cuando sale de la caché: si no, la primera
    // vez saldría una Date y las demás un texto, y quien la use fallaría solo a veces
    const valor = JSON.parse(JSON.stringify({ v: armar() })).v;
    guardar(k, { v: valor }, segundos);
    return valor;
  }

  /**
   * Un resultado calculado a partir de otras listas (el Inicio, la campanita), guardado
   * mientras no cambie ninguna hoja que se haya consultado al calcularlo. No hay que decir
   * cuáles son: se anotan solas, porque cada lista que usa recordar() pasa por versiones().
   *
   *   CacheHojas.calculo('inicio_' + firmaDePermisos, () => armarResumen(), { guardarSi: (v) => … })
   *
   * Lo que no sale de recordar() (una lectura directa de la hoja) no se anota: si el cálculo
   * lee algo así, esa parte solo se refresca al vencer los `segundos`.
   * opciones.guardarSi(valor): false = no guardar (p. ej. una sección falló por algo pasajero).
   */
  function calculo(clave, armar, opciones) {
    const o = opciones || {};
    const k = 'calc_' + clave;
    try {
      const guardado = leer(k);
      if (guardado && guardado.deps) {
        const claves = Object.keys(guardado.deps);
        const actuales = claves.length ? cache().getAll(claves) : {};
        if (claves.every((c) => actuales[c] === guardado.deps[c])) {
          // Sale de la caché sin pasar por versiones(): quien esté anotando (conHuella) recibe sus dependencias
          anotando_.forEach((deps) => Object.assign(deps, guardado.deps));
          return guardado.v;
        }
      }
    } catch (e) { /* sin caché: se calcula */ }

    const deps = {};
    anotando_.push(deps);
    let valor;
    try {
      valor = JSON.parse(JSON.stringify({ v: armar() })).v;
    } finally {
      anotando_.splice(anotando_.indexOf(deps), 1);
    }
    if (!o.guardarSi || o.guardarSi(valor)) guardar(k, { v: valor, deps: deps }, o.segundos);
    return valor;
  }

  /**
   * Para que la pantalla se actualice sola: corre `armar` (una lista de la app) y anota de qué versiones de hoja
   * salió, igual que calculo(). La "huella" ({ver_…: versión}) viaja al navegador; después basta preguntar
   * vigentes(claves) —solo CacheService, ninguna hoja— para saber si algo cambió.
   */
  function conHuella(armar) {
    const deps = {};
    anotando_.push(deps);
    try {
      return { v: armar(), huella: deps };
    } finally {
      anotando_.splice(anotando_.indexOf(deps), 1);
    }
  }

  /**
   * Las versiones de hoy de esas claves de huella ('' si ya no están: venció la versión, se toma como cambio). Si
   * CacheService falla (DEADLINE_EXCEEDED, pasajero), {} sin claves: el vigía lo toma como "no se sabe" y no repide
   * nada; pregunta otra vez en la siguiente vuelta. Nunca truena: es una pregunta de fondo, cada minuto.
   */
  function vigentes(claves) {
    let actuales;
    try {
      actuales = claves.length ? cache().getAll(claves) : {};
    } catch (e) {
      console.warn('CacheHojas.vigentes: ' + e.message);
      return {};
    }
    const r = {};
    claves.forEach((k) => { r[k] = actuales[k] || ''; });
    return r;
  }

  return { recordar, calculo, conHuella, vigentes, tocar, tocarHoja, versiones, guardar, leer, borrar, SEG_DEFECTO };
})();

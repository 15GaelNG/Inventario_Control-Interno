/**
 * LineasPanorama.gs
 * Panorama de Líneas (pedido del área, 29-sep-2026): cuántos equipos y líneas hay por estatus hoy, y cuántos
 * había al cierre de cada mes.
 *
 * El histórico se reconstruye hacia atrás desde el estatus actual de cada fila de LINEAS TELEFONICAS con los cambios
 * de ESTATUS EQUIPO / ESTATUS LINEA de la bitácora CAMBIOS LINEAS TELEFONICAS (ANTES de cada cambio posterior al
 * cierre del mes). Supuestos, que la interfaz explica:
 *  - Antes del primer cambio registrado (abril de 2025 en producción) no hay bitácora: cada registro conserva hacia
 *    atrás el estatus que tenía antes de su primer cambio.
 *  - Un registro cuenta desde su FECHA REGISTRO (si la trae y es posterior al 2000).
 *  - Una fila borrada de la hoja no aparece en el histórico.
 * La bitácora puede tener el ID viejo del AppSheet (migración de IDs de la BD de pruebas): se busca por ID y por
 * ID APPSHEET.
 */
const LineasPanorama = (function () {
  const CLAVE_CACHE = 'ln_panorama_v1';
  const SEG_CACHE = 30 * 60;
  const MAX_MESES = 36;

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const estatus = (v) => txt(v).toUpperCase() || 'SIN ESTATUS';
  const zona = () => LineasDatos.ZONA_APP;
  const mesDe = (d) => Utilities.formatDate(d, zona(), 'yyyy-MM');

  /** Último instante del mes "yyyy-MM" en hora de México (el día 1 del mes siguiente, menos 1 ms). */
  function finDeMes(ym) {
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    const siguiente = m === 12 ? (y + 1) + '-01' : y + '-' + ('0' + (m + 1)).slice(-2);
    return Utilities.parseDate(siguiente + '-01 00:00:00', zona(), 'yyyy-MM-dd HH:mm:ss').getTime() - 1;
  }

  function mesesEntre(desde, hasta) {
    const meses = [];
    let y = Number(desde.slice(0, 4));
    let m = Number(desde.slice(5, 7));
    const fin = hasta;
    while (y + '-' + ('0' + m).slice(-2) <= fin) {
      meses.push(y + '-' + ('0' + m).slice(-2));
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return meses.slice(-MAX_MESES);
  }

  /** Conteo { estatus: n }. */
  function contar(lista) {
    const c = {};
    lista.forEach((e) => { c[e] = (c[e] || 0) + 1; });
    return c;
  }

  /**
   * regs: [{ ids: [id, idAppSheet], actual, alta (ms|null) }] · eventos: { id: [{ t, antes }] } · meses: ['yyyy-MM']
   * · ahora (ms). Regresa { estatus: [conteo por mes] }. El último mes cierra "ahora" (coincide con hoy).
   */
  function historico(regs, eventos, meses, ahora) {
    const serie = {};
    // El último punto es hoy: cuenta todo (un cambio o una alta con fecha futura, error de captura, no lo mueve)
    const cierres = meses.map((ym, k) => (k === meses.length - 1 ? Infinity : finDeMes(ym)));
    regs.forEach((r) => {
      const evs = [];
      r.ids.forEach((id) => { (eventos[id] || []).forEach((e) => evs.push(e)); });
      evs.sort((a, b) => b.t - a.t);
      let estado = r.actual;
      let i = 0;
      for (let k = meses.length - 1; k >= 0; k--) {
        while (i < evs.length && evs[i].t > cierres[k]) { estado = evs[i].antes; i++; }
        if (r.alta && r.alta > cierres[k]) continue;
        if (!serie[estado]) serie[estado] = meses.map(() => 0);
        serie[estado][k]++;
      }
    });
    return serie;
  }

  function calcular() {
    const ahora = Date.now();
    const regs = { equipos: [], lineas: [] };
    LineasDatos.leerTabla(LineasRepo.TAB.LINEAS).forEach((f) => {
      const r = LineasRepo.convertirRegistro(f);
      if (!r) return;
      const alta = LineasUtil.col(f, 'FECHA REGISTRO');
      // FECHA REGISTRO válida: después del 2000 y no en el futuro (hay capturas con 1969 y 2027)
      const altaMs = alta instanceof Date && !isNaN(alta.getTime()) && alta.getFullYear() >= 2000 && alta.getTime() <= ahora ? alta.getTime() : null;
      const ids = [txt(r.id), txt(LineasUtil.col(f, 'ID APPSHEET'))].filter(Boolean);
      if (r.equipo) regs.equipos.push({ ids: ids, actual: estatus(r.equipo.estatus), alta: altaMs });
      if (r.linea) regs.lineas.push({ ids: ids, actual: estatus(r.linea.estatus), alta: altaMs });
    });

    const eventos = { equipos: {}, lineas: {} };
    let primera = null;
    let total = 0;
    LineasDatos.leerTabla(LineasRepo.TAB.CAMBIOS).forEach((c) => {
      const campo = LineasDatos.normCol(LineasUtil.col(c, 'CAMPO'));
      const tipo = campo === 'ESTATUS EQUIPO' ? 'equipos' : (campo === 'ESTATUS LINEA' ? 'lineas' : null);
      const cuando = LineasUtil.col(c, 'FECHA ACTUALIZACION');
      const id = txt(LineasUtil.col(c, 'ID_LINEA'));
      if (!tipo || !id || !(cuando instanceof Date) || isNaN(cuando.getTime())) return;
      (eventos[tipo][id] = eventos[tipo][id] || []).push({ t: cuando.getTime(), antes: estatus(LineasUtil.col(c, 'ANTES')) });
      if (!primera || cuando < primera) primera = cuando;
      total++;
    });

    const meses = mesesEntre(mesDe(primera || new Date(ahora)), mesDe(new Date(ahora)));
    const bloque = (tipo) => ({
      total: regs[tipo].length,
      actual: contar(regs[tipo].map((r) => r.actual)),
      historico: historico(regs[tipo], eventos[tipo], meses, ahora),
    });
    return {
      generadoEn: new Date(ahora), desde: primera, cambiosDeEstatus: total, meses: meses,
      equipos: bloque('equipos'), lineas: bloque('lineas'),
    };
  }

  /** Panorama con caché de 30 min (`forzar` la rehace). */
  function panorama(forzar) {
    if (!forzar) {
      const enCache = LineasDatos.cacheLeer(CLAVE_CACHE);
      if (enCache) return enCache;
    }
    const r = LineasUtil.paraCliente(calcular());
    LineasDatos.cacheGuardar(CLAVE_CACHE, r, SEG_CACHE);
    return r;
  }

  return { panorama, _historico: historico, _mesesEntre: mesesEntre };
})();

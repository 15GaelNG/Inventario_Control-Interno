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
  // v3 (1-oct): registros en columnas y estatus por mes comprimidos (la respuesta pesaba ~10 veces más)
  const CLAVE_CACHE = 'ln_panorama_v3';
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

  /** Cierre de cada mes en ms; el último es hoy y cuenta todo (un cambio o una alta con fecha futura no lo mueve). */
  function cierresDe(meses) {
    return meses.map((ym, k) => (k === meses.length - 1 ? Infinity : finDeMes(ym)));
  }

  /** Estatus de un registro al cierre de cada mes (null = todavía no estaba dado de alta). */
  function estadosPorMes(r, eventos, cierres) {
    const evs = [];
    r.ids.forEach((id) => { (eventos[id] || []).forEach((e) => evs.push(e)); });
    evs.sort((a, b) => b.t - a.t);
    const salida = cierres.map(() => null);
    let estado = r.actual;
    let i = 0;
    for (let k = cierres.length - 1; k >= 0; k--) {
      while (i < evs.length && evs[i].t > cierres[k]) { estado = evs[i].antes; i++; }
      if (!(r.alta && r.alta > cierres[k])) salida[k] = estado;
    }
    return salida;
  }

  /**
   * regs: [{ ids: [id, idAppSheet], actual, alta (ms|null) }] · eventos: { id: [{ t, antes }] } · meses: ['yyyy-MM']
   * · ahora (ms). Regresa { estatus: [conteo por mes] }. El último mes cierra "ahora" (coincide con hoy).
   */
  function historico(regs, eventos, meses, ahora) {
    const serie = {};
    const cierres = cierresDe(meses);
    regs.forEach((r) => {
      estadosPorMes(r, eventos, cierres).forEach((estado, k) => {
        if (estado === null) return;
        if (!serie[estado]) serie[estado] = meses.map(() => 0);
        serie[estado][k]++;
      });
    });
    return serie;
  }

  /** Compañía y razón social → TELCEL FRO | TELCEL GPH | AT&T | '' (todas las cuentas de AT&T facturan a FRO). */
  function cuentaDe(compania, razonSocial) {
    const c = txt(compania).toUpperCase();
    const r = txt(razonSocial).toUpperCase();
    if (/AT&T|ATT/.test(c)) return 'AT&T';
    if (/TELCEL/.test(c)) return /GPH|CONDOMINALES/.test(r) ? 'TELCEL GPH' : (/ROMITA|FRO/.test(r) ? 'TELCEL FRO' : 'TELCEL');
    return '';
  }

  /**
   * Estatus de cada mes en corridas: un número si fue el mismo todo el tiempo (casi siempre) o
   * [código, meses, código, meses, …]. Ej. [-1, 2, 0, 17] = no existía 2 meses y luego 17 en el estatus 0.
   */
  function comprimir(codigos) {
    if (codigos.every((c) => c === codigos[0])) return codigos[0];
    const rle = [];
    codigos.forEach((c) => {
      if (rle.length && rle[rle.length - 2] === c) rle[rle.length - 1]++;
      else rle.push(c, 1);
    });
    return rle;
  }

  /**
   * Los registros para que el Panorama calcule todo para el mes que se elija, en columnas (sin repetir nombres de
   * campo en cada uno de los ~2,600 renglones) y con textos repetidos como índices a una lista. Líneas: cuenta,
   * SIM básico, departamento, costo de plan, fin del adendum y estatus al cierre de cada mes (índices a `dic`).
   * El departamento, la cuenta y el costo son los de HOY (la bitácora no los reconstruye). La interfaz lo
   * desempaca con Lineas → expandirRegistros.
   */
  function registros(regs, eventos, meses) {
    const cierres = cierresDe(meses);
    const dic = [];
    const deps = [];
    const cuentas = [];
    const fechas = [];
    const indice = (lista, v) => { let i = lista.indexOf(v); if (i < 0) { lista.push(v); i = lista.length - 1; } return i; };
    const estados = (r) => comprimir(estadosPorMes(r, eventos, cierres).map((e) => (e === null ? -1 : indice(dic, e))));
    const columnas = (lista, campos) => {
      const c = {};
      Object.keys(campos).forEach((k) => { c[k] = lista.map(campos[k]); });
      return c;
    };
    return {
      dic: dic, deps: deps, cuentas: cuentas, fechas: fechas,
      lineas: columnas(regs.lineas, {
        c: (r) => indice(cuentas, r.cuenta), b: (r) => (r.basico ? 1 : 0), d: (r) => indice(deps, r.depto),
        p: (r) => r.costo, f: (r) => indice(fechas, r.fin), s: estados,
      }),
      equipos: columnas(regs.equipos, { d: (r) => indice(deps, r.depto), s: estados }),
    };
  }

  const COLS_CAMBIOS = ['CAMPO', 'FECHA ACTUALIZACION', 'ID_LINEA', 'ANTES'];
  const CLAVE_EVENTOS = 'ln_panorama_eventos_v1';
  const SEG_EVENTOS = 6 * 3600;
  /**
   * Cambios de estatus de la bitácora: { eventos: { equipos|lineas: { id: [[ms, antes]] } }, primera (ms), total }.
   * La bitácora es la pestaña más grande (un renglón por campo cambiado) y solo crece hacia abajo: lo leído se guarda
   * 6 h en caché con la última fila, y la siguiente vez (también con "Actualizar") solo se leen los renglones
   * nuevos, en sus 4 columnas. Se vuelve a leer completa si la pestaña tiene menos filas que las ya leídas, si sus
   * columnas cambiaron de lugar o al vencer la caché.
   */
  function eventosDeEstatus_() {
    const t = LineasDatos.tabla(LineasRepo.TAB.CAMBIOS);
    const ix = COLS_CAMBIOS.map((c) => LineasDatos.colIndice(t, c));
    const ultima = t.hoja.getLastRow();
    const cols = ix.join(',');
    let acc = LineasDatos.cacheLeer(CLAVE_EVENTOS);
    if (acc && (acc.cols !== cols || acc.fila > ultima)) acc = null;
    acc = acc || { cols: cols, fila: 1, total: 0, primera: null, eventos: { equipos: {}, lineas: {} } };
    const agregar = (fila) => {
      const campo = LineasDatos.normCol(fila[0]);
      const tipo = campo === 'ESTATUS EQUIPO' ? 'equipos' : (campo === 'ESTATUS LINEA' ? 'lineas' : null);
      const cuando = fila[1];
      const id = txt(fila[2]);
      if (!tipo || !id || !(cuando instanceof Date) || isNaN(cuando.getTime())) return;
      (acc.eventos[tipo][id] = acc.eventos[tipo][id] || []).push([cuando.getTime(), estatus(fila[3])]);
      if (acc.primera === null || cuando.getTime() < acc.primera) acc.primera = cuando.getTime();
      acc.total++;
    };
    if (ix.some((i) => i < 0)) { // pestaña sin alguna columna: lectura normal y sin caché
      LineasDatos.leerTabla(LineasRepo.TAB.CAMBIOS).forEach((f) => agregar(COLS_CAMBIOS.map((c) => LineasUtil.col(f, c))));
      return acc;
    }
    if (ultima > acc.fila) {
      const desde = Math.min.apply(null, ix);
      const hasta = Math.max.apply(null, ix);
      t.hoja.getRange(acc.fila + 1, desde + 1, ultima - acc.fila, hasta - desde + 1).getValues().forEach((v) => {
        const fecha = v[ix[1] - desde];
        agregar([v[ix[0] - desde], fecha instanceof Date ? LineasDatos.deHoraHoja(fecha) : fecha, v[ix[2] - desde], v[ix[3] - desde]]);
      });
      acc.fila = ultima;
      LineasDatos.cacheGuardar(CLAVE_EVENTOS, acc, SEG_EVENTOS);
    }
    return acc;
  }

  function calcular() {
    const ahora = Date.now();
    const ms = {}; // tiempos de cada paso (diagnóstico: se ven en la respuesta)
    let marca = ahora;
    const tomar = (paso) => { const t = Date.now(); ms[paso] = t - marca; marca = t; };
    const regs = { equipos: [], lineas: [] };
    // Utilities.formatDate cuesta ~1 ms por llamada y los fines de adendum se repiten mucho: uno por fecha distinta
    const dias = {};
    const diaDe = (d) => dias[d.getTime()] || (dias[d.getTime()] = Utilities.formatDate(d, zona(), 'yyyy-MM-dd'));
    const filasLineas = LineasDatos.leerTabla(LineasRepo.TAB.LINEAS);
    tomar('leerLineas');
    filasLineas.forEach((f) => {
      const r = LineasRepo.convertirRegistro(f);
      if (!r) return;
      const alta = LineasUtil.col(f, 'FECHA REGISTRO');
      // FECHA REGISTRO válida: después del 2000 y no en el futuro (hay capturas con 1969 y 2027)
      const altaMs = alta instanceof Date && !isNaN(alta.getTime()) && alta.getFullYear() >= 2000 && alta.getTime() <= ahora ? alta.getTime() : null;
      const ids = [txt(r.id)].concat(LineasDatos.idsDeFila(f)).filter((k, i, a) => k && a.indexOf(k) === i);
      const depto = txt(LineasUtil.col(f, 'DEPARTAMENTO')).toUpperCase() || 'SIN DEPARTAMENTO';
      if (r.equipo) regs.equipos.push({ ids: ids, actual: estatus(r.equipo.estatus), alta: altaMs, depto: depto });
      if (r.linea) {
        const fin = r.linea.finPlan instanceof Date && !isNaN(r.linea.finPlan.getTime()) && r.linea.finPlan.getFullYear() >= 2000
          ? diaDe(r.linea.finPlan) : '';
        regs.lineas.push({
          ids: ids, actual: estatus(r.linea.estatus), alta: altaMs, depto: depto, fin: fin,
          cuenta: cuentaDe(r.linea.compania, r.linea.razonSocial), basico: /B[AÁ]SIC[OA]/.test(r.tipo || ''),
          costo: Number(r.linea.costoPlan) || 0,
        });
      }
    });

    tomar('convertir');
    const bit = eventosDeEstatus_();
    tomar('leerCambios');
    const eventos = { equipos: {}, lineas: {} };
    ['equipos', 'lineas'].forEach((tipo) => {
      Object.keys(bit.eventos[tipo]).forEach((id) => { eventos[tipo][id] = bit.eventos[tipo][id].map((e) => ({ t: e[0], antes: e[1] })); });
    });
    const primera = bit.primera === null ? null : new Date(bit.primera);
    const total = bit.total;

    const meses = mesesEntre(mesDe(primera || new Date(ahora)), mesDe(new Date(ahora)));
    const bloque = (tipo) => ({
      total: regs[tipo].length,
      actual: contar(regs[tipo].map((r) => r.actual)),
      historico: historico(regs[tipo], eventos[tipo], meses, ahora),
    });
    const salida = {
      generadoEn: new Date(ahora), desde: primera, cambiosDeEstatus: total, meses: meses,
      equipos: bloque('equipos'), lineas: bloque('lineas'),
      registros: registros(regs, eventos, meses),
    };
    tomar('calcular');
    salida.ms = ms;
    return salida;
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

  return { panorama, _historico: historico, _mesesEntre: mesesEntre, _registros: registros, _cuentaDe: cuentaDe };
})();

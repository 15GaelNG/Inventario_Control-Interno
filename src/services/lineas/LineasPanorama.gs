/**
 * LineasPanorama.gs
 * Panorama de Líneas (pedido del área, 29-sep-2026): cuántos equipos y líneas hay por estatus hoy, y cuántos
 * había al cierre de cada mes.
 *
 * El histórico se reconstruye hacia atrás desde el estatus actual de cada fila de LINEAS TELEFONICAS con los cambios
 * de ESTATUS EQUIPO / ESTATUS LINEA (ANTES de cada cambio posterior al cierre del mes) de dos bitácoras: CAMBIOS LINEAS
 * TELEFONICAS (AppSheet, hasta el 30-sep-2026) y MOVIMIENTOS (el sistema nuevo, desde octubre). Supuestos, que la
 * interfaz explica:
 *  - Antes del primer cambio registrado (abril de 2025 en producción) no hay bitácora: cada registro conserva hacia
 *    atrás el estatus que tenía antes de su primer cambio.
 *  - Un registro cuenta desde su FECHA REGISTRO (si la trae y es posterior al 2000).
 *  - Una fila borrada de la hoja no aparece en el histórico.
 * La bitácora puede tener el ID viejo del AppSheet (migración de IDs de la BD de pruebas): se busca por ID y por
 * ID APPSHEET.
 */
const LineasPanorama = (function () {
  // v3 (1-oct): registros en columnas y estatus por mes comprimidos (la respuesta pesaba ~10 veces más)
  // v4 (30-oct): cada línea trae si su número viene en una carta de cancelación (columna k)
  // v5 (30-oct): los equipos que ya salieron (ventas, donaciones, desechos y extravíos)
  // v6 (2-nov): en cancelación ya no cuenta como activa en la comparación con la factura
  const CLAVE_CACHE = 'ln_panorama_v9'; // v9 (2-nov): el ahorro por cancelaciones; v8: la hoja VENTAS; v7: MOVIMIENTOS
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
  function historico(regs, eventos, meses) {
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
   * SIM básico, departamento, costo de plan, fin del adendum, si viene en una carta de cancelación (k: 1 sí, 0 no,
   * -1 sin el dato) y estatus al cierre de cada mes (índices a `dic`).
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
        p: (r) => r.costo, f: (r) => indice(fechas, r.fin), k: (r) => (r.carta === 1 || r.carta === 0 ? r.carta : -1), s: estados,
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

  /**
   * Los cambios de estatus del sistema nuevo (2-nov). Desde octubre de 2026 la bitácora de AppSheet ya no se escribe:
   * cada cambio queda en MOVIMIENTOS, con su CAMBIOS ([{ campo, antes, despues }]), su FECHA y el ID LINEA o ID EQUIPO.
   * Sin esto, ningún cambio de octubre se deshacía y el cierre de septiembre salía igual a hoy (menos las altas).
   * → { eventos: { equipos|lineas: { id: [[ms, antes]] } }, altas: { id: ms } (su primer ALTA con fecha), primera, total }
   */
  function eventosDeMovimientos_(movimientos) {
    const acc = { eventos: { equipos: {}, lineas: {} }, altas: {}, primera: null, total: 0 };
    const idsDe = (v) => txt(v).split(',').map((x) => x.trim()).filter(Boolean);
    movimientos.forEach((m) => {
      const cuando = m['FECHA'];
      if (!(cuando instanceof Date) || isNaN(cuando.getTime())) return;
      const t = cuando.getTime();
      if (txt(m['ACCION']).toUpperCase() === 'ALTA') {
        idsDe(m['ID LINEA']).concat(idsDe(m['ID EQUIPO'])).forEach((id) => { if (!acc.altas[id] || t < acc.altas[id]) acc.altas[id] = t; });
      }
      let cambios = [];
      try { cambios = JSON.parse(txt(m['CAMBIOS']) || '[]'); } catch (e) { cambios = []; }
      if (!Array.isArray(cambios)) return;
      cambios.forEach((c) => {
        const campo = c ? LineasDatos.normCol(c.campo) : '';
        const tipo = campo === 'ESTATUS EQUIPO' ? 'equipos' : (campo === 'ESTATUS LINEA' ? 'lineas' : null);
        if (!tipo) return;
        idsDe(tipo === 'lineas' ? m['ID LINEA'] : m['ID EQUIPO']).forEach((id) => {
          (acc.eventos[tipo][id] = acc.eventos[tipo][id] || []).push([t, estatus(c.antes)]);
        });
        if (acc.primera === null || t < acc.primera) acc.primera = t;
        acc.total++;
      });
    });
    return acc;
  }

  // ---------------- Contra la factura del proveedor (usuario, 29-oct: «info que podamos comparar más fácil y directo») ----------------
  const COLS_FACTURAS = ['NUMERO EN FACTURA', 'FECHA DE CORTE', 'COMPAÑIA', 'CUENTA PADRE', 'TOTAL CON IVA', 'ARCHIVO', 'CONCEPTOS'];
  // Lo que el proveedor cobra por cancelar antes de tiempo, dentro de CONCEPTOS («Penalización sobre el Servicio $139.14 |
  // Cargo Equipo Por Mora Corporativo cancelación anti $80.79»)
  const RE_PENALIZACION = /penaliz|cancelaci[oó]n anti/i;
  const RE_MONTO = /\$\s?(-?[\d,]+(?:\.\d+)?)/;
  const CUENTA_SIM_BASICOS = '643495915';
  const MAX_LISTA = 300;
  const digitos10 = (v) => txt(v).replace(/\D/g, '').slice(-10);
  const redondo = (n) => Math.round(n * 100) / 100;
  /** Estatus de línea que no son activas (los mismos que la portada): canceladas, sin línea y, como en el reporte de Líneas
   *  (2-nov), las que van en cancelación: ya son una baja pedida y se cuentan aparte. */
  const NO_ACTIVA = ['CANCELADA', 'CANCELADO', 'SIN LINEA', 'SIN ESTATUS', 'EN PROCESO DE CANCELACION', ''];
  const esActiva = (e) => NO_ACTIVA.indexOf(estatus(e) === 'SIN ESTATUS' ? '' : estatus(e)) < 0;

  /** Mes ('yyyy-MM') del corte: la celda es fecha; un texto dd/mm/aaaa también se acepta. */
  function mesDeCorte_(v) {
    if (v instanceof Date && !isNaN(v.getTime())) return mesDe(v);
    const m = txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + ('0' + m[2]).slice(-2) : '';
  }

  /**
   * Lo facturado por mes y cuenta, y la comparación de las líneas activas de HOY contra la última factura, número por
   * número. lineasHoy: [{ numero, estatus, cuenta, basico }]. Sin la pestaña FACTURAS, null. Las listas traen números
   * de teléfono: la interfaz no las guarda en el navegador (guardarCopiaPanorama) y el servidor las quita a quien no
   * tiene la sección de facturación (TelefoniaService.panorama).
   */
  function factura_(lineasHoy) {
    if (!LineasDatos.existeTabla('FACTURAS')) return null;
    const t = LineasDatos.tabla('FACTURAS');
    const ix = COLS_FACTURAS.map((c) => LineasDatos.colIndice(t, c));
    if (ix.slice(0, 5).some((i) => i < 0)) return null;
    const ultima = t.hoja.getLastRow();
    if (ultima < 2) return null;
    const desde = Math.min.apply(null, ix.filter((i) => i >= 0));
    const hasta = Math.max.apply(null, ix);
    const razonDe = {};
    if (LineasDatos.existeTabla('CUENTAS')) LineasDatos.leerTabla('CUENTAS').forEach((c) => { razonDe[digitos10(LineasUtil.col(c, 'CUENTA PADRE'))] = txt(LineasUtil.col(c, 'RAZON SOCIAL')); });
    const meses = {};
    const porNumero = {}; // número → { ym: monto } (para la comparación con la última factura)
    t.hoja.getRange(2, desde + 1, ultima - 1, hasta - desde + 1).getValues().forEach((v) => {
      const val = (k) => (ix[k] < 0 ? '' : v[ix[k] - desde]);
      const ym = mesDeCorte_(val(1));
      if (!ym) return;
      const padre = digitos10(val(3));
      const archivo = txt(val(5)).toUpperCase();
      // La razón social de la cuenta (CUENTAS); si la cuenta no está, la del nombre del archivo
      const razon = razonDe[padre] || (/ FRO\b/.test(archivo) ? 'FRO' : (/ GPH\b/.test(archivo) ? 'GPH' : ''));
      const cuenta = cuentaDe(val(2), razon);
      const monto = Number(val(4)) || 0;
      const m = meses[ym] = meses[ym] || { total: 0, cuentas: {}, numeros: {} };
      const c = m.cuentas[cuenta] = m.cuentas[cuenta] || { monto: 0, lineas: 0 };
      m.total += monto;
      c.monto += monto;
      const n = digitos10(val(0));
      if (!n) return; // un ajuste de la cuenta: suma al total, no es una línea
      if (!m.numeros[n]) { m.numeros[n] = true; c.lineas++; }
      const p = porNumero[n] = porNumero[n] || { cuenta: cuenta, basico: padre === CUENTA_SIM_BASICOS, meses: {}, detalle: {} };
      p.meses[ym] = redondo((p.meses[ym] || 0) + monto);
      // Para el ahorro: la penalización de ese mes y si la renta vino en $0.00 (el primer concepto es el plan)
      const conceptos = txt(val(6)).split('|').map((s) => s.trim()).filter(Boolean);
      const d = p.detalle[ym] = p.detalle[ym] || { penal: 0, rentaCero: false };
      conceptos.forEach((s) => { const x = RE_PENALIZACION.test(s) && s.match(RE_MONTO); if (x) d.penal = redondo(d.penal + (Number(x[1].replace(/,/g, '')) || 0)); });
      if (conceptos.length && /\$\s?0\.00$/.test(conceptos[0])) d.rentaCero = true;
    });
    const lista = Object.keys(meses).sort();
    if (!lista.length) return null;
    const ultimo = lista[lista.length - 1];
    const porMes = lista.map((ym) => {
      const m = meses[ym];
      const cuentas = {};
      Object.keys(m.cuentas).forEach((k) => { cuentas[k] = { monto: redondo(m.cuentas[k].monto), lineas: m.cuentas[k].lineas }; });
      return { ym: ym, total: redondo(m.total), lineas: Object.keys(m.numeros).length, cuentas: cuentas };
    });

    // Hoy contra la última factura, por número (una línea con dos renglones cuenta una vez; manda el activo)
    const inv = {};
    lineasHoy.forEach((l) => { if (l.numero && (!inv[l.numero] || (!esActiva(inv[l.numero].estatus) && esActiva(l.estatus)))) inv[l.numero] = l; });
    const cobradas = Object.keys(meses[ultimo].numeros);
    const comp = { ultimo: ultimo, activas: 0, cobradas: cobradas.length, activasCobradas: 0, porCuenta: {}, basicos: { activas: 0, cobradas: 0 },
      activasSinCobro: [], cobradasNoActivas: [], recortadas: false };
    const cuentaComp = (k) => (comp.porCuenta[k] = comp.porCuenta[k] || { activas: 0, cobradas: 0, activasCobradas: 0, activasSinCobro: 0, cobradasNoActivas: 0 });
    // Último mes con cobro de cada número: para decir desde cuándo una activa no se cobra
    const ultimoCobro = (n) => (porNumero[n] ? Object.keys(porNumero[n].meses).sort().pop() : '');
    Object.keys(inv).forEach((n) => {
      const l = inv[n];
      if (!esActiva(l.estatus)) return;
      comp.activas++;
      cuentaComp(l.cuenta).activas++;
      if (l.basico) comp.basicos.activas++;
      if (meses[ultimo].numeros[n]) { comp.activasCobradas++; cuentaComp(l.cuenta).activasCobradas++; } else { cuentaComp(l.cuenta).activasSinCobro++; comp.activasSinCobro.push([n, estatus(l.estatus), l.cuenta, ultimoCobro(n)]); }
    });
    cobradas.forEach((n) => {
      const f = porNumero[n];
      cuentaComp(f.cuenta).cobradas++;
      if (f.basico) comp.basicos.cobradas++;
      const l = inv[n];
      if (!l || !esActiva(l.estatus)) { cuentaComp(f.cuenta).cobradasNoActivas++; comp.cobradasNoActivas.push([n, l ? estatus(l.estatus) : 'NO ESTÁ EN EL INVENTARIO', f.cuenta, f.meses[ultimo]]); }
    });
    comp.activasSinCobro.sort((a, b) => a[2].localeCompare(b[2]) || a[0].localeCompare(b[0]));
    comp.cobradasNoActivas.sort((a, b) => (a[1] === 'NO ESTÁ EN EL INVENTARIO' ? 0 : 1) - (b[1] === 'NO ESTÁ EN EL INVENTARIO' ? 0 : 1) || a[0].localeCompare(b[0]));
    comp.totalActivasSinCobro = comp.activasSinCobro.length;
    comp.totalCobradasNoActivas = comp.cobradasNoActivas.length;
    if (comp.activasSinCobro.length > MAX_LISTA || comp.cobradasNoActivas.length > MAX_LISTA) comp.recortadas = true;
    comp.activasSinCobro = comp.activasSinCobro.slice(0, MAX_LISTA);
    comp.cobradasNoActivas = comp.cobradasNoActivas.slice(0, MAX_LISTA);
    return { meses: porMes, comparacion: comp, ahorro: ahorroCancelaciones_(porNumero, lista, lineasHoy) };
  }

  /**
   * El ahorro por cancelaciones (2-nov, la hoja «Cancelaciones» del reporte de Líneas, ahora del sistema): por cada línea
   * CANCELADA, su renta mensual × los meses de factura que ya no se pagaron, menos la penalización que cobró el proveedor.
   * Se mueve solo con cada factura que se carga.
   *  - Mes pagado: total menos penalización > 0 y la renta no vino en $0.00 (un crédito o solo la penalización no es pago).
   *  - Renta: el cobro más frecuente de sus meses pagados; si nunca aparece cobrada, el COSTO PLAN del inventario.
   *  - Meses sin pagar: los de factura después de su último pago; nunca facturada = todos (se canceló antes de la primera).
   * No resta el SIM básico que reemplazó a una línea ni prorratea el último ciclo de AT&T (el reporte sí: sale un poco distinto).
   * porNumero: { n: { cuenta, meses: { ym: monto }, detalle: { ym: { penal, rentaCero } } } } · meses: ['yyyy-MM'] de factura.
   */
  function ahorroCancelaciones_(porNumero, meses, lineasHoy) {
    if (!meses.length) return null;
    const hasta = meses[meses.length - 1];
    const vistas = {};
    const r = { desde: meses[0], hasta: hasta, lineas: 0, conAhorro: 0, aunSinAhorro: 0, sinRenta: 0, rentaMensual: 0, bruto: 0,
      penalizaciones: 0, neto: 0, porMes: {}, porCuenta: {}, lista: [] };
    lineasHoy.forEach((l) => {
      if (estatus(l.estatus) !== 'CANCELADA' || !l.numero || vistas[l.numero]) return;
      vistas[l.numero] = true;
      const f = porNumero[l.numero];
      const det = (f && f.detalle) || {};
      const pagados = f ? Object.keys(f.meses).filter((ym) => f.meses[ym] - ((det[ym] || {}).penal || 0) > 0 && !(det[ym] || {}).rentaCero).sort() : [];
      const ultimoPago = pagados.length ? pagados[pagados.length - 1] : '';
      const frec = {};
      pagados.forEach((ym) => sumar(frec, String(f.meses[ym])));
      const masFrecuente = Object.keys(frec).sort((a, b) => frec[b] - frec[a] || Number(b) - Number(a))[0];
      const renta = masFrecuente !== undefined ? Number(masFrecuente) : (Number(l.costo) || 0);
      const fuente = masFrecuente !== undefined ? 'Factura' : (renta ? 'Plan del inventario' : 'Sin dato');
      const sinPagar = meses.filter((ym) => ym > ultimoPago);
      const penal = f ? redondo(Object.keys(det).reduce((t, ym) => t + (det[ym].penal || 0), 0)) : 0;
      const ahorro = redondo(renta * sinPagar.length - penal);
      const cuenta = (f && f.cuenta) || l.cuenta;
      r.lineas++;
      if (!renta) r.sinRenta++;
      else if (sinPagar.length) r.conAhorro++;
      else r.aunSinAhorro++;
      r.rentaMensual += renta;
      r.bruto += renta * sinPagar.length;
      r.penalizaciones += penal;
      sinPagar.forEach((ym) => sumar(r.porMes, ym, renta));
      const c = r.porCuenta[cuenta] = r.porCuenta[cuenta] || { lineas: 0, neto: 0 };
      c.lineas++;
      c.neto += ahorro;
      r.lista.push([l.numero, cuenta, redondo(renta), fuente, ultimoPago, sinPagar.length, penal, ahorro]);
    });
    if (!r.lineas) return null;
    ['rentaMensual', 'bruto', 'penalizaciones'].forEach((k) => { r[k] = redondo(r[k]); });
    r.neto = redondo(r.bruto - r.penalizaciones);
    Object.keys(r.porMes).forEach((k) => { r.porMes[k] = redondo(r.porMes[k]); });
    Object.keys(r.porCuenta).forEach((k) => { r.porCuenta[k].neto = redondo(r.porCuenta[k].neto); });
    r.lista.sort((a, b) => b[7] - a[7] || a[0].localeCompare(b[0]));
    return r;
  }

  // ---------------- Equipos que ya salieron: ventas, donaciones, desechos y extravíos (30-oct) ----------------
  // El sistema no guarda importes de venta: lo que sí sabe está en el comentario del movimiento que dejó al equipo en ese
  // estatus (la fecha real del evento, el comprador, el recibo, la factura de donación, el depósito del desecho).
  const RE_VENTA = /Vendido el (\d{1,2})\/(\d{1,2})\/(\d{4}) a (.+?) · venta (\S+)/i;
  const RE_PRIMERA_VENTA = /primera venta de celulares \((\d{1,2})\/(\d{1,2})\/(\d{4})\)/i;
  const RE_VENDIDO_A = /VENDIDO A ([A-ZÁÉÍÓÚÑ]+)/;
  const RE_DONADO = /Donado a (.+?) · salida de CI el (\d{1,2})\/(\d{1,2})\/(\d{4})(?:.*?factura (\S+))?/i;
  const RE_DESECHO = /Desechado el (\d{1,2})\/(\d{1,2})\/(\d{4})(?:.*?depósito de \$([\d,]+(?:\.\d+)?))?/i;
  const RE_COBRO = /DESCUENTO|COBRO|ABOGAD|MULTA/i;
  const ESTATUS_BAJA = ['VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'];
  /** Un comprador con 1 o 2 equipos es un colaborador: en la pantalla de dirección no viaja su nombre */
  const MAX_INDIVIDUAL = 2;
  const COLABORADORES = 'Colaboradores (venta individual)';
  const ymd = (d, m, y) => y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
  const sumar = (o, k, n) => { o[k] = (o[k] || 0) + (n === undefined ? 1 : n); };

  /** Interpreta el comentario del movimiento de un equipo que ya salió: { fecha 'yyyy-MM-dd'|'', … } por estatus */
  function leerBaja_(estatus, comentario) {
    const t = txt(comentario);
    let m;
    if (estatus === 'VENDIDO') {
      if ((m = t.match(RE_VENTA))) return { fecha: ymd(m[1], m[2], m[3]), comprador: m[4].trim().toUpperCase(), recibo: m[5] };
      if ((m = t.match(RE_PRIMERA_VENTA))) return { fecha: ymd(m[1], m[2], m[3]), comprador: '', recibo: 'Primera venta' };
      if ((m = t.match(RE_VENDIDO_A))) return { fecha: '', comprador: m[1] + ' (sin recibo en el sistema)', recibo: '' };
      return null;
    }
    if (estatus === 'DONADO') {
      if ((m = t.match(RE_DONADO))) return { fecha: ymd(m[2], m[3], m[4]), destino: /merced/i.test(m[1]) ? 'Fundación Merced' : m[1].trim(), factura: m[5] || '' };
      if (/DONADO A FUNDACION MERCED/i.test(t)) return { fecha: '', destino: 'Fundación Merced', factura: '' };
      return null;
    }
    if (estatus === 'DESECHADO') {
      if ((m = t.match(RE_DESECHO))) return { fecha: ymd(m[1], m[2], m[3]), deposito: m[4] ? Number(m[4].replace(/,/g, '')) : null };
      return /DESECHO/i.test(t) ? { fecha: '', deposito: null } : null;
    }
    return { conCobro: RE_COBRO.test(t) };
  }

  /**
   * Agregados de los equipos que ya salieron, para las pestañas Ventas, Donaciones y Desechos. Solo conteos: sin
   * IMEI, NUCO ni nombres de quien compró 1 o 2 equipos. "sinDato": el sistema no tiene un movimiento que lo explique.
   */
  function bajasEquipos_(movimientos) {
    if (!LineasDatos.existeTabla('EQUIPOS') || !LineasDatos.existeTabla('MOVIMIENTOS')) return null;
    const estatusDe = {};
    LineasDatos.leerTabla('EQUIPOS').forEach((e) => {
      const s = txt(e['ESTATUS EQUIPO']).toUpperCase();
      if (ESTATUS_BAJA.indexOf(s) >= 0) estatusDe[txt(e['ID'])] = s;
    });
    // El último movimiento que dejó a cada equipo en su estatus de hoy
    const ultimo = {};
    (movimientos || LineasDatos.leerTabla('MOVIMIENTOS')).forEach((m) => {
      const id = txt(m['ID EQUIPO']);
      const s = estatusDe[id];
      if (!s) return;
      let cambios = [];
      try { cambios = JSON.parse(txt(m['CAMBIOS']) || '[]'); } catch (e) { cambios = []; }
      if (!Array.isArray(cambios) || !cambios.some((c) => c && txt(c.campo).toUpperCase() === 'ESTATUS EQUIPO' && txt(c.despues).toUpperCase() === s)) return;
      ultimo[id] = txt(m['COMENTARIO']);
    });
    const v = { total: 0, sinDato: 0, sinFecha: 0, porMes: {}, porComprador: {}, recibos: {} };
    const d = { total: 0, sinDato: 0, sinFecha: 0, porMes: {}, porDestino: {}, facturas: {} };
    const x = { total: 0, sinDato: 0, sinFecha: 0, porMes: {}, depositos: {} };
    const r = { total: 0, sinDato: 0, conCobro: 0 };
    const ventas = [];
    Object.keys(estatusDe).forEach((id) => {
      const s = estatusDe[id];
      const b = ultimo[id] === undefined ? null : leerBaja_(s, ultimo[id]);
      if (s === 'VENDIDO') { v.total++; if (b) ventas.push(b); else v.sinDato++; }
      if (s === 'DONADO') {
        d.total++;
        if (!b) { d.sinDato++; return; }
        if (b.fecha) sumar(d.porMes, b.fecha.slice(0, 7)); else d.sinFecha++;
        sumar(d.porDestino, b.destino);
        if (b.factura) sumar(d.facturas, b.factura);
      }
      if (s === 'DESECHADO') {
        x.total++;
        if (!b) { x.sinDato++; return; }
        if (b.fecha) sumar(x.porMes, b.fecha.slice(0, 7)); else x.sinFecha++;
        // Un depósito por fecha y monto (el comentario lo repite en cada equipo del mismo lote)
        if (b.deposito !== null) { const k = b.fecha + '|' + b.deposito; x.depositos[k] = x.depositos[k] || { fecha: b.fecha, monto: b.deposito, equipos: 0 }; x.depositos[k].equipos++; }
      }
      if (s === 'EXTRAVIO-ROBO') { r.total++; if (ultimo[id] === undefined) r.sinDato++; else if (b.conCobro) r.conCobro++; }
    });
    // Ventas: los compradores de 1–2 equipos se juntan; un recibo de un colaborador sale con esa etiqueta
    const porPersona = {};
    ventas.forEach((b) => { if (b.comprador) sumar(porPersona, b.comprador); });
    const quien = (c) => (!c ? 'Sin comprador en el sistema' : porPersona[c] <= MAX_INDIVIDUAL && !/sin recibo/.test(c) ? COLABORADORES : c);
    ventas.forEach((b) => {
      if (b.fecha) sumar(v.porMes, b.fecha.slice(0, 7)); else v.sinFecha++;
      sumar(v.porComprador, quien(b.comprador));
      if (b.recibo) {
        const k = b.recibo;
        v.recibos[k] = v.recibos[k] || { recibo: k, fecha: b.fecha, comprador: quien(b.comprador), equipos: 0 };
        v.recibos[k].equipos++;
        if (b.fecha && (!v.recibos[k].fecha || b.fecha < v.recibos[k].fecha)) v.recibos[k].fecha = b.fecha;
      }
    });
    v.recibos = Object.keys(v.recibos).map((k) => v.recibos[k]).sort((a, c) => (a.fecha || '').localeCompare(c.fecha || '') || a.recibo.localeCompare(c.recibo));
    v.conRecibo = v.recibos.reduce((t, k) => t + k.equipos, 0);
    x.depositos = Object.keys(x.depositos).map((k) => x.depositos[k]).sort((a, c) => a.fecha.localeCompare(c.fecha));
    return { ventas: v, donaciones: d, desechos: x, extravios: r };
  }

  const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  /** "nov-2025" (el mes del reporte, por su ciclo de facturación) → '2025-11'; si no se entiende, el de la fecha */
  function mesReporte_(texto, fecha) {
    const m = /^([a-z]{3})\w*[-\s/]+(\d{4})$/i.exec(txt(texto));
    const i = m ? MESES_CORTOS.indexOf(m[1].toUpperCase()) : -1;
    if (i >= 0) return m[2] + '-' + ('0' + (i + 1)).slice(-2);
    return fecha instanceof Date && !isNaN(fecha.getTime()) ? Utilities.formatDate(fecha, zona(), 'yyyy-MM') : '';
  }

  /**
   * Las ventas de la hoja VENTAS (LineasVentas.gs, 2-nov), tal cual el reporte, con cuántos equipos de cada una tiene ligados
   * el inventario (EQUIPOS.ID VENTA). Sin la hoja, null: la pestaña Ventas sigue con lo que dicen los movimientos
   * (bajasEquipos_). Quien compró 1 o 2 equipos en todas sus ventas sale como colaborador (no viaja su nombre).
   */
  function ventasRegistradas_() {
    if (!LineasDatos.existeTabla('VENTAS')) return null;
    const filas = LineasDatos.leerTabla('VENTAS').filter((v) => txt(v['ID']));
    if (!filas.length) return null;
    const ligados = {};
    let vendidos = 0;
    let vendidosSinVenta = 0;
    LineasDatos.leerTabla('EQUIPOS').forEach((e) => {
      const id = txt(e['ID VENTA']);
      if (id) ligados[id] = (ligados[id] || 0) + 1;
      if (txt(e['ESTATUS EQUIPO']).toUpperCase() === 'VENDIDO') { vendidos++; if (!id) vendidosSinVenta++; }
    });
    const porPersona = {};
    filas.forEach((v) => sumar(porPersona, txt(v['COMPRADOR']).toUpperCase(), Number(v['EQUIPOS']) || 0));
    const ventas = filas.map((v) => {
      const comprador = txt(v['COMPRADOR']).toUpperCase();
      const f = v['FECHA'] instanceof Date && !isNaN(v['FECHA'].getTime()) ? Utilities.formatDate(v['FECHA'], zona(), 'yyyy-MM-dd') : '';
      const evidencia = txt(v['EVIDENCIA']);
      return {
        id: txt(v['ID']), referencia: txt(v['REFERENCIA REPORTE']), fecha: f, mes: mesReporte_(v['MES REPORTE'], v['FECHA']),
        comprador: !comprador ? 'Sin comprador' : porPersona[comprador] <= MAX_INDIVIDUAL ? COLABORADORES : comprador,
        equipos: Number(v['EQUIPOS']) || 0, importe: Number(v['IMPORTE']) || 0, ligados: ligados[txt(v['ID'])] || 0,
        evidencia: /^https:\/\//i.test(evidencia) ? evidencia : '',
      };
    });
    const total = (k) => ventas.reduce((t, v) => t + v[k], 0);
    return {
      ventas: ventas, equipos: total('equipos'), importe: total('importe'),
      // Una venta con más ligados que equipos no suma de más (la carga no lo permite; por si alguien la edita a mano)
      ligados: ventas.reduce((t, v) => t + Math.min(v.ligados, v.equipos), 0),
      vendidos: vendidos, vendidosSinVenta: vendidosSinVenta,
    };
  }

  /**
   * Número → 1 si viene en una carta de cancelación al proveedor, 0 si no: la columna CARTA DE CANCELACION de la hoja
   * LINEAS (la llena lineasCartaAplicar, LineasCartaCancelacion.gs). Sin la hoja o sin la columna, null.
   */
  function cartas_() {
    if (!LineasDatos.existeTabla('LINEAS')) return null;
    const filas = LineasDatos.leerTabla('LINEAS');
    if (!filas.some((f) => txt(f['CARTA DE CANCELACION']))) return null;
    const de = {};
    filas.forEach((f) => {
      const n = digitos10(f['NUMERO TELEFONO']);
      const v = txt(f['CARTA DE CANCELACION']).toUpperCase();
      if (!n || (v !== 'SI' && v !== 'NO')) return;
      // Un número con varios registros: basta con que uno diga SI (la carta es del número, no del registro)
      de[n] = de[n] === 1 || v === 'SI' ? 1 : 0;
    });
    return de;
  }

  function calcular() {
    const ahora = Date.now();
    const ms = {}; // tiempos de cada paso (diagnóstico: se ven en la respuesta)
    let marca = ahora;
    const tomar = (paso) => { const t = Date.now(); ms[paso] = t - marca; marca = t; };
    const regs = { equipos: [], lineas: [] };
    const lineasHoy = []; // número, estatus y cuenta de hoy, para comparar con la factura (no viaja al cliente)
    // Utilities.formatDate cuesta ~1 ms por llamada y los fines de adendum se repiten mucho: uno por fecha distinta
    const dias = {};
    const diaDe = (d) => dias[d.getTime()] || (dias[d.getTime()] = Utilities.formatDate(d, zona(), 'yyyy-MM-dd'));
    const filasLineas = LineasDatos.leerTabla(LineasRepo.TAB.LINEAS);
    tomar('leerLineas');
    const cartaDe = cartas_();
    tomar('leerCartas');
    filasLineas.forEach((f) => {
      const r = LineasRepo.convertirRegistro(f);
      if (!r) return;
      const alta = LineasUtil.col(f, 'FECHA REGISTRO');
      // FECHA REGISTRO válida: después del 2000 y no en el futuro (hay capturas con 1969 y 2027)
      const altaMs = alta instanceof Date && !isNaN(alta.getTime()) && alta.getFullYear() >= 2000 && alta.getTime() <= ahora ? alta.getTime() : null;
      const ids = [txt(r.id)].concat(LineasDatos.idsDeFila(f)).filter((k, i, a) => k && a.indexOf(k) === i);
      // El renglón lleva el ID del equipo (o de la línea sola); MOVIMIENTOS anota cada cambio con el de la línea o el del
      // equipo, así que cada uno se busca también por el suyo
      const conId = (id) => (id && ids.indexOf(id) < 0 ? ids.concat([id]) : ids);
      const idEquipo = txt(LineasUtil.col(f, 'ID EQUIPO'));
      const idLinea = txt(LineasUtil.col(f, 'ID LINEA'));
      const depto = txt(LineasUtil.col(f, 'DEPARTAMENTO')).toUpperCase() || 'SIN DEPARTAMENTO';
      if (r.equipo) regs.equipos.push({ ids: conId(idEquipo), actual: estatus(r.equipo.estatus), alta: altaMs, depto: depto, idAlta: idEquipo });
      if (r.linea) {
        const fin = r.linea.finPlan instanceof Date && !isNaN(r.linea.finPlan.getTime()) && r.linea.finPlan.getFullYear() >= 2000
          ? diaDe(r.linea.finPlan) : '';
        regs.lineas.push({
          ids: conId(idLinea), actual: estatus(r.linea.estatus), alta: altaMs, idAlta: idLinea, depto: depto, fin: fin,
          cuenta: cuentaDe(r.linea.compania, r.linea.razonSocial), basico: /B[AÁ]SIC[OA]/.test(r.tipo || ''),
          costo: Number(r.linea.costoPlan) || 0,
          carta: cartaDe && cartaDe[digitos10(r.linea.numero)] !== undefined ? cartaDe[digitos10(r.linea.numero)] : -1,
        });
        lineasHoy.push({ numero: digitos10(r.linea.numero), estatus: r.linea.estatus, cuenta: cuentaDe(r.linea.compania, r.linea.razonSocial), basico: /B[AÁ]SIC[OA]/.test(r.tipo || ''),
          costo: Number(r.linea.costoPlan) || 0 });
      }
    });

    tomar('convertir');
    const bit = eventosDeEstatus_();
    tomar('leerCambios');
    const movimientos = LineasDatos.existeTabla('MOVIMIENTOS') ? LineasDatos.leerTabla('MOVIMIENTOS') : [];
    const mov = eventosDeMovimientos_(movimientos);
    tomar('leerMovimientos');
    // Las dos bitácoras: la de AppSheet (hasta el 30-sep) y MOVIMIENTOS (desde octubre)
    const eventos = { equipos: {}, lineas: {} };
    [bit, mov].forEach((fuente) => ['equipos', 'lineas'].forEach((tipo) => {
      Object.keys(fuente.eventos[tipo]).forEach((id) => {
        eventos[tipo][id] = (eventos[tipo][id] || []).concat(fuente.eventos[tipo][id].map((e) => ({ t: e[0], antes: e[1] })));
      });
    }));
    // Cada uno cuenta desde su propia alta: una línea nueva puesta en un equipo viejo no existía antes de su ALTA
    ['equipos', 'lineas'].forEach((tipo) => regs[tipo].forEach((r) => {
      const t = mov.altas[r.idAlta];
      if (t && t <= ahora) r.alta = t;
    }));
    const primeras = [bit.primera, mov.primera].filter((x) => x !== null);
    const primera = primeras.length ? new Date(Math.min.apply(null, primeras)) : null;
    const total = bit.total + mov.total;

    const meses = mesesEntre(mesDe(primera || new Date(ahora)), mesDe(new Date(ahora)));
    const bloque = (tipo) => ({
      total: regs[tipo].length,
      actual: contar(regs[tipo].map((r) => r.actual)),
      historico: historico(regs[tipo], eventos[tipo], meses),
    });
    const salida = {
      generadoEn: new Date(ahora), desde: primera, cambiosDeEstatus: total, meses: meses, conCartas: !!cartaDe,
      equipos: bloque('equipos'), lineas: bloque('lineas'),
      registros: registros(regs, eventos, meses),
    };
    tomar('calcular');
    salida.factura = factura_(lineasHoy);
    tomar('factura');
    salida.equiposBajas = bajasEquipos_(movimientos);
    tomar('bajas');
    salida.ventas = ventasRegistradas_();
    tomar('ventas');
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

  return { panorama, CLAVE_CACHE, _historico: historico, _mesesEntre: mesesEntre, _registros: registros, _cuentaDe: cuentaDe, _factura: factura_, _bajasEquipos: bajasEquipos_, _ventasRegistradas: ventasRegistradas_, _ahorroCancelaciones: ahorroCancelaciones_,
    _eventosDeMovimientos: eventosDeMovimientos_ };
})();

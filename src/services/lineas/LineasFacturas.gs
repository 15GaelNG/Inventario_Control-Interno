/**
 * LineasFacturas.gs
 * La factura del proveedor (pestaña FACTURAS: NUMERO EN FACTURA, FECHA DE CORTE, CUENTA PADRE, TOTAL CON IVA) vista por
 * número, para el seguimiento de las cancelaciones (13-nov): con la carta ya enviada, ¿el proveedor la sigue cobrando?
 *
 *   porNumero()  → { numeros: { '4420000001': { padre, cortes: [['2026-10-12', 199.5], …] } }, cuentas: { padre: [días de
 *                    corte] } }, guardado mientras FACTURAS no cambie (LineasDatos.recordar). Sin la pestaña, null.
 *   cobro(numero, cuentaPadre, cartaEnviadaEn, datos) → puro: qué dice la factura de una línea con la carta enviada.
 *
 * Los montos son de facturación: TelefoniaService.bandejaResguardos los quita a quien no tiene esa sección.
 */
const LineasFacturas = (function () {
  const COLS = ['NUMERO EN FACTURA', 'FECHA DE CORTE', 'CUENTA PADRE', 'TOTAL CON IVA'];
  const MAX_CORTES = 6; // por número, los más recientes (basta para el seguimiento y la caché no crece)
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const digitos10 = (v) => txt(v).replace(/\D/g, '').slice(-10);
  const dos = (n) => ('0' + n).slice(-2);

  /** El día del corte ('yyyy-MM-dd'): la celda es fecha; un texto dd/mm/aaaa también se acepta. '' si no es fecha. */
  function diaDeCorte(v) {
    if (v instanceof Date && !isNaN(v.getTime())) return v.getFullYear() + '-' + dos(v.getMonth() + 1) + '-' + dos(v.getDate());
    const m = txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + dos(Number(m[2])) + '-' + dos(Number(m[1])) : '';
  }

  /** Puro: renglones [numero, fecha de corte, cuenta padre, monto] → lo de porNumero(). */
  function armar(filas) {
    const numeros = {};
    const cuentas = {};
    (filas || []).forEach((v) => {
      const dia = diaDeCorte(v[1]);
      const padre = digitos10(v[2]);
      if (!dia || !padre) return;
      (cuentas[padre] = cuentas[padre] || {})[dia] = true;
      const n = digitos10(v[0]);
      if (n.length !== 10) return; // un ajuste de la cuenta: no es una línea
      const x = numeros[n] = numeros[n] || { padre: padre, cortes: {} };
      x.cortes[dia] = Math.round(((x.cortes[dia] || 0) + (Number(v[3]) || 0)) * 100) / 100;
      if (!x.ultimo || dia > x.ultimo) { x.ultimo = dia; x.padre = padre; }
    });
    const salida = { numeros: {}, cuentas: {} };
    Object.keys(cuentas).forEach((p) => { salida.cuentas[p] = Object.keys(cuentas[p]).sort(); });
    Object.keys(numeros).forEach((n) => {
      const x = numeros[n];
      salida.numeros[n] = { padre: x.padre, cortes: Object.keys(x.cortes).sort().slice(-MAX_CORTES).map((d) => [d, x.cortes[d]]) };
    });
    return salida;
  }

  function porNumero() {
    if (!LineasDatos.existeTabla('FACTURAS')) return null;
    return LineasDatos.recordar('facturas_por_numero_v1', ['FACTURAS'], () => {
      const t = LineasDatos.tabla('FACTURAS');
      const ix = COLS.map((c) => LineasDatos.colIndice(t, c));
      if (ix.some((i) => i < 0)) return null;
      const ultima = t.hoja.getLastRow();
      if (ultima < 2) return armar([]);
      const desde = Math.min.apply(null, ix);
      const hasta = Math.max.apply(null, ix);
      return armar(t.hoja.getRange(2, desde + 1, ultima - 1, hasta - desde + 1).getValues().map((v) => ix.map((i) => v[i - desde])));
    }, 21600);
  }

  /**
   * Puro: qué dice la factura de una línea con la carta enviada el día `carta` ('yyyy-MM-dd'). La cuenta que manda es la de
   * la factura (donde se cobró la última vez); si nunca salió, la del inventario.
   *   SIN_DATOS   la cuenta nunca aparece en FACTURAS (o falta la fecha de la carta)
   *   SIN_CORTE   todavía no llega una factura de la cuenta después de la carta, o solo una y aún la trae: el primer corte
   *               después de pedir la baja suele cobrar el mes en curso (un ciclo de gracia)
   *   SE_COBRA    ya pasaron 2 cortes de la cuenta después de la carta y el último la sigue cobrando
   *   YA_NO       la cuenta facturó después de la carta y la línea ya no viene: lista para confirmar
   * → { estado, corte: día del último corte de la cuenta, monto: lo del último corte (SE_COBRA), mes: 'yyyy-MM' de ese corte }
   */
  function cobro(numero, cuentaPadre, carta, datos) {
    const n = digitos10(numero);
    const info = datos && datos.numeros[n];
    const padre = (info && info.padre) || digitos10(cuentaPadre);
    const cortes = (datos && padre && datos.cuentas[padre]) || [];
    if (!carta || !cortes.length) return { estado: 'SIN_DATOS' };
    const ultimo = cortes[cortes.length - 1];
    const despues = cortes.filter((d) => d > carta);
    const enUltimo = info ? info.cortes.filter((c) => c[0] === ultimo)[0] : null;
    const base = { corte: ultimo, mes: ultimo.slice(0, 7) };
    if (!despues.length) return Object.assign({ estado: 'SIN_CORTE' }, base);
    if (!enUltimo) return Object.assign({ estado: 'YA_NO' }, base);
    if (despues.length < 2) return Object.assign({ estado: 'SIN_CORTE' }, base);
    return Object.assign({ estado: 'SE_COBRA', monto: enUltimo[1] }, base);
  }

  return { porNumero, cobro, armar, diaDeCorte };
})();

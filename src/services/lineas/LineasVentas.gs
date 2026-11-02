/**
 * LineasVentas.gs
 * Las ventas de equipos (2-nov, pedido del usuario): la hoja VENTAS guarda una fila por venta, tal cual viene en el reporte
 * de líneas (referencia, fecha, mes en que la cuenta el reporte, comprador, equipos, importe), y EQUIPOS lleva la llave
 * foránea `ID VENTA` en cada equipo que se sabe de qué venta salió. Una venta puede tener menos equipos ligados que los
 * que dice el reporte: la diferencia es lo que todavía no tiene evidencia, y el Panorama la enseña. Nada se rellena.
 *
 * Registrar una venta desde la pantalla es para después. Por ahora la hoja se carga desde el editor:
 *
 *   lineasVentasCargaRevisar()                → solo lee: qué ventas se crearían y qué equipos se ligarían
 *   lineasVentasCargaAplicar('SI, EN PROD')   → lo aplica (en un DEV no pide la confirmación)
 *
 * Los datos NO van en el código (el repo es público y traen nombres e IMEIs): se leen de dos pestañas del libro de
 * Líneas que se pegan antes y se borran después:
 *   «_CARGA VENTAS»          REFERENCIA REPORTE, FECHA, MES REPORTE, COMPRADOR, EQUIPOS, IMPORTE, EVIDENCIA, COMENTARIOS
 *   «_CARGA VENTAS EQUIPOS»  NUCO, IMEI, REFERENCIA REPORTE, COMO SE UBICA
 * Cada equipo se liga solo si su NUCO es de un solo equipo, el IMEI coincide, el inventario lo tiene VENDIDO (para el
 * estatus manda el inventario) y su venta no se pasa de los equipos que dice el reporte. Cada liga deja su movimiento
 * en MOVIMIENTOS (CAMBIOS: ID VENTA) con el porqué; la bitácora la anota SheetUtils.
 *
 * Se puede correr de nuevo: la venta que ya existe (por su referencia) y el equipo ya ligado se saltan.
 */

const LineasVentas = (function () {
  const HOJA = 'VENTAS';
  const ENCABEZADOS = ['ID', 'REFERENCIA REPORTE', 'FECHA', 'MES REPORTE', 'COMPRADOR', 'EQUIPOS', 'IMPORTE', 'EVIDENCIA', 'COMENTARIOS'];
  /** La llave foránea en EQUIPOS */
  const COLUMNA_EQUIPOS = 'ID VENTA';
  const CARGA = { VENTAS: '_CARGA VENTAS', EQUIPOS: '_CARGA VENTAS EQUIPOS' };
  const ORIGEN = 'CARGA VENTAS';

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const norm = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').toUpperCase();
  const digitos = (v) => txt(v).replace(/\D/g, '');

  /** Una pestaña de carga → [{ renglon, …columnas }] con los valores de la celda (fechas como Date) */
  function leerCarga_(nombre, columnas) {
    const hoja = LineasDatos.libro().getSheetByName(nombre);
    if (!hoja) throw new Error('Falta la pestaña «' + nombre + '» en el libro de Líneas, con las columnas ' + columnas.join(', ') + '.');
    const valores = hoja.getDataRange().getValues();
    const enc = valores[0].map(norm);
    const faltan = columnas.filter((c) => enc.indexOf(norm(c)) < 0);
    if (faltan.length) throw new Error('A «' + nombre + '» le faltan las columnas ' + faltan.join(', ') + '.');
    return valores.slice(1).map((r, i) => {
      const o = { renglon: i + 2 };
      columnas.forEach((c) => { o[c] = r[enc.indexOf(norm(c))]; });
      return o;
    }).filter((o) => columnas.some((c) => txt(o[c])));
  }

  function cargar_(aplicar) {
    const ahora = new Date();
    const correo = Session.getActiveUser().getEmail();
    const quien = [correo + ' (editor, carga de ventas)', correo].filter(Boolean).join(' · ');
    const lineas = [];
    const cuenta = { ventas: 0, ventasYa: 0, ligados: 0, ligadosYa: 0, error: 0 };
    const fallo = (que, motivo) => { cuenta.error++; lineas.push('✗ ' + que + ': ' + motivo); };

    // ---- Ventas
    const yaHay = {};
    if (LineasDatos.existeTabla(HOJA)) LineasDatos.leerTabla(HOJA).forEach((v) => { yaHay[norm(v['REFERENCIA REPORTE'])] = v; });
    const ventas = {}; // referencia → { id, equipos, ligados }
    Object.keys(yaHay).forEach((k) => { ventas[k] = { id: txt(yaHay[k]['ID']), equipos: Number(yaHay[k]['EQUIPOS']) || 0, ligados: 0 }; });
    const nuevas = [];
    leerCarga_(CARGA.VENTAS, ['REFERENCIA REPORTE', 'FECHA', 'MES REPORTE', 'COMPRADOR', 'EQUIPOS', 'IMPORTE', 'EVIDENCIA', 'COMENTARIOS']).forEach((c) => {
      const ref = txt(c['REFERENCIA REPORTE']);
      const que = 'venta ' + (ref || 'renglón ' + c.renglon);
      if (!ref) return fallo(que, 'sin referencia');
      if (yaHay[norm(ref)]) { cuenta.ventasYa++; return; }
      if (ventas[norm(ref)]) return fallo(que, 'la referencia se repite en la carga');
      if (!(c['FECHA'] instanceof Date) || isNaN(c['FECHA'].getTime())) return fallo(que, 'la fecha no es una fecha');
      const equipos = Number(c['EQUIPOS']);
      if (!(equipos > 0) || Math.round(equipos) !== equipos) return fallo(que, 'EQUIPOS debe ser un entero mayor que 0');
      if (txt(c['IMPORTE']) === '' || isNaN(Number(c['IMPORTE']))) return fallo(que, 'IMPORTE no es un número');
      const id = LineasDatos.nuevoId(HOJA);
      ventas[norm(ref)] = { id: id, equipos: equipos, ligados: 0 };
      nuevas.push({
        'ID': id, 'REFERENCIA REPORTE': ref, 'FECHA': c['FECHA'], 'MES REPORTE': txt(c['MES REPORTE']), 'COMPRADOR': txt(c['COMPRADOR']),
        'EQUIPOS': equipos, 'IMPORTE': Number(c['IMPORTE']), 'EVIDENCIA': txt(c['EVIDENCIA']), 'COMENTARIOS': txt(c['COMENTARIOS']),
      });
      cuenta.ventas++;
      lineas.push('→ venta ' + ref + ': ' + equipos + ' equipos, $' + Number(c['IMPORTE']));
    });

    // ---- Equipos: por NUCO, con su IMEI de comprobación
    const porNuco = {};
    LineasDatos.leerTabla('EQUIPOS').forEach((e) => {
      const n = LineasUtil.nucoVisible(e['NUCO']);
      if (n) (porNuco[n] = porNuco[n] || []).push(e);
    });
    const ligas = [];
    const vistos = {};
    leerCarga_(CARGA.EQUIPOS, ['NUCO', 'IMEI', 'REFERENCIA REPORTE', 'COMO SE UBICA']).forEach((c) => {
      const nuco = LineasUtil.nucoVisible(c['NUCO']) || '';
      const ref = txt(c['REFERENCIA REPORTE']);
      const que = 'NUCO ' + (nuco || '— (renglón ' + c.renglon + ')');
      if (!nuco) return fallo(que, 'sin NUCO');
      if (vistos[nuco]) return fallo(que, 'el NUCO se repite en la carga (renglón ' + vistos[nuco] + ')');
      vistos[nuco] = c.renglon;
      const venta = ventas[norm(ref)];
      if (!venta) return fallo(que, 'la venta «' + ref + '» no existe');
      const regs = porNuco[nuco] || [];
      if (regs.length !== 1) return fallo(que, regs.length ? regs.length + ' equipos con ese NUCO' : 'no hay equipo con ese NUCO');
      const e = regs[0];
      if (digitos(c['IMEI']) && digitos(c['IMEI']) !== digitos(e['IMEI'])) return fallo(que, 'el IMEI no coincide con el del inventario');
      const estatus = norm(e['ESTATUS EQUIPO']);
      if (estatus !== 'VENDIDO') return fallo(que, 'en el inventario está ' + (estatus || 'sin estatus') + ', no VENDIDO');
      const actual = txt(e[COLUMNA_EQUIPOS]);
      if (actual === venta.id) { cuenta.ligadosYa++; venta.ligados++; return; }
      if (actual) return fallo(que, 'ya está ligado a otra venta (' + actual + ')');
      if (venta.ligados >= venta.equipos) return fallo(que, 'la venta ' + ref + ' ya tiene sus ' + venta.equipos + ' equipos ligados');
      venta.ligados++;
      ligas.push({ equipo: e, venta: venta, ref: ref, porque: txt(c['COMO SE UBICA']) });
      cuenta.ligados++;
    });
    // Las ventas ya existentes cuentan también lo que ya tenían ligado antes de esta carga
    Object.keys(porNuco).forEach((n) => porNuco[n].forEach((e) => {
      const id = txt(e[COLUMNA_EQUIPOS]);
      if (!id || vistos[n]) return;
      Object.keys(ventas).forEach((k) => { if (ventas[k].id === id) ventas[k].ligados++; });
    }));

    if (aplicar && (nuevas.length || ligas.length)) {
      LineasDatos.conCandado(() => {
        LineasDatos.asegurarPestana(HOJA, ENCABEZADOS);
        if (nuevas.length) LineasDatos.agregarFilas(HOJA, nuevas);
        if (!ligas.length) return;
        LineasDatos.asegurarColumnas('EQUIPOS', [COLUMNA_EQUIPOS]);
        LineasDatos.actualizarFilas('EQUIPOS', ligas.map((l) => ({ fila: l.equipo._fila, cambios: { [COLUMNA_EQUIPOS]: l.venta.id } })));
        LineasDatos.agregarFilas('MOVIMIENTOS', ligas.map((l) => ({
          'FECHA': ahora, 'ACCION': 'EDICION', 'ID EQUIPO': txt(l.equipo['ID']),
          'COMENTARIO': 'Ligado a la venta ' + l.ref + ' del reporte de líneas' + (l.porque ? ' · ' + l.porque : ''),
          'CAMBIOS': JSON.stringify([{ campo: COLUMNA_EQUIPOS, antes: '', despues: l.venta.id }]),
          'QUIEN': quien, 'ORIGEN': ORIGEN,
        })));
      });
      LineasLectura.limpiarCaches();
    }
    ligas.forEach((l) => lineas.push((aplicar ? '✓' : '→') + ' NUCO ' + LineasUtil.nucoVisible(l.equipo['NUCO']) + ' → venta ' + l.ref));
    Object.keys(ventas).forEach((k) => {
      const v = ventas[k];
      if (v.ligados < v.equipos) lineas.push('· venta ' + k + ': ' + v.ligados + ' de ' + v.equipos + ' equipos ligados (los demás, sin evidencia)');
    });

    const resumen = (aplicar ? 'APLICADO' : 'REVISIÓN (no se cambió nada)') + ' · ventas: ' + cuenta.ventas + (aplicar ? ' creadas' : ' se crearían') +
      ', ' + cuenta.ventasYa + ' ya estaban · equipos: ' + cuenta.ligados + (aplicar ? ' ligados' : ' se ligarían') + ', ' + cuenta.ligadosYa +
      ' ya estaban · ' + cuenta.error + ' con error';
    Logger.log(resumen + '\n' + lineas.join('\n'));
    return resumen;
  }

  return { HOJA, ENCABEZADOS, COLUMNA_EQUIPOS, CARGA, cargar_ };
})();

function lineasVentasCargaRevisar() {
  soloEditor_();
  return LineasVentas.cargar_(false);
}

function lineasVentasCargaAplicar(confirmacion) {
  soloEditor_();
  if (String(Config.ENTORNO || '').toUpperCase() === 'PROD' && confirmacion !== 'SI, EN PROD') {
    throw new Error("En producción pide la confirmación: lineasVentasCargaAplicar('SI, EN PROD'). Primero lineasVentasCargaRevisar.");
  }
  return LineasVentas.cargar_(true);
}

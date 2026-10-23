#!/usr/bin/env node
/**
 * tools/lineas-datos/separar-cancelaciones.js — pendiente 3.13 (usuario, 20-oct): los renglones ABIERTOS de APP_RESGUARDOS
 * de antes del 3.12 juntan el resguardo del equipo y la cancelación de su línea. Se separan una vez, con la forma que hoy
 * arma LineasResguardos.mandar:
 * - el del equipo se queda en Resguardos sin la cancelación, con LINEA_AL_MANDAR (el número que tenía);
 * - uno nuevo en Cancelaciones sigue a la línea (REGISTRO_ID e ID_LINEA = la línea, como abrirCancelacion_), con su fase,
 *   fechas, asunto, asesor, motivo, quien la mandó y el NUCO del que salió; su FECHA es la del envío (Retirar
 *   cancelación busca así el renglón del equipo, LineasResguardos.envioDeCancelacion_);
 * - si la línea sigue en el equipo, se desvincula como LineasEscritura.separarLinea: se cierra la asignación, el equipo
 *   sigue en una nueva sin la línea, la línea queda en una de RESGUARDO (DISPONIBLE, misma sede y oficina) EN PROCESO DE
 *   CANCELACION y el equipo pierde su PIN de WhatsApp. Deja un movimiento EDICION.
 * También los ya cancelados (usuario, 22-oct: «separar los 23»). Los cerrados (entregados, vendidos…) no se tocan. Lo que
 * pida criterio (sin equipo, sin línea, la línea en otro equipo) solo se reporta. Reglas de estos programas: comun.js.
 *
 * Uso:   node tools/lineas-datos/separar-cancelaciones.js [--produccion] [--ensayo]
 */
'use strict';
const c = require('./comun.js');

const TAB = 'APP_RESGUARDOS';
const ABIERTOS = ['PENDIENTE DE RECEPCION', 'EN RESGUARDO'];
const EN_CURSO = ['POR FIRMAR', 'CARTA FIRMADA', 'CARTA ENVIADA'];
const LINEA_CANCELACION = 'EN PROCESO DE CANCELACION';
const COLUMNAS_NUEVAS = ['MOTIVO_CANCELACION', 'ACCESORIOS', 'ID_LINEA', 'LINEA_AL_MANDAR', 'MOVIMIENTO_ID', 'RETIRADO_EN', 'RETIRO', 'RETIRO_MOTIVO'];
/** Lo de la cancelación: pasa al renglón nuevo y sale del renglón del equipo. */
const DE_CANCELACION = ['CANCELACION', 'ASESOR', 'CARTA_FIRMADA_EN', 'CARTA_ENVIADA_EN', 'CANCELACION_ASUNTO', 'CANCELADA_EN', 'CANCELO', 'MOTIVO_CANCELACION'];
/** Lo de la línea en el renglón del equipo: la línea ya no queda con él (en mandar, lineaQueda = false). */
const DE_LINEA = ['COMPANIA', 'RAZON_SOCIAL', 'FIN_PLAN', 'ESTATUS_LINEA'];
const ADICIONALES = ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'].reduce((a, n) => a.concat(['NO EMPLEADO ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE']), []);
const UBICACION = ['DEPARTAMENTO', 'SEDE', 'OFICINA / DESARROLLO'];
const PIN_VACIO = ['', 'N/A', 'NA', 'NO APLICA', '-', 'SOLO LINEA', 'SIN EQUIPO'];
// Solo la acción que se hizo (usuario, 22-oct: antes llevaba «(PENDIENTE 3.13)»; textos-movimientos.js)
const COMENTARIO = 'RESGUARDO Y CANCELACION SEPARADOS: LA LINEA SE DESVINCULA DEL EQUIPO Y SIGUE EN CANCELACIONES';

const digitos = (v) => c.txt(v).replace(/\D/g, '').slice(-10);

/** Qué hacer con cada renglón viejo: { r, e, l, a (asignación que junta los dos, si sigue), problema }. */
function planear(resg, equipos, lineas, asig) {
  const eqPorId = {};
  equipos.filas.forEach((e) => ['ID', 'ID ANTERIOR', 'ID APPSHEET'].forEach((k) => { if (c.txt(e[k])) eqPorId[c.txt(e[k])] = e; }));
  const lineasPorNumero = {};
  lineas.filas.forEach((l) => { const n = digitos(l['NUMERO TELEFONO']); if (n) (lineasPorNumero[n] = lineasPorNumero[n] || []).push(l); });
  const vigentes = asig.filas.filter((a) => !c.txt(a['FECHA FIN']));
  const viejos = resg.filas.filter((r) => ABIERTOS.indexOf(c.may(r['ESTADO'])) >= 0 && c.txt(r['CANCELACION']) && !c.txt(r['ID_LINEA']));
  return viejos.map((r) => {
    const e = eqPorId[c.txt(r['REGISTRO_ID'])];
    if (!e) return { r, problema: 'Su equipo (' + c.txt(r['REGISTRO_ID']) + ') no está en EQUIPOS' };
    const n = digitos(r['NUMERO']);
    const conEquipo = vigentes.filter((a) => c.txt(a['ID EQUIPO']) === c.txt(e['ID']) && c.txt(a['ID LINEA']));
    const candidatas = lineasPorNumero[n] || [];
    // La que sigue en el equipo; si no, la del número con el estatus que va con la fase
    let l = candidatas.filter((x) => conEquipo.some((a) => c.txt(a['ID LINEA']) === c.txt(x['ID'])))[0];
    if (!l) {
      const quiere = EN_CURSO.indexOf(c.may(r['CANCELACION'])) >= 0 ? LINEA_CANCELACION : c.may(r['CANCELACION']);
      const conEstatus = candidatas.filter((x) => c.may(x['ESTATUS LINEA']) === quiere);
      l = conEstatus.length === 1 ? conEstatus[0] : (candidatas.length === 1 ? candidatas[0] : null);
      if (!l) return { r, e, problema: candidatas.length ? candidatas.length + ' líneas con el número ' + n : 'No hay línea con el número ' + (n || '(vacío)') };
    }
    const a = conEquipo.filter((x) => c.txt(x['ID LINEA']) === c.txt(l['ID']))[0] || null;
    const enOtro = !a && vigentes.filter((x) => c.txt(x['ID LINEA']) === c.txt(l['ID']) && c.txt(x['ID EQUIPO']))[0];
    const lineaHoy = vigentes.filter((x) => c.txt(x['ID LINEA']) === c.txt(l['ID']))[0] || null;
    return { r, e, l, a, enOtro: enOtro ? c.txt(enOtro['ID EQUIPO']) : '', lineaHoy };
  });
}

/** El renglón nuevo de Cancelaciones (la forma de LineasResguardos.abrirCancelacion_, con lo del envío viejo). */
function renglonCancelacion(x, ubicacion, Ids) {
  const r = x.r;
  const o = {
    'ID': Ids.nuevo('RSG'), 'FECHA': r['FECHA'], 'REGISTRO_ID': c.txt(x.l['ID']), 'ID_LINEA': c.txt(x.l['ID']), 'NUCO': c.txt(r['NUCO']),
    'NUMERO': c.txt(r['NUMERO']), 'TIPO': c.may(x.l['TIPO DE LINEA']) === 'SIM BASICO' ? 'SIM BASICO' : 'LINEA', 'MODELO': '', 'IMEI': '',
    'COMPANIA': c.txt(r['COMPANIA']), 'RAZON_SOCIAL': c.txt(r['RAZON_SOCIAL']), 'ACCESORIOS': '', 'FIN_PLAN': c.txt(r['FIN_PLAN']),
    'ESTATUS_EQUIPO': '', 'ESTATUS_LINEA': c.txt(r['ESTATUS_LINEA']) || LINEA_CANCELACION,
    'DEPARTAMENTO': ubicacion['DEPARTAMENTO'], 'SEDE': ubicacion['SEDE'], 'OFICINA': ubicacion['OFICINA / DESARROLLO'],
    'COMENTARIO': '', 'MOTIVO': c.txt(r['MOTIVO']), 'SOLICITO_CORREO': c.txt(r['SOLICITO_CORREO']), 'SOLICITO_NOMBRE': c.txt(r['SOLICITO_NOMBRE']),
    'ESTADO': '', 'ACTUALIZADO_EN': r['ACTUALIZADO_EN'], 'MOVIMIENTO_ID': '',
  };
  DE_CANCELACION.forEach((k) => { o[k] = r[k] === undefined ? '' : r[k]; });
  return o;
}

async function main() {
  const libro = c.libro();
  const [resg, equipos, lineas, asig, mov] = await Promise.all([c.tablaSinFormato(libro, TAB), c.tabla(libro, 'EQUIPOS'), c.tabla(libro, 'LINEAS'),
    c.tablaSinFormato(libro, 'ASIGNACIONES'), c.tabla(libro, 'MOVIMIENTOS')]);
  const plan = planear(resg, equipos, lineas, asig);
  const cerrados = resg.filas.filter((r) => c.txt(r['ESTADO']) && ABIERTOS.indexOf(c.may(r['ESTADO'])) < 0 && EN_CURSO.indexOf(c.may(r['CANCELACION'])) >= 0);
  const hacer = plan.filter((x) => !x.problema && !x.enOtro);
  console.log('\nRenglones abiertos que juntan resguardo y cancelación: ' + plan.length + ' · se separan: ' + hacer.length +
    ' · la línea se desvincula en ' + hacer.filter((x) => x.a).length);
  plan.forEach((x) => {
    const r = x.r;
    const base = '  NUCO ' + (c.txt(r['NUCO']) || '—') + ' · ' + c.txt(r['NUMERO']) + ' · ' + c.txt(r['ESTADO']) + ' · ' + c.txt(r['CANCELACION']) + ' · ' + c.txt(r['ID']);
    if (x.problema) console.log(base + ' · NO SE TOCA: ' + x.problema);
    else if (x.enOtro) console.log(base + ' · NO SE TOCA: la línea ' + c.txt(x.l['ID']) + ' está en otro equipo (' + x.enOtro + ')');
    else console.log(base + ' · línea ' + c.txt(x.l['ID']) + ' ' + c.txt(x.l['ESTATUS LINEA']) + (x.a ? ' · SE DESVINCULA (asignación ' + c.txt(x.a['ID']) + ')' : ' · ya estaba suelta'));
  });
  if (cerrados.length) {
    console.log('\nCerrados con la cancelación en curso (no se tocan; su cancelación se sigue encontrando por el número): ' + cerrados.length);
    cerrados.forEach((r) => console.log('  NUCO ' + c.txt(r['NUCO']) + ' · ' + c.txt(r['NUMERO']) + ' · ' + c.txt(r['ESTADO']) + ' · ' + c.txt(r['CANCELACION'])));
  }
  const faltan = COLUMNAS_NUEVAS.filter((k) => resg.enc.indexOf(k) < 0);
  if (faltan.length) console.log('\n' + TAB + ' no tiene ' + faltan.join(', ') + ': se agregan al final');
  if (c.ENSAYO || !hacer.length) return;

  await c.asegurarColumnas(libro, resg, faltan);
  const Ids = c.idsGs();
  const ahora = c.serieAhora();
  const datos = [];
  const nuevasAsig = [];
  const formatoAsig = [];
  const cancelaciones = [];
  const formatoCanc = [];
  const movimientos = [];
  hacer.forEach((x) => {
    let ubicacion = x.lineaHoy || x.a || {};
    if (x.a) {
      // LineasEscritura.separarLinea: cierra la que junta los dos; el equipo sigue en una igual sin la línea, y la línea
      // queda guardada (datosAsignacion_('RESGUARDO'): sin persona, misma sede y oficina, DEPARTAMENTO DISPONIBLE)
      datos.push({ range: c.celda(asig, 'FECHA FIN', x.a), values: [[ahora]] });
      const delEquipo = {};
      asig.enc.forEach((k) => { delEquipo[k] = x.a[k] === undefined ? '' : x.a[k]; });
      nuevasAsig.push(Object.assign(delEquipo, { 'ID': Ids.nuevo('ASG'), 'ID LINEA': '', 'FECHA INICIO': ahora, 'FECHA FIN': '' }));
      const deLinea = { 'ID': Ids.nuevo('ASG'), 'TIPO': 'RESGUARDO', 'ID LINEA': c.txt(x.l['ID']), 'ID EQUIPO': '', 'FECHA INICIO': ahora, 'FECHA FIN': '' };
      UBICACION.forEach((k) => { deLinea[k] = x.a[k] === undefined ? '' : x.a[k]; });
      deLinea['DEPARTAMENTO'] = 'DISPONIBLE';
      nuevasAsig.push(deLinea);
      formatoAsig.push(x.a._n, x.a._n);
      ubicacion = deLinea;
      const cambios = [{ campo: 'NUMERO TELEFONO', antes: c.txt(x.l['NUMERO TELEFONO']), despues: '' }];
      const pin = c.txt(x.e['PIN WHATSAPP']);
      if (PIN_VACIO.indexOf(c.may(pin)) < 0) {
        datos.push({ range: c.celda(equipos, 'PIN WHATSAPP', x.e), values: [['']] });
        cambios.push({ campo: 'PIN WHATSAPP', antes: pin, despues: '' });
      }
      if (EN_CURSO.indexOf(c.may(x.r['CANCELACION'])) >= 0 && c.may(x.l['ESTATUS LINEA']) !== LINEA_CANCELACION) {
        datos.push({ range: c.celda(lineas, 'ESTATUS LINEA', x.l), values: [[LINEA_CANCELACION]] });
        cambios.push({ campo: 'ESTATUS LINEA', antes: c.txt(x.l['ESTATUS LINEA']), despues: LINEA_CANCELACION });
      }
      movimientos.push({ accion: 'EDICION', equipo: c.txt(x.e['ID']), linea: c.txt(x.l['ID']), asignacion: c.txt(x.a['ID']), comentario: COMENTARIO, cambios });
    }
    // El renglón del equipo: sin la cancelación ni lo de la línea, con el número que tenía al mandarlo
    const quitar = DE_CANCELACION.concat(DE_LINEA);
    quitar.forEach((k) => { if (c.txt(x.r[k])) datos.push({ range: c.celda(resg, k, x.r), values: [['']] }); });
    if (!c.txt(x.r['LINEA_AL_MANDAR'])) datos.push({ range: c.celda(resg, 'LINEA_AL_MANDAR', x.r), values: [[c.txt(x.r['NUMERO'])]] });
    datos.push({ range: c.celda(resg, 'ACTUALIZADO_EN', x.r), values: [[ahora]] });
    cancelaciones.push(renglonCancelacion(x, { 'DEPARTAMENTO': c.txt(ubicacion['DEPARTAMENTO']) || 'DISPONIBLE', 'SEDE': c.txt(ubicacion['SEDE']) || c.txt(x.r['SEDE']),
      'OFICINA / DESARROLLO': c.txt(ubicacion['OFICINA / DESARROLLO']) || c.txt(x.r['OFICINA']) }, Ids));
    formatoCanc.push(x.r._n);
  });
  // Primero los renglones nuevos (copian el formato del renglón viejo, que todavía tiene sus fechas), luego lo que se borra
  await c.agregarFilas(libro, resg, cancelaciones, formatoCanc);
  await c.agregarFilas(libro, asig, nuevasAsig, formatoAsig);
  await c.escribirCeldas(libro, datos);
  console.log('Escrito: ' + datos.length + ' celdas');
  // La FECHA FIN que se cierra, con el formato de su FECHA INICIO (la celda vacía no lo tiene)
  const cerradas = hacer.filter((x) => x.a);
  if (cerradas.length) {
    const hoja = await c.idDeHoja(libro, 'ASIGNACIONES');
    const col = (k) => asig.enc.indexOf(k);
    await c.api('POST', c.SHEETS + libro + ':batchUpdate', { requests: cerradas.map((x) => ({ copyPaste: {
      source: { sheetId: hoja, startRowIndex: x.a._n - 1, endRowIndex: x.a._n, startColumnIndex: col('FECHA INICIO'), endColumnIndex: col('FECHA INICIO') + 1 },
      destination: { sheetId: hoja, startRowIndex: x.a._n - 1, endRowIndex: x.a._n, startColumnIndex: col('FECHA FIN'), endColumnIndex: col('FECHA FIN') + 1 },
      pasteType: 'PASTE_FORMAT' } })) });
  }
  await c.agregarMovimientos(libro, mov, movimientos);
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
module.exports = { planear, renglonCancelacion };

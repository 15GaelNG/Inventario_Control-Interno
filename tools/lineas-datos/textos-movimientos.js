#!/usr/bin/env node
/**
 * tools/lineas-datos/textos-movimientos.js — usuario, 22-oct: en los movimientos de estos programas el comentario dice
 * solo la acción que se hizo («ACCESORIOS: CARGADOR SE SEPARA EN CABLE Y CUBO», sin «(USUARIO, 22-OCT)» ni «(PENDIENTE
 * 3.15)»), y los de cable-cubo.js y corregir-color.js dicen de qué documento son y su fecha («RESPONSIVA DEL 29/05/2026 ·
 * ACCESORIOS»; en EQUIPOS, solo la columna), para distinguir los de un mismo equipo. Cambia COMENTARIO y CAMBIOS de los
 * movimientos ya escritos; nada más. Cada movimiento de un documento se liga con su renglón por el orden en que el
 * programa los escribió (hoja, registro y valor de hoy). Reglas de estos programas: comun.js.
 *
 * Uso:   node tools/lineas-datos/textos-movimientos.js [--produccion] [--ensayo]
 */
'use strict';
const c = require('./comun.js');

/** Comentario de antes → el de hoy (el de cada programa: su COMENTARIO). */
const TEXTOS = {
  'ACCESORIOS: CARGADOR SE SEPARA EN CABLE Y CUBO (USUARIO, 22-OCT)': 'ACCESORIOS: CARGADOR SE SEPARA EN CABLE Y CUBO',
  'COLOR MAL ESCRITO: SE CORRIGE (USUARIO, 22-OCT)': 'COLOR MAL ESCRITO: SE CORRIGE',
  'PATRON GUARDADO COMO FECHA: SE REGRESA A TEXTO (PENDIENTE 2.47)': 'PATRON GUARDADO COMO FECHA: SE REGRESA A TEXTO',
  'DIRECCION GENERAL: SE LIMPIA EL RESPONSABLE Y SOLO QUEDA EL AREA (PENDIENTE 8.16, L28)': 'DIRECCION GENERAL: SE LIMPIA EL RESPONSABLE Y SOLO QUEDA EL AREA',
  'POR RECIBIR: SIGUE PENDIENTE DE RECEPCION EN RESGUARDOS Y CANCELACIONES (PENDIENTE 3.15)': 'POR RECIBIR: SIGUE PENDIENTE DE RECEPCION EN RESGUARDOS Y CANCELACIONES',
  'RESGUARDO Y CANCELACION SEPARADOS: LA LINEA SE DESVINCULA DEL EQUIPO Y SIGUE EN CANCELACIONES (PENDIENTE 3.13)': 'RESGUARDO Y CANCELACION SEPARADOS: LA LINEA SE DESVINCULA DEL EQUIPO Y SIGUE EN CANCELACIONES',
};
/** Los de un documento, con su campo «HOJA · COLUMNA» (cable-cubo.js y corregir-color.js). */
const CON_DOCUMENTO = ['ACCESORIOS: CARGADOR SE SEPARA EN CABLE Y CUBO', 'COLOR MAL ESCRITO: SE CORRIGE'];
const HOJAS = { 'EQUIPOS': 'ID', 'INSPECCIONES LINEAS': 'ID LINEA', 'RESPONSIVAS LINEAS': 'ID LINEA', 'APP_RESGUARDOS': 'REGISTRO_ID' };

/** El campo viejo «HOJA · COLUMNA», o null. */
function campoViejo(campo) {
  const m = String(campo || '').match(/^(EQUIPOS|INSPECCIONES LINEAS|RESPONSIVAS LINEAS|APP_RESGUARDOS) · (.+)$/);
  return m ? { hoja: m[1], columna: m[2] } : null;
}

/**
 * Los cambios por hacer: [{ f (movimiento), comentario?, cambios? (JSON nuevo), nota }]. `tablas` = { hoja: tabla } de
 * las hojas de HOJAS.
 */
function plan(mov, tablas) {
  const usados = {};
  const salida = [];
  mov.filas.forEach((f) => {
    const antes = c.txt(f['COMENTARIO']);
    const comentario = Object.prototype.hasOwnProperty.call(TEXTOS, antes) ? TEXTOS[antes] : antes;
    const x = { f, nota: '' };
    if (comentario !== antes) x.comentario = comentario;
    if (CON_DOCUMENTO.indexOf(comentario) >= 0 && c.txt(f['QUIEN']) === 'AUTOMATIZACIÓN') {
      let lista;
      try { lista = JSON.parse(c.txt(f['CAMBIOS']) || '[]'); } catch (e) { lista = null; }
      let tocado = false;
      (lista || []).forEach((k) => {
        const v = campoViejo(k.campo);
        if (!v || !tablas[v.hoja]) return;
        tocado = true;
        if (v.hoja === 'EQUIPOS') { k.campo = v.columna; return; }
        // El k-ésimo movimiento de este registro y valor es el k-ésimo renglón suyo en la hoja (el orden del programa)
        const reg = c.txt(f['ID EQUIPO']) || c.txt(f['ID LINEA']);
        const clave = v.hoja + '|' + reg + '|' + v.columna + '|' + c.txt(k.despues);
        const filas = tablas[v.hoja].filas.filter((r) => c.txt(r[HOJAS[v.hoja]]) === reg && c.txt(r[v.columna]) === c.txt(k.despues));
        const i = usados[clave] || 0;
        usados[clave] = i + 1;
        if (filas[i]) { k.campo = c.campoDe(v.hoja, filas[i], v.columna); x.nota = c.txt(filas[i]['ID']); }
        else { k.campo = c.campoDe(v.hoja, {}, v.columna); x.nota = 'SIN SU RENGLÓN: sin fecha'; }
      });
      if (tocado) x.cambios = JSON.stringify(lista);
    }
    if (x.comentario !== undefined || x.cambios !== undefined) salida.push(x);
  });
  return salida;
}

async function main() {
  const libro = c.libro();
  const mov = await c.tabla(libro, 'MOVIMIENTOS');
  const tablas = {};
  for (const h of Object.keys(HOJAS)) tablas[h] = await c.tabla(libro, h);
  const lista = plan(mov, tablas);
  const cuenta = {};
  lista.forEach((x) => { const k = x.comentario || c.txt(x.f['COMENTARIO']); cuenta[k] = (cuenta[k] || 0) + 1; });
  console.log('\nMovimientos por cambiar: ' + lista.length);
  Object.keys(cuenta).forEach((k) => console.log('  ' + cuenta[k] + ' · ' + k));
  console.log('Sin su renglón: ' + lista.filter((x) => /^SIN/.test(x.nota)).length);
  lista.forEach((x) => console.log('    renglón ' + x.f._n + ' · ' + c.txt(x.f['ID EQUIPO']) + (x.cambios ? ' · ' + JSON.parse(x.cambios).map((k) => k.campo).join(', ') : '') + (x.nota ? ' · ' + x.nota : '')));
  if (c.ENSAYO || !lista.length) return;
  const datos = [];
  lista.forEach((x) => {
    if (x.comentario !== undefined) datos.push({ range: c.celda(mov, 'COMENTARIO', x.f), values: [[x.comentario]] });
    if (x.cambios !== undefined) datos.push({ range: c.celda(mov, 'CAMBIOS', x.f), values: [[x.cambios]] });
  });
  await c.escribirCeldas(libro, datos);
  console.log('\nEscrito: ' + datos.length + ' celdas. Falta «Recargar datos» en la app.');
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
module.exports = { plan, campoViejo, TEXTOS };

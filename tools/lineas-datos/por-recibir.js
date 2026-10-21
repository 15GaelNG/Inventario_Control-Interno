#!/usr/bin/env node
/**
 * tools/lineas-datos/por-recibir.js — pendiente 3.15 (usuario, 21-oct): los equipos que ya estaban en el panel de Pau
 * por recibir (su renglón de APP_RESGUARDOS en PENDIENTE DE RECEPCION) pasan a ESTATUS EQUIPO «POR RECIBIR» en EQUIPOS,
 * como los que se mandan desde el 3.15 (LineasResguardos.mandar). El estatus elegido ya está en su renglón
 * (ESTATUS_EQUIPO): Pau se lo pone al recibirlo. Si el renglón no lo tiene, se le pone el que tiene hoy el equipo, para
 * no perderlo. Cada equipo deja un movimiento EDICION. El renglón cuyo REGISTRO_ID no es de ningún equipo (los viejos
 * del 3.13) solo se reporta. Reglas de estos programas: comun.js.
 *
 * Uso:   node tools/lineas-datos/por-recibir.js [--produccion] [--ensayo]
 */
'use strict';
const c = require('./comun.js');

const POR_RECIBIR = 'POR RECIBIR';
const PENDIENTE = 'PENDIENTE DE RECEPCION';
const COMENTARIO = 'POR RECIBIR: SIGUE PENDIENTE DE RECEPCION EN RESGUARDOS Y CANCELACIONES (PENDIENTE 3.15)';

async function main() {
  const libro = c.libro();
  const [resg, equipos, mov] = await Promise.all([c.tabla(libro, 'APP_RESGUARDOS'), c.tabla(libro, 'EQUIPOS'), c.tabla(libro, 'MOVIMIENTOS')]);
  // El equipo por cualquiera de sus IDs (LineasDatos.idsDeFila: ID, ID ANTERIOR e ID APPSHEET)
  const porId = {};
  equipos.filas.forEach((e) => ['ID', 'ID ANTERIOR', 'ID APPSHEET'].forEach((k) => { if (c.txt(e[k])) porId[c.txt(e[k])] = e; }));

  const cambios = [];
  const sinEquipo = [];
  let yaEstan = 0;
  resg.filas.filter((r) => c.may(r['ESTADO']) === PENDIENTE).forEach((r) => {
    const e = porId[c.txt(r['REGISTRO_ID'])];
    if (!e) { sinEquipo.push(r); return; }
    if (c.may(e['ESTATUS EQUIPO']) === POR_RECIBIR) { yaEstan++; return; }
    cambios.push({ r, e, antes: c.txt(e['ESTATUS EQUIPO']), elegido: c.txt(r['ESTATUS_EQUIPO']) || c.txt(e['ESTATUS EQUIPO']) });
  });
  console.log('\nPor recibir en el panel: ' + (cambios.length + sinEquipo.length + yaEstan) + ' · a POR RECIBIR: ' + cambios.length +
    ' · ya estaban: ' + yaEstan + ' · sin equipo: ' + sinEquipo.length);
  cambios.forEach((x) => console.log('  NUCO ' + (c.txt(x.e['NUCO']) || '—') + ' · ' + c.txt(x.e['ID']) + ' · ' + (x.antes || '(vacío)') + ' → ' + POR_RECIBIR +
    ' · elegido en el renglón: ' + x.elegido + (c.txt(x.r['ESTATUS_EQUIPO']) ? '' : ' (se le pone al renglón)')));
  sinEquipo.forEach((r) => console.log('  SIN EQUIPO · renglón ' + c.txt(r['ID']) + ' · REGISTRO_ID ' + c.txt(r['REGISTRO_ID']) + ' · NUCO ' + c.txt(r['NUCO'])));
  if (c.ENSAYO || !cambios.length) return;

  const datos = [];
  cambios.forEach((x) => {
    if (!c.txt(x.r['ESTATUS_EQUIPO'])) datos.push({ range: c.celda(resg, 'ESTATUS_EQUIPO', x.r), values: [[x.elegido]] });
    datos.push({ range: c.celda(equipos, 'ESTATUS EQUIPO', x.e), values: [[POR_RECIBIR]] });
  });
  await c.escribirCeldas(libro, datos);
  console.log('\nEscrito: ' + datos.length + ' celdas');
  await c.agregarMovimientos(libro, mov, cambios.map((x) => ({ accion: 'EDICION', equipo: c.txt(x.e['ID']), comentario: COMENTARIO,
    cambios: [{ campo: 'ESTATUS EQUIPO', antes: x.antes, despues: POR_RECIBIR }] })));
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });

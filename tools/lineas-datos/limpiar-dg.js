#!/usr/bin/env node
/**
 * tools/lineas-datos/limpiar-dg.js — pendiente 8.16 (usuario, 21-oct, después de preguntar a Líneas; L28): en las
 * asignaciones vigentes de Dirección General (sus 12 líneas y los NUCO 11001 a 11011: la lista de LineasDG.gs) se limpia
 * todo el responsable (ID PERSONA, NO EMPLEADO, RESPONSABLE, PUESTO, DEPARTAMENTO, SEDE, OFICINA / DESARROLLO, DIRECTOR
 * con su «USO», CUENTA GOOGLE, JEFE DIRECTO y los responsables adicionales) y solo queda AREA = DIRECCION GENERAL
 * (usuario, 22-oct: «solo Área se quedaría como DIRECCION GENERAL, todo lo demás en blanco»). Los estatus y las fechas
 * no se tocan. Cada asignación deja un movimiento EDICION. Lo de la lista que no está en el libro se reporta. Reglas de
 * estos programas: comun.js.
 *
 * Uso:   node tools/lineas-datos/limpiar-dg.js [--produccion] [--ensayo]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const c = require('./comun.js');

// Solo la acción que se hizo (usuario, 22-oct: antes llevaba «(PENDIENTE 8.16, L28)»; textos-movimientos.js)
const COMENTARIO = 'DIRECCION GENERAL: SE LIMPIA EL RESPONSABLE Y SOLO QUEDA EL AREA';
const LIMPIAR = ['ID PERSONA', 'NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DEPARTAMENTO', 'SEDE', 'OFICINA / DESARROLLO', 'JEFE DIRECTO',
  'DIRECTOR', 'CUENTA GOOGLE']
  .concat(['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'].reduce((a, n) => a.concat(['NO EMPLEADO ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE']), []));
const AREA = ['AREA'];

/** La lista de LineasDG.gs (la misma que usa la app; nada corre al cargar). */
function dg() {
  const ctx = vm.createContext({ LineasUtil: {} });
  vm.runInContext(fs.readFileSync(path.join(c.REPO, 'src/services/lineas/LineasDG.gs'), 'utf8') + '\nthis.DG = LineasDG;', ctx);
  return ctx.DG;
}

async function main() {
  const DG = dg();
  const libro = c.libro();
  const [asig, equipos, lineas, mov] = await Promise.all(['ASIGNACIONES', 'EQUIPOS', 'LINEAS', 'MOVIMIENTOS'].map((h) => c.tabla(libro, h)));
  const equiposDG = {};
  const lineasDG = {};
  equipos.filas.forEach((e) => { if (DG.esNuco(e['NUCO'])) equiposDG[c.txt(e['ID'])] = e; });
  lineas.filas.forEach((l) => { if (DG.esNumero(l['NUMERO TELEFONO'])) lineasDG[c.txt(l['ID'])] = l; });
  const nucosVistos = Object.values(equiposDG).map((e) => c.txt(e['NUCO']).replace(/^0+/, ''));
  const numerosVistos = Object.values(lineasDG).map((l) => c.txt(l['NUMERO TELEFONO']).replace(/\D/g, '').slice(-10));
  console.log('\nEn el libro: ' + nucosVistos.length + ' de ' + DG.NUCOS.length + ' NUCO y ' + numerosVistos.length + ' de ' + DG.NUMEROS.length + ' líneas de DG');
  DG.NUCOS.filter((n) => nucosVistos.indexOf(n) < 0).forEach((n) => console.log('  NO ESTÁ el NUCO ' + n));
  DG.NUMEROS.filter((n) => numerosVistos.indexOf(n) < 0).forEach((n) => console.log('  NO ESTÁ la línea ' + n));

  const cambios = [];
  asig.filas.filter((a) => !c.txt(a['FECHA FIN']) && (equiposDG[c.txt(a['ID EQUIPO'])] || lineasDG[c.txt(a['ID LINEA'])])).forEach((a) => {
    const campos = [];
    LIMPIAR.forEach((k) => { if (asig.enc.indexOf(k) >= 0 && c.txt(a[k])) campos.push({ campo: k, antes: c.txt(a[k]), despues: '' }); });
    AREA.forEach((k) => { if (asig.enc.indexOf(k) >= 0 && c.may(a[k]) !== DG.AREA) campos.push({ campo: k, antes: c.txt(a[k]), despues: DG.AREA }); });
    const e = equiposDG[c.txt(a['ID EQUIPO'])];
    const l = lineasDG[c.txt(a['ID LINEA'])];
    const quien = (e ? 'NUCO ' + c.txt(e['NUCO']) : '') + (e && l ? ' · ' : '') + (l ? 'línea ' + c.txt(l['NUMERO TELEFONO']) : '');
    if (campos.length) cambios.push({ a, campos, quien });
    else console.log('  ya limpia · ' + quien + ' · ' + c.txt(a['ID']));
  });
  console.log('\nAsignaciones vigentes de DG por limpiar: ' + cambios.length);
  cambios.forEach((x) => console.log('  ' + x.quien + ' · ' + c.txt(x.a['ID']) + ' · ' + x.campos.map((k) => k.campo + ' «' + k.antes + '» → «' + k.despues + '»').join(' · ')));
  if (c.ENSAYO || !cambios.length) return;

  const datos = [];
  cambios.forEach((x) => x.campos.forEach((k) => datos.push({ range: c.celda(asig, k.campo, x.a), values: [[k.despues]] })));
  await c.escribirCeldas(libro, datos);
  console.log('\nEscrito: ' + datos.length + ' celdas');
  await c.agregarMovimientos(libro, mov, cambios.map((x) => ({ accion: 'EDICION', equipo: c.txt(x.a['ID EQUIPO']), linea: c.txt(x.a['ID LINEA']),
    asignacion: c.txt(x.a['ID']), comentario: COMENTARIO, cambios: x.campos })));
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });

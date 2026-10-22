#!/usr/bin/env node
/**
 * tools/lineas-datos/cable-cubo.js — usuario, 22-oct: «en accesorios que se homologue cable y cubo, eliminar CARGADOR. O
 * sea que los registros anteriores si tienen "cargador" se separe como cable y cubo». Cambia cada CARGADOR por CABLE, CUBO
 * en la columna ACCESORIOS de EQUIPOS, INSPECCIONES LINEAS, RESPONSIVAS LINEAS, APP_RESGUARDOS y LINEAS TELEFONICAS (las
 * que la tengan), en su lugar y sin repetir el que ya estaba (LineasUtil.sinCargador, la misma regla de la app). Cada
 * renglón deja un movimiento EDICION. Reglas de estos programas: comun.js.
 *
 * Uso:   node tools/lineas-datos/cable-cubo.js [--produccion] [--ensayo]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const c = require('./comun.js');

const COMENTARIO = 'ACCESORIOS: CARGADOR SE SEPARA EN CABLE Y CUBO (USUARIO, 22-OCT)';
// El registro del renglón: en EQUIPOS su ID; en inspecciones y responsivas, ID LINEA (equipo o línea suelta); en el panel
// de Pau, REGISTRO_ID; en la hoja vieja, su ID
const HOJAS = [{ hoja: 'EQUIPOS', registro: 'ID' }, { hoja: 'INSPECCIONES LINEAS', registro: 'ID LINEA' },
  { hoja: 'RESPONSIVAS LINEAS', registro: 'ID LINEA' }, { hoja: 'APP_RESGUARDOS', registro: 'REGISTRO_ID' }, { hoja: 'LINEAS TELEFONICAS', registro: 'ID' }];

/** LineasUtil.sinCargador del mismo .gs (nada corre al cargar). */
function sinCargadorGs() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(c.REPO, 'src/services/lineas/LineasUtil.gs'), 'utf8') + '\nthis.U = LineasUtil;', ctx);
  return ctx.U.sinCargador;
}
const sinCargador = sinCargadorGs();

/** Lo que queda en ACCESORIOS, o null si no trae CARGADOR. */
function accesoriosSinCargador(valor) {
  const nuevo = sinCargador(valor);
  return nuevo === valor ? null : nuevo;
}

async function main() {
  const libro = c.libro();
  const meta = await c.api('GET', c.SHEETS + libro + '?fields=sheets.properties.title');
  const pestanas = meta.sheets.map((s) => s.properties.title);
  const mov = await c.tabla(libro, 'MOVIMIENTOS');
  const cambios = [];
  for (const { hoja, registro } of HOJAS) {
    if (pestanas.indexOf(hoja) < 0) { console.log('El libro no tiene ' + hoja); continue; }
    const t = await c.tabla(libro, hoja);
    if (t.enc.indexOf('ACCESORIOS') < 0) { console.log(hoja + ' no tiene ACCESORIOS'); continue; }
    let n = 0;
    t.filas.forEach((f) => {
      const nuevo = accesoriosSinCargador(c.txt(f['ACCESORIOS']));
      if (nuevo !== null) { n++; cambios.push({ t, f, hoja, registro: c.txt(f[registro]), antes: c.txt(f['ACCESORIOS']), nuevo }); }
    });
    console.log(hoja + ': ' + n + ' con CARGADOR');
  }
  console.log('\nRenglones con CARGADOR: ' + cambios.length);
  cambios.forEach((x) => console.log('  ' + x.hoja + ' renglón ' + x.f._n + ' · NUCO ' + (c.txt(x.f['NUCO']) || '—') + ' · ' + (c.txt(x.f['ID']) || x.registro) +
    ' · «' + x.antes + '» → «' + x.nuevo + '»'));
  if (c.ENSAYO || !cambios.length) return;
  await c.escribirCeldas(libro, cambios.map((x) => ({ range: c.celda(x.t, 'ACCESORIOS', x.f), values: [[x.nuevo]] })));
  console.log('\nEscrito: ' + cambios.length + ' celdas');
  await c.agregarMovimientos(libro, mov, cambios.map((x) => {
    const esLinea = /^LIN-/i.test(x.registro);
    return { accion: 'EDICION', equipo: esLinea ? '' : x.registro, linea: esLinea ? x.registro : '',
      documento: x.hoja === 'EQUIPOS' ? '' : c.txt(x.f['ID']), comentario: COMENTARIO,
      cambios: [{ campo: x.hoja + ' · ACCESORIOS', antes: x.antes, despues: x.nuevo }] };
  }));
}

if (require.main === module) main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
module.exports = { accesoriosSinCargador };

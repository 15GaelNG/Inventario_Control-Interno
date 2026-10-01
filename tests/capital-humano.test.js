/**
 * Pruebas de CapitalHumano.identificar (src/services/CapitalHumano.gs): quién es quién a
 * partir de la lista de Capital Humano, donde cada renglón es un EMPLEO.
 *
 * Los casos salen de los datos reales (01/10/2026): recontrataciones con el mismo número,
 * números que CH reutiliza para otra persona, gente con dos números a la vez, homónimos, y
 * números anteriores que ya son de alguien más. Lo que más protege: que nunca se fundan dos
 * personas distintas, y que un ID ya dado nunca cambie.
 *
 * Correr: node tests/capital-humano.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
function ok(condicion, descripcion) {
  console.log('  ' + (condicion ? '✔' : '✘') + ' ' + descripcion);
  if (!condicion) fallas++;
}

/** Hoja falsa con lo que CapitalHumano usa. */
function hojaFalsa(enc, filas) {
  const datos = [enc.slice()].concat(filas.map((f) => enc.map((c) => (c in f ? f[c] : ''))));
  return {
    datos,
    getLastRow: () => datos.length,
    getLastColumn: () => datos[0].length,
    getMaxRows: () => Math.max(datos.length, 1000),
    insertRowsAfter: () => {},
    getRange: (f, c, nf, nc) => ({
      getDisplayValues: () => datos.slice(f - 1, f - 1 + (nf || 1)).map((r) => r.slice(c - 1, c - 1 + (nc || 1)).map(String)),
      getValues: () => datos.slice(f - 1, f - 1 + (nf || 1)).map((r) => r.slice(c - 1, c - 1 + (nc || 1))),
      // Como en Apps Script, regresa el rango para poder encadenar
      setValues(v) { v.forEach((r, i) => { datos[f - 1 + i] = (datos[f - 1 + i] || []).slice(); r.forEach((x, j) => { datos[f - 1 + i][c - 1 + j] = x; }); }); return this; },
      setFontWeight() { return this; },
      setNumberFormat() { return this; },
    }),
  };
}

const ENC_CH = ['No EMPLEADO', 'NOMBRE COMPLETO', 'N. EMPLEADO ANTERIOR', 'FECHA DE NACIMIENTO', 'STATUS', 'RAZON SOCIAL'];

function cargar(hojas) {
  let ids = 0;
  const ss = {
    getSheetByName: (n) => hojas[n] || null,
    insertSheet: (n) => { hojas[n] = hojaFalsa([], []); hojas[n].datos.length = 0; return hojas[n]; },
  };
  const ctx = vm.createContext({
    console,
    Logger: { log: () => {} },
    SpreadsheetApp: { openById: () => ss },
    LockService: { getScriptLock: () => ({ waitLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS_LAB' } },
  });
  const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
  vm.runInContext(lee('config', 'Entidades.gs'), ctx);
  vm.runInContext(lee('utils', 'Ids.gs'), ctx);
  // IDs predecibles para poder comparar
  vm.runInContext('Ids.nuevo = (p) => p + "-" + String(++globalThis.__n).padStart(4, "0");', Object.assign(ctx, { __n: 0 }));
  vm.runInContext(lee('MigracionIds.gs') + '\n' + lee('services', 'CapitalHumano.gs') + '\nthis.CH = CapitalHumano;', ctx);
  return ctx.CH;
}

/** Las filas escritas en PERSONAS como objetos, por número + nombre. */
function personas(hojas) {
  const h = hojas['PERSONAS'];
  if (!h) return {};
  const [enc, ...filas] = h.datos;
  const out = {};
  filas.forEach((r) => { out[r[enc.indexOf('No EMPLEADO')] + '|' + r[enc.indexOf('NOMBRE COMPLETO')]] = { id: r[enc.indexOf('ID PERSONA')], motivo: r[enc.indexOf('MOTIVO')] }; });
  return out;
}

function escenario() {
  return {
    'COLABORADORES ACTUALIZADO': hojaFalsa(ENC_CH, [
      // recontratación: mismo número, mismo nombre, dos renglones
      { 'No EMPLEADO': 'CIB00223', 'NOMBRE COMPLETO': 'PERLA CRUZ', 'FECHA DE NACIMIENTO': '01/01/1990', STATUS: 'Baja' },
      { 'No EMPLEADO': 'CIB00223', 'NOMBRE COMPLETO': 'PERLA CRUZ', 'FECHA DE NACIMIENTO': '01/01/1990', STATUS: 'Activo' },
      // número reutilizado por CH: dos personas distintas
      { 'No EMPLEADO': 'HA00059', 'NOMBRE COMPLETO': 'FRANCISCO RAMIREZ', 'FECHA DE NACIMIENTO': '02/02/1980', STATUS: 'Baja' },
      { 'No EMPLEADO': 'HA00059', 'NOMBRE COMPLETO': 'VANESSA LLERA', 'FECHA DE NACIMIENTO': '03/03/1995', STATUS: 'Activo' },
      // dos números a la vez, sin liga en la hoja: mismo nombre y misma fecha de nacimiento
      { 'No EMPLEADO': 'HA00241', 'NOMBRE COMPLETO': 'JUAN FULGENCIO', 'FECHA DE NACIMIENTO': '04/04/1985', STATUS: 'Activo', 'RAZON SOCIAL': 'CENTRO' },
      { 'No EMPLEADO': 'VALLE02922', 'NOMBRE COMPLETO': 'JUAN FULGENCIO', 'FECHA DE NACIMIENTO': '04/04/1985', STATUS: 'Activo', 'RAZON SOCIAL': 'VALLE' },
      // homónimos: mismo nombre, otra fecha de nacimiento
      { 'No EMPLEADO': 'AC00001', 'NOMBRE COMPLETO': 'JOSE LOPEZ', 'FECHA DE NACIMIENTO': '05/05/1970', STATUS: 'Activo' },
      { 'No EMPLEADO': 'AC00002', 'NOMBRE COMPLETO': 'JOSE LOPEZ', 'FECHA DE NACIMIENTO': '06/06/1999', STATUS: 'Activo' },
      // número anterior que NO está en la hoja: se registra para la persona
      { 'No EMPLEADO': 'FRO01353', 'NOMBRE COMPLETO': 'ANA PEREZ', 'N. EMPLEADO ANTERIOR': 'AC00255', 'FECHA DE NACIMIENTO': '07/07/1992', STATUS: 'Activo' },
      // número anterior que ya es de OTRA persona en la hoja: no se juntan
      { 'No EMPLEADO': 'IPQ00309', 'NOMBRE COMPLETO': 'LUIS SOTO', 'N. EMPLEADO ANTERIOR': 'AC00001', 'FECHA DE NACIMIENTO': '08/08/1988', STATUS: 'Activo' },
      // sin fecha de nacimiento: nunca se junta por nombre
      { 'No EMPLEADO': 'PTE00001', 'NOMBRE COMPLETO': 'MARIA GOMEZ', STATUS: 'Activo' },
      { 'No EMPLEADO': 'PTE00002', 'NOMBRE COMPLETO': 'MARIA GOMEZ', STATUS: 'Activo' },
    ]),
  };
}

console.log('1. El ensayo cuenta y no escribe');
{
  const hojas = escenario();
  const r = cargar(hojas).identificar();
  ok(!hojas['PERSONAS'], 'no crea PERSONAS');
  // CIB00223(1) + Francisco(1) + Vanessa(1) + Juan(1) + 2 José + Ana(1) + Luis(1) + 2 María = 10
  ok(/Personas: 10 \(10 nuevas\)/.test(r), 'salen 10 personas de 12 renglones: ' + (r.match(/Personas: .*/) || [''])[0]);
  ok(/ambiguos\): 1 — HA00059/.test(r), 'HA00059 queda marcado como ambiguo');
  ok(/IPQ00309 \(LUIS SOTO\) dice que su número anterior es AC00001, pero en la hoja AC00001 es de JOSE LOPEZ/.test(r),
    'avisa del número anterior que ya es de otra persona');
}

console.log('\n2. Escribiendo: quién quedó con quién');
{
  const hojas = escenario();
  cargar(hojas).identificar({ escribir: true });
  const p = personas(hojas);
  ok(p['CIB00223|PERLA CRUZ'] && Object.keys(p).filter((k) => k.indexOf('CIB00223') === 0).length === 1,
    'la recontratación es un solo empleo');
  ok(p['HA00059|FRANCISCO RAMIREZ'].id !== p['HA00059|VANESSA LLERA'].id, 'el número reutilizado son DOS personas');
  ok(p['HA00241|JUAN FULGENCIO'].id === p['VALLE02922|JUAN FULGENCIO'].id, 'Juan con dos números es UNA persona');
  ok(/fecha de nacimiento/.test(p['HA00241|JUAN FULGENCIO'].motivo + p['VALLE02922|JUAN FULGENCIO'].motivo),
    'y el motivo lo dice');
  ok(p['AC00001|JOSE LOPEZ'].id !== p['AC00002|JOSE LOPEZ'].id, 'los homónimos son dos personas');
  ok(p['AC00255|ANA PEREZ'] && p['AC00255|ANA PEREZ'].id === p['FRO01353|ANA PEREZ'].id,
    'el número anterior que no está en la hoja queda ligado a su persona');
  ok(/número anterior de FRO01353/.test(p['AC00255|ANA PEREZ'].motivo), 'con su motivo');
  ok(p['IPQ00309|LUIS SOTO'].id !== p['AC00001|JOSE LOPEZ'].id, 'Luis no se fundió con José por el número anterior');
  ok(p['PTE00001|MARIA GOMEZ'].id !== p['PTE00002|MARIA GOMEZ'].id, 'sin fecha de nacimiento, el nombre solo no junta');
  ok(hojas['PERSONAS'].datos[0].indexOf('FECHA DE NACIMIENTO') === -1, 'la fecha de nacimiento no se copia a PERSONAS');
}

console.log('\n3. Un ID dado nunca cambia; correr otra vez no agrega nada');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const antes = JSON.stringify(personas(hojas));
  const r = CH.identificar({ escribir: true });
  ok(JSON.stringify(personas(hojas)) === antes, 'PERSONAS quedó igual');
  ok(/Empleos por identificar: 0/.test(r), 'y el reporte dice que no hay nada por identificar');
}

console.log('\n4. Un pegado nuevo: el empleo nuevo de alguien conocido toma su ID');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const idJuan = personas(hojas)['HA00241|JUAN FULGENCIO'].id;
  // CH manda una versión nueva: Juan asciende y le dan un tercer número
  hojas['COLABORADORES ACTUALIZADO'].datos.push(['CIB09999', 'JUAN FULGENCIO', 'VALLE02922', '04/04/1985', 'Activo', 'CENTRO']);
  CH.identificar({ escribir: true });
  const p = personas(hojas);
  ok(p['CIB09999|JUAN FULGENCIO'] && p['CIB09999|JUAN FULGENCIO'].id === idJuan, 'el número nuevo de Juan es la misma persona');
}

console.log('\n5. Si un pegado nuevo hace parecer que dos personas con ID son una, no se toca');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const p0 = personas(hojas);
  // Ahora CH dice que AC00002 tuvo antes el número AC00001: las dos José ya tenían ID distinto
  hojas['COLABORADORES ACTUALIZADO'].datos.push(['AC00003', 'JOSE LOPEZ', '', '05/05/1970', 'Activo', '']);
  hojas['COLABORADORES ACTUALIZADO'].datos.push(['AC00004', 'JOSE LOPEZ', '', '06/06/1999', 'Activo', '']);
  const r = CH.identificar({ escribir: true });
  const p = personas(hojas);
  ok(p['AC00001|JOSE LOPEZ'].id === p0['AC00001|JOSE LOPEZ'].id && p['AC00002|JOSE LOPEZ'].id === p0['AC00002|JOSE LOPEZ'].id,
    'los IDs de antes no cambiaron');
  ok(p['AC00003|JOSE LOPEZ'].id === p0['AC00001|JOSE LOPEZ'].id && p['AC00004|JOSE LOPEZ'].id === p0['AC00002|JOSE LOPEZ'].id,
    'y los números nuevos se fueron con su José, por la fecha de nacimiento');
  ok(!/Conflictos/.test(r), 'sin conflictos');
}

console.log('\n5b. Un renglón nuevo que liga a dos personas con ID distinto: conflicto, no se toca');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const p0 = personas(hojas);
  // José #2 (nacido el 06/06/1999) con un número nuevo que dice venir de AC00001, que es de José #1
  hojas['COLABORADORES ACTUALIZADO'].datos.push(['AC00005', 'JOSE LOPEZ', 'AC00001', '06/06/1999', 'Activo', '']);
  const r = CH.identificar({ escribir: true });
  const p = personas(hojas);
  ok(/Conflictos: 1/.test(r) && /ya tienen IDs distintos/.test(r), 'lo reporta como conflicto');
  ok(!p['AC00005|JOSE LOPEZ'], 'el renglón que los ligaría no se escribe');
  ok(p['AC00001|JOSE LOPEZ'].id === p0['AC00001|JOSE LOPEZ'].id && p['AC00002|JOSE LOPEZ'].id === p0['AC00002|JOSE LOPEZ'].id,
    'y nadie cambió de ID');
}

console.log('\n6. Columnas sensibles en la hoja pegada');
{
  const hojas = escenario();
  const h = hojas['COLABORADORES ACTUALIZADO'];
  h.datos[0] = h.datos[0].concat(['NÚMERO DE CUENTA', 'TELEFONO']);
  const r = cargar(hojas).identificar();
  ok(/datos sensibles que no deben estar en el libro: NÚMERO DE CUENTA, TELEFONO/.test(r), 'avisa que hay que borrarlas');
}

console.log('\n7. El catálogo: la hoja de CH es externa y PERSONAS es del sistema nuevo');
{
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'Entidades.gs'), 'utf8') + ';this.E=Entidades', ctx);
  ok(ctx.E.de('COLABORADORES ACTUALIZADO').externa && ctx.E.de('COLABORADORES ACTUALIZADO').familia === 'capitalhumano', 'COLABORADORES ACTUALIZADO: externa, de Capital Humano');
  ok(ctx.E.de('PERSONAS').delSistemaNuevo && ctx.E.prefijo('PERSONAS') === 'PER', 'PERSONAS: del sistema nuevo, IDs PER-');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

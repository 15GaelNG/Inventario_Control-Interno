/**
 * Administración > Capital humano (src/html/js/app-capital-humano.html), la parte del navegador: el Excel de CH se lee
 * aquí y lo sensible (NÚMERO DE CUENTA; el teléfono sí se sube) se quita ANTES de mandarlo. Las fechas van como dd/mm/yyyy, igual que
 * se ven en la hoja.
 *
 * Correr: node tests/capital-humano-cliente.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const h = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'app-capital-humano.html'), 'utf8');
const js = h.slice(h.indexOf('<script>') + 8, h.lastIndexOf('</script>'));
const ctx = vm.createContext({});
vm.runInContext(js + '\nthis.V = CapitalHumanoVista;', ctx);
const V = ctx.V;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

console.log('1. preparar: encabezados, sin lo sensible');
{
  const r = V.preparar([
    ['REPORTE DE PERSONAL', '', '', '', '', '', '', ''],
    ['No EMPLEADO', ' NOMBRE  COMPLETO ', 'N. EMPLEADO ANTERIOR', 'FECHA DE NACIMIENTO', 'STATUS', 'TELEFONO', 'NÚMERO DE CUENTA', 'DEPARTAMENTO'],
    ['CIB00001', ' ANA  PEREZ ', '', '01/02/1990', 'Activo', '5512345678', '0123456789', 'TI'],
    ['', '', '', '', '', '', '', ''],
    ['CIB00002', 'LUIS SOTO', 'AC00001', '03/04/1985', 'Baja', '', '', 'VENTAS'],
  ]);
  ok(r.encabezados.join('|') === 'No EMPLEADO|NOMBRE COMPLETO|N. EMPLEADO ANTERIOR|FECHA DE NACIMIENTO|STATUS|TELEFONO|DEPARTAMENTO',
    'encuentra el renglón de encabezados aunque haya un título arriba: ' + r.encabezados.join('|'));
  ok(r.quitadas.join() === 'NÚMERO DE CUENTA', 'la cuenta se quita; el teléfono se queda (usuario, 12-oct)');
  ok(!JSON.stringify(r.filas).includes('0123456789') && JSON.stringify(r.filas).includes('5512345678'), 'el valor de la cuenta no viaja; el del teléfono sí');
  ok(r.filas.length === 2 && r.filas[0][1] === 'ANA PEREZ', 'sin renglones vacíos y con el texto limpio');
  ok(r.faltan.length === 0, 'trae todas las columnas que pide el servidor');
}

console.log('\n1b. preparar: solo las columnas permitidas (el Excel de CH del 12-oct traía CLABE, CURP, domicilio…)');
{
  const r = V.preparar([
    ['No EMPLEADO', 'NOMBRE COMPLETO', 'N. EMPLEADO ANTERIOR', 'FECHA DE NACIMIENTO', 'STATUS', 'CURP', 'CLABE', 'BANCO', 'CALLE/NUMERO', 'PUESTO'],
    ['CIB00001', 'ANA PEREZ', '', '01/02/1990', 'Activo', 'PEAA900201MDFRRN01', '012345678901234567', 'BANCO X', 'CALLE 1', 'AUXILIAR'],
  ]);
  ok(r.encabezados.join('|') === 'No EMPLEADO|NOMBRE COMPLETO|N. EMPLEADO ANTERIOR|FECHA DE NACIMIENTO|STATUS|PUESTO', 'solo lo permitido: ' + r.encabezados.join('|'));
  ok(r.quitadas.join() === 'CURP,CLABE,BANCO,CALLE/NUMERO', 'lo demás se queda en el navegador: ' + r.quitadas.join());
  ok(!/PEAA900201|012345678901234567|BANCO X|CALLE 1/.test(JSON.stringify(r.filas)), 'y sus valores no viajan');
}

console.log('\n2. preparar: lo que no es la lista de CH');
{
  const r = V.preparar([['FOLIO', 'PLACA'], ['AUT0001', 'ABC123']]);
  ok(r.encabezados.length === 0 && r.faltan.indexOf('No EMPLEADO') !== -1, 'sin encabezados de CH no hay nada que mandar');
}

console.log('\n3. valorDeCelda: como se ve en la hoja');
{
  const SSF = { is_date: (z) => /d|y/i.test(z), parse_date_code: () => ({ d: 5, m: 3, y: 2024 }) };
  ok(V.valorDeCelda({ t: 'n', v: 45356, z: 'dd/mm/yyyy' }, SSF) === '05/03/2024', 'una fecha de Excel → dd/mm/yyyy');
  ok(V.valorDeCelda({ t: 'n', v: 24742, z: 'General' }, SSF) === '24742', 'un número de empleado, tal cual (sin comas)');
  ok(V.valorDeCelda({ t: 's', v: '  juan   lopez ' }, SSF) === 'juan lopez', 'el texto, sin espacios de más');
  ok(V.valorDeCelda(undefined, SSF) === '', 'una celda vacía');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

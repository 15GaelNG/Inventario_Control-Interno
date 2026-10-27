/**
 * Pruebas de ExportarExcel (componentes/exportar-excel.html) con un SheetJS falso: qué tipo toma cada columna cruda
 * y qué queda en la celda. 27-oct: un porcentaje ("79.09%") sale como número con formato 0.00%, no como texto.
 * Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'exportar-excel.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let hoja = null;
const XLSX = {
  utils: {
    encode_cell: ({ r, c }) => r + ':' + c,
    encode_range: () => 'A1',
    aoa_to_sheet: (aoa) => {
      const h = {};
      aoa.forEach((fila, r) => fila.forEach((v, c) => {
        if (v !== null && v !== '') h[r + ':' + c] = { v: v, t: typeof v === 'number' ? 'n' : 's' };
      }));
      return h;
    },
    book_new: () => ({}),
    book_append_sheet: (libro, h) => { hoja = h; },
  },
  writeFile: () => {},
};
const contexto = vm.createContext({
  window: { XLSX }, document: {}, Promise,
  Formato: { dia: () => '2026-10-27', hora: () => '10:00' },
});
vm.runInContext(js + '\nthis.ExportarExcel = ExportarExcel;', contexto);

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

(async () => {
  console.log('1. Porcentajes');
  await contexto.ExportarExcel.descargarCrudo({ nombreArchivo: 'Inspecciones', filas: [
    { FOLIO: 'AUT0025', PUNTAJE: '79.09%', SECCION: '8.33%', KM: 12000 },
    { FOLIO: 'AUT0026', PUNTAJE: '100.00%', SECCION: '', KM: '' },
  ] });
  ok(hoja['1:1'].v === 0.7909 && hoja['1:1'].t === 'n' && hoja['1:1'].z === '0.00%',
    '"79.09%" queda como el número 0.7909 con formato 0.00%: ' + JSON.stringify(hoja['1:1']));
  ok(hoja['2:1'].v === 1 && hoja['1:2'].v === 0.0833 && !hoja['2:2'], 'el 100% vale 1, una sección 0.0833 y lo vacío sigue vacío');
  ok(hoja['1:3'].v === 12000 && !hoja['1:3'].z, 'un número normal no cambia');
  ok(hoja['1:0'].v === 'AUT0025' && hoja['1:0'].t === 's', 'el texto tampoco');

  console.log('2. Una columna con texto y porcentajes mezclados se queda como texto');
  await contexto.ExportarExcel.descargarCrudo({ nombreArchivo: 'X', filas: [{ A: '50%' }, { A: 'N/A' }] });
  ok(hoja['1:0'].v === '50%' && hoja['1:0'].t === 's', 'no se pierde el "N/A" por convertir');

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})();

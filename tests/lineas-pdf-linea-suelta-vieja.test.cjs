// Pendiente 2.48 (usuario, 16-oct): la responsiva de la línea 4461456715 se firmó el 14-oct, antes de la línea sin equipo
// (v122). Al regenerarla salía como de equipo: NUCO «0000», en `Files` y lo del equipo en blanco. Al regenerar se deja como
// las de ahora: «NO APLICA», su carpeta en LINEAS, su INE ahí y los PDF de `Files` a la papelera.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasCaptura.gs'), 'utf8');
const trozo = (desde, hasta) => { const i = fuente.indexOf(desde); assert.ok(i >= 0, desde); return fuente.slice(i, fuente.indexOf(hasta, i)); };

function preparar({ fila, ev, enLineas }) {
  const escrito = []; const movidos = []; const papelera = []; const creadas = [];
  const pdfsEnFiles = [{ nombre: 'RESPONSIVARLI-1.pdf' }, { nombre: 'RESPONSIVARLI-1.pdf' }];
  const ctx = vm.createContext({
    PDF: { RESPONSIVA: { carpeta: 'Files', nombre: (id) => 'RESPONSIVA' + id + '.pdf' } },
    LineasUtil: { col: (f, c) => f[c] },
    LineasRepo: { TAB: { RESP: 'RESPONSIVAS LINEAS', APP_EVID: 'APP_EVIDENCIAS' } },
    LineasDatos: {
      conCandado: (fn) => fn(),
      buscarFilasPorId: () => [7],
      actualizarFila: (tabla, n, cambios) => escrito.push({ tabla, n, cambios }),
      idsDeFila: (f) => [f['ID']],
    },
    LineasArchivos: {
      enLineas: (id) => enLineas.indexOf(id) >= 0,
      carpetaEvidenciaLinea: (lineaId, numero, fecha) => { creadas.push({ lineaId, numero, fecha }); return { carpetaId: 'RESP-NUEVA', ruta: 'LINEAS/' + numero + '/CARTA RESPONSIVA/2026/RESP 14 10' }; },
      carpetaDeApp: (ruta) => ({ getFilesByName: (n) => {
        const l = pdfsEnFiles.filter((p) => p.nombre === n);
        return { hasNext: () => l.length > 0, next: () => { const p = l.shift(); return { setTrashed: () => papelera.push(ruta + '/' + p.nombre) }; } };
      } }),
    },
    LineasIdentificaciones: { deResponsiva: () => [{ id: 'INE-1' }] },
    DriveApp: { getFolderById: (id) => ({ id }), getFileById: (id) => ({ moveTo: (c) => movidos.push(id + ' → ' + c.id) }) },
  });
  vm.runInContext(trozo('const SIN_EQUIPO', '/** Valor de la fila') + trozo('function pasarALineas_(', '\n  /**\n   * Genera el PDF') +
    '\nthis.pasar = pasarALineas_; this.sinEquipo = responsivaSinEquipo_;', ctx);
  // La fecha, del mismo contexto que el código (instanceof Date no reconoce una de afuera)
  if (fila['FECHA RESPONSIVA'] instanceof Date) fila['FECHA RESPONSIVA'] = vm.runInContext('new Date(' + fila['FECHA RESPONSIVA'].getTime() + ')', ctx);
  return { r: ctx.pasar(fila, ev, 'RLI-1'), ctx, escrito, movidos, papelera, creadas, fila, ev };
}

test('la responsiva vieja de una línea suelta pasa a LINEAS con «NO APLICA», su INE y sin los PDF de Files', () => {
  const fecha = new Date(2026, 9, 14);
  const fila = { 'ID': 'RLI-1', 'ID LINEA': 'LIN-67DCA8781CQGJF', 'NUCO': '', 'MODELO': '', 'IMEI': '', 'COLOR': 'N/A', 'ACCESORIOS': 'NINGUNO',
    'PIN EQUIPO': 'N/A', 'No TELEFONO': '4461456715', 'FECHA RESPONSIVA': fecha };
  const ev = { carpetaId: '', _fila: 3, pdfs: [{ id: 'VIEJO' }] };
  const p = preparar({ fila, ev, enLineas: ['RESP-NUEVA'] });
  assert.equal(p.r, 'Files/RESPONSIVARLI-1.pdf');
  assert.deepEqual(p.creadas.map((x) => [x.lineaId, x.numero, x.fecha.getTime()]), [['LIN-67DCA8781CQGJF', '4461456715', fecha.getTime()]]);
  const resp = p.escrito.filter((e) => e.tabla === 'RESPONSIVAS LINEAS')[0].cambios;
  ['MODELO', 'IMEI', 'COLOR', 'ACCESORIOS', 'PIN WHATSAPP', 'PIN EQUIPO'].forEach((c) => assert.equal(resp[c], 'NO APLICA', c));
  assert.equal(resp['NUCO'], '');
  const evid = p.escrito.filter((e) => e.tabla === 'APP_EVIDENCIAS')[0];
  assert.equal(evid.n, 3);
  assert.equal(evid.cambios['CARPETA_ID'], 'RESP-NUEVA');
  assert.equal(evid.cambios['RUTA'], 'LINEAS/4461456715/CARTA RESPONSIVA/2026/RESP 14 10');
  // La fila en memoria ya es la de una línea sin equipo: el PDF dice «NO APLICA» en el NUCO (registroPlantilla_)
  assert.equal(p.ctx.sinEquipo(p.fila), true);
  assert.equal(p.ev.carpetaId, 'RESP-NUEVA');
  assert.deepEqual(p.movidos, ['INE-1 → RESP-NUEVA']);
  assert.deepEqual(p.papelera, ['Files/RESPONSIVARLI-1.pdf', 'Files/RESPONSIVARLI-1.pdf']);
});

test('la responsiva de un equipo y la de línea suelta que ya está en LINEAS no se tocan', () => {
  const equipo = preparar({ fila: { 'ID': 'RLI-1', 'ID LINEA': 'EQU-1', 'NUCO': '0012', 'MODELO': 'MOTO G15' }, ev: { carpetaId: 'X' }, enLineas: [] });
  assert.equal(equipo.r, '');
  assert.equal(equipo.escrito.length + equipo.movidos.length + equipo.papelera.length, 0);
  const nueva = preparar({ fila: { 'ID': 'RLI-1', 'ID LINEA': 'LIN-1', 'NUCO': '', 'MODELO': 'NO APLICA', 'IMEI': 'NO APLICA', 'FECHA RESPONSIVA': '15/10/2026' },
    ev: { carpetaId: 'EN-LINEAS' }, enLineas: ['EN-LINEAS'] });
  assert.equal(nueva.r, '');
  assert.equal(nueva.escrito.length + nueva.movidos.length + nueva.papelera.length + nueva.creadas.length, 0);
});

test('generarPdf pasa la responsiva a LINEAS antes de elegir la carpeta y lo deja en el historial', () => {
  const g = trozo('function generarPdf(', '\n  /** El PDF ligado');
  assert.ok(g.indexOf("const deFiles = esInspeccion ? '' : pasarALineas_(fila, ev, id);") < g.indexOf('destinoPdf_(tipo, fila, ev, id)'));
  assert.ok(g.indexOf('destinoPdf_(tipo, fila, ev, id)') < g.indexOf('pdfVigente_(ev)'), 'el PDF de Files ya está en la papelera: se hace uno nuevo');
  assert.match(g, /if \(deFiles\) LineasRepo\.registrarMovimiento\('PDF_REGENERADO'/);
});

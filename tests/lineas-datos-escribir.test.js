/**
 * LineasDatos escribe por SheetUtils (28-oct): mismo resultado que antes en la hoja (texto que no pierde ceros, fechas,
 * IDs, lote por la API al soltar el candado, sin API con SpreadsheetApp) y cada escritura pasa por el enganche de la
 * bitácora.
 *
 * Correr: node tests/lineas-datos-escribir.test.js
 */
const { crearEntorno } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

function entorno(opciones) {
  const e = crearEntorno(Object.assign({
    libros: {
      TEL: {
        'INSPECCIONES LINEAS': [['ID', 'NUCO', 'SIM', 'FECHA', 'ESTADO'], ['ILI-1', '0012', "'8952140000000000001", '', 'ABIERTA'],
          ['ILI-2', '0013', '', '', 'ABIERTA'], ['ILI-3', '0014', '', '', 'ABIERTA']],
      },
    },
    globales: {
      Config: { SPREADSHEET_IDS: { TELEFONIA: () => 'TEL' }, ENTORNO: 'DEV' },
      LineasUtil: { mostrarCH: (h, v) => v, guardarCH: (h, v) => (h === 'ESTADO' && v === 'QUERETARO' ? 'QRO' : v) },
    },
  }, opciones || {}));
  e.cargar('src/utils/Ids.gs', 'src/config/Entidades.gs', 'src/utils/CacheHojas.gs', 'src/utils/SheetUtils.gs',
    'src/services/lineas/LineasDatos.gs',
    { codigo: 'var Bitacora = { eventos: [], anotar(ev) { this.eventos.push(ev); } };', nombre: 'bitacora-falsa' });
  return { e, D: e.global('LineasDatos'), eventos: e.global('Bitacora').eventos, hoja: () => e.hojaComoTexto('TEL', 'INSPECCIONES LINEAS') };
}

console.log('1. Cambiar celdas: por la API, en lote dentro de conCandado');
{
  const { e, D, eventos, hoja } = entorno();
  D.conCandado(() => {
    D.actualizarFila('INSPECCIONES LINEAS', 2, { SIM: '8952140000000000002', FECHA: e.fecha('2026-10-28 10:15') });
    D.actualizarFila('INSPECCIONES LINEAS', 3, { estado: 'QUERETARO', 'NO EXISTE': 1 });
    ok(e.registro.api.length === 0, 'adentro, todavía nada');
  });
  ok(e.registro.api.map((x) => x.modo + ':' + x.celdas).join() === 'RAW:2,USER_ENTERED:1', 'al soltar: una llamada RAW (2 celdas) y una de fechas');
  ok(hoja()[1][2] === '8952140000000000002', 'el SIM queda como texto (RAW), sin apóstrofo');
  ok(hoja()[1][3] === e.fecha('2026-10-28 10:15').toISOString(), 'la fecha, en hora de México');
  ok(hoja()[2][4] === 'QRO', 'guardarCH: QUERETARO se guarda como en CH');
  ok(eventos.length === 2 && eventos[0].hoja === 'INSPECCIONES LINEAS' && eventos[1].filas[0].cambios.ESTADO === 'QUERETARO',
    'cada cambio pasó por el enganche de la bitácora');
  D.actualizarFilas('INSPECCIONES LINEAS', [{ fila: 2, cambios: { ESTADO: 'A' } }, { fila: 4, cambios: { ESTADO: 'B' } }]);
  ok(e.registro.api.length === 3 && hoja()[3][4] === 'B', 'actualizarFilas fuera del lote: una sola llamada para varias filas');
}

console.log('2. Agregar y borrar');
{
  const { e, D, eventos, hoja } = entorno();
  const n = D.agregarFilas('INSPECCIONES LINEAS', [{ NUCO: '0099', SIM: '8952140000000000003', ESTADO: 'NUEVA' }]);
  ok(n[0] === 5 && /^ILI-/.test(hoja()[4][0]), 'al final, con su ID del catálogo');
  ok(hoja()[4][1] === "'0099" && hoja()[4][2] === "'8952140000000000003", 'con SpreadsheetApp: los dígitos con cero o largos llevan apóstrofo (como antes)');
  ok(e.registro.locks > 0 && eventos[0].tipo === 'agregar', 'bajo el candado y por el enganche');
  const nueva = hoja()[4][0];
  ok(D.eliminarFilas('INSPECCIONES LINEAS', [2, 4]) === 2 && hoja().slice(1).map((r) => r[0]).join() === 'ILI-2,' + nueva,
    'eliminarFilas borra esos renglones (ILI-1 e ILI-3) y deja los demás');
  ok(eventos[eventos.length - 1].tipo === 'borrar', 'y también avisa');
}

console.log('3. Sin la API de Sheets habilitada');
{
  const { e, D, hoja } = entorno({ apiSheets: false });
  D.conCandado(() => D.actualizarFila('INSPECCIONES LINEAS', 2, { SIM: '0012345' }));
  ok(hoja()[1][2] === "'0012345" && e.registro.api.length === 0, 'con SpreadsheetApp y el apóstrofo de siempre');
}

console.log('4. Pestaña nueva');
{
  const { D, eventos, e } = entorno();
  D.asegurarPestana('APP_PRUEBA', ['ID', 'TEXTO', 'CREADO_EN']);
  ok(e.hojaComoTexto('TEL', 'APP_PRUEBA')[0].join() === 'ID,TEXTO,CREADO_EN' && eventos[0].tipo === 'estructura', 'se crea por SheetUtils');
  ok(D.asegurarColumnas('APP_PRUEBA', ['TEXTO', 'NUEVA']).join() === 'NUEVA' && e.hojaComoTexto('TEL', 'APP_PRUEBA')[0][3] === 'NUEVA',
    'asegurarColumnas agrega solo las que faltan');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');

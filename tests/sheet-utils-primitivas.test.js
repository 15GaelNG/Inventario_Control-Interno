/**
 * Las primitivas de escritura de SheetUtils (28-oct): toda escritura de una hoja pasa por agregarFilas, cambiarCeldas,
 * borrarFilas, reemplazarFilas, cambiarColumna y las de estructura, y cada una avisa a la caché y al enganche de la
 * bitácora (Bitacora.anotar). La política 'api' (Líneas) va por la API de Sheets, en lote dentro de enLote.
 *
 * Correr: node tests/sheet-utils-primitivas.test.js
 */
const { crearEntorno } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

function entorno(opciones) {
  const e = crearEntorno(Object.assign({
    libros: {
      libro: {
        TICKETS: [['ID', 'ASUNTO', 'ESTADO', 'NOTA'], ['TCK-1', 'uno', 'ABIERTO', ''], ['TCK-2', 'dos', 'ABIERTO', ''],
          ['TCK-3', 'tres', 'ABIERTO', ''], ['TCK-4', 'cuatro', 'ABIERTO', ''], ['TCK-5', 'cinco', 'ABIERTO', '']],
        LOG: [['FECHA', 'QUIEN', 'TEXTO']],
        COPIA: [['CLAVE', 'VALOR'], ['a', 1], ['b', 2], ['c', 3]],
      },
    },
  }, opciones || {}));
  e.cargar('src/utils/Ids.gs', 'src/config/Entidades.gs', 'src/utils/CacheHojas.gs', 'src/utils/SheetUtils.gs',
    { codigo: 'var Bitacora = { eventos: [], anotar(ev) { this.eventos.push(ev); } };', nombre: 'bitacora-falsa' });
  return { e, S: e.global('SheetUtils'), eventos: e.global('Bitacora').eventos, hoja: (n) => e.hojaComoTexto('libro', n) };
}

console.log('1. agregarFilas');
{
  const { e, S, eventos, hoja } = entorno();
  const t = S.tabla('libro', 'TICKETS');
  const n = S.agregarFilas(t, [{ ASUNTO: 'seis', ESTADO: 'ABIERTO' }]);
  const fila = hoja('TICKETS')[6];
  ok(n[0] === 7 && /^TCK-/.test(fila[0]) && fila[1] === 'seis', 'un objeto: al final, con su ID del catálogo (TCK-…)');
  const antes = e.registro.locks;
  const varias = S.agregarFilas(S.tabla('libro', 'LOG'), [['hoy', 'ana', 'a'], ['hoy', 'beto', 'b']]);
  ok(varias.join() === '2,3' && hoja('LOG')[2][1] === 'beto', 'varias: de una vez, en sus renglones');
  ok(e.registro.locks > antes, 'varias van bajo el candado (un solo renglón usa appendRow, que no choca)');
  ok(eventos.length === 2 && eventos[0].tipo === 'agregar' && eventos[0].hoja === 'TICKETS' && /^TCK-/.test(eventos[0].filas[0].id),
    'cada una avisa al enganche con su hoja, renglón e ID');
  ok(eventos[1].filas[1].despues.QUIEN === 'beto', 'un arreglo también llega como objeto { COLUMNA: valor }');
}

console.log('2. cambiarCeldas');
{
  const { e, S, eventos, hoja } = entorno();
  const t = S.tabla('libro', 'TICKETS');
  S.cambiarCeldas(t, [{ fila: 2, cambios: { estado: 'CERRADO', NOTA: 'listo' } }]);
  ok(hoja('TICKETS')[1].join() === 'TCK-1,uno,CERRADO,listo', 'por nombre, tolerante a mayúsculas: solo esas celdas');
  S.cambiarCeldas(t, [{ fila: 3, cambios: { ESTADO: 'X' } }, { fila: 5, cambios: { ESTADO: 'X' } }, { fila: 6, cambios: { ESTADO: 'Y' } }]);
  ok(hoja('TICKETS')[2][2] === 'X' && hoja('TICKETS')[4][2] === 'X' && hoja('TICKETS')[5][2] === 'Y', 'varios renglones, una celda cada uno');
  ok(e.registro.rangeLists === 1, 'las del mismo valor van juntas en un getRangeList (Relaciones al propagar)');
  ok(S.cambiarCeldas(t, [{ fila: 2, cambios: { NO_EXISTE: 1 } }]) === 0, 'una columna que no hay no escribe nada');
  ok(eventos.filter((x) => x.tipo === 'cambiar').length === 2 && eventos[0].filas[0].cambios.ESTADO === 'CERRADO',
    'avisa con lo que cambió (por columna)');
  S.update('libro', 'TICKETS', 'TCK-4', { NOTA: 'por id' });
  ok(hoja('TICKETS')[4][3] === 'por id' && eventos[eventos.length - 1].tipo === 'cambiar', 'update (por ID) es cambiarCeldas: también avisa');
}

console.log('3. borrarFilas');
{
  const { S, eventos, hoja } = entorno();
  const t = S.tabla('libro', 'TICKETS');
  ok(S.borrarFilas(t, [3, 5, 4, 3]) === 3, 'sin repetir: cuenta 3');
  ok(hoja('TICKETS').map((r) => r[0]).join() === 'ID,TCK-1,TCK-5', 'borra los seguidos de una vez, de abajo hacia arriba');
  ok(S.removeMany('libro', 'TICKETS', ['TCK-1']) === 1 && hoja('TICKETS').length === 2, 'removeMany (por ID) también');
  ok(eventos.filter((x) => x.tipo === 'borrar').length === 2, 'y avisan');
}

console.log('4. reemplazarFilas y cambiarColumna');
{
  const { S, eventos, hoja } = entorno();
  const t = S.tabla('libro', 'COPIA');
  S.reemplazarFilas(t, [['x', 9]]);
  ok(hoja('COPIA').slice(1).map((r) => r.join('|')).join() === 'x|9,|,|', 'el cuerpo nuevo y lo que sobraba vacío');
  S.cambiarColumna(S.tabla('libro', 'TICKETS'), 'NOTA', ['a', 'b']);
  ok(hoja('TICKETS')[1][3] === 'a' && hoja('TICKETS')[2][3] === 'b', 'una columna desde el renglón 2');
  ok(eventos.map((x) => x.tipo).join() === 'reemplazar,columna', 'y avisan');
}

console.log('5. Estructura');
{
  const { e, S, eventos, hoja } = entorno();
  S.asegurarPestana('libro', 'NUEVA', ['ID', 'NOMBRE']);
  ok(hoja('NUEVA')[0].join() === 'ID,NOMBRE', 'crea la pestaña con sus encabezados');
  S.asegurarPestana(e.libros.libro, 'NUEVA', ['ID', 'NOMBRE', 'EXTRA']);
  ok(hoja('NUEVA')[0].join() === 'ID,NOMBRE,EXTRA', 'si ya existe, agrega al final las que faltan (también con el libro en la mano)');
  const t = S.tabla('libro', 'TICKETS');
  ok(S.asegurarColumnas(t, ['ESTADO', 'NUEVA COL']).join() === 'NUEVA COL' && t.encabezados.length === 5, 'asegurarColumnas: solo las nuevas');
  ok(S.quitarColumnas(t, ['nota']).join() === 'NOTA' && hoja('TICKETS')[0].join() === 'ID,ASUNTO,ESTADO,NUEVA COL', 'quitarColumnas');
  ok(eventos.every((x) => x.tipo === 'estructura') && eventos.length === 4, 'todo lo de estructura avisa');
}

console.log('6. Política "api" (Líneas): por la API de Sheets, en lote');
{
  const { e, S, eventos, hoja } = entorno();
  const politica = {
    escritor: 'api', anexar: 'bloque',
    paraApi: (col, v) => (v instanceof Date ? { valor: e.contexto.Utilities.formatDate(v, '', 'yyyy-MM-dd HH:mm:ss'), tal: false } : { valor: v, tal: true }),
    paraCelda: (col, v) => (typeof v === 'string' && /^0\d/.test(v) ? "'" + v : v),
  };
  const t = S.tabla('libro', 'TICKETS', { politica });
  S.enLote(() => {
    S.cambiarCeldas(t, [{ fila: 2, cambios: { NOTA: '0012' } }]);
    S.cambiarCeldas(t, [{ fila: 3, cambios: { NOTA: e.fecha('2026-10-28 09:30') } }]);
    ok(e.registro.api.length === 0, 'adentro del lote todavía no sale nada');
  });
  ok(e.registro.api.map((x) => x.modo).join() === 'RAW,USER_ENTERED', 'al salir: una llamada por modo (texto tal cual; fechas tecleadas)');
  ok(hoja('TICKETS')[1][3] === '0012', 'por la API el texto no pierde el cero (RAW)');
  ok(eventos.length === 2, 'y avisó cada cambio');
  S.agregarFilas(t, [['TCK-9', 'nueve', '0007', '']]);
  ok(hoja('TICKETS')[6][2] === '0007', 'un arreglo que ya viene listo se escribe tal cual (quien llama ya lo convirtió)');
}
{
  const { e, S, hoja } = entorno({ apiSheets: false });
  const t = S.tabla('libro', 'TICKETS', { politica: { escritor: 'api', paraApi: (c, v) => ({ valor: v, tal: true }), paraCelda: (c, v) => "'" + v } });
  S.enLote(() => S.cambiarCeldas(t, [{ fila: 2, cambios: { NOTA: '0012' } }]));
  ok(hoja('TICKETS')[1][3] === "'0012" && e.registro.api.length === 0, 'sin la API habilitada: con SpreadsheetApp y paraCelda');
}

console.log('7. Sin bitácora (hoy): nada truena');
{
  const e = crearEntorno({ libros: { libro: { LOG: [['A', 'B']] } } });
  e.cargar('src/utils/CacheHojas.gs', 'src/utils/SheetUtils.gs');
  const S = e.global('SheetUtils');
  ok(S.agregarFilas(S.tabla('libro', 'LOG'), [['1', '2']])[0] === 2, 'sin Bitacora el enganche no hace nada');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');

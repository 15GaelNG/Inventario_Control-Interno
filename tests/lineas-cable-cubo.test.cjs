// Usuario, 22-oct: «en accesorios que se homologue cable y cubo, eliminar CARGADOR. O sea que los registros anteriores si
// tienen "cargador" se separe como cable y cubo, eliminamos ese accesorio». CARGADOR ya no se ofrece; lo que llega con él
// se guarda como CABLE y CUBO, y tools/lineas-datos/cable-cubo.js corrige lo que ya estaba en el libro.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const U = new Function(read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')();

test('sinCargador: CABLE y CUBO en su lugar, sin repetir y con el mismo separador; sin CARGADOR, igual', () => {
  assert.equal(U.sinCargador('CARGADOR'), 'CABLE , CUBO');
  assert.equal(U.sinCargador('CARGADOR , MICA'), 'CABLE , CUBO , MICA');
  assert.equal(U.sinCargador('CAJA, CARGADOR, FUNDA'), 'CAJA, CABLE, CUBO, FUNDA');
  assert.equal(U.sinCargador('CAJA,cargador'), 'CAJA,CABLE,CUBO');
  assert.equal(U.sinCargador('CUBO, CARGADOR, MICA'), 'CUBO, CABLE, MICA');
  assert.equal(U.sinCargador('CARGADOR, CABLE'), 'CABLE, CUBO');
  assert.equal(U.sinCargador('CAJA, CABLE'), 'CAJA, CABLE');
  assert.equal(U.sinCargador(''), '');
  assert.equal(U.sinCargador(null), null);
});

test('cable-cubo.js: solo cambia lo que trae CARGADOR, con la regla de la app', () => {
  const { accesoriosSinCargador } = require('../tools/lineas-datos/cable-cubo.js');
  assert.equal(accesoriosSinCargador('CAJA, CARGADOR'), 'CAJA, CABLE, CUBO');
  assert.equal(accesoriosSinCargador('CAJA, CABLE, CUBO'), null);
  assert.equal(accesoriosSinCargador(''), null);
});

test('CARGADOR ya no es opción en ninguna lista de accesorios', () => {
  assert.match(read('src/services/lineas/LineasRepo.gs'), /accesorios: \['CAJA', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'TARJETA SD', 'NINGUNO'\],/);
  assert.match(read('src/services/lineas/LineasRegistros.gs'), /const ACCESORIOS = \['CAJA', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'TARJETA SD', 'NINGUNO'\];/);
  // La responsiva y Corregir equipo muestran CABLE y CUBO en lugar del CARGADOR de antes
  // (y la inspección desde el 22-oct: listaAccesorios_ es de las dos)
  assert.match(read('src/services/lineas/LineasCaptura.gs'), /const accesorios = String\(LineasUtil\.sinCargador\(texto\) \|\| ''\)/);
  // La ficha también
  assert.match(read('src/services/lineas/LineasRepo.gs'), /accesorios: \(txt\(LineasUtil\.sinCargador\(col\(f, 'ACCESORIOS'\)\)\) \|\| ''\)/);
});

// lineas-revisor, 22-oct: con DOCUMENTO, el historial tomaba el movimiento por el de la responsiva (RLI-) y la tapaba
test('cable-cubo.js y corregir-color.js no ponen DOCUMENTO; vaciar-documento.js solo toca los de esos dos con DOCUMENTO', () => {
  ['tools/lineas-datos/cable-cubo.js', 'tools/lineas-datos/corregir-color.js'].forEach((f) => assert.doesNotMatch(read(f), /documento:/, f));
  const { porVaciar } = require('../tools/lineas-datos/vaciar-documento.js');
  const { COMENTARIO } = require('../tools/lineas-datos/cable-cubo.js');
  const filas = [
    { _n: 2, COMENTARIO: COMENTARIO, DOCUMENTO: 'RLI-1' },
    { _n: 3, COMENTARIO: COMENTARIO, DOCUMENTO: '' },
    { _n: 4, COMENTARIO: 'OTRO', DOCUMENTO: 'RLI-2' },
    { _n: 5, COMENTARIO: COMENTARIO, DOCUMENTO: 'RSG-3' },
    { _n: 6, COMENTARIO: require('../tools/lineas-datos/corregir-color.js').COMENTARIO, DOCUMENTO: 'ILI-4' },
  ];
  assert.deepEqual(porVaciar({ filas }).map((f) => f._n), [2, 5, 6]);
});

// Usuario, 22-oct: el comentario, solo la acción; y de qué documento es cada movimiento, con su fecha
test('textos-movimientos.js: comentario sin paréntesis y el documento con su fecha, en el orden en que se escribieron', () => {
  const { plan } = require('../tools/lineas-datos/textos-movimientos.js');
  const c = require('../tools/lineas-datos/comun.js');
  const viejo = 'ACCESORIOS: CARGADOR SE SEPARA EN CABLE Y CUBO (USUARIO, 22-OCT)';
  const m = (n, campo) => ({ _n: n, COMENTARIO: viejo, QUIEN: 'AUTOMATIZACIÓN', 'ID EQUIPO': 'EQU-1',
    CAMBIOS: JSON.stringify([{ campo, antes: 'CARGADOR', despues: 'CABLE,CUBO' }]) });
  const mov = { filas: [m(2, 'EQUIPOS · ACCESORIOS'), m(3, 'RESPONSIVAS LINEAS · ACCESORIOS'), m(4, 'RESPONSIVAS LINEAS · ACCESORIOS'),
    { _n: 5, COMENTARIO: 'PATRON GUARDADO COMO FECHA: SE REGRESA A TEXTO (PENDIENTE 2.47)', QUIEN: 'AUTOMATIZACIÓN', CAMBIOS: '[]' },
    { _n: 6, COMENTARIO: 'OTRO (A MANO)', QUIEN: 'ANA', CAMBIOS: '[]' }] };
  const tablas = { 'EQUIPOS': { filas: [] }, 'INSPECCIONES LINEAS': { filas: [] }, 'APP_RESGUARDOS': { filas: [] },
    'RESPONSIVAS LINEAS': { filas: [
      { ID: 'RLI-A', 'ID LINEA': 'EQU-1', ACCESORIOS: 'CABLE,CUBO', 'FECHA RESPONSIVA': '', DIA: '29', MES: 'MAYO', 'AÑO': '2026' },
      { ID: 'RLI-B', 'ID LINEA': 'EQU-1', ACCESORIOS: 'CABLE,CUBO', 'FECHA RESPONSIVA': '7/9/2026 10:00:00' }] } };
  const p = plan(mov, tablas);
  assert.deepEqual(p.map((x) => x.f._n), [2, 3, 4, 5]);
  assert.ok(p.slice(0, 3).every((x) => x.comentario === 'ACCESORIOS: CARGADOR SE SEPARA EN CABLE Y CUBO'));
  assert.deepEqual(p.slice(0, 3).map((x) => JSON.parse(x.cambios)[0].campo),
    ['ACCESORIOS', 'RESPONSIVA DEL 29/05/2026 · ACCESORIOS', 'RESPONSIVA DEL 07/09/2026 · ACCESORIOS']);
  assert.equal(p[3].comentario, 'PATRON GUARDADO COMO FECHA: SE REGRESA A TEXTO');
  assert.equal(p[3].cambios, undefined);
  assert.equal(c.campoDe('APP_RESGUARDOS', { FECHA: '22/10/2026 15:01:00' }, 'ACCESORIOS'), 'RESGUARDO DEL 22/10/2026 · ACCESORIOS');
  // Ningún programa vuelve a poner paréntesis en su comentario
  ['cable-cubo', 'corregir-color', 'limpiar-dg', 'por-recibir', 'separar-cancelaciones']
    .forEach((n) => assert.doesNotMatch(read('tools/lineas-datos/' + n + '.js'), /const COMENTARIO = '[^']*\(/, n));
});

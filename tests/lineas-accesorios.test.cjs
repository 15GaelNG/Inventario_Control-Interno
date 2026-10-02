const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// LineasAccesorios con las llaves del catálogo de IDs de Ayrton (Entidades.REFERENCIAS):
// artículo por ID, movimiento por ID ACCESORIO y, si no lo trae, por su ID_Accesorio contra el ID ANTERIOR.
function cargar(hojas) {
  const agregadas = [];
  const encabezados = (n) => Object.keys((hojas[n] || [])[0] || {});
  const LineasDatos = {
    leerTabla: (n) => hojas[n].map((f) => Object.assign({}, f)),
    tabla: (n) => ({ n }),
    colIndice: (t, c) => encabezados(t.n).indexOf(c),
    cacheLeer: () => null, cacheGuardar: () => {}, cacheBorrar: () => {},
    conCandado: (fn) => fn(),
    nuevoIdCorto: () => 'abcd1234',
    agregarFilas: (n, filas) => {
      filas.forEach((o) => { if (encabezados(n).indexOf('ID') >= 0 && !o['ID']) o['ID'] = (n === 'MOVIMIENTOS_ACCESORIOS' ? 'MAC-' : 'ACC-') + 'NUEVO'; });
      agregadas.push({ n, filas });
    },
  };
  const LineasUtil = {
    txt: (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim()),
    numero: (v) => Number(v), fecha: (v) => v, paraCliente: (x) => x,
  };
  const Auth = { validarSesion: () => ({}), requiereRol: () => ({ nombre: 'Prueba' }) };
  const Config = { ROLES: { ADMIN: 'ADMIN', OPERADOR: 'OPERADOR' } };
  const Permisos = { puedeLeerAlguno: () => ({}), puedeEditar: () => ({ nombre: 'Prueba' }) };
  const TelefoniaService = { MODULOS_LINEAS: ['accesorios-lineas'] };
  const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasAccesorios.gs'), 'utf8');
  const A = new Function('LineasDatos', 'LineasUtil', 'Auth', 'Config', 'Permisos', 'TelefoniaService', fuente + '; return LineasAccesorios;')(LineasDatos, LineasUtil, Auth, Config, Permisos, TelefoniaService);
  return { A, agregadas };
}

test('accesorios con el catálogo de IDs: artículo por ID, movimiento por ID ACCESORIO o por la llave vieja', () => {
  const { A, agregadas } = cargar({
    'ACCESORIOS CELULARES': [
      { 'ID': 'ACC-1', 'ID ANTERIOR': 'a1', 'Categoria': 'Micas', 'Nombre del Articulo': 'MICA', 'Marca': 'X' },
      { 'ID': 'ACC-2', 'ID ANTERIOR': '', 'Categoria': 'Fundas', 'Nombre del Articulo': 'FUNDA', 'Marca': 'Y' },
    ],
    'MOVIMIENTOS_ACCESORIOS': [
      { 'ID': 'MAC-1', 'ID ANTERIOR': 'm1', 'ID ACCESORIO': '', 'ID_Accesorio': 'a1', 'Tipo_movimiento': 'Entrada', 'Cantidad': 10 },
      { 'ID': 'MAC-2', 'ID ANTERIOR': 'm2', 'ID ACCESORIO': 'ACC-1', 'ID_Accesorio': 'a1', 'Tipo_movimiento': 'Salida', 'Cantidad': 3 },
      { 'ID': 'MAC-3', 'ID ANTERIOR': '', 'ID ACCESORIO': 'ACC-2', 'ID_Accesorio': '', 'Tipo_movimiento': 'Entrada', 'Cantidad': 5 },
    ],
  });
  const filas = A.indice('t').filas;
  assert.deepEqual(filas.map((a) => [a.id, a.stock]), [['ACC-1', 7], ['ACC-2', 5]]);
  A.registrarMovimiento('t', { tipo: 'SALIDA', cantidad: 2, accesorioId: 'ACC-1' });
  const mov = agregadas[0].filas[0];
  assert.equal(mov['ID ACCESORIO'], 'ACC-1');
  assert.equal(mov['ID_Accesorio'], 'a1');
  assert.equal(mov['ID'], 'MAC-NUEVO');
  assert.equal(mov['ID_Movimiento'], undefined);
  assert.equal(A.agregarArticulo('t', { categoria: 'Cargadores', nombre: 'CARGADOR' }).id, 'ACC-NUEVO');
});

test('accesorios en un libro sin migrar: todo con las llaves del AppSheet', () => {
  const { A, agregadas } = cargar({
    'ACCESORIOS CELULARES': [{ 'ID_Accesorio': 'a1', 'Categoria': 'Micas', 'Nombre del Articulo': 'MICA', 'Marca': 'X' }],
    'MOVIMIENTOS_ACCESORIOS': [{ 'ID_Movimiento': 'm1', 'ID_Accesorio': 'a1', 'Tipo_movimiento': 'Entrada', 'Cantidad': 4 }],
  });
  assert.deepEqual(A.indice('t').filas.map((a) => [a.id, a.stock]), [['a1', 4]]);
  A.registrarMovimiento('t', { tipo: 'ENTRADA', cantidad: 1, accesorioId: 'a1' });
  assert.equal(agregadas[0].filas[0]['ID_Accesorio'], 'a1');
  assert.equal(agregadas[0].filas[0]['ID_Movimiento'], 'abcd1234');
  assert.equal(A.agregarArticulo('t', { categoria: 'Fundas', nombre: 'FUNDA' }).id, 'abcd1234');
});

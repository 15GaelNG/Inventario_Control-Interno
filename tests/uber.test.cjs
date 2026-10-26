// UberService.detectarBajasPendientes (23-oct-2026, reemplaza a sincronizarBajas): YA NO pone
// BAJA sola en Uber -- el usuario pidió que jamás se toque el estatus automáticamente. En vez de
// eso, detecta a quien sigue ACTIVO en Uber pero ya no está activo en Capital Humano y anota la
// etiqueta "Baja, quitar de Uber" en una hoja aparte (UBER BAJAS DETECTADAS), para que alguien la
// revise y decida a mano. La etiqueta se deja de mostrar sola a la semana de detectada
// (listarResumen/completo la agregan como ADVERTENCIA). Lo corre el Calentador, sin sesión.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const HOJA_UBER = 'UBER';
const HOJA_DETECCION = 'UBER BAJAS DETECTADAS';

function crearContexto({ filasUber = [], activosCH = [], filasDeteccion = [], filasListado = null } = {}) {
  const hojaUber = filasUber.map((f) => Object.assign({}, f));
  const deteccion = filasDeteccion.map((f) => Object.assign({}, f));
  const llamadas = { insert: [], removeMany: [] };

  const contexto = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' } },
    Permisos: { puedeEditar: () => ({ nombre: 'TESTER' }) },
    CapitalHumano: {
      activos: () => activosCH,
      // Mismo criterio tolerante a acentos/mayúsculas que el real (simplificado para la prueba).
      nombreComparable: (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase(),
    },
    // La hoja de detección se crea sola (insertSheet) la primera vez; a la prueba no le
    // importa su contenido real, solo que no truene.
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: () => null,
        insertSheet: () => ({
          getRange: () => ({ setValues: () => ({ setFontWeight: () => {} }) }),
          setFrozenRows: () => {},
        }),
      }),
    },
    SheetUtils: {
      getAll: (ssId, nombreHoja) => {
        if (nombreHoja === HOJA_UBER) return hojaUber;
        if (nombreHoja === HOJA_DETECCION) return deteccion;
        throw new Error('hoja inesperada: ' + nombreHoja);
      },
      insert: (ssId, nombreHoja, obj) => {
        llamadas.insert.push(obj);
        deteccion.push(Object.assign({}, obj));
        return obj;
      },
      removeMany: (ssId, nombreHoja, ids) => {
        llamadas.removeMany.push(ids);
        let cambiadas = 0;
        ids.forEach((id) => {
          const i = deteccion.findIndex((f) => f['ID'] === id);
          if (i !== -1) { deteccion.splice(i, 1); cambiadas++; }
        });
        return cambiadas;
      },
      update: () => { throw new Error('no debe llamar a update(): ya no cambia ESTAUS USUARIO'); },
      updateMany: () => { throw new Error('no debe llamar a updateMany(): ya no cambia ESTAUS USUARIO'); },
    },
    HojaServicio: {
      listar: () => (filasListado || []).map((f) => Object.assign({}, f)),
      completo: () => (filasListado || []).map((f) => Object.assign({}, f)),
    },
    DriveUtils: {},
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/UberService.gs'), 'utf8') +
    '\nthis.Servicio = UberService;',
    contexto
  );
  return { contexto, llamadas, hojaUber, deteccion };
}

test('detectarBajasPendientes: etiqueta (sin tocar el estatus) a quien está ACTIVO en Uber pero ya no está activo en Capital Humano', () => {
  const { contexto, hojaUber, deteccion } = crearContexto({
    filasUber: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'ESTAUS USUARIO': 'ACTIVO' }],
    activosCH: [], // nadie activo en CH
  });
  const cambios = contexto.Servicio.detectarBajasPendientes();
  assert.equal(cambios, 1);
  assert.equal(hojaUber[0]['ESTAUS USUARIO'], 'ACTIVO', 'jamás toca el estatus solo');
  assert.equal(deteccion.length, 1);
  assert.equal(deteccion[0]['ID'], 'U-1');
  // El Date se crea adentro del vm.createContext (otro "realm"): instanceof Date de este
  // archivo no lo reconoce aunque sí sea una fecha real -- se revisa por duck typing.
  assert.equal(Object.prototype.toString.call(deteccion[0]['FECHA DETECCION']), '[object Date]');
});

test('detectarBajasPendientes: no marca a quien sigue activo en Capital Humano', () => {
  const { contexto, hojaUber, deteccion } = crearContexto({
    filasUber: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'ESTAUS USUARIO': 'ACTIVO' }],
    activosCH: [{ NOMBRE: 'JUAN PEREZ' }],
  });
  const cambios = contexto.Servicio.detectarBajasPendientes();
  assert.equal(cambios, 0);
  assert.equal(deteccion.length, 0);
  assert.equal(hojaUber[0]['ESTAUS USUARIO'], 'ACTIVO');
});

test('detectarBajasPendientes: compara nombres sin importar acentos/mayúsculas (mismo criterio que el resto de la app)', () => {
  const { contexto, deteccion } = crearContexto({
    filasUber: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'María Pérez', 'ESTAUS USUARIO': 'ACTIVO' }],
    activosCH: [{ NOMBRE: 'maria perez' }],
  });
  contexto.Servicio.detectarBajasPendientes();
  assert.equal(deteccion.length, 0, 'sigue activa pese al acento/mayúsculas distintos');
});

test('detectarBajasPendientes: nunca marca a quien ya está en BAJA o en PENDIENTE', () => {
  const { contexto, deteccion } = crearContexto({
    filasUber: [
      { ID: 'U-1', 'NOMBRE COMPLETO': 'Ya Fuera', 'ESTAUS USUARIO': 'BAJA' },
      { ID: 'U-2', 'NOMBRE COMPLETO': 'En Revision', 'ESTAUS USUARIO': 'PENDIENTE' },
    ],
    activosCH: [], // ninguno de los dos está activo en CH
  });
  const cambios = contexto.Servicio.detectarBajasPendientes();
  assert.equal(cambios, 0);
  assert.equal(deteccion.length, 0, 'BAJA y PENDIENTE son decisión manual, este detector no las toca');
});

test('detectarBajasPendientes: un renglón sin nombre no truena ni se marca', () => {
  const { contexto, deteccion } = crearContexto({
    filasUber: [{ ID: 'U-1', 'NOMBRE COMPLETO': '', 'ESTAUS USUARIO': 'ACTIVO' }],
    activosCH: [],
  });
  assert.doesNotThrow(() => contexto.Servicio.detectarBajasPendientes());
  assert.equal(deteccion.length, 0);
});

test('detectarBajasPendientes: varios candidatos se marcan todos, y correr dos veces no los duplica', () => {
  const { contexto, deteccion } = crearContexto({
    filasUber: [
      { ID: 'U-1', 'NOMBRE COMPLETO': 'Persona Uno', 'ESTAUS USUARIO': 'ACTIVO' },
      { ID: 'U-2', 'NOMBRE COMPLETO': 'Persona Dos', 'ESTAUS USUARIO': 'ACTIVO' },
      { ID: 'U-3', 'NOMBRE COMPLETO': 'Persona Tres', 'ESTAUS USUARIO': 'ACTIVO' },
    ],
    activosCH: [{ NOMBRE: 'PERSONA DOS' }],
  });
  const primerCambio = contexto.Servicio.detectarBajasPendientes();
  assert.equal(primerCambio, 2);
  assert.deepEqual(deteccion.map((f) => f['ID']).sort(), ['U-1', 'U-3']);

  const segundoCambio = contexto.Servicio.detectarBajasPendientes();
  assert.equal(segundoCambio, 0, 'ya estaban marcados, no se vuelven a insertar');
  assert.equal(deteccion.length, 2);
});

test('detectarBajasPendientes: si Capital Humano lo reactiva, se quita la etiqueta ya puesta', () => {
  const { contexto, deteccion } = crearContexto({
    filasUber: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'ESTAUS USUARIO': 'ACTIVO' }],
    activosCH: [{ NOMBRE: 'JUAN PEREZ' }],
    filasDeteccion: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'FECHA DETECCION': new Date() }],
  });
  const cambios = contexto.Servicio.detectarBajasPendientes();
  assert.equal(cambios, 1);
  assert.equal(deteccion.length, 0);
});

test('detectarBajasPendientes: si alguien ya le cambió el estatus a mano (BAJA/PENDIENTE), se quita la etiqueta puesta antes', () => {
  const { contexto, deteccion } = crearContexto({
    filasUber: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'ESTAUS USUARIO': 'BAJA' }],
    activosCH: [],
    filasDeteccion: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'FECHA DETECCION': new Date() }],
  });
  const cambios = contexto.Servicio.detectarBajasPendientes();
  assert.equal(cambios, 1);
  assert.equal(deteccion.length, 0);
});

test('listarResumen: agrega ADVERTENCIA a quien tiene la etiqueta vigente (detectada hace menos de 7 días)', () => {
  const hace3Dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const { contexto } = crearContexto({
    filasListado: [{ ID: 'U-1', NOMBRE_COMPLETO: 'Juan Perez' }],
    filasDeteccion: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'FECHA DETECCION': hace3Dias }],
  });
  const filas = contexto.Servicio.listarResumen('token');
  assert.equal(filas[0].ADVERTENCIA, 'Baja, quitar de Uber');
});

test('listarResumen: la etiqueta se deja de mostrar sola a la semana de detectada', () => {
  const hace10Dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const { contexto } = crearContexto({
    filasListado: [{ ID: 'U-1', NOMBRE_COMPLETO: 'Juan Perez' }],
    filasDeteccion: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'FECHA DETECCION': hace10Dias }],
  });
  const filas = contexto.Servicio.listarResumen('token');
  assert.equal(filas[0].ADVERTENCIA, '', 'pasó la semana: ya no se muestra, aunque el renglón siga en la hoja');
});

test('listarResumen: sin etiqueta detectada, ADVERTENCIA va vacío', () => {
  const { contexto } = crearContexto({
    filasListado: [{ ID: 'U-1', NOMBRE_COMPLETO: 'Juan Perez' }],
  });
  const filas = contexto.Servicio.listarResumen('token');
  assert.equal(filas[0].ADVERTENCIA, '');
});

test('completo: también agrega ADVERTENCIA, igual que listarResumen', () => {
  const hace3Dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const { contexto } = crearContexto({
    filasListado: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez' }],
    filasDeteccion: [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'FECHA DETECCION': hace3Dias }],
  });
  const filas = contexto.Servicio.completo('token');
  assert.equal(filas[0].ADVERTENCIA, 'Baja, quitar de Uber');
});

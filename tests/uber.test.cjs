// UberService.sincronizarBajas (15-oct-2026): pone en BAJA automático a quien sigue ACTIVO en
// Uber pero ya no está activo en Capital Humano -- nadie tiene que acordarse de hacerlo a mano
// cuando alguien deja la empresa. Lo corre el Calentador, sin sesión.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function crearContexto(filasUber, activosCH) {
  const llamadas = { update: [] };
  const hoja = filasUber.map((f) => Object.assign({}, f));
  const contexto = vm.createContext({
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' } },
    Permisos: { puedeEditar: () => ({ nombre: 'TESTER' }) },
    CapitalHumano: {
      activos: () => activosCH,
      // Mismo criterio tolerante a acentos/mayúsculas que el real (simplificado para la prueba).
      nombreComparable: (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase(),
    },
    SheetUtils: {
      getAll: () => hoja,
      update: (ssId, nombreHoja, id, cambios) => {
        llamadas.update.push({ id, cambios });
        const fila = hoja.find((f) => f['ID'] === id);
        if (fila) Object.assign(fila, cambios);
      },
    },
    HojaServicio: {},
    DriveUtils: {},
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/UberService.gs'), 'utf8') +
    '\nthis.Servicio = UberService;',
    contexto
  );
  return { contexto, llamadas, hoja };
}

test('sincronizarBajas: pone en BAJA a quien está ACTIVO en Uber pero ya no está activo en Capital Humano', () => {
  const { contexto, llamadas, hoja } = crearContexto(
    [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'ESTAUS USUARIO': 'ACTIVO' }],
    [], // nadie activo en CH
  );
  const cambiados = contexto.Servicio.sincronizarBajas();
  assert.equal(cambiados, 1);
  assert.equal(hoja[0]['ESTAUS USUARIO'], 'BAJA');
  assert.equal(llamadas.update.length, 1);
});

test('sincronizarBajas: no toca a quien sigue activo en Capital Humano', () => {
  const { contexto, hoja } = crearContexto(
    [{ ID: 'U-1', 'NOMBRE COMPLETO': 'Juan Perez', 'ESTAUS USUARIO': 'ACTIVO' }],
    [{ NOMBRE: 'JUAN PEREZ' }],
  );
  const cambiados = contexto.Servicio.sincronizarBajas();
  assert.equal(cambiados, 0);
  assert.equal(hoja[0]['ESTAUS USUARIO'], 'ACTIVO');
});

test('sincronizarBajas: compara nombres sin importar acentos/mayúsculas (mismo criterio que el resto de la app)', () => {
  const { contexto, hoja } = crearContexto(
    [{ ID: 'U-1', 'NOMBRE COMPLETO': 'María Pérez', 'ESTAUS USUARIO': 'ACTIVO' }],
    [{ NOMBRE: 'maria perez' }],
  );
  contexto.Servicio.sincronizarBajas();
  assert.equal(hoja[0]['ESTAUS USUARIO'], 'ACTIVO', 'sigue activo pese al acento/mayúsculas distintos');
});

test('sincronizarBajas: nunca toca a quien ya está en BAJA o en PENDIENTE', () => {
  const { contexto, hoja } = crearContexto(
    [
      { ID: 'U-1', 'NOMBRE COMPLETO': 'Ya Fuera', 'ESTAUS USUARIO': 'BAJA' },
      { ID: 'U-2', 'NOMBRE COMPLETO': 'En Revision', 'ESTAUS USUARIO': 'PENDIENTE' },
    ],
    [], // ninguno de los dos está activo en CH
  );
  const cambiados = contexto.Servicio.sincronizarBajas();
  assert.equal(cambiados, 0);
  assert.equal(hoja[0]['ESTAUS USUARIO'], 'BAJA');
  assert.equal(hoja[1]['ESTAUS USUARIO'], 'PENDIENTE', 'PENDIENTE es una decisión manual, no la cambia este sincronizador');
});

test('sincronizarBajas: un renglón sin nombre no truena ni se toca', () => {
  const { contexto, hoja } = crearContexto(
    [{ ID: 'U-1', 'NOMBRE COMPLETO': '', 'ESTAUS USUARIO': 'ACTIVO' }],
    [],
  );
  assert.doesNotThrow(() => contexto.Servicio.sincronizarBajas());
  assert.equal(hoja[0]['ESTAUS USUARIO'], 'ACTIVO');
});

test('sincronizarBajas: varios renglones ACTIVOS que ya no están en Capital Humano se bajan todos, en una sola corrida', () => {
  const { contexto, hoja } = crearContexto(
    [
      { ID: 'U-1', 'NOMBRE COMPLETO': 'Persona Uno', 'ESTAUS USUARIO': 'ACTIVO' },
      { ID: 'U-2', 'NOMBRE COMPLETO': 'Persona Dos', 'ESTAUS USUARIO': 'ACTIVO' },
      { ID: 'U-3', 'NOMBRE COMPLETO': 'Persona Tres', 'ESTAUS USUARIO': 'ACTIVO' },
    ],
    [{ NOMBRE: 'PERSONA DOS' }],
  );
  const cambiados = contexto.Servicio.sincronizarBajas();
  assert.equal(cambiados, 2);
  assert.equal(hoja[0]['ESTAUS USUARIO'], 'BAJA');
  assert.equal(hoja[1]['ESTAUS USUARIO'], 'ACTIVO', 'Persona Dos sigue activa en CH');
  assert.equal(hoja[2]['ESTAUS USUARIO'], 'BAJA');
});

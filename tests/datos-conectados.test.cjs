// DatosConectados.gs: lo que se conecta desde la pantalla (Administración > Datos conectados). Sugerir la llave,
// la vista previa (qué se pondría al día), las reglas que impiden conectar algo peligroso, conectar y quitar.
// Hojas y servicios de mentira; Relaciones solo con lo que DatosConectados le pide.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function hoja(nombre, enc, filas) {
  const datos = filas.map((o) => enc.map((c) => (c in o ? o[c] : '')));
  const h = {
    nombre, enc, datos, formatos: [],
    getName: () => nombre,
    getLastRow: () => datos.length + 1,
    getLastColumn: () => enc.length,
    getRange: (f, c, nf, nc) => { const r = {
      getValues: () => {
        const out = [];
        for (let i = 0; i < (nf || 1); i++) {
          const fila = f + i === 1 ? enc : (datos[f + i - 2] || []);
          out.push(fila.slice(c - 1, c - 1 + (nc || 1)));
        }
        return out;
      },
      setValues: (vals) => {
        vals.forEach((v, i) => {
          if (f + i === 1) { v.forEach((x, j) => { enc[c - 1 + j] = x; }); return; }
          const d = (datos[f + i - 2] = datos[f + i - 2] || []);
          v.forEach((x, j) => { d[c - 1 + j] = x; });
        });
        return r;   // como Apps Script: se puede encadenar
      },
      setValue: (v) => { (datos[f - 2] = datos[f - 2] || [])[c - 1] = v; },
      setFontWeight: () => r,
    }; return r; },
    setFrozenRows: () => {},
  };
  return h;
}

function cargar(opciones) {
  const o = opciones || {};
  const hs = {
    VEHICULOS: hoja('VEHICULOS', ['ID', 'FOLIO', 'SERIE VEHICULO', 'PLACA', 'COLOR', 'PIN EQUIPO'], [
      { ID: 'VEH-1', FOLIO: 'CTA1', 'SERIE VEHICULO': 'S1', PLACA: 'AAA', COLOR: 'AZUL' },
      { ID: 'VEH-2', FOLIO: 'CTA2', 'SERIE VEHICULO': 'S2', PLACA: 'BBB', COLOR: 'ROJO' },
      { ID: 'VEH-3', FOLIO: 'CTA3', 'SERIE VEHICULO': 'S3', PLACA: 'CCC', COLOR: 'VERDE' },
    ]),
    HOLOGRAMAS: hoja('HOLOGRAMAS', ['ID', 'SERIE VEHICULO', 'PLACA', 'COLOR', 'ID VEHICULO'], [
      { ID: 'HOL-1', 'SERIE VEHICULO': 'S1', PLACA: 'AAA', COLOR: 'AZUL' },
      { ID: 'HOL-2', 'SERIE VEHICULO': 'S2', PLACA: 'BBB', COLOR: 'NEGRO' },   // color distinto
      { ID: 'HOL-3', 'SERIE VEHICULO': 'S9', PLACA: 'ZZZ', COLOR: 'GRIS' },    // sin dueño
      { ID: 'HOL-4', 'SERIE VEHICULO': '', PLACA: '', COLOR: '' },             // sin llave
    ]),
    'LINEAS TELEFONICAS': hoja('LINEAS TELEFONICAS', ['ID', 'NUCO', 'COLOR'], [{ ID: 'L1', NUCO: '1', COLOR: 'X' }]),
  };
  const usuarios = {};
  const libro = { VEHICULOS: 'LIB-V', HOLOGRAMAS: 'LIB-V', 'LINEAS TELEFONICAS': 'LIB-T' };
  const existentes = o.existentes || [];   // conexiones que ya están en el MAPA (describir)
  const ctx = vm.createContext({
    console,
    Config: { SPREADSHEET_IDS: { USUARIOS: () => 'LIB-U' } },
    CacheHojas: { recordar: (k, h, armar) => armar(), tocarHoja: () => {} },
    LockService: { getScriptLock: () => ({ waitLock: () => true, releaseLock: () => {} }) },
    Ids: { nuevo: (p) => p + '-' + Math.random().toString(36).slice(2, 8) },
    Permisos: {
      puedeLeer: () => ({ correo: 'ana@x.com' }),
      puedeEditar: () => { if (o.soloLectura) throw new Error('Sin permiso'); return { correo: 'ana@x.com', nombre: 'Ana' }; },
    },
    Entidades: { todas: () => Object.keys(libro).map((h) => ({ hoja: h, familia: h === 'LINEAS TELEFONICAS' ? 'lineas' : 'vehiculos' })) },
    Relaciones: {
      etiqueta: (h) => ({ nombre: h.charAt(0) + h.slice(1).toLowerCase(), uno: 'registro', varios: 'registros' }),
      libroDe: (h) => libro[h],
      describir: () => ({ duenos: existentes }),
      olvidarMapa: () => {},
      revisar: (op) => ({ [op.hojas[0]]: { diferencias: 1, corregido: true } }),
    },
    SheetUtils: {
      getSheet: (ss, n) => {
        if (ss === 'LIB-U') { if (!usuarios[n]) throw new Error('No existe la hoja ' + n); return usuarios[n]; }
        if (!hs[n] || libro[n] !== ss) throw new Error('No existe la hoja ' + n);
        return hs[n];
      },
    },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => usuarios[n] || null,
        insertSheet: (n) => (usuarios[n] = hoja(n, [], [])),
      }),
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'DatosConectados.gs'), 'utf8') +
    '\nthis.DatosConectados = DatosConectados;', ctx);
  return { D: ctx.DatosConectados, hs, usuarios };
}

const propuesta = (o) => Object.assign({ dueno: 'VEHICULOS', copia: 'HOLOGRAMAS', llaveDueno: 'SERIE VEHICULO',
  llaveCopia: 'SERIE VEHICULO', columnas: [['COLOR', 'COLOR']], tipo: 'cache' }, o);

test('sugiere la llave que empareja más registros y los datos que se llaman igual (sin IDs ni secretos)', () => {
  const { D } = cargar();
  const s = JSON.parse(JSON.stringify(D.sugerir('t', 'VEHICULOS', 'HOLOGRAMAS')));
  assert.equal(s.llaves[0].dueno, 'SERIE VEHICULO');
  assert.equal(s.llaves[0].encontradas, 2);
  assert.deepEqual(s.datos.map((d) => d[0]).sort(), ['COLOR', 'PLACA']);
});

test('la vista previa cuenta qué se pondría al día, sin escribir nada', () => {
  const { D, hs } = cargar();
  const v = D.vistaPrevia('t', propuesta({ columnas: [['COLOR', 'COLOR'], ['PLACA', 'PLACA']] }));
  assert.equal(v.registros, 4);
  assert.equal(v.encontradas, 2);
  assert.equal(v.sinDueno, 1);
  assert.equal(v.sinLlave, 1);
  const color = v.columnas.find((c) => c.dueno === 'COLOR');
  assert.equal(color.diferencias, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(color.ejemplos[0])), { clave: 'S2', enCopia: 'NEGRO', enDueno: 'ROJO' });
  assert.equal(v.columnas.find((c) => c.dueno === 'PLACA').diferencias, 0);
  assert.equal(hs.HOLOGRAMAS.datos[1][3], 'NEGRO', 'no escribió');
});

test('no deja conectar lo peligroso', () => {
  const { D } = cargar({ existentes: [{ hoja: 'VEHICULOS', copias: [{ nombre: 'HOLOGRAMAS', claveOrigen: 'SERIE VEHICULO',
    clave: 'SERIE VEHICULO', tipo: 'cache', columnas: [{ origen: 'PLACA', destino: 'PLACA' }] }] }] });
  const falla = (o, re) => assert.throws(() => D.guardar('t', propuesta(o)), re);
  falla({ columnas: [['PIN EQUIPO', 'COLOR']] }, /secreto/);
  falla({ columnas: [['FOLIO', 'ID VEHICULO']] }, /columna de ID/);
  falla({ columnas: [['FOLIO', 'SERIE VEHICULO']] }, /llave/);
  falla({ columnas: [['COLOR', 'PLACA']] }, /ya recibe PLACA/);
  falla({ copia: 'LINEAS TELEFONICAS', llaveCopia: 'NUCO' }, /libros distintos/);
  falla({ copia: 'VEHICULOS' }, /consigo misma/);
  falla({ columnas: [] }, /al menos un dato/);
  falla({ columnas: [['NO EXISTE', 'COLOR']] }, /no tiene la columna/);
});

test('conectar escribe un renglón por dato y su historial; no repite; quitar lo marca inactivo', () => {
  const { D, usuarios } = cargar();
  const r = JSON.parse(JSON.stringify(D.guardar('t', propuesta({ columnas: [['COLOR', 'COLOR'], ['PLACA', 'PLACA']] }), true)));
  assert.equal(r.conectados, 2);
  assert.deepEqual(r.alDia, { diferencias: 1, corregido: true }, 'con ponerAlDia, actualiza lo que ya estaba distinto');
  assert.equal(usuarios['DATOS CONECTADOS'].datos.length, 2);
  assert.equal(usuarios['DATOS CONECTADOS_HISTORIAL'].datos.length, 2);
  const reglas = D.reglas();
  assert.deepEqual(reglas.map((x) => x.colCopia).sort(), ['COLOR', 'PLACA']);
  assert.equal(reglas[0].tipo, 'cache');

  D.quitar('t', 'VEHICULOS', 'HOLOGRAMAS', 'COLOR');
  assert.deepEqual(D.reglas().map((x) => x.colCopia), ['PLACA'], 'el quitado ya no cuenta');
  assert.equal(usuarios['DATOS CONECTADOS'].datos.length, 2, 'pero el renglón se queda (historia)');
  assert.throws(() => D.quitar('t', 'VEHICULOS', 'HOLOGRAMAS', 'COLOR'), /no se conectó desde la pantalla/);
});

test('sin permiso de edición no conecta ni quita', () => {
  const { D } = cargar({ soloLectura: true });
  assert.throws(() => D.guardar('t', propuesta()), /Sin permiso/);
  assert.throws(() => D.quitar('t', 'VEHICULOS', 'HOLOGRAMAS', 'COLOR'), /Sin permiso/);
});

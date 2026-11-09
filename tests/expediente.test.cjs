// Expediente.gs (6-nov, homologación 5.7): un solo motor para las carpetas de Drive de Vehículos (NUCOS VEHICULOS) y de
// Líneas (NUCOS TELEFONICOS y LINEAS). Cada tipo declara su estructura; el motor la recorre igual para todos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const CARPETA = 'application/vnd.google-apps.folder';

/** Un Drive de mentira: carpetas con padre, nombre, propiedades y papelera; DriveApp y la API avanzada sobre lo mismo. */
function driveFalso() {
  const c = {};
  let n = 0;
  const llamadas = { getParents: 0, list: 0 };
  const iter = (l) => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
  const hijos = (id) => Object.values(c).filter((x) => x.padre === id && !x.trashed);
  const nueva = (nombre, padre, props) => {
    const id = 'C' + (++n);
    c[id] = { id, name: nombre, padre: padre || null, props: props || {}, trashed: false };
    return id;
  };
  const envolver = (x) => ({
    getId: () => x.id, getName: () => x.name, setName: (v) => { x.name = v; }, isTrashed: () => x.trashed,
    setTrashed: (v) => { x.trashed = v; },
    getFoldersByName: (v) => iter(hijos(x.id).filter((h) => h.name === v).map(envolver)),
    getFolders: () => iter(hijos(x.id).map(envolver)),
    createFolder: (v) => envolver(c[nueva(v, x.id)]),
    getParents: () => { llamadas.getParents++; return iter(x.padre ? [envolver(c[x.padre])] : []); },
  });
  const DriveApp = { getFolderById: (id) => { if (!c[id]) throw new Error('no existe ' + id); return envolver(c[id]); } };
  const Drive = { Files: {
    create: (r) => ({ id: nueva(r.name, r.parents[0], r.properties) }),
    list: (p) => {
      llamadas.list++;
      const padres = [...p.q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
      return { files: Object.values(c).filter((x) => padres.indexOf(x.padre) !== -1 && !x.trashed)
        .map((x) => ({ id: x.id, name: x.name, mimeType: CARPETA, parents: [x.padre], properties: x.props })) };
    },
  } };
  const ruta = (id) => { const p = []; for (let x = c[id]; x; x = c[x.padre]) p.unshift(x.name); return p.join('/'); };
  return { c, nueva, DriveApp, Drive, ruta, llamadas, hijos };
}

function cargar(drive, opciones) {
  const op = opciones || {};
  const raices = { veh: drive.nueva('NUCOS VEHICULOS'), tel: drive.nueva('NUCOS TELEFONICOS'), app: drive.nueva('APPSHEET') };
  raices.lin = drive.nueva('LINEAS');
  const fmt = { yyyy: (d) => String(d.getUTCFullYear()), M: (d) => String(d.getUTCMonth() + 1),
    'dd MM': (d) => ('0' + d.getUTCDate()).slice(-2) + ' ' + ('0' + (d.getUTCMonth() + 1)).slice(-2) };
  const ctx = vm.createContext({
    console,
    Config: { DRIVE_FOLDERS: { NUCOS_VEHICULOS: () => raices.veh }, ENTORNO: op.entorno || 'PROD' },
    leerConfig_: (k) => ({ LINEAS_DRIVE_NUCOS: raices.tel, LINEAS_DRIVE_LINEAS: op.sinLineas ? '' : raices.lin })[k] || '',
    DriveApp: drive.DriveApp, Drive: drive.Drive,
    DriveUtils: { ...require('./drive-utils-real')({ Drive: drive.Drive, DriveApp: drive.DriveApp }), marcarAutor: (a) => a },
    LineasUtil: { nuco4: (v) => { const d = String(v || '').replace(/\D/g, ''); return d ? ('0000' + d).slice(-Math.max(4, d.length)) : null; } },
    Utilities: { formatDate: (d, z, f) => fmt[f](d) },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'Expediente.gs'), 'utf8') + '\nthis.E = Expediente;', ctx);
  return { E: ctx.E, raices };
}

const NOV = new Date('2026-11-06T12:00:00Z');

test('vehículo: un NUCO nuevo nace con su estructura y la inspección va a su año y trimestre', () => {
  const d = driveFalso();
  const { E } = cargar(d);
  const r = E.carpetaDocumento('vehiculo', '0088', 'INSPECCION', NOV);
  assert.equal(d.ruta(r.carpeta.getId()), 'NUCOS VEHICULOS/88/4.-INSPECCIONES/2026/4TO TRIMESTRE');
  assert.deepEqual(d.hijos(r.activo.getId()).map((x) => x.name).sort(), ['1.-DOCUMENTACIÓN', '2.-SERVICIOS', '3.-VERIFICACIONES', '4.-INSPECCIONES']);
  // La segunda vez usa la misma carpeta del NUCO (no crea otra al lado)
  assert.equal(E.carpetaActivo('vehiculo', 88).getId(), r.activo.getId());
  assert.equal(d.ruta(E.carpetaDocumento('vehiculo', 88, 'SEGURO').carpeta.getId()), 'NUCOS VEHICULOS/88/1.-DOCUMENTACIÓN/2.-SEGURO');
  assert.throws(() => E.carpetaDocumento('vehiculo', 88, 'OTRA'), /Documento desconocido para el expediente: OTRA/);
  assert.throws(() => E.carpetaActivo('vehiculo', 'X'), /no tiene NUCCO/);
});

test('equipo: "599" ya existente se reconoce como 0599; la inspección del día lleva cuatrimestre, mes, nombre único y FOTOS', () => {
  const d = driveFalso();
  const { E, raices } = cargar(d);
  const vieja = d.nueva('599', raices.tel);
  const a = E.carpetaDelDia('equipo', '0599', 'INSPECCION', NOV);
  assert.equal(a.activo.getId(), vieja);
  assert.equal(d.ruta(a.carpeta.getId()), 'NUCOS TELEFONICOS/599/INSPECCIONES/2026/3ER CUATRIMESTRE/NOVIEMBRE/INSP 06 11');
  assert.equal(d.ruta(a.fotos.getId()), d.ruta(a.carpeta.getId()) + '/FOTOS');
  assert.equal(d.ruta(E.carpetaDelDia('equipo', 599, 'INSPECCION', NOV).carpeta.getId()).split('/').pop(), 'INSP 06 11 (2)');
  const r = E.carpetaDelDia('equipo', 1234, 'RESPONSIVA', NOV);
  assert.equal(d.ruta(r.carpeta.getId()), 'NUCOS TELEFONICOS/1234/CARTA RESPONSIVA/2026/RESP 06 11');
  assert.equal(r.fotos, null);
  assert.throws(() => E.carpetaDelDia('equipo', 1234, 'OTRO', NOV), /Tipo de evidencia inválido/);
});

test('equipo: si la carpeta guardada en el mapa se fue a la papelera, se vuelve a leer y, si no hay, se crea', () => {
  const d = driveFalso();
  const { E, raices } = cargar(d);
  const id = d.nueva('0700', raices.tel);
  assert.equal(E.idActivo('equipo', '700'), id);
  d.c[id].trashed = true;
  const nueva = E.carpetaActivo('equipo', '700');
  assert.notEqual(nueva.getId(), id);
  assert.equal(nueva.getName(), '0700');
});

test('línea: se reconoce por su idLinea, se crea con el número y se renombra si cambió; un número reciclado tiene la suya', () => {
  const d = driveFalso();
  const { E } = cargar(d);
  const a = E.carpetaDelDia('linea', 'LIN-1', 'RESPONSIVA', NOV, { numero: '442 123 4567' });
  assert.equal(d.ruta(a.carpeta.getId()), 'LINEAS/4421234567/CARTA RESPONSIVA/2026/RESP 06 11');
  assert.equal(E.carpetaActivo('linea', 'LIN-2', { numero: '4421234567' }).getName(), '4421234567 (2)');
  assert.equal(E.carpetaActivo('linea', 'LIN-1', { numero: '4429999999' }).getId(), a.activo.getId());
  assert.equal(a.activo.getName(), '4429999999');
  assert.throws(() => E.carpetaActivo('linea', 'LIN-1', { numero: '' }), /La línea no tiene número/);
  assert.throws(() => E.carpetaActivo('linea', '', { numero: '1' }), /Falta la línea/);
});

test('línea: en producción sin LINEAS configurada no hay raíz; en un DEV es «LINEAS» dentro de la NUCOS de pruebas', () => {
  assert.throws(() => cargar(driveFalso(), { sinLineas: true }).E.raiz('linea'), /Falta la carpeta LINEAS en Drive/);
  const d = driveFalso();
  const { E, raices } = cargar(d, { sinLineas: true, entorno: 'DEV' });
  assert.equal(d.ruta(E.raiz('linea')), 'NUCOS TELEFONICOS/LINEAS');
  assert.equal(d.c[E.raiz('linea')].padre, raices.tel);
});

test('raizDe: una sola subida contra todas las raíces, y gana la más cercana', () => {
  const d = driveFalso();
  const { E, raices } = cargar(d);
  // Como en un DEV: LINEAS dentro de NUCOS
  const lineas = d.nueva('LINEAS', raices.tel);
  const resp = d.nueva('RESP 06 11', d.nueva('2026', d.nueva('CARTA RESPONSIVA', d.nueva('4421234567', lineas))));
  d.llamadas.getParents = 0;
  assert.equal(E.raizDe(resp, { equipo: raices.tel, linea: lineas, app: raices.app }), 'linea');
  assert.equal(d.llamadas.getParents, 4, 'sube hasta LINEAS y se detiene');
  assert.equal(E.raizDe(resp, { app: raices.app }), null);
  assert.equal(E.dentroDe(resp, raices.tel), true);
  assert.equal(E.dentroDe(resp, raices.app), false);
});

test('hijos: una consulta por cada 40 carpetas, y soloCarpetas deja fuera los archivos', () => {
  const d = driveFalso();
  const { E, raices } = cargar(d);
  const padres = Array.from({ length: 81 }, (_, i) => d.nueva('N' + i, raices.tel));
  d.llamadas.list = 0;
  E.hijos(padres);
  assert.equal(d.llamadas.list, 3);
  const archivo = { id: 'F', name: 'x.pdf', mimeType: 'application/pdf' };
  d.Drive.Files.list = () => ({ files: [archivo, { id: 'D', name: 'd', mimeType: CARPETA }] });
  assert.deepEqual([...E.hijos(['P'], { soloCarpetas: true }).map((f) => f.id)], ['D']);
  assert.deepEqual([...E.hijos(['P']).map((f) => f.id)], ['F', 'D']);
});

test('contrato: nadie más sube por los padres para saber dónde está una carpeta, y los tres tipos están declarados', () => {
  const src = path.join(__dirname, '..', 'src');
  const todos = [];
  const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p); else if (p.endsWith('.gs')) todos.push(p);
  });
  recorrer(src);
  const copias = todos.filter((f) => !f.endsWith('Expediente.gs') && /for \(let nivel = 0; nivel < \d+/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.basename(f));
  assert.deepEqual(copias, [], 'usa Expediente.raizDe / dentroDe');
  // El mapa activo → carpeta tampoco se arma a mano fuera del motor
  ['src/utils/ExpedienteNuco.gs', 'src/services/lineas/LineasArchivos.gs'].forEach((f) =>
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /in parents and mimeType = 'application\/vnd\.google-apps\.folder'/, f));
  const { E } = cargar(driveFalso());
  assert.deepEqual([...Object.keys(E.TIPOS)], ['vehiculo', 'equipo', 'linea']);
});

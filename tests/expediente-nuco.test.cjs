// ExpedienteNuco: cada documento del vehículo va a la carpeta de su NUCO (docs/nucos-expediente.md), con su nombre, y
// el que estaba vigente pasa a "anteriores". Drive simulado en memoria.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const CARPETA = 'folder';

function driveFalso() {
  const porId = {};
  let n = 1;
  const iter = (l) => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
  const hijos = (c) => Object.values(porId).filter((x) => x.padre === c.id);
  function nodo(nombre, padre, tipo, fecha) {
    const x = { id: 'n' + n++, nombre, padre: padre ? padre.id : null, tipo, fecha: fecha || new Date('2026-10-08T12:00:00Z') };
    x.getId = () => x.id;
    x.getName = () => x.nombre;
    x.setName = (v) => { x.nombre = v; return x; };
    x.getLastUpdated = () => x.fecha;
    x.moveTo = (c) => { x.padre = c.id; return x; };
    x.getFoldersByName = (v) => iter(hijos(x).filter((h) => h.tipo === CARPETA && h.nombre === v));
    x.getFilesByName = (v) => iter(hijos(x).filter((h) => h.tipo !== CARPETA && h.nombre === v));
    x.getFiles = () => iter(hijos(x).filter((h) => h.tipo !== CARPETA));
    x.getFolders = () => iter(hijos(x).filter((h) => h.tipo === CARPETA));
    x.getUrl = () => 'url:' + x.id;
    x.getMimeType = () => (x.tipo === 'pdf' ? 'application/pdf' : 'image/' + x.tipo);
    x.getDateCreated = () => x.fecha;
    x.isTrashed = () => false;
    x.createFolder = (v) => nodo(v, x, CARPETA);
    porId[x.id] = x;
    return x;
  }
  const ruta = (x) => { const p = []; while (x) { p.unshift(x.nombre); x = porId[x.padre]; } return p.join('/'); };
  return { porId, nodo, ruta, hijos };
}

function cargar(drive, opciones) {
  const op = opciones || {};
  const nucos = drive.nodo('NUCOS VEHICULOS', null, CARPETA);
  const pruebas = drive.nodo('NUCOS VEHICULOS (DEV)', null, CARPETA);
  const ctx = vm.createContext({
    Config: { DRIVE_FOLDERS: { NUCOS_VEHICULOS: () => (op.sinClave ? '' : nucos.id) } },
    DriveUtils: { carpetaEnRaiz: () => pruebas },
    DriveApp: { getFolderById: (id) => drive.porId[id] },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    console,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'ExpedienteNuco.gs'), 'utf8') +
    '\nthis.ExpedienteNuco = ExpedienteNuco;', ctx);
  return { E: ctx.ExpedienteNuco, nucos, pruebas };
}

test('un NUCO nuevo se crea con toda la estructura y el documento llega con su nombre', () => {
  const drive = driveFalso();
  const { E } = cargar(drive);
  const subido = drive.nodo('VEH-000000GXV2XFTK_POLIZA_SEGURO_2026-10-07.Pdf', null, 'pdf');
  E.archivar(subido, '0643', 'SEGURO');
  assert.equal(drive.ruta(subido), 'NUCOS VEHICULOS/643/1.-DOCUMENTACIÓN/2.-SEGURO/SEGURO-0643.pdf');
  const n643 = Object.values(drive.porId).find((x) => x.nombre === '643');
  const dentro = drive.hijos(n643).map((h) => h.nombre).sort();
  assert.deepEqual(dentro, ['1.-DOCUMENTACIÓN', '2.-SERVICIOS', '3.-VERIFICACIONES', '4.-INSPECCIONES']);
  const doc = drive.hijos(n643).find((h) => h.nombre === '1.-DOCUMENTACIÓN');
  assert.equal(drive.hijos(doc).length, 6);
});

test('la póliza nueva queda vigente y la anterior pasa a SEGUROS ANTERIORES con su fecha (mismo archivo, mismo ID)', () => {
  const drive = driveFalso();
  const { E } = cargar(drive);
  const vieja = drive.nodo('p1.pdf', null, 'pdf', new Date('2025-03-01T12:00:00Z'));
  E.archivar(vieja, 88, 'SEGURO');
  const idVieja = vieja.getId();
  const nueva = drive.nodo('p2.pdf', null, 'pdf');
  E.archivar(nueva, 88, 'SEGURO');
  assert.equal(drive.ruta(nueva), 'NUCOS VEHICULOS/88/1.-DOCUMENTACIÓN/2.-SEGURO/SEGURO-0088.pdf');
  assert.equal(vieja.getId(), idVieja);
  assert.equal(drive.ruta(vieja), 'NUCOS VEHICULOS/88/1.-DOCUMENTACIÓN/2.-SEGURO/SEGUROS ANTERIORES/SEGURO-0088.pdf');
  const otra = drive.nodo('p3.pdf', null, 'pdf');
  E.archivar(otra, 88, 'SEGURO');
  assert.match(drive.ruta(nueva), /SEGUROS ANTERIORES\/SEGURO-0088 2026-10-08\.pdf$/);   // ya había una: lleva fecha
});

test('un adherente va a ADHERENTES y no mueve la responsiva vigente', () => {
  const drive = driveFalso();
  const { E } = cargar(drive);
  const resp = drive.nodo('r.pdf', null, 'pdf');
  E.archivar(resp, 24, 'RESPONSIVA');
  const adh = drive.nodo('ADHERENTE VEHICULAR X 32TVM4 2026-10-07.pdf', null, 'pdf');
  E.archivar(adh, 24, 'RESPONSIVA', { adherente: true });
  assert.equal(drive.ruta(resp), 'NUCOS VEHICULOS/24/1.-DOCUMENTACIÓN/5.-RESPONSIVA/RESPONSIVA-0024.pdf');
  assert.equal(drive.ruta(adh), 'NUCOS VEHICULOS/24/1.-DOCUMENTACIÓN/5.-RESPONSIVA/ADHERENTES/ADHERENTE-0024.pdf');
});

test('un préstamo va a PRESTAMOS y no mueve la responsiva vigente', () => {
  const drive = driveFalso();
  const { E } = cargar(drive);
  const resp = drive.nodo('r.pdf', null, 'pdf');
  E.archivar(resp, 308, 'RESPONSIVA');
  const pres = drive.nodo('RESPONSIVA VEHICULAR ANA 2026-10-12.pdf', null, 'pdf');
  E.archivar(pres, 308, 'RESPONSIVA', { prestamo: true });
  assert.equal(drive.ruta(resp), 'NUCOS VEHICULOS/308/1.-DOCUMENTACIÓN/5.-RESPONSIVA/RESPONSIVA-0308.pdf');
  assert.equal(drive.ruta(pres), 'NUCOS VEHICULOS/308/1.-DOCUMENTACIÓN/5.-RESPONSIVA/PRESTAMOS/PRESTAMO-0308.pdf');
});

test('la factura y el alta no tienen "anteriores": la segunda se queda junto, con fecha', () => {
  const drive = driveFalso();
  const { E } = cargar(drive);
  const a = drive.nodo('f.pdf', null, 'pdf');
  const b = drive.nodo('f.xml', null, 'xml');
  const c = drive.nodo('f2.pdf', null, 'pdf');
  E.archivar(a, 5, 'FACTURA');
  E.archivar(b, 5, 'FACTURA');
  E.archivar(c, 5, 'FACTURA');
  assert.equal(drive.ruta(a), 'NUCOS VEHICULOS/5/1.-DOCUMENTACIÓN/1.-FACTURA/FACTURA-0005.pdf');
  assert.equal(drive.ruta(b), 'NUCOS VEHICULOS/5/1.-DOCUMENTACIÓN/1.-FACTURA/FACTURA-0005.xml');
  assert.match(drive.ruta(c), /^NUCOS VEHICULOS\/5\/1\.-DOCUMENTACIÓN\/1\.-FACTURA\/FACTURA-0005 \d{4}-\d{2}-\d{2}\.pdf$/);   // con la fecha de hoy
});

test('sin la clave (un DEV) usa la carpeta de pruebas de la raíz, nunca la real', () => {
  const drive = driveFalso();
  const { E, nucos } = cargar(drive, { sinClave: true });
  const f = drive.nodo('t.pdf', null, 'pdf');
  E.archivar(f, 7, 'TENENCIA');
  assert.match(drive.ruta(f), /^NUCOS VEHICULOS \(DEV\)\/7\/1\.-DOCUMENTACIÓN\/6\.-TENENCIA\/TENENCIA-0007\.pdf$/);
  assert.equal(drive.hijos(nucos).length, 0);
});

test('reconoce la carpeta aunque su nombre traiga otro espacio o acento: no crea otra al lado', () => {
  const drive = driveFalso();
  const { E, nucos } = cargar(drive);
  const n9 = drive.nodo('9', nucos, CARPETA);
  const doc = drive.nodo('1.- DOCUMENTACION', n9, CARPETA);        // con espacio y sin acento
  drive.nodo('5.- RESPONSIVA ', doc, CARPETA);                      // con espacios de más
  const f = drive.nodo('r.pdf', null, 'pdf');
  E.archivar(f, 9, 'RESPONSIVA');
  assert.equal(drive.ruta(f), 'NUCOS VEHICULOS/9/1.- DOCUMENTACION/5.- RESPONSIVA /RESPONSIVA-0009.pdf');
  assert.equal(drive.hijos(n9).length, 1);
  assert.equal(drive.hijos(doc).length, 1);
});

test('listar: por tipo de documento, el vigente y sus anteriores, sin crear nada', () => {
  const drive = driveFalso();
  const { E, nucos } = cargar(drive);
  const viejo = drive.nodo('s1.pdf', null, 'pdf', new Date('2024-03-01T12:00:00Z'));
  E.archivar(viejo, 88, 'SEGURO');
  E.archivar(drive.nodo('s2.pdf', null, 'pdf'), 88, 'SEGURO');
  const n88 = drive.hijos(nucos).find((h) => h.nombre === '88');
  const doc = drive.hijos(n88).find((h) => h.nombre === '1.-DOCUMENTACIÓN');
  const oxxo = drive.nodo('ANTERIORES', doc, CARPETA);
  drive.nodo('ticket.jpg', drive.nodo('OXXO GAS', oxxo, CARPETA), 'jpg');
  const antes = Object.keys(drive.porId).length;
  const exp = E.listar('0088');
  assert.equal(Object.keys(drive.porId).length, antes);             // solo lectura
  assert.equal(exp.existe, true);
  const seguro = exp.documentos.find((d) => d.clave === 'SEGURO');
  assert.deepEqual([...seguro.vigentes.map((a) => a.nombre)], ['SEGURO-0088.pdf']);
  assert.deepEqual([...seguro.anteriores.map((g) => g.grupo)], ['SEGUROS ANTERIORES']);
  assert.equal(exp.documentos.length, 6);
  assert.deepEqual([...exp.otros.map((g) => g.grupo)], ['ANTERIORES / OXXO GAS']);
  assert.equal(JSON.stringify(E.listar(999)), JSON.stringify({ existe: false, documentos: [], otros: [], carpetas: [] }));
  assert.equal(drive.hijos(nucos).length, 1);                        // no creó el 999
});

test('sin NUCCO no adivina', () => {
  const drive = driveFalso();
  const { E } = cargar(drive);
  assert.throws(() => E.archivar(drive.nodo('x.pdf', null, 'pdf'), '', 'SEGURO'), /NUCCO/);
});

test('idDeLiga saca el ID de las ligas de Drive', () => {
  const { E } = cargar(driveFalso());
  assert.equal(E.idDeLiga('https://drive.google.com/file/d/1VMUB2RJbQ9McGc25m1ROHCYx1p0vCh8k/view?usp=drive'), '1VMUB2RJbQ9McGc25m1ROHCYx1p0vCh8k');
  assert.equal(E.idDeLiga('https://drive.google.com/open?id=1VMUB2RJbQ9McGc25m1ROHCYx1p0vCh8k'), '1VMUB2RJbQ9McGc25m1ROHCYx1p0vCh8k');
  assert.equal(E.idDeLiga('VEHICULOS_Files_/AUT0017.DOCUMENTO BAJA.pdf'), null);
});

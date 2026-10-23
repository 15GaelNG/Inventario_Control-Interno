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
    x.createFile = (blob) => nodo(blob.getName(), x, /\.pdf$/.test(blob.getName()) ? 'pdf' : 'jpg');
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
    DriveUtils: { ...require("./drive-utils-real")(),
      carpetaEnRaiz: () => pruebas,
      marcarAutor: (a) => a,
      idDeLiga: (l) => { const m = /\/d\/([A-Za-z0-9_-]{20,})|[?&]id=([A-Za-z0-9_-]{20,})/.exec(String(l || '')); return m ? (m[1] || m[2]) : null; },
    },
    DriveApp: { getFolderById: (id) => drive.porId[id] },
    // La API de Drive (avanzada): solo lo que usa inspecciones() — "'a' in parents or 'b' in parents"
    Drive: { Files: { list: (p) => {
      if (op.alListar) op.alListar(p);
      const padres = [...p.q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
      return { files: Object.values(drive.porId).filter((x) => padres.indexOf(x.padre) !== -1).map((x) => ({
        id: x.id, name: x.nombre, parents: [x.padre], mimeType: x.tipo === CARPETA ? 'application/vnd.google-apps.folder' : (x.tipo === 'pdf' ? 'application/pdf' : 'image/jpeg'),
        thumbnailLink: x.tipo === 'jpg' ? 'mini:' + x.id : undefined, webViewLink: 'url:' + x.id, createdTime: '2026-07-10T00:00:00Z' })) };
    } } },
    Utilities: { formatDate: (d, zona, f) => (f === 'yyyy' ? String(d.getUTCFullYear()) : f === 'M' ? String(d.getUTCMonth() + 1)
      : d.toISOString().slice(0, 10)) },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    CacheService: { getScriptCache: () => {
      const m = op.cache || (op.cache = {});
      return { get: (k) => m[k] || null, put: (k, v) => { m[k] = v; }, removeAll: (ks) => ks.forEach((k) => delete m[k]) };
    } },
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
  assert.equal(drive.hijos(doc).length, 7);   // 1.-FACTURA … 6.-TENENCIA y 7.-HOLOGRAMAS (15-oct)
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

test('la solicitud del holograma va a 7.-HOLOGRAMAS y la anterior a HOLOGRAMAS ANTERIORES (usuario, 15-oct)', () => {
  const drive = driveFalso();
  const { E } = cargar(drive);
  const vieja = drive.nodo('solicitud vieja.pdf', null, 'pdf', new Date('2025-03-01T12:00:00Z'));
  E.archivar(vieja, 88, 'HOLOGRAMA');
  const nueva = drive.nodo('solicitud.jpg', null, 'jpg');
  E.archivar(nueva, 88, 'HOLOGRAMA');
  assert.equal(drive.ruta(nueva), 'NUCOS VEHICULOS/88/1.-DOCUMENTACIÓN/7.-HOLOGRAMAS/HOLOGRAMA-0088.jpg');
  assert.equal(drive.ruta(vieja), 'NUCOS VEHICULOS/88/1.-DOCUMENTACIÓN/7.-HOLOGRAMAS/HOLOGRAMAS ANTERIORES/HOLOGRAMA-0088.pdf');
  // La ficha (listar) la muestra como su propia sección, ya no en "otros"
  const exp = E.listar(88);
  const hol = exp.documentos.find((d) => d.clave === 'HOLOGRAMA');
  assert.equal(hol.titulo, 'Hologramas');
  assert.equal(hol.vigentes.map((a) => a.nombre).join(), 'HOLOGRAMA-0088.jpg');
  assert.equal(exp.otros.length, 0);
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
  assert.equal(exp.documentos.length, 7)   // con 7.-HOLOGRAMAS; lo de OXXO GAS en ANTERIORES sigue en otros hasta que se mueva;
  assert.deepEqual([...exp.otros.map((g) => g.grupo)], ['ANTERIORES / OXXO GAS']);
  assert.equal(JSON.stringify(E.listar(999)), JSON.stringify({ existe: false, documentos: [], otros: [], carpetas: [] }));
  assert.equal(drive.hijos(nucos).length, 1);                        // no creó el 999
});

test('inspecciones: cada carpeta año/periodo es una inspección, con sus secciones, fotos y PDF (sin _POR REVISAR)', () => {
  const drive = driveFalso();
  const { E, nucos } = cargar(drive);
  const n24 = drive.nodo('24', nucos, CARPETA);
  const raiz = drive.nodo('4.-INSPECCIONES', n24, CARPETA);
  const t3 = drive.nodo('3ER TRIMESTRE', drive.nodo('2026', raiz, CARPETA), CARPETA);
  drive.nodo('INSPECCION-0024 2026-07-09.pdf', t3, 'pdf');
  const neu = drive.nodo('NEUMATICOS', t3, CARPETA);
  drive.nodo('a.jpg', neu, 'jpg'); drive.nodo('b.jpg', neu, 'jpg');
  drive.nodo('c.jpg', drive.nodo('CRISTALERIA', t3, CARPETA), 'jpg');
  const baja = drive.nodo('POR BAJA 2025-06-23', drive.nodo('2025', raiz, CARPETA), CARPETA);
  drive.nodo('d.jpg', drive.nodo('INTERIORES', baja, CARPETA), 'jpg');
  drive.nodo('x.jpg', drive.nodo('_POR REVISAR', raiz, CARPETA), 'jpg');
  drive.nodo('vacia', drive.nodo('4TO BIMESTRE', drive.nodo('2024', raiz, CARPETA), CARPETA), CARPETA);
  const lista = JSON.parse(JSON.stringify(E.inspecciones('0024')));
  assert.deepEqual(lista.map((x) => [x.anio, x.nombre, x.fecha, x.fotos]),
    [['2026', '3ER TRIMESTRE', '2026-07-09', 3], ['2025', 'POR BAJA 2025-06-23', '2025-06-23', 1], ['2024', '4TO BIMESTRE', '', 0]]);
  assert.deepEqual(lista[0].secciones.map((s) => s.nombre + ':' + s.fotos).sort(), ['CRISTALERIA:1', 'NEUMATICOS:2']);   // solo cuántas
  assert.equal(lista[0].pdfs[0].nombre, 'INSPECCION-0024 2026-07-09.pdf');
  assert.equal(JSON.stringify(E.inspecciones(999)), '[]');
  // Las fotos, con su miniatura, solo al pedir UNA inspección, y solo si es de ese NUCO
  const fotos = JSON.parse(JSON.stringify(E.fotosInspeccion('0024', t3.id)));
  assert.deepEqual(fotos.secciones.map((s) => s.nombre + ':' + s.fotos.length).sort(), ['CRISTALERIA:1', 'NEUMATICOS:2']);
  assert.equal(fotos.secciones[0].fotos[0].miniatura.slice(0, 5), 'mini:');
  assert.throws(() => E.fotosInspeccion('0024', raiz.id), /no es de este vehículo/);
});

test('listar: la imagen de relleno (NO APLICA / SIN INFORMACIÓN) no cuenta como documento; la sección lo dice', () => {
  const drive = driveFalso();
  const { E, nucos } = cargar(drive);
  E.archivar(drive.nodo('f.pdf', null, 'pdf'), 5, 'FACTURA');
  const doc = drive.hijos(drive.hijos(nucos).find((h) => h.nombre === '5')).find((h) => h.nombre === '1.-DOCUMENTACIÓN');
  const sub = (n) => drive.hijos(doc).find((h) => h.nombre === n);
  drive.nodo('SEGURO-0005 NO APLICA.jpg', sub('2.-SEGURO'), 'jpg');
  drive.nodo('CARPETA SIN INFORMACIÓN.jpg', sub('6.-TENENCIA'), 'jpg');
  const exp = JSON.parse(JSON.stringify(E.listar(5)));
  const de = (k) => exp.documentos.find((d) => d.clave === k);
  assert.equal(de('SEGURO').vigentes.length, 0);
  assert.equal(de('SEGURO').relleno, 'NO APLICA');
  assert.equal(de('TENENCIA').relleno, 'SIN INFORMACIÓN');
  assert.equal(de('FACTURA').vigentes.length, 1);
  assert.equal(de('FACTURA').relleno, null);
});

test('listar guarda su copia y archivar la borra (la siguiente lectura va a Drive)', () => {
  const drive = driveFalso();
  const op = {};
  const { E } = cargar(drive, op);
  E.archivar(drive.nodo('a.pdf', null, 'pdf'), 7, 'SEGURO');
  assert.equal(JSON.parse(JSON.stringify(E.listar(7))).documentos.find((d) => d.clave === 'SEGURO').vigentes.length, 1);
  assert.ok(op.cache['exp_docs_v1_7'], 'quedó la copia');
  E.archivar(drive.nodo('b.pdf', null, 'pdf'), 7, 'TENENCIA');
  assert.equal(op.cache['exp_docs_v1_7'], undefined, 'archivar la borró');
  assert.equal(JSON.parse(JSON.stringify(E.listar(7))).documentos.find((d) => d.clave === 'TENENCIA').vigentes.length, 1);
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

// ---- Lo que llega de los módulos (12-oct-2026, "Vehículos: todo por NUCO") ----
const blob = (nombre) => { const b = { nombre }; b.getName = () => b.nombre; b.setName = (v) => { b.nombre = v; return b; }; return b; };

test('periodos: inspección por trimestre desde 2026 y por bimestre antes; verificación por semestre', () => {
  const { E } = cargar(driveFalso());
  assert.equal(E.periodoInspeccion(new Date('2026-10-12T12:00:00Z')), '4TO TRIMESTRE');
  assert.equal(E.periodoInspeccion(new Date('2026-03-31T12:00:00Z')), '1ER TRIMESTRE');
  assert.equal(E.periodoInspeccion(new Date('2025-05-20T12:00:00Z')), '3ER BIMESTRE');
  assert.equal(E.periodoInspeccion(new Date('2025-12-01T12:00:00Z')), '6TO BIMESTRE');
  assert.equal(E.semestreVerificacion(new Date('2026-06-30T12:00:00Z')), '1ER SEMESTRE');
  assert.equal(E.semestreVerificacion(new Date('2026-07-01T12:00:00Z')), '2DO SEMESTRE');
});

test('guardar: la inspección y la verificación van a su año y periodo, con nombre por fecha y sin pisar otra', () => {
  const drive = driveFalso();
  const { E } = cargar(drive);
  const f = new Date('2026-10-12T12:00:00Z');
  const pdf = E.guardar(blob('x.pdf'), E.carpetaInspeccion('0024', f), 'INSPECCION', '0024', f, '.pdf');
  assert.equal(drive.ruta(pdf), 'NUCOS VEHICULOS/24/4.-INSPECCIONES/2026/4TO TRIMESTRE/INSPECCION-0024 2026-10-12.pdf');
  const otro = E.guardar(blob('y.pdf'), E.carpetaInspeccion(24, f), 'INSPECCION', 24, f, '.pdf');
  assert.equal(otro.getName(), 'INSPECCION-0024 2026-10-12 (2).pdf', 'la misma fecha no pisa la anterior');
  const firma = E.guardar(blob('f.png'), E.subcarpeta(E.carpetaInspeccion(24, f), E.FIRMAS_Y_DIAGRAMAS), 'FIRMA INSPECTOR', 24, f, '.png');
  assert.equal(drive.ruta(firma), 'NUCOS VEHICULOS/24/4.-INSPECCIONES/2026/4TO TRIMESTRE/FIRMAS Y DIAGRAMAS/FIRMA INSPECTOR-0024 2026-10-12.png');
  const ver = E.guardar(blob('c.jpg'), E.carpetaVerificacion(88, new Date('2026-04-27T12:00:00Z')), 'VERIFICACION', 88, new Date('2026-04-27T12:00:00Z'), '.jpg');
  assert.equal(drive.ruta(ver), 'NUCOS VEHICULOS/88/3.-VERIFICACIONES/2026/1ER SEMESTRE/VERIFICACION-0088 2026-04-27.jpg');
});

test('guardar usa la carpeta de periodo que ya existe aunque varíe el espacio, y la responsiva del sensor va a 5.-RESPONSIVA/SENSORES', () => {
  const drive = driveFalso();
  const { E, nucos } = cargar(drive);
  const n = drive.nodo('7', nucos, CARPETA);
  const anio = drive.nodo('2026', drive.nodo('4.- INSPECCIONES', n, CARPETA), CARPETA);
  const tri = drive.nodo('4TO  TRIMESTRE', anio, CARPETA);
  const f = new Date('2026-11-02T12:00:00Z');
  const pdf = E.guardar(blob('x.pdf'), E.carpetaInspeccion(7, f), 'INSPECCION', 7, f, '.pdf');
  assert.equal(drive.porId[pdf.padre], tri, 'no se crea otra carpeta al lado');
  const sen = E.guardar(blob('r.pdf'), E.carpeta(7, 'RESPONSIVA', [E.SENSORES]), 'RESPONSIVA SENSOR', 7, f, '.pdf');
  assert.equal(drive.ruta(sen), 'NUCOS VEHICULOS/7/1.-DOCUMENTACIÓN/5.-RESPONSIVA/SENSORES/RESPONSIVA SENSOR-0007 2026-11-02.pdf');
});

test('guardar borra la copia de la lectura del NUCO', () => {
  const op = { cache: {} };
  const drive = driveFalso();
  const { E } = cargar(drive, op);
  op.cache['exp_insp_v1_24'] = '[]';
  E.guardar(blob('x.pdf'), E.carpetaInspeccion(24, new Date('2026-10-12T12:00:00Z')), 'INSPECCION', 24, new Date('2026-10-12T12:00:00Z'), '.pdf');
  assert.equal(op.cache['exp_insp_v1_24'], undefined);
});

test('el documento de baja va a 3.-ALTA DE PLACAS/BAJAS y no toca el alta vigente', () => {
  const drive = driveFalso();
  const { E } = cargar(drive);
  const alta = drive.nodo('a.pdf', null, 'pdf');
  E.archivar(alta, 5, 'ALTA');
  const baja = drive.nodo('VEH-1.DOCUMENTO BAJA.pdf', null, 'pdf');
  E.archivar(baja, 5, 'ALTA', { subcarpeta: 'BAJAS', prefijo: 'BAJA' });
  assert.equal(drive.ruta(alta), 'NUCOS VEHICULOS/5/1.-DOCUMENTACIÓN/3.-ALTA DE PLACAS/ALTA DE PLACAS-0005.pdf');
  assert.equal(drive.ruta(baja), 'NUCOS VEHICULOS/5/1.-DOCUMENTACIÓN/3.-ALTA DE PLACAS/BAJAS/BAJA-0005.pdf');
});

test('tieneNuco: sin número no hay expediente (quien guarda usa su carpeta de antes)', () => {
  const { E } = cargar(driveFalso());
  assert.equal(E.tieneNuco('0024'), true);
  assert.equal(E.tieneNuco(''), false);
  assert.equal(E.tieneNuco('S/N'), false);
});

test('numerador: lee los nombres de la carpeta UNA vez y numera en memoria, sin repetir (fotos de una sección, 23-oct)', () => {
  const drive = driveFalso();
  const listados = [];
  const { E } = cargar(drive, { alListar: (p) => listados.push(p.q) });
  const seccion = drive.nodo('NEUMATICOS', null, CARPETA);
  drive.nodo('NEUMATICOS-0088 2026-10-08.jpg', seccion, 'jpg');
  drive.nodo('NEUMATICOS-0088 2026-10-08 (2).jpg', seccion, 'jpg');
  drive.nodo('OTRA COSA.jpg', seccion, 'jpg');
  const siguiente = E.numerador(seccion, 'NEUMATICOS', '0088', new Date('2026-10-08T12:00:00Z'));
  const nombres = [siguiente('.jpg'), siguiente('.jpg'), siguiente('.png'), siguiente('.jpg')];
  assert.deepEqual(nombres, ['NEUMATICOS-0088 2026-10-08 (3).jpg', 'NEUMATICOS-0088 2026-10-08 (4).jpg',
    'NEUMATICOS-0088 2026-10-08.png', 'NEUMATICOS-0088 2026-10-08 (5).jpg']);
  assert.equal(listados.length, 1, 'una sola lectura de la carpeta, no una búsqueda por nombre');
  assert.equal(drive.hijos(seccion).length, 3, 'numerar no crea nada');
});

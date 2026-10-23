// La línea sin equipo (pendiente 2.45, usuario 15-oct): solo responsiva, sin datos del equipo («NO APLICA») y en la carpeta
// de su línea en LINEAS (no en NUCOS), que se reconoce por su ID aunque el número cambie o se recicle.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const LINEAS = require('./lineas-fuente');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** Drive en memoria: carpetas con nombre, padre, propiedades y papelera. */
function driveFalso() {
  const carpetas = { LINEAS: { id: 'LINEAS', name: 'LINEAS', padre: null, props: {}, trashed: false } };
  let n = 0;
  const hijos = (padre) => Object.values(carpetas).filter((c) => c.padre === padre && !c.trashed);
  const iter = (lista) => { let i = 0; return { hasNext: () => i < lista.length, next: () => lista[i++] }; };
  const nueva = (nombre, padre, props) => {
    const id = 'C' + (++n);
    carpetas[id] = { id, name: nombre, padre, props: props || {}, trashed: false };
    return id;
  };
  const envolver = (c) => ({
    getId: () => c.id, getName: () => c.name, setName: (x) => { c.name = x; }, isTrashed: () => c.trashed,
    setTrashed: (v) => { c.trashed = v; },
    getFoldersByName: (x) => iter(hijos(c.id).filter((h) => h.name === x).map(envolver)),
    getFolders: () => iter(hijos(c.id).map(envolver)),
    createFolder: (x) => envolver(carpetas[nueva(x, c.id)]),
    getParents: () => iter(c.padre ? [envolver(carpetas[c.padre])] : []),
    searchFiles: () => iter([]), searchFolders: () => iter(hijos(c.id)),
  });
  return {
    carpetas, nueva,
    DriveApp: { getFolderById: (id) => { if (!carpetas[id]) throw new Error('no existe ' + id); return envolver(carpetas[id]); } },
    Drive: {
      Files: {
        create: (r) => ({ id: nueva(r.name, r.parents[0], r.properties) }),
        list: (p) => {
          const padre = p.q.match(/'([^']+)' in parents/)[1];
          return { files: hijos(padre).map((c) => ({ id: c.id, name: c.name, properties: c.props })) };
        },
      },
    },
  };
}

function archivos(drive) {
  const cache = {};
  const ctx = vm.createContext({
    console,
    leerConfig_: (k) => (k === 'LINEAS_DRIVE_LINEAS' ? 'LINEAS' : ''),
    Config: { ENTORNO: 'PROD' },
    DriveApp: drive.DriveApp, Drive: drive.Drive,
    DriveUtils: require('./drive-utils-real')(),   // subcarpeta: la regla real (fase 5.7)
    Utilities: { formatDate: (f, z, formato) => (formato === 'yyyy' ? '2026' : '15 10') },
    LineasDatos: { cacheLeer: (k) => cache[k] || null, cacheGuardar: (k, v) => { cache[k] = v; }, cacheBorrar: (k) => { delete cache[k]; } },
    LineasUtil: { digitos: (v) => String(v || '').replace(/\D/g, '') },
  });
  vm.runInContext(read('src/services/lineas/LineasArchivos.gs') + '\nthis.A = LineasArchivos;', ctx);
  return ctx.A;
}

test('carpeta de la línea: se crea con su primera responsiva, con el número y su ID guardado en Drive', () => {
  const d = driveFalso();
  const A = archivos(d);
  const c = A.carpetaEvidenciaLinea('LIN-1', '442 123 4567', new Date('2026-10-15T12:00:00'));
  assert.equal(c.ruta, 'LINEAS/4421234567/CARTA RESPONSIVA/2026/RESP 15 10');
  assert.equal(c.nombrePdf, 'RESP 4421234567 15 10.pdf');
  const linea = Object.values(d.carpetas).filter((x) => x.padre === 'LINEAS');
  assert.equal(linea.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(linea[0].props)), { idLinea: 'LIN-1' });
  // La segunda del mismo día va a la misma carpeta de la línea, en «RESP 15 10 (2)»
  assert.equal(A.carpetaEvidenciaLinea('LIN-1', '4421234567', new Date()).ruta, 'LINEAS/4421234567/CARTA RESPONSIVA/2026/RESP 15 10 (2)');
  assert.equal(Object.values(d.carpetas).filter((x) => x.padre === 'LINEAS').length, 1);
  assert.equal(A.carpetaLineaId('LIN-1'), linea[0].id);
  assert.equal(A.carpetaLineaId('LIN-OTRA'), null);
});

test('carpeta de la línea: un número reciclado tiene la suya y un cambio de número la renombra', () => {
  const d = driveFalso();
  const A = archivos(d);
  A.carpetaEvidenciaLinea('LIN-VIEJA', '4421234567', new Date());
  // Otra línea con el mismo número (la compañía lo recicló): carpeta aparte
  assert.equal(A.carpetaEvidenciaLinea('LIN-NUEVA', '4421234567', new Date()).ruta.split('/')[1], '4421234567 (2)');
  // La vieja cambió de número: al usarla toma el de hoy
  assert.equal(A.carpetaEvidenciaLinea('LIN-VIEJA', '4429999999', new Date()).ruta.split('/')[1], '4429999999');
  assert.equal(Object.values(d.carpetas).filter((x) => x.padre === 'LINEAS').length, 2);
});

test('carpeta de la línea: sin número no hay responsiva; en producción sin LINEAS configurada, tampoco', () => {
  const d = driveFalso();
  assert.throws(() => archivos(d).carpetaEvidenciaLinea('LIN-1', '', new Date()), /La línea no tiene número: captúralo con Corregir\./);
  const ctx = vm.createContext({ leerConfig_: () => '', Config: { ENTORNO: 'PROD' } });
  vm.runInContext(read('src/services/lineas/LineasArchivos.gs') + '\nthis.A = LineasArchivos;', ctx);
  assert.throws(() => ctx.A.carpetaLineasId(), /Falta la carpeta LINEAS en Drive/);
  assert.equal(ctx.A.enLineas('X'), false);
});

test('responsiva que no se guarda: su carpeta y la de la línea, si quedó vacía, a la papelera; nunca LINEAS', () => {
  const d = driveFalso();
  const A = archivos(d);
  const c = A.carpetaEvidenciaLinea('LIN-1', '4421234567', new Date());
  A.descartarCarpeta(c.carpetaId);
  assert.deepEqual(Object.values(d.carpetas).filter((x) => !x.trashed).map((x) => x.name), ['LINEAS']);
});

function captura(registro) {
  const ctx = vm.createContext({
    console,
    Utilities: { formatDate: () => '2026-10-15T12:00' },
    LineasRegistros: { camposAdicionales: () => [] },
    LineasRepo: {
      CATALOGO: { accesorios: ['CUBO'] }, TAB: { INSP: 'INSP', RESP: 'RESP' }, catalogos: () => ({}),
      leerRegistroObligatorio: () => registro.fila, convertirRegistro: () => registro.reg,
    },
    LineasDatos: { nuevoId: () => 'RES-1' },
    LineasFirmas: { tiene: () => false },
    LineasChecklist: { CONDICIONES: [] },
    LineasAcciones: { exigirEstatusParaResponsiva: () => '' },
    LineasDG: { esFila: () => false, esRegistro: () => false, exigirAdmin: () => {} },
    LineasUtil: {
      col: (f, c) => (c in f ? f[c] : null), digitos: (v) => String(v || '').replace(/\D/g, ''),
      nucoVisible: (v) => (v ? String(v) : null), sinCargador: (v) => v,
    },
  });
  vm.runInContext(read('src/services/lineas/LineasCaptura.gs') + '\nthis.C = LineasCaptura;', ctx);
  return ctx.C;
}

const SUELTA = {
  fila: { ID: 'LIN-1', NUCO: '1217', 'NUMERO TELEFONO': '4421234567', 'NUMERO SIM': '8952', COMPAÑIA: 'TELCEL', 'RAZON SOCIAL': 'CM', COLOR: 'NEGRO' },
  reg: { id: 'LIN-1', nuco: '1217', equipo: null, linea: { numero: '4421234567' } },
};

test('responsiva de la línea sin equipo: su línea fija, sin equipo ni accesorios y accesos', () => {
  const C = captura(SUELTA);
  const ctx = JSON.parse(JSON.stringify(C.contextoResponsiva({ lineaId: 'LIN-1' }, { nombre: 'CI' }, true)));
  const titulos = ctx.formulario.filter((e) => e.tipo === 'titulo').map((e) => e.texto);
  assert.equal(titulos[0], 'LÍNEA');
  assert.ok(!titulos.includes('EQUIPO') && !titulos.includes('ACCESORIOS Y ACCESOS'), titulos.join(', '));
  const campos = Object.fromEntries(ctx.formulario.filter((e) => e.tipo === 'campo').map((e) => [e.columna, e]));
  ['NUCO', 'MODELO', 'IMEI', 'COLOR', 'ACCESORIOS', 'PIN WHATSAPP', 'PIN EQUIPO', 'CONTRASEÑA'].forEach((c) => assert.ok(!(c in campos), c));
  ['No TELEFONO', 'SIM', 'COMPAÑIA', 'RAZON SOCIAL'].forEach((c) => assert.equal(campos[c].soloLectura, true, c));
  assert.equal(campos['No TELEFONO'].valor, '4421234567');
  // El equipo, como siempre
  const conEquipo = C._formularioResponsiva(SUELTA.fila, {}, { nombre: 'CI' }, 'RES-1', new Date(), '', null, false);
  assert.ok(conEquipo.some((e) => e.tipo === 'titulo' && e.texto === 'EQUIPO'));
  assert.ok(conEquipo.some((e) => e.columna === 'COLOR' && e.requerido === 'SIEMPRE'));
});

test('la línea sin equipo no lleva inspección y sin número no abre la responsiva', () => {
  assert.throws(() => captura(SUELTA).contextoInspeccion({ lineaId: 'LIN-1' }, { nombre: 'CI' }, true), /La línea sin equipo no lleva inspección: solo responsiva\./);
  const sinNumero = { fila: Object.assign({}, SUELTA.fila, { 'NUMERO TELEFONO': '' }), reg: SUELTA.reg };
  assert.throws(() => captura(sinNumero).contextoResponsiva({ lineaId: 'LIN-1' }, { nombre: 'CI' }, true), /La línea no tiene número/);
});

test('al guardar: «NO APLICA» en lo del equipo, NUCO vacío, nada al inventario y el PDF dice «NO APLICA» en el NUCO', () => {
  const cap = read('src/services/lineas/LineasCaptura.gs');
  assert.match(cap, /const SIN_EQUIPO = \{ 'NUCO': '', 'MODELO': 'NO APLICA', 'IMEI': 'NO APLICA', 'COLOR': 'NO APLICA', 'ACCESORIOS': 'NO APLICA',\s*'PIN WHATSAPP': 'NO APLICA', 'PIN EQUIPO': 'NO APLICA', 'CONTRASEÑA': '' \};/);
  assert.match(cap, /if \(sinEquipo\) Object\.assign\(valores, SIN_EQUIPO\);/);
  assert.match(cap, /if \(responsivaSinEquipo_\(fila\)\) registro\._fijas = \{ 'NUCO': 'NO APLICA' \};/);
  // La carpeta de la línea antes de guardar, y el PDF a ella (destinoPdf_)
  assert.match(cap, /LineasArchivos\.carpetaEvidenciaLinea\(objetivo\.reg\.id, numeroParaResponsiva_\(objetivo\), fecha\)/);
  assert.match(cap, /if \(ev\.carpetaId && LineasArchivos\.enLineas\(ev\.carpetaId\)\) \{/);
  // El PDF: una columna con valor fijo sale tal cual aunque la etiqueta sea una fórmula
  const pdf = read('src/services/lineas/LineasPdf.gs');
  assert.match(pdf, /valor = fija \? String\(fijas\[fija\]\) : aTexto_\(/);
});

test('la pantalla: la línea solo ofrece la Responsiva y su carpeta en Drive', () => {
  const html = LINEAS;
  // Responsiva primero e Inspección después, solo en el equipo (usuario, 16-oct; pendiente 2.50)
  assert.match(html, /return \(!conCaptura \? '' :\s*'<button type="button" class="ln-btn-icono" data-ln-captura="RESPONSIVA"[^\n]*\n\s*\(tipo === 'linea' \? '' :\s*'<button type="button" class="ln-btn-icono" data-ln-captura="INSPECCION"[^\n]*' Inspección<\/button>'\)\)/);
  assert.match(html, /estatusLinea: l\.estatus \|\| '', carpetaDriveId: l\.carpetaDriveId \|\| null \};/);
  // El ⋮ de la línea la ofrece (la prueba en /dev del 15-oct no la encontró: el menú de la línea no la llevaba)
  assert.match(html, /abrirCancelacion\(\[r\]\) \} : null\]\s*\.concat\(drive, editar, vinculo, historial\);/);
  assert.match(html, /RESPONSIVA_LINEA: \[/);
  const tel = read('src/services/TelefoniaService.gs');
  assert.match(tel, /if \(!r\.equipo\) r\.linea\.carpetaDriveId = LineasArchivos\.carpetaLineaId\(r\.linea\._id\);/);
  assert.match(tel, /if \(tipo === 'INSPECCION' && !obj\.equipo\) throw new Error\('La línea sin equipo no lleva inspección: solo responsiva\.'\);/);
  assert.match(read('src/Diagnostico.gs'), /LINEAS_DRIVE_LINEAS: \{\},/);
});

test('la ficha de la línea ve las responsivas que firmó dentro de un equipo (ID LINEA ENTREGADA)', () => {
  const cap = read('src/services/lineas/LineasCaptura.gs');
  // Cada responsiva guarda la línea de ese día, sin cambiar ID LINEA (el registro)
  assert.match(cap, /'ID': id, 'ID LINEA': obj\.reg\.id,/);
  assert.match(cap, /\[LineasRepo\.COL_LINEA_ENTREGADA\]: obj\.linea \? obj\.linea\.idLinea \|\| obj\.reg\.id : '',/);
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /const COL_LINEA_ENTREGADA = 'ID LINEA ENTREGADA';/);
  // Solo las de otro registro (las de la línea suelta ya salen por ID LINEA) y marcadas enEquipo
  assert.match(repo, /\.filter\(\(f\) => ids\.indexOf\(idActual\(col\(f, 'ID LINEA'\)\)\) < 0\);/);
  assert.match(repo, /Object\.assign\(responsivaDesdeFila\(f, evPorRegistro\[txt\(f\['ID'\]\)\]\), \{ enEquipo: true \}\)/);
  const tel = read('src/services/TelefoniaService.gs');
  assert.match(tel, /function evidencias\(token, id, vista\) \{/);
  assert.match(tel, /base = r\.linea\.idLinea \|\| id;/);
  assert.match(tel, /LineasRepo\.responsivasEntregadas\(base\)\.forEach\(\(d\) => \{ if \(!vistas\[d\._id\]\) ev\.responsivas\.push\(d\); \}\);/);
  assert.match(tel, /if \(!enEquipo\) nucos = evidenciasNucos_\(id, sesion\);/);
  assert.match(tel, /enNuco: d\.enEquipo \? \(d\.nuco \|\| '—'\) : null, registroId: d\.enEquipo \? d\.registroId \|\| null : null,/);
  const html = LINEAS;
  // Toda línea tiene Documentos, y la columna Equipo dice en qué NUCO la firmó
  assert.match(html, /'<\/div>', true\);\s*ponerCopiarTarjetas\(detalle\);\s*\/\/[^\n]*\n\s*if \(l\._dgOculto\) return;\n\s*cargarEvidencias\(id\);/);
  assert.match(html, /const vista = arriba && arriba\.tipo === 'linea' && arriba\.id === id \? 'linea' : '';/);
  assert.match(html, /vista === 'linea' \? \{ campo: 'enNuco', titulo: 'Equipo'/);
});

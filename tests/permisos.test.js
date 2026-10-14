/**
 * Pruebas de la resolución de permisos (PermisosService.gs + PermisosSemilla.gs).
 * No tocan Sheets: se le pasan el usuario y las reglas ya leídos. Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contexto = vm.createContext({
  // Apps Script: solo se usan dentro de funciones que estas pruebas no llaman
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  SheetUtils: {},
  Auth: {},
  Config: { SPREADSHEET_IDS: { USUARIOS: () => 'x' } },
});
const leer = (p) => fs.readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');
vm.runInContext(leer('config/Modulos.gs') + '\n' + leer('config/PermisosSemilla.gs') + '\n' +
  leer('services/PermisosService.gs') +
  '\nthis.Permisos = Permisos; this.Modulos = Modulos; this.PERMISOS_SEMILLA = PERMISOS_SEMILLA;', contexto);
const { Permisos, Modulos, PERMISOS_SEMILLA } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const usuario = (extra) => Object.assign({
  CORREO: 'alguien@ciudadmaderas.com', ROL: 'USER', ACTIVO: 'TRUE', AREA: '',
}, extra);
const REGLAS = [
  ['CONTROL VEHICULAR', 'vehiculos', 'EDICION'],
  ['CONTROL VEHICULAR', 'verificaciones', 'EDICION'],
  ['CONTROL VEHICULAR', 'hologramas', 'LECTURA'],
  ['AUDITORIAS', 'vehiculos', 'LECTURA'],
  ['AUDITORIAS', 'hologramas', 'LECTURA'],
  ['AUDITORIAS', 'Hologramas', 'EDICION'],
  ['LINEAS', 'accesorios-lineas', 'EDICION'],
  ['especial@ciudadmaderas.com', 'vehiculos', 'NINGUNO'],
  ['especial@ciudadmaderas.com', 'caja-chica', 'LECTURA'],
  ['', 'uber', 'EDICION'],
  ['CONTROL VEHICULAR', 'modulo-inventado', 'EDICION'],
  ['CONTROL VEHICULAR', 'uber', 'TODO'],
];
const resolver = (u, reglas) => Permisos.resolver_(u, reglas === undefined ? REGLAS : reglas, Modulos.ids());

console.log('1. Por área');
let p = resolver(usuario({ AREA: 'CONTROL VEHICULAR' }));
ok(p.vehiculos === 'EDICION' && p.hologramas === 'LECTURA', 'el área da sus permisos, cada uno con su nivel');
ok(p['accesorios-lineas'] === undefined, 'lo que el área no menciona, no se puede ni ver');
ok(p.uber === undefined, 'un permiso mal escrito ("TODO") se ignora');
p = resolver(usuario({ AREA: '  control   VEHICULAR ' }));
ok(p.vehiculos === 'EDICION', 'el área tolera mayúsculas y espacios');
ok(resolver(usuario({ AREA: 'Líneas' }))['accesorios-lineas'] === 'EDICION', 'y acentos');
ok(resolver(usuario({ AREA: 'AUDITORIAS' })).hologramas === 'EDICION', 'si un módulo se repite, gana el nivel más alto');
ok(Object.keys(resolver(usuario({ AREA: '' }))).length === 0, 'sin área (y sin reglas de su correo), nada');
ok(Object.keys(resolver(usuario({ AREA: 'POST VENTA' }))).length === 0, 'un área sin reglas, nada');

console.log('2. Por correo');
p = resolver(usuario({ CORREO: ' Especial@CiudadMaderas.com ', AREA: 'CONTROL VEHICULAR' }));
ok(p.vehiculos === undefined, 'NINGUNO en su correo le quita lo que le daba su área');
ok(p['caja-chica'] === 'LECTURA', 'y su correo le da lo que su área no tiene');
ok(p.verificaciones === 'EDICION', 'lo que su correo no menciona se queda como lo dice su área');
p = resolver(usuario({ CORREO: 'especial@ciudadmaderas.com', AREA: 'AUDITORIAS' }));
ok(p.vehiculos === undefined, 'el correo reemplaza también un permiso más alto o más bajo');

console.log('3. Inactivos y desconocidos');
ok(Object.keys(resolver(usuario({ AREA: 'CONTROL VEHICULAR', ACTIVO: 'FALSE' }))).length === 0,
  'un usuario inactivo no tiene ningún permiso');
ok(Object.keys(resolver(null)).length === 0, 'un correo que no está en la hoja tampoco');

console.log('4. Roles');
p = resolver(usuario({ ROL: 'ADMIN', AREA: 'AUDITORIAS' }));
ok(Object.keys(p).length === Modulos.ids().length, 'ADMIN tiene TODOS los módulos del catálogo');
ok(p.vehiculos === 'EDICION' && p.usuarios === 'EDICION', 'y en todos con edición, aunque su área dijera lectura');
p = resolver(usuario({ ROL: 'ADMIN', CORREO: 'especial@ciudadmaderas.com' }));
ok(p.vehiculos === 'EDICION', 'a un ADMIN no se le quita nada desde la hoja: es admin y punto');
p = resolver(usuario({ ROL: 'SUPER' }));
ok(p.usuarios === undefined && p['usuarios.exportar'] === undefined &&
  Object.keys(p).length === Modulos.ids().filter((m) => Modulos.raiz(m) !== 'usuarios').length,
  'SUPER: todo con edición menos Usuarios y permisos y sus secciones (como en AppSheet)');
p = resolver(usuario({ ROL: 'VIEWER', AREA: 'CONTROL VEHICULAR' }));
ok(p.vehiculos === 'LECTURA' && p.hologramas === 'LECTURA', 'VIEWER: lo de su área, pero topado en lectura');

console.log('4b. Secciones: heredan de su módulo (catálogo en árbol, 14-oct)');
{
  const R = (reglas, extra) => Permisos.resolver_(usuario(Object.assign({ AREA: 'CI', CORREO: 'ana@ciudadmaderas.com' }, extra)), reglas, Modulos.ids());
  p = R([['CI', 'vehiculos', 'EDICION']]);
  ok(p['vehiculos.documentos'] === 'EDICION' && p['vehiculos.exportar'] === 'EDICION' && p['vehiculos.responsiva'] === 'EDICION',
    'sin regla, cada sección tiene lo de su módulo');
  p = R([['CI', 'vehiculos', 'EDICION'], ['CI', 'vehiculos.exportar', 'NINGUNO'], ['CI', 'vehiculos.documentos', 'LECTURA']]);
  ok(p['vehiculos.exportar'] === undefined && p['vehiculos.documentos'] === 'LECTURA' && p.vehiculos === 'EDICION',
    'una regla en la sección manda sobre la herencia (Sin acceso de un área corta la herencia)');
  p = R([['CI', 'vehiculos', 'LECTURA'], ['CI', 'vehiculos.documentos', 'EDICION']]);
  ok(p['vehiculos.documentos'] === 'LECTURA', 'una sección nunca pasa a su módulo');
  p = R([['CI', 'vehiculos.documentos', 'EDICION']]);
  ok(!p.vehiculos && !p['vehiculos.documentos'], 'sin el módulo, ninguna de sus secciones');
  p = R([['CI', 'vehiculos', 'EDICION'], ['ana@ciudadmaderas.com', 'vehiculos.exportar', 'NINGUNO']]);
  ok(p['vehiculos.exportar'] === undefined && p['vehiculos.documentos'] === 'EDICION', 'una excepción por correo en una sección');
  p = R([['CI', 'vehiculos', 'EDICION'], ['CI', 'vehiculos.exportar', 'NINGUNO'], ['ana@ciudadmaderas.com', 'vehiculos.exportar', 'LECTURA']]);
  ok(p['vehiculos.exportar'] === 'LECTURA', 'el correo manda sobre el área también en una sección');
  p = R([['CI', 'responsiva-vehicular', 'LECTURA'], ['CI', 'vehiculos', 'EDICION']]);
  ok(p['vehiculos.responsiva'] === 'LECTURA', 'el id viejo (responsiva-vehicular) sigue sirviendo: es la sección vehiculos.responsiva');
  p = R([['CI', 'vehiculos', 'EDICION']], { ROL: 'VIEWER' });
  ok(p['vehiculos.documentos'] === 'LECTURA', 'VIEWER: también las secciones, como mucho Ver');
  ok(Modulos.resolver('Vehículos › Documentos') === 'vehiculos.documentos' && Modulos.resolver('adherente-vehicular') === 'vehiculos.adherente',
    'en la hoja se acepta "Módulo › Sección" y el id viejo');
  ok(Modulos.ids().every((m) => !Modulos.padre(m) || Modulos.ids().indexOf(Modulos.padre(m)) < Modulos.ids().indexOf(m)),
    'en el catálogo cada módulo va antes que sus secciones (el resolvedor los recorre así)');
  ok(Modulos.ids().filter((m) => Modulos.padre(m)).every((m) => /\.[a-z-]+$/.test(m)) &&
    Modulos.todos().filter((m) => !m.soloEnlaces).every((m) => Modulos.ids().indexOf(m.id + '.exportar') !== -1),
    'cada módulo con lista tiene su sección exportar');
  // Sin acceso de un área: en una sección se guarda (corta la herencia); en un módulo es lo mismo que no tener regla
  const g = Permisos.aplicarCambios_([], [{ quien: 'CI', modulo: 'vehiculos.exportar', permiso: 'NINGUNO' }, { quien: 'CI', modulo: 'uber', permiso: 'NINGUNO' }], 'n');
  ok(g.length === 1 && g[0][1] === 'vehiculos.exportar' && g[0][2] === 'NINGUNO', 'Sin acceso de un área se guarda en una sección, no en un módulo');
  ok(Permisos.aplicarCambios_([], [{ quien: 'CI', modulo: 'Vehículos › Documentos', permiso: 'LECTURA' }], 'n')[0][1] === 'vehiculos.documentos',
    'se guarda siempre el id canónico');
}

console.log('5. La semilla (traducción de AppSheet)');
const semilla = (u) => Permisos.resolver_(u, PERMISOS_SEMILLA, Modulos.ids());
ok(PERMISOS_SEMILLA.every((r) => Modulos.existe(r[1])), 'todos sus módulos existen en el catálogo');
ok(PERMISOS_SEMILLA.every((r) => ['LECTURA', 'EDICION', 'NINGUNO'].indexOf(r[2]) !== -1), 'todos sus permisos son válidos');
ok(Object.keys(semilla(usuario({ AREA: 'POST VENTA' }))).length === 0, 'POST VENTA se quedó sin módulos (Post Venta se retiró)');

/**
 * Paridad con AppSheet: sus reglas, tal cual, contra lo que calcula la semilla. ADMIN y SUPER
 * no se comparan: aquí editan todo a propósito. Se comparan las áreas con usuarios genéricos
 * y cada correo con regla propia con su área real. Un genérico del área LINEAS sí difiere:
 * AppSheet le pedía estar en la lista de la tabla; aquí edita por ser del área (hoy las 3
 * personas de LINEAS están en esa lista).
 */
console.log('6. Paridad con AppSheet');
const CM = (s) => s + '@ciudadmaderas.com';
const EJE = CM('ejecutivogestionyadquisicionvehicular.ci');
const LISTAS = {
  // Visibilidad de vistas por lista de correos
  gestionActivos: ['especialista2datos.ci', 'gtedatosyprocesos.ci', 'especialistaservicios.ci', 'ecajachica.ci',
    'paulina.bustamante', 'maricela.rico', 'asistente.ci', 'asistentesubdi.ci', 'gerenteserv.ci', 'especialista.ci',
    'gestor.vehicular', 'analista5procesos.ci', 'ejecutivotelefonia.ci', 'auxiliar3procesos.ci'].map(CM),
  inspeccionesVer: ['especialista2datos.ci', 'auxiliar5datos.ci', 'gerenteserv.ci', 'especialistainspecciones.ci',
    'especialista.ci'].map(CM),
  detallesLineas: ['especialista2datos.ci', 'gtedatosyprocesos.ci', 'especialistaservicios.ci', 'paulina.bustamante',
    'maricela.rico', 'asistente.ci', 'asistentesubdi.ci', 'ejecutivotelefonia.ci', 'procesos.ci', 'auxiliar3procesos.ci'].map(CM),
  // Edición de tablas por lista de correos (la coma que faltaba, con su intención)
  inspeccionesEditar: ['especialista2datos.ci', 'gerenteserv.ci', 'especialistainspecciones.ci', 'especialista.ci'].map(CM),
  lineasEditar: ['especialista2datos.ci', 'gtedatosyprocesos.ci', 'ejecutivotelefonia.ci', 'paulina.bustamante',
    'maricela.rico', 'asistentesubdi.ci', 'especialistaservicios.ci', 'auxiliar3procesos.ci', 'procesos.ci',
    'gerenteserv.ci', 'auxiliar7datos.ci'].map(CM),
  accesoriosEditar: ['especialista2datos.ci', 'gtedatosyprocesos.ci', 'ejecutivotelefonia.ci', 'paulina.bustamante',
    'maricela.rico', 'asistentesubdi.ci', 'especialistaservicios.ci', 'auxiliar3procesos.ci'].map(CM),
  verificacionesEditar: ['especialista2datos.ci', 'gerenteserv.ci', 'especialista.ci', 'paulina.bustamante',
    'maricela.rico', 'asistente.ci', 'asistentesubdi.ci', EJE.replace('@ciudadmaderas.com', ''), 'gestor.vehicular'].map(CM),
};
const enAreas = (u, areas) => areas.indexOf(u.AREA) !== -1;
const VER = {
  incidencias: (u) => enAreas(u, ['ANALISIS DE DATOS', 'SERVICIOS VEHICULARES']),
  vehiculos: (u) => enAreas(u, ['ANALISIS DE DATOS', 'CI', 'SERVICIOS VEHICULARES', 'CONTROL VEHICULAR', 'AUDITORIAS']),
  // Nació después de AppSheet (14-oct-2026), separado de 'vehiculos' con las mismas áreas que ya lo veían
  'adquisicion-vehicular': (u) => enAreas(u, ['ANALISIS DE DATOS', 'CI', 'SERVICIOS VEHICULARES', 'CONTROL VEHICULAR', 'AUDITORIAS']),
  'cambios-vehiculos': (u) => enAreas(u, ['ANALISIS DE DATOS', 'SERVICIOS VEHICULARES', 'CI']),
  'reasignaciones-vehiculares': (u) => enAreas(u, ['ANALISIS DE DATOS', 'CI', 'SERVICIOS VEHICULARES', 'CONTROL VEHICULAR', 'AUDITORIAS']),
  verificaciones: (u) => enAreas(u, ['ANALISIS DE DATOS', 'CI', 'SERVICIOS VEHICULARES', 'CONTROL VEHICULAR']),
  'inspeccion-vehicular': (u) => LISTAS.inspeccionesVer.indexOf(u.CORREO) !== -1,
  'instalacion-sensores': (u) => enAreas(u, ['ANALISIS DE DATOS', 'CI']),
  hologramas: (u) => enAreas(u, ['ANALISIS DE DATOS', 'CI']),
  'lineas-telefonicas': (u) => enAreas(u, ['ANALISIS DE DATOS', 'LINEAS']) ||
    [CM('coordauditoriaycalidad.ci')].concat(LISTAS.detallesLineas).indexOf(u.CORREO) !== -1,
  'accesorios-lineas': (u) => enAreas(u, ['ANALISIS DE DATOS', 'LINEAS']),
  'cambios-lineas': (u) => enAreas(u, ['ANALISIS DE DATOS', 'LINEAS']),
  'gestion-activos': (u) => LISTAS.gestionActivos.indexOf(u.CORREO) !== -1,
  arqueos: (u) => u.CORREO !== EJE && enAreas(u, ['CI', 'ANALISIS DE DATOS']),
  'caja-chica': (u) => u.CORREO !== EJE && enAreas(u, ['CI', 'ANALISIS DE DATOS']),
  tickets: (u) => u.CORREO === EJE || enAreas(u, ['ANALISIS DE DATOS', 'CI']),
  uber: (u) => u.CORREO === EJE || enAreas(u, ['ANALISIS DE DATOS', 'CI']),
  relaciones: (u) => enAreas(u, ['ANALISIS DE DATOS', 'SERVICIOS VEHICULARES']),   // CONFIGURACIONES
  salud: (u) => enAreas(u, ['ANALISIS DE DATOS', 'SERVICIOS VEHICULARES']),
};
['panorama-lineas', 'resguardos-lineas', 'correcciones-lineas'].forEach((m) => { VER[m] = VER['lineas-telefonicas']; });
const EDITA = {   // si no está aquí, la tabla la editaba todo el que la veía
  'inspeccion-vehicular': (u) => LISTAS.inspeccionesEditar.indexOf(u.CORREO) !== -1,
  'lineas-telefonicas': (u) => LISTAS.lineasEditar.indexOf(u.CORREO) !== -1,
  'accesorios-lineas': (u) => LISTAS.accesoriosEditar.indexOf(u.CORREO) !== -1,
  verificaciones: (u) => LISTAS.verificacionesEditar.indexOf(u.CORREO) !== -1,
  'gestion-activos': () => false,   // solo se ve: lo que se edita ahí lo decide lineas-telefonicas
  'adquisicion-vehicular': () => false,   // solo lectura: el servicio no tiene puedeEditar
};
['panorama-lineas', 'resguardos-lineas', 'correcciones-lineas'].forEach((m) => { EDITA[m] = EDITA['lineas-telefonicas']; });
// Se aparta del AppSheet (usuario, 12-oct): Resguardos y cancelaciones solo lo edita Pau; el área de Líneas lo ve y
// manda a resguardo o a cancelación con el permiso de Líneas telefónicas
EDITA['resguardos-lineas'] = (u) => u.CORREO === CM('paulina.bustamante');
ok(semilla(usuario({ CORREO: CM('paulina.bustamante'), AREA: 'LINEAS' }))['resguardos-lineas'] === 'EDICION' &&
  semilla(usuario({ CORREO: CM('ejecutivotelefonia.ci'), AREA: 'LINEAS' }))['resguardos-lineas'] === 'LECTURA' &&
  semilla(usuario({ CORREO: CM('ejecutivotelefonia.ci'), AREA: 'LINEAS' }))['lineas-telefonicas'] === 'EDICION',
  'Resguardos y cancelaciones: Pau lo edita; el área de Líneas lo ve y sigue editando Líneas telefónicas');

function appsheet(u) {
  const mapa = {};
  Object.keys(VER).forEach((m) => {
    if (!VER[m](u)) return;
    const edita = (EDITA[m] ? EDITA[m](u) : true) && u.ROL !== 'VIEWER';
    mapa[m] = edita ? 'EDICION' : 'LECTURA';
  });
  return mapa;
}

const PRUEBA = [
  ...['ANALISIS DE DATOS', 'AUDITORIAS', 'CI', 'CONTROL VEHICULAR', 'POST VENTA', 'PROCESOS', 'SERVICIOS VEHICULARES', '']
    .map((area, i) => usuario({ CORREO: 'generico' + i + '@ciudadmaderas.com', AREA: area })),
  usuario({ CORREO: 'visor@ciudadmaderas.com', AREA: 'SERVICIOS VEHICULARES', ROL: 'VIEWER' }),
  usuario({ CORREO: CM('especialista.ci'), AREA: 'CI' }),
  usuario({ CORREO: CM('especialistainspecciones.ci'), AREA: 'CI' }),
  usuario({ CORREO: CM('ecajachica.ci'), AREA: 'CI' }),
  usuario({ CORREO: EJE, AREA: 'CI' }),
  usuario({ CORREO: CM('gestor.vehicular'), AREA: 'CONTROL VEHICULAR' }),
  usuario({ CORREO: CM('coordauditoriaycalidad.ci'), AREA: 'AUDITORIAS' }),
  usuario({ CORREO: CM('especialistaservicios.ci'), AREA: 'LINEAS' }),
  usuario({ CORREO: CM('ejecutivotelefonia.ci'), AREA: 'LINEAS' }),
  usuario({ CORREO: CM('auxiliar3procesos.ci'), AREA: 'LINEAS' }),
  usuario({ CORREO: CM('analista4datos.ci'), AREA: 'ANALISIS DE DATOS' }),
];
// AppSheet no tenía secciones: se comparan los módulos (y lo que AppSheet llamaba módulo y hoy es sección)
const comoAppSheet = (mapa, esperado) => {
  const llaves = Object.keys(esperado).map((m) => Modulos.resolver(m) || m);
  const r = {};
  Object.keys(mapa).forEach((m) => { if (!Modulos.padre(m) || llaves.indexOf(m) !== -1) r[m] = mapa[m]; });
  return r;
};
PRUEBA.forEach((u) => {
  const esperado = appsheet(u);
  const calculado = comoAppSheet(semilla(u), esperado);
  const modulos = Object.keys(Object.assign({}, esperado, calculado)).sort();
  const difs = modulos.filter((m) => esperado[m] !== calculado[m])
    .map((m) => m + ': AppSheet ' + (esperado[m] || '—') + ', app ' + (calculado[m] || '—'));
  ok(!difs.length, (u.AREA || '(sin área)') + ' · ' + u.CORREO + (u.ROL !== 'USER' ? ' · ' + u.ROL : '') +
    (difs.length ? '\n      ' + difs.join('\n      ') : ''));
});

console.log('7. Guardar desde la pantalla (aplicarCambios_)');
const base = [['CI', 'vehiculos', 'EDICION', 'AppSheet'], ['ci', 'hologramas', 'LECTURA', ''], ['x@ciudadmaderas.com', 'uber', 'EDICION', '']];
let r = Permisos.aplicarCambios_(base, [{ quien: 'CI', modulo: 'Hologramas', permiso: 'EDICION' }], 'nota');
ok(r.filter((f) => f[1] === 'hologramas').length === 1 && r.find((f) => f[1] === 'hologramas')[2] === 'EDICION',
  'cambiar un permiso reemplaza su renglón (aunque el área o el módulo estén escritos distinto)');
ok(r.find((f) => f[1] === 'hologramas')[3] === 'nota', 'y deja la nota de quién lo cambió');
ok(r.find((f) => f[1] === 'vehiculos')[3] === 'AppSheet', 'lo que no se tocó conserva su nota');
r = Permisos.aplicarCambios_(base, [{ quien: 'CI', modulo: 'vehiculos', permiso: 'NINGUNO' }], 'n');
ok(!r.some((f) => f[1] === 'vehiculos'), 'Sin acceso para un área borra el renglón (no deja basura)');
r = Permisos.aplicarCambios_(base, [{ quien: 'X@ciudadmaderas.com', modulo: 'uber', permiso: 'NINGUNO' }], 'n');
ok(r.some((f) => f[1] === 'uber' && f[2] === 'NINGUNO'), 'Sin acceso para una persona sí se guarda: le quita lo de su área');
r = Permisos.aplicarCambios_(base, [{ quien: 'x@ciudadmaderas.com', modulo: 'uber', permiso: null }], 'n');
ok(!r.some((f) => f[1] === 'uber'), 'quitar la excepción de una persona borra su renglón');
ok(base.length === 3 && base[0][2] === 'EDICION', 'no modifica las reglas que recibe');
p = Permisos.resolver_(usuario({ AREA: 'CI' }), Permisos.aplicarCambios_(base, [{ quien: 'CI', modulo: 'uber', permiso: 'LECTURA' }], 'n'), Modulos.ids());
ok(p.uber === 'LECTURA' && p.vehiculos === 'EDICION', 'lo guardado se resuelve igual que lo de la hoja');

console.log('7b. Historial: qué cambió de verdad (diferencias_)');
let d = Permisos.diferencias_(base, [{ quien: 'CI', modulo: 'Hologramas', permiso: 'EDICION' }]);
ok(d.length === 1 && d[0].modulo === 'hologramas' && d[0].antes === 'LECTURA' && d[0].despues === 'EDICION',
  'anota antes y después, con el id del módulo ' + JSON.stringify(d));
d = Permisos.diferencias_(base, [{ quien: 'CI', modulo: 'vehiculos', permiso: 'NINGUNO' }, { quien: 'CI', modulo: 'uber', permiso: 'LECTURA' }]);
ok(d.length === 2 && d[0].antes === 'EDICION' && d[0].despues === '' && d[1].antes === '' && d[1].despues === 'LECTURA',
  'quitarle a un área queda "" (sin regla); dar algo nuevo sale de ""');
d = Permisos.diferencias_(base, [{ quien: 'x@ciudadmaderas.com', modulo: 'uber', permiso: null }, { quien: 'x@ciudadmaderas.com', modulo: 'arqueos', permiso: 'NINGUNO' }]);
ok(d.length === 2 && d[0].antes === 'EDICION' && d[0].despues === '' && d[1].despues === 'NINGUNO',
  'en una persona: quitar la excepción queda "" (vuelve a su área) y Sin acceso se anota como NINGUNO');
d = Permisos.diferencias_(base, [{ quien: 'CI', modulo: 'vehiculos', permiso: 'EDICION' }, { quien: 'CI', modulo: 'arqueos', permiso: 'NINGUNO' }]);
ok(!d.length, 'lo que queda igual no se anota (ni Sin acceso a un área que ya no tenía nada)');

console.log('7c. Rol CLIENT: solo consulta, y solo sus departamentos (alcance_)');
p = resolver(usuario({ ROL: 'CLIENT', AREA: 'CONTROL VEHICULAR' }));
ok(p.vehiculos === 'LECTURA' && p.verificaciones === 'LECTURA', 'CLIENT: lo de su área, topado en lectura como VIEWER');
ok(Permisos.alcance_(usuario({ ROL: 'CLIENT', AREA: 'Post  Venta' }))[0] === 'POST VENTA',
  'sin DPTOS PERMITIDOS ve su AREA, normalizada (mayúsculas, un solo espacio)');
const varios = Permisos.alcance_(usuario({ ROL: 'CLIENT', AREA: 'POST VENTA', 'DPTOS PERMITIDOS': 'Construcción, OOAM TECNICO ,' }));
ok(JSON.stringify(varios) === JSON.stringify(['CONSTRUCCION', 'OOAM TECNICO']),
  'DPTOS PERMITIDOS gana sobre el AREA, separado por comas y sin acentos ' + JSON.stringify(varios));
ok(JSON.stringify(Permisos.alcance_(usuario({ ROL: 'CLIENT', AREA: '' }))) === '[]', 'un CLIENT sin área ni DPTOS PERMITIDOS no ve nada ([])');
ok(Permisos.alcance_(usuario({ ROL: 'USER', AREA: 'POST VENTA', 'DPTOS PERMITIDOS': 'CONSTRUCCION' })) === null &&
  Permisos.alcance_(usuario({ ROL: 'ADMIN' })) === null && Permisos.alcance_(undefined) === null,
  'quien no es CLIENT no tiene límite (null), aunque tenga DPTOS PERMITIDOS');
ok(Permisos.dentroDeAlcance(['POST VENTA'], 'Post Venta') && !Permisos.dentroDeAlcance(['POST VENTA'], 'DISPONIBLE') &&
  !Permisos.dentroDeAlcance([], 'POST VENTA') && Permisos.dentroDeAlcance(null, 'lo que sea'),
  'dentroDeAlcance: compara normalizado; [] no deja ver nada; null deja ver todo');

console.log('7d. Un módulo por entrada del menú: nadie pierde lo que veía (separacion_)');
{
  const gente = [
    usuario({ CORREO: 'a@x.com', AREA: 'CONTROL VEHICULAR' }),
    usuario({ CORREO: 'b@x.com', AREA: 'POST VENTA', ROL: 'CLIENT' }),
    usuario({ CORREO: 'c@x.com', AREA: 'LINEAS' }),
    usuario({ CORREO: 'd@x.com', AREA: 'CI', ACTIVO: 'FALSE' }),
    usuario({ CORREO: 'e@x.com', AREA: '' }),
  ];
  const reglas = [
    ['CONTROL VEHICULAR', 'vehiculos', 'EDICION'],
    ['POST VENTA', 'vehiculos', 'LECTURA'],
    ['LINEAS', 'accesorios-lineas', 'EDICION'],
    ['nadie@x.com', 'vehiculos', 'NINGUNO'],
    ['CONTROL VEHICULAR', 'sistemas-vehiculos', 'NINGUNO'],
  ];
  const c = Permisos.separacion_(reglas, gente);
  const tiene = (quien, modulo) => (c.find((x) => x.quien === quien && x.modulo === modulo) || {}).permiso;
  ok(tiene('CONTROL VEHICULAR', 'panorama-vehiculos') === 'LECTURA', 'quien tenía Vehículos recibe su Panorama (solo ver)');
  ok(tiene('CONTROL VEHICULAR', 'adquisicion-vehicular') === 'LECTURA' && !tiene('POST VENTA', 'adquisicion-vehicular'),
    'y Adquisición (su pestaña en la ficha colgaba de Vehículos), menos el CLIENT');
  ok(tiene('LINEAS', 'sistemas-lineas') === 'LECTURA' && !tiene('LINEAS', 'sistemas-vehiculos'),
    'Sistemas, solo de la familia donde ya tenía algo');
  ok(tiene('CONTROL VEHICULAR', 'sistemas-vehiculos') === undefined, 'una regla que ya existe no se toca');
  ok(tiene('nadie@x.com', 'panorama-vehiculos') === 'NINGUNO', 'a quien se le quitó Vehículos por correo, tampoco le llega el Panorama');
  ok(!c.some((x) => x.quien === 'POST VENTA'), 'el área CLIENT (POST VENTA) no recibe nada');
  ok(tiene('CONTROL VEHICULAR', 'encuestas-solicitudes') === 'LECTURA' && tiene('LINEAS', 'encuestas-solicitudes') === 'LECTURA' &&
    !tiene('CI', 'encuestas-solicitudes') && tiene('e@x.com', 'encuestas-solicitudes') === 'LECTURA',
    'Encuestas: cada área con gente activa y, sin área, la persona por su correo');
  const otraVez = Permisos.separacion_(Permisos.aplicarCambios_(reglas, c, 'n'), gente);
  ok(otraVez.length === 0, 'correrlo otra vez no agrega nada');
  ok(Modulos.familia('vehiculos').indexOf('sistemas-vehiculos') === -1 && Modulos.familia('vehiculos').indexOf('panorama-vehiculos') !== -1,
    'Sistemas (solo enlaces) no cuenta como familia: no abre el catálogo de vehículos; el Panorama sí');
  ok(Modulos.familia('sistemas-vehiculos').indexOf('sistemas-vehiculos') !== -1, 'la familia de un módulo de enlaces lo incluye a él');

  // permisosMigrarCatalogo: lo de separacion_ + los ids viejos a su id del catálogo, sin cambiar lo que cada quien ve
  const conViejos = reglas.concat([['CONTROL VEHICULAR', 'responsiva-vehicular', 'LECTURA'], ['CONTROL VEHICULAR', 'Hologramas', 'EDICION']]);
  const m = Permisos.migracion_(conViejos, gente);
  ok(m.renombradas === 2 && m.reglas.some((x) => x[1] === 'vehiculos.responsiva') && m.reglas.some((x) => x[1] === 'hologramas') &&
    !m.reglas.some((x) => x[1] === 'responsiva-vehicular'), 'migrar: los ids viejos y los nombres del menú quedan con su id del catálogo');
  const quien = gente[0];
  const antes = Permisos.resolver_(quien, Permisos.aplicarCambios_(conViejos, m.agregadas, 'n'), Modulos.ids());
  const despues = Permisos.resolver_(quien, m.reglas, Modulos.ids());
  ok(JSON.stringify(antes) === JSON.stringify(despues), 'migrar no cambia lo que la persona ve (solo cómo se escribe)');
  ok(Permisos.migracion_(m.reglas, gente).agregadas.length === 0 && Permisos.migracion_(m.reglas, gente).renombradas === 0,
    'correrla otra vez no hace nada');
}

console.log('8. Catálogo de módulos');
ok(Modulos.existe('instalacion-sensores') && Modulos.existe(' Vehiculos '),
  'el id tolera mayúsculas y espacios: escribir "Vehiculos" en la hoja sí funciona');
// Nadie tiene por qué memorizar los ids: también se acepta el nombre del menú
ok(Modulos.resolver('Control de Cambios - Líneas') === 'cambios-lineas',
  'se acepta el nombre tal como aparece en el menú, con acentos y guiones');
ok(Modulos.resolver('instalación de sensores') === 'instalacion-sensores',
  'con o sin acentos, y sin importar mayúsculas');
ok(Modulos.resolver('caja chica') === 'caja-chica' && Modulos.resolver('caja-chica') === 'caja-chica',
  'con espacios o con guiones, es el mismo módulo');
ok(Modulos.resolver('modulo inventado') === null && Modulos.resolver('') === null,
  'lo que no existe regresa null (y revisarCatalogo lo reporta)');
ok(Modulos.etiqueta('caja-chica') === 'Caja Chica', 'cada módulo tiene su nombre para la pantalla');
ok(Modulos.ids().length === new Set(Modulos.ids()).size, 'no hay ids repetidos');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

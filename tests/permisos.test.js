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
ok(p.usuarios === undefined && Object.keys(p).length === Modulos.ids().length - 1,
  'SUPER: todo con edición menos Usuarios y permisos (como en AppSheet)');
p = resolver(usuario({ ROL: 'VIEWER', AREA: 'CONTROL VEHICULAR' }));
ok(p.vehiculos === 'LECTURA' && p.hologramas === 'LECTURA', 'VIEWER: lo de su área, pero topado en lectura');

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
};
['panorama-lineas', 'resguardos-lineas', 'correcciones-lineas'].forEach((m) => { EDITA[m] = EDITA['lineas-telefonicas']; });

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
PRUEBA.forEach((u) => {
  const esperado = appsheet(u);
  const calculado = semilla(u);
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

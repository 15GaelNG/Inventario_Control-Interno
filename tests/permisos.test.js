/**
 * Pruebas de la resolución de permisos (PermisosService.gs).
 * No tocan Sheets: se le pasan el usuario y los perfiles ya leídos. Correr con:  npm test
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
vm.runInContext(leer('config/Modulos.gs') + '\n' + leer('services/PermisosService.gs') +
  '\nthis.Permisos = Permisos; this.Modulos = Modulos;', contexto);
const { Permisos, Modulos } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const usuario = (extra) => Object.assign({
  CORREO: 'alguien@ciudadmaderas.com', ROL: 'USER', ACTIVO: 'TRUE', PERFILES: '', 'PERMISOS EXTRA': '',
}, extra);
const PERFILES = {
  'CONTROL VEHICULAR': { vehiculos: 'EDICION', verificaciones: 'EDICION', hologramas: 'LECTURA' },
  'AUDITORIAS': { vehiculos: 'LECTURA', hologramas: 'LECTURA' },
  'LINEAS': { accesorios: 'EDICION' },
};
const resolver = (u, perfiles) => Permisos.resolver_(u, perfiles === undefined ? PERFILES : perfiles, Modulos.ids());

console.log('1. Perfiles');
let p = resolver(usuario({ PERFILES: 'Control vehicular' }));
ok(p.vehiculos === 'EDICION' && p.hologramas === 'LECTURA', 'el perfil da sus permisos, cada uno con su nivel');
ok(p.accesorios === undefined, 'lo que el perfil no menciona, no se puede ni ver');
ok(Object.keys(p).length === 3, 'no aparecen módulos de más');

console.log('2. Varios perfiles: gana el permiso más alto');
p = resolver(usuario({ PERFILES: 'Auditorias, Control vehicular' }));
ok(p.vehiculos === 'EDICION', 'lectura + edición sobre el mismo módulo = edición');
ok(p.accesorios === undefined && p.verificaciones === 'EDICION', 'se suman los módulos de todos los perfiles');

console.log('3. Los nombres de perfil no distinguen mayúsculas ni espacios');
p = resolver(usuario({ PERFILES: '  control VEHICULAR ' }));
ok(p.vehiculos === 'EDICION', '"  control VEHICULAR " encuentra el perfil');
p = resolver(usuario({ PERFILES: 'Perfil que no existe' }));
ok(Object.keys(p).length === 0, 'un perfil mal escrito no da permisos (y se nota de inmediato)');

console.log('4. Excepciones por persona (PERMISOS EXTRA)');
p = resolver(usuario({ PERFILES: 'Auditorias', 'PERMISOS EXTRA': 'caja-chica:LECTURA' }));
ok(p['caja-chica'] === 'LECTURA', 'da acceso a un módulo suelto sin inventar un perfil');
p = resolver(usuario({ PERFILES: 'Control vehicular', 'PERMISOS EXTRA': 'vehiculos:LECTURA' }));
ok(p.vehiculos === 'LECTURA', 'la excepción BAJA el permiso del perfil');
p = resolver(usuario({ PERFILES: 'Control vehicular', 'PERMISOS EXTRA': 'vehiculos:NINGUNO' }));
ok(p.vehiculos === undefined, 'NINGUNO quita el módulo por completo');
ok(Permisos.extras_('caja-chica:LECTURA, uber:NINGUNO').uber === 'NINGUNO', 'se aceptan varias excepciones separadas por coma');
ok(Object.keys(Permisos.extras_('basura, otra:COSA')).length === 0, 'lo que está mal escrito se ignora, no truena');

console.log('5. Usuarios inactivos y desconocidos');
ok(Object.keys(resolver(usuario({ PERFILES: 'Control vehicular', ACTIVO: 'FALSE' }))).length === 0,
  'un usuario inactivo no tiene ningún permiso');
ok(Object.keys(resolver(null)).length === 0, 'un correo que no está en la hoja tampoco');

console.log('6. Solo dos roles: ADMIN entra a todo, USER va por perfiles');
p = resolver(usuario({ ROL: 'ADMIN', PERFILES: 'Auditorias' }));
ok(Object.keys(p).length === Modulos.ids().length, 'ADMIN tiene TODOS los módulos del catálogo');
ok(p.vehiculos === 'EDICION' && p['caja-chica'] === 'EDICION' && p.usuarios === 'EDICION',
  'y en todos con edición, aunque su perfil dijera lectura');
p = resolver(usuario({ ROL: 'ADMIN', PERFILES: '', 'PERMISOS EXTRA': 'vehiculos:NINGUNO' }));
ok(p.vehiculos === 'EDICION', 'a un ADMIN no se le quita nada con excepciones: es admin y punto');
p = resolver(usuario({ ROL: 'SUPER', PERFILES: '' }));
ok(Object.keys(p).length === Modulos.ids().length, 'SUPER se trata igual que ADMIN (los que quedan de antes)');
p = resolver(usuario({ ROL: 'USER', PERFILES: 'Lineas' }));
ok(p.usuarios === undefined && p.accesorios === 'EDICION', 'un USER solo tiene lo de sus perfiles');

console.log('7. Mientras no exista la hoja PERFILES (migración)');
p = resolver(usuario({ ROL: 'VIEWER' }), null);
ok(p.vehiculos === 'LECTURA' && p.accesorios === 'LECTURA', 'VIEWER: lectura en todo');
p = resolver(usuario({ ROL: 'USER' }), null);
ok(p.vehiculos === 'EDICION', 'USER: edición, como hoy');
p = resolver(usuario({ ROL: 'ADMIN' }), null);
ok(p.usuarios === 'EDICION' && p.vehiculos === 'EDICION', 'ADMIN: todo, exista o no la hoja PERFILES');
ok(Object.keys(resolver(usuario({ ROL: 'USER' }), null)).length === Modulos.ids().length,
  'el respaldo cubre exactamente los módulos del catálogo');

console.log('8. Catálogo de módulos');
ok(Modulos.existe('instalacion-sensores') && Modulos.existe(' Vehiculos '),
  'el id tolera mayúsculas y espacios: escribir "Vehiculos" en la hoja sí funciona');
// Nadie tiene por qué memorizar los ids: también se acepta el nombre del menú
ok(Modulos.resolver('Control de Reasignaciones - Líneas') === 'reasignaciones-lineas',
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

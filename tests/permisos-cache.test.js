/**
 * Los permisos ya no releen USUARIOS y PERMISOS en cada revisión (PermisosService + CacheHojas):
 * se leen una vez y se guardan mientras las hojas no cambien, sin contraseñas, y al guardar
 * permisos se lee la hoja directo (lo que se reescribe no sale de una copia). Hojas simuladas
 * (apps-script-simulado). Correr: npm test
 */
const { crearEntorno } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const e = crearEntorno({
  libros: {
    usuarios: {
      USUARIOS: [
        ['ID', 'CORREO', 'NOMBRE', 'AREA', 'ROL', 'ACTIVO', 'PASSWORD_HASH', 'SALT'],
        ['USR-1', 'ana@x.com', 'Ana', 'LINEAS', 'USER', 'TRUE', 'hash-secreto', 'sal-secreta'],
        ['USR-2', 'beto@x.com', 'Beto', 'LINEAS', 'USER', 'TRUE', 'otro-hash', 'otra-sal'],
        ['USR-3', 'admin@x.com', 'Admin', 'SISTEMAS', 'ADMIN', 'TRUE', 'h3', 's3'],
      ],
      PERMISOS: [
        ['QUIEN', 'MODULO', 'PERMISO', 'NOTA'],
        ['LINEAS', 'tickets', 'LECTURA', ''],
      ],
    },
  },
});
e.cargar('src/utils/CacheHojas.gs', 'src/utils/SheetUtils.gs', 'src/config/PermisosSemilla.gs', {
  nombre: 'falsos.js',
  codigo: `
    var Config = { SPREADSHEET_IDS: { USUARIOS: () => 'usuarios' } };
    var Modulos = { ids: () => ['tickets', 'uber'], resolver: (v) => String(v).trim().toLowerCase(), existe: () => true, GRUPOS: [] };
    var Auth = { validarSesion: (t) => ({ correo: t, nombre: t }) };
  `,
}, 'src/services/PermisosService.gs', {
  nombre: 'contar.js',
  codigo: `
    var lecturas = {};
    var getAllReal = SheetUtils.getAll;
    SheetUtils.getAll = function (ss, hoja) { lecturas[hoja] = (lecturas[hoja] || 0) + 1; return getAllReal(ss, hoja); };
  `,
});

const P = e.global('Permisos');
const lecturas = () => e.global('lecturas');
const borrarPermisosGuardados = () => e.global('CacheService').getScriptCache().removeAll(['permisos_ana@x.com', 'permisos_beto@x.com', 'permisos_ANA@X.COM', 'permisos_BETO@X.COM']);

console.log('1. Se leen una vez');
ok(P.deCorreo('ana@x.com').tickets === 'LECTURA', 'Ana ve Tickets (por su área)');
const antes = Object.assign({}, lecturas());
borrarPermisosGuardados();   // como si ya hubieran pasado los 5 min de deCorreo
ok(P.deCorreo('beto@x.com').tickets === 'LECTURA', 'Beto también');
P.deCorreo('ana@x.com');
ok(lecturas().USUARIOS === antes.USUARIOS && lecturas().PERMISOS === antes.PERMISOS,
  'otra persona, y otra vez la misma, ya no vuelven a leer USUARIOS ni PERMISOS');

console.log('2. Sin contraseñas en lo guardado');
const cache = e.global('CacheService').getScriptCache();
const base = cache._claves().find((k) => k.indexOf('rec_permisos_usuarios_v1') === 0 && k.endsWith('_n')).slice(0, -2);
const personas = e.global('CacheHojas').leer(base).v;
ok(personas.length === 3 && personas[0].CORREO === 'ana@x.com', 'la lista de personas está guardada');
ok(!/hash-secreto|sal-secreta|otro-hash|otra-sal/.test(JSON.stringify(personas)) && !('PASSWORD_HASH' in personas[0]),
  'sin hash ni sal: solo las columnas que usan los permisos');

console.log('3. Un cambio en la hoja desde la app se ve ya');
e.global('SheetUtils').update('usuarios', 'USUARIOS', 'USR-2', { AREA: 'OTRA' });
borrarPermisosGuardados();
ok(!P.deCorreo('beto@x.com').tickets, 'Beto cambió de área (escrito por la app): pierde Tickets en cuanto se vuelve a revisar');

console.log('4. Guardar lee la hoja, no la copia');
P.deCorreo('ana@x.com');   // las reglas quedan guardadas…
const hojaPermisos = e.libros.usuarios.getSheetByName('PERMISOS');
hojaPermisos.appendRow(['ana@x.com', 'uber', 'LECTURA', 'escrito a mano']);   // …y alguien edita la hoja a mano
P.guardar('admin@x.com', [{ quien: 'LINEAS', modulo: 'uber', permiso: 'EDICION' }]);
const filas = e.hojaComoTexto('usuarios', 'PERMISOS').filter((r) => r[0]);
ok(filas.some((r) => r[0] === 'ana@x.com' && r[1] === 'uber'), 'lo escrito a mano se conserva (guardar leyó la hoja, no la copia)');
ok(filas.some((r) => r[0] === 'LINEAS' && r[1] === 'uber' && r[2] === 'EDICION'), 'y se agregó el cambio');
e.global('CacheService').getScriptCache().removeAll(['permisos_ANA@X.COM', 'permisos_BETO@X.COM']);
ok(P.deCorreo('beto@x.com').uber === undefined && P.deCorreo('ana@x.com').uber === 'LECTURA', 'después de guardar, las reglas se vuelven a leer (Beto ya no es de LINEAS)');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

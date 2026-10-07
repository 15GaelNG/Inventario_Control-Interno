/**
 * Datos de referencia por familia (Modulos.familia + Permisos.puedeLeerFamilia): quien tiene
 * un módulo puede leer los catálogos que su familia necesita para trabajar (el de vehículos
 * en Sensores, la lista de cajas en Arqueos), pero NO la pantalla de otro módulo ni datos de
 * otra familia. Con el catálogo de módulos real (src/config/Modulos.gs). Correr: npm test
 */
const { crearEntorno } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const truena = (fn) => { try { fn(); return false; } catch (e) { return true; } };

const e = crearEntorno({
  libros: {
    usuarios: {
      USUARIOS: [
        ['ID', 'CORREO', 'NOMBRE', 'AREA', 'ROL', 'ACTIVO'],
        ['U-1', 'sensores@x.com', 'Sol', 'SENSORES', 'USER', 'TRUE'],
        ['U-2', 'arqueos@x.com', 'Ana', 'AUDITORIA', 'USER', 'TRUE'],
      ],
      PERMISOS: [
        ['QUIEN', 'MODULO', 'PERMISO', 'NOTA'],
        ['SENSORES', 'instalacion-sensores', 'EDICION', ''],
        ['AUDITORIA', 'arqueos', 'EDICION', ''],
      ],
    },
  },
});
e.cargar('src/utils/CacheHojas.gs', 'src/utils/SheetUtils.gs', 'src/config/PermisosSemilla.gs', 'src/config/Modulos.gs', {
  nombre: 'falsos.js',
  codigo: `
    var Config = { SPREADSHEET_IDS: { USUARIOS: () => 'usuarios' } };
    var Auth = { validarSesion: (t) => ({ correo: t, nombre: t }) };
  `,
}, 'src/services/PermisosService.gs');
const M = e.global('Modulos');
const P = e.global('Permisos');

console.log('1. Las familias son los grupos del menú');
ok(M.familia('instalacion-sensores').indexOf('vehiculos') >= 0 && M.familia('vehiculos').indexOf('hologramas') >= 0, 'Sensores y Vehículos son de la misma familia');
ok(M.familia('arqueos').indexOf('caja-chica') >= 0 && M.familia('arqueos').indexOf('vehiculos') === -1, 'Arqueos va con Caja Chica, no con Vehículos');

console.log('2. Quien solo tiene Sensores');
ok(!truena(() => P.puedeLeerFamilia('sensores@x.com', 'vehiculos')), 'lee el catálogo de vehículos (referencia de su familia)');
ok(truena(() => P.puedeLeer('sensores@x.com', 'vehiculos')), 'pero no el módulo de Vehículos (su pantalla, su lista completa)');
ok(truena(() => P.puedeLeerFamilia('sensores@x.com', 'caja-chica')), 'ni la referencia de otra familia (cajas chicas)');

console.log('3. Quien solo tiene Arqueos');
ok(!truena(() => P.puedeLeerFamilia('arqueos@x.com', 'caja-chica')), 'lee la lista de cajas para elegir la caja');
ok(truena(() => P.puedeLeer('arqueos@x.com', 'caja-chica')) && truena(() => P.puedeLeerFamilia('arqueos@x.com', 'vehiculos')),
  'pero no el módulo de Caja Chica ni los vehículos');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

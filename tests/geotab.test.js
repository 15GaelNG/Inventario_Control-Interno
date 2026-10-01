/**
 * Pruebas del resumen de actividad de Geotab (GeotabService.gs) con datos de ejemplo.
 * No llama a la API: solo se prueban las funciones puras. Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const codigo = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'GeotabService.gs'), 'utf8');
const contexto = vm.createContext({
  // Apps Script: solo se tocan dentro de funciones que estas pruebas no llaman
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  UrlFetchApp: {},
});
vm.runInContext(codigo + '\nthis.Geotab = Geotab;', contexto);
const { Geotab } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const viaje = (km, ralenti, conduccion) => ({
  distance: km, idlingDuration: ralenti || '00:00:00', drivingDuration: conduccion || '01:00:00',
});
const carga = (litros) => ({ totalFuelUsed: litros });

console.log('1. Duraciones de Geotab (formato TimeSpan de .NET)');
ok(Geotab.duracionHoras('01:30:00') === 1.5, '"01:30:00" = 1.5 h');
ok(Math.abs(Geotab.duracionHoras('00:00:02') - 0.000555) < 0.00001, '"00:00:02" = 2 segundos');
ok(Math.abs(Geotab.duracionHoras('1.23:58:56.3340000') - 47.98) < 0.01,
  '"1.23:58:56.3340000" = 47.98 h (partir por ":" daría 1.23 h)');
ok(Geotab.duracionHoras('') === 0 && Geotab.duracionHoras(null) === 0 && Geotab.duracionHoras('x') === 0,
  'valores vacíos o raros = 0, sin tronar');

console.log('2. Totales del período');
let r = Geotab.calcularResumen_(
  [viaje(120.4, '01:30:00', '02:00:00'), viaje(79.6, '00:30:00', '01:00:00')],
  [carga(12.5), carga(7.5)]
);
ok(r.viajes === 2, 'cuenta los viajes');
ok(r.km === 200, 'suma los kilómetros (120.4 + 79.6)');
ok(r.litros === 20, 'suma el combustible (12.5 + 7.5)');
ok(r.horasRalenti === 2, 'suma el ralentí (1:30 + 0:30 = 2 h)');
ok(r.horasConduccion === 3, 'suma el tiempo manejando');

console.log('3. La computadora del motor no reporta en todos los viajes');
r = Geotab.calcularResumen_([viaje(100), viaje(100), viaje(100)], [carga(10)]);
ok(r.litros === 10 && r.viajesConCombustible === 1 && r.viajes === 3,
  'informa en cuántos viajes hubo reporte (1 de 3): el total es lo reportado, no todo lo gastado');

console.log('4. Sin datos en el período');
r = Geotab.calcularResumen_([], []);
ok(r.viajes === 0 && r.km === 0 && r.litros === 0 && r.horasRalenti === 0, 'puros ceros, sin tronar');

console.log('5. No se calculan tasas');
ok(r.rendimiento === undefined && r.ralenti === undefined,
  'el resumen NO trae rendimiento ni consumo por hora: esos se capturan a mano en el inventario');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

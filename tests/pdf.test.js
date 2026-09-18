/**
 * Pruebas del armado del nombre de archivo (PdfService.gs).
 * No tocan Drive: solo se prueban las funciones puras. Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contexto = vm.createContext({
  // Apps Script: solo se usan dentro de funciones que estas pruebas no llaman
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  DriveApp: {}, DocumentApp: {}, Utilities: {}, Session: {}, Plantilla: {},
});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'PdfService.gs'), 'utf8') + '\nthis.PdfService = PdfService;',
  contexto
);
const { PdfService } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const igual = (a, b, texto) => ok(a === b, `${texto}${a === b ? '' : `  (dio "${a}", se esperaba "${b}")`}`);

const nombre = (partes) => PdfService.nombreArchivo(partes);

console.log('1. Nombre del archivo: responsable, placa y fecha');
igual(nombre(['INSPECCION', 'JUAN PEREZ', 'ST0443E', '2026-09-17']),
  'INSPECCION JUAN PEREZ ST0443E 2026-09-17', 'las partes se unen con espacios');
igual(nombre(['INSPECCION', 'JUAN PEREZ', '', '2026-09-17']),
  'INSPECCION JUAN PEREZ 2026-09-17', 'un dato faltante no deja doble espacio');
igual(nombre(['INSPECCION', '  MARIA  LOPEZ  ', 'ST0443E', '2026-09-17']),
  'INSPECCION MARIA LOPEZ ST0443E 2026-09-17', 'se normalizan los espacios de más');

console.log('2. Caracteres que estorban en Drive');
igual(nombre(['INSPECCION', 'PEREZ / LOPEZ', 'ST-0443/E', '2026-09-17']),
  'INSPECCION PEREZ LOPEZ ST-0443 E 2026-09-17', 'las diagonales no se quedan en el nombre');
igual(nombre(['INSPECCION', 'A:B*C?D"E<F>G|H', 'X', '2026-09-17']),
  'INSPECCION A B C D E F G H X 2026-09-17', 'los demás caracteres problemáticos también se quitan');
igual(nombre(['INSPECCION', 'JOSÉ MUÑOZ ÁVILA', 'ST0443E', '2026-09-17']),
  'INSPECCION JOSÉ MUÑOZ ÁVILA ST0443E 2026-09-17', 'los acentos y la ñ SÍ se conservan');
ok(nombre(['INSPECCION', 'X'.repeat(300), 'ST0443E']).length === 180, 'un nombre larguísimo se recorta');

console.log('3. Fecha para el nombre (así la carpeta queda en orden cronológico)');
igual(PdfService.fechaParaNombre(new Date(2026, 8, 17)), '2026-09-17', 'desde una fecha');
igual(PdfService.fechaParaNombre('17/09/2026'), '2026-09-17', 'desde "dd/mm/aaaa", como lo deja AppSheet');
igual(PdfService.fechaParaNombre('2026-09-17T12:30:00Z').slice(0, 4), '2026', 'desde texto ISO');
igual(PdfService.fechaParaNombre(''), '', 'sin fecha, queda vacío y el nombre se arma sin ella');
igual(PdfService.fechaParaNombre('no es fecha'), '', 'un texto que no es fecha tampoco rompe el nombre');

console.log('4. Orden dentro de la carpeta');
const archivos = [
  nombre(['INSPECCION', 'ANA RUIZ', 'GGY886F', '2026-03-15']),
  nombre(['INSPECCION', 'ANA RUIZ', 'GGY886F', '2025-11-03']),
  nombre(['INSPECCION', 'ANA RUIZ', 'GGY886F', '2026-09-17']),
  nombre(['INSPECCION', 'BETO SOLIS', 'ST0443E', '2026-02-08']),
].sort();
ok(archivos[0].includes('ANA RUIZ') && archivos[0].includes('2025-11-03'),
  'al ordenar por nombre, cada responsable queda junto y sus inspecciones en orden de fecha');
ok(archivos[3].includes('BETO SOLIS'), 'y los responsables quedan en orden alfabético');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

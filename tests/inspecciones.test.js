/**
 * Pruebas del cálculo del puntaje de inspección (InspeccionesService.gs).
 *
 * La regla: cada sección vale su peso · BUENO 1 · REGULAR medio punto · MALO 0 ·
 * lo que no aplica no cuenta · en las secciones de defectos (SÍ/NO), lo bueno es NO.
 * Correr con:  npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contexto = vm.createContext({
  // Apps Script: solo se usan en funciones que estas pruebas no llaman
  Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'x' }, DRIVE_FOLDERS: {} },
  SheetUtils: {}, Permisos: {}, DriveUtils: {}, Plantilla: {}, CacheService: {},
  DocumentApp: {}, Utilities: {},
});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'InspeccionesService.gs'), 'utf8') +
  '\nthis.InspeccionesService = InspeccionesService;',
  contexto
);
const { InspeccionesService } = contexto;
const puntaje = (secciones, respuestas) => InspeccionesService.calcularPuntaje_(secciones, respuestas);

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const igual = (a, b, texto) => ok(a === b, `${texto}${a === b ? '' : `  (dio ${a}, se esperaba ${b})`}`);

const pieza = (campo, opciones) => ({ campo, opciones: opciones || ['BUENO', 'REGULAR', 'MALO', 'N/A'] });
// Dos secciones, como en los formatos reales
const SECCIONES = [
  { titulo: 'Cristalería', peso: 10, campos: [pieza('PARABRISAS'), pieza('MEDALLON'), pieza('CRISTALES PUERTAS')] },
  { titulo: 'Neumáticos', peso: 15, campos: [pieza('RINES'), pieza('TAPONES')] },
];

console.log('1. Todo bien = puntaje completo');
let r = puntaje(SECCIONES, { PARABRISAS: 'BUENO', MEDALLON: 'BUENO', 'CRISTALES PUERTAS': 'BUENO', RINES: 'BUENO', TAPONES: 'BUENO' });
igual(r.final, 25, 'las dos secciones dan sus 10% + 15%');
igual(r.secciones[0].valor, 0.1, 'la sección se guarda como fracción (0.1 = 10%), como en la hoja');
igual(r.evaluadas, 5, 'cuenta las piezas evaluadas');

console.log('2. Cada respuesta vale lo suyo');
r = puntaje(SECCIONES, { PARABRISAS: 'MALO', MEDALLON: 'BUENO', 'CRISTALES PUERTAS': 'BUENO', RINES: 'BUENO', TAPONES: 'BUENO' });
igual(r.secciones[0].valor, 0.0667, 'un MALO de tres piezas deja la sección en dos tercios');
r = puntaje(SECCIONES, { PARABRISAS: 'REGULAR', MEDALLON: 'BUENO', 'CRISTALES PUERTAS': 'BUENO', RINES: 'BUENO', TAPONES: 'BUENO' });
igual(r.secciones[0].valor, 0.0833, 'un REGULAR vale medio punto');
igual(r.final, 23.33, 'el total es la suma de las secciones');

console.log('3. Lo que no aplica no cuenta (ni a favor ni en contra)');
r = puntaje(SECCIONES, { PARABRISAS: 'BUENO', MEDALLON: 'N/A', 'CRISTALES PUERTAS': 'BUENO', RINES: 'BUENO', TAPONES: 'BUENO' });
igual(r.secciones[0].valor, 0.1, 'con 2 de 2 buenas y una N/A, la sección queda completa');
igual(r.secciones[0].evaluadas, 2, 'la pieza N/A no se cuenta como evaluada');
r = puntaje(SECCIONES, { PARABRISAS: 'MALO', MEDALLON: 'N/A', 'CRISTALES PUERTAS': 'BUENO', RINES: 'BUENO', TAPONES: 'BUENO' });
igual(r.secciones[0].valor, 0.05, 'un MALO de dos evaluadas deja la mitad');

console.log('4. Secciones de defectos: ahí lo bueno es NO');
const BATERIA = [{
  titulo: 'Batería', peso: 5,
  campos: [pieza('TERMINALES CON SARRO', ['SI', 'NO']), pieza('DERRAME LIQUIDO / MAL OLOR', ['SI', 'NO']),
    pieza('BATERIA INFLADA', ['SI', 'NO'])],
}];
r = puntaje(BATERIA, { 'TERMINALES CON SARRO': 'NO', 'DERRAME LIQUIDO / MAL OLOR': 'NO', 'BATERIA INFLADA': 'NO' });
igual(r.final, 5, 'sin ningún defecto, la sección vale completa');
r = puntaje(BATERIA, { 'TERMINALES CON SARRO': 'SI', 'DERRAME LIQUIDO / MAL OLOR': 'NO', 'BATERIA INFLADA': 'NO' });
igual(r.final, 3.33, 'un defecto presente baja el puntaje');
igual(InspeccionesService.valorDeRespuesta_('NO', ['SI', 'NO']), 1, 'NO suma en una pieza de defecto');
igual(InspeccionesService.valorDeRespuesta_('NO PRESENTA', ['PRESENTA', 'NO PRESENTA', 'N/A']), 0,
  'pero en documentación, NO PRESENTA sí resta');

console.log('5. Documentación (presenta / no presenta)');
const DOCS = [{
  titulo: 'Documentación', peso: 5,
  campos: [pieza('GAFETTE', ['PRESENTA', 'NO PRESENTA', 'N/A']), pieza('LICENCIA', ['PRESENTA', 'NO PRESENTA', 'N/A'])],
}];
igual(puntaje(DOCS, { GAFETTE: 'PRESENTA', LICENCIA: 'PRESENTA' }).final, 5, 'ambos presentes = sección completa');
igual(puntaje(DOCS, { GAFETTE: 'PRESENTA', LICENCIA: 'NO PRESENTA' }).final, 2.5, 'falta uno = la mitad');

console.log('6. Casos límite');
r = puntaje(SECCIONES, {});
igual(r.final, 0, 'sin responder nada, el puntaje es 0');
igual(r.secciones[0].evaluadas, 0, 'y no hay piezas evaluadas');
r = puntaje(SECCIONES, { PARABRISAS: 'N/A', MEDALLON: 'N/A', 'CRISTALES PUERTAS': 'N/A', RINES: 'BUENO', TAPONES: 'BUENO' });
igual(r.secciones[0].valor, 0, 'una sección entera N/A no gana su peso…');
igual(r.final, 15, '…pero tampoco arrastra a las demás: el resto conserva el suyo');
igual(puntaje([], {}).final, 0, 'sin secciones no truena');
igual(puntaje(null, {}).final, 0, 'ni con secciones nulas');
igual(puntaje(SECCIONES, { PARABRISAS: 'basura', MEDALLON: 'BUENO', 'CRISTALES PUERTAS': 'BUENO', RINES: 'BUENO', TAPONES: 'BUENO' }).secciones[0].valor,
  0.1, 'una respuesta que no es de la lista se ignora, no cuenta como mala');

console.log('7. Los pesos reales suman 100%');
const REALES = [
  { titulo: 'Documentación', peso: 5, campos: [pieza('A')] }, { titulo: 'Cristalería', peso: 10, campos: [pieza('B')] },
  { titulo: 'Neumáticos', peso: 15, campos: [pieza('C')] }, { titulo: 'Interiores', peso: 5, campos: [pieza('D')] },
  { titulo: 'Latonería y pintura', peso: 5, campos: [pieza('E')] }, { titulo: 'Inventarios', peso: 10, campos: [pieza('F')] },
  { titulo: 'Cerraduras', peso: 5, campos: [pieza('G')] }, { titulo: 'Limpieza', peso: 5, campos: [pieza('H')] },
  { titulo: 'Sistemas interiores', peso: 10, campos: [pieza('I')] }, { titulo: 'Sistema mecánico', peso: 15, campos: [pieza('J')] },
  { titulo: 'Niveles', peso: 10, campos: [pieza('K')] }, { titulo: 'Batería', peso: 5, campos: [pieza('L', ['SI', 'NO'])] },
];
const todoBien = {};
REALES.forEach((s) => { todoBien[s.campos[0].campo] = s.campos[0].opciones[0] === 'SI' ? 'NO' : 'BUENO'; });
igual(puntaje(REALES, todoBien).final, 100, 'una inspección perfecta da exactamente 100%');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

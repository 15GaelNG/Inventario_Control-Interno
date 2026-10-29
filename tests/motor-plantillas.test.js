/**
 * MotorPlantillas (src/services/MotorPlantillas.gs): el lenguaje propio de las plantillas ({{CAMPO}}, {{si}}…{{fin}} y
 * el checklist por tablas), contra el Docs simulado. Como un compilador: analizar, revisar (todos los errores, con
 * dónde y una sugerencia) y llenar (nada si hay un error).
 *
 * Correr: node tests/motor-plantillas.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const D = require('./docs-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const ctx = vm.createContext({ DocumentApp: D.DocumentApp });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'MotorPlantillas.gs'), 'utf8') + '\nthis.M = MotorPlantillas;', ctx);
const M = ctx.M;

const CONTRATO = {
  campos: {
    FECHA: 'fecha', PLACAS: 'texto', RESPONSABLE: 'texto', OBSERVACIONES: 'texto', 'FIRMA INSPECTOR': 'imagen',
    PARABRISAS: 'opcion', 'MEDALLON': 'opcion', 'FASCIA / DEFENSA TRASERA': 'opcion', GAFETTE: 'opcion',
    'LLANTA DD': 'numero', 'LLANTA DD ESTADO': { tipo: 'opcion', marca: 'LLANTA DD' },
  },
};

/** Una plantilla como la de AUTOS, ya en el lenguaje nuevo: datos arriba y dos secciones en el acomodo a dos columnas */
function plantilla() {
  const datos = D.tabla([['Fecha:', '{{FECHA}}'], ['Placas:', '{{ placas }}']]);
  const cristal = D.tabla([
    ['Cristalería 10%', 'Bueno', 'Regular', 'Malo', 'N/A'],
    ['Parabrisas {{PARABRISAS}}', '', '', '', ''],
    ['Medallón {{MEDALLÓN}}', '', '', '', ''],
  ]);
  const docs = D.tabla([
    ['Documentación 5%', 'Presenta', 'No presenta', 'N/A'],
    ['Gafette {{GAFETTE}}', '', '', ''],
  ]);
  const llantas = D.tabla([
    ['Neumáticos 15%', 'mm', '', ''],
    ['', '', 'Bueno', 'Malo'],
    ['', 'Delantera derecha {{LLANTA DD ESTADO}}', '', ''],
  ]);
  const acomodo = D.tabla([[D.celda('', [datos, cristal]), D.celda('', [docs, llantas])]]);
  const cuerpo = D.cuerpo([acomodo, 'Observaciones: {{OBSERVACIONES}}{{si RESPONSABLE}} · Responsable: {{RESPONSABLE}}{{fin}}', '{{FIRMA INSPECTOR}}']);
  return { cuerpo, cristal, docs, llantas, datos };
}

console.log('1. El dialecto de cada documento');
{
  ok(M.dialecto('Hola {{X}}') === 'nuevo' && M.dialecto('<<[X]>>') === 'appsheet', 'nuevo ({{ }}) y AppSheet (<< >>)');
  ok(M.dialecto('<<[X]>> {{Y}}') === 'mezclado' && M.dialecto('sin marcas') === 'ninguno', 'mezclado y ninguno');
}

console.log('2. Analizar: la estructura del checklist sale de las tablas');
{
  const { cuerpo } = plantilla();
  const a = M.analizar(cuerpo);
  ok(a.secciones.map((s) => s.titulo + ' ' + s.peso).join(' | ') === 'Cristalería 10 | Documentación 5 | Neumáticos 15',
    'las secciones, con su peso, en el orden del documento (columna izquierda, luego derecha)');
  ok(a.secciones[0].opciones.join(',') === 'Bueno,Regular,Malo,N/A' && a.secciones[1].opciones.join(',') === 'Presenta,No presenta,N/A',
    'las opciones salen del encabezado de cada tabla');
  ok(a.secciones[0].piezas.map((p) => p.campo + '=' + p.etiqueta).join(' | ') === 'PARABRISAS=Parabrisas | MEDALLÓN=Medallón',
    'cada pieza: su campo y la etiqueta impresa');
  ok(a.secciones[2].piezas.length === 1 && a.secciones[2].opciones.join(',') === 'Bueno,Malo',
    'un encabezado de opciones a media tabla (Neumáticos: "mm" arriba no es encabezado)');
  ok(a.marcas.map((m) => m.campo).join(',') === 'FECHA,placas,OBSERVACIONES,RESPONSABLE,FIRMA INSPECTOR' && a.bloques.length === 1,
    'las marcas de valor y el bloque, fuera de las piezas');
  ok(M.revisar(a, CONTRATO).length === 0, 'contra el contrato: sin errores (acentos, mayúsculas y espacios no importan)');
}

console.log('3. Revisar: todos los errores, con dónde y qué hacer');
{
  const malo = D.tabla([
    ['Cristalería', 'Bueno', 'Malo'],
    ['Parabrisa {{PARABRISA}}', '', ''],
    ['Faros {{FIRMA INSPECTOR}}', '', ''],
    ['Medallón {{MEDALLON}}', '{{MEDALLON}}', ''],
    ['Cofre {{PARABRISAS}}', 'x', ''],
    ['Calavera {{PARABRISAS}}', '', ''],
  ]);
  const cuerpo = D.cuerpo([malo, 'Total: {{IF([X] = "B", "✓", "")}}', '{{si PLACAS}} sin cerrar', 'Viejo: <<[PLACAS]>>']);
  const errores = M.revisar(M.analizar(cuerpo), CONTRATO);
  const hay = (re) => errores.some((e) => re.test(e.donde + ': ' + e.mensaje));
  ok(hay(/sección «Cristalería», renglón 2: no existe el campo PARABRISA\. ¿Quisiste decir PARABRISAS\?/), 'campo desconocido, con dónde y sugerencia');
  ok(hay(/FIRMA INSPECTOR es una imagen/), 'una imagen no puede ser pieza');
  ok(hay(/renglón 4: una celda de opción trae una marca/), 'una marca en una celda de opción');
  ok(hay(/renglón 5: la celda de «Bueno» trae texto/), 'texto en una celda de opción');
  ok(hay(/renglón 6: PARABRISAS ya está en sección «Cristalería», renglón 5/), 'una pieza repetida');
  ok(hay(/su título no trae el peso/), 'una sección sin peso');
  ok(hay(/no se entiende \{\{IF/), 'una fórmula dentro de {{ }}: el cálculo va en el código');
  ok(hay(/\{\{si …\}\} sin su \{\{fin\}\}/), 'un bloque sin cerrar');
  ok(hay(/marca de AppSheet/) && hay(/documento: mezcla marcas/), 'una marca de AppSheet en un documento nuevo');
  ok(errores.length >= 9, 'los da todos de una vez (' + errores.length + '), no solo el primero');
}

console.log('4. Llenar');
{
  const { cuerpo, cristal, docs, llantas, datos } = plantilla();
  const r = M.llenar(cuerpo, {
    FECHA: '31/10/2026', placas: 'ABC-123', PARABRISAS: 'bueno', 'MEDALLON': 'N/A', GAFETTE: 'NO PRESENTA',
    'LLANTA DD': '3.2', 'LLANTA DD ESTADO': 'MALO', OBSERVACIONES: 'Sin novedad', RESPONSABLE: '',
  }, CONTRATO);
  const c = D.textos(cristal);
  ok(c[1].join('|') === 'Parabrisas|✓|||' && c[2].join('|') === 'Medallón||||✓', 'la palomita en la columna de su valor (sin importar mayúsculas)');
  ok(D.textos(docs)[1].join('|') === 'Gafette||✓|', 'otra sección con otras opciones');
  ok(D.textos(llantas)[2].join('|') === '|Delantera derecha||3.2', 'una pieza con `marca`: escribe el valor (los mm) en vez de la palomita');
  ok(D.textos(datos).map((x) => x[1]).join(',') === '31/10/2026,ABC-123', 'los valores (con espacios dentro de la marca, igual)');
  ok(cuerpo.hijos[1].getText() === 'Observaciones: Sin novedad', 'el bloque {{si}} sin valor no sale');
  ok(r.sinResolver.length === 0 && r.marcadores >= 8, 'sin pendientes');
  ok(cuerpo.hijos[2].getText() === '', 'una imagen que no llegó deja su marca vacía (PdfService pone las que sí)');
}

console.log('5. Llenar con un valor que no es opción, y con errores');
{
  const { cuerpo, cristal } = plantilla();
  const r = M.llenar(cuerpo, { PARABRISAS: 'ROTO', RESPONSABLE: 'Ana' }, CONTRATO);
  ok(D.textos(cristal)[1].join('|') === 'Parabrisas||||' && /PARABRISAS = «ROTO»: no es ninguna de Bueno, Regular, Malo, N\/A/.test(r.sinResolver[0]),
    'un valor que no es ninguna opción: sin palomita, y se dice');
  ok(cuerpo.hijos[1].getText() === 'Observaciones:  · Responsable: Ana', 'el bloque {{si}} con valor sale');
  const roto = D.cuerpo(['{{NO EXISTE}}']);
  let tronó = '';
  try { M.llenar(roto, {}, CONTRATO); } catch (e) { tronó = e.message; }
  ok(/La plantilla tiene errores:\n {2}- párrafo 1: no existe el campo NO EXISTE/.test(tronó) && roto.getText() === '{{NO EXISTE}}',
    'con un error truena antes de escribir nada');
}

console.log('6. Utilidades');
{
  ok(M.clave(' Fascia /  defensa trasera ') === M.clave('FASCIA/DEFENSA TRASERA'), 'clave: sin acentos, mayúsculas ni espacios de más');
  ok(new RegExp(M.patron('FIRMA INSPECTOR')).test('{{ FIRMA  INSPECTOR }}'), 'patron() encuentra la marca de una imagen con espacios');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');

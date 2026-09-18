/**
 * Pruebas del motor de plantillas (Plantilla.gs).
 * Las expresiones son las REALES de los formatos que hoy llena AppSheet. Correr con: npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contexto = vm.createContext({});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'Plantilla.gs'), 'utf8') + '\nthis.Plantilla = Plantilla;',
  contexto
);
const { Plantilla } = contexto;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const igual = (a, b, texto) => ok(a === b, `${texto}${a === b ? '' : `  (dio "${a}", se esperaba "${b}")`}`);

const DATOS = {
  'RESPONSABLE': 'Juan Pérez',
  'AREA': 'Control vehicular',
  'CLAXON': 'BUENO',
  'ALFOMBRA': 'MALO',
  'BANDAS': 'N/A',
  'GAFETTE': 'PRESENTA',
  'BATERIA INFLADA': 'NO',
  'LLANTA DD': 1.4,
  'LLANTA DI': 3.2,
  'LLANTA TD': 5.0,
  'OBSERVACIONES FINALES': 'sin novedad',
  'M 0,50': 8,
  'PUNTAJE FINAL INSPECCION': 87,
};

console.log('1. Campos');
igual(Plantilla.resolver('<<[RESPONSABLE]>>', DATOS), 'Juan Pérez', 'campo entre corchetes');
igual(Plantilla.resolver('<<PUNTAJE FINAL INSPECCION>>', DATOS), '87', 'campo sin corchetes y con espacios');
igual(Plantilla.resolver('<<[responsable]>>', DATOS), 'Juan Pérez', 'no importan las mayúsculas del nombre');
igual(Plantilla.resolver('<<[NO EXISTE]>>', DATOS), '', 'un campo que falta queda vacío, no rompe el documento');
igual(Plantilla.resolver('Área: <<AREA>> · Puntaje: <<PUNTAJE FINAL INSPECCION>>', DATOS),
  'Área: Control vehicular · Puntaje: 87', 'varios marcadores en la misma línea');

console.log('2. Palomitas del checklist (la expresión más usada: 5254 veces)');
igual(Plantilla.resolver('<<IF([CLAXON] ="BUENO", "✓", "")>>', DATOS), '✓', 'marca la casilla que corresponde');
igual(Plantilla.resolver('<<IF([CLAXON] ="MALO", "✓", "")>>', DATOS), '', 'deja vacías las demás');
igual(Plantilla.resolver('<<IF([ALFOMBRA] ="MALO", "✓", "")>>', DATOS), '✓', 'otra pieza, otro estado');
igual(Plantilla.resolver('<<IF([BANDAS] ="N/A", "✓", "")>>', DATOS), '✓', 'N/A también es un estado válido');
igual(Plantilla.resolver('<<IF([GAFETTE] ="PRESENTA", "✓", "")>>', DATOS), '✓', 'presenta / no presenta');
igual(Plantilla.resolver('<<IF([BATERIA INFLADA] ="NO", "✓", "")>>', DATOS), '✓', 'sí / no');
igual(Plantilla.resolver('<<IF([CLAXON] ="bueno", "✓", "")>>', DATOS), '✓', 'compara sin importar mayúsculas');

console.log('3. Bloques de las llantas (<<If:(cond)>> … <<EndIf>>)');
// En la plantilla real, el mismo valor va en una columna u otra según el desgaste
const LLANTA_DD = '<<If:([LLANTA DD] <= 1.6)>> <<[LLANTA DD]>> <<EndIf>>' +
  '<<If:(AND([LLANTA DD] >= 1.7, [LLANTA DD] <= 4.0))>> <<[LLANTA DD]>> <<EndIf>>' +
  '<<If:([LLANTA DD] >= 4.1)>> <<[LLANTA DD]>> <<EndIf>>';
igual(Plantilla.resolver(LLANTA_DD, DATOS).trim(), '1.4', '1.4 mm cae solo en el primer rango');
igual(Plantilla.resolver(LLANTA_DD.replace(/LLANTA DD/g, 'LLANTA DI'), DATOS).trim(), '3.2',
  '3.2 mm cae en el rango de en medio (AND con dos comparaciones)');
igual(Plantilla.resolver(LLANTA_DD.replace(/LLANTA DD/g, 'LLANTA TD'), DATOS).trim(), '5',
  '5.0 mm cae en el último rango');
igual(Plantilla.resolver('<<If:([LLANTA DD] >= 4.1)>>NO DEBE SALIR<<EndIf>>', DATOS), '',
  'lo que no se cumple desaparece por completo');
igual(Plantilla.resolver('<<If:([SIN DATO] <= 1.6)>>X<<EndIf>>', DATOS), '',
  'sin valor que comparar, el bloque no aparece');

console.log('4. Otras funciones');
igual(Plantilla.resolver('<<UPPER([OBSERVACIONES FINALES])>>', DATOS), 'SIN NOVEDAD', 'UPPER');
igual(Plantilla.resolver('<<[M 0,50] * 0.50>>', DATOS), '4', 'multiplicación del arqueo (8 monedas × 0.50)');
igual(Plantilla.resolver('<<[M 0,50] * 20>>', DATOS), '160', 'multiplicación con resultado entero');

console.log('5. Seguridad: lo que no se entiende NO se deja pasar en silencio');
let error = null;
try { Plantilla.resolver('<<ALGUNA_FUNCION_RARA([X])>>', DATOS); } catch (e) { error = e; }
ok(error && error.message.includes('no soportado'),
  'un marcador desconocido lanza error (un documento a medias sin avisar sería peor)');
error = null;
try { Plantilla.resolver('<<IF([CLAXON], "✓")>>', DATOS); } catch (e) { error = e; }
ok(error && error.message.includes('3 partes'), 'un IF mal escrito también avisa');

console.log('6. Utilidades para el módulo');
const trozo = '<<[RESPONSABLE]>> <<IF([CLAXON] ="BUENO", "✓", "")>> <<If:([LLANTA DD] <= 1.6)>><<[LLANTA DD]>><<EndIf>>';
const campos = Plantilla.camposDe(trozo);
ok(campos.join() === 'CLAXON,LLANTA DD,RESPONSABLE', 'camposDe dice qué datos pide una plantilla');
ok(Plantilla.marcadores(trozo).length === 5, 'marcadores enumera lo que hay que sustituir');

console.log('7. El checklist sale de la propia plantilla (secciones, piezas y opciones)');
// Estructura igual a la de los formatos reales: título con peso, encabezados de columna
// y luego cada pieza con un IF por opción
const FORMATO = [
  'FORMATO DE INSPECCIÓN VEHICULARFecha:<<[FECHA]>>Responsable:<<RESPONSABLE>>',
  'Documentación 5%PresentaNo presentaN/A',
  'Gafette<<IF([GAFETTE] ="PRESENTA", "✓", "")>><<IF([GAFETTE] ="NO PRESENTA", "✓", "")>><<IF([GAFETTE] ="N/A", "✓", "")>>',
  'Licencia<<IF([LICENCIA] ="PRESENTA", "✓", "")>><<IF([LICENCIA] ="NO PRESENTA", "✓", "")>><<IF([LICENCIA] ="N/A", "✓", "")>>',
  'Cristalería 10%BuenoRegularMalo',
  'Parabrisas<<IF([PARABRISAS] ="BUENO", "✓", "")>><<IF([PARABRISAS] ="REGULAR", "✓", "")>><<IF([PARABRISAS] ="MALO", "✓", "")>>',
  'Neumáticos 15%BuenoRegularMaloN/A',
  'Rines<<IF([RINES] ="BUENO", "✓", "")>><<IF([RINES] ="REGULAR", "✓", "")>><<IF([RINES] ="MALO", "✓", "")>><<IF([RINES] ="N/A", "✓", "")>>',
].join('');

const secciones = Plantilla.seccionesDe(FORMATO);
ok(secciones.length === 3, 'encuentra las secciones del checklist');
igual(secciones[0].titulo, 'Documentación', 'toma el nombre de la sección');
igual(String(secciones[0].peso), '5', 'y su peso, que sirve para calcular el puntaje');
igual(secciones.map((s) => s.campos.length).join(), '2,1,1', 'cada pieza queda en su sección');
igual(secciones[0].campos[0].campo, 'GAFETTE', 'la pieza conserva el nombre de la columna de la hoja');
igual(secciones[0].campos[0].opciones.join(' / '), 'PRESENTA / NO PRESENTA / N/A',
  'las opciones salen de la plantilla, en el orden impreso');
igual(secciones[1].campos[0].opciones.join(' / '), 'BUENO / REGULAR / MALO',
  'otra sección puede tener otras opciones');
igual(secciones[2].campos[0].opciones.join(' / '), 'BUENO / REGULAR / MALO / N/A',
  'y otra puede incluir N/A');
ok(secciones.reduce((n, s) => n + s.peso, 0) === 30, 'los pesos se pueden sumar (en los formatos reales dan 100%)');
ok(Plantilla.seccionesDe('').length === 0 && Plantilla.seccionesDe(null).length === 0, 'sin texto no truena');
// Los datos de cabecera NO son parte del checklist
ok(!secciones.some((s) => s.campos.some((c) => c.campo === 'FECHA' || c.campo === 'RESPONSABLE')),
  'los datos de la cabecera no se cuelan como piezas del checklist');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

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

// Utilities.formatDate de verdad (con Intl, no con los getters de Date: en Apps Script V8 esos
// getters leen en UTC sin importar la zona del proyecto -- justo el bug que se está probando).
contexto.Session.getScriptTimeZone = () => 'America/Mexico_City';
contexto.Utilities.formatDate = (f, zona, patron) => {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = {};
  dtf.formatToParts(f).forEach((x) => { p[x.type] = x.value; });
  const hh = p.hour === '24' ? '00' : p.hour;
  return patron.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
    .replace('HH', hh).replace('mm', p.minute).replace('ss', p.second);
};
// Una hora de Ciudad de México (fija en UTC-6, sin horario de verano) como instante exacto, sin
// depender de en qué zona corra esta prueba -- new Date(aaaa, mm, dd, hh) sí depende de esa zona.
const mx = (anio, mes, dia, hora, min, seg) => new Date(Date.UTC(anio, mes - 1, dia, (hora || 0) + 6, min || 0, seg || 0));

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
igual(PdfService.fechaParaNombre(mx(2026, 9, 17, 10, 0, 0)), '2026-09-17', 'desde una fecha, en la mañana');
igual(PdfService.fechaParaNombre(mx(2026, 7, 29, 23, 30, 0)), '2026-07-29',
  'capturada ya noche (23:30 en México) sigue fechada ESE día -- antes, al leerla en UTC, salía ya al día siguiente');
igual(PdfService.fechaParaNombre('17/09/2026'), '2026-09-17', 'desde "dd/mm/aaaa", como lo deja AppSheet (sin hora: no depende de la zona)');
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

console.log('5. Fechas en el documento: como las imprimía AppSheet');
const datos = PdfService.datosParaPlantilla_({
  FECHA: mx(2026, 9, 18, 9, 19, 53),
  'FECHA ULTIMO SERVICIO': mx(2026, 9, 14, 0, 0, 0),
  PLACAS: 'GGR658F', VOLTAJE: 12.6, VACIO: '',
});
igual(datos.FECHA, '18/09/2026 09:19:53', 'fecha con hora: "dd/mm/aaaa hh:mm:ss" (antes salía "Fri Sep 18 2026 … GMT-0600")');
igual(datos['FECHA ULTIMO SERVICIO'], '14/09/2026', 'fecha sin hora: solo el día');
ok(datos.PLACAS === 'GGR658F' && datos.VOLTAJE === 12.6 && datos.VACIO === '', 'lo que no es fecha pasa tal cual');

console.log('6. Formato de la copia: fuente y márgenes');
contexto.DocumentApp.ElementType = { TEXT: 'TEXT' };
const fuentes = [];
const texto = (t) => ({ getType: () => 'TEXT', asText() { return this; }, setFontFamily: (f) => fuentes.push([t, f]) });
const nodo = (hijos) => ({ getType: () => 'OTRO', getNumChildren: () => hijos.length, getChild: (i) => hijos[i] });
const margenes = {};
const body = Object.assign(nodo([texto('Fecha:'), nodo([nodo([texto('Parabrisas')])])]), {
  setMarginTop: (v) => { margenes.arriba = v; return body; },
  setMarginBottom: (v) => { margenes.abajo = v; return body; },
  setMarginLeft: (v) => { margenes.izquierda = v; return body; },
  setMarginRight: (v) => { margenes.derecha = v; return body; },
});
PdfService.aplicarFormato_(body, { fuente: 'Arial', margenes: { arriba: 27, abajo: 27, izquierda: 20, derecha: 20 } });
ok(fuentes.length === 2 && fuentes.every(([, f]) => f === 'Arial'), 'cambia la fuente de todo el texto, también dentro de las tablas');
ok(margenes.arriba === 27 && margenes.izquierda === 20 && margenes.derecha === 20, 'y pone los márgenes pedidos');

console.log('7. Tamaño de las imágenes: la regla de AppSheet (natural, salvo que no quepa en la celda)');
// Docs mide en pixeles (96 dpi) y el PDF en puntos (72): pt = px × 3/4
const enPt = (m) => Math.round(m.ancho * 0.75 * 10) / 10;
const medida = (natural, limites) => PdfService.medidaDeImagen_(natural, limites);
// Docs solo acepta pixeles enteros: medio punto de diferencia no se ve en el papel
const cerca = (a, b, texto) => ok(Math.abs(a - b) <= 0.5, `${texto}${Math.abs(a - b) <= 0.5 ? '' : `  (dio ${a}, se esperaba ${b})`}`);
igual(enPt(medida({ ancho: 390, alto: 179 }, { celda: 204.8 })), 204.8,
  'lateral de la RIFTER (390 px) en su celda de 204.8 pt: llena la celda, como AppSheet (205)');
igual(enPt(medida({ ancho: 161, alto: 168 }, { celda: 195.8 })), 120.8,
  'un dibujo más chico que la celda se queda de su tamaño (así salían los de la KWID: 121 pt)');
igual(enPt(medida({ ancho: 200, alto: 80 }, { celda: 258, ancho: 150, alto: 60 })), 150,
  'firma de 200 × 80 px: 150 × 60 pt, igual que en los PDF de AppSheet');
const firmaGrande = medida({ ancho: 900, alto: 300 }, { celda: 258, ancho: 150, alto: 60 });
ok(enPt(firmaGrande) <= 150 && firmaGrande.alto * 0.75 <= 60.5, 'una firma capturada en alta resolución cabe en su caja de 150 × 60');
cerca(enPt(medida({ ancho: 1200, alto: 600 }, {})), 200, 'fuera de una tabla y sin caja, se topa en 200 pt');
const lateral = medida({ ancho: 390, alto: 179 }, { celda: 204.8 });
ok(Math.abs(lateral.alto / lateral.ancho - 179 / 390) < 0.01, 'sin deformarla: conserva la proporción');

console.log('8. Ancho de la celda, medido en el documento');
contexto.DocumentApp.ElementType.TABLE_CELL = 'TABLE_CELL';
const tabla = { getColumnWidth: (i) => [59.2, 41.2, 128.2, 67.5][i] };
const fila = { getParentTable: () => tabla, getChildIndex: () => 1 };
const celda = {
  getType: () => 'TABLE_CELL', asTableCell() { return this; }, getParentRow: () => fila,
  getColSpan: () => 2, getWidth: () => 41.2, getPaddingLeft: () => 5, getPaddingRight: () => 5,
};
const parrafo = { getType: () => 'PARAGRAPH', getParent: () => celda };
cerca(PdfService.anchoDeCelda_(parrafo), 159.4, 'una celda combinada suma sus columnas (41.2 + 128.2) y resta su relleno');
igual(PdfService.anchoDeCelda_({ getType: () => 'PARAGRAPH', getParent: () => null }), null, 'fuera de una tabla no hay celda');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

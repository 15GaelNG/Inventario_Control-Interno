/**
 * Pruebas de CapitalHumano.identificar (src/services/CapitalHumano.gs): quién es quién a
 * partir de la lista de Capital Humano, donde cada renglón es un EMPLEO.
 *
 * Los casos salen de los datos reales (01/10/2026): recontrataciones con el mismo número,
 * números que CH reutiliza para otra persona, gente con dos números a la vez, homónimos, y
 * números anteriores que ya son de alguien más. Lo que más protege: que nunca se fundan dos
 * personas distintas, y que un ID ya dado nunca cambie.
 *
 * Correr: node tests/capital-humano.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

let fallas = 0;
function ok(condicion, descripcion) {
  console.log('  ' + (condicion ? '✔' : '✘') + ' ' + descripcion);
  if (!condicion) fallas++;
}

/** Hoja falsa con lo que CapitalHumano usa. */
function hojaFalsa(enc, filas) {
  const datos = [enc.slice()].concat(filas.map((f) => enc.map((c) => (c in f ? f[c] : ''))));
  let maxCols = Math.max(enc.length, 1);
  const h = {
    datos,
    protecciones: [],
    getLastRow: () => datos.length,
    getLastColumn: () => Math.max.apply(null, datos.map((r) => r.length).concat([0])),
    getMaxRows: () => Math.max(datos.length, 1000),
    insertRowsAfter: () => {},
    getRange: (f, c, nf, nc) => ({
      getDisplayValues: () => datos.slice(f - 1, f - 1 + (nf || 1)).map((r) => {
        const fila = r.slice(c - 1, c - 1 + (nc || 1)).map((x) => (x == null ? '' : String(x)));
        while (fila.length < (nc || 1)) fila.push('');
        return fila;
      }),
      getValues: () => datos.slice(f - 1, f - 1 + (nf || 1)).map((r) => r.slice(c - 1, c - 1 + (nc || 1))),
      // Como en Apps Script, regresa el rango para poder encadenar
      setValues(v) {
        v.forEach((r, i) => { datos[f - 1 + i] = (datos[f - 1 + i] || []).slice(); r.forEach((x, j) => { datos[f - 1 + i][c - 1 + j] = x; }); });
        maxCols = Math.max(maxCols, c - 1 + v[0].length);
        return this;
      },
      setFontWeight() { return this; },
      setNumberFormat() { return this; },
      setValue(v) { datos[f - 1] = (datos[f - 1] || []).slice(); datos[f - 1][c - 1] = v; maxCols = Math.max(maxCols, c); return this; },
    }),
    getMaxColumns: () => maxCols,
    insertColumnsAfter: (despues, n) => { maxCols += n; },
    deleteColumns: (desde, n) => { maxCols -= n; datos.forEach((r, i) => { datos[i] = r.slice(0, desde - 1).concat(r.slice(desde - 1 + n)); }); },
    clearContents: () => { datos.length = 0; },
    appendRow: (r) => { datos.push(r.slice()); },
    getProtections: () => h.protecciones,
    protect: () => { const p = { setWarningOnly() { p.aviso = true; return p; }, setDescription() { return p; } }; h.protecciones.push(p); return p; },
  };
  return h;
}

const ENC_CH = ['No EMPLEADO', 'NOMBRE COMPLETO', 'N. EMPLEADO ANTERIOR', 'FECHA DE NACIMIENTO', 'STATUS', 'RAZON SOCIAL'];

function cargar(hojas, anotados) {
  const ss = {
    getSheetByName: (n) => hojas[n] || null,
    insertSheet: (n) => { hojas[n] = hojaFalsa([], []); hojas[n].datos.length = 0; return hojas[n]; },
  };
  // ProtectionType, para proteger la pestaña al cargar
  ss.ProtectionType = { SHEET: 'SHEET' };
  const ctx = vm.createContext({
    Buffer,
    // Caché del servidor (src/utils/CacheHojas.gs): aquí no guarda nada
    CacheHojas: { tocar() {}, tocarHoja() {}, recordar: (clave, hojas, armar) => armar() },
    console,
    Logger: { log: () => {} },
    SpreadsheetApp: { openById: () => ss, ProtectionType: { SHEET: 'SHEET' } },
    LockService: { getScriptLock: () => ({ waitLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS_LAB', TELEFONIA: () => 'SS_LAB' } },
    // Solo lo que CapitalHumano usa de Relaciones: anotar en el log
    Relaciones: { anotar: (ss, entradas, quien) => { (anotados || []).push({ entradas: entradas, quien: quien }); } },
    Auth: { validarSesion: () => ({ correo: 'admin@cm.mx' }) },
    Permisos: { puedeEditar: () => ({ correo: 'admin@cm.mx' }), puedeLeer: () => ({ correo: 'admin@cm.mx' }) },
    // Lo que cargar() usa para recibir el archivo comprimido
    Utilities: {
      base64Decode: (t) => Buffer.from(t, 'base64'),
      newBlob: (bytes) => ({ bytes }),
      ungzip: (blob) => ({ getDataAsString: () => zlib.gunzipSync(blob.bytes).toString('utf8') }),
    },
  });
  const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
  vm.runInContext(lee('config', 'Entidades.gs'), ctx);
  vm.runInContext(lee('utils', 'Ids.gs'), ctx);
  // IDs predecibles para poder comparar
  vm.runInContext('Ids.nuevo = (p) => p + "-" + String(++globalThis.__n).padStart(4, "0");', Object.assign(ctx, { __n: 0 }));
  vm.runInContext(lee('MigracionIds.gs') + '\n' + lee('services', 'CapitalHumano.gs') + '\nthis.CH = CapitalHumano;', ctx);
  return ctx.CH;
}

/**
 * El ID PERSONA de cada empleo, leído de COLABORADORES ACTUALIZADO (desde el 12-oct-2026 vive ahí, en su columna).
 * { 'NUMERO|NOMBRE': { id, ids: [los de cada renglón de ese empleo] } }
 */
function personas(hojas) {
  const h = hojas['COLABORADORES ACTUALIZADO'];
  const [enc, ...filas] = h.datos;
  const iId = enc.indexOf('ID PERSONA');
  const out = {};
  if (iId === -1) return out;
  filas.forEach((r) => {
    const k = r[enc.indexOf('No EMPLEADO')] + '|' + r[enc.indexOf('NOMBRE COMPLETO')];
    out[k] = out[k] || { id: r[iId] || '', ids: [] };
    out[k].ids.push(r[iId] || '');
  });
  return out;
}

function escenario() {
  return {
    'COLABORADORES ACTUALIZADO': hojaFalsa(ENC_CH, [
      // recontratación: mismo número, mismo nombre, dos renglones
      { 'No EMPLEADO': 'CIB00223', 'NOMBRE COMPLETO': 'PERLA CRUZ', 'FECHA DE NACIMIENTO': '01/01/1990', STATUS: 'Baja' },
      { 'No EMPLEADO': 'CIB00223', 'NOMBRE COMPLETO': 'PERLA CRUZ', 'FECHA DE NACIMIENTO': '01/01/1990', STATUS: 'Activo' },
      // número reutilizado por CH: dos personas distintas
      { 'No EMPLEADO': 'HA00059', 'NOMBRE COMPLETO': 'FRANCISCO RAMIREZ', 'FECHA DE NACIMIENTO': '02/02/1980', STATUS: 'Baja' },
      { 'No EMPLEADO': 'HA00059', 'NOMBRE COMPLETO': 'VANESSA LLERA', 'FECHA DE NACIMIENTO': '03/03/1995', STATUS: 'Activo' },
      // dos números a la vez, sin liga en la hoja: mismo nombre y misma fecha de nacimiento
      { 'No EMPLEADO': 'HA00241', 'NOMBRE COMPLETO': 'JUAN FULGENCIO', 'FECHA DE NACIMIENTO': '04/04/1985', STATUS: 'Activo', 'RAZON SOCIAL': 'CENTRO' },
      { 'No EMPLEADO': 'VALLE02922', 'NOMBRE COMPLETO': 'JUAN FULGENCIO', 'FECHA DE NACIMIENTO': '04/04/1985', STATUS: 'Activo', 'RAZON SOCIAL': 'VALLE' },
      // homónimos: mismo nombre, otra fecha de nacimiento
      { 'No EMPLEADO': 'AC00001', 'NOMBRE COMPLETO': 'JOSE LOPEZ', 'FECHA DE NACIMIENTO': '05/05/1970', STATUS: 'Activo' },
      { 'No EMPLEADO': 'AC00002', 'NOMBRE COMPLETO': 'JOSE LOPEZ', 'FECHA DE NACIMIENTO': '06/06/1999', STATUS: 'Activo' },
      // número anterior que NO está en la hoja: se registra para la persona
      { 'No EMPLEADO': 'FRO01353', 'NOMBRE COMPLETO': 'ANA PEREZ', 'N. EMPLEADO ANTERIOR': 'AC00255', 'FECHA DE NACIMIENTO': '07/07/1992', STATUS: 'Activo' },
      // número anterior que ya es de OTRA persona en la hoja: no se juntan
      { 'No EMPLEADO': 'IPQ00309', 'NOMBRE COMPLETO': 'LUIS SOTO', 'N. EMPLEADO ANTERIOR': 'AC00001', 'FECHA DE NACIMIENTO': '08/08/1988', STATUS: 'Activo' },
      // sin fecha de nacimiento: nunca se junta por nombre
      { 'No EMPLEADO': 'PTE00001', 'NOMBRE COMPLETO': 'MARIA GOMEZ', STATUS: 'Activo' },
      { 'No EMPLEADO': 'PTE00002', 'NOMBRE COMPLETO': 'MARIA GOMEZ', STATUS: 'Activo' },
    ]),
  };
}

console.log('1. El ensayo cuenta y no escribe');
{
  const hojas = escenario();
  const r = cargar(hojas).identificar();
  ok(!hojas['PERSONAS'] && hojas['COLABORADORES ACTUALIZADO'].datos[0].indexOf('ID PERSONA') === -1, 'no escribe nada');
  // CIB00223(1) + Francisco(1) + Vanessa(1) + Juan(1) + 2 José + Ana(1) + Luis(1) + 2 María = 10
  ok(/ 10 personas \(10 nuevas\)/.test(r), 'salen 10 personas de 12 renglones: ' + (r.match(/\d+ personas .*/) || [''])[0]);
  ok(/ 1 números usados por más de una persona \(ambiguos\) — HA00059/.test(r), 'HA00059 queda marcado como ambiguo');
  ok(/IPQ00309 \(LUIS SOTO\) dice que su número anterior es AC00001, pero en la lista AC00001 es de JOSE LOPEZ/.test(r),
    'avisa del número anterior que ya es de otra persona');
}

console.log('\n2. Escribiendo: quién quedó con quién (en la columna ID PERSONA de la misma lista)');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const p = personas(hojas);
  ok(hojas['COLABORADORES ACTUALIZADO'].datos[0].indexOf('ID PERSONA') !== -1 && !hojas['PERSONAS'],
    'crea la columna ID PERSONA en la lista de CH (no otra pestaña)');
  ok(p['CIB00223|PERLA CRUZ'].ids.length === 2 && p['CIB00223|PERLA CRUZ'].ids[0] === p['CIB00223|PERLA CRUZ'].ids[1],
    'la recontratación: sus dos renglones con el mismo ID');
  ok(p['HA00059|FRANCISCO RAMIREZ'].id !== p['HA00059|VANESSA LLERA'].id, 'el número reutilizado son DOS personas');
  ok(p['HA00241|JUAN FULGENCIO'].id === p['VALLE02922|JUAN FULGENCIO'].id, 'Juan con dos números es UNA persona');
  ok(p['AC00001|JOSE LOPEZ'].id !== p['AC00002|JOSE LOPEZ'].id, 'los homónimos son dos personas');
  ok(CH.idPara('VEHICULOS', { 'NO EMPLEADO': 'AC00255' }) === p['FRO01353|ANA PEREZ'].id,
    'el número anterior que no está en la lista sigue encontrando a su persona (por N. EMPLEADO ANTERIOR)');
  ok(p['IPQ00309|LUIS SOTO'].id !== p['AC00001|JOSE LOPEZ'].id, 'Luis no se fundió con José por el número anterior');
  ok(p['PTE00001|MARIA GOMEZ'].id !== p['PTE00002|MARIA GOMEZ'].id, 'sin fecha de nacimiento, el nombre solo no junta');
  ok(Object.keys(p).every((k) => /^PER-/.test(p[k].id)), 'todos con su ID PER-');
}

console.log('\n3. Un ID dado nunca cambia; correr otra vez no agrega nada');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const antes = JSON.stringify(personas(hojas));
  const r = CH.identificar({ escribir: true });
  ok(JSON.stringify(personas(hojas)) === antes, 'ningún ID cambió');
  ok(/ 0 empleos por identificar/.test(r), 'y el reporte dice que no hay nada por identificar');
}

console.log('\n4. Un pegado nuevo: el empleo nuevo de alguien conocido toma su ID');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const idJuan = personas(hojas)['HA00241|JUAN FULGENCIO'].id;
  // CH manda una versión nueva: Juan asciende y le dan un tercer número
  hojas['COLABORADORES ACTUALIZADO'].datos.push(['CIB09999', 'JUAN FULGENCIO', 'VALLE02922', '04/04/1985', 'Activo', 'CENTRO']);
  CH.identificar({ escribir: true });
  const p = personas(hojas);
  ok(p['CIB09999|JUAN FULGENCIO'] && p['CIB09999|JUAN FULGENCIO'].id === idJuan, 'el número nuevo de Juan es la misma persona');
}

console.log('\n5. Si un pegado nuevo hace parecer que dos personas con ID son una, no se toca');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const p0 = personas(hojas);
  // Ahora CH dice que AC00002 tuvo antes el número AC00001: las dos José ya tenían ID distinto
  hojas['COLABORADORES ACTUALIZADO'].datos.push(['AC00003', 'JOSE LOPEZ', '', '05/05/1970', 'Activo', '']);
  hojas['COLABORADORES ACTUALIZADO'].datos.push(['AC00004', 'JOSE LOPEZ', '', '06/06/1999', 'Activo', '']);
  const r = CH.identificar({ escribir: true });
  const p = personas(hojas);
  ok(p['AC00001|JOSE LOPEZ'].id === p0['AC00001|JOSE LOPEZ'].id && p['AC00002|JOSE LOPEZ'].id === p0['AC00002|JOSE LOPEZ'].id,
    'los IDs de antes no cambiaron');
  ok(p['AC00003|JOSE LOPEZ'].id === p0['AC00001|JOSE LOPEZ'].id && p['AC00004|JOSE LOPEZ'].id === p0['AC00002|JOSE LOPEZ'].id,
    'y los números nuevos se fueron con su José, por la fecha de nacimiento');
  ok(!/Conflictos/.test(r), 'sin conflictos');
}

console.log('\n5b. Un renglón nuevo que liga a dos personas con ID distinto: conflicto, no se toca');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const p0 = personas(hojas);
  // José #2 (nacido el 06/06/1999) con un número nuevo que dice venir de AC00001, que es de José #1
  hojas['COLABORADORES ACTUALIZADO'].datos.push(['AC00005', 'JOSE LOPEZ', 'AC00001', '06/06/1999', 'Activo', '']);
  const r = CH.identificar({ escribir: true });
  const p = personas(hojas);
  ok(/ 1 conflictos/.test(r) && /ya tienen IDs distintos/.test(r), 'lo reporta como conflicto');
  ok(p['AC00005|JOSE LOPEZ'].id === '', 'el renglón que los ligaría se queda sin ID');
  ok(p['AC00001|JOSE LOPEZ'].id === p0['AC00001|JOSE LOPEZ'].id && p['AC00002|JOSE LOPEZ'].id === p0['AC00002|JOSE LOPEZ'].id,
    'y nadie cambió de ID');
}

console.log('\n6. Columnas sensibles en la hoja pegada');
{
  const hojas = escenario();
  const h = hojas['COLABORADORES ACTUALIZADO'];
  h.datos[0] = h.datos[0].concat(['NÚMERO DE CUENTA', 'TELEFONO', 'CLABE', 'CURP']);
  // Solo entran las PERMITIDAS: el TELEFONO sí (12-oct-2026); la cuenta, la CLABE y el CURP no
  const r = cargar(hojas).identificar();
  ok(/datos sensibles que no deben estar en el libro: NÚMERO DE CUENTA, CLABE, CURP\./.test(r),
    'avisa que hay que quitar la cuenta, la CLABE y el CURP (el teléfono no)');
}

console.log('\n7. El catálogo: la hoja de CH es externa y PERSONAS es el catálogo de IDs (PER-)');
{
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'Entidades.gs'), 'utf8') + ';this.E=Entidades', ctx);
  ok(ctx.E.de('COLABORADORES ACTUALIZADO').externa && ctx.E.de('COLABORADORES ACTUALIZADO').familia === 'capitalhumano', 'COLABORADORES ACTUALIZADO: externa, de Capital Humano');
  ok(ctx.E.de('PERSONAS').delSistemaNuevo && ctx.E.prefijo('PERSONAS') === 'PER', 'PERSONAS: del sistema nuevo, IDs PER-');
}

// ================================================ ligar responsables (ID PERSONA)

/** El escenario de arriba ya identificado, más las tres hojas que se ligan. */
function escenarioLigas() {
  const hojas = escenario();
  hojas['COLABORADORES ACTUALIZADO'].datos[0].push('CORREO EMPRESARIAL');
  hojas['COLABORADORES ACTUALIZADO'].datos.forEach((r, i) => { if (i) r.push(r[1] === 'VANESSA LLERA' ? 'vanessa@cm.mx' : ''); });
  cargar(hojas).identificar({ escribir: true });
  hojas['VEHICULOS'] = hojaFalsa(['ID', 'FOLIO', 'RESPONSABLE VEHICULO', 'NO EMPLEADO'], [
    { FOLIO: 'AUT0001', 'RESPONSABLE VEHICULO': 'Juan Fulgencio', 'NO EMPLEADO': 'HA00241' },       // nombre único
    { FOLIO: 'AUT0002', 'RESPONSABLE VEHICULO': 'PERLA CRUZ', 'NO EMPLEADO': 'HA00059' },            // número de OTRA persona: manda el nombre
    { FOLIO: 'AUT0003', 'RESPONSABLE VEHICULO': 'JOSE LOPEZ', 'NO EMPLEADO': 'AC00002' },            // homónimos: el número desempata
    { FOLIO: 'AUT0004', 'RESPONSABLE VEHICULO': 'JOSE LOPEZ', 'NO EMPLEADO': '' },                   // homónimos sin desempate
    { FOLIO: 'AUT0005', 'RESPONSABLE VEHICULO': 'BAJA VEHICULAR' },                                  // no es una persona: normal
    { FOLIO: 'AUT0006', 'RESPONSABLE VEHICULO': 'ANA PEREZ / LUIS SOTO' },                           // varias personas
    { FOLIO: 'AUT0007', 'RESPONSABLE VEHICULO': 'LIC. ANA PÉREZ' },                                  // título y acento
    { FOLIO: 'AUT0008', 'RESPONSABLE VEHICULO': 'FULANO DE TAL' },                                    // no está en CH
  ]);
  hojas['CAJAS CHICAS'] = hojaFalsa(['ID', 'ID CCH', 'RESPONSABLE DE CAJA CHICA', 'CORREO ELECTRONICO DE RESPONSABLE'], [
    { 'ID CCH': '1', 'RESPONSABLE DE CAJA CHICA': 'V. LLERA', 'CORREO ELECTRONICO DE RESPONSABLE': 'Vanessa@cm.mx' },  // por correo
  ]);
  hojas['LINEAS TELEFONICAS'] = hojaFalsa(['ID', 'NUCO', 'RESPONSABLE', 'NO EMPLEADO', 'EMAIL USUARIO'], [
    { NUCO: '451', RESPONSABLE: 'DS0054' },                                                           // código: normal
  ]);
  return hojas;
}
const colDe = (hoja, col) => hoja.datos.slice(1).map((r) => r[hoja.datos[0].indexOf(col)]);

console.log('\n8. La cascada: nombre primero, el número solo desempata');
{
  const hojas = escenarioLigas();
  const p = personas(hojas);
  const r = cargar(hojas).revisarLigas({ detalle: true });
  const v = r['VEHICULOS (persona)'];
  const por = (folio) => v.entradas.filter((e) => e.dueno === folio)[0];
  ok(por('AUT0001').tipo === 'DIFERENCIA' && por('AUT0001').quedo.indexOf('JUAN FULGENCIO') === 0, 'nombre sin mayúsculas: Juan');
  ok(por('AUT0002').quedo.indexOf('PERLA CRUZ') === 0, 'el número es de otra persona, pero manda el nombre: Perla');
  ok(por('AUT0003').quedo.indexOf('JOSE LOPEZ · AC00002') === 0, 'homónimos: el número desempata');
  ok(por('AUT0004').tipo === 'CLAVE_DUPLICADA_EN_ORIGEN', 'homónimos sin número: no se adivina');
  ok(por('AUT0005').tipo === 'SIN_DUENO_ESPERADO', 'BAJA VEHICULAR no es una persona: normal');
  ok(por('AUT0006').tipo === 'HUERFANO' && /varias personas/.test(por('AUT0006').motivo), 'dos personas en la celda: a mano');
  ok(por('AUT0007').quedo.indexOf('ANA PEREZ') === 0, 'sin título ni acento: Ana');
  ok(por('AUT0008').tipo === 'HUERFANO' && /no está en la lista/.test(por('AUT0008').motivo), 'quien no está en CH: a mano');
  ok(r['CAJAS CHICAS (persona)'].entradas[0].quedo.indexOf('VANESSA LLERA') === 0, 'Caja Chica: por correo, aunque el nombre venga abreviado');
  ok(r['LINEAS TELEFONICAS (persona)'].entradas[0].tipo === 'SIN_DUENO_ESPERADO', 'Líneas: un código de desarrollo no es una persona');
  ok(v.diferencias === 4 && !hojas['VEHICULOS'].datos[0].includes('ID PERSONA'), 'el ensayo cuenta 4 por ligar y no crea la columna');
  ok(p['HA00241|JUAN FULGENCIO'].id !== '', '(la lista ya tiene sus IDs)');
}

console.log('\n9. Escribiendo: crea la columna, liga, y nunca borra un ID con vacío');
{
  const hojas = escenarioLigas();
  const anotados = [];
  const CH = cargar(hojas, anotados);
  CH.revisarLigas({ escribir: true, quien: 'AYRTON' });
  const veh = hojas['VEHICULOS'];
  const ids = colDe(veh, 'ID PERSONA');
  const p = personas(hojas);
  ok(veh.datos[0].indexOf('ID PERSONA') !== -1, 'creó la columna ID PERSONA');
  ok(ids[0] === p['HA00241|JUAN FULGENCIO'].id && ids[2] === p['AC00002|JOSE LOPEZ'].id, 'escribió los IDs de su persona');
  ok(ids[3] === '' && ids[4] === '' && ids[7] === '', 'los que no se ligan quedan vacíos');
  // 2, no 3: Líneas solo traía un código de desarrollo, que es normal; no había nada que escribir
  ok(anotados.length === 2 && anotados.every((a) => a.quien === 'AYRTON'), 'cada hoja que cambió anotó en el log quién lo hizo');
  // Ahora el responsable de AUT0001 cambia a alguien que no está en CH: su ID anterior NO se borra
  veh.datos[1][veh.datos[0].indexOf('RESPONSABLE VEHICULO')] = 'NADIE CONOCIDO';
  const r2 = CH.revisarLigas({ escribir: true, detalle: true });
  ok(colDe(veh, 'ID PERSONA')[0] === p['HA00241|JUAN FULGENCIO'].id, 'un responsable que ya no se liga no borra el ID que había');
  ok(r2['VEHICULOS (persona)'].entradas.some((e) => e.dueno === 'AUT0001' && e.tipo === 'HUERFANO'), 'y se avisa para corregir a mano');
}

console.log('\n9b. Bitácora vs caché: en una bitácora solo se llena el ID que falta; el que ya está, se queda (13-oct)');
{
  const hojas = escenarioLigas();
  const p = personas(hojas);
  const otro = p['AC00001|JOSE LOPEZ'].id;
  hojas['TICKETS'] = hojaFalsa(['ID', 'TICKET', 'SOLICITANTE', 'ID PERSONA'], [
    { TICKET: 'T-1', SOLICITANTE: 'PERLA CRUZ', 'ID PERSONA': '' },        // vacío: se llena
    { TICKET: 'T-2', SOLICITANTE: 'PERLA CRUZ', 'ID PERSONA': otro },      // el del día dice otra persona: se queda
  ]);
  // VEHICULOS es caché: un ID que ya no es el de su responsable SÍ se corrige
  const veh = hojas['VEHICULOS'];
  veh.datos[0].push('ID PERSONA');
  veh.datos.forEach((r, i) => { if (i) r.push(i === 1 ? otro : ''); });
  const CH = cargar(hojas);
  const ensayo = CH.revisarLigas({ detalle: true });
  const t = ensayo['TICKETS (solicitante)'];
  ok(t.diferencias === 1 && t.diferenciasHistoricas === 1, 'TICKETS: 1 por llenar y 1 histórico: ' + JSON.stringify([t.diferencias, t.diferenciasHistoricas]));
  ok(t.entradas.some((e) => e.tipo === 'DIFERENCIA_HISTORICA' && e.dueno === 'T-2'), 'el histórico sale como «Todo bien», no como «Actualizar»');
  CH.revisarLigas({ escribir: true });
  const ids = colDe(hojas['TICKETS'], 'ID PERSONA');
  ok(ids[0] === p['CIB00223|PERLA CRUZ'].id, 'el vacío se llenó con su persona');
  ok(ids[1] === otro, 'el que ya estaba no se tocó (es quien pidió ese día)');
  ok(colDe(veh, 'ID PERSONA')[0] === p['HA00241|JUAN FULGENCIO'].id, 'en VEHICULOS (caché) el ID viejo sí se corrigió a su responsable de hoy');
}

console.log('\n9c. Dos personas en una hoja: cada una en su columna (13-oct: Reasignaciones e Inspección)');
{
  const hojas = escenarioLigas();
  const p = personas(hojas);
  const CH = cargar(hojas);
  // Al guardar: las dos se calculan; los IDs que mande el cliente se ignoran
  const reas = CH.conPersona('REASIGNACIONES_VEHICULOS', { 'Responsable Entrante': 'PERLA CRUZ', 'Responsable Saliente': 'JUAN FULGENCIO',
    'No Empleado Saliente': 'HA00241', 'ID PERSONA SALIENTE': 'PER-TRAMPA' });
  ok(reas['ID PERSONA'] === p['CIB00223|PERLA CRUZ'].id && reas['ID PERSONA SALIENTE'] === p['HA00241|JUAN FULGENCIO'].id,
    'reasignación: el entrante en ID PERSONA y el saliente en ID PERSONA SALIENTE');
  const insp = CH.conPersona('INSPECCION VEHICULAR', { CONDUCTOR: 'PERLA CRUZ', RESPONSABLE: 'JUAN FULGENCIO' });
  ok(insp['ID PERSONA CONDUCTOR'] === p['CIB00223|PERLA CRUZ'].id && insp['ID PERSONA RESPONSABLE'] === p['HA00241|JUAN FULGENCIO'].id,
    'inspección: el conductor y el responsable, cada uno en su columna');
  const solo = CH.conPersona('INSPECCION VEHICULAR', { CONDUCTOR: 'PERLA CRUZ' }, { CONDUCTOR: 'PERLA CRUZ', RESPONSABLE: 'JUAN FULGENCIO' });
  ok(!('ID PERSONA RESPONSABLE' in solo) && solo['ID PERSONA CONDUCTOR'], 'si solo cambia el conductor, el ID del responsable no se toca');
  ok(CH.columnaPara('INSPECCION VEHICULAR') === 'ID PERSONA CONDUCTOR', 'la liga principal sigue siendo la misma (columnaPara)');
  // Salud: cada liga es su propia tarjeta y escribe su propia columna
  hojas['REASIGNACIONES_VEHICULOS'] = hojaFalsa(['ID', 'Responsable Entrante', 'No Empleado Entrante', 'Responsable Saliente', 'No Empleado Saliente'], [
    { ID: 'RVE-1', 'Responsable Entrante': 'PERLA CRUZ', 'Responsable Saliente': 'JUAN FULGENCIO' },
  ]);
  const r = CH.revisarLigas({ detalle: true });
  ok(r['REASIGNACIONES (persona entrante)'].diferencias === 1 && r['REASIGNACIONES (persona saliente)'].diferencias === 1,
    'Salud ve dos tarjetas en Reasignaciones (entrante y saliente)');
  CH.revisarLigas({ escribir: true, hojas: ['REASIGNACIONES (persona saliente)'] });
  const h = hojas['REASIGNACIONES_VEHICULOS'];
  ok(colDe(h, 'ID PERSONA SALIENTE')[0] === p['HA00241|JUAN FULGENCIO'].id && h.datos[0].indexOf('ID PERSONA') === -1,
    'actualizar la del saliente crea y llena solo ID PERSONA SALIENTE');
}

console.log('\n10. Actualizar solo los seleccionados');
{
  const hojas = escenarioLigas();
  cargar(hojas).revisarLigas({ escribir: true, hojas: ['VEHICULOS (persona)'], filas: [2] });
  const ids = colDe(hojas['VEHICULOS'], 'ID PERSONA');
  ok(!!ids[0] && !ids[1] && !ids[2], 'solo el renglón 2 (AUT0001) quedó ligado');
  ok(!hojas['CAJAS CHICAS'].datos[0].includes('ID PERSONA'), 'y no tocó las otras hojas');
}

console.log('\n11. idPara: lo que usan Vehículos y Caja Chica al guardar');
{
  const hojas = escenarioLigas();
  const CH = cargar(hojas);
  const p = personas(hojas);
  ok(CH.idPara('VEHICULOS', { 'RESPONSABLE VEHICULO': 'PERLA CRUZ' }) === p['CIB00223|PERLA CRUZ'].id, 'el responsable de un vehículo');
  ok(CH.idPara('VEHICULOS', { 'RESPONSABLE VEHICULO': 'NADIE' }) === '', 'vacío si no se liga');
  ok(CH.idPara('HOLOGRAMAS', {}) === null, 'null para una hoja que no se liga');
  ok(CH.columnasDePersona('CAJAS CHICAS').join() === 'RESPONSABLE DE CAJA CHICA,CORREO ELECTRONICO DE RESPONSABLE',
    'las columnas que cambian a la persona de una caja');
  ok(cargar(escenario()).idPara('VEHICULOS', { 'RESPONSABLE VEHICULO': 'PERLA CRUZ' }) === null,
    'null si la lista todavía no tiene IDs: no se toca nada');
  ok(CH.columnaPara('INSPECCION VEHICULAR') === 'ID PERSONA CONDUCTOR' && CH.columnaPara('UBER') === 'ID PERSONA',
    'cada hoja con su columna (la inspección guarda la del conductor)');
}

console.log('\n12. conPersona: el ID se calcula al guardar, nunca lo manda el cliente');
{
  const hojas = escenarioLigas();
  const CH = cargar(hojas);
  const p = personas(hojas);
  const nueva = CH.conPersona('ASIGNACIONES', { RESPONSABLE: 'Vanessa Llera', 'NO EMPLEADO': 'HA00059', 'ID PERSONA': 'PER-TRAMPA' });
  ok(nueva['ID PERSONA'] === p['HA00059|VANESSA LLERA'].id, 'una asignación de Líneas con su persona (el ID que mandó el cliente se ignora)');
  const sinCambio = CH.conPersona('VEHICULOS', { PLACA: 'ABC123', 'ID PERSONA': 'PER-TRAMPA' }, { 'RESPONSABLE VEHICULO': 'PERLA CRUZ' });
  ok(!('ID PERSONA' in sinCambio), 'si no cambia la persona, no se toca su ID');
  const insp = CH.conPersona('INSPECCION VEHICULAR', { CONDUCTOR: 'JUAN FULGENCIO' });
  ok(insp['ID PERSONA CONDUCTOR'] === p['HA00241|JUAN FULGENCIO'].id, 'la inspección: el ID del conductor en su columna');
}

// ================================================ cargar la lista desde Administración > Capital humano

/** Lo que manda el navegador: { encabezados, filas } en JSON, comprimido y en base64 */
const archivo = (encabezados, filas) => zlib.gzipSync(Buffer.from(JSON.stringify({ encabezados, filas }), 'utf8')).toString('base64');
const ENC_ARCHIVO = ['No EMPLEADO', 'NOMBRE COMPLETO', 'N. EMPLEADO ANTERIOR', 'FECHA DE NACIMIENTO', 'STATUS', 'RAZON SOCIAL', 'FECHA DE INGRESO',
  'TELEFONO', 'NÚMERO DE CUENTA'];
/** La lista del escenario como la mandaría CH, más renglones nuevos, en OTRO orden (al revés) */
function archivoDelEscenario(hojas, extra) {
  const [enc, ...filas] = hojas['COLABORADORES ACTUALIZADO'].datos;
  const de = (r, c) => (enc.indexOf(c) === -1 ? '' : r[enc.indexOf(c)]);
  const rs = filas.map((r) => ENC_ARCHIVO.map((c) => (c === 'TELEFONO' ? '5512345678' : c === 'NÚMERO DE CUENTA' ? '0123456789' : de(r, c))));
  return rs.reverse().concat(extra || []);
}

console.log('\n13. cargar: el ensayo cuenta y no escribe');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const antes = JSON.stringify(hojas['COLABORADORES ACTUALIZADO'].datos);
  const r = CH.cargar('tok', archivo(ENC_ARCHIVO, archivoDelEscenario(hojas,
    [['CIB05000', 'NUEVA PERSONA', '', '09/09/2000', 'Activo', 'CENTRO', '', '5500000000', '999']])));
  ok(r.ensayo && r.nuevos === 1 && r.empleosNuevos === 1 && r.personasNuevas === 1 && r.faltan === 0,
    'un renglón nuevo, una persona nueva, nadie falta: ' + JSON.stringify([r.nuevos, r.empleosNuevos, r.personasNuevas, r.faltan]));
  ok(JSON.stringify(hojas['COLABORADORES ACTUALIZADO'].datos) === antes, 'no tocó la hoja');
  ok(r.quitadas.join() === 'NÚMERO DE CUENTA', 'avisa que la cuenta no entra (el teléfono sí)');
}

console.log('\n14. cargar: cada ID se queda con su empleo aunque el archivo venga en otro orden');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const p0 = personas(hojas);
  CH.cargar('tok', archivo(ENC_ARCHIVO, archivoDelEscenario(hojas,
    [['CIB09999', 'JUAN FULGENCIO', 'VALLE02922', '04/04/1985', 'Activo', 'CENTRO', '', '', '']])), { escribir: true });
  const p = personas(hojas);
  ok(Object.keys(p0).every((k) => p[k] && p[k].id === p0[k].id), 'ningún ID cambió (el archivo venía al revés)');
  ok(p['CIB09999|JUAN FULGENCIO'].id === p0['HA00241|JUAN FULGENCIO'].id, 'el número nuevo de Juan es la misma persona');
  const enc = hojas['COLABORADORES ACTUALIZADO'].datos[0];
  ok(enc.indexOf('NÚMERO DE CUENTA') === -1 && enc.indexOf('TELEFONO') !== -1, 'la cuenta no entró a la hoja; el teléfono sí');
  ok(!JSON.stringify(hojas['COLABORADORES ACTUALIZADO'].datos).includes('0123456789'), 'ni el valor de la cuenta');
  ok(enc[enc.length - 1] === 'ID PERSONA', 'el ID va al final');
  ok(hojas['COLABORADORES ACTUALIZADO'].protecciones.length === 1 && hojas['COLABORADORES ACTUALIZADO'].protecciones[0].aviso,
    'la pestaña queda protegida (aviso: no se pega a mano)');
  ok(hojas['CAPITAL HUMANO HISTORIAL'] && hojas['CAPITAL HUMANO HISTORIAL'].datos.length === 2, 'y la carga queda en el historial');
}

console.log('\n14b. cargar: solo entran las columnas permitidas (el Excel de CH trae CURP, CLABE, banco… — 12-oct)');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  // Como quedó el DEV el 12-oct: la hoja ya traía columnas de más (una carga anterior al cambio)
  const h = hojas['COLABORADORES ACTUALIZADO'];
  h.datos.forEach((r, i) => r.push(i ? 'CURP-VIEJO' : 'CURP'));
  const ENC = ENC_ARCHIVO.concat(['CLABE', 'BANCO', 'CURP', 'CALLE/NUMERO']);
  const filas = archivoDelEscenario(hojas).map((r) => r.concat(['012345678901234567', 'BANCO X', 'CURP-NUEVO', 'CALLE 1']));
  const r = CH.cargar('tok', archivo(ENC, filas), { escribir: true });
  const enc = h.datos[0];
  ok(['CLABE', 'BANCO', 'CURP', 'CALLE/NUMERO', 'NÚMERO DE CUENTA'].every((c) => enc.indexOf(c) === -1),
    'ni la CLABE, ni el banco, ni el CURP, ni el domicilio entran: ' + enc.join('|'));
  ok(enc.indexOf('TELEFONO') !== -1 && enc.indexOf('RAZON SOCIAL') !== -1, 'lo permitido sí (teléfono, razón social)');
  ok(!/012345678901234567|CURP-NUEVO|CURP-VIEJO|CALLE 1/.test(JSON.stringify(h.datos)), 'ni sus valores, tampoco los que ya estaban en la hoja');
  ok(['CLABE', 'BANCO', 'CURP', 'CALLE/NUMERO', 'NÚMERO DE CUENTA'].every((c) => r.quitadas.indexOf(c) !== -1), 'y lo dice: ' + r.quitadas.join(', '));
}

console.log('\n14c. cargar: el número con ceros a la izquierda es el mismo empleo (prod 13-oct: 9099 en la hoja, 09099 en el Excel)');
{
  const hojas = escenario();
  hojas['COLABORADORES ACTUALIZADO'].datos.push(['9099', 'HECTOR ANGUIANO', '', '17/11/2002', 'Baja', 'GPH']);
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const id = personas(hojas)['9099|HECTOR ANGUIANO'].id;
  const filas = archivoDelEscenario(hojas).map((r) => (r[0] === '9099' ? ['09099'].concat(r.slice(1)) : r));
  const r = CH.cargar('tok', archivo(ENC_ARCHIVO, filas), { escribir: true });
  ok(r.nuevos === 0 && r.empleosNuevos === 0 && r.faltan === 0, 'ni empleo nuevo ni "no vino": ' + JSON.stringify([r.nuevos, r.empleosNuevos, r.faltan]));
  const p = personas(hojas);
  ok(p['09099|HECTOR ANGUIANO'] && p['09099|HECTOR ANGUIANO'].id === id && !p['9099|HECTOR ANGUIANO'],
    'queda un solo renglón, como lo trae el Excel, con el mismo ID');
  ok(CH.idPara('VEHICULOS', { 'RESPONSABLE VEHICULO': 'HECTOR ANGUIANO', 'NO EMPLEADO': '9099' }) === id, 'y se encuentra por 9099');
  // Lo que ya quedó repetido en prod (9099 y 09099, mismo ID): la siguiente carga deja uno
  hojas['COLABORADORES ACTUALIZADO'].datos.push(hojas['COLABORADORES ACTUALIZADO'].datos.find((x) => x[0] === '09099').map((v, i) => (i ? v : '9099')));
  CH.cargar('tok', archivo(ENC_ARCHIVO, filas), { escribir: true });
  ok(hojas['COLABORADORES ACTUALIZADO'].datos.filter((x) => /HECTOR/.test(x[1])).length === 1, 'el repetido de antes se va');
}

console.log('\n15. cargar: nunca borra a nadie; rechaza lo que no es la lista completa');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const p0 = personas(hojas);
  const filas = archivoDelEscenario(hojas).filter((r) => !(r[0] === 'PTE00002' && r[1] === 'MARIA GOMEZ'));
  const r = CH.cargar('tok', archivo(ENC_ARCHIVO, filas), { escribir: true });
  ok(r.faltan === 1 && personas(hojas)['PTE00002|MARIA GOMEZ'].id === p0['PTE00002|MARIA GOMEZ'].id,
    'quien no viene en el archivo se queda, con su ID');
  ok(r.avisos.some((a) => /PTE00002/.test(a)), 'y se avisa');
  let error = '';
  try { CH.cargar('tok', archivo(ENC_ARCHIVO, filas.slice(0, 3)), { escribir: true }); } catch (e) { error = e.message; }
  ok(/trae 3 renglones/.test(error), 'un archivo con muchos menos renglones se rechaza: ' + error);
  error = '';
  try { CH.cargar('tok', archivo(['No EMPLEADO', 'NOMBRE'], [['X', 'Y']]), { escribir: true }); } catch (e) { error = e.message; }
  ok(/no parece la lista de Capital Humano/.test(error), 'uno sin las columnas de CH, también');
}

console.log('\n16. La lista para elegir a una persona: solo activos, con su ID');
{
  const hojas = escenario();
  const CH = cargar(hojas);
  CH.identificar({ escribir: true });
  const lista = CH.activos();
  ok(lista.every((x) => x.ESTATUS === 'ACTIVO') && !lista.some((x) => x.NOMBRE === 'FRANCISCO RAMIREZ'), 'quien solo está de baja no sale');
  ok(lista.some((x) => x.NOMBRE === 'PERLA CRUZ'), 'quien tiene un empleo activo sí');
  ok(lista.every((x) => /^PER-/.test(x.ID_PERSONA)), 'cada uno con su ID PERSONA');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

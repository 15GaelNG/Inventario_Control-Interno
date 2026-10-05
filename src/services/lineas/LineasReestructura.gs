/**
 * LineasReestructura.gs
 * La base de datos de la rama `reestructura-lineas`: una copia del libro de producción ("ControlVehicular NUEVO",
 * el que usa el proyecto 1NbOczw…) solo con las pestañas de Líneas. Sin login, sin USUARIOS y sin los demás módulos.
 *
 * Producción solo se LEE (makeCopy). La copia va a "Mi unidad" con destino explícito: sin destino, Drive la
 * dejaría junto a producción.
 *
 * Se corre UNA vez desde el editor: reestructuraCrearBD. Deja el ID de la copia en la Script Property
 * SS_ID_TELEFONIA; después se anota también en config/Entornos.gs para que viaje con el código.
 * Archivo aparte para que, al abrirlo en el editor, la función quede elegida en la lista (Ejecutar).
 */

const REESTRUCTURA_PRODUCCION_ID = '1OsW5n8tQkBqIqLHigTCIFcmuA8hFWpP-lDY5tuoaQgA';
const REESTRUCTURA_NOMBRE_BD = 'BD REESTRUCTURA LINEAS';

/**
 * Las pestañas de Líneas que se quedan (las mismas de producción). Las demás se borran de la copia:
 * USUARIOS (login), PERSONAS / COLABORADORES ACTUALIZADO / LOG_* (Capital Humano y migración de IDs), vehículos,
 * sensores, verificaciones, hologramas, Uber, tickets, incidencias, arqueos, cajas chicas, etc.
 */
const REESTRUCTURA_PESTANAS = [
  'COLABORADORES',
  'LINEAS TELEFONICAS',
  'HISTORIAL_REASIGNACIONES',
  'INSPECCIONES LINEAS',
  'REACTIVACION DE LINEAS',
  'SOLICITUD DE LINEAS',
  'BITACORA DE DESECHO',
  'CAMBIOS LINEAS TELEFONICAS',
  'RESPONSIVAS LINEAS',
  'ACCESORIOS CELULARES',
  'MOVIMIENTOS_ACCESORIOS',
  'LISTAS TELEFONOS',
  'APP_NOTIFICACIONES',
  'APP_RESGUARDOS',
  'APP_MOVIMIENTOS',
];

/**
 * Copia producción a "Mi unidad", le borra lo que no es de Líneas y deja a este proyecto usándola. Si ya hay base
 * (SS_ID_TELEFONIA), no hace otra: para una nueva, borra esa propiedad a mano.
 * Antes de borrar avisa qué fórmulas de las pestañas que se quedan citan a las que se van (quedarían en #REF!).
 */
function reestructuraCrearBD() {
  soloEditor_();
  const props = PropertiesService.getScriptProperties();
  const previo = leerConfig_('SS_ID_TELEFONIA');
  if (previo) {
    const msg = 'Ya hay base: ' + SpreadsheetApp.openById(previo).getUrl() + ' (para hacer otra, borra SS_ID_TELEFONIA).';
    Logger.log(msg);
    return msg;
  }

  const produccion = SpreadsheetApp.openById(REESTRUCTURA_PRODUCCION_ID);
  const faltan = REESTRUCTURA_PESTANAS.filter((n) => !produccion.getSheetByName(n));
  if (faltan.length) throw new Error('No se copió nada: a producción le faltan ' + faltan.join(', ') + '.');

  const hoy = Utilities.formatDate(new Date(), LineasDatos.ZONA_APP, 'yyyy-MM-dd HH:mm');
  const archivo = DriveApp.getFileById(REESTRUCTURA_PRODUCCION_ID)
    .makeCopy(REESTRUCTURA_NOMBRE_BD + ' · copia de producción ' + hoy, DriveApp.getRootFolder());
  if (archivo.getId() === REESTRUCTURA_PRODUCCION_ID) throw new Error('La copia salió con el ID de producción: no se borró nada.');
  const copia = SpreadsheetApp.openById(archivo.getId());

  const sobran = copia.getSheets().filter((h) => REESTRUCTURA_PESTANAS.indexOf(h.getName()) < 0);
  // Fórmulas de lo que se queda que citan a lo que se va: después de borrar dirían #REF!
  const citas = [];
  sobran.forEach((h) => {
    copia.createTextFinder(h.getName()).matchFormulaText(true).findAll().forEach((celda) => {
      const hoja = celda.getSheet().getName();
      if (REESTRUCTURA_PESTANAS.indexOf(hoja) >= 0) citas.push(hoja + '!' + celda.getA1Notation() + ' → ' + h.getName());
    });
  });

  const borradas = sobran.map((h) => {
    const nombre = h.getName();
    copia.deleteSheet(h);
    return nombre;
  });
  SpreadsheetApp.flush();

  props.setProperties({ ENTORNO: 'DEV', SS_ID_TELEFONIA: copia.getId() });

  const salida = {
    base: copia.getName(), id: copia.getId(), url: copia.getUrl(),
    quedan: copia.getSheets().map((h) => h.getName()), borradas: borradas,
    formulasQueCitabanBorradas: citas,
  };
  console.log(JSON.stringify(salida, null, 2));
  return salida;
}

/** Columnas de COLABORADORES (PLAN_REESTRUCTURA_LINEAS.md §3.2): las 9 de siempre y las 6 nuevas al final. */
const REESTRUCTURA_COLUMNAS_CH = ['ID', 'No EMPLEADO', 'NOMBRE COMPLETO', 'DEPARTAMENTO', 'AREA', 'PUESTO', 'SEDE',
  'OFICINA/DESARROLLO', 'ESTATUS COLABORADOR', 'DIRECTOR', 'JEFE DIRECTO', 'CORREO EMPRESARIAL', 'FECHA DE INGRESO',
  'FECHA DE BAJA', 'N. EMPLEADO ANTERIOR'];

/** Pestaña del mismo libro con la base completa de Capital Humano (producción, 4-oct: la de octubre). */
const REESTRUCTURA_HOJA_CH = 'COLABORADORES ACTUALIZADO';
/** Columna de CH → columna de COLABORADORES (las mismas que migracion/capital_humano/preparar_ch.py). */
const REESTRUCTURA_DE_CH = [['No EMPLEADO', 'No EMPLEADO'], ['NOMBRE COMPLETO', 'NOMBRE COMPLETO'], ['DEPARTAMENTO', 'DEPARTAMENTO'],
  ['AREA', 'AREA'], ['PUESTO', 'PUESTO'], ['SEDE', 'SEDE'], ['OFICINA/DESARROLLO', 'OFICINA/DESARROLLO'],
  ['STATUS', 'ESTATUS COLABORADOR'], ['DIRECTOR', 'DIRECTOR'], ['JEFE DIRECTO', 'JEFE DIRECTO'],
  ['CORREO EMPRESARIAL', 'CORREO EMPRESARIAL'], ['FECHA DE INGRESO', 'FECHA DE INGRESO'], ['FECHA DE BAJA', 'FECHA DE BAJA'],
  ['N. EMPLEADO ANTERIOR', 'N. EMPLEADO ANTERIOR']];

/**
 * Lee la pestaña de CH solo con las columnas acordadas (cada una por separado: la cuenta, la CURP, etc. ni se leen) y
 * la deja como la dejaba preparar_ch.py: texto en mayúsculas sin espacios de más, correo en minúsculas y fechas
 * yyyy-MM-dd. null si la pestaña no está.
 */
function reestructuraLeerHojaCH_(ss) {
  const hoja = ss.getSheetByName(REESTRUCTURA_HOJA_CH);
  if (!hoja || hoja.getLastRow() < 2) return null;
  const n = hoja.getLastRow() - 1;
  const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map((h) => String(h).replace(/\s+/g, ' ').trim());
  const faltan = REESTRUCTURA_DE_CH.filter((p) => enc.indexOf(p[0]) < 0).map((p) => p[0]);
  if (faltan.length) throw new Error('Faltan columnas en ' + REESTRUCTURA_HOJA_CH + ': ' + faltan.join(', '));
  const texto = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const fecha = (v) => {
    if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    const t = texto(v);
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    return m ? m[0] : '';
  };
  const columnas = REESTRUCTURA_DE_CH.map((p) => hoja.getRange(2, enc.indexOf(p[0]) + 1, n, 1).getValues());
  const salida = [];
  for (let i = 0; i < n; i++) {
    if (columnas.every((c) => texto(c[i][0]) === '')) continue;
    const o = {};
    REESTRUCTURA_DE_CH.forEach((p, k) => {
      const v = columnas[k][i][0];
      o[p[1]] = p[1].indexOf('FECHA') === 0 ? fecha(v) : (p[1] === 'CORREO EMPRESARIAL' ? texto(v).toLowerCase() : texto(v).toUpperCase());
    });
    salida.push(o);
  }
  return salida;
}

/**
 * Carga en COLABORADORES la base de Capital Humano: activos y bajas, un renglón por ingreso, guardado como lo escribe
 * CH. En producción sale de la pestaña COLABORADORES ACTUALIZADO del mismo libro (usuario, 4-oct: la base de octubre);
 * si no está, de los archivos temporales del proyecto (tmp_ch_NN.html, gzip + base64) que arma
 * migracion/capital_humano/preparar_ch.py solo con las columnas acordadas (así se cargó en pruebas).
 *
 * IDs: cada número de empleado conserva el ID COL- que ya tenía, en su renglón vigente (el activo, o el ingreso más
 * reciente); los demás renglones reciben uno nuevo. Lo que estaba en la hoja y no viene en CH se queda al final con
 * ESTATUS COLABORADOR = "NO ESTÁ EN CH" (no sale en las listas).
 */
function reestructuraCargarCapitalHumano() {
  soloEditor_();
  const ss = SpreadsheetApp.openById(leerConfig_('SS_ID_TELEFONIA'));
  // 1) La base de CH: la pestaña del libro o, si no está, los archivos temporales
  const deHoja = reestructuraLeerHojaCH_(ss);
  return reestructuraEscribirCH_(ss, deHoja || reestructuraLeerTmpCH_(), deHoja ? REESTRUCTURA_HOJA_CH : 'tmp_ch');
}

function reestructuraLeerTmpCH_() {
  let b64 = '';
  for (let i = 1; i < 100; i++) {
    const nombre = 'tmp_ch_' + (i < 10 ? '0' : '') + i;
    let parte;
    try { parte = HtmlService.createHtmlOutputFromFile(nombre).getContent(); } catch (e) { break; }
    b64 += parte.trim();
  }
  if (!b64) throw new Error('No están los archivos tmp_ch_NN.html con la base de Capital Humano.');
  const tsv = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString('UTF-8');
  const lineas = tsv.split('\n');
  const enc = lineas[0].split('\t');
  return lineas.slice(1).filter(Boolean).map((l) => {
    const v = l.split('\t');
    const o = {};
    enc.forEach((h, i) => { o[h] = v[i] || ''; });
    return o;
  });
}

function reestructuraEscribirCH_(ss, ch, fuente) {
  // 2) IDs que ya tenía la hoja. Desde esta carga, cada renglón es un ingreso: se reconoce por número de empleado +
  // fecha de ingreso, así el ID no cambia de un mes a otro. La foto vieja (sin FECHA DE INGRESO) se reconoce por número.
  const hoja = ss.getSheetByName('COLABORADORES');
  const viejos = hoja.getDataRange().getValues();
  const encViejo = viejos[0].map((h) => String(h).trim());
  const cId = encViejo.indexOf('ID');
  const cNum = encViejo.indexOf('No EMPLEADO');
  const cIngreso = encViejo.indexOf('FECHA DE INGRESO');
  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
  const isoDe = (v) => (v instanceof Date && !isNaN(v.getTime()) ? Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(v || '').trim());
  const viejoPorNum = {};
  const viejoPorIngreso = {};
  viejos.slice(1).forEach((r) => {
    const n = norm(r[cNum]);
    if (!n) return;
    const ingreso = cIngreso >= 0 ? isoDe(r[cIngreso]) : '';
    if (ingreso) viejoPorIngreso[n + '|' + ingreso] = r;
    else if (!viejoPorNum[n]) viejoPorNum[n] = r;
  });

  // El renglón vigente de cada número: el activo o, si no hay, el ingreso más reciente
  const vigente = {};
  ch.forEach((o, i) => {
    const n = norm(o['No EMPLEADO']);
    const actual = vigente[n] === undefined ? null : ch[vigente[n]];
    const mejor = !actual || (o['ESTATUS COLABORADOR'] === 'ACTIVO' && actual['ESTATUS COLABORADOR'] !== 'ACTIVO') ||
      (o['ESTATUS COLABORADOR'] === actual['ESTATUS COLABORADOR'] && o['FECHA DE INGRESO'] > actual['FECHA DE INGRESO']);
    if (mejor) vigente[n] = i;
  });

  const aFecha = (t) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
  };
  let reusados = 0;
  const usados = {};
  const enCH = {};
  const filas = ch.map((o, i) => {
    const n = norm(o['No EMPLEADO']);
    const clave = n + '|' + o['FECHA DE INGRESO'];
    enCH[clave] = true;
    let id = '';
    if (viejoPorIngreso[clave]) id = String(viejoPorIngreso[clave][cId] || '');
    else if (vigente[n] === i && viejoPorNum[n]) { id = String(viejoPorNum[n][cId] || ''); usados[n] = true; }
    if (id) reusados++;
    if (!id) id = Ids.nuevo('COL');
    return REESTRUCTURA_COLUMNAS_CH.map((c) => {
      if (c === 'ID') return id;
      if (c === 'FECHA DE INGRESO' || c === 'FECHA DE BAJA') return aFecha(o[c]);
      return o[c] || '';
    });
  });
  // Lo que estaba en la hoja y no viene en CH: se conserva al final, fuera de las listas
  const noEstan = Object.keys(viejoPorNum).filter((n) => !usados[n] && vigente[n] === undefined).map((n) => viejoPorNum[n])
    .concat(Object.keys(viejoPorIngreso).filter((k) => !enCH[k] && vigente[k.split('|')[0]] === undefined).map((k) => viejoPorIngreso[k]));
  noEstan.forEach((r) => {
    const de = (c) => { const k = encViejo.indexOf(c); return k < 0 ? '' : r[k]; };
    filas.push(REESTRUCTURA_COLUMNAS_CH.map((c) => (c === 'ESTATUS COLABORADOR' ? 'NO ESTÁ EN CH' : (c === 'ID' ? de('ID') || Ids.nuevo('COL') : de(c)))));
  });

  // 3) Escribir la hoja completa de una vez
  const total = filas.length + 1;
  const cols = REESTRUCTURA_COLUMNAS_CH.length;
  if (hoja.getFilter()) hoja.getFilter().remove();
  hoja.clearContents();
  if (hoja.getMaxRows() < total) hoja.insertRowsAfter(hoja.getMaxRows(), total - hoja.getMaxRows());
  if (hoja.getMaxColumns() < cols) hoja.insertColumnsAfter(hoja.getMaxColumns(), cols - hoja.getMaxColumns());
  const col = (c) => REESTRUCTURA_COLUMNAS_CH.indexOf(c) + 1;
  // Texto: que Sheets no convierta IDs ni números de empleado
  ['ID', 'No EMPLEADO', 'N. EMPLEADO ANTERIOR'].forEach((c) => hoja.getRange(1, col(c), total, 1).setNumberFormat('@'));
  ['FECHA DE INGRESO', 'FECHA DE BAJA'].forEach((c) => hoja.getRange(2, col(c), total - 1, 1).setNumberFormat('dd/MM/yyyy'));
  hoja.getRange(1, 1, total, cols).setValues([REESTRUCTURA_COLUMNAS_CH].concat(filas));
  hoja.setFrozenRows(1);
  hoja.getRange(1, 1, total, cols).createFilter();
  SpreadsheetApp.flush();

  // 4) Que el sistema vuelva a leer la hoja (encabezados, listas y personas)
  LineasDatos.cacheBorrar('enc_COLABORADORES');
  LineasDatos.tocar(['COLABORADORES']);
  LineasRepo.borrarCaches();

  const cuenta = {};
  filas.forEach((f) => { const e = f[col('ESTATUS COLABORADOR') - 1]; cuenta[e] = (cuenta[e] || 0) + 1; });
  const salida = {
    fuente: fuente, renglones: filas.length, porEstatus: cuenta, idsConservados: reusados, idsNuevos: filas.length - reusados - noEstan.length,
    estabanYNoVienenEnCH: noEstan.length, columnas: REESTRUCTURA_COLUMNAS_CH,
  };
  console.log(JSON.stringify(salida, null, 2));
  return salida;
}

/**
 * "SD" → "TARJETA SD" en los accesorios de EQUIPOS (decisión del usuario, 4-oct; 13 registros). Se corre una vez desde
 * el editor. Cada cambio queda en el historial como corrección, con quién la corrió. Al rearmar las hojas nuevas
 * (reestructuraArmarEstructura) ya sale así.
 */
function reestructuraTarjetaSD() {
  soloEditor_();
  const correo = Session.getActiveUser().getEmail() || 'editor';
  const usuario = { correo: correo, nombre: correo };
  const hechos = [];
  const ids = [];
  LineasDatos.conCandado(() => {
    LineasDatos.leerTabla(LineasRepo.TAB.LINEAS).forEach((f) => {
      const antes = String(f['ACCESORIOS'] || '');
      const partes = antes.split(',').map((x) => x.trim());
      if (!partes.some((x) => x.toUpperCase() === 'SD')) return;
      const despues = partes.map((x) => (x.toUpperCase() === 'SD' ? 'TARJETA SD' : x)).join(' , ');
      const ahora = new Date();
      const g = LineasRepo.guardarCambiosRegistro(f, { 'ACCESORIOS': despues }, usuario, ahora, { tolerante: true });
      LineasRepo.registrarMovimiento('EDICION', { motivo: 'Corrección: SD → TARJETA SD (decisión del usuario, 4-oct)' }, usuario, ahora, {
        refs: [f['ID']].concat(g.refs || []), nuco: f['NUCO'], numero: f['NUMERO TELEFONO'], antes: {}, despues: {},
        detalle: { idsCambios: g.idsCambios || [], idsReasignacion: [], cambios: g.campos || [] },
      });
      ids.push(f['ID']);
      hechos.push(LineasUtil.nucoVisible(f['NUCO']) + ': ' + antes + ' → ' + despues);
    });
  });
  if (ids.length) LineasRepo.refrescarIndice(ids);
  console.log('SD → TARJETA SD: ' + hechos.length + ' registro(s)' + (hechos.length ? '\n' + hechos.join('\n') : ''));
  return hechos.length;
}

/**
 * POSIBLE VENTA-DAÑO → POSIBLE VENTA, el estatus que tenían antes (decisión del usuario, 4-oct: POSIBLE VENTA-DAÑO ya no
 * existe). Se corre una vez desde el editor. Cada cambio queda en el historial como corrección, con quién la corrió. Se
 * quedan fuera de la lista para que Líneas los corrija en Correcciones (40 tienen PDF de venta). Al rearmar las hojas
 * nuevas (reestructuraArmarEstructura) ya salen así.
 */
function reestructuraQuitarPosibleVentaDano() {
  soloEditor_();
  const correo = Session.getActiveUser().getEmail() || 'editor';
  const usuario = { correo: correo, nombre: correo };
  const hechos = [];
  const ids = [];
  LineasDatos.conCandado(() => {
    LineasDatos.leerTabla(LineasRepo.TAB.LINEAS).forEach((f) => {
      if (String(f['ESTATUS EQUIPO'] || '').trim().toUpperCase() !== 'POSIBLE VENTA-DAÑO') return;
      const ahora = new Date();
      const g = LineasRepo.guardarCambiosRegistro(f, { 'ESTATUS EQUIPO': 'POSIBLE VENTA' }, usuario, ahora, { tolerante: true });
      LineasRepo.registrarMovimiento('EDICION', { motivo: 'Corrección: POSIBLE VENTA-DAÑO → POSIBLE VENTA (decisión del usuario, 4-oct)' }, usuario, ahora, {
        refs: [f['ID']].concat(g.refs || []), nuco: f['NUCO'], numero: f['NUMERO TELEFONO'], antes: { estatus: 'POSIBLE VENTA-DAÑO' }, despues: { estatus: 'POSIBLE VENTA' },
        detalle: { idsCambios: g.idsCambios || [], idsReasignacion: [], cambios: g.campos || [] },
      });
      ids.push(f['ID']);
      hechos.push(LineasUtil.nucoVisible(f['NUCO']));
    });
  });
  if (ids.length) LineasRepo.refrescarIndice(ids);
  console.log('POSIBLE VENTA-DAÑO → POSIBLE VENTA: ' + hechos.length + ' registro(s)' + (hechos.length ? '\nNUCO ' + hechos.join(', ') : ''));
  return hechos.length;
}

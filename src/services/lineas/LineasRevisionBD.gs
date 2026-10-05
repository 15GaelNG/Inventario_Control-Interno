/**
 * LineasRevisionBD.gs
 * Revisión de SOLO LECTURA de la base de la reestructura (la copia que dejó reestructuraCrearBD): qué dejó en cada
 * pestaña la migración de IDs de Ayrton (columnas ID / ID ANTERIOR / ID APPSHEET y referencias entre hojas) y qué
 * más trae el libro (validaciones, protecciones, rangos con nombre, metadatos, fórmulas, formato condicional).
 * No escribe nada. Se corre desde el editor: reestructuraRevisarBD.
 */

const REVISION_FORMATO_ID = /^[A-Z]{3}-[0-9A-HJKMNP-TV-Z]{14}$/;
// Columnas que guardan un ID (propio o de otra hoja): "ID", "ID LINEA", "ID_Accesorio", "ID PERSONA"…
const REVISION_ES_COLUMNA_ID = /(^|[\s_])ID([\s_]|$)/i;
// Columnas que se llaman distinto pero guardan IDs de otra hoja (medido por Ayrton: REACTIVACION.IMEI)
const REVISION_OTRAS_REFERENCIAS = ['IMEI', 'REFS'];

function reestructuraRevisarBD() {
  soloEditor_();
  const ssId = leerConfig_('SS_ID_TELEFONIA');
  if (!ssId) throw new Error('No hay base: falta SS_ID_TELEFONIA.');
  const ss = SpreadsheetApp.openById(ssId);
  const norm = (v) => String(v == null ? '' : v).trim().toUpperCase();
  const corto = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

  console.log(['LIBRO: ' + ss.getName(), 'ID: ' + ss.getId(), 'URL: ' + ss.getUrl(),
    'Zona horaria: ' + ss.getSpreadsheetTimeZone() + ' · Región: ' + ss.getSpreadsheetLocale(),
    'Pestañas: ' + ss.getSheets().length].join('\n'));

  // 1. Leer cada pestaña una vez
  const hojas = ss.getSheets().map((h) => {
    const filas = h.getLastRow(), cols = h.getLastColumn();
    const valores = filas && cols ? h.getRange(1, 1, filas, cols).getValues() : [[]];
    const enc = (valores[0] || []).map((x) => String(x).trim());
    const datos = valores.slice(1);
    const conDatos = datos.filter((r) => r.some((c) => String(c).trim() !== ''));
    return { hoja: h, nombre: h.getName(), enc: enc, datos: datos, conDatos: conDatos, filas: filas, cols: cols };
  });

  // 2. Índice de todos los valores de columnas de ID: valor → "PESTAÑA.COLUMNA"
  const indice = {};
  hojas.forEach((t) => t.enc.forEach((h, i) => {
    if (!REVISION_ES_COLUMNA_ID.test(h)) return;
    const fuente = t.nombre + '.' + h;
    t.conDatos.forEach((r) => {
      const v = norm(r[i]);
      if (!v) return;
      (indice[v] = indice[v] || {})[fuente] = true;
    });
  }));

  // 3. Reporte por pestaña
  hojas.forEach((t) => {
    const h = t.hoja;
    const lineas = ['', '=== ' + t.nombre + ' ===' + (h.isSheetHidden() ? ' (OCULTA)' : ''),
      'Renglones con datos: ' + t.conDatos.length + ' · renglones vacíos en medio: ' + (t.datos.length - t.conDatos.length) +
      ' · columnas: ' + t.cols + ' · fila(s) fija(s): ' + h.getFrozenRows()];
    lineas.push('Columna A: "' + (t.enc[0] || '') + '"');
    lineas.push('Encabezados: ' + t.enc.map((x) => x || '(sin nombre)').join(' | '));

    t.enc.forEach((nombre, i) => {
      const esId = REVISION_ES_COLUMNA_ID.test(nombre) || REVISION_OTRAS_REFERENCIAS.indexOf(norm(nombre)) >= 0;
      if (!esId) return;
      const vals = t.conDatos.map((r) => r[i]).filter((v) => String(v).trim() !== '');
      const partir = norm(nombre) === 'REFS';
      const piezas = partir ? [].concat.apply([], vals.map((v) => String(v).split(',').map(norm).filter(Boolean))) : vals.map(norm);
      const nuevos = piezas.filter((v) => REVISION_FORMATO_ID.test(v));
      const prefijos = {};
      nuevos.forEach((v) => { const p = v.slice(0, 3); prefijos[p] = (prefijos[p] || 0) + 1; });
      const repetidos = piezas.length - Object.keys(piezas.reduce((o, v) => { o[v] = 1; return o; }, {})).length;
      const numeros = vals.filter((v) => typeof v === 'number').length;
      // ¿A qué columna de OTRA pestaña apuntan estos valores?
      const destinos = {};
      piezas.forEach((v) => Object.keys(indice[v] || {}).forEach((f) => {
        if (f.indexOf(t.nombre + '.') === 0) return;
        destinos[f] = (destinos[f] || 0) + 1;
      }));
      const top = Object.keys(destinos).sort((a, b) => destinos[b] - destinos[a]).slice(0, 3)
        .map((f) => f + ' ' + Math.round(100 * destinos[f] / Math.max(1, piezas.length)) + '%');
      const formato = t.filas >= 2 ? h.getRange(2, i + 1).getNumberFormat() : '';
      lineas.push('  [' + nombre + '] llenos ' + vals.length + '/' + t.conDatos.length +
        ' · formato nuevo ' + nuevos.length + (Object.keys(prefijos).length ? ' (' + Object.keys(prefijos).map((p) => p + ' ' + prefijos[p]).join(', ') + ')' : '') +
        (repetidos ? ' · REPETIDOS ' + repetidos : '') + (numeros ? ' · guardados como número ' + numeros : '') +
        ' · formato de celda "' + formato + '"' +
        ' · ejemplo ' + (vals.length ? corto(vals[0], 40) : '-') +
        (top.length ? ' · coincide con ' + top.join('; ') : ''));
    });

    // Fórmulas
    if (t.filas && t.cols) {
      const formulas = h.getRange(1, 1, t.filas, t.cols).getFormulas();
      const lista = [];
      formulas.forEach((r, fi) => r.forEach((f, ci) => { if (f) lista.push(h.getRange(fi + 1, ci + 1).getA1Notation() + ' ' + corto(f, 90)); }));
      if (lista.length) lineas.push('Fórmulas: ' + lista.length + ' → ' + lista.slice(0, 5).join(' || '));
    }
    // Validaciones (se mira el primer renglón de datos: ahí está la de toda la columna)
    if (t.filas >= 2 && t.cols) {
      const vs = h.getRange(2, 1, 1, t.cols).getDataValidations()[0];
      const desc = [];
      vs.forEach((v, i) => {
        if (!v) return;
        const tipo = String(v.getCriteriaType());
        const args = v.getCriteriaValues();
        let extra = '';
        if (tipo === 'VALUE_IN_RANGE' && args[0]) {
          try { extra = ' ← ' + args[0].getSheet().getName() + '!' + args[0].getA1Notation(); } catch (e) { extra = ' ← RANGO ROTO'; }
        } else if (tipo === 'VALUE_IN_LIST' && args[0]) {
          extra = ' ← ' + corto(args[0].join(', '), 80);
        }
        desc.push((t.enc[i] || '(col ' + (i + 1) + ')') + ': ' + tipo + extra);
      });
      if (desc.length) lineas.push('Validaciones: ' + desc.join(' || '));
    }
    const cf = h.getConditionalFormatRules().length;
    if (cf) lineas.push('Formato condicional: ' + cf + ' reglas');
    if (h.getFilter()) lineas.push('Tiene filtro activo');
    const ocultas = [];
    for (let c = 1; c <= t.cols; c++) if (h.isColumnHiddenByUser(c)) ocultas.push(t.enc[c - 1] || ('col ' + c));
    if (ocultas.length) lineas.push('Columnas ocultas: ' + ocultas.join(', '));
    if (h.getCharts().length) lineas.push('Gráficas: ' + h.getCharts().length);
    if (h.getBandings().length) lineas.push('Colores alternos: ' + h.getBandings().length);
    console.log(lineas.join('\n'));
  });

  // 4. Lo que vive a nivel libro
  const libro = ['', '=== A NIVEL LIBRO ==='];
  const prot = ss.getProtections(SpreadsheetApp.ProtectionType.SHEET).concat(ss.getProtections(SpreadsheetApp.ProtectionType.RANGE));
  libro.push('Protecciones: ' + (prot.length ? prot.map((p) => {
    let donde = '';
    try { donde = p.getRange().getSheet().getName() + '!' + p.getRange().getA1Notation(); } catch (e) { donde = 'rango roto'; }
    return donde + (p.getDescription() ? ' (' + p.getDescription() + ')' : '') + (p.isWarningOnly() ? ' solo aviso' : '');
  }).join(' || ') : 'ninguna'));
  const nombrados = ss.getNamedRanges();
  libro.push('Rangos con nombre: ' + (nombrados.length ? nombrados.map((n) => {
    let donde = '';
    try { donde = n.getRange().getSheet().getName() + '!' + n.getRange().getA1Notation(); } catch (e) { donde = 'ROTO'; }
    return n.getName() + ' → ' + donde;
  }).join(' || ') : 'ninguno'));
  const meta = ss.createDeveloperMetadataFinder().find();
  libro.push('Metadatos ocultos (developer metadata): ' + (meta.length ? meta.map((m) => {
    const loc = m.getLocation();
    const tipo = String(loc.getLocationType());
    let donde = tipo;
    try {
      if (tipo === 'SHEET') donde += ' ' + loc.getSheet().getName();
      if (tipo === 'COLUMN') donde += ' ' + loc.getColumn().getSheet().getName() + '!' + loc.getColumn().getA1Notation();
      if (tipo === 'ROW') donde += ' ' + loc.getRow().getSheet().getName() + '!' + loc.getRow().getA1Notation();
    } catch (e) { /* sin detalle */ }
    return m.getKey() + ' = ' + corto(m.getValue(), 60) + ' [' + donde + ']';
  }).join(' || ') : 'ninguno'));
  console.log(libro.join('\n'));
  return 'Listo: ver el registro de ejecución.';
}

/**
 * Conteos (sin nombres) para diseñar las bases de líneas, equipos y responsables: qué combinaciones de línea y equipo
 * hay, cómo viene el responsable y cuánto difiere el inventario de su última responsiva. Solo lee.
 */
function reestructuraMedirResponsables() {
  soloEditor_();
  const ss = SpreadsheetApp.openById(leerConfig_('SS_ID_TELEFONIA'));
  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();
  const tabla = (nombre) => {
    const v = ss.getSheetByName(nombre).getDataRange().getValues();
    const enc = v[0].map((h) => String(h).trim());
    return v.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''))
      .map((r) => { const o = {}; enc.forEach((h, i) => { o[h] = r[i]; }); return o; });
  };
  const cuenta = (lista, fn) => {
    const c = {};
    lista.forEach((x) => { const k = fn(x); c[k] = (c[k] || 0) + 1; });
    return Object.keys(c).sort((a, b) => c[b] - c[a]).map((k) => k + ': ' + c[k]).join(' · ');
  };
  const vacio = (v) => ['', 'N/A', 'NA', 'NO APLICA', '-'].indexOf(norm(v)) >= 0;
  const out = [];

  const lin = tabla('LINEAS TELEFONICAS');
  out.push('LINEAS TELEFONICAS: ' + lin.length + ' renglones');
  out.push('TIPO: ' + cuenta(lin, (r) => norm(r['TIPO']) || '(vacío)'));
  out.push('ESTATUS EQUIPO: ' + cuenta(lin, (r) => norm(r['ESTATUS EQUIPO']) || '(vacío)'));
  out.push('ESTATUS LINEA: ' + cuenta(lin, (r) => norm(r['ESTATUS LINEA']) || '(vacío)'));
  const conNum = lin.filter((r) => !vacio(r['NUMERO TELEFONO']));
  const conImei = lin.filter((r) => !vacio(r['IMEI']));
  out.push('Con número: ' + conNum.length + ' · con IMEI: ' + conImei.length +
    ' · con los dos: ' + lin.filter((r) => !vacio(r['NUMERO TELEFONO']) && !vacio(r['IMEI'])).length);
  const rep = (campo) => {
    const c = {};
    lin.forEach((r) => { const v = norm(r[campo]); if (!vacio(v)) c[v] = (c[v] || 0) + 1; });
    const dup = Object.keys(c).filter((k) => c[k] > 1);
    return dup.length + ' valores repetidos en ' + dup.reduce((s, k) => s + c[k], 0) + ' renglones';
  };
  out.push('NUMERO TELEFONO: ' + rep('NUMERO TELEFONO') + ' · IMEI: ' + rep('IMEI') + ' · NUCO: ' + rep('NUCO') +
    ' · NUMERO SIM: ' + rep('NUMERO SIM'));

  // En uso: quién lo tiene
  const uso = lin.filter((r) => norm(r['ESTATUS EQUIPO']) === 'USO' || norm(r['ESTATUS LINEA']) === 'USO');
  out.push('', 'EN USO (equipo o línea): ' + uso.length);
  out.push('Combinación: ' + cuenta(uso, (r) => (vacio(r['NUMERO TELEFONO']) ? 'sin número' : 'con número') + ' + ' +
    (vacio(r['IMEI']) ? 'sin IMEI' : 'con IMEI')));
  const formaNum = (v) => {
    const t = norm(v);
    if (vacio(t)) return 'vacío o N/A';
    if (/NO SE ENCUENTRA/.test(t)) return 'NO SE ENCUENTRA EN CH';
    if (/^[A-Z]{1,8}\d{2,}$/.test(t.replace(/[\s-]/g, ''))) return 'parece No. empleado';
    if (/^\d+$/.test(t)) return 'solo dígitos';
    return 'otro texto';
  };
  out.push('NO EMPLEADO: ' + cuenta(uso, (r) => formaNum(r['NO EMPLEADO'])));
  out.push('RESPONSABLE con varios nombres (/ , Y): ' + uso.filter((r) => /\/|,| Y /.test(norm(r['RESPONSABLE']))).length);
  out.push('RESPONSABLE USA EL EQUIPO: ' + cuenta(uso, (r) => norm(r['RESPONSABLE USA EL EQUIPO']) || '(vacío)'));
  out.push('NOMBRE QUIEN USA lleno: ' + uso.filter((r) => !vacio(r['NOMBRE QUIEN USA'])).length);
  ['SEGUNDO RESPONSABLE', 'NOMBRE SEGUNDO RESPONSABLE', 'NOMBRE TERCER RESPONSABLE', 'NOMBRE CUARTO RESPONSABLE',
    'NOMBRE QUINTO RESPONSABLE'].forEach((c) => out.push(c + ' lleno: ' + uso.filter((r) => !vacio(r[c])).length));
  out.push('DEPARTAMENTO (top): ' + cuenta(uso, (r) => norm(r['DEPARTAMENTO']) || '(vacío)').split(' · ').slice(0, 8).join(' · '));
  out.push('ID PERSONA lleno: ' + uso.filter((r) => !vacio(r['ID PERSONA'])).length + ' de ' + uso.length);

  // Inventario contra su última responsiva (mismo ID LINEA)
  const resp = tabla('RESPONSIVAS LINEAS');
  const ultima = {};
  resp.forEach((r) => { const k = norm(r['ID LINEA']); if (k) ultima[k] = r; });
  const conResp = uso.filter((r) => ultima[norm(r['ID'])] || ultima[norm(r['ID ANTERIOR'])]);
  out.push('', 'RESPONSIVAS LINEAS: ' + resp.length + ' · en uso con al menos una responsiva en la hoja: ' + conResp.length + ' de ' + uso.length);
  const campos = [['RESPONSABLE', 'RESPONSABLE'], ['NO EMPLEADO', 'No EMPLEADO'], ['DEPARTAMENTO', 'DEPARTAMENTO'],
    ['AREA', 'AREA'], ['PUESTO', 'PUESTO'], ['SEDE', 'SEDE'], ['OFICINA / DESARROLLO', 'OFICINA / DESARROLLO'],
    ['DIRECTOR', 'DIRECTOR'], ['IMEI', 'IMEI'], ['NUMERO TELEFONO', 'No TELEFONO'], ['EQUIPO', 'MODELO']];
  const difiere = {};
  let algunaDif = 0;
  conResp.forEach((r) => {
    const u = ultima[norm(r['ID'])] || ultima[norm(r['ID ANTERIOR'])];
    let alguna = false;
    campos.forEach(([ci, cr]) => {
      if (norm(r[ci]) !== norm(u[cr])) { difiere[ci] = (difiere[ci] || 0) + 1; alguna = true; }
    });
    if (alguna) algunaDif++;
  });
  out.push('Inventario distinto a su última responsiva (por campo): ' +
    campos.map(([ci]) => ci + ' ' + (difiere[ci] || 0)).join(' · '));
  out.push('Con al menos un campo distinto: ' + algunaDif + ' de ' + conResp.length);
  const anio = (u) => String(u['AÑO'] || '').trim() || '(sin año)';
  out.push('Año de la última responsiva (en uso): ' + cuenta(conResp, (r) => anio(ultima[norm(r['ID'])] || ultima[norm(r['ID ANTERIOR'])])));

  console.log(out.join('\n'));
  return 'Listo: ver el registro de ejecución.';
}

/**
 * Extracto sin nombres para comparar, en la computadora, el inventario y las responsivas contra la base de Capital
 * Humano del mes (el Excel no se sube a ningún lado). Imprime: conteos de COLABORADORES, y por cada línea en uso su
 * número de empleado y los campos que piden responsiva, del inventario (I|) y de su última responsiva (R|). Solo lee.
 */
function reestructuraExtractoComparacion() {
  soloEditor_();
  const ss = SpreadsheetApp.openById(leerConfig_('SS_ID_TELEFONIA'));
  const norm = (v) => String(v == null ? '' : v).replace(/[|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const tabla = (nombre) => {
    const v = ss.getSheetByName(nombre).getDataRange().getValues();
    const enc = v[0].map((h) => String(h).trim());
    return v.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''))
      .map((r) => { const o = {}; enc.forEach((h, i) => { o[h] = r[i]; }); return o; });
  };
  const cuenta = (lista, fn) => {
    const c = {};
    lista.forEach((x) => { const k = fn(x); c[k] = (c[k] || 0) + 1; });
    return Object.keys(c).sort().map((k) => k + '=' + c[k]).join(';');
  };
  const lineas = [];
  const col = tabla('COLABORADORES');
  lineas.push('C|total=' + col.length);
  lineas.push('C|estatus|' + cuenta(col, (r) => norm(r['ESTATUS COLABORADOR'])));
  lineas.push('C|depto|' + cuenta(col, (r) => norm(r['DEPARTAMENTO'])));
  lineas.push('C|sede|' + cuenta(col, (r) => norm(r['SEDE'])));
  const enCol = {};
  col.forEach((r) => { enCol[norm(r['No EMPLEADO'])] = r; });

  const lin = tabla('LINEAS TELEFONICAS')
    .filter((r) => norm(r['ESTATUS EQUIPO']) === 'USO' || norm(r['ESTATUS LINEA']) === 'USO');
  const resp = tabla('RESPONSIVAS LINEAS');
  const ultima = {};
  resp.forEach((r) => { const k = norm(r['ID LINEA']); if (k) ultima[k] = r; });
  lin.forEach((r) => {
    const n = norm(r['NO EMPLEADO']);
    const c = enCol[n];
    lineas.push(['I', norm(r['ID']), n, c ? 'S' : 'N', norm(r['DEPARTAMENTO']), norm(r['AREA']), norm(r['PUESTO']),
      norm(r['SEDE']), norm(r['OFICINA / DESARROLLO']), norm(r['DIRECTOR']), norm(r['JEFE DIRECTO']),
      c ? [norm(c['DEPARTAMENTO']), norm(c['AREA']), norm(c['PUESTO']), norm(c['SEDE']), norm(c['OFICINA/DESARROLLO'])].join('|') : '||||'].join('|'));
    const u = ultima[norm(r['ID'])] || ultima[norm(r['ID ANTERIOR'])];
    if (u) {
      lineas.push(['R', norm(r['ID']), norm(u['No EMPLEADO']), norm(u['DEPARTAMENTO']), norm(u['AREA']), norm(u['PUESTO']),
        norm(u['SEDE']), norm(u['OFICINA / DESARROLLO']), norm(u['DIRECTOR']),
        [u['DIA'], u['MES'], u['AÑO']].map(norm).join('/')].join('|'));
    }
  });
  // El registro del editor corta cada mensaje en ~8 KB: pedazos chicos
  for (let i = 0; i < lineas.length; i += 30) console.log(lineas.slice(i, i + 30).join('\n'));
  return 'Listo: ' + lineas.length + ' renglones en el registro.';
}

/**
 * "Quien usa el equipo" repetido: cuántos renglones traen en NOMBRE QUIEN USA a la misma persona que RESPONSABLE (y el
 * mismo puesto), según el SI/NO de RESPONSABLE USA EL EQUIPO. Solo cuenta; no escribe nada.
 */
function reestructuraMedirQuienUsa() {
  soloEditor_();
  const ss = SpreadsheetApp.openById(leerConfig_('SS_ID_TELEFONIA'));
  const v = ss.getSheetByName('LINEAS TELEFONICAS').getDataRange().getValues();
  const enc = v[0].map((h) => String(h).trim());
  const c = (n) => enc.indexOf(n);
  const norm = (x) => String(x == null ? '' : x).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  const vacio = (x) => ['', 'N/A', 'NA', 'NO APLICA', '-'].indexOf(norm(x)) >= 0;
  const t = {};
  const sumar = (k) => { t[k] = (t[k] || 0) + 1; };
  let ej = '';
  v.slice(1).forEach((r) => {
    if (vacio(r[c('NOMBRE QUIEN USA')])) return;
    const usa = norm(r[c('RESPONSABLE USA EL EQUIPO')]) || '(vacío)';
    const mismoNombre = norm(r[c('NOMBRE QUIEN USA')]) === norm(r[c('RESPONSABLE')]);
    const mismoPuesto = norm(r[c('PUESTO QUIEN USA')]) === norm(r[c('PUESTO')]) || vacio(r[c('PUESTO QUIEN USA')]);
    const uso = norm(r[c('ESTATUS EQUIPO')]) === 'USO' || norm(r[c('ESTATUS LINEA')]) === 'USO' ? 'en uso' : 'no en uso';
    const k = uso + ' · usa=' + usa + ' · ' + (mismoNombre ? (mismoPuesto ? 'MISMA persona y puesto' : 'mismo nombre, otro puesto') : 'OTRA persona');
    sumar(k);
    if (norm(r[c('NUCO')]).replace(/^0+/, '') === '234') ej = 'NUCO 0234 → ' + k;
  });
  const out = Object.keys(t).sort().map((k) => k + ': ' + t[k]);
  out.push(ej || 'NUCO 0234 no tiene NOMBRE QUIEN USA');
  console.log(out.join('\n'));
  return 'Listo';
}

/**
 * Parte 4 del plan (líneas y equipos): qué trae hoy cada columna de LINEAS TELEFONICAS (llenado total y en uso,
 * valores distintos), cómo se relacionan número, IMEI y NUCO entre renglones, qué tan llenos están los datos del
 * adendum en renglones sin número, y los encabezados de las demás pestañas. Solo cuenta; no escribe nada.
 */
function reestructuraMedirLineasEquipos() {
  soloEditor_();
  const ss = SpreadsheetApp.openById(leerConfig_('SS_ID_TELEFONIA'));
  const norm = (x) => String(x == null ? '' : x).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  const vacio = (x) => ['', 'N/A', 'NA', 'NO APLICA', '-', 'SOLO LINEA', 'SIN EQUIPO', '0'].indexOf(norm(x)) >= 0;
  const out = [];
  const cuenta = (lista, fn) => {
    const c = {};
    lista.forEach((x) => { const k = fn(x); c[k] = (c[k] || 0) + 1; });
    return Object.keys(c).sort((a, b) => c[b] - c[a]).map((k) => k + ': ' + c[k]).join(' · ');
  };

  const v = ss.getSheetByName('LINEAS TELEFONICAS').getDataRange().getValues();
  const enc = v[0].map((h) => String(h).trim());
  const filas = v.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));
  const c = (n) => enc.indexOf(n);
  const val = (r, n) => (c(n) < 0 ? '' : r[c(n)]);
  const enUso = (r) => norm(val(r, 'ESTATUS EQUIPO')) === 'USO' || norm(val(r, 'ESTATUS LINEA')) === 'USO';
  const uso = filas.filter(enUso);
  const tieneNum = (r) => !vacio(val(r, 'NUMERO TELEFONO'));
  const tieneEq = (r) => !vacio(val(r, 'IMEI')) || !vacio(val(r, 'NUCO'));

  out.push('LINEAS TELEFONICAS: ' + filas.length + ' renglones, ' + enc.length + ' columnas, en uso ' + uso.length);
  out.push('# | COLUMNA | llenos (todos) | llenos (en uso) | distintos | ejemplo');
  enc.forEach((h, i) => {
    const llenos = filas.filter((r) => !vacio(r[i]));
    const llenosUso = uso.filter((r) => !vacio(r[i]));
    const dist = {};
    llenos.forEach((r) => { dist[norm(r[i])] = 1; });
    const ej = llenos.length ? String(llenos[0][i] instanceof Date ? 'fecha' : llenos[0][i]).slice(0, 25) : '';
    out.push([i + 1, h || '(sin nombre)', llenos.length, llenosUso.length, Object.keys(dist).length, ej].join(' | '));
  });

  out.push('', 'TIPO × (número / equipo), todos: ' + cuenta(filas, (r) => norm(val(r, 'TIPO')) + ' [' +
    (tieneNum(r) ? 'N' : '-') + (tieneEq(r) ? 'E' : '-') + ']'));
  out.push('TIPO × (número / equipo), en uso: ' + cuenta(uso, (r) => norm(val(r, 'TIPO')) + ' [' +
    (tieneNum(r) ? 'N' : '-') + (tieneEq(r) ? 'E' : '-') + ']'));
  out.push('ESTATUS EQUIPO × ESTATUS LINEA: ' + cuenta(filas, (r) => (norm(val(r, 'ESTATUS EQUIPO')) || '(vacío)') +
    ' / ' + (norm(val(r, 'ESTATUS LINEA')) || '(vacío)')));

  // ¿Cuántos renglones por número, IMEI y NUCO? ¿Es historia (uno en uso y los demás no) o duplicado?
  const porValor = (campo) => {
    const g = {};
    filas.forEach((r) => { const k = norm(val(r, campo)).replace(/^0+/, ''); if (!vacio(k)) (g[k] = g[k] || []).push(r); });
    const rep = Object.keys(g).filter((k) => g[k].length > 1);
    const usoVarios = rep.filter((k) => g[k].filter(enUso).length > 1);
    return campo + ': ' + Object.keys(g).length + ' distintos · ' + rep.length + ' en más de un renglón (máx ' +
      rep.reduce((m, k) => Math.max(m, g[k].length), 0) + ') · ' + usoVarios.length + ' en uso en más de un renglón';
  };
  out.push('', porValor('NUMERO TELEFONO'), porValor('IMEI'), porValor('NUCO'), porValor('NUMERO SIM'));

  // Un mismo número con distintos equipos a lo largo del tiempo, y un mismo equipo con distintos números
  const pares = (a, b) => {
    const g = {};
    filas.forEach((r) => {
      const ka = norm(val(r, a)).replace(/^0+/, ''), kb = norm(val(r, b)).replace(/^0+/, '');
      if (vacio(ka) || vacio(kb)) return;
      (g[ka] = g[ka] || {})[kb] = 1;
    });
    return Object.keys(g).filter((k) => Object.keys(g[k]).length > 1).length;
  };
  out.push('Números que estuvieron en más de un NUCO: ' + pares('NUMERO TELEFONO', 'NUCO') +
    ' · NUCOs que tuvieron más de un número: ' + pares('NUCO', 'NUMERO TELEFONO'));

  // Datos del adendum y del plan en renglones sin número (no deberían tener)
  ['COMPAÑIA', 'RAZON SOCIAL', 'COSTO PLAN', 'INICIO PLAN', 'FIN PLAN', 'FOLIO', 'PATRON', 'PIN EQUIPO',
    'PIN WHATSAPP', 'EQUIPO', 'IMEI', 'ACCESORIOS'].forEach((h) => {
    if (c(h) < 0) return;
    out.push(h + ': lleno en renglones SIN número ' + filas.filter((r) => !tieneNum(r) && !vacio(val(r, h))).length +
      ' · SIN equipo ' + filas.filter((r) => !tieneEq(r) && !vacio(val(r, h))).length +
      ' · en uso con número y vacío ' + uso.filter((r) => tieneNum(r) && vacio(val(r, h))).length);
  });
  out.push('COSTO PLAN en uso (top): ' + cuenta(uso.filter(tieneNum), (r) => norm(val(r, 'COSTO PLAN')) || '(vacío)')
    .split(' · ').slice(0, 12).join(' · '));
  out.push('COMPAÑIA × RAZON SOCIAL en uso: ' + cuenta(uso.filter(tieneNum), (r) => norm(val(r, 'COMPAÑIA')) + ' / ' +
    norm(val(r, 'RAZON SOCIAL'))));
  const fin = (r) => { const f = val(r, 'FIN PLAN'); return f instanceof Date ? f.getFullYear() : (vacio(f) ? '(vacío)' : 'texto'); };
  out.push('Año del FIN PLAN en uso con número: ' + cuenta(uso.filter(tieneNum), fin));

  // Las demás pestañas: encabezados, renglones y a qué apuntan
  ss.getSheets().forEach((h) => {
    if (h.getName() === 'LINEAS TELEFONICAS') return;
    const n = h.getLastRow(), m = h.getLastColumn();
    const e = m ? h.getRange(1, 1, 1, m).getValues()[0].map((x) => String(x).trim() || '(sin nombre)') : [];
    out.push('', '=== ' + h.getName() + ' · ' + Math.max(n - 1, 0) + ' renglones · ' + m + ' columnas', e.join(' | '));
  });

  for (let i = 0; i < out.length; i += 30) console.log(out.slice(i, i + 30).join('\n'));
  return 'Listo: ver el registro de ejecución.';
}

/**
 * Parte 4: en CAMBIOS LINEAS TELEFONICAS, cuántas veces se sobrescribió cada campo de la fila (número, IMEI, equipo,
 * plan, fin de plan, responsable…) y en cuántos renglones distintos, por año. Solo cuenta; no escribe nada.
 */
function reestructuraMedirCambios() {
  soloEditor_();
  const ss = SpreadsheetApp.openById(leerConfig_('SS_ID_TELEFONIA'));
  const v = ss.getSheetByName('CAMBIOS LINEAS TELEFONICAS').getDataRange().getValues();
  const enc = v[0].map((h) => String(h).trim());
  const c = (n) => enc.indexOf(n);
  const norm = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().toUpperCase();
  const t = {};
  v.slice(1).forEach((r) => {
    const campo = norm(r[c('CAMPO')]) || '(vacío)';
    const f = r[c('FECHA ACTUALIZACION')];
    const anio = f instanceof Date ? f.getFullYear() : 'sin fecha';
    const k = campo;
    t[k] = t[k] || { total: 0, filas: {}, anios: {}, ej: '' };
    t[k].total++;
    t[k].filas[norm(r[c('ID_LINEA')])] = 1;
    t[k].anios[anio] = (t[k].anios[anio] || 0) + 1;
    if (!t[k].ej && norm(r[c('ANTES')]) && norm(r[c('DESPUES')])) t[k].ej = String(r[c('ANTES')]).slice(0, 20) + ' → ' + String(r[c('DESPUES')]).slice(0, 20);
  });
  const out = ['CAMPO | cambios | renglones | por año | ejemplo'];
  Object.keys(t).sort((a, b) => t[b].total - t[a].total).forEach((k) => {
    out.push([k, t[k].total, Object.keys(t[k].filas).length,
      Object.keys(t[k].anios).sort().map((a) => a + '=' + t[k].anios[a]).join(' '), t[k].ej].join(' | '));
  });
  out.push('TABLA: ' + (function () {
    const g = {};
    v.slice(1).forEach((r) => { const k = norm(r[c('TABLA')]); g[k] = (g[k] || 0) + 1; });
    return Object.keys(g).map((k) => k + '=' + g[k]).join(' · ');
  })());
  for (let i = 0; i < out.length; i += 30) console.log(out.slice(i, i + 30).join('\n'));
  return 'Listo';
}

/**
 * Pregunta del usuario (3-oct): ¿el color puede ir en la información del equipo? Cuenta, sin escribir nada, los colores
 * capturados en INSPECCIONES LINEAS y RESPONSIVAS LINEAS: cuántos NUCO de EQUIPOS tendrían color, cuántos tienen
 * colores distintos entre documentos y cómo vienen escritos.
 */
function reestructuraMedirColor() {
  soloEditor_();
  const ss = SpreadsheetApp.openById(leerConfig_('SS_ID_TELEFONIA'));
  const norm = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().toUpperCase();
  const vacio = (x) => ['', 'N/A', 'NA', 'NO APLICA', '-'].indexOf(norm(x)) >= 0;
  const porNuco = {};
  const escritos = {};
  const resumen = [];
  ['INSPECCIONES LINEAS', 'RESPONSIVAS LINEAS'].forEach((hoja) => {
    const h = ss.getSheetByName(hoja);
    if (!h) { resumen.push(hoja + ': no existe'); return; }
    const v = h.getDataRange().getValues();
    const enc = v[0].map((x) => norm(x));
    const cColor = enc.indexOf('COLOR');
    const cNuco = enc.indexOf('NUCO');
    const cFecha = enc.findIndex((x) => /^FECHA/.test(x));
    let conColor = 0;
    v.slice(1).forEach((r) => {
      const color = cColor >= 0 ? r[cColor] : '';
      if (vacio(color)) return;
      conColor++;
      escritos[norm(color)] = (escritos[norm(color)] || 0) + 1;
      const nuco = LineasUtil.nucoVisible(r[cNuco]);
      if (!nuco) return;
      (porNuco[nuco] = porNuco[nuco] || []).push({ color: norm(color), fecha: r[cFecha] instanceof Date ? r[cFecha] : null, hoja: hoja });
    });
    resumen.push(hoja + ': ' + (v.length - 1) + ' renglones, ' + conColor + ' con color (columna COLOR ' + (cColor >= 0 ? 'sí' : 'NO') + ' existe)');
  });
  const equipos = ss.getSheetByName('EQUIPOS').getDataRange().getValues();
  const encE = equipos[0].map((x) => norm(x));
  const nucos = equipos.slice(1).map((r) => LineasUtil.nucoVisible(r[encE.indexOf('NUCO')])).filter(Boolean);
  const estatus = equipos.slice(1).map((r) => norm(r[encE.indexOf('ESTATUS EQUIPO')]));
  let conColor = 0;
  let enUsoConColor = 0;
  let distintos = 0;
  const ejemplosDistintos = [];
  nucos.forEach((n, i) => {
    const docs = porNuco[n];
    if (!docs) return;
    conColor++;
    if (estatus[i] === 'USO') enUsoConColor++;
    const colores = docs.map((d) => d.color).filter((c, j, a) => a.indexOf(c) === j);
    if (colores.length > 1) {
      distintos++;
      if (ejemplosDistintos.length < 12) ejemplosDistintos.push('NUCO ' + n + ': ' + colores.join(' / '));
    }
  });
  const out = resumen.concat([
    'EQUIPOS: ' + nucos.length + ' NUCO; con color en algún documento: ' + conColor + ' (en USO: ' + enUsoConColor + ' de ' + estatus.filter((x) => x === 'USO').length + ')',
    'NUCO con colores distintos entre documentos: ' + distintos + (ejemplosDistintos.length ? ' · ej. ' + ejemplosDistintos.join(' | ') : ''),
    'Cómo viene escrito (valor · veces): ' + Object.keys(escritos).sort((a, b) => escritos[b] - escritos[a]).slice(0, 40).map((k) => k + ' ' + escritos[k]).join(' · '),
  ]);
  for (let i = 0; i < out.length; i += 20) console.log(out.slice(i, i + 20).join('\n'));
  return 'Listo';
}

/**
 * Etapa 3, paso 2 (rapidez al guardar): enciende o apaga el registro de tiempos (Script Property LINEAS_MEDIR). Con
 * él encendido, cada lectura, escritura y caché de un guardado deja su tiempo en Ejecuciones. Correrla otra vez lo
 * apaga.
 */
function reestructuraMedirTiempos() {
  soloEditor_();
  const p = PropertiesService.getScriptProperties();
  const encendido = p.getProperty('LINEAS_MEDIR') === '1';
  if (encendido) p.deleteProperty('LINEAS_MEDIR'); else p.setProperty('LINEAS_MEDIR', '1');
  console.log('Registro de tiempos ' + (encendido ? 'APAGADO' : 'ENCENDIDO'));
  return encendido ? 'apagado' : 'encendido';
}

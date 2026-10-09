/**
 * LineasIneLectura.gs
 * Pendiente 2.28, etapa B (9-oct): de quién es cada identificación que encontró el inventario (etapa A, pestaña
 * «INE NUCOS» del libro del DEV, LineasIneNucos.gs).
 *
 * 1. LECTURA (lenta: unos 5 s por archivo). Por cada candidata (lo que el nombre o el texto marcó), Drive hace una
 *    copia como Documento con OCR en una carpeta temporal del DEV (dentro de la carpeta de NUCOS de pruebas, nunca la
 *    de producción), se lee el texto y la copia se manda a la papelera. Del texto sale: el lado (frente o vuelta), la
 *    CURP (con su dígito verificador), la fecha de nacimiento (de la CURP, del frente o del renglón de la vuelta), el
 *    nombre del renglón de la vuelta, el número IDMEX y la clave de elector. Del resto del texto solo se guardan las
 *    palabras que son nombres o apellidos de Capital Humano (no el domicilio). Va a la pestaña «INE LECTURA».
 * 2. ENSAYO (rápido, se repite cuando se quiera). Liga cada archivo a una persona de COLABORADORES ACTUALIZADO:
 *    misma fecha de nacimiento y su apellido y nombre en el texto (CURP), o, sin fecha, su nombre completo (NOMBRE).
 *    Junta los archivos de cada carpeta y los compara con la responsiva o la inspección de esa carpeta (NUCO + RESP o
 *    INSP DD MM + año). Pestaña «INE ENSAYO»: SEGURA, DUDOSA (la confirma el área) o SIN DUEÑO. No mueve nada.
 *
 * Nada de esto escribe en NUCOS ni en el libro de producción. Solo en un DEV y desde el editor.
 *
 * Desde el editor:
 *   lineasIneLectura_muestra()   24 archivos de cada tipo (PDF, foto chica, foto pesada, foto de inspección), con su
 *                                texto en la pestaña, para revisar que el OCR sirva antes de leer todo
 *   lineasIneLectura_todo()      todas (empieza de cero; tandas de 4.5 min que se reprograman solas)
 *   lineasIneLectura_estado() · lineasIneLectura_detener()
 *   lineasIneEnsayo()            arma «INE ENSAYO» con lo leído hasta ese momento
 */
const INE_LEC_PROP = 'LINEAS_INE_LECTURA';
const INE_LEC_CONTINUAR = 'lineasIneLectura_continuar';
const INE_LEC_PESTANA = 'INE LECTURA';
const INE_LEC_TEMPORAL = 'INE NUCOS - OCR TEMPORAL';
const INE_LEC_ENCABEZADOS = ['ID', 'NUCO', 'RUTA', 'ARCHIVO', 'KB', 'TIPO', 'LADO', 'CURP', 'CURP OK', 'NACIMIENTO', 'SEXO',
  'NOMBRE VUELTA', 'IDMEX', 'CLAVE ELECTOR', 'NOMBRES EN TEXTO', 'ERROR', 'SEG'];
const INE_LEC_TANDA_MS = 4.5 * 60 * 1000;
const INE_ENSAYO_PESTANA = 'INE ENSAYO';
const INE_ENSAYO_ENCABEZADOS = ['NUCO', 'CARPETA', 'ARCHIVOS', 'LADOS', 'IDS', 'ID PERSONA', 'No EMPLEADO', 'NOMBRE', 'COMO',
  'EN EL DOCUMENTO', 'RESULTADO', 'NOTA'];

function lineasIneLectura_muestra() {
  soloEditor_();
  ineNucosExigirDev_();
  ineLecBorrarActivadores_();
  const hoja = ineLecPestana_(true, true);
  const cand = ineLecCandidatas_();
  const grupos = { pdf: [], chica: [], pesada: [], inspeccion: [] };
  cand.forEach((c) => {
    if (/^INSPECCION/i.test(c.ruta)) grupos.inspeccion.push(c);
    else if (!/^image\//.test(c.tipo)) grupos.pdf.push(c);
    else grupos[Number(c.kb) > 2048 ? 'pesada' : 'chica'].push(c);
  });
  const lista = [];
  Object.keys(grupos).forEach((g) => {
    const l = grupos[g];
    for (let k = 0; k < 6 && l.length; k++) lista.push(l[Math.floor((k + 0.5) * l.length / 6)]);
  });
  const st = { fase: 'MUESTRA', leidos: 0, errores: 0, inicio: new Date().toISOString() };
  ineLecLeerLista_(lista, hoja, st, () => true, true);
  st.fase = 'LISTO';
  ineLecGuardar_(st);
  return ineLecInforme_(st);
}

function lineasIneLectura_todo() {
  soloEditor_();
  ineNucosExigirDev_();
  ineLecBorrarActivadores_();
  ineLecPestana_(true, false);
  ineLecGuardar_({ fase: 'LEER', leidos: 0, errores: 0, inicio: new Date().toISOString() });
  return lineasIneLectura_continuar();
}

function lineasIneLectura_continuar() {
  ineLecBorrarActivadores_();
  ineNucosExigirDev_();
  const st = ineLecLeer_();
  if (!st || st.fase !== 'LEER') return ineLecInforme_(st);
  const inicio = Date.now();
  const hoja = ineLecPestana_(false, false);
  const leidas = {};
  if (hoja.getLastRow() > 1) hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().forEach((r) => { leidas[r[0]] = true; });
  const faltan = ineLecCandidatas_().filter((c) => !leidas[c.id]);
  st.faltan = faltan.length;
  let espera = 60;
  try {
    ineLecLeerLista_(faltan, hoja, st, () => Date.now() - inicio < INE_LEC_TANDA_MS, false);
    delete st.pausa;
  } catch (e) {
    if (!ineLecEsCuota_(e)) {
      st.error = e.message;
      ineLecGuardar_(st);
      throw e;
    }
    // Límite de Google (llamadas o tiempo del día): no se anota como error; se sigue en 30 min
    st.pausa = new Date().toISOString() + ' · ' + String(e.message || e).slice(0, 150);
    espera = 30 * 60;
  }
  if (st.faltan <= 0) { st.fase = 'LISTO'; st.fin = new Date().toISOString(); }
  ineLecGuardar_(st);
  if (st.fase === 'LEER') ScriptApp.newTrigger(INE_LEC_CONTINUAR).timeBased().after(espera * 1000).create();
  return ineLecInforme_(st);
}

function lineasIneLectura_estado() {
  return ineLecInforme_(ineLecLeer_());
}

function lineasIneLectura_detener() {
  ineLecBorrarActivadores_();
  const st = ineLecLeer_();
  if (st && st.fase === 'LEER') { st.fase = 'DETENIDO'; ineLecGuardar_(st); }
  return ineLecInforme_(st);
}

// ---------------------------------------------------------------------------------------------------------------

const ineLecLeer_ = () => {
  const crudo = PropertiesService.getScriptProperties().getProperty(INE_LEC_PROP);
  try { return crudo ? JSON.parse(crudo) : null; } catch (e) { return null; }
};
const ineLecGuardar_ = (st) => PropertiesService.getScriptProperties().setProperty(INE_LEC_PROP, JSON.stringify(st));

function ineLecBorrarActivadores_() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === INE_LEC_CONTINUAR).forEach((t) => ScriptApp.deleteTrigger(t));
}

/** Una pestaña del libro del DEV; `nueva` la vacía. La muestra lleva además el texto completo (TEXTO). */
function ineLecHoja_(nombre, encabezados, nueva) {
  const libro = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.TELEFONIA());
  let hoja = libro.getSheetByName(nombre);
  if (hoja && nueva) { libro.deleteSheet(hoja); hoja = null; }
  if (!hoja) {
    hoja = libro.insertSheet(nombre, libro.getSheets().length);
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, hoja.getMaxRows(), encabezados.length).setNumberFormat('@');
  }
  return hoja;
}
const ineLecPestana_ = (nueva, conTexto) => ineLecHoja_(INE_LEC_PESTANA, INE_LEC_ENCABEZADOS.concat(conTexto ? ['TEXTO'] : []), nueva);

/** Las candidatas del inventario (nombre o texto), en orden de NUCO. */
function ineLecCandidatas_() {
  const hoja = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.TELEFONIA()).getSheetByName(INE_NUCOS_PESTANA);
  if (!hoja || hoja.getLastRow() < 2) throw new Error('Falta el inventario: corre lineasIneNucos_inventario() primero.');
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, 9).getValues()
    .filter((r) => r[7] || r[8])
    .map((r) => ({ nuco: String(r[0]), ruta: String(r[1]), nombre: String(r[2]), id: String(r[3]), tipo: String(r[4]), kb: r[5] }));
}

/** La carpeta temporal de las copias con OCR: dentro de la carpeta de NUCOS del DEV, nunca la de producción. */
function ineLecTemporal_() {
  const raiz = LineasArchivos.carpetaNucosId();
  if (raiz === LINEAS_DRIVE_NUCOS_ID) throw new Error('La carpeta de NUCOS de este proyecto es la de producción: la lectura solo corre en un DEV.');
  const padre = DriveApp.getFolderById(raiz);
  const it = padre.getFoldersByName(INE_LEC_TEMPORAL);
  return (it.hasNext() ? it.next() : padre.createFolder(INE_LEC_TEMPORAL)).getId();
}

/** El texto de un archivo de NUCOS: copia como Documento con OCR en la carpeta temporal, se lee y se tira la copia. */
function ineLecTexto_(id, temporal) {
  const copia = Drive.Files.copy({ name: 'OCR ' + id, mimeType: 'application/vnd.google-apps.document', parents: [temporal] }, id,
    { ocrLanguage: 'es', supportsAllDrives: true, fields: 'id' });
  try {
    return DocumentApp.openById(copia.id).getBody().getText();
  } finally {
    try { DriveApp.getFileById(copia.id).setTrashed(true); } catch (e) { console.warn('INE LECTURA: no se tiró la copia ' + copia.id); }
  }
}

/** ¿Es un límite de Google (cuota, demasiadas llamadas) y no algo del archivo? Esos se reintentan, no se anotan. */
const ineLecEsCuota_ = (e) => /quota|rate ?limit|limit exceeded|too many|demasiad|l[ií]mite|cuota/i.test(String((e && e.message) || e));

/** Lee la lista mientras `queda()`, escribiendo cada 10 renglones. */
function ineLecLeerLista_(lista, hoja, st, queda, conTexto) {
  const temporal = ineLecTemporal_();
  const vocabulario = ineLecVocabulario_();
  let filas = [];
  const vaciar = () => {
    if (!filas.length) return;
    hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    filas = [];
    ineLecGuardar_(st);
  };
  try {
    for (let i = 0; i < lista.length && queda(); i++) {
      const c = lista[i];
      const t0 = Date.now();
      let texto = '';
      let error = '';
      try {
        texto = ineLecTexto_(c.id, temporal);
      } catch (e) {
        if (ineLecEsCuota_(e)) throw e;
        error = String(e.message || e).slice(0, 200);
      }
      const l = ineLecInterpretar_(texto, vocabulario);
      const fila = [c.id, c.nuco, c.ruta, c.nombre, c.kb, l.tipo, l.lado, l.curp, l.curpOk ? 'SI' : '', l.nacimiento, l.sexo,
        l.nombreVuelta, l.idmex, l.clave, l.nombres.join(' '), error, Math.round((Date.now() - t0) / 1000)];
      if (conTexto) fila.push(texto.slice(0, 2000));
      filas.push(fila);
      st.leidos++;
      if (error) st.errores++;
      if (st.faltan != null) st.faltan--;
      if (filas.length >= 10) vaciar();
    }
  } finally {
    vaciar();
  }
}

/** Las palabras de los nombres y apellidos de Capital Humano: del texto de una INE solo se guardan esas. */
function ineLecVocabulario_() {
  const ch = ineLecCH_();
  const v = {};
  ch.forEach((p) => p.palabras.forEach((w) => { v[w] = true; }));
  return v;
}

// Nombres de funcionarios del INE/IFE que vienen impresos (la firma) en las credenciales: no son de quien la trae.
const INE_LEC_FIRMAS = ['EDMUNDO JACOBO MOLINA', 'CLAUDIA EDITH SUAREZ OJEDA', 'MARIA ELENA CORNEJO ESPARZA',
  'LORENZO CORDOVA VIANELLO', 'GUADALUPE TADDEI ZAVALA'];
const ineLecSinFirmas_ = (s) => INE_LEC_FIRMAS.reduce((x, f) => x.replace(new RegExp('\\b' + f.replace(/ /g, '\\s+') + '\\b', 'g'), ' '), s);
const ineLecNorm_ = (s) => String(s == null ? '' : s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ineLecPalabras_ = (s) => ineLecNorm_(s).split(/[^A-Z]+/).filter((w) => w.length >= 2);

/** Dígito verificador de la CURP (RENAPO). */
function ineLecDigitoCurp_(c) {
  const dic = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ';
  let s = 0;
  for (let i = 0; i < 17; i++) s += dic.indexOf(c[i]) * (18 - i);
  return String((10 - (s % 10)) % 10);
}

/**
 * La CURP del texto, corrigiendo lo que el OCR suele cambiar (O por 0, I por 1…) según la posición. La posición 17 es
 * letra para quien nació desde 2000 y dígito antes: una O ahí con año de dos dígitos mayor que 15 es un 0 (el dígito
 * verificador no lo nota: la O y el 0 suman lo mismo en esa posición).
 */
function ineLecCurp_(t) {
  const aDigito = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };
  const aLetra = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' };
  const letras = [0, 1, 2, 3, 11, 12, 13, 14, 15];
  const halladas = [];
  (t.replace(/[^A-Z0-9]+/g, ' ').match(/\b[A-Z0-9]{18}\b/g) || []).forEach((tok) => {
    const c = tok.split('').map((ch, i) => {
      if (i >= 4 && i <= 9) return aDigito[ch] || ch;
      if (i === 17 || (i === 16 && Number(tok.slice(4, 6).replace(/O/g, '0')) > 15)) return aDigito[ch] || ch;
      if (letras.indexOf(i) >= 0) return aLetra[ch] || ch;
      return ch;
    }).join('');
    if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(c)) return;
    const mes = Number(c.slice(6, 8));
    const dia = Number(c.slice(8, 10));
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return;
    halladas.push({ curp: c, ok: ineLecDigitoCurp_(c) === c[17] });
  });
  return halladas.filter((h) => h.ok)[0] || halladas[0] || null;
}

/** yymmdd → yyyy-mm-dd (quien tiene INE nació entre 1916 y 2015). */
function ineLecFecha6_(s, siglo2000) {
  const yy = Number(s.slice(0, 2));
  const anio = (siglo2000 == null ? yy <= 15 : siglo2000) ? 2000 + yy : 1900 + yy;
  const mes = Number(s.slice(2, 4));
  const dia = Number(s.slice(4, 6));
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
  return anio + '-' + s.slice(2, 4) + '-' + s.slice(4, 6);
}

/**
 * Lo que dice el texto de una identificación. Las palabras de `vocabulario` (nombres y apellidos de CH) que aparecen,
 * en orden y sin repetir, van en `nombres`: con eso el ensayo busca a la persona sin guardar el resto del texto.
 */
function ineLecInterpretar_(texto, vocabulario) {
  const t = ineLecNorm_(texto);
  const r = { tipo: '', lado: '', curp: '', curpOk: false, nacimiento: '', sexo: '', nombreVuelta: '', idmex: '', clave: '', nombres: [] };
  if (!t.trim()) return r;
  if (/INSTITUTO (NACIONAL|FEDERAL) ELECTORAL|CREDENCIAL PARA VOTAR|IDMEX/.test(t)) r.tipo = 'INE';
  else if (/LICENCIA/.test(t)) r.tipo = 'LICENCIA';
  else if (/PASAPORTE|PASSPORT/.test(t)) r.tipo = 'PASAPORTE';
  const curp = ineLecCurp_(t);
  if (curp) {
    r.curp = curp.curp;
    r.curpOk = curp.ok;
    r.sexo = curp.curp[10];
    r.nacimiento = ineLecFecha6_(curp.curp.slice(4, 10), /[A-Z]/.test(curp.curp[16]) && Number(curp.curp.slice(4, 6)) <= 15);
  }
  const clave = t.replace(/\s+/g, ' ').match(/\b([A-Z]{6}\d{8}[HM]\d{3})\b/);
  if (clave) r.clave = clave[1];
  // La vuelta: tres renglones de máquina (IDMEX…, la fecha de nacimiento y el nombre con «<»). El OCR a veces junta
  // dos en uno, así que se buscan en cualquier parte del renglón.
  const renglones = t.split(/\n/).map((x) => x.replace(/\s+/g, '').replace(/«/g, '<<').replace(/‹/g, '<'));
  renglones.forEach((x) => {
    const id = x.match(/IDMEX(\d{9,10})(?:<+(\d{13}))?/);
    if (id && !r.idmex) r.idmex = id[1] + (id[2] ? '/' + id[2] : '');
    const nac = x.match(/(\d{6})\d([HM])\d{6}\d?MEX/);
    if (nac && !r.nacimiento) { r.nacimiento = ineLecFecha6_(nac[1]); r.sexo = r.sexo || nac[2]; }
    const nom = x.match(/([A-Z]+(?:<[A-Z]+)*)<<([A-Z]+(?:<[A-Z]+)*)(?=<|$)/);
    if (nom && nom[0].length >= 10 && !r.nombreVuelta) r.nombreVuelta = nom[2].replace(/</g, ' ') + ' ' + nom[1].replace(/</g, ' ');
  });
  if (!r.nacimiento) {
    const f = (t.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g) || []).map((x) => x.split('/'))
      .filter((p) => Number(p[2]) >= 1916 && Number(p[2]) <= 2010 && Number(p[1]) >= 1 && Number(p[1]) <= 12)[0];
    if (f) r.nacimiento = f[2] + '-' + f[1] + '-' + f[0];
  }
  if (r.curp || r.clave || /CREDENCIAL PARA VOTAR|DOMICILIO/.test(t)) r.lado = 'FRENTE';
  if (r.idmex || r.nombreVuelta) r.lado = r.lado ? 'LOS DOS' : 'VUELTA';
  const vistos = {};
  ineLecPalabras_(ineLecSinFirmas_(t)).forEach((w) => { if (vocabulario[w] && !vistos[w]) { vistos[w] = true; r.nombres.push(w); } });
  return r;
}

// ---------------------------------------------------------------- ensayo

/**
 * Las personas de COLABORADORES ACTUALIZADO (una por nombre + fecha de nacimiento, con sus números) y su ID PERSONA de
 * PERSONAS. La fecha solo se usa para ligar, como en CapitalHumano.gs.
 */
function ineLecCH_() {
  const ss = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.VEHICULOS());
  const leer = (nombre) => {
    const h = ss.getSheetByName(nombre);
    if (!h || h.getLastRow() < 2) return [];
    const v = h.getRange(1, 1, h.getLastRow(), h.getLastColumn()).getDisplayValues();
    const enc = v[0].map((x) => String(x).trim());
    return v.slice(1).map((r) => { const o = {}; enc.forEach((k, i) => { o[k] = r[i]; }); return o; });
  };
  const ids = {};
  leer(CapitalHumano.HOJA_PERSONAS).forEach((f) => {
    if (f['ID PERSONA']) ids[ineLecNorm_(f['No EMPLEADO']).trim() + '|' + ineLecPalabras_(f['NOMBRE COMPLETO']).join(' ')] = f['ID PERSONA'];
  });
  return ineLecPersonas_(leer(CapitalHumano.HOJA_CH), ids);
}

/** Puro: renglones de CH + {número|nombre → ID PERSONA} → personas. */
function ineLecPersonas_(filas, ids) {
  const personas = {};
  filas.forEach((f) => {
    const nombre = ineLecPalabras_(f['NOMBRE COMPLETO']).join(' ');
    if (!nombre) return;
    const m = String(f['FECHA DE NACIMIENTO'] || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const nac = m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
    const clave = nombre + '|' + nac;
    const num = ineLecNorm_(f['No EMPLEADO']).trim();
    let p = personas[clave];
    if (!p) {
      p = personas[clave] = { nombre, nac, numeros: [], id: '', paterno: ineLecPalabras_(f['APELLIDO PATERNO']),
        materno: ineLecPalabras_(f['APELLIDO MATERNO']), nombres: ineLecPalabras_(f['NOMBRES']), palabras: nombre.split(' ') };
    }
    if (num && p.numeros.indexOf(num) < 0) p.numeros.push(num);
    if (!p.id) p.id = ids[num + '|' + nombre] || '';
  });
  return Object.keys(personas).map((k) => personas[k]);
}

/** Índices para buscar rápido: por fecha de nacimiento y por la primera palabra del apellido paterno. */
function ineLecIndice_(personas) {
  const ix = { porNac: {}, porPaterno: {}, porNombre: {} };
  personas.forEach((p) => {
    if (p.nac) (ix.porNac[p.nac] = ix.porNac[p.nac] || []).push(p);
    if (p.paterno[0]) (ix.porPaterno[p.paterno[0]] = ix.porPaterno[p.paterno[0]] || []).push(p);
    (ix.porNombre[p.nombre] = ix.porNombre[p.nombre] || []).push(p);
  });
  return ix;
}

/** ¿Están en el texto su apellido paterno y su primer nombre? ¿Y el nombre completo? */
function ineLecCoincide_(p, palabras) {
  const tiene = (l) => l.length && l.every((w) => palabras[w]);
  return { basico: tiene(p.paterno) && !!p.nombres.length && !!palabras[p.nombres[0]],
    completo: tiene(p.paterno) && (!p.materno.length || tiene(p.materno)) && tiene(p.nombres) };
}

/** Un archivo leído → { persona, como } o { persona: null, nota }. */
function ineLecPersonaDe_(l, ix) {
  const palabras = {};
  ineLecSinFirmas_(String(l.nombres || '')).split(' ').concat(ineLecPalabras_(l.nombreVuelta)).forEach((w) => { if (w) palabras[w] = true; });
  if (l.nacimiento) {
    let mismos = (ix.porNac[l.nacimiento] || []).filter((p) => ineLecCoincide_(p, palabras).basico);
    if (mismos.length > 1) mismos = mismos.filter((p) => ineLecCoincide_(p, palabras).completo);
    if (l.curp && mismos.length > 1) mismos = mismos.filter((p) => p.paterno[0] && p.paterno[0][0] === l.curp[0]);
    if (mismos.length === 1) return { persona: mismos[0], como: l.curp ? 'CURP' : 'FECHA Y NOMBRE' };
    if (mismos.length > 1) return { persona: null, nota: mismos.length + ' personas con esa fecha y nombre' };
  }
  const vistos = {};
  const porNombre = [];
  const parcial = [];
  Object.keys(palabras).forEach((w) => (ix.porPaterno[w] || []).forEach((p) => {
    if (vistos[p.nombre + '|' + p.nac]) return;
    vistos[p.nombre + '|' + p.nac] = true;
    const c = ineLecCoincide_(p, palabras);
    if (c.completo) porNombre.push(p);
    else if (c.basico && p.materno.length && p.materno.every((x) => palabras[x])) parcial.push(p);
  }));
  // Sin nombre completo: apellidos y primer nombre (un segundo nombre que el OCR no leyó), si es una sola persona
  if (!porNombre.length && parcial.length === 1) return { persona: parcial[0], como: 'NOMBRE' };
  if (!porNombre.length && parcial.length > 1) return { persona: null, nota: 'el texto coincide en parte con ' + parcial.length + ' personas' };
  // Dos empleos con el mismo nombre y sin fecha (o con fechas distintas) pueden ser la misma persona o homónimos
  const nombres = {};
  porNombre.forEach((p) => { nombres[p.nombre] = (nombres[p.nombre] || []).concat([p]); });
  const claves = Object.keys(nombres);
  if (claves.length === 1 && nombres[claves[0]].length === 1) return { persona: porNombre[0], como: 'NOMBRE' };
  if (claves.length === 1) return { persona: null, nota: nombres[claves[0]].length + ' personas con ese nombre' };
  if (claves.length > 1) {
    // El nombre más largo que está completo (JUAN CARLOS PEREZ LOPEZ gana a JUAN PEREZ LOPEZ)
    const largo = claves.sort((a, b) => b.split(' ').length - a.split(' ').length);
    if (largo[0].split(' ').length > largo[1].split(' ').length && nombres[largo[0]].length === 1) return { persona: nombres[largo[0]][0], como: 'NOMBRE' };
    return { persona: null, nota: 'el texto coincide con ' + claves.length + ' nombres' };
  }
  return { persona: null, nota: l.lado ? 'no está en Capital Humano' : 'no se leyó' };
}

/** «CARTA RESPONSIVA/2025/RESP 10 05» → { tipo: 'RESP', fecha: '2025-05-10' }; INSPECCIONES igual con INSP. */
function ineLecDocumentoDeRuta_(ruta) {
  const partes = String(ruta || '').toUpperCase().split('/').map((x) => x.trim());
  const anio = partes.filter((x) => /^\d{4}$/.test(x))[0];
  const hoja = partes.map((x) => x.match(/^(RESP|INSP)\s+(\d{1,2})\s+(\d{1,2})\b/)).filter(Boolean)[0];
  if (!anio || !hoja) return null;
  return { tipo: hoja[1], fecha: anio + '-' + ('0' + hoja[3]).slice(-2) + '-' + ('0' + hoja[2]).slice(-2) };
}

/**
 * ¿La persona es la que dice el documento? Sus apellidos y su primer nombre están en el nombre del documento (que
 * puede traer otra letra en un segundo nombre, «MICHELL» y «MICHEL», o el nombre en otro orden).
 */
function ineLecEsElDelDoc_(p, nombreDoc) {
  if (p.nombre === nombreDoc) return true;
  if (!p.paterno || !p.nombres || !p.nombres.length) return false;
  const doc = {};
  String(nombreDoc).split(' ').forEach((w) => { doc[w] = true; });
  return p.paterno.every((w) => doc[w]) && p.materno.every((w) => doc[w]) && !!doc[p.nombres[0]];
}

/** La persona de Capital Humano que es la del documento: por nombre exacto o, si no, la única que cumple lo de arriba. */
function ineLecPersonaDelDoc_(nombreDoc, ix) {
  const exactas = ix.porNombre[nombreDoc] || [];
  if (exactas.length) return exactas.length === 1 ? exactas[0] : null;
  const vistos = {};
  const cumplen = [];
  String(nombreDoc).split(' ').forEach((w) => (ix.porPaterno[w] || []).forEach((p) => {
    const k = p.nombre + '|' + p.nac;
    if (vistos[k]) return;
    vistos[k] = true;
    if (ineLecEsElDelDoc_(p, nombreDoc)) cumplen.push(p);
  }));
  return cumplen.length === 1 ? cumplen[0] : null;
}

/** NUCO|tipo|fecha → nombres de los responsables de esa responsiva o inspección. */
function ineLecDocumentos_() {
  const ss = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.TELEFONIA());
  const salida = {};
  const nuco = (v) => String(v || '').trim().replace(/^0+/, '');
  const leer = (nombre, tipo, fechaDe, nombres) => {
    const h = ss.getSheetByName(nombre);
    if (!h || h.getLastRow() < 2) return;
    const v = h.getRange(1, 1, h.getLastRow(), h.getLastColumn()).getValues();
    const enc = v[0].map((x) => String(x).trim());
    v.slice(1).forEach((r) => {
      const o = {};
      enc.forEach((k, i) => { o[k] = r[i]; });
      const fecha = fechaDe(o);
      if (!fecha || !nuco(o.NUCO)) return;
      const k = nuco(o.NUCO) + '|' + tipo + '|' + fecha;
      // Una celda puede traer dos personas separadas por «/» (99 inspecciones y 59 responsivas del libro, 9-oct)
      salida[k] = (salida[k] || []).concat([].concat.apply([], nombres.map((c) => String(o[c] || '').split('/')))
        .map((x) => ineLecPalabras_(x).join(' ')).filter(Boolean));
    });
  };
  const iso = (v) => (v instanceof Date && !isNaN(v.getTime()) ? Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : '');
  const dma = (o) => {
    const d = Number(o.DIA), a = Number(o['AÑO']);
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const m = Number(o.MES) || meses.indexOf(ineLecNorm_(o.MES).trim()) + 1;
    return d && m && a ? a + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2) : '';
  };
  leer('RESPONSIVAS LINEAS', 'RESP', (o) => iso(o['FECHA RESPONSIVA']) || dma(o),
    ['RESPONSABLE', 'NOMBRE SEGUNDO RESPONSABLE', 'NOMBRE TERCER RESPONSABLE', 'NOMBRE CUARTO RESPONSABLE', 'NOMBRE QUINTO RESPONSABLE']);
  leer('INSPECCIONES LINEAS', 'INSP', (o) => iso(o['FECHA DE REGISTRO']), ['RESPONSABLE']);
  return salida;
}

/**
 * Puro: archivos leídos → renglones del ensayo, uno por carpeta y persona. Los archivos sin persona de una carpeta
 * con una sola persona son suyos (la vuelta sin nombre legible, por ejemplo); una carpeta sin nadie leído toma al
 * responsable de su documento si es uno solo (DUDOSA).
 */
function ineLecEnsayo_(leidos, ix, documentos) {
  const carpetas = {};
  leidos.forEach((l) => {
    const k = l.nuco + '|' + l.ruta;
    (carpetas[k] = carpetas[k] || { nuco: l.nuco, ruta: l.ruta, archivos: [] }).archivos.push(l);
  });
  const filas = [];
  Object.keys(carpetas).sort().forEach((k) => {
    const c = carpetas[k];
    const doc = ineLecDocumentoDeRuta_(c.ruta);
    const esperados = doc ? (documentos[String(c.nuco).replace(/^0+/, '') + '|' + doc.tipo + '|' + doc.fecha] || null) : null;
    const grupos = {};
    const sueltos = [];
    const notas = [];
    c.archivos.forEach((l) => {
      const r = ineLecPersonaDe_(l, ix);
      if (!r.persona) { sueltos.push(l); if (r.nota) notas.push(r.nota); return; }
      const g = r.persona.nombre + '|' + r.persona.nac;
      grupos[g] = grupos[g] || { persona: r.persona, como: r.como, archivos: [] };
      if (r.como === 'CURP' || (r.como === 'FECHA Y NOMBRE' && grupos[g].como === 'NOMBRE')) grupos[g].como = r.como;
      grupos[g].archivos.push(l);
    });
    let lista = Object.keys(grupos).map((g) => grupos[g]);
    if (sueltos.length && lista.length === 1) {
      lista[0].archivos = lista[0].archivos.concat(sueltos);
      lista[0].nota = 'con ' + sueltos.length + ' de la misma carpeta';
      sueltos.length = 0;
    }
    if (!lista.length && sueltos.length && esperados && esperados.length === 1) {
      const p = ineLecPersonaDelDoc_(esperados[0], ix);
      lista = [{ persona: p || { nombre: esperados[0], numeros: [], id: '' }, como: 'RESPONSIVA', archivos: sueltos.slice() }];
      sueltos.length = 0;
    }
    const enDoc = esperados ? esperados.join(' / ') : (doc ? 'no está en ' + (doc.tipo === 'RESP' ? 'RESPONSIVAS LINEAS' : 'INSPECCIONES LINEAS') : '');
    lista.forEach((g) => {
      const esDelDoc = !!esperados && esperados.some((e) => ineLecEsElDelDoc_(g.persona, e));
      let resultado = 'DUDOSA';
      const nota = [];
      if (g.nota) nota.push(g.nota);
      if ((g.como === 'CURP' || g.como === 'FECHA Y NOMBRE') && (!esperados || esDelDoc)) resultado = 'SEGURA';
      // Solo por nombre, pero el documento de la misma carpeta dice la misma persona: dos fuentes que coinciden
      if (g.como === 'NOMBRE' && esDelDoc) resultado = 'SEGURA';
      if (esperados && !esDelDoc && g.como !== 'RESPONSIVA') nota.push('no es responsable del documento de la carpeta');
      if (g.como === 'RESPONSIVA') nota.push('no se leyó: se toma al responsable');
      if (g.como === 'NOMBRE') nota.push(esDelDoc ? 'por nombre, y es el del documento' : 'solo por nombre');
      if (!g.persona.id) nota.push('sin ID PERSONA');
      filas.push(ineLecFilaEnsayo_(c, g.archivos, g.persona, g.como, enDoc, resultado, nota));
    });
    if (sueltos.length) filas.push(ineLecFilaEnsayo_(c, sueltos, null, '', enDoc, 'SIN DUEÑO', notas.filter((x, i) => notas.indexOf(x) === i)));
  });
  return filas;
}

function ineLecFilaEnsayo_(c, archivos, persona, como, enDoc, resultado, nota) {
  const lados = archivos.map((a) => a.lado || '?').join(', ');
  return [c.nuco, c.ruta, archivos.length, lados, archivos.map((a) => a.id).join(', '), persona ? persona.id : '',
    persona ? persona.numeros.join(', ') : '', persona ? persona.nombre : '', como, enDoc, resultado, nota.join('; ')];
}

/**
 * Un renglón por archivo: si se leyó dos veces (la lectura del DEV y la de la computadora a la vez, 9-oct, o un
 * reintento de un error), cuenta la lectura sin error.
 */
function ineLecUnoPorArchivo_(leidos) {
  const porId = {};
  const orden = [];
  leidos.forEach((l) => {
    if (!(l.id in porId)) { porId[l.id] = l; orden.push(l.id); } else if (porId[l.id].error && !l.error) porId[l.id] = l;
  });
  return orden.map((id) => porId[id]);
}

function lineasIneEnsayo() {
  soloEditor_();
  ineNucosExigirDev_();
  const hoja = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.TELEFONIA()).getSheetByName(INE_LEC_PESTANA);
  if (!hoja || hoja.getLastRow() < 2) throw new Error('No hay nada leído: corre lineasIneLectura_muestra() o lineasIneLectura_todo().');
  const v = hoja.getRange(1, 1, hoja.getLastRow(), INE_LEC_ENCABEZADOS.length).getValues();
  const col = (k) => INE_LEC_ENCABEZADOS.indexOf(k);
  const leidos = ineLecUnoPorArchivo_(v.slice(1).map((r) => ({ id: r[col('ID')], nuco: String(r[col('NUCO')]), ruta: String(r[col('RUTA')]),
    lado: r[col('LADO')], curp: r[col('CURP')], nacimiento: String(r[col('NACIMIENTO')]), nombreVuelta: r[col('NOMBRE VUELTA')],
    nombres: r[col('NOMBRES EN TEXTO')], error: r[col('ERROR')] })));
  const filas = ineLecEnsayo_(leidos, ineLecIndice_(ineLecCH_()), ineLecDocumentos_());
  const salida = ineLecHoja_(INE_ENSAYO_PESTANA, INE_ENSAYO_ENCABEZADOS, true);
  if (filas.length) salida.getRange(2, 1, filas.length, INE_ENSAYO_ENCABEZADOS.length).setValues(filas);
  const cuenta = {};
  filas.forEach((f) => { cuenta[f[10]] = (cuenta[f[10]] || 0) + 1; });
  const texto = 'INE ENSAYO · ' + leidos.length + ' archivos en ' + filas.length + ' renglones · ' +
    ['SEGURA', 'DUDOSA', 'SIN DUEÑO'].map((k) => k + ' ' + (cuenta[k] || 0)).join(' · ');
  console.log(texto);
  return texto;
}

function ineLecInforme_(st) {
  if (!st) { console.log('INE LECTURA: no se ha corrido.'); return 'Sin correr'; }
  const texto = ['INE LECTURA · ' + st.fase + (st.error ? ' · ERROR: ' + st.error : ''),
    'Leídos: ' + st.leidos + (st.faltan != null ? ' · faltan ' + st.faltan : '') + ' · con error: ' + st.errores]
    .concat(st.pausa ? ['En pausa por un límite de Google (sigue sola en 30 min): ' + st.pausa] : []).join('\n');
  console.log(texto);
  return texto;
}

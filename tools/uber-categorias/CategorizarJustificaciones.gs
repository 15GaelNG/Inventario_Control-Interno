/**
 * CategorizarJustificaciones.gs
 * Lector de justificaciones de Uber: rellena CATEGORIA en los viajes que la tienen vacía, en dos
 * pasadas -- primero palabras clave (gratis, instantáneo) y luego, para lo que no matcheó pero sí
 * tiene texto real, un modelo de lenguaje (Gemini) que lee el SIGNIFICADO en vez de buscar una
 * palabra exacta.
 *
 * NO es parte de inventario-ciudadmaderas (no se sube con `npm run push`, vive solo en tools/
 * como referencia). Validado primero en una copia de "BD JUSTIFICACIONES UBER" (oct-2026); a
 * partir de ahí se decidió instalarlo también en la hoja ORIGINAL (la que se sigue alimentando) --
 * esto SÍ escribe en el archivo real y compartido, a diferencia de lo que se hizo antes.
 *
 * Instalación:
 * 1. Abre la hoja (la original, o una copia si prefieres probar primero) → Extensiones → Apps Script.
 * 2. Pega este archivo completo (reemplaza lo que haya en Code.gs).
 * 3. Para el paso con IA: consigue una clave gratis en https://aistudio.google.com/apikey y
 *    guárdala en Proyecto > Configuración del proyecto > Propiedades del script, con el nombre
 *    GEMINI_API_KEY (o corre una vez guardarClaveGemini('tu-clave-aqui') desde el editor).
 * 4. Corre `categorizarSinCategoria` (▶) una vez, para ponerse al corriente con lo que ya existe.
 *    La primera vez pide autorizar -- acéptalo.
 * 5. Corre `instalarDisparadorCategorias` (▶) UNA vez -- a partir de ahí, cada vez que alguien
 *    llene JUSTIFICACIÓN/MOTIVO/OBSERVACIÓN/COMENTARIOS ANALISTA en un viaje sin categoría, se
 *    categoriza solo en el momento (sin esperar a que alguien corra nada a mano).
 * 6. Revisa los resúmenes: por correo (a quien instaló el disparador) cada vez que categorice algo
 *    nuevo, y en Ver > Registros (Logger) para las corridas manuales.
 *
 * Solo escribe en celdas de CATEGORIA que estén VACÍAS -- nunca pisa una categoría que ya exista,
 * y la IA solo puede responder una categoría de la lista CATEGORIAS_VALIDAS de abajo (si inventa
 * algo que no está en la lista, esa fila se deja en blanco en vez de ensuciar el catálogo). Si algo
 * sale mal, Sheets tiene historial de versiones (Archivo > Historial de versiones).
 *
 * 19-oct-2026: corregirCancelados() arregla 11 filas que una corrida anterior de este mismo
 * script escribió como "CANCELADO/ERROR" sin saber que ya existía "CANCELACION" en su catálogo --
 * corre esa función UNA vez si ya corriste una versión vieja de este archivo; si es tu primera vez,
 * no hace falta (no encontrará nada que corregir).
 */

/** Categorías reales que ya existen en la hoja (sacadas de las ~2,680 filas, oct-2026) -- la IA
 *  SOLO puede elegir una de esta lista (o NINGUNA). Variantes de acento/mayúscula/typo de su
 *  catálogo ya se fusionaron aquí en una sola forma canónica. Si ves que falta una categoría real
 *  que ella use, agrégala a esta lista. */
const CATEGORIAS_VALIDAS = [
  'EVENTOS', 'VIATICOS EN OTRA SEDE', 'BANCO', 'APOYO TRANSPORTE', 'TRAMITES ADMINISTRATIVOS',
  'REUNIONES', 'RESIDENTES', 'COMPRAS', 'NOTARIA', 'APOYO OPERATIVO', 'DESLINDES',
  'SERVICIOS VEHICULARES', 'ENTREGA O RECEPCIÓN DE MATERIAL', 'PPM', 'VIATICOS',
  'SERVICIO SOCIAL RESIDENTES', 'INVENTARIO', 'TRAMITES EN INSTITUCIONES DE GOBIERNO',
  'CAPACITACIÓN', 'ENTREGA Y RECOLECCION DE MATERIAL', 'CANCELACION', 'SUPERVISIÓN DE STAND',
  'SCOUTING', 'ASUNTO CONFIDENCIAL', 'PAQUETERIA/MENSAJERIA', 'INSTALACIÓN', 'DESVINCULACIONES',
  'DILIGENCIA', 'ATENCIÓN DE TICKETS', 'FIRMA DE CLIENTE VIP', 'SINIESTRO', 'TIEMPO EXTRA',
  'GOBIERNO', 'DEVUELTO', 'CLIENTE', 'RECOGER UNIDAD', 'JUZGADOS', 'MANTENIMIENTO', 'REEMBOLSO',
  'PROVEEDORES', 'CAJA CLIENTES',
];

/** Palabras clave: la PRIMERA que matchee gana, así que lo más específico va primero.
 *  Corregidas (oct-2026) contra el catálogo real de arriba -- antes usaba categorías inventadas
 *  (CANCELADO/ERROR) o genéricas (TRAMITES ADMINISTRATIVOS) donde ya existía una más precisa. */
const REGLAS_CATEGORIA = [
  { palabra: 'montaje', categoria: 'EVENTOS' },
  { palabra: 'desmontaje', categoria: 'EVENTOS' },
  { palabra: 'evento', categoria: 'EVENTOS' },
  { palabra: 'compras', categoria: 'COMPRAS' },
  { palabra: 'compra', categoria: 'COMPRAS' },
  { palabra: 'banco', categoria: 'BANCO' },
  { palabra: 'mensajeria', categoria: 'PAQUETERIA/MENSAJERIA' },
  { palabra: 'paqueteria', categoria: 'PAQUETERIA/MENSAJERIA' },

  { palabra: 'stand', categoria: 'SUPERVISIÓN DE STAND' },
  { palabra: 'bootcamp', categoria: 'EVENTOS' },
  { palabra: 'juzgado', categoria: 'JUZGADOS' },
  { palabra: 'corralon', categoria: 'TRAMITES EN INSTITUCIONES DE GOBIERNO' },
  { palabra: 'sspm', categoria: 'TRAMITES EN INSTITUCIONES DE GOBIERNO' },
  { palabra: 'grua', categoria: 'TRAMITES EN INSTITUCIONES DE GOBIERNO' },
  { palabra: 'taller', categoria: 'SERVICIOS VEHICULARES' },
  { palabra: 'reparacion', categoria: 'SERVICIOS VEHICULARES' },
  { palabra: 'cancelacion', categoria: 'CANCELACION' },

  // Las más genéricas al final: cubren la mayoría de los 110 originales, pero son las que más
  // fácil "ganarían" de más arriba si una fila también menciona otra categoría de pasada.
  { palabra: 'traslado', categoria: 'APOYO TRANSPORTE' },
  { palabra: 'chofer', categoria: 'APOYO TRANSPORTE' },
  { palabra: 'recorrido', categoria: 'APOYO TRANSPORTE' },
];

/** Frases que el propio sistema escribe solas (por qué se marcó para revisión), no describen el
 *  viaje -- se quitan antes de decidir si una fila tiene "texto real" que valga la pena mandarle a
 *  la IA (ahorra llamadas y evita que alucine una categoría de la nada). */
const FRASES_BOILERPLATE = [
  'no autorizado por control interno', 'viaje inicia en una ubicacion no reconocida',
  'viaje finaliza en una ubicacion no reconocida', 'viaje inicia y finaliza en ubicacion no reconocida',
  'fuera de horario', 'justificado', 'y ',
];

const HOJA_BASE = 'BASE UBER';
const CLAVE_PROP_API = 'GEMINI_API_KEY';
const MODELO_GEMINI = 'gemini-3.8-flash';
const TAMANO_LOTE_IA = 20;

const txt_ = (v) => (v === null || v === undefined ? '' : String(v));

/** Sin acentos y en minúsculas, para que "Traslado", "TRASLADO" y "traslado" matcheen igual. */
function sinAcentos_(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** El "lector" por palabras clave: un texto libre -> la categoría que reconoce, o '' si ninguna regla matchea. */
function categoriaDeJustificacion_(texto) {
  const limpio = sinAcentos_(texto);
  for (let i = 0; i < REGLAS_CATEGORIA.length; i++) {
    if (limpio.indexOf(REGLAS_CATEGORIA[i].palabra) !== -1) return REGLAS_CATEGORIA[i].categoria;
  }
  return '';
}

/** true si, después de quitar el boilerplate del sistema, no queda nada real que describa el viaje. */
function esSoloBoilerplate_(texto) {
  let limpio = sinAcentos_(texto);
  FRASES_BOILERPLATE.forEach((frase) => { limpio = limpio.split(frase).join(' '); });
  return limpio.replace(/[^a-z]/g, '').length < 6; // casi nada de letras reales sobrevivió
}

function filaConEncabezado_(hoja, buscado, limite) {
  const col = hoja.getRange(1, 1, Math.min(hoja.getLastRow(), limite), 1).getValues();
  for (let i = 0; i < col.length; i++) {
    if (txt_(col[i][0]).trim().toUpperCase() === buscado) return i + 1;
  }
  return 0;
}

function guardarClaveGemini(clave) {
  PropertiesService.getScriptProperties().setProperty(CLAVE_PROP_API, clave);
}

/** Le pregunta a Gemini la categoría de un LOTE de textos en una sola llamada (lotes para no hacer
 *  cientos de llamadas sueltas). Regresa un arreglo del mismo tamaño que `textos`, con la categoría
 *  elegida o '' si Gemini no encontró ninguna que aplicara bien o respondió algo fuera de la lista. */
function categoriasConIA_(textos) {
  const clave = PropertiesService.getScriptProperties().getProperty(CLAVE_PROP_API);
  if (!clave) throw new Error('Falta GEMINI_API_KEY en Propiedades del script (ver instrucciones arriba del archivo)');

  const prompt = 'Eres un clasificador de gastos de viajes de Uber de una empresa inmobiliaria mexicana. ' +
    'Para cada texto de la lista, elige la categoría que mejor describe el MOTIVO del viaje, usando ' +
    'EXCLUSIVAMENTE una de estas categorías (escribe el nombre exacto, tal cual, o "NINGUNA" si de ' +
    'verdad ninguna aplica):\n' + CATEGORIAS_VALIDAS.join(', ') + '\n\n' +
    'Textos (uno por línea, numerados):\n' +
    textos.map((t, i) => (i + 1) + '. ' + t.replace(/\n/g, ' ')).join('\n');

  const cuerpo = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
    },
  };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODELO_GEMINI + ':generateContent?key=' + clave;
  const respuesta = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(cuerpo), muteHttpExceptions: true,
  });
  if (respuesta.getResponseCode() !== 200) {
    throw new Error('Gemini contestó ' + respuesta.getResponseCode() + ': ' + respuesta.getContentText().slice(0, 300));
  }
  const datos = JSON.parse(respuesta.getContentText());
  const texto = datos.candidates[0].content.parts[0].text;
  let elegidas;
  try {
    elegidas = JSON.parse(texto);
  } catch (e) {
    throw new Error('Gemini no regresó JSON válido: ' + texto.slice(0, 300));
  }
  // Solo se aceptan categorías de la lista cerrada -- lo que invente o venga raro se deja en blanco
  return textos.map((_, i) => {
    const c = txt_(elegidas[i]).trim();
    return CATEGORIAS_VALIDAS.indexOf(c) !== -1 ? c : '';
  });
}

/** Los índices de columna (0-based) que usan tanto la corrida manual como el disparador. null si
 *  la hoja no tiene encabezado o le falta CATEGORIA. */
function columnasUtiles_(hoja) {
  const filaEnc = filaConEncabezado_(hoja, 'USUARIO FINAL', 20);
  if (!filaEnc) return null;
  const encabezados = hoja.getRange(filaEnc, 1, 1, hoja.getLastColumn()).getValues()[0].map((h) => txt_(h).trim().toUpperCase());
  const ix = (nombre) => encabezados.indexOf(nombre);
  const iCategoria = ix('CATEGORIA');
  if (iCategoria === -1) return null;
  return {
    filaEnc: filaEnc, ultimaColumna: hoja.getLastColumn(),
    categoria: iCategoria, justificacion: ix('JUSTIFICACIÓN'), motivo: ix('MOTIVO'),
    observacion: ix('OBSERVACIÓN'), comentarios: ix('COMENTARIOS ANALISTA'),
  };
}

/** Categoriza en memoria las filas de `datos` (un rango de la hoja, ya leído con getValues) cuya
 *  CATEGORIA está vacía -- palabra clave primero, Gemini después para lo que no matcheó pero sí
 *  tiene texto real. Muta `datos` donde encuentra algo. `filaInicio` es el número de fila REAL (1-based)
 *  de `datos[0]`, para que los mensajes de resumen digan la fila correcta de la hoja. */
function categorizarEnMemoria_(datos, filaInicio, ix) {
  const pendientesIA = []; // { indice, texto }
  const lineas = [];
  const conteoPorCategoria = {};
  let porPalabraClave = 0;

  datos.forEach((f, i) => {
    if (txt_(f[ix.categoria]).trim()) return; // ya tiene categoría: no se toca
    const texto = [f[ix.justificacion], f[ix.motivo], f[ix.observacion], f[ix.comentarios]].map(txt_).join(' ');
    if (!texto.trim() || esSoloBoilerplate_(texto)) return; // sin nada real que leer

    const cat = categoriaDeJustificacion_(texto);
    if (cat) {
      f[ix.categoria] = cat;
      porPalabraClave++;
      conteoPorCategoria[cat] = (conteoPorCategoria[cat] || 0) + 1;
      lineas.push('Fila ' + (filaInicio + i) + ': ' + cat + ' (palabra clave)');
    } else {
      pendientesIA.push({ indice: i, texto: texto });
    }
  });

  const tieneClaveIA = !!PropertiesService.getScriptProperties().getProperty(CLAVE_PROP_API);
  const erroresIA = [];
  let porIA = 0;
  if (tieneClaveIA) {
    for (let inicio = 0; inicio < pendientesIA.length; inicio += TAMANO_LOTE_IA) {
      const lote = pendientesIA.slice(inicio, inicio + TAMANO_LOTE_IA);
      try {
        const categorias = categoriasConIA_(lote.map((p) => p.texto));
        lote.forEach((p, k) => {
          if (!categorias[k]) return;
          datos[p.indice][ix.categoria] = categorias[k];
          porIA++;
          conteoPorCategoria[categorias[k]] = (conteoPorCategoria[categorias[k]] || 0) + 1;
          lineas.push('Fila ' + (filaInicio + p.indice) + ': ' + categorias[k] + ' (IA)');
        });
      } catch (e) {
        erroresIA.push(e.message);
      }
    }
  }

  return {
    tocadas: porPalabraClave + porIA, conPendiente: pendientesIA.length, porPalabraClave: porPalabraClave,
    porIA: porIA, tieneClaveIA: tieneClaveIA, conteoPorCategoria: conteoPorCategoria, lineas: lineas, erroresIA: erroresIA,
  };
}

function resumenTexto_(r) {
  return 'Con texto real y sin categoría: ' + (r.porPalabraClave + r.conPendiente) + '\n' +
    '  Por palabra clave: ' + r.porPalabraClave + '\n' +
    '  Por IA: ' + r.porIA + (r.tieneClaveIA ? '' : ' (sin GEMINI_API_KEY configurada -- no se intentó)') + '\n' +
    '  Sin resolver: ' + (r.conPendiente - r.porIA) + '\n\n' +
    Object.keys(r.conteoPorCategoria).map((c) => '  ' + c + ': ' + r.conteoPorCategoria[c]).join('\n') +
    (r.erroresIA.length ? '\n\nErrores de IA:\n  ' + r.erroresIA.join('\n  ') : '');
}

/**
 * Rellena CATEGORIA (solo las celdas vacías) en TODA la hoja activa: primero palabras clave, luego
 * Gemini para lo que quedó con texto real y sin matchear. Resumen en Logger. Corre esta una vez para
 * ponerte al corriente; de ahí en adelante, instalarDisparadorCategorias() se encarga solo de lo nuevo.
 */
function categorizarSinCategoria() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_BASE);
  if (!hoja) throw new Error('No se encontró la pestaña "' + HOJA_BASE + '"');
  const ix = columnasUtiles_(hoja);
  if (!ix) throw new Error('No se encontró el encabezado o la columna CATEGORIA');

  const ultimaFila = hoja.getLastRow();
  const datos = hoja.getRange(ix.filaEnc + 1, 1, ultimaFila - ix.filaEnc, ix.ultimaColumna).getValues();
  const r = categorizarEnMemoria_(datos, ix.filaEnc + 1, ix);
  if (r.tocadas > 0) hoja.getRange(ix.filaEnc + 1, 1, datos.length, ix.ultimaColumna).setValues(datos);

  const resumen = resumenTexto_(r);
  Logger.log(resumen);
  return resumen;
}

/**
 * Disparador instalable: se activa solo con cada edición humana de la hoja (instálalo UNA vez con
 * instalarDisparadorCategorias). Si lo que se editó toca JUSTIFICACIÓN/MOTIVO/OBSERVACIÓN/
 * COMENTARIOS ANALISTA de uno o más viajes sin categoría, los categoriza al vuelo y manda un correo
 * de aviso (a quien instaló el disparador) con lo que cambió -- así queda rastro de que algo se
 * escribió solo, aunque nadie esté viendo la hoja en ese momento.
 *
 * No se dispara con lo que escribe el propio script (SpreadsheetApp no reactiva onEdit), así que no
 * hay riesgo de que se llame a sí mismo en bucle.
 */
function alEditarJustificacion(e) {
  try {
    if (!e || !e.range) return;
    const hoja = e.range.getSheet();
    if (hoja.getName() !== HOJA_BASE) return;
    const ix = columnasUtiles_(hoja);
    if (!ix) return;

    const columnasDeTexto = [ix.justificacion, ix.motivo, ix.observacion, ix.comentarios]
      .filter((i) => i !== -1).map((i) => i + 1); // 1-based
    const colInicio = e.range.getColumn();
    const colFin = e.range.getLastColumn();
    if (!columnasDeTexto.some((c) => c >= colInicio && c <= colFin)) return; // no tocó texto relevante

    const filaInicio = Math.max(e.range.getRow(), ix.filaEnc + 1);
    const filaFin = e.range.getLastRow();
    if (filaFin < filaInicio) return; // la edición fue en el encabezado o arriba

    const numFilas = filaFin - filaInicio + 1;
    const datos = hoja.getRange(filaInicio, 1, numFilas, ix.ultimaColumna).getValues();
    const r = categorizarEnMemoria_(datos, filaInicio, ix);
    if (r.tocadas === 0) return;

    hoja.getRange(filaInicio, 1, numFilas, ix.ultimaColumna).setValues(datos);
    avisarPorCorreo_('Uber: ' + r.tocadas + ' viaje(s) categorizado(s) solo', r.lineas.join('\n') +
      (r.erroresIA.length ? '\n\nErrores de IA:\n  ' + r.erroresIA.join('\n  ') : ''));
  } catch (err) {
    avisarPorCorreo_('Uber: el disparador de categorías falló', String(err));
  }
}

function avisarPorCorreo_(asunto, cuerpo) {
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), asunto, cuerpo);
  } catch (e) { /* si falla el correo, ya quedó escrito en la hoja de todos modos */ }
}

/** Corre esto UNA vez para que alEditarJustificacion empiece a correr solo con cada edición. */
function instalarDisparadorCategorias() {
  quitarDisparadorCategorias();
  ScriptApp.newTrigger('alEditarJustificacion').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
  Logger.log('Disparador instalado -- revisa tu correo cada vez que se categorice algo nuevo.');
}

/** Por si alguna vez quieres quitarlo (ej. antes de pegar una versión nueva del archivo). */
function quitarDisparadorCategorias() {
  let quitados = 0;
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'alEditarJustificacion') { ScriptApp.deleteTrigger(t); quitados++; }
  });
  Logger.log('Disparadores quitados: ' + quitados);
}

/** Corrige las filas que una corrida anterior (antes de conocer el catálogo real) dejó como
 *  "CANCELADO/ERROR" -- las vuelve a dejar como "CANCELACION" (la categoría que ella ya tenía). */
function corregirCancelados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA_BASE);
  const filaEnc = filaConEncabezado_(hoja, 'USUARIO FINAL', 20);
  const encabezados = hoja.getRange(filaEnc, 1, 1, hoja.getLastColumn()).getValues()[0].map((h) => txt_(h).trim().toUpperCase());
  const iCategoria = encabezados.indexOf('CATEGORIA');
  const rango = hoja.getRange(filaEnc + 1, iCategoria + 1, hoja.getLastRow() - filaEnc, 1);
  const valores = rango.getValues();
  let corregidas = 0;
  valores.forEach((f) => {
    if (f[0] === 'CANCELADO/ERROR') { f[0] = 'CANCELACION'; corregidas++; }
  });
  if (corregidas) rango.setValues(valores);
  Logger.log('Corregidas: ' + corregidas);
  return corregidas;
}

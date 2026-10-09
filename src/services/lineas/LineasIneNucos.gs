/**
 * LineasIneNucos.gs
 * Pendiente 2.28, paso 2 de la identificación (usuario, 9-oct): las INE que ya están en NUCOS, de antes del sistema.
 *
 * Etapa A (este archivo, por ahora): INVENTARIO. Solo LEE la carpeta NUCOS de producción (LINEAS_DRIVE_NUCOS_ID de
 * LineasAdmin, la misma de siempre) y anota en el libro del DEV, pestaña «INE NUCOS», cada archivo que podría ser una
 * identificación: todo lo que hay en las carpetas de los NUCOS menos los PDF de inspección y responsiva («INSP…»,
 * «RESP…»), las firmas, los patrones y los videos. Después busca en Drive el texto de las credenciales («INSTITUTO
 * NACIONAL ELECTORAL», «IDMEX»…; Drive lee el texto de fotos y PDF) y marca cuáles lo tienen. Con eso se sabe cuántas
 * hay, dónde y cómo se llaman, antes de leerlas una por una (etapa B: la CURP de cada una contra Capital Humano).
 *
 * No escribe en NUCOS ni en el libro de producción. Solo corre en un DEV (Config.ENTORNO) y desde el editor.
 * Tarda: son cientos de carpetas. Corre por tandas de 4.5 min y se vuelve a programar solo hasta terminar
 * (como MigracionTodo); lineasIneNucos_estado() dice cómo va y lineasIneNucos_detener() lo para.
 *
 * Desde el editor:  lineasIneNucos_inventario()  (empieza de cero)  ·  lineasIneNucos_estado()  ·  lineasIneNucos_detener()
 */
const INE_NUCOS_PROP = 'LINEAS_INE_NUCOS';
const INE_NUCOS_CONTINUAR = 'lineasIneNucos_continuar';
const INE_NUCOS_PESTANA = 'INE NUCOS';
const INE_NUCOS_ENCABEZADOS = ['NUCO', 'RUTA', 'ARCHIVO', 'ID', 'TIPO', 'KB', 'MODIFICADO', 'POR NOMBRE', 'POR TEXTO'];
const INE_NUCOS_TANDA_MS = 4.5 * 60 * 1000;
const INE_NUCOS_NUCOS_POR_TANDA = 40;
// Lo que dice una credencial (Drive busca en el texto de fotos y PDF). Cada búsqueda marca su tipo.
const INE_NUCOS_TEXTOS = [
  ['INE', 'INSTITUTO NACIONAL ELECTORAL'], ['INE', 'CREDENCIAL PARA VOTAR'], ['INE', 'IDMEX'],
  ['IFE', 'INSTITUTO FEDERAL ELECTORAL'], ['LICENCIA', 'LICENCIA DE CONDUCIR'], ['PASAPORTE', 'PASAPORTE'],
];

/** Empieza de cero: borra la pestaña «INE NUCOS» del libro del DEV y recorre NUCOS de producción. */
function lineasIneNucos_inventario() {
  soloEditor_();
  ineNucosExigirDev_();
  ineNucosBorrarActivadores_();
  ineNucosPestana_(true);
  ineNucosGuardar_({ fase: 'CARPETAS', cursor: 0, archivos: 0, omitidos: 0, inicio: new Date().toISOString() });
  return lineasIneNucos_continuar();
}

/** Una tanda (lo llama el activador; también se puede correr a mano). */
function lineasIneNucos_continuar() {
  ineNucosBorrarActivadores_();
  ineNucosExigirDev_();
  const st = ineNucosLeer_();
  if (!st || st.fase === 'LISTO') return ineNucosInforme_(st);
  const inicio = Date.now();
  const queda = () => Date.now() - inicio < INE_NUCOS_TANDA_MS;
  try {
    if (st.fase === 'CARPETAS') ineNucosCarpetas_(st, queda);
    if (st.fase === 'TEXTO' && queda()) ineNucosTexto_(st);
  } catch (e) {
    st.error = e.message;
    ineNucosGuardar_(st);
    console.error('INE NUCOS: ' + e.message);
    throw e;
  }
  ineNucosGuardar_(st);
  if (st.fase !== 'LISTO') ScriptApp.newTrigger(INE_NUCOS_CONTINUAR).timeBased().after(60 * 1000).create();
  return ineNucosInforme_(st);
}

function lineasIneNucos_estado() {
  return ineNucosInforme_(ineNucosLeer_());
}

function lineasIneNucos_detener() {
  ineNucosBorrarActivadores_();
  const st = ineNucosLeer_();
  if (st && st.fase !== 'LISTO') { st.fase = 'DETENIDO'; ineNucosGuardar_(st); }
  return ineNucosInforme_(st);
}

// ---------------------------------------------------------------------------------------------------------------

function ineNucosExigirDev_() {
  if (Config.ENTORNO !== 'DEV') throw new Error('El inventario de INE de NUCOS solo corre en un DEV (escribe en su libro).');
}

const ineNucosLeer_ = () => {
  const crudo = PropertiesService.getScriptProperties().getProperty(INE_NUCOS_PROP);
  try { return crudo ? JSON.parse(crudo) : null; } catch (e) { return null; }
};
const ineNucosGuardar_ = (st) => PropertiesService.getScriptProperties().setProperty(INE_NUCOS_PROP, JSON.stringify(st));

function ineNucosBorrarActivadores_() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === INE_NUCOS_CONTINUAR).forEach((t) => ScriptApp.deleteTrigger(t));
}

/** La pestaña del inventario en el libro del DEV; `nueva` la vacía. */
function ineNucosPestana_(nueva) {
  const libro = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.TELEFONIA());
  let hoja = libro.getSheetByName(INE_NUCOS_PESTANA);
  if (hoja && nueva) { libro.deleteSheet(hoja); hoja = null; }
  if (!hoja) {
    hoja = libro.insertSheet(INE_NUCOS_PESTANA, libro.getSheets().length);
    hoja.getRange(1, 1, 1, INE_NUCOS_ENCABEZADOS.length).setValues([INE_NUCOS_ENCABEZADOS]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    hoja.getRange('A:D').setNumberFormat('@');
  }
  return hoja;
}

/** ¿Qué dice el nombre? «INE», «LICENCIA»… o ''. */
function ineNucosPorNombre_(nombre) {
  const t = String(nombre || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const m = t.match(/(?:^|[^A-Z])(INE|IFE|IDENTIFICACION|CREDENCIAL|LICENCIA|PASAPORTE)(?=$|[^A-Z])/);
  return m ? m[1] : '';
}

/** Lo que no puede ser una identificación: PDF de inspección o responsiva, firmas, patrones y videos. */
function ineNucosSeOmite_(f) {
  const nombre = String(f.name || '').trim();
  if (/^video\//.test(f.mimeType || '')) return true;
  if (/^(FIRMA|PATRON)/i.test(nombre)) return true;
  return /\.pdf$/i.test(nombre) && /^(INSP|RESP)\b/i.test(nombre);
}

/** Las carpetas de NUCOS de producción, de NUCO en NUCO (tandas de 40, todas sus subcarpetas a la vez). */
function ineNucosCarpetas_(st, queda) {
  const raices = ineNucosRaices_();
  const hoja = ineNucosPestana_(false);
  while (st.cursor < raices.length && queda()) {
    const tanda = raices.slice(st.cursor, st.cursor + INE_NUCOS_NUCOS_POR_TANDA);
    const rutas = {};
    const nucoDe = {};
    tanda.forEach(([nuco, id]) => { rutas[id] = ''; nucoDe[id] = nuco; });
    const filas = [];
    let nivel = tanda.map(([, id]) => id);
    for (let profundidad = 0; nivel.length && profundidad < 10; profundidad++) {
      const siguiente = [];
      for (let i = 0; i < nivel.length; i += 40) {
        const padres = nivel.slice(i, i + 40);
        let pagina = null;
        do {
          const r = LineasArchivos.listarDrive({
            q: '(' + padres.map((p) => "'" + p + "' in parents").join(' or ') + ') and trashed = false',
            pageSize: 1000, fields: 'nextPageToken,files(id,name,mimeType,parents,size,modifiedTime)', pageToken: pagina || undefined,
          });
          (r.files || []).forEach((f) => {
            const padre = (f.parents || []).filter((p) => p in rutas)[0];
            if (padre === undefined) return;
            const ruta = (rutas[padre] ? rutas[padre] + '/' : '') + f.name;
            if (f.mimeType === 'application/vnd.google-apps.folder') {
              rutas[f.id] = ruta;
              nucoDe[f.id] = nucoDe[padre];
              siguiente.push(f.id);
              return;
            }
            if (ineNucosSeOmite_(f)) { st.omitidos++; return; }
            filas.push([nucoDe[padre], rutas[padre], f.name, f.id, String(f.mimeType || '').replace(/^application\//, ''),
              f.size ? Math.round(Number(f.size) / 1024) : '', f.modifiedTime ? f.modifiedTime.slice(0, 10) : '', ineNucosPorNombre_(f.name), '']);
          });
          pagina = r.nextPageToken || null;
        } while (pagina);
      }
      nivel = siguiente;
    }
    if (filas.length) hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, INE_NUCOS_ENCABEZADOS.length).setValues(filas);
    st.archivos += filas.length;
    st.cursor += tanda.length;
    st.nucos = raices.length;
  }
  if (st.cursor >= raices.length) st.fase = 'TEXTO';
}

/** [[NUCO, idCarpeta]] de NUCOS de producción, en orden de NUCO. */
function ineNucosRaices_() {
  const lista = [];
  let pagina = null;
  do {
    const r = LineasArchivos.listarDrive({
      q: "'" + LINEAS_DRIVE_NUCOS_ID + "' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      pageSize: 1000, fields: 'nextPageToken,files(id,name)', pageToken: pagina || undefined,
    });
    (r.files || []).forEach((f) => lista.push([String(f.name || '').trim(), f.id]));
    pagina = r.nextPageToken || null;
  } while (pagina);
  return lista.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Marca en «POR TEXTO» los archivos del inventario en cuyo texto Drive encuentra una credencial. */
function ineNucosTexto_(st) {
  const hoja = ineNucosPestana_(false);
  const n = hoja.getLastRow() - 1;
  if (n <= 0) { st.fase = 'LISTO'; return; }
  const ids = hoja.getRange(2, 4, n, 1).getValues().map((r) => String(r[0]));
  const fila = {};
  ids.forEach((id, i) => { fila[id] = i; });
  const marcas = ids.map(() => []);
  st.textos = {};
  INE_NUCOS_TEXTOS.forEach(([tipo, texto]) => {
    let pagina = null;
    let hallados = 0;
    do {
      const r = LineasArchivos.listarDrive({
        q: "fullText contains '" + texto + "' and trashed = false and mimeType != 'application/vnd.google-apps.folder'",
        corpora: 'allDrives', pageSize: 1000, fields: 'nextPageToken,files(id)', pageToken: pagina || undefined,
      });
      (r.files || []).forEach((f) => {
        if (!(f.id in fila)) return;
        hallados++;
        if (marcas[fila[f.id]].indexOf(tipo) < 0) marcas[fila[f.id]].push(tipo);
      });
      pagina = r.nextPageToken || null;
    } while (pagina);
    st.textos[texto] = hallados;
  });
  hoja.getRange(2, 9, n, 1).setValues(marcas.map((m) => [m.join(', ')]));
  st.fase = 'LISTO';
  st.fin = new Date().toISOString();
}

/** Cómo va, en texto (también al registro de ejecución). Al terminar, cuenta por nombre y por texto. */
function ineNucosInforme_(st) {
  if (!st) { console.log('INE NUCOS: no se ha corrido. Empieza con lineasIneNucos_inventario().'); return 'Sin correr'; }
  const lineas = ['INE NUCOS · ' + st.fase + (st.error ? ' · ERROR: ' + st.error : ''),
    'NUCOS recorridos: ' + st.cursor + (st.nucos ? ' de ' + st.nucos : ''),
    'Archivos anotados: ' + st.archivos + ' · omitidos (INSP/RESP, firmas, patrones, videos): ' + st.omitidos];
  if (st.textos) lineas.push('Encontrados por texto: ' + Object.keys(st.textos).map((t) => t + ' ' + st.textos[t]).join(' · '));
  if (st.fase === 'LISTO') {
    const hoja = ineNucosPestana_(false);
    const n = hoja.getLastRow() - 1;
    const datos = n > 0 ? hoja.getRange(2, 1, n, 9).getValues() : [];
    const cuenta = (pred) => datos.filter(pred).length;
    lineas.push('Por nombre: ' + cuenta((r) => r[7]) + ' · por texto: ' + cuenta((r) => r[8]) + ' · por los dos: ' + cuenta((r) => r[7] && r[8]) +
      ' · candidatas (alguno): ' + cuenta((r) => r[7] || r[8]) + ' · en NUCOS distintos: ' + new Set(datos.filter((r) => r[7] || r[8]).map((r) => r[0])).size);
  }
  const texto = lineas.join('\n');
  console.log(texto);
  return texto;
}

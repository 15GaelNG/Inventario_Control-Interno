/**
 * DatosConectados.gs
 * Las conexiones entre hojas que se arman DESDE LA PANTALLA (Administración > Datos conectados): "este dato de
 * Vehículos se copia a esta columna de Sensores y se mantiene al día solo".
 *
 * Relaciones.gs sigue siendo el motor. Su MAPA (en código) es la base; lo de aquí se le suma (Relaciones.mapa_) y a
 * partir de ahí todo es igual: propagar al guardar en la app (Relaciones.alGuardar desde HojaServicio), al editar a
 * mano en la hoja (Relaciones.alEditarAMano desde AvisoDeCambios), revisar y poner al día (Salud).
 *
 * Se guarda en la hoja DATOS CONECTADOS del libro de usuarios (donde está PERMISOS), un renglón por dato conectado,
 * y cada cambio deja un renglón en DATOS CONECTADOS_HISTORIAL. Quitar un dato no borra el renglón: lo marca ACTIVO =
 * FALSE (queda la historia). Lo que está en el código se ve en la pantalla pero no se quita desde ahí.
 *
 * Reglas (validar_): las dos hojas son del catálogo (Entidades) y del mismo libro; la llave existe en las dos; nunca
 * se conecta un secreto (PIN, patrón, contraseña) ni se escribe sobre una columna de ID; una columna de la copia
 * recibe datos de un solo lugar.
 *
 * Nada corre al cargar.
 */
const DatosConectados = (function () {
  const MODULO = 'relaciones';
  const HOJA = 'DATOS CONECTADOS';
  const HOJA_HISTORIAL = 'DATOS CONECTADOS_HISTORIAL';
  const ENC = ['ID', 'ACTIVO', 'HOJA DUEÑA', 'HOJA COPIA', 'LLAVE EN DUEÑA', 'LLAVE EN COPIA', 'COLUMNA DUEÑA',
    'COLUMNA COPIA', 'TIPO', 'QUIEN', 'FECHA'];
  const ENC_HISTORIAL = ['FECHA', 'CORREO', 'NOMBRE', 'ACCION', 'HOJA DUEÑA', 'HOJA COPIA', 'COLUMNA DUEÑA',
    'COLUMNA COPIA', 'TIPO'];
  const TIPOS = ['cache', 'bitacora'];
  /** Nunca se conectan: los accesos de Líneas y cualquier cosa que parezca contraseña */
  const SECRETO = /\bPIN\b|PATRON|CONTRASE|PASSWORD|\bTOKEN\b/;
  const ES_ID = /^ID\b|^ID_|\bID$/;
  const EJEMPLOS = 5;

  /**
   * Lo que se copia AL REVÉS (un registro nuevo actualiza a su dueño). Está escrito en código, a propósito: escribe en
   * la hoja dueña y un error ahí cambia datos de verdad (decisión del 9-oct-2026: en la pantalla solo se ve).
   */
  const AL_REVES = [
    {
      desde: 'RESPONSIVA VEHICULAR', hacia: 'VEHICULOS', donde: 'ResponsivaVehicularService.gs',
      cuando: 'Al dar de alta una responsiva con un responsable distinto al actual',
      columnas: [['RESPONSABLE', 'RESPONSABLE VEHICULO'], ['NO EMPLEADO', 'NO EMPLEADO'], ['DEPARTAMENTO', 'DEPARTAMENTO']],
    },
    {
      desde: 'REASIGNACIONES_VEHICULOS', hacia: 'VEHICULOS', donde: 'ReasignacionesVehicularesService.gs',
      cuando: 'Al registrar una reasignación',
      columnas: [['Responsable Entrante', 'RESPONSABLE VEHICULO'], ['No Empleado Entrante', 'NO EMPLEADO'],
        ['Departamento Entrante', 'DEPARTAMENTO']],
    },
  ];

  const ssId = () => Config.SPREADSHEET_IDS.USUARIOS();
  const limpiar_ = (v) => String(v == null ? '' : v).trim();
  const norm_ = (v) => limpiar_(v).toUpperCase();

  // ------------------------------------------------------------------ leer la configuración

  /** Los datos conectados desde la pantalla que siguen activos. [] si la hoja todavía no existe. */
  function reglas() {
    return CacheHojas.recordar('datos_conectados_v1', [[ssId(), HOJA]], () => {
      let hoja;
      try {
        hoja = SheetUtils.getSheet(ssId(), HOJA);
      } catch (e) {
        if (String(e.message).indexOf('No existe la hoja') !== -1) return [];
        throw e;
      }
      if (hoja.getLastRow() < 2) return [];
      const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(norm_);
      const i = (n) => enc.indexOf(norm_(n));
      return hoja.getRange(2, 1, hoja.getLastRow() - 1, enc.length).getValues()
        .filter((f) => limpiar_(f[i('ID')]) && norm_(f[i('ACTIVO')]) !== 'FALSE')
        .map((f) => ({
          id: limpiar_(f[i('ID')]), dueno: norm_(f[i('HOJA DUEÑA')]), copia: norm_(f[i('HOJA COPIA')]),
          llaveDueno: limpiar_(f[i('LLAVE EN DUEÑA')]), llaveCopia: limpiar_(f[i('LLAVE EN COPIA')]),
          colDueno: limpiar_(f[i('COLUMNA DUEÑA')]), colCopia: limpiar_(f[i('COLUMNA COPIA')]),
          tipo: TIPOS.indexOf(limpiar_(f[i('TIPO')]).toLowerCase()) !== -1 ? limpiar_(f[i('TIPO')]).toLowerCase() : 'cache',
        }));
    });
  }

  /** Las hojas que se pueden conectar: las del catálogo, con su nombre para la gente y su libro */
  function hojasConectables_() {
    return Entidades.todas().map((e) => ({
      hoja: e.hoja, familia: e.familia || 'otros', etiqueta: Relaciones.etiqueta(e.hoja), libro: Relaciones.libroDe(e.hoja),
    }));
  }

  /** Lo que la pantalla necesita para pintar las tarjetas */
  function pantalla(token) {
    const sesion = Permisos.puedeLeer(token, MODULO);
    let puedeEditar = false;
    try { Permisos.puedeEditar(token, MODULO); puedeEditar = true; } catch (e) { /* solo ve */ }
    const hojas = hojasConectables_().map((h) => ({ hoja: h.hoja, familia: h.familia, etiqueta: h.etiqueta }));
    return {
      mapa: Relaciones.describir(), hojas: hojas, puedeEditar: puedeEditar, quien: sesion.correo,
      alReves: AL_REVES.map((a) => Object.assign({}, a, {
        etiquetaDesde: Relaciones.etiqueta(a.desde), etiquetaHacia: Relaciones.etiqueta(a.hacia),
      })),
    };
  }

  // ------------------------------------------------------------------ leer hojas para elegir

  function leerHoja_(hoja) {
    const h = hojasConectables_().find((x) => norm_(x.hoja) === norm_(hoja));
    if (!h) throw new Error('"' + hoja + '" no es una hoja que se pueda conectar');
    const s = SheetUtils.getSheet(h.libro, h.hoja);
    const ultima = s.getLastRow();
    const enc = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(limpiar_);
    const filas = ultima > 1 ? s.getRange(2, 1, ultima - 1, enc.length).getValues() : [];
    return { info: h, enc: enc, filas: filas };
  }

  /** Las columnas de una hoja, con algunos valores de ejemplo, para elegir qué conectar */
  function columnas(token, hoja) {
    Permisos.puedeLeer(token, MODULO);
    const { info, enc, filas } = leerHoja_(hoja);
    return {
      hoja: info.hoja, etiqueta: info.etiqueta, registros: filas.length,
      columnas: enc.map((c, i) => {
        if (!c) return null;
        const vistos = [];
        for (let f = 0; f < filas.length && vistos.length < 3; f++) {
          const v = limpiar_(filas[f][i]);
          if (v && vistos.indexOf(v) === -1) vistos.push(v.length > 40 ? v.slice(0, 40) + '…' : v);
        }
        return { nombre: c, ejemplos: SECRETO.test(norm_(c)) ? [] : vistos, secreto: SECRETO.test(norm_(c)), esId: ES_ID.test(norm_(c)) };
      }).filter(Boolean),
    };
  }

  // ------------------------------------------------------------------ sugerencias y vista previa

  function indice_(enc, filas, llave) {
    const i = enc.findIndex((c) => norm_(c) === norm_(llave));
    const m = new Map();
    let duplicadas = 0;
    if (i === -1) return { m: m, duplicadas: 0, existe: false };
    filas.forEach((f) => {
      const k = norm_(f[i]);
      if (!k) return;
      if (m.has(k)) duplicadas++;
      else m.set(k, f);
    });
    return { m: m, duplicadas: duplicadas, existe: true, i: i };
  }

  /**
   * Para que sea fácil: cómo se encuentran las dos hojas (qué llave empareja más registros) y qué datos se llaman igual.
   * Se proponen solo columnas con el mismo nombre que no sean de ID ni secretas.
   */
  function sugerir(token, dueno, copia) {
    Permisos.puedeLeer(token, MODULO);
    const d = leerHoja_(dueno);
    const c = leerHoja_(copia);
    const encD = d.enc.map(norm_);
    const comunes = c.enc.filter((x) => x && encD.indexOf(norm_(x)) !== -1);
    // Candidatas a llave: las que se llaman igual, más los pares conocidos (la serie se llama distinto en Inspección)
    const pares = comunes.map((x) => [x, x]);
    [['SERIE VEHICULO', 'NO SERIE'], ['FOLIO', 'FOLIO VEHICULO'], ['ID', 'ID VEHICULO'], ['ID CCH', 'ID CAJA CHICA']].forEach(([a, b]) => {
      if (encD.indexOf(a) !== -1 && c.enc.map(norm_).indexOf(b) !== -1) pares.push([a, b]);
    });
    const llaves = pares.map(([a, b]) => {
      const idx = indice_(d.enc, d.filas, a);
      const ic = c.enc.findIndex((x) => norm_(x) === norm_(b));
      let encontradas = 0;
      let conValor = 0;
      c.filas.forEach((f) => {
        const k = norm_(f[ic]);
        if (!k) return;
        conValor++;
        if (idx.m.has(k)) encontradas++;
      });
      return { dueno: a, copia: b, encontradas: encontradas, deCopia: c.filas.length, conValor: conValor, duplicadasEnDueno: idx.duplicadas };
    }).filter((l) => l.encontradas > 0)
      .sort((x, y) => (y.encontradas - y.duplicadasEnDueno) - (x.encontradas - x.duplicadasEnDueno))
      .slice(0, 5);
    const mejor = llaves[0];
    const datos = comunes
      .filter((x) => !mejor || (norm_(x) !== norm_(mejor.dueno) && norm_(x) !== norm_(mejor.copia)))
      .filter((x) => !SECRETO.test(norm_(x)) && !ES_ID.test(norm_(x)))
      .map((x) => [x, x]);
    return { llaves: llaves, datos: datos };
  }

  /**
   * Antes de guardar: con esta llave, ¿cuántos registros de la copia encuentran a su dueño, y cuántos tienen hoy un
   * valor distinto en cada dato? (Lo que se pondría al día.) No escribe nada.
   * propuesta = { dueno, copia, llaveDueno, llaveCopia, columnas: [[colDueno, colCopia], …], tipo }
   */
  function vistaPrevia(token, propuesta) {
    Permisos.puedeLeer(token, MODULO);
    const p = validar_(propuesta, { soloLeer: true });
    const d = leerHoja_(p.dueno);
    const c = leerHoja_(p.copia);
    const idx = indice_(d.enc, d.filas, p.llaveDueno);
    const ic = c.enc.findIndex((x) => norm_(x) === norm_(p.llaveCopia));
    const cols = p.columnas.map(([cd, cc]) => ({
      dueno: cd, copia: cc, iD: d.enc.findIndex((x) => norm_(x) === norm_(cd)), iC: c.enc.findIndex((x) => norm_(x) === norm_(cc)),
      diferencias: 0, ejemplos: [],
    }));
    let encontradas = 0;
    let sinLlave = 0;
    let sinDueno = 0;
    c.filas.forEach((f) => {
      const k = norm_(f[ic]);
      if (!k) { sinLlave++; return; }
      const fd = idx.m.get(k);
      if (!fd) { sinDueno++; return; }
      encontradas++;
      cols.forEach((col) => {
        const enDueno = fd[col.iD];
        const enCopia = f[col.iC];
        if (norm_(enDueno) === norm_(enCopia)) return;
        col.diferencias++;
        if (col.ejemplos.length < EJEMPLOS) col.ejemplos.push({ clave: limpiar_(f[ic]), enCopia: limpiar_(enCopia), enDueno: limpiar_(enDueno) });
      });
    });
    return {
      tipo: p.tipo, registros: c.filas.length, encontradas: encontradas, sinLlave: sinLlave, sinDueno: sinDueno,
      duplicadasEnDueno: idx.duplicadas,
      etiquetaDueno: Relaciones.etiqueta(p.dueno), etiquetaCopia: Relaciones.etiqueta(p.copia),
      columnas: cols.map((x) => ({ dueno: x.dueno, copia: x.copia, diferencias: x.diferencias, ejemplos: x.ejemplos })),
    };
  }

  // ------------------------------------------------------------------ validar, guardar, quitar

  /** Revisa la propuesta contra el catálogo, las hojas y lo que ya está conectado. Regresa la propuesta limpia. */
  function validar_(propuesta, opciones) {
    const p = propuesta || {};
    const hojas = hojasConectables_();
    const h = (n) => hojas.find((x) => norm_(x.hoja) === norm_(n));
    const hd = h(p.dueno);
    const hc = h(p.copia);
    if (!hd || !hc) throw new Error('Elige dos hojas del catálogo');
    if (norm_(hd.hoja) === norm_(hc.hoja)) throw new Error('Una hoja no se conecta consigo misma');
    if (hd.libro !== hc.libro) throw new Error(hd.etiqueta.nombre + ' y ' + hc.etiqueta.nombre + ' están en libros distintos: no se pueden conectar');
    const tipo = TIPOS.indexOf(limpiar_(p.tipo).toLowerCase()) !== -1 ? limpiar_(p.tipo).toLowerCase() : 'cache';
    const cols = (Array.isArray(p.columnas) ? p.columnas : []).map((x) => [limpiar_(x[0]), limpiar_(x[1])]).filter((x) => x[0] && x[1]);
    if (!cols.length) throw new Error('Elige al menos un dato para conectar');

    // Si ya hay una conexión entre estas dos hojas (en el código o de la pantalla), su llave manda
    const existente = Relaciones.describir().duenos.filter((x) => norm_(x.hoja) === norm_(hd.hoja))
      .map((x) => x.copias.find((c) => norm_(c.nombre) === norm_(hc.hoja))).filter(Boolean)[0];
    const llaveDueno = existente ? existente.claveOrigen : limpiar_(p.llaveDueno);
    const llaveCopia = existente ? existente.clave : limpiar_(p.llaveCopia);
    if (!llaveDueno || !llaveCopia) throw new Error('Elige cómo se encuentran: qué columna de cada hoja dice de qué registro se trata');

    const encD = SheetUtils.getSheet(hd.libro, hd.hoja).getRange(1, 1, 1, SheetUtils.getSheet(hd.libro, hd.hoja).getLastColumn()).getValues()[0].map(norm_);
    const hojaC = SheetUtils.getSheet(hc.libro, hc.hoja);
    const encC = hojaC.getRange(1, 1, 1, hojaC.getLastColumn()).getValues()[0].map(norm_);
    if (encD.indexOf(norm_(llaveDueno)) === -1) throw new Error(hd.etiqueta.nombre + ' no tiene la columna ' + llaveDueno);
    if (encC.indexOf(norm_(llaveCopia)) === -1) throw new Error(hc.etiqueta.nombre + ' no tiene la columna ' + llaveCopia);

    const yaReciben = {};
    if (existente) existente.columnas.forEach((x) => { yaReciben[norm_(x.destino)] = x.origen; });
    const vistos = {};
    cols.forEach(([cd, cc]) => {
      if (encD.indexOf(norm_(cd)) === -1) throw new Error(hd.etiqueta.nombre + ' no tiene la columna ' + cd);
      if (encC.indexOf(norm_(cc)) === -1) throw new Error(hc.etiqueta.nombre + ' no tiene la columna ' + cc);
      if (SECRETO.test(norm_(cd)) || SECRETO.test(norm_(cc))) throw new Error(cd + ' es un dato secreto: no se conecta');
      if (ES_ID.test(norm_(cc))) throw new Error(cc + ' es una columna de ID: no se escribe desde otra hoja');
      if (norm_(cc) === norm_(llaveCopia)) throw new Error(cc + ' es la llave de ' + hc.etiqueta.nombre + ': no se sobrescribe');
      if (vistos[norm_(cc)]) throw new Error(cc + ' viene dos veces');
      vistos[norm_(cc)] = true;
      if (!opciones.soloLeer && yaReciben[norm_(cc)] && norm_(yaReciben[norm_(cc)]) !== norm_(cd)) {
        throw new Error(cc + ' de ' + hc.etiqueta.nombre + ' ya recibe ' + yaReciben[norm_(cc)] + ': una columna recibe de un solo lugar');
      }
    });
    return { dueno: hd.hoja, copia: hc.hoja, llaveDueno: llaveDueno, llaveCopia: llaveCopia, columnas: cols,
      tipo: existente ? existente.tipo : tipo, existente: !!existente, yaReciben: yaReciben };
  }

  function hojaConEncabezados_(ss, nombre, enc) {
    let hoja = ss.getSheetByName(nombre);
    if (!hoja) {
      hoja = ss.insertSheet(nombre);
      hoja.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    return hoja;
  }

  function anotarHistorial_(ss, sesion, accion, filas) {
    const hoja = hojaConEncabezados_(ss, HOJA_HISTORIAL, ENC_HISTORIAL);
    const ahora = new Date();
    const valores = filas.map((f) => [ahora, sesion.correo || '', sesion.nombre || '', accion, f.dueno, f.copia, f.colDueno, f.colCopia, f.tipo]);
    hoja.getRange(hoja.getLastRow() + 1, 1, valores.length, ENC_HISTORIAL.length).setValues(valores);
    CacheHojas.tocarHoja(hoja);
  }

  /**
   * Conecta los datos de la propuesta (los que ya estaban conectados igual se saltan). Con ponerAlDia, después
   * actualiza lo que ya estaba distinto (como el botón de Salud), solo si la conexión es "al día".
   */
  function guardar(token, propuesta, ponerAlDia) {
    const sesion = Permisos.puedeEditar(token, MODULO);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let p;
    let nuevas;
    try {
      p = validar_(propuesta, {});
      nuevas = p.columnas.filter(([cd, cc]) => norm_(p.yaReciben[norm_(cc)]) !== norm_(cd));
      if (!nuevas.length) return { conectados: 0, mensaje: 'Esos datos ya estaban conectados' };
      const ss = SpreadsheetApp.openById(ssId());
      const hoja = hojaConEncabezados_(ss, HOJA, ENC);
      const ahora = new Date();
      const filas = nuevas.map(([cd, cc]) => ({ dueno: p.dueno, copia: p.copia, colDueno: cd, colCopia: cc, tipo: p.tipo }));
      const valores = filas.map((f) => [Ids.nuevo('DCX'), true, f.dueno, f.copia, p.llaveDueno, p.llaveCopia, f.colDueno, f.colCopia,
        f.tipo, sesion.correo || '', ahora]);
      hoja.getRange(hoja.getLastRow() + 1, 1, valores.length, ENC.length).setValues(valores);
      CacheHojas.tocarHoja(hoja);
      anotarHistorial_(ss, sesion, 'CONECTAR', filas);
      Relaciones.olvidarMapa();
    } finally {
      lock.releaseLock();
    }
    let alDia = null;
    if (ponerAlDia && p.tipo === 'cache') {
      alDia = Relaciones.revisar({ corregir: true, hojas: [p.copia], quien: sesion.correo });
    }
    return { conectados: nuevas.length, alDia: alDia ? alDia[p.copia] || null : null };
  }

  /** Desconecta un dato puesto desde la pantalla (lo del código no se quita aquí). No borra: ACTIVO = FALSE. */
  function quitar(token, dueno, copia, colDueno) {
    const sesion = Permisos.puedeEditar(token, MODULO);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.openById(ssId());
      const hoja = ss.getSheetByName(HOJA);
      if (!hoja || hoja.getLastRow() < 2) throw new Error('Ese dato no se conectó desde la pantalla');
      const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(norm_);
      const i = (n) => enc.indexOf(norm_(n));
      const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, enc.length).getValues();
      const quitadas = [];
      datos.forEach((f, k) => {
        if (norm_(f[i('ACTIVO')]) === 'FALSE') return;
        if (norm_(f[i('HOJA DUEÑA')]) !== norm_(dueno) || norm_(f[i('HOJA COPIA')]) !== norm_(copia) ||
            norm_(f[i('COLUMNA DUEÑA')]) !== norm_(colDueno)) return;
        hoja.getRange(k + 2, i('ACTIVO') + 1).setValue(false);
        quitadas.push({ dueno: f[i('HOJA DUEÑA')], copia: f[i('HOJA COPIA')], colDueno: f[i('COLUMNA DUEÑA')],
          colCopia: f[i('COLUMNA COPIA')], tipo: f[i('TIPO')] });
      });
      if (!quitadas.length) throw new Error('Ese dato no se conectó desde la pantalla (los del sistema no se quitan aquí)');
      CacheHojas.tocarHoja(hoja);
      anotarHistorial_(ss, sesion, 'QUITAR', quitadas);
      Relaciones.olvidarMapa();
      return { quitados: quitadas.length };
    } finally {
      lock.releaseLock();
    }
  }

  /** Poner al día lo que ya está distinto en una copia "al día" (lo mismo que Salud, desde la tarjeta) */
  function ponerAlDia(token, copia) {
    const sesion = Permisos.puedeEditar(token, MODULO);
    const r = Relaciones.revisar({ corregir: true, hojas: [copia], quien: sesion.correo });
    return r[norm_(copia)] || r[copia] || null;
  }

  return { reglas, pantalla, columnas, sugerir, vistaPrevia, guardar, quitar, ponerAlDia, AL_REVES, HOJA };
})();

/**
 * TemporadaService.gs
 * Decoración de temporada (hoy solo Día de Muertos). La prende y la apaga un ADMIN desde el
 * botón de la flor en la barra de arriba; vale para todos y se guarda en la propiedad del
 * proyecto TEMPORADA. Router.gs la pone en <body data-temporada="…"> al servir la página, así
 * que el login ya sale decorado sin otra llamada. Lo que se ve está en src/html/temporada.html.
 *
 * La ofrenda colectiva (Inicio → "Nuestra ofrenda"): cada persona enciende UNA vela por año,
 * con el nombre de quien recuerda si quiere. Se guarda en la hoja OFRENDA del libro de
 * USUARIOS (se crea sola). A los demás solo se les enseña a quién se recuerda, nunca quién
 * encendió la vela; el correo queda en la hoja para moderar. Quita una vela quien la encendió
 * o un ADMIN.
 */

const TemporadaService = (function () {
  const CLAVE = 'TEMPORADA';
  const VALIDAS = ['muertos'];
  const HOJA_OFRENDA = 'OFRENDA';
  const ENCABEZADOS_OFRENDA = ['ID', 'FECHA', 'AÑO', 'CORREO', 'NOMBRE', 'EN MEMORIA DE'];
  const MAX_MEMORIA = 80;

  /** La temporada encendida en este proyecto, o '' si no hay ninguna */
  function actual() {
    try {
      const valor = PropertiesService.getScriptProperties().getProperty(CLAVE) || '';
      return VALIDAS.indexOf(valor) === -1 ? '' : valor;
    } catch (e) {
      return '';   // sin propiedades la app abre igual, solo sin decorar
    }
  }

  /** Solo ADMIN. valor '' la apaga. Devuelve cómo quedó. */
  function guardar(token, valor) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    const props = PropertiesService.getScriptProperties();
    if (!valor) props.deleteProperty(CLAVE);
    else if (VALIDAS.indexOf(valor) === -1) throw new Error('Temporada desconocida: ' + valor);
    else props.setProperty(CLAVE, valor);
    return actual();
  }

  // ---------- Ofrenda ----------

  const ssId_ = () => Config.SPREADSHEET_IDS.USUARIOS();
  const anio_ = () => new Date().getFullYear();
  const correo_ = (v) => String(v || '').trim().toLowerCase();

  /** Las velas del año, como están en la hoja ([] si la hoja aún no existe) */
  function velas_() {
    const anio = anio_();
    return CacheHojas.recordar('ofrenda_v1_' + anio, [[ssId_(), HOJA_OFRENDA]], () => {
      try {
        SheetUtils.getSheet(ssId_(), HOJA_OFRENDA);
      } catch (e) {
        if (String(e.message).indexOf('No existe la hoja') === -1) throw e;
        return [];
      }
      return SheetUtils.getAll(ssId_(), HOJA_OFRENDA)
        .filter((f) => f['ID'] && Number(f['AÑO']) === anio)
        .map((f) => ({ id: String(f['ID']), correo: correo_(f['CORREO']), memoria: String(f['EN MEMORIA DE'] || '').trim() }));
    });
  }

  /** Lo que ve una persona: a quién se recuerda (sin autor), cuántas velas hay y la suya */
  function vista_(sesion) {
    const yo = correo_(sesion.correo);
    const velas = velas_();
    const mia = velas.find((v) => v.correo === yo) || null;
    return {
      total: velas.length,
      // Las más nuevas primero; sin nombre cuentan en el total pero no salen en la lista
      memorias: velas.filter((v) => v.memoria).reverse().map((v) => ({ id: v.id, memoria: v.memoria, mia: v.correo === yo })),
      mia: mia ? { id: mia.id, memoria: mia.memoria } : null,
      moderar: sesion.rol === Config.ROLES.ADMIN,
      encendida: actual() === 'muertos',
    };
  }

  function ofrenda(token) {
    return vista_(Auth.validarSesion(token));
  }

  function hojaOfrenda_() {
    const ss = SpreadsheetApp.openById(ssId_());
    let hoja = ss.getSheetByName(HOJA_OFRENDA);
    if (!hoja) {
      hoja = ss.insertSheet(HOJA_OFRENDA);
      hoja.getRange(1, 1, 1, ENCABEZADOS_OFRENDA.length).setValues([ENCABEZADOS_OFRENDA]).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    return hoja;
  }

  /** Renglón (1 = encabezados) de la vela con ese ID, o 0 */
  function renglonDe_(hoja, id) {
    const n = hoja.getLastRow() - 1;
    if (n < 1) return 0;
    const ids = hoja.getRange(2, 1, n, 1).getValues();
    for (let i = 0; i < n; i++) if (String(ids[i][0]) === String(id)) return i + 2;
    return 0;
  }

  /** Enciende la vela de quien llama, o le cambia el nombre si ya tenía una este año */
  function encender(token, memoria) {
    const sesion = Auth.validarSesion(token);
    if (actual() !== 'muertos') throw new Error('La ofrenda no está abierta.');
    const texto = String(memoria || '').replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORIA);
    const candado = LockService.getScriptLock();
    candado.waitLock(15000);
    try {
      const hoja = hojaOfrenda_();
      const mia = velas_().find((v) => v.correo === correo_(sesion.correo));
      const renglon = mia ? renglonDe_(hoja, mia.id) : 0;
      if (renglon) {
        hoja.getRange(renglon, ENCABEZADOS_OFRENDA.indexOf('EN MEMORIA DE') + 1).setValue(texto);
      } else {
        hoja.appendRow([Utilities.getUuid().slice(0, 8), new Date(), anio_(), sesion.correo || '', sesion.nombre || '', texto]);
      }
      CacheHojas.tocarHoja(hoja);
    } finally {
      candado.releaseLock();
    }
    return vista_(sesion);
  }

  /** Quita una vela: la propia, o cualquiera si es ADMIN (moderación) */
  function apagar(token, id) {
    const sesion = Auth.validarSesion(token);
    const vela = velas_().find((v) => v.id === String(id));
    if (!vela) return vista_(sesion);
    if (vela.correo !== correo_(sesion.correo) && sesion.rol !== Config.ROLES.ADMIN) {
      throw new Error('Solo quien encendió la vela (o un administrador) la puede quitar.');
    }
    const candado = LockService.getScriptLock();
    candado.waitLock(15000);
    try {
      const hoja = hojaOfrenda_();
      const renglon = renglonDe_(hoja, id);
      if (renglon) hoja.deleteRow(renglon);
      CacheHojas.tocarHoja(hoja);
    } finally {
      candado.releaseLock();
    }
    return vista_(sesion);
  }

  return { actual, guardar, ofrenda, encender, apagar };
})();

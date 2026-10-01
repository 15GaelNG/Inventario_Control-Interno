/**
 * LineasNotificaciones.gs
 * Avisos del sistema (campana de la barra superior y vista Notificaciones).
 *   ADENDUM                adendum por vencer (uno por línea y fecha).
 *   RESGUARDO / CANCELACION equipos mandados a resguardo y líneas mandadas a cancelación (los crea LineasResguardos).
 *   SIN_RECIBIR, CANCELACION_PENDIENTE, DISPONIBLE_VENCIDA  avisos de seguimiento (30-sep, ver SEGUIMIENTO).
 *
 * Regla (pedido del área, 29-sep-2026): una semana antes de que venza el adendum (FIN PLAN) de una línea
 * activa se crea UNA notificación para esa línea y esa fecha. Las líneas que ya estaban vencidas cuando se
 * activaron los avisos no se notifican (quedan fuera por LINEAS_NOTIF_ADENDUM_DESDE); más adelante se
 * decidirá si van en una pestaña aparte con el histórico de líneas.
 *
 * Las notificaciones viven en la pestaña APP_NOTIFICACIONES de la hoja de Líneas (AppSheet la ignora):
 *   CLAVE       "ADENDUM|<ID>|<yyyy-MM-dd>": evita repetir el aviso; si el adendum cambia, sale otro.
 *   VENCE       fecha de fin del adendum como texto yyyy-MM-dd (sin zona horaria de por medio).
 *   LEIDA_POR   ",correo1,correo2,": cada persona marca las suyas.
 *   CORREO_ENVIADO_EN  reservado para el envío por correo (siguiente fase: un disparador diario que llame a
 *                      revisar(true) y mande las que no tengan fecha aquí).
 *
 * No hace falta un disparador para que aparezcan: se revisa al consultar la campana, como mucho cada 30 min.
 */
const LineasNotificaciones = (function () {
  const TAB = 'APP_NOTIFICACIONES';
  // PARA (30-sep): vacío = todos; PARA_APROBADORES = solo quien aprueba resguardos (Pau y ADMIN)
  const ENCABEZADOS = ['ID', 'FECHA', 'TIPO', 'CLAVE', 'REF_ID', 'NUCO', 'NUMERO', 'TITULO', 'MENSAJE', 'VENCE', 'LEIDA_POR', 'CORREO_ENVIADO_EN', 'PARA'];
  const PARA_APROBADORES = 'APROBADORES_RESGUARDO';
  const DIAS_AVISO = 7;
  const PROP_DESDE = 'LINEAS_NOTIF_ADENDUM_DESDE';
  const CLAVE_REVISION = 'ln_notif_revision_v2'; // v2 (30-sep): también los avisos de seguimiento
  const SEG_REVISION = 30 * 60;
  /** Estatus en los que la línea ya no corre (no tiene caso avisar su adendum). */
  const ESTATUS_SIN_LINEA = ['CANCELADA', 'SIN LINEA', 'EN PROCESO DE CANCELACION'];
  /**
   * Tipos sin adendum: EQUIPO no tiene línea; los SIM básicos (cuenta AT&T 643495915) se ponen en equipos con el
   * adendum ya vencido y no tienen fin de plazo, aunque la fila conserve la fecha del plan anterior.
   */
  const TIPOS_SIN_ADENDUM = ['EQUIPO', 'EQUIPO + SIM BASICO', 'LINEA BASICA'];

  /**
   * Avisos de seguimiento (30-sep-2026; propuesta del sistema: los días y a quién se ajustan con la respuesta de Líneas,
   * pregunta L13 de migracion/PREGUNTAS_PENDIENTES.md). Cada uno es UN resumen por semana; si el grupo cambia a media
   * semana (entra o sale un equipo o una línea) sale otro, con la lista nueva.
   */
  const SEGUIMIENTO = {
    SIN_RECIBIR: { dias: 3, para: PARA_APROBADORES },              // mandados a resguardo y Pau no los ha recibido
    CANCELACION_PENDIENTE: { dias: 15, diasPorFirmar: 7, para: PARA_APROBADORES }, // carta enviada sin confirmar / sin firmar
    DISPONIBLE_VENCIDA: { para: '' },                                // línea guardada con el adendum vencido: se sigue pagando
  };
  const TAB_RESGUARDOS = 'APP_RESGUARDOS';
  const LISTA_MAX = 8;

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const zona = () => LineasDatos.ZONA_APP;
  const dia = (d) => Utilities.formatDate(d, zona(), 'yyyy-MM-dd');

  /** Días entre dos fechas yyyy-MM-dd (b − a). */
  function diasEntre(a, b) {
    const utc = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
    return Math.round((utc(b) - utc(a)) / 864e5);
  }

  /** FIN PLAN como yyyy-MM-dd, o '' si no es una fecha (vacío, "N/A", "00/01/1900", "Fuera de adendum"…). */
  function diaFinPlan(v) {
    if (v instanceof Date) {
      if (isNaN(v.getTime()) || v.getFullYear() < 2000) return '';
      return dia(v);
    }
    const s = txt(v);
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return Number(m[1]) < 2000 ? '' : m[1] + '-' + m[2] + '-' + m[3];
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return Number(m[3]) < 2000 ? '' : m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return '';
  }

  /** Fecha desde la que se avisa (la primera vez que corre: hoy). Lo vencido antes de esa fecha no se notifica. */
  function desde_(hoy) {
    const props = PropertiesService.getScriptProperties();
    let d = props.getProperty(PROP_DESDE);
    if (!d) { d = hoy; props.setProperty(PROP_DESDE, d); }
    return d;
  }

  /**
   * Líneas cuyo adendum vence dentro de los próximos DIAS_AVISO días (o ya venció después de `desde`).
   * filas = filas de LINEAS TELEFONICAS. Regresa [{ clave, refId, nuco, numero, vence, dias, fila }].
   */
  function pendientes(filas, hoy, desde) {
    const salida = [];
    filas.forEach((f) => {
      const id = txt(f['ID']);
      if (!id) return;
      const tipo = txt(LineasUtil.col(f, 'TIPO')).toUpperCase();
      if (TIPOS_SIN_ADENDUM.indexOf(tipo) >= 0) return;
      if (ESTATUS_SIN_LINEA.indexOf(txt(LineasUtil.col(f, 'ESTATUS LINEA')).toUpperCase()) >= 0) return;
      const numero = txt(LineasUtil.col(f, 'NUMERO TELEFONO'));
      if ((LineasUtil.digitos(numero) || '').length < 10) return;
      const vence = diaFinPlan(LineasUtil.col(f, 'FIN PLAN'));
      if (!vence || vence < desde) return;
      const dias = diasEntre(hoy, vence);
      if (dias > DIAS_AVISO) return;
      salida.push({ clave: 'ADENDUM|' + id + '|' + vence, refId: id, nuco: LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '', numero: numero, vence: vence, dias: dias, fila: f });
    });
    return salida;
  }

  function fechaCorta_(ymd) { return ymd.slice(8, 10) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4); }

  /** Lunes de la semana de `hoy` (yyyy-MM-dd): los avisos de seguimiento son uno por semana. */
  function semana_(hoy) {
    const d = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, Number(hoy.slice(8, 10))));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }

  /** Huella corta de un grupo (ids ordenados): si el grupo cambia, la clave cambia y sale otro aviso. */
  function firma_(ids) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, ids.slice().sort().join('|'));
    return bytes.slice(0, 5).map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  }

  /** "a, b, c y 4 más". */
  function lista_(valores) {
    const v = valores.filter(Boolean);
    if (v.length <= LISTA_MAX) return v.length > 1 ? v.slice(0, -1).join(', ') + ' y ' + v[v.length - 1] : (v[0] || '');
    return v.slice(0, LISTA_MAX).join(', ') + ' y ' + (v.length - LISTA_MAX) + ' más';
  }

  const diaDe_ = (v) => (v instanceof Date && !isNaN(v.getTime()) ? dia(v) : '');

  /**
   * Avisos de seguimiento que tocan hoy (pura, para poder probarla). lineas = filas de LINEAS TELEFONICAS; resguardos =
   * filas de APP_RESGUARDOS; firmar(ids) = huella del grupo. Regresa [{ tipo, clave, titulo, mensaje, para }].
   */
  function seguimiento(lineas, resguardos, hoy, firmar) {
    const salida = [];
    const semana = semana_(hoy);
    const agregar = (tipo, ids, titulo, mensaje) => {
      if (!ids.length) return;
      salida.push({ tipo: tipo, clave: tipo + '|' + semana + '|' + firmar(ids), titulo: titulo, mensaje: mensaje, para: SEGUIMIENTO[tipo].para });
    };

    const sinRecibir = resguardos.filter((r) => txt(r['ESTADO']) === 'PENDIENTE DE RECEPCION' && diaDe_(r['FECHA']) &&
      diasEntre(diaDe_(r['FECHA']), hoy) >= SEGUIMIENTO.SIN_RECIBIR.dias);
    agregar('SIN_RECIBIR', sinRecibir.map((r) => txt(r['ID'])),
      'Equipos sin recibir · ' + sinRecibir.length,
      sinRecibir.length + ' equipo(s) se mandaron a resguardo hace ' + SEGUIMIENTO.SIN_RECIBIR.dias + ' días o más y no se han recibido: NUCO ' +
        lista_(sinRecibir.map((r) => txt(r['NUCO']))) + '.');

    const c = SEGUIMIENTO.CANCELACION_PENDIENTE;
    const atoradas = resguardos.filter((r) => {
      const fase = txt(r['CANCELACION']);
      if (fase === 'CARTA ENVIADA') return !!diaDe_(r['CARTA_ENVIADA_EN']) && diasEntre(diaDe_(r['CARTA_ENVIADA_EN']), hoy) >= c.dias;
      if (fase === 'POR FIRMAR') return !!diaDe_(r['FECHA']) && diasEntre(diaDe_(r['FECHA']), hoy) >= c.diasPorFirmar;
      return false;
    });
    const enviadas = atoradas.filter((r) => txt(r['CANCELACION']) === 'CARTA ENVIADA').length;
    agregar('CANCELACION_PENDIENTE', atoradas.map((r) => txt(r['ID'])),
      'Cancelaciones sin confirmar · ' + atoradas.length,
      [enviadas ? enviadas + ' con la carta enviada hace ' + c.dias + ' días o más sin confirmación del proveedor' : '',
        atoradas.length - enviadas ? (atoradas.length - enviadas) + ' por firmar desde hace ' + c.diasPorFirmar + ' días o más' : '']
        .filter(Boolean).join('; ') + ': ' + lista_(atoradas.map((r) => txt(r['NUMERO']) || 'NUCO ' + txt(r['NUCO']))) + '.');

    const vencidas = lineas.filter((f) => {
      const estatus = txt(LineasUtil.col(f, 'ESTATUS LINEA')).toUpperCase();
      if (estatus !== 'DISPONIBLE' && estatus !== 'RESGUARDO') return false; // RESGUARDO: valor viejo de "disponible"
      if (TIPOS_SIN_ADENDUM.indexOf(txt(LineasUtil.col(f, 'TIPO')).toUpperCase()) >= 0) return false;
      if ((LineasUtil.digitos(txt(LineasUtil.col(f, 'NUMERO TELEFONO'))) || '').length < 10) return false;
      const vence = diaFinPlan(LineasUtil.col(f, 'FIN PLAN'));
      return !!vence && vence < hoy;
    });
    agregar('DISPONIBLE_VENCIDA', vencidas.map((f) => txt(f['ID'])),
      'Líneas disponibles con el adendum vencido · ' + vencidas.length,
      vencidas.length + ' línea(s) guardadas tienen el adendum vencido y se siguen pagando: ' +
        lista_(vencidas.map((f) => txt(LineasUtil.col(f, 'NUMERO TELEFONO')))) + '. Hay que reasignarlas o mandarlas a cancelar.');
    return salida;
  }

  function notificacionAdendum_(p, ahora) {
    const f = p.fila;
    const detalle = [
      p.nuco ? 'NUCO ' + p.nuco : '',
      txt(LineasUtil.col(f, 'COMPAÑIA')),
      txt(LineasUtil.col(f, 'RESPONSABLE')) ? 'Responsable: ' + txt(LineasUtil.col(f, 'RESPONSABLE')) : '',
    ].filter(Boolean).join(' · ');
    return {
      'ID': LineasDatos.nuevoId(TAB), 'FECHA': ahora, 'TIPO': 'ADENDUM', 'CLAVE': p.clave, 'REF_ID': p.refId, 'NUCO': p.nuco,
      'NUMERO': p.numero,
      'TITULO': (p.dias < 0 ? 'Adendum vencido · ' : 'Adendum por vencer · ') + p.numero,
      'MENSAJE': 'El adendum de la línea ' + p.numero + (p.dias < 0 ? ' venció el ' : ' vence el ') + fechaCorta_(p.vence) + '.' + (detalle ? ' ' + detalle + '.' : ''),
      'VENCE': p.vence, 'LEIDA_POR': ',', 'CORREO_ENVIADO_EN': '',
    };
  }

  /**
   * Crea las notificaciones que falten. Sin `forzar`, como mucho una vez cada SEG_REVISION.
   * Regresa cuántas se crearon.
   */
  function revisar(forzar) {
    const cache = CacheService.getScriptCache();
    const ahora = new Date();
    const hoy = dia(ahora);
    if (!forzar && cache.get(CLAVE_REVISION) === hoy) return 0;
    const lineas = LineasDatos.leerTabla(LineasRepo.TAB.LINEAS);
    const candidatas = pendientes(lineas, hoy, desde_(hoy));
    let avisos = [];
    try {
      const resguardos = LineasDatos.existeTabla(TAB_RESGUARDOS) ? LineasDatos.leerTabla(TAB_RESGUARDOS) : [];
      avisos = seguimiento(lineas, resguardos, hoy, firma_);
    } catch (e) { console.warn('LineasNotificaciones.seguimiento: ' + e.message); }
    let creadas = 0;
    if (candidatas.length || avisos.length) {
      creadas = LineasDatos.conCandado(() => {
        if (!LineasDatos.existeTabla(TAB)) LineasDatos.asegurarPestana(TAB, ENCABEZADOS);
        const existentes = {};
        LineasDatos.leerTabla(TAB).forEach((n) => { existentes[txt(n['CLAVE'])] = true; });
        const nuevas = candidatas.filter((p) => !existentes[p.clave]).map((p) => notificacionAdendum_(p, ahora))
          .concat(avisos.filter((a) => !existentes[a.clave]).map((a) => ({
            'ID': LineasDatos.nuevoId(TAB), 'FECHA': ahora, 'TIPO': a.tipo, 'CLAVE': a.clave, 'REF_ID': '', 'NUCO': '', 'NUMERO': '',
            'TITULO': a.titulo, 'MENSAJE': a.mensaje, 'VENCE': '', 'LEIDA_POR': ',', 'CORREO_ENVIADO_EN': '', 'PARA': a.para,
          })));
        LineasDatos.agregarFilas(TAB, nuevas);
        return nuevas.length;
      });
    }
    cache.put(CLAVE_REVISION, hoy, SEG_REVISION);
    return creadas;
  }

  /**
   * Aviso de un evento del sistema (p. ej. equipos mandados a resguardo). n = { tipo, titulo, mensaje, para, refId, nuco }.
   * `para` vacío = lo ven todos; PARA_APROBADORES = solo quien aprueba resguardos.
   */
  function crear(n) {
    return LineasDatos.conCandado(() => {
      LineasDatos.asegurarPestana(TAB, ENCABEZADOS); // agrega PARA si la pestaña ya existía sin ella
      const ahora = new Date();
      LineasDatos.agregarFilas(TAB, [{
        'ID': LineasDatos.nuevoId(TAB), 'FECHA': ahora, 'TIPO': txt(n.tipo), 'CLAVE': txt(n.tipo) + '|' + ahora.getTime(),
        'REF_ID': txt(n.refId), 'NUCO': txt(n.nuco), 'NUMERO': '', 'TITULO': txt(n.titulo), 'MENSAJE': txt(n.mensaje),
        'VENCE': '', 'LEIDA_POR': ',', 'CORREO_ENVIADO_EN': '', 'PARA': txt(n.para),
      }]);
      return true;
    });
  }

  /** Tras un alta: que la siguiente consulta vuelva a revisar sin esperar los 30 min. */
  function revisarPronto() {
    try { CacheService.getScriptCache().remove(CLAVE_REVISION); } catch (e) { /* sin caché: revisa al expirar */ }
  }

  const marcaCorreo_ = (correo) => ',' + String(correo || '').trim().toLowerCase() + ',';

  /**
   * Notificaciones de la persona: { noLeidas, total, hoy, items: [...] } de la más reciente a la más antigua.
   * `limite` recorta items (la campana pide pocas; la vista, todas).
   */
  function bandeja(correo, limite, opciones) {
    try { revisar(false); } catch (e) { console.warn('LineasNotificaciones.revisar: ' + e.message); }
    const hoy = dia(new Date());
    if (!LineasDatos.existeTabla(TAB)) return { noLeidas: 0, total: 0, hoy: hoy, items: [] };
    const marca = marcaCorreo_(correo);
    const esAprobador = !!(opciones && opciones.esAprobador);
    const items = LineasDatos.leerTabla(TAB).filter((n) => {
      const para = txt(n['PARA']);
      return !para || (para === PARA_APROBADORES && esAprobador);
    }).map((n) => {
      const vence = txt(n['VENCE']);
      return {
        id: txt(n['ID']), fecha: n['FECHA'] instanceof Date ? n['FECHA'] : null, tipo: txt(n['TIPO']),
        refId: txt(n['REF_ID']), nuco: txt(n['NUCO']), numero: txt(n['NUMERO']),
        titulo: txt(n['TITULO']), mensaje: txt(n['MENSAJE']), vence: vence,
        dias: /^\d{4}-\d{2}-\d{2}$/.test(vence) ? diasEntre(hoy, vence) : null,
        leida: String(n['LEIDA_POR'] || '').toLowerCase().indexOf(marca) >= 0,
      };
    }).sort((a, b) => (b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0));
    const noLeidas = items.filter((x) => !x.leida).length;
    return { noLeidas: noLeidas, total: items.length, hoy: hoy, items: limite ? items.slice(0, limite) : items };
  }

  /** Marca como leídas para la persona las notificaciones `ids` (o todas si no se pasan). */
  function marcarLeidas(correo, ids) {
    if (!LineasDatos.existeTabla(TAB)) return { marcadas: 0 };
    const marca = marcaCorreo_(correo);
    const buscar = ids && ids.length ? ids.map(String) : null;
    return LineasDatos.conCandado(() => {
      const t = LineasDatos.tablaFresca(TAB);
      const ultima = t.hoja.getLastRow();
      if (ultima < 2) return { marcadas: 0 };
      const cId = LineasDatos.colIndice(t, 'ID');
      const cLeida = LineasDatos.colIndice(t, 'LEIDA_POR');
      const idsHoja = t.hoja.getRange(2, cId + 1, ultima - 1, 1).getValues();
      const rango = t.hoja.getRange(2, cLeida + 1, ultima - 1, 1);
      const leidas = rango.getValues();
      let marcadas = 0;
      idsHoja.forEach((fila, i) => {
        const id = txt(fila[0]);
        if (!id || (buscar && buscar.indexOf(id) < 0)) return;
        const actual = String(leidas[i][0] || ',');
        if (actual.toLowerCase().indexOf(marca) >= 0) return;
        leidas[i][0] = (actual.slice(-1) === ',' ? actual : actual + ',') + marca.slice(1);
        marcadas++;
      });
      if (marcadas) rango.setValues(leidas);
      return { marcadas: marcadas };
    });
  }

  return { revisar, revisarPronto, bandeja, marcarLeidas, crear, PARA_APROBADORES, SEGUIMIENTO, _pendientes: pendientes, _diaFinPlan: diaFinPlan,
    _seguimiento: seguimiento, _semana: semana_, DIAS_AVISO };
})();

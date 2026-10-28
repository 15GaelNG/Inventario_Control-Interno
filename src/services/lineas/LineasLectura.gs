/**
 * LineasLectura.gs
 * Etapa 2 de la implementación de las partes 4 y 5 del plan (migracion/PLAN_REESTRUCTURA_LINEAS.md): el sistema lee de
 * las hojas nuevas (LINEAS, EQUIPOS, ASIGNACIONES, ADENDUMS) y la pantalla sigue igual.
 *
 * Cómo: toda lectura de LINEAS TELEFONICAS que pasa por LineasDatos (leerTabla, buscarFilas, leerFilas…) recibe
 * renglones ARMADOS con las hojas nuevas y con los mismos nombres de columna de la hoja vieja. Así el resto del código
 * (índice, ficha, Panorama, avisos, resguardos…) no cambia. LINEAS TELEFONICAS ya no se escribe: desde la etapa 3,
 * guardar escribe en las hojas nuevas (LineasEscritura.gs) y aquí solo se vuelve a armar lo leído (olvidar).
 *
 * Un renglón armado es:
 *   - cada EQUIPO, con su asignación vigente y la línea de esa asignación;
 *   - cada LÍNEA que no quedó con un equipo, con su asignación vigente (o ninguna).
 * ID del renglón: el del equipo (EQU-…) o el de la línea (LIN-…). ID ANTERIOR: el de la fila vieja (LIN-…), con el
 * que citan al registro las inspecciones, responsivas, bitácora y APP_*. ID APPSHEET: el del AppSheet.
 *
 * Cuando el registro no tiene asignación vigente (vendido, extraviado, fuera de inventario…), los datos de la última
 * persona salen de su última asignación cerrada. En los estatus finales, todo en blanco (ESTATUS_FINAL).
 *
 * La hoja vieja se retiró el 4-oct (paso 4, §I.6.7): las rutas del AppSheet y el NUCO de la línea sola están en EQUIPOS
 * y LINEAS, y el comentario viejo en MOVIMIENTOS. El interruptor LINEAS_LECTURA y la lectura de la hoja vieja se quitaron
 * el 21-oct (pendiente 7.13); quedan en el historial de git. La Script Property LINEAS_HOJA_VIEJA_RETIRADA NO se borra:
 * con ella la revisión del entorno al publicar (Diagnostico.gs, noSePide_) no marca como grave que falte la hoja vieja.
 */

const LineasLectura = (function () {
  const HOJA_VIEJA = 'LINEAS TELEFONICAS';
  const HOJAS = { LINEAS: 'LINEAS', EQUIPOS: 'EQUIPOS', ASIGNACIONES: 'ASIGNACIONES', ADENDUMS: 'ADENDUMS' };
  const CLAVE_CACHE = 'estructura_virtual_v8'; // v8: sin ubicación en estatus finales (22-oct). v7: sin ESTATUS GENERAL (21-oct). v6: FECHA REGISTRO del movimiento ALTA (16-oct). v5: responsable en blanco en estatus finales (16-oct). v4: cuenta, plan y su origen; PIN de WhatsApp del equipo (13-oct). v3: SIM BASICO (12-oct)

  /** Columnas de los renglones armados: las de la hoja vieja que el sistema lee, más las referencias nuevas. */
  /** Responsables adicionales (6-oct): número de empleado y nombre del segundo al quinto. */
  const ADICIONALES = ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'].reduce((a, n) => a.concat(['NO EMPLEADO ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE']), []);
  const ENCABEZADOS = ['ID', 'ID ANTERIOR', 'ID APPSHEET', 'FOLIO', 'NUMERO TELEFONO', 'NUCO', 'TIPO', 'NO EMPLEADO',
    'RESPONSABLE', 'PUESTO'].concat(ADICIONALES, ['EQUIPO', 'COLOR', 'IMEI', 'NUMERO SIM',
    'ACCESORIOS', 'SEDE', 'OFICINA / DESARROLLO', 'DEPARTAMENTO', 'AREA', 'JEFE DIRECTO', 'DIRECTOR', 'RAZON SOCIAL',
    'PIN WHATSAPP', 'PIN EQUIPO', 'CONTRASEÑA MODEM', 'PATRON', 'CUENTA GOOGLE', 'COMPAÑIA', 'COSTO PLAN',
    'FECHA REGISTRO', 'INICIO PLAN', 'FIN PLAN', 'ESTATUS LINEA', 'ESTATUS EQUIPO', 'RESPONSIVA', 'COMENTARIOS',
    'FECHA INSPECCION', 'FORMATO INSPECCION', 'ID PERSONA',
    // Referencias de la estructura nueva
    'ID EQUIPO', 'ID LINEA', 'ID ASIGNACION', 'TIPO ASIGNACION', 'TIPO DE LINEA', 'TIPO DE EQUIPO',
    // Cuenta y plan del proveedor (usuario, 13-oct: la pestaña General de la línea los muestra)
    'CUENTA PADRE', 'CUENTA', 'PLAN', 'FUENTE PLAN', 'ORIGEN PLAN']);
  // Del equipo o, si no hay, de la línea: las rutas del AppSheet y el comentario
  const DEL_EQUIPO_O_LINEA = ['COMENTARIOS', 'RESPONSIVA', 'FORMATO INSPECCION', 'FECHA INSPECCION'];
  const PERSONA_SIN_ASIGNACION = ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'SEDE',
    'OFICINA / DESARROLLO', 'DEPARTAMENTO', 'AREA', 'DIRECTOR', 'JEFE DIRECTO', 'CUENTA GOOGLE', 'ID PERSONA'].concat(ADICIONALES);
  /**
   * Responsable en blanco en los estatus finales (usuario, 16-oct; pendiente 2.50): el equipo VENDIDO, DONADO, DESECHADO o
   * EXTRAVIO-ROBO (y sus nombres viejos) y la línea sin equipo CANCELADA ya no son de nadie. No se borra nada: las
   * asignaciones cerradas siguen en su pestaña; aquí solo no se muestran como su responsable. Tampoco la ubicación
   * (área, departamento, sede, oficina; usuario, 22-oct: «aún queda oficina y sede»); antes, VENDIDO y DESECHADO sin
   * asignación mostraban el departamento N/A (D-I3).
   */
  const ESTATUS_FINAL = { equipo: ['VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO', 'EXTRAVIADO', 'ROBADO', 'ROBO'], linea: ['CANCELADA'] };
  const PERSONA_FINAL = ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DIRECTOR', 'JEFE DIRECTO', 'CUENTA GOOGLE', 'ID PERSONA',
    'AREA', 'DEPARTAMENTO', 'SEDE', 'OFICINA / DESARROLLO'].concat(ADICIONALES);
  function esFinal_(e, l) {
    const may = (x) => String(x === undefined || x === null ? '' : x).trim().toUpperCase();
    return e ? ESTATUS_FINAL.equipo.indexOf(may(e['ESTATUS EQUIPO'])) >= 0 : ESTATUS_FINAL.linea.indexOf(may(l && l['ESTATUS LINEA'])) >= 0;
  }

  let filas_ = null;

  // ---------------- Fecha del alta (pendiente 2.51) ----------------
  /**
   * Sin columna FECHA DE ALTA (usuario, 16-oct: «tener una columna que almacena lo mismo no tiene sentido»): el alta de un
   * equipo o una línea es su movimiento ALTA de MOVIMIENTOS (el primero, si hay varios). Se guarda aparte, { ID: fecha
   * ISO }, porque MOVIMIENTOS cambia con cada acción y releerlo rehacía todo: el alta se anota aquí al crear el renglón
   * (anotarAlta, desde LineasEscritura) y la lista entera se relee solo si no está en la caché (6 h o «Recargar datos»).
   */
  const HOJA_MOVIMIENTOS = 'MOVIMIENTOS';
  const CLAVE_ALTAS = 'altas_movimientos_v1';
  const SEG_ALTAS = 21600;
  let altas_ = null;
  const idsDe_ = (v) => String(v === null || v === undefined ? '' : v).split(',').map((x) => x.trim()).filter(Boolean);
  function anotar_(m, ids, fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (!fecha || isNaN(d.getTime())) return;
    const iso = d.toISOString();
    ids.forEach((k) => { if (!m[k] || iso < m[k]) m[k] = iso; });
  }
  function altas() {
    if (altas_) return altas_;
    const guardadas = LineasDatos.cacheLeer(CLAVE_ALTAS);
    if (guardadas) return (altas_ = guardadas);
    const m = {};
    if (LineasDatos.existeTabla(HOJA_MOVIMIENTOS)) {
      const filas = LineasDatos.buscarFilas(HOJA_MOVIMIENTOS, 'ACCION', 'ALTA');
      if (filas.length) {
        LineasDatos.leerFilas([{ tabla: HOJA_MOVIMIENTOS, filas: filas }])[0]
          .forEach((mv) => anotar_(m, idsDe_(mv['ID EQUIPO']).concat(idsDe_(mv['ID LINEA'])), mv['FECHA']));
      }
    }
    LineasDatos.cacheGuardar(CLAVE_ALTAS, m, SEG_ALTAS);
    return (altas_ = m);
  }
  /** El equipo o la línea que se acaba de crear: su alta, sin releer MOVIMIENTOS. */
  function anotarAlta(ids, fecha) {
    const m = altas();
    anotar_(m, (ids || []).map(String).filter(Boolean), fecha);
    LineasDatos.cacheGuardar(CLAVE_ALTAS, m, SEG_ALTAS);
  }

  /** ¿Esta lectura de `nombre` sale de las hojas nuevas? (LINEAS TELEFONICAS siempre, desde el 4-oct) */
  function esVirtual(nombre) {
    return String(nombre || '').trim().toUpperCase() === HOJA_VIEJA;
  }

  function bloquearEscritura() {
    throw new Error('Reestructura: LINEAS TELEFONICAS ya no se escribe; los cambios van a las hojas nuevas (LineasEscritura).');
  }

  /**
   * ¿`d` es más reciente que `actual`? El adendum que se muestra de una línea es el de fin de plan más lejano y, si
   * empatan, el último cargado. La escritura (LineasEscritura) corrige ese mismo.
   */
  function esAdendumMasReciente(d, actual) {
    const ms = (v) => (v instanceof Date ? v.getTime() : 0);
    if (!actual) return true;
    // Fotos del proveedor (módulo Proveedor, 7-oct): entre dos, la del archivo más nuevo, aunque su fin sea antes (una
    // baja, o el día de diferencia entre los formatos de fecha de Telcel); contra lo capturado o migrado, la última carga
    const archivoD = ms(d['FECHA DEL ARCHIVO']);
    const archivoA = ms(actual['FECHA DEL ARCHIVO']);
    if (archivoD && archivoA && archivoD !== archivoA) return archivoD > archivoA;
    if ((archivoD || archivoA) && ms(d['FECHA DE CARGA']) !== ms(actual['FECHA DE CARGA'])) return ms(d['FECHA DE CARGA']) > ms(actual['FECHA DE CARGA']);
    return ms(d['FIN PLAN']) > ms(actual['FIN PLAN']) ||
      (ms(d['FIN PLAN']) === ms(actual['FIN PLAN']) && ms(d['FECHA DE CARGA']) > ms(actual['FECHA DE CARGA']));
  }

  /** TIPO de la hoja vieja a partir del tipo de equipo y del tipo de línea (convertirRegistro y los folios lo usan). */
  function tipoViejo_(e, l) {
    const te = e ? String(e['TIPO DE EQUIPO'] || '').toUpperCase() : '';
    const tl = l ? String(l['TIPO DE LINEA'] || '').toUpperCase() : '';
    if (e && l) {
      if (te === 'MODEM') return tl === 'BANDA ANCHA' ? 'BANDA ANCHA' : 'MODEM';
      if (te === 'CAMARA') return 'CAMARA';
      return tl === 'SIM BASICO' ? 'EQUIPO + SIM BASICO' : 'EQUIPO + SIM';
    }
    if (e) return te === 'MODEM' ? 'MODEM' : (te === 'CAMARA' ? 'CAMARA' : 'EQUIPO');
    return tl === 'SIM BASICO' ? 'SIM BASICO' : 'LINEA';
  }

  function armar_() {
    // Si en esta ejecución ya se escribió (LineasEscritura), sus hojas en memoria ya traen lo escrito: no se releen
    const enMemoria = typeof LineasEscritura !== 'undefined' && LineasEscritura.hojasEnMemoria ? LineasEscritura.hojasEnMemoria() : null;
    const t = (nombre) => (enMemoria && enMemoria[nombre] ? enMemoria[nombre] : (LineasDatos.existeTabla(nombre) ? LineasDatos.leerTabla(nombre) : []));
    const lineas = t(HOJAS.LINEAS);
    const equipos = t(HOJAS.EQUIPOS);
    const asignaciones = t(HOJAS.ASIGNACIONES);
    const adendums = t(HOJAS.ADENDUMS);
    const alta = altas();

    const lineaPorId = {};
    lineas.forEach((l) => { lineaPorId[String(l['ID'])] = l; });
    // Asignación vigente (sin FECHA FIN) por equipo y por línea
    const vigentePorEquipo = {};
    const vigentePorLinea = {};
    asignaciones.forEach((a) => {
      if (a['FECHA FIN']) return;
      if (a['ID EQUIPO']) vigentePorEquipo[String(a['ID EQUIPO'])] = a;
      if (a['ID LINEA']) vigentePorLinea[String(a['ID LINEA'])] = a;
    });
    // Sin asignación vigente: la última que tuvo (la más reciente en cerrarse), para mostrar con quién o dónde estuvo
    const ultimaPorEquipo = {};
    const ultimaPorLinea = {};
    const ms = (v) => (v instanceof Date ? v.getTime() : 0);
    const masNueva = (x, actual) => !actual || ms(x['FECHA FIN']) > ms(actual['FECHA FIN']) ||
      (ms(x['FECHA FIN']) === ms(actual['FECHA FIN']) && ms(x['FECHA INICIO']) > ms(actual['FECHA INICIO']));
    asignaciones.forEach((a) => {
      if (!a['FECHA FIN']) return;
      const ke = String(a['ID EQUIPO'] || '');
      const kl = String(a['ID LINEA'] || '');
      if (ke && masNueva(a, ultimaPorEquipo[ke])) ultimaPorEquipo[ke] = a;
      if (kl && masNueva(a, ultimaPorLinea[kl])) ultimaPorLinea[kl] = a;
    });
    // El adendum que se muestra de cada línea (esAdendumMasReciente)
    const adendumPorLinea = {};
    adendums.forEach((d) => {
      const k = String(d['ID LINEA'] || '');
      if (esAdendumMasReciente(d, adendumPorLinea[k])) adendumPorLinea[k] = d;
    });

    const v = (o, c) => (o && o[c] !== undefined && o[c] !== null ? o[c] : '');
    const renglon = (e, l, a) => {
      const anterior = String(v(e || l, 'ID ANTERIOR'));
      const d = l ? adendumPorLinea[String(l['ID'])] : null;
      const tipo = tipoViejo_(e, l);
      // La línea sin equipo: su NUCO viejo, solo para sus documentos (NUCO ANTERIOR desde el paso 4)
      const nuco = e ? v(e, 'NUCO') : v(l, 'NUCO ANTERIOR');
      const o = {
        'ID': String(v(e || l, 'ID')), 'ID ANTERIOR': anterior, 'ID APPSHEET': v(e || l, 'ID APPSHEET'),
        'FOLIO': LineasRepo.folioRegistro(tipo, nuco), 'NUMERO TELEFONO': v(l, 'NUMERO TELEFONO'), 'NUCO': nuco, 'TIPO': tipo,
        'NO EMPLEADO': v(a, 'NO EMPLEADO'), 'RESPONSABLE': v(a, 'RESPONSABLE'), 'PUESTO': v(a, 'PUESTO'),
        'EQUIPO': v(e, 'MODELO'), 'COLOR': v(e, 'COLOR'), 'IMEI': v(e, 'IMEI'), 'NUMERO SIM': v(l, 'NUMERO SIM'), 'ACCESORIOS': v(e, 'ACCESORIOS'),
        'SEDE': v(a, 'SEDE'), 'OFICINA / DESARROLLO': v(a, 'OFICINA / DESARROLLO'), 'DEPARTAMENTO': v(a, 'DEPARTAMENTO'),
        'AREA': v(a, 'AREA'), 'JEFE DIRECTO': v(a, 'JEFE DIRECTO'), 'DIRECTOR': v(a, 'DIRECTOR'), 'RAZON SOCIAL': v(l, 'RAZON SOCIAL'),
        // El PIN de WhatsApp es del equipo (usuario, 8 y 13-oct; pendiente 2.25): el de LINEAS solo mientras no se pase
        'PIN WHATSAPP': e ? (v(e, 'PIN WHATSAPP') || v(l, 'PIN WHATSAPP')) : '', 'PIN EQUIPO': v(e, 'PIN EQUIPO'), 'CONTRASEÑA MODEM': v(e, 'CONTRASEÑA MODEM'),
        'PATRON': v(e, 'PATRON'), 'CUENTA GOOGLE': v(a, 'CUENTA GOOGLE'), 'COMPAÑIA': v(l, 'COMPAÑIA'),
        'COSTO PLAN': v(d, 'COSTO PLAN'), 'FECHA REGISTRO': alta[String(v(e || l, 'ID'))] || '', 'INICIO PLAN': v(d, 'INICIO PLAN'),
        'FIN PLAN': v(d, 'FIN PLAN'), 'ESTATUS LINEA': v(l, 'ESTATUS LINEA'), 'ESTATUS EQUIPO': v(e, 'ESTATUS EQUIPO'),
        'ID PERSONA': v(a, 'ID PERSONA'),
        'ID EQUIPO': e ? String(e['ID']) : '', 'ID LINEA': l ? String(l['ID']) : '', 'ID ASIGNACION': v(a, 'ID'),
        'TIPO ASIGNACION': v(a, 'TIPO'), 'TIPO DE LINEA': v(l, 'TIPO DE LINEA'), 'TIPO DE EQUIPO': v(e, 'TIPO DE EQUIPO'),
        'CUENTA PADRE': v(l, 'CUENTA PADRE'), 'CUENTA': v(l, 'CUENTA'), 'PLAN': v(d, 'PLAN'), 'FUENTE PLAN': v(d, 'FUENTE'),
        'ORIGEN PLAN': v(d, 'ARCHIVO'),
      };
      ADICIONALES.forEach((c) => { o[c] = v(a, c); });
      DEL_EQUIPO_O_LINEA.forEach((c) => { o[c] = v(e, c) || v(l, c); });
      const ultima = a ? null : (e ? ultimaPorEquipo[String(e['ID'])] : ultimaPorLinea[String(l['ID'])]) || null;
      if (ultima) {
        // Ya pasó por el sistema nuevo: la última asignación (ya cerrada) es su historia
        PERSONA_SIN_ASIGNACION.forEach((c) => { o[c] = v(ultima, c); });
      }
      if (esFinal_(e, l)) PERSONA_FINAL.forEach((c) => { o[c] = ''; });
      return o;
    };

    const salida = [];
    const lineaUsada = {};
    equipos.forEach((e) => {
      const a = vigentePorEquipo[String(e['ID'])] || null;
      const l = a && a['ID LINEA'] ? lineaPorId[String(a['ID LINEA'])] || null : null;
      if (l) lineaUsada[String(l['ID'])] = true;
      salida.push(renglon(e, l, a));
    });
    lineas.forEach((l) => {
      if (lineaUsada[String(l['ID'])]) return;
      salida.push(renglon(null, l, vigentePorLinea[String(l['ID'])] || null));
    });
    return salida;
  }

  /** Los renglones armados (una vez por ejecución; entre ejecuciones, en caché mientras no cambie ninguna hoja). */
  function filas() {
    if (filas_) return filas_;
    const nombres = [HOJAS.LINEAS, HOJAS.EQUIPOS, HOJAS.ASIGNACIONES, HOJAS.ADENDUMS];
    const crudas = LineasDatos.recordar(CLAVE_CACHE, nombres, armar_, 1800);
    // Al pasar por la caché, las fechas salen como texto ISO: se regresan a Date
    const esIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    filas_ = crudas.map((o, i) => {
      const r = { _fila: i + 2 };
      ENCABEZADOS.forEach((h) => {
        const x = o[h];
        r[h] = typeof x === 'string' && esIso.test(x) && LineasDatos.esColumnaFecha(h) ? new Date(x) : (x === undefined ? '' : x);
      });
      return r;
    });
    return filas_;
  }

  // ---------------- Lo que LineasDatos necesita para LINEAS TELEFONICAS ----------------

  function porNumero(n) {
    return filas()[n - 2] || null;
  }

  /** Números de "fila" (posición + 2) cuyo valor en `columna` es `valor` (o lo contiene si `parcial`), sin mayúsculas. */
  function buscar(columna, valor, parcial) {
    if (valor === null || valor === undefined || String(valor) === '') return [];
    const c = LineasDatos.normCol(columna);
    const h = ENCABEZADOS.filter((x) => LineasDatos.normCol(x) === c)[0];
    if (!h) throw new Error('La pestaña "' + HOJA_VIEJA + '" no tiene la columna "' + columna + '".');
    const buscado = String(valor).trim().toUpperCase();
    const salida = [];
    filas().forEach((r) => {
      const x = r[h] instanceof Date ? '' : String(r[h] === null || r[h] === undefined ? '' : r[h]).trim().toUpperCase();
      if (parcial ? x.indexOf(buscado) >= 0 : x === buscado) salida.push(r._fila);
    });
    return salida;
  }

  /** Filas que contienen `texto` en cualquier columna. */
  function buscarEnTodo(texto) {
    const buscado = String(texto || '').trim().toUpperCase();
    if (!buscado) return [];
    return filas().filter((r) => ENCABEZADOS.some((h) => !(r[h] instanceof Date) && String(r[h] || '').toUpperCase().indexOf(buscado) >= 0))
      .map((r) => r._fila);
  }

  /** Al cambiar de hoja (o al volver a armar las hojas nuevas): que índice, Panorama y avisos se vuelvan a calcular. */
  function limpiarCaches() {
    LineasRepo.borrarCaches();
    // También los encabezados de las hojas nuevas: si el armado cambió sus columnas (p. ej. COLOR en EQUIPOS, 3-oct), los
    // guardados (1 h) leerían cada dato en la columna equivocada
    const nuevas = [HOJAS.LINEAS, HOJAS.EQUIPOS, HOJAS.ASIGNACIONES, HOJAS.ADENDUMS, 'FACTURAS', 'CUENTAS', 'CATALOGOS'];
    nuevas.map((n) => 'enc_' + n).concat(['ln_panorama_v3', 'ln_panorama_eventos_v1', 'ln_notif_revision_v2', CLAVE_ALTAS])
      .forEach(LineasDatos.cacheBorrar);
    altas_ = null;
    LineasDatos.tocar([HOJAS.LINEAS, HOJAS.EQUIPOS, HOJAS.ASIGNACIONES, HOJAS.ADENDUMS]);
  }

  return {
    HOJA_VIEJA, HOJAS, ENCABEZADOS,
    esVirtual, bloquearEscritura, filas, porNumero, buscar, buscarEnTodo, tipoViejo_, limpiarCaches, esAdendumMasReciente,
    altas, anotarAlta,
    /** Después de escribir en las hojas nuevas: la siguiente lectura vuelve a armar los renglones. */
    olvidar: () => { filas_ = null; },
  };
})();

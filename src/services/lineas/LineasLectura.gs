/**
 * LineasLectura.gs
 * Etapa 2 de la implementación de las partes 4 y 5 del plan (migracion/PLAN_REESTRUCTURA_LINEAS.md): el sistema lee de
 * las hojas nuevas (LINEAS, EQUIPOS, ASIGNACIONES, ADENDUMS) y la pantalla sigue igual.
 *
 * Cómo: con el interruptor encendido (Script Property LINEAS_LECTURA = ESTRUCTURA), toda lectura de LINEAS TELEFONICAS
 * que pasa por LineasDatos (leerTabla, buscarFilas, leerFilas…) recibe renglones ARMADOS con las hojas nuevas y con los
 * mismos nombres de columna de la hoja vieja. Así el resto del código (índice, ficha, Panorama, avisos, resguardos…)
 * no cambia. LINEAS TELEFONICAS ya no se escribe: desde la etapa 3, guardar escribe en las hojas nuevas
 * (LineasEscritura.gs) y aquí solo se vuelve a armar lo leído (olvidar).
 *
 * Un renglón armado es:
 *   - cada EQUIPO, con su asignación vigente y la línea de esa asignación;
 *   - cada LÍNEA que no quedó con un equipo, con su asignación vigente (o ninguna).
 * ID del renglón: el del equipo (EQU-…) o el de la línea (LIN-…). ID ANTERIOR: el de la fila vieja (LIN-…), con el
 * que citan al registro las inspecciones, responsivas, bitácora y APP_*. ID APPSHEET: el del AppSheet.
 *
 * Mientras no se migren (parte 9), unas pocas columnas de solo consulta se toman de la hoja vieja, por ID ANTERIOR:
 * COMENTARIOS (en el diseño nuevo viven en el historial), RESPONSIVA, FORMATO INSPECCION y FECHA INSPECCION (rutas
 * del AppSheet), el NUCO de las líneas sin equipo (para encontrar sus documentos en NUCOS) y, cuando el registro no
 * tiene asignación vigente (vendido, extraviado, fuera de inventario…), los datos de la última persona: los de su
 * última asignación cerrada si ya pasó por el sistema nuevo (etapa 3); si no, los de la hoja vieja tal como están,
 * porque el historial de asignaciones de antes se arma en la parte 9. Sin el código de resguardo (decisión del
 * usuario) y, en lo vendido o desechado, con el departamento N/A (D-I3).
 *
 * Se enciende y se apaga desde el editor: reestructuraLeerHojasNuevas / reestructuraLeerHojaVieja.
 *
 * Paso 4 (LineasRetiro.gs, §I.6.7): con LINEAS TELEFONICAS retirada (Script Property LINEAS_HOJA_VIEJA_RETIRADA) ya no
 * se lee nada de ella: las rutas del AppSheet y el NUCO de la línea sola están en EQUIPOS / LINEAS, la última persona
 * en una asignación cerrada y el comentario viejo en MOVIMIENTOS.
 */

const LineasLectura = (function () {
  const HOJA_VIEJA = 'LINEAS TELEFONICAS';
  const PROPIEDAD = 'LINEAS_LECTURA';
  const VALOR_NUEVO = 'ESTRUCTURA';
  const HOJAS = { LINEAS: 'LINEAS', EQUIPOS: 'EQUIPOS', ASIGNACIONES: 'ASIGNACIONES', ADENDUMS: 'ADENDUMS' };
  const CLAVE_CACHE = 'estructura_virtual_v2';
  const PROPIEDAD_RETIRADA = 'LINEAS_HOJA_VIEJA_RETIRADA';

  /** Columnas de los renglones armados: las de la hoja vieja que el sistema lee, más las referencias nuevas. */
  /** Responsables adicionales (6-oct): número de empleado y nombre del segundo al quinto. */
  const ADICIONALES = ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'].reduce((a, n) => a.concat(['NO EMPLEADO ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE']), []);
  const ENCABEZADOS = ['ID', 'ID ANTERIOR', 'ID APPSHEET', 'FOLIO', 'NUMERO TELEFONO', 'NUCO', 'TIPO', 'NO EMPLEADO',
    'RESPONSABLE', 'PUESTO', 'NOMBRE QUIEN USA', 'PUESTO QUIEN USA'].concat(ADICIONALES, [ 'ESTATUS GENERAL', 'EQUIPO', 'COLOR', 'IMEI', 'NUMERO SIM',
    'ACCESORIOS', 'SEDE', 'OFICINA / DESARROLLO', 'DEPARTAMENTO', 'AREA', 'JEFE DIRECTO', 'DIRECTOR', 'RAZON SOCIAL',
    'PIN WHATSAPP', 'PIN EQUIPO', 'CONTRASEÑA MODEM', 'PATRON', 'CUENTA GOOGLE', 'COMPAÑIA', 'COSTO PLAN',
    'FECHA REGISTRO', 'INICIO PLAN', 'FIN PLAN', 'ESTATUS LINEA', 'ESTATUS EQUIPO', 'RESPONSIVA', 'COMENTARIOS',
    'FECHA INSPECCION', 'FORMATO INSPECCION', 'ID PERSONA',
    // Referencias de la estructura nueva
    'ID EQUIPO', 'ID LINEA', 'ID ASIGNACION', 'TIPO ASIGNACION', 'TIPO DE LINEA', 'TIPO DE EQUIPO']);
  // De la hoja vieja, solo de consulta, hasta la migración (ver la cabecera)
  const DE_LA_HOJA_VIEJA = ['COMENTARIOS', 'RESPONSIVA', 'FORMATO INSPECCION', 'FECHA INSPECCION'];
  const PERSONA_SIN_ASIGNACION = ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'NOMBRE QUIEN USA', 'PUESTO QUIEN USA', 'SEDE',
    'OFICINA / DESARROLLO', 'DEPARTAMENTO', 'AREA', 'DIRECTOR', 'JEFE DIRECTO', 'CUENTA GOOGLE', 'ID PERSONA'].concat(ADICIONALES);

  let activo_ = null;
  let filas_ = null;
  let porId_ = null;

  /** El interruptor y la fecha de retiro: los de Entornos.gs para este proyecto (DEV, 5-oct) o la Script Property. */
  const config_ = (clave) => (typeof leerConfig_ === 'function' ? leerConfig_(clave) : PropertiesService.getScriptProperties().getProperty(clave));

  function activo() {
    if (activo_ === null) activo_ = config_(PROPIEDAD) === VALOR_NUEVO;
    return activo_;
  }

  /** Fecha (ISO) en que se retiró LINEAS TELEFONICAS, o null si todavía se lee (paso 4). */
  function retirada() {
    const v = config_(PROPIEDAD_RETIRADA);
    return v && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v : null;
  }

  /** ¿Esta lectura de `nombre` sale de las hojas nuevas? */
  function esVirtual(nombre) {
    return String(nombre || '').trim().toUpperCase() === HOJA_VIEJA && activo();
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
    return !actual || ms(d['FIN PLAN']) > ms(actual['FIN PLAN']) ||
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
    return tl === 'SIM BASICO' ? 'LINEA BASICA' : 'LINEA';
  }

  /**
   * De la hoja vieja solo lo que todavía se muestra (DE_LA_HOJA_VIEJA, la persona de antes y el NUCO), por ID. Ya no se
   * escribe, así que se guarda aparte y no se vuelve a leer cada vez que cambia una hoja nueva (rapidez, paso 2).
   */
  function vieja_() {
    const columnas = DE_LA_HOJA_VIEJA.concat(PERSONA_SIN_ASIGNACION, ['NUCO']);
    return LineasDatos.recordar('estructura_vieja_v1', [HOJA_VIEJA], () => {
      const m = {};
      LineasDatos.leerTabla(HOJA_VIEJA, true).forEach((f) => {
        if (!f['ID']) return;
        const o = {};
        columnas.forEach((c) => { if (f[c] !== '' && f[c] !== null && f[c] !== undefined) o[c] = f[c]; });
        m[String(f['ID'])] = o;
      });
      return m;
    }, 21600);
  }

  function armar_() {
    // Si en esta ejecución ya se escribió (LineasEscritura), sus hojas en memoria ya traen lo escrito: no se releen
    const enMemoria = typeof LineasEscritura !== 'undefined' && LineasEscritura.hojasEnMemoria ? LineasEscritura.hojasEnMemoria() : null;
    const t = (nombre) => (enMemoria && enMemoria[nombre] ? enMemoria[nombre] : (LineasDatos.existeTabla(nombre) ? LineasDatos.leerTabla(nombre, true) : []));
    const lineas = t(HOJAS.LINEAS);
    const equipos = t(HOJAS.EQUIPOS);
    const asignaciones = t(HOJAS.ASIGNACIONES);
    const adendums = t(HOJAS.ADENDUMS);
    const vieja = retirada() ? {} : vieja_();

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
      const viejo = vieja[anterior] || null;
      const d = l ? adendumPorLinea[String(l['ID'])] : null;
      const tipo = tipoViejo_(e, l);
      // La línea sin equipo: su NUCO viejo, solo para sus documentos (NUCO ANTERIOR desde el paso 4)
      const nuco = e ? v(e, 'NUCO') : (v(l, 'NUCO ANTERIOR') || v(viejo, 'NUCO'));
      const o = {
        'ID': String(v(e || l, 'ID')), 'ID ANTERIOR': anterior, 'ID APPSHEET': v(e || l, 'ID APPSHEET'),
        'FOLIO': LineasRepo.folioRegistro(tipo, nuco), 'NUMERO TELEFONO': v(l, 'NUMERO TELEFONO'), 'NUCO': nuco, 'TIPO': tipo,
        'NO EMPLEADO': v(a, 'NO EMPLEADO'), 'RESPONSABLE': v(a, 'RESPONSABLE'), 'PUESTO': v(a, 'PUESTO'),
        'NOMBRE QUIEN USA': v(a, 'NOMBRE QUIEN USA'), 'PUESTO QUIEN USA': v(a, 'PUESTO QUIEN USA'), 'ESTATUS GENERAL': '',
        'EQUIPO': v(e, 'MODELO'), 'COLOR': v(e, 'COLOR'), 'IMEI': v(e, 'IMEI'), 'NUMERO SIM': v(l, 'NUMERO SIM'), 'ACCESORIOS': v(e, 'ACCESORIOS'),
        'SEDE': v(a, 'SEDE'), 'OFICINA / DESARROLLO': v(a, 'OFICINA / DESARROLLO'), 'DEPARTAMENTO': v(a, 'DEPARTAMENTO'),
        'AREA': v(a, 'AREA'), 'JEFE DIRECTO': v(a, 'JEFE DIRECTO'), 'DIRECTOR': v(a, 'DIRECTOR'), 'RAZON SOCIAL': v(l, 'RAZON SOCIAL'),
        'PIN WHATSAPP': v(l, 'PIN WHATSAPP'), 'PIN EQUIPO': v(e, 'PIN EQUIPO'), 'CONTRASEÑA MODEM': v(e, 'CONTRASEÑA MODEM'),
        'PATRON': v(e, 'PATRON'), 'CUENTA GOOGLE': v(a, 'CUENTA GOOGLE'), 'COMPAÑIA': v(l, 'COMPAÑIA'),
        'COSTO PLAN': v(d, 'COSTO PLAN'), 'FECHA REGISTRO': v(e || l, 'FECHA DE ALTA'), 'INICIO PLAN': v(d, 'INICIO PLAN'),
        'FIN PLAN': v(d, 'FIN PLAN'), 'ESTATUS LINEA': v(l, 'ESTATUS LINEA'), 'ESTATUS EQUIPO': v(e, 'ESTATUS EQUIPO'),
        'ID PERSONA': v(a, 'ID PERSONA'),
        'ID EQUIPO': e ? String(e['ID']) : '', 'ID LINEA': l ? String(l['ID']) : '', 'ID ASIGNACION': v(a, 'ID'),
        'TIPO ASIGNACION': v(a, 'TIPO'), 'TIPO DE LINEA': v(l, 'TIPO DE LINEA'), 'TIPO DE EQUIPO': v(e, 'TIPO DE EQUIPO'),
      };
      ADICIONALES.forEach((c) => { o[c] = v(a, c); });
      DE_LA_HOJA_VIEJA.forEach((c) => { o[c] = v(e, c) || v(l, c) || v(viejo, c); });
      const ultima = a ? null : (e ? ultimaPorEquipo[String(e['ID'])] : ultimaPorLinea[String(l['ID'])]) || null;
      if (ultima) {
        // Ya pasó por el sistema nuevo: la última asignación (ya cerrada) es su historia
        PERSONA_SIN_ASIGNACION.forEach((c) => { o[c] = v(ultima, c); });
      } else if (!a && viejo) {
        const esCodigo = (x) => ESTRUCTURA_ES_CODIGO_RESGUARDO.test(String(x || '').trim().toUpperCase());
        PERSONA_SIN_ASIGNACION.forEach((c) => { o[c] = v(viejo, c); });
        if (esCodigo(o['RESPONSABLE'])) o['RESPONSABLE'] = '';
        if (esCodigo(o['NOMBRE QUIEN USA'])) { o['NOMBRE QUIEN USA'] = ''; o['PUESTO QUIEN USA'] = ''; }
      }
      if (!a && ['VENDIDO', 'DESECHADO'].indexOf(String(o['ESTATUS EQUIPO']).toUpperCase()) >= 0) o['DEPARTAMENTO'] = 'N/A';
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
    const nombres = [HOJAS.LINEAS, HOJAS.EQUIPOS, HOJAS.ASIGNACIONES, HOJAS.ADENDUMS, HOJA_VIEJA];
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
    nuevas.map((n) => 'enc_' + n).concat(['enc_' + HOJA_VIEJA, 'ln_panorama_v3', 'ln_panorama_eventos_v1', 'ln_notif_revision_v2'])
      .forEach(LineasDatos.cacheBorrar);
    LineasDatos.tocar([HOJA_VIEJA, HOJAS.LINEAS, HOJAS.EQUIPOS, HOJAS.ASIGNACIONES, HOJAS.ADENDUMS]);
  }

  return {
    HOJA_VIEJA, PROPIEDAD, PROPIEDAD_RETIRADA, VALOR_NUEVO, HOJAS, ENCABEZADOS,
    activo, retirada, esVirtual, bloquearEscritura, filas, porNumero, buscar, buscarEnTodo, tipoViejo_, limpiarCaches, esAdendumMasReciente,
    /** Después de escribir en las hojas nuevas: la siguiente lectura vuelve a armar los renglones. */
    olvidar: () => { filas_ = null; },
    // Solo para comparar las dos lecturas en una misma ejecución (reestructuraCompararLectura)
    _forzar: (valor) => { activo_ = !!valor; filas_ = null; LineasDatos.olvidarTabla(HOJA_VIEJA); },
  };
})();

/** Etapa 2: el sistema lee de las hojas nuevas. Se corre desde el editor. */
function reestructuraLeerHojasNuevas() {
  soloEditor_();
  PropertiesService.getScriptProperties().setProperty(LineasLectura.PROPIEDAD, LineasLectura.VALOR_NUEVO);
  LineasLectura.limpiarCaches();
  return 'Listo: el sistema lee de LINEAS, EQUIPOS, ASIGNACIONES y ADENDUMS (guardar está bloqueado).';
}

/** Regresa a leer de LINEAS TELEFONICAS (como antes de la etapa 2). */
function reestructuraLeerHojaVieja() {
  soloEditor_();
  if (LineasLectura.retirada()) throw new Error('LINEAS TELEFONICAS ya se retiró (' + LineasLectura.retirada() + '): no se puede volver a leer.');
  PropertiesService.getScriptProperties().deleteProperty(LineasLectura.PROPIEDAD);
  LineasLectura.limpiarCaches();
  return 'Listo: el sistema vuelve a leer de LINEAS TELEFONICAS.';
}

/**
 * Validación de la etapa 2: lee el inventario de las dos formas (hoja vieja y hojas nuevas), convierte cada registro
 * como lo hace la pantalla (LineasRepo.convertirRegistro) y cuenta qué se vería distinto, campo por campo, con los
 * cambios más comunes. No escribe nada. Se corre desde el editor.
 */
function reestructuraCompararLectura() {
  soloEditor_();
  const txt = (v) => (v instanceof Date ? Utilities.formatDate(v, LineasDatos.ZONA_APP, 'yyyy-MM-dd') : String(v === null || v === undefined ? '' : v).trim().toUpperCase());
  const campos = (f) => {
    const r = LineasRepo.convertirRegistro(f);
    if (!r) return null;
    const e = r.equipo || {};
    const l = r.linea || {};
    const p = e.responsable || l.responsable || {};
    return {
      'TIPO': r.tipo, 'NUCO': r.nuco, 'NUMERO': l.numero, 'SIM': l.sim, 'COMPAÑIA': l.compania, 'ESTATUS EQUIPO': e.estatus,
      'ESTATUS LINEA': l.estatus, 'FIN PLAN': l.finPlan, 'COSTO PLAN': l.costoPlan, 'MODELO': e.modelo, 'IMEI': e.imei,
      'RESPONSABLE': p.nombre, 'NO EMPLEADO': p.noEmpleado, 'PUESTO': p.puesto, 'DEPARTAMENTO': p.departamento, 'AREA': p.area,
      'SEDE': p.sede, 'OFICINA': p.oficina, 'DIRECTOR': p.director, 'JEFE DIRECTO': p.jefeDirecto,
      'QUIEN USA': (p.usuariosAdicionales || []).map((u) => u.nombre).join(' / '), '¿EQUIPO?': !!r.equipo, '¿LINEA?': !!r.linea,
    };
  };
  const leer = (nuevo) => {
    LineasLectura._forzar(nuevo);
    return LineasDatos.leerTabla(LineasLectura.HOJA_VIEJA);
  };
  const viejas = leer(false);
  const nuevas = leer(true);
  LineasLectura._forzar(PropertiesService.getScriptProperties().getProperty(LineasLectura.PROPIEDAD) === LineasLectura.VALOR_NUEVO);

  // Cada registro nuevo se ubica por el ID de la fila vieja (ID ANTERIOR)
  const nuevoPorViejo = {};
  nuevas.forEach((f) => { if (f['ID ANTERIOR']) (nuevoPorViejo[f['ID ANTERIOR']] = nuevoPorViejo[f['ID ANTERIOR']] || []).push(f); });
  const difs = {};
  const sumar = (campo, antes, despues, nuco) => {
    const d = difs[campo] = difs[campo] || { total: 0, pares: {}, ejemplos: [] };
    d.total++;
    const k = (antes || '(vacío)') + ' → ' + (despues || '(vacío)');
    d.pares[k] = (d.pares[k] || 0) + 1;
    if (d.ejemplos.length < 5) d.ejemplos.push('NUCO ' + nuco + ': ' + k);
  };
  let sinPareja = 0;
  let partidos = 0;
  const ejemplosSinPareja = [];
  viejas.forEach((fv) => {
    const cv = campos(fv);
    if (!cv) return;
    const pareja = nuevoPorViejo[fv['ID']] || [];
    if (!pareja.length) { sinPareja++; if (ejemplosSinPareja.length < 8) ejemplosSinPareja.push(cv['NUCO'] + ' · ' + cv['TIPO']); return; }
    if (pareja.length > 1) partidos++;
    const cn = campos(pareja[0]);
    Object.keys(cv).forEach((c) => {
      const a = txt(cv[c]);
      const b = txt(cn[c]);
      if (a !== b) sumar(c, a, b, cv['NUCO']);
    });
  });
  const salida = [
    'Registros: hoja vieja ' + viejas.length + ' · hojas nuevas ' + nuevas.length,
    'Filas viejas sin registro nuevo: ' + sinPareja + (ejemplosSinPareja.length ? ' (ej. ' + ejemplosSinPareja.join(' | ') + ')' : ''),
    'Filas viejas que quedaron en dos registros (equipo y línea por separado): ' + partidos,
    'Registros nuevos que no vienen de una fila vieja: ' + nuevas.filter((f) => !f['ID ANTERIOR']).length,
    '', 'CAMPO | cuántos cambian | cambios más comunes',
  ];
  Object.keys(difs).sort((a, b) => difs[b].total - difs[a].total).forEach((c) => {
    const d = difs[c];
    const top = Object.keys(d.pares).sort((a, b) => d.pares[b] - d.pares[a]).slice(0, 6).map((k) => k + ' (' + d.pares[k] + ')');
    salida.push(c + ' | ' + d.total + ' | ' + top.join(' · '));
  });
  for (let i = 0; i < salida.length; i += 25) console.log(salida.slice(i, i + 25).join('\n'));
  return 'Listo: ver el registro de ejecución.';
}

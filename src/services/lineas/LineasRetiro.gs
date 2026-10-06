/**
 * LineasRetiro.gs
 * Etapa 3, paso 4 de la reestructura (migracion/PLAN_REESTRUCTURA_LINEAS.md §I.6.7): retirar LINEAS TELEFONICAS.
 *
 * Decisiones del usuario (4-oct, noche):
 *   - Las pestañas que citan al registro con su ID viejo pasan al ID nuevo (el del equipo, EQU-…, o el de la línea sola,
 *     LIN-…): INSPECCIONES LINEAS, RESPONSIVAS LINEAS, APP_EVIDENCIAS, APP_RESGUARDOS y APP_NOTIFICACIONES. La bitácora
 *     CAMBIOS y APP_MOVIMIENTOS no se tocan: pasan a MOVIMIENTOS en la parte 9. APP_CORRECCIONES no guarda el ID del
 *     registro (lo busca por ID del AppSheet y NUCO al leer).
 *   - Lo que todavía se leía de la hoja vieja se copia, sin corregir, a las hojas nuevas:
 *       COMENTARIOS                                    → un renglón de MOVIMIENTOS (COMENTARIO_ANTERIOR, origen MIGRACION)
 *       RESPONSIVA, FORMATO INSPECCION, FECHA INSPECCION → columnas con el mismo nombre en EQUIPOS (o en LINEAS, si es
 *                                                         una línea sin equipo)
 *       NUCO de la línea sin equipo                    → NUCO ANTERIOR en LINEAS (solo para encontrar sus documentos)
 *       la última persona de lo que no tiene asignación → una asignación cerrada (FECHA FIN = el día de la copia; la
 *                                                         fecha real se arma en la parte 9)
 *   - Después, la hoja se oculta (no se borra) y el sistema deja de leerla (Script Property LINEAS_HOJA_VIEJA_RETIRADA).
 *
 * Se corre desde el editor: primero reestructuraRetiroRevisar (no escribe nada, dice qué haría) y luego
 * reestructuraRetiroAplicar. Con la hoja retirada ya no se puede rearmar la estructura (borraría lo guardado) ni volver
 * a leer la hoja vieja.
 */

const RETIRO_ORIGEN = 'MIGRACION';
const RETIRO_ACCION_COMENTARIO = 'COMENTARIO_ANTERIOR';
/** De la hoja vieja a la fila del equipo (o de la línea sin equipo). */
const RETIRO_RUTAS = ['RESPONSIVA', 'FORMATO INSPECCION', 'FECHA INSPECCION'];
/** Lo que guarda una asignación de la persona y de dónde está (mismas columnas que la hoja vieja). */
const RETIRO_PERSONA = ['ID PERSONA', 'NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO',
  'DIRECTOR', 'CUENTA GOOGLE']; // «Quien lo usa» no pasa (usuario, 6-oct)
/** Pestañas que citan al registro: [pestaña, columna, columna que repite el ID dentro de una clave "TIPO|ID|…"]. */
const RETIRO_REFERENCIAS = [
  ['INSPECCIONES LINEAS', 'ID LINEA'],
  ['RESPONSIVAS LINEAS', 'ID LINEA'],
  ['APP_EVIDENCIAS', 'ID_LINEA'],
  ['APP_RESGUARDOS', 'REGISTRO_ID'],
  ['APP_NOTIFICACIONES', 'REF_ID', 'CLAVE'],
];

/** Revisión: dice qué copiaría y qué referencias cambiaría, sin escribir nada. */
function reestructuraRetiroRevisar() {
  soloEditor_();
  return retiroHojaVieja_(false);
}

/** Copia lo que falta, cambia las referencias, oculta LINEAS TELEFONICAS y deja de leerla. */
function reestructuraRetiroAplicar() {
  soloEditor_();
  return retiroHojaVieja_(true);
}

function retiroHojaVieja_(aplicar) {
  const yaRetirada = LineasLectura.retirada();
  if (yaRetirada) throw new Error('LINEAS TELEFONICAS ya se retiró (' + yaRetirada + ').');
  if (!LineasLectura.activo()) throw new Error('Primero enciende las hojas nuevas (reestructuraLeerHojasNuevas).');
  const ss = SpreadsheetApp.openById(leerConfig_('SS_ID_TELEFONIA'));
  const ahora = new Date();
  const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const vacio = (v) => ['', 'N/A', 'NA', 'NO APLICA', '-', 'SOLO LINEA', 'SIN EQUIPO'].indexOf(norm(v)) >= 0;
  const tal = (v) => (v instanceof Date ? v : (vacio(v) ? '' : String(v).trim()));
  const hay = (v) => v instanceof Date || String(v == null ? '' : v).trim() !== '';
  const reporte = [];
  const anotar = (t) => { reporte.push(t); console.log(t); };

  /** Una pestaña completa: { hoja, enc, filas (arreglos), c(nombre) → índice o -1 }. */
  const leer = (nombre) => {
    const hoja = ss.getSheetByName(nombre);
    if (!hoja) return null;
    const v = hoja.getDataRange().getValues();
    const enc = v[0].map((x) => String(x).trim());
    return { nombre: nombre, hoja: hoja, enc: enc, filas: v.slice(1), c: (n) => enc.indexOf(n) };
  };
  /** Agrega al final las columnas que falten (solo al aplicar; en la revisión se cuentan como nuevas). */
  const asegurarColumnas = (t, nombres) => {
    nombres.forEach((n) => {
      if (t.c(n) >= 0) return;
      t.enc.push(n);
      t.filas.forEach((f) => f.push(''));
      if (!aplicar) return;
      const col = t.enc.length;
      if (t.hoja.getMaxColumns() < col) t.hoja.insertColumnsAfter(t.hoja.getMaxColumns(), col - t.hoja.getMaxColumns());
      t.hoja.getRange(1, col).setValue(n).setFontWeight('bold');
      t.hoja.getRange(2, col, Math.max(1, t.hoja.getMaxRows() - 1), 1).setNumberFormat(/^FECHA/.test(n) ? 'dd/MM/yyyy' : '@');
    });
  };
  /** Escribe de un jalón las columnas que cambiaron. */
  const escribirColumnas = (t, nombres) => {
    if (!aplicar || !t.filas.length) return;
    nombres.forEach((n) => {
      const i = t.c(n);
      t.hoja.getRange(2, i + 1, t.filas.length, 1).setValues(t.filas.map((f) => [f[i] === undefined || f[i] === null ? '' : f[i]]));
    });
  };

  const vieja = leer(LineasLectura.HOJA_VIEJA);
  if (!vieja) throw new Error('No existe la pestaña ' + LineasLectura.HOJA_VIEJA + '.');
  const EQ = leer('EQUIPOS');
  const LI = leer('LINEAS');
  const AS = leer('ASIGNACIONES');
  if (!EQ || !LI || !AS) throw new Error('Faltan las hojas nuevas (EQUIPOS, LINEAS o ASIGNACIONES).');
  const v = (t, f, n) => (t.c(n) >= 0 ? f[t.c(n)] : '');

  // 1) De dónde salió cada registro nuevo: su ID ANTERIOR es el ID de la fila vieja
  const destinoPorViejo = {};
  [['EQUIPOS', EQ], ['LINEAS', LI]].forEach(([hoja, t]) => {
    t.filas.forEach((f, i) => {
      const ant = String(v(t, f, 'ID ANTERIOR') || '').trim();
      if (ant) destinoPorViejo[ant] = { hoja: hoja, t: t, i: i, id: String(v(t, f, 'ID')) };
    });
  });
  // Todos los IDs con los que se cita a una fila vieja (el de hoy, el de antes y el del AppSheet) → ID nuevo
  const idNuevo = {};
  let sinDestino = 0;
  const filasViejas = vieja.filas.filter((f) => hay(v(vieja, f, 'ID')));
  filasViejas.forEach((f) => {
    const d = destinoPorViejo[String(v(vieja, f, 'ID')).trim()];
    if (!d) { sinDestino++; return; }
    ['ID', 'ID ANTERIOR', 'ID APPSHEET'].forEach((n) => {
      const k = String(v(vieja, f, n) || '').trim();
      if (k) idNuevo[k.toLowerCase()] = d.id;
    });
  });
  anotar('Hoja vieja: ' + filasViejas.length + ' filas · ' + (filasViejas.length - sinDestino) + ' con su registro nuevo · ' + sinDestino + ' sin registro nuevo.');

  // 2) Rutas del AppSheet y NUCO de las líneas sin equipo (solo donde la hoja nueva todavía no tiene valor)
  asegurarColumnas(EQ, RETIRO_RUTAS);
  asegurarColumnas(LI, ['NUCO ANTERIOR'].concat(RETIRO_RUTAS));
  const copiados = { rutas: 0, nuco: 0 };
  filasViejas.forEach((f) => {
    const d = destinoPorViejo[String(v(vieja, f, 'ID')).trim()];
    if (!d) return;
    const fila = d.t.filas[d.i];
    let algo = false;
    RETIRO_RUTAS.forEach((n) => {
      const x = tal(v(vieja, f, n));
      if (hay(x) && !hay(fila[d.t.c(n)])) { fila[d.t.c(n)] = x; algo = true; }
    });
    if (algo) copiados.rutas++;
    if (d.hoja === 'LINEAS') {
      const nuco = tal(v(vieja, f, 'NUCO'));
      if (hay(nuco) && !hay(fila[d.t.c('NUCO ANTERIOR')])) { fila[d.t.c('NUCO ANTERIOR')] = nuco; copiados.nuco++; }
    }
  });
  escribirColumnas(EQ, RETIRO_RUTAS);
  escribirColumnas(LI, ['NUCO ANTERIOR'].concat(RETIRO_RUTAS));
  anotar('Rutas del AppSheet copiadas: ' + copiados.rutas + ' registros · NUCO de líneas sin equipo: ' + copiados.nuco + '.');

  // 3) La última persona de lo que no tiene asignación (ni vigente ni cerrada): una asignación cerrada
  const conAsignacion = { EQUIPOS: {}, LINEAS: {} };
  const lineaVigenteDeEquipo = {};
  AS.filas.forEach((a) => {
    const e = String(v(AS, a, 'ID EQUIPO') || '').trim();
    const l = String(v(AS, a, 'ID LINEA') || '').trim();
    if (e) conAsignacion.EQUIPOS[e] = true;
    if (l) conAsignacion.LINEAS[l] = true;
    if (e && l && !hay(v(AS, a, 'FECHA FIN'))) lineaVigenteDeEquipo[e] = l;
  });
  const nuevasAsignaciones = [];
  filasViejas.forEach((f) => {
    const d = destinoPorViejo[String(v(vieja, f, 'ID')).trim()];
    if (!d || conAsignacion[d.hoja][d.id]) return;
    const p = {};
    RETIRO_PERSONA.forEach((n) => { p[n] = tal(v(vieja, f, n)); });
    // Sin el código de resguardo (decisión del usuario), igual que como se mostraba
    if (ESTRUCTURA_ES_CODIGO_RESGUARDO.test(norm(p['RESPONSABLE']))) p['RESPONSABLE'] = '';
    if (!RETIRO_PERSONA.some((n) => hay(p[n]))) return;
    nuevasAsignaciones.push(Object.assign(p, {
      'ID': Ids.nuevo('ASG'), 'TIPO': hay(p['RESPONSABLE']) ? 'PERSONA' : 'RESGUARDO',
      'ID EQUIPO': d.hoja === 'EQUIPOS' ? d.id : '', 'ID LINEA': d.hoja === 'LINEAS' ? d.id : '',
      'FECHA INICIO': '', 'FECHA FIN': ahora,
    }));
  });
  if (aplicar && nuevasAsignaciones.length) {
    const filas = nuevasAsignaciones.map((o) => AS.enc.map((n) => (o[n] === undefined ? '' : o[n])));
    AS.hoja.getRange(AS.hoja.getLastRow() + 1, 1, filas.length, AS.enc.length).setValues(filas);
  }
  anotar('Última persona como asignación cerrada: ' + nuevasAsignaciones.length + ' registros sin asignación.');

  // 4) COMENTARIOS → MOVIMIENTOS (uno por registro; no se repite si ya está)
  LineasRepo.asegurarPestanaApp(LineasRepo.TAB.MOV);
  const MV = leer(LineasRepo.TAB.MOV);
  const yaCopiado = {};
  MV.filas.forEach((m) => {
    if (String(v(MV, m, 'ACCION')) === RETIRO_ACCION_COMENTARIO) yaCopiado[String(v(MV, m, 'ID EQUIPO') || v(MV, m, 'ID LINEA'))] = true;
  });
  const comentarios = [];
  filasViejas.forEach((f) => {
    const d = destinoPorViejo[String(v(vieja, f, 'ID')).trim()];
    const texto = String(v(vieja, f, 'COMENTARIOS') == null ? '' : v(vieja, f, 'COMENTARIOS')).trim();
    if (!d || !texto || yaCopiado[d.id]) return;
    comentarios.push({
      'ID': Ids.nuevo('MVT'), 'FECHA': '', 'ACCION': RETIRO_ACCION_COMENTARIO,
      'ID EQUIPO': d.hoja === 'EQUIPOS' ? d.id : '', 'ID LINEA': d.hoja === 'LINEAS' ? d.id : (lineaVigenteDeEquipo[d.id] || ''),
      'ID ASIGNACION': '', 'COMENTARIO': texto, 'TICKET': '', 'DOCUMENTO': '', 'CAMBIOS': '', 'QUIEN': '', 'ORIGEN': RETIRO_ORIGEN,
    });
  });
  if (aplicar && comentarios.length) {
    const filas = comentarios.map((o) => MV.enc.map((n) => (o[n] === undefined ? '' : o[n])));
    MV.hoja.getRange(MV.hoja.getLastRow() + 1, 1, filas.length, MV.enc.length).setValues(filas);
  }
  anotar('Comentarios de la hoja vieja a MOVIMIENTOS: ' + comentarios.length + '.');

  // 5) Las pestañas que citan al registro pasan al ID nuevo
  const nuevos = {}; // los IDs de las hojas nuevas (también los registros dados de alta en el sistema nuevo)
  [EQ, LI].forEach((t) => t.filas.forEach((f) => { const k = String(v(t, f, 'ID') || '').trim(); if (k) nuevos[k.toLowerCase()] = true; }));
  RETIRO_REFERENCIAS.forEach(([nombre, columna, columnaClave]) => {
    const t = leer(nombre);
    if (!t || t.c(columna) < 0) { anotar(nombre + ': no existe o no tiene ' + columna + '.'); return; }
    const c = { cambiadas: 0, yaNuevas: 0, sinRegistro: 0, vacias: 0 };
    t.filas.forEach((f) => {
      const actual = String(f[t.c(columna)] == null ? '' : f[t.c(columna)]).trim();
      if (!actual) { c.vacias++; return; }
      const nuevo = idNuevo[actual.toLowerCase()];
      if (!nuevo) { c[nuevos[actual.toLowerCase()] ? 'yaNuevas' : 'sinRegistro']++; return; }
      if (nuevo === actual) { c.yaNuevas++; return; }
      f[t.c(columna)] = nuevo;
      if (columnaClave && t.c(columnaClave) >= 0) {
        const clave = String(f[t.c(columnaClave)] || '');
        f[t.c(columnaClave)] = clave.split('|').map((x) => (x === actual ? nuevo : x)).join('|');
      }
      c.cambiadas++;
    });
    escribirColumnas(t, [columna].concat(columnaClave && t.c(columnaClave) >= 0 ? [columnaClave] : []));
    anotar(nombre + '.' + columna + ': ' + c.cambiadas + ' al ID nuevo · ' + c.yaNuevas + ' ya tenían el nuevo · ' + c.sinRegistro +
      ' sin registro (se quedan como están) · ' + c.vacias + ' vacías.');
  });

  // 6) Retirar: ocultar (no borrar) y dejar de leerla
  if (aplicar) {
    SpreadsheetApp.flush();
    vieja.hoja.hideSheet();
    PropertiesService.getScriptProperties().setProperty(LineasLectura.PROPIEDAD_RETIRADA, ahora.toISOString());
    LineasDatos.tocar(RETIRO_REFERENCIAS.map((r) => r[0]).concat(['EQUIPOS', 'LINEAS', 'ASIGNACIONES', LineasRepo.TAB.MOV]));
    LineasLectura.limpiarCaches();
    anotar('LINEAS TELEFONICAS oculta y retirada: el sistema ya no la lee.');
  } else {
    anotar('Revisión: no se escribió nada. Para aplicarlo, corre reestructuraRetiroAplicar.');
  }
  return reporte.join('\n');
}

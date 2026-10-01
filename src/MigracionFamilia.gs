/**
 * MigracionFamilia.gs
 *
 * Los cuatro pipelines del proyecto. Ver docs/ids-asignacion.md.
 *
 *   1. IDS — para las 24 hojas de un jalón.        ids1Ensayo      / ids2Escribir
 *   2. HOMOLOGAR VEHÍCULOS (8 hojas).              vehiculos1Ensayo / vehiculos2Escribir
 *   3. HOMOLOGAR LÍNEAS (10 hojas).                lineas1Ensayo    / lineas2Escribir
 *   4. HOMOLOGAR CAJA CHICA (3 hojas).             cajaChica1Ensayo / cajaChica2Escribir
 *
 * POR QUÉ ASÍ, y no un pipeline completo por familia: asignar los IDs es **una sola
 * decisión** —qué formato, qué prefijo, dónde queda la llave vieja— y se toma una vez para
 * todo el libro. La homologación, en cambio, es distinta en cada familia: Vehículos es casi
 * mecánico y Líneas tiene un problema de modelado (ver docs/lineas-homologacion.md). Así
 * cada familia se revisa y se aprueba por separado, sin volver a tocar los IDs.
 *
 * El orden importa: **el pipeline 1 va primero**, siempre. Los otros tres reescriben
 * referencias que apuntan al ID del padre, y para eso el padre ya tiene que tenerlo.
 *
 * NINGUNO GUARDA AVANCE, y es a propósito: todos los pasos son idempotentes. Si se corta por
 * tiempo, se vuelve a correr lo mismo y lo ya hecho se salta solo (asignarIds no repisa lo
 * que ya tiene ID, renombrarLlaveAnterior no crea una segunda columna). Guardar el avance
 * sería una máquina de estados más que puede quedar mal.
 */

/**
 * PIPELINE 1 — los IDs, para TODAS las hojas.
 *
 *   revisar    solo lee. Si hay problemas, se detiene ANTES de escribir nada.
 *   renombrar  la llave vieja de cada hoja pasa a llamarse igual en todas: "ID ANTERIOR".
 *              Va ANTES de los ids a propósito: si la columna se llamaba "ID" (ocho hojas
 *              de Líneas), al renombrarse la hoja queda SIN ID y el paso siguiente crea uno
 *              limpio, sin respaldar ni pisar nada.
 *   ids        llena la columna ID.
 *   mover      la pone al inicio, para que se vea al abrir la hoja.
 *   respaldo   quita las columnas ID ANTERIOR que sobren. Después de `renombrar` casi nunca
 *              sobra ninguna: la original SE VOLVIÓ el respaldo. Se deja como red para los
 *              libros que se migraron con la versión vieja del código.
 *   auditar    solo lee. Dice si todo cuadró.
 */
const PASOS_IDS = [
  { nombre: 'revisar', soloLee: true, marcaMala: 'PROBLEMAS (',
    corre: (o) => revisarAntesDeMigrar(o) },
  { nombre: 'renombrar', marcaMala: 'PROBLEMAS (',
    corre: (o) => renombrarLlaveAnterior(o) },
  { nombre: 'ids', corre: (o) => asignarIds(o) },
  { nombre: 'mover', corre: (o) => moverIdsAlInicio(o) },
  { nombre: 'respaldo', corre: (o) => limpiarRespaldoRedundante(o) },
  { nombre: 'auditar', soloLee: true, marcaMala: 'FALLAS (',
    corre: (o) => auditarIds(o) },
];

/**
 * PIPELINES 2, 3 y 4 — la homologación de una familia. Corren DESPUÉS del pipeline 1.
 *
 *   referencias  reescribe lo que apuntaba al ID viejo del padre (MIGRACION_REFERENCIAS),
 *                solo las hojas de esta familia.
 *   auditar      solo lee, solo esta familia.
 *
 * PENDIENTE: aquí van a entrar las limpiezas propias de cada familia, que hoy están medidas
 * pero no automatizadas —los centinelas de VEHICULOS (1,124 celdas en 13 columnas), las 15
 * columnas vacías de LINEAS TELEFONICAS, su encabezado `#REF!`—. Están en
 * docs/relaciones.md y docs/lineas-homologacion.md.
 */
const PASOS_HOMOLOGA = [
  { nombre: 'referencias', corre: (o) => reescribirReferencias(o) },
  { nombre: 'auditar', soloLee: true, marcaMala: 'FALLAS (',
    corre: (o) => auditarIds(o) },
];

/** Se detiene antes del límite de 6 minutos de Apps Script. */
const FAM_LIMITE_MS = 4.5 * 60 * 1000;


// =========================================================== funciones para el editor

/** PIPELINE 1, ensayo — los IDs de las 24 hojas. No escribe nada. Empieza por aquí. */
function ids1Ensayo() {
  return correrIdsTodo();
}

/** PIPELINE 1, de verdad — ESCRIBE los IDs de las 24 hojas. */
function ids2Escribir() {
  return correrIdsTodo({ escribir: true });
}

/** PIPELINE 2, ensayo — homologa VEHÍCULOS (8 hojas). Requiere el pipeline 1 ya corrido. */
function vehiculos1Ensayo() {
  return correrFamilia('vehiculos');
}

/** PIPELINE 2, de verdad. */
function vehiculos2Escribir() {
  return correrFamilia('vehiculos', { escribir: true });
}

/** PIPELINE 3, ensayo — LÍNEAS (10 hojas). Lee docs/lineas-homologacion.md primero. */
function lineas1Ensayo() {
  return correrFamilia('lineas');
}

/** PIPELINE 3, de verdad. */
function lineas2Escribir() {
  return correrFamilia('lineas', { escribir: true });
}

/** PIPELINE 4, ensayo — CAJA CHICA (3 hojas). */
function cajaChica1Ensayo() {
  return correrFamilia('cajachica');
}

/** PIPELINE 4, de verdad. */
function cajaChica2Escribir() {
  return correrFamilia('cajachica', { escribir: true });
}

/** Los cuatro pipelines, qué hojas toca cada uno y en qué libro. Solo lee. */
function pipelinesEstado() {
  const lineas = [
    'LOS CUATRO PIPELINES — el libro apuntado es ' + Config.SPREADSHEET_IDS.VEHICULOS(),
    '',
    '  1. IDS, todas las hojas (' + Entidades.migrables().length + ')',
    '       ids1Ensayo  /  ids2Escribir',
    '       pasos: ' + PASOS_IDS.map((p) => p.nombre).join(' → '),
    '',
  ];
  const atajos = { vehiculos: 'vehiculos', lineas: 'lineas', cajachica: 'cajaChica' };
  let n = 2;
  Entidades.familias().forEach((f) => {
    const hojas = Entidades.deFamilia(f);
    const atajo = atajos[f];
    lineas.push('  ' + n + '. HOMOLOGAR ' + f.toUpperCase() + ' (' + hojas.length + ' hojas)');
    lineas.push(atajo ? '       ' + atajo + '1Ensayo  /  ' + atajo + '2Escribir'
                      : "       correrFamilia('" + f + "')");
    lineas.push('       pasos: ' + PASOS_HOMOLOGA.map((p) => p.nombre).join(' → '));
    hojas.forEach((h) => lineas.push('       · ' + h.hoja + ' [' + h.prefijo + ']'));
    lineas.push('');
    n++;
  });
  lineas.push('El pipeline 1 va PRIMERO: los otros reescriben referencias al ID del padre.');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}


// ==================================================================== lo de adentro

/**
 * PIPELINE 1: los IDs de todas las hojas migrables.
 *
 * @param {{escribir: boolean}} opciones  escribir=false (default) → nadie escribe
 * @return {string} el reporte de los seis pasos
 */
function correrIdsTodo(opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  const hojas = Entidades.migrables();
  return correrPasos_({
    titulo: 'PIPELINE 1 — IDS DE TODAS LAS HOJAS',
    pasos: PASOS_IDS,
    // familia: null => cada paso recorre todas las hojas
    opcionesPaso: {},
    hojas: hojas,
    escribir: cfg.escribir,
    etiquetaBitacora: 'pipelineIds',
    siguiente: 'Ya con los IDs puestos, sigue la homologación por familia: ' +
      'vehiculos1Ensayo, lineas1Ensayo, cajaChica1Ensayo.',
  });
}

/**
 * PIPELINES 2, 3 y 4: la homologación de una familia.
 *
 * @param {string} familia   'vehiculos' | 'lineas' | 'cajachica' | 'otros'
 * @param {{escribir: boolean}} opciones
 * @return {string} el reporte
 */
function correrFamilia(familia, opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  const f = String(familia || '').trim().toLowerCase();
  const conocidas = Entidades.familias();
  if (conocidas.indexOf(f) === -1) {
    throw new Error('No conozco la familia "' + familia + '". Las que hay: ' +
      conocidas.join(', ') + '. Corre pipelinesEstado para verlas con sus hojas.');
  }
  const hojas = Entidades.deFamilia(f);
  if (!hojas.length) {
    throw new Error('La familia "' + f + '" no tiene hojas migrables.');
  }
  return correrPasos_({
    titulo: 'HOMOLOGACIÓN DE LA FAMILIA "' + f.toUpperCase() + '"',
    pasos: PASOS_HOMOLOGA,
    opcionesPaso: { familia: f },
    hojas: hojas,
    escribir: cfg.escribir,
    etiquetaBitacora: 'homologarFamilia:' + f,
    siguiente: 'Si algo quedó huérfano, está en el reporte de referencias de arriba.',
  });
}

/**
 * Las lineas de un paso que vale la pena repetir en el reporte final: los totales, los
 * problemas y las fallas. El detalle hoja por hoja ya quedo en el registro de ejecucion.
 */
function resumirPaso_(texto) {
  const lineas = String(texto).split('\n');
  const utiles = [];
  let enLista = false;
  lineas.forEach((l) => {
    const t = l.trim();
    if (!t) return;
    if (/^(PROBLEMAS|FALLAS)\s*\(/.test(t)) { utiles.push('  ' + t); enLista = true; return; }
    if (enLista && t.indexOf('- ') === 0) { utiles.push('    ' + t); return; }
    enLista = false;
    // los totales de cada paso: empiezan con un numero, o lo dicen sin sangria
    if (/^\d/.test(t) || /^(Sin problemas|Todo cuadra)/.test(t) ||
        /(columnas (renombradas|por renombrar)|hojas (procesadas|por mover|con respaldo))/.test(t)) {
      utiles.push('  ' + t);
    }
  });
  return utiles.length ? utiles.join('\n') : '  (sin nada que resumir; el detalle esta en el registro)';
}

/**
 * El motor que los cuatro comparten: corre una lista de pasos, con el freno de tiempo, la
 * regla de que un paso de solo lectura nunca escribe, y la de que en ensayo no se detiene.
 */
function correrPasos_(p) {
  const arranque = Date.now();
  const cabeza = [
    p.titulo + '  —  ' + (p.escribir ? 'ESCRIBIENDO' : 'ENSAYO, no escribe nada'),
    '  ' + p.hojas.length + ' hojas.  El detalle de cada paso está arriba, en el registro ' +
      'de ejecución; aquí va solo el resumen.',
    '',
  ];
  const partes = [];
  const noEnsayables = [];
  let corridos = 0, corte = '', detenido = '';

  for (let i = 0; i < p.pasos.length; i++) {
    const paso = p.pasos[i];

    if (Date.now() - arranque > FAM_LIMITE_MS) {
      corte = paso.nombre;
      break;
    }

    const encabezado = '━━━ paso ' + (i + 1) + '/' + p.pasos.length + ': ' + paso.nombre +
      (paso.soloLee ? '  (solo lee)' : '') + ' ━━━';
    let salida;
    try {
      salida = paso.corre(Object.assign({}, p.opcionesPaso,
        { escribir: p.escribir && !paso.soloLee }));
    } catch (err) {
      // Escribiendo, un error es un error y se para todo.
      if (p.escribir) {
        partes.push(encabezado, '  TRONÓ: ' + err.message, '');
        detenido = paso.nombre;
        break;
      }
      // En ENSAYO no. Varios pasos leen lo que ESCRIBE un paso anterior, y en ensayo aquél
      // no escribió nada, así que "todavía no tiene columna ID" es la respuesta correcta,
      // no una caída. Se anota y se sigue: en un ensayo no hay nada en riesgo y sí
      // información que juntar. Si la hoja YA venía migrada, el paso sí corre.
      //
      // Pero esa disculpa solo vale si ANTES hay un paso que escriba. Si no lo hay, nada de
      // lo que lee depende del ensayo, y el error es un error: así se escondió el 01/10/2026
      // que `referencias` de Líneas buscaba "ID_Accesorio" cuando ya se llamaba "ID ANTERIOR".
      const antesEscribe = p.pasos.slice(0, i).some((x) => !x.soloLee);
      if (!antesEscribe) {
        partes.push(encabezado, '  TRONÓ: ' + err.message,
          '  (no hay paso anterior que escriba, así que esto NO es por ser ensayo)', '');
        detenido = paso.nombre;
        continue;
      }
      noEnsayables.push(paso.nombre);
      partes.push(encabezado,
        '  NO SE PUDO ENSAYAR: ' + err.message,
        '  (normal en ensayo: este paso lee lo que escribe uno anterior)',
        '');
      continue;
    }
    // Solo el RESUMEN de cada paso, no su texto completo: cada paso ya se escribio solo
    // en el registro de ejecucion, y concatenarlos rebasaba el limite de Apps Script
    // ("Logging output too large. Truncating output."), que cortaba justo el resumen final
    // —lo unico que de verdad hacia falta leer—.
    partes.push(encabezado, resumirPaso_(String(salida)), '');
    corridos++;

    if (paso.marcaMala && String(salida).indexOf(paso.marcaMala) !== -1) {
      if (p.escribir) {
        detenido = paso.nombre;
        break;
      }
      partes.push('(ese paso reportó cosas por revisar; en ensayo seguimos para ver todo)', '');
    }
  }

  const pie = ['━━━ resumen ━━━', ''];
  pie.push('  pasos corridos: ' + corridos + ' de ' + p.pasos.length);
  if (noEnsayables.length) {
    pie.push('  no ensayables todavía: ' + noEnsayables.join(', ') +
      '   (leen lo que escribe un paso anterior)');
  }
  if (detenido) {
    pie.push('');
    pie.push('  ' + (p.escribir ? 'SE DETUVO' : 'FALLÓ') + ' en "' + detenido + '".' +
      (p.escribir ? ' No se corrieron los pasos siguientes, a propósito.' : ''));
    pie.push('  Revisa ese paso arriba, arregla lo que diga, y vuelve a correr.');
  } else if (corte) {
    pie.push('');
    pie.push('  SE DETUVO POR TIEMPO antes de "' + corte + '".');
    pie.push('  Vuelve a correr lo mismo: los pasos ya hechos se saltan solos.');
  } else if (!p.escribir) {
    pie.push('');
    if (noEnsayables.length) {
      pie.push('  El ensayo llegó hasta donde se puede SIN escribir. Los pasos ' +
        noEnsayables.join(', ') + ' se validan en la corrida de verdad. No es un error.');
      pie.push('');
    }
    pie.push('  Si lo de arriba cuadra, corre la versión que escribe.');
  } else {
    pie.push('');
    pie.push('  LISTO: corrieron los ' + p.pasos.length + ' pasos. Lee la auditoría de arriba.');
    if (p.siguiente) pie.push('  ' + p.siguiente);
  }

  const texto = cabeza.concat(partes, pie).join('\n');
  Logger.log(texto);
  try {
    pipeLog_(Config.SPREADSHEET_IDS.VEHICULOS(), p.etiquetaBitacora,
      p.escribir ? 'ESCRIBIR' : 'ENSAYO',
      detenido ? 'DETENIDO EN ' + detenido : (corte ? 'CORTADO POR TIEMPO' : 'OK'),
      corridos + '/' + p.pasos.length + ' pasos, ' + p.hojas.length + ' hojas');
  } catch (err) {
    // La bitácora no puede tumbar la corrida
  }
  return texto;
}

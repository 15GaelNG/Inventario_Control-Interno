/**
 * MigracionFamilia.gs
 *
 * Los cinco pipelines del proyecto: todo lo que se corre para pasar del libro viejo de
 * producción al que usa el sistema nuevo. Ver docs/ids-asignacion.md.
 *
 *   1. IDS — para las hojas migrables de un jalón.   ids1Ensayo          / ids2Escribir
 *   2. HOMOLOGAR VEHÍCULOS.                          vehiculos1Ensayo    / vehiculos2Escribir
 *   3. HOMOLOGAR LÍNEAS.                             lineas1Ensayo       / lineas2Escribir
 *   4. HOMOLOGAR CAJA CHICA.                         cajaChica1Ensayo    / cajaChica2Escribir
 *   5. CAPITAL HUMANO (personas y responsables).     capitalHumano1Ensayo / capitalHumano2Escribir
 *
 * El 5 va al final: liga a los responsables de Vehículos, Caja Chica y Líneas, así que esas
 * hojas ya tienen que estar homologadas. Necesita la lista de Capital Humano pegada en
 * COLABORADORES ACTUALIZADO (sin columnas sensibles).
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
 *   nombres      homologa los nombres de columna de esta familia (MIGRACION_NOMBRES): el
 *                mismo dato con el mismo nombre en todas las hojas. Va primero porque los
 *                pasos siguientes ya buscan las columnas por su nombre nuevo.
 *   referencias  reescribe lo que apuntaba al ID viejo del padre (MIGRACION_REFERENCIAS),
 *                solo las hojas de esta familia.
 *   sincronizar  pone al día las copias tipo CACHÉ de esta familia con su dueña (lo mismo
 *                que «Actualizar» en Administración > Salud): Sensores, Hologramas y
 *                Verificaciones con VEHICULOS, y VEHICULOS con Sensores. Las BITÁCORAS nunca
 *                se tocan. Va después de referencias porque empareja por la llave foránea
 *                que ese paso acaba de escribir.
 *   auditar      solo lee, solo esta familia.
 *
 * PENDIENTE: aquí van a entrar las limpiezas propias de cada familia, que hoy están medidas
 * pero no automatizadas —los centinelas de VEHICULOS (1,124 celdas en 13 columnas), las 15
 * columnas vacías de LINEAS TELEFONICAS, su encabezado `#REF!`—. Están en
 * docs/relaciones.md y docs/lineas-homologacion.md.
 */
const PASOS_HOMOLOGA = [
  { nombre: 'nombres', marcaMala: 'PROBLEMAS (', corre: (o) => homologarNombres(o) },
  { nombre: 'referencias', corre: (o) => reescribirReferencias(o) },
  { nombre: 'sincronizar', marcaMala: 'PROBLEMAS (', corre: (o) => sincronizarCopias(o) },
  { nombre: 'auditar', soloLee: true, marcaMala: 'FALLAS (',
    corre: (o) => auditarIds(o) },
];

/**
 * PIPELINE 5 — Capital Humano. Corre al final, sobre hojas ya homologadas.
 *
 *   personas  arma PERSONAS a partir de la lista de CH (CapitalHumano.identificar): un
 *             renglón por empleo con su ID PERSONA. Un ID dado nunca cambia.
 *   ligar     calcula el ID PERSONA de cada responsable de Vehículos, Caja Chica y Líneas
 *             (CapitalHumano.revisarLigas). Lo mismo que «Actualizar» en Salud > Capital
 *             Humano. En el primer ensayo no se puede probar: lee la PERSONAS que escribe el
 *             paso anterior.
 *
 * Sin `auditar`: sus dos hojas no llevan columna ID que auditar (la lista de CH es externa y
 * PERSONAS se identifica por empleo). Lo que no cuadra lo dicen los propios pasos.
 */
const PASOS_CAPITAL_HUMANO = [
  { nombre: 'personas', marcaMala: 'PROBLEMAS (', corre: (o) => identificarPersonas(o) },
  { nombre: 'ligar', marcaMala: 'PROBLEMAS (', corre: (o) => ligarPersonas(o) },
];

/** Los pasos de cada familia: Capital Humano tiene los suyos; las demás, la homologación. */
const pasosDe_ = (familia) => (familia === 'capitalhumano' ? PASOS_CAPITAL_HUMANO : PASOS_HOMOLOGA);

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

/**
 * PIPELINE 5, ensayo — CAPITAL HUMANO: quién es quién y de quién es cada responsable.
 * Requiere los pipelines 2 a 4 ya corridos y la lista de CH pegada. No escribe nada.
 */
function capitalHumano1Ensayo() {
  return correrFamilia('capitalhumano');
}

/** PIPELINE 5, de verdad. Repetirlo cada vez que se pegue una versión nueva de la lista de CH. */
function capitalHumano2Escribir() {
  return correrFamilia('capitalhumano', { escribir: true });
}

/** Los cinco pipelines, qué hojas toca cada uno y en qué libro. Solo lee. */
function pipelinesEstado() {
  const lineas = [
    'LOS CINCO PIPELINES — el libro apuntado es ' + Config.SPREADSHEET_IDS.VEHICULOS(),
    '',
    '  1. IDS, todas las hojas (' + Entidades.migrables().length + ')',
    '       ids1Ensayo  /  ids2Escribir',
    '       pasos: ' + PASOS_IDS.map((p) => p.nombre).join(' → '),
    '',
  ];
  const atajos = { vehiculos: 'vehiculos', lineas: 'lineas', cajachica: 'cajaChica', capitalhumano: 'capitalHumano' };
  let n = 2;
  // Capital Humano al final: liga a los responsables de las familias ya homologadas
  const orden = Entidades.familias().filter((f) => f !== 'capitalhumano').concat(['capitalhumano']);
  orden.filter((f) => Entidades.familias().indexOf(f) !== -1).forEach((f) => {
    const hojas = hojasDeFamilia_(f);
    const atajo = atajos[f];
    lineas.push('  ' + n + '. ' + (f === 'capitalhumano' ? '' : 'HOMOLOGAR ') + f.toUpperCase() + ' (' + hojas.length + ' hojas)');
    lineas.push(atajo ? '       ' + atajo + '1Ensayo  /  ' + atajo + '2Escribir'
                      : "       correrFamilia('" + f + "')");
    lineas.push('       pasos: ' + pasosDe_(f).map((p) => p.nombre).join(' → '));
    hojas.forEach((h) => lineas.push('       · ' + h.hoja + ' [' + h.prefijo + ']'));
    lineas.push('');
    n++;
  });
  lineas.push('El pipeline 1 va PRIMERO: los otros reescriben referencias al ID del padre.');
  lineas.push('Capital Humano va AL FINAL: liga a los responsables de las hojas ya homologadas.');
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
 * Las hojas de una familia. Las migrables, si tiene; si no —Capital Humano, cuya lista es
 * externa y cuya PERSONAS es del sistema nuevo—, todas las suyas del catálogo.
 */
function hojasDeFamilia_(familia) {
  const migrables = Entidades.deFamilia(familia);
  return migrables.length ? migrables : Entidades.todas().filter((e) => e.familia === familia);
}

/**
 * PIPELINES 2 a 5: la homologación de una familia (o Capital Humano, con sus propios pasos).
 *
 * @param {string} familia   'vehiculos' | 'lineas' | 'cajachica' | 'capitalhumano' | 'otros'
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
  const hojas = hojasDeFamilia_(f);
  if (!hojas.length) {
    throw new Error('La familia "' + f + '" no tiene hojas en el catálogo.');
  }
  const esCapitalHumano = f === 'capitalhumano';
  return correrPasos_({
    titulo: esCapitalHumano ? 'CAPITAL HUMANO: PERSONAS Y RESPONSABLES' : 'HOMOLOGACIÓN DE LA FAMILIA "' + f.toUpperCase() + '"',
    pasos: pasosDe_(f),
    opcionesPaso: { familia: f },
    hojas: hojas,
    escribir: cfg.escribir,
    etiquetaBitacora: 'homologarFamilia:' + f,
    siguiente: esCapitalHumano
      ? 'Los responsables que no se pudieron ligar están en Administración > Salud > Capital Humano.'
      : 'Si algo quedó huérfano, está en el reporte de referencias de arriba.',
  });
}

/**
 * LO QUE QUEDA EN APPS SCRIPT después de la migración de Python (tools/migracion/migrar.py):
 * la capa de consistencia de la app, que vive aquí porque es la misma que usa la app todos
 * los días. Un clic en el editor, al terminar migrar.py. ESCRIBE.
 *
 *   sincronizar  vehiculos, lineas y cajachica: las copias tipo caché con su dueña
 *   personas     PERSONAS a partir de la lista de Capital Humano
 *   ligar        el ID PERSONA de cada responsable
 *
 * Se detiene en el primer paso con PROBLEMAS, como cualquier pipeline. Mover `sincronizar` al
 * final no cambia nada: solo copia atributos, y empareja por la llave foránea que las
 * referencias (Python) ya escribieron.
 */
function migracionFinalApps() {
  const sincroniza = (f) => ({ nombre: 'sincronizar ' + f, marcaMala: 'PROBLEMAS (',
    corre: (o) => sincronizarCopias(Object.assign({}, o, { familia: f })) });
  const familias = ['vehiculos', 'lineas', 'cajachica'];
  return correrPasos_({
    titulo: 'LO QUE QUEDA EN APPS SCRIPT: SINCRONIZAR Y CAPITAL HUMANO',
    pasos: familias.map(sincroniza).concat(PASOS_CAPITAL_HUMANO),
    opcionesPaso: {},
    hojas: familias.concat(['capitalhumano']).reduce((t, f) => t.concat(hojasDeFamilia_(f)), []),
    escribir: true,
    etiquetaBitacora: 'migracionFinalApps',
    siguiente: 'La migración terminó. Revisa Administración > Salud.',
  });
}

// ====================================================== pasos de sincronización

/**
 * El libro donde trabajan Relaciones y CapitalHumano es el CONFIGURADO (SS_ID_VEHICULOS):
 * no reciben otro. Un pipeline apuntado a un libro distinto (opciones.spreadsheetId, el
 * laboratorio) escribiría en el equivocado, así que se niega. Pasa además por
 * migracionSs_, que es la guarda de producción de todos los pasos.
 */
function libroConfigurado_(cfg) {
  const ssId = migracionSs_(cfg);
  if (ssId !== Config.SPREADSHEET_IDS.VEHICULOS()) {
    throw new Error('Este paso solo trabaja sobre el libro configurado (SS_ID_VEHICULOS = ' +
      Config.SPREADSHEET_IDS.VEHICULOS() + ') y el pipeline apunta a ' + ssId + '.');
  }
  return ssId;
}

/** Las copias tipo CACHÉ de una familia en el MAPA de Relaciones (las bitácoras no se sincronizan). */
function copiasCacheDe_(familia) {
  return Relaciones.describir().duenos
    .reduce((todas, d) => todas.concat(d.copias), [])
    .filter((c) => c.tipo !== 'bitacora' && Entidades.existe(c.nombre) && Entidades.de(c.nombre).familia === familia)
    .map((c) => c.nombre);
}

/**
 * Paso `sincronizar`: pone al día las copias tipo caché de la familia con su dueña
 * (Relaciones.revisar con corregir). Ensayando no escribe ni anota en LOG_RELACIONES;
 * escribiendo, cada celda corregida queda en LOG_RELACIONES con QUIEN = pipeline.
 * Una hoja que no se pudo revisar es un PROBLEMA: escribiendo, detiene el pipeline.
 */
function sincronizarCopias(opciones) {
  const cfg = Object.assign({ escribir: false, familia: null }, opciones || {});
  const ssId = libroConfigurado_(cfg);
  const lineas = [(cfg.escribir ? 'SINCRONIZANDO' : 'ENSAYO (no escribe nada)') + ' — ' + ssId, ''];
  const copias = copiasCacheDe_(cfg.familia);
  if (!copias.length) {
    lineas.push('0 copias que se mantengan al día en esta familia: todas son bitácora. Nada que sincronizar.');
    return lineas.join('\n');
  }
  const r = Relaciones.revisar({ corregir: cfg.escribir, hojas: copias, log: cfg.escribir, quien: 'pipeline' });
  const problemas = [];
  let total = 0;
  copias.forEach((nombre) => {
    const x = r[nombre];
    if (!x) return;
    if (x.error) { problemas.push(nombre + ': ' + x.error); return; }
    total += x.diferencias;
    lineas.push('  ' + nombre + ': ' + x.diferencias + ' celdas ' + (cfg.escribir ? 'puestas al día' : 'por poner al día') +
      ' · ' + x.huerfanos + ' sin dueño · ' + (x.centinelasOmitidos + x.vaciosOmitidos + x.clavesDuplicadasOmitidas) +
      ' omitidas a propósito (relleno, vacío o llave repetida en la dueña)');
  });
  lineas.push('', total + ' celdas ' + (cfg.escribir ? 'sincronizadas' : 'por sincronizar') + ' en ' + copias.length + ' hojas');
  if (problemas.length) {
    lineas.push('', 'PROBLEMAS (' + problemas.length + '):');
    problemas.forEach((p) => lineas.push('  - ' + p));
  }
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

/** Paso `personas`: arma PERSONAS a partir de la lista de Capital Humano. */
function identificarPersonas(opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  libroConfigurado_(cfg);
  return CapitalHumano.identificar({ escribir: cfg.escribir });
}

/**
 * Paso `ligar`: el ID PERSONA de cada responsable (CapitalHumano.revisarLigas). Lo que no se
 * puede ligar no es un problema del pipeline —es dato que corregir a mano, y lo enseña
 * Salud—; una hoja que no se pudo revisar sí lo es.
 */
function ligarPersonas(opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  const ssId = libroConfigurado_(cfg);
  const lineas = [(cfg.escribir ? 'LIGANDO RESPONSABLES' : 'ENSAYO (no escribe nada)') + ' — ' + ssId, ''];
  const r = CapitalHumano.revisarLigas({ escribir: cfg.escribir, quien: 'pipeline' });
  const problemas = [];
  let total = 0;
  Object.keys(r).forEach((nombre) => {
    const x = r[nombre];
    if (x.error) { problemas.push(nombre + ': ' + x.error); return; }
    total += x.diferencias;
    lineas.push('  ' + nombre + ': ' + x.diferencias + (cfg.escribir ? ' ligados' : ' por ligar') +
      ' · ' + x.sinDuenoEsperado + ' no son personas (normal) · ' + (x.huerfanos + x.clavesDuplicadasOmitidas) + ' a corregir a mano');
  });
  lineas.push('', total + ' responsables ' + (cfg.escribir ? 'ligados a su persona' : 'por ligar a su persona'));
  if (problemas.length) {
    lineas.push('', 'PROBLEMAS (' + problemas.length + '):');
    problemas.forEach((p) => lineas.push('  - ' + p));
  }
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
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
    // AVISOS también: no detienen nada, pero son lo que hay que leer (ej. columnas sensibles)
    if (/^(PROBLEMAS|FALLAS|AVISOS)\s*\(/.test(t)) { utiles.push('  ' + t); enLista = true; return; }
    if (enLista && t.indexOf('- ') === 0) { utiles.push('    ' + t); return; }
    enLista = false;
    // los totales de cada paso: empiezan con un numero, o lo dicen sin sangria
    if (/^\d/.test(t) || /^(Sin problemas|Todo cuadra)/.test(t) ||
        /(columnas (renombradas|por renombrar)|hojas (procesadas|por mover|con respaldo))/.test(t) ||
        // las de referencias: una por columna hija, y si quedaron huérfanas
        / -> .+: (\d+ cambiadas|YA MIGRADA)/.test(t) || /^HUÉRFANAS/.test(t)) {
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

/**
 * MigracionFamilia.gs
 *
 * Corre TODA la homologación de una familia de un jalón, en vez de ir función por función.
 * Ver docs/ids-asignacion.md.
 *
 * ¿Por qué por familia y no todo junto? Porque Vehículos y Líneas son problemas de tamaños
 * muy distintos (ver docs/lineas-homologacion.md), y conviene dejar Vehículos terminado y
 * probado antes de tocar Líneas. La familia de cada hoja vive en `src/config/Entidades.gs`.
 *
 * LOS SEIS PASOS, en este orden y por una razón:
 *
 *   1. revisar       — solo lee. Si hay problemas, se detiene ANTES de escribir nada.
 *   2. ids           — llena la columna ID de cada hoja de la familia.
 *   3. referencias   — reescribe lo que apuntaba al ID viejo del padre (MIGRACION_REFERENCIAS).
 *                      Va DESPUÉS de los ids: necesita que el padre ya tenga el suyo.
 *   4. mover         — pone la columna ID al inicio, para que se vea al abrir la hoja.
 *   5. respaldo      — quita las columnas ID ANTERIOR que sobran.
 *   6. auditar       — solo lee. Dice si todo cuadró.
 *
 * NO GUARDA AVANCE, y es a propósito: los seis pasos son idempotentes. Si se corta por
 * tiempo, se vuelve a correr lo mismo y los pasos ya hechos se saltan solos (asignarIds no
 * repisa lo que ya tiene ID, limpiarRespaldo no borra dos veces). Guardar el avance sería
 * más maquinaria que la que ahorra, y una máquina de estados más que puede quedar mal.
 */

/** Los pasos, en orden. `soloLee` nunca recibe escribir:true. */
const FAM_PASOS = [
  { nombre: 'revisar', soloLee: true, marcaMala: 'PROBLEMAS (',
    corre: (o) => revisarAntesDeMigrar(o) },
  { nombre: 'ids', corre: (o) => asignarIds(o) },
  { nombre: 'referencias', corre: (o) => reescribirReferencias(o) },
  { nombre: 'mover', corre: (o) => moverIdsAlInicio(o) },
  { nombre: 'respaldo', corre: (o) => limpiarRespaldoRedundante(o) },
  { nombre: 'auditar', soloLee: true, marcaMala: 'FALLAS (',
    corre: (o) => auditarIds(o) },
];

/** Se detiene antes del límite de 6 minutos de Apps Script. */
const FAM_LIMITE_MS = 4.5 * 60 * 1000;


// ------------------------------------------------------------- funciones para el editor

/** VEHÍCULOS, ensayo — no escribe nada. Empieza por aquí. */
function vehiculos1Ensayo() {
  return correrFamilia('vehiculos');
}

/** VEHÍCULOS, de verdad — escribe. Si se corta por tiempo, vuélvela a correr. */
function vehiculos2Escribir() {
  return correrFamilia('vehiculos', { escribir: true });
}

/** LÍNEAS, ensayo. Lee docs/lineas-homologacion.md antes de escribir aquí. */
function lineas1Ensayo() {
  return correrFamilia('lineas');
}

/** LÍNEAS, de verdad. */
function lineas2Escribir() {
  return correrFamilia('lineas', { escribir: true });
}

/** CAJA CHICA, ensayo. */
function cajaChica1Ensayo() {
  return correrFamilia('cajachica');
}

/** CAJA CHICA, de verdad. */
function cajaChica2Escribir() {
  return correrFamilia('cajachica', { escribir: true });
}

/** Qué hojas tiene cada familia, y en qué libro se va a correr. Solo lee. */
function familiasEstado() {
  const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
  const lineas = ['FAMILIAS — el libro apuntado es ' + ssId, ''];
  Entidades.familias().forEach((f) => {
    const hojas = Entidades.deFamilia(f);
    lineas.push('  ' + f + '  (' + hojas.length + ' hojas)');
    hojas.forEach((h) => lineas.push('      ' + h.hoja + ' [' + h.prefijo + ']'));
    lineas.push('');
  });
  lineas.push('Para correr una: vehiculos1Ensayo, lineas1Ensayo, cajaChica1Ensayo.');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}


// ------------------------------------------------------------------------ lo de adentro

/**
 * Corre los seis pasos sobre una familia.
 *
 * @param {string} familia   'vehiculos' | 'lineas' | 'cajachica' | 'otros'
 * @param {{escribir: boolean}} opciones  escribir=false (default) → nadie escribe
 * @return {string} el reporte de los seis pasos, uno tras otro
 */
function correrFamilia(familia, opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  const f = String(familia || '').trim().toLowerCase();
  const conocidas = Entidades.familias();
  if (conocidas.indexOf(f) === -1) {
    throw new Error('No conozco la familia "' + familia + '". Las que hay: ' +
      conocidas.join(', ') + '. Corre familiasEstado para verlas con sus hojas.');
  }
  const hojas = Entidades.deFamilia(f);
  if (!hojas.length) {
    throw new Error('La familia "' + f + '" no tiene hojas migrables.');
  }

  const arranque = Date.now();
  const cabeza = [
    'HOMOLOGACIÓN DE LA FAMILIA "' + f.toUpperCase() + '"  —  ' +
      (cfg.escribir ? 'ESCRIBIENDO' : 'ENSAYO, no escribe nada'),
    '',
    '  ' + hojas.length + ' hojas: ' + hojas.map((h) => h.hoja).join(', '),
    '',
  ];
  const partes = [];
  let corridos = 0, corte = '', detenido = '';

  for (let i = 0; i < FAM_PASOS.length; i++) {
    const paso = FAM_PASOS[i];

    if (Date.now() - arranque > FAM_LIMITE_MS) {
      corte = paso.nombre;
      break;
    }

    const encabezado = '━━━ paso ' + (i + 1) + '/' + FAM_PASOS.length + ': ' + paso.nombre +
      (paso.soloLee ? '  (solo lee)' : '') + ' ━━━';
    let salida;
    try {
      salida = paso.corre({ familia: f, escribir: cfg.escribir && !paso.soloLee });
    } catch (err) {
      partes.push(encabezado, '', 'TRONÓ: ' + err.message, '');
      detenido = paso.nombre;
      break;
    }
    partes.push(encabezado, '', String(salida), '');
    corridos++;

    // El paso dice que algo no cuadra. En ensayo se siguen corriendo los demás para ver
    // el panorama completo; escribiendo, se para aquí y no se toca nada más.
    if (paso.marcaMala && String(salida).indexOf(paso.marcaMala) !== -1) {
      if (cfg.escribir) {
        detenido = paso.nombre;
        break;
      }
      partes.push('(ese paso reportó cosas por revisar; en ensayo seguimos para ver todo)', '');
    }
  }

  const pie = ['━━━ resumen ━━━', ''];
  pie.push('  pasos corridos: ' + corridos + ' de ' + FAM_PASOS.length);
  if (detenido) {
    pie.push('');
    pie.push('  SE DETUVO en "' + detenido + '".' +
      (cfg.escribir ? ' No se corrieron los pasos siguientes, a propósito.' : ''));
    pie.push('  Revisa ese paso arriba, arregla lo que diga, y vuelve a correr.');
  } else if (corte) {
    pie.push('');
    pie.push('  SE DETUVO POR TIEMPO antes de "' + corte + '".');
    pie.push('  Vuelve a correr lo mismo: los pasos ya hechos se saltan solos.');
  } else if (!cfg.escribir) {
    pie.push('');
    pie.push('  Si el ensayo cuadra, corre la versión que escribe.');
  } else {
    pie.push('');
    pie.push('  LISTO: los seis pasos corrieron. Lee la auditoría de arriba.');
  }

  const texto = cabeza.concat(partes, pie).join('\n');
  Logger.log(texto);
  try {
    pipeLog_(Config.SPREADSHEET_IDS.VEHICULOS(), 'homologarFamilia:' + f,
      cfg.escribir ? 'ESCRIBIR' : 'ENSAYO',
      detenido ? 'DETENIDO EN ' + detenido : (corte ? 'CORTADO POR TIEMPO' : 'OK'),
      corridos + '/' + FAM_PASOS.length + ' pasos, ' + hojas.length + ' hojas');
  } catch (err) {
    // La bitácora no puede tumbar la corrida
  }
  return texto;
}

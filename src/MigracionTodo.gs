/**
 * MigracionTodo.gs
 *
 * UN SOLO BOTÓN para el ensayo completo en el laboratorio: `migracionTodoLab`.
 *
 *   1. replanchar       LAB queda como producción (MigracionReplanche.gs)
 *   2. quitar sello     el de LAB, y solo ése: recién replanchado no tiene referencias
 *   3. ids              pipeline 1
 *   4. vehiculos        pipeline 2
 *   5. lineas           pipeline 3
 *   6. cajachica        pipeline 4
 *   7. capitalhumano    pipeline 5, al final
 *
 * Cada etapa es la función de siempre en modo ESCRIBIR, sin cambios: esto solo las
 * encadena. La familia "otros" (UBER, TICKETS, COLABORADORES) no tiene nombres ni
 * referencias que homologar; sus IDs ya los pone el pipeline 1.
 *
 * EL LÍMITE DE 6 MINUTOS. Una ejecución corre una etapa —o varias, si son rápidas— y, si
 * falta algo, se programa un activador que sigue en un minuto. Una etapa cortada por tiempo
 * se repite: todas son idempotentes. Una que reporta PROBLEMAS o FALLAS, o que truena,
 * DETIENE todo y no programa nada más.
 *
 * Si Apps Script mata la ejecución a la mitad (los 6 minutos de verdad), no queda nadie que
 * programe la siguiente. Por eso, ANTES de correr cada etapa se deja puesto un activador de
 * rescate a TODO_RESCATE_MS: si la etapa termina bien se borra; si no, ése la retoma.
 *
 * POR QUÉ NO EN PARALELO: lo medimos el 01/10/2026 en LOG_MIGRACION. La máquina trabaja
 * ~10-15 minutos en total; las 7 horas del ensayo del 30/09 eran espera entre clics. Ids va
 * primero y Capital Humano al final, todo escribe en el mismo libro, y el candado del
 * script impide a propósito que dos pasos escriban a la vez. Ganaríamos un minuto.
 *
 * SOLO EN LAB: se niega si el proyecto no apunta al libro de experimentos, porque el paso 1
 * lo borra. Para la corrida real, ver docs/guion-lab.md.
 *
 * DÓNDE VER EL AVANCE: `migracionTodoEstado`, la hoja LOG_MIGRACION (una fila por etapa con
 * su resumen) y un correo al terminar o detenerse.
 */

/** Dónde se guarda en qué etapa va la corrida. */
const TODO_PROP = 'MIGRACION_TODO';
/** La función que llaman los activadores. Tiene que ser pública. */
const TODO_CONTINUAR = 'migracionTodoContinuar';
/** Si una etapa terminó antes de esto, cabe otra en la misma ejecución. */
const TODO_PRESUPUESTO_MS = 45 * 1000;
/** Cuánto esperar entre ejecuciones. */
const TODO_PAUSA_MS = 60 * 1000;
/** El activador de rescate: después de los 6 minutos que Apps Script deja vivir a una. */
const TODO_RESCATE_MS = 7 * 60 * 1000;
/** Una etapa marcada como ocupada hace menos de esto sigue viva en otra ejecución. */
const TODO_OCUPADA_MS = 6.5 * 60 * 1000;
/** Cuántas veces se repite una etapa cortada por tiempo antes de rendirse. */
const TODO_MAX_REPETICIONES = 10;

const TODO_ETAPAS = [
  { nombre: 'replanchar', corre: () => replancharDesdeProduccion({ escribir: true }) },
  { nombre: 'quitar sello de LAB', corre: () => todoQuitarSelloLab_() },
  { nombre: 'ids', corre: () => correrIdsTodo({ escribir: true }) },
  { nombre: 'vehiculos', corre: () => correrFamilia('vehiculos', { escribir: true }) },
  { nombre: 'lineas', corre: () => correrFamilia('lineas', { escribir: true }) },
  { nombre: 'cajachica', corre: () => correrFamilia('cajachica', { escribir: true }) },
  { nombre: 'capitalhumano', corre: () => correrFamilia('capitalhumano', { escribir: true }) },
];


// =========================================================== funciones para el editor

/** EL BOTÓN: replancha LAB desde producción y corre los 5 pipelines, solo. */
function migracionTodoLab() {
  todoExigirLab_();
  const previo = todoLeer_();
  if (previo && previo.estado === 'corriendo') {
    throw new Error('Ya hay una corrida en curso (etapa ' + (previo.etapa + 1) + ' de ' +
      TODO_ETAPAS.length + ': ' + TODO_ETAPAS[previo.etapa].nombre + '). Mira ' +
      'migracionTodoEstado; para empezar de cero, corre migracionTodoCancelar.');
  }
  // Una corrida nueva replancha desde la primera hoja, aunque otra se haya quedado a medias
  PropertiesService.getScriptProperties().deleteProperty(REPL_PROP_AVANCE);
  todoBorrarActivadores_();
  todoGuardar_({ estado: 'corriendo', etapa: 0, repeticiones: 0, desde: new Date().toISOString(),
    historial: [] });
  pipeLog_(REPL_DESTINO, 'TODO', 'ESCRIBIR', 'INICIO',
    TODO_ETAPAS.map((e) => e.nombre).join(' → '));
  return todoAvanzar_();
}

/** Lo llaman los activadores. Correrlo a mano también es seguro: sigue donde iba. */
function migracionTodoContinuar() {
  todoBorrarActivadores_();
  return todoAvanzar_();
}

/** En qué va la corrida. Solo lee. */
function migracionTodoEstado() {
  const st = todoLeer_();
  const lineas = ['MIGRACIÓN COMPLETA EN LAB — estado', ''];
  if (!st) {
    lineas.push('  Nunca se ha corrido. Para empezar: migracionTodoLab');
  } else {
    lineas.push('  estado: ' + st.estado.toUpperCase() + '   (desde ' + st.desde + ')');
    lineas.push('');
    TODO_ETAPAS.forEach((e, i) => {
      const marca = i < st.etapa || st.estado === 'listo' ? ' ok'
        : (i === st.etapa ? (st.estado === 'corriendo' ? ' >>' : ' !!') : '   ');
      lineas.push('  ' + marca + '  ' + (i + 1) + '. ' + e.nombre +
        (i === st.etapa && st.repeticiones ? '   (repetida ' + st.repeticiones + ' veces por tiempo)' : ''));
    });
    if (st.mensaje) lineas.push('', st.mensaje);
    if (st.historial && st.historial.length) {
      lineas.push('', '  historial:');
      st.historial.forEach((h) => lineas.push('    ' + h));
    }
  }
  const pendientes = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === TODO_CONTINUAR).length;
  lineas.push('', '  activadores pendientes: ' + pendientes);
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

/** Detiene la corrida: borra los activadores. Lo que ya se escribió se queda. */
function migracionTodoCancelar() {
  todoBorrarActivadores_();
  const st = todoLeer_();
  if (st && st.estado === 'corriendo') {
    st.estado = 'cancelado';
    st.mensaje = 'Cancelada a mano en la etapa ' + (st.etapa + 1) + ' (' + TODO_ETAPAS[st.etapa].nombre + ').';
    todoGuardar_(st);
  }
  const texto = st ? 'Corrida ' + st.estado + '. Activadores borrados.' : 'No había corrida.';
  Logger.log(texto);
  return texto;
}


// ==================================================================== lo de adentro

/** El paso 1 borra el libro: solo se corre si el proyecto apunta al de experimentos. */
function todoExigirLab_() {
  const apuntados = { SS_ID_VEHICULOS: Config.SPREADSHEET_IDS.VEHICULOS(), SS_ID_TELEFONIA: Config.SPREADSHEET_IDS.TELEFONIA() };
  Object.keys(apuntados).forEach((k) => {
    if (apuntados[k] !== REPL_DESTINO) {
      throw new Error('Este proyecto tiene ' + k + ' = ' + apuntados[k] + ', y la migración completa ' +
        'solo corre en el libro de experimentos (' + REPL_DESTINO + '): su primer paso lo borra.');
    }
  });
}

const todoLeer_ = () => {
  const crudo = PropertiesService.getScriptProperties().getProperty(TODO_PROP);
  if (!crudo) return null;
  try { return JSON.parse(crudo); } catch (e) { return null; }
};
const todoGuardar_ = (st) => PropertiesService.getScriptProperties().setProperty(TODO_PROP, JSON.stringify(st));

function todoBorrarActivadores_() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === TODO_CONTINUAR)
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

function todoProgramar_(ms) {
  ScriptApp.newTrigger(TODO_CONTINUAR).timeBased().after(ms).create();
}

/**
 * Qué hacer con la salida de una etapa. Lee las mismas frases que el pie de correrPasos_ y
 * el de replancharDesdeProduccion (tests/migracion-todo.test.js comprueba que sigan ahí).
 * Lo que no se reconoce NO se da por bueno.
 */
function todoResultado_(texto) {
  const t = String(texto || '');
  if (/SE DETUVO POR TIEMPO/i.test(t)) return 'repetir';
  if (/(SE DETUVO|FALLÓ) en "/.test(t)) return 'detener';
  if (/\bLISTO\b/.test(t)) return 'siguiente';
  return 'detener';
}

/** Paso 2: quita del sello SOLO el id de LAB. Los demás libros sellados se quedan. */
function todoQuitarSelloLab_() {
  const props = PropertiesService.getScriptProperties();
  const libros = (props.getProperty(MIGRACION_PROP_SELLO) || '').split(',').map((x) => x.trim()).filter(Boolean);
  const resto = libros.filter((x) => x !== REPL_DESTINO);
  if (resto.length) props.setProperty(MIGRACION_PROP_SELLO, resto.join(','));
  else props.deleteProperty(MIGRACION_PROP_SELLO);
  return 'LISTO. ' + (resto.length < libros.length
    ? 'Se quitó el sello de LAB: lo acaban de replanchar y no tiene referencias.'
    : 'LAB no estaba sellado.');
}

/** El pie del reporte: lo que cabe en LOG_MIGRACION y en el correo. */
function todoPie_(texto) {
  const t = String(texto || '');
  const i = t.indexOf('━━━ resumen');
  return (i !== -1 ? t.slice(i) : t).slice(-1800);
}

function todoAvisar_(st, asunto, cuerpo) {
  try {
    const para = Session.getEffectiveUser().getEmail();
    if (para) MailApp.sendEmail(para, 'Migración LAB: ' + asunto, cuerpo + '\n\n' + migracionTodoEstado());
  } catch (err) {
    console.error('MigracionTodo: no se pudo mandar el correo: ' + err.message);
  }
}

/** El motor: corre etapas mientras quepan, y deja programada la siguiente ejecución. */
function todoAvanzar_() {
  const arranque = Date.now();
  let st = todoLeer_();
  if (!st || st.estado !== 'corriendo') return 'No hay corrida en curso.';
  if (st.ocupadaDesde && Date.now() - st.ocupadaDesde < TODO_OCUPADA_MS) {
    return 'Otra ejecución está corriendo la etapa ' + TODO_ETAPAS[st.etapa].nombre + '.';
  }
  todoExigirLab_();

  for (;;) {
    const etapa = TODO_ETAPAS[st.etapa];
    const titulo = (st.etapa + 1) + '/' + TODO_ETAPAS.length + ' ' + etapa.nombre;
    st.ocupadaDesde = Date.now();
    todoGuardar_(st);
    todoProgramar_(TODO_RESCATE_MS);

    let texto, resultado;
    try {
      texto = etapa.corre();
      resultado = todoResultado_(texto);
    } catch (err) {
      texto = 'TRONÓ: ' + err.message;
      resultado = 'detener';
    }
    todoBorrarActivadores_();

    st = todoLeer_();   // por si alguien la canceló mientras corría
    st.ocupadaDesde = null;
    if (st.estado !== 'corriendo') {
      todoGuardar_(st);
      return 'Cancelada mientras corría ' + titulo + '.';
    }
    const segundos = Math.round((Date.now() - arranque) / 1000);
    st.historial.push(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm:ss') + '  ' + titulo + ': ' + resultado);
    pipeLog_(REPL_DESTINO, 'TODO ' + titulo, 'ESCRIBIR',
      { repetir: 'CORTADO POR TIEMPO', detener: 'DETENIDO', siguiente: 'OK' }[resultado], todoPie_(texto));

    if (resultado === 'detener') {
      st.estado = 'detenido';
      st.mensaje = 'SE DETUVO en la etapa ' + titulo + '. Lo que dijo:\n\n' + todoPie_(texto);
      todoGuardar_(st);
      todoAvisar_(st, 'SE DETUVO en ' + etapa.nombre, st.mensaje);
      return st.mensaje;
    }
    if (resultado === 'repetir') {
      st.repeticiones++;
      if (st.repeticiones > TODO_MAX_REPETICIONES) {
        st.estado = 'detenido';
        st.mensaje = 'La etapa ' + titulo + ' se cortó por tiempo ' + st.repeticiones + ' veces seguidas. Algo no avanza.';
        todoGuardar_(st);
        todoAvisar_(st, 'no avanza ' + etapa.nombre, st.mensaje);
        return st.mensaje;
      }
    } else {
      st.etapa++;
      st.repeticiones = 0;
      if (st.etapa >= TODO_ETAPAS.length) {
        st.estado = 'listo';
        st.etapa = TODO_ETAPAS.length - 1;
        st.mensaje = 'LISTO: corrieron las ' + TODO_ETAPAS.length + ' etapas. Lo que sigue: la ' +
          'verificación externa (foto de después) y abrir la app contra LAB.';
        todoGuardar_(st);
        todoAvisar_(st, 'LISTO', st.mensaje);
        return st.mensaje;
      }
    }
    todoGuardar_(st);

    if (Date.now() - arranque > TODO_PRESUPUESTO_MS) {
      todoProgramar_(TODO_PAUSA_MS);
      return titulo + ': ' + resultado + ' (' + segundos + ' s). Sigue sola en un minuto con ' +
        TODO_ETAPAS[st.etapa].nombre + ': mira migracionTodoEstado.';
    }
  }
}

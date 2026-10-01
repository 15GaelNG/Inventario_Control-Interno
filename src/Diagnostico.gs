/**
 * ¿A qué libros apunta ESTE proyecto, y puede abrirse la app?
 *
 * Existe por una pregunta de Ayrton que valía oro: el proyecto de Apps Script compartido
 * apunta al libro del equipo, no al del laboratorio, así que probar la app "a mano" sobre
 * los datos migrados no era obvio. Y al revisarlo salió algo peor: cada libro se configura
 * en su PROPIA Script Property, así que un proyecto puede apuntar al laboratorio en
 * Vehículos y al libro COMPARTIDO en Caja Chica al mismo tiempo. Usar la app con esa mezcla
 * escribiría en el libro de los compañeros sin avisar.
 *
 * Esta función no arregla nada ni escribe nada: solo dice dónde estás parado antes de que
 * abras la app. Córrela en el proyecto que vayas a usar.
 */

/** Los libros que sabemos nombrar, para que el reporte no sea una lista de ids opacos. */
const DIAG_LIBROS = {
  '1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk': { nombre: 'PRODUCCIÓN', peligro: true },
  '1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI': { nombre: 'DEV compartido con el equipo', peligro: true },
  '1-RA6lmh-rZ-OKfsZSLl2Qd9lLyuDZ3dx3fP0M7qL-5o': { nombre: 'LABORATORIO', peligro: false },
};

/** Las 12 que la app exige para arrancar. Si falta una, Config truena al primer uso. */
const DIAG_OBLIGATORIAS = [
  'SS_ID_USUARIOS', 'SS_ID_VEHICULOS', 'SS_ID_TELEFONIA', 'SS_ID_ACCESORIOS',
  'SS_ID_CAJACHICA',
  'DRIVE_FOLDER_ID_RAIZ', 'DRIVE_FOLDER_ID_REPORTES', 'DRIVE_FOLDER_ID_VERIFICACIONES',
  'DRIVE_FOLDER_ID_SENSORES', 'DRIVE_FOLDER_ID_HOLOGRAMAS_IMAGENES',
  'DRIVE_FOLDER_ID_HOLOGRAMAS_ARCHIVOS', 'DRIVE_FOLDER_ID_INSPECCIONES_IMAGENES',
];

function diagnosticoEntorno() {
  const props = PropertiesService.getScriptProperties();
  const lineas = ['DÓNDE ESTÁ PARADO ESTE PROYECTO', ''];
  const alertas = [];

  // ---------------------------------------------------------------- a qué libros apunta
  lineas.push('LIBROS');
  const usados = {};
  ['SS_ID_USUARIOS', 'SS_ID_VEHICULOS', 'SS_ID_TELEFONIA', 'SS_ID_ACCESORIOS',
    'SS_ID_CAJACHICA'].forEach((k) => {
    const id = (props.getProperty(k) || '').trim();
    if (!id) {
      lineas.push('  ' + k + ': SIN CONFIGURAR');
      return;
    }
    const conocido = DIAG_LIBROS[id];
    let etiqueta = conocido ? conocido.nombre : 'libro no reconocido';
    let nombreReal = '';
    try {
      nombreReal = SpreadsheetApp.openById(id).getName();
    } catch (e) {
      etiqueta = 'NO SE PUDO ABRIR (' + e.message + ')';
    }
    usados[id] = (usados[id] || []).concat(k);
    lineas.push('  ' + k + ': ' + etiqueta + (nombreReal ? '  "' + nombreReal + '"' : '') +
      '\n      ' + id);
    if (conocido && conocido.peligro) {
      alertas.push(k + ' apunta a ' + conocido.nombre + '. Si usas la app, escribes AHÍ.');
    }
  });

  // La mezcla es el caso que de verdad muerde: parece que estás en el laboratorio porque
  // Vehículos lo está, y resulta que Caja Chica no.
  const distintos = Object.keys(usados);
  if (distintos.length > 1) {
    lineas.push('');
    lineas.push('  OJO: este proyecto usa ' + distintos.length + ' libros distintos a la vez.');
    distintos.forEach((id) => {
      const c = DIAG_LIBROS[id];
      lineas.push('    - ' + (c ? c.nombre : id) + '  <- ' + usados[id].join(', '));
    });
    const hayPeligro = distintos.some((id) => DIAG_LIBROS[id] && DIAG_LIBROS[id].peligro);
    const hayLab = distintos.some((id) => DIAG_LIBROS[id] && !DIAG_LIBROS[id].peligro);
    if (hayPeligro && hayLab) {
      alertas.push('MEZCLA: unos módulos van al laboratorio y otros a un libro real. ' +
        'Probar la app así escribe en el libro real sin avisar.');
    }
  }

  // ---------------------------------------------------------------- qué le falta
  lineas.push('');
  lineas.push('PROPIEDADES OBLIGATORIAS');
  const faltan = DIAG_OBLIGATORIAS.filter((k) => !(props.getProperty(k) || '').trim());
  if (!faltan.length) {
    lineas.push('  Las ' + DIAG_OBLIGATORIAS.length + ' están puestas.');
  } else {
    lineas.push('  FALTAN ' + faltan.length + ' de ' + DIAG_OBLIGATORIAS.length + ':');
    faltan.forEach((k) => lineas.push('    - ' + k));
    alertas.push('Sin esas ' + faltan.length + ' propiedades la app truena al abrirse, con ' +
      '"Falta configurar ...". Se ponen en Configuración del proyecto > Propiedades del script.');
  }

  // ---------------------------------------------------------------- estado de la migración
  lineas.push('');
  lineas.push('EL LIBRO DE VEHÍCULOS');
  const ssId = (props.getProperty('SS_ID_VEHICULOS') || '').trim();
  if (!ssId) {
    lineas.push('  sin configurar, no hay nada que revisar');
  } else {
    try {
      const ss = SpreadsheetApp.openById(ssId);
      const migrables = Entidades.migrables();
      let conId = 0;
      let conAnterior = 0;
      let faltantes = 0;
      migrables.forEach((e) => {
        const sheet = ss.getSheetByName(e.hoja);
        if (!sheet) { faltantes++; return; }
        const enc = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
          .map((v) => String(v || '').trim().toUpperCase());
        if (enc.indexOf('ID') !== -1) conId++;
        if (enc.indexOf(Entidades.COLUMNA_ID_ANTERIOR.toUpperCase()) !== -1) conAnterior++;
      });
      lineas.push('  ' + conId + ' de ' + migrables.length + ' hojas tienen columna ID');
      lineas.push('  ' + conAnterior + ' tienen "' + Entidades.COLUMNA_ID_ANTERIOR + '"');
      if (faltantes) lineas.push('  ' + faltantes + ' hojas del catálogo NO existen en este libro');
      lineas.push('  sellado: ' + (migracionSellado_(ssId) ? 'SÍ, ya hay referencias colgando de los IDs' : 'no'));

      // PERFILES no es obligatoria, pero su ausencia cambia cómo se dan los permisos, y
      // eso confunde mucho cuando la app "no te deja entrar a nada".
      const perfiles = ss.getSheetByName('PERFILES');
      lineas.push('  hoja PERFILES: ' + (perfiles
        ? 'existe (' + Math.max(0, perfiles.getLastRow() - 1) + ' renglones)'
        : 'NO existe -> los permisos caen al ROL viejo (ADMIN/SUPER editan, el resto lee)'));
    } catch (e) {
      lineas.push('  no se pudo abrir: ' + e.message);
    }
  }

  // ---------------------------------------------------------------- el veredicto
  lineas.push('');
  if (!alertas.length) {
    lineas.push('SIN ALERTAS: puedes usar la app sobre este proyecto.');
  } else {
    lineas.push('ALERTAS (' + alertas.length + '):');
    alertas.forEach((a) => lineas.push('  - ' + a));
  }

  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

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

/**
 * Las que de verdad rompen algo si faltan, con QUÉ rompen.
 *
 * Antes esto era una lista de 12 y el reporte decía "sin ellas la app truena al abrirse".
 * Era falso para una: SS_ID_CAJACHICA está declarada en Config pero no hay una sola línea
 * que la llame — las pestañas de Caja Chica viven en el libro de Vehículos y sus servicios
 * usan SS_ID_VEHICULOS. Decir que algo truena cuando no truena enseña a ignorar el reporte.
 */
const DIAG_OBLIGATORIAS = [
  { clave: 'SS_ID_VEHICULOS', rompe: 'TODO: es el libro de casi toda la app' },
  { clave: 'SS_ID_USUARIOS', rompe: 'entrar a la app (Auth y Permisos)' },
  { clave: 'SS_ID_TELEFONIA', rompe: 'el módulo de Líneas Telefónicas entero' },
  { clave: 'SS_ID_ACCESORIOS', rompe: 'el módulo de Accesorios' },
  { clave: 'DRIVE_FOLDER_ID_RAIZ', rompe: 'abrir los archivos heredados de AppSheet' },
  { clave: 'DRIVE_FOLDER_ID_REPORTES', rompe: 'generar PDFs' },
  { clave: 'DRIVE_FOLDER_ID_VERIFICACIONES', rompe: 'subir comprobantes de verificación' },
  { clave: 'DRIVE_FOLDER_ID_SENSORES', rompe: 'subir responsivas de sensores' },
  { clave: 'DRIVE_FOLDER_ID_HOLOGRAMAS_IMAGENES', rompe: 'las imágenes de hologramas' },
  { clave: 'DRIVE_FOLDER_ID_HOLOGRAMAS_ARCHIVOS', rompe: 'las solicitudes de hologramas' },
  { clave: 'DRIVE_FOLDER_ID_INSPECCIONES_IMAGENES', rompe: 'las fotos de inspección' },
];

/** Declaradas en Config pero que hoy NO llama nadie. No faltan: sobran. */
const DIAG_SIN_USO = [
  { clave: 'SS_ID_CAJACHICA',
    nota: 'las pestañas de Caja Chica viven en el libro de Vehículos; sus servicios usan SS_ID_VEHICULOS' },
];

function diagnosticoEntorno() {
  const props = PropertiesService.getScriptProperties();
  const lineas = ['DÓNDE ESTÁ PARADO ESTE PROYECTO', ''];
  const alertas = [];
  const avisos = [];

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
    // Producción es alerta. El libro del equipo es solo un aviso: muchas veces es
    // exactamente donde se quiere trabajar, y gritarlo como falla enseña a ignorar el
    // reporte. Lo que sí hay que saber es que se escribe en el libro de los compañeros.
    if (conocido && conocido.peligro) {
      if (/PRODUCC/i.test(conocido.nombre)) {
        alertas.push(k + ' apunta a ' + conocido.nombre + '. Si usas la app, escribes AHÍ.');
      } else {
        avisos.push(k + ' apunta a ' + conocido.nombre + ': lo que guardes lo ven ellos.');
      }
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
  lineas.push('PROPIEDADES');
  const faltan = DIAG_OBLIGATORIAS.filter((o) => !(props.getProperty(o.clave) || '').trim());
  if (!faltan.length) {
    lineas.push('  Las ' + DIAG_OBLIGATORIAS.length + ' que se usan están puestas.');
  } else {
    lineas.push('  FALTAN ' + faltan.length + ' de ' + DIAG_OBLIGATORIAS.length + ', y esto rompen:');
    faltan.forEach((o) => lineas.push('    - ' + o.clave + '  ->  ' + o.rompe));
    alertas.push('Faltan ' + faltan.length + ' propiedades. Se ponen en Configuración del ' +
      'proyecto > Propiedades del script. El pipeline de migración NO las necesita: ese lee ' +
      'todo de SS_ID_VEHICULOS.');
  }
  DIAG_SIN_USO.forEach((o) => {
    if ((props.getProperty(o.clave) || '').trim()) return;
    lineas.push('  ' + o.clave + ': sin configurar, y NO hace falta — ' + o.nota);
  });

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
    } catch (e) {
      lineas.push('  no se pudo abrir: ' + e.message);
    }
  }

  // ---------------------------------------------------------------- permisos
  // De dónde salen (hoja PERMISOS o la semilla del código) y si alguna regla no aplica a nadie:
  // eso confunde mucho cuando la app "no te deja entrar a nada".
  lineas.push('');
  lineas.push('PERMISOS');
  try {
    const revision = Permisos.revisarCatalogo();
    lineas.push('  ' + revision.mensaje.split('\n').join('\n  '));
    if (revision.fuente === 'semilla') avisos.push('Sin hoja PERMISOS: se usa la semilla del código (correr permisosCrearHoja para poder editarlos).');
    if (revision.problemas.length) avisos.push(revision.problemas.length + ' regla(s) de permisos no aplican a nadie (ver PERMISOS arriba).');
  } catch (e) {
    lineas.push('  no se pudieron revisar: ' + e.message);
  }

  // ---------------------------------------------------------------- el veredicto
  lineas.push('');
  if (avisos.length) {
    lineas.push('AVISOS (' + avisos.length + ') — no impiden trabajar:');
    avisos.forEach((a) => lineas.push('  - ' + a));
    lineas.push('');
  }
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

/**
 * Qué permisos le calcula la app a un correo, y de dónde los saca. Para cuando alguien "no
 * ve" un módulo: dice de qué libro lee USUARIOS, qué ROL y ACTIVO encontró, qué había en la
 * caché (5 minutos) y qué sale al recalcular. Borra esa caché de paso, así que después de
 * correrlo basta con recargar la app.
 *
 * Sin argumento usa el correo de quien lo corre en el editor.
 */
function diagnosticoPermisos(correo) {
  const quien = String(correo || Session.getActiveUser().getEmail() || '').trim();
  const lineas = ['PERMISOS DE ' + (quien || '(no pude saber tu correo: pásalo como argumento)'), ''];
  const ssId = Config.SPREADSHEET_IDS.USUARIOS();
  lineas.push('  Libro de USUARIOS: ' + ssId);

  const fila = SheetUtils.getAll(ssId, 'USUARIOS')
    .find((u) => String(u['CORREO']).trim().toUpperCase() === quien.toUpperCase());
  lineas.push(fila
    ? '  Encontrado: ROL=' + fila['ROL'] + '  ACTIVO=' + fila['ACTIVO'] + '  AREA=' + (fila['AREA'] || '(vacío)')
    : '  NO ESTÁ ese correo en la pestaña USUARIOS: por eso no ve nada.');
  lineas.push('  Reglas: ' + Permisos.revisarCatalogo().mensaje.split('\n')[0]);

  const enCache = CacheService.getScriptCache().get('permisos_' + quien.toUpperCase());
  lineas.push('', '  En caché: ' + (enCache ? Object.keys(JSON.parse(enCache)).join(', ') : '(nada)'));
  Permisos.olvidar(quien);
  const ahora = Permisos.deCorreo(quien);
  lineas.push('  Recalculado:');
  Object.keys(ahora).forEach((m) => lineas.push('    ' + m + ': ' + ahora[m]));
  if (!Object.keys(ahora).length) lineas.push('    (ninguno)');
  lineas.push('', '  La caché ya se borró: recarga la app.');

  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

/**
 * Revisa el JS TAL COMO LO SIRVE Apps Script, no como está en el repo. HtmlService le borra
 * a los .html lo que sigue a "//" (ver CLAUDE.md), y eso puede romper un <script> que en el
 * repo está bien; el síntoma es una pantalla o un menú que simplemente no aparece. Aquí se
 * pide el contenido con include() —lo mismo que recibe el navegador— y se compila cada
 * <script> con new Function. Si truena, dice cuál y enseña el renglón.
 */
function diagnosticoHtml() {
  const archivos = ['html/js/api', 'html/js/app', 'html/js/app-arqueos', 'html/js/app-cajachica',
    'html/js/app-reasignaciones', 'html/js/app-panorama-vehiculos', 'html/js/app-verificaciones',
    'html/js/app-relaciones', 'html/js/modulos/sensores', 'html/js/modulos/hologramas',
    'html/js/modulos/inspecciones', 'html/js/lineas'];
  const lineas = ['EL JS COMO LO RECIBE EL NAVEGADOR', ''];
  archivos.forEach((nombre) => {
    let contenido;
    try { contenido = include(nombre); } catch (e) { lineas.push('  ' + nombre + ': no se pudo leer (' + e.message + ')'); return; }
    const scripts = [];
    contenido.replace(/<script>([\s\S]*?)<\/script>/g, (_, js) => { scripts.push(js); return ''; });
    const fallas = [];
    scripts.forEach((js, i) => {
      try { new Function(js); } catch (e) {
        // El renglón exacto no lo da new Function; se busca partiendo el script a la mitad
        let lo = 0, hi = js.split('\n').length;
        const renglones = js.split('\n');
        while (hi - lo > 1) {
          const mitad = Math.floor((lo + hi) / 2);
          try { new Function(renglones.slice(0, mitad).join('\n') + '\n}}}}}}}}}}'); lo = mitad; } catch (e2) {
            if (/Unexpected token '}'|Unexpected end/.test(e2.message)) lo = mitad; else hi = mitad;
          }
        }
        fallas.push('script ' + (i + 1) + ': ' + e.message + '\n      cerca del renglón ' + hi + ': ' +
          String(renglones[hi - 1] || '').trim().slice(0, 140));
      }
    });
    lineas.push('  ' + nombre + ': ' + (fallas.length ? 'ROTO\n    ' + fallas.join('\n    ') : 'ok (' + scripts.length + ' script)'));
  });
  const app = include('html/js/app');
  lineas.push('', '  ¿app trae el grupo Administración? ' + (app.indexOf("requiere: 'relaciones'") !== -1 ? 'sí' : 'NO'));
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

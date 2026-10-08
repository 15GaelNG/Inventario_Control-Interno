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
  soloEditor_();
  const lineas = ['DÓNDE ESTÁ PARADO ESTE PROYECTO', ''];
  const alertas = [];
  const avisos = [];

  // ---------------------------------------------------------------- a qué libros apunta
  lineas.push('LIBROS');
  const usados = {};
  ['SS_ID_USUARIOS', 'SS_ID_VEHICULOS', 'SS_ID_TELEFONIA', 'SS_ID_ACCESORIOS',
    'SS_ID_CAJACHICA'].forEach((k) => {
    const id = (leerConfig_(k) || '').trim();
    const deDonde = origenConfig_(k) === 'archivo' ? ' [Entornos.gs]' : ' [Script Properties]';
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
      '\n      ' + id + deDonde);
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
  lineas.push('PROPIEDADES (de src/config/Entornos.gs o de Script Properties)');
  const faltan = DIAG_OBLIGATORIAS.filter((o) => !(leerConfig_(o.clave) || '').trim());
  if (!faltan.length) {
    lineas.push('  Las ' + DIAG_OBLIGATORIAS.length + ' que se usan están puestas.');
  } else {
    lineas.push('  FALTAN ' + faltan.length + ' de ' + DIAG_OBLIGATORIAS.length + ', y esto rompen:');
    faltan.forEach((o) => lineas.push('    - ' + o.clave + '  ->  ' + o.rompe));
    alertas.push('Faltan ' + faltan.length + ' propiedades. Se ponen en src/config/Entornos.gs, en el bloque ' +
      'de este proyecto (' + ScriptApp.getScriptId() + '), y se suben con clasp push.');
  }
  DIAG_SIN_USO.forEach((o) => {
    if ((leerConfig_(o.clave) || '').trim()) return;
    lineas.push('  ' + o.clave + ': sin configurar, y NO hace falta — ' + o.nota);
  });

  // ---------------------------------------------------------------- estado de la migración
  lineas.push('');
  lineas.push('EL LIBRO DE VEHÍCULOS');
  const ssId = (leerConfig_('SS_ID_VEHICULOS') || '').trim();
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
 * ¿Los IDs de este proyecto (Entornos.gs o Script Properties) son los correctos?
 *
 *   revisarEntorno()   desde el editor de CUALQUIER proyecto (prod, tu DEV): el reporte en el log
 *
 * Revisa ID por ID que abra, que sea del tipo correcto (libro o carpeta) y, en las carpetas
 * donde AppSheet y la app guardan "rutas" ("INSPECCION VEHICULAR_Images/…png"), que se llame
 * como esa ruta dice y que la raíz la alcance con ese nombre (carpeta o acceso directo): si no,
 * el archivo se guarda pero nunca se vuelve a encontrar (6-oct: las fotos de inspección caían
 * en la raíz). En producción, además, que nada esté dentro de una carpeta de pruebas (el mismo
 * día: REPORTES apuntaba a la carpeta de la copia de pruebas). Y que existan las hojas del
 * catálogo y el calentador.
 *
 * tools/subir/subir.js pide lo mismo en la URL /dev (?revisar=entorno, ver doGet) justo antes
 * de desplegar a prod, y no despliega si hay errores. Solo se le contesta a quien desplegó la
 * app; la contraseña de Geotab no sale nunca (no está en la lista).
 */
const REVISION_LIBROS = ['SS_ID_USUARIOS', 'SS_ID_VEHICULOS', 'SS_ID_TELEFONIA', 'SS_ID_ACCESORIOS', 'SS_ID_CAJACHICA'];
/**
 * Carpetas: `nombre` = la carpeta que va al principio de las rutas que se guardan en la hoja; la raíz la tiene que
 * alcanzar con ese nombre, salvo `sinRaiz`. La cuenta que despliega tiene que poder ESCRIBIR en cada una, salvo
 * `soloLee` (abrirla basta con ser lector; guardar ahí no: 8-oct, las inspecciones no generaban PDF).
 */
const REVISION_CARPETAS = {
  DRIVE_FOLDER_ID_RAIZ: {},
  DRIVE_FOLDER_ID_REPORTES: { nombre: 'INSPECCIONES VEHICULARES' },
  DRIVE_FOLDER_ID_VERIFICACIONES: { nombre: 'VERIFICACIONES_Images' },
  DRIVE_FOLDER_ID_SENSORES: { nombre: 'INSTALACION DE SENSORES_Files_' },
  DRIVE_FOLDER_ID_HOLOGRAMAS_IMAGENES: { nombre: 'HOLOGRAMAS_Images' },
  DRIVE_FOLDER_ID_HOLOGRAMAS_ARCHIVOS: { nombre: 'HOLOGRAMAS_Files_' },
  DRIVE_FOLDER_ID_INSPECCIONES_IMAGENES: { nombre: 'INSPECCION VEHICULAR_Images' },
  // Los modelos se leen directo de su carpeta (InspeccionesService.raizDe_), no caminando desde la raíz
  DRIVE_FOLDER_ID_MODELOS: { nombre: 'MODELOS INSPECCION', sinRaiz: true, soloLee: true },
  DRIVE_FOLDER_ID_VERIFICACIONES_LECTURA: { soloLee: true },
  LINEAS_DRIVE_APPSHEET: {},
  LINEAS_DRIVE_NUCOS: {},
  LINEAS_DRIVE_APPSHEET_LECTURA: { soloLee: true },
};
/**
 * Las plantillas de Google Docs que la app COPIA para armar cada PDF (makeCopy): la cuenta que despliega tiene
 * que poder copiarlas. Cada servicio dice la suya; las de inspección vienen de la hoja MODELOS INSPECCION.
 */
function revisionPlantillas_() {
  const lista = [
    { nombre: 'Responsiva vehicular', id: ResponsivaVehicularService.PLANTILLA },
    { nombre: 'Adherente vehicular', id: AdherenteVehicularService.PLANTILLA },
    { nombre: 'Arqueo', id: ArqueosService.PLANTILLA },
  ];
  Object.keys(LineasPdf.PLANTILLAS).forEach((k) => lista.push({ nombre: 'Líneas ' + k, id: LineasPdf.PLANTILLAS[k] }));
  try {
    InspeccionesService.plantillas().forEach((p) => lista.push({ nombre: 'Inspección ' + p.tipo, id: p.id }));
  } catch (e) {
    lista.push({ nombre: 'Inspección (MODELOS INSPECCION)', error: e.message });
  }
  return lista;
}
/** Qué puede hacer con un archivo o carpeta la cuenta con la que corre (Drive v3: el permiso real, no solo si abre) */
function revisionCapacidades_(id) {
  return Drive.Files.get(id, { fields: 'capabilities(canEdit,canAddChildren,canCopy)', supportsAllDrives: true }).capabilities || {};
}
/**
 * Las carpetas que los servicios buscan por NOMBRE dentro de la raíz (DriveUtils.carpetaEnRaiz).
 * En producción tienen que existir (si no, la captura truena); en un DEV se crean solas al usarse.
 * Un contrato revisa que cada nombre que usa un servicio esté aquí.
 */
const REVISION_EN_RAIZ = [
  'ARQUEOS', 'ARQUEOS_Images', 'ARQUEOS_Files_', 'UBER_Files_', 'VEHICULOS_Files_', 'VEHICULOS_Images',
  'RESPONSIVAS VEHICULARES_Images', 'RESPONSIVAS_VEHICULARES', 'ADHERENTES VEHICULAR',
];
/**
 * Hojas del catálogo que pueden faltar sin que sea error: APP_CORRECCIONES la crea Líneas la primera vez que
 * se usa, y LINEAS TELEFONICAS ya no se lee cuando se retiró (LINEAS_HOJA_VIEJA_RETIRADA, LineasRetiro.gs).
 */
function noSePide_(hoja) {
  if (hoja === 'APP_CORRECCIONES') return true;
  return hoja === 'LINEAS TELEFONICAS' && !!leerConfig_('LINEAS_HOJA_VIEJA_RETIRADA');
}
/** Un nombre así, en la carpeta o en una de arriba, en producción es casi seguro un error */
const REVISION_PRUEBAS = /prueba|copia de|\btest\b|\bdev\b|laboratorio/i;

function revisarEntorno() {
  soloEditor_();
  const r = revisionEntorno_();
  const lineas = ['REVISIÓN DE IDS — proyecto ' + r.scriptId + ' (' + (r.entorno || 'sin ENTORNO') + '), con la cuenta ' + r.cuenta, ''];
  r.revisados.forEach((x) => lineas.push((x.problema ? (x.grave ? '  ✘ ' : '  ⚠ ') : '  ✔ ') + x.clave + ': ' +
    (x.id ? (x.nombre ? '"' + x.nombre + '"' : x.id) : 'sin configurar') + (x.problema ? '\n      ' + x.problema : '')));
  lineas.push('');
  lineas.push(r.hojasQueFaltan.length ? (r.entorno === 'PROD' ? '  ✘' : '  ⚠') + ' Faltan hojas: ' + r.hojasQueFaltan.join(', ') : '  ✔ Están todas las hojas del catálogo');
  lineas.push((r.calentador ? '  ✔' : '  ⚠') + ' Calentador ' + (r.calentador ? 'instalado' : 'NO instalado (correr instalarCalentador)'));
  lineas.push('');
  lineas.push(r.errores.length ? 'ERRORES (' + r.errores.length + '):\n  - ' + r.errores.join('\n  - ') : 'SIN ERRORES');
  if (r.avisos.length) lineas.push('AVISOS (' + r.avisos.length + '):\n  - ' + r.avisos.join('\n  - '));
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

function revisionEntorno_() {
  const activo = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const efectivo = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (activo && efectivo && activo !== efectivo) return { error: 'Solo para quien desplegó la app.' };

  const entorno = (leerConfig_('ENTORNO') || '').trim().toUpperCase();
  const esProd = entorno === 'PROD';
  const errores = [];
  const avisos = [];
  const revisados = [];
  /** En prod, lo que está mal es error (no se despliega); en un DEV, aviso. Lo que no abre siempre es error. */
  const anotar = (x, problema, siempreGrave) => {
    x.problema = problema;
    x.grave = esProd || !!siempreGrave;
    (x.grave ? errores : avisos).push(x.clave + ': ' + problema);
  };
  const obligatoria = (clave) => DIAG_OBLIGATORIAS.some((o) => o.clave === clave);
  /**
   * Que la cuenta con la que corre la app (la que despliega) tenga ese permiso. Sin él es error en cualquier
   * entorno: lo que se guarde ahí va a fallar para todos. Si no se puede preguntar, aviso.
   */
  const cuenta = efectivo || 'La cuenta con la que corre la app';
  const capacidades = {};
  const exigir = (x, id, capacidad, problema) => {
    try {
      const c = capacidades[id] || (capacidades[id] = revisionCapacidades_(id));
      if (!c[capacidad]) anotar(x, cuenta + ' ' + problema, true);
    } catch (e) {
      avisos.push(x.clave + ': no se pudo revisar qué permiso tiene ' + cuenta + ' (' + e.message + ')');
    }
  };
  /** El nombre de pruebas que tiene ella o una carpeta de arriba (null si ninguna) */
  const enPruebas = (archivo) => {
    let actual = archivo;
    for (let i = 0; i < 12 && actual; i++) {
      if (REVISION_PRUEBAS.test(actual.getName())) return actual.getName();
      const padres = actual.getParents();
      actual = padres.hasNext() ? padres.next() : null;
    }
    return null;
  };

  // ---- libros
  const pestanas = {};
  const abiertos = {};
  REVISION_LIBROS.forEach((clave) => {
    const x = { clave: clave, id: (leerConfig_(clave) || '').trim() };
    revisados.push(x);
    if (!x.id) {
      if (obligatoria(clave)) anotar(x, 'sin configurar', true);
      return;
    }
    try {
      const ss = abiertos[x.id] || (abiertos[x.id] = SpreadsheetApp.openById(x.id));
      x.nombre = ss.getName();
      ss.getSheets().forEach((h) => { pestanas[h.getName().trim().toUpperCase()] = true; });
    } catch (e) {
      anotar(x, 'no abre como libro (' + e.message + ')', true);
      return;
    }
    exigir(x, x.id, 'canEdit', 'solo puede ver este libro: no podrá guardar nada (necesita ser Editor)');
    const prueba = esProd && enPruebas(DriveApp.getFileById(x.id));
    if (prueba) anotar(x, 'está en "' + prueba + '": parece de pruebas, no de producción');
  });

  // ---- carpetas
  let raiz = null;
  Object.keys(REVISION_CARPETAS).forEach((clave) => {
    const regla = REVISION_CARPETAS[clave];
    const x = { clave: clave, id: (leerConfig_(clave) || '').trim() };
    revisados.push(x);
    if (!x.id) {
      if (obligatoria(clave)) anotar(x, 'sin configurar', true);
      return;
    }
    let carpeta;
    try {
      carpeta = DriveApp.getFolderById(x.id);
      x.nombre = carpeta.getName();
    } catch (e) {
      anotar(x, 'no abre como carpeta: no existe, es un archivo o no tienes acceso (' + e.message + ')', true);
      return;
    }
    if (carpeta.isTrashed()) { anotar(x, 'la carpeta está en la papelera', true); return; }
    if (clave === 'DRIVE_FOLDER_ID_RAIZ') raiz = carpeta;
    if (!regla.soloLee) exigir(x, x.id, 'canAddChildren', 'solo puede ver esta carpeta: lo que se guarde ahí va a fallar (necesita ser Editor)');
    const prueba = esProd && enPruebas(carpeta);
    if (prueba) { anotar(x, 'está en "' + prueba + '": parece de pruebas, no de producción'); return; }
    if (!regla.nombre) return;
    if (x.nombre !== regla.nombre) {
      anotar(x, 'se llama "' + x.nombre + '" y debería ser "' + regla.nombre + '": las rutas que se guardan ("' +
        regla.nombre + '/…") no la van a encontrar');
    } else if (raiz && !regla.sinRaiz && !revisionAlcanza_(raiz, regla.nombre, x.id)) {
      anotar(x, 'la raíz ("' + raiz.getName() + '") no tiene "' + regla.nombre + '" que lleve a esta carpeta ' +
        '(ni carpeta ni acceso directo): lo que se guarde no se va a volver a encontrar');
    }
  });

  // ---- carpetas que se buscan por nombre en la raíz
  if (raiz) {
    REVISION_EN_RAIZ.forEach((nombre) => {
      const x = { clave: 'raíz / ' + nombre, id: '' };
      revisados.push(x);
      const enRaiz = DriveUtils.carpetaEnRaizSiExiste(raiz, nombre);
      if (enRaiz) {
        x.id = enRaiz.getId(); x.nombre = nombre;
        exigir(x, x.id, 'canAddChildren', 'solo puede ver esta carpeta: lo que se guarde ahí va a fallar (necesita ser Editor)');
        return;
      }
      // anotar: en producción es error; en un DEV, aviso
      anotar(x, esProd
        ? 'no existe en la raíz: lo que se guarde ahí va a fallar (créala, o un acceso directo con ese nombre)'
        : 'no existe todavía; se crea sola la primera vez que se use');
    });
  }

  // ---- plantillas de los PDF: la app las copia
  revisionPlantillas_().forEach((p) => {
    const x = { clave: 'plantilla / ' + p.nombre, id: p.id || '' };
    revisados.push(x);
    if (p.error) { anotar(x, 'no se pudieron leer las plantillas (' + p.error + ')'); return; }
    try {
      x.nombre = DriveApp.getFileById(p.id).getName();
    } catch (e) {
      anotar(x, 'no abre: no existe o ' + cuenta + ' no la puede ver (' + e.message + ')', true);
      return;
    }
    exigir(x, p.id, 'canCopy', 'no puede copiarla: ese PDF no se va a generar (necesita ser Editor, o que la plantilla deje copiar)');
  });

  // ---- hojas y calentador
  const hojasQueFaltan = Object.keys(abiertos).length
    ? Entidades.todas().filter((e) => !(e.modulo && Config.apagado(e.modulo)) && !noSePide_(e.hoja)).map((e) => e.hoja).concat(['USUARIOS', 'PERMISOS'])
      .filter((h) => !pestanas[String(h).trim().toUpperCase()])
    : [];
  if (hojasQueFaltan.length) (esProd ? errores : avisos).push('Faltan hojas en los libros: ' + hojasQueFaltan.join(', '));
  const calentador = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === CALENTADOR_FUNCION);
  if (!calentador) avisos.push('El calentador no está instalado: correr instalarCalentador() una vez en el editor');

  return {
    scriptId: ScriptApp.getScriptId(), entorno: entorno, cuenta: efectivo, revisados: revisados,
    hojasQueFaltan: hojasQueFaltan, calentador: calentador, errores: errores, avisos: avisos,
  };
}

/** ¿La raíz tiene una carpeta (o un acceso directo a carpeta) con ese nombre que sea esta? */
function revisionAlcanza_(raiz, nombre, id) {
  const reales = raiz.getFoldersByName(nombre);
  while (reales.hasNext()) if (reales.next().getId() === id) return true;
  const accesos = raiz.getFilesByName(nombre);
  while (accesos.hasNext()) {
    const a = accesos.next();
    try { if (a.getMimeType() === MimeType.SHORTCUT && a.getTargetId() === id) return true; } catch (e) { /* sin acceso al destino */ }
  }
  return false;
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
  soloEditor_();
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
  soloEditor_();
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

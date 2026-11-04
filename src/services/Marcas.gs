/**
 * Marcas.gs — Control Interno (CI), Flotillas (FT) o Ciudad Maderas (CM, neutra) (4-nov-2026).
 *
 * El área pidió separar lo de Flotillas de lo de CI: cada quien con su logo. Es el mismo sistema (usuarios, permisos,
 * bitácora…); lo que cambia es lo que se ve, con dos reglas:
 *   - EL MARCO VA POR LA PERSONA (login, carga, menú, título, los correos que recibe): el DEPARTAMENTO de USUARIOS.
 *     CONTROL INTERNO → CI, FLOTILLAS → FT, cualquier otro (POST VENTA, vacío) → CM. En el login, si no se detecta la
 *     cuenta de Google o no está registrada, se ven los dos (AMBAS).
 *   - EL CONTENIDO VA POR EL MÓDULO (sus textos, como «Firma de Flotillas», y su firma a distancia): la pestaña MODULOS
 *     del libro de USUARIOS (MODULO, NOMBRE, MARCA = CI, FT o AMBAS), para cambiarla sin desplegar. Vacía o con otra
 *     cosa: la de POR_GRUPO. sincronizar() la crea y le agrega los módulos nuevos (el Calentador lo hace solo); nunca
 *     cambia lo que ya está.
 *     Los PDF NO salen de aquí: el logo está dibujado dentro de cada plantilla de Google Docs (las de los módulos FT
 *     llevan el de Flotillas). Si un módulo cambia de marca en la hoja, sus plantillas se cambian aparte.
 * La pantalla lo pinta con el componente Marca (componentes/marca.html).
 */
const Marcas = (function () {
  const HOJA = 'MODULOS';
  const COLUMNAS = ['MODULO', 'NOMBRE', 'MARCA'];
  const AMBAS = 'AMBAS';
  const NEUTRA = 'CM';
  const ASSETS = 'https://raw.githubusercontent.com/15GaelNG/Inventario_Control-Interno/master/assets/';
  // El logo va siempre sobre una insignia blanca (--color-badge-bg, en cualquier tema): la versión para fondo claro.
  // Sin logo, la pantalla y los correos pintan las iniciales (id). El de Ciudad Maderas es un logotipo ancho que no cabe
  // en las insignias redondas. Flotillas también tiene assets/logo-ft-dark.png (para fondo oscuro), sin uso todavía
  const LISTA = {
    CI: { id: 'CI', nombre: 'Control Interno', logo: ASSETS + 'logo.png' },
    FT: { id: 'FT', nombre: 'Flotillas CM', logo: ASSETS + 'logo-ft-light.png' },
    CM: { id: 'CM', nombre: 'Ciudad Maderas', logo: '' },
  };
  // La división que dio el área (4-nov): CI se queda con Caja Chica, Arqueos y la configuración; Gestión de Activos es
  // de los dos; todo lo demás (Vehículos, Líneas, Uber…) es de Flotillas. Por grupo del menú (Modulos.GRUPOS)
  const POR_GRUPO = { arqueos: 'CI', administracion: 'CI', 'gestion-activos': AMBAS };
  const DE_LOS_DEMAS = 'FT';
  const DEPARTAMENTOS = { 'CONTROL INTERNO': 'CI', 'FLOTILLAS': 'FT' };

  const ssId_ = () => Config.SPREADSHEET_IDS.USUARIOS();
  const clave_ = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  const deModuloValida_ = (m) => { const k = clave_(m); return k === 'CI' || k === 'FT' || k === AMBAS ? k : ''; };

  // ------------------------------------------------------------------ la persona
  /** La marca de una persona por su DEPARTAMENTO (el renglón de USUARIOS o el texto) */
  function dePersona(filaODepartamento) {
    const d = filaODepartamento && typeof filaODepartamento === 'object' ? filaODepartamento.DEPARTAMENTO : filaODepartamento;
    return DEPARTAMENTOS[clave_(d)] || NEUTRA;
  }

  /** { correo: marca } de USUARIOS, guardado mientras la hoja no cambie (para los correos) */
  function porCorreo_() {
    return CacheHojas.recordar('marcas_personas_v1', [[ssId_(), 'USUARIOS']], () => {
      const r = {};
      SheetUtils.getAll(ssId_(), 'USUARIOS').forEach((u) => {
        const c = String(u.CORREO == null ? '' : u.CORREO).trim().toLowerCase();
        if (c) r[c] = dePersona(u);
      });
      return r;
    });
  }
  /** La marca de quien tenga ese correo; sin usuario, la neutra. Nunca truena */
  function deCorreo(correo) {
    try {
      return porCorreo_()[String(correo == null ? '' : correo).trim().toLowerCase()] || NEUTRA;
    } catch (e) {
      return NEUTRA;
    }
  }

  /** La del login y del título de la pestaña: sin cuenta detectada o sin usuario, las dos. Nunca truena */
  function paraLogin(correoDetectado) {
    if (!correoDetectado) return AMBAS;
    try {
      const m = porCorreo_()[String(correoDetectado).trim().toLowerCase()];
      return m || AMBAS;
    } catch (e) {
      return AMBAS;
    }
  }

  // ------------------------------------------------------------------ el módulo
  /** La marca de un módulo si la hoja no dice otra */
  function porOmision(modulo) {
    const g = Modulos.GRUPOS.find((x) => x.modulos.some((m) => m.id === modulo));
    return (g && POR_GRUPO[g.id]) || DE_LOS_DEMAS;
  }

  /** { modulo: 'CI' | 'FT' | 'AMBAS' } de todos los módulos del catálogo */
  function mapa() {
    return CacheHojas.recordar('marcas_modulos_v1', [[ssId_(), HOJA]], () => {
      const hoja = deLaHoja_();
      const r = {};
      Modulos.todos().forEach((m) => { r[m.id] = deModuloValida_(hoja[m.id]) || porOmision(m.id); });
      return r;
    });
  }
  /** La de un módulo (su sección, como 'vehiculos.responsiva', la de su módulo). Nunca truena */
  function deModulo(id) {
    const modulo = String(id || '').split(Modulos.SEPARADOR)[0];
    try {
      return mapa()[modulo] || porOmision(modulo);
    } catch (e) {
      return porOmision(modulo);
    }
  }

  function deLaHoja_() {
    try {
      SheetUtils.getSheet(ssId_(), HOJA);
    } catch (e) {
      if (String(e.message).indexOf('No existe la hoja') === -1) throw e;
      return {};   // todavía no se crea: las de POR_GRUPO
    }
    const r = {};
    SheetUtils.getAll(ssId_(), HOJA).forEach((f) => {
      const id = String(f.MODULO == null ? '' : f.MODULO).trim();
      if (id) r[id] = f.MARCA;
    });
    return r;
  }

  // ------------------------------------------------------------------ nombres
  /** El nombre para un texto: 'Flotillas'; AMBAS → 'Control Interno y Flotillas' */
  function nombreDe(marca) {
    if (marca === AMBAS) return LISTA.CI.nombre + ' y ' + LISTA.FT.nombre;
    return (LISTA[marca] || LISTA[NEUTRA]).nombre;
  }

  /** Lo que la pantalla necesita después de entrar: las marcas (nombre y logo) y la de cada módulo */
  const paraPantalla = () => ({ marcas: LISTA, modulos: mapa() });

  // ------------------------------------------------------------------ la pestaña MODULOS
  /**
   * Que la pestaña MODULOS exista y tenga un renglón por módulo del catálogo: los que faltan entran con su marca por
   * omisión. Lo que ya está no se toca (la marca la deciden ellos en la hoja). → cuántos agregó
   */
  function sincronizar() {
    const hoja = SheetUtils.asegurarPestana(ssId_(), HOJA, COLUMNAS);
    const ya = new Set(Object.keys(deLaHoja_()));
    const nuevos = Modulos.todos().filter((m) => !ya.has(m.id))
      .map((m) => ({ MODULO: m.id, NOMBRE: m.etiqueta, MARCA: porOmision(m.id) }));
    if (!nuevos.length) return 0;
    SheetUtils.agregarFilas(SheetUtils.tabla(hoja, { encabezados: COLUMNAS }), nuevos);
    // La columna MARCA, con su lista (que nadie escriba "Flotilas"); es formato, no un valor
    const columna = COLUMNAS.indexOf('MARCA') + 1;
    hoja.getRange(2, columna, Math.max(hoja.getMaxRows() - 1, 1), 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['CI', 'FT', AMBAS], true).setAllowInvalid(false).build());
    return nuevos.length;
  }

  return { HOJA, COLUMNAS, AMBAS, NEUTRA, LISTA, dePersona, deCorreo, paraLogin, porOmision, mapa, deModulo, nombreDe,
    paraPantalla, sincronizar };
})();

/** Las plantillas de PDF de Flotillas (las de revisionPlantillas_, sin la de Arqueo, que es de CI): [{ nombre, id }] */
function marcasPlantillasFlotillas_() {
  return revisionPlantillas_().filter((p) => /^(Responsiva vehicular|Adherente vehicular|Líneas |Inspección )/.test(p.nombre));
}

/**
 * Desde el editor, SOLO LEE: en cada plantilla de PDF de Flotillas (Responsiva y Adherente vehicular, Líneas e
 * Inspecciones; producción y los DEV usan las mismas), dónde dice «Control Interno» o «CI» escrito (en el cuerpo, el
 * encabezado o el pie, con un poco del texto de alrededor) y qué imágenes tiene (dónde y de qué tamaño), para decidir qué
 * se cambia por Flotillas CM y dónde va su logo. → el reporte (también en el registro de ejecución)
 */
function marcasRevisarPlantillas() {
  soloEditor_();
  // «CI» suelto o pegado a un número o guion (F-CI04-039), nunca dentro de una palabra (CIUDAD, CIERRE)
  const BUSCA = /control\s+interno|(?<![A-Za-zÀ-ÿ])C\.?\s?I(?![A-Za-zÀ-ÿ])/gi;
  const contexto = (texto, i, largo) => texto.slice(Math.max(0, i - 35), i + largo + 35).replace(/\s+/g, ' ').trim();
  function imagenes_(seccion) {
    const r = [];
    let hallado = null;
    while ((hallado = seccion.findElement(DocumentApp.ElementType.INLINE_IMAGE, hallado))) {
      const img = hallado.getElement().asInlineImage();
      r.push('en línea ' + Math.round(img.getWidth()) + '×' + Math.round(img.getHeight()) + ' px');
    }
    seccion.getParagraphs().forEach((p) => p.getPositionedImages()
      .forEach((img) => r.push('flotante ' + Math.round(img.getWidth()) + '×' + Math.round(img.getHeight()) + ' px')));
    return r;
  }
  const bloques = marcasPlantillasFlotillas_().map((p) => {
    if (!p.id) return '■ ' + p.nombre + ': ' + (p.error || 'sin ID');
    try {
      const doc = DocumentApp.openById(p.id);
      const partes = [['cuerpo', doc.getBody()], ['encabezado', doc.getHeader()], ['pie', doc.getFooter()]].filter(([, s]) => s);
      const lineas = ['■ ' + p.nombre + ' — «' + doc.getName() + '» (' + p.id + ')'];
      const padres = DriveApp.getFileById(p.id).getParents();
      if (padres.hasNext()) { const c = padres.next(); lineas.push('   carpeta: «' + c.getName() + '» ' + c.getUrl()); }
      partes.forEach(([donde, s]) => {
        const texto = s.getText();
        let m;
        BUSCA.lastIndex = 0;
        while ((m = BUSCA.exec(texto))) lineas.push('   texto en ' + donde + ': «' + m[0] + '» → …' + contexto(texto, m.index, m[0].length) + '…');
        const imgs = imagenes_(s);
        if (imgs.length) lineas.push('   imágenes en ' + donde + ': ' + imgs.join(', '));
      });
      if (lineas.length === 1) lineas.push('   sin «Control Interno» ni «CI» escrito, y sin imágenes');
      Logger.log(lineas.join('\n'));
      return lineas.join('\n');
    } catch (e) {
      Logger.log('■ ' + p.nombre + ': no se pudo abrir (' + e.message + ')');
      return '■ ' + p.nombre + ': no se pudo abrir (' + e.message + ')';
    }
  });
  const reporte = bloques.join('\n');
  // El registro del editor se corta si es largo: el reporte completo va también a un Doc en Mi unidad de quien lo corre
  const doc = DocumentApp.create('Revisión plantillas Flotillas ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm'));
  doc.getBody().setText(bloques.length + ' plantillas\n\n' + reporte);
  doc.saveAndClose();
  Logger.log('Reporte completo (' + bloques.length + ' plantillas): ' + doc.getUrl());
  return reporte;
}

/** Desde el editor: crea la pestaña MODULOS (o le agrega los módulos nuevos) con su marca por omisión */
function marcasSincronizar() {
  soloEditor_();
  const n = Marcas.sincronizar();
  const texto = 'MODULOS: ' + (n ? n + ' módulos agregados' : 'ya estaban todos');
  Logger.log(texto);
  return texto;
}

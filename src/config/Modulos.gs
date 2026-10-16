/**
 * Modulos.gs
 * Catálogo único de lo que se puede permitir: el id es el que se usa en TODOS lados (el menú
 * del cliente, la hoja PERMISOS y las llamadas a Permisos.exigir).
 *
 * Tener el catálogo aquí evita el problema clásico de los permisos: que alguien escriba
 * "Vehiculos" en la hoja y el módulo se llame "vehiculos", y el permiso no aplique nunca
 * sin que nadie se entere. `Permisos.revisarCatalogo()` reporta esos casos.
 *
 * Es un árbol (14-oct-2026): GRUPO del menú → MÓDULO (una pantalla) → SECCIÓN (una pestaña o
 * una parte de la pantalla). El id de una sección es "modulo.seccion" (vehiculos.documentos).
 *   - Una sección HEREDA el nivel de su módulo (Sin acceso / Ver / Editar) salvo que una regla
 *     diga otra cosa, y nunca pasa del de su módulo (Permisos.resolver_). Así una pestaña nueva
 *     no le quita nada a nadie, y para quitarla basta una regla "Sin acceso" en la sección.
 *   - Con `hereda: false` nace sin acceso y hay que darla a propósito (lo sensible).
 *   - Cada módulo con lista tiene su sección `exportar` (se agrega sola; ver EXPORTAR): quitarla
 *     esconde "Exportar a Excel". Lo que alguien ve lo puede copiar: es un control de la
 *     pantalla y de los servicios que exportan, no una frontera de seguridad.
 *   - Una pestaña con datos de OTRO módulo (Verificaciones en la ficha de Vehículos) no es una
 *     sección: pide el permiso de ese módulo. El dato manda, no la pantalla donde se ve.
 *   - `antes`: el id viejo de un nodo; resolver() lo traduce, así una regla escrita con él sigue
 *     sirviendo (Responsiva y Adherente eran módulos hasta el 14-oct).
 *
 * Un módulo puede además decir lo que su permiso implica fuera de su pantalla (la pantalla de
 * Usuarios y permisos lo explica con esto, sin frases escritas a mano):
 *   referencia  qué consulta toda su FAMILIA (su grupo del menú) aunque no tenga este módulo:
 *               es lo que el servidor marca `referencia: true` (HojaServicio). P. ej. el catálogo
 *               de vehículos, que Sensores necesita para elegir la unidad.
 *   editaEn     [{ modulo, que }]: partes de OTRO módulo que solo edita quien tiene EDICION en
 *               este: lo que el servidor marca `deOtroModulo` en la hoja de `modulo`. P. ej. la
 *               sección de sensor de la ficha de Vehículos es de Instalación de Sensores.
 *   soloEnlaces su pantalla solo tiene enlaces a otros sistemas (Sistemas, Encuestas): no cuenta
 *               como de la familia (no abre los datos de referencia de su grupo) ni exporta.
 *   alcance     (fase 3, 14-oct) true: el nodo RESPETA el alcance ("solo lo de su área": el servidor
 *               filtra sus renglones por departamento). Quien tiene alcance (un perfil que limita o el
 *               rol CLIENT) solo puede tener los nodos con alcance: true (y los de soloEnlaces, que no
 *               traen datos); los demás se le resuelven Sin acceso (Permisos.resolver_). Así un módulo
 *               nuevo nace cerrado para quien está limitado, no abierto. Una sección lo declara aparte
 *               (no lo hereda); su exportar, el de su módulo.
 * `source-contracts` revisa que esto, el servidor y la pantalla digan lo mismo.
 */

const Modulos = (function () {
  const GRUPOS = [
    {
      id: 'servicios-vehiculares', etiqueta: 'Servicios Vehiculares', icono: 'car',
      modulos: [
        // El resumen de la flota (lee la lista de Vehículos: VehiculosService.RESUMEN.leenTambien). Sin alcance: es un
        // reporte, y ningún CLIENT (ni quien está limitado a su área) ve reportes (usuario, 14-oct)
        { id: 'panorama-vehiculos', etiqueta: 'Panorama de Vehículos' },
        { id: 'incidencias', etiqueta: 'Incidencias' },
        {
          id: 'vehiculos', etiqueta: 'Vehículos', referencia: 'el catálogo de vehículos para elegir la unidad', alcance: true,
          secciones: [
            // La carpeta del NUCO (factura, seguro, alta, tarjeta, tenencia)
            { id: 'documentos', etiqueta: 'Documentos', icono: 'folder-open', alcance: true },
            { id: 'responsiva', etiqueta: 'Responsiva', icono: 'file-signature', antes: 'responsiva-vehicular' },
            { id: 'adherente', etiqueta: 'Adherentes', icono: 'users', antes: 'adherente-vehicular' },
            // Las ligas a las carpetas de Drive del expediente (la cabecera de Documentos con NUCO / 1.-DOCUMENTACIÓN…,
            // "Carpeta" de cada documento y de cada inspección): operación interna. Sin alcance: un CLIENT no las ve
            // (usuario, 14-oct); los archivos sí, desde su pestaña
            { id: 'carpetas', etiqueta: 'Carpetas en Drive', icono: 'folder-tree' },
            // El botón "Ver reporte" de la lista (Looker Studio): sin alcance, ningún CLIENT ve reportes (usuario, 14-oct)
            { id: 'reporte', etiqueta: 'Ver reporte (Looker Studio)', icono: 'bar-chart-3' },
          ],
        },
        // Catálogo de expedientes de compra por serie (índice de Adquisición Vehicular, solo
        // lectura), con su propio permiso desde el 14-oct-2026. También la pestaña "Adquisición"
        // de la ficha de un vehículo (buscar/ver su expediente): es su dato.
        { id: 'adquisicion-vehicular', etiqueta: 'Adquisición' },
        { id: 'cambios-vehiculos', etiqueta: 'Cambios Vehículos' },
        { id: 'reasignaciones-vehiculares', etiqueta: 'Reasignaciones Vehiculares' },
        { id: 'verificaciones', etiqueta: 'Verificaciones' },
        // Hoja INSPECCION VEHICULAR (290 registros, 195 columnas de checklist) +
        // MODELOS INSPECCION (18 diagramas por tipo de unidad), ver docs/mapeo-modulos.md
        { id: 'inspeccion-vehicular', etiqueta: 'Inspección Vehicular' },
        { id: 'instalacion-sensores', etiqueta: 'Instalación de Sensores', editaEn: [{ modulo: 'vehiculos', que: 'la sección «Accesorios y sensor» de la ficha' }] },
        { id: 'hologramas', etiqueta: 'Hologramas' },
        // Puente hacia Adquisición Vehicular (13-oct-2026): el expediente de una compra desde
        // el ticket, antes de que exista el vehículo -- solo ADMIN/SUPER por ahora (sin fila en
        // PERMISOS_SEMILLA, ver PermisosService.gs).
        { id: 'solicitud-compra', etiqueta: 'Solicitud de compra' },
        { id: 'sistemas-vehiculos', etiqueta: 'Sistemas - Control vehicular', soloEnlaces: true },
      ],
    },
    {
      id: 'lineas', etiqueta: 'Líneas', icono: 'smartphone',
      // Rama emmanuel: los módulos de Telefonía (ver html/js/lineas.html). "Detalles Líneas
      // Telefónicas" quedó como la vista de tarjetas de Líneas Telefónicas y Post Venta se retiró.
      // El inventario de accesorios es el de Líneas; el general ("accesorios", jorge) se retiró el 1-oct.
      modulos: [
        { id: 'panorama-lineas', etiqueta: 'Panorama de Líneas' },
        {
          id: 'lineas-telefonicas', etiqueta: 'Líneas Telefónicas', alcance: true,
          // Las pestañas de la ficha de un equipo o una línea (lineas.html, fichaEnPestanas)
          secciones: [
            { id: 'detalles', etiqueta: 'Detalles', icono: 'clipboard-list', alcance: true },
            // Inspecciones y responsivas (de la hoja y de la carpeta del NUCO). Sin alcance: el pasado del registro
            // puede ser de cuando era de otro departamento (usuario, 14-oct)
            { id: 'documentos', etiqueta: 'Documentos', icono: 'folder-check' },
            // Movimientos y asignaciones (números / NUCOs que tuvo)
            { id: 'historial', etiqueta: 'Historial', icono: 'history' },
            // Los bloques "Plan" y "Facturación" de la ficha (y el día de corte y las facturas que manda el servidor). Sin
            // alcance: ningún CLIENT los ve (usuario, 14-oct)
            { id: 'facturacion', etiqueta: 'Plan y facturación', icono: 'receipt' },
            // "Ver carpeta en Drive" del ⋮ de la ficha (la carpeta del NUCO): operación interna, sin alcance (usuario, 14-oct)
            { id: 'carpetas', etiqueta: 'Carpetas en Drive', icono: 'folder-tree' },
          ],
        },
        { id: 'resguardos-lineas', etiqueta: 'Resguardos y cancelaciones' },
        // TEMPORAL (30-sep): Líneas corrige los casos de la conciliación y después se elimina (LineasCorrecciones.gs)
        { id: 'correcciones-lineas', etiqueta: 'Correcciones de Líneas' },
        { id: 'accesorios-lineas', etiqueta: 'Inventario de Accesorios' },
        // Control de Cambios queda fuera del menú (30-sep). Reactivación, Solicitud, Reasignaciones y Desechos se
        // retiraron con sus pestañas (30-sep, reunión con Líneas).
        { id: 'cambios-lineas', etiqueta: 'Control de Cambios - Líneas' },
        { id: 'sistemas-lineas', etiqueta: 'Sistemas - Líneas', soloEnlaces: true },
      ],
    },
    {
      // Activos por colaborador de todas las áreas (fuera del grupo Líneas)
      id: 'gestion-activos', etiqueta: 'Gestión de Activos', icono: 'briefcase',
      modulos: [
        { id: 'gestion-activos', etiqueta: 'Gestión de Activos' },
      ],
    },
    {
      id: 'arqueos', etiqueta: 'Caja chica', icono: 'wallet',
      modulos: [
        { id: 'arqueos', etiqueta: 'Arqueos' },
        {
          id: 'caja-chica', etiqueta: 'Caja Chica', referencia: 'la lista de cajas chicas para elegir la caja',
          secciones: [
            { id: 'detalles', etiqueta: 'Detalles', icono: 'clipboard-list' },
            // Incrementos y decrementos del monto (su pantalla y la pestaña de la ficha)
            { id: 'cambios-monto', etiqueta: 'Cambios de monto', icono: 'repeat' },
          ],
        },
        // Lee la lista de cajas, que ya es de referencia para la familia
        { id: 'panorama-cajachica', etiqueta: 'Panorama de Caja Chica' },
        { id: 'sistemas-arqueos', etiqueta: 'Sistemas - Arqueos', soloEnlaces: true },
      ],
    },
    {
      // Enlaces a las encuestas y solicitudes de otras áreas
      id: 'encuestas-solicitudes', etiqueta: 'Encuestas/solicitudes', icono: 'clipboard-list',
      modulos: [
        { id: 'encuestas-solicitudes', etiqueta: 'Encuestas/solicitudes', soloEnlaces: true },
      ],
    },
    {
      id: 'uber', etiqueta: 'Uber', icono: 'car-taxi-front',
      modulos: [
        { id: 'uber', etiqueta: 'Uber' },
        {
          id: 'tickets', etiqueta: 'Tickets',
          // Los tickets del Help Desk ya registrados en Tickets (Help Desk › Registrados)
          secciones: [{ id: 'helpdesk', etiqueta: 'Registrados del Help Desk', icono: 'archive' }],
        },
      ],
    },
    {
      id: 'administracion', etiqueta: 'Administración', icono: 'settings',
      modulos: [
        { id: 'usuarios', etiqueta: 'Usuarios y permisos' },
        { id: 'relaciones', etiqueta: 'Datos conectados' },
        { id: 'salud', etiqueta: 'Salud' },
        // La lista de Capital Humano (COLABORADORES ACTUALIZADO): se sube aquí, no se pega (12-oct-2026)
        { id: 'capital-humano', etiqueta: 'Capital humano' },
      ],
    },
  ];

  /** La sección que tiene todo módulo con lista (menos los de solo enlaces) */
  const EXPORTAR = { id: 'exportar', etiqueta: 'Exportar a Excel', icono: 'file-spreadsheet' };
  const SEPARADOR = '.';

  /** Los módulos (raíces del árbol), sin sus secciones */
  const todos = () => GRUPOS.reduce((acumulado, g) => acumulado.concat(g.modulos), []);

  /**
   * Todos los nodos que se pueden permitir, cada módulo seguido de sus secciones (el padre
   * siempre antes que sus hijos: Permisos.resolver_ los recorre en este orden).
   * { id, etiqueta, padre, modulo, hereda, antes, icono, … }
   */
  let nodos_ = null;
  function nodos() {
    if (nodos_) return nodos_;   // el catálogo no cambia mientras corre
    const lista = [];
    todos().forEach((m) => {
      lista.push(Object.assign({}, m, { padre: null, modulo: m.id, hereda: true }));
      seccionesDe_(m).forEach((s) => lista.push({
        id: m.id + SEPARADOR + s.id, seccion: s.id, etiqueta: s.etiqueta, icono: s.icono || '',
        padre: m.id, modulo: m.id, hereda: s.hereda !== false, antes: s.antes || '',
        // exportar respeta el alcance si su módulo lo respeta (exporta lo mismo que la lista); las demás, lo suyo
        alcance: s === EXPORTAR ? !!m.alcance : !!s.alcance,
      }));
    });
    nodos_ = lista;
    return lista;
  }
  function seccionesDe_(m) {
    return (m.secciones || []).concat(m.soloEnlaces ? [] : [EXPORTAR]);
  }

  const ids = () => nodos().map((n) => n.id);
  /** ¿Lo puede tener quien está limitado a lo de su área? (alcance: true, o solo enlaces: no trae datos) */
  const respetaAlcance = (id) => { const n = nodos().find((x) => x.id === id); return !!n && (!!n.alcance || !!n.soloEnlaces); };
  const nodo = (id) => nodos().find((n) => n.id === id) || null;
  const padre = (id) => (nodo(id) || {}).padre || null;
  /** El módulo de un nodo: él mismo, o el de su sección */
  const raiz = (id) => (nodo(id) || {}).modulo || String(id || '').split(SEPARADOR)[0];
  /** Las secciones de un módulo, como nodos */
  const secciones = (modulo) => nodos().filter((n) => n.padre === modulo);

  /** "Vehículos" o "Vehículos › Documentos" */
  function etiqueta(id) {
    const n = nodo(id);
    if (!n) return id;
    return n.padre ? (nodo(n.padre) || {}).etiqueta + ' › ' + n.etiqueta : n.etiqueta;
  }

  /** Sin acentos, minúsculas y con un solo espacio: para comparar lo que alguien escribió */
  function normalizar_(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[\s_-]+/g, ' ');
  }

  /**
   * Lo que se escribió en la hoja → id del nodo, o null si no corresponde a ninguno.
   * Acepta el id ("reasignaciones-lineas", "vehiculos.documentos"), el nombre que se ve en el
   * menú ("Control de Cambios - Líneas", "Vehículos › Documentos") y el id viejo de un nodo
   * (`antes`: "responsiva-vehicular"), sin importar acentos ni mayúsculas: nadie tiene por qué
   * memorizar los ids internos.
   */
  let nombres_ = null;
  function resolver(texto) {
    const buscado = normalizar_(texto);
    if (!buscado) return null;
    if (!nombres_) {
      // Cada forma de escribir un nodo → su id (se arma una vez)
      nombres_ = {};
      nodos().slice().reverse().forEach((n) => {
        [n.id, etiqueta(n.id), n.padre ? '' : n.etiqueta, n.antes].filter(Boolean)
          .forEach((t) => { nombres_[normalizar_(t)] = n.id; });
      });
    }
    return nombres_[buscado] || null;
  }

  const existe = (texto) => resolver(texto) !== null;

  /**
   * La familia de un módulo: los módulos de su mismo grupo del menú (Servicios Vehiculares,
   * Arqueos y Caja Chica…). Sirve para los datos de referencia que toda la familia necesita
   * para trabajar: el catálogo de vehículos para elegir la unidad en Sensores, la lista de
   * cajas para Arqueos (Permisos.puedeLeerFamilia). Solo módulos (las secciones van con el suyo).
   */
  function familia(id) {
    const modulo = raiz(id);
    const grupo = GRUPOS.find((g) => g.modulos.some((m) => m.id === modulo));
    // Los de soloEnlaces no cuentan: ver la pantalla de Sistemas no abre el catálogo de su grupo
    return grupo ? grupo.modulos.filter((m) => !m.soloEnlaces || m.id === modulo).map((m) => m.id) : [modulo];
  }

  return { GRUPOS, todos, nodos, ids, nodo, padre, raiz, secciones, existe, etiqueta, resolver, familia, respetaAlcance, SEPARADOR };
})();

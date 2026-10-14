/**
 * Modulos.gs
 * Catálogo único de módulos del sistema: el id es el que se usa en TODOS lados
 * (el menú del cliente, la hoja PERFILES y las llamadas a Permisos.exigir).
 *
 * Tener el catálogo aquí evita el problema clásico de los permisos: que alguien escriba
 * "Vehiculos" en la hoja y el módulo se llame "vehiculos", y el permiso no aplique nunca
 * sin que nadie se entere. `Permisos.revisarCatalogo()` reporta esos casos.
 *
 * Además de id y etiqueta, un módulo puede decir lo que su permiso implica fuera de su pantalla
 * (la pantalla de Usuarios y permisos lo explica con esto, sin frases escritas a mano):
 *   referencia  qué consulta toda su FAMILIA (su grupo del menú) aunque no tenga este módulo:
 *               es lo que el servidor marca `referencia: true` (HojaServicio). P. ej. el catálogo
 *               de vehículos, que Sensores necesita para elegir la unidad.
 *   editaEn     [{ modulo, que }]: partes de OTRO módulo que solo edita quien tiene EDICION en
 *               este: lo que el servidor marca `deOtroModulo` en la hoja de `modulo`. P. ej. la
 *               sección de sensor de la ficha de Vehículos es de Instalación de Sensores.
 *   enFicha     id del módulo en cuya ficha vive como pestaña, cuando no tiene pantalla propia
 *               (Responsiva y Adherente están en la ficha de Vehículos); con `icono`, el de su pestaña.
 *   soloEnlaces su pantalla solo tiene enlaces a otros sistemas (Sistemas, Encuestas): no cuenta
 *               como de la familia, así que no abre los datos de referencia de su grupo.
 *
 * Cada entrada del menú tiene su propio módulo (14-oct-2026): los panoramas, Sistemas y Encuestas
 * ya no cuelgan de otro permiso ni se ven sin él. permisosSepararModulos() (PermisosService.gs)
 * copió los permisos de entonces para que nadie perdiera nada.
 * `source-contracts` revisa que esto y el servidor digan lo mismo.
 */

const Modulos = (function () {
  const GRUPOS = [
    {
      id: 'servicios-vehiculares', etiqueta: 'Servicios Vehiculares', icono: 'car',
      modulos: [
        // El resumen de la flota (lee la lista de Vehículos: VehiculosService.RESUMEN.leenTambien)
        { id: 'panorama-vehiculos', etiqueta: 'Panorama de Vehículos', listo: true },
        { id: 'incidencias', etiqueta: 'Incidencias', listo: true },
        { id: 'vehiculos', etiqueta: 'Vehículos', listo: true, referencia: 'el catálogo de vehículos para elegir la unidad' },
        // Catálogo de expedientes de compra por serie (índice de Adquisición Vehicular, solo
        // lectura). Antes vivía dentro del permiso de Vehículos; ahora tiene su propio permiso
        // (14-oct-2026) para poder asignarse aparte desde la Matriz, como Reasignaciones. También
        // la pestaña "Adquisición" de la ficha de un vehículo (buscar/ver su expediente).
        { id: 'adquisicion-vehicular', etiqueta: 'Adquisición', listo: true },
        { id: 'cambios-vehiculos', etiqueta: 'Cambios Vehículos' },
        { id: 'reasignaciones-vehiculares', etiqueta: 'Reasignaciones Vehiculares' },
        { id: 'responsiva-vehicular', etiqueta: 'Responsiva Vehicular', listo: true, enFicha: 'vehiculos', icono: 'file-signature' },
        { id: 'adherente-vehicular', etiqueta: 'Adherente Vehicular', listo: true, enFicha: 'vehiculos', icono: 'users' },
        { id: 'verificaciones', etiqueta: 'Verificaciones', listo: true },
        // Hoja INSPECCION VEHICULAR (290 registros, 195 columnas de checklist) +
        // MODELOS INSPECCION (18 diagramas por tipo de unidad), ver docs/mapeo-modulos.md
        { id: 'inspeccion-vehicular', etiqueta: 'Inspección Vehicular' },
        { id: 'instalacion-sensores', etiqueta: 'Instalación de Sensores', listo: true, editaEn: [{ modulo: 'vehiculos', que: 'la sección «Accesorios y sensor» de la ficha' }] },
        { id: 'hologramas', etiqueta: 'Hologramas', listo: true },
        // Puente hacia Adquisición Vehicular (13-oct-2026): el expediente de una compra desde
        // el ticket, antes de que exista el vehículo -- solo ADMIN/SUPER por ahora (sin fila en
        // PERMISOS_SEMILLA, ver PermisosService.gs).
        { id: 'solicitud-compra', etiqueta: 'Solicitud de compra', listo: true },
        { id: 'sistemas-vehiculos', etiqueta: 'Sistemas - Control vehicular', listo: true, soloEnlaces: true },
      ],
    },
    {
      id: 'lineas', etiqueta: 'Líneas', icono: 'smartphone',
      // Rama emmanuel: los módulos de Telefonía (ver html/js/lineas.html). "Detalles Líneas
      // Telefónicas" quedó como la vista de tarjetas de Líneas Telefónicas y Post Venta se retiró.
      // El inventario de accesorios es el de Líneas; el general ("accesorios", jorge) se retiró el 1-oct.
      modulos: [
        { id: 'panorama-lineas', etiqueta: 'Panorama de Líneas', listo: true },
        { id: 'lineas-telefonicas', etiqueta: 'Líneas Telefónicas', listo: true },
        { id: 'resguardos-lineas', etiqueta: 'Resguardos y cancelaciones', listo: true },
        // TEMPORAL (30-sep): Líneas corrige los casos de la conciliación y después se elimina (LineasCorrecciones.gs)
        { id: 'correcciones-lineas', etiqueta: 'Correcciones de Líneas', listo: true },
        { id: 'accesorios-lineas', etiqueta: 'Inventario de Accesorios', listo: true },
        // Adendums y facturas del mes (parte 7, 7-oct): solo para quienes los piden al proveedor
        { id: 'proveedor-lineas', etiqueta: 'Proveedor', listo: true },
        // Control de Cambios queda fuera del menú (30-sep). Reactivación, Solicitud, Reasignaciones y Desechos se
        // retiraron con sus pestañas (30-sep, reunión con Líneas).
        { id: 'cambios-lineas', etiqueta: 'Control de Cambios - Líneas', listo: true },
        { id: 'sistemas-lineas', etiqueta: 'Sistemas - Líneas', listo: true, soloEnlaces: true },
      ],
    },
    {
      // Activos por colaborador de todas las áreas (fuera del grupo Líneas)
      id: 'gestion-activos', etiqueta: 'Gestión de Activos', icono: 'briefcase',
      modulos: [
        { id: 'gestion-activos', etiqueta: 'Gestión de Activos', listo: true },
      ],
    },
    {
      id: 'arqueos', etiqueta: 'Arqueos', icono: 'wallet',
      modulos: [
        { id: 'arqueos', etiqueta: 'Arqueos' },
        { id: 'caja-chica', etiqueta: 'Caja Chica', referencia: 'la lista de cajas chicas para elegir la caja' },
        // Lee la lista de cajas, que ya es de referencia para la familia
        { id: 'panorama-cajachica', etiqueta: 'Panorama de Caja Chica' },
        { id: 'sistemas-arqueos', etiqueta: 'Sistemas - Arqueos', soloEnlaces: true },
      ],
    },
    {
      // Enlaces a las encuestas y solicitudes de otras áreas
      id: 'encuestas-solicitudes', etiqueta: 'Encuestas/solicitudes', icono: 'clipboard-list',
      modulos: [
        { id: 'encuestas-solicitudes', etiqueta: 'Encuestas/solicitudes', listo: true, soloEnlaces: true },
      ],
    },
    {
      id: 'uber', etiqueta: 'Uber', icono: 'car-taxi-front',
      modulos: [
        { id: 'uber', etiqueta: 'Uber' },
        { id: 'tickets', etiqueta: 'Tickets' },
      ],
    },
    {
      id: 'administracion', etiqueta: 'Administración', icono: 'settings',
      modulos: [
        { id: 'usuarios', etiqueta: 'Usuarios y permisos', listo: true },
        { id: 'relaciones', etiqueta: 'Datos conectados', listo: true },
        { id: 'salud', etiqueta: 'Salud', listo: true },
        // La lista de Capital Humano (COLABORADORES ACTUALIZADO): se sube aquí, no se pega (12-oct-2026)
        { id: 'capital-humano', etiqueta: 'Capital humano', listo: true },
      ],
    },
  ];

  const todos = () => GRUPOS.reduce((acumulado, g) => acumulado.concat(g.modulos), []);
  const ids = () => todos().map((m) => m.id);
  const etiqueta = (id) => (todos().find((m) => m.id === id) || {}).etiqueta || id;

  /** Sin acentos, minúsculas y con un solo espacio: para comparar lo que alguien escribió */
  function normalizar_(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[\s_-]+/g, ' ');
  }

  /**
   * Lo que se escribió en la hoja → id del módulo, o null si no corresponde a ninguno.
   * Acepta el id ("reasignaciones-lineas") y también el nombre que se ve en el menú
   * ("Control de Reasignaciones - Líneas"), sin importar acentos ni mayúsculas: nadie
   * tiene por qué memorizar los ids internos.
   */
  function resolver(texto) {
    const buscado = normalizar_(texto);
    if (!buscado) return null;
    const encontrado = todos().find((m) => normalizar_(m.id) === buscado || normalizar_(m.etiqueta) === buscado);
    return encontrado ? encontrado.id : null;
  }

  const existe = (texto) => resolver(texto) !== null;

  /**
   * La familia de un módulo: los módulos de su mismo grupo del menú (Servicios Vehiculares,
   * Arqueos y Caja Chica…). Sirve para los datos de referencia que toda la familia necesita
   * para trabajar: el catálogo de vehículos para elegir la unidad en Sensores, la lista de
   * cajas para Arqueos (Permisos.puedeLeerFamilia).
   */
  function familia(id) {
    const grupo = GRUPOS.find((g) => g.modulos.some((m) => m.id === id));
    // Los de soloEnlaces no cuentan: ver la pantalla de Sistemas no abre el catálogo de su grupo
    return grupo ? grupo.modulos.filter((m) => !m.soloEnlaces || m.id === id).map((m) => m.id) : [id];
  }

  return { GRUPOS, todos, ids, existe, etiqueta, resolver, familia };
})();

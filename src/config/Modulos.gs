/**
 * Modulos.gs
 * Catálogo único de módulos del sistema: el id es el que se usa en TODOS lados
 * (el menú del cliente, la hoja PERFILES y las llamadas a Permisos.exigir).
 *
 * Tener el catálogo aquí evita el problema clásico de los permisos: que alguien escriba
 * "Vehiculos" en la hoja y el módulo se llame "vehiculos", y el permiso no aplique nunca
 * sin que nadie se entere. `Permisos.revisarCatalogo()` reporta esos casos.
 */

const Modulos = (function () {
  const GRUPOS = [
    {
      id: 'servicios-vehiculares', etiqueta: 'Servicios Vehiculares', icono: 'car',
      modulos: [
        { id: 'incidencias', etiqueta: 'Incidencias', listo: true },
        { id: 'vehiculos', etiqueta: 'Vehículos', listo: true },
        { id: 'cambios-vehiculos', etiqueta: 'Cambios Vehículos' },
        { id: 'reasignaciones-vehiculares', etiqueta: 'Reasignaciones Vehiculares' },
        { id: 'verificaciones', etiqueta: 'Verificaciones', listo: true },
        // Hoja INSPECCION VEHICULAR (290 registros, 195 columnas de checklist) +
        // MODELOS INSPECCION (18 diagramas por tipo de unidad), ver docs/mapeo-modulos.md
        { id: 'inspeccion-vehicular', etiqueta: 'Inspección Vehicular' },
        { id: 'instalacion-sensores', etiqueta: 'Instalación de Sensores', listo: true },
        { id: 'hologramas', etiqueta: 'Hologramas', listo: true },
      ],
    },
    {
      id: 'lineas', etiqueta: 'Líneas', icono: 'smartphone',
      // Rama emmanuel: los módulos de Telefonía (ver html/js/lineas.html). "Detalles Líneas
      // Telefónicas" quedó como la vista de tarjetas de Líneas Telefónicas y Post Venta se retiró.
      modulos: [
        { id: 'lineas-telefonicas', etiqueta: 'Líneas Telefónicas', listo: true },
        { id: 'accesorios-lineas', etiqueta: 'Inventario de Accesorios (Líneas)', listo: true },
        { id: 'reactivacion-lineas', etiqueta: 'Reactivación de Líneas', listo: true },
        { id: 'reasignaciones-lineas', etiqueta: 'Control de Reasignaciones - Líneas', listo: true },
        { id: 'solicitud-lineas', etiqueta: 'Solicitud de Líneas', listo: true },
        { id: 'cambios-lineas', etiqueta: 'Control de Cambios - Líneas', listo: true },
        { id: 'bitacora-desechos', etiqueta: 'Bitácora de Desechos', listo: true },
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
        { id: 'caja-chica', etiqueta: 'Caja Chica' },
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
        { id: 'usuarios', etiqueta: 'Usuarios y permisos' },
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

  return { GRUPOS, todos, ids, existe, etiqueta, resolver };
})();

/**
 * PermisosSemilla.gs
 * Los permisos de AppSheet traducidos a la app: quién VE cada módulo (las reglas de
 * visibilidad de cada vista) y quién lo EDITA (las reglas de cada tabla).
 *
 * Es la fuente cuando la hoja PERMISOS no existe, y lo que `permisosCrearHoja()` escribe
 * al crearla. Una vez creada, manda la hoja: esto ya no se lee.
 *
 * Cada renglón es [QUIEN, MODULO, PERMISO, NOTA]. QUIEN es un AREA de USUARIOS o un correo.
 * Las filas de área son la base; las de correo la reemplazan, módulo por módulo (ver
 * PermisosService.gs). ADMIN y SUPER no aparecen: entran a todo por código.
 *
 * Lo que se decidió al traducir (oct-2026):
 * - "Solo permite agregar" (Cambios Vehículos, Reasignaciones) quedó en EDICION: aquí no hay
 *   un nivel intermedio.
 * - Los correos de las listas que ya no están en USUARIOS se omitieron: no colaboran con
 *   nosotros. En la lista de Inspección Vehicular faltaba una coma antes de especialista.ci,
 *   y se respetó la intención: sí edita.
 * - Los módulos que nacieron aquí heredan de su padre: Panorama de Líneas, Resguardos y
 *   Correcciones = Líneas Telefónicas; Datos conectados y Salud = CONFIGURACIONES. (Los
 *   panoramas de Vehículos y Caja Chica no son módulos: el menú los cuelga de su padre.)
 * - Servicios, Solicitud, Reactivación, Reasignaciones de líneas, Desechos, Post Venta y
 *   Dashboards ya no existen; POST VENTA se quedó sin módulos.
 */

const PERMISOS_SEMILLA = (function () {
  const ANALISIS = 'ANALISIS DE DATOS';
  const SERVICIOS = 'SERVICIOS VEHICULARES';
  const CONTROL = 'CONTROL VEHICULAR';
  const CI = 'CI';
  const AUDITORIAS = 'AUDITORIAS';
  const LINEAS = 'LINEAS';

  const EJECUTIVO_GYA = 'ejecutivogestionyadquisicionvehicular.ci@ciudadmaderas.com';
  const ESPECIALISTA_CI = 'especialista.ci@ciudadmaderas.com';
  const GESTOR = 'gestor.vehicular@ciudadmaderas.com';
  const INSPECCIONES = 'especialistainspecciones.ci@ciudadmaderas.com';
  const COORD_AUDITORIA = 'coordauditoriaycalidad.ci@ciudadmaderas.com';

  const filas = [];
  /** Un mismo permiso para varios QUIEN en varios módulos */
  const dar = (modulos, quienes, permiso, nota) => {
    modulos.forEach((m) => quienes.forEach((q) => filas.push([q, m, permiso, nota])));
  };

  dar(['incidencias'], [ANALISIS, SERVICIOS], 'EDICION', 'AppSheet: INCIDENCIAS');
  dar(['vehiculos'], [ANALISIS, CI, SERVICIOS, CONTROL, AUDITORIAS], 'EDICION', 'AppSheet: VEHICULOS');
  dar(['cambios-vehiculos'], [ANALISIS, SERVICIOS, CI], 'EDICION', 'AppSheet: CAMBIOS VEHICULOS (solo agregar)');
  dar(['reasignaciones-vehiculares'], [ANALISIS, CI, SERVICIOS, CONTROL, AUDITORIAS], 'EDICION',
    'AppSheet: REASIGNACIONES VEHICULARES (solo agregar)');

  // Verificaciones: la ven cuatro áreas, pero la tabla solo la editaba una lista de correos
  dar(['verificaciones'], [ANALISIS, CI, SERVICIOS, CONTROL], 'LECTURA', 'AppSheet: VERIFICACIONES (ver)');
  dar(['verificaciones'], [ESPECIALISTA_CI, GESTOR, EJECUTIVO_GYA], 'EDICION', 'AppSheet: tabla VERIFICACIONES (editar)');

  dar(['inspeccion-vehicular'], [INSPECCIONES, ESPECIALISTA_CI], 'EDICION', 'AppSheet: INSPECCIONES VEHICULARES');
  dar(['instalacion-sensores'], [ANALISIS, CI], 'EDICION', 'AppSheet: INSTALACION DE SENSORES');
  dar(['hologramas'], [ANALISIS, CI], 'EDICION', 'AppSheet: HOLOGRAMAS');

  // Líneas: la tabla LINEAS TELEFONICAS solo la editaba una lista, que del área LINEAS incluye a los 3
  const MODULOS_LINEAS = ['lineas-telefonicas', 'panorama-lineas', 'resguardos-lineas', 'correcciones-lineas'];
  dar(MODULOS_LINEAS, [ANALISIS, COORD_AUDITORIA], 'LECTURA', 'AppSheet: LINEAS TELEFONICAS (ver)');
  dar(MODULOS_LINEAS, [LINEAS], 'EDICION', 'AppSheet: tabla LINEAS TELEFONICAS (editar)');
  dar(['accesorios-lineas'], [ANALISIS], 'LECTURA', 'AppSheet: INVENTARIO DE ACCESORIOS (ver)');
  dar(['accesorios-lineas'], [LINEAS], 'EDICION', 'AppSheet: tabla ACCESORIOS CELULARES (editar)');
  dar(['cambios-lineas'], [ANALISIS, LINEAS], 'EDICION', 'AppSheet: CONTROL DE CAMBIOS - LINEAS');

  // Gestión de Activos solo se ve; editar equipos y líneas lo decide lineas-telefonicas
  dar(['gestion-activos'], [
    'especialistaservicios.ci@ciudadmaderas.com', 'ecajachica.ci@ciudadmaderas.com', ESPECIALISTA_CI, GESTOR,
    'ejecutivotelefonia.ci@ciudadmaderas.com', 'auxiliar3procesos.ci@ciudadmaderas.com',
  ], 'LECTURA', 'AppSheet: GESTION DE ACTIVOS');

  dar(['arqueos', 'caja-chica'], [CI, ANALISIS], 'EDICION', 'AppSheet: ARQUEOS / CAJA CHICA');
  dar(['arqueos', 'caja-chica'], [EJECUTIVO_GYA], 'NINGUNO', 'AppSheet: ARQUEOS / CAJA CHICA lo excluyen');
  dar(['tickets', 'uber'], [ANALISIS, CI, EJECUTIVO_GYA], 'EDICION', 'AppSheet: TICKETS / UBER');
  dar(['relaciones', 'salud'], [ANALISIS, SERVICIOS], 'EDICION', 'AppSheet: CONFIGURACIONES');

  return filas;
})();

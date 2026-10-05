/**
 * ReasignacionesVehicularesService.gs
 * Historial de cambio de responsable de un vehículo — referencia el Folio
 * del catálogo de Vehículos.
 *
 * Columnas reales (12): ID | Folio Vehiculo | Fecha de Reasignacion | VIN | NUCO |
 *   No Empleado Saliente | Responsable Saliente | Departamento Saliente |
 *   No Empleado Entrante | Responsable Entrante | Departamento Entrante | QUIEN REGISTRO
 *
 * A propósito, es un registro de solo alta (no se edita): cambiar a mano
 * una reasignación ya guardada desincronizaría el historial del responsable
 * ACTUAL real del vehículo. Sí se puede eliminar (solo ADMIN), para
 * corregir un error de captura.
 *
 * VIN, NUCO y los 3 campos "Saliente" NO los manda el cliente — se leen
 * aquí siempre del registro ACTUAL del vehículo (VehiculosService.buscarPorFolio),
 * no de lo que el cliente tenga cacheado en el formulario, por si ya cambió.
 * FECHA (si no se manda) y QUIEN REGISTRO tampoco: "ahora" y la sesión.
 *
 * Dar de alta una reasignación también actualiza RESPONSABLE VEHICULO / NO
 * EMPLEADO / DEPARTAMENTO del vehículo en la misma operación (bajo candado,
 * para que dos reasignaciones simultáneas al mismo vehículo no se pisen) —
 * vía VehiculosService.actualizar(), que de paso ya deja su propio rastro en
 * Cambios Vehículos automáticamente, sin duplicar esa lógica aquí.
 */

const ReasignacionesVehicularesService = (function () {
  /** La hoja, para HojaServicio */
  const REASIGNACIONES = {
    modulo: 'reasignaciones-vehiculares',
    libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    hoja: 'REASIGNACIONES_VEHICULOS',
    columnas: [
      'ID', 'Folio Vehiculo', 'Fecha de Reasignacion', 'VIN', 'NUCO',
      'No Empleado Saliente', 'Responsable Saliente', 'Departamento Saliente',
      'No Empleado Entrante', 'Responsable Entrante', 'Departamento Entrante', 'QUIEN REGISTRO',
    ],
    fila: (r) => ({
      ID: r['ID'],
      FOLIO_VEHICULO: r['Folio Vehiculo'] || '',
      FECHA: HojaServicio.fechaISO(r['Fecha de Reasignacion']),
      VIN: r['VIN'] || '',
      NUCO: r['NUCO'] || '',
      NO_EMPLEADO_SALIENTE: r['No Empleado Saliente'] || '',
      RESPONSABLE_SALIENTE: r['Responsable Saliente'] || '',
      DEPARTAMENTO_SALIENTE: r['Departamento Saliente'] || '',
      NO_EMPLEADO_ENTRANTE: r['No Empleado Entrante'] || '',
      RESPONSABLE_ENTRANTE: r['Responsable Entrante'] || '',
      DEPARTAMENTO_ENTRANTE: r['Departamento Entrante'] || '',
      QUIEN_REGISTRO: r['QUIEN REGISTRO'] || '',
    }),
    orden: { campo: 'FECHA', desc: true },
  };

  /**
   * Registra una reasignación de vehículo y, en la misma operación, actualiza el
   * responsable/departamento ACTUAL de ese vehículo. Escrito a mano y no con
   * HojaServicio.crear: son dos hojas que tienen que cambiar juntas, bajo el mismo candado.
   */
  function crear(token, datos) {
    const sesion = Permisos.puedeEditar(token, 'reasignaciones-vehiculares');
    const folio = datos['Folio Vehiculo'];
    if (!folio) throw new Error('Selecciona el vehículo (Folio).');
    const responsableEntrante = String(datos['Responsable Entrante'] || '').trim();
    if (!responsableEntrante) throw new Error('Captura el responsable entrante.');

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const vehiculo = VehiculosService.buscarPorFolio(token, folio);
      if (!vehiculo) throw new Error('No se encontró el vehículo con Folio=' + folio);

      // Se valida antes de escribir nada: si el vehículo no tuviera ID, el update de abajo
      // tronaría DESPUÉS de insertar esta fila (reasignación escrita, vehículo sin actualizar).
      const idVehiculo = vehiculo['ID'];
      if (!idVehiculo) {
        throw new Error('El vehículo con Folio=' + folio + ' no tiene ID. Corre el ' +
          'pipeline de IDs sobre este libro antes de registrar reasignaciones.');
      }

      const fila = {
        'ID': Ids.nuevo(Entidades.prefijo('REASIGNACIONES_VEHICULOS')),
        // La llave foránea de verdad. El folio se guarda también, para que la hoja se lea,
        // pero sale del vehículo encontrado y no de lo que mandó el navegador.
        'ID VEHICULO': idVehiculo,
        'Folio Vehiculo': vehiculo['FOLIO'] || folio,
        'Fecha de Reasignacion': HojaServicio.fechaDeEntrada(datos['Fecha de Reasignacion']) || new Date(),
        'VIN': vehiculo['SERIE VEHICULO'] || '',
        'NUCO': vehiculo['NUCCO'] || '',
        'No Empleado Saliente': vehiculo['NO EMPLEADO'] || '',
        'Responsable Saliente': vehiculo['RESPONSABLE VEHICULO'] || '',
        'Departamento Saliente': vehiculo['DEPARTAMENTO'] || '',
        'No Empleado Entrante': datos['No Empleado Entrante'] || '',
        'Responsable Entrante': responsableEntrante,
        'Departamento Entrante': datos['Departamento Entrante'] || '',
        'QUIEN REGISTRO': sesion.nombre,
      };
      SheetUtils.insert(HojaServicio.libro(REASIGNACIONES), REASIGNACIONES.hoja, fila);

      // candadoTomado: este hilo ya tiene el candado del script (arriba), y waitLock no es
      // reentrante — sin avisarlo, la propagación esperaba 20 s y moría en silencio.
      VehiculosService.actualizar(token, idVehiculo, {
        'RESPONSABLE VEHICULO': fila['Responsable Entrante'],
        'NO EMPLEADO': fila['No Empleado Entrante'],
        'DEPARTAMENTO': fila['Departamento Entrante'] || vehiculo['DEPARTAMENTO'],
      }, { candadoTomado: true });

      return { ID: fila['ID'] };
    } finally {
      lock.releaseLock();
    }
  }

  return {
    /** Historial completo (ya son solo 12 columnas, no hace falta un "resumen" más ligero) */
    listarResumen: (token) => HojaServicio.listar(REASIGNACIONES, token),
    /** Todas las columnas de la hoja (para "Vista": mostrar/exportar cualquier columna) */
    completo: (token) => HojaServicio.completo(REASIGNACIONES, token),
    crear,
    eliminar: (token, id) => HojaServicio.eliminar(REASIGNACIONES, token, id),
    /** Historial de reasignaciones de UN vehículo (para enlazarlo desde el detalle de Vehículos) */
    listarPorFolio: (token, folio) => HojaServicio.listarPor(REASIGNACIONES, token, 'FOLIO_VEHICULO', folio),
  };
})();

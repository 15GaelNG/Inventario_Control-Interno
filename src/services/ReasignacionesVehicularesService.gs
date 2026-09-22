/**
 * ReasignacionesVehicularesService.gs
 * Historial de cambio de responsable de un vehículo — referencia el Folio
 * del catálogo de Vehículos. Vive en el mismo spreadsheet original de
 * AppSheet que el resto de los módulos — la pestaña real se ubica por firma
 * de columnas, no por nombre fijo (ojo: la hoja de reasignaciones de
 * LÍNEAS TELEFÓNICAS usa casi los mismos nombres de columna — "VIN" y
 * "Folio Vehiculo" son las únicas que solo tiene esta, por eso van en la firma).
 *
 * Columnas reales (12): ID Reasignacion Vehicular | Folio Vehiculo | Fecha
 *   de Reasignacion | VIN | NUCO | No Empleado Saliente | Responsable
 *   Saliente | Departamento Saliente | No Empleado Entrante | Responsable
 *   Entrante | Departamento Entrante | QUIEN REGISTRO
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
  const COLUMNAS_FIRMA = ['Folio Vehiculo', 'VIN', 'No Empleado Saliente', 'Responsable Saliente'];
  const ID_COLUMN = 'ID Reasignacion Vehicular';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function hoja_() {
    return SheetUtils.getSheetByColumns(ssId(), COLUMNAS_FIRMA);
  }

  function fechaISO_(valor) {
    if (!valor) return '';
    const f = valor instanceof Date ? valor : new Date(valor);
    return isNaN(f.getTime()) ? '' : f.toISOString();
  }

  const COLUMNAS_RESUMEN = [
    ID_COLUMN, 'Folio Vehiculo', 'Fecha de Reasignacion', 'VIN', 'NUCO',
    'No Empleado Saliente', 'Responsable Saliente', 'Departamento Saliente',
    'No Empleado Entrante', 'Responsable Entrante', 'Departamento Entrante', 'QUIEN REGISTRO',
  ];

  /** Historial completo (ya son solo 12 columnas, no hace falta un "resumen" más ligero). */
  function listarResumen(token) {
    Auth.validarSesion(token);
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_RESUMEN);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      if (!datos[ID_COLUMN][i]) continue;
      resultado.push({
        ID: datos[ID_COLUMN][i],
        FOLIO_VEHICULO: datos['Folio Vehiculo'][i] || '',
        FECHA: fechaISO_(datos['Fecha de Reasignacion'][i]),
        VIN: datos['VIN'][i] || '',
        NUCO: datos['NUCO'][i] || '',
        NO_EMPLEADO_SALIENTE: datos['No Empleado Saliente'][i] || '',
        RESPONSABLE_SALIENTE: datos['Responsable Saliente'][i] || '',
        DEPARTAMENTO_SALIENTE: datos['Departamento Saliente'][i] || '',
        NO_EMPLEADO_ENTRANTE: datos['No Empleado Entrante'][i] || '',
        RESPONSABLE_ENTRANTE: datos['Responsable Entrante'][i] || '',
        DEPARTAMENTO_ENTRANTE: datos['Departamento Entrante'][i] || '',
        QUIEN_REGISTRO: datos['QUIEN REGISTRO'][i] || '',
      });
    }
    return resultado.sort((a, b) => new Date(b.FECHA) - new Date(a.FECHA));
  }

  /**
   * Registra una reasignación de vehículo y, en la misma operación,
   * actualiza el responsable/departamento ACTUAL de ese vehículo.
   */
  function crear(token, datos) {
    const sesion = Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    const folio = datos['Folio Vehiculo'];
    if (!folio) throw new Error('Selecciona el vehículo (Folio).');
    const responsableEntrante = String(datos['Responsable Entrante'] || '').trim();
    if (!responsableEntrante) throw new Error('Captura el responsable entrante.');

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const vehiculo = VehiculosService.buscarPorFolio(token, folio);
      if (!vehiculo) throw new Error('No se encontró el vehículo con Folio=' + folio);

      const fila = {};
      fila[ID_COLUMN] = Utilities.getUuid().slice(0, 8);
      fila['Folio Vehiculo'] = folio;
      fila['Fecha de Reasignacion'] = datos['Fecha de Reasignacion'] ? new Date(datos['Fecha de Reasignacion']) : new Date();
      fila['VIN'] = vehiculo['SERIE VEHICULO'] || '';
      fila['NUCO'] = vehiculo['NUCCO'] || '';
      fila['No Empleado Saliente'] = vehiculo['NO EMPLEADO'] || '';
      fila['Responsable Saliente'] = vehiculo['RESPONSABLE VEHICULO'] || '';
      fila['Departamento Saliente'] = vehiculo['DEPARTAMENTO'] || '';
      fila['No Empleado Entrante'] = datos['No Empleado Entrante'] || '';
      fila['Responsable Entrante'] = responsableEntrante;
      fila['Departamento Entrante'] = datos['Departamento Entrante'] || '';
      fila['QUIEN REGISTRO'] = sesion.nombre;

      SheetUtils.insert(ssId(), hoja_().getName(), fila);

      VehiculosService.actualizar(token, vehiculo.ID_VEHICULO, {
        'RESPONSABLE VEHICULO': fila['Responsable Entrante'],
        'NO EMPLEADO': fila['No Empleado Entrante'],
        'DEPARTAMENTO': fila['Departamento Entrante'] || vehiculo['DEPARTAMENTO'],
      });

      return { ID: fila[ID_COLUMN] };
    } finally {
      lock.releaseLock();
    }
  }

  function eliminar(token, id) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    const ok = SheetUtils.remove(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!ok) throw new Error('No se encontró el registro con ID=' + id);
    return { ID: id };
  }

  /** Historial de reasignaciones de UN vehículo (para enlazarlo desde el
   * detalle de Vehículos) — mismo criterio que
   * CambiosVehiculosService.listarPorFolio: recorre de abajo hacia arriba
   * y filtra por folio, en vez de traer todo el historial completo. */
  function listarPorFolio(token, folio) {
    Auth.validarSesion(token);
    if (!folio) return [];
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_RESUMEN);

    const resultado = [];
    for (let i = filas - 1; i >= 0; i--) {
      if (!datos[ID_COLUMN][i]) continue;
      if (String(datos['Folio Vehiculo'][i] || '') !== String(folio)) continue;
      resultado.push({
        ID: datos[ID_COLUMN][i],
        FOLIO_VEHICULO: datos['Folio Vehiculo'][i] || '',
        FECHA: fechaISO_(datos['Fecha de Reasignacion'][i]),
        VIN: datos['VIN'][i] || '',
        NUCO: datos['NUCO'][i] || '',
        NO_EMPLEADO_SALIENTE: datos['No Empleado Saliente'][i] || '',
        RESPONSABLE_SALIENTE: datos['Responsable Saliente'][i] || '',
        DEPARTAMENTO_SALIENTE: datos['Departamento Saliente'][i] || '',
        NO_EMPLEADO_ENTRANTE: datos['No Empleado Entrante'][i] || '',
        RESPONSABLE_ENTRANTE: datos['Responsable Entrante'][i] || '',
        DEPARTAMENTO_ENTRANTE: datos['Departamento Entrante'][i] || '',
        QUIEN_REGISTRO: datos['QUIEN REGISTRO'][i] || '',
      });
    }
    return resultado;
  }

  return { listarResumen, crear, eliminar, listarPorFolio };
})();

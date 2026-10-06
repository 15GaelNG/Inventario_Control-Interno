/**
 * IncidenciasService.gs
 * Bitácora de taller mecánico por vehículo: registro de ingreso, trabajo
 * realizado y salida. Vive dentro del área "Servicios Vehiculares".
 *
 * Hoja real "INCIDENCIAS" del spreadsheet original de AppSheet. Columnas reales en español
 * con espacios/acentos, mapeadas aquí a nuestro esquema interno:
 *   ID | FOLIO | DEPARTAMENTO | MODELO | AÑO | FECHA REGISTRO | FECHA INSPECCION |
 *   KILOMETRAJE | TICKET | INSPECCION INGRESO | DESCRIPCION TRABAJO REALIZADO |
 *   FECHA TRABAJO REALIZADO | INSPECCION SALIDA | NOMBRE MECANICO |
 *   PERIODO VERIFICACION | SEGURO AUTO
 */

const IncidenciasService = (function () {
  // Lo del trabajo se captura al cerrar (cerrar), no al abrir
  const DEL_TRABAJO = ['DESCRIPCION TRABAJO REALIZADO', 'FECHA TRABAJO REALIZADO', 'INSPECCION SALIDA', 'NOMBRE MECANICO'];

  function desdeOriginal_(row) {
    const trabajoHecho = !!(row['DESCRIPCION TRABAJO REALIZADO'] || row['INSPECCION SALIDA']);
    return {
      ID: row['ID'],
      FOLIO: row['FOLIO'] || '',
      DEPARTAMENTO: row['DEPARTAMENTO'] || '',
      MODELO: row['MODELO'] || '',
      ANIO: row['AÑO'] || '',
      FECHA_REGISTRO: HojaServicio.fechaISO(row['FECHA REGISTRO']),
      FECHA_INSPECCION: HojaServicio.fechaISO(row['FECHA INSPECCION']),
      KILOMETRAJE: row['KILOMETRAJE'] || '',
      TICKET: row['TICKET'] || '',
      INSPECCION_INGRESO: row['INSPECCION INGRESO'] || '',
      DESCRIPCION_TRABAJO: row['DESCRIPCION TRABAJO REALIZADO'] || '',
      FECHA_TRABAJO: HojaServicio.fechaISO(row['FECHA TRABAJO REALIZADO']),
      INSPECCION_SALIDA: row['INSPECCION SALIDA'] || '',
      MECANICO: row['NOMBRE MECANICO'] || '',
      PERIODO_VERIFICACION: row['PERIODO VERIFICACION'] || '',
      SEGURO_AUTO: row['SEGURO AUTO'] || '',
      ESTADO: trabajoHecho ? 'CERRADA' : 'ABIERTA',
    };
  }

  /** La hoja, para HojaServicio */
  const INCIDENCIAS = {
    modulo: 'incidencias',
    nombre: 'la incidencia',
    libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    hoja: 'INCIDENCIAS',
    fila: desdeOriginal_,
    orden: { campo: 'FECHA_REGISTRO', desc: true },
    // Lo que manda el formulario → columna de la hoja (lo demás se ignora)
    campos: {
      FOLIO: 'FOLIO', DEPARTAMENTO: 'DEPARTAMENTO', MODELO: 'MODELO', ANIO: 'AÑO',
      FECHA_INSPECCION: 'FECHA INSPECCION', KILOMETRAJE: 'KILOMETRAJE', TICKET: 'TICKET',
      PERIODO_VERIFICACION: 'PERIODO VERIFICACION', SEGURO_AUTO: 'SEGURO AUTO',
      INSPECCION_INGRESO: 'INSPECCION INGRESO', DESCRIPCION_TRABAJO: 'DESCRIPCION TRABAJO REALIZADO',
      FECHA_TRABAJO: 'FECHA TRABAJO REALIZADO', INSPECCION_SALIDA: 'INSPECCION SALIDA', MECANICO: 'NOMBRE MECANICO',
    },
    fechas: ['FECHA INSPECCION', 'FECHA TRABAJO REALIZADO'],
    obligatorios: { 'FOLIO': 'Selecciona el vehículo' },
    /**
     * A diferencia del resto de la familia, NO exige que el vehículo exista en el catálogo, y
     * es a propósito: su formulario es un <datalist>, que deja escribir cualquier texto, y
     * volverla estricta bloquearía capturas que hoy funcionan. Se intenta resolver al vehículo
     * para ponerle la llave foránea; si no se puede, se guarda con lo que mandó el cliente y
     * con 'ID VEHICULO' vacío. Un vínculo que falta se repara después; una incidencia que no se
     * pudo capturar, no.
     */
    alCrear: (fila) => {
      let delVehiculo = null;
      try {
        delVehiculo = Relaciones.datosParaNuevo('INCIDENCIAS', fila['FOLIO']);
      } catch (err) {
        console.error('Incidencia sin vínculo al catálogo: ' + err.message);
      }
      DEL_TRABAJO.forEach((c) => { delete fila[c]; });
      const v = delVehiculo ? delVehiculo.datos : null;
      const ahora = new Date();
      return Object.assign({}, v || {}, {
        'FOLIO': v ? v['FOLIO'] : fila['FOLIO'],
        'DEPARTAMENTO': (v ? v['DEPARTAMENTO'] : fila['DEPARTAMENTO']) || '',
        'MODELO': (v ? v['MODELO'] : fila['MODELO']) || '',
        // Registro: siempre "hoy". Inspección: editable, no necesariamente igual a la de registro.
        'FECHA REGISTRO': ahora,
        'FECHA INSPECCION': fila['FECHA INSPECCION'] || ahora,
      });
    },
  };

  /** Cierra una incidencia abierta (trabajo realizado + inspección de salida) */
  function cerrar(token, id, datos) {
    Permisos.puedeEditar(token, 'incidencias');
    if (!datos.DESCRIPCION_TRABAJO) throw new Error('Describe el trabajo realizado');
    SheetUtils.update(HojaServicio.libro(INCIDENCIAS), INCIDENCIAS.hoja, id, {
      'DESCRIPCION TRABAJO REALIZADO': datos.DESCRIPCION_TRABAJO,
      'FECHA TRABAJO REALIZADO': HojaServicio.fechaDeEntrada(datos.FECHA_TRABAJO) || new Date(),
      'INSPECCION SALIDA': datos.INSPECCION_SALIDA || '',
      'NOMBRE MECANICO': datos.MECANICO || '',
    }, 'ID');
    return { ID: id };
  }

  /**
   * Diagnóstico de solo lectura. Envuelto en try/catch total y con todo
   * convertido a tipos primitivos/strings antes de regresar — así no hay
   * duda de si algo se pierde por una serialización rara de google.script.run.
   */
  function diagnostico(token) {
    try {
      Permisos.puedeLeer(token, 'incidencias');
      const hoja = HojaServicio.hoja(INCIDENCIAS);
      const crudos = SheetUtils.getAll(HojaServicio.libro(INCIDENCIAS), hoja.getName());
      return {
        ok: true,
        spreadsheetId: String(HojaServicio.libro(INCIDENCIAS)),
        nombreHoja: String(hoja.getName()),
        totalFilas: Number(Math.max(0, hoja.getLastRow() - 1)),
        totalColumnas: Number(hoja.getLastColumn()),
        getAllLength: Number(crudos.length),
        primeraFilaCrudaJSON: crudos[0] ? JSON.stringify(crudos[0]) : '(sin filas)',
      };
    } catch (err) {
      return { ok: false, errorGeneral: String((err && err.stack) || err) };
    }
  }

  return {
    listar: (token) => HojaServicio.listar(INCIDENCIAS, token),
    /** Para el activador (Calentador.gs): la deja armada sin esperar a nadie */
    calentar: () => HojaServicio.calentar(INCIDENCIAS),
    /** Incidencias de un solo vehículo (ficha de Vehículos) */
    listarPorFolio: (token, folio) => HojaServicio.listarPor(INCIDENCIAS, token, 'FOLIO', folio),
    /** Registro completo (todas las columnas) por ID -- "Ver completo" desde la ficha de Vehículos */
    buscarPorId: (token, id) => HojaServicio.buscarPorId(INCIDENCIAS, token, id),
    /** Todas las columnas de TODAS las incidencias (para exportar completo) */
    completo: (token) => HojaServicio.completo(INCIDENCIAS, token),
    /** Abre una incidencia (ingreso del vehículo al taller) */
    crear: (token, datos) => HojaServicio.crear(INCIDENCIAS, token, datos),
    cerrar,
    /** Corrige cualquier campo de una incidencia existente (abierta o cerrada) */
    actualizar: (token, id, datos) => HojaServicio.actualizar(INCIDENCIAS, token, id, datos),
    eliminar: (token, id) => HojaServicio.eliminar(INCIDENCIAS, token, id),
    diagnostico,
  };
})();

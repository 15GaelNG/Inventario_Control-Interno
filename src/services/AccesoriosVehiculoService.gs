/**
 * AccesoriosVehiculoService.gs — los accesorios de cada unidad y su historia (usuario, 16-oct-2026).
 *
 * Dos hojas del libro de Vehículos:
 *   CATALOGO ACCESORIOS VEHICULOS     las piezas (las 13 de «El vehículo se entrega con» de la Responsiva Vehicular;
 *                                     CLAVE = el nombre de su columna en RESPONSIVA VEHICULAR). Prefijo CAV.
 *   MOVIMIENTOS ACCESORIOS VEHICULOS  la historia: CARGA INICIAL (de la responsiva, la sube un script), ALTA y BAJA
 *                                     (desde la ficha). Prefijo MAV. Un renglón nunca se edita ni se borra: un error se
 *                                     corrige con otro movimiento.
 *
 * El estado de hoy NO se guarda: es el TIENE del último movimiento de cada pieza (por FECHA y, el mismo día, por ID,
 * que crece con el tiempo). Una pieza sin movimientos es «sin dato», no «no tiene».
 *
 * Permiso: la sección vehiculos.accesorios (hereda de Vehículos). Se liga por ID VEHICULO, nunca por FOLIO.
 * Quién cambió qué y cuándo es de la auditoría general; aquí REGISTRO es parte del hecho (quién reportó el movimiento).
 */
const AccesoriosVehiculoService = (function () {
  const SECCION = 'vehiculos.accesorios';
  const HOJA_CATALOGO = 'CATALOGO ACCESORIOS VEHICULOS';
  const HOJA_MOVIMIENTOS = 'MOVIMIENTOS ACCESORIOS VEHICULOS';
  const DESDE_LA_APP = ['ALTA', 'BAJA'];
  const libro = () => Config.SPREADSHEET_IDS.VEHICULOS();
  const texto_ = (v) => String(v === null || v === undefined ? '' : v).trim();

  const CATALOGO = {
    modulo: SECCION, nombre: 'la pieza', libro: libro, hoja: HOJA_CATALOGO,
    columnas: ['ID', 'CLAVE', 'NOMBRE', 'ORDEN', 'ACTIVO'],
    fila: (r) => ({ ID: r['ID'], CLAVE: texto_(r['CLAVE']), NOMBRE: texto_(r['NOMBRE']) || texto_(r['CLAVE']),
      ORDEN: Number(r['ORDEN']) || 0, ACTIVO: texto_(r['ACTIVO']).toUpperCase() !== 'NO' }),
    orden: { campo: 'ORDEN', numero: true },
  };

  const MOVIMIENTOS = {
    modulo: SECCION, nombre: 'el movimiento', libro: libro, hoja: HOJA_MOVIMIENTOS,
    columnas: ['ID', 'FECHA', 'ID VEHICULO', 'NUCCO', 'ACCESORIO', 'MOVIMIENTO', 'TIENE', 'MOTIVO', 'ORIGEN', 'EVIDENCIA', 'REGISTRO'],
    fila: (r) => ({
      ID: r['ID'], FECHA: HojaServicio.fechaISO(r['FECHA']), ID_VEHICULO: texto_(r['ID VEHICULO']), NUCCO: texto_(r['NUCCO']),
      ACCESORIO: texto_(r['ACCESORIO']), MOVIMIENTO: texto_(r['MOVIMIENTO']), TIENE: texto_(r['TIENE']).toUpperCase(),
      MOTIVO: texto_(r['MOTIVO']), ORIGEN: texto_(r['ORIGEN']), EVIDENCIA: texto_(r['EVIDENCIA']), REGISTRO: texto_(r['REGISTRO']),
    }),
    // Lo que manda la pantalla; TIENE, NUCCO, REGISTRO y ORIGEN los pone el servidor
    campos: { ID_VEHICULO: 'ID VEHICULO', ACCESORIO: 'ACCESORIO', MOVIMIENTO: 'MOVIMIENTO', MOTIVO: 'MOTIVO', FECHA: 'FECHA' },
    fechas: ['FECHA'],
    obligatorios: { 'ID VEHICULO': 'Falta la unidad.', 'ACCESORIO': 'Elige la pieza.', 'MOVIMIENTO': 'Elige si es alta o baja.' },
    // Revisar el estado y escribir van juntos: dos altas de la misma pieza a la vez no deben pasar las dos
    candadoAlCrear: true,
    alCrear: (fila, ctx) => validarMovimiento_(fila, ctx.sesion),
  };

  /** Orden de la historia: por fecha del hecho y, el mismo día, por ID (que crece con el tiempo) */
  const antes_ = (a, b) => (a.FECHA < b.FECHA ? -1 : a.FECHA > b.FECHA ? 1 : (a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0));

  /**
   * El estado de cada pieza del catálogo para una unidad. Pura (para probarla):
   *   movimientos = los de ESA unidad (forma de fila()), catalogo = la lista del catálogo.
   * → [{ CLAVE, NOMBRE, TIENE: 'SI' | 'NO' | '', DESDE, MOVIMIENTO, ID }] en el orden del catálogo ('' = sin dato).
   */
  function estadoDe(movimientos, catalogo) {
    const ultimo = {};
    (movimientos || []).slice().sort(antes_).forEach((m) => { ultimo[m.ACCESORIO] = m; });
    return (catalogo || []).filter((p) => p.ACTIVO || ultimo[p.CLAVE]).map((p) => {
      const m = ultimo[p.CLAVE];
      return { CLAVE: p.CLAVE, NOMBRE: p.NOMBRE, TIENE: m ? m.TIENE : '', DESDE: m ? m.FECHA : '', MOVIMIENTO: m ? m.MOVIMIENTO : '', ID: m ? m.ID : '' };
    });
  }

  /** Antes de escribir (bajo el candado): que la pieza exista, que la unidad exista y que el movimiento tenga sentido */
  function validarMovimiento_(fila, sesion) {
    const movimiento = texto_(fila['MOVIMIENTO']).toUpperCase();
    if (DESDE_LA_APP.indexOf(movimiento) < 0) throw new Error('El movimiento es ALTA o BAJA.');
    const clave = texto_(fila['ACCESORIO']).toUpperCase();
    const pieza = SheetUtils.getAll(libro(), HOJA_CATALOGO).find((p) => texto_(p['CLAVE']).toUpperCase() === clave);
    if (!pieza) throw new Error('La pieza «' + fila['ACCESORIO'] + '» no está en el catálogo.');
    if (movimiento === 'ALTA' && texto_(pieza['ACTIVO']).toUpperCase() === 'NO') throw new Error('Esa pieza ya no se usa (catálogo).');
    const idVehiculo = texto_(fila['ID VEHICULO']);
    const vehiculo = SheetUtils.findById(libro(), 'VEHICULOS', idVehiculo, 'ID');
    if (!vehiculo) throw new Error('No se encontró la unidad ' + idVehiculo + '.');
    if (movimiento === 'BAJA' && !texto_(fila['MOTIVO'])) throw new Error('Escribe el motivo de la baja (extravío, robo, daño…).');
    const fecha = fila['FECHA'] || new Date();
    if (fecha > new Date()) throw new Error('La fecha no puede ser futura.');

    // Lo de hoy, leído de la hoja (no de la copia guardada): bajo el candado nadie más escribe
    const deLaUnidad = SheetUtils.getAll(libro(), HOJA_MOVIMIENTOS)
      .filter((r) => texto_(r['ID VEHICULO']) === idVehiculo).map(MOVIMIENTOS.fila);
    const actual = estadoDe(deLaUnidad, [{ CLAVE: texto_(pieza['CLAVE']), NOMBRE: texto_(pieza['NOMBRE']), ACTIVO: true }])[0];
    if (movimiento === 'ALTA' && actual.TIENE === 'SI') throw new Error('La unidad ya tiene ' + (pieza['NOMBRE'] || clave) + '.');
    if (movimiento === 'BAJA' && actual.TIENE !== 'SI') {
      throw new Error('La unidad no tiene registrado ' + (pieza['NOMBRE'] || clave) + ': no se puede dar de baja.');
    }
    return {
      'ACCESORIO': texto_(pieza['CLAVE']), 'MOVIMIENTO': movimiento, 'TIENE': movimiento === 'ALTA' ? 'SI' : 'NO',
      'NUCCO': texto_(vehiculo.data['NUCCO']), 'FECHA': fecha, 'ORIGEN': 'MANUAL',
      'REGISTRO': (sesion && sesion.correo) || '',
    };
  }

  /** Lo que pinta la ficha: el catálogo, el estado de hoy y la historia (lo más nuevo primero) */
  function deVehiculo(token, idVehiculo) {
    if (!idVehiculo) throw new Error('Falta la unidad.');
    const catalogo = HojaServicio.listar(CATALOGO, token);
    const historial = HojaServicio.listarPorVehiculo(MOVIMIENTOS, token, idVehiculo);
    return {
      catalogo: catalogo,
      estado: estadoDe(historial, catalogo),
      historial: historial.slice().sort(antes_).reverse(),
    };
  }

  return {
    deVehiculo,
    /** ALTA o BAJA de una pieza (la pantalla manda ID_VEHICULO, ACCESORIO, MOVIMIENTO, MOTIVO y FECHA yyyy-MM-dd) */
    registrar: (token, datos) => HojaServicio.crear(MOVIMIENTOS, token, datos),
    catalogo: (token) => HojaServicio.listar(CATALOGO, token),
    calentar: () => { HojaServicio.calentar(CATALOGO); HojaServicio.calentar(MOVIMIENTOS); },
    estadoDe,
    HOJA_CATALOGO, HOJA_MOVIMIENTOS, SECCION,
  };
})();

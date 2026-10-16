/**
 * AccesoriosVehiculoService.gs — los accesorios de cada unidad y su historia (usuario, 16-oct-2026).
 *
 * Dos hojas del libro de Vehículos:
 *   CATALOGO ACCESORIOS VEHICULOS     las piezas (las 13 de «El vehículo se entrega con» de la Responsiva Vehicular;
 *                                     CLAVE = el nombre de su columna en RESPONSIVA VEHICULAR). Prefijo CAV.
 *   MOVIMIENTOS ACCESORIOS VEHICULOS  la historia: CARGA INICIAL (la última responsiva de antes del sistema, la sube
 *                                     tools/accesorios/carga_inicial.py), RESPONSIVA (al quedar firmada una responsiva
 *                                     en el sistema), ALTA y BAJA (desde la ficha). Prefijo MAV. Un renglón nunca se
 *                                     edita ni se borra: un error se corrige con otro movimiento.
 *   ESTADO ACCESORIOS VEHICULOS       lo que tiene HOY cada unidad: un renglón por ID VEHICULO, una columna por CLAVE
 *                                     (SI / NO / vacío = sin dato). Es una COPIA legible de los movimientos (para la
 *                                     gente y Looker): solo la escribe este servicio, bajo el candado del movimiento, y
 *                                     rehacerEstadoAccesorios() la rehace entera. Se crea sola; una pieza nueva agrega
 *                                     su columna sola.
 *
 * El estado de hoy es el TIENE del último movimiento de cada pieza (por FECHA y, el mismo día, por ID, que crece con
 * el tiempo). Una pieza sin movimientos es «sin dato», no «no tiene».
 *
 * La regla de negocio (usuario, 16-oct-2026): manda la ÚLTIMA RESPONSIVA de la unidad. No siempre es la foto real (dar
 * un accesorio nuevo no pide firmar otra), pero es la verdad acordada: cada responsiva firmada vuelve a mandar
 * (desdeResponsiva, solo lo que cambia) y entre una y otra se anotan altas y bajas. Un préstamo no cuenta.
 *
 * Permiso: la sección vehiculos.accesorios (hereda de Vehículos). Se liga por ID VEHICULO, nunca por FOLIO.
 * Quién cambió qué y cuándo es de la auditoría general; aquí REGISTRO es parte del hecho (quién reportó el movimiento).
 */
const AccesoriosVehiculoService = (function () {
  const SECCION = 'vehiculos.accesorios';
  const HOJA_CATALOGO = 'CATALOGO ACCESORIOS VEHICULOS';
  const HOJA_MOVIMIENTOS = 'MOVIMIENTOS ACCESORIOS VEHICULOS';
  const HOJA_ESTADO = 'ESTADO ACCESORIOS VEHICULOS';
  const DESDE_LA_APP = ['ALTA', 'BAJA'];
  const RESPONSIVA = 'RESPONSIVA';
  // Columnas de la hoja de estado: estas, una por CLAVE del catálogo (en su orden) y las del final
  const ESTADO_INICIO = ['ID VEHICULO', 'NUCCO', 'FOLIO'];
  const ESTADO_FIN = ['ULTIMO MOVIMIENTO', 'FECHA ULTIMO MOVIMIENTO'];
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

  /** SI / NO de una casilla (de la responsiva o del Excel); cualquier otra cosa ('', N/A, (vacío)) es '' = sin dato */
  function siNo(v) {
    if (v === true) return 'SI';
    if (v === false) return 'NO';
    const t = texto_(v).toUpperCase().replace('Í', 'I');
    if (t === 'SI' || t === 'TRUE') return 'SI';
    if (t === 'NO' || t === 'FALSE') return 'NO';
    return '';
  }

  /**
   * Lo que una responsiva cambia (pura): las piezas que la responsiva marca SI o NO y que hoy no están así (o no tenían
   * dato). Una casilla vacía no dice nada y no cambia nada.
   *   fila = el renglón de RESPONSIVA VEHICULAR, estado = estadoDe(...) de la unidad → [{ CLAVE, TIENE }]
   */
  function cambiosDeResponsiva(fila, estado) {
    return (estado || []).map((p) => ({ CLAVE: p.CLAVE, TIENE: siNo((fila || {})[p.CLAVE]), antes: p.TIENE }))
      .filter((x) => x.TIENE && x.TIENE !== x.antes).map((x) => ({ CLAVE: x.CLAVE, TIENE: x.TIENE }));
  }

  /** El renglón de la hoja de estado de una unidad (pura): { columna: valor } */
  function renglonEstado(vehiculo, movimientos, catalogo) {
    const r = { 'ID VEHICULO': texto_(vehiculo.ID), 'NUCCO': texto_(vehiculo.NUCCO), 'FOLIO': texto_(vehiculo.FOLIO) };
    estadoDe(movimientos, catalogo).forEach((p) => { r[p.CLAVE] = p.TIENE; });
    const ultimo = (movimientos || []).slice().sort(antes_).pop();
    r['ULTIMO MOVIMIENTO'] = ultimo ? ultimo.MOVIMIENTO + ' ' + ultimo.ACCESORIO : '';
    r['FECHA ULTIMO MOVIMIENTO'] = ultimo ? String(ultimo.FECHA || '').slice(0, 10) : '';
    return r;
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

  // ---- La hoja de estado (siempre bajo el candado: la escriben el movimiento y la responsiva) ----

  const catalogoDeHoja_ = () => SheetUtils.getAll(libro(), HOJA_CATALOGO).map(CATALOGO.fila).sort((a, b) => a.ORDEN - b.ORDEN);
  const movimientosDeHoja_ = () => SheetUtils.getAll(libro(), HOJA_MOVIMIENTOS).map(MOVIMIENTOS.fila);
  const vehiculoDe_ = (id) => {
    const v = SheetUtils.findById(libro(), 'VEHICULOS', id, 'ID');
    return v ? { ID: id, NUCCO: v.data['NUCCO'], FOLIO: v.data['FOLIO'] } : { ID: id, NUCCO: '', FOLIO: '' };
  };
  const enTexto_ = (v) => (v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : texto_(v));

  /** La hoja de estado con todas sus columnas (la crea si no existe; agrega al final las piezas nuevas) → { hoja, encabezados } */
  function hojaEstado_(catalogo) {
    const quiere = ESTADO_INICIO.concat(catalogo.map((p) => p.CLAVE), ESTADO_FIN);
    const ss = SpreadsheetApp.openById(libro());
    let hoja = ss.getSheetByName(HOJA_ESTADO);
    if (!hoja) {
      hoja = ss.insertSheet(HOJA_ESTADO);
      hoja.getRange(1, 1, 1, quiere.length).setValues([quiere]).setFontWeight('bold');
      hoja.setFrozenRows(1);
      return { hoja: hoja, encabezados: quiere };
    }
    const ancho = hoja.getLastColumn();
    const encabezados = ancho ? hoja.getRange(1, 1, 1, ancho).getValues()[0].map(texto_) : [];
    const indices = SheetUtils.indiceDeColumnas(encabezados, quiere);
    const faltan = quiere.filter((c) => indices[c] === -1);
    if (faltan.length) {
      hoja.getRange(1, encabezados.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
      faltan.forEach((c) => encabezados.push(c));
    }
    return { hoja: hoja, encabezados: encabezados };
  }

  /** Un renglón de estado como arreglo, en el orden de los encabezados de la hoja */
  function comoFila_(encabezados, r) {
    const indices = SheetUtils.indiceDeColumnas(encabezados, Object.keys(r));
    const fila = encabezados.map(() => '');
    Object.keys(r).forEach((c) => { if (indices[c] >= 0) fila[indices[c]] = r[c]; });
    return fila;
  }

  /** Reescribe en la hoja de estado el renglón de estas unidades (o lo agrega) */
  function escribirEstado_(idsVehiculo) {
    Candado.con(() => {
      const catalogo = catalogoDeHoja_();
      const todos = movimientosDeHoja_();
      const { hoja, encabezados } = hojaEstado_(catalogo);
      const col = SheetUtils.indiceDeColumnas(encabezados, ['ID VEHICULO'])['ID VEHICULO'];
      const ultima = hoja.getLastRow();
      const ids = ultima > 1 ? hoja.getRange(2, col + 1, ultima - 1, 1).getValues().map((x) => texto_(x[0])) : [];
      idsVehiculo.filter(Boolean).forEach((id) => {
        const fila = comoFila_(encabezados, renglonEstado(vehiculoDe_(id), todos.filter((m) => m.ID_VEHICULO === id), catalogo));
        const i = ids.indexOf(id);
        if (i >= 0) {
          hoja.getRange(i + 2, 1, 1, fila.length).setValues([fila]);
        } else {
          hoja.getRange(hoja.getLastRow() + 1, 1, 1, fila.length).setValues([fila]);
          ids.push(id);
        }
      });
      CacheHojas.tocarHoja(hoja);
    });
  }

  /** El renglón de estado después de escribir un movimiento: si falla, el movimiento ya quedó (es la verdad) y se avisa */
  function estadoTrasMovimiento_(idVehiculo) {
    try {
      escribirEstado_([idVehiculo]);
      return '';
    } catch (err) {
      console.error('Accesorios: no se pudo actualizar ' + HOJA_ESTADO + ' de ' + idVehiculo + ': ' + err.message);
      return 'El movimiento quedó guardado, pero no se pudo poner al día ' + HOJA_ESTADO + ' (se rehace con rehacerEstadoAccesorios).';
    }
  }

  /** Un ALTA o BAJA de la ficha: el movimiento y el renglón de estado, juntos bajo el candado */
  function registrar(token, datos) {
    return Candado.con(() => {
      const r = HojaServicio.crear(MOVIMIENTOS, token, datos);
      const aviso = estadoTrasMovimiento_(r.ID_VEHICULO);
      return aviso ? Object.assign(r, { aviso: aviso }) : r;
    });
  }

  /**
   * Una responsiva quedó FIRMADA (ResponsivaVehicularService; un préstamo no llama aquí): lo que dice manda. Anota un
   * movimiento RESPONSIVA de cada pieza que cambia (ORIGEN = la liga del PDF) y pone al día el estado. Sin unidad no
   * hace nada. → { movimientos: n, aviso }
   */
  function desdeResponsiva(fila, ligaPdf, fecha) {
    const idVehiculo = texto_((fila || {})['ID VEHICULO']);
    if (!idVehiculo) return { movimientos: 0, aviso: '' };
    return Candado.con(() => {
      const catalogo = catalogoDeHoja_();
      const deLaUnidad = movimientosDeHoja_().filter((m) => m.ID_VEHICULO === idVehiculo);
      const cambios = cambiosDeResponsiva(fila, estadoDe(deLaUnidad, catalogo));
      if (!cambios.length) return { movimientos: 0, aviso: '' };
      const nucco = texto_(fila['NUCCO']) || vehiculoDe_(idVehiculo).NUCCO;
      cambios.forEach((c) => SheetUtils.insert(libro(), HOJA_MOVIMIENTOS, {
        'FECHA': fecha || new Date(), 'ID VEHICULO': idVehiculo, 'NUCCO': nucco, 'ACCESORIO': c.CLAVE, 'MOVIMIENTO': RESPONSIVA,
        'TIENE': c.TIENE, 'MOTIVO': 'Responsiva ' + texto_(fila['ID']), 'ORIGEN': ligaPdf || texto_(fila['ID']), 'EVIDENCIA': '',
        'REGISTRO': texto_(fila['REGISTRADO POR']),
      }));
      return { movimientos: cambios.length, aviso: estadoTrasMovimiento_(idVehiculo) };
    });
  }

  /** La hoja de estado entera, calculada de los movimientos, en el orden de sus encabezados (una unidad por renglón) */
  function estadoCompleto_(catalogo, encabezados) {
    const porUnidad = {};
    movimientosDeHoja_().forEach((m) => { if (m.ID_VEHICULO) (porUnidad[m.ID_VEHICULO] = porUnidad[m.ID_VEHICULO] || []).push(m); });
    const vehiculos = {};
    SheetUtils.getAll(libro(), 'VEHICULOS').forEach((v) => {
      vehiculos[texto_(v['ID'])] = { ID: texto_(v['ID']), NUCCO: v['NUCCO'], FOLIO: v['FOLIO'] };
    });
    return Object.keys(porUnidad).sort().map((id) =>
      comoFila_(encabezados, renglonEstado(vehiculos[id] || { ID: id }, porUnidad[id], catalogo)));
  }

  /** Reescribe la hoja de estado completa desde los movimientos (editor; también tras la carga inicial) → { unidades } */
  function rehacerEstado() {
    return Candado.con(() => {
      const catalogo = catalogoDeHoja_();
      const { hoja, encabezados } = hojaEstado_(catalogo);
      const filas = estadoCompleto_(catalogo, encabezados);
      // Lo de antes que sobre (una unidad que ya no tiene movimientos) se escribe en blanco, en la misma escritura
      const total = filas.slice();
      while (total.length < hoja.getLastRow() - 1) total.push(encabezados.map(() => ''));
      if (total.length) hoja.getRange(2, 1, total.length, encabezados.length).setValues(total);
      CacheHojas.tocarHoja(hoja);
      return { unidades: filas.length };
    });
  }

  /** SOLO LECTURA: las unidades cuyo renglón de estado no cuadra con sus movimientos → { bien, mal: [ID VEHICULO] } */
  function revisarEstado() {
    const hoja = SpreadsheetApp.openById(libro()).getSheetByName(HOJA_ESTADO);
    if (!hoja) return { bien: 0, mal: ['(no existe la hoja ' + HOJA_ESTADO + ')'] };
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(texto_);
    const colId = encabezados.indexOf('ID VEHICULO');
    const esperado = {};
    estadoCompleto_(catalogoDeHoja_(), encabezados).forEach((f) => { esperado[f[colId]] = f.map(enTexto_).join('|'); });
    const enHoja = {};
    if (hoja.getLastRow() > 1) {
      hoja.getRange(2, 1, hoja.getLastRow() - 1, encabezados.length).getValues().forEach((f) => {
        if (texto_(f[colId])) enHoja[texto_(f[colId])] = f.map(enTexto_).join('|');
      });
    }
    const ids = Object.keys(Object.assign({}, esperado, enHoja));
    const mal = ids.filter((id) => esperado[id] !== enHoja[id]);
    return { bien: ids.length - mal.length, mal: mal };
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
    registrar,
    desdeResponsiva,
    rehacerEstado,
    revisarEstado,
    catalogo: (token) => HojaServicio.listar(CATALOGO, token),
    calentar: () => { HojaServicio.calentar(CATALOGO); HojaServicio.calentar(MOVIMIENTOS); },
    estadoDe, siNo, cambiosDeResponsiva, renglonEstado,
    HOJA_CATALOGO, HOJA_MOVIMIENTOS, HOJA_ESTADO, SECCION,
  };
})();

/**
 * (Editor) Reescribe ESTADO ACCESORIOS VEHICULOS completa desde los movimientos: tras la carga inicial o si
 * revisarEstadoAccesorios() encuentra renglones que no cuadran. Se puede repetir: siempre da lo mismo.
 */
function rehacerEstadoAccesorios() {
  soloEditor_();
  const r = AccesoriosVehiculoService.rehacerEstado();
  Logger.log(AccesoriosVehiculoService.HOJA_ESTADO + ': ' + r.unidades + ' unidades');
  return r;
}

/** (Editor, solo lectura) Qué unidades tienen su renglón de estado distinto de lo que dicen sus movimientos */
function revisarEstadoAccesorios() {
  soloEditor_();
  const r = AccesoriosVehiculoService.revisarEstado();
  Logger.log('Cuadran: ' + r.bien + ' | no cuadran: ' + r.mal.length + (r.mal.length ? ' (' + r.mal.slice(0, 20).join(', ') + ')' : ''));
  return r;
}

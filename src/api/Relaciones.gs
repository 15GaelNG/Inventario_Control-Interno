/**
 * api/Relaciones.gs — Datos conectados y Salud, en Administración (DatosConectados, Relaciones, CapitalHumano).
 * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.
 */

// --- Datos conectados y Salud (Administración) ---
// Dos pantallas sobre el mismo motor (Relaciones.gs): Datos conectados enseña el mapa (quién
// decide cada dato); Salud revisa si las copias coinciden y las pone al día. Permisos
// separados: 'relaciones' para el mapa, 'salud' para revisar y actualizar. Aquí solo van
// permisos y la forma de la respuesta. JSON.stringify porque las celdas pueden traer Date,
// y google.script.run no las pasa dentro de un objeto.
// Datos conectados que se arman desde la pantalla (DatosConectados.gs): tarjetas, columnas para elegir, sugerencias,
// vista previa, conectar, quitar y poner al día. Leer: permiso 'relaciones'; cambiar: EDICION en 'relaciones'.
function apiDatosConectados(token) {
  return JSON.stringify(DatosConectados.pantalla(token));
}
function apiDatosConectadosColumnas(token, hoja) {
  return JSON.stringify(DatosConectados.columnas(token, hoja));
}
function apiDatosConectadosSugerir(token, dueno, copia) {
  return JSON.stringify(DatosConectados.sugerir(token, dueno, copia));
}
function apiDatosConectadosVistaPrevia(token, propuesta) {
  return JSON.stringify(DatosConectados.vistaPrevia(token, propuesta));
}
function apiDatosConectadosConectar(token, propuesta, ponerAlDia) {
  return JSON.stringify(DatosConectados.guardar(token, propuesta, ponerAlDia));
}
function apiDatosConectadosQuitar(token, dueno, copia, colDueno) {
  return JSON.stringify(DatosConectados.quitar(token, dueno, copia, colDueno));
}
function apiDatosConectadosPonerAlDia(token, copia) {
  return JSON.stringify(DatosConectados.ponerAlDia(token, copia));
}

function apiRelacionesMapa(token) {
  Permisos.puedeLeer(token, 'relaciones');
  return JSON.stringify(mapaCompleto_());
}

/**
 * El MAPA de Relaciones más Capital Humano. Capital Humano no está en el MAPA porque su
 * "copia" no es copiar columnas: es calcular el ID PERSONA de cada responsable
 * (CapitalHumano.revisarLigas). Aquí se presenta como una dueña más, para que las dos
 * pantallas la pinten igual que a las demás.
 */
function mapaCompleto_() {
  const mapa = Relaciones.describir();
  mapa.duenos.push({
    hoja: CapitalHumano.HOJA_CH,
    etiqueta: Relaciones.etiqueta(CapitalHumano.HOJA_CH),
    llaveDeNegocio: 'NOMBRE COMPLETO',
    copias: CapitalHumano.describirLigas().map((l) => ({
      nombre: l.nombre,
      etiqueta: Relaciones.etiqueta(l.hoja),
      tipo: 'cache',
      llaveForanea: l.columna,
      campoEnDueno: l.columna,
      claveOrigen: 'NOMBRE COMPLETO',
      clave: l.desde.join(' / '),
      columnas: [{ origen: l.columna, destino: l.columna, calculada: true }],
      // Con qué se reconoce el renglón en la pantalla: el folio del vehículo, el número de caja…
      llaveRegistro: l.etiqueta,
      rol: l.rol,
      sinDueno: null,
      notaColumnas: null,
      huerfanaEsperada: 'un responsable que no es persona (BAJA VEHICULAR, DONACIÓN, un código de desarrollo…)',
      nota: 'Se calcula del responsable que está escrito (' + l.desde.join(', ') + '): primero por correo, luego por ' +
        'nombre, y el número de empleado solo desempata a dos personas que se llaman igual. Nunca cambia el nombre ' +
        'que alguien escribió; si el responsable cambia, su persona se actualiza.',
    })),
  });
  return mapa;
}

/**
 * Salud: el mapa y la revisión en una sola llamada (la pantalla necesita los dos). Solo lee:
 * no corrige ni escribe LOG_RELACIONES.
 */
function apiSaludRevisar(token) {
  Permisos.puedeLeer(token, 'salud');
  let personas;
  try {
    personas = relacionesRespuesta_(CapitalHumano.revisarLigas({ detalle: true }));
  } catch (err) {
    // Sin PERSONAS todavía (o sin la lista de CH): se dice en Salud, no se tumba la pantalla
    personas = CapitalHumano.describirLigas().map((l) => ({
      nombre: l.nombre, tipo: 'cache', error: err.message, entradas: [], revisadas: 0, diferencias: 0, huerfanos: 0,
    }));
  }
  return JSON.stringify({
    mapa: mapaCompleto_(),
    reporte: relacionesRespuesta_(Relaciones.revisar({ detalle: true, log: false })).concat(personas),
  });
}

/**
 * Corrige UNA hoja caché. Una bitácora se rechaza aquí y no solo en el motor, para que el
 * error sea claro en vez de un "0 corregidas" que parece éxito. Esta sí escribe la bitácora
 * LOG_RELACIONES: es el rastro de qué celda cambió, de qué valor a cuál, y quién lo pidió.
 */
function apiSaludSincronizar(token, hoja, filas) {
  const sesion = Permisos.puedeEditar(token, 'salud');
  // Capital Humano: "actualizar" es recalcular el ID PERSONA de cada responsable
  if (CapitalHumano.describirLigas().some((l) => l.nombre === hoja)) {
    return JSON.stringify(relacionesRespuesta_(CapitalHumano.revisarLigas({
      escribir: true, detalle: true, hojas: [hoja],
      filas: Array.isArray(filas) ? filas : null,
      quien: sesion.nombre || sesion.correo || '',
    })));
  }
  const copia = Relaciones.describir().duenos
    .reduce((todas, d) => todas.concat(d.copias), [])
    .find((c) => c.nombre === hoja);
  if (!copia) throw new Error('"' + hoja + '" no está en el mapa de relaciones.');
  if (copia.tipo === 'bitacora') {
    throw new Error('"' + hoja + '" es una bitácora: guarda el dato del día del evento y no se sincroniza.');
  }
  // filas: los renglones elegidos en "Actualizar seleccionados"; sin ellas, toda la hoja.
  return JSON.stringify(relacionesRespuesta_(Relaciones.revisar({
    corregir: true, detalle: true, hojas: [hoja],
    filas: Array.isArray(filas) ? filas : null,
    quien: sesion.nombre || sesion.correo || '',
  })));
}

function relacionesRespuesta_(resultado) {
  return Object.keys(resultado).map((nombre) => Object.assign(
    { nombre: nombre }, resultado[nombre], { entradas: resultado[nombre].entradas || [] }));
}

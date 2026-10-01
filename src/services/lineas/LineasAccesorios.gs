/**
 * LineasAccesorios.gs
 * Inventario de accesorios de celular (fundas, micas, cargadores…), sobre la misma hoja
 * de pruebas de Líneas (Config.SPREADSHEET_IDS.TELEFONIA()), pestañas ACCESORIOS CELULARES
 * y MOVIMIENTOS_ACCESORIOS — las mismas que ya usa el AppSheet, presentes también en la copia
 * de pruebas. No toca AccesoriosService.gs (módulo de un compañero, conectado a otra hoja).
 *
 * Columnas reales:
 *   ACCESORIOS CELULARES:    ID_Accesorio | Categoria | Nombre del Articulo | Marca
 *   MOVIMIENTOS_ACCESORIOS:  ID_Movimiento | ID_Accesorio | Tipo_movimiento | Cantidad | Fecha | Usuario | Comentarios
 *   (Tipo_movimiento usa "Entrada" / "Salida")
 *
 * Llaves según el catálogo de IDs de Ayrton (Entidades.gs, REFERENCIAS): tras la migración el artículo se identifica
 * por ID (ACC-…) y su llave vieja ID_Accesorio quedó como ID ANTERIOR; el movimiento (ID MAC-…) cita al artículo en
 * ID ACCESORIO. Los movimientos que el pipeline no emparejó solo traen ID_Accesorio (la llave vieja): se casan con el
 * ID ANTERIOR del artículo, la misma regla que usa Relaciones. En un libro sin migrar todo sigue con las llaves viejas.
 */

const LineasAccesorios = (function () {
  const TAB_ART = 'ACCESORIOS CELULARES';
  const TAB_MOV = 'MOVIMIENTOS_ACCESORIOS';
  const CLAVE_CACHE = 'accesorios_indice_v4'; // v4: llaves del catálogo de IDs (1-oct)
  // Columna virtual "Aviso Reabastecimiento" del AppSheet: umbral por categoría
  const UMBRAL_REABASTO = { Cargadores: 10, Micas: 182, Fundas: 182 };
  // Enum Categoria del AppSheet (Dropdown, sin otros valores), en su orden
  const CATEGORIAS = ['Micas', 'Fundas', 'Cargadores'];

  function rolesOperan_() {
    return [Config.ROLES.ADMIN, Config.ROLES.OPERADOR];
  }

  const txt_ = (v) => LineasUtil.txt(v) || '';
  /** La llave vieja de un renglón: ID ANTERIOR si ya se migró, o la columna original si no. */
  const anterior_ = (f, vieja) => txt_(f['ID ANTERIOR']) || txt_(f[vieja]);

  function articuloDesdeFila_(f) {
    const anterior = anterior_(f, 'ID_Accesorio');
    return {
      id: txt_(f['ID']) || anterior, anterior: anterior,
      categoria: LineasUtil.txt(f['Categoria']) || '',
      nombre: LineasUtil.txt(f['Nombre del Articulo']) || '',
      marca: LineasUtil.txt(f['Marca']) || '',
    };
  }

  function movimientoDesdeFila_(f) {
    return {
      id: txt_(f['ID']) || anterior_(f, 'ID_Movimiento'), accesorioId: txt_(f['ID ACCESORIO']), llaveVieja: txt_(f['ID_Accesorio']),
      tipo: (LineasUtil.txt(f['Tipo_movimiento']) || '').toUpperCase(),
      cantidad: LineasUtil.numero(f['Cantidad']) || 0, fecha: LineasUtil.fecha(f['Fecha']),
      usuario: LineasUtil.txt(f['Usuario']) || '', comentarios: LineasUtil.txt(f['Comentarios']) || '',
    };
  }

  function indiceSinCache_() {
    const articulos = LineasDatos.leerTabla(TAB_ART).map(articuloDesdeFila_).filter((a) => a.id);
    const porAnterior = {};
    articulos.forEach((a) => { porAnterior[a.id] = a.id; if (a.anterior) porAnterior[a.anterior] = a.id; });
    const movimientos = LineasDatos.leerTabla(TAB_MOV).map(movimientoDesdeFila_).filter((m) => m.id);
    movimientos.forEach((m) => { if (!m.accesorioId) m.accesorioId = porAnterior[m.llaveVieja] || ''; });
    const stock = {};
    // Stock = SUM(Cantidad de "Entrada") − SUM(Cantidad de "Salida"); otros tipos no cuentan
    movimientos.forEach((m) => {
      const signo = m.tipo === 'ENTRADA' ? 1 : (m.tipo === 'SALIDA' ? -1 : 0);
      stock[m.accesorioId] = (stock[m.accesorioId] || 0) + signo * m.cantidad;
    });
    const filas = articulos.map((a) => {
      const umbral = UMBRAL_REABASTO[a.categoria];
      return Object.assign({}, a, {
        stock: stock[a.id] || 0,
        reabasto: umbral !== undefined && (stock[a.id] || 0) <= umbral,
      });
    });
    return { filas: filas, umbralReabasto: UMBRAL_REABASTO, categorias: CATEGORIAS, generadoEn: new Date() };
  }

  /** Catálogo con stock calculado (entradas − salidas) y alerta de reabasto. Caché 15 min. */
  function indice(token) {
    Auth.validarSesion(token);
    const enCache = LineasDatos.cacheLeer(CLAVE_CACHE);
    if (enCache) return LineasUtil.paraCliente(enCache);
    const ix = indiceSinCache_();
    LineasDatos.cacheGuardar(CLAVE_CACHE, ix, 900);
    return LineasUtil.paraCliente(ix);
  }

  /** Movimientos de un artículo, del más reciente al más antiguo. */
  function movimientosDeArticulo(token, id) {
    Auth.validarSesion(token);
    const articulo = LineasDatos.leerTabla(TAB_ART).map(articuloDesdeFila_).filter((a) => a.id === id)[0];
    if (!articulo) return LineasUtil.paraCliente([]);
    const t = LineasDatos.tabla(TAB_MOV);
    const filas = [];
    if (LineasDatos.colIndice(t, 'ID ACCESORIO') >= 0) filas.push(...LineasDatos.buscarFilas(TAB_MOV, 'ID ACCESORIO', articulo.id));
    [articulo.anterior, articulo.id].filter((v, i, a) => v && a.indexOf(v) === i).forEach((v) => {
      LineasDatos.buscarFilas(TAB_MOV, 'ID_Accesorio', v).forEach((f) => { if (filas.indexOf(f) < 0) filas.push(f); });
    });
    const movs = LineasDatos.leerFilas([{ tabla: TAB_MOV, filas: filas }])[0]
      .map(movimientoDesdeFila_).sort((a, b) => (b.fecha || 0) - (a.fecha || 0));
    return LineasUtil.paraCliente(movs);
  }

  /** Alta de un artículo nuevo en el catálogo. */
  function agregarArticulo(token, datos) {
    Auth.requiereRol(token, rolesOperan_());
    if (CATEGORIAS.indexOf(String(datos.categoria || '')) < 0) throw new Error('Categoria es obligatorio (Micas, Fundas o Cargadores).');
    if (!LineasUtil.txt(datos.nombre)) throw new Error('Nombre del Articulo es obligatorio.');
    const clave = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const existe = LineasDatos.leerTabla(TAB_ART).some((f) => String(f['Categoria']) === String(datos.categoria) && clave(f['Nombre del Articulo']) === clave(datos.nombre));
    if (existe) throw new Error('Ese artículo ya existe en ' + datos.categoria + ': registra una entrada en su fila.');
    const fila = {
      'Categoria': String(datos.categoria), 'Nombre del Articulo': String(datos.nombre).trim(), 'Marca': LineasUtil.txt(datos.marca) || '',
    };
    // Libro migrado: su ID (ACC-…) nace en agregarFilas. Sin migrar: la llave del AppSheet, como antes
    if (LineasDatos.colIndice(LineasDatos.tabla(TAB_ART), 'ID') < 0) fila['ID_Accesorio'] = LineasDatos.nuevoIdCorto();
    LineasDatos.agregarFilas(TAB_ART, [fila]);
    LineasDatos.cacheBorrar(CLAVE_CACHE);
    return { id: fila['ID'] || fila['ID_Accesorio'] };
  }

  /** Entrada o salida de stock, bajo candado (no deja stock negativo en una salida). */
  function registrarMovimiento(token, datos) {
    const sesion = Auth.requiereRol(token, rolesOperan_());
    const tipo = String(datos.tipo || '').toUpperCase();
    if (tipo !== 'ENTRADA' && tipo !== 'SALIDA') throw new Error('Tipo de movimiento inválido.');
    const cantidad = Number(datos.cantidad);
    if (!cantidad || cantidad <= 0) throw new Error('La cantidad debe ser mayor a cero.');
    if (!datos.accesorioId) throw new Error('Selecciona un artículo.');

    return LineasDatos.conCandado(() => {
      const actual = indiceSinCache_().filas.filter((a) => a.id === datos.accesorioId)[0];
      if (!actual) throw new Error('El artículo seleccionado ya no existe. Recarga el inventario.');
      if (tipo === 'SALIDA') {
        if (cantidad > actual.stock) throw new Error('No hay suficiente stock (' + actual.stock + ' disponible).');
      }
      // ID ACCESORIO = el ID del artículo (la llave foránea del catálogo); ID_Accesorio = su llave vieja, solo si la
      // tiene (la que entiende el AppSheet). Con columna ID el movimiento nace con su MAC-… en agregarFilas.
      const tMov = LineasDatos.tabla(TAB_MOV);
      const conIdAccesorio = LineasDatos.colIndice(tMov, 'ID ACCESORIO') >= 0;
      const fila = {
        // Sin la columna ID ACCESORIO (pipeline 3 de Ayrton pendiente) la única referencia es ID_Accesorio
        'ID ACCESORIO': actual.id, 'ID_Accesorio': actual.anterior || (conIdAccesorio ? '' : actual.id), 'Tipo_movimiento': tipo === 'ENTRADA' ? 'Entrada' : 'Salida',
        'Cantidad': cantidad, 'Fecha': new Date(), 'Usuario': sesion.nombre || sesion.correo,
        'Comentarios': LineasUtil.txt(datos.comentarios) || '',
      };
      if (LineasDatos.colIndice(tMov, 'ID') < 0) fila['ID_Movimiento'] = LineasDatos.nuevoIdCorto();
      LineasDatos.agregarFilas(TAB_MOV, [fila]);
      LineasDatos.cacheBorrar(CLAVE_CACHE);
      return { id: fila['ID'] || fila['ID_Movimiento'] };
    });
  }

  return { indice, movimientosDeArticulo, agregarArticulo, registrarMovimiento };
})();

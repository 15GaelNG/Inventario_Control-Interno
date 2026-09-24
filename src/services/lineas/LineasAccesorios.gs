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
 */

const LineasAccesorios = (function () {
  const TAB_ART = 'ACCESORIOS CELULARES';
  const TAB_MOV = 'MOVIMIENTOS_ACCESORIOS';
  const CLAVE_CACHE = 'accesorios_indice_v2';
  // Columna virtual "Aviso Reabastecimiento" del AppSheet: umbral por categoría
  const UMBRAL_REABASTO = { Cargadores: 10, Micas: 182, Fundas: 182 };
  // Enum Categoria del AppSheet (Dropdown, sin otros valores), en su orden
  const CATEGORIAS = ['Micas', 'Fundas', 'Cargadores'];

  function rolesOperan_() {
    return [Config.ROLES.ADMIN, Config.ROLES.OPERADOR];
  }

  function articuloDesdeFila_(f) {
    return {
      id: LineasUtil.txt(f['ID_Accesorio']),
      categoria: LineasUtil.txt(f['Categoria']) || '',
      nombre: LineasUtil.txt(f['Nombre del Articulo']) || '',
      marca: LineasUtil.txt(f['Marca']) || '',
    };
  }

  function movimientoDesdeFila_(f) {
    return {
      id: LineasUtil.txt(f['ID_Movimiento']), accesorioId: LineasUtil.txt(f['ID_Accesorio']),
      tipo: (LineasUtil.txt(f['Tipo_movimiento']) || '').toUpperCase(),
      cantidad: LineasUtil.numero(f['Cantidad']) || 0, fecha: LineasUtil.fecha(f['Fecha']),
      usuario: LineasUtil.txt(f['Usuario']) || '', comentarios: LineasUtil.txt(f['Comentarios']) || '',
    };
  }

  function indiceSinCache_() {
    const articulos = LineasDatos.leerTabla(TAB_ART).map(articuloDesdeFila_).filter((a) => a.id);
    const movimientos = LineasDatos.leerTabla(TAB_MOV).map(movimientoDesdeFila_).filter((m) => m.id);
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
    const filas = LineasDatos.buscarFilas(TAB_MOV, 'ID_Accesorio', id);
    const movs = LineasDatos.leerFilas([{ tabla: TAB_MOV, filas: filas }])[0]
      .map(movimientoDesdeFila_).sort((a, b) => (b.fecha || 0) - (a.fecha || 0));
    return LineasUtil.paraCliente(movs);
  }

  /** Alta de un artículo nuevo en el catálogo. */
  function agregarArticulo(token, datos) {
    Auth.requiereRol(token, rolesOperan_());
    if (CATEGORIAS.indexOf(String(datos.categoria || '')) < 0) throw new Error('Categoria es obligatorio (Micas, Fundas o Cargadores).');
    if (!LineasUtil.txt(datos.nombre)) throw new Error('Nombre del Articulo es obligatorio.');
    const id = LineasDatos.nuevoIdCorto();
    LineasDatos.agregarFilas(TAB_ART, [{
      'ID_Accesorio': id, 'Categoria': String(datos.categoria),
      'Nombre del Articulo': String(datos.nombre).trim(), 'Marca': LineasUtil.txt(datos.marca) || '',
    }]);
    LineasDatos.cacheBorrar(CLAVE_CACHE);
    return { id: id };
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
      const id = LineasDatos.nuevoIdCorto();
      LineasDatos.agregarFilas(TAB_MOV, [{
        'ID_Movimiento': id, 'ID_Accesorio': datos.accesorioId, 'Tipo_movimiento': tipo === 'ENTRADA' ? 'Entrada' : 'Salida',
        'Cantidad': cantidad, 'Fecha': new Date(), 'Usuario': sesion.nombre || sesion.correo,
        'Comentarios': LineasUtil.txt(datos.comentarios) || '',
      }]);
      LineasDatos.cacheBorrar(CLAVE_CACHE);
      return { id: id };
    });
  }

  return { indice, movimientosDeArticulo, agregarArticulo, registrarMovimiento };
})();

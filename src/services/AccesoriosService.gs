/**
 * AccesoriosService.gs
 * Módulo de inventario clásico: catálogo de artículos + movimientos de entrada/salida.
 *
 * IMPORTANTE: por decisión explícita del usuario (2026-09-14), conectado al
 * spreadsheet ORIGINAL de AppSheet (en vivo) — cualquier alta o movimiento
 * que se registre aquí escribe directo en ese archivo real.
 *
 * Como esas hojas no fueron creadas por nosotros, sus columnas no coinciden
 * con nuestro esquema interno (ID/CATEGORIA/NOMBRE/MARCA/TIPO...). Este
 * archivo actúa de adaptador: lee con los nombres de columna reales del
 * original y expone hacia arriba (ClientApi/cliente) siempre la misma forma
 * interna, para no tener que tocar el resto de la app.
 *
 * Columnas reales detectadas:
 *   Catálogo:    ID_Accesorio | Categoria | Nombre del Articulo | Marca
 *   Movimientos: ID_Movimiento | ID_Accesorio | Tipo_movimiento | Cantidad | Fecha | Usuario | Comentarios
 *   (Tipo_movimiento usa valores "Entrada" / "Salida", no ENTRADA/SALIDA)
 */

const AccesoriosService = (function () {
  // Nombres reales ya confirmados — directo por nombre, no por firma de
  // columnas (evita escanear las ~50 pestañas del spreadsheet con la
  // caché fría; ver mismo comentario en ArqueosService).
  const NOMBRE_HOJA_ARTICULOS = 'ACCESORIOS CELULARES';
  const NOMBRE_HOJA_MOVIMIENTOS = 'MOVIMIENTOS_ACCESORIOS';

  function ssId() {
    return Config.SPREADSHEET_IDS.ACCESORIOS();
  }

  function hojaArticulos_() {
    return SheetUtils.getSheet(ssId(), NOMBRE_HOJA_ARTICULOS);
  }

  function hojaMovimientos_() {
    return SheetUtils.getSheet(ssId(), NOMBRE_HOJA_MOVIMIENTOS);
  }

  function articuloDesdeOriginal_(row) {
    return {
      ID: row['ID_Accesorio'],
      CATEGORIA: row['Categoria'] || '',
      NOMBRE: row['Nombre del Articulo'] || '',
      MARCA: row['Marca'] || '',
      STOCK_MINIMO: 0, // el original no tiene este campo
    };
  }

  function movimientoDesdeOriginal_(row) {
    return {
      ID: row['ID_Movimiento'],
      ID_ARTICULO: row['ID_Accesorio'],
      TIPO: String(row['Tipo_movimiento'] || '').toUpperCase(), // "Entrada"/"Salida" -> "ENTRADA"/"SALIDA"
      CANTIDAD: row['Cantidad'],
      FECHA: row['Fecha'],
      USUARIO: row['Usuario'],
      COMENTARIOS: row['Comentarios'],
    };
  }

  function listarArticulos(token) {
    Auth.validarSesion(token);
    const hoja = hojaArticulos_();
    return SheetUtils.getAll(ssId(), hoja.getName()).map(articuloDesdeOriginal_);
  }

  /** Catálogo + stock calculado, en una sola llamada (evita N+1 desde el cliente) */
  function listarArticulosConStock(token) {
    Auth.validarSesion(token);
    const articulos = SheetUtils.getAll(ssId(), hojaArticulos_().getName()).map(articuloDesdeOriginal_);
    const movimientos = SheetUtils.getAll(ssId(), hojaMovimientos_().getName()).map(movimientoDesdeOriginal_);

    const stockPorArticulo = movimientos.reduce((acc, m) => {
      const cantidad = Number(m.CANTIDAD) || 0;
      const delta = m.TIPO === 'ENTRADA' ? cantidad : -cantidad;
      acc[m.ID_ARTICULO] = (acc[m.ID_ARTICULO] || 0) + delta;
      return acc;
    }, {});

    return articulos.map((a) => Object.assign({}, a, { STOCK: stockPorArticulo[a.ID] || 0 }));
  }

  function crearArticulo(token, articulo) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    const id = Utilities.getUuid().slice(0, 8);
    SheetUtils.insert(ssId(), hojaArticulos_().getName(), {
      'ID_Accesorio': id,
      'Categoria': articulo.CATEGORIA || '',
      'Nombre del Articulo': articulo.NOMBRE || '',
      'Marca': articulo.MARCA || '',
    });
    return Object.assign({ ID: id }, articulo);
  }

  function actualizarArticulo(token, id, cambios) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    const cambiosOriginal = {};
    if (cambios.CATEGORIA !== undefined) cambiosOriginal['Categoria'] = cambios.CATEGORIA;
    if (cambios.NOMBRE !== undefined) cambiosOriginal['Nombre del Articulo'] = cambios.NOMBRE;
    if (cambios.MARCA !== undefined) cambiosOriginal['Marca'] = cambios.MARCA;
    SheetUtils.update(ssId(), hojaArticulos_().getName(), id, cambiosOriginal, 'ID_Accesorio');
    return Object.assign({ ID: id }, cambios);
  }

  /** Registra una entrada o salida de stock y devuelve el stock resultante */
  function registrarMovimiento(token, idArticulo, tipo, cantidad, comentarios) {
    const sesion = Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);

    if (tipo !== 'ENTRADA' && tipo !== 'SALIDA') {
      throw new Error('Tipo de movimiento inválido: ' + tipo);
    }
    if (!(cantidad > 0)) {
      throw new Error('La cantidad debe ser mayor a 0');
    }

    const stockActual = calcularStock(idArticulo);
    if (tipo === 'SALIDA' && cantidad > stockActual) {
      throw new Error('Stock insuficiente. Disponible: ' + stockActual);
    }

    SheetUtils.insert(ssId(), hojaMovimientos_().getName(), {
      'ID_Movimiento': Utilities.getUuid().slice(0, 8),
      'ID_Accesorio': idArticulo,
      'Tipo_movimiento': tipo === 'ENTRADA' ? 'Entrada' : 'Salida',
      'Cantidad': cantidad,
      'Fecha': new Date(),
      'Usuario': sesion.correo,
      'Comentarios': comentarios || '',
    });

    return calcularStock(idArticulo);
  }

  function calcularStock(idArticulo) {
    const movimientos = SheetUtils.getAll(ssId(), hojaMovimientos_().getName())
      .map(movimientoDesdeOriginal_)
      .filter((m) => String(m.ID_ARTICULO) === String(idArticulo));

    return movimientos.reduce((stock, m) => {
      const cantidad = Number(m.CANTIDAD) || 0;
      return m.TIPO === 'ENTRADA' ? stock + cantidad : stock - cantidad;
    }, 0);
  }

  function historialMovimientos(token, idArticulo) {
    Auth.validarSesion(token);
    return SheetUtils.getAll(ssId(), hojaMovimientos_().getName())
      .map(movimientoDesdeOriginal_)
      .filter((m) => String(m.ID_ARTICULO) === String(idArticulo))
      .sort((a, b) => new Date(b.FECHA) - new Date(a.FECHA));
  }

  return {
    listarArticulos,
    listarArticulosConStock,
    crearArticulo,
    actualizarArticulo,
    registrarMovimiento,
    calcularStock,
    historialMovimientos,
  };
})();

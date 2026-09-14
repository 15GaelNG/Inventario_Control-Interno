/**
 * AccesoriosService.gs
 * Módulo de inventario clásico: catálogo de artículos + movimientos de entrada/salida.
 * Sirve de referencia de patrón para los demás Services (Vehículos, Telefonía, CajaChica).
 *
 * Hojas esperadas en el spreadsheet Config.SPREADSHEET_IDS.ACCESORIOS():
 *   ARTICULOS:   ID | CATEGORIA | NOMBRE | MARCA | STOCK_MINIMO
 *   MOVIMIENTOS: ID | ID_ARTICULO | TIPO | CANTIDAD | FECHA | USUARIO | COMENTARIOS
 */

const AccesoriosService = (function () {
  const SHEET_ARTICULOS = 'ARTICULOS';
  const SHEET_MOVIMIENTOS = 'MOVIMIENTOS';

  function ssId() {
    return Config.SPREADSHEET_IDS.ACCESORIOS();
  }

  function listarArticulos(token) {
    Auth.validarSesion(token);
    return SheetUtils.getAll(ssId(), SHEET_ARTICULOS);
  }

  /** Catálogo + stock calculado, en una sola llamada (evita N+1 desde el cliente) */
  function listarArticulosConStock(token) {
    Auth.validarSesion(token);
    const articulos = SheetUtils.getAll(ssId(), SHEET_ARTICULOS);
    const movimientos = SheetUtils.getAll(ssId(), SHEET_MOVIMIENTOS);

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
    return SheetUtils.insert(ssId(), SHEET_ARTICULOS, articulo);
  }

  function actualizarArticulo(token, id, cambios) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    return SheetUtils.update(ssId(), SHEET_ARTICULOS, id, cambios);
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

    SheetUtils.insert(ssId(), SHEET_MOVIMIENTOS, {
      ID_ARTICULO: idArticulo,
      TIPO: tipo,
      CANTIDAD: cantidad,
      FECHA: new Date(),
      USUARIO: sesion.correo,
      COMENTARIOS: comentarios || '',
    });

    return calcularStock(idArticulo);
  }

  function calcularStock(idArticulo) {
    const movimientos = SheetUtils.getAll(ssId(), SHEET_MOVIMIENTOS)
      .filter((m) => String(m.ID_ARTICULO) === String(idArticulo));

    return movimientos.reduce((stock, m) => {
      const cantidad = Number(m.CANTIDAD) || 0;
      return m.TIPO === 'ENTRADA' ? stock + cantidad : stock - cantidad;
    }, 0);
  }

  function historialMovimientos(token, idArticulo) {
    Auth.validarSesion(token);
    return SheetUtils.getAll(ssId(), SHEET_MOVIMIENTOS)
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

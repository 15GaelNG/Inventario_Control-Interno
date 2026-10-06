/**
 * CambiosVehiculosService.gs
 * Bitácora AUTOMÁTICA de cambios a un vehículo — nadie la llena a mano.
 * Cada vez que VehiculosService.actualizar() edita un registro, se compara
 * campo por campo contra lo que había antes y se guarda un renglón por cada
 * campo que de verdad cambió: quién lo hizo, cuándo, y el valor antes/después.
 *
 * Columnas reales (8), confirmadas con el usuario contra la hoja real:
 *   ID | FOLIO | TABLA | CAMPO | ANTES | DESPUES | ACTUALIZADO POR | FECHA ACTUALIZACION
 */

const CambiosVehiculosService = (function () {
  /**
   * La hoja, para HojaServicio. Con miles de filas viejas (9,000+ del sistema anterior),
   * regresarlas TODAS y ordenarlas hacía que la respuesta se perdiera en el camino. Como cada
   * renglón se agrega al final, recorrer la hoja de abajo hacia arriba ya da el orden
   * cronológico sin ordenar, y se mandan solo los más recientes.
   */
  const CAMBIOS = {
    modulo: 'cambios-vehiculos',
    libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    // Por nombre y no por columnas: una copia con las mismas 8 columnas podía quedar cacheada 6 h
    hoja: 'CAMBIOS VEHICULOS',
    columnas: ['ID', 'FOLIO', 'TABLA', 'CAMPO', 'ANTES', 'DESPUES', 'ACTUALIZADO POR', 'FECHA ACTUALIZACION'],
    // Los renglones de antes de este módulo no tienen ID; FOLIO es el que dice que el renglón es real
    incluir: (r) => !!r['FOLIO'],
    fila: (r) => ({
      ID: r['ID'] || '',
      FOLIO: r['FOLIO'] || '',
      CAMPO: r['CAMPO'] || '',
      ANTES: r['ANTES'] || '',
      DESPUES: r['DESPUES'] || '',
      ACTUALIZADO_POR: r['ACTUALIZADO POR'] || '',
      FECHA: HojaServicio.fechaISO(r['FECHA ACTUALIZACION']),
    }),
    ultimosPrimero: true,
    maximo: 500,
  };
  // Un vehículo no debería acumular tantos, pero se deja un tope generoso por seguridad
  const MAXIMO_POR_VEHICULO = 200;

  /** Normaliza un valor (crudo de la hoja, o texto del cliente) para poder
   * comparar "antes" contra "después" sin falsos cambios por diferencias de
   * formato (ej. un Date de la hoja vs. el "yyyy-MM-dd" que manda un
   * &lt;input type="date"&gt;, o espacios de más). */
  function normalizar_(valor) {
    if (valor === null || valor === undefined) return '';
    if (valor instanceof Date) {
      if (isNaN(valor.getTime())) return '';
      return Utilities.formatDate(valor, 'America/Mexico_City', 'yyyy-MM-dd');
    }
    return String(valor).trim();
  }

  /**
   * Compara datosAntes (registro completo YA guardado) contra datosNuevos
   * (solo los campos que mandó el cliente al editar) y guarda un renglón por
   * cada campo que de verdad cambió. Nunca truena hacia afuera — es una
   * bitácora, no debe poder tumbar el guardado real del vehículo si algo
   * sale mal aquí.
   */
  function registrarCambios(folio, datosAntes, datosNuevos, actualizadoPor) {
    try {
      const nombreHoja = HojaServicio.hoja(CAMBIOS).getName();
      const ahora = new Date();
      Object.keys(datosNuevos || {}).forEach((campo) => {
        const antes = normalizar_(datosAntes ? datosAntes[campo] : '');
        const despues = normalizar_(datosNuevos[campo]);
        if (antes === despues) return;
        SheetUtils.insert(HojaServicio.libro(CAMBIOS), nombreHoja, {
          ID: Ids.nuevo(Entidades.prefijo('CAMBIOS VEHICULOS')),
          // datosAntes ES el renglón completo del vehículo, así que ya trae su ID. Si no lo
          // tuviera se guarda vacío a propósito: una bitácora nunca debe tumbar el guardado.
          'ID VEHICULO': (datosAntes && datosAntes['ID']) || '',
          FOLIO: folio || '',
          TABLA: 'VEHICULOS',
          CAMPO: campo,
          ANTES: antes,
          DESPUES: despues,
          'ACTUALIZADO POR': actualizadoPor || '',
          'FECHA ACTUALIZACION': ahora,
        });
      });
    } catch (err) {
      console.error('No se pudo registrar el cambio en la bitácora de Cambios Vehículos: ' + err.message);
    }
  }

  return {
    registrarCambios,
    /** Historial — los 500 más recientes, solo lectura */
    listarResumen: (token) => HojaServicio.listar(CAMBIOS, token),
    /** Para el activador (Calentador.gs): la deja armada sin esperar a nadie */
    calentar: () => HojaServicio.calentar(CAMBIOS),
    /**
     * Todas las columnas Y TODAS las filas (no solo las 500 más recientes), para "Vista":
     * mostrar/exportar cualquier columna. La hoja tiene miles de filas — se pide solo bajo demanda.
     */
    completo: (token) => HojaServicio.completo(CAMBIOS, token),
    /** Historial de UN vehículo (detalle de Vehículos): en toda la hoja, no solo en los 500 */
    listarPorFolio: (token, folio) => HojaServicio.listarPor(CAMBIOS, token, 'FOLIO', folio, { maximo: MAXIMO_POR_VEHICULO }),
  };
})();

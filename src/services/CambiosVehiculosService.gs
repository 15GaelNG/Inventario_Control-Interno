/**
 * CambiosVehiculosService.gs
 * Bitácora AUTOMÁTICA de cambios a un vehículo — nadie la llena a mano.
 * Cada vez que VehiculosService.actualizar() edita un registro, se compara
 * campo por campo contra lo que había antes y se guarda un renglón por cada
 * campo que de verdad cambió: quién lo hizo, cuándo, y el valor antes/después.
 *
 * Columnas reales (8), confirmadas con el usuario contra la hoja real:
 *   ID_CAMBIO | FOLIO | TABLA | CAMPO | ANTES | DESPUES | ACTUALIZADO POR |
 *   FECHA ACTUALIZACION
 */

const CambiosVehiculosService = (function () {
  const COLUMNAS_FIRMA = ['ID_CAMBIO', 'FOLIO', 'TABLA', 'CAMPO', 'ANTES', 'DESPUES', 'ACTUALIZADO POR', 'FECHA ACTUALIZACION'];

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
      const sheet = hoja_();
      const ahora = new Date();
      Object.keys(datosNuevos || {}).forEach((campo) => {
        const antes = normalizar_(datosAntes ? datosAntes[campo] : '');
        const despues = normalizar_(datosNuevos[campo]);
        if (antes === despues) return;
        SheetUtils.insert(ssId(), sheet.getName(), {
          ID_CAMBIO: Utilities.getUuid().slice(0, 8),
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

  /** Historial completo, solo lectura — más reciente primero. */
  function listarResumen(token) {
    Auth.validarSesion(token);
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_FIRMA);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      if (!datos.ID_CAMBIO[i]) continue;
      resultado.push({
        ID: datos.ID_CAMBIO[i],
        FOLIO: datos.FOLIO[i] || '',
        CAMPO: datos.CAMPO[i] || '',
        ANTES: datos.ANTES[i] || '',
        DESPUES: datos.DESPUES[i] || '',
        ACTUALIZADO_POR: datos['ACTUALIZADO POR'][i] || '',
        FECHA: fechaISO_(datos['FECHA ACTUALIZACION'][i]),
      });
    }
    return resultado.sort((a, b) => new Date(b.FECHA) - new Date(a.FECHA));
  }

  return { registrarCambios, listarResumen };
})();

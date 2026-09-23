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
  // El nombre real de la pestaña ya está confirmado ("CAMBIOS VEHICULOS")
  // — se busca directo por nombre (SheetUtils.getSheet), no por columnas
  // como en Arqueos/Caja Chica. Evita cualquier riesgo de que la búsqueda
  // por columnas encuentre una pestaña equivocada (ej. una copia/respaldo
  // con las mismas 8 columnas) y la deje cacheada 6 horas.
  const NOMBRE_HOJA = 'CAMBIOS VEHICULOS';
  const COLUMNAS_FIRMA = ['ID_CAMBIO', 'FOLIO', 'TABLA', 'CAMPO', 'ANTES', 'DESPUES', 'ACTUALIZADO POR', 'FECHA ACTUALIZACION'];

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function hoja_() {
    return SheetUtils.getSheet(ssId(), NOMBRE_HOJA);
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

  // Con miles de filas viejas (esta hoja ya trae 9,000+ del sistema
  // anterior), regresarlas TODAS y luego ordenarlas con .sort() hacía que
  // la respuesta se perdiera en el camino (confirmado con pruebas: 1 solo
  // renglón sí llega bien, la lista completa no). Recorrer la hoja de
  // ABAJO hacia ARRIBA evita el sort por completo — como cada renglón se
  // agrega al final (tanto lo viejo como lo que escribe registrarCambios),
  // ya vienen en orden cronológico por posición — y de una vez limita
  // cuántos manda, para no repetir el mismo problema de tamaño.
  const MAXIMO_CAMBIOS = 500;

  /** Historial — los MAXIMO_CAMBIOS más recientes, solo lectura. */
  function listarResumen(token) {
    Permisos.puedeLeer(token, 'cambios-vehiculos');
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_FIRMA);

    const resultado = [];
    for (let i = filas - 1; i >= 0 && resultado.length < MAXIMO_CAMBIOS; i--) {
      // Los renglones viejos (de antes de este módulo) nunca tuvieron
      // ID_CAMBIO asignado — solo se genera para los nuevos de aquí en
      // adelante. FOLIO sí debería estar siempre lleno, es el indicador
      // confiable de que el renglón es real.
      if (!datos.FOLIO[i]) continue;
      resultado.push({
        ID: datos.ID_CAMBIO[i] || '',
        FOLIO: datos.FOLIO[i] || '',
        CAMPO: datos.CAMPO[i] || '',
        ANTES: datos.ANTES[i] || '',
        DESPUES: datos.DESPUES[i] || '',
        ACTUALIZADO_POR: datos['ACTUALIZADO POR'][i] || '',
        FECHA: fechaISO_(datos['FECHA ACTUALIZACION'][i]),
      });
    }
    return resultado;
  }

  /**
   * Historial de cambios de UN vehículo (para enlazarlo desde el detalle
   * de Vehículos) — recorre la hoja de abajo hacia arriba, igual que
   * listarResumen (mismo motivo: evitar el bug de .sort() con 9,000+
   * filas), pero filtrando por FOLIO en vez de limitarse a los últimos
   * MAXIMO_CAMBIOS globales — un vehículo puntual no debería acumular
   * tantos cambios como para necesitar ese límite, pero se deja uno
   * generoso (200) por seguridad.
   */
  const MAXIMO_CAMBIOS_POR_VEHICULO = 200;

  function listarPorFolio(token, folio) {
    Permisos.puedeLeer(token, 'cambios-vehiculos');
    if (!folio) return [];
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_FIRMA);

    const resultado = [];
    for (let i = filas - 1; i >= 0 && resultado.length < MAXIMO_CAMBIOS_POR_VEHICULO; i--) {
      if (String(datos.FOLIO[i] || '') !== String(folio)) continue;
      resultado.push({
        ID: datos.ID_CAMBIO[i] || '',
        FOLIO: datos.FOLIO[i] || '',
        CAMPO: datos.CAMPO[i] || '',
        ANTES: datos.ANTES[i] || '',
        DESPUES: datos.DESPUES[i] || '',
        ACTUALIZADO_POR: datos['ACTUALIZADO POR'][i] || '',
        FECHA: fechaISO_(datos['FECHA ACTUALIZACION'][i]),
      });
    }
    return resultado;
  }

  return { registrarCambios, listarResumen, listarPorFolio };
})();

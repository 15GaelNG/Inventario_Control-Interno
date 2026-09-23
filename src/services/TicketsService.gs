/**
 * TicketsService.gs
 * Bitácora general de atención/solicitudes — no es solo Uber: también cubre
 * tarjeta de combustible EOX, hologramas, etc. (columna TIPO ATENCION).
 * Vive en el mismo spreadsheet original de AppSheet que Vehículos/Uber.
 *
 * Columnas reales (10): ID | TICKET | QUIEN ATENDIO | FECHA DE REGISTRO |
 *   FECHA | DEPARTAMENTO | SOLICITANTE | TIPO ATENCION | PLACA | COMENTARIO
 */

const TicketsService = (function () {
  // Nombre real ya confirmado ("TICKETS" — ojo, no confundir con la
  // pestaña de respaldo "TICKETS 24/04/25") — directo por nombre, no por
  // firma de columnas (ver mismo comentario en ArqueosService).
  const NOMBRE_HOJA = 'TICKETS';
  const ID_COLUMN = 'ID';

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

  const COLUMNAS_RESUMEN = ['ID', 'TICKET', 'DEPARTAMENTO', 'SOLICITANTE', 'TIPO ATENCION', 'FECHA', 'QUIEN ATENDIO'];

  /** Lista ligera para la tabla (7 columnas, no las 10 completas). */
  function listarResumen(token) {
    Auth.validarSesion(token);
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_RESUMEN);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      if (!datos['ID'][i]) continue;
      resultado.push({
        ID: datos['ID'][i],
        TICKET: datos['TICKET'][i] || '',
        DEPARTAMENTO: datos['DEPARTAMENTO'][i] || '',
        SOLICITANTE: datos['SOLICITANTE'][i] || '',
        TIPO_ATENCION: datos['TIPO ATENCION'][i] || '',
        FECHA: fechaISO_(datos['FECHA'][i]),
        QUIEN_ATENDIO: datos['QUIEN ATENDIO'][i] || '',
      });
    }
    return resultado.sort((a, b) => new Date(b.FECHA) - new Date(a.FECHA));
  }

  /** Registro completo por ID (para el modal de detalle/editar). */
  function buscarPorId(token, id) {
    Auth.validarSesion(token);
    const encontrado = SheetUtils.findById(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!encontrado) return null;
    const limpio = {};
    Object.keys(encontrado.data).forEach((k) => {
      const valor = encontrado.data[k];
      limpio[k] = valor instanceof Date ? valor.toISOString() : valor;
    });
    return limpio;
  }

  /** Abre un ticket. FECHA DE REGISTRO siempre es "hoy" (no la manda el cliente). */
  function crear(token, datos) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    if (!datos['TIPO ATENCION']) throw new Error('El tipo de atención es obligatorio');
    const fila = Object.assign({}, datos);
    fila[ID_COLUMN] = Utilities.getUuid().slice(0, 8);
    fila['FECHA DE REGISTRO'] = new Date();
    if (datos['FECHA']) fila['FECHA'] = new Date(datos['FECHA']);
    SheetUtils.insert(ssId(), hoja_().getName(), fila);
    return { ID: fila[ID_COLUMN] };
  }

  function actualizar(token, id, cambios) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    const datos = Object.assign({}, cambios);
    if (datos['FECHA']) datos['FECHA'] = new Date(datos['FECHA']);
    delete datos['FECHA DE REGISTRO']; // no se edita, se fija solo al crear
    SheetUtils.update(ssId(), hoja_().getName(), id, datos, ID_COLUMN);
    return { ID: id };
  }

  function eliminar(token, id) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    const ok = SheetUtils.remove(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!ok) throw new Error('No se encontró el ticket con ID=' + id);
    return { ID: id };
  }

  /**
   * Valores sugeridos para SOLICITANTE — equivalente a la fórmula que ya
   * tenían en AppSheet: UNIQUE(SORT(TICKETS[SOLICITANTE])). Son sugerencias
   * (datalist), no una lista cerrada — se puede escribir un nombre nuevo.
   */
  function listarSolicitantes(token) {
    Auth.validarSesion(token);
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, ['SOLICITANTE']);
    const valores = new Set();
    for (let i = 0; i < filas; i++) {
      const v = datos['SOLICITANTE'][i];
      if (v) valores.add(String(v).trim());
    }
    return Array.from(valores).sort((a, b) => a.localeCompare(b));
  }

  return { listarResumen, buscarPorId, crear, actualizar, eliminar, listarSolicitantes };
})();

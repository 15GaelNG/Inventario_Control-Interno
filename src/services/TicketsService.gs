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
  // Las 10 columnas reales completas, con sus nombres tal cual la hoja (mismo shape que
  // buscarPorId): el catálogo no es grande, así que el detalle no pide un segundo viaje.
  const COLUMNAS_LISTA = ['ID', 'TICKET', 'QUIEN ATENDIO', 'FECHA DE REGISTRO', 'FECHA', 'DEPARTAMENTO', 'SOLICITANTE', 'TIPO ATENCION', 'PLACA', 'COMENTARIO'];

  /** La hoja, para HojaServicio */
  const TICKETS = {
    modulo: 'tickets',
    nombre: 'el ticket',
    libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
    // Ojo: no confundir con la pestaña de respaldo "TICKETS 24/04/25"
    hoja: 'TICKETS',
    columnas: COLUMNAS_LISTA,
    fila: (r) => {
      const fila = {};
      COLUMNAS_LISTA.forEach((c) => { fila[c] = r[c] || ''; });
      fila['FECHA'] = HojaServicio.fechaISO(r['FECHA']);
      fila['FECHA DE REGISTRO'] = HojaServicio.fechaISO(r['FECHA DE REGISTRO']);
      return fila;
    },
    orden: { campo: 'FECHA', desc: true },
    fechas: ['FECHA'],
    obligatorios: { 'TIPO ATENCION': 'El tipo de atención es obligatorio' },
    // FECHA DE REGISTRO siempre es "hoy": no la manda el cliente ni se edita
    alCrear: () => ({ 'FECHA DE REGISTRO': new Date() }),
    noEditables: ['FECHA DE REGISTRO'],
  };

  /**
   * Valores sugeridos para SOLICITANTE — equivalente a la fórmula que ya
   * tenían en AppSheet: UNIQUE(SORT(TICKETS[SOLICITANTE])). Son sugerencias
   * (datalist), no una lista cerrada — se puede escribir un nombre nuevo.
   */
  function listarSolicitantes(token) {
    Permisos.puedeLeer(token, 'tickets');
    const { filas, datos } = SheetUtils.leerColumnas(HojaServicio.hoja(TICKETS), ['SOLICITANTE']);
    const valores = new Set();
    for (let i = 0; i < filas; i++) {
      const v = datos['SOLICITANTE'][i];
      if (v) valores.add(String(v).trim());
    }
    return Array.from(valores).sort((a, b) => a.localeCompare(b));
  }

  return {
    /** Catálogo con las 10 columnas reales (nombres tal cual la hoja) */
    listarResumen: (token) => HojaServicio.listar(TICKETS, token),
    /** Para el activador (Calentador.gs): la deja armada sin esperar a nadie */
    calentar: () => HojaServicio.calentar(TICKETS),
    /** Todas las columnas de TODOS los tickets (para "Vista": mostrar/exportar cualquier columna) */
    completo: (token) => HojaServicio.completo(TICKETS, token),
    buscarPorId: (token, id) => HojaServicio.buscarPorId(TICKETS, token, id),
    crear: (token, datos) => HojaServicio.crear(TICKETS, token, datos),
    actualizar: (token, id, cambios) => HojaServicio.actualizar(TICKETS, token, id, cambios),
    eliminar: (token, id) => HojaServicio.eliminar(TICKETS, token, id),
    listarSolicitantes,
  };
})();

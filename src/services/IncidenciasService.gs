/**
 * IncidenciasService.gs
 * Bitácora de taller mecánico por vehículo: registro de ingreso, trabajo
 * realizado y salida. Vive dentro del área "Servicios Vehiculares".
 *
 * Conectado al spreadsheet ORIGINAL de AppSheet (en vivo) — hoja real
 * "INCIDENCIAS". Columnas reales en español con espacios/acentos, mapeadas
 * aquí a nuestro esquema interno (mismo patrón que AccesoriosService.gs).
 *
 * Columnas reales: ID_INCIDENCIA | FOLIO | DEPARTAMENTO | MODELO | AÑO |
 *   FECHA REGISTRO | FECHA INSPECCION | KILOMETRAJE | TICKET |
 *   INSPECCION INGRESO | DESCRIPCION TRABAJO REALIZADO |
 *   FECHA TRABAJO REALIZADO | INSPECCION SALIDA | NOMBRE MECANICO |
 *   PERIODO VERIFICACION | SEGURO AUTO
 */

const IncidenciasService = (function () {
  // Nombre real ya confirmado ("INCIDENCIAS") — directo por nombre, no por
  // firma de columnas (ver mismo comentario en ArqueosService).
  const NOMBRE_HOJA = 'INCIDENCIAS';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function hoja_() {
    return SheetUtils.getSheet(ssId(), NOMBRE_HOJA);
  }

  /**
   * google.script.run puede fallar (entregando null al cliente en vez del
   * arreglo real) cuando un ARREGLO de objetos trae valores Date crudos —
   * por eso aquí siempre se convierten a texto ISO antes de regresar.
   */
  function fechaISO_(valor) {
    if (!valor) return '';
    const f = valor instanceof Date ? valor : new Date(valor);
    return isNaN(f.getTime()) ? '' : f.toISOString();
  }

  function desdeOriginal_(row) {
    const trabajoHecho = !!(row['DESCRIPCION TRABAJO REALIZADO'] || row['INSPECCION SALIDA']);
    return {
      ID: row['ID_INCIDENCIA'],
      FOLIO: row['FOLIO'] || '',
      DEPARTAMENTO: row['DEPARTAMENTO'] || '',
      MODELO: row['MODELO'] || '',
      ANIO: row['AÑO'] || '',
      FECHA_REGISTRO: fechaISO_(row['FECHA REGISTRO']),
      FECHA_INSPECCION: fechaISO_(row['FECHA INSPECCION']),
      KILOMETRAJE: row['KILOMETRAJE'] || '',
      TICKET: row['TICKET'] || '',
      INSPECCION_INGRESO: row['INSPECCION INGRESO'] || '',
      DESCRIPCION_TRABAJO: row['DESCRIPCION TRABAJO REALIZADO'] || '',
      FECHA_TRABAJO: fechaISO_(row['FECHA TRABAJO REALIZADO']),
      INSPECCION_SALIDA: row['INSPECCION SALIDA'] || '',
      MECANICO: row['NOMBRE MECANICO'] || '',
      PERIODO_VERIFICACION: row['PERIODO VERIFICACION'] || '',
      SEGURO_AUTO: row['SEGURO AUTO'] || '',
      ESTADO: trabajoHecho ? 'CERRADA' : 'ABIERTA',
    };
  }

  function listar(token) {
    Permisos.puedeLeer(token, 'incidencias');
    return SheetUtils.getAll(ssId(), hoja_().getName())
      .map(desdeOriginal_)
      .sort((a, b) => new Date(b.FECHA_REGISTRO) - new Date(a.FECHA_REGISTRO));
  }

  /** Abre una nueva incidencia (ingreso del vehículo al taller) */
  function crear(token, datos) {
    Permisos.puedeEditar(token, 'incidencias');
    if (!datos.FOLIO) throw new Error('El folio del vehículo es obligatorio');

    const id = Utilities.getUuid().slice(0, 8);
    const ahora = new Date();
    SheetUtils.insert(ssId(), hoja_().getName(), {
      'ID_INCIDENCIA': id,
      'FOLIO': datos.FOLIO,
      'DEPARTAMENTO': datos.DEPARTAMENTO || '',
      'MODELO': datos.MODELO || '',
      'AÑO': datos.ANIO || '',
      // Fecha de registro: siempre "hoy", ignora cualquier valor del cliente.
      'FECHA REGISTRO': ahora,
      // Fecha de inspección: editable, no necesariamente igual a la de registro.
      'FECHA INSPECCION': datos.FECHA_INSPECCION ? new Date(datos.FECHA_INSPECCION) : ahora,
      'KILOMETRAJE': datos.KILOMETRAJE || '',
      'TICKET': datos.TICKET || '',
      'INSPECCION INGRESO': datos.INSPECCION_INGRESO || '',
      'PERIODO VERIFICACION': datos.PERIODO_VERIFICACION || '',
      'SEGURO AUTO': datos.SEGURO_AUTO || '',
    });
    return { ID: id };
  }

  /** Cierra una incidencia abierta (trabajo realizado + inspección de salida) */
  function cerrar(token, id, datos) {
    Permisos.puedeEditar(token, 'incidencias');
    if (!datos.DESCRIPCION_TRABAJO) throw new Error('Describe el trabajo realizado');

    SheetUtils.update(ssId(), hoja_().getName(), id, {
      'DESCRIPCION TRABAJO REALIZADO': datos.DESCRIPCION_TRABAJO,
      'FECHA TRABAJO REALIZADO': datos.FECHA_TRABAJO ? new Date(datos.FECHA_TRABAJO) : new Date(),
      'INSPECCION SALIDA': datos.INSPECCION_SALIDA || '',
      'NOMBRE MECANICO': datos.MECANICO || '',
    }, 'ID_INCIDENCIA');
    return { ID: id };
  }

  /** Corrige cualquier campo de una incidencia existente (abierta o cerrada) */
  function actualizar(token, id, datos) {
    Permisos.puedeEditar(token, 'incidencias');
    const cambios = {};
    if (datos.FOLIO !== undefined) cambios['FOLIO'] = datos.FOLIO;
    if (datos.DEPARTAMENTO !== undefined) cambios['DEPARTAMENTO'] = datos.DEPARTAMENTO;
    if (datos.MODELO !== undefined) cambios['MODELO'] = datos.MODELO;
    if (datos.ANIO !== undefined) cambios['AÑO'] = datos.ANIO;
    if (datos.FECHA_INSPECCION !== undefined) {
      cambios['FECHA INSPECCION'] = datos.FECHA_INSPECCION ? new Date(datos.FECHA_INSPECCION) : '';
    }
    if (datos.KILOMETRAJE !== undefined) cambios['KILOMETRAJE'] = datos.KILOMETRAJE;
    if (datos.TICKET !== undefined) cambios['TICKET'] = datos.TICKET;
    if (datos.PERIODO_VERIFICACION !== undefined) cambios['PERIODO VERIFICACION'] = datos.PERIODO_VERIFICACION;
    if (datos.SEGURO_AUTO !== undefined) cambios['SEGURO AUTO'] = datos.SEGURO_AUTO;
    if (datos.INSPECCION_INGRESO !== undefined) cambios['INSPECCION INGRESO'] = datos.INSPECCION_INGRESO;
    if (datos.DESCRIPCION_TRABAJO !== undefined) cambios['DESCRIPCION TRABAJO REALIZADO'] = datos.DESCRIPCION_TRABAJO;
    if (datos.FECHA_TRABAJO !== undefined) {
      cambios['FECHA TRABAJO REALIZADO'] = datos.FECHA_TRABAJO ? new Date(datos.FECHA_TRABAJO) : '';
    }
    if (datos.INSPECCION_SALIDA !== undefined) cambios['INSPECCION SALIDA'] = datos.INSPECCION_SALIDA;
    if (datos.MECANICO !== undefined) cambios['NOMBRE MECANICO'] = datos.MECANICO;

    // Regresa el registro ya con el cambio aplicado (no solo el ID): así el
    // cliente puede refrescar esa fila sola (ej. DataTable.alEditar) sin
    // tener que recargar todo el historial.
    const actualizado = SheetUtils.update(ssId(), hoja_().getName(), id, cambios, 'ID_INCIDENCIA');
    return desdeOriginal_(actualizado);
  }

  /** Elimina por completo una incidencia (borrado físico de la fila) — solo ADMIN */
  function eliminar(token, id) {
    Permisos.puedeEditar(token, 'incidencias');
    const ok = SheetUtils.remove(ssId(), hoja_().getName(), id, 'ID_INCIDENCIA');
    if (!ok) throw new Error('No se encontró la incidencia con ID=' + id);
    return { ID: id };
  }

  /**
   * Diagnóstico de solo lectura. Envuelto en try/catch total y con todo
   * convertido a tipos primitivos/strings antes de regresar — así no hay
   * duda de si algo se pierde por una serialización rara de google.script.run.
   */
  function diagnostico(token) {
    try {
      Permisos.puedeLeer(token, 'incidencias');
      const hoja = hoja_();
      const crudos = SheetUtils.getAll(ssId(), hoja.getName());
      return {
        ok: true,
        spreadsheetId: String(ssId()),
        nombreHoja: String(hoja.getName()),
        totalFilas: Number(Math.max(0, hoja.getLastRow() - 1)),
        totalColumnas: Number(hoja.getLastColumn()),
        getAllLength: Number(crudos.length),
        primeraFilaCrudaJSON: crudos[0] ? JSON.stringify(crudos[0]) : '(sin filas)',
      };
    } catch (err) {
      return { ok: false, errorGeneral: String((err && err.stack) || err) };
    }
  }

  return { listar, crear, cerrar, actualizar, eliminar, diagnostico };
})();

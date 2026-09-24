/**
 * LineasOperativas.gs
 * Altas de REACTIVACION DE LINEAS y SOLICITUD DE LINEAS, réplica del AppSheet (v1.001924):
 * mismos campos y orden del formulario, mismas opciones (y en el mismo orden), "Initial value",
 * obligatorios, Valid_If contra LISTAS TELEFONOS y folios.
 *
 * Controles: texto | area | fecha | lista (Valid_If: solo valores de la lista) |
 *   listaAbierta (Enum con AllowOtherValues: sugerencias + cualquier otro valor) |
 *   siNo (Yes/No) | referencia (Ref a LINEAS TELEFONICAS) | calculado (solo lectura).
 */

const LineasOperativas = (function () {
  const ZONA = 'America/Mexico_City';
  const hoy_ = () => Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');

  const campo_ = (columna, etiqueta, control, extra) => Object.assign({
    tipo: 'campo', columna: columna, etiqueta: etiqueta, control: control, requerido: 'NUNCA', mostrar: 'SIEMPRE', soloLectura: false, valor: '',
  }, extra || {});
  const req = { requerido: 'SIEMPRE' };

  /** Opciones de la referencia a LINEAS TELEFONICAS (la etiqueta de la tabla en AppSheet es el IMEI). */
  function opcionesLineas_() {
    const filas = LineasDatos.leerTabla(LineasRepo.TAB.LINEAS);
    return filas.map((f) => {
      const t = (c) => { const v = LineasUtil.col(f, c); return v === null || v === undefined ? '' : String(v); };
      const id = t('ID');
      if (!id) return null;
      return {
        id: id,
        etiqueta: (t('IMEI') || 'SIN IMEI') + ' · ' + (t('NUMERO TELEFONO') || '—') + (t('NUCO') ? ' · NUCO ' + t('NUCO') : ''),
        datos: { 'NUMERO TELEFONO': t('NUMERO TELEFONO'), 'NUMERO SIM': t('NUMERO SIM') },
      };
    }).filter(Boolean);
  }

  const FORMULARIOS = {
    // REACTIVACION DE LINEAS_Form usa el orden de la tabla (ID oculto)
    REACTIVACION: (usuario, catalogos, conOpciones) => [
      campo_('FOLIO', 'FOLIO', 'calculado', { valor: 'Se asigna al guardar (MAX + 1)', soloLectura: true }),
      campo_('LINIEA SUSPENDIDA', 'LINEA SUSPENDIDA', 'texto', { soloLectura: true, deriva: { de: 'IMEI', dato: 'NUMERO TELEFONO' } }),
      campo_('COMPAÑIA', 'COMPAÑIA', 'listaAbierta', { opciones: ['AT&T', 'TELCEL FRO', 'TELCEL GPH'] }),
      campo_('SIM', 'SIM', 'texto', { soloLectura: true, deriva: { de: 'IMEI', dato: 'NUMERO SIM' } }),
      campo_('CORREO / TICKET', 'CORREO / TICKET', 'texto'),
      campo_('FECHA DE SUSPENSION', 'FECHA DE SUSPENSION', 'fecha', { valor: hoy_() }),
      campo_('ESTATUS', 'ESTATUS', 'listaAbierta', { opciones: ['EN USO', 'DISPONIBLE', 'EN PROCESO DE ASIGNACION', 'PROCESO DE CANCELACION', 'CANCELADA', 'ACTUALIZACIÓN DE LINEA TELEFONICA'] }),
      campo_('ESTADO DEL EQUIPO', 'ESTADO DEL EQUIPO', 'listaAbierta', { opciones: ['EQUIPO CON ADENDUM', 'EQUIPO SIN ADENDUM', 'EQUIPO DE USO', 'PORTABILIDAD', 'RENOVACION'] }),
      campo_('IMEI', 'IMEI', 'referencia', Object.assign({ opciones: conOpciones ? opcionesLineas_() : [] }, req)),
      campo_('RETRO DE SOLICITUD', 'RETRO DE SOLICITUD', 'listaAbierta', { opciones: ['SUSPENSION DE LINEA', 'ACTIVACION DE LINEA', 'CAMBIO DE NUMERO', 'TRAMITE CONCLUIDO', 'PENDIENTE DE ENTREGA', 'CANCELACION'] }),
      campo_('FECHA DE REACTIVACION', 'FECHA DE REACTIVACION', 'fecha', { valor: hoy_() }),
      campo_('NUEVO NUMERO', 'NUEVO NUMERO', 'texto'),
      campo_('FECHA DE REGISTRO', 'FECHA DE REGISTRO', 'calculado', { valor: Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm'), soloLectura: true }),
      campo_('QUIEN REGISTRO', 'QUIEN REGISTRO', 'texto', { valor: usuario.nombre || '', soloLectura: true }),
      campo_('COMENTARIOS', 'COMENTARIOS', 'area'),
    ],
    // SOLICITUD DE LINEAS_Form (ColumnOrder del AppSheet)
    SOLICITUD: (usuario, catalogos) => [
      campo_('FOLIO', 'FOLIO', 'calculado', { valor: 'Se asigna al guardar (_RowNumber - 1)', soloLectura: true }),
      campo_('FECHA DE SOLICITUD', 'FECHA DE SOLICITUD', 'fecha', Object.assign({ valor: hoy_() }, req)),
      campo_('TIPO DE PLAN', 'TIPO DE PLAN', 'listaAbierta', Object.assign({ opciones: ['PLAN DE VOZ', 'PLAN PARA MODEM MOVIL', 'SIM BASICO'] }, req)),
      campo_('TICKET', 'TICKET', 'texto', req),
      campo_('NO EMPLEADO SOLICITANTE', 'NÚMERO DE EMPLEADO DEL SOLICITANTE', 'texto', req),
      campo_('NOMBRE SOLICITANTE', 'NOMBRE COMPLETO DEL SOLICITANTE', 'texto', req),
      campo_('PUESTO SOLICITANTE', 'PUESTO DEL SOLICITANTE', 'texto', req),
      campo_('DEPARTAMENTO SOLICITANTE', 'DEPARTAMENTO DEL SOLICITANTE', 'texto', req),
      campo_('SEDE', 'SEDE', 'lista', Object.assign({ opciones: catalogos.sedes || [], mensaje: 'VALOR NO ENCONTRADO EN LA LISTA AUTORIZADA' }, req)),
      campo_('DEPARTAMENTO', 'DEPARTAMENTO', 'lista', Object.assign({ opciones: catalogos.departamentos || [], mensaje: 'VALOR NO ENCONTRADO EN LA LISTA AUTORIZADA' }, req)),
      campo_('TIPO', 'TIPO', 'listaAbierta', Object.assign({ opciones: ['OFICINA', 'DESARROLLO'] }, req)),
      campo_('PUESTO', 'PUESTO', 'texto', req),
      campo_('COLABORADOR', 'COLABORADOR', 'texto', req),
      campo_('SOLICITANTE', 'SOLICITANTE', 'listaAbierta', { opciones: ['ROSA FELICITAS MIRANDA CAYETANO', 'INGRID CARMONA ORNELAS', 'BARBARA MEDRANO', 'DAVID MOISES MALDONADO HERNANDEZ', 'YOVANNI NAVA PERALTA'] }),
      campo_('FECHA DE ENTREGA', 'FECHA DE ENTREGA', 'fecha', Object.assign({ valor: hoy_() }, req)),
      campo_('ASIGNACION', 'ASIGNACION', 'siNo', req),
      campo_('REASIGNACION', 'REASIGNACION', 'calculado', { soloLectura: true, formula: 'NO_ASIGNACION' }),
      campo_('COMPAÑIA', 'COMPAÑIA', 'listaAbierta', { opciones: ['TELCEL FRO', 'TELCEL GPH', 'AT&T'] }),
      campo_('EQUIPO', 'EQUIPO', 'lista', Object.assign({ opciones: catalogos.modelos || [], mensaje: 'NO SE ENCUENTRA EN LA LSITA AUTORIZADA' }, req)),
      campo_('NUMERO ANTERIOR', 'NUMERO ANTERIOR', 'texto'),
      campo_('NUMERO ACTUAL', 'NUMERO ACTUAL', 'texto'),
      campo_('IMEI', 'IMEI', 'texto'),
      campo_('SIM', 'SIM', 'texto'),
      campo_('ESTATUS', 'ESTATUS', 'listaAbierta', { opciones: ['PROCESO DE ADQUISICION', 'FINALIZADO', 'TRAMITE CANCELADO'] }),
      campo_('COMENTARIOS', 'COMENTARIOS', 'area'),
      campo_('FECHA DE REGISTRO', 'FECHA DE REGISTRO', 'calculado', { valor: Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm'), soloLectura: true }),
      campo_('QUIEN REGISTRO', 'QUIEN REGISTRO', 'texto', { valor: usuario.nombre || '', soloLectura: true }),
    ],
  };

  const TABLAS = { REACTIVACION: () => LineasRepo.TAB.REACTIVACION, SOLICITUD: () => LineasRepo.TAB.SOLICITUD };

  function formulario(tipo, usuario) {
    const clave = String(tipo || '').toUpperCase();
    if (!FORMULARIOS[clave]) throw new Error('Este módulo no admite altas.');
    return FORMULARIOS[clave](usuario, LineasRepo.catalogos(), true);
  }

  /** Valida como el AppSheet: obligatorios, Valid_If de listas, Yes/No y referencia existente. */
  function validar_(elementos, enviados) {
    const valores = {};
    const errores = [];
    elementos.forEach((e) => {
      if (e.soloLectura) return;
      let v = enviados && enviados[e.columna] !== undefined && enviados[e.columna] !== null ? String(enviados[e.columna]).trim() : '';
      if (e.requerido === 'SIEMPRE' && v === '') { errores.push(e.etiqueta + ' es obligatorio'); return; }
      if (v === '') { valores[e.columna] = ''; return; }
      if (e.control === 'lista' && e.opciones.map((o) => String(o).toUpperCase()).indexOf(v.toUpperCase()) < 0) errores.push(e.etiqueta + ': ' + (e.mensaje || 'VALOR NO ENCONTRADO EN LA LISTA'));
      if (e.control === 'siNo') {
        if (['TRUE', 'FALSE'].indexOf(v.toUpperCase()) < 0) errores.push(e.etiqueta + ': valor no válido');
        v = v.toUpperCase() === 'TRUE';
      }
      if (e.control === 'fecha') {
        const d = new Date(v + 'T12:00:00');
        if (isNaN(d)) errores.push(e.etiqueta + ': fecha no válida');
        else v = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
      valores[e.columna] = v;
    });
    return { valores: valores, errores: errores };
  }

  /** Agrega el registro con el folio del AppSheet. */
  function crear(tipo, enviados, usuario) {
    const clave = String(tipo || '').toUpperCase();
    if (!FORMULARIOS[clave]) throw new Error('Este módulo no admite altas.');
    const elementos = FORMULARIOS[clave](usuario, LineasRepo.catalogos(), false);
    const r = validar_(elementos, enviados || {});
    if (r.errores.length) throw new Error(r.errores.join(' · '));
    const valores = r.valores;
    const tabla = TABLAS[clave]();

    return LineasDatos.conCandado(() => {
      const ahora = new Date();
      const fila = Object.assign({}, valores, {
        'ID': LineasDatos.nuevoIdCorto(), 'FECHA DE REGISTRO': ahora, 'QUIEN REGISTRO': usuario.nombre || usuario.correo,
      });
      if (clave === 'REACTIVACION') {
        // IMEI es Ref a LINEAS TELEFONICAS: guarda el ID; LINEA SUSPENDIDA y SIM = [IMEI].[...]
        const filas = LineasDatos.buscarFilas(LineasRepo.TAB.LINEAS, 'ID', valores['IMEI']);
        if (!filas.length) throw new Error('IMEI: selecciona una línea de la lista.');
        const linea = LineasDatos.leerFilas([{ tabla: LineasRepo.TAB.LINEAS, filas: filas.slice(0, 1) }])[0][0];
        fila['LINIEA SUSPENDIDA'] = LineasUtil.col(linea, 'NUMERO TELEFONO');
        fila['SIM'] = LineasUtil.col(linea, 'NUMERO SIM');
        // FOLIO = MAX(REACTIVACION DE LINEAS[FOLIO]) + 1
        fila['FOLIO'] = LineasDatos.leerTabla(tabla).reduce((max, f) => Math.max(max, Number(LineasUtil.col(f, 'FOLIO')) || 0), 0) + 1;
      } else {
        // REASIGNACION = NOT([ASIGNACION]); FOLIO = [_RowNumber] - 1 (fila de la hoja donde queda el registro)
        fila['REASIGNACION'] = !valores['ASIGNACION'];
        fila['FOLIO'] = LineasDatos.ultimaFila(tabla); // la nueva fila es ultimaFila + 1 → folio = ultimaFila
      }
      const numeroFila = LineasDatos.agregarFilas(tabla, [fila])[0];
      if (clave === 'SOLICITUD' && numeroFila - 1 !== fila['FOLIO']) {
        LineasDatos.actualizarFila(tabla, numeroFila, { 'FOLIO': numeroFila - 1 });
        fila['FOLIO'] = numeroFila - 1;
      }
      return { ok: true, folio: fila['FOLIO'], fila: numeroFila };
    });
  }

  return { formulario, crear };
})();

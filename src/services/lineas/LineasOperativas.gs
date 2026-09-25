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
        datos: { 'NUMERO TELEFONO': t('NUMERO TELEFONO'), 'NUMERO SIM': t('NUMERO SIM'), 'FOLIO': t('FOLIO'), 'EQUIPO': t('EQUIPO'), 'NUCO': t('NUCO') },
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
      // Mejora: en AppSheet eran texto libre; ahora se eligen de COLABORADORES (y se llenan juntos)
      campo_('NO EMPLEADO SOLICITANTE', 'NÚMERO DE EMPLEADO DEL SOLICITANTE', 'listaAbierta', Object.assign({ sugerencias: 'NO_EMPLEADO',
        autollenar: { 'NOMBRE SOLICITANTE': 'nombre', 'PUESTO SOLICITANTE': 'puesto', 'DEPARTAMENTO SOLICITANTE': 'departamento' } }, req)),
      campo_('NOMBRE SOLICITANTE', 'NOMBRE COMPLETO DEL SOLICITANTE', 'listaAbierta', Object.assign({ sugerencias: 'PERSONAS',
        autollenar: { 'NO EMPLEADO SOLICITANTE': 'noEmpleado', 'PUESTO SOLICITANTE': 'puesto', 'DEPARTAMENTO SOLICITANTE': 'departamento' } }, req)),
      campo_('PUESTO SOLICITANTE', 'PUESTO DEL SOLICITANTE', 'listaAbierta', Object.assign({ opciones: catalogos.puestos || [], sugerencias: 'PUESTOS' }, req)),
      campo_('DEPARTAMENTO SOLICITANTE', 'DEPARTAMENTO DEL SOLICITANTE', 'listaAbierta', Object.assign({ opciones: catalogos.departamentos || [], sugerencias: 'DEPARTAMENTOS' }, req)),
      campo_('SEDE', 'SEDE', 'lista', Object.assign({ opciones: catalogos.sedes || [], mensaje: 'VALOR NO ENCONTRADO EN LA LISTA AUTORIZADA' }, req)),
      campo_('DEPARTAMENTO', 'DEPARTAMENTO', 'lista', Object.assign({ opciones: catalogos.departamentos || [], mensaje: 'VALOR NO ENCONTRADO EN LA LISTA AUTORIZADA' }, req)),
      campo_('TIPO', 'TIPO', 'listaAbierta', Object.assign({ opciones: ['OFICINA', 'DESARROLLO'] }, req)),
      campo_('PUESTO', 'PUESTO', 'listaAbierta', Object.assign({ opciones: catalogos.puestos || [], sugerencias: 'PUESTOS' }, req)),
      campo_('COLABORADOR', 'COLABORADOR', 'listaAbierta', Object.assign({ sugerencias: 'PERSONAS', autollenar: { 'PUESTO': 'puesto' } }, req)),
      campo_('SOLICITANTE', 'SOLICITANTE', 'listaAbierta', { opciones: ['ROSA FELICITAS MIRANDA CAYETANO', 'INGRID CARMONA ORNELAS', 'BARBARA MEDRANO', 'DAVID MOISES MALDONADO HERNANDEZ', 'YOVANNI NAVA PERALTA'] }),
      campo_('FECHA DE ENTREGA', 'FECHA DE ENTREGA', 'fecha', Object.assign({ valor: hoy_() }, req)),
      campo_('ASIGNACION', 'ASIGNACION', 'siNo', req),
      campo_('REASIGNACION', 'REASIGNACION', 'calculado', { soloLectura: true, formula: 'NO_ASIGNACION' }),
      campo_('COMPAÑIA', 'COMPAÑIA', 'listaAbierta', { opciones: ['TELCEL FRO', 'TELCEL GPH', 'AT&T'] }),
      campo_('EQUIPO', 'EQUIPO', 'lista', Object.assign({ opciones: catalogos.modelos || [], mensaje: 'NO SE ENCUENTRA EN LA LSITA AUTORIZADA' }, req)),
      campo_('NUMERO ANTERIOR', 'NUMERO ANTERIOR', 'listaAbierta', { sugerencias: 'NUMEROS' }),
      campo_('NUMERO ACTUAL', 'NUMERO ACTUAL', 'listaAbierta', { sugerencias: 'NUMEROS' }),
      campo_('IMEI', 'IMEI', 'listaAbierta', { sugerencias: 'IMEIS' }),
      campo_('SIM', 'SIM', 'listaAbierta', { sugerencias: 'SIMS' }),
      campo_('ESTATUS', 'ESTATUS', 'listaAbierta', { opciones: ['PROCESO DE ADQUISICION', 'FINALIZADO', 'TRAMITE CANCELADO'] }),
      campo_('COMENTARIOS', 'COMENTARIOS', 'area'),
      campo_('FECHA DE REGISTRO', 'FECHA DE REGISTRO', 'calculado', { valor: Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm'), soloLectura: true }),
      campo_('QUIEN REGISTRO', 'QUIEN REGISTRO', 'texto', { valor: usuario.nombre || '', soloLectura: true }),
    ],
  };

  // BITACORA DE DESECHO_Form (ColumnOrder del AppSheet); EVIDENCIA y AUTORIZACION son archivos obligatorios
  FORMULARIOS.DESECHO = (usuario, catalogos, conOpciones) => [
    campo_('ID_EQUIPO', 'IMEI EQUIPO', 'referencia', Object.assign({ opciones: conOpciones ? opcionesLineas_() : [] }, req)),
    campo_('FOLIO EQUIPO', 'FOLIO EQUIPO', 'texto', { soloLectura: true, deriva: { de: 'ID_EQUIPO', dato: 'FOLIO' } }),
    campo_('EQUIPO', 'EQUIPO', 'texto', { soloLectura: true, deriva: { de: 'ID_EQUIPO', dato: 'EQUIPO' } }),
    campo_('LUGAR DE DESECHO', 'LUGAR DE DESECHO', 'listaAbierta', Object.assign({ opciones: catalogos.lugaresDesecho || [] }, req)),
    campo_('EVIDENCIA', 'EVIDENCIA', 'archivo', req),
    campo_('AUTORIZACION', 'AUTORIZACION', 'archivo', req),
    campo_('ESTADO', 'ESTADO', 'listaAbierta', Object.assign({ opciones: catalogos.estadosDesecho || [] }, req)),
    campo_('MOTIVO', 'MOTIVO', 'listaAbierta', Object.assign({ opciones: catalogos.motivosDesecho || [] }, req)),
    campo_('FECHA DE DESECHO', 'FECHA DE DESECHO', 'fecha', req),
    campo_('FECHA DE REGISTRO', 'FECHA DE REGISTRO', 'calculado', { valor: Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy'), soloLectura: true }),
    campo_('QUIEN REGISTRO', 'QUIEN REGISTRO', 'texto', { valor: usuario.nombre || '', soloLectura: true }),
  ];

  const TABLAS = { REACTIVACION: () => LineasRepo.TAB.REACTIVACION, SOLICITUD: () => LineasRepo.TAB.SOLICITUD, DESECHO: () => LineasRepo.TAB.DESECHO };

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
      if (e.soloLectura || e.control === 'archivo') return;
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
  function crear(tipo, datos, usuario) {
    const clave = String(tipo || '').toUpperCase();
    if (!FORMULARIOS[clave]) throw new Error('Este módulo no admite altas.');
    const enviados = (datos && datos.valores) || datos || {};
    const archivos = (datos && datos.archivos) || {};
    const elementos = FORMULARIOS[clave](usuario, LineasRepo.catalogos(), false);
    const r = validar_(elementos, enviados);
    elementos.filter((e) => e.control === 'archivo' && e.requerido === 'SIEMPRE' && !(archivos[e.columna] && archivos[e.columna].base64))
      .forEach((e) => r.errores.push(e.etiqueta + ' es obligatorio'));
    if (r.errores.length) throw new Error(r.errores.join(' · '));
    const valores = r.valores;
    const tabla = TABLAS[clave]();

    return LineasDatos.conCandado(() => {
      const ahora = new Date();
      const fila = Object.assign({}, valores, {
        'ID': LineasDatos.nuevoIdCorto(), 'FECHA DE REGISTRO': ahora, 'QUIEN REGISTRO': usuario.nombre || usuario.correo,
      });
      if (clave === 'DESECHO') {
        // ID_EQUIPO es Ref a LINEAS TELEFONICAS; FOLIO EQUIPO / EQUIPO / IMEI = [ID_EQUIPO].[...]
        const filas = LineasDatos.buscarFilas(LineasRepo.TAB.LINEAS, 'ID', valores['ID_EQUIPO']);
        if (!filas.length) throw new Error('IMEI EQUIPO: selecciona un equipo de la lista.');
        const equipo = LineasDatos.leerFilas([{ tabla: LineasRepo.TAB.LINEAS, filas: filas.slice(0, 1) }])[0][0];
        delete fila['ID'];
        fila['ID_DESECHO'] = LineasDatos.nuevoIdCorto();
        fila['FOLIO EQUIPO'] = LineasUtil.col(equipo, 'FOLIO');
        fila['EQUIPO'] = LineasUtil.col(equipo, 'EQUIPO');
        fila['IMEI'] = LineasUtil.col(equipo, 'IMEI');
        // FECHA DE REGISTRO = TODAY()
        fila['FECHA DE REGISTRO'] = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
        const nuco = LineasUtil.col(equipo, 'NUCO');
        ['EVIDENCIA', 'AUTORIZACION'].forEach((c) => {
          const a = archivos[c];
          fila[c] = LineasEvidencias.guardarArchivoDeRegistro(nuco, 'DESECHO', c + ' ' + (a.nombre || ''), a.mime, a.base64);
        });
      } else if (clave === 'REACTIVACION') {
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
      if (clave === 'DESECHO') {
        // Bot FOLIO DESECHO: "DR" & RIGHT("0000" & ([_ROWNUMBER] - 1), 4)
        fila['FOLIO DESECHO'] = 'DR' + ('0000' + (numeroFila - 1)).slice(-4);
        LineasDatos.actualizarFila(tabla, numeroFila, { 'FOLIO DESECHO': fila['FOLIO DESECHO'] });
        return { ok: true, folio: fila['FOLIO DESECHO'], fila: numeroFila };
      }
      if (clave === 'SOLICITUD' && numeroFila - 1 !== fila['FOLIO']) {
        LineasDatos.actualizarFila(tabla, numeroFila, { 'FOLIO': numeroFila - 1 });
        fila['FOLIO'] = numeroFila - 1;
      }
      return { ok: true, folio: fila['FOLIO'], fila: numeroFila };
    });
  }

  return { formulario, crear };
})();

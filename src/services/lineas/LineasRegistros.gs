/** Alta y edición directa de registros de LINEAS TELEFONICAS. */
const LineasRegistros = (function () {
  const CAMPOS = ['TIPO', 'NUCO', 'EQUIPO', 'IMEI', 'COLOR', 'ACCESORIOS', 'ESTATUS EQUIPO', 'CUENTA GOOGLE', 'PIN EQUIPO', 'PATRON', 'CONTRASEÑA MODEM',
    'NUMERO TELEFONO', 'NUMERO SIM', 'COMPAÑIA', 'COSTO PLAN', 'INICIO PLAN', 'FIN PLAN', 'ESTATUS LINEA', 'PIN WHATSAPP',
    'NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'SEDE', 'OFICINA / DESARROLLO', 'DEPARTAMENTO', 'AREA', 'JEFE DIRECTO', 'DIRECTOR', 'RAZON SOCIAL', 'COMENTARIOS'];

  function texto_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function asegurarEsquema_() {
    const tabla = LineasDatos.tablaFresca(LineasRepo.TAB.LINEAS);
    if (LineasDatos.colIndice(tabla, 'COLOR') < 0) LineasDatos.asegurarPestana(LineasRepo.TAB.LINEAS, ['COLOR']);
  }
  function datosHoja_(datos) {
    const salida = {};
    CAMPOS.forEach((campo) => { if (Object.prototype.hasOwnProperty.call(datos || {}, campo)) salida[campo] = texto_(datos[campo]); });
    salida.TIPO = texto_(salida.TIPO).toUpperCase();
    if (LineasRepo.CATALOGO.tipos.indexOf(salida.TIPO) < 0) throw new Error('Selecciona un tipo de registro válido.');
    if (!texto_(salida.NUCO)) throw new Error('El NUCO es obligatorio.');
    const conEquipo = Object.prototype.hasOwnProperty.call(LineasRepo.TIPOS_CON_EQUIPO, salida.TIPO);
    const conLinea = LineasRepo.TIPOS_CON_LINEA.indexOf(salida.TIPO) >= 0;
    if (conEquipo && !texto_(salida.EQUIPO)) throw new Error('El modelo del equipo es obligatorio.');
    if (conLinea && LineasRepo.TIPOS_LINEA_OPCIONAL.indexOf(salida.TIPO) < 0 && !texto_(salida['NUMERO TELEFONO'])) throw new Error('El número telefónico es obligatorio para este tipo.');
    if (!conEquipo) ['EQUIPO', 'IMEI', 'COLOR', 'ACCESORIOS', 'ESTATUS EQUIPO', 'CUENTA GOOGLE', 'PIN EQUIPO', 'PATRON', 'CONTRASEÑA MODEM'].forEach((c) => { salida[c] = ''; });
    if (!conLinea) LineasRepo.COLS_LINEA.forEach((c) => { salida[c] = LineasRepo.VALORES_SIN_LINEA[c] === undefined ? '' : LineasRepo.VALORES_SIN_LINEA[c]; });
    return salida;
  }

  function validarNuco_(nuco, omitirId) {
    const buscado = texto_(nuco).replace(/^0+/, '') || '0';
    const repetido = LineasDatos.leerTabla(LineasRepo.TAB.LINEAS).some((f) => {
      if (texto_(f.ID) === texto_(omitirId)) return false;
      const actual = texto_(LineasUtil.col(f, 'NUCO')).replace(/^0+/, '') || '0';
      return actual === buscado;
    });
    if (repetido) throw new Error('Ya existe un registro con el NUCO ' + nuco + '.');
  }

  function crear(datos, usuario) {
    asegurarEsquema_();
    const valores = datosHoja_(datos);
    validarNuco_(valores.NUCO, null);
    const id = LineasDatos.nuevoIdCorto();
    const ahora = new Date();
    valores.ID = id;
    valores['FECHA REGISTRO'] = ahora;
    LineasDatos.conCandado(() => {
      LineasRepo.agregarRegistro(valores);
      LineasRepo.registrarMovimiento('ALTA', { motivo: 'Alta directa de registro' }, usuario, ahora, {
        refs: [id], nuco: valores.NUCO, numero: valores['NUMERO TELEFONO'], antes: {}, despues: valores, detalle: { campos: CAMPOS },
      });
    });
    return { id: id, filas: LineasRepo.refrescarIndice([id]) };
  }

  function editar(id, datos, usuario) {
    asegurarEsquema_();
    const valores = datosHoja_(datos);
    validarNuco_(valores.NUCO, id);
    const resultado = LineasDatos.conCandado(() => {
      const fila = LineasRepo.leerRegistroObligatorio(id, 'el registro');
      const antes = LineasRepo.convertirRegistro(fila);
      const guardado = LineasRepo.guardarCambiosRegistro(fila, valores, usuario, new Date());
      LineasRepo.registrarMovimiento('EDICION', { motivo: 'Edición directa del registro' }, usuario, new Date(), {
        refs: [id], nuco: valores.NUCO, numero: valores['NUMERO TELEFONO'], antes: antes, despues: valores,
        detalle: { idsCambios: guardado.idsCambios, cambios: guardado.campos },
      });
      return guardado;
    });
    return { id: id, cambios: resultado.campos, filas: LineasRepo.refrescarIndice([id]) };
  }

  return { crear, editar };
})();

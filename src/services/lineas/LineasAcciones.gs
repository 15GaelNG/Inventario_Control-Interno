/**
 * LineasAcciones.gs
 * Las acciones que guardan junto con su documento: la Responsiva (pendiente 2.49, usuario 16-oct: una sola acción en
 * lugar de Reasignar, también para la línea sin equipo) y Vincular / Cambiar línea / Cambiar de equipo / Desvincular
 * (etapa 3, 8-oct), con responsiva si el equipo queda en uso.
 *
 * "¿Qué pasó?" y la regla de acciones por estatus se quitaron (usuario, 4-oct): las acciones del menú ya no dependen
 * del estatus y el servidor no las rechaza por él; el estatus se cambia en Editar (desde el 4-oct, sin «Cambiar estatus»).
 * Se fueron con ella el cambio de equipo, el cambio de línea, el cierre y Entregar (quedan en git, commit 60cf5d4).
 */
const LineasAcciones = (function () {
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const may = (v) => txt(v).toUpperCase();

  // ---------------- Responsiva (antes Reasignar) ----------------

  /** Datos de la persona en la responsiva → columnas del inventario (con el jefe directo desde el 19-oct, pendiente 2.54). */
  const PERSONA_DE_RESPONSIVA = [
    ['NO EMPLEADO', 'No EMPLEADO'], ['RESPONSABLE', 'RESPONSABLE'], ['PUESTO', 'PUESTO'], ['DEPARTAMENTO', 'DEPARTAMENTO'], ['AREA', 'AREA'],
    ['SEDE', 'SEDE'], ['OFICINA / DESARROLLO', 'OFICINA / DESARROLLO'], ['JEFE DIRECTO', 'JEFE DIRECTO'], ['DIRECTOR', 'DIRECTOR'], ['CUENTA GOOGLE', 'CORREO'],
  ].concat(['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'].reduce((a, n) => a.concat([['NO EMPLEADO ' + n + ' RESPONSABLE', 'NO EMPLEADO ' + n + ' RESPONSABLE'],
    ['NOMBRE ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE']]), []));

  /** Lo que ya no se entrega (usuario, 16-oct): primero se corrige su estatus con Editar. */
  const ESTATUS_SIN_RESPONSIVA = {
    equipo: ['VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO', 'EXTRAVIADO', 'ROBADO', 'ROBO'],
    linea: ['CANCELADA', 'EN PROCESO DE CANCELACION'],
  };
  const sinAcentos_ = (v) => may(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

  /** «NUCO 0012» o «La línea 4421234567». */
  function nombreRegistro_(f, esEquipo) {
    return esEquipo ? 'NUCO ' + (LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '') : 'La línea ' + (txt(LineasUtil.col(f, 'NUMERO TELEFONO')) || txt(LineasUtil.col(f, 'NUMERO SIM')));
  }

  /** El estatus del registro (el del equipo, o el de la línea sin equipo), o error si ya no se entrega. */
  function exigirEstatusParaResponsiva(f, esEquipo) {
    const estatus = may(LineasUtil.col(f, esEquipo ? 'ESTATUS EQUIPO' : 'ESTATUS LINEA'));
    if (ESTATUS_SIN_RESPONSIVA[esEquipo ? 'equipo' : 'linea'].indexOf(estatus) >= 0) throw new Error(nombreRegistro_(f, esEquipo) + ' está ' + estatus + '.');
    return estatus;
  }

  /**
   * ¿Firma la misma persona que lo tiene hoy? Solo en USO y con el mismo nombre (sin acentos). Si no, es reasignación:
   * otra persona, o el registro estaba en resguardo o DISPONIBLE (usuario, 16-oct). La pantalla pregunta lo mismo
   * (mismaPersonaResponsiva en lineas.html) para saber si pide la inspección.
   */
  function esRenovacion(estatus, responsableActual, responsableNuevo) {
    const antes = sinAcentos_(responsableActual);
    return may(estatus) === 'USO' && !!antes && antes === sinAcentos_(responsableNuevo);
  }

  /**
   * Responsiva (pendiente 2.49, usuario 16-oct: «una reasignación es lo mismo que una responsiva»), del equipo o de la
   * línea sin equipo. Equipo y línea van fijos; la persona se elige en la responsiva y su COMENTARIO es el de la acción.
   *   - Firma la misma persona que lo tiene: renovación. Solo se genera el documento y lo de la responsiva pasa a la ficha
   *     en la misma asignación (LineasCaptura.guardarResponsivaEnCandado_). Sin inspección.
   *   - Otra persona, o el registro estaba en resguardo o DISPONIBLE: reasignación. Se cierra la asignación vigente y se
   *     abre otra con la persona de la responsiva; queda en USO (D5.1) y, en un equipo, su línea DISPONIBLE pasa a USO con
   *     él (L1). En un equipo la inspección es obligatoria (usuario, 5-oct y 16-oct): se captura antes, dentro de la acción,
   *     y llega como `inspeccionId` (del mismo equipo y de hoy, LineasCaptura.exigirInspeccion). La línea sin equipo no
   *     lleva inspección.
   * Primero se revisa la responsiva; si está completa, se reasigna y la responsiva queda guardada, todo junto.
   */
  function responsiva(datos, usuario, puedeVerSecretos) {
    const d = datos || {};
    const ref = txt(d.equipoId) ? { equipoId: txt(d.equipoId) } : { lineaId: txt(d.lineaId) };
    if (!ref.equipoId && !ref.lineaId) throw new Error('Elige el equipo o la línea.');
    const inspeccionId = txt(d.inspeccionId);
    const r = LineasCaptura.guardarResponsiva(d, usuario, puedeVerSecretos, {
      ref: ref, modo: 'RESPONSIVA',
      aplicar: (ahora, valores) => aplicarResponsiva_(ref, valores, inspeccionId, usuario, ahora),
    });
    return { id: r.id, registroId: r.registroId, pdfPendiente: true, filas: r.filas, reasignado: !!(r.hecho && r.hecho.reasignado) };
  }

  /** Dentro del candado de la responsiva: si es reasignación, cambia a la persona y el estatus (ver responsiva). */
  function aplicarResponsiva_(ref, valores, inspeccionId, usuario, ahora) {
    const esEquipo = !!ref.equipoId;
    const id = ref.equipoId || ref.lineaId;
    const f = LineasRepo.leerRegistroObligatorio(id, esEquipo ? 'el equipo' : 'la línea');
    const estatus = exigirEstatusParaResponsiva(f, esEquipo);
    const comentario = txt(valores['COMENTARIO']);
    if (comentario.length <= 3) throw new Error('Escribe el comentario (queda en el historial).');
    const antes = txt(LineasUtil.col(f, 'RESPONSABLE'));
    if (esRenovacion(estatus, antes, valores['RESPONSABLE'])) return { id: id, reasignado: false };
    if (esEquipo) LineasCaptura.exigirInspeccion(inspeccionId, LineasDatos.idsDeFila(f), nombreRegistro_(f, true));
    const cambios = {};
    // El jefe directo también es de la responsiva (usuario, 19-oct; pendiente 2.54): del 6 al 19-oct salía de la
    // inspección o de Capital Humano, porque la responsiva no lo pedía
    PERSONA_DE_RESPONSIVA.forEach(([destino, origen]) => { cambios[destino] = txt(valores[origen]); });
    if (esEquipo) {
      cambios['ESTATUS EQUIPO'] = 'USO';
      if (may(LineasUtil.col(f, 'ESTATUS LINEA')) === 'DISPONIBLE') cambios['ESTATUS LINEA'] = 'USO';
    } else {
      cambios['ESTATUS LINEA'] = 'USO';
    }
    const g = LineasRepo.guardarCambiosRegistro(f, cambios, usuario, ahora, { tolerante: true });
    LineasRepo.registrarMovimiento('REASIGNACION', { motivo: comentario, ticket: txt(valores['TICKET']) }, usuario, ahora, {
      refs: [id].concat(g.refs || []), nuco: esEquipo ? LineasUtil.col(f, 'NUCO') : null, numero: LineasUtil.col(f, 'NUMERO TELEFONO'),
      antes: { estatus: estatus, responsable: { nombre: antes } },
      despues: { estatus: 'USO', responsable: { nombre: txt(valores['RESPONSABLE']) } },
      detalle: { accion: 'RESPONSIVA', inspeccionId: esEquipo ? inspeccionId : undefined, idsCambios: g.idsCambios,
        idsReasignacion: g.idReasignacion ? [g.idReasignacion] : [], cambios: g.campos },
    });
    return { id: id, reasignado: true };
  }

  // ---------------- Vincular, cambiar y desvincular línea y equipo (etapa 3, usuario 8-oct; pendiente 2.24) ----------------

  /** Equipos a los que se les pone o se les cambia la línea (como «¿Se vincula a un equipo?» del alta). */
  const ESTATUS_VINCULABLE = ['USO', 'RESGUARDO'];

  /**
   * Una acción para las cuatro (usuario, 8-oct). datos = { equipoId, lineaId, anterior, comentario, ticket, responsiva }:
   *   - Vincular línea: el equipo no tiene línea y lineaId es una línea suelta DISPONIBLE (solo esas, usuario 8-oct).
   *   - Cambiar línea: el equipo tiene línea; la suya queda suelta DISPONIBLE o va a la bandeja de cancelaciones
   *     (anterior = 'CANCELACION') y la nueva se le pone.
   *   - Cambiar de equipo: lineaId es la línea de otro equipo; se separa de él y se le pone a este.
   *   - Desvincular: sin lineaId; la línea queda suelta DISPONIBLE o va a cancelación.
   * La línea que se pone sigue al equipo (opción A): USO si está en uso, DISPONIBLE si está guardado. La responsiva es
   * obligatoria cuando el equipo queda con su responsable y otra línea (en USO; usuario, 8-oct, como D5.2): se captura
   * antes y se guarda junto con el cambio, como en Reasignar; su COMENTARIO es el de la acción. Sin responsiva, el
   * comentario viene en datos.comentario. Regresa { id, responsivaId, equipoId, filas }.
   */
  function vincular(datos, usuario, puedeVerSecretos) {
    const d = datos || {};
    const equipoId = txt(d.equipoId);
    if (!equipoId) throw new Error('Elige el equipo.');
    const lineaId = txt(d.lineaId);
    const fE = LineasRepo.leerRegistroObligatorio(equipoId, 'el equipo');
    const conResponsiva = !!lineaId && may(LineasUtil.col(fE, 'ESTATUS EQUIPO')) === 'USO';
    let hecho = null;
    let responsivaId = null;
    let comentario = '';
    let ticket = '';
    if (conResponsiva) {
      if (!d.responsiva) throw new Error('Falta la responsiva: el equipo queda con su responsable y otra línea.');
      const r = LineasCaptura.guardarResponsiva(d.responsiva, usuario, puedeVerSecretos, {
        ref: { equipoId: equipoId }, modo: 'LINEA', lineaFila: LineasRepo.leerRegistroObligatorio(lineaId, 'la línea'),
        aplicar: (ahora, valores) => {
          comentario = txt(valores['COMENTARIO']);
          ticket = txt(valores['TICKET']);
          if (comentario.length <= 3) throw new Error('Escribe el comentario (queda en el historial).');
          hecho = aplicarVinculo_(equipoId, lineaId, d.anterior, comentario, ticket, usuario, ahora);
          return { id: equipoId };
        },
      });
      responsivaId = r.id;
    } else {
      comentario = txt(d.comentario);
      ticket = txt(d.ticket);
      if (comentario.length <= 3) throw new Error('Escribe el comentario (queda en el historial).');
      LineasDatos.conCandado(() => { hecho = aplicarVinculo_(equipoId, lineaId, d.anterior, comentario, ticket, usuario, new Date()); });
    }
    // La línea que deja el equipo y va a cancelación entra a la bandeja de Pau, como con «Mandar a cancelación»; su motivo
    // sale del adendum (13-oct)
    if (hecho.anteriorACancelar) {
      LineasResguardos.mandarCancelacion([hecho.anteriorACancelar], { comentario: comentario, ticket: ticket }, usuario,
        { motivoDelAdendum: true, nucos: { [hecho.anteriorACancelar]: hecho.nuco } });
    }
    const filas = LineasRepo.refrescarIndice([equipoId].concat(hecho.tocados));
    return { id: responsivaId || equipoId, responsivaId: responsivaId, equipoId: equipoId, pdfPendiente: !!responsivaId, filas: filas };
  }

  /** El cambio en sí (dentro del candado): separa lo que haga falta, pone la línea y deja un movimiento. */
  function aplicarVinculo_(equipoId, lineaId, anterior, comentario, ticket, usuario, ahora) {
    const col = LineasUtil.col;
    const fE = LineasRepo.leerRegistroObligatorio(equipoId, 'el equipo');
    const nuco = LineasUtil.nucoVisible(col(fE, 'NUCO')) || '';
    const nombre = 'NUCO ' + nuco;
    if (!LineasRepo.TIPOS_CON_EQUIPO[may(col(fE, 'TIPO'))]) throw new Error('Elige un equipo (NUCO).');
    if (ESTATUS_VINCULABLE.indexOf(may(col(fE, 'ESTATUS EQUIPO'))) < 0) {
      throw new Error(nombre + ' está en ' + may(col(fE, 'ESTATUS EQUIPO')) + ': la línea se pone o se cambia en un equipo en USO o en RESGUARDO.');
    }
    const tieneLinea = !!(txt(col(fE, 'NUMERO TELEFONO')) || txt(col(fE, 'NUMERO SIM'))) && may(col(fE, 'ESTATUS LINEA')) !== 'CANCELADA';
    if (!lineaId && !tieneLinea) throw new Error(nombre + ' no tiene línea.');
    const campos = [];
    const refs = [equipoId];
    const tocados = [];
    const lineaFila = lineaId ? LineasRepo.leerRegistroObligatorio(lineaId, 'la línea') : null;
    // Una línea en Cancelaciones no pasa a otro equipo ni a DISPONIBLE: avisa su fase (pendiente 3.12). Se revisa antes de
    // escribir nada. La del equipo que ya está ahí solo sale «a cancelación» (sigue en su renglón, sin otro)
    if (lineaFila) LineasResguardos.exigirSinCancelacion(lineaFila);
    const anteriorEnCurso = tieneLinea ? LineasResguardos.cancelacionDe(fE) : null;
    if (anteriorEnCurso && may(anterior) !== 'CANCELACION') LineasResguardos.exigirSinCancelacion(fE);
    let numeroNuevo = '';
    let desde = '';
    if (lineaFila) {
      if (txt(lineaFila['ID']) === txt(fE['ID'])) throw new Error('La línea ya está en ' + nombre + '.');
      numeroNuevo = txt(col(lineaFila, 'NUMERO TELEFONO'));
      if (!numeroNuevo) throw new Error('La línea no tiene número: se vincula por su número.');
      if (LineasRepo.TIPOS_CON_EQUIPO[may(col(lineaFila, 'TIPO'))]) {
        // Cambiar de equipo: la línea deja su equipo
        desde = 'NUCO ' + (LineasUtil.nucoVisible(col(lineaFila, 'NUCO')) || '');
        const s = LineasEscritura.separarLinea(lineaFila, ahora);
        s.campos.forEach((c) => campos.push(c));
        s.refs.forEach((x) => refs.push(x));
        tocados.push(txt(lineaFila['ID']), s.idLinea);
      } else if (may(col(lineaFila, 'ESTATUS LINEA')) !== 'DISPONIBLE') {
        throw new Error('La línea ' + numeroNuevo + ' está en ' + (may(col(lineaFila, 'ESTATUS LINEA')) || 'blanco') +
          ': solo se vinculan líneas DISPONIBLE (quítale el responsable en Corregir).');
      }
    }
    let numeroAnterior = '';
    let anteriorACancelar = null;
    if (tieneLinea) {
      numeroAnterior = txt(col(fE, 'NUMERO TELEFONO'));
      const s = LineasEscritura.separarLinea(fE, ahora, anteriorEnCurso ? { estatus: 'EN PROCESO DE CANCELACION' } : null);
      s.campos.forEach((c) => campos.push(c));
      s.refs.forEach((x) => refs.push(x));
      tocados.push(s.idLinea);
      if (may(anterior) === 'CANCELACION' && !anteriorEnCurso) anteriorACancelar = s.idLinea;
    }
    if (lineaFila) {
      // La misma escritura que ponerle línea a un equipo en Editar (LineasEscritura.lineaParaEquipo_): la encuentra por
      // su número, cierra su asignación de suelta y queda en la del equipo, con el estatus que le toca
      const f2 = LineasRepo.leerRegistroObligatorio(equipoId, 'el equipo');
      const g = LineasRepo.guardarCambiosRegistro(f2, { 'NUMERO TELEFONO': numeroNuevo, 'NUMERO SIM': txt(col(lineaFila, 'NUMERO SIM')) }, usuario, ahora);
      (g.campos || []).forEach((c) => campos.push(c));
      (g.refs || []).forEach((x) => refs.push(x));
    }
    const accion = lineaFila ? (desde ? 'CAMBIO_EQUIPO' : (tieneLinea ? 'CAMBIO_LINEA' : 'ASIGNAR_LINEA')) : 'RETIRAR_LINEA';
    LineasRepo.registrarMovimiento(accion, { motivo: comentario, ticket: ticket }, usuario, ahora, {
      refs: refs, nuco: nuco, numero: numeroNuevo || numeroAnterior,
      antes: { numero: numeroAnterior }, despues: { numero: numeroNuevo },
      detalle: { cambios: campos, desde: desde || undefined, anteriorACancelacion: !!anteriorACancelar || undefined },
    });
    return { tocados: tocados, anteriorACancelar: anteriorACancelar, nuco: nuco };
  }

  // aplicarVinculo: también para Agregar equipo con una línea que ya existe (LineasRegistros.crear, 13-oct), dentro de su candado
  return { responsiva, vincular, aplicarVinculo: aplicarVinculo_, PERSONA_DE_RESPONSIVA, esRenovacion, exigirEstatusParaResponsiva };
})();

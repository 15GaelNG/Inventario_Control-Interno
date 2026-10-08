/**
 * LineasAcciones.gs
 * Las acciones que guardan junto con su documento: Reasignar (usuario, 4-oct), que abre directo la responsiva, y
 * Vincular / Cambiar línea / Cambiar de equipo / Desvincular (etapa 3, 8-oct), con responsiva si el equipo queda en uso.
 *
 * "¿Qué pasó?" y la regla de acciones por estatus se quitaron (usuario, 4-oct): las acciones del menú ya no dependen
 * del estatus y el servidor no las rechaza por él; el estatus se cambia en Editar (desde el 4-oct, sin «Cambiar estatus»).
 * Se fueron con ella el cambio de equipo, el cambio de línea, el cierre y Entregar (quedan en git, commit 60cf5d4).
 */
const LineasAcciones = (function () {
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const may = (v) => txt(v).toUpperCase();

  // ---------------- Reasignar ----------------

  /** Datos de la persona en la responsiva → columnas del inventario. */
  const PERSONA_DE_RESPONSIVA = [
    ['NO EMPLEADO', 'No EMPLEADO'], ['RESPONSABLE', 'RESPONSABLE'], ['PUESTO', 'PUESTO'], ['DEPARTAMENTO', 'DEPARTAMENTO'], ['AREA', 'AREA'],
    ['SEDE', 'SEDE'], ['OFICINA / DESARROLLO', 'OFICINA / DESARROLLO'], ['DIRECTOR', 'DIRECTOR'], ['CUENTA GOOGLE', 'CORREO'],
  ].concat(['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'].reduce((a, n) => a.concat([['NO EMPLEADO ' + n + ' RESPONSABLE', 'NO EMPLEADO ' + n + ' RESPONSABLE'],
    ['NOMBRE ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE']]), []));

  /**
   * Reasignar (usuario, 4-oct): abre directo la responsiva, sin formulario intermedio. Equipo y línea van fijos; la
   * persona nueva se elige en la responsiva y su COMENTARIO es el de la acción. Al guardar, primero se revisa la
   * responsiva; si está completa, se reasigna (el equipo queda en USO, D5.1; su línea DISPONIBLE pasa a USO) y la
   * responsiva queda guardada, todo junto.
   * La inspección también es obligatoria (usuario, 5-oct): se captura antes, dentro de la acción, y llega como
   * `inspeccionId` (del mismo equipo y de hoy, LineasCaptura.exigirInspeccion), como en Mandar a resguardo.
   */
  function reasignar(responsiva, usuario, puedeVerSecretos) {
    const id = txt((responsiva || {}).equipoId);
    if (!id) throw new Error('Elige el equipo que se reasigna.');
    const inspeccionId = txt((responsiva || {}).inspeccionId);
    const r = LineasCaptura.guardarResponsiva(responsiva || {}, usuario, puedeVerSecretos, {
      ref: { equipoId: id }, modo: 'REASIGNAR',
      aplicar: (ahora, valores) => {
        const f = LineasRepo.leerRegistroObligatorio(id, 'el equipo');
        const nombre = 'NUCO ' + (LineasUtil.nucoVisible(LineasUtil.col(f, 'NUCO')) || '');
        LineasCaptura.exigirInspeccion(inspeccionId, LineasDatos.idsDeFila(f), nombre);
        const estatus = txt(LineasUtil.col(f, 'ESTATUS EQUIPO'));
        const comentario = txt(valores['COMENTARIO']);
        if (comentario.length <= 3) throw new Error('Escribe el comentario (queda en el historial).');
        const nuevo = txt(valores['RESPONSABLE']).toUpperCase();
        const antes = txt(LineasUtil.col(f, 'RESPONSABLE'));
        if (nuevo && nuevo === antes.toUpperCase()) throw new Error(nombre + ' ya lo tiene ' + antes + ': elige a la persona nueva.');
        const cambios = { 'ESTATUS EQUIPO': 'USO' };
        PERSONA_DE_RESPONSIVA.forEach(([destino, origen]) => { cambios[destino] = txt(valores[origen]); });
        // El jefe directo no viene en la responsiva (lleva al director): el de la inspección, que se puede corregir ahí, o
        // el de Capital Humano de la persona elegida (usuario, 6-oct; del 4 al 6-oct era al revés)
        const deInspeccion = may(LineasCaptura.datoDeInspeccion(inspeccionId, 'RESPONSABLE')) === nuevo ? LineasCaptura.datoDeInspeccion(inspeccionId, 'JEFE DIRECTO') : '';
        cambios['JEFE DIRECTO'] = deInspeccion || datoDeCH_(valores['No EMPLEADO'], valores['RESPONSABLE'], 'jefe');
        if (may(LineasUtil.col(f, 'ESTATUS LINEA')) === 'DISPONIBLE') cambios['ESTATUS LINEA'] = 'USO';
        const g = LineasRepo.guardarCambiosRegistro(f, cambios, usuario, ahora, { tolerante: true });
        LineasRepo.registrarMovimiento('REASIGNACION', { motivo: comentario, ticket: txt(valores['TICKET']) }, usuario, ahora, {
          refs: [id].concat(g.refs || []), nuco: LineasUtil.col(f, 'NUCO'), numero: LineasUtil.col(f, 'NUMERO TELEFONO'),
          antes: { estatus: may(estatus), responsable: { nombre: antes } },
          despues: { estatus: 'USO', responsable: { nombre: txt(valores['RESPONSABLE']) } },
          detalle: { accion: 'REASIGNAR', inspeccionId: inspeccionId, idsCambios: g.idsCambios, idsReasignacion: g.idReasignacion ? [g.idReasignacion] : [], cambios: g.campos },
        });
        return { id: id };
      },
    });
    return { id: r.id, registroId: r.registroId, pdfPendiente: true, filas: r.filas };
  }

  /** Un dato de la persona en Capital Humano ('jefe', 'director'…) por número de empleado o, si no, por nombre; '' si no está. */
  function datoDeCH_(noEmpleado, nombre, campo) {
    const ix = LineasRepo.indiceColaboradores();
    const c = ix.columnas;
    const iNum = c.indexOf('noEmpleado'), iNom = c.indexOf('nombre'), iDir = c.indexOf(campo);
    const num = may(noEmpleado), nom = may(nombre);
    const fila = (num && ix.filas.filter((f) => may(f[iNum]) === num)[0]) || (nom && ix.filas.filter((f) => may(f[iNom]) === nom)[0]);
    return fila ? txt(fila[iDir]) : '';
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
    // La línea que deja el equipo y va a cancelación entra a la bandeja de Pau, como con «Mandar a cancelación»
    if (hecho.anteriorACancelar) LineasResguardos.mandarCancelacion([hecho.anteriorACancelar], { comentario: comentario, ticket: ticket }, usuario);
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
          ': solo se vinculan líneas DISPONIBLE (quítale el responsable en Editar línea).');
      }
    }
    let numeroAnterior = '';
    let anteriorACancelar = null;
    if (tieneLinea) {
      numeroAnterior = txt(col(fE, 'NUMERO TELEFONO'));
      const s = LineasEscritura.separarLinea(fE, ahora);
      s.campos.forEach((c) => campos.push(c));
      s.refs.forEach((x) => refs.push(x));
      tocados.push(s.idLinea);
      if (may(anterior) === 'CANCELACION') anteriorACancelar = s.idLinea;
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
    return { tocados: tocados, anteriorACancelar: anteriorACancelar };
  }

  return { reasignar, vincular, PERSONA_DE_RESPONSIVA, datoDeCH_ };
})();

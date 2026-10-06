/**
 * LineasAcciones.gs
 * Las acciones que guardan junto con su documento. Hoy: Reasignar (usuario, 4-oct), que abre directo la responsiva.
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
    ['SEDE', 'SEDE'], ['OFICINA / DESARROLLO', 'OFICINA / DESARROLLO'], ['JEFE DIRECTO', 'JEFE DIRECTO'], ['CUENTA GOOGLE', 'CORREO'],
  ];

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
        // El director no viene en la responsiva: sale de Capital Humano de la persona elegida (usuario, 4-oct)
        cambios['DIRECTOR'] = directorDeCH_(valores['No EMPLEADO'], valores['RESPONSABLE']);
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

  /** DIRECTOR de la persona en Capital Humano (por número de empleado o, si no, por nombre); '' si no está. */
  function directorDeCH_(noEmpleado, nombre) {
    const ix = LineasRepo.indiceColaboradores();
    const c = ix.columnas;
    const iNum = c.indexOf('noEmpleado'), iNom = c.indexOf('nombre'), iDir = c.indexOf('director');
    const num = may(noEmpleado), nom = may(nombre);
    const fila = (num && ix.filas.filter((f) => may(f[iNum]) === num)[0]) || (nom && ix.filas.filter((f) => may(f[iNom]) === nom)[0]);
    return fila ? txt(fila[iDir]) : '';
  }

  return { reasignar, PERSONA_DE_RESPONSIVA, directorDeCH_ };
})();

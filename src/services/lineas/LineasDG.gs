/**
 * LineasDG.gs
 * Dirección General (pendiente 8.16; usuario, 21-oct, después de preguntar a Líneas, L28): sus 12 líneas y sus equipos,
 * los NUCO 11001 a 11011, en una lista fija (decisión del usuario: una línea nueva de DG se agrega aquí). Llevan la
 * etiqueta DG (el índice la pone en lugar del responsable). Su asignación vigente queda con todo el responsable en blanco
 * salvo AREA = DIRECCION GENERAL (usuario, 22-oct; tools/lineas-datos/limpiar-dg.js), y en las tablas del índice, que no
 * tienen columna de área, la columna departamento dice DIRECCION GENERAL (conArea). Solo ADMIN ve su información y la
 * modifica (usuario, 22-oct: ADMIN sí; los registros con área DIRECCION GENERAL fuera de la lista, no son DG):
 *   - Leer: los demás ven el registro con DG, su estatus y el área DIRECCION GENERAL (TelefoniaService: índice, ficha,
 *     Exportar); su historial, documentos y facturas, no.
 *   - Escribir: LineasRepo.guardarCambiosRegistro y las capturas (LineasCaptura) lo rechazan si no es ADMIN
 *     (usuario.esAdmin, de TelefoniaService.usuarioOperacion_).
 */
const LineasDG = (function () {
  const NUMEROS = ['4422798678', '4461399325', '4425929924', '4461280094', '4426011345', '4421819985', '4427900644', '4423648163',
    '4461334902', '4428242672', '4461396972', '4428242693'];
  const NUCOS = ['11001', '11002', '11003', '11004', '11005', '11006', '11007', '11008', '11009', '11010', '11011'];
  const AREA = 'DIRECCION GENERAL';
  const ETIQUETA = 'DG';
  const MENSAJE = 'Es de Dirección General: solo ADMIN lo modifica.';

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const esNumero = (n) => { const d = txt(n).replace(/\D/g, ''); return d.length >= 10 && NUMEROS.indexOf(d.slice(-10)) >= 0; };
  const esNuco = (n) => NUCOS.indexOf(txt(n).replace(/^0+/, '')) >= 0;

  /** Con el equipo y la línea ya convertidos (LineasRepo.convertirRegistro). */
  function esRegistro(equipo, linea) {
    return !!((equipo && esNuco(equipo.nuco)) || (linea && esNumero(linea.numero)));
  }

  /** Con el renglón de LINEAS TELEFONICAS (el que arma LineasLectura). */
  function esFila(f) {
    return !!f && (esNuco(LineasUtil.col(f, 'NUCO')) || esNumero(LineasUtil.col(f, 'NUMERO TELEFONO')));
  }

  /** Truena si el renglón es de DG y quien escribe no es ADMIN. */
  function exigirAdmin(f, usuario) {
    if (esFila(f) && !(usuario && usuario.esAdmin)) throw new Error(MENSAJE);
  }

  /**
   * Lo que ve quien no es ADMIN de un renglón de DG (usuario, 21 y 22-oct): DG en el responsable, su estatus y el área; lo
   * demás en blanco. Sirve para las tablas del índice (columnas en camelCase; sin columna de área, el área va en
   * departamento) y para la vista del AppSheet (columnas de la hoja: AREA, y DEPARTAMENTO en blanco). desfase: 1 si la
   * primera posición del renglón es el ID y las columnas empiezan después (la vista).
   */
  const VISIBLES = ['ID', 'NUCO', 'ESTATUS EQUIPO', 'ESTATUS LINEA', 'ESTATUS', 'ESTATUSLINEA', 'LINEAID', 'EQUIPOID', 'NUCOEQUIPO', 'SUELTA', 'PANEL',
    'DG', 'TIPOHOJA'];
  function ocultarRenglon(columnas, fila, desfase) {
    const d = desfase || 0;
    const copia = fila.map((x, i) => (i < d ? x : ''));
    const conColumnaArea = columnas.some((c) => txt(c).toUpperCase() === 'AREA');
    columnas.forEach((c, i) => {
      const C = txt(c).toUpperCase();
      if (VISIBLES.indexOf(C) >= 0) copia[i + d] = fila[i + d];
      else if (C === 'RESPONSABLE') copia[i + d] = ETIQUETA;
      else if (C === 'AREA' || (C === 'DEPARTAMENTO' && !conColumnaArea)) copia[i + d] = AREA;
    });
    return copia;
  }

  /**
   * El índice (LineasRepo.indice, la caché de todos) con DIRECCION GENERAL en la columna departamento de los renglones de
   * DG de equipos y líneas, para todos (también ADMIN): su DEPARTAMENTO quedó en blanco y esas tablas no tienen área.
   * Sobre copias. Va antes de filtrar por alcance.
   */
  function conArea(ix) {
    if (!ix) return ix;
    const tabla = (t) => {
      if (!t) return t;
      const iDg = t.columnas.indexOf('dg');
      const iDep = t.columnas.indexOf('departamento');
      if (iDg < 0 || iDep < 0) return t;
      return Object.assign({}, t, { filas: t.filas.map((f) => {
        if (!f[iDg]) return f;
        const copia = f.slice();
        copia[iDep] = AREA;
        return copia;
      }) });
    };
    return Object.assign({}, ix, { equipos: tabla(ix.equipos), lineas: tabla(ix.lineas) });
  }

  /** ¿Es de DG el renglón de la vista (columnas de la hoja)? */
  function esRenglonVista(columnas, fila, desfase) {
    const v = (c) => { const i = columnas.indexOf(c); return i < 0 ? '' : fila[i + (desfase || 0)]; };
    return esNuco(v('NUCO')) || esNumero(v('NUMERO TELEFONO'));
  }

  /** La ficha para quien no es ADMIN: el registro con DG, su estatus y el área (`_dgOculto`: la pantalla no pide lo demás). */
  function fichaOculta(o, esEquipo) {
    if (!o) return o;
    const r = { _id: o._id, estatus: o.estatus, tipo: o.tipo, dg: true, _dgOculto: true, responsable: { nombre: ETIQUETA, departamento: '', area: AREA } };
    if (esEquipo) r.nuco = o.nuco; else { r.numero = ETIQUETA; r.equipoId = o.equipoId; }
    return r;
  }

  return { NUMEROS, NUCOS, AREA, ETIQUETA, MENSAJE, esNumero, esNuco, esRegistro, esFila, exigirAdmin, ocultarRenglon, conArea, esRenglonVista, fichaOculta };
})();

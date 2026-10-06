/**
 * LineasEscritura.gs
 * Etapa 3, paso 1 de la implementación de las partes 4 y 5 (migracion/PLAN_REESTRUCTURA_LINEAS.md §I.6): con el
 * interruptor de la etapa 2 encendido (LINEAS_LECTURA = ESTRUCTURA), guardar escribe en las hojas nuevas.
 *
 * Todo cambio al inventario pasa por LineasRepo.guardarCambiosRegistro (editar, cambiar estatus, reasignar, mandar a
 * resguardo o a cancelación, la bandeja de Pau y la inspección) o por LineasRepo.agregarRegistro (alta). Con el
 * interruptor encendido, esas dos funciones llaman a este archivo, que reparte cada columna de la hoja vieja a su hoja:
 *   EQUIPOS       EQUIPO (→ MODELO), COLOR, IMEI, ACCESORIOS, PIN EQUIPO, PATRON, CONTRASEÑA MODEM, ESTATUS EQUIPO y NUCO
 *   LINEAS        NUMERO TELEFONO, NUMERO SIM, COMPAÑIA, RAZON SOCIAL, PIN WHATSAPP y ESTATUS LINEA
 *   ADENDUMS      COSTO PLAN, INICIO PLAN y FIN PLAN, en el adendum más reciente (los que vienen de un archivo del
 *                 proveedor no se corrigen a mano: los corrige su carga)
 *   ASIGNACIONES  la persona y la ubicación
 * La bitácora CAMBIOS ya no recibe nada: el historial es APP_MOVIMIENTOS (§5.5), que sigue escribiendo quien llama
 * con los campos que regresa guardar().
 *
 * Reglas de la asignación (plan §4.3 y §5.4):
 *   - El estatus dice dónde vive cada parte: USO, con una persona; RESGUARDO, PARA VENTA,
 *     PARA DESECHO y la línea DISPONIBLE, en una asignación de resguardo (sin persona; departamento, sede y oficina);
 *     VENDIDO, DONADO, DESECHADO, EXTRAVIO-ROBO y la línea CANCELADA, en ninguna. EN PROCESO DE CANCELACION no tiene
 *     lugar propio: la línea sigue con su equipo hasta que se confirma la cancelación.
 *   - Si el estatus no cambia, la parte se queda donde está (también con los estatus viejos que no dicen dónde está).
 *   - Si cambia la persona (otro nombre en RESPONSABLE), se cierra la asignación vigente (FECHA FIN) y se abre otra
 *     con lo que mostraba el formulario al guardar. Llenar un dato vacío o corregir puesto, departamento, sede… edita
 *     la vigente.
 *   - Si el equipo y la línea dejan de ir juntos (la línea se cancela, o una queda en uso y la otra guardada), se
 *     cierra la asignación y cada parte sigue en la suya: la línea pasa a verse como registro aparte.
 *   - Una asignación cerrada nunca se borra: es la historia de quién tuvo qué y desde cuándo.
 * Lo que las hojas nuevas ya no guardan (JEFE DIRECTO, FECHA INSPECCION, responsables 2 a 5, FOLIO…) se
 * ignora; los COMENTARIOS van al historial, en el movimiento de la acción.
 *
 * El TIPO no se escribe: sale del tipo de equipo y del tipo de línea (LineasLectura). Desde Editar (usuario, 4-oct) a
 * un equipo sin línea se le puede poner una: un número nuevo o una línea sola que ya existe. La línea deja al equipo por
 * su estatus (DISPONIBLE la guarda aparte; CANCELADA, al confirmarse) o por Mandar a cancelación.
 * opciones.corregir (Editar): cambiar a la persona corrige el dato en la misma asignación; sin ella, es otra asignación.
 */
const LineasEscritura = (function () {
  const HOJA = { LINEAS: 'LINEAS', EQUIPOS: 'EQUIPOS', ASIGNACIONES: 'ASIGNACIONES', ADENDUMS: 'ADENDUMS' };
  const PREFIJO = { LINEAS: 'LIN', EQUIPOS: 'EQU', ASIGNACIONES: 'ASG', ADENDUMS: 'ADE' };
  const FUENTE_A_MANO = 'CAPTURA A MANO';

  // Columna de la hoja vieja (como la manda el formulario) → columna de la hoja nueva
  const A_EQUIPO = { 'EQUIPO': 'MODELO', 'COLOR': 'COLOR', 'IMEI': 'IMEI', 'ACCESORIOS': 'ACCESORIOS', 'PIN EQUIPO': 'PIN EQUIPO', 'PATRON': 'PATRON',
    'CONTRASEÑA MODEM': 'CONTRASEÑA MODEM', 'ESTATUS EQUIPO': 'ESTATUS EQUIPO', 'NUCO': 'NUCO' };
  const A_LINEA = { 'NUMERO TELEFONO': 'NUMERO TELEFONO', 'NUMERO SIM': 'NUMERO SIM', 'COMPAÑIA': 'COMPAÑIA',
    'RAZON SOCIAL': 'RAZON SOCIAL', 'PIN WHATSAPP': 'PIN WHATSAPP', 'ESTATUS LINEA': 'ESTATUS LINEA', 'TIPO DE LINEA': 'TIPO DE LINEA' };
  const A_ADENDUM = ['COSTO PLAN', 'INICIO PLAN', 'FIN PLAN'];
  /** Hasta cuatro responsables más, con su número de empleado y su nombre (usuario, 6-oct; como el AppSheet). */
  const ADICIONALES = ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'].reduce((a, n) => a.concat(['NO EMPLEADO ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE']), []);
  /** De la persona (solo en una asignación con persona). */
  const PERSONA = ['ID PERSONA', 'NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'AREA', 'DIRECTOR', 'JEFE DIRECTO', 'CUENTA GOOGLE',
    'NOMBRE QUIEN USA', 'PUESTO QUIEN USA'].concat(ADICIONALES);
  /** Dónde está (con persona o guardado). */
  const UBICACION = ['DEPARTAMENTO', 'SEDE', 'OFICINA / DESARROLLO'];
  // Los "no aplica" se guardan en blanco, como en la migración (LineasEstructura)
  const NO_APLICA = ['', 'N/A', 'NA', 'NO APLICA', '-', 'SOLO LINEA', 'SIN EQUIPO'];
  // Tipos viejos que llevan línea sí o sí (MODEM, BANDA ANCHA y CAMARA la llevan solo si tienen número)
  const TIPOS_CON_LINEA_FIJA = ['EQUIPO + SIM', 'EQUIPO + SIM BASICO', 'LINEA', 'LINEA BASICA'];

  let hojas_ = null; // las 4 hojas, una lectura por ejecución; se actualizan en memoria al escribir
  let tocados_ = []; // registros que aparecen por un cambio (la línea que se separa de su equipo)

  const may = (v) => String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  const sinAcentos = (v) => may(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

  function limpio_(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date || typeof v === 'number') return v;
    const s = String(v).trim();
    return NO_APLICA.indexOf(sinAcentos(s)) >= 0 ? '' : s;
  }

  function igual_(a, b) {
    const k = (v) => (v instanceof Date ? 'D' + v.getTime() : may(v));
    return k(a) === k(b);
  }

  const vacio_ = (v) => v === '' || v === 0 || v === '0';

  function texto_(v) {
    if (v instanceof Date) return Utilities.formatDate(v, LineasDatos.ZONA_APP, 'dd/MM/yyyy');
    return v === null || v === undefined ? '' : String(v);
  }

  /**
   * Dónde vive una parte con ese estatus: PERSONA, RESGUARDO, NINGUNA, SIGUE (la línea en proceso de cancelación
   * sigue con su equipo) o null (estatus viejo que no lo dice). Mismas reglas que la migración (ESTRUCTURA_CLASE).
   */
  function clase_(parte, estatus) {
    const e = may(estatus);
    if (parte === 'linea' && e === 'EN PROCESO DE CANCELACION') return 'SIGUE';
    return ESTRUCTURA_CLASE[parte][e] || null;
  }

  /**
   * JEFE DIRECTO (usuario, 4-oct: Reasignar lo perdía) y los responsables adicionales (6-oct) en ASIGNACIONES. Las hojas
   * armadas antes no los tienen: se agregan los encabezados al final, una vez, y la tabla se olvida para que la
   * escritura los vea (LineasDatos.asegurarColumnas; sin asegurarPestana, que cambiaría el formato de las fechas).
   */
  function asegurarJefeDirecto_() {
    if (typeof LineasDatos.asegurarColumnas !== 'function') return; // pruebas con hojas simuladas
    LineasDatos.asegurarColumnas(HOJA.ASIGNACIONES, ['JEFE DIRECTO'].concat(ADICIONALES));
  }

  function hojas() {
    if (hojas_) return hojas_;
    asegurarJefeDirecto_();
    hojas_ = {};
    Object.keys(HOJA).forEach((k) => {
      const filas = LineasDatos.leerTabla(HOJA[k]);
      const porId = {};
      filas.forEach((r) => { if (r['ID']) porId[String(r['ID'])] = r; });
      hojas_[k] = { filas: filas, porId: porId };
    });
    return hojas_;
  }

  /** Lo escrito, como se leería de la hoja ("QRO" se lee "QUERETARO"): así la copia en memoria sirve para leer. */
  function comoSeLee_(cambios) {
    const o = {};
    Object.keys(cambios).forEach((c) => {
      const v = cambios[c];
      o[c] = typeof v === 'string' ? LineasUtil.mostrarCH(c, LineasUtil.guardarCH(c, v)) : v;
    });
    return o;
  }

  function actualizar_(k, fila, cambios) {
    if (!Object.keys(cambios).length) return;
    LineasDatos.actualizarFila(HOJA[k], fila._fila, cambios);
    Object.assign(fila, comoSeLee_(cambios));
  }

  function agregar_(k, objeto) {
    // Las hojas se leen antes de escribir: si se leyeran después (la primera escritura de un alta), el renglón nuevo
    // ya vendría en la lectura y quedaría dos veces ("El ID … está repetido", prueba del 4-oct)
    const h = hojas();
    objeto['ID'] = objeto['ID'] || Ids.nuevo(PREFIJO[k]);
    const n = LineasDatos.agregarFilas(HOJA[k], [objeto])[0];
    const fila = Object.assign({ _fila: n }, comoSeLee_(objeto));
    h[k].filas.push(fila);
    h[k].porId[String(objeto['ID'])] = fila;
    return fila;
  }

  /** El adendum que se muestra de una línea (el mismo que elige LineasLectura). */
  function adendumDe_(idLinea) {
    let actual = null;
    hojas().ADENDUMS.filas.forEach((d) => {
      if (String(d['ID LINEA'] || '') === String(idLinea) && LineasLectura.esAdendumMasReciente(d, actual)) actual = d;
    });
    return actual;
  }

  /**
   * Agrupa las partes por dónde viven: { PERSONA: { equipo, linea }, RESGUARDO: { … } }. Las que no viven en una
   * asignación (NINGUNA o estatus que no lo dice) no entran.
   */
  function grupos_(conEquipo, cE, conLinea, cL) {
    const g = {};
    const poner = (clase, parte) => {
      if (clase !== 'PERSONA' && clase !== 'RESGUARDO') return;
      (g[clase] = g[clase] || {})[parte] = true;
    };
    if (conEquipo) poner(cE, 'equipo');
    if (conLinea) poner(cL, 'linea');
    return g;
  }

  /**
   * Datos de una asignación nueva. Con persona: lo que mostraba el registro al guardar más lo que cambió. De
   * resguardo: sin persona; departamento, sede y oficina (DISPONIBLE si no se eligió otro, D-I3).
   */
  function datosAsignacion_(clase, base, cambios, venia) {
    const d = {};
    if (clase === 'PERSONA') {
      PERSONA.concat(UBICACION).forEach((c) => { d[c] = c in cambios ? cambios[c] : (base[c] || ''); });
      // DISPONIBLE es el departamento de lo guardado: no pasa a una persona
      if (!('DEPARTAMENTO' in cambios) && may(d['DEPARTAMENTO']) === LineasRepo.DEPARTAMENTO_DISPONIBLE) d['DEPARTAMENTO'] = '';
      return d;
    }
    PERSONA.forEach((c) => { d[c] = ''; });
    UBICACION.forEach((c) => { d[c] = c in cambios ? cambios[c] : (base[c] || ''); });
    if (!cambios['DEPARTAMENTO'] && !(venia === 'RESGUARDO' && d['DEPARTAMENTO'])) d['DEPARTAMENTO'] = LineasRepo.DEPARTAMENTO_DISPONIBLE;
    return d;
  }

  /**
   * Guarda `cambios` (columnas de la hoja vieja) del registro `f` (un renglón armado por LineasLectura).
   * opciones.tolerante: lo que no tiene dónde guardarse se ignora en vez de avisar (la inspección copia sus datos al
   * registro aunque esté guardado o no tenga línea).
   * Regresa lo mismo que LineasRepo.guardarCambiosRegistro: { idsCambios: [], idReasignacion: null, campos, refs }.
   */
  function guardar(f, cambios, usuario, ahora, opciones) {
    const tolerante = !!(opciones && opciones.tolerante);
    const corregir = !!(opciones && opciones.corregir);
    const h = hojas();
    const id = (c) => String(f[c] === null || f[c] === undefined ? '' : f[c]).trim();
    const e = id('ID EQUIPO') ? h.EQUIPOS.porId[id('ID EQUIPO')] || null : null;
    let l = id('ID LINEA') ? h.LINEAS.porId[id('ID LINEA')] || null : null;
    const a = id('ID ASIGNACION') ? h.ASIGNACIONES.porId[id('ID ASIGNACION')] || null : null;
    if ((id('ID EQUIPO') && !e) || (id('ID LINEA') && !l) || (id('ID ASIGNACION') && (!a || a['FECHA FIN']))) {
      throw new Error('El registro cambió mientras se guardaba; vuelve a abrirlo e intenta otra vez.');
    }
    if (!e && !l) throw new Error('El registro ' + id('ID') + ' no tiene equipo ni línea.');
    const nombre = e ? 'NUCO ' + (LineasUtil.nucoVisible(e['NUCO']) || '') : 'la línea ' + (l['NUMERO TELEFONO'] || l['NUMERO SIM'] || '');
    const sinLugar = (mensaje) => { if (!tolerante) throw new Error(nombre + ': ' + mensaje); };
    // 0) Ponerle línea a un equipo que no tiene (Editar, 4-oct): una línea sola que ya existe con ese número, o una nueva
    let enlazada = false;
    if (e && !l && !tolerante) {
      const num = limpio_(cambios['NUMERO TELEFONO']);
      const sim = limpio_(cambios['NUMERO SIM']);
      if (num || sim) {
        const r = lineaParaEquipo_(e, num, sim, cambios, a, ahora);
        l = r.linea;
        enlazada = r.enlazada;
      }
    }

    // 1) Repartir cada cambio a su hoja (todavía sin escribir)
    const pE = {};
    const pL = {};
    const pD = {};
    const pP = {};
    const campos = [];
    const anotados = []; // { hoja, columna, campo, antes, despues }: se escriben y van al historial
    let tipoNuevo = null;
    Object.keys(cambios).forEach((columna) => {
      const c = LineasDatos.normCol(columna);
      const despues = limpio_(cambios[columna]);
      const antes = limpio_(LineasUtil.col(f, columna));
      if (c === 'NUCO' ? (LineasUtil.nucoVisible(antes) || '') === (LineasUtil.nucoVisible(despues) || '') : igual_(antes, despues)) return;
      if (c === 'TIPO') { tipoNuevo = may(despues); return; }
      if (c in A_EQUIPO) {
        if (!e) { if (despues !== '') sinLugar(c === 'NUCO' ? 'el NUCO es del aparato y esta línea no tiene equipo.' : c + ' es del aparato y esta línea no tiene equipo.'); return; }
        anotados.push({ hoja: 'E', columna: A_EQUIPO[c], campo: columna, antes: antes, despues: c === 'NUCO' ? LineasUtil.nucoVisible(despues) || '' : despues });
        return;
      }
      if (c in A_LINEA || A_ADENDUM.indexOf(c) >= 0) {
        if (!l) { if (!vacio_(despues)) sinLugar(c + ' es de la línea y este equipo no tiene línea.'); return; }
        // La línea que ya existía conserva lo que no se capturó (y sus fechas de adendum)
        if (enlazada && (vacio_(despues) || c === 'INICIO PLAN' || c === 'FIN PLAN')) return;
        // El número no se borra: la línea deja al equipo por su estatus o con «Mandar a cancelación» (al confirmar la
        // cancelación llega sin número, y la línea lo conserva: paso 3)
        if (c === 'NUMERO TELEFONO' && despues === '' && antes !== '' && !tolerante && may(limpio_(cambios['ESTATUS LINEA'])) !== 'CANCELADA') {
          throw new Error(nombre + ': el número de la línea no se borra; para quitarle la línea cambia su estatus o usa «Mandar a cancelación».');
        }
        anotados.push({ hoja: c in A_LINEA ? 'L' : 'D', columna: A_LINEA[c] || c, campo: columna, antes: antes, despues: despues });
        return;
      }
      if (PERSONA.indexOf(c) >= 0 || UBICACION.indexOf(c) >= 0) { pP[c] = despues; return; }
      if (c === 'COMENTARIOS') campos.push({ campo: columna, antes: texto_(antes), despues: texto_(despues) });
      // Lo demás ya no se guarda (FECHA INSPECCION, responsables 2 a 5…)
    });

    const nuevoEstatusLinea = (anotados.filter((x) => x.hoja === 'L' && x.columna === 'ESTATUS LINEA')[0] || {}).despues;
    const seCancela = !!l && may(nuevoEstatusLinea) === 'CANCELADA';

    // 2) TIPO: en las hojas nuevas es el tipo de equipo y el tipo de línea; poner o quitar la línea es una acción
    if (tipoNuevo !== null) {
      const tendraEquipo = tipoNuevo in ESTRUCTURA_TIPO_EQUIPO;
      const tendraLinea = TIPOS_CON_LINEA_FIJA.indexOf(tipoNuevo) >= 0 || (tipoNuevo in ESTRUCTURA_TIPO_LINEA && !!l);
      if (!!e !== tendraEquipo) {
        sinLugar(e ? 'un aparato no se puede volver solo línea (TIPO ' + tipoNuevo + ').' : 'esta línea no tiene aparato: dale de alta al equipo y entrégalo con la línea.');
      } else if (l && !tendraLinea && !seCancela) {
        sinLugar('para quitarle la línea al equipo usa «Mandar a cancelación» (con el paso 2 llegan «Cambio de línea» y «Entregar»).');
      } else if (!l && tendraLinea) {
        sinLugar('ponerle una línea a un equipo es una acción («Entregar» o «Cambio de línea», paso 2); no se hace cambiando el TIPO.');
      } else {
        if (e && ESTRUCTURA_TIPO_EQUIPO[tipoNuevo] !== limpio_(e['TIPO DE EQUIPO'])) {
          anotados.push({ hoja: 'E', columna: 'TIPO DE EQUIPO', antes: limpio_(e['TIPO DE EQUIPO']), despues: ESTRUCTURA_TIPO_EQUIPO[tipoNuevo] });
        }
        if (l && tendraLinea && !seCancela) {
          const actual = limpio_(l['TIPO DE LINEA']);
          let tl = ESTRUCTURA_TIPO_LINEA[tipoNuevo] || '';
          if (!tl) tl = may(actual) === 'SIM BASICO' && tipoNuevo === 'LINEA' ? '' : actual; // LINEA no dice si es plan: lo confirma la factura
          if (tl !== actual) anotados.push({ hoja: 'L', columna: 'TIPO DE LINEA', antes: actual, despues: tl });
        }
      }
      campos.push({ campo: 'TIPO', antes: texto_(limpio_(LineasUtil.col(f, 'TIPO'))), despues: tipoNuevo });
    }

    // 3) Si la línea se cancela, los valores "sin línea" de la hoja vieja (NO APLICA, 0…) no se le aplican: la línea
    //    conserva su número, su SIM y su adendum; solo cambia su estatus y deja al equipo
    const aplicar = anotados.filter((x) => !(seCancela && (x.hoja === 'L' || x.hoja === 'D') && x.columna !== 'ESTATUS LINEA' && vacio_(x.despues)));
    aplicar.forEach((x) => { ({ E: pE, L: pL, D: pD })[x.hoja][x.columna] = x.despues; });

    // 4) Dónde vive cada parte después del cambio
    const claseActual = a ? may(a['TIPO']) : null;
    let cE = null;
    if (e) cE = 'ESTATUS EQUIPO' in pE ? (clase_('equipo', pE['ESTATUS EQUIPO']) || claseActual) : claseActual;
    let cL = null;
    if (l) {
      const k = 'ESTATUS LINEA' in pL ? clase_('linea', pL['ESTATUS LINEA'])
        : (clase_('linea', l['ESTATUS LINEA']) === 'SIGUE' ? 'SIGUE' : null);
      cL = k === 'SIGUE' ? (e && (cE === 'PERSONA' || cE === 'RESGUARDO') ? cE : claseActual) : (k || claseActual);
    }
    const g = grupos_(!!e, cE, !!l, cL);
    const clases = Object.keys(g);
    const antesP = {};
    PERSONA.concat(UBICACION).forEach((c) => { antesP[c] = limpio_(a ? a[c] : LineasUtil.col(f, c)); });
    const cambiaPersona = 'RESPONSABLE' in pP && antesP['RESPONSABLE'] !== '' && pP['RESPONSABLE'] !== '';
    const mismaForma = !!a && clases.length === 1 && clases[0] === claseActual &&
      !!g[claseActual].equipo === !!a['ID EQUIPO'] && !!g[claseActual].linea === !!a['ID LINEA'];
    const enSuLugar = mismaForma && !(claseActual === 'PERSONA' && cambiaPersona && !corregir);

    // Los datos de la persona necesitan una asignación con persona; la ubicación, una con persona o de resguardo
    const conPersona = !!g.PERSONA;
    const conUbicacion = conPersona || !!g.RESGUARDO;
    Object.keys(pP).forEach((c) => {
      const lugar = PERSONA.indexOf(c) >= 0 ? conPersona : conUbicacion;
      if (lugar || pP[c] === '') return;
      sinLugar(PERSONA.indexOf(c) >= 0 && g.RESGUARDO
        ? 'está guardado (asignación de resguardo, sin persona): para entregarlo a alguien usa «Reasignar».'
        : 'no tiene asignación vigente (estatus ' + (limpio_(e ? (pE['ESTATUS EQUIPO'] || e['ESTATUS EQUIPO']) : (pL['ESTATUS LINEA'] || l['ESTATUS LINEA'])) || 'vacío') + '): ' + c + ' no tiene dónde guardarse.');
      delete pP[c];
    });

    const adendum = Object.keys(pD).length ? adendumDe_(l['ID']) : null;
    if (adendum && [FUENTE_A_MANO, ESTRUCTURA_FUENTE_INVENTARIO].indexOf(String(adendum['FUENTE'] || '')) < 0) {
      throw new Error(nombre + ': el adendum viene del proveedor (' + adendum['FUENTE'] + '); se corrige con su carga, no a mano.');
    }

    // 5) Escribir (ya no hay avisos)
    const refs = [e && e['ID'], l && l['ID'], a && a['ID']];
    if (e) actualizar_('EQUIPOS', e, pE);
    if (l) actualizar_('LINEAS', l, pL);
    if (Object.keys(pD).length) {
      if (adendum) actualizar_('ADENDUMS', adendum, pD);
      else {
        refs.push(agregar_('ADENDUMS', Object.assign({
          'ID LINEA': l['ID'], 'NUMERO TELEFONO': l['NUMERO TELEFONO'] || '', 'COMPAÑIA': l['COMPAÑIA'] || '',
          'CUENTA PADRE': l['CUENTA PADRE'] || '', 'PLAN': '', 'COSTO PLAN': '', 'INICIO PLAN': '', 'FIN PLAN': '', 'FUENTE': FUENTE_A_MANO,
          'ARCHIVO': '', 'FECHA DEL ARCHIVO': '', 'FECHA DE CARGA': ahora,
        }, pD))['ID']);
      }
    }
    let vigente = a; // la asignación que el registro muestra después
    if (enSuLugar) {
      actualizar_('ASIGNACIONES', a, Object.assign({}, pP));
    } else if (a || clases.length) {
      if (a) actualizar_('ASIGNACIONES', a, { 'FECHA FIN': ahora });
      vigente = null;
      // El ID de la persona (catálogo de CH) no pasa a otra persona
      const base = cambiaPersona ? Object.assign({}, antesP, { 'ID PERSONA': '' }) : antesP;
      clases.forEach((clase) => {
        const nueva = agregar_('ASIGNACIONES', Object.assign(datosAsignacion_(clase, base, pP, claseActual), {
          'TIPO': clase, 'ID LINEA': g[clase].linea ? l['ID'] : '', 'ID EQUIPO': g[clase].equipo ? e['ID'] : '',
          'FECHA INICIO': ahora, 'FECHA FIN': '',
        }));
        refs.push(nueva['ID']);
        if (e ? g[clase].equipo : g[clase].linea) vigente = nueva;
      });
    }

    // 6) Lo que cambió, para el historial (APP_MOVIMIENTOS): equipo, línea, adendum y lo que muestra de la persona
    aplicar.forEach((x) => { if (x.campo) campos.push({ campo: x.campo, antes: texto_(x.antes), despues: texto_(x.despues) }); });
    if (vigente && vigente !== a) {
      PERSONA.concat(UBICACION).forEach((c) => {
        const despues = limpio_(vigente[c]);
        if (c !== 'ID PERSONA' && !igual_(antesP[c], despues)) campos.push({ campo: c, antes: texto_(antesP[c]), despues: texto_(despues) });
      });
    } else if (enSuLugar) {
      PERSONA.concat(UBICACION).forEach((c) => {
        if (c in pP && c !== 'ID PERSONA') campos.push({ campo: c, antes: texto_(antesP[c]), despues: texto_(pP[c]) });
      });
    }
    // La línea deja al equipo (se canceló o quedó en otra asignación): el número sale del NUCO y se ve aparte
    if (e && l && !(vigente && vigente['ID LINEA'] === l['ID'] && vigente['ID EQUIPO'] === e['ID'])) {
      campos.push({ campo: 'NUMERO TELEFONO', antes: texto_(l['NUMERO TELEFONO']), despues: '' });
      tocados_.push(String(l['ID']));
    }
    if (campos.length) LineasLectura.olvidar();
    return { idsCambios: [], idReasignacion: null, campos: campos, refs: refs.filter(Boolean) };
  }

  /**
   * La línea que se le pone a un equipo sin línea (Editar, 4-oct). Si ya existe una línea con ese número (no cancelada),
   * tiene que estar sola: se cierra su asignación y queda con el equipo (enlazada). Si no existe, se crea con lo
   * capturado. Su estatus, si no se eligió, sigue al equipo: USO con una persona, DISPONIBLE guardado.
   * Regresa { linea, enlazada }.
   */
  function lineaParaEquipo_(e, num, sim, cambios, a, ahora) {
    const h = hojas();
    const nuco = 'NUCO ' + (LineasUtil.nucoVisible(e['NUCO']) || '');
    const digitos = (x) => String(x || '').replace(/\D/g, '');
    const existente = num ? h.LINEAS.filas.filter((x) => digitos(x['NUMERO TELEFONO']) === digitos(num) && may(x['ESTATUS LINEA']) !== 'CANCELADA')[0] : null;
    const clase = a ? may(a['TIPO']) : clase_('equipo', limpio_(cambios['ESTATUS EQUIPO']) || e['ESTATUS EQUIPO']);
    const estatus = limpio_(cambios['ESTATUS LINEA']) || (clase === 'PERSONA' ? 'USO' : 'DISPONIBLE');
    if (existente) {
      const suya = h.ASIGNACIONES.filas.filter((x) => String(x['ID LINEA'] || '') === String(existente['ID']) && !x['FECHA FIN'])[0];
      if (suya && suya['ID EQUIPO']) {
        const otro = h.EQUIPOS.porId[String(suya['ID EQUIPO'])];
        throw new Error(nuco + ': la línea ' + num + ' está en el NUCO ' + (otro ? LineasUtil.nucoVisible(otro['NUCO']) || '' : '?') + '.');
      }
      if (suya) actualizar_('ASIGNACIONES', suya, { 'FECHA FIN': ahora });
      if (!limpio_(cambios['ESTATUS LINEA'])) cambios['ESTATUS LINEA'] = estatus;
      tocados_.push(String(existente['ID'])); // la línea sola deja de verse aparte
      return { linea: existente, enlazada: true };
    }
    const nueva = agregar_('LINEAS', {
      'ID ANTERIOR': '', 'ID APPSHEET': '', 'NUMERO TELEFONO': num, 'TIPO DE LINEA': limpio_(cambios['TIPO DE LINEA']) || 'PLAN',
      'COMPAÑIA': limpio_(cambios['COMPAÑIA']), 'CUENTA PADRE': '', 'CUENTA': '', 'RAZON SOCIAL': limpio_(cambios['RAZON SOCIAL']), 'NUMERO SIM': sim,
      'PIN WHATSAPP': limpio_(cambios['PIN WHATSAPP']), 'ESTATUS LINEA': estatus, 'FECHA DE ALTA': ahora,
    });
    cambios['ESTATUS LINEA'] = estatus;
    return { linea: nueva, enlazada: false };
  }

  /**
   * Alta (LineasRegistros.crear): `datos` trae las columnas de la hoja vieja. Crea el equipo, la línea, su adendum (si
   * se capturó) y la asignación según los estatus. Pone en datos.ID el ID del registro (el del equipo o, si es solo
   * línea, el de la línea) y regresa { id, refs }.
   */
  function agregar(datos) {
    const v = (c) => limpio_(LineasUtil.col(datos, c));
    const ahora = datos['FECHA REGISTRO'] instanceof Date ? datos['FECHA REGISTRO'] : new Date();
    const tipo = may(datos['TIPO']);
    const numero = v('NUMERO TELEFONO');
    const sim = v('NUMERO SIM');
    const conEquipo = tipo in ESTRUCTURA_TIPO_EQUIPO;
    const conLinea = tipo in ESTRUCTURA_TIPO_LINEA && (!!(numero || sim) || tipo === 'LINEA' || tipo === 'LINEA BASICA');
    if (!conEquipo && !conLinea) throw new Error('Elige el TIPO del registro.');
    const refs = [];
    const e = conEquipo ? agregar_('EQUIPOS', {
      'ID ANTERIOR': '', 'ID APPSHEET': '', 'NUCO': LineasUtil.nucoVisible(v('NUCO')) || '', 'TIPO DE EQUIPO': ESTRUCTURA_TIPO_EQUIPO[tipo],
      'MODELO': v('EQUIPO'), 'COLOR': v('COLOR'), 'IMEI': v('IMEI'), 'ACCESORIOS': v('ACCESORIOS'), 'PIN EQUIPO': v('PIN EQUIPO'), 'PATRON': v('PATRON'),
      'CONTRASEÑA MODEM': v('CONTRASEÑA MODEM'), 'ESTATUS EQUIPO': v('ESTATUS EQUIPO'), 'FECHA DE ALTA': ahora,
    }) : null;
    const l = conLinea ? agregar_('LINEAS', {
      'ID ANTERIOR': '', 'ID APPSHEET': '', 'NUMERO TELEFONO': numero, 'TIPO DE LINEA': v('TIPO DE LINEA') || ESTRUCTURA_TIPO_LINEA[tipo] || '',
      'COMPAÑIA': v('COMPAÑIA'), 'CUENTA PADRE': '', 'CUENTA': '', 'RAZON SOCIAL': v('RAZON SOCIAL'), 'NUMERO SIM': sim,
      'PIN WHATSAPP': v('PIN WHATSAPP'), 'ESTATUS LINEA': v('ESTATUS LINEA'), 'FECHA DE ALTA': ahora,
    }) : null;
    if (e) refs.push(e['ID']);
    if (l) refs.push(l['ID']);
    if (l && A_ADENDUM.some((c) => !vacio_(v(c)))) {
      refs.push(agregar_('ADENDUMS', {
        'ID LINEA': l['ID'], 'NUMERO TELEFONO': numero, 'COMPAÑIA': v('COMPAÑIA'), 'CUENTA PADRE': '', 'PLAN': '',
        'COSTO PLAN': v('COSTO PLAN'), 'INICIO PLAN': v('INICIO PLAN'), 'FIN PLAN': v('FIN PLAN'), 'FUENTE': FUENTE_A_MANO,
        'ARCHIVO': '', 'FECHA DEL ARCHIVO': '', 'FECHA DE CARGA': ahora,
      })['ID']);
    }
    // Se dan de alta juntos: si uno de los dos estatus está vacío (o no dice dónde vive), va con el otro
    let cE = e ? clase_('equipo', e['ESTATUS EQUIPO']) : null;
    let cL = l ? clase_('linea', l['ESTATUS LINEA']) : null;
    const vive = (c) => c === 'PERSONA' || c === 'RESGUARDO';
    if (e && l && (cL === 'SIGUE' || !cL) && vive(cE)) cL = cE;
    if (e && l && !cE && vive(cL)) cE = cL;
    const g = grupos_(!!e, cE, !!l, cL);
    const capturado = {};
    PERSONA.concat(UBICACION).forEach((c) => { if (c !== 'ID PERSONA') capturado[c] = v(c); });
    Object.keys(g).forEach((clase) => {
      refs.push(agregar_('ASIGNACIONES', Object.assign(datosAsignacion_(clase, {}, capturado, null), {
        'TIPO': clase, 'ID LINEA': g[clase].linea ? l['ID'] : '', 'ID EQUIPO': g[clase].equipo ? e['ID'] : '',
        'FECHA INICIO': ahora, 'FECHA FIN': '',
      }))['ID']);
    });
    datos['ID'] = (e || l)['ID'];
    if (e && l && !(g.PERSONA && g.PERSONA.equipo && g.PERSONA.linea) && !(g.RESGUARDO && g.RESGUARDO.equipo && g.RESGUARDO.linea)) {
      tocados_.push(String(l['ID'])); // equipo y línea quedaron en asignaciones distintas: la línea se ve aparte
    }
    LineasLectura.olvidar();
    return { id: datos['ID'], refs: refs };
  }

  /**
   * Las 4 hojas como están ahora (las que se leyeron en esta ejecución, con lo que se escribió), por nombre; null si en
   * esta ejecución no se leyeron. LineasLectura las usa en vez de volver a leerlas al rearmar (rapidez, paso 2).
   */
  function hojasEnMemoria() {
    if (!hojas_) return null;
    const salida = {};
    Object.keys(HOJA).forEach((k) => { salida[HOJA[k]] = hojas_[k].filas; });
    return salida;
  }

  return {
    ADICIONALES, guardar, agregar, hojasEnMemoria,
    /** Registros que aparecieron en esta ejecución (para refrescar el índice sin recargar). */
    tocados: () => tocados_.slice(),
    _limpio: limpio_, _clase: clase_,
  };
})();

/**
 * Etapa 3: revisa que las hojas nuevas sigan las reglas de la asignación (plan §5.4). Solo lee; se corre desde el
 * editor antes y después de probar, para ver que guardar no deja combinaciones imposibles. Lo que ya venía así de la
 * hoja vieja (estatus que no dicen dónde está, casos de Correcciones) también sale: se compara contra la corrida
 * anterior.
 */
function reestructuraRevisarEscritura() {
  soloEditor_();
  const leer = (n) => (LineasDatos.existeTabla(n) ? LineasDatos.leerTabla(n) : []);
  const equipos = leer('EQUIPOS');
  const lineas = leer('LINEAS');
  const asignaciones = leer('ASIGNACIONES');
  const vigentes = asignaciones.filter((a) => !a['FECHA FIN']);
  const temas = {};
  const anotar = (tema, ejemplo) => {
    const x = temas[tema] = temas[tema] || { cuantos: 0, ejemplos: [] };
    x.cuantos++;
    if (x.ejemplos.length < 6) x.ejemplos.push(ejemplo);
  };
  const porParte = { equipo: {}, linea: {} };
  vigentes.forEach((a) => {
    if (a['ID EQUIPO']) (porParte.equipo[a['ID EQUIPO']] = porParte.equipo[a['ID EQUIPO']] || []).push(a);
    if (a['ID LINEA']) (porParte.linea[a['ID LINEA']] = porParte.linea[a['ID LINEA']] || []).push(a);
    if (a['TIPO'] === 'RESGUARDO' && String(a['RESPONSABLE'] || '').trim()) anotar('Resguardo con nombre de persona (B13, viene de la hoja vieja)', a['ID']);
    if (a['TIPO'] === 'PERSONA' && !String(a['RESPONSABLE'] || '').trim()) anotar('Con persona pero sin responsable', a['ID']);
  });
  const revisar = (parte, filas, columna, ref) => filas.forEach((r) => {
    const vs = porParte[parte][r['ID']] || [];
    if (vs.length > 1) anotar('Más de una asignación vigente (' + parte + ')', ref(r));
    const clase = LineasEscritura._clase(parte, r[columna]);
    const tiene = vs.length ? vs[0]['TIPO'] : 'NINGUNA';
    if (clase === 'SIGUE' || clase === tiene) return;
    anotar((parte === 'equipo' ? 'Equipo ' : 'Línea ') + (r[columna] || 'sin estatus') + ' en asignación ' + tiene, ref(r));
  });
  revisar('equipo', equipos, 'ESTATUS EQUIPO', (e) => 'NUCO ' + e['NUCO']);
  revisar('linea', lineas, 'ESTATUS LINEA', (l) => l['NUMERO TELEFONO'] || l['NUMERO SIM'] || l['ID']);
  const hoy = Utilities.formatDate(new Date(), LineasDatos.ZONA_APP, 'yyyy-MM-dd');
  const deHoy = asignaciones.filter((a) => a['FECHA INICIO'] instanceof Date && Utilities.formatDate(a['FECHA INICIO'], LineasDatos.ZONA_APP, 'yyyy-MM-dd') === hoy);
  const conColor = equipos.filter((e) => String(e['COLOR'] || '').trim()).length;
  const salida = [
    'EQUIPOS ' + equipos.length + ' · LINEAS ' + lineas.length + ' · ASIGNACIONES ' + asignaciones.length + ' (vigentes ' + vigentes.length +
      ', cerradas ' + (asignaciones.length - vigentes.length) + ', abiertas hoy ' + deHoy.length + ')',
    'EQUIPOS con color: ' + conColor,
    '', 'TEMA | cuántos | ejemplos',
  ];
  Object.keys(temas).sort((a, b) => temas[b].cuantos - temas[a].cuantos).forEach((k) => salida.push(k + ' | ' + temas[k].cuantos + ' | ' + temas[k].ejemplos.join(', ')));
  for (let i = 0; i < salida.length; i += 25) console.log(salida.slice(i, i + 25).join('\n'));
  return 'Listo: ver el registro de ejecución.';
}

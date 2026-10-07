/**
 * LineasProveedor.gs — módulo «Proveedor» de Líneas (parte 7, plan §7.1; usuario, 7-oct).
 * Etapa 1: adendums de Telcel y barridos de AT&T. El navegador lee los archivos (lineas-proveedor.html) y manda sus
 * líneas; aquí se revisan contra el inventario (revisar) y se cargan (cargar):
 *
 *   ADENDUMS      un renglón por línea y archivo: la foto del mes de lo que dice el proveedor. El vigente de una línea
 *                 es el del archivo más nuevo (LineasLectura.esAdendumMasReciente). El mismo archivo no se carga dos veces.
 *   LINEAS        CUENTA, CUENTA PADRE y RAZON SOCIAL (de CUENTAS); la SIM si cambió con el mismo número (reposición).
 *                 Un número que el proveedor reporta y no está en el inventario se da de alta como línea suelta, sin
 *                 responsable y DISPONIBLE (usuario, 7-oct; si el proveedor ya lo da de baja, no).
 *   MOVIMIENTOS   la SIM o la cuenta que cambiaron, y las altas, con el archivo de origen.
 *   Avisos        a Líneas (LineasNotificaciones): posible cambio de número (misma cuenta hija en Telcel, misma SIM en
 *                 AT&T: plan §4.8; no se aplica solo) y líneas que el proveedor suspendió o dio de baja y en el
 *                 inventario siguen en USO o DISPONIBLE (usuario, 7-oct: solo aviso).
 */

const LineasProveedor = (function () {
  const MODULO = 'proveedor-lineas';
  const FUENTE = { ADENDUM: 'ADENDUM TELCEL', BARRIDO: 'BARRIDO AT&T' };
  const COMPANIA = { ADENDUM: 'TELCEL', BARRIDO: 'AT&T' };
  /** Lo que la foto del mes guarda además de las columnas del plan §4.3. */
  const COLUMNAS_ADENDUMS = ['CUENTA', 'NUMERO SIM', 'IMEI', 'ESTATUS PROVEEDOR', 'EQUIPO', 'PLAZO', 'PENALIZACION', 'FECHA DE BAJA'];
  const MAX_LINEAS = 3000;
  const ESTATUS_BAJA = /SUSPEND|CANCEL|DESACTIV|BAJA|INACTIV/i;
  /** Estatus de línea del inventario que dicen que se está usando o que está lista para usarse. */
  const ESTATUS_VIVA = ['USO', 'DISPONIBLE'];
  const CUENTA_SIM_BASICOS = '643495915';
  const ACCION = 'PROVEEDOR';
  const ORIGEN = 'PROVEEDOR';
  const EJEMPLOS = 50;

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const s19 = (v) => txt(v).replace(/\D/g, '').slice(0, 19);
  const dos = (n) => ('0' + n).slice(-2);
  /** yyyy-mm-dd de una celda: Date, «yyyy-mm-dd…» o «dd/mm/yyyy». */
  function ymd(v) {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + dos(v.getMonth() + 1) + '-' + dos(v.getDate());
    const s = txt(v);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + dos(m[2]) + '-' + dos(m[1]) : '';
  }
  const fechaCorta = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '');
  const aFecha = (s) => (s ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : '');
  const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

  // ---------------- Lo que manda el navegador: se revisa, no se confía ----------------

  function limpiarLote_(lote) {
    const archivos = (lote && lote.archivos) || [];
    if (!archivos.length) throw new Error('No hay archivos que cargar.');
    let total = 0;
    return archivos.map((a) => {
      const tipo = txt(a.tipo).toUpperCase();
      if (!FUENTE[tipo]) throw new Error('Archivo no reconocido: ' + txt(a.archivo));
      const fecha = ymd(a.fecha);
      if (!fecha) throw new Error('Falta la fecha de ' + txt(a.archivo) + '.');
      const lineas = (a.lineas || []).map((l) => {
        const numero = txt(l.numero).replace(/\D/g, '');
        if (numero.length !== 10) return null;
        const n = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
        return {
          numero: numero, cuentaPadre: txt(l.cuentaPadre).replace(/\D/g, ''), cuenta: txt(l.cuenta).replace(/\D/g, ''), estatus: txt(l.estatus),
          sim: txt(l.sim).replace(/\D/g, ''), imei: txt(l.imei).replace(/\D/g, ''), plan: txt(l.plan).slice(0, 200), renta: n(l.renta),
          equipo: txt(l.equipo).slice(0, 200), plazo: n(l.plazo), inicio: ymd(l.inicio), fin: ymd(l.fin), baja: ymd(l.baja), penalizacion: n(l.penalizacion),
        };
      }).filter(Boolean);
      total += lineas.length;
      if (total > MAX_LINEAS) throw new Error('Son demasiadas líneas para una carga (más de ' + MAX_LINEAS + ').');
      return { tipo: tipo, fuente: FUENTE[tipo], compania: COMPANIA[tipo], archivo: txt(a.archivo).slice(0, 200), fecha: fecha, lineas: lineas };
    });
  }

  // ---------------- Revisión: qué pasaría con cada línea (sin escribir) ----------------

  /**
   * inv = { lineas: [renglones de LINEAS con _fila], adendums: [renglones de ADENDUMS], cuentas: { cuentaPadre: { razon } },
   * vigente: (d, actual) → bool }. Regresa { resumen, acciones }.
   */
  function plan_(archivos, inv) {
    const porNumero = {};
    const porSim = {};
    const porCuenta = {};
    const ordenadas = inv.lineas.slice().sort((a, b) => (txt(a['ESTATUS LINEA']).toUpperCase() === 'CANCELADA') - (txt(b['ESTATUS LINEA']).toUpperCase() === 'CANCELADA'));
    ordenadas.forEach((l) => {
      const n = txt(l['NUMERO TELEFONO']).replace(/\D/g, '').slice(-10);
      if (n.length === 10 && !porNumero[n]) porNumero[n] = l;
      const s = s19(l['NUMERO SIM']);
      if (s.length >= 18 && !porSim[s]) porSim[s] = l;
      const c = txt(l['CUENTA']);
      if (c && !porCuenta[c]) porCuenta[c] = l;
    });
    const vigente = {};
    const cargadas = {};
    inv.adendums.forEach((d) => {
      const k = txt(d['ID LINEA']);
      if (k && inv.vigente(d, vigente[k])) vigente[k] = d;
      if (txt(d['FECHA DEL ARCHIVO'])) cargadas[txt(d['FUENTE']) + '|' + ymd(d['FECHA DEL ARCHIVO']) + '|' + txt(d['NUMERO TELEFONO'])] = true;
    });

    const acc = { adendums: [], lineas: {}, altas: [], cambiosNumero: [], estatus: [] };
    const res = {
      archivos: [], contratos: { nuevos: 0, iguales: 0, completan: 0, formato: 0, cambian: 0, bajas: 0, ejemplos: [] },
      sims: [], cuentas: 0, altas: [], sinAlta: [], cambiosNumero: [], numerosRegistrados: [], estatus: [], yaCargadas: 0, total: 0,
    };
    const cambiarLinea = (l, campo, valor, registrar) => {
      const id = txt(l['ID']);
      const x = acc.lineas[id] || (acc.lineas[id] = { id: id, fila: l._fila, numero: txt(l['NUMERO TELEFONO']), cambios: {}, antes: {}, registrar: [] });
      if (x.cambios[campo] !== undefined) return;
      x.cambios[campo] = valor;
      x.antes[campo] = txt(l[campo]);
      if (registrar) x.registrar.push(campo);
    };
    const vistos = {};

    archivos.forEach((a) => {
      let ya = 0;
      a.lineas.forEach((p) => {
        if (cargadas[a.fuente + '|' + a.fecha + '|' + p.numero] || vistos[a.fuente + '|' + a.fecha + '|' + p.numero]) { ya++; return; }
        vistos[a.fuente + '|' + a.fecha + '|' + p.numero] = true;
        const l = porNumero[p.numero];
        const baja = !!p.baja || ESTATUS_BAJA.test(p.estatus);
        if (l) {
          acc.adendums.push({ a: a, p: p, idLinea: txt(l['ID']) });
          // Contrato contra el vigente
          const v = vigente[txt(l['ID'])];
          if (baja) res.contratos.bajas++;
          else if (!v) res.contratos.nuevos++;
          else {
            const ant = { plan: txt(v['PLAN']), renta: Number(v['COSTO PLAN']) || null, inicio: ymd(v['INICIO PLAN']), fin: ymd(v['FIN PLAN']) };
            // Distinto: un dato que los dos tienen y no coincide (las fechas, por más de un día). Lo que el inventario no
            // tenía se completa; un día de diferencia es el formato de fecha del proveedor (7-oct: Telcel y AT&T)
            let distinto = (p.plan && ant.plan && p.plan !== ant.plan) || (p.renta !== null && ant.renta !== null && p.renta !== ant.renta);
            let formato = false;
            let completa = false;
            ['inicio', 'fin'].forEach((c) => {
              if (!p[c] || p[c] === ant[c]) return;
              if (!ant[c]) { completa = true; return; }
              if (Math.abs(diasEntre(ant[c], p[c])) === 1) formato = true; else distinto = true;
            });
            if (!distinto && (p.plan && !ant.plan || p.renta !== null && ant.renta === null)) completa = true;
            if (!distinto && formato) res.contratos.formato++;
            else if (!distinto && completa) res.contratos.completan++;
            else if (!distinto) res.contratos.iguales++;
            else {
              res.contratos.cambian++;
              if (res.contratos.ejemplos.length < EJEMPLOS) {
                res.contratos.ejemplos.push({ numero: p.numero, antes: [ant.plan, ant.renta, fechaCorta(ant.inicio), fechaCorta(ant.fin)], despues: [p.plan, p.renta, fechaCorta(p.inicio), fechaCorta(p.fin)] });
              }
            }
          }
          // La SIM: si cambió con el mismo número es una reposición (plan §4.8)
          const simInv = s19(l['NUMERO SIM']);
          const simProv = s19(p.sim);
          if (simProv.length >= 18 && simProv !== simInv) {
            cambiarLinea(l, 'NUMERO SIM', p.sim, !!simInv);
            if (simInv) res.sims.push({ numero: p.numero, antes: txt(l['NUMERO SIM']), despues: p.sim });
          }
          // Cuenta, cuenta padre y razón social (la de la cuenta padre)
          if (p.cuentaPadre && p.cuentaPadre !== txt(l['CUENTA PADRE'])) cambiarLinea(l, 'CUENTA PADRE', p.cuentaPadre, !!txt(l['CUENTA PADRE']));
          if (p.cuenta && p.cuenta !== txt(l['CUENTA'])) cambiarLinea(l, 'CUENTA', p.cuenta, !!txt(l['CUENTA']));
          const razon = p.cuentaPadre && inv.cuentas[p.cuentaPadre] ? inv.cuentas[p.cuentaPadre].razon : '';
          if (razon && razon !== txt(l['RAZON SOCIAL'])) cambiarLinea(l, 'RAZON SOCIAL', razon, !!txt(l['RAZON SOCIAL']));
          // Estatus: el proveedor la suspendió o la dio de baja y el inventario dice que se usa
          if (baja && ESTATUS_VIVA.indexOf(txt(l['ESTATUS LINEA']).toUpperCase()) >= 0) {
            const e = { numero: p.numero, inventario: txt(l['ESTATUS LINEA']), proveedor: p.estatus + (p.baja ? ' (baja ' + fechaCorta(p.baja) + ')' : ''), archivo: a.archivo, idLinea: txt(l['ID']) };
            acc.estatus.push(e);
            res.estatus.push(e);
          }
          return;
        }
        // No está con ese número: ¿es otra línea del inventario con otro número? (plan §4.8)
        const otra = (a.tipo === 'ADENDUM' && p.cuenta && porCuenta[p.cuenta]) || (s19(p.sim).length >= 18 && porSim[s19(p.sim)]) || null;
        if (otra) {
          // Sin suponer cuál es el nuevo (usuario, 7-oct: el barrido del 18-sep traía el número viejo de una línea que
          // Líneas ya había cambiado el 23-sep). Si la bitácora ya tiene ese cambio, no hay nada que avisar
          const c = { inventario: txt(otra['NUMERO TELEFONO']), proveedor: p.numero, pista: porCuenta[p.cuenta] === otra && a.tipo === 'ADENDUM' ? 'misma cuenta ' + p.cuenta : 'misma SIM ' + p.sim,
            idLinea: txt(otra['ID']), estatusInventario: txt(otra['ESTATUS LINEA']), archivo: a.archivo, fecha: a.fecha };
          const registrado = inv.cambioRegistrado ? inv.cambioRegistrado(c.proveedor, c.inventario) : '';
          if (registrado) {
            res.numerosRegistrados.push(Object.assign({ registrado: registrado }, c));
            acc.adendums.push({ a: a, p: p, idLinea: c.idLinea }); // es la misma línea con su número anterior
            return;
          }
          acc.cambiosNumero.push(c);
          res.cambiosNumero.push(c);
          acc.adendums.push({ a: a, p: p, idLinea: '' }); // no se liga hasta que Líneas lo revise
          return;
        }
        acc.adendums.push({ a: a, p: p, idLinea: null }); // null: se liga a la línea que se da de alta
        if (baja) { res.sinAlta.push({ numero: p.numero, estatus: p.estatus, archivo: a.archivo }); acc.adendums[acc.adendums.length - 1].idLinea = ''; return; }
        acc.altas.push({ a: a, p: p, indice: acc.adendums.length - 1 });
        res.altas.push({ numero: p.numero, compania: a.compania, cuentaPadre: p.cuentaPadre, plan: p.plan, estatus: p.estatus });
      });
      res.archivos.push({ archivo: a.archivo, tipo: a.tipo, fuente: a.fuente, compania: a.compania, fecha: a.fecha, lineas: a.lineas.length, yaCargadas: ya });
      res.yaCargadas += ya;
      res.total += a.lineas.length - ya;
    });
    res.cuentas = Object.keys(acc.lineas).filter((id) => ['CUENTA', 'CUENTA PADRE', 'RAZON SOCIAL'].some((c) => acc.lineas[id].cambios[c] !== undefined)).length;
    return { resumen: res, acciones: acc };
  }

  function inventario_() {
    const cuentas = {};
    if (LineasDatos.existeTabla('CUENTAS')) {
      LineasDatos.leerTabla('CUENTAS').forEach((c) => { cuentas[txt(c['CUENTA PADRE'])] = { razon: txt(c['RAZON SOCIAL']), compania: txt(c['COMPAÑIA']) }; });
    }
    return {
      lineas: LineasDatos.leerTabla('LINEAS'), adendums: LineasDatos.leerTabla('ADENDUMS'), cuentas: cuentas,
      vigente: LineasLectura.esAdendumMasReciente,
      cambioRegistrado: cambioRegistrado_,
    };
  }

  /**
   * Fecha (dd/mm/aaaa) en que la bitácora registró que una línea pasó del número `antes` al `despues`, o ''. Se busca en
   * CAMBIOS LINEAS TELEFONICAS (AppSheet) y en MOVIMIENTOS (sistema nuevo), solo los renglones con esos números.
   */
  function cambioRegistrado_(antes, despues) {
    const dig = (v) => txt(v).replace(/\D/g, '').slice(-10);
    const corta = (v) => (v instanceof Date ? fechaCorta(ymd(v)) : txt(v).slice(0, 10));
    const tabCambios = LineasRepo.TAB.CAMBIOS;
    if (LineasDatos.existeTabla(tabCambios)) {
      const filas = LineasDatos.buscarFilas(tabCambios, 'ANTES', antes);
      const hit = filas.length ? LineasDatos.leerFilas([{ tabla: tabCambios, filas: filas }])[0]
        .filter((f) => /NUMERO TELEFONO/i.test(txt(f['CAMPO'])) && dig(f['ANTES']) === antes && dig(f['DESPUES']) === despues)[0] : null;
      if (hit) return corta(LineasUtil.col(hit, 'FECHA ACTUALIZACION')) || 'sí';
    }
    const tabMov = LineasRepo.TAB.MOV;
    if (LineasDatos.existeTabla(tabMov)) {
      const filas = LineasDatos.buscarFilas(tabMov, 'CAMBIOS', antes, true);
      const hit = (filas.length ? LineasDatos.leerFilas([{ tabla: tabMov, filas: filas }])[0] : []).filter((f) => {
        let cambios = [];
        try { cambios = JSON.parse(txt(f['CAMBIOS']) || '[]'); } catch (e) { return false; }
        return cambios.some((x) => /NUMERO TELEFONO/i.test(txt(x.campo)) && dig(x.antes) === antes && dig(x.despues) === despues);
      })[0];
      if (hit) return corta(hit['FECHA']) || 'sí';
    }
    return '';
  }

  function exigirEstructura_() {
    if (!LineasLectura.activo()) throw new Error('El módulo del proveedor necesita las hojas nuevas (LINEAS, ADENDUMS).');
  }

  function revisar(lote) {
    exigirEstructura_();
    return plan_(limpiarLote_(lote), inventario_()).resumen;
  }

  // ---------------- Carga ----------------

  function cargar(lote, usuario) {
    exigirEstructura_();
    const archivos = limpiarLote_(lote);
    const ahora = new Date();
    const resultado = LineasDatos.conCandado(() => {
      const r = plan_(archivos, inventario_());
      const acc = r.acciones;
      const tocados = [];

      // 1) Altas: líneas sueltas, sin responsable
      acc.altas.forEach((x) => {
        const basica = x.p.cuentaPadre === CUENTA_SIM_BASICOS;
        const razon = (inventario_cuentas_(x.p.cuentaPadre) || {}).razon || '';
        const datos = {
          'TIPO': basica ? 'LINEA BASICA' : 'LINEA', 'NUMERO TELEFONO': x.p.numero, 'NUMERO SIM': x.p.sim, 'COMPAÑIA': x.a.compania,
          'RAZON SOCIAL': razon, 'TIPO DE LINEA': basica ? 'SIM BASICO' : 'PLAN', 'ESTATUS LINEA': 'DISPONIBLE', 'FECHA REGISTRO': ahora,
        };
        const alta = LineasRepo.agregarRegistro(datos);
        const id = alta.id || datos['ID'];
        acc.adendums[x.indice].idLinea = id;
        acc.lineas[id] = { id: id, numero: x.p.numero, cambios: { 'CUENTA PADRE': x.p.cuentaPadre, 'CUENTA': x.p.cuenta }, antes: {}, registrar: [], nueva: true };
        tocados.push(id);
        LineasRepo.registrarMovimiento('ALTA', { motivo: 'El proveedor la reporta y no estaba en el inventario (' + x.a.fuente + ' del ' + fechaCorta(x.a.fecha) + ', ' + x.a.archivo + ')' },
          usuario, ahora, { refs: [id].concat(alta.refs || []), numero: x.p.numero, despues: datos, origen: ORIGEN });
      });

      // 2) LINEAS: cuenta, cuenta padre, razón social y SIM
      const ids = Object.keys(acc.lineas);
      if (ids.length) {
        const filaDe = {};
        LineasDatos.olvidarTabla('LINEAS');
        LineasDatos.leerTabla('LINEAS').forEach((l) => { filaDe[txt(l['ID'])] = l._fila; });
        ids.forEach((id) => {
          const x = acc.lineas[id];
          const cambios = {};
          Object.keys(x.cambios).forEach((c) => { if (txt(x.cambios[c])) cambios[c] = x.cambios[c]; });
          if (!filaDe[id] || !Object.keys(cambios).length) return;
          LineasDatos.actualizarFila('LINEAS', filaDe[id], cambios);
          tocados.push(id);
          // Al historial solo lo que cambió un dato que ya tenía valor (llenar la cuenta la primera vez no es un cambio)
          if (x.registrar.length) {
            const archivo = acc.adendums.filter((d) => d.idLinea === id)[0];
            LineasRepo.registrarMovimiento(ACCION, { motivo: 'Según el proveedor' + (archivo ? ' (' + archivo.a.fuente + ' del ' + fechaCorta(archivo.a.fecha) + ', ' + archivo.a.archivo + ')' : '') },
              usuario, ahora, { refs: [id], numero: x.numero, origen: ORIGEN,
                detalle: { cambios: x.registrar.map((c) => ({ campo: c, antes: x.antes[c], despues: x.cambios[c] })) } });
          }
        });
      }

      // 3) ADENDUMS: la foto del mes
      LineasDatos.asegurarColumnas('ADENDUMS', COLUMNAS_ADENDUMS);
      LineasDatos.agregarFilas('ADENDUMS', acc.adendums.map((d) => ({
        'ID LINEA': d.idLinea || '', 'NUMERO TELEFONO': d.p.numero, 'COMPAÑIA': d.a.compania, 'CUENTA PADRE': d.p.cuentaPadre, 'CUENTA': d.p.cuenta,
        'PLAN': d.p.plan, 'COSTO PLAN': d.p.renta === null ? '' : d.p.renta, 'INICIO PLAN': aFecha(d.p.inicio), 'FIN PLAN': aFecha(d.p.fin),
        'FUENTE': d.a.fuente, 'ARCHIVO': d.a.archivo, 'FECHA DEL ARCHIVO': aFecha(d.a.fecha), 'FECHA DE CARGA': ahora,
        'NUMERO SIM': d.p.sim, 'IMEI': d.p.imei, 'ESTATUS PROVEEDOR': d.p.estatus, 'EQUIPO': d.p.equipo,
        'PLAZO': d.p.plazo === null ? '' : d.p.plazo, 'PENALIZACION': d.p.penalizacion === null ? '' : d.p.penalizacion, 'FECHA DE BAJA': aFecha(d.p.baja),
      })));
      return { resumen: r.resumen, acciones: acc, tocados: tocados };
    });

    // 4) Avisos a Líneas (fuera del candado: cada aviso toma el suyo)
    LineasLectura.limpiarCaches();
    // «Ver» abre el registro: el equipo donde está la línea, o la línea si va suelta
    const registroDe = {};
    LineasLectura.filas().forEach((f) => { if (f['ID LINEA']) registroDe[txt(f['ID LINEA'])] = txt(f['ID']); });
    avisar_(resultado.acciones, registroDe);
    const res = resultado.resumen;
    res.cargadas = resultado.acciones.adendums.length;
    return res;
  }

  function inventario_cuentas_(cuentaPadre) {
    if (!LineasDatos.existeTabla('CUENTAS')) return null;
    const c = LineasDatos.leerTabla('CUENTAS').filter((x) => txt(x['CUENTA PADRE']) === txt(cuentaPadre))[0];
    return c ? { razon: txt(c['RAZON SOCIAL']) } : null;
  }

  function avisar_(acc, registroDe) {
    acc.cambiosNumero.forEach((c) => {
      LineasNotificaciones.crear({
        tipo: 'CAMBIO DE NUMERO', refId: registroDe[c.idLinea] || c.idLinea,
        titulo: 'Número distinto con la ' + c.pista.replace(/ \d+$/, '') + ' · ' + c.inventario,
        mensaje: 'Inventario: ' + c.inventario + (c.estatusInventario ? ' (' + c.estatusInventario + ')' : '') + '. Proveedor: ' + c.proveedor +
          ', con la ' + c.pista + ' (' + (c.archivo || 'archivo del proveedor') + ', ' + fechaCorta(c.fecha) + '). No se cambió nada.',
      });
    });
    // Estatus: un aviso por archivo con todas sus líneas
    const porArchivo = {};
    acc.estatus.forEach((e) => { (porArchivo[e.archivo] = porArchivo[e.archivo] || []).push(e); });
    Object.keys(porArchivo).forEach((archivo) => {
      const lista = porArchivo[archivo];
      LineasNotificaciones.crear({
        tipo: 'ESTATUS PROVEEDOR',
        titulo: 'El proveedor reporta ' + lista.length + (lista.length === 1 ? ' línea suspendida o dada de baja' : ' líneas suspendidas o dadas de baja'),
        mensaje: archivo + ': ' + lista.map((e) => e.numero + ' (' + e.proveedor + '; inventario: ' + e.inventario + ')').join(', ') + '.',
      });
    });
  }

  return { MODULO, FUENTE, COLUMNAS_ADENDUMS, revisar, cargar, plan_, limpiarLote_ };
})();

// ---------------- API ----------------

function usuarioProveedor_(sesion) {
  return { correo: sesion.correo, nombre: sesion.nombre || sesion.correo };
}

/** Qué pasaría con los archivos leídos en el navegador (no escribe). */
function apiLineasProveedorRevisar(token, lote) {
  Permisos.puedeEditar(token, LineasProveedor.MODULO);
  return LineasUtil.paraCliente(LineasProveedor.revisar(lote));
}

function apiLineasProveedorCargar(token, lote) {
  const sesion = Permisos.puedeEditar(token, LineasProveedor.MODULO);
  return LineasUtil.paraCliente(LineasProveedor.cargar(lote, usuarioProveedor_(sesion)));
}

/**
 * LineasExportar.gs
 * "Exportar a Excel" de los módulos de Líneas: la base completa del módulo (todas las filas y todas las
 * columnas de su pestaña), no solo lo que se ve en la tabla. Solo lectura.
 *
 *   baseCompleta('INVENTARIO')   → LINEAS TELEFONICAS
 *   baseCompleta('CAMBIOS')      → CAMBIOS LINEAS TELEFONICAS (todas, no solo las 5000 más recientes)
 *   baseCompleta('ACCESORIOS')   → ACCESORIOS CELULARES + MOVIMIENTOS_ACCESORIOS (una hoja cada una)
 *   …
 *
 * Regresa { hojas: [{ nombre, columnas: [{ titulo, tipo }], filas: [[…]] }] } con los tipos de
 * ExportarExcel: 'fecha' ('yyyy-MM-dd'), 'fechaHora' ('yyyy-MM-ddTHH:mm:ss'), 'numero' o 'texto'.
 * Las fechas salen con la hora que muestra la hoja. PIN, patrones y contraseñas solo para ADMIN.
 */

const LineasExportar = (function () {
  // Se arma al usarse: este archivo carga antes que LineasRepo
  const modulos_ = () => {
    const TAB = LineasRepo.TAB;
    return {
      INVENTARIO: [TAB.LINEAS],
      CAMBIOS: [TAB.CAMBIOS],
      REASIGNACIONES: [TAB.REASIG],
      DESECHOS: [TAB.DESECHO],
      REACTIVACION: [TAB.REACTIVACION],
      SOLICITUD: [TAB.SOLICITUD],
      ACCESORIOS: ['ACCESORIOS CELULARES', 'MOVIMIENTOS_ACCESORIOS'],
    };
  };

  // Columnas con secretos (se ocultan si el usuario no es ADMIN)
  const COLUMNA_SECRETA = /^(PIN WHATSAPP|PIN EQUIPO|CONTRASE(Ñ|N)A MODEM|PATRON.*)$/i;
  // Identificadores numéricos: se exportan como texto para no perder dígitos ni verse en notación científica
  const COLUMNA_IDENTIFICADOR = /IMEI|SIM|ICCID|NUMERO|TELEFONO|FOLIO|EMPLEADO|NUCO|\bID\b|ID_|CUENTA|CODIGO|TICKET|CP\b/i;

  function tipoColumna_(nombre, valores, zona) {
    let fechas = 0, conHora = false, numeros = 0, llenos = 0;
    valores.forEach((v) => {
      if (v === '' || v === null) return;
      llenos++;
      if (v instanceof Date) {
        fechas++;
        if (!conHora && Utilities.formatDate(v, zona, 'HH:mm:ss') !== '00:00:00') conHora = true;
      } else if (typeof v === 'number') numeros++;
    });
    if (!llenos) return 'texto';
    if (fechas === llenos) return conHora ? 'fechaHora' : 'fecha';
    if (numeros === llenos && !COLUMNA_IDENTIFICADOR.test(nombre)) return 'numero';
    return 'texto';
  }

  function hoja_(nombre, puedeVerSecretos) {
    if (!LineasDatos.existeTabla(nombre)) return null;
    const t = LineasDatos.tablaFresca(nombre);
    const zona = LineasDatos.zona();
    const cols = [];
    t.encabezados.forEach((h, i) => { if (h) cols.push({ titulo: h, i: i }); });
    const ultima = t.hoja.getLastRow();
    const crudas = ultima >= 2 && t.encabezados.length
      ? t.hoja.getRange(2, 1, ultima - 1, t.encabezados.length).getValues().filter((v) => v.some((x) => x !== '' && x !== null))
      : [];

    const secretas = puedeVerSecretos ? [] : cols.filter((c) => COLUMNA_SECRETA.test(c.titulo)).map((c) => c.i);
    // CAMBIOS: el valor de antes/después de un PIN o contraseña también es secreto
    const iCampo = cols.find((c) => /^CAMPO$/i.test(c.titulo));
    const iAntesDespues = cols.filter((c) => /^(ANTES|DESPUES)$/i.test(c.titulo)).map((c) => c.i);

    cols.forEach((c) => { c.tipo = tipoColumna_(c.titulo, crudas.map((v) => v[c.i]), zona); });
    const formato = (v, tipo) => {
      if (v === '' || v === null || v === undefined) return '';
      if (v instanceof Date) {
        if (tipo === 'fecha') return Utilities.formatDate(v, zona, 'yyyy-MM-dd');
        if (tipo === 'fechaHora') return Utilities.formatDate(v, zona, "yyyy-MM-dd'T'HH:mm:ss");
        const hora = Utilities.formatDate(v, zona, 'HH:mm');
        return Utilities.formatDate(v, zona, 'dd/MM/yyyy') + (hora !== '00:00' ? ' ' + hora : '');
      }
      if (typeof v === 'number' && tipo === 'texto') return String(v);
      return v;
    };

    const filas = crudas.map((v) => {
      const ocultarCambio = !puedeVerSecretos && iCampo && /PIN|PATRON|CONTRASE/i.test(String(v[iCampo.i] || ''));
      return cols.map((c) => {
        const valor = v[c.i];
        if ((secretas.indexOf(c.i) >= 0 || (ocultarCambio && iAntesDespues.indexOf(c.i) >= 0)) && valor !== '' && valor !== null) return '••••';
        return formato(valor, c.tipo);
      });
    });
    return { nombre: nombre, columnas: cols.map((c) => ({ titulo: c.titulo, tipo: c.tipo })), filas: filas };
  }

  /** Base completa de un módulo (ver modulos_). */
  function baseCompleta(modulo, puedeVerSecretos) {
    const tablas = modulos_()[String(modulo || '').toUpperCase()];
    if (!tablas) throw new Error('Módulo desconocido para exportar: ' + modulo);
    const hojas = tablas.map((nombre) => hoja_(nombre, puedeVerSecretos)).filter(Boolean);
    if (!hojas.length) throw new Error('No existe la pestaña de este módulo en la base de datos.');
    return { hojas: hojas };
  }

  return { baseCompleta };
})();

/**
 * Relaciones.gs
 * Mantiene sincronizadas las columnas que unas hojas COPIAN de otra —
 * diseño completo en docs/relaciones.md, léelo primero si vas a tocar este
 * archivo. Resumen: VEHICULOS es la hoja DUEÑA de PLACA/MARCA/LINEA/etc.;
 * INSTALACION DE SENSORES, VERIFICACIONES y HOLOGRAMAS guardan una COPIA de
 * varias de esas columnas (AppSheet las sigue leyendo directo de ahí, no se
 * puede solo guardar el folio y consultar). Sin este archivo, esas copias se
 * quedaban con el valor viejo si alguien corregía el dato en Vehículos.
 *
 * Diferencia con el diseño original del doc: el doc mostraba un solo `clave`
 * a nivel de la hoja dueña (todas las copias unidas por FOLIO). En la
 * práctica, HOLOGRAMAS no une por FOLIO sino por SERIE VEHICULO — así que
 * aquí cada copia trae su propio `claveOrigen` (la columna de VEHICULOS que
 * hay que usar para encontrarla) además de `clave` (cómo se llama esa misma
 * columna en la hoja copia). `propagar()` recibe el registro YA actualizado
 * completo (no solo un valor de clave) para poder resolver cualquiera de los
 * dos.
 *
 * Piezas (ver docs/relaciones.md para el detalle de cada una):
 *   MAPA                — el único bloque que se edita a mano
 *   propagar()           — llamar después de editar el registro dueño
 *   datosParaNuevo()      — llamar al CREAR un registro que copia datos
 *   revisar({corregir})   — red de seguridad, pensada para un activador nocturno
 *   cambiarClave()        — cambiar el FOLIO mismo (solo ADMIN, aparte)
 *
 * Todavía NO conectado (a propósito, para no arriesgar lo que ya funciona):
 *   - SensoresService/VerificacionesService/HologramasService siguen usando
 *     sus propias funciones temporales para copiar al CREAR un registro
 *     (datosDeVehiculo_ / DEL_CATALOGO) — son funcionalmente correctas, solo
 *     falta reemplazarlas por datosParaNuevo() cuando se quiera unificar.
 *   - revisar() no tiene un activador de tiempo automático todavía — hay que
 *     crearlo a mano en el editor (Activadores > Agregar activador) una vez
 *     que se haya corrido revisarRelaciones() en modo solo-reporte y se haya
 *     revisado el log (ver SetupInicial.gs).
 *   - cambiarClave() no tiene botón en la app — es para usarse desde el
 *     editor mientras no haga falta con más frecuencia.
 */

const Relaciones = (function () {
  const MAPA = {
    VEHICULOS: {
      spreadsheet: () => Config.SPREADSHEET_IDS.VEHICULOS(),
      hoja: 'VEHICULOS',
      copias: [
        {
          nombre: 'INSTALACION DE SENSORES',
          // Firma de columnas para ubicar la pestaña real (igual que hacen
          // los Services de cada módulo con SheetUtils.getSheetByColumns).
          firma: ['ID_SENSOR', 'FOLIO', 'SERIE SENSOR'],
          claveOrigen: 'FOLIO',
          clave: 'FOLIO',
          // columna en VEHICULOS → columna en esta hoja (ver SensoresService.COPIADAS_DE_VEHICULO)
          columnas: {
            'PLACA': 'PLACA',
            'MARCA': 'MARCA',
            'CLASE': 'CLASE',
            'LINEA VEHICULO': 'LINEA VEHICULO',
            'MODELO': 'MODELO',
            'COLOR': 'COLOR',
            'CAPACIDAD COMBUSTIBLE (LTS)': 'CAPACIDAD DE COMBUSTIBLE',
            'RAZON SOCIAL': 'RAZON SOCIAL',
            'DEPARTAMENTO': 'DEPARTAMENTO',
            'SEDE': 'SEDE',
            'UBICACION': 'OFICINA / DESARROLLO',
            'RESPONSABLE VEHICULO': 'RESPONSABLE',
            'SERIE VEHICULO': 'SERIE VEHICULO',
          },
        },
        {
          nombre: 'VERIFICACIONES',
          firma: ['ID_VERIFICACION', 'FOLIO VEHICULO', 'COMPROBANTE VERIFICACION'],
          claveOrigen: 'FOLIO',
          clave: 'FOLIO VEHICULO',
          columnas: { 'PLACA': 'PLACA' },
        },
        {
          nombre: 'HOLOGRAMAS',
          firma: ['ID_HOLOGRAMA', 'CALCOMANIA EOX', 'ESTATUS EOX'],
          claveOrigen: 'SERIE VEHICULO',
          clave: 'SERIE VEHICULO',
          // ver HologramasService.DEL_CATALOGO — aquí NO van TIPO COMBUSTIBLE (es el
          // producto de la tarjeta, no el del vehículo) ni RAZON SOCIAL (empresa del
          // contrato, no la del vehículo): esos dos son propios de Hologramas.
          columnas: {
            'PLACA': 'PLACA',
            'MARCA': 'MARCA',
            'LINEA VEHICULO': 'LINEA VEHICULO',
            'MODELO': 'MODELO',
            'RESPONSABLE VEHICULO': 'RESPONSABLE',
            'DEPARTAMENTO': 'DEPARTAMENTO',
            'CAPACIDAD COMBUSTIBLE (LTS)': 'CAPACIDAD DEL TANQUE',
          },
        },
      ],
    },
  };

  const limpiar_ = (v) => String(v == null ? '' : v);
  const normalizar_ = (v) => limpiar_(v).trim().toUpperCase();

  /** Compara tolerando formato ("1,234.50" == 1234.5) — mismo criterio que HologramasService.mismoValor_ */
  function mismoValor_(a, b) {
    const na = Number(limpiar_(a).replace(/[$,\s]/g, ''));
    const nb = Number(limpiar_(b).replace(/[$,\s]/g, ''));
    if (limpiar_(a).trim() !== '' && limpiar_(b).trim() !== '' && !isNaN(na) && !isNaN(nb)) return na === nb;
    return normalizar_(a) === normalizar_(b);
  }

  function hojaCopia_(copia, ssId) {
    return SheetUtils.getSheetByColumns(ssId, copia.firma);
  }

  /** Posición (base 1) de una columna por nombre; truena claro si no existe — nunca escribe en otra. */
  function columna1_(hoja, nombre, encabezados) {
    const idx = SheetUtils.indiceDeColumnas(encabezados, [nombre])[nombre];
    if (idx === -1) {
      throw new Error('Relaciones: la hoja "' + hoja.getName() + '" no tiene la columna "' + nombre + '"');
    }
    return idx + 1;
  }

  /**
   * Escribe TODAS las entradas del log de una sola vez (una llamada a setValues, no
   * una por diferencia) — revisar() puede encontrar cientos de diferencias la primera
   * vez que corre, y escribirlas una por una con appendRow() era lentísimo (y arriesgaba
   * el límite de 6 minutos de Apps Script). `entradas` = [{tipo, hoja, clave, columna,
   * tenia, quedo}, …].
   */
  function escribirLog_(ssId, entradas) {
    if (!entradas.length) return;
    try {
      const ss = SpreadsheetApp.openById(ssId);
      let log = ss.getSheetByName('LOG_RELACIONES');
      if (!log) {
        log = ss.insertSheet('LOG_RELACIONES');
        log.appendRow(['FECHA', 'TIPO', 'HOJA', 'CLAVE', 'COLUMNA', 'TENIA', 'QUEDO']);
      }
      const ahora = new Date();
      const filas = entradas.map((e) => [ahora, e.tipo, e.hoja, e.clave, e.columna, e.tenia, e.quedo]);
      log.getRange(log.getLastRow() + 1, 1, filas.length, 7).setValues(filas);
    } catch (err) {
      console.error('Relaciones: no se pudo escribir en LOG_RELACIONES (' + entradas.length + ' entradas): ' + err.message);
    }
  }

  /**
   * Propaga a todas las copias los cambios que YA se guardaron en el registro dueño.
   * Nunca truena hacia afuera de más de lo necesario para cada copia: si una hoja falla,
   * las demás se siguen intentando (revisar() corrige lo que se haya quedado a medias).
   *
   * @param {string} origen       'VEHICULOS'
   * @param {Object} filaOrigen   el registro dueño YA actualizado, completo (para poder
   *                              ubicarlo por cualquiera de sus claves — FOLIO o SERIE
   *                              VEHICULO, según a cuál apunte cada copia)
   * @param {Object} cambios      lo que se mandó a actualizar (de aquí se saca qué copiar)
   * @return {Object} { 'NOMBRE HOJA': filasActualizadas, ... } — solo las hojas que sí tenían algo que copiar
   */
  function propagar(origen, filaOrigen, cambios) {
    const definicion = MAPA[origen];
    if (!definicion || !cambios || !filaOrigen) return {};
    const ssId = definicion.spreadsheet();
    const resumen = {};
    const errores = [];

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      definicion.copias.forEach((copia) => {
        const columnasTocadas = Object.keys(cambios).filter((c) => copia.columnas[c] !== undefined);
        if (!columnasTocadas.length) return; // costo cero: esta copia no copia nada de lo que cambió

        const valorClave = filaOrigen[copia.claveOrigen];
        if (!valorClave) return;

        try {
          const hoja = hojaCopia_(copia, ssId);
          const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
          const colClave = columna1_(hoja, copia.clave, encabezados);

          const lastRow = hoja.getLastRow();
          if (lastRow < 2) return;
          const claves = hoja.getRange(2, colClave, lastRow - 1, 1).getValues();
          const filas = [];
          claves.forEach((fila, i) => { if (normalizar_(fila[0]) === normalizar_(valorClave)) filas.push(i + 2); });
          if (!filas.length) return;

          columnasTocadas.forEach((campoOrigen) => {
            const col = columna1_(hoja, copia.columnas[campoOrigen], encabezados);
            const a1 = filas.map((fila) => hoja.getRange(fila, col).getA1Notation());
            hoja.getRangeList(a1).setValue(cambios[campoOrigen] === undefined ? '' : cambios[campoOrigen]);
          });
          resumen[copia.nombre] = filas.length;
        } catch (err) {
          errores.push(copia.nombre + ': ' + err.message);
        }
      });
    } finally {
      lock.releaseLock();
    }

    if (errores.length) {
      // No se revierte lo que sí se guardó (en VEHICULOS o en otras copias) — se avisa,
      // y revisar() lo corrige en la corrida nocturna (ver docs/relaciones.md, "Falla a medias").
      throw new Error('No se pudo propagar a: ' + errores.join(' · '));
    }
    return resumen;
  }

  /**
   * Datos para dar de alta un registro que copia del dueño. Busca el dueño por
   * `valorClave` (folio o serie, según a qué columna apunte esa copia) y regresa las
   * columnas ya traducidas a los nombres de la hoja copia, listas para SheetUtils.insert.
   *
   * @param {string} nombreCopia  el 'nombre' de la copia dentro del MAPA (ej. 'VERIFICACIONES')
   * @param {string} valorClave   folio o serie a buscar en la hoja dueña
   * @return {{datos: Object, origen: Object}} datos ya con la clave propia de la copia puesta
   */
  function datosParaNuevo(nombreCopia, valorClave) {
    const origenNombre = Object.keys(MAPA).find((o) => MAPA[o].copias.some((c) => c.nombre === nombreCopia));
    if (!origenNombre) throw new Error('Relaciones: "' + nombreCopia + '" no está en el MAPA');
    const origenDef = MAPA[origenNombre];
    const copia = origenDef.copias.find((c) => c.nombre === nombreCopia);

    const ssId = origenDef.spreadsheet();
    const encontrado = SheetUtils.findById(ssId, origenDef.hoja, valorClave, copia.claveOrigen);
    if (!encontrado) {
      throw new Error('El ' + copia.claveOrigen + ' "' + valorClave + '" no existe en ' + origenNombre);
    }

    const datos = {};
    datos[copia.clave] = valorClave;
    Object.keys(copia.columnas).forEach((colOrigen) => {
      const valor = encontrado.data[colOrigen];
      datos[copia.columnas[colOrigen]] = valor === undefined || valor === null ? '' : valor;
    });
    return { datos: datos, origen: encontrado.data };
  }

  /**
   * Compara TODAS las copias contra su dueño y reporta (o corrige) diferencias.
   * Pensada para correr sola de noche (Activadores > Agregar activador, function
   * "revisarRelaciones" en SetupInicial.gs) — la primera vez, con corregir:false.
   *
   * @param {{corregir: boolean}} opciones  corregir=false (default) → solo reporta
   * @return {Object} resumen por hoja: { 'NOMBRE': { revisadas, diferencias, huerfanos } }
   */
  function revisar(opciones) {
    const corregir = !!(opciones && opciones.corregir);
    const resultado = {};

    Object.keys(MAPA).forEach((origenNombre) => {
      const origenDef = MAPA[origenNombre];
      const ssId = origenDef.spreadsheet();
      const filasOrigen = SheetUtils.getAll(ssId, origenDef.hoja);

      // Un índice por cada columna-clave de origen distinta que use alguna copia
      // (FOLIO, SERIE VEHICULO…) — y de paso, los valores duplicados en la hoja dueña,
      // que no se corrigen porque no se sabe cuál de los dos es el bueno.
      const clavesOrigen = Array.from(new Set(origenDef.copias.map((c) => c.claveOrigen)));
      const indice = {};
      const duplicados = {};
      clavesOrigen.forEach((clave) => {
        indice[clave] = {};
        duplicados[clave] = {};
        filasOrigen.forEach((fila) => {
          const valor = normalizar_(fila[clave]);
          if (!valor) return;
          if (indice[clave][valor]) duplicados[clave][valor] = true;
          else indice[clave][valor] = fila;
        });
      });

      // Todo lo que hay que loguear se junta aquí y se escribe de UNA sola vez al
      // final (una llamada a setValues, no una por diferencia — ver escribirLog_).
      const entradasLog = [];

      origenDef.copias.forEach((copia) => {
        const hoja = hojaCopia_(copia, ssId);
        const filasCopia = SheetUtils.getAll(ssId, hoja.getName());
        const columnasOrigen = Object.keys(copia.columnas);
        let revisadas = 0, diferencias = 0, huerfanos = 0, duplicadosOmitidos = 0;
        const correcciones = {}; // columna destino → { valorNuevo: [numFila, …] }

        filasCopia.forEach((filaCopia, i) => {
          const claveValor = normalizar_(filaCopia[copia.clave]);
          if (!claveValor) return;
          revisadas++;

          if (duplicados[copia.claveOrigen][claveValor]) {
            duplicadosOmitidos++;
            entradasLog.push({ tipo: 'CLAVE_DUPLICADA_EN_ORIGEN', hoja: hoja.getName(), clave: claveValor, columna: copia.clave, tenia: '', quedo: '' });
            return;
          }
          const filaOrigen = indice[copia.claveOrigen][claveValor];
          if (!filaOrigen) {
            huerfanos++;
            entradasLog.push({ tipo: 'HUERFANO', hoja: hoja.getName(), clave: claveValor, columna: copia.clave, tenia: '', quedo: '' });
            return;
          }

          columnasOrigen.forEach((colOrigen) => {
            const colDestino = copia.columnas[colOrigen];
            const tenia = filaCopia[colDestino];
            const debiaSer = filaOrigen[colOrigen];
            if (mismoValor_(tenia, debiaSer)) return;
            diferencias++;
            entradasLog.push({ tipo: 'DIFERENCIA', hoja: hoja.getName(), clave: claveValor, columna: colDestino, tenia: tenia, quedo: debiaSer });
            if (corregir) {
              correcciones[colDestino] = correcciones[colDestino] || {};
              const valorNuevo = debiaSer === undefined || debiaSer === null ? '' : debiaSer;
              (correcciones[colDestino][valorNuevo] = correcciones[colDestino][valorNuevo] || []).push(i + 2);
            }
          });
        });

        if (corregir && Object.keys(correcciones).length) {
          const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
          Object.keys(correcciones).forEach((colDestino) => {
            const col = columna1_(hoja, colDestino, encabezados);
            Object.keys(correcciones[colDestino]).forEach((valorNuevo) => {
              const a1 = correcciones[colDestino][valorNuevo].map((fila) => hoja.getRange(fila, col).getA1Notation());
              hoja.getRangeList(a1).setValue(valorNuevo);
            });
          });
        }

        resultado[copia.nombre] = {
          revisadas: revisadas, diferencias: diferencias, huerfanos: huerfanos,
          clavesDuplicadasOmitidas: duplicadosOmitidos, corregido: corregir,
        };
      });

      escribirLog_(ssId, entradasLog);
    });

    return resultado;
  }

  /**
   * Cambia la clave (ej. FOLIO) del registro dueño y de TODAS sus copias. Antes de
   * escribir nada, cuenta el impacto — quien llame a esto debe mostrarlo y pedir
   * confirmación ANTES de volver a llamar con `confirmar: true`. Solo debe exponerse
   * a ADMIN (no hace su propia validación de permisos, eso le toca a quien la use).
   *
   * @param {string} origen        'VEHICULOS'
   * @param {string} claveNombre   la claveOrigen a cambiar, ej. 'FOLIO'
   * @param {string} claveVieja
   * @param {string} claveNueva
   * @param {{confirmar: boolean}} opciones  confirmar=false (default): solo cuenta, no escribe
   * @return {Object} { impacto: {'NOMBRE HOJA': filas}, aplicado: boolean }
   */
  function cambiarClave(origen, claveNombre, claveVieja, claveNueva, opciones) {
    const confirmar = !!(opciones && opciones.confirmar);
    const definicion = MAPA[origen];
    if (!definicion) throw new Error('Relaciones: "' + origen + '" no está en el MAPA');
    if (!claveNueva || normalizar_(claveNueva) === normalizar_(claveVieja)) {
      throw new Error('La clave nueva debe ser distinta de la vieja');
    }
    const ssId = definicion.spreadsheet();

    const dueño = SheetUtils.findById(ssId, definicion.hoja, claveVieja, claveNombre);
    if (!dueño) throw new Error('No existe "' + claveVieja + '" en ' + origen + ' (columna ' + claveNombre + ')');
    const yaExiste = SheetUtils.findById(ssId, definicion.hoja, claveNueva, claveNombre);
    if (yaExiste) throw new Error('Ya existe "' + claveNueva + '" en ' + origen + ' — no se puede repetir');

    const impacto = {};
    definicion.copias.filter((c) => c.claveOrigen === claveNombre).forEach((copia) => {
      const hoja = hojaCopia_(copia, ssId);
      const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
      const colClave = columna1_(hoja, copia.clave, encabezados);
      const lastRow = hoja.getLastRow();
      let filas = 0;
      if (lastRow >= 2) {
        hoja.getRange(2, colClave, lastRow - 1, 1).getValues().forEach((f) => {
          if (normalizar_(f[0]) === normalizar_(claveVieja)) filas++;
        });
      }
      if (filas) impacto[copia.nombre] = filas;
    });

    if (!confirmar) return { impacto: impacto, aplicado: false };

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      SheetUtils.update(ssId, definicion.hoja, claveVieja, { [claveNombre]: claveNueva }, claveNombre);
      definicion.copias.filter((c) => c.claveOrigen === claveNombre).forEach((copia) => {
        const hoja = hojaCopia_(copia, ssId);
        const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
        const colClave = columna1_(hoja, copia.clave, encabezados);
        const lastRow = hoja.getLastRow();
        if (lastRow < 2) return;
        const claves = hoja.getRange(2, colClave, lastRow - 1, 1).getValues();
        const filas = [];
        claves.forEach((f, i) => { if (normalizar_(f[0]) === normalizar_(claveVieja)) filas.push(i + 2); });
        if (filas.length) {
          const a1 = filas.map((fila) => hoja.getRange(fila, colClave).getA1Notation());
          hoja.getRangeList(a1).setValue(claveNueva);
        }
      });
    } finally {
      lock.releaseLock();
    }

    return { impacto: impacto, aplicado: true };
  }

  return { propagar, datosParaNuevo, revisar, cambiarClave };
})();

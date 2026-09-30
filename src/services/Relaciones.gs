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
 * LA LLAVE ES LA SERIE (el VIN), no el folio, donde la hoja copia tenga la columna.
 * El folio es un número interno que se puede reasignar; la serie es la identidad física de
 * la unidad. Medido en producción el 30/09/2026, cambiar de folio a serie NO mueve ni una
 * fila a otro vehículo: las dos llaves dan el mismo resultado en las 207 filas de Sensores
 * y las 298 de Inspección. Y la serie es mejor llave: 637 valores únicos de 648 filas,
 * contra los 648 del folio pero sin un solo duplicado en ninguna de las dos.
 *
 * LA PLACA NO SE USA DE LLAVE, aunque parezca natural. En la columna PLACA de VEHICULOS,
 * 227 de 648 celdas no son una placa sino texto de relleno: 'SIN PLACA' x101,
 * 'BAJA VEHICULAR' x84, 'BAJA DE PLACA' x42. Usarla de llave fundiría 101 vehículos
 * distintos en uno solo. Está en CENTINELAS para que tampoco se propague.
 *
 * Dos hojas se quedan con FOLIO porque no tienen de otra, y está anotado en su entrada:
 * VERIFICACIONES no tiene columna de serie, e INCIDENCIAS no tiene ni serie ni placa.
 *
 * A dónde va esto: la llave definitiva es `ID_VEHICULO` (ver docs/ids.md). La serie es el
 * paso intermedio correcto mientras las copias no tengan la columna del ID nuevo.
 *
 * DOS CLASES DE COPIA, y se tratan al revés (`tipo` en cada entrada del MAPA):
 *   - `cache`    — describe el estado de HOY (la instalación del sensor, la tarjeta de
 *                  combustible). Si el dueño cambia, la copia está vieja: se pisa.
 *   - `bitacora` — describe el estado del DÍA DE UN EVENTO fechado (la inspección, la
 *                  incidencia). Si el dueño cambia, la copia NO está vieja: está
 *                  correcta, y pisarla borraría la evidencia. Solo se reporta.
 *   La misma columna (DEPARTAMENTO) se propaga en una y se congela en la otra. No es
 *   una excepción: es la diferencia entre un caché y un libro de registro.
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
  /**
 * `llaveForanea` es la columna que la migración le agregó a cada copia para guardar el ID
 * del dueño. Es el vínculo de VERDAD: `clave` (el folio o la serie) se queda porque hace la
 * hoja legible y porque AppSheet la usa, pero es un dato que la gente puede editar, y el ID
 * no. Antes de esto, la FK solo la llenaba el paso por lotes de la migración, así que existía
 * para los 60,000 renglones viejos y moría para todo lo nuevo.
 */
const MAPA = {
    VEHICULOS: {
      spreadsheet: () => Config.SPREADSHEET_IDS.VEHICULOS(),
      hoja: 'VEHICULOS',
      // La llave con la que la GENTE nombra un vehículo, y la que mandan los formularios.
      // No es lo mismo que `claveOrigen`: esa es la llave de PROPAGACIÓN de cada copia, y
      // en tres de ellas es la serie porque la serie no cambia. datosParaNuevo acepta las
      // dos, más el ID.
      llaveDeNegocio: 'FOLIO',
      copias: [
        {
          nombre: 'INSTALACION DE SENSORES',
          llaveForanea: 'ID VEHICULO',
          // Firma de columnas para ubicar la pestaña real (igual que hacen los Services
          // de cada módulo con SheetUtils.getSheetByColumns). NINGUNA firma incluye "ID" a
          // propósito: después de la migración lo tienen las 24 hojas, así que meterlo haría
          // la huella menos específica, no más. Verificado el 30/09/2026 en producción, el
          // laboratorio y el libro compartido: cada una identifica una sola pestaña.
          firma: ['FOLIO', 'SERIE SENSOR', 'ESTATUS SENSOR'],
          tipo: 'cache',   // describe la instalación de HOY: se pisa sin pensarlo
          claveOrigen: 'SERIE VEHICULO',
          clave: 'SERIE VEHICULO',
          // columna en VEHICULOS → columna en esta hoja (ver SensoresService.COPIADAS_DE_VEHICULO)
          // SERIE VEHICULO ya no está aquí: es la llave. Se cambia con cambiarClave(), no
          // propagando. Y FOLIO sí está, porque dejó de ser llave y pasó a ser un atributo
          // más que hay que mantener al día.
          columnas: {
            'FOLIO': 'FOLIO',
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
          },
        },
        {
          nombre: 'VERIFICACIONES',
          llaveForanea: 'ID VEHICULO',
          firma: ['FOLIO VEHICULO', 'COMPROBANTE VERIFICACION'],
          tipo: 'cache',   // solo copia PLACA, y la placa del vehículo es la de hoy
          // Se queda con FOLIO, y no por descuido: esta hoja NO TIENE columna de serie.
          // Emparejar por PLACA perdería 93 de sus 426 filas (78% de acierto contra 100%),
          // y además la placa no sirve de llave (ver CENTINELAS). Para mover esta hoja a la
          // serie habría que AGREGARLE la columna, y agregar columnas rompe AppSheet hasta
          // que alguien regenere el esquema (ver docs/ids.md).
          claveOrigen: 'FOLIO',
          clave: 'FOLIO VEHICULO',
          columnas: { 'PLACA': 'PLACA' },
        },
        {
          nombre: 'HOLOGRAMAS',
          llaveForanea: 'ID VEHICULO',
          firma: ['CALCOMANIA EOX', 'ESTATUS EOX'],
          tipo: 'cache',   // la tarjeta de combustible describe al vehículo de HOY
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
        {
          // BITÁCORA, no caché. Cada renglón es una inspección con FECHA: su
          // DEPARTAMENTO es el que tenía la unidad EL DÍA que se inspeccionó. Si se
          // propagara, se borraría a qué área se le revisó el carro — y con eso el
          // valor de la inspección como evidencia. Está en el MAPA a propósito, para
          // que revisar() REPORTE la deriva sin tocarla, y para que la próxima persona
          // vea que no se olvidó: se decidió congelarla.
          nombre: 'INSPECCION VEHICULAR',
          llaveForanea: 'ID VEHICULO',
          firma: ['FOLIO', 'PUNTAJE FINAL INSPECCION'],
          tipo: 'bitacora',
          claveOrigen: 'SERIE VEHICULO',
          clave: 'NO SERIE',
          columnas: {
            'DEPARTAMENTO': 'DEPARTAMENTO',
            'SEDE': 'SEDE',
            'UBICACION': 'OFICINA / DESARROLLO',
            'RESPONSABLE VEHICULO': 'RESPONSABLE',
          },
        },
        {
          // BITÁCORA por la misma razón: cada renglón es una incidencia fechada.
          // Se queda con FOLIO porque no tiene NI serie NI placa: es su única llave posible.
          nombre: 'INCIDENCIAS',
          llaveForanea: 'ID VEHICULO',
          firma: ['FOLIO', 'NOMBRE MECANICO', 'KILOMETRAJE'],
          tipo: 'bitacora',
          claveOrigen: 'FOLIO',
          clave: 'FOLIO',
          columnas: {
            'DEPARTAMENTO': 'DEPARTAMENTO',
            'MODELO': 'MODELO',
          },
        },
        // TICKETS NO va aquí, aunque tenga DEPARTAMENTO y PLACA. Su DEPARTAMENTO es el
        // de quien LEVANTÓ el ticket (va pegado a SOLICITANTE), no el del vehículo:
        // medido en producción, 320 de sus filas no coinciden con el catálogo y eso es
        // correcto. Compararla contra VEHICULOS sería comparar dos cosas distintas.
      ],
    },
  };

  /**
   * Valores que VEHICULOS guarda en una columna pero que NO son un dato de esa columna:
   * son estatus o relleno. Propagarlos no corrige nada — PISA el dato bueno que la copia
   * sí tiene.
   *
   * `'*'` vale para CUALQUIER columna, y así tiene que ser: medido en producción el
   * 30/09/2026, 'BAJA VEHICULAR' no está solo en DEPARTAMENTO, también está escrito en
   * PLACA y en RESPONSABLE VEHICULO. Alguien marca la baja de una unidad llenando varias
   * columnas con la palabra. Una versión anterior de esta constante solo cubría
   * DEPARTAMENTO, y con eso la corrida nocturna habría escrito 'BAJA VEHICULAR' encima de
   * 8 placas y 12 responsables de verdad en HOLOGRAMAS, además de 9 departamentos.
   *
   * Ninguno de estos cuatro es una placa, un nombre, un área ni un color válido, en
   * ninguna hoja. Si algún día hace falta un centinela que solo aplique a una columna,
   * se agrega con el nombre de la columna como llave, junto a `'*'`.
   *
   * Lo que NO va aquí: 'OOAM TECNICO' y 'OOAM ADMINISTRATIVO' (25 filas) son
   * departamentos REALES. El catálogo `DEPARTAMENTOS` está desactualizado y no los tiene,
   * y por eso esta lista es fija y no se consulta contra el catálogo: validar contra él
   * rechazaría áreas buenas (confirmado con Ayrton el 30/09/2026).
   */
  const CENTINELAS = {
    '*': ['BAJA VEHICULAR', 'FUERA DE SERVICIO', 'NUCO SIN INFORMACION', 'SIN ESPECIFICAR'],
    // Propios de PLACA, y salieron de medir si la placa servía de llave: no son placas,
    // son texto. 101 + 42 celdas de 648. Aparecen SOLO en esta columna, así que no van
    // en '*' — 'SIN PLACA' en un campo de comentarios sí sería un dato legítimo.
    'PLACA': ['SIN PLACA', 'BAJA DE PLACA'],
  };

  const esBitacora_ = (copia) => copia.tipo === 'bitacora';

  const limpiar_ = (v) => String(v == null ? '' : v);
  const normalizar_ = (v) => limpiar_(v).trim().toUpperCase();

  /** Compara tolerando formato ("1,234.50" == 1234.5) — mismo criterio que HologramasService.mismoValor_ */
  function mismoValor_(a, b) {
    const na = Number(limpiar_(a).replace(/[$,\s]/g, ''));
    const nb = Number(limpiar_(b).replace(/[$,\s]/g, ''));
    if (limpiar_(a).trim() !== '' && limpiar_(b).trim() !== '' && !isNaN(na) && !isNaN(nb)) return na === nb;
    return normalizar_(a) === normalizar_(b);
  }

  /**
   * ¿El dueño trae un centinela en esta columna? (ver CENTINELAS). Un centinela nunca
   * se propaga ni se corrige: escribirlo borraría el dato bueno de la copia.
   */
  function esCentinela_(colOrigen, valor) {
    const v = normalizar_(valor);
    if (!v) return false;
    return (CENTINELAS['*'] || []).indexOf(v) !== -1 ||
           (CENTINELAS[colOrigen] || []).indexOf(v) !== -1;
  }

  /**
   * La corrida nocturna NO vacía una copia que sí tiene dato. Es distinto a propagar():
   *
   *   - En propagar(), el usuario acaba de borrar el campo a propósito. Se respeta.
   *   - En revisar(), nadie pidió nada: es un barrido a ciegas. Un dueño vacío casi
   *     siempre es un dato que falta en el catálogo, no la instrucción de borrar el de
   *     tres módulos. Y si se equivoca, borra en silencio y no hay de dónde recuperarlo;
   *     al revés, deja un valor viejo que se reporta cada noche hasta que alguien lo vea.
   *
   * Esto importa en concreto: en el catálogo hay 116 vehículos de baja a los que les toca
   * quedar con DEPARTAMENTO vacío (la baja ya consta en ESTATUS). Sin esta regla, la
   * primera corrida nocturna después de esa limpieza vaciaría también el área que
   * HOLOGRAMAS e INSTALACION DE SENSORES sí conservan.
   */
  function vaciariaDatoBueno_(tenia, debiaSer) {
    return normalizar_(debiaSer) === '' && normalizar_(tenia) !== '';
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
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      return propagarSinCandado_(origen, filaOrigen, cambios);
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * El cuerpo de propagar(), sin tomar el candado. Existe porque cambiarClave() ya lo
   * tiene tomado cuando necesita propagar, y waitLock() no es reentrante: pedirlo dos
   * veces desde el mismo hilo se cuelga hasta el timeout.
   *
   * SE EXPORTA, aunque sea la version peligrosa, porque el mismo choque aparece desde
   * fuera: ReasignacionesVehicularesService.crear() toma el candado y desde ahi llama a
   * VehiculosService.actualizar(), que propaga. Sin esta salida, esa propagacion esperaba
   * 20 segundos y moria en el catch, en silencio. Quien la llame DEBE tener el candado
   * tomado; si no, usa propagar().
   */
  function propagarSinCandado_(origen, filaOrigen, cambios) {
    const definicion = MAPA[origen];
    if (!definicion || !cambios || !filaOrigen) return {};
    const ssId = definicion.spreadsheet();
    const resumen = {};
    const errores = [];

    {
      definicion.copias.forEach((copia) => {
        // Una bitácora guarda el valor del DÍA DEL EVENTO: propagarle el de hoy
        // reescribiría el pasado. Ver el comentario de cada una en el MAPA.
        if (esBitacora_(copia)) return;

        const columnasTocadas = Object.keys(cambios)
          .filter((c) => copia.columnas[c] !== undefined)
          // Un centinela ('BAJA VEHICULAR' y compañía) no es un dato: no se pisa con él
          // lo que la copia sí tiene bueno.
          .filter((c) => !esCentinela_(c, cambios[c]));
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

          // Aquí sí se escribe un valor vacío si el usuario borró el campo: fue explícito.
          // El barrido nocturno de revisar() es el que no lo hace (ver vaciariaDatoBueno_).
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
   * Acepta el ID del dueño O su llave de negocio, y lo distingue solo con Ids.tieneForma.
   * Eso permite migrar el frontend módulo por módulo sin romper los que todavía manden
   * folio — y sin cambiar la firma de ninguna función api*, que importa más de lo que
   * parece: la clave del caché del cliente es el nombre de la función más sus argumentos,
   * así que cambiar una firma desalinea en silencio las invalidaciones que la nombran.
   *
   * @param {string} nombreCopia  el 'nombre' de la copia dentro del MAPA (ej. 'VERIFICACIONES')
   * @param {string} valorClave   el ID del dueño, o su folio/serie
   * @return {{datos: Object, origen: Object}} datos con la llave foránea, la clave de
   *   negocio y las columnas copiadas — listos para SheetUtils.insert
   */
  function datosParaNuevo(nombreCopia, valorClave) {
    const origenNombre = Object.keys(MAPA).find((o) => MAPA[o].copias.some((c) => c.nombre === nombreCopia));
    if (!origenNombre) throw new Error('Relaciones: "' + nombreCopia + '" no está en el MAPA');
    const origenDef = MAPA[origenNombre];
    const copia = origenDef.copias.find((c) => c.nombre === nombreCopia);

    const ssId = origenDef.spreadsheet();

    // Se acepta, en este orden: el ID del dueño, la llave de propagación de esta copia
    // (serie o folio), y la llave humana del dueño (el folio). La tercera no es un lujo:
    // para Sensores, Hologramas e Inspección la llave de propagación es la SERIE, pero
    // todos los formularios mandan el FOLIO, así que sin ella este camino no serviría
    // hasta que el frontend entero mandara IDs.
    const porId = Ids.tieneForma(valorClave);
    const candidatas = porId
      ? ['ID']
      : [copia.claveOrigen, origenDef.llaveDeNegocio].filter(
          (c, i, arr) => c && arr.indexOf(c) === i);

    let encontrado = null;
    let columnaBusqueda = candidatas[0];
    for (let i = 0; i < candidatas.length && !encontrado; i++) {
      encontrado = SheetUtils.findById(ssId, origenDef.hoja, valorClave, candidatas[i]);
      if (encontrado) columnaBusqueda = candidatas[i];
    }
    if (!encontrado) {
      throw new Error('No existe en ' + origenNombre + ' ningún renglón con "' + valorClave +
        '" en ' + candidatas.join(' ni en '));
    }

    // Aquí SÍ se copia aunque la copia sea una bitácora, y aunque el valor sea un
    // centinela: al dar de alta el registro, el valor de hoy ES el del día del evento.
    // Congelarlo es justo lo que se quiere — lo que no se hace es volver a tocarlo
    // después (ver propagar()).
    const datos = {};

    // La llave foránea: el vínculo de verdad.
    if (copia.llaveForanea) {
      const idDueno = encontrado.data['ID'];
      if (!idDueno) {
        throw new Error(origenNombre + ' no tiene ID en el renglón de "' + valorClave +
          '". Corre el pipeline de IDs sobre este libro antes de dar de alta en ' +
          nombreCopia + '.');
      }
      datos[copia.llaveForanea] = idDueno;
    }

    // Y la clave de negocio, que sale del renglón del DUEÑO y no del valor que nos
    // pasaron. Si no, cuando `valorClave` es un ID acabaríamos escribiendo el ID dentro de
    // la columna del folio.
    const claveDelDueno = encontrado.data[copia.claveOrigen];
    datos[copia.clave] = claveDelDueno === undefined || claveDelDueno === null
      ? (porId ? '' : valorClave)
      : claveDelDueno;

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
        let centinelasOmitidos = 0, historicas = 0, vaciosOmitidos = 0;
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

            // El dueño está vacío y la copia no: no se borra a ciegas (ver vaciariaDatoBueno_).
            if (vaciariaDatoBueno_(tenia, debiaSer)) {
              vaciosOmitidos++;
              entradasLog.push({ tipo: 'OMITIDO_VACIO', hoja: hoja.getName(), clave: claveValor, columna: colDestino, tenia: tenia, quedo: '' });
              return;
            }

            // El dueño trae un estatus o relleno donde debería ir un dato. No se cuenta
            // como diferencia porque no hay nada que corregir: lo que está mal es el
            // catálogo, no la copia. Se loguea para que se vea y se arregle allá.
            if (esCentinela_(colOrigen, debiaSer)) {
              centinelasOmitidos++;
              entradasLog.push({ tipo: 'OMITIDO_CENTINELA', hoja: hoja.getName(), clave: claveValor, columna: colDestino, tenia: tenia, quedo: debiaSer });
              return;
            }

            // En una bitácora la diferencia se REPORTA pero no se toca — con un tipo
            // propio para poder filtrarla en LOG_RELACIONES y no confundirla con deriva
            // que sí hay que arreglar.
            if (esBitacora_(copia)) {
              historicas++;
              entradasLog.push({ tipo: 'DIFERENCIA_HISTORICA', hoja: hoja.getName(), clave: claveValor, columna: colDestino, tenia: tenia, quedo: debiaSer });
              return;
            }

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
          tipo: copia.tipo || 'cache',
          revisadas: revisadas, diferencias: diferencias, huerfanos: huerfanos,
          clavesDuplicadasOmitidas: duplicadosOmitidos,
          centinelasOmitidos: centinelasOmitidos,
          vaciosOmitidos: vaciosOmitidos,
          diferenciasHistoricas: historicas,
          // una bitácora nunca se corrige, aunque se haya pedido corregir
          corregido: corregir && !esBitacora_(copia),
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

      // Desde que la llave es la SERIE, el FOLIO quedó como atributo copiado en hojas que
      // ya NO se emparejan por él (Sensores). Cambiar un folio tiene que actualizarlo ahí
      // también, o esa columna se queda vieja hasta la corrida nocturna. Se hace con la
      // misma ruta que cualquier otro atributo — que además respeta bitácoras y centinelas.
      const llevanLaClaveDeAtributo = definicion.copias.some(
        (c) => c.claveOrigen !== claveNombre && c.columnas[claveNombre] !== undefined);
      if (llevanLaClaveDeAtributo) {
        const dueno = SheetUtils.findById(ssId, definicion.hoja, claveNueva, claveNombre);
        if (dueno) propagarSinCandado_(origen, dueno.data, { [claveNombre]: claveNueva });
      }

      // OJO: aquí NO se excluyen las bitácoras, al contrario de propagar(). Lo que cambia
      // es la CLAVE, no un atributo: si el FOLIO de una inspección vieja no sigue al
      // vehículo, la inspección se vuelve huérfana y se pierde de qué unidad era. La
      // bitácora congela el atributo, no el vínculo.
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

  return {
    propagar, datosParaNuevo, revisar, cambiarClave,
    // Solo para quien ya tiene el candado tomado. Ver su comentario.
    propagarSinCandado: propagarSinCandado_,
  };
})();

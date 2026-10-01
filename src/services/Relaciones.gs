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
    // ------------------------------------------------------------------ CAJA CHICA
    //
    // Las dos copias son BITACORA, y eso no es una suposicion. Medido el 30/09/2026 en el
    // laboratorio, ya con la llave foranea puesta (145/145 y 9/9, cero huerfanas): de las
    // 6 columnas que ARQUEOS copia, cuatro no difieren en NINGUN renglon, PUESTO difiere
    // en 1 y MONTO CAJA en 4. Cinco celdas de 870.
    //
    // Y esas cinco son historia correcta, no deriva: un arqueo es un conteo hecho por una
    // persona, con un puesto y un monto, en una fecha. Las 4 de MONTO CAJA quedaron
    // explicadas una por una con los renglones de INCREMENTOS. Propagar aqui destruiria
    // 5 registros buenos para arreglar 0 problemas, asi que `propagar` las salta y
    // `revisar` las reporta como DIFERENCIA_HISTORICA sin tocarlas.
    //
    // Entonces para que estan aqui, si no se propagan: para que revisar() las vigile. Antes
    // de esto Caja Chica no tenia NINGUNA deteccion de deriva ni de huerfanas, y para que
    // la decision "esto se congela" quede escrita donde la vea el siguiente que lo lea.
    'CAJAS CHICAS': {
      // VEHICULOS(), no CAJACHICA(): las pestanas de Caja Chica viven en el MISMO libro, y
      // es lo que usan sus tres servicios (ArqueosService, CajasChicasService y
      // CambiosMontoCCHService, todos con ssId() -> VEHICULOS()). SS_ID_CAJACHICA esta
      // declarada en Config pero no hay una sola linea que la llame, asi que pedirla aqui
      // hacia que revisar() tronara en cualquier proyecto que no la tuviera puesta -- que
      // es el caso del proyecto DEV del equipo.
      spreadsheet: () => Config.SPREADSHEET_IDS.VEHICULOS(),
      hoja: 'CAJAS CHICAS',
      // 'ID CCH' es el consecutivo 1,2,3 que usa la gente. Es dato de negocio, no un id
      // de AppSheet (ver llaveEsDato en Entidades.gs), asi que conserva su nombre.
      llaveDeNegocio: 'ID CCH',
      copias: [
        {
          nombre: 'ARQUEOS',
          llaveForanea: 'ID CAJA CHICA',
          // Verificada unica en produccion, el laboratorio y el libro compartido el
          // 30/09/2026. Sin 'ID', igual que todas las demas.
          firma: ['ID ARQUEO', 'TOTAL GENERAL'],
          tipo: 'bitacora',
          claveOrigen: 'ID CCH',
          clave: 'ID CCH',
          // Las 6 que ArqueosService.crear copia de la caja al dar de alta el arqueo.
          columnas: {
            'RESPONSABLE DE CAJA CHICA': 'RESPONSABLE',
            'PUESTO DE RESPONSABLE': 'PUESTO',
            'DEPARTAMENTO': 'AREA / DEPARTAMENTO',
            'EMPRESA ORIGEN': 'RAZON SOCIAL',
            'METODO DE REEMBOLSO': 'METODO REEMBOLSO',
            'MONTO ACTUAL': 'MONTO CAJA',
          },
        },
        {
          nombre: 'INCREMENTOS',
          llaveForanea: 'ID CAJA CHICA',
          firma: ['CANTIDAD ANTERIOR', 'CANTIDAD ACTUALIZADA'],
          tipo: 'bitacora',
          claveOrigen: 'ID CCH',
          clave: 'ID CCH',
          // Vacio a proposito: esta hoja NO copia ningun atributo del catalogo. Sus
          // columnas son TIPO, CANTIDAD, CANTIDAD ANTERIOR/ACTUALIZADA, FECHA y QUIEN
          // REALIZO, y todas son del movimiento, no de la caja. Esta en el MAPA para que
          // revisar() detecte sus huerfanas: un incremento que apunta a una caja que ya
          // no existe es un problema real, y hasta hoy nada lo miraba.
          columnas: {},
        },
      ],
    },

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
            'OFICINA / DESARROLLO': 'OFICINA / DESARROLLO',   // en VEHICULOS se llamaba UBICACION (limpieza #23)
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
          // Un holograma puede ser de un vehículo PERSONAL, que por diseño no está en
          // VEHICULOS: esa huérfana es normal y no se avisa como problema. Se distingue de un
          // error de captura por la forma de la serie: un VIN válido (17, sin I/O/Q) sin
          // dueño es personal; '_VR3EC9…', 'IN4AL3…' o '123456789' están mal escritos.
          // Medido el 01/10/2026 en el libro del equipo: 88 personales y 23 mal escritas.
          huerfanaEsperada: { motivo: 'vehículos personales', forma: /^[A-HJ-NPR-Z0-9]{17}$/ },
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
            'OFICINA / DESARROLLO': 'OFICINA / DESARROLLO',
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

    // ------------------------------------------------------------------ LÍNEAS
    //
    // Las tres hijas de LINEAS TELEFONICAS son BITÁCORA: la inspección y la responsiva están
    // fechadas y firmadas, y CAMBIOS LINEAS TELEFONICAS es el log. Medido el 01/10/2026 en
    // el libro del equipo, uniendo por ID LINEA: NUCO e IMEI coinciden al 99%, pero
    // RESPONSABLE, PUESTO o JEFE DIRECTO solo entre 40 y 65% — no es deriva, es que cada
    // documento dice quién tenía la línea ESE día. Por eso nada de esto se sincroniza.
    //
    // El flujo de Líneas va al revés que en Vehículos para los datos de la persona: al
    // guardar una inspección, el bot "ACTUALIZAR DESDE INSPECCION" (LineasCaptura,
    // COPIA_INSPECCION_A_LINEA) copia de la inspección A la línea. La línea queda con lo de
    // la última inspección; las inspecciones conservan lo de su día. Lo hace el módulo de
    // Emmanuel al capturar, no Relaciones.
    //
    // FUERA DEL MAPA, a propósito:
    //   - PIN WHATSAPP, PIN EQUIPO, PATRON y CONTRASEÑA MODEM: son secretos que en Líneas
    //     solo ve ADMIN. En el mapa aparecerían en la tabla "Ver" de Datos conectados.
    //   - COLOR (0% de coincidencia) y ACCESORIOS (3%): se llaman igual que en la línea,
    //     pero no son el mismo dato.
    //
    // Varias columnas son el mismo dato con otro nombre (No TELEFONO = NUMERO TELEFONO,
    // SIM = NUMERO SIM, CORREO = CUENTA GOOGLE, MODELO = EQUIPO): candidatas a homologar,
    // ver la pestaña "Nombres de columnas" de limpiezas-planeadas.xlsx.
    'LINEAS TELEFONICAS': {
      spreadsheet: () => Config.SPREADSHEET_IDS.TELEFONIA(),
      hoja: 'LINEAS TELEFONICAS',
      // NUCO: único en las 1,615 líneas y casi nunca cambia (docs/lineas-homologacion.md)
      llaveDeNegocio: 'NUCO',
      copias: [
        {
          nombre: 'INSPECCIONES LINEAS',
          llaveForanea: 'ID LINEA',
          firma: ['ID LINEA', 'CUBO', 'CABLE'],
          tipo: 'bitacora',
          claveOrigen: 'NUCO',
          clave: 'NUCO',
          columnas: {
            'NUMERO TELEFONO': 'No TELEFONO',
            'NUMERO SIM': 'SIM',
            'EQUIPO': 'MODELO',
            'IMEI': 'IMEI',
            'TIPO': 'TIPO',
            'COMPAÑIA': 'COMPAÑIA',
            'RAZON SOCIAL': 'RAZON SOCIAL',
            'RESPONSABLE': 'RESPONSABLE',
            'PUESTO': 'PUESTO',
            'DEPARTAMENTO': 'DEPARTAMENTO',
            'AREA': 'AREA',
            'SEDE': 'SEDE',
            'OFICINA / DESARROLLO': 'OFICINA / DESARROLLO',
            'JEFE DIRECTO': 'JEFE DIRECTO',
            'CUENTA GOOGLE': 'CORREO',
          },
          nota: 'Al guardar una inspección, la línea toma de ella el responsable, su puesto, área, sede y jefe. ' +
            'La línea queda con lo de la última inspección, y cada inspección conserva lo de su día.',
          // A qué columnas aplica la nota: las que copia el bot (COPIA_INSPECCION_A_LINEA, sin
          // los secretos, que no están en el mapa). Sin esto saldría también en IMEI o Compañía.
          notaColumnas: ['RESPONSABLE', 'DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO', 'PUESTO', 'JEFE DIRECTO', 'CUENTA GOOGLE'],
        },
        {
          nombre: 'RESPONSIVAS LINEAS',
          llaveForanea: 'ID LINEA',
          firma: ['ID LINEA', 'FIRMA RESPONSABLE', 'FORMATO RESPONSIVA'],
          tipo: 'bitacora',
          claveOrigen: 'NUCO',
          clave: 'NUCO',
          columnas: {
            'NUMERO TELEFONO': 'No TELEFONO',
            'NUMERO SIM': 'SIM',
            'EQUIPO': 'MODELO',
            'IMEI': 'IMEI',
            'COMPAÑIA': 'COMPAÑIA',
            'RAZON SOCIAL': 'RAZON SOCIAL',
            'NO EMPLEADO': 'No EMPLEADO',
            'RESPONSABLE': 'RESPONSABLE',
            'PUESTO': 'PUESTO',
            'DEPARTAMENTO': 'DEPARTAMENTO',
            'AREA': 'AREA',
            'SEDE': 'SEDE',
            'OFICINA / DESARROLLO': 'OFICINA / DESARROLLO',
            'DIRECTOR': 'DIRECTOR',
            'CUENTA GOOGLE': 'CORREO',
          },
        },
        {
          nombre: 'CAMBIOS LINEAS TELEFONICAS',
          llaveForanea: 'ID_LINEA',
          firma: ['ID_LINEA', 'CAMPO', 'ANTES', 'DESPUES'],
          tipo: 'bitacora',
          claveOrigen: 'NUCO',
          clave: 'NUCO',
          columnas: {
            'NUCO': 'NUCO',
            'IMEI': 'IMEI',
          },
        },
      ],
    },

    // Los accesorios de Líneas: MOVIMIENTOS_ACCESORIOS no copia ningún dato del artículo
    // (sus columnas son del movimiento). Está aquí, como INCREMENTOS en Caja Chica, para
    // que se vigilen sus movimientos sin artículo: 3 medidos el 01/10/2026.
    'ACCESORIOS CELULARES': {
      spreadsheet: () => Config.SPREADSHEET_IDS.TELEFONIA(),
      hoja: 'ACCESORIOS CELULARES',
      llaveDeNegocio: 'Nombre del Articulo',
      copias: [
        {
          nombre: 'MOVIMIENTOS_ACCESORIOS',
          llaveForanea: 'ID ACCESORIO',
          firma: ['ID_Accesorio', 'Tipo_movimiento', 'Cantidad'],
          tipo: 'bitacora',
          // La llave vieja del artículo se renombró a ID ANTERIOR en el pipeline de IDs; la
          // del movimiento conserva su nombre original.
          claveOrigen: 'ID ANTERIOR',
          clave: 'ID_Accesorio',
          columnas: {},
        },
      ],
    },

    // ----------------------------------------------------- SENSORES → VEHICULOS
    //
    // AL REVÉS que las demás: aquí la dueña es la hoja de sensores y la copia es VEHICULOS.
    // VEHICULOS manda en DEPARTAMENTO, PLACA, etc. (arriba), pero SERIE SENSOR y SENSOR las
    // decide la instalación: es donde se registra, con responsiva, qué sensor tiene cada
    // unidad. Antes nadie escribía de vuelta, y por eso 22 vehículos de producción seguían
    // mostrando la serie de un sensor ya dado de baja (medido el 01/10/2026).
    //
    // Sigue siendo una caché simple, no un resumen: en producción cada vehículo tiene a lo
    // más UN renglón de sensor (208 de 208), así que no hay que escoger entre varios. Si
    // algún día hay dos, revisar() lo reporta como llave repetida y no toca el vehículo.
    // Decisiones de Ayrton (01/10/2026): al dar de baja se vacía la serie, y SENSOR solo
    // vale SI TIENE SENSOR / NO TIENE SENSOR. Ver limpiezas-planeadas.xlsx, #19-#21.
    'INSTALACION DE SENSORES': {
      spreadsheet: () => Config.SPREADSHEET_IDS.VEHICULOS(),
      hoja: 'INSTALACION DE SENSORES',
      // El folio del vehículo, que el renglón del sensor también trae: es lo que la gente
      // reconoce en los reportes, más que la serie del sensor.
      llaveDeNegocio: 'FOLIO',
      copias: [
        {
          // El vínculo va al revés que en las demás: no es la copia la que guarda el ID del
          // dueño, es el dueño (el sensor) el que guarda el ID de la copia (el vehículo).
          nombre: 'VEHICULOS',
          llaveForanea: 'ID',
          campoEnDueno: 'ID VEHICULO',
          // Verificado el 01/10/2026 en producción y en el libro del equipo: solo VEHICULOS
          // tiene las tres. Sensores tiene FOLIO y SERIE SENSOR, pero no SENSOR.
          firma: ['FOLIO', 'SENSOR', 'SERIE SENSOR'],
          tipo: 'cache',
          claveOrigen: 'SERIE VEHICULO',
          clave: 'SERIE VEHICULO',
          columnas: { 'SERIE SENSOR': 'SERIE SENSOR', 'ESTATUS SENSOR': 'SENSOR' },
          // Lo único que no es copia tal cual: las dos dependen del estatus del sensor.
          calcular: {
            'SERIE SENSOR': (s) => (sensorActivo_(s) ? s['SERIE SENSOR'] : ''),
            'SENSOR': (s) => (sensorActivo_(s) ? 'SI TIENE SENSOR' : 'NO TIENE SENSOR'),
          },
          // Un vehículo sin renglón de sensor no es huérfano: simplemente no tiene sensor.
          sinDueno: { 'SERIE SENSOR': '', 'SENSOR': 'NO TIENE SENSOR' },
          // Se muestra tal cual en la pantalla Datos conectados: va en palabras de quien la usa.
          nota: 'Si el vehículo tiene un sensor activo, aquí aparece su serie y dice SI TIENE SENSOR. Si el ' +
            'sensor se dio de baja, o el vehículo nunca tuvo uno, la serie queda vacía y dice NO TIENE SENSOR. ' +
            'Cambia solo al registrar, editar, mover o borrar un sensor; desde Vehículos no se puede editar.',
        },
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

  /**
   * En qué columna del DUEÑO está el valor que la copia guarda en su llave foránea. Casi
   * siempre es su ID; en Sensores → VEHICULOS es el ID del vehículo que trae el sensor.
   */
  const campoEnDueno_ = (copia) => copia.campoEnDueno || 'ID';

  function sensorActivo_(s) {
    return String(s['ESTATUS SENSOR'] == null ? '' : s['ESTATUS SENSOR']).trim().toUpperCase() === 'ACTIVO';
  }

  /** Lo que le toca a la copia en la columna que viene de `colOrigen`. Sin dueño: `sinDueno`. */
  function valorPara_(copia, colOrigen, filaOrigen) {
    const destino = copia.columnas[colOrigen];
    if (!filaOrigen) return copia.sinDueno[destino];
    if (copia.calcular && copia.calcular[destino]) return copia.calcular[destino](filaOrigen);
    return filaOrigen[colOrigen];
  }

  /**
   * Las columnas de `nombreHoja` que manda OTRA hoja (por caché), y su valor cuando no hay
   * dueño. Las usa el servicio de esa hoja para no aceptar ediciones a mano que la siguiente
   * sincronización pisaría — y para que un registro nuevo nazca con su valor de "sin dueño".
   *
   * @return {{columnas: string[], sinDueno: Object}}
   */
  function deOtraHoja(nombreHoja) {
    const columnas = [];
    const sinDueno = {};
    Object.keys(MAPA).forEach((o) => MAPA[o].copias.forEach((c) => {
      if (c.nombre !== nombreHoja || esBitacora_(c)) return;
      Object.keys(c.columnas).forEach((k) => columnas.push(c.columnas[k]));
      Object.assign(sinDueno, c.sinDueno || {});
    }));
    return { columnas: columnas, sinDueno: sinDueno };
  }

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
  /** Como columna1_, pero devuelve 0 en vez de tronar si la columna no existe. */
  function columnaOpcional1_(encabezados, nombre) {
    if (!nombre) return 0;
    const idx = SheetUtils.indiceDeColumnas(encabezados, [nombre])[nombre];
    return idx === -1 ? 0 : idx + 1;
  }

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
  function escribirLog_(ssId, entradasTodas, quien) {
    // Lo NORMAL no va al log: una bitácora de Líneas trae miles de diferencias del día, y
    // anotarlas en cada revisión llenaba LOG_RELACIONES de renglones que no piden nada.
    // El log queda para lo que se corrigió o hay que corregir.
    const entradas = entradasTodas.filter((e) => !esNormal_(e.tipo));
    if (!entradas.length) return;
    try {
      const ss = SpreadsheetApp.openById(ssId);
      let log = ss.getSheetByName('LOG_RELACIONES');
      if (!log) {
        log = ss.insertSheet('LOG_RELACIONES');
        log.appendRow(['FECHA', 'TIPO', 'HOJA', 'CLAVE', 'COLUMNA', 'TENIA', 'QUEDO', 'QUIEN']);
      } else if (!limpiar_(log.getRange(1, 8, 1, 1).getValues()[0][0])) {
        // La pestaña se creó antes de que existiera QUIEN (01/10/2026)
        log.getRange(1, 8).setValue('QUIEN');
      }
      const ahora = new Date();
      // QUIEN va vacío en la corrida nocturna y en lo que se corre desde el editor
      const filas = entradas.map((e) => [ahora, e.tipo, e.hoja, e.clave, e.columna, e.tenia, e.quedo, quien || '']);
      log.getRange(log.getLastRow() + 1, 1, filas.length, 8).setValues(filas);
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
  function propagarSinCandado_(origen, filaOrigen, cambios, opciones) {
    const definicion = MAPA[origen];
    const soltar = !!(opciones && opciones.soltar);
    if (!definicion || !filaOrigen || (!cambios && !soltar)) return {};
    const ssId = definicion.spreadsheet();
    const resumen = {};
    const errores = [];

    {
      definicion.copias.forEach((copia) => {
        // Una bitácora guarda el valor del DÍA DEL EVENTO: propagarle el de hoy
        // reescribiría el pasado. Ver el comentario de cada una en el MAPA.
        if (esBitacora_(copia)) return;

        // Qué se escribe, como [columna en la copia, valor]:
        //   - soltar: el dueño dejó de serlo (se borró, o se fue a otro registro). Su copia
        //     vuelve a los valores de "sin dueño". Solo para copias que los declaran.
        //   - columnas calculadas: si cambió CUALQUIERA de sus columnas origen se recalculan
        //     todas, porque una depende de otra (la serie depende del estatus).
        //   - lo normal: solo las columnas que cambiaron, con su valor tal cual.
        let escribir;
        if (soltar) {
          if (!copia.sinDueno) return;
          escribir = Object.keys(copia.sinDueno).map((c) => [c, copia.sinDueno[c]]);
        } else {
          const columnasTocadas = Object.keys(cambios)
            .filter((c) => copia.columnas[c] !== undefined)
            // Un centinela ('BAJA VEHICULAR' y compañía) no es un dato: no se pisa con él
            // lo que la copia sí tiene bueno.
            .filter((c) => !esCentinela_(c, cambios[c]));
          if (!columnasTocadas.length) return; // costo cero: esta copia no copia nada de lo que cambió
          escribir = copia.calcular
            ? Object.keys(copia.columnas).map((o) => [copia.columnas[o], valorPara_(copia, o, filaOrigen)])
            : columnasTocadas.map((o) => [copia.columnas[o], cambios[o]]);
        }

        // El vínculo de verdad es el ID. La llave de negocio queda como respaldo para las
        // filas que todavía no tienen FK — ver abajo por qué eso no es opcional.
        const idDueno = filaOrigen[campoEnDueno_(copia)];
        const valorClave = filaOrigen[copia.claveOrigen];
        if (!idDueno && !valorClave) return;

        try {
          const hoja = hojaCopia_(copia, ssId);
          const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
          const colClave = columna1_(hoja, copia.clave, encabezados);

          const lastRow = hoja.getLastRow();
          if (lastRow < 2) return;
          const claves = hoja.getRange(2, colClave, lastRow - 1, 1).getValues();

          // La columna de la llave foránea, si esta hoja ya la tiene.
          const colFk = columnaOpcional1_(encabezados, copia.llaveForanea);
          const fks = colFk ? hoja.getRange(2, colFk, lastRow - 1, 1).getValues() : null;

          // Cada fila se empareja por su FK si la tiene, y por la llave de negocio si no.
          //
          // Lo segundo NO es un lujo mientras AppSheet siga vivo: AppSheet escribe en estas
          // mismas hojas y no llena 'ID VEHICULO', así que emparejar solo por ID dejaría de
          // propagarle a todo lo que ellos capturen — en silencio, que es lo peor.
          //
          // Y lo primero es lo que arregla el caso que encontró Ayrton: CON0618 tenía la FK
          // puesta en sus dos hijos, pero su serie estaba vacía en ese momento, así que
          // buscar por serie no encontraba nada y la edición se perdía sin aviso.
          const idNorm = normalizar_(idDueno);
          const claveNorm = normalizar_(valorClave);
          const filas = [];
          let porFk = 0;
          let porClave = 0;
          claves.forEach((fila, i) => {
            const fk = fks ? normalizar_(fks[i][0]) : '';
            if (fk) {
              if (idNorm && fk === idNorm) { filas.push(i + 2); porFk++; }
              return;   // tiene FK y no es de este dueño: su llave de negocio no manda
            }
            if (claveNorm && normalizar_(fila[0]) === claveNorm) { filas.push(i + 2); porClave++; }
          });
          if (!filas.length) return;

          // Aquí sí se escribe un valor vacío si el usuario borró el campo: fue explícito.
          // El barrido nocturno de revisar() es el que no lo hace (ver vaciariaDatoBueno_).
          escribir.forEach(([columna, valor]) => {
            const col = columna1_(hoja, columna, encabezados);
            const a1 = filas.map((fila) => hoja.getRange(fila, col).getA1Notation());
            hoja.getRangeList(a1).setValue(valor === undefined || valor === null ? '' : valor);
          });
          resumen[copia.nombre] = filas.length;
          if (porClave) {
            // Vale la pena saberlo: son filas sin FK, y las que la app crea ya nacen con
            // ella. Casi siempre significa "las capturó AppSheet".
            console.log('Relaciones: ' + copia.nombre + ' — ' + porFk + ' fila(s) por ID y ' +
              porClave + ' por ' + copia.clave + ' (sin ' + copia.llaveForanea + ')');
          }
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
   * El registro dueño DEJÓ de serlo: se borró, o se movió a otro registro (un sensor que
   * cambia de vehículo). Su copia vuelve a los valores de `sinDueno` — sin esto, VEHICULOS
   * seguiría diciendo que tiene el sensor que ya se fue. Solo toca copias que declaran
   * `sinDueno`; en las demás, quedarse sin dueño es una huérfana y se reporta, no se borra.
   *
   * @param {Object} filaOrigen  el registro como estaba ANTES (para encontrar su copia)
   */
  function soltar(origen, filaOrigen) {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      return propagarSinCandado_(origen, filaOrigen, null, { soltar: true });
    } finally {
      lock.releaseLock();
    }
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
   * "revisarRelaciones" en SetupInicial.gs) — la primera vez, con corregir:false. También
   * la usa la pantalla de Administración > Relaciones.
   *
   * CADA FILA SE EMPAREJA IGUAL QUE EN propagar(): por su llave foránea si la tiene, y por
   * la llave de negocio solo si no. Antes emparejaba SOLO por la llave de negocio, y con
   * corregir:true eso era peligroso: una fila con la FK de un vehículo y la serie de otro
   * (o con la serie vacía, el caso CON0618) recibía los datos del vehículo equivocado, o se
   * reportaba huérfana teniendo dueño. Una FK que no apunta a nada es huérfana: su llave de
   * negocio no manda, igual que en propagar().
   *
   * @param {Object} opciones
   *   corregir  false (default) → solo reporta. true → pisa las diferencias de las CACHÉS
   *   hojas     opcional, nombres de copia a revisar (default: todas)
   *   log       default true → escribe LOG_RELACIONES. La pantalla lo apaga al solo revisar,
   *             para que mirar no llene la bitácora; al corregir siempre se escribe.
   *   detalle   true → regresa también la lista de entradas (hasta DETALLE_MAX)
   *   filas     opcional, renglones de la hoja copia: al corregir, solo esos se tocan
   *   quien     opcional, quién pidió la corrección; va a la columna QUIEN de LOG_RELACIONES
   * @return {Object} resumen por hoja: { 'NOMBRE': { revisadas, diferencias, huerfanos, … } }
   *   y, con detalle, la propiedad no enumerable `entradas` del objeto de cada hoja.
   */
  function revisar(opciones) {
    const o = opciones || {};
    const corregir = !!o.corregir;
    const conLog = corregir || o.log !== false;
    const soloHojas = Array.isArray(o.hojas) && o.hojas.length ? o.hojas.map(normalizar_) : null;
    // Solo estos renglones de la hoja copia se corrigen ("Actualizar seleccionados"); el
    // reporte sigue contando todo, para que la pantalla vea lo que falta.
    const soloFilas = Array.isArray(o.filas) && o.filas.length ? o.filas.map(Number) : null;
    const quien = limpiar_(o.quien);
    if (!corregir) return revisarSinCandado_(corregir, conLog, soloHojas, !!o.detalle, soloFilas, quien);

    // Al corregir se escribe sobre las mismas filas que propagar(): mismo candado, para
    // que un vehículo editado a la mitad del barrido no quede pisado con su valor viejo.
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      return revisarSinCandado_(corregir, conLog, soloHojas, !!o.detalle, soloFilas, quien);
    } finally {
      lock.releaseLock();
    }
  }

  /** Cuántas entradas regresa revisar({detalle}) por hoja: lo que una tabla aguanta sin trabarse. */
  const DETALLE_MAX = 3000;
  /**
   * De lo NORMAL (diferencias de bitácora, huérfanas esperadas) basta una muestra: una
   * inspección de Líneas puede traer miles, y mandarlas todas solo para decir "esto está
   * bien" hacía lenta la pantalla. La cifra total va en el resumen de cada hoja.
   */
  const DETALLE_MAX_NORMAL = 300;
  const esNormal_ = (tipo) => tipo === 'DIFERENCIA_HISTORICA' || tipo === 'SIN_DUENO_ESPERADO';

  /** El resultado de una copia que no se pudo revisar: en ceros, con el motivo en `error`. */
  function sinRevisar_(copia, motivo, conDetalle) {
    const r = {
      tipo: copia.tipo || 'cache', error: motivo,
      revisadas: 0, diferencias: 0, huerfanos: 0, clavesDuplicadasOmitidas: 0, centinelasOmitidos: 0,
      vaciosOmitidos: 0, diferenciasHistoricas: 0, sinDuenoEsperado: 0, emparejadasPorId: 0,
      emparejadasPorClave: 0, corregido: false,
    };
    if (conDetalle) Object.defineProperty(r, 'entradas', { value: [] });
    return r;
  }

  function revisarSinCandado_(corregir, conLog, soloHojas, conDetalle, soloFilas, quien) {
    const resultado = {};

    Object.keys(MAPA).forEach((origenNombre) => {
      const origenDef = MAPA[origenNombre];
      const copias = origenDef.copias.filter((c) => !soloHojas || soloHojas.indexOf(normalizar_(c.nombre)) !== -1);
      if (!copias.length) return;
      // Un libro que no está configurado (SS_ID_TELEFONIA en un proyecto sin Líneas) o una
      // hoja que falta NO tumba la revisión de las demás familias: se reporta y se sigue.
      let ssId, filasOrigen;
      try {
        ssId = origenDef.spreadsheet();
        filasOrigen = SheetUtils.getAll(ssId, origenDef.hoja);
      } catch (err) {
        copias.forEach((c) => { resultado[c.nombre] = sinRevisar_(c, origenDef.hoja + ': ' + err.message, conDetalle); });
        return;
      }

      // Un índice por cada columna-clave de origen distinta que use alguna copia
      // (FOLIO, SERIE VEHICULO…), más el ID para las FK — y de paso, los valores
      // duplicados en la hoja dueña, que no se corrigen porque no se sabe cuál es el bueno.
      const clavesOrigen = Array.from(new Set(copias.map((c) => c.claveOrigen).concat(copias.map(campoEnDueno_))));
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

      copias.forEach((copia) => {
        let hoja, filasCopia;
        try {
          hoja = hojaCopia_(copia, ssId);
          filasCopia = SheetUtils.getAll(ssId, hoja.getName());
        } catch (err) {
          resultado[copia.nombre] = sinRevisar_(copia, err.message, conDetalle);
          return;
        }
        const columnasOrigen = Object.keys(copia.columnas);
        const tieneFk = !!(copia.llaveForanea && filasCopia.length &&
          Object.prototype.hasOwnProperty.call(filasCopia[0], copia.llaveForanea));
        let revisadas = 0, diferencias = 0, huerfanos = 0, duplicadosOmitidos = 0;
        let centinelasOmitidos = 0, historicas = 0, vaciosOmitidos = 0, porFk = 0, porClave = 0, sinDuenoEsperado = 0;
        const correcciones = {}; // columna destino → { valorNuevo: [numFila, …] }
        const entradas = [];
        let normalesEnDetalle = 0;
        const anotar = (e) => {
          entradasLog.push(e);
          if (!conDetalle || entradas.length >= DETALLE_MAX) return;
          if (esNormal_(e.tipo) && normalesEnDetalle++ >= DETALLE_MAX_NORMAL) return;
          entradas.push(e);
        };

        filasCopia.forEach((filaCopia, i) => {
          const fila = i + 2;
          const claveValor = normalizar_(filaCopia[copia.clave]);
          const fk = tieneFk ? normalizar_(filaCopia[copia.llaveForanea]) : '';
          if (!claveValor && !fk) return;
          revisadas++;
          // dueno: con qué nombre la gente reconoce el registro. Mientras no se encuentre al
          // dueño, el de la propia fila si lo trae (el folio de un vehículo); así un aviso de
          // llave repetida dice «AUT0025» y no «VEH-0000…».
          const base = { hoja: hoja.getName(), fila: fila, clave: claveValor || fk, dueno: limpiar_(filaCopia[origenDef.llaveDeNegocio]) };

          const campoDueno = campoEnDueno_(copia);
          // Por la llave de negocio, sin adivinar entre dos dueños con la misma. Si `soloSinFk`,
          // solo vale un dueño que NO trae el vínculo: uno que sí lo trae es de otro registro.
          const porLaClave = (soloSinFk) => {
            if (!claveValor) return null;
            if (duplicados[copia.claveOrigen][claveValor]) return 'DUPLICADA';
            const f = indice[copia.claveOrigen][claveValor];
            return f && (!soloSinFk || !normalizar_(f[campoDueno])) ? f : null;
          };
          const duplicada = (columna) => {
            duplicadosOmitidos++;
            anotar(Object.assign({ tipo: 'CLAVE_DUPLICADA_EN_ORIGEN', columna: columna, tenia: '', quedo: '' }, base));
          };

          let filaOrigen = null;
          if (fk) {
            if (duplicados[campoDueno][fk]) return duplicada(copia.llaveForanea);
            filaOrigen = indice[campoDueno][fk] || null;
            if (filaOrigen) porFk++;
            else if (copia.sinDueno) {
              // Un dueño capturado por AppSheet no trae el vínculo: se busca por la llave de
              // negocio, pero solo entre los dueños que tampoco lo traen. Solo en las copias
              // con `sinDueno`: en las demás, una FK que no apunta a nada es huérfana y su
              // llave de negocio no manda (igual que en propagar).
              const f = porLaClave(true);
              if (f === 'DUPLICADA') return duplicada(copia.clave);
              if (f) { filaOrigen = f; porClave++; }
            }
          } else {
            const f = porLaClave(false);
            if (f === 'DUPLICADA') return duplicada(copia.clave);
            if (f) { filaOrigen = f; porClave++; }
          }
          // Sin dueño: en casi todas las copias es una huérfana y se reporta. En las que
          // declaran `sinDueno` (un vehículo sin sensor) es normal y se compara contra eso.
          // Una huérfana esperada (el holograma de un vehículo personal) no es un problema. Solo
          // aplica cuando NO trae FK: una FK que no apunta a nada siempre es un error.
          const esperada = copia.huerfanaEsperada;
          if (!filaOrigen && !copia.sinDueno && !fk && esperada) {
            if (esperada.forma.test(claveValor)) {
              sinDuenoEsperado++;
              anotar(Object.assign({ tipo: 'SIN_DUENO_ESPERADO', columna: copia.clave, tenia: '', quedo: '' }, base));
              return;
            }
            huerfanos++;
            anotar(Object.assign({ tipo: 'HUERFANO', malEscrita: true, columna: copia.clave, tenia: '', quedo: '' }, base));
            return;
          }
          if (!filaOrigen && !copia.sinDueno) {
            huerfanos++;
            anotar(Object.assign(fk
              ? { tipo: 'HUERFANO', columna: copia.llaveForanea, tenia: fk, quedo: '' }
              : { tipo: 'HUERFANO', columna: copia.clave, tenia: '', quedo: '' }, base));
            return;
          }
          // Con qué nombre la gente reconoce al dueño (el folio), aunque se haya emparejado por ID
          base.dueno = filaOrigen
            ? limpiar_(filaOrigen[origenDef.llaveDeNegocio]) || limpiar_(filaOrigen.ID)
            : limpiar_(filaCopia[origenDef.llaveDeNegocio]) || base.clave;

          columnasOrigen.forEach((colOrigen) => {
            const colDestino = copia.columnas[colOrigen];
            const tenia = filaCopia[colDestino];
            const debiaSer = valorPara_(copia, colOrigen, filaOrigen);
            if (mismoValor_(tenia, debiaSer)) return;
            const e = Object.assign({ columna: colDestino, tenia: tenia }, base);
            // Un vacío calculado o de "sin dueño" es la respuesta, no un dato que falta: la
            // serie de un sensor en BAJA SE VACÍA (decisión del 01/10/2026).
            const vacioEsRespuesta = !filaOrigen || !!(copia.calcular && copia.calcular[colDestino]);

            // En una bitácora la diferencia se REPORTA pero no se toca — con un tipo
            // propio para poder filtrarla en LOG_RELACIONES y no confundirla con deriva
            // que sí hay que arreglar. Va PRIMERO: como una bitácora nunca se corrige, no
            // tiene caso avisar que su dueño trae un relleno o un vacío (antes salía
            // "Inspección conserva «» y no se tocó", que no le dice nada a nadie).
            if (esBitacora_(copia)) {
              historicas++;
              anotar(Object.assign(e, { tipo: 'DIFERENCIA_HISTORICA', quedo: debiaSer }));
              return;
            }

            // El dueño está vacío y la copia no: no se borra a ciegas (ver vaciariaDatoBueno_).
            if (!vacioEsRespuesta && vaciariaDatoBueno_(tenia, debiaSer)) {
              vaciosOmitidos++;
              anotar(Object.assign(e, { tipo: 'OMITIDO_VACIO', quedo: '' }));
              return;
            }

            // El dueño trae un estatus o relleno donde debería ir un dato. No se cuenta
            // como diferencia porque no hay nada que corregir: lo que está mal es el
            // catálogo, no la copia. Se loguea para que se vea y se arregle allá.
            if (esCentinela_(colOrigen, debiaSer)) {
              centinelasOmitidos++;
              anotar(Object.assign(e, { tipo: 'OMITIDO_CENTINELA', quedo: debiaSer }));
              return;
            }

            diferencias++;
            anotar(Object.assign(e, { tipo: 'DIFERENCIA', quedo: debiaSer }));
            if (corregir && (!soloFilas || soloFilas.indexOf(fila) !== -1)) {
              correcciones[colDestino] = correcciones[colDestino] || {};
              const valorNuevo = debiaSer === undefined || debiaSer === null ? '' : debiaSer;
              (correcciones[colDestino][valorNuevo] = correcciones[colDestino][valorNuevo] || []).push(fila);
            }
          });
        });

        if (corregir && Object.keys(correcciones).length) {
          const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
          Object.keys(correcciones).forEach((colDestino) => {
            const col = columna1_(hoja, colDestino, encabezados);
            Object.keys(correcciones[colDestino]).forEach((valorNuevo) => {
              const a1 = correcciones[colDestino][valorNuevo].map((f) => hoja.getRange(f, col).getA1Notation());
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
          sinDuenoEsperado: sinDuenoEsperado,
          emparejadasPorId: porFk,
          emparejadasPorClave: porClave,
          // una bitácora nunca se corrige, aunque se haya pedido corregir
          corregido: corregir && !esBitacora_(copia),
        };
        // No enumerable: así los reportes del editor, que recorren el objeto, no la imprimen
        if (conDetalle) Object.defineProperty(resultado[copia.nombre], 'entradas', { value: entradas });
      });

      // Al corregir solo unos renglones, el log anota solo los que sí se tocaron
      const aLog = corregir && soloFilas
        ? entradasLog.filter((e) => e.tipo !== 'DIFERENCIA' || soloFilas.indexOf(e.fila) !== -1)
        : entradasLog;
      if (conLog) escribirLog_(ssId, aLog, corregir ? quien : '');
    });

    return resultado;
  }

  /**
   * El MAPA en forma de datos, para pintarlo en pantalla: quién es dueño de qué columna y
   * a dónde se copia. Se arma del MAPA mismo, así que no se puede desactualizar.
   */
  /**
   * Cómo se llama cada hoja para quien NO programa: el nombre del módulo en el menú, y cómo
   * se dice uno y varios de sus registros, y a qué familia pertenece (una pestaña por familia). La pantalla "Datos conectados" arma sus frases
   * con esto ("63 vehículos tienen datos distintos a Instalación de Sensores"). Vive junto
   * al MAPA para que una hoja nueva en el MAPA no se quede sin nombre legible; si falta,
   * describir() regresa el nombre de la pestaña tal cual.
   */
  const ETIQUETAS = {
    'VEHICULOS': { modulo: 'Vehículos', uno: 'vehículo', varios: 'vehículos', familia: 'Vehículos' },
    'INSTALACION DE SENSORES': { modulo: 'Instalación de Sensores', uno: 'sensor', varios: 'sensores', familia: 'Vehículos' },
    'VERIFICACIONES': { modulo: 'Verificaciones', uno: 'verificación', varios: 'verificaciones', familia: 'Vehículos' },
    'HOLOGRAMAS': { modulo: 'Hologramas', uno: 'holograma', varios: 'hologramas', familia: 'Vehículos' },
    'INSPECCION VEHICULAR': { modulo: 'Inspección Vehicular', uno: 'inspección', varios: 'inspecciones', familia: 'Vehículos' },
    'INCIDENCIAS': { modulo: 'Incidencias', uno: 'incidencia', varios: 'incidencias', familia: 'Vehículos' },
    'CAJAS CHICAS': { modulo: 'Caja Chica', uno: 'caja chica', varios: 'cajas chicas', familia: 'Caja Chica' },
    'ARQUEOS': { modulo: 'Arqueos', uno: 'arqueo', varios: 'arqueos', familia: 'Caja Chica' },
    'INCREMENTOS': { modulo: 'Cambios de Monto', uno: 'cambio de monto', varios: 'cambios de monto', familia: 'Caja Chica' },
    'LINEAS TELEFONICAS': { modulo: 'Líneas Telefónicas', uno: 'línea', varios: 'líneas', familia: 'Líneas' },
    'INSPECCIONES LINEAS': { modulo: 'Inspecciones de Líneas', uno: 'inspección', varios: 'inspecciones', familia: 'Líneas' },
    'RESPONSIVAS LINEAS': { modulo: 'Responsivas de Líneas', uno: 'responsiva', varios: 'responsivas', familia: 'Líneas' },
    'CAMBIOS LINEAS TELEFONICAS': { modulo: 'Control de Cambios - Líneas', uno: 'cambio', varios: 'cambios', familia: 'Líneas' },
    'ACCESORIOS CELULARES': { modulo: 'Inventario de Accesorios (Líneas)', uno: 'artículo', varios: 'artículos', familia: 'Líneas' },
    'MOVIMIENTOS_ACCESORIOS': { modulo: 'Movimientos de Accesorios', uno: 'movimiento', varios: 'movimientos', familia: 'Líneas' },
  };
  // La clave es 'modulo' y no 'nombre' a propósito: tests/llave-nueva.test.js reconoce las
  // copias del MAPA por cómo se escribe su nombre en el código, y estas no son copias.
  const etiqueta_ = (hoja) => {
    const e = ETIQUETAS[hoja];
    return e
      ? { nombre: e.modulo, uno: e.uno, varios: e.varios, familia: e.familia }
      : { nombre: hoja, uno: 'registro', varios: 'registros', familia: 'Otros' };
  };

  function describir() {
    return {
      duenos: Object.keys(MAPA).map((nombre) => {
        const d = MAPA[nombre];
        return {
          hoja: d.hoja,
          etiqueta: etiqueta_(d.hoja),
          llaveDeNegocio: d.llaveDeNegocio,
          copias: d.copias.map((c) => ({
            nombre: c.nombre,
            etiqueta: etiqueta_(c.nombre),
            tipo: c.tipo || 'cache',
            llaveForanea: c.llaveForanea || '',
            claveOrigen: c.claveOrigen,
            clave: c.clave,
            columnas: Object.keys(c.columnas).map((k) => ({
              origen: k, destino: c.columnas[k], calculada: !!(c.calcular && c.calcular[c.columnas[k]]),
            })),
            campoEnDueno: campoEnDueno_(c),
            sinDueno: c.sinDueno || null,
            nota: c.nota || '',
            notaColumnas: c.notaColumnas || null,
            huerfanaEsperada: c.huerfanaEsperada ? c.huerfanaEsperada.motivo : '',
          })),
        };
      }),
      centinelas: JSON.parse(JSON.stringify(CENTINELAS)),
    };
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
    propagar, soltar, datosParaNuevo, revisar, cambiarClave, describir, deOtraHoja,
    // Solo para quien ya tiene el candado tomado. Ver su comentario.
    propagarSinCandado: propagarSinCandado_,
  };
})();

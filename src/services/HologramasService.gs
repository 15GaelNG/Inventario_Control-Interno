/**
 * HologramasService.gs
 * Hologramas / tarjetas de combustible: una fila por unidad autorizada a cargar.
 *
 * Hoja real "HOLOGRAMAS" (misma estructura que producción/AppSheet):
 *   ID_HOLOGRAMA | SERIE VEHICULO | PROVEEDOR | RAZON SOCIAL | PLACA | NO ECONOMICO |
 *   MARCA | LINEA VEHICULO | MODELO | ESTATUS EOX | ESTATUS VEHICULO | FECHA DE REGISTRO |
 *   FECHA ULTIMA MODIFICACION | TIPO COMBUSTIBLE | CAPACIDAD DEL TANQUE | RESPONSABLE |
 *   AUTORIZADO EN PESOS | AUTORIZADO EN LITROS | CALCOMANIA EOX | SOLICITUD | DEPARTAMENTO |
 *   RESUMEN_VISUAL_HOLOGRAMAS
 *
 * Diferencias con los demás módulos (medidas contra producción, 255 filas):
 * - **No todos los vehículos están en el catálogo**: 111 de 255 no cruzan con VEHICULOS y
 *   97 de esos están marcados como PERSONAL — son autos de empleados con permiso de carga.
 *   Por eso el folio NO es obligatorio: si no está en el catálogo, se captura todo a mano.
 * - **VEHICULOS manda**: los ejecutivos lo mantienen al día casi en tiempo real, así que
 *   cuando la serie existe en el catálogo, los datos del vehículo se leen de ahí (no de
 *   esta hoja) y las diferencias se marcan como "desactualizado". `sincronizar()` escribe
 *   los valores del catálogo en la hoja, para que AppSheet también los vea corregidos.
 *   Solo los hologramas SIN vehículo en el catálogo guardan sus datos como captura propia.
 * - `TIPO COMBUSTIBLE` es el producto autorizado en la tarjeta (MAGNA/PREMIUM/…), no el
 *   tipo del vehículo; `RAZON SOCIAL` es la empresa del contrato (3 posibles).
 * - `SOLICITUD` puede ser PDF (carpeta *_Files_) o imagen (carpeta *_Images).
 * - `NO ECONOMICO` en esta hoja trae la placa (así está en 210 de 239 filas históricas);
 *   se escribe igual para no romper lo que ya lee AppSheet, pero no se muestra en la app.
 * - `RESUMEN_VISUAL_HOLOGRAMAS` la llenan a mano fuera del sistema: no se toca.
 */

const HologramasService = (function () {
  const TABLA = 'HOLOGRAMAS';
  const COL_SOLICITUD = 'SOLICITUD';
  const COLUMNAS_CLAVE = ['ID_HOLOGRAMA', 'CALCOMANIA EOX', 'ESTATUS EOX'];

  const PROVEEDORES = ['EOX', 'EDENRED', 'N/A'];
  const ESTATUS_EOX = ['HABILITADO', 'DESHABILITADO'];
  const ESTATUS_VEHICULO = ['UTILITARIO', 'PERSONAL'];
  const COMBUSTIBLES = ['MAGNA', 'PREMIUM', 'DIESEL', 'GASOLINA', 'TODOS LOS PRODUCTOS'];
  const RAZONES_SOCIALES = [
    'CENTRO INMOBILIARIO DEL BAJIO SA DE CV',
    'FRACCIONADORA LA ROMITA SA DE CV',
    'VALLE DE LOS MEZQUITES SA DE CV',
  ];

  /** Campo de la app → columna de la hoja (los datos del vehículo se capturan aquí) */
  const CAMPOS = {
    SERIE_VEHICULO: 'SERIE VEHICULO',
    PROVEEDOR: 'PROVEEDOR',
    RAZON_SOCIAL: 'RAZON SOCIAL',
    PLACA: 'PLACA',
    MARCA: 'MARCA',
    LINEA: 'LINEA VEHICULO',
    MODELO: 'MODELO',
    ESTATUS_EOX: 'ESTATUS EOX',
    ESTATUS_VEHICULO: 'ESTATUS VEHICULO',
    COMBUSTIBLE: 'TIPO COMBUSTIBLE',
    CAPACIDAD: 'CAPACIDAD DEL TANQUE',
    RESPONSABLE: 'RESPONSABLE',
    AUTORIZADO_PESOS: 'AUTORIZADO EN PESOS',
    AUTORIZADO_LITROS: 'AUTORIZADO EN LITROS',
    CALCOMANIA: 'CALCOMANIA EOX',
    DEPARTAMENTO: 'DEPARTAMENTO',
  };
  const OBLIGATORIOS = ['SERIE_VEHICULO', 'PROVEEDOR', 'RAZON_SOCIAL', 'PLACA', 'MARCA', 'LINEA',
    'MODELO', 'ESTATUS_EOX', 'ESTATUS_VEHICULO', 'COMBUSTIBLE', 'CAPACIDAD', 'RESPONSABLE',
    'AUTORIZADO_PESOS', 'AUTORIZADO_LITROS', 'CALCOMANIA'];
  const LISTAS = {
    PROVEEDOR: PROVEEDORES,
    RAZON_SOCIAL: RAZONES_SOCIALES,
    ESTATUS_EOX: ESTATUS_EOX,
    ESTATUS_VEHICULO: ESTATUS_VEHICULO,
    COMBUSTIBLE: COMBUSTIBLES,
  };
  const NUMEROS = ['CAPACIDAD', 'AUTORIZADO_PESOS', 'AUTORIZADO_LITROS'];

  /**
   * Datos que manda VEHICULOS cuando la unidad está en el catálogo: campo de la app →
   * columna de VEHICULOS. Aquí NO va TIPO COMBUSTIBLE (en esta hoja es el producto de la
   * tarjeta) ni RAZON SOCIAL (es la empresa del contrato, no la del vehículo).
   * TEMPORAL: esto se mueve a Relaciones.gs cuando exista (ver docs/relaciones.md).
   */
  const DEL_CATALOGO = {
    PLACA: 'PLACA',
    MARCA: 'MARCA',
    LINEA: 'LINEA VEHICULO',
    MODELO: 'MODELO',
    RESPONSABLE: 'RESPONSABLE VEHICULO',
    DEPARTAMENTO: 'DEPARTAMENTO',
    CAPACIDAD: 'CAPACIDAD COMBUSTIBLE (LTS)',
  };

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }
  function hoja_() {
    return SheetUtils.getSheetByColumns(ssId(), COLUMNAS_CLAVE);
  }

  const limpiar_ = (v) => String(v == null ? '' : v).trim();
  const enMayusculas_ = (v) => limpiar_(v).toUpperCase();

  /** Fechas de la hoja → texto ISO (igual que en los demás servicios) */
  function fechaISO_(valor) {
    if (!valor) return '';
    if (valor instanceof Date) return isNaN(valor.getTime()) ? '' : valor.toISOString();
    const m = String(valor).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return '';
    const f = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(f.getTime()) ? '' : f.toISOString();
  }

  function numero_(valor, nombreCampo, obligatorio) {
    const texto = limpiar_(valor).replace(/[$,\s]/g, '');
    if (texto === '') {
      if (obligatorio) throw new Error('Falta ' + nombreCampo);
      return '';
    }
    const n = Number(texto);
    if (isNaN(n) || n < 0) throw new Error('El campo "' + nombreCampo + '" debe ser un número mayor o igual a cero');
    return n;
  }

  function desdeOriginal_(row) {
    const fila = { ID: row['ID_HOLOGRAMA'] };
    Object.keys(CAMPOS).forEach((campo) => {
      const valor = row[CAMPOS[campo]];
      fila[campo] = valor === undefined || valor === null ? '' : valor;
    });
    fila.SOLICITUD = row[COL_SOLICITUD] || '';
    fila.FECHA_REGISTRO = fechaISO_(row['FECHA DE REGISTRO']);
    fila.FECHA_MODIFICACION = fechaISO_(row['FECHA ULTIMA MODIFICACION']);
    return fila;
  }

  /** Valida un valor contra su catálogo o su tipo; regresa el valor ya normalizado */
  function valorValido_(campo, valor, obligatorio) {
    if (LISTAS[campo]) {
      const v = enMayusculas_(valor);
      if (!v && !obligatorio) return '';
      if (LISTAS[campo].indexOf(v) === -1) {
        throw new Error('El campo "' + campo + '" debe ser uno de: ' + LISTAS[campo].join(', '));
      }
      return v;
    }
    if (NUMEROS.indexOf(campo) !== -1) return numero_(valor, campo, obligatorio);
    const v = campo === 'RESPONSABLE' ? limpiar_(valor) : enMayusculas_(valor);
    if (!v && obligatorio) throw new Error('Falta el campo "' + campo + '"');
    return v;
  }

  /** Índice de VEHICULOS por serie (la llave real con esta hoja) */
  function catalogoPorSerie_() {
    const indice = {};
    SheetUtils.getAll(ssId(), 'VEHICULOS').forEach((v) => {
      const serie = enMayusculas_(v['SERIE VEHICULO']);
      if (serie && !indice[serie]) indice[serie] = v;
    });
    return indice;
  }

  const mismoValor_ = (a, b) => {
    const na = Number(String(a).replace(/[$,\s]/g, ''));
    const nb = Number(String(b).replace(/[$,\s]/g, ''));
    if (limpiar_(a) !== '' && limpiar_(b) !== '' && !isNaN(na) && !isNaN(nb)) return na === nb;
    return enMayusculas_(a) === enMayusculas_(b);
  };

  /**
   * Aplica el catálogo a una fila: si la unidad existe en VEHICULOS, esos datos ganan y
   * se listan los campos que en la hoja quedaron viejos (para poder sincronizarlos).
   */
  function conCatalogo_(fila, vehiculo) {
    if (!vehiculo) return Object.assign(fila, { EN_CATALOGO: false, FOLIO: '', DESACTUALIZADOS: [] });
    const viejos = [];
    Object.keys(DEL_CATALOGO).forEach((campo) => {
      const alDia = vehiculo[DEL_CATALOGO[campo]];
      const valor = alDia === undefined || alDia === null ? '' : alDia;
      if (!mismoValor_(fila[campo], valor)) viejos.push(campo);
      fila[campo] = valor;   // el catálogo manda
    });
    return Object.assign(fila, {
      EN_CATALOGO: true,
      FOLIO: vehiculo['FOLIO'] || '',
      DESACTUALIZADOS: viejos,
    });
  }

  function listar(token) {
    Permisos.puedeLeer(token, 'hologramas');
    const catalogo = catalogoPorSerie_();
    return SheetUtils.getAll(ssId(), hoja_().getName())
      .filter((r) => r['ID_HOLOGRAMA'])
      .map((r) => conCatalogo_(desdeOriginal_(r), catalogo[enMayusculas_(r['SERIE VEHICULO'])]))
      .sort((a, b) => (b.FECHA_REGISTRO || '').localeCompare(a.FECHA_REGISTRO || ''));
  }

  /**
   * Escribe en la hoja los datos del catálogo de los hologramas indicados, para que
   * AppSheet también los vea corregidos. Devuelve cuántas filas cambiaron y en qué campos.
   */
  function sincronizar(token, ids) {
    Permisos.puedeEditar(token, 'hologramas');
    if (!Array.isArray(ids) || !ids.length) throw new Error('No se indicaron hologramas a actualizar');
    const nombreHoja = hoja_().getName();
    const catalogo = catalogoPorSerie_();
    const actualizadas = [];
    let campos = 0;

    ids.forEach((id) => {
      const actual = SheetUtils.findById(ssId(), nombreHoja, id, 'ID_HOLOGRAMA');
      if (!actual) return;
      const vehiculo = catalogo[enMayusculas_(actual.data['SERIE VEHICULO'])];
      if (!vehiculo) return;                       // sin vehículo en el catálogo no hay qué copiar

      const cambios = {};
      Object.keys(DEL_CATALOGO).forEach((campo) => {
        const alDia = vehiculo[DEL_CATALOGO[campo]];
        const valor = alDia === undefined || alDia === null ? '' : alDia;
        if (!mismoValor_(actual.data[CAMPOS[campo]], valor)) cambios[CAMPOS[campo]] = valor;
      });
      if (!Object.keys(cambios).length) return;

      campos += Object.keys(cambios).length;
      if (cambios['PLACA'] !== undefined) cambios['NO ECONOMICO'] = cambios['PLACA'];
      cambios['FECHA ULTIMA MODIFICACION'] = new Date();
      actualizadas.push(conCatalogo_(desdeOriginal_(SheetUtils.update(ssId(), nombreHoja, id, cambios, 'ID_HOLOGRAMA')), vehiculo));
    });

    return { filas: actualizadas, campos: campos };
  }

  /** Catálogos para las listas del formulario (un solo viaje al servidor) */
  function catalogos(token) {
    Permisos.puedeLeer(token, 'hologramas');
    return {
      proveedores: PROVEEDORES,
      razonesSociales: RAZONES_SOCIALES,
      estatusEox: ESTATUS_EOX,
      estatusVehiculo: ESTATUS_VEHICULO,
      combustibles: COMBUSTIBLES,
    };
  }

  /**
   * Datos de un vehículo del catálogo para llenar el formulario. Si el folio no existe
   * regresa null: es un caso normal (vehículo personal), no un error.
   */
  function datosDeVehiculo(token, folio) {
    Permisos.puedeLeer(token, 'hologramas');
    const limpio = limpiar_(folio);
    if (!limpio) return null;
    const vehiculo = SheetUtils.findById(ssId(), 'VEHICULOS', limpio, 'FOLIO');
    if (!vehiculo) return null;
    const v = vehiculo.data;
    const estatus = enMayusculas_(v['ESTATUS']);
    return {
      FOLIO: limpio,
      SERIE_VEHICULO: v['SERIE VEHICULO'] || '',
      PLACA: v['PLACA'] || '',
      MARCA: v['MARCA'] || '',
      LINEA: v['LINEA VEHICULO'] || '',
      MODELO: v['MODELO'] || '',
      RAZON_SOCIAL: v['RAZON SOCIAL'] || '',
      DEPARTAMENTO: v['DEPARTAMENTO'] || '',
      RESPONSABLE: v['RESPONSABLE VEHICULO'] || '',
      CAPACIDAD: v['CAPACIDAD COMBUSTIBLE (LTS)'] || '',
      // En esta hoja el estatus solo distingue si la unidad es de la empresa o personal
      ESTATUS_VEHICULO: ESTATUS_VEHICULO.indexOf(estatus) === -1 ? 'UTILITARIO' : estatus,
      tipoCombustibleVehiculo: v['TIPO DE COMBUSTIBLE'] || '',
      estatusVehiculoCatalogo: v['ESTATUS'] || '',
    };
  }

  /** La calcomanía y la serie no se pueden repetir entre hologramas */
  function revisarDuplicados_(datos, idActual) {
    const filas = SheetUtils.getAll(ssId(), hoja_().getName());
    const calcomania = enMayusculas_(datos.CALCOMANIA);
    const serie = enMayusculas_(datos.SERIE_VEHICULO);
    filas.forEach((r) => {
      if (r['ID_HOLOGRAMA'] === idActual) return;
      if (calcomania && enMayusculas_(r['CALCOMANIA EOX']) === calcomania) {
        throw new Error('La calcomanía ' + calcomania + ' ya está registrada en otro holograma');
      }
      if (serie && enMayusculas_(r['SERIE VEHICULO']) === serie) {
        throw new Error('Esa serie ya tiene holograma (placa ' + (r['PLACA'] || 'sin placa') + ')');
      }
    });
  }

  /** La solicitud puede ser PDF o imagen; cada tipo va a su carpeta de AppSheet */
  function guardarSolicitud_(id, archivo) {
    const esPdf = archivo.mimeType === 'application/pdf';
    return DriveUtils.guardarArchivoAppSheet({
      carpetaId: esPdf ? Config.DRIVE_FOLDERS.HOLOGRAMAS_ARCHIVOS() : Config.DRIVE_FOLDERS.HOLOGRAMAS_IMAGENES(),
      carpetaRelativa: esPdf ? TABLA + '_Files_' : TABLA + '_Images',
      idFila: id,
      columna: COL_SOLICITUD,
      archivo: archivo,
      permitidos: ['application/pdf', 'image/png', 'image/jpeg'],
      etiqueta: 'la solicitud',
    });
  }

  function registrar(token, datos, archivo) {
    Permisos.puedeEditar(token, 'hologramas');
    if (!archivo || !archivo.base64) throw new Error('Adjunta la solicitud (PDF o imagen)');

    const fila = {};
    Object.keys(CAMPOS).forEach((campo) => {
      fila[CAMPOS[campo]] = valorValido_(campo, datos[campo], OBLIGATORIOS.indexOf(campo) !== -1);
    });
    revisarDuplicados_(datos, null);

    // Si la unidad está en el catálogo, sus datos ganan sobre lo que haya mandado el cliente
    const vehiculo = catalogoPorSerie_()[enMayusculas_(datos.SERIE_VEHICULO)];
    if (vehiculo) {
      Object.keys(DEL_CATALOGO).forEach((campo) => {
        const valor = vehiculo[DEL_CATALOGO[campo]];
        fila[CAMPOS[campo]] = valor === undefined || valor === null ? '' : valor;
      });
    }

    const id = Utilities.getUuid().slice(0, 8);
    const guardado = guardarSolicitud_(id, archivo);
    const ahora = new Date();
    try {
      SheetUtils.insert(ssId(), hoja_().getName(), Object.assign(fila, {
        'ID_HOLOGRAMA': id,
        // En esta hoja NO ECONOMICO trae la placa (ver comentario del encabezado)
        'NO ECONOMICO': fila['PLACA'],
        [COL_SOLICITUD]: guardado.ruta,
        'FECHA DE REGISTRO': ahora,
        'FECHA ULTIMA MODIFICACION': ahora,
      }));
    } catch (err) {
      DriveUtils.eliminar(guardado.fileId);   // no dejar archivos huérfanos
      throw err;
    }
    return { ID: id };
  }

  /** Edición de UNA celda desde la tabla */
  function actualizarCampo(token, id, campo, valor) {
    Permisos.puedeEditar(token, 'hologramas');
    if (!CAMPOS[campo]) throw new Error('El campo "' + campo + '" no se puede editar aquí');
    const nombreHoja = hoja_().getName();
    const actual = SheetUtils.findById(ssId(), nombreHoja, id, 'ID_HOLOGRAMA');
    if (!actual) throw new Error('No se encontró el holograma ' + id);

    // Lo que manda el catálogo no se corrige aquí: se corrige en Vehículos y se sincroniza
    const enCatalogo = !!catalogoPorSerie_()[enMayusculas_(actual.data['SERIE VEHICULO'])];
    if (enCatalogo && DEL_CATALOGO[campo]) {
      throw new Error(
        'Este dato viene del catálogo de Vehículos, que se mantiene al día: corrígelo ahí y ' +
        'luego usa "Actualizar desde el catálogo". Aquí solo se capturan los vehículos que no están en el catálogo.'
      );
    }

    const limpio = valorValido_(campo, valor, OBLIGATORIOS.indexOf(campo) !== -1);
    if (campo === 'CALCOMANIA' || campo === 'SERIE_VEHICULO') {
      revisarDuplicados_({ CALCOMANIA: campo === 'CALCOMANIA' ? limpio : '', SERIE_VEHICULO: campo === 'SERIE_VEHICULO' ? limpio : '' }, id);
    }
    const cambios = { [CAMPOS[campo]]: limpio, 'FECHA ULTIMA MODIFICACION': new Date() };
    if (campo === 'PLACA') cambios['NO ECONOMICO'] = limpio;   // se mantienen iguales
    return desdeOriginal_(SheetUtils.update(ssId(), nombreHoja, id, cambios, 'ID_HOLOGRAMA'));
  }

  /** Borra hologramas — solo ADMIN. Las solicitudes NO se borran de Drive. */
  function eliminar(token, ids) {
    Permisos.puedeEditar(token, 'hologramas');
    if (!Array.isArray(ids) || !ids.length) throw new Error('No se indicaron registros a eliminar');
    return { eliminadas: SheetUtils.removeMany(ssId(), hoja_().getName(), ids, 'ID_HOLOGRAMA') };
  }

  function urlSolicitud(token, ruta) {
    Permisos.puedeLeer(token, 'hologramas');
    const url = DriveUtils.urlDeRuta(ruta, [
      Config.DRIVE_FOLDERS.HOLOGRAMAS_ARCHIVOS(),
      Config.DRIVE_FOLDERS.HOLOGRAMAS_IMAGENES(),
    ]);
    if (!url) throw new Error('No se encontró la solicitud en Drive');
    return url;
  }

  return { listar, catalogos, datosDeVehiculo, registrar, actualizarCampo, sincronizar, eliminar, urlSolicitud };
})();

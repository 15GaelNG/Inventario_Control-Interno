/**
 * Entidades.gs
 * Catálogo único de las hojas que guardan registros: qué prefijo de ID le toca a cada una.
 * Ver docs/ids.md y docs/ids-asignacion.md.
 *
 * Lo leen tres lugares distintos, y por eso vive aquí y no dentro de ninguno de ellos:
 *   - SheetUtils.insert     al dar de alta un registro desde el programa
 *   - MigracionIds.gs       al ponerle ID a lo que ya existe (script de un solo uso)
 *   - el activador          que rellena lo que entra por AppSheet o a mano en la hoja
 *
 * Una hoja de registros = un prefijo. Las VISTAS no llevan prefijo propio: "Detalles de
 * Líneas Telefónicas" es la vista de tarjetas de LINEAS TELEFONICAS, y "Gestión de
 * Activos" es la vista por colaborador.
 *
 * Qué NO va aquí:
 *   - Los módulos del menú y sus permisos: eso es Modulos.gs. Son ejes distintos — un
 *     módulo puede abarcar varias hojas (Accesorios son dos) y mezclarlos enreda Permisos.
 *   - Qué columnas se copian de una hoja a otra: eso es el MAPA de Relaciones.gs. Aquí
 *     solo está la IDENTIDAD de cada renglón, no sus atributos copiados.
 */

const Entidades = (function () {
  /**
   * `llaveAnterior` es la columna que identificaba al renglón ANTES de la migración. Se usa
   * para dos cosas: saber de dónde leer el valor viejo, y saber si el ID nuevo va a pisar
   * esa columna (solo pasa cuando ya se llama "ID", y solo entonces hace falta respaldarla).
   * Cuando es null, la hoja la tiene sin encabezado y va por posición (base 1).
   */
  const POR_HOJA = {
    'VEHICULOS': { prefijo: 'VEH', llaveAnterior: 'ID_VEHICULO' },
    'CAMBIOS VEHICULOS': { prefijo: 'CVE', llaveAnterior: 'ID_CAMBIO' },
    'REASIGNACIONES_VEHICULOS': { prefijo: 'RVE', llaveAnterior: 'ID Reasignacion Vehicular' },
    // Reasignaciones de LÍNEAS (no de vehículos, pese a lo parecido del nombre).
    // La escribe LineasRepo; su "ID Linea" apunta a LINEAS TELEFONICAS (99.9% en producción).
    'HISTORIAL_REASIGNACIONES': { prefijo: 'HIS', llaveAnterior: 'ID Historial' },
    'VERIFICACIONES': { prefijo: 'VER', llaveAnterior: 'ID_VERIFICACION' },
    'INSPECCION VEHICULAR': { prefijo: 'INS', llaveAnterior: 'ID INSPECCION' },
    'INSTALACION DE SENSORES': { prefijo: 'SEN', llaveAnterior: 'ID_SENSOR' },
    'HOLOGRAMAS': { prefijo: 'HOL', llaveAnterior: 'ID_HOLOGRAMA' },
    'INCIDENCIAS': { prefijo: 'INC', llaveAnterior: 'ID_INCIDENCIA' },
    'LINEAS TELEFONICAS': { prefijo: 'LIN', llaveAnterior: 'ID' },
    'INSPECCIONES LINEAS': { prefijo: 'ILI', llaveAnterior: 'ID' },
    'RESPONSIVAS LINEAS': { prefijo: 'RLI', llaveAnterior: 'ID' },
    'REACTIVACION DE LINEAS': { prefijo: 'REA', llaveAnterior: 'ID' },
    'SOLICITUD DE LINEAS': { prefijo: 'SOL', llaveAnterior: 'ID' },
    // Caso especial: su columna de ID no tenía encabezado y se le puso "ID APPSHEET"
    // (29/09/2026), que es justo lo que guarda: el id que traía de AppSheet. Así que aquí
    // la llave anterior Y la columna de respaldo son la MISMA. Eso quita la dependencia de
    // la posición —ya se puede reacomodar— pero obliga a que limpiarRespaldoRedundante no
    // la compare consigo misma y la borre.
    'CAMBIOS LINEAS TELEFONICAS': { prefijo: 'CLI', llaveAnterior: 'ID APPSHEET' },
    'BITACORA DE DESECHO': { prefijo: 'DES', llaveAnterior: 'ID_DESECHO' },
    'ACCESORIOS CELULARES': { prefijo: 'ACC', llaveAnterior: 'ID_Accesorio' },
    'MOVIMIENTOS_ACCESORIOS': { prefijo: 'MAC', llaveAnterior: 'ID_Movimiento' },
    'ARQUEOS': { prefijo: 'ARQ', llaveAnterior: 'ID ARQUEO' },
    'CAJAS CHICAS': { prefijo: 'CCH', llaveAnterior: 'ID CCH' },
    'INCREMENTOS': { prefijo: 'MON', llaveAnterior: 'ID' },
    'UBER': { prefijo: 'UBE', llaveAnterior: 'ID' },
    'TICKETS': { prefijo: 'TCK', llaveAnterior: 'ID' },
    // Catálogo de personas: su identidad es el número de empleado, no un ID generado
    'COLABORADORES': { prefijo: 'COL', llaveAnterior: 'No EMPLEADO' },

    // --- Pestañas del sistema nuevo: NO vienen de AppSheet, las crea el módulo de Líneas ---
    // No pasan por MigracionIds (no hay nada viejo que convertir), pero sí necesitan prefijo
    // para que sus altas nazcan con el formato correcto.
    'APP_EVIDENCIAS': { prefijo: 'EVI', llaveAnterior: 'ID', delSistemaNuevo: true },
    'APP_MOVIMIENTOS': { prefijo: 'MOV', llaveAnterior: 'ID', delSistemaNuevo: true },
    // Avisos de Líneas (adendum por vencer): los crea LineasNotificaciones
    'APP_NOTIFICACIONES': { prefijo: 'NTF', llaveAnterior: 'ID', delSistemaNuevo: true },
  };

  /** Cómo se llama la columna de la llave nueva, en todas las hojas */
  const COLUMNA_ID = 'ID';
  /** Dónde se guarda la llave vieja cuando el ID nuevo la va a pisar */
  const COLUMNA_ID_ANTERIOR = 'ID APPSHEET';

  /** El nombre de una hoja como se escriba: sin espacios de sobra y en mayúsculas */
  const clave_ = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();

  const POR_CLAVE = {};
  const POR_PREFIJO = {};
  Object.keys(POR_HOJA).forEach((hoja) => {
    const e = { hoja: hoja };
    e.prefijo = POR_HOJA[hoja].prefijo;
    e.llaveAnterior = POR_HOJA[hoja].llaveAnterior;
    e.columnaAnterior = POR_HOJA[hoja].columnaAnterior || 0;
    // Nació con el sistema nuevo: no hay IDs viejos que convertir, así que MigracionIds
    // no la toca. Sí tiene prefijo, para que sus altas nazcan bien.
    e.delSistemaNuevo = !!POR_HOJA[hoja].delSistemaNuevo;
    // ¿El ID nuevo pisa la columna vieja? Solo si esa columna ya se llama "ID".
    e.pisaLlaveAnterior = clave_(e.llaveAnterior) === clave_(COLUMNA_ID);
    POR_CLAVE[clave_(hoja)] = e;
    POR_PREFIJO[e.prefijo] = e;
  });

  /** La entrada de una hoja, o null si esa hoja no guarda registros con ID */
  const de = (hoja) => POR_CLAVE[clave_(hoja)] || null;
  const existe = (hoja) => !!de(hoja);

  /**
   * El prefijo de una hoja. Truena si no está en el catálogo: generar un ID con el formato
   * equivocado en silencio es justo el problema del que estamos saliendo, así que una hoja
   * nueva tiene que darse de alta aquí a propósito.
   */
  function prefijo(hoja) {
    const e = de(hoja);
    if (!e) {
      throw new Error('La hoja "' + hoja + '" no está en Entidades: no sé qué prefijo de ID ' +
        'darle. Agrégala a src/config/Entidades.gs.');
    }
    return e.prefijo;
  }

  const hojaDe = (pre) => (POR_PREFIJO[String(pre || '').toUpperCase()] || {}).hoja || null;
  const todas = () => Object.keys(POR_HOJA).map((h) => POR_CLAVE[clave_(h)]);
  /** Las que sí tienen algo viejo que convertir: las que venían de AppSheet */
  const migrables = () => todas().filter((e) => !e.delSistemaNuevo);

  /**
   * Revisa que el catálogo esté sano. No se ejecuta solo: si tronara al cargar, tumbaría
   * toda la app por un typo. Se corre desde el editor o desde las pruebas.
   */
  function revisarCatalogo() {
    const problemas = [];
    const vistos = {};
    todas().forEach((e) => {
      if (!/^[A-Z]{3}$/.test(e.prefijo)) {
        problemas.push(e.hoja + ': el prefijo "' + e.prefijo + '" no son 3 letras mayúsculas');
      }
      if (vistos[e.prefijo]) {
        problemas.push('El prefijo "' + e.prefijo + '" está repetido: ' + vistos[e.prefijo] + ' y ' + e.hoja);
      }
      vistos[e.prefijo] = e.hoja;
      if (!e.llaveAnterior && !e.columnaAnterior) {
        problemas.push(e.hoja + ': no dice cuál era su llave anterior ni en qué columna está');
      }
    });
    return { hojas: todas().length, problemas: problemas };
  }

  return {
    de, existe, prefijo, hojaDe, todas, migrables, revisarCatalogo,
    COLUMNA_ID, COLUMNA_ID_ANTERIOR,
  };
})();

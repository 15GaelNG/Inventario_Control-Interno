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
   * `llaveEsDato` marca las hojas cuya "llave vieja" NO es un id desechable de AppSheet
   * sino un dato de la empresa, y que por eso **conservan el nombre de su columna**. Medido
   * el 30/09/2026 y confirmado con Ayrton: de las 23 hojas con llave anterior, 19 guardan
   * un id generado (8 hex como `E5818DE5`, o prefijo+contador como `REFWF1`, `FECED1`,
   * `JNJDC53`) y esas sí se renombran a `ID ANTERIOR`. Las otras 4 no:
   *
   *   COLABORADORES.No EMPLEADO      CIB01608       el número de empleado de Capital Humano
   *   ARQUEOS.ID ARQUEO              2026_225_001   folio de negocio año_nuco_secuencia
   *   INSPECCION VEHICULAR.ID INSPECCION  2026_451_1   igual
   *   CAJAS CHICAS.ID CCH            1, 2, 3        el número de caja que la gente usa
   *
   * Sin esta distinción, `ID ANTERIOR` significaría dos cosas según la hoja —a veces un id
   * muerto, a veces un dato vivo—, que es exactamente el problema del que se salió al
   * dejar de llamarla `ID APPSHEET`.
   *
   * `familia` agrupa las hojas por módulo para poder migrar y homologar **una familia a la
   * vez** en vez de las 26 de golpe. Es lo que permite dejar Vehículos terminado y probado
   * antes de tocar Líneas, que es mucho más revoltoso (ver docs/lineas-homologacion.md).
   *
   * OJO con `NUCO`: NO es un inventario global. `LINEAS TELEFONICAS.NUCO` (1,615 valores) y
   * `VEHICULOS.NUCCO` (648) **se traslapan en 497**, significando cosas distintas. Sirve de
   * llave DENTRO de una familia, nunca entre familias (medido el 30/09/2026).
   *
   * `llaveAnterior` es la columna que identificaba al renglón ANTES de la migración. Se usa
   * para dos cosas: saber de dónde leer el valor viejo, y saber si el ID nuevo va a pisar
   * esa columna (solo pasa cuando ya se llama "ID", y solo entonces hace falta respaldarla).
   * Cuando es null, la hoja la tiene sin encabezado y va por posición (base 1).
   */
  const POR_HOJA = {
    'VEHICULOS': { prefijo: 'VEH', llaveAnterior: 'ID_VEHICULO', familia: 'vehiculos' },
    'CAMBIOS VEHICULOS': { prefijo: 'CVE', llaveAnterior: 'ID_CAMBIO', familia: 'vehiculos' },
    'REASIGNACIONES_VEHICULOS': { prefijo: 'RVE', llaveAnterior: 'ID Reasignacion Vehicular', familia: 'vehiculos' },
    // Reasignaciones de LÍNEAS (no de vehículos, pese a lo parecido del nombre).
    // La escribe LineasRepo; su "ID Linea" apunta a LINEAS TELEFONICAS (99.9% en producción).
    'HISTORIAL_REASIGNACIONES': { prefijo: 'HIS', llaveAnterior: 'ID Historial', familia: 'lineas' },
    'VERIFICACIONES': { prefijo: 'VER', llaveAnterior: 'ID_VERIFICACION', familia: 'vehiculos' },
    // llaveEsDato: su "llave vieja" no es un id de AppSheet, es un FOLIO de negocio
    // (2026_451_1 = año_nuco_secuencia). Conserva su nombre. Ver la nota de llaveEsDato.
    'INSPECCION VEHICULAR': { prefijo: 'INS', llaveAnterior: 'ID INSPECCION', llaveEsDato: true, familia: 'vehiculos' },
    'INSTALACION DE SENSORES': { prefijo: 'SEN', llaveAnterior: 'ID_SENSOR', familia: 'vehiculos' },
    'HOLOGRAMAS': { prefijo: 'HOL', llaveAnterior: 'ID_HOLOGRAMA', familia: 'vehiculos' },
    'INCIDENCIAS': { prefijo: 'INC', llaveAnterior: 'ID_INCIDENCIA', familia: 'vehiculos' },
    'LINEAS TELEFONICAS': { prefijo: 'LIN', llaveAnterior: 'ID', familia: 'lineas' },
    'INSPECCIONES LINEAS': { prefijo: 'ILI', llaveAnterior: 'ID', familia: 'lineas' },
    'RESPONSIVAS LINEAS': { prefijo: 'RLI', llaveAnterior: 'ID', familia: 'lineas' },
    'REACTIVACION DE LINEAS': { prefijo: 'REA', llaveAnterior: 'ID', familia: 'lineas' },
    'SOLICITUD DE LINEAS': { prefijo: 'SOL', llaveAnterior: 'ID', familia: 'lineas' },
    // Caso especial: su columna de ID no tenía encabezado y se le puso "ID APPSHEET"
    // (29/09/2026), que es justo lo que guarda: el id que traía de AppSheet.
    //
    // OJO, PENDIENTE PARA PRODUCCIÓN: ese renombre se hizo SOLO en el libro de pruebas. En
    // producción esa columna (la A) sigue SIN ENCABEZADO — medido el 30/09/2026, trae
    // 'ee398840', '4a46be25'… Antes de migrar producción hay que ponerle el encabezado
    // "ID APPSHEET" a mano, o esta entrada no resuelve y la hoja se migra sin llave anterior.
    //
    // El nombre NO choca con COLUMNA_ID_ANTERIOR ('ID ANTERIOR') a propósito: son dos cosas
    // distintas y ahora se llaman distinto. Ver la nota de COLUMNA_ID_ANTERIOR abajo.
    // Trae las DOS formas de encontrarla a proposito. Por nombre para el libro compartido
    // del equipo, donde Ayrton la nombro 'ID APPSHEET' a mano; y por POSICION para
    // produccion y el laboratorio, donde esa columna sigue SIN encabezado (medido el
    // 30/09/2026). Sin el respaldo por posicion, el paso `renombrar` se detiene aqui.
    'CAMBIOS LINEAS TELEFONICAS': { prefijo: 'CLI', llaveAnterior: 'ID APPSHEET', columnaAnterior: 1, familia: 'lineas' },
    'BITACORA DE DESECHO': { prefijo: 'DES', llaveAnterior: 'ID_DESECHO', familia: 'lineas' },
    'ACCESORIOS CELULARES': { prefijo: 'ACC', llaveAnterior: 'ID_Accesorio', familia: 'lineas' },
    'MOVIMIENTOS_ACCESORIOS': { prefijo: 'MAC', llaveAnterior: 'ID_Movimiento', familia: 'lineas' },
    // Mismo caso: 2026_225_001 es un folio de negocio, no un id generado.
    'ARQUEOS': { prefijo: 'ARQ', llaveAnterior: 'ID ARQUEO', llaveEsDato: true, familia: 'cajachica' },
    // 1, 2, 3... El número de caja que la gente dice en voz alta ("la caja 45").
    'CAJAS CHICAS': { prefijo: 'CCH', llaveAnterior: 'ID CCH', llaveEsDato: true, familia: 'cajachica' },
    'INCREMENTOS': { prefijo: 'MON', llaveAnterior: 'ID', familia: 'cajachica' },
    'UBER': { prefijo: 'UBE', llaveAnterior: 'ID', familia: 'otros' },
    'TICKETS': { prefijo: 'TCK', llaveAnterior: 'ID', familia: 'otros' },
    // Catálogo de personas: su identidad es el número de empleado, no un ID generado
    // El más claro de los cuatro: CIB01608 es el número de empleado de Capital Humano.
    // Renombrarlo a "ID ANTERIOR" sería borrarle el nombre a un dato de la empresa.
    'COLABORADORES': { prefijo: 'COL', llaveAnterior: 'No EMPLEADO', llaveEsDato: true, familia: 'otros' },

    // --- Pestañas del sistema nuevo: NO vienen de AppSheet, las crea el módulo de Líneas ---
    // No pasan por MigracionIds (no hay nada viejo que convertir), pero sí necesitan prefijo
    // para que sus altas nazcan con el formato correcto.
    'APP_EVIDENCIAS': { prefijo: 'EVI', llaveAnterior: 'ID', delSistemaNuevo: true, familia: 'lineas' },
    'APP_MOVIMIENTOS': { prefijo: 'MOV', llaveAnterior: 'ID', delSistemaNuevo: true, familia: 'lineas' },
  };

  /** Cómo se llama la columna de la llave nueva, en todas las hojas */
  const COLUMNA_ID = 'ID';
  /**
   * Dónde se guarda la llave vieja cuando el ID nuevo la va a pisar.
   *
   * Se llama "ID ANTERIOR" y no "ID APPSHEET" por dos razones (decidido con Ayrton el
   * 30/09/2026, antes de correr la migración en producción):
   *
   *   1. Es lo que de verdad guarda: la llave ANTERIOR del renglón. Que viniera de AppSheet
   *      es circunstancial, y dejará de ser cierto para todo lo que se dé de alta después.
   *   2. Quita una colisión de nombres. "ID APPSHEET" ya existe como nombre de una columna
   *      REAL: es la llave original de CAMBIOS LINEAS TELEFONICAS (ver su entrada arriba).
   *      Con el nombre viejo, una columna servía para dos papeles distintos —el respaldo
   *      global y la llave de una hoja— y limpiarRespaldoRedundante necesitaba una guarda
   *      especial para no borrar el original comparándolo consigo mismo. Con dos nombres
   *      distintos, esa ambigüedad desaparece.
   *
   * Solo se crea en las hojas cuya columna original se llama "ID" (las que tienen
   * pisaLlaveAnterior), porque ahí el ID nuevo la pisa. En las demás la original sobrevive
   * intacta y el respaldo no hace falta.
   */
  const COLUMNA_ID_ANTERIOR = 'ID ANTERIOR';

  /**
   * El nombre que se usó ANTES del 30/09/2026 para lo mismo. No se escribe nunca más; está
   * aquí solo para poder AVISAR si aparece en un libro que se migró con la versión vieja
   * (el de pruebas, mientras no se replanche desde producción). Verlo significa que ese
   * libro y este código no están de acuerdo sobre dónde vive la llave vieja.
   */
  const COLUMNA_ID_ANTERIOR_LEGADO = 'ID APPSHEET';

  /** El nombre de una hoja como se escriba: sin espacios de sobra y en mayúsculas */
  const clave_ = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();

  const POR_CLAVE = {};
  const POR_PREFIJO = {};
  Object.keys(POR_HOJA).forEach((hoja) => {
    const e = { hoja: hoja };
    e.prefijo = POR_HOJA[hoja].prefijo;
    e.llaveAnterior = POR_HOJA[hoja].llaveAnterior;
    e.columnaAnterior = POR_HOJA[hoja].columnaAnterior || 0;
    // Sin esta línea, deFamilia() lee undefined y todas las hojas caen en 'otros'.
    e.familia = POR_HOJA[hoja].familia || 'otros';
    e.llaveEsDato = !!POR_HOJA[hoja].llaveEsDato;
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

  /** Los nombres de familia que existen, sin repetir y en orden estable. */
  function familias() {
    const vistas = {};
    Object.keys(POR_HOJA).forEach((h) => { vistas[POR_HOJA[h].familia || 'otros'] = true; });
    return Object.keys(vistas).sort();
  }

  /**
   * Las entidades migrables de una familia. Sin argumento devuelve todas, así que
   * `deFamilia()` y `migrables()` son lo mismo: el filtro se puede pasar sin condicionales.
   */
  function deFamilia(nombre) {
    const todas = migrables();
    if (!nombre) return todas;
    const f = String(nombre).trim().toLowerCase();
    return todas.filter((e) => (e.familia || 'otros') === f);
  }

  return {
    de, existe, prefijo, hojaDe, todas, migrables, revisarCatalogo,
    familias, deFamilia,
    COLUMNA_ID, COLUMNA_ID_ANTERIOR, COLUMNA_ID_ANTERIOR_LEGADO,
  };
})();

/**
 * Pruebas de las DOS CLASES DE COPIA de src/services/Relaciones.gs — ver docs/relaciones.md.
 *
 * Lo que de verdad protege esto: que sincronizar el DEPARTAMENTO entre módulos no
 * destruya las dos cosas que NO son deriva:
 *   1. una bitácora fechada (la inspección guarda el área que tenía la unidad ESE día), y
 *   2. un centinela ('BAJA VEHICULAR' es un estatus, no un departamento: en producción
 *      son 123 de 648 filas, y propagarlo pisa el área buena de la copia).
 * Correr: node tests/relaciones.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
function ok(condicion, descripcion) {
  console.log('  ' + (condicion ? '✔' : '✘') + ' ' + descripcion);
  if (!condicion) fallas++;
}

/** true si `fn` truena con un mensaje que casa `patron`. Un throw distinto NO cuenta. */
function truena(fn, patron) {
  try {
    fn();
    return false;
  } catch (e) {
    return patron.test(e.message);
  }
}

// ---------------------------------------------------------------- hojas falsas

/** Hoja falsa con lo que Relaciones.gs usa: rangos por fila/columna y getRangeList. */
function hoja(nombre, encabezados, filasObj) {
  const enc = encabezados.slice();
  const datos = filasObj.map((o) => enc.map((c) => (c in o ? o[c] : '')));
  const celda = (f, c) => ({
    getValues: () => (f === 1 ? [enc] : [(datos[f - 2] || []).slice()]),
    setValue: (v) => { if (f > 1) (datos[f - 2] = datos[f - 2] || [])[c - 1] = v; },
    // Token propio en vez de A1 de verdad: getRangeList lo vuelve a partir abajo.
    getA1Notation: () => 'F' + f + 'C' + c,
  });
  return {
    getName: () => nombre,
    getLastRow: () => datos.length + 1,
    getLastColumn: () => enc.length,
    getRange: (f, c, nf, nc) => {
      if (nf === undefined) return celda(f, c);
      return {
        getValues: () => {
          if (f === 1) return [enc.slice(c - 1, c - 1 + (nc || 1))];
          const out = [];
          for (let i = 0; i < nf; i++) out.push((datos[f - 2 + i] || []).slice(c - 1, c - 1 + (nc || 1)));
          return out;
        },
        setValues: (vals) => vals.forEach((fila, i) => {
          const dest = (datos[f - 2 + i] = datos[f - 2 + i] || []);
          fila.forEach((v, j) => { dest[c - 1 + j] = v; });
        }),
      };
    },
    getRangeList: (tokens) => ({
      setValue: (v) => tokens.forEach((t) => {
        const m = /^F(\d+)C(\d+)$/.exec(t);
        (datos[+m[1] - 2] = datos[+m[1] - 2] || [])[+m[2] - 1] = v;
      }),
    }),
    appendRow: (fila) => datos.push(fila.slice()),
    // helpers de la prueba
    enc, datos,
    valor(clave, colClave, columna) {
      const ic = enc.indexOf(colClave), iv = enc.indexOf(columna);
      const f = datos.find((d) => String(d[ic]).toUpperCase() === String(clave).toUpperCase());
      return f ? f[iv] : undefined;
    },
  };
}

// --------------------------------------------------------------------- datos

// 'ID' va primero, como en la hoja de verdad después de la migración. Hace falta porque
// datosParaNuevo entrega la llave foránea leyéndola de aquí: sin esta columna el dueño no
// tiene ID que dar, y truena a propósito.
const COL_VEH = ['ID', 'FOLIO', 'SERIE VEHICULO', 'PLACA', 'MARCA', 'CLASE', 'LINEA VEHICULO',
  'MODELO', 'COLOR', 'CAPACIDAD COMBUSTIBLE (LTS)', 'RAZON SOCIAL', 'DEPARTAMENTO',
  'SEDE', 'UBICACION', 'RESPONSABLE VEHICULO', 'SENSOR', 'SERIE SENSOR'];

// CTA0001 vive y es de CONSTRUCCION. CTA0002 está dado de baja: su DEPARTAMENTO ya no
// dice un área, dice un estatus — y las copias sí guardan el área buena (POST VENTA).
const base = {
  PLACA: 'AAA111', MARCA: 'NISSAN', CLASE: 'PICKUP', 'LINEA VEHICULO': 'NP300',
  MODELO: '2022', COLOR: 'BLANCO', 'CAPACIDAD COMBUSTIBLE (LTS)': 60,
  'RAZON SOCIAL': 'CM', SEDE: 'QRO', UBICACION: 'OFICINA 1', 'RESPONSABLE VEHICULO': 'ANA', SENSOR: 'SI TIENE SENSOR',
};
// CTA0003 es uno de los 116 vehículos de baja a los que les toca quedar con el
// DEPARTAMENTO vacío (la baja ya consta en ESTATUS), pero sus copias sí conservan el área.
const vehiculos = [
  Object.assign({ ID: 'VEH-00000000AAAAAA', FOLIO: 'CTA0001', 'SERIE VEHICULO': 'SER1', 'SERIE SENSOR': 'S1', DEPARTAMENTO: 'CONSTRUCCION' }, base),
  // CTA0002 está de baja, y quien la dio de baja escribió la palabra en TRES columnas:
  // DEPARTAMENTO, PLACA y RESPONSABLE. Así está en producción, medido el 30/09/2026.
  Object.assign({}, base, {
    ID: 'VEH-00000000BBBBBB',
    FOLIO: 'CTA0002', 'SERIE VEHICULO': 'SER2', 'SERIE SENSOR': 'S2', DEPARTAMENTO: 'BAJA VEHICULAR',
    PLACA: 'BAJA VEHICULAR', 'RESPONSABLE VEHICULO': 'BAJA VEHICULAR',
  }),
  Object.assign({ ID: 'VEH-00000000CCCCCC', FOLIO: 'CTA0003', 'SERIE VEHICULO': 'SER3', 'SERIE SENSOR': 'S3', DEPARTAMENTO: '' }, base),
];

/** Lo que una copia de Sensores tendría si estuviera al día, con SUS nombres de columna. */
const comoSensores = (v, depto) => ({
  FOLIO: v.FOLIO, 'SERIE VEHICULO': v['SERIE VEHICULO'], PLACA: v.PLACA, MARCA: v.MARCA,
  CLASE: v.CLASE, 'LINEA VEHICULO': v['LINEA VEHICULO'], MODELO: v.MODELO, COLOR: v.COLOR,
  'CAPACIDAD DE COMBUSTIBLE': v['CAPACIDAD COMBUSTIBLE (LTS)'], 'RAZON SOCIAL': v['RAZON SOCIAL'],
  DEPARTAMENTO: depto, SEDE: v.SEDE, 'OFICINA / DESARROLLO': v.UBICACION,
  RESPONSABLE: v['RESPONSABLE VEHICULO'],
});

function armar() {
  const hs = {};
  hs['VEHICULOS'] = hoja('VEHICULOS', COL_VEH, vehiculos);

  // ESTATUS SENSOR va en la firma de la hoja desde el 30/09/2026, cuando se le quitó
  // ID_SENSOR: sin esta columna, getSheetByColumns no encuentra la pestaña.
  hs['INSTALACION DE SENSORES'] = hoja('INSTALACION DE SENSORES',
    ['ID_SENSOR', 'SERIE SENSOR', 'ESTATUS SENSOR']
      .concat(Object.keys(comoSensores(vehiculos[0], ''))),
    [
      // al día en todo MENOS el departamento: se quedó con el viejo
      Object.assign({ ID_SENSOR: 'SEN-1', 'SERIE SENSOR': 'S1', 'ESTATUS SENSOR': 'ACTIVO' }, comoSensores(vehiculos[0], 'POST VENTA')),
      // el dueño dice BAJA VEHICULAR en tres columnas; esta copia guarda los datos de verdad
      Object.assign({ ID_SENSOR: 'SEN-2', 'SERIE SENSOR': 'S2', 'ESTATUS SENSOR': 'ACTIVO' },
        comoSensores(vehiculos[1], 'POST VENTA'),
        { PLACA: 'AAA222', RESPONSABLE: 'LUISA ORTEGA' }),
      // el dueño quedó VACÍO; esta copia es la única que conserva el área
      Object.assign({ ID_SENSOR: 'SEN-3', 'SERIE SENSOR': 'S3', 'ESTATUS SENSOR': 'ACTIVO' }, comoSensores(vehiculos[2], 'POST VENTA')),
    ]);

  hs['VERIFICACIONES'] = hoja('VERIFICACIONES',
    ['ID_VERIFICACION', 'FOLIO VEHICULO', 'COMPROBANTE VERIFICACION', 'PLACA'],
    [{ ID_VERIFICACION: 'VER-1', 'FOLIO VEHICULO': 'CTA0001', 'COMPROBANTE VERIFICACION': 'x', PLACA: 'AAA111' }]);

  hs['HOLOGRAMAS'] = hoja('HOLOGRAMAS',
    ['ID_HOLOGRAMA', 'CALCOMANIA EOX', 'ESTATUS EOX', 'SERIE VEHICULO', 'PLACA', 'MARCA',
      'LINEA VEHICULO', 'MODELO', 'RESPONSABLE', 'DEPARTAMENTO', 'CAPACIDAD DEL TANQUE'],
    [{
      ID_HOLOGRAMA: 'HOL-1', 'CALCOMANIA EOX': 'C1', 'ESTATUS EOX': 'ACTIVO',
      'SERIE VEHICULO': 'SER1', PLACA: 'AAA111', MARCA: 'NISSAN', 'LINEA VEHICULO': 'NP300',
      MODELO: '2022', RESPONSABLE: 'ANA', DEPARTAMENTO: 'CONSTRUCCION', 'CAPACIDAD DEL TANQUE': 60,
    }]);

  // BITÁCORA: la inspección de CTA0001 se hizo cuando la unidad era de ALEBRIJE.
  // Se empareja por NO SERIE, no por FOLIO (la llave es la serie desde el 30/09/2026).
  hs['INSPECCION VEHICULAR'] = hoja('INSPECCION VEHICULAR',
    ['ID INSPECCION', 'FOLIO', 'NO SERIE', 'PUNTAJE FINAL INSPECCION', 'DEPARTAMENTO',
      'SEDE', 'OFICINA / DESARROLLO', 'RESPONSABLE'],
    [{
      'ID INSPECCION': 'INS-1', FOLIO: 'CTA0001', 'NO SERIE': 'SER1',
      'PUNTAJE FINAL INSPECCION': 90, DEPARTAMENTO: 'ALEBRIJE', SEDE: 'QRO',
      'OFICINA / DESARROLLO': 'OFICINA 1', RESPONSABLE: 'ANA',
    }]);

  // KILOMETRAJE también entró a su firma al quitarle ID_INCIDENCIA.
  hs['INCIDENCIAS'] = hoja('INCIDENCIAS',
    ['ID_INCIDENCIA', 'FOLIO', 'NOMBRE MECANICO', 'KILOMETRAJE', 'DEPARTAMENTO', 'MODELO'],
    [{
      ID_INCIDENCIA: 'INC-1', FOLIO: 'CTA0001', 'NOMBRE MECANICO': 'LUIS',
      KILOMETRAJE: 120000, DEPARTAMENTO: 'CONSTRUCCION', MODELO: '2022',
    }]);

  // ------------------------------------------------------------------ CAJA CHICA
  // La caja 1 tiene $10,000 y a ANA. Su arqueo la retrata con $8,000 y con el PUESTO que
  // ANA tenía ese día: las dos diferencias son historia, no deriva, y por eso ARQUEOS es
  // bitácora. El incremento de $2,000 es justamente lo que explica la diferencia.
  hs['CAJAS CHICAS'] = hoja('CAJAS CHICAS',
    ['ID', 'ID CCH', 'RESPONSABLE DE CAJA CHICA', 'PUESTO DE RESPONSABLE', 'DEPARTAMENTO',
      'EMPRESA ORIGEN', 'METODO DE REEMBOLSO', 'MONTO ACTUAL', 'ESTATUS'],
    [{
      ID: 'CCH-00000000AAAAAA', 'ID CCH': '1', 'RESPONSABLE DE CAJA CHICA': 'ANA',
      'PUESTO DE RESPONSABLE': 'GERENTE', DEPARTAMENTO: 'CONSTRUCCION',
      'EMPRESA ORIGEN': 'CM', 'METODO DE REEMBOLSO': 'TRANSFERENCIA',
      'MONTO ACTUAL': 10000, ESTATUS: 'VIGENTE',
    }]);

  hs['ARQUEOS'] = hoja('ARQUEOS',
    ['ID', 'ID CCH', 'ID ARQUEO', 'ID CAJA CHICA', 'TOTAL GENERAL', 'RESPONSABLE',
      'PUESTO', 'AREA / DEPARTAMENTO', 'RAZON SOCIAL', 'METODO REEMBOLSO', 'MONTO CAJA'],
    [{
      ID: 'ARQ-00000000AAAAAA', 'ID CCH': '1', 'ID ARQUEO': '2026_1_001',
      'ID CAJA CHICA': 'CCH-00000000AAAAAA', 'TOTAL GENERAL': 8000, RESPONSABLE: 'ANA',
      PUESTO: 'SUPERVISORA', 'AREA / DEPARTAMENTO': 'CONSTRUCCION', 'RAZON SOCIAL': 'CM',
      'METODO REEMBOLSO': 'TRANSFERENCIA', 'MONTO CAJA': 8000,
    }]);

  hs['INCREMENTOS'] = hoja('INCREMENTOS',
    ['ID', 'ID CCH', 'ID CAJA CHICA', 'TIPO', 'CANTIDAD', 'CANTIDAD ANTERIOR',
      'CANTIDAD ACTUALIZADA', 'FECHA', 'QUIEN REALIZO'],
    [{
      ID: 'MON-00000000AAAAAA', 'ID CCH': '1', 'ID CAJA CHICA': 'CCH-00000000AAAAAA',
      TIPO: 'INCREMENTO', CANTIDAD: 2000, 'CANTIDAD ANTERIOR': 8000,
      'CANTIDAD ACTUALIZADA': 10000, FECHA: '2026-09-01', 'QUIEN REALIZO': 'ANA',
    }]);

  hs['LOG_RELACIONES'] = hoja('LOG_RELACIONES',
    ['FECHA', 'TIPO', 'HOJA', 'CLAVE', 'COLUMNA', 'TENIA', 'QUEDO'], []);
  return hs;
}

// -------------------------------------------------------------------- sandbox

function cargar(hs) {
  const norm = (v) => String(v == null ? '' : v).trim().toUpperCase();
  const filasDe = (h) => h.datos.map((d) => {
    const o = {};
    h.enc.forEach((c, i) => { o[c] = d[i]; });
    return o;
  });
  const ctx = vm.createContext({
    console,
    LockService: { getScriptLock: () => ({ waitLock: () => true, releaseLock: () => {} }) },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => hs[n] || null,
        insertSheet: (n) => (hs[n] = hoja(n, [], [])),
      }),
    },
    Utilities: { formatDate: () => '2026-09-29' },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    // Los dos apuntan al mismo libro falso: aquí lo que importa es que el MAPA pueda
    // resolver su spreadsheet, no en qué archivo vive cada familia.
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS', CAJACHICA: () => 'SS' } },
    SheetUtils: {
      getSheetByColumns: (ssId, firma) => {
        const cand = Object.keys(hs).filter((n) => firma.every((c) => hs[n].enc.indexOf(c) !== -1));
        if (!cand.length) throw new Error('ninguna hoja con la firma ' + firma.join(', '));
        if (cand.length > 1) throw new Error('compiten ' + cand.join(' / '));
        return hs[cand[0]];
      },
      indiceDeColumnas: (enc, nombres) => {
        const out = {};
        nombres.forEach((n) => { out[n] = enc.findIndex((c) => norm(c) === norm(n)); });
        return out;
      },
      getAll: (ssId, nombre) => filasDe(hs[nombre]),
      findById: (ssId, nombre, valor, columna) => {
        const f = filasDe(hs[nombre]).find((o) => norm(o[columna]) === norm(valor));
        return f ? { data: f } : null;
      },
      update: (ssId, nombre, clave, cambios, colClave) => {
        const h = hs[nombre];
        const ic = h.enc.indexOf(colClave);
        const fila = h.datos.find((d) => norm(d[ic]) === norm(clave));
        Object.keys(cambios).forEach((k) => { fila[h.enc.indexOf(k)] = cambios[k]; });
        return fila;
      },
    },
  });
  // Ids va primero: datosParaNuevo usa Ids.tieneForma para distinguir si le dieron el ID
  // del dueño o su llave de negocio. En Apps Script es un global; aquí hay que dárselo, y
  // así la prueba ejercita el validador de verdad en vez de una copia.
  const ids = path.join(__dirname, '..', 'src', 'utils', 'Ids.gs');
  const ruta = path.join(__dirname, '..', 'src', 'services', 'Relaciones.gs');
  vm.runInContext(
    fs.readFileSync(ids, 'utf8') + '\n' + fs.readFileSync(ruta, 'utf8') +
    '\nthis.Relaciones = Relaciones; this.Ids = Ids;',
    ctx
  );
  return ctx.Relaciones;
}

const logDe = (hs, tipo, columna) =>
  hs['LOG_RELACIONES'].datos.filter((f) => f[1] === tipo && (!columna || f[4] === columna));

// ------------------------------------------------------------------- pruebas

console.log('1. propagar() sí pisa un caché');
{
  const hs = armar();
  const R = cargar(hs);
  R.propagar('VEHICULOS', vehiculos[0], { DEPARTAMENTO: 'CONSTRUCCION' });
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0001', 'FOLIO', 'DEPARTAMENTO') === 'CONSTRUCCION',
    'el sensor de CTA0001 pasó de POST VENTA a CONSTRUCCION');
  ok(hs['HOLOGRAMAS'].valor('SER1', 'SERIE VEHICULO', 'DEPARTAMENTO') === 'CONSTRUCCION',
    'el holograma se une por SERIE VEHICULO y también se actualizó');
}

console.log('\n2. propagar() NO toca una bitácora');
{
  const hs = armar();
  const R = cargar(hs);
  R.propagar('VEHICULOS', vehiculos[0], { DEPARTAMENTO: 'COMERCIALIZACION' });
  ok(hs['INSPECCION VEHICULAR'].valor('CTA0001', 'FOLIO', 'DEPARTAMENTO') === 'ALEBRIJE',
    'la inspección conserva ALEBRIJE: era el área el día que se inspeccionó');
  ok(hs['INCIDENCIAS'].valor('CTA0001', 'FOLIO', 'DEPARTAMENTO') === 'CONSTRUCCION',
    'la incidencia tampoco se reescribe');
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0001', 'FOLIO', 'DEPARTAMENTO') === 'COMERCIALIZACION',
    'y el caché sí, en la misma llamada');
}

console.log('\n3. propagar() NO escribe un centinela');
{
  const hs = armar();
  const R = cargar(hs);
  const resumen = R.propagar('VEHICULOS', vehiculos[1], { DEPARTAMENTO: 'BAJA VEHICULAR' });
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0002', 'FOLIO', 'DEPARTAMENTO') === 'POST VENTA',
    'BAJA VEHICULAR no pisó el área buena del sensor');
  ok(Object.keys(resumen).length === 0, 'y no reporta haber actualizado nada');
}

console.log('\n4. El centinela se salta columna por columna, no registro completo');
{
  const hs = armar();
  const R = cargar(hs);
  R.propagar('VEHICULOS', vehiculos[1], { DEPARTAMENTO: 'BAJA VEHICULAR', PLACA: 'ZZZ999' });
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0002', 'FOLIO', 'PLACA') === 'ZZZ999',
    'la placa nueva sí llegó');
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0002', 'FOLIO', 'DEPARTAMENTO') === 'POST VENTA',
    'y el departamento se quedó igual');
}

console.log('\n5. revisar({corregir:true}) corrige el caché y congela la bitácora');
{
  const hs = armar();
  const R = cargar(hs);
  const r = R.revisar({ corregir: true });
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0001', 'FOLIO', 'DEPARTAMENTO') === 'CONSTRUCCION',
    'el caché quedó al día');
  ok(hs['INSPECCION VEHICULAR'].valor('CTA0001', 'FOLIO', 'DEPARTAMENTO') === 'ALEBRIJE',
    'la bitácora NO se tocó, aunque se pidió corregir');
  ok(r['INSPECCION VEHICULAR'].corregido === false,
    'y lo dice en el resumen: corregido=false para la bitácora');
  ok(r['INSTALACION DE SENSORES'].corregido === true, 'contra corregido=true del caché');
  ok(r['INSPECCION VEHICULAR'].diferenciasHistoricas === 1,
    'la deriva histórica se cuenta aparte (1), no como diferencia');
  ok(r['INSPECCION VEHICULAR'].diferencias === 0, 'diferencias=0 en la bitácora');
  ok(logDe(hs, 'DIFERENCIA_HISTORICA', 'DEPARTAMENTO').length === 1,
    'quedó en LOG_RELACIONES con su tipo propio, para poder filtrarla');
}

console.log('\n6. revisar({corregir:true}) no pisa nada con un centinela');
{
  const hs = armar();
  const R = cargar(hs);
  const r = R.revisar({ corregir: true });
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0002', 'FOLIO', 'DEPARTAMENTO') === 'POST VENTA',
    'la corrida nocturna no escribió BAJA VEHICULAR encima del área buena');
  // El centinela NO es exclusivo de DEPARTAMENTO: en producción la misma palabra está
  // escrita en PLACA y en RESPONSABLE. Una versión anterior solo cuidaba DEPARTAMENTO.
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0002', 'FOLIO', 'PLACA') === 'AAA222',
    'tampoco encima de la PLACA buena');
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0002', 'FOLIO', 'RESPONSABLE') === 'LUISA ORTEGA',
    'ni encima del RESPONSABLE bueno');
  ok(r['INSTALACION DE SENSORES'].centinelasOmitidos === 3, 'cuenta los tres centinelas');
  ok(logDe(hs, 'OMITIDO_CENTINELA', 'DEPARTAMENTO').length === 1,
    'y los deja en el log: lo que hay que arreglar es VEHICULOS, no la copia');
  ok(logDe(hs, 'OMITIDO_CENTINELA', 'PLACA').length === 1, 'la PLACA también quedó registrada');
}

console.log('\n6b. propagar() tampoco escribe un centinela en otra columna');
{
  const hs = armar();
  const R = cargar(hs);
  R.propagar('VEHICULOS', vehiculos[1], { PLACA: 'BAJA VEHICULAR' });
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0002', 'FOLIO', 'PLACA') === 'AAA222',
    'la placa buena sobrevive a una edición que trae el centinela');
}

console.log('\n7. Al CREAR un registro sí se copia el valor de hoy, bitácora incluida');
{
  const hs = armar();
  const R = cargar(hs);
  // Se busca por SERIE, no por folio: es el contrato desde que cambió la llave.
  const insp = R.datosParaNuevo('INSPECCION VEHICULAR', 'SER1');
  ok(insp.datos['DEPARTAMENTO'] === 'CONSTRUCCION',
    'la inspección nueva nace con el área de HOY: por eso queda congelada después');
  ok(insp.datos['NO SERIE'] === 'SER1', 'y trae ya puesta su propia llave');
  const sen = R.datosParaNuevo('INSTALACION DE SENSORES', 'SER2');
  ok(sen.datos['DEPARTAMENTO'] === 'BAJA VEHICULAR',
    'y al crear no se filtra el centinela: es el estado real en ese momento');
  ok(sen.datos['FOLIO'] === 'CTA0002',
    'el folio llega como atributo copiado, ya que dejó de ser llave');
}

console.log('\n7b. Y nace con la LLAVE FORÁNEA puesta, que es el vínculo de verdad');
{
  // Esto es lo que faltaba y por lo que un sensor creado desde la app quedaba con
  // ID VEHICULO vacío: la FK solo la llenaba el paso por lotes de la migración.
  const hs = armar();
  const R = cargar(hs);
  ['INSTALACION DE SENSORES', 'VERIFICACIONES', 'HOLOGRAMAS', 'INSPECCION VEHICULAR',
    'INCIDENCIAS'].forEach((hoja) => {
    const clave = (hoja === 'VERIFICACIONES' || hoja === 'INCIDENCIAS') ? 'CTA0001' : 'SER1';
    const r = R.datosParaNuevo(hoja, clave);
    ok(r.datos['ID VEHICULO'] === 'VEH-00000000AAAAAA',
      hoja + ' nace con ID VEHICULO = el ID del dueño');
  });
}

console.log('\n7c. Da lo mismo si le dan el ID del dueño o su llave de negocio');
{
  // Es lo que permite mover el frontend módulo por módulo: mientras unos formularios
  // manden folio y otros ya manden ID, los dos caminos llegan al mismo renglón.
  const hs = armar();
  const R = cargar(hs);
  const porFolio = R.datosParaNuevo('VERIFICACIONES', 'CTA0001');
  const porId = R.datosParaNuevo('VERIFICACIONES', 'VEH-00000000AAAAAA');
  ok(JSON.stringify(porFolio.datos) === JSON.stringify(porId.datos),
    'por folio y por ID producen exactamente lo mismo');
  ok(porId.datos['FOLIO VEHICULO'] === 'CTA0001',
    'y buscando por ID, la columna del folio recibe el FOLIO — no el ID');
  console.log('     (ese último importa: sin él, el ID se escribiría dentro de la columna del folio)');

  const serie = R.datosParaNuevo('INSTALACION DE SENSORES', 'VEH-00000000BBBBBB');
  ok(serie.datos['SERIE VEHICULO'] === 'SER2',
    'y en las que se emparejan por serie, la columna de la serie recibe la SERIE');

  // Esta es la que habilita la transición completa. Sensores, Hologramas e Inspección se
  // propagan por SERIE (porque la serie no cambia), pero TODOS los formularios mandan el
  // FOLIO. Sin aceptar la llave humana del dueño, mover esos tres a datosParaNuevo los
  // habría roto hasta que el frontend entero mandara IDs.
  const porFolioEnSerie = R.datosParaNuevo('INSTALACION DE SENSORES', 'CTA0001');
  ok(porFolioEnSerie.datos['SERIE VEHICULO'] === 'SER1',
    'una copia que se propaga por serie también acepta el FOLIO, que es lo que manda la app');
  ok(porFolioEnSerie.datos['ID VEHICULO'] === 'VEH-00000000AAAAAA',
    'y llega al mismo dueño, con la misma llave foránea');
}

console.log('\n7d. Si el dueño no existe, o no tiene ID, truena antes de escribir nada');
{
  const hs = armar();
  const R = cargar(hs);
  ok(truena(() => R.datosParaNuevo('VERIFICACIONES', 'CTA9999'), /no existe/i),
    'una llave que no existe truena, no devuelve un vínculo vacío');
  ok(truena(() => R.datosParaNuevo('VERIFICACIONES', 'VEH-00000000ZZZZZZ'), /no existe/i),
    'y un ID que no existe, igual');

  // El libro sin migrar: el dueño está, pero no tiene ID que dar. La hoja se arma sin la
  // columna desde el principio — quitársela después desalinea los datos de los encabezados.
  const sinId = armar();
  sinId['VEHICULOS'] = hoja('VEHICULOS', COL_VEH.filter((c) => c !== 'ID'),
    vehiculos.map((v) => {
      const copia = Object.assign({}, v);
      delete copia.ID;
      return copia;
    }));
  const R2 = cargar(sinId);
  ok(truena(() => R2.datosParaNuevo('VERIFICACIONES', 'CTA0001'), /no tiene ID|pipeline/i),
    'y si la hoja del dueño no tiene columna ID, lo dice y manda a correr el pipeline');
}

console.log('\n8. Cambiar la SERIE arrastra a todo lo que se empareja por ella');
{
  const hs = armar();
  const R = cargar(hs);
  R.cambiarClave('VEHICULOS', 'SERIE VEHICULO', 'SER1', 'SER9', { confirmar: true });
  ok(hs['INSTALACION DE SENSORES'].valor('SER9', 'SERIE VEHICULO', 'ID_SENSOR') === 'SEN-1',
    'el sensor siguió al vehículo');
  ok(hs['HOLOGRAMAS'].valor('SER9', 'SERIE VEHICULO', 'ID_HOLOGRAMA') === 'HOL-1',
    'el holograma también');
  ok(hs['INSPECCION VEHICULAR'].valor('SER9', 'NO SERIE', 'DEPARTAMENTO') === 'ALEBRIJE',
    'y la inspección, conservando su departamento histórico: se movió el vínculo, no el dato');
}

console.log('\n9. Cambiar el FOLIO: llave donde lo es, atributo donde ya no');
{
  const hs = armar();
  const R = cargar(hs);
  R.cambiarClave('VEHICULOS', 'FOLIO', 'CTA0001', 'CTA9999', { confirmar: true });
  ok(hs['VERIFICACIONES'].valor('CTA9999', 'FOLIO VEHICULO', 'ID_VERIFICACION') === 'VER-1',
    'Verificaciones se empareja por folio, así que la llave se reescribió');
  ok(hs['INCIDENCIAS'].valor('CTA9999', 'FOLIO', 'MODELO') === '2022', 'Incidencias igual');
  // Desde que la llave es la serie, el FOLIO de Sensores es un atributo copiado. Si
  // cambiarClave() no lo propagara, esa columna se quedaría con el folio viejo.
  ok(hs['INSTALACION DE SENSORES'].valor('SER1', 'SERIE VEHICULO', 'FOLIO') === 'CTA9999',
    'y en Sensores el folio se actualizó como atributo, sin ser su llave');
}

console.log('\n10. La corrida nocturna NO vacía una copia que sí tiene dato');
{
  const hs = armar();
  const R = cargar(hs);
  const r = R.revisar({ corregir: true });
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0003', 'FOLIO', 'DEPARTAMENTO') === 'POST VENTA',
    'el área sobrevivió aunque el catálogo quedó vacío');
  ok(r['INSTALACION DE SENSORES'].vaciosOmitidos === 1, 'lo cuenta como vacío omitido');
  ok(logDe(hs, 'OMITIDO_VACIO', 'DEPARTAMENTO').length === 1, 'y lo deja en el log');
  ok(r['INSTALACION DE SENSORES'].diferencias === 1,
    'la única diferencia que corrigió es la de CTA0001: ni el centinela ni el vacío cuentan');
}

console.log('\n11. Pero borrar el campo A MANO sí vacía la copia');
{
  const hs = armar();
  const R = cargar(hs);
  R.propagar('VEHICULOS', vehiculos[0], { DEPARTAMENTO: '' });
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0001', 'FOLIO', 'DEPARTAMENTO') === '',
    'en propagar() el borrado fue explícito, así que se respeta');
}

// ---------------------------------------------------------------------------- por ID
//
// Esto sale del caso CON0618, que encontró Ayrton usando el laboratorio: cambió el
// DEPARTAMENTO de un vehículo y no llegó a Hologramas. La FK estaba puesta y correcta en
// los dos hijos; propagar() no la usaba, iba por la serie, y ese vehículo no tenía serie en
// ese momento. Así que se salía en silencio y la edición se perdía.
//
// La serie era el paso intermedio, de cuando las copias no tenían columna del ID.

/** Sensores con columna 'ID VEHICULO', que es lo que ya tienen las hojas de verdad. */
function armarConFk(filasSensores) {
  const hs = armar();
  hs['INSTALACION DE SENSORES'] = hoja('INSTALACION DE SENSORES',
    ['ID', 'ID VEHICULO', 'SERIE SENSOR', 'ESTATUS SENSOR']
      .concat(Object.keys(comoSensores(vehiculos[0], ''))),
    filasSensores);
  return hs;
}

console.log('\n12. Propaga por la LLAVE FORÁNEA, aunque la llave de negocio no sirva');
{
  // El sensor apunta a CTA0001 por ID, pero su serie está vacía: por serie no se
  // encontraría nunca. Es exactamente CON0618.
  const hs = armarConFk([
    Object.assign({ ID: 'SEN-1', 'ID VEHICULO': 'VEH-00000000AAAAAA', 'SERIE SENSOR': 'S1' },
      comoSensores(vehiculos[0], 'POST VENTA'), { 'SERIE VEHICULO': '' }),
  ]);
  const R = cargar(hs);
  R.propagar('VEHICULOS', Object.assign({}, vehiculos[0], { 'SERIE VEHICULO': '' }),
    { DEPARTAMENTO: 'OOAM ADMINISTRATIVO' });
  ok(hs['INSTALACION DE SENSORES'].valor('SEN-1', 'ID', 'DEPARTAMENTO') === 'OOAM ADMINISTRATIVO',
     'llegó el cambio: se emparejó por ID VEHICULO, no por la serie');
  console.log('     (antes esto se perdía en silencio, y es el bug que encontró Ayrton)');
}

console.log('\n13. Y una fila SIN llave foránea sigue propagándose por su llave de negocio');
{
  // No es un lujo: mientras AppSheet siga vivo escribe en estas hojas y NO llena la FK.
  // Emparejar solo por ID dejaría de propagarle a todo lo que capturen ellos.
  const hs = armarConFk([
    Object.assign({ ID: 'SEN-2', 'ID VEHICULO': '', 'SERIE SENSOR': 'S2' },
      comoSensores(vehiculos[0], 'POST VENTA')),
  ]);
  const R = cargar(hs);
  R.propagar('VEHICULOS', vehiculos[0], { DEPARTAMENTO: 'OOAM ADMINISTRATIVO' });
  ok(hs['INSTALACION DE SENSORES'].valor('SEN-2', 'ID', 'DEPARTAMENTO') === 'OOAM ADMINISTRATIVO',
     'una fila como las que crea AppSheet se sigue actualizando por serie');
}

console.log('\n14. Si la fila tiene FK de OTRO dueño, su llave de negocio NO manda');
{
  // La prueba que de verdad protege. Dos vehículos comparten serie (pasa: 'SIN SERIE',
  // capturas repetidas, dedazos). Si la llave de negocio pudiera ganarle a la FK, editar
  // un vehículo pisaría los datos del otro.
  const hs = armarConFk([
    Object.assign({ ID: 'SEN-3', 'ID VEHICULO': 'VEH-00000000CCCCCC', 'SERIE SENSOR': 'S3' },
      comoSensores(vehiculos[0], 'POST VENTA')),
  ]);
  const R = cargar(hs);
  R.propagar('VEHICULOS', vehiculos[0], { DEPARTAMENTO: 'OOAM ADMINISTRATIVO' });
  ok(hs['INSTALACION DE SENSORES'].valor('SEN-3', 'ID', 'DEPARTAMENTO') === 'POST VENTA',
     'no se tocó: su FK dice que es de otro vehículo, aunque la serie coincida');
}

// ------------------------------------------------------------------ CAJA CHICA
//
// La familia entró al MAPA como bitácora, y estas dos pruebas son la razón de que eso
// importe: un arqueo retrata la caja del día en que se contó. Medido en el laboratorio el
// 30/09/2026, de las 6 columnas que copia, cuatro no difieren en ningún renglón, PUESTO
// difiere en 1 y MONTO CAJA en 4 — y esas 4 las explica INCREMENTOS una por una.

console.log('\n15. Editar una caja chica NO reescribe sus arqueos');
{
  const hs = armar();
  const R = cargar(hs);
  R.propagar('CAJAS CHICAS', { 'ID CCH': '1', ID: 'CCH-00000000AAAAAA' },
    { 'MONTO ACTUAL': 15000, 'PUESTO DE RESPONSABLE': 'DIRECTORA' });
  ok(hs['ARQUEOS'].valor('ARQ-00000000AAAAAA', 'ID', 'MONTO CAJA') === 8000,
     'el arqueo conserva los $8,000 que se contaron ese día');
  ok(hs['ARQUEOS'].valor('ARQ-00000000AAAAAA', 'ID', 'PUESTO') === 'SUPERVISORA',
     'y el puesto que tenía la responsable entonces');
  console.log('     (si esto se propagara, el arqueo dejaría de servir como evidencia)');
}

console.log('\n16. Pero revisar() sí las REPORTA, que es para lo que están en el MAPA');
{
  const hs = armar();
  const R = cargar(hs);
  const r = R.revisar({ corregir: true });   // incluso pidiendo corregir
  ok(hs['ARQUEOS'].valor('ARQ-00000000AAAAAA', 'ID', 'MONTO CAJA') === 8000,
     'ni con corregir:true se toca una bitácora');
  const hist = logDe(hs, 'DIFERENCIA_HISTORICA', 'MONTO CAJA');
  ok(hist.length === 1, 'queda en el log como DIFERENCIA_HISTORICA');
  ok(!!r['ARQUEOS'], 'y ARQUEOS aparece en el reporte: antes Caja Chica no se vigilaba');
  ok(!!r['INCREMENTOS'],
     'INCREMENTOS también, aunque no copie columnas: sirve para ver sus huérfanas');
}

console.log('\nrevisar() empareja igual que propagar(): por la FK primero');
{
  const hs = armar();
  const enc = hs['INSTALACION DE SENSORES'].enc.concat(['ID VEHICULO']);
  const fila = (extra) => Object.assign({ ID_SENSOR: 'SEN-X', 'SERIE SENSOR': 'SX' }, comoSensores(vehiculos[0], 'POST VENTA'), extra);
  hs['INSTALACION DE SENSORES'] = hoja('INSTALACION DE SENSORES', enc, [
    // FK de CTA0001 pero la serie de CTA0003: manda la FK
    fila({ 'ID VEHICULO': vehiculos[0].ID, 'SERIE VEHICULO': 'SER3', SEDE: 'VIEJA' }),
    // FK puesta y serie vacía: el caso CON0618
    fila({ 'ID VEHICULO': vehiculos[0].ID, 'SERIE VEHICULO': '', SEDE: 'VIEJA' }),
    // FK que no apunta a nada, aunque su serie sí exista: huérfana, no se toca
    fila({ 'ID VEHICULO': 'VEH-00000000ZZZZZZ', 'SERIE VEHICULO': 'SER1', SEDE: 'VIEJA' }),
  ]);
  const R = cargar(hs);
  const r = R.revisar({ corregir: true, hojas: ['INSTALACION DE SENSORES'] });
  const s = hs['INSTALACION DE SENSORES'];
  const col = (n) => s.enc.indexOf(n);
  ok(s.datos[0][col('DEPARTAMENTO')] === 'CONSTRUCCION', 'FK y serie en desacuerdo: recibe los datos del dueño de la FK');
  ok(s.datos[1][col('SEDE')] === 'QRO', 'serie vacía con FK: se empareja y se corrige');
  ok(s.datos[2][col('SEDE')] === 'VIEJA', 'FK rota: no se corrige con el dueño de la serie');
  ok(r['INSTALACION DE SENSORES'].huerfanos === 1 && r['INSTALACION DE SENSORES'].emparejadasPorId === 2,
    'el resumen dice 2 por ID y 1 huérfana');
  ok(!r['HOLOGRAMAS'], 'con hojas: [...] solo revisa esas');
}

console.log('\nrevisar({detalle, log:false}) — lo que usa la pantalla');
{
  const hs = armar();
  const R = cargar(hs);
  const antes = hs['LOG_RELACIONES'] ? hs['LOG_RELACIONES'].datos.length : 0;
  const r = R.revisar({ detalle: true, log: false });
  const e = r['INSTALACION DE SENSORES'].entradas;
  ok(Array.isArray(e) && e.some((x) => x.tipo === 'DIFERENCIA' && x.columna === 'DEPARTAMENTO' && x.dueno === 'CTA0001'),
    'trae cada diferencia con su columna y el folio del dueño');
  ok(e.every((x) => x.fila >= 2), 'y la fila de la hoja');
  ok(Object.keys(r['INSTALACION DE SENSORES']).indexOf('entradas') === -1, 'entradas no ensucia los reportes del editor');
  ok((hs['LOG_RELACIONES'] ? hs['LOG_RELACIONES'].datos.length : 0) === antes, 'solo mirar no escribe en LOG_RELACIONES');
  ok(hs['INSTALACION DE SENSORES'].valor('CTA0001', 'FOLIO', 'DEPARTAMENTO') === 'POST VENTA', 'ni corrige');
}

console.log('\ndescribir() pinta el MAPA');
{
  const R = cargar(armar());
  const d = R.describir();
  const veh = d.duenos.find((x) => x.hoja === 'VEHICULOS');
  const sen = veh && veh.copias.find((c) => c.nombre === 'INSTALACION DE SENSORES');
  ok(sen && sen.tipo === 'cache' && sen.columnas.some((c) => c.origen === 'UBICACION' && c.destino === 'OFICINA / DESARROLLO'),
    'cada copia con su tipo y sus columnas origen → destino');
  ok(d.centinelas['*'].indexOf('BAJA VEHICULAR') !== -1, 'y los centinelas');
}

// ------------------------------------------------ Sensores → VEHICULOS (al revés)

/** Escenario del sentido inverso: la hoja de sensores manda en SERIE SENSOR y SENSOR. */
function armarInverso(sensores, extraVehiculos) {
  const hs = armar();
  hs['INSTALACION DE SENSORES'] = hoja('INSTALACION DE SENSORES',
    hs['INSTALACION DE SENSORES'].enc.concat(['ID VEHICULO']),
    sensores.map((s) => Object.assign({}, comoSensores(vehiculos[s.v], 'CONSTRUCCION'),
      { ID_SENSOR: 'SEN-' + s.serie, 'SERIE SENSOR': s.serie, 'ESTATUS SENSOR': s.estatus },
      s.sinFk ? {} : { 'ID VEHICULO': vehiculos[s.v].ID })));
  (extraVehiculos || []).forEach((cambio) => {
    const v = hs['VEHICULOS'];
    const fila = v.datos.find((d) => d[v.enc.indexOf('FOLIO')] === cambio.FOLIO);
    Object.keys(cambio).forEach((k) => { fila[v.enc.indexOf(k)] = cambio[k]; });
  });
  return hs;
}
const enVehiculo = (hs, folio, col) => hs['VEHICULOS'].valor(folio, 'FOLIO', col);

console.log('\nSensores → VEHICULOS: revisar({corregir}) aplica las dos reglas del 01/10/2026');
{
  const hs = armarInverso([
    { v: 0, serie: 'S1', estatus: 'ACTIVO' },
    { v: 1, serie: 'S2', estatus: 'BAJA' },        // VEHICULOS sigue diciendo S2 y SI TIENE
  ], [{ FOLIO: 'CTA0003', SENSOR: 'CANCELADO' }]);  // CTA0003 no tiene sensor
  const R = cargar(hs);
  const r = R.revisar({ corregir: true, hojas: ['VEHICULOS'] });
  ok(enVehiculo(hs, 'CTA0001', 'SERIE SENSOR') === 'S1' && enVehiculo(hs, 'CTA0001', 'SENSOR') === 'SI TIENE SENSOR',
    'sensor ACTIVO: la serie y SI TIENE se quedan');
  ok(enVehiculo(hs, 'CTA0002', 'SERIE SENSOR') === '', 'sensor en BAJA: la serie SE VACÍA (no la frena la regla de no vaciar)');
  ok(enVehiculo(hs, 'CTA0002', 'SENSOR') === 'NO TIENE SENSOR', 'y SENSOR pasa a NO TIENE');
  ok(enVehiculo(hs, 'CTA0003', 'SENSOR') === 'NO TIENE SENSOR' && enVehiculo(hs, 'CTA0003', 'SERIE SENSOR') === '',
    'sin renglón de sensor: CANCELADO pasa a NO TIENE y la serie se vacía');
  ok(r['VEHICULOS'].huerfanos === 0, 'un vehículo sin sensor NO es huérfano');
}

console.log('\nSensores → VEHICULOS: dos sensores del mismo vehículo no se adivinan');
{
  const hs = armarInverso([
    { v: 0, serie: 'S1', estatus: 'ACTIVO' },
    { v: 0, serie: 'S9', estatus: 'BAJA' },
  ]);
  const R = cargar(hs);
  const r = R.revisar({ corregir: true, hojas: ['VEHICULOS'] });
  ok(r['VEHICULOS'].clavesDuplicadasOmitidas === 1, 'se reporta como llave repetida');
  ok(enVehiculo(hs, 'CTA0001', 'SERIE SENSOR') === 'S1', 'y el vehículo no se toca');
}

console.log('\nSensores → VEHICULOS: un sensor capturado por AppSheet (sin ID VEHICULO) se une por la serie del vehículo');
{
  const hs = armarInverso([{ v: 0, serie: 'S1', estatus: 'ACTIVO', sinFk: true }]);
  const R = cargar(hs);
  const r = R.revisar({ corregir: true, hojas: ['VEHICULOS'] });
  ok(enVehiculo(hs, 'CTA0001', 'SENSOR') === 'SI TIENE SENSOR', 'no lo toma por "sin sensor"');
  ok(r['VEHICULOS'].emparejadasPorClave === 1, 'y lo cuenta como unido por la llave');
}

console.log('\nSensores → VEHICULOS: propagar() y soltar()');
{
  const hs = armarInverso([{ v: 0, serie: 'S1', estatus: 'ACTIVO' }]);
  const R = cargar(hs);
  const sensor = hs['INSTALACION DE SENSORES'];
  const fila = {};
  sensor.enc.forEach((c, i) => { fila[c] = sensor.datos[0][i]; });

  R.propagar('INSTALACION DE SENSORES', Object.assign({}, fila, { 'ESTATUS SENSOR': 'BAJA' }), { 'ESTATUS SENSOR': 'BAJA' });
  ok(enVehiculo(hs, 'CTA0001', 'SERIE SENSOR') === '' && enVehiculo(hs, 'CTA0001', 'SENSOR') === 'NO TIENE SENSOR',
    'dar de baja: se recalculan LAS DOS columnas, aunque solo cambió el estatus');
  ok(enVehiculo(hs, 'CTA0002', 'SENSOR') === 'SI TIENE SENSOR', 'los demás vehículos no se tocan');

  R.propagar('INSTALACION DE SENSORES', Object.assign({}, fila, { 'SERIE SENSOR': 'S7' }), { 'SERIE SENSOR': 'S7', 'ESTATUS SENSOR': 'ACTIVO' });
  ok(enVehiculo(hs, 'CTA0001', 'SERIE SENSOR') === 'S7' && enVehiculo(hs, 'CTA0001', 'SENSOR') === 'SI TIENE SENSOR',
    'reactivar con otra serie: vuelve SI TIENE y la serie nueva');

  R.propagar('INSTALACION DE SENSORES', fila, { COMENTARIOS: 'x' });
  ok(enVehiculo(hs, 'CTA0001', 'SERIE SENSOR') === 'S7', 'un cambio que no toca sus columnas no escribe nada');

  R.soltar('INSTALACION DE SENSORES', fila);
  ok(enVehiculo(hs, 'CTA0001', 'SERIE SENSOR') === '' && enVehiculo(hs, 'CTA0001', 'SENSOR') === 'NO TIENE SENSOR',
    'soltar (sensor borrado o movido): el vehículo vuelve a "sin sensor"');
  R.soltar('VEHICULOS', vehiculos[0]);
  ok(hs['INSTALACION DE SENSORES'].datos.length === 1, 'soltar no toca copias sin "sinDueno" (las de VEHICULOS)');
}

console.log('\ndeOtraHoja() y describir() con el sentido inverso');
{
  const R = cargar(armar());
  const ajenas = R.deOtraHoja('VEHICULOS');
  ok(ajenas.columnas.join() === 'SERIE SENSOR,SENSOR', 'VEHICULOS no manda en SERIE SENSOR ni SENSOR');
  ok(ajenas.sinDueno.SENSOR === 'NO TIENE SENSOR' && ajenas.sinDueno['SERIE SENSOR'] === '', 'y su valor sin dueño');
  ok(R.deOtraHoja('HOLOGRAMAS').columnas.length > 0 && R.deOtraHoja('INSPECCION VEHICULAR').columnas.length === 0,
    'una bitácora no cuenta: sus columnas se capturan al dar de alta y no las pisa nadie');
  const sen = R.describir().duenos.find((d) => d.hoja === 'INSTALACION DE SENSORES');
  ok(sen && sen.copias[0].campoEnDueno === 'ID VEHICULO' && sen.copias[0].columnas.every((c) => c.calculada),
    'describir dice por dónde se une y que las dos son calculadas');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

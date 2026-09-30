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

const COL_VEH = ['FOLIO', 'SERIE VEHICULO', 'PLACA', 'MARCA', 'CLASE', 'LINEA VEHICULO',
  'MODELO', 'COLOR', 'CAPACIDAD COMBUSTIBLE (LTS)', 'RAZON SOCIAL', 'DEPARTAMENTO',
  'SEDE', 'UBICACION', 'RESPONSABLE VEHICULO'];

// CTA0001 vive y es de CONSTRUCCION. CTA0002 está dado de baja: su DEPARTAMENTO ya no
// dice un área, dice un estatus — y las copias sí guardan el área buena (POST VENTA).
const base = {
  PLACA: 'AAA111', MARCA: 'NISSAN', CLASE: 'PICKUP', 'LINEA VEHICULO': 'NP300',
  MODELO: '2022', COLOR: 'BLANCO', 'CAPACIDAD COMBUSTIBLE (LTS)': 60,
  'RAZON SOCIAL': 'CM', SEDE: 'QRO', UBICACION: 'OFICINA 1', 'RESPONSABLE VEHICULO': 'ANA',
};
// CTA0003 es uno de los 116 vehículos de baja a los que les toca quedar con el
// DEPARTAMENTO vacío (la baja ya consta en ESTATUS), pero sus copias sí conservan el área.
const vehiculos = [
  Object.assign({ FOLIO: 'CTA0001', 'SERIE VEHICULO': 'SER1', DEPARTAMENTO: 'CONSTRUCCION' }, base),
  // CTA0002 está de baja, y quien la dio de baja escribió la palabra en TRES columnas:
  // DEPARTAMENTO, PLACA y RESPONSABLE. Así está en producción, medido el 30/09/2026.
  Object.assign({}, base, {
    FOLIO: 'CTA0002', 'SERIE VEHICULO': 'SER2', DEPARTAMENTO: 'BAJA VEHICULAR',
    PLACA: 'BAJA VEHICULAR', 'RESPONSABLE VEHICULO': 'BAJA VEHICULAR',
  }),
  Object.assign({ FOLIO: 'CTA0003', 'SERIE VEHICULO': 'SER3', DEPARTAMENTO: '' }, base),
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
      Object.assign({ ID_SENSOR: 'SEN-1', 'SERIE SENSOR': 'S1' }, comoSensores(vehiculos[0], 'POST VENTA')),
      // el dueño dice BAJA VEHICULAR en tres columnas; esta copia guarda los datos de verdad
      Object.assign({ ID_SENSOR: 'SEN-2', 'SERIE SENSOR': 'S2' },
        comoSensores(vehiculos[1], 'POST VENTA'),
        { PLACA: 'AAA222', RESPONSABLE: 'LUISA ORTEGA' }),
      // el dueño quedó VACÍO; esta copia es la única que conserva el área
      Object.assign({ ID_SENSOR: 'SEN-3', 'SERIE SENSOR': 'S3' }, comoSensores(vehiculos[2], 'POST VENTA')),
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
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'SS' } },
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
  const ruta = path.join(__dirname, '..', 'src', 'services', 'Relaciones.gs');
  vm.runInContext(fs.readFileSync(ruta, 'utf8') + '\nthis.Relaciones = Relaciones;', ctx);
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

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

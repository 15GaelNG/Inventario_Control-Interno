/**
 * plantillas.js — las plantillas de inspección vehicular del DEV al formato nuevo ({{ }}, docs/plantillas.md), con la API
 * de Google Docs desde esta máquina: sin el límite de 6 minutos de Apps Script y con todo el registro a la vista.
 *
 *   node tools/plantillas/plantillas.js ensayo [TIPO …]       baja cada plantilla, la convierte EN MEMORIA y compara (la
 *                                                            estructura contra REAGRUPAR_SECCIONES y el oráculo: la vieja
 *                                                            llenada con Plantilla.gs contra la nueva con MotorPlantillas).
 *                                                            No escribe nada.
 *   node tools/plantillas/plantillas.js convertir TIPO …      si el ensayo cuadra: copia su "(DEV)" a "(DEV NUEVO)", aplica
 *   node tools/plantillas/plantillas.js convertir --todas      los cambios por la API (columnas N/A, marcas, reemplazos), la
 *   … convertir … --rehacer                                    (reemplaza la "(DEV NUEVO)" que ya existe, cuando la nueva pasó)
 *                                                            vuelve a bajar y repite las comparaciones sobre lo real, más
 *                                                            una contra el ensayo. Si algo no cuadra, la manda a la papelera.
 *
 * Después, en el editor del DEV: inspeccionesUsarConvertidas() (InspeccionesPlantillasDev.gs) apunta MODELOS INSPECCION a
 * las "(DEV NUEVO)" y olvida la caché; inspeccionesPlantillasAAppSheet() regresa.
 *
 * Lista blanca: solo copia documentos "… (DEV)" de la carpeta PLANTILLAS INSPECCION DEV del DEV y solo escribe en los
 * "… (DEV NUEVO)" que acaba de crear ahí. Nunca toca las originales de producción (no están en esa carpeta).
 * Usa el token de usuario de la migración (tools/migracion/autorizar.py lab, con permiso de Docs).
 */
const { cliente } = require('./google');
const modelo = require('./modelo');
const { entorno } = require('./entorno');
const planes = require('./planes');

// El DEV personal (proyecto 1zCusAR0…): su libro VEHICULOS y su raíz de Drive. Los IDs no son secretos (Entornos.gs).
const DEV = {
  libro: '1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI',
  raiz: '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM',
  carpeta: 'PLANTILLAS INSPECCION DEV',
};
const HOJA_MODELOS = 'MODELOS INSPECCION';
const HOJA_INSPECCIONES = 'INSPECCION VEHICULAR';

const g = cliente('lab');
const MAX = 15;

function normal(t) {
  return String(t == null ? '' : t).trim().toUpperCase();
}

async function contexto() {
  const carpetas = await g.buscar("name = '" + DEV.carpeta + "' and '" + DEV.raiz + "' in parents and " +
    "mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  if (carpetas.length !== 1) throw new Error('Esperaba una carpeta "' + DEV.carpeta + '" en la raíz del DEV y hay ' + carpetas.length);
  const modelos = await g.celdas(DEV.libro, "'" + HOJA_MODELOS + "'!A1:ZZ");
  const enc = (modelos[0] || []).map(normal);
  const iTipo = enc.indexOf('TIPO');
  const iPlantilla = enc.indexOf('PLANTILLA');
  if (iTipo === -1 || iPlantilla === -1) throw new Error(HOJA_MODELOS + ' no tiene TIPO y PLANTILLA');
  const tipos = modelos.slice(1).map((f) => ({ tipo: String(f[iTipo] || '').trim(), id: String(f[iPlantilla] || '').trim() })).filter((x) => x.tipo && x.id);
  const columnas = ((await g.celdas(DEV.libro, "'" + HOJA_INSPECCIONES + "'!1:1"))[0] || []).map((c) => String(c).trim()).filter(Boolean);
  if (!columnas.length) throw new Error('No pude leer los encabezados de ' + HOJA_INSPECCIONES);
  return { carpeta: carpetas[0].id, tipos: tipos, columnas: columnas };
}

/** La lista blanca: el archivo está en la carpeta de pruebas, no en la papelera y su nombre termina como debe */
async function exigirNuestro(id, carpeta, sufijo) {
  const a = await g.archivo(id);
  if (a.trashed || (a.parents || []).indexOf(carpeta) === -1 || !a.name.endsWith(sufijo)) {
    throw new Error('"' + a.name + '" no es una "' + sufijo + '" de la carpeta de pruebas: no se toca');
  }
  return a;
}

/** Convierte en memoria y compara. → { reporte, diferencias, pendientes, errores, convertido, viejo } */
function ensayar(e, tipo, nombre, viejo) {
  e.poner('VIEJA', nombre, viejo);
  e.poner('NUEVA', nombre, viejo.copy());
  const contrato = e.ctx.InspeccionesService.contrato_();
  const r = e.ctx.inspDevConvertirDoc_('NUEVA', contrato, tipo);
  const diferencias = r.pendientes.length || r.errores.length ? []
    : e.ctx.inspDevCompararEstructura_(tipo, viejo.getText(), r.arbol, contrato).concat(e.ctx.inspDevOraculo_('VIEJA', 'NUEVA', contrato, {}));
  return {
    resumen: r.piezas + ' piezas, ' + r.bloques + ' bloques y ' + r.valores + ' valores · N/A nuevo en ' + r.na.secciones + ' secciones',
    anchos: r.na.anchos, pendientes: r.pendientes, errores: r.errores, diferencias: diferencias, convertido: e.cuerpo('NUEVA'),
  };
}

function reportar(lineas, x) {
  x.pendientes.slice(0, MAX).forEach((p) => lineas.push('      PENDIENTE ' + p));
  x.errores.slice(0, MAX).forEach((er) => lineas.push('      ERROR ' + er.donde + ': ' + er.mensaje));
  x.diferencias.slice(0, MAX).forEach((d) => lineas.push('      DIFERENCIA ' + d));
  const mas = x.pendientes.length + x.errores.length + x.diferencias.length - 3 * MAX;
  if (mas > 0) lineas.push('      … y más');
}

async function convertir(e, c, t, viejo, ensayo, rehacer) {
  const nombreNuevo = viejo.nombre.replace(/\(DEV\)$/, '(DEV NUEVO)');
  const ya = await g.buscar("name = '" + nombreNuevo.replace(/'/g, "\\'") + "' and '" + c.carpeta + "' in parents and trashed = false");
  if (ya.length && !rehacer) return { ok: false, texto: 'ya existe "' + nombreNuevo + '" (convertir --rehacer la reemplaza)' };
  const copia = await g.copiar(viejo.id, nombreNuevo, c.carpeta);
  let ok = false;
  try {
    await exigirNuestro(copia.id, c.carpeta, '(DEV NUEVO)');
    // 1. columnas N/A
    const p1 = planes.planColumnas(e, modelo.cuerpo(await g.documento(copia.id)));
    if (p1.requests.length) await g.cambiar(copia.id, p1.requests);
    // 2. «N/A» en los encabezados nuevos y la marca de cada pieza
    const p2 = planes.planTextos(e, modelo.cuerpo(await g.documento(copia.id)), p1.conNA,
      e.ctx.inspDevSeccionDePieza_(t.tipo, viejo.cuerpo.getText()));
    if (p2.problemas.length) return { ok: false, texto: 'no se pudo planear: ' + p2.problemas.join('; ') };
    if (p2.requests.length) await g.cambiar(copia.id, p2.requests);
    // 3. las marcas de AppSheet a las nuevas
    const p3 = planes.planReemplazos(e, modelo.cuerpo(await g.documento(copia.id)));
    if (p3.pendientes.length) return { ok: false, texto: 'pendientes: ' + p3.pendientes.join('; ') };
    if (p3.requests.length) await g.cambiar(copia.id, p3.requests);

    // Lo real, otra vez con las mismas comparaciones, y contra el ensayo
    const real = modelo.cuerpo(await g.documento(copia.id));
    e.poner('VIEJA', viejo.nombre, viejo.cuerpo);
    e.poner('REAL', nombreNuevo, real);
    const contrato = e.ctx.InspeccionesService.contrato_();
    const arbol = e.ctx.MotorPlantillas.analizar(real);
    const x = {
      pendientes: /<</.test(real.getText()) ? ['quedó una marca de AppSheet'] : [],
      errores: e.ctx.MotorPlantillas.revisar(arbol, contrato),
      diferencias: [],
    };
    if (!x.errores.length && !x.pendientes.length) {
      x.diferencias = e.ctx.inspDevCompararEstructura_(t.tipo, viejo.cuerpo.getText(), arbol, contrato)
        .concat(e.ctx.inspDevOraculo_('VIEJA', 'REAL', contrato, {}))
        .concat(e.ctx.inspDevComparar_(ensayo.convertido, real).map((d) => 'contra el ensayo: ' + d));
    }
    ok = !x.pendientes.length && !x.errores.length && !x.diferencias.length;
    // Con --rehacer, la anterior se va a la papelera solo cuando la nueva ya pasó todo
    if (ok) {
      for (const anterior of ya) {
        await exigirNuestro(anterior.id, c.carpeta, '(DEV NUEVO)');
        await g.aPapelera(anterior.id);
      }
    }
    return { ok: ok, texto: ok ? 'convertida: "' + nombreNuevo + '" (' + copia.id + ')' : 'lo real no cuadró', detalle: x };
  } finally {
    if (!ok) {
      await exigirNuestro(copia.id, c.carpeta, '(DEV NUEVO)');
      await g.aPapelera(copia.id);
    }
  }
}

async function main() {
  const [accion, ...resto] = process.argv.slice(2);
  if (['ensayo', 'convertir'].indexOf(accion) === -1) {
    console.log('Uso: node tools/plantillas/plantillas.js ensayo [TIPO …] | convertir TIPO … | convertir --todas');
    process.exit(1);
  }
  const todas = resto.indexOf('--todas') !== -1;
  const rehacer = resto.indexOf('--rehacer') !== -1;
  const pedidos = resto.filter((x) => !/^--/.test(x)).map(normal);
  if (accion === 'convertir' && !todas && !pedidos.length) throw new Error('Di qué tipos convertir (o --todas)');

  const c = await contexto();
  const e = entorno(c.columnas);
  const elegidos = c.tipos.filter((t) => !pedidos.length || pedidos.indexOf(normal(t.tipo)) !== -1);
  const faltan = pedidos.filter((p) => !c.tipos.some((t) => normal(t.tipo) === p));
  if (faltan.length) throw new Error('No están en ' + HOJA_MODELOS + ': ' + faltan.join(', '));
  console.log((accion === 'ensayo' ? 'ENSAYO (no escribe nada)' : 'CONVIRTIENDO') + ' — ' + elegidos.length + ' plantillas del DEV\n');

  let bien = 0;
  for (const t of elegidos) {
    const lineas = [];
    try {
      // La fuente es siempre la copia (DEV) del tipo, aunque el DEV ya use su (DEV NUEVO)
      let fuente = await g.archivo(t.id);
      if (/\(DEV NUEVO\)$/.test(fuente.name)) {
        const nombre = fuente.name.replace(/\(DEV NUEVO\)$/, '(DEV)');
        const [x] = await g.buscar("name = '" + nombre.replace(/'/g, "\\'") + "' and '" + c.carpeta + "' in parents and trashed = false");
        if (!x) throw new Error('no encontré su "' + nombre + '"');
        fuente = x;
      }
      const a = await exigirNuestro(fuente.id, c.carpeta, '(DEV)');
      const viejo = { id: a.id, nombre: a.name, cuerpo: modelo.cuerpo(await g.documento(a.id)) };
      const ensayo = ensayar(e, t.tipo, viejo.nombre, viejo.cuerpo);
      const cuadra = !ensayo.pendientes.length && !ensayo.errores.length && !ensayo.diferencias.length;
      lineas.push((cuadra ? '  ✔ ' : '  ✘ ') + t.tipo + ': ' + ensayo.resumen + (cuadra ? ' · la estructura y el oráculo dan lo mismo' : ''));
      reportar(lineas, ensayo);
      if (accion === 'ensayo') ensayo.anchos.forEach((x) => lineas.push('      ' + x));
      if (accion === 'convertir' && cuadra) {
        const r = await convertir(e, c, t, viejo, ensayo, rehacer);
        lineas.push((r.ok ? '      ✔ ' : '      ✘ ') + r.texto);
        if (r.detalle) reportar(lineas, r.detalle);
        if (r.ok) bien++;
      } else if (cuadra) bien++;
    } catch (err) {
      lineas.push('  ✘ ' + t.tipo + ': ' + err.message);
    }
    console.log(lineas.join('\n'));
  }
  console.log('\n' + bien + ' de ' + elegidos.length + (accion === 'ensayo' ? ' cuadran.' : ' convertidas.') +
    (accion === 'convertir' && bien ? ' Ahora, en el editor del DEV: inspeccionesUsarConvertidas().' : ''));
  if (bien !== elegidos.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('✘ ' + err.message);
  process.exit(1);
});

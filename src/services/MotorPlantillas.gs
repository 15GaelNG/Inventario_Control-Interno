/**
 * MotorPlantillas.gs — el lenguaje propio de las plantillas de Google Docs (29-oct), que reemplaza al de AppSheet.
 * Referencia para quien edita un documento: docs/plantillas.md.
 *
 * El lenguaje tiene solo dos formas, y nada de lógica (principio de menor poder: la plantilla muestra, el código calcula):
 *
 *   {{CAMPO}}               el nombre de una columna. Qué hace lo decide el TIPO del campo en el contrato:
 *                           texto/número/fecha → escribe el valor; imagen → la inserta (PdfService);
 *                           en la primera celda de un renglón de CHECKLIST → palomita en la columna de su valor.
 *   {{si CAMPO}} … {{fin}}  el bloque sale si el campo tiene valor (en el mismo párrafo). Sin comparaciones: si hace
 *                           falta una, el código calcula un campo.
 *
 * Un CHECKLIST es una tabla con un renglón de encabezado de opciones (`Cristalería 10% | Bueno | Regular | Malo | N/A`)
 * y, debajo, un renglón por pieza: `Parabrisas {{PARABRISAS}} |  |  |  | `. Las celdas de opción van vacías; al llenar, la
 * marca se borra y la palomita va en la columna cuyo encabezado es el valor. Así las opciones de una pieza salen de su
 * tabla y no pueden discrepar, y la estructura del checklist (secciones, pesos, piezas) se lee de las tablas, no del
 * texto (que el acomodo a dos columnas revuelve: ver REAGRUPAR_SECCIONES en InspeccionesService).
 *
 * Como un compilador: analizar(body) arma el árbol una vez, revisar(árbol, contrato) da TODOS los errores con su
 * ubicación y una sugerencia, y llenar() no escribe nada si hay alguno (un PDF a medias es peor que ninguno).
 *
 * El contrato: { campos: { 'NOMBRE': 'texto' | 'numero' | 'fecha' | 'imagen' | 'opcion' | { tipo, marca } } }. Los
 * nombres se comparan sin acentos, mayúsculas ni espacios de más. `marca`: el campo cuyo valor va en la celda marcada en
 * vez de la palomita (las llantas: el estado decide la columna y se escriben los mm).
 *
 * El dialecto de AppSheet (<<…>>) lo sigue llenando Plantilla.gs; dialecto() dice cuál trae un documento.
 */

const MotorPlantillas = (function () {
  const PALOMITA = '✓';
  const MARCA = /\{\{([\s\S]*?)\}\}/g;
  const NOMBRE_VALIDO = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 /.\-#°º]*$/;
  const MAX_OPCION = 24;   // un encabezado de opción es corto ("No presenta"); algo más largo es texto, no opción

  /** Para comparar nombres: sin acentos, en mayúsculas, sin espacios de más (y "A / B" = "A/B") */
  function clave(texto) {
    return String(texto == null ? '' : texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
  }

  const escapar_ = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Qué lenguaje trae un texto: 'nuevo' ({{ }}), 'appsheet' (<< >>), 'mezclado' o 'ninguno' */
  function dialecto(texto) {
    const t = String(texto || '');
    const viejo = t.indexOf('<<') !== -1;
    const nuevo = t.indexOf('{{') !== -1;
    if (viejo && nuevo) return 'mezclado';
    return nuevo ? 'nuevo' : (viejo ? 'appsheet' : 'ninguno');
  }

  /** Una marca por dentro: { tipo: 'campo' | 'si' | 'fin', campo } o { error } */
  function leerMarca_(contenido) {
    const t = String(contenido).replace(/\s+/g, ' ').trim();
    if (/^fin$/i.test(t)) return { tipo: 'fin' };
    const si = /^si (.+)$/i.exec(t);
    const nombre = si ? si[1].trim() : t;
    if (!NOMBRE_VALIDO.test(nombre)) {
      return { error: 'no se entiende {{' + t + '}}: una marca es solo el nombre de una columna (sin comparaciones, ' +
        'comillas ni fórmulas; el cálculo va en el código)' };
    }
    return { tipo: si ? 'si' : 'campo', campo: nombre };
  }

  /** Las marcas de un texto, en orden: [{ tipo, campo, literal }] y los errores de sintaxis del párrafo */
  function marcasDe_(texto, donde, errores) {
    const lista = [];
    const t = String(texto || '');
    if (t.indexOf('<<') !== -1) errores.push({ donde: donde, mensaje: 'trae una marca de AppSheet (<<…>>): en este documento todo va con {{ }}' });
    let m;
    MARCA.lastIndex = 0;
    while ((m = MARCA.exec(t)) !== null) {
      const marca = leerMarca_(m[1]);
      if (marca.error) errores.push({ donde: donde, mensaje: marca.error });
      else lista.push(Object.assign({ literal: m[0] }, marca));
    }
    // Los bloques abren y cierran en el mismo párrafo
    let abiertos = 0;
    lista.forEach((x) => {
      if (x.tipo === 'si') abiertos++;
      if (x.tipo === 'fin') {
        if (!abiertos) errores.push({ donde: donde, mensaje: '{{fin}} sin su {{si …}} antes (en el mismo párrafo)' });
        else abiertos--;
      }
    });
    if (abiertos) errores.push({ donde: donde, mensaje: '{{si …}} sin su {{fin}} (el bloque debe cerrar en el mismo párrafo)' });
    return lista;
  }

  // ---------------------------------------------------------------- recorrer el documento

  const T = () => DocumentApp.ElementType;

  function hijos_(el) {
    const lista = [];
    if (typeof el.getNumChildren !== 'function') return lista;
    for (let i = 0; i < el.getNumChildren(); i++) lista.push(el.getChild(i));
    return lista;
  }

  function celdas_(renglon) {
    const lista = [];
    for (let c = 0; c < renglon.getNumCells(); c++) lista.push(renglon.getCell(c));
    return lista;
  }

  function renglones_(tabla) {
    const lista = [];
    for (let r = 0; r < tabla.getNumRows(); r++) lista.push(tabla.getRow(r));
    return lista;
  }

  const tieneTabla_ = (tabla) => renglones_(tabla).some((r) => celdas_(r).some((c) => hijos_(c).some((h) => h.getType() === T().TABLE)));

  /**
   * ¿Es un renglón de encabezado de opciones? Sin marcas; fuera de la primera columna (la de los nombres, donde va el
   * título "Cristalería 10%"), sus celdas con texto son dos o más, cortas, seguidas y llegan hasta el final. → la columna
   * de la primera opción, o -1.
   */
  function columnaDeOpciones_(textos) {
    if (textos.some((t) => t.indexOf('{{') !== -1)) return -1;
    const llenas = [];
    textos.forEach((t, i) => {
      if (i > 0 && t.trim()) llenas.push(i);
    });
    if (llenas.length < 2 || llenas[llenas.length - 1] !== textos.length - 1) return -1;
    if (llenas.some((c, i) => i && c !== llenas[i - 1] + 1)) return -1;
    if (llenas.some((c) => textos[c].trim().length > MAX_OPCION)) return -1;
    return llenas[0];
  }

  /**
   * Las secciones de checklist de una tabla sin tablas adentro: [{ titulo, peso, opciones, piezas: [{ campo, etiqueta,
   * renglon, celda (la del nombre), opciones: [celdas] }] }]. Un renglón con marca bajo un encabezado es una pieza si la
   * marca está antes de la primera columna de opción.
   */
  function checklistDe_(tabla, donde, errores) {
    const filas = renglones_(tabla);
    const textos = filas.map((r) => celdas_(r).map((c) => String(c.getText() || '')));
    const titulo0 = (textos[0] && textos[0][0]) || '';
    const tituloPeso = /^([\s\S]*?)\s*(\d{1,3})\s*%\s*$/.exec(titulo0.trim());
    const seccion = { titulo: tituloPeso ? tituloPeso[1].trim() : titulo0.trim(), peso: tituloPeso ? Number(tituloPeso[2]) : null, opciones: [], piezas: [] };
    let desde = -1;
    let renglonEncabezado = -1;
    filas.forEach((renglon, r) => {
      const col = columnaDeOpciones_(textos[r]);
      if (col !== -1) {
        desde = col;
        renglonEncabezado = r;
        const opciones = textos[r].slice(col).map((t) => t.trim());
        if (seccion.opciones.length && seccion.opciones.join('|') !== opciones.join('|')) {
          errores.push({ donde: donde + ', renglón ' + (r + 1), mensaje: 'esta tabla tiene dos encabezados de opciones distintos' });
        }
        seccion.opciones = opciones;
        return;
      }
      if (desde === -1) return;
      const celdas = celdas_(renglon);
      if (celdas.length !== textos[renglonEncabezado].length) return;   // no es renglón de este encabezado
      const conMarca = [];
      textos[r].forEach((t, c) => { if (t.indexOf('{{') !== -1) conMarca.push(c); });
      if (!conMarca.length || conMarca[0] >= desde) return;
      const lugar = 'sección «' + seccion.titulo + '», renglón ' + (r + 1);
      if (conMarca.some((c) => c >= desde)) {
        errores.push({ donde: lugar, mensaje: 'una celda de opción trae una marca: van vacías (la palomita la pone el motor)' });
        return;
      }
      const marcas = marcasDe_(textos[r][conMarca[0]], lugar, errores).filter((x) => x.tipo === 'campo');
      if (marcas.length !== 1 || conMarca.length !== 1) {
        errores.push({ donde: lugar, mensaje: 'un renglón del checklist lleva una sola marca, la de su pieza' });
        return;
      }
      textos[r].slice(desde).forEach((t, i) => {
        if (t.trim()) errores.push({ donde: lugar, mensaje: 'la celda de «' + seccion.opciones[i] + '» trae texto («' + t.trim().slice(0, 20) + '»): van vacías' });
      });
      seccion.piezas.push({
        campo: marcas[0].campo, literal: marcas[0].literal, donde: lugar,
        etiqueta: textos[r][conMarca[0]].replace(MARCA, '').replace(/\s+/g, ' ').trim(),
        renglon: renglon, celda: celdas[conMarca[0]], opcionesCeldas: celdas.slice(desde),
      });
    });
    return seccion.piezas.length ? seccion : null;
  }

  /**
   * El documento como árbol: { dialecto, secciones, marcas, bloques, errores }. `marcas` y `bloques` son los de fuera de
   * las piezas del checklist, cada uno con `donde`.
   */
  function analizar(body) {
    const arbol = { dialecto: dialecto(body.getText()), secciones: [], marcas: [], bloques: [], errores: [] };
    let tablas = 0;

    function parrafo(el, donde) {
      marcasDe_(el.getText(), donde, arbol.errores).forEach((m) => {
        if (m.tipo === 'campo') arbol.marcas.push({ campo: m.campo, donde: donde });
        if (m.tipo === 'si') arbol.bloques.push({ campo: m.campo, donde: donde });
      });
    }

    function recorrer(el, donde) {
      const tipo = el.getType();
      if (tipo === T().TABLE) return tabla(el.asTable(), donde);
      if (tipo === T().PARAGRAPH || tipo === T().LIST_ITEM) return parrafo(el, donde);
      hijos_(el).forEach((h, i) => recorrer(h, donde ? donde : 'párrafo ' + (i + 1)));
    }

    function tabla(t, dondeArriba) {
      tablas++;
      const donde = (dondeArriba ? dondeArriba + ' › ' : '') + 'tabla ' + tablas;
      if (!tieneTabla_(t)) {
        const seccion = checklistDe_(t, donde, arbol.errores);
        if (seccion) {
          arbol.secciones.push(seccion);
          // Lo demás de la tabla (fuera de las celdas de pieza) se lee como texto normal
          renglones_(t).forEach((renglon, r) => {
            if (seccion.piezas.some((p) => p.renglon === renglon)) return;
            celdas_(renglon).forEach((c, k) => hijos_(c).forEach((h) => recorrer(h, donde + ', renglón ' + (r + 1) + ', celda ' + (k + 1))));
          });
          return;
        }
      }
      renglones_(t).forEach((renglon, r) => celdas_(renglon).forEach((c, k) =>
        hijos_(c).forEach((h) => recorrer(h, donde + ', renglón ' + (r + 1) + ', celda ' + (k + 1)))));
    }

    hijos_(body).forEach((h, i) => recorrer(h, h.getType() === T().TABLE ? '' : 'párrafo ' + (i + 1)));
    return arbol;
  }

  // ---------------------------------------------------------------- revisar contra el contrato

  /** Distancia de edición (para sugerir el nombre que se quiso escribir) */
  function distancia_(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) d.push([i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  }

  /** El contrato como { CLAVE: { nombre, tipo, marca } } */
  function tipos_(contrato) {
    const mapa = {};
    Object.keys((contrato && contrato.campos) || {}).forEach((nombre) => {
      const v = contrato.campos[nombre];
      const def = typeof v === 'string' ? { tipo: v } : Object.assign({}, v);
      mapa[clave(nombre)] = Object.assign({ nombre: nombre }, def);
    });
    return mapa;
  }

  function sugerencia_(campo, mapa) {
    const buscado = clave(campo);
    let mejor = null;
    Object.keys(mapa).forEach((k) => {
      const d = distancia_(buscado, k);
      if (d <= Math.max(2, Math.floor(buscado.length * 0.3)) && (!mejor || d < mejor.d)) mejor = { d: d, nombre: mapa[k].nombre };
    });
    return mejor ? ' ¿Quisiste decir ' + mejor.nombre + '?' : '';
  }

  /** TODOS los errores del documento: los de sintaxis del árbol y los del contrato. [] = listo para llenar. */
  function revisar(arbol, contrato) {
    const errores = arbol.errores.slice();
    if (arbol.dialecto === 'mezclado') errores.unshift({ donde: 'documento', mensaje: 'mezcla marcas de AppSheet (<<…>>) y {{ }}: debe ser una sola forma' });
    const mapa = tipos_(contrato);
    const desconocido = (campo, donde) => {
      if (mapa[clave(campo)]) return false;
      errores.push({ donde: donde, mensaje: 'no existe el campo ' + campo + '.' + sugerencia_(campo, mapa) });
      return true;
    };
    arbol.marcas.forEach((m) => desconocido(m.campo, m.donde));
    arbol.bloques.forEach((b) => desconocido(b.campo, b.donde));
    const vistas = {};
    arbol.secciones.forEach((s) => {
      if (s.peso === null) errores.push({ donde: 'sección «' + s.titulo + '»', mensaje: 'su título no trae el peso ("Cristalería 10%")' });
      s.piezas.forEach((p) => {
        if (desconocido(p.campo, p.donde)) return;
        const def = mapa[clave(p.campo)];
        if (def.tipo === 'imagen') errores.push({ donde: p.donde, mensaje: p.campo + ' es una imagen: no puede ser pieza del checklist' });
        if (def.marca && !mapa[clave(def.marca)]) errores.push({ donde: p.donde, mensaje: 'la marca de ' + p.campo + ' sale de ' + def.marca + ', que no existe' });
        if (vistas[clave(p.campo)]) errores.push({ donde: p.donde, mensaje: p.campo + ' ya está en ' + vistas[clave(p.campo)] });
        else vistas[clave(p.campo)] = p.donde;
      });
    });
    return errores;
  }

  /** El nombre de un campo como lo dice el contrato (la columna real: "MEDALLÓN" en el Doc → "MEDALLON"), o null */
  function canonico(campo, contrato) {
    const def = tipos_(contrato)[clave(campo)];
    return def ? def.nombre : null;
  }

  /** La definición de un campo en el contrato ({ nombre, tipo, marca, … }), o null */
  function definicion(campo, contrato) {
    return tipos_(contrato)[clave(campo)] || null;
  }

  /** Los errores como un solo texto, uno por renglón (para un Error o un reporte) */
  const textoErrores = (errores) => errores.map((e) => '  - ' + e.donde + ': ' + e.mensaje).join('\n');

  // ---------------------------------------------------------------- llenar

  /** El valor de un campo en los datos, tolerante con mayúsculas, acentos y espacios */
  function valor_(datos, campo) {
    if (Object.prototype.hasOwnProperty.call(datos, campo)) return datos[campo];
    const buscado = clave(campo);
    const k = Object.keys(datos).find((x) => clave(x) === buscado);
    const v = k === undefined ? '' : datos[k];
    return v === null || v === undefined ? '' : v;
  }

  function textos_(el, lista) {
    if (el.getType() === T().TEXT) {
      lista.push(el.asText());
      return lista;
    }
    hijos_(el).forEach((h) => textos_(h, lista));
    return lista;
  }

  /**
   * Llena el documento (una COPIA de la plantilla; las imágenes ya las puso PdfService): revisa primero y, con un solo
   * error, truena sin escribir nada. → { marcadores, sinResolver: [] } (sinResolver: un valor de pieza que no es ninguna
   * de sus opciones; la celda queda sin palomita y se dice).
   */
  function llenar(body, datos, contrato) {
    const arbol = analizar(body);
    const errores = revisar(arbol, contrato);
    if (errores.length) throw new Error('La plantilla tiene errores:\n' + textoErrores(errores));
    const mapa = tipos_(contrato);
    const sinResolver = [];
    let marcadores = 0;

    // 1. El checklist: la palomita (o el valor de su `marca`) en la columna de su valor; la marca se borra
    arbol.secciones.forEach((s) => s.piezas.forEach((p) => {
      const valor = String(valor_(datos, p.campo)).trim();
      if (valor) {
        const i = s.opciones.findIndex((o) => clave(o) === clave(valor));
        if (i === -1) sinResolver.push(p.campo + ' = «' + valor + '»: no es ninguna de ' + s.opciones.join(', '));
        else {
          const def = mapa[clave(p.campo)];
          const marca = def.marca ? String(valor_(datos, def.marca)) : PALOMITA;
          const celda = p.opcionesCeldas[i];
          const parrafo = hijos_(celda).find((h) => h.getType() === T().PARAGRAPH);
          if (parrafo) parrafo.asParagraph().setText(marca);
          else celda.setText(marca);
        }
      }
      p.celda.replaceText('\\s*' + escapar_(p.literal), '');
      marcadores++;
    }));

    // 2. Bloques y valores, texto por texto (marca por marca: el formato del párrafo no se toca)
    textos_(body, []).forEach((texto) => {
      let contenido = texto.getText();
      if (contenido.indexOf('{{') === -1) return;
      const bloque = /\{\{\s*si\s+([^}]*?)\s*\}\}([\s\S]*?)\{\{\s*fin\s*\}\}/i;
      let m;
      while ((m = bloque.exec(contenido)) !== null) {
        const sale = String(valor_(datos, m[1])).trim() !== '' && String(valor_(datos, m[1])).toUpperCase() !== 'FALSE';
        texto.replaceText(escapar_(m[0]), sale ? m[2] : '');
        marcadores++;
        contenido = texto.getText();
      }
      (contenido.match(MARCA) || []).forEach((literal) => {
        const marca = leerMarca_(literal.slice(2, -2));
        texto.replaceText(escapar_(literal), String(valor_(datos, marca.campo)));
        marcadores++;
      });
    });
    return { marcadores: marcadores, sinResolver: sinResolver };
  }

  /** Patrón (de findText) de la marca de un campo, con o sin espacios por dentro: para insertar una imagen */
  const patron = (campo) => '\\{\\{\\s*' + escapar_(String(campo).trim()).replace(/ +/g, '\\s+') + '\\s*\\}\\}';

  return { dialecto, analizar, revisar, llenar, textoErrores, clave, patron, canonico, definicion, PALOMITA };
})();

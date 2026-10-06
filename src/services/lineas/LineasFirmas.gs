/**
 * LineasFirmas.gs
 * Firma guardada de quien captura en Líneas (usuario, 6-oct): DAFNE DONIS, GAMALIEL MORA y YOVANNI NAVA hacen
 * inspecciones y responsivas todo el día. Cuando entran con su cuenta, su firma va sola en FIRMA INSPECTOR (inspección) o
 * FIRMA CI (responsiva); pueden elegir «Firmar a mano».
 *
 * Seguridad:
 *  - La imagen nunca va a la pantalla: el servidor la pone en el PDF. La pantalla solo sabe que hay una.
 *  - Solo se usa la del usuario de la sesión (el correo lo fija el servidor al iniciar sesión, no lo manda la pantalla).
 *  - Se guarda cifrada en las propiedades del proyecto (HMAC-SHA256 en modo contador, con etiqueta de integridad), con
 *    una clave aleatoria que se crea en el propio proyecto (LINEAS_FIRMAS_CLAVE) y no sale de él. No hay copia en el
 *    libro, en Drive ni en git.
 *  - Se cargan con lineasFirmasGuardadas_cargar (LineasAdmin) desde una carpeta privada de quien la corre; después esa
 *    carpeta se borra.
 */
const LineasFirmas = (function () {
  const PROP_CLAVE = 'LINEAS_FIRMAS_CLAVE';
  const PREFIJO = 'LINEAS_FIRMA_';
  const TROZO = 8000; // cada propiedad admite 9 KB
  const SHA = Utilities.DigestAlgorithm.SHA_256;

  const props = () => PropertiesService.getScriptProperties();
  const sinSigno = (bytes) => bytes.map((b) => b & 255);
  const conSigno = (n) => (n > 127 ? n - 256 : n);
  const norm = (correo) => String(correo || '').trim().toLowerCase();

  /** Id de la persona en las propiedades (no el correo a la vista). */
  function id_(correo) {
    return sinSigno(Utilities.computeDigest(SHA, norm(correo), Utilities.Charset.UTF_8)).map((b) => ('0' + b.toString(16)).slice(-2)).join('').slice(0, 24);
  }

  function clave_(crear) {
    let k = props().getProperty(PROP_CLAVE);
    if (!k && crear) {
      k = Utilities.base64Encode(Utilities.computeDigest(SHA, Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + Date.now()));
      props().setProperty(PROP_CLAVE, k);
    }
    return k ? Utilities.base64Decode(k) : null;
  }

  const hmac = (datos, clave) => Utilities.computeHmacSha256Signature(datos, clave);
  function flujo_(clave, nonce, n) {
    const salida = [];
    for (let i = 0; salida.length < n; i++) {
      Array.prototype.push.apply(salida, hmac(nonce.concat([(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255].map(conSigno)), clave));
    }
    return salida.slice(0, n);
  }
  const claveMac_ = (clave) => hmac(Utilities.newBlob('lineas-firma-mac').getBytes(), clave);

  function cifrar_(bytes, clave) {
    const nonce = Utilities.computeDigest(SHA, Utilities.getUuid() + Date.now()).slice(0, 16);
    const ks = flujo_(clave, nonce, bytes.length);
    const c = bytes.map((b, i) => conSigno((b ^ ks[i]) & 255));
    return JSON.stringify({ v: 1, n: Utilities.base64Encode(nonce), c: Utilities.base64Encode(c),
      t: Utilities.base64Encode(hmac(nonce.concat(c), claveMac_(clave))) });
  }

  function descifrar_(texto, clave) {
    const o = JSON.parse(texto);
    const nonce = Utilities.base64Decode(o.n);
    const c = Utilities.base64Decode(o.c);
    const t = sinSigno(Utilities.base64Decode(o.t));
    const esperado = sinSigno(hmac(nonce.concat(c), claveMac_(clave)));
    let dif = t.length ^ esperado.length;
    esperado.forEach((b, i) => { dif |= b ^ (t[i] || 0); });
    if (dif) throw new Error('La firma guardada no pasó la revisión de integridad.');
    const ks = flujo_(clave, nonce, c.length);
    return c.map((b, i) => conSigno((b ^ ks[i]) & 255));
  }

  function meta_(correo) {
    const raw = props().getProperty(PREFIJO + id_(correo));
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  /** ¿La persona tiene firma guardada? (solo eso llega a la pantalla) */
  function tiene(correo) {
    return !!(norm(correo) && meta_(correo) && props().getProperty(PROP_CLAVE));
  }

  /** La firma (PNG en base64) para el PDF, o null. Solo la llaman el guardado y el PDF, con el correo de la sesión. */
  function png(correo) {
    const m = norm(correo) ? meta_(correo) : null;
    const clave = m ? clave_(false) : null;
    if (!m || !clave) return null;
    const id = id_(correo);
    const p = props();
    let texto = '';
    for (let i = 0; i < m.partes; i++) texto += p.getProperty(PREFIJO + id + '_P' + i) || '';
    return Utilities.base64Encode(descifrar_(texto, clave));
  }

  function quitar(correo) {
    const m = meta_(correo);
    const id = id_(correo);
    const p = props();
    for (let i = 0; m && i < m.partes; i++) p.deleteProperty(PREFIJO + id + '_P' + i);
    p.deleteProperty(PREFIJO + id);
  }

  /** Guarda (o reemplaza) la firma de un correo. `bytes`: el PNG. */
  function guardar(correo, bytes) {
    if (!norm(correo)) throw new Error('Falta el correo.');
    const texto = cifrar_(bytes, clave_(true));
    quitar(correo);
    const id = id_(correo);
    const nuevas = {};
    const partes = Math.ceil(texto.length / TROZO);
    for (let i = 0; i < partes; i++) nuevas[PREFIJO + id + '_P' + i] = texto.slice(i * TROZO, (i + 1) * TROZO);
    nuevas[PREFIJO + id] = JSON.stringify({ correo: norm(correo), partes: partes, bytes: bytes.length, actualizado: new Date().toISOString() });
    props().setProperties(nuevas);
  }

  /** Quiénes tienen firma guardada: [{ correo, bytes, actualizado }] (sin la imagen). */
  function lista() {
    const todas = props().getProperties();
    return Object.keys(todas).filter((k) => k.indexOf(PREFIJO) === 0 && !/_P\d+$/.test(k))
      .map((k) => { try { const m = JSON.parse(todas[k]); return { correo: m.correo, bytes: m.bytes, actualizado: m.actualizado }; } catch (e) { return null; } })
      .filter(Boolean);
  }

  return { tiene, png, guardar, quitar, lista };
})();

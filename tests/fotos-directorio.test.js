/**
 * Pruebas de FotosDirectorio (src/services/FotosDirectorio.gs) con el directorio de Google
 * simulado: que pagine, que salte la silueta gris y lo que no sea una foto de Google, que se
 * guarde en pedazos y se lea de la caché, y que si el directorio falla la app siga (sin fotos).
 *
 * Correr: node tests/fotos-directorio.test.js
 */
const { crearEntorno } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const truena = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

const persona = (correo, foto, extra) => Object.assign({
  emailAddresses: [{ value: correo }], photos: foto === null ? [] : [{ url: foto, default: false }],
}, extra || {});

function entorno(paginas, codigo) {
  const e = crearEntorno({ libros: {} });
  const llamadas = [];
  Object.assign(e.contexto, {
    Auth: { validarSesion: (t) => { if (t !== 'tok') throw new Error('Sesión expirada'); return { correo: 'ana@ejemplo.com' }; } },
    ScriptApp: { getOAuthToken: () => 'oauth-falso' },
    soloEditor_: () => {},
    UrlFetchApp: {
      fetch: (url, op) => {
        llamadas.push({ url, op });
        const token = (url.match(/pageToken=([^&]+)/) || [])[1];
        const i = token ? Number(decodeURIComponent(token)) : 0;
        return { getResponseCode: () => codigo || 200, getContentText: () => (codigo ? '{"error":{"message":"Request had insufficient authentication scopes."}}' : JSON.stringify(paginas[i])) };
      },
    },
  });
  e.cargar('src/services/FotosDirectorio.gs');
  return { e, F: e.global('FotosDirectorio'), llamadas };
}

const G = 'https://lh3.googleusercontent.com/a/';

console.log('1. El directorio: páginas, siluetas y fotos que no son de Google');
{
  const { e, F, llamadas } = entorno([
    { people: [persona('Ana@Ejemplo.com', G + 'ana=s100'), persona('sin.foto@ejemplo.com', null),
      { emailAddresses: [{ value: 'gris@ejemplo.com' }], photos: [{ url: G + 'gris', default: true }] }], nextPageToken: '1' },
    { people: [persona('luis@ejemplo.com', G + 'luis', { emailAddresses: [{ value: 'luis@ejemplo.com' }, { value: 'alias@ejemplo.com' }] }),
      persona('raro@ejemplo.com', 'javascript:alert(1)'), persona('otro@ejemplo.com', 'https://malo.com/x.png')] },
  ]);
  const mapa = F.todas('tok');
  ok(llamadas.length === 2 && /pageToken=1/.test(llamadas[1].url), 'pagina hasta acabar (2 páginas)');
  ok(llamadas[0].op.headers.Authorization === 'Bearer oauth-falso' && /DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE/.test(llamadas[0].url) && /readMask=emailAddresses,photos/.test(llamadas[0].url),
    'al endpoint del directorio con el token del script, pidiendo solo correo y foto');
  ok(mapa['ana@ejemplo.com'] === G + 'ana=s100' && mapa['luis@ejemplo.com'] === G + 'luis' && mapa['alias@ejemplo.com'] === G + 'luis',
    'correo en minúsculas → URL; cada correo de la persona');
  ok(!('sin.foto@ejemplo.com' in mapa) && !('gris@ejemplo.com' in mapa), 'sin foto o con la silueta gris (default): no sale (para eso están las iniciales)');
  ok(!('raro@ejemplo.com' in mapa) && !('otro@ejemplo.com' in mapa), 'una URL que no es de googleusercontent no pasa (va a un src)');
  F.todas('tok');
  ok(llamadas.length === 2, 'la segunda vez sale de la caché: Google no se entera');
  ok(F.de('ANA@ejemplo.com ') === G + 'ana=s100' && F.de('nadie@ejemplo.com') === '', 'de(correo) para la entrada, solo de lo guardado');
  ok(/Sesión expirada/.test(truena(() => F.todas('otro'))), 'sin sesión no hay fotos');
  ok(F.calentar() === 'al día' && llamadas.length === 2, 'el Calentador no la rehace si es reciente');
  e.avanzar(3 * 3600 * 1000 + 1);
  ok(/fotos$/.test(F.calentar()) && llamadas.length === 4, 'pasadas 3 h, el Calentador la rehace');
}

console.log('\n2. En pedazos (un valor de caché aguanta 100 KB)');
{
  const gente = Array.from({ length: 2500 }, (_, i) => persona('persona' + i + '@ejemplo.com', G + 'foto-larga-' + 'x'.repeat(60) + i));
  const { e, F } = entorno([{ people: gente }]);
  const mapa = F.todas('tok');
  const meta = JSON.parse(e.contexto.CacheService.getScriptCache().get('fotos_dir_meta'));
  ok(Object.keys(mapa).length === 2500 && meta.pedazos > 1, 'el mapa de 2,500 personas se guarda en ' + meta.pedazos + ' pedazos y se lee completo');
  e.contexto.CacheService.getScriptCache().removeAll(['fotos_dir_1']);
  ok(F.de('persona1@ejemplo.com') === '', 'si falta un pedazo, no se usa a medias');
}

console.log('\n3. Si el directorio falla, la app sigue');
{
  const { F, llamadas } = entorno([], 403);
  const mapa = F.todas('tok');
  ok(JSON.stringify(mapa) === '{}' && llamadas.length === 1, 'sin permiso: {} (iniciales para todos), sin reintentos en ciclo');
  ok(/respondió 403.*insufficient/.test(truena(() => F.calentar())), 'el Calentador sí ve el error (queda en su registro)');
  ok(!/oauth-falso/.test(truena(() => F.calentar())), 'y el error no trae el token');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);

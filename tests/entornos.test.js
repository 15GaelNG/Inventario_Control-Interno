/**
 * La configuración por archivo (src/config/Entornos.gs): cada proyecto toma SU bloque, el
 * archivo manda sobre Script Properties, y lo vacío cuenta como "no está". Correr: npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

function entorno(scriptId, propiedades) {
  const ctx = vm.createContext({
    ScriptApp: { getScriptId: () => scriptId },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in propiedades ? propiedades[k] : null) }) },
  });
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'Entornos.gs'), 'utf8');
  vm.runInContext(fuente + '\nthis.leerConfig_ = leerConfig_; this.origenConfig_ = origenConfig_; this.ENTORNOS = ENTORNOS;', ctx);
  return ctx;
}

const PROD = '1NbOczw_H8UJ7adxRP4h_jl9VlfyvxM3mANYsaz12U5uo8Gj0BmfIYN3k';

console.log('1. Producción toma su bloque');
let e = entorno(PROD, { SS_ID_VEHICULOS: 'el-de-la-propiedad', GEOTAB_PASSWORD: 'secreto' });
ok(e.leerConfig_('ENTORNO') === 'PROD', 'ENTORNO = PROD');
ok(e.leerConfig_('SS_ID_VEHICULOS') === e.ENTORNOS[PROD].SS_ID_VEHICULOS, 'el archivo manda sobre la Script Property');
ok(e.origenConfig_('SS_ID_VEHICULOS') === 'archivo', 'y el diagnóstico sabe que salió del archivo');
ok(e.leerConfig_('GEOTAB_PASSWORD') === 'secreto', 'lo que no está en el archivo (la contraseña) sale de Script Properties');
ok(e.origenConfig_('GEOTAB_PASSWORD') === 'propiedad', '…y se reporta como propiedad');

console.log('2. Vacío y ausente');
e = entorno(PROD, {});
const vacia = Object.keys(e.ENTORNOS[PROD]).find((k) => e.ENTORNOS[PROD][k] === '');
ok(!vacia || e.leerConfig_(vacia) === null, 'un valor vacío en el archivo cuenta como "no está" (' + (vacia || 'ninguno vacío') + ')');
ok(e.leerConfig_('NO_EXISTE') === null && e.origenConfig_('NO_EXISTE') === null, 'lo que no está en ningún lado es null');

console.log('3. Otro proyecto (un DEV) no ve el bloque de producción');
e = entorno('un-proyecto-dev', { SS_ID_VEHICULOS: 'el-de-mi-dev' });
ok(e.leerConfig_('SS_ID_VEHICULOS') === 'el-de-mi-dev', 'usa su Script Property, como siempre');
ok(e.leerConfig_('ENTORNO') === null, 'y no hereda ENTORNO = PROD');

console.log('4. Sin ScriptApp (pruebas, otros contextos)');
const sinScriptApp = vm.createContext({ PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'de-propiedad' }) } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'Entornos.gs'), 'utf8') + '\nthis.leerConfig_ = leerConfig_;', sinScriptApp);
ok(sinScriptApp.leerConfig_('SS_ID_VEHICULOS') === 'de-propiedad', 'no truena: usa Script Properties');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);

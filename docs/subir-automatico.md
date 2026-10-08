# Subir a Apps Script (comprimido y automático)

## Qué se sube

`src/` es lo que se edita: legible y con comentarios. A Apps Script se sube una copia
comprimida (`tools/subir/construir.js`):

- **Se comprime** el JS de cada `<script>` y el CSS de cada `<style>` de los `.html`. La página
  pasa de 1.64 MB a 0.98 MB, y lo que viaja con gzip de 445 KB a 282 KB.
- **Se copian tal cual** `Index.html` (lleva scriptlets) y los `.gs`, para que los errores del
  servidor sigan diciendo el archivo y el renglón reales.
- **El cuidado del `//`** (CLAUDE.md): el compresor vuelve a escribir `'https:\/\/…'` como
  `'https://…'`. Por eso, después de comprimir, se escapan otra vez las `/` de cada string. Si
  aun así queda un `//` (por ejemplo, dentro de una expresión regular), ese bloque se sube sin
  comprimir. `tests/construir.test.js` comprime todo `src/` y falla si queda algún `//`.

## Con comandos

| Comando | Qué hace |
|---|---|
| `npm run push` | Tu DEV (`.clasp.json`) |
| `npm run push:lab` | LAB (`.clasp.lab.json`) |
| `npm run push:prod` | Producción. Solo sube: nadie lo ve hasta desplegar |
| `node tools/subir/subir.js prod --desplegar "qué cambia"` | Sube a producción y mueve **los dos** despliegues a la versión nueva |
| `npm run push:sin-comprimir` | El `clasp push` de antes, por si hace falta |

Cada subida hace esto:
1. Comprime.
2. Baja lo que hay en Apps Script. Un archivo que solo existe allá, como la semilla de
   correcciones de Líneas (no va en git), se conserva en vez de borrarse.
3. Sube.
4. Vuelve a bajar y compara archivo por archivo. Si algo no quedó igual, truena.

## Automático (GitHub Action)

`.github/workflows/subir.yml`:

- **Push a una rama de `tools/subir/destinos.json` → `ramas`** (hoy solo `ayrton`): corre
  `npm test` y, si pasa, sube a su DEV. Para otra persona, agrega su rama y el scriptId de
  su DEV en `destinos.json`, y la rama en `on.push.branches` del workflow.
- **Producción, solo a mano:** en GitHub → Actions → "Subir a Apps Script" → **Run workflow**,
  elige `master` y una **acción**:
  - **desplegar** (escribe qué cambia): pruebas, sube, revisa y deja los dos links en la versión nueva;
  - **revisar sin desplegar**: sube al `/dev` de prod y corre la revisión del entorno; el equipo no ve nada.
    Sirve para saber si un despliegue va a pasar;
  - **regresar a una versión** (escribe el número): los dos links vuelven a una versión que ya existe, sin
    subir código. Si una versión salió mal, el equipo vuelve a la anterior en un minuto.

  Al terminar, la ejecución muestra un resumen: versión de antes y de ahora, con qué cuenta corre la
  app, la revisión del entorno y a qué versión regresar si algo salió mal. La cuenta del secreto tiene
  que ser `cuentaProd` de `tools/subir/destinos.json`; si no, no se toca producción. El botón aparece para `master` hasta que el workflow esté en `master`, es
  decir, después de mezclarlo.

### Producción solo desde la Action: con qué cuenta corre la app

La app de producción corre **con la cuenta de quien movió los despliegues** (`executeAs:
USER_DEPLOYING`), no con la del dueño del proyecto. Si cada quien despliega desde su máquina, la
app cambia de cuenta en cada versión, y basta con que a una le falte permiso de editor en una
carpeta o una plantilla para que algo deje de funcionar para todos (8-oct: Emmanuel desplegó la
v66 y las inspecciones dejaron de generar PDF).

Por eso:

- `subir.js prod --desplegar` **solo corre en la Action**, que usa siempre la cuenta del secreto
  `CLASPRC_JSON` (el paso "Cuenta con la que va a correr la app" la imprime). Desde una máquina
  truena, salvo con `--desde-aqui`: entonces la app pasa a correr con la cuenta de clasp de esa
  persona.
- `npm run push:prod` (subir sin desplegar) sigue funcionando desde cualquier máquina: no cambia
  la cuenta de nadie.
- **Antes de desplegar se revisa que esa cuenta pueda escribir** (`revisarEntorno`): ser editora de
  cada libro y de cada carpeta que no sea de solo lectura (`soloLee` en `REVISION_CARPETAS`) y poder
  copiar cada plantilla de PDF (`revisionPlantillas_`: responsiva, adherente, arqueo, Líneas y las de
  MODELOS INSPECCION). Si falta algo, es error y no se despliega. Una plantilla nueva se agrega ahí.
- Lo ideal es que el secreto sea de una **cuenta institucional** dueña de todo, no de una persona.

### Activarla (una vez)

1. **El secreto con las credenciales de clasp.** En tu máquina, abre `~/.clasprc.json`
   (`C:\Users\<tú>\.clasprc.json`) y copia todo su contenido. En GitHub → Settings → Secrets
   and variables → Actions → **New repository secret**, nómbralo `CLASPRC_JSON` y pega el
   contenido.
   - Ese archivo trae el acceso de **tu cuenta de Google** a Apps Script y Drive. Cualquiera
     que pueda editar los workflows del repo podría usarlo, así que solo debe tenerlo un repo
     con acceso restringido.
   - Si un día se filtra, revoca el acceso en
     https://myaccount.google.com/permissions ("clasp") y vuelve a hacer `npx clasp login`.
2. **(Recomendado) Aprobación para producción.** En Settings → Environments → **New
   environment**, créalo con el nombre `produccion` y en "Required reviewers" pon quién
   aprueba. Así un "Run workflow" a producción espera a que esa persona le dé OK.
3. Haz push a `ayrton` y revisa la pestaña **Actions**.

# Control Interno — Ciudad Maderas

Reemplazo del sistema actual de AppSheet (vehículos, telefonía, accesorios,
caja chica) por una web app propia construida 100% en **Google Apps Script**
(`HtmlService` + Sheets como base de datos). Ver `docs/mapeo-modulos.md` para
el detalle de cómo se mapean los módulos del sistema anterior.

> **Bases de datos**
> - **Pruebas** (la que usan los proyectos DEV): `1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI`
>   — copia con la misma estructura que producción.
> - **Producción** (la real, la usa AppSheet hoy): ControlVehicular. **No apuntar
>   ningún proyecto DEV a producción.**

## Arquitectura

```
src/
├── Code.gs              doGet(), entrada de la web app
├── Router.gs             renderiza el shell (Index.html)
├── Auth.gs                login propio (correo + hash de contraseña) y sesión
├── ClientApi.gs           únicas funciones globales llamables desde el cliente
├── config/Config.gs       IDs de spreadsheets y constantes (via Script Properties)
├── services/               un archivo por módulo (lógica de negocio + CRUD)
├── utils/SheetUtils.gs     CRUD genérico sobre Google Sheets
└── html/
    ├── Index.html           shell (sidebar + contenedor de vistas)
    ├── styles.html           CSS
    ├── views/                una vista (template) por módulo
    └── js/                   api.js (wrapper de google.script.run) + app.js (router SPA)
        └── componentes/       piezas reutilizables (ver abajo)
tests/                         pruebas de los componentes (npm test)
```

### Componentes reutilizables (`src/html/js/componentes/`)

| Componente | Para qué |
|---|---|
| `datatable` | Tabla completa: búsqueda, filtros, orden, selección, edición, panel de detalle, acciones por fila, exportar. Instrucciones y ejemplos al inicio del archivo. |
| `iconos` | `Iconos.svg('editar')` o cualquier nombre de [lucide.dev](https://lucide.dev/icons). Para cambiar un ícono en toda la app, edita su renglón en `ICONOS`. |
| `notificar` | Avisos abajo a la derecha (`Notificar.exito/error/info`), en vez de `alert()`. |
| `confirmar` | Confirmaciones propias (`await Confirmar.pedir({...})`), en vez de `confirm()`. |
| `tabs` | Pestañas dentro de una vista. |
| `exportar-excel` | Descarga un `.xlsx` real. |

Para extender la tabla sin tocar su código: `accionesFila`, `accionesSeleccion` y
`DataTable.registrarTipo(...)` (tipos de columna nuevos, p. ej. moneda).

### Datos copiados entre hojas

Si tu módulo guarda datos que pertenecen a otra hoja (p. ej. la PLACA de `VEHICULOS`),
sigue las reglas de [`docs/relaciones.md`](docs/relaciones.md) y anótalo en su inventario.

**Antes de subir un cambio a un componente**, corre las pruebas (tardan segundos):
```
npm test
```

Cada módulo (Vehículos, Telefonía, Accesorios, Caja Chica) vive en su **propio
spreadsheet**, referenciado por ID en Script Properties — no un solo archivo
gigante. `AccesoriosService.gs` es el módulo de referencia, ya funcional de
punta a punta (catálogo + movimientos + stock).

## Entornos: cada quien con su proyecto DEV

Somos varios trabajando a la vez y `clasp push` **reemplaza el proyecto de
Apps Script completo** con lo que tienes en tu carpeta. Si todos hiciéramos
push al mismo proyecto, nos borraríamos los cambios unos a otros. Por eso:

```
            GitHub (master = la versión oficial)
           ╱            │             ╲
     rama de A      rama de B      rama de C
         │              │              │
    clasp push     clasp push     clasp push
         ▼              ▼              ▼
     DEV de A       DEV de B       DEV de C      ← cada quien prueba en el suyo
          ╲             │             ╱
           └── BD de PRUEBAS (1fC77…) ──┘

  master ──clasp push──► proyecto COMPARTIDO (1NbOczw…)
```

- **`.clasp.json` NO está en git.** Cada quien tiene el suyo apuntando a su
  propio proyecto DEV.
- **El proyecto compartido** (`1NbOczw_H8UJ7adxRP4h_jl9VlfyvxM3mANYsaz12U5uo8Gj0BmfIYN3k`)
  solo recibe lo que ya está en `master`.

### Reglas

1. **Nadie edita en el editor web de Apps Script.** Todo cambio pasa por git;
   lo que se edite ahí se pierde en el siguiente push.
2. **Nadie hace `clasp push` al proyecto compartido desde su rama.**
3. **Ramas cortas, merge seguido** (cada 1–2 días), no todo al final.
4. Antes de empezar a trabajar: `git pull` en `master` y rebase/merge a tu rama.

## Ramas

Cada quien trabaja en **su rama personal** y abre Pull Request a `master`:

| Persona | Rama |
|---|---|
| Ayrton | `ayrton` |
| Jorge | `jorge` |
| Emmanuel | `emmanuel` |

Como nos dividimos por módulos casi no deberíamos chocar, pero **junta tu rama
con master seguido** (cada 1–2 días) para no acumular diferencias.

## Setup (una sola vez por persona)

Requisitos: **git** y una cuenta `@ciudadmaderas.com`. Node y clasp los instala
el script (sin permisos de administrador).

1. **Clonar el repo** (o, si ya lo tenías, `git checkout master` y `git pull`):
   ```
   git clone https://github.com/15GaelNG/Inventario_Control-Interno
   cd Inventario_Control-Interno
   ```

2. **Activar la Apps Script API** en tu cuenta (una vez):
   https://script.google.com/home/usersettings

3. **Correr el script** con tu nombre de rama:
   ```
   powershell -ExecutionPolicy Bypass -File .\setup-dev.ps1 -Nombre jorge
   ```
   Hace todo esto (y lo puedes volver a correr sin problema):
   - instala **fnm + Node LTS** si faltan, y agrega fnm a tu `$PROFILE`
   - `npm install` (clasp) y `clasp login` si no has iniciado sesión
   - te cambia a tu rama y la pone al día con `master`
   - crea **tu proyecto DEV** en Apps Script y escribe tu `.clasp.json`
     (si tu `.clasp.json` viejo apuntaba al compartido, lo mueve a
     `.clasp.compartido.json`)
   - sube el código a tu DEV y abre el editor

4. **En el editor que se abrió** (una vez):
   - Lista de funciones → `configurarEntornoDev` → **Ejecutar** → acepta permisos.
     Deja las Script Properties apuntando a la BD de pruebas.
   - **Implementar → Probar implementaciones** → copia la URL que termina en
     `/dev`. Esa es tu app de pruebas: siempre corre el último código que
     subiste.

<details>
<summary>Setup manual (si el script falla)</summary>

1. `npm install` y `npx clasp login`
2. En una carpeta temporal (para no sobrescribir el `appsscript.json` del repo):
   `npx clasp create-script --type standalone --title "Inventario DEV - TuNombre"`
   y copia el `scriptId` de su `.clasp.json`.
3. En el repo: copia `.clasp.json.example` a `.clasp.json` y pega tu `scriptId`.
4. `npx clasp push --force`
5. Script Properties de tu proyecto DEV: `ENTORNO=DEV`, y `SS_ID_USUARIOS`,
   `SS_ID_VEHICULOS`, `SS_ID_ACCESORIOS` = `1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI`
   (o corre `configurarEntornoDev`).

</details>

## Día a día

```
git checkout jorge          # tu rama
git pull
git merge origin/master     # traer lo que ya se juntó en master
# ... programar ...
npm run push                # sube a TU DEV (o `npm run watch` para subir al guardar)
# ... probar en tu URL /dev ...
git add -A
git commit -m "..."
git push                    # y abrir Pull Request de tu rama a master
```

## Publicar al proyecto compartido

Solo desde `master` actualizado, y avisando al equipo:
```
git checkout master && git pull
npx clasp --project .clasp.compartido.json push --force
```
(`.clasp.compartido.json` es un `.clasp.json` con el scriptId `1NbOczw…`; también
está ignorado por git.)

## Estado actual

- ✅ Login + roles + sesión
- ✅ Módulo Accesorios completo (catálogo, movimientos, stock)
- ✅ Módulo Incidencias (registro, cierre, edición, eliminación)
- ⏳ Vehículos, Telefonía, Caja Chica, Inspecciones con diagrama — services
  con estructura base, falta terminar esquema de columnas y UI (ver
  `docs/mapeo-modulos.md`)

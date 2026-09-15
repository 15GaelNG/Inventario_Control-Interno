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

## Setup (una sola vez por persona)

1. **Clonar el repo e instalar clasp**
   ```
   git clone https://github.com/15GaelNG/Inventario_Control-Interno
   cd Inventario_Control-Interno
   npm install
   npx clasp login          # con tu cuenta @ciudadmaderas.com
   ```

2. **Crear TU proyecto DEV** — en una carpeta temporal, para que clasp no
   sobrescriba el `appsscript.json` del repo:
   ```
   mkdir ../clasp-dev-temp
   cd ../clasp-dev-temp
   npx clasp create-script --type standalone --title "Inventario DEV - TuNombre"
   cat .clasp.json          # copia el "scriptId"
   cd ../Inventario_Control-Interno
   ```

3. **Apuntar tu `.clasp.json` a tu proyecto DEV**
   ```
   cp .clasp.json.example .clasp.json
   ```
   Edita `.clasp.json` y pega tu `scriptId`.

   > ⚠️ Si ya tenías el repo clonado de antes, tu `.clasp.json` todavía apunta
   > al proyecto COMPARTIDO (`1NbOczw…`). Cámbialo **antes** de hacer push.

4. **Subir el código a tu DEV**
   ```
   npx clasp push --force
   npx clasp open-script
   ```

5. **Script Properties** (en tu proyecto DEV → ⚙️ Configuración del proyecto →
   Propiedades del script):

   | Propiedad | Valor |
   |---|---|
   | `ENTORNO` | `DEV` |
   | `SS_ID_USUARIOS` | `1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI` |
   | `SS_ID_VEHICULOS` | `1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI` |
   | `SS_ID_ACCESORIOS` | `1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI` |

6. **URL de pruebas**: Implementar → Probar implementaciones → copia la URL que
   termina en `/dev`. Siempre corre el último código que subiste, sin crear
   versiones. La primera vez te pedirá autorizar permisos.

## Día a día

```
git checkout master && git pull
git checkout -b modulo/verificaciones     # o tu rama existente
# ... programar ...
npm run push            # sube a TU DEV (o `npm run watch` para subir al guardar)
# ... probar en tu URL /dev ...
git add -A && git commit -m "..."
git push -u origin modulo/verificaciones  # y abrir Pull Request a master
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

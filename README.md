# Control Interno — Ciudad Maderas

Reemplazo del sistema actual de AppSheet (vehículos, telefonía, accesorios,
caja chica) por una web app propia construida 100% en **Google Apps Script**
(`HtmlService` + Sheets como base de datos). Ver `docs/mapeo-modulos.md` para
el detalle de cómo se mapean los módulos del sistema anterior.

> Este repo no toca ni depende del ambiente de pruebas de AppSheet existente.
> Todo corre sobre spreadsheets nuevos, propios de este proyecto.

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

## Setup inicial

1. **Instalar dependencias locales** (clasp):
   ```
   npm install
   ```

2. **Login con tu cuenta de Google** (abre el navegador, hazlo tú mismo en
   una terminal interactiva — Claude no puede completar el login por ti):
   ```
   npx clasp login
   ```

3. Este proyecto ya está enlazado (`.clasp.json`) al Apps Script existente:
   `https://script.google.com/home/projects/1NbOczw_H8UJ7adxRP4h_jl9VlfyvxM3mANYsaz12U5uo8Gj0BmfIYN3k`

4. **Subir el código**:
   ```
   npm run push
   ```

5. **Configurar Script Properties** (Editor de Apps Script → ⚙️ Configuración
   del proyecto → Propiedades del script) — crear los spreadsheets vacíos
   correspondientes y pegar sus IDs:
   - `SS_ID_USUARIOS`
   - `SS_ID_VEHICULOS`
   - `SS_ID_TELEFONIA`
   - `SS_ID_ACCESORIOS`
   - `SS_ID_CAJACHICA`
   - `ENTORNO` = `DEV`

   Para el módulo de Accesorios (el que ya funciona), ese spreadsheet necesita
   dos hojas: `ARTICULOS` (columnas `ID, CATEGORIA, NOMBRE, MARCA,
   STOCK_MINIMO`) y `MOVIMIENTOS` (columnas `ID, ID_ARTICULO, TIPO, CANTIDAD,
   FECHA, USUARIO, COMENTARIOS`).

   Para Usuarios, la hoja `USUARIOS` necesita: `ID, CORREO, NOMBRE, SALT,
   PASSWORD_HASH, ROL, ACTIVO, DEPARTAMENTO, DPTOS_PERMITIDOS`.

6. **Desplegar como Web App**: Editor de Apps Script → Implementar → Nueva
   implementación → Aplicación web. Acceso: solo dominio `ciudadmaderas.com`.

## Flujo de trabajo

- Editar código localmente (con git para versionar).
- `npm run push` (o `npm run watch` para subir cambios automáticamente).
- Probar en la URL de la implementación (o `npm run open` para abrir el editor).

## Estado actual

- ✅ Login + roles + sesión
- ✅ Módulo Accesorios completo (catálogo, movimientos, stock)
- ⏳ Vehículos, Telefonía, Caja Chica, Inspecciones con diagrama — services
  con estructura base, falta terminar esquema de columnas y UI (ver
  `docs/mapeo-modulos.md`)

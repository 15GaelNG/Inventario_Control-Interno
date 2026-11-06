# Sesión del 5-nov-2026: Ticket en la responsiva de Líneas, PR #17 y motor único de PDF (fases 0 y 1)

Lo que se hizo en esta sesión y dónde quedó cada cosa, para retomarlo aunque cambie el plan. El plan completo del motor
único está en `docs/pdf-motor.md`.

## 1. Ticket en la responsiva de celular (hecho, en producción vía PR #17)

- **Problema:** en Líneas, al hacer la responsiva el sistema pide el ticket, pero el PDF no lo mostraba.
- **Causa:** la plantilla (CARTA RESPONSIVA EQUIPO CELULAR) no tenía marcador. Se agregó `TICKET: <<[TICKET]>>` después
  de JEFE DIRECTO, pero seguía sin salir porque la hoja RESPONSIVAS **no tenía columna TICKET**: el valor no se guardaba.
- **Arreglo:** `src/services/lineas/LineasCaptura.gs`
  ```js
  const COLUMNAS_NUEVAS = { INSPECCION: ['No EMPLEADO', 'DIRECTOR', 'ACCESORIOS'], RESPONSIVA: ['JEFE DIRECTO', 'TICKET'] };
  ```
  La primera responsiva que trae ticket crea la columna.
- Las plantillas son las mismas en el DEV y en prod (solo se leen), así que editar una plantilla afecta prod al momento.

## 2. Subir a prod sin los commits de Jorge (PR #17, fusionado)

- Jorge pidió no subir todavía c568b91b, 2d899973 y ff336b94 (Inspección Vehicular: aviso por correo, tickets de
  inspección, autosave, puntaje relativo, edición y PIPA).
- Se revirtieron los tres en `master` (3 commits "Revert …") y se resolvió el conflicto en `app-vehiculos-ficha.html`:
  se quedan los imports y manejadores de responsiva/adherente, se quitan `abrirEditarInspeccionFicha` /
  `abrirSubirFormatoInspeccionFicha` y el `return` de inspección.
- **Para regresarlos:** revertir los 3 commits "Revert …" (no el merge) cuando Jorge diga.
- Producción quedó en la v160.

## 3. Motor único de PDF (plan aprobado)

Tres motores hacen lo mismo y hoy son lentos:

| Motor | Documentos |
|---|---|
| `PdfService` + `Plantilla.gs` | Inspección, Responsiva y Adherente vehicular (+ vista previa) |
| `LineasPdf.gs` | Responsiva e Inspección de celular |
| propio de `ArqueosService` | Arqueo |

Decisiones del usuario:
- Se queda la sintaxis `<< >>`.
- Arqueos entra **como última fase**, avisando a Jorge antes.
- Un marcador que el motor no entienda **queda visible en el PDF y se avisa**.
- Plantilla "preparada" (interlineado ya aplicado) solo si la medición lo justifica, y **producción sigue con la
  plantilla de siempre** hasta comprobar que la nueva sale perfecta (ID de plantilla por entorno).

Restricciones:
- No tocar `Plantilla.seccionesDe` ni `InspeccionesService.gs`.
- `PdfService.generar` mantiene su API, porque los commits de Jorge regresan.
- Nada a prod sin autorización.

Fases: 0 medir · 1 inventario + prueba diferencial · 2 `Plantilla` aprende lo de Líneas · 3 motor de documento en
`PdfService` + comparador · 4 Líneas sobre `PdfService` · 5 Arqueos · 6 optimizar con los números.

### Fase 0: medir (rama `pdf-medir`, commits 5ea59ca9 y 715d4355)

- Nuevo `src/utils/Cronometro.gs`:
  - `Cronometro.iniciar(nombre, alMarcar)` → `marcar(paso)`, `tiempos()`, `total()`, `linea()`, `anotar()`.
  - Cada paso mide desde el anterior. `anotar()` deja `[tiempo] <nombre> · total N ms · …` en el registro y lo guarda
    en CacheService (últimas 60, 6 h).
  - **`cronometroResumen()`** (correr en el editor, archivo `utils/Cronometro.gs`): una línea por PDF y promedios por
    paso para cada tipo de documento.
- Pasos medidos:
  - **`PdfService.generar` / `generarVistaPrevia`:** carpeta, nombre único, copiar, abrir, imágenes, texto, formato,
    guardar, convertir, crear archivo, compartir, papelera.
  - **`LineasCaptura.generarPdf` + `LineasPdf.generarPdfDesdePlantilla`**, en una sola línea:
    - lado de `LineasCaptura`: leer fila y evidencia, firmas de la caché, patrón, carpeta destino, firmas a imagen;
    - lado de `LineasPdf`: copiar, abrir, letra chica, bloques If, etiquetas e imágenes, interlineado, guardar,
      convertir, quitar salto, crear archivo, compartir, papelera;
    - al final: reemplazar el PDF anterior y ligar a la hoja.
  - **`ArqueosService.generarPdfArqueo_`** (cambio mínimo, es archivo de Jorge): copiar y llenar, convertir, crear
    archivo, compartir, papelera.
- Las etiquetas distinguen `pdf celular-…`, `pdf vehicular-…` y `pdf ARQUEO`, para que los promedios no se mezclen.
- Pruebas: `tests/cronometro.test.cjs` (nueva). Además, 4 pruebas existentes cargan `Cronometro.gs`, y `pdf-render`
  revisa el orden de los pasos.
- **Estado:**
  - Ya está subido al DEV de Ayrton.
  - El commit 715d4355 sigue local: va al PR #18 cuando se confirme la prueba en el DEV.
  - El usuario ya generó 4 responsivas. **Falta:** correr `cronometroResumen()` en el DEV, pegar el resultado y llenar
    la tabla base de `docs/pdf-motor.md`. Lo ideal es agregar 1–2 inspecciones vehiculares y un arqueo.

### Fase 1: inventario y prueba diferencial (rama `pdf-inventario`, commit 6d17202e, encima de `pdf-medir`)

Es una red de seguridad automática para cuando cambie el motor. No revisa los PDF ya generados ni cambia nada de lo que
hace hoy la app.

- `src/PdfHerramientas.gs`: `pdfInventarioMarcadores_()`.
  - Mismo candado que `revisionEntorno_`: solo quien desplegó.
  - Recorre `revisionPlantillas_()`, abre cada plantilla **solo para leer** y cuenta sus `<<…>>` (cuerpo, encabezado y
    pie), los `If` que cruzan párrafos, los párrafos y las tablas.
- `src/Code.gs`: nueva ruta `?revisar=plantillas` en `doGet`.
- `tools/pdf/inventario.js [dev|lab|prod]`: pide esa ruta en `/dev`, ordena el resultado y lo guarda en
  `tests/fixtures/plantillas-marcadores.json`. Solo trae nombres de columnas y fórmulas, nada de personas.
- `tests/referencia/plantilla-antes.js` y `tests/referencia/lineas-expresiones-antes.js`: copias congeladas de cómo
  resuelven los marcadores hoy `Plantilla.gs` y `LineasPdf`. No se editan.
- `tests/pdf-expresiones-diferencial.test.cjs`: compara cada marcador real × 7 juegos de datos.
  - Vehículos: el motor nuevo debe dar lo mismo que hoy.
  - Líneas: queda como `todo` (es la meta de la fase 2).
  - Arqueo: se compara en la fase 5.
  - Las diferencias aceptadas van en `ACEPTADAS`, cada una con su razón.
  - Sin fixture, la prueba se salta.
- **Estado:** no se ha subido al DEV. Siguiente:
  1. `npm run push`.
  2. `node tools/pdf/inventario.js`.
  3. Commitear el fixture.
  4. Correr la diferencial.
  5. Reportar cuántas diferencias tiene Líneas y cuántos `If` cruzan párrafos.

## 4. Datos útiles

- **DEV de Ayrton:**
  - libro "DEV AYRTON - Copia de produccion 2026-10-30";
  - los PDF van a carpetas de pruebas en su raíz;
  - NUCOS VEHICULOS / NUCOS TELEFONICOS de pruebas: no toca producción (revisado con `revisarEntorno`).
- **Producción:** la Action "Subir a Apps Script" despliega solo desde `master` (Run workflow). Nunca `--desde-aqui`.
- **`npm run push`:** siempre marca como "cortado" archivos que solo existen en el DEV. Son falsos positivos.
- **Pruebas:** 3 fallan solo en Windows por CRLF y ya fallaban antes: `lineas-colores` y dos de
  `lineas-accesorios-inspeccion`.
- **Repo público:** los `.har` se quedan fuera de git (`.gitignore`).

## 5. Pendiente inmediato

1. Pegar la salida de `cronometroResumen()` y llenar la tabla base en `docs/pdf-motor.md`.
2. Subir `pdf-medir` al PR #18.
3. Subir `pdf-inventario` al DEV, correr el inventario y la diferencial, y decidir el PR de la fase 1.
4. Después, las fases 2–6 según `docs/pdf-motor.md`, con los cambios que se decidan.

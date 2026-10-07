# Helpdesk dentro del Control Interno — estrategia B

> **Qué es esto:** la estrategia elegida para mostrar en nuestra app lo que muestra el
> helpdesk de TI (`https://helpdesk-maderas.gphsis.com/app/formularios`), con nuestro propio
> diseño. Es un plan: todavía no hay código. Lo que falta medir está marcado como
> **pendiente** y no debe darse por hecho.

## El requerimiento

"Que lo que se muestra en el helpdesk se vea en nuestro sistema", y **que se vea bonito**:
con el diseño de la app, no como una página incrustada.

## Las restricciones que definieron la estrategia

- **El helpdesk es de TI, otro departamento.** No tenemos jurisdicción para pedirles nada:
  ni API oficial, ni llave de servidor, ni que acepten nuestros tokens, ni webhooks.
- **Un iframe no basta.** Mostraría su pantalla tal cual, no la nuestra.
- **El token de Google del usuario no sirve como llave.** El que obtenemos con
  `ScriptApp.getIdentityToken()` va dirigido (`aud`) a *nuestro* proyecto, no al helpdesk,
  y no hay forma legítima de pedirle a Google uno dirigido al de ellos.

Lo que queda es usar **la sesión que cada usuario ya tiene en el helpdesk** para consultar
los mismos endpoints que usa su página, que se ven en la consola del navegador.

## Por qué B y no las otras

| Opción | Por qué no |
|---|---|
| Leer los correos que manda el helpdesk | Solo muestra lo que viene en el correo; no alcanza para el requerimiento |
| Extensión de Chrome que manda los datos (no el token) | Más segura, pero hay que instalarla en cada equipo. Queda como plan de respaldo si los tokens duran poco (ver [Pendientes](#lo-que-falta-medir-antes-de-escribir-código)) |
| **B: el usuario pega su token en nuestra app** | **Elegida.** No hay que instalar nada |

## Cómo funciona

1. El usuario entra al helpdesk como siempre y copia su token (se le explica cómo en la
   pantalla de configuración).
2. Lo pega **una vez** en la pantalla "Conectar helpdesk" de nuestra app.
3. El servidor lo guarda (ver [Dónde vive el token](#dónde-vive-el-token-y-la-trampa-de-executeas))
   y, cada vez que el usuario abre el módulo, consulta el helpdesk con `UrlFetchApp`
   **desde el servidor**, a su nombre.
4. La respuesta se normaliza a nuestro formato y se pinta con los componentes de la app.
5. Cuando el helpdesk responda 401/403, el token caducó: se borra y la pantalla le pide al
   usuario que pegue uno nuevo. No se reintenta.

### Las llamadas van desde el servidor, nunca desde el navegador

- **CORS:** el front de Apps Script corre en `*.googleusercontent.com`; el helpdesk casi
  seguro no permite llamadas desde ahí.
- **El token no se expone** en el HTML ni viaja de regreso al cliente después de pegarlo.
- **El bug del `//`** (ver `CLAUDE.md`): las URLs del helpdesk viven en un `.gs`, no en un
  `.html`.

El scope `script.external_request` ya está en `src/appsscript.json`, porque Geotab y
Telefonía ya usan `UrlFetchApp`. No hay que pedir permisos nuevos a los usuarios.

## Dónde vive el token, y la trampa de `executeAs`

**La trampa:** la web app corre como `USER_DEPLOYING` (`src/appsscript.json`). Con eso,
`PropertiesService.getUserProperties()` **no es por usuario**: es la del que desplegó.
Si se usara como en los ejemplos de internet, **todos compartirían el mismo token**, y
cada persona vería los tickets del último que lo pegó.

Tampoco conviene cambiar a `USER_ACCESSING`: cada usuario tendría que tener acceso directo
al spreadsheet y a las carpetas de Drive, que es justo lo que `USER_DEPLOYING` evita.

**Lo que se hace:**

- Se guarda en **`PropertiesService.getScriptProperties()`**, con una llave por usuario:
  `HELPDESK_TOKEN:<correo>`.
- El correo sale de `Session.getActiveUser().getEmail()`, igual que en `src/Auth.gs`, y
  **nunca del cliente**. Si viniera del cliente, cualquiera podría pedir los tickets de
  otro cambiando el correo.
- Si `getActiveUser()` viene vacío, no se lee ni se guarda nada.

**Lo que esto NO protege, dicho sin rodeos:** quien sea **editor del proyecto de Apps
Script** puede leer esas propiedades. En la práctica, el equipo de desarrollo podría ver
los tokens. Por eso:

- Se guarda **solo el token**: nada de contraseñas ni cookies completas.
- Nunca se escribe en una hoja, en `Logger`, en `LOG_MIGRACION` ni en un mensaje de error.
- Hay un botón "Desconectar" que lo borra, y se borra solo al primer 401/403.
- No se guarda por más tiempo que el que el propio helpdesk le dé de vida.

## La capa `HelpdeskApi`

`src/services/HelpdeskApi.gs`, siguiendo el patrón de `GeotabService.gs`. **Todas** las
llamadas al helpdesk pasan por aquí. Cuando TI cambie su API (y lo va a hacer sin avisar,
porque no es una API pública), se arregla en un solo archivo.

| Función | Qué hace |
|---|---|
| `conectar(token)` | valida el token con una llamada barata y, si responde bien, lo guarda |
| `desconectar()` | borra el token del usuario actual |
| `estado()` | `{ conectado, correo }`, **sin** devolver el token |
| `listarTickets(filtros)` | la lista, ya normalizada a nuestro formato |
| `obtenerTicket(id)` | el detalle de un ticket |

Reglas:

- `muteHttpExceptions: true` y se revisa el código a mano, como en Geotab.
- **Normalizar en un solo lugar:** las pantallas nunca ven el JSON crudo del helpdesk,
  solo nuestro formato. Si ellos renombran un campo, no se rompe la pantalla.
- **Caché corta** con `CacheService.getUserCache()` (unos 60 s). Esta sí es por usuario
  aunque la app corra como `USER_DEPLOYING`; hay que confirmarlo en la primera prueba. Si
  no lo fuera, la llave de caché lleva el correo, igual que el token.
- **Pruebas en `tests/`** con respuestas de ejemplo del helpdesk (con datos falsos),
  sobre todo de la normalización y del manejo de 401/403.

## La pantalla

- Nuevo módulo en `src/html/js/` (por ejemplo `app-helpdesk.html`), incluido **después**
  de `app.html` en `src/html/Index.html`. Ver la estructura en `CLAUDE.md`.
- La primera vez muestra "Conectar helpdesk", con instrucciones paso a paso para copiar el
  token.
- Después, lista de tickets con filtros por estatus y el detalle al dar clic.
- Un enlace "Abrir en helpdesk" en cada ticket, para lo que no replicamos.

## Relación con nuestra hoja `TICKETS`

`TicketsService.gs` maneja una bitácora propia de atención (hoja `TICKETS`). **Su columna
`TICKET` es el folio del helpdesk** (confirmado el 07/10/2026 en sus 2,109 registros: los números
suben con el tiempo igual que los folios de allá).

No todo lo del helpdesk va en Tickets: solo 7 formularios, los de combustible y NIP (290, 291, 292,
293, 317), Holograma (149) y Uber (288). Salen de `MODULO_POR_FORMULARIO` en `HelpdeskService.gs`
(los que dicen `'tickets'`). Con eso, en la Bandeja:

- **Etiqueta en cada ticket** de esos formularios: "En Tickets" o "Falta registrar". La da
  `HelpdeskService.registrados`, que cruza el folio contra la columna `TICKET` (de la lista de
  Tickets ya guardada en caché; un registro con varios folios o con texto cuenta cada número) y
  contra lo registrado desde aquí (`ID TICKET CI` de `APP_HELPDESK`). **No llama al helpdesk.**
- **Bandeja "Por registrar"**, solo para quien ve Tickets: pide al helpdesk sus tickets de esos 7
  formularios (respeta los demás filtros: fechas, agente…) y enseña los que faltan. Si en la
  primera página quedan menos de 10, revisa hasta 2 páginas más solas; luego "Revisar 25 más".
- Al registrar uno, sale de "Por registrar". `R` vuelve a preguntar (alguien más pudo registrar).

Pendiente: el reporte de cobertura por mes (cuántos de esos formularios se registraron), con
`tickets/downloadExcelTickets`, que trae un rango de fechas en una sola llamada.

## Riesgos que se aceptan con esta estrategia

- **La API no es pública.** Cualquier cambio de TI puede romper el módulo sin aviso. Se
  mitiga con la capa única y con errores claros ("el helpdesk cambió; avisar a sistemas"),
  no con adivinanzas.
- **El tráfico sale de servidores de Google**, no de la red de la empresa. TI lo puede ver
  en sus bitácoras y bloquearlo.
- **Los editores del proyecto pueden ver los tokens** (ver arriba).
- **Si el token dura poco**, pegarlo cada rato vuelve incómoda esta opción y conviene pasar
  a la extensión.

## Lo medido (05/10/2026) y lo que falta

Todo se mide desde el navegador de un usuario, con F12 → Network → Fetch/XHR.
**Nunca se pega un token real en el repo, en un issue ni en un chat.**

- [x] **Cómo se autentica:** encabezado `authorization: <token>` (el JWT solo, sin `Bearer`).
      La página lo guarda en `localStorage`, llave `token`: se copia con un marcador (ver abajo).
- [x] **Cuánto dura:** 24 h (`exp` − `iat` = 86 400 s). Se pega una vez al día: aceptable con
      el marcador; si molesta, la extensión sigue de respaldo.
- [x] **Backend:** `https://helpdesk-backend.gphsis.com` (Express en Google Cloud,
      `access-control-allow-origin: *`). Aun así las llamadas van desde nuestro servidor.
- [x] **Validar el token:** `POST /login/autoLogin` → `{ status: 1, message: 'Sesión activa',
      data: { email, name, rol, idAreaAgent, … } }`.
- [x] **La lista:** `POST /tickets/list` con `{ filters: { agents, branches, forms, areas,
      department, customer, departmentCustomers, idTicket, status, priority: [], finishLoad:
      false }, pagination: { rowsPerPage: 25 } }` → `{ cantTotalTickets, tickets: [...] }`.
      Cada ticket trae título, notas, estatus y prioridad (con color), solicitante, agente,
      formulario, áreas, `dateCreationDB` (yyyy-MM-dd), `dateClose` (ISO) y mensajes sin leer.
      Forma de ejemplo (inventada): `tests/helpdesk.test.js`.
- [x] **La página siguiente** (corregido el 07/10/2026; el 05/10 se creyó que no había): por
      cursor, `pagination.nextPageLastIdTicket` = el `idTicket` del último de la página anterior
      (también existe `prevPageFirstIdTicket`). Al filtrar, la forma es `{ idStatus, idBranch, idForm,
      idPriority, idAgent, idDepartmentCustomer, dateCreation, dateCreationEnd (yyyy-MM-dd), … }`.
- [x] **Las pestañas de su inicio:** `POST /tickets/getTicketsListHome { get: 'departmentTickets' |
      'myTickets', applyFilters, pagination: { rowsPerPage } }` → `{ totalTickets, tickets }`, con
      menos campos (`nameUserDepartment`, `areaName`, `date` "dd-MM-yyyy hh:mm AM", sin `dateClose`).
      No se sabe cómo pagina: solo se usa la primera página.
- [x] **El detalle:** `POST /tickets/getTicket { idTicket, isTramite: 0 }` y
      `POST /tickets/getConversationTickets { idTicket }` (los mensajes vienen en HTML: se vuelven
      texto en el servidor). Las imágenes vienen dentro del HTML como
      `<img src="tickets/<id>/conversation<n>/file1.png">`; su página las pide con
      `chat/getCloudFile { path }` SIN la extensión, y la respuesta es el archivo en base64 como texto.
      Quiénes están en el ticket: `chat/getAllUsers { idTicket }` → `usersInvolved` (trae también
      `users`: TODOS los usuarios con correo; no se guardan). `chat/getTickets` trae la misma
      conversación con menos campos. `getTicketTimeline` (cambios de estatus) todavía no se usa.
      **Ojo:** su página llama `POST /tickets/markMessageAsSeen` al abrir un ticket; ESCRIBE (lo
      marca como leído). Nuestra app no lo llama nunca.
- [x] **Los catálogos:** `POST /tickets/getFilters { isTramite: 0 }` trae estatus (1 Abierto,
      2 Pendiente, 3 Resuelto, 4 Cerrado, 7 Abierto sin asignación, 8 Reabierto), prioridades
      (Baja, Media, Alta, Urgente, con color), formularios y grupos de la persona.
      Medido con un HAR (F12 → Network → "Save all as HAR (sanitized)"): es la forma más rápida
      de capturar todo de una vez. El HAR trae el token en el cuerpo de autoLogin y datos reales:
      se lee con un script que tapa los tokens, no se sube (`*.har` en .gitignore) y se borra.
- [x] **¿Qué ve cada usuario?** Lo que su token ve en el helpdesk (p. ej. "tickets de mi
      departamento" según sus permisos allá).
- [x] **Las respuestas del formulario de un ticket:** `POST /homeT/getNewTicketCatalogs { isTramite: null,
      idForm, idTicket, desarrollo: null, condominio: null }` → `fields.arrayForm.arrayForm.fields`
      (los campos del formulario), `fields.datas.dataAnswer` (`{ idField, value }` de ESE ticket) y
      `dataComponent4` (las opciones de los select). El catálogo de los formularios de nuestro grupo
      está en `Catalogo_Maestro_HelpDesk_Control_Interno.xlsx`. Todavía no se usa.
- [x] **Otras rutas vistas (07/10/2026), sin usar:** `dashboard/getStatusTikets` (KPIs: se dejó fuera a
      propósito), `tickets/catalog`, `filters/getDashboardFilters`, `headquarters/getBranches`,
      `reports/tickets/byForm/getReportsByForm`, `tickets/downloadExcelTickets`, `tickets/getTicketsReject`,
      `survey`, `solutions/getSolutions`. Todas leen; ninguna escribe.
- [ ] Si la columna `TICKET` de nuestra hoja `TICKETS` es el folio del helpdesk.

## Lo que ya está (src/services/HelpdeskApi.gs)

`conectar` (valida formato, que el correo del token sea el de la sesión, que no haya vencido, y
una llamada a autoLogin), `desconectar`, `estado` (sin llamar al helpdesk), `listarTickets`
(25 por página con "Cargar más"; filtros de estatus, grupo, formulario, prioridad, agente, departamento
y fechas; o las vistas "Mi departamento" y "Los que yo levanté"), `filtros` (una vez por hora),
`detalle` (ticket + conversación en texto plano + involucrados, sin marcarlo como leído; 3 llamadas) y
`archivo` (una imagen o PDF de la conversación, solo de un ticket que la persona abrió y solo al darle clic). Límites para no saturarlo: la lista se reutiliza 60 s, 2 s
mínimo entre llamadas de una persona, 10 por minuto por persona y 30 entre toda la app, una
página por llamada, cero reintentos, y ante 429/5xx toda la app se detiene lo que pida
`Retry-After` (o 2 min). 401/403 borra el token. Pruebas: `tests/helpdesk.test.js`.

**La familia Help Desk (07/10/2026).** Bandeja, Formularios, Registrados y Conexión
(`src/html/views/helpdesk.html`, `src/html/js/app-helpdesk.html`), con identidad propia (acento índigo,
`.hd-tema`). La Bandeja sigue a Zendesk / Help Scout: bandejas a la izquierda (filtros guardados: Abiertos,
Sin asignar, Pendientes, Resueltos, Mi departamento, Los que levanté), la lista al centro y el ticket a la
derecha con la conversación como chat y un panel con quien lo pide, propiedades, formulario y
participantes. Teclado: J/K, /, R, F, 1–7, Esc.

**Lo que cuesta cada cosa en llamadas al helpdesk** (límite: 15 por minuto por persona, 1 s entre
operaciones, 40 por minuto en toda la app):

| Acción | Llamadas |
|---|---|
| Abrir una bandeja | 1 (se reutiliza 60 s) |
| Abrir un ticket que vino en la lista | 1 (la ficha ya está, 15 min) |
| Abrir un ticket por #folio | 2 |
| Volver a abrir un ticket | 0 (memoria de la pantalla) |
| Buscar por texto | 0 (filtra lo que ya llegó) |
| Pasar con J/K por varios tickets | 1, del ticket donde se detiene |
| Ver el formulario | 1, solo al pedirlo (30 min) |
| Ver una imagen | 1, solo al pedirla |

`chat/getAllUsers` ya no se usa: quiénes están en el ticket salen de la conversación.

**El marcador "Token helpdesk"** (Chrome → nuevo marcador, en la URL):
`javascript:(()=>{const t=localStorage.getItem('token');if(!t){alert('Primero inicia sesión en el helpdesk');return;}navigator.clipboard.writeText(t).then(()=>alert('Token copiado: pégalo en Control Interno'),()=>prompt('Copia tu token:',t));})()`
Solo lee el token del propio navegador y lo copia; no lo manda a ningún lado.

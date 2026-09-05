# Documentacion del Proyecto ITEC.BA

Este repositorio contiene el codigo fuente de la plataforma ITEC.BA, dividida en dos aplicaciones principales: un frontend interactivo y un backend para la gestion de datos y logica de negocio. Este documento esta disenado para proporcionar a los desarrolladores que se integren al proyecto toda la informacion necesaria para entender la arquitectura, configurar el entorno local y comenzar a contribuir.

## Arquitectura y Estructura del Proyecto

El proyecto esta dividido en dos directorios principales: [`itecba-frontend`](https://github.com/iTEC-BA/itecba.frontend) y `itecba-backend`. Cada uno posee una arquitectura estructurada para favorecer la escalabilidad y el mantenimiento.

### Backend (`itecba-backend`)

El backend esta construido con **Node.js + Express 5** (ESM, `"type": "module"`), y utiliza un enfoque de arquitectura basada en modulos (**Feature-based / Screaming Architecture**): cada dominio de negocio vive en su propia carpeta con todo lo que necesita (rutas, controlador, modelo, servicio).

**Estructura de directorios:**

```
itecba-backend/
├── render.yaml                    # Config de despliegue (Render)
├── src/
│   ├── index.js                   # Punto de entrada: middlewares, montaje de rutas, cron jobs
│   ├── config/                    # Conexiones a bases de datos y servicios externos
│   │   ├── mongo.js                 # Conexion Mongoose -> MongoDB Atlas
│   │   ├── firebase-admin.js        # Firebase Admin SDK (Auth + Firestore)
│   │   ├── supabase.js              # Cliente Supabase (Postgres)
│   │   ├── turso.js                 # Cliente Turso/LibSQL (foro anonimo) + init schema
│   │   └── mailer.js                # Nodemailer (Gmail SMTP)
│   ├── middlewares/
│   │   ├── authMiddleware.js        # verifyToken (Firebase) + requireAdmin
│   │   ├── errorHandler.js          # AppError + manejador global de errores
│   │   └── validate.js              # Wrapper de express-validator
│   ├── modules/                     # Un directorio por dominio de negocio
│   │   ├── ads/                       # Anuncios / avisos institucionales
│   │   ├── ais/                        # Chatbot IA (GROQ)
│   │   ├── aulas/                      # Buscador de aulas / espacios físicos
│   │   ├── benefits/                   # Beneficios y canje de puntos
│   │   ├── calendar/                   # Calendario academico (Supabase)
│   │   ├── courses/                    # Cursos / videotecas de YouTube
│   │   ├── faq/                        # Preguntas frecuentes
│   │   ├── forum/                      # Foro anonimo estilo "X/Twitter" (Turso)
│   │   ├── groups/                     # Grupos de WhatsApp/Telegram por comision
│   │   ├── links/                      # Enlaces institucionales rapidos
│   │   ├── messages/                   # Mensajeria interna admin -> alumno
│   │   ├── notifications/              # Web Push (VAPID)
│   │   ├── padron/                     # Scraping del padron de examenes (Puppeteer)
│   │   ├── pageAccess/                 # Feature flags de paginas (Firestore)
│   │   ├── points/                     # Sistema de gamificacion por puntos
│   │   ├── progress/                   # Progreso academico del alumno (Firestore)
│   │   ├── resources/                  # Repositorio de apuntes/materiales
│   │   ├── subjects/                   # Plan de estudios / correlatividades (Supabase)
│   │   ├── trueketec/                  # Intercambio de comisiones entre alumnos
│   │   └── users/                      # Administracion de usuarios (Firebase Auth)
│   └── utils/
│       └── normalize.js              # Normalizacion de strings para busqueda (sin tildes)
```

Cada modulo encapsula, segun corresponda: `*.controller.js` (logica de request/response), `*.model.js` (esquema de datos), `*.routes.js` (definicion de endpoints + validaciones) y `*.service.js` (logica de negocio reutilizable, cuando el controlador solo no alcanza).

**Librerias principales y su uso:**
* **Express (v5):** Framework principal utilizado para montar el servidor HTTP y enrutar las peticiones.
* **Mongoose:** Object Data Modeling (ODM) para MongoDB, utilizado para definir esquemas y realizar consultas a la base de datos de manera estructurada.
* **Firebase-Admin:** SDK administrativo de Firebase, empleado para validacion de tokens de autenticacion (Firebase Auth), gestion de usuarios y como base de datos NoSQL (Firestore) para datos que se leen mucho desde el frontend en tiempo real (puntos, progreso academico, feature flags).
* **@supabase/supabase-js:** Cliente de Supabase (Postgres administrado), usado para el calendario academico y el plan de estudios/materias, datos tabulares y relacionales.
* **@libsql/client (Turso):** Cliente de una base SQLite distribuida, usada exclusivamente por el modulo de **Foro anonimo** (posts, votos, reposts, banners, suscripciones push).
* **@google/generative-ai / GROQ API:** El chatbot institucional actualmente consume la API de **GROQ** (endpoint compatible con OpenAI, modelo `openai/gpt-oss-20b`), con `@google/generative-ai` disponible como dependencia para integraciones con Gemini.
* **Ytpl:** Herramienta utilizada para extraer metadatos e informacion de listas de reproduccion de YouTube, empleada en el modulo de `courses` para importar videotecas.
* **Cloudinary + Sharp:** Subida, compresion (WebP, resize a 600x600) y almacenamiento de imagenes (usado en el modulo de `aulas`).
* **Puppeteer:** Automatizacion de navegador headless, usada en el modulo `padron` para scrapear el padron de examenes de una pagina externa (CloudFront).
* **web-push:** Envio de notificaciones push (protocolo VAPID) a los suscriptores del navegador.
* **Nodemailer:** Envio de correos transaccionales (reportes de grupos, mensajeria interna) via SMTP de Gmail.
* **node-cron:** Tareas programadas (auto-ping anti-sleep en Render, limpieza de publicaciones expiradas de TruekeTEC, recordatorios de calendario).
* **Cors, Helmet, Morgan, Compression, Express-rate-limit:** Conjunto de librerias de infraestructura para manejo de politicas CORS, seguridad de cabeceras HTTP, registro de peticiones (logs), compresion gzip y prevencion de ataques de fuerza bruta o abuso de la API.
* **express-validator:** Validacion y sanitizacion declarativa de `body`/`query`/`param` en cada ruta, con un middleware (`validate.js`) que corta la petición devolviendo `400` si hay errores.

---

## Persistencia de datos: arquitectura poliglota

El backend **no usa una unica base de datos**. Cada tipo de dato vive en el motor que mejor se ajusta a su patron de acceso:

| Motor | Uso | Modulos que la usan |
|---|---|---|
| **MongoDB (Mongoose)** | Contenido "de catalogo" con forma variable: anuncios, cursos, grupos, recursos, beneficios, FAQs, aulas, TruekeTEC, puntos/actividades. | `ads`, `courses`, `groups`, `resources`, `benefits`, `faq`, `aulas`, `trueketec`, `points`, `links`, `messages`, `ais` (contexto de IA) |
| **Firebase Auth + Firestore** | Identidad de usuario (login), rol, puntos en tiempo real, progreso academico y feature flags que el frontend necesita leer con `onSnapshot` sin pegarle al backend. | `authMiddleware`, `users`, `progress`, `pageAccess`, otorgamiento de puntos (`points.service.js`), canje de beneficios |
| **Supabase (Postgres)** | Datos tabulares/relacionales: eventos de calendario, plan de estudios (materias) y correlatividades. | `calendar`, `subjects` |
| **Turso (LibSQL / SQLite distribuido)** | Foro anonimo de alto volumen de escritura/lectura (posts, votos, reposts, banners) y suscripciones push del foro. | `forum`, notificaciones del foro |
| **Cloudinary** | Almacenamiento de imagenes (no es una "base de datos" pero cumple ese rol para media). | `aulas` |

> ⚠️ **Nota de seguridad:** el archivo `codigo_backend_ia.txt` que se uso para generar esta documentacion incluye `src/config/firebase-service-account.json` con una clave privada real de la cuenta de servicio de Firebase. **Esa clave debe rotarse en la consola de Firebase (IAM) y el archivo nunca debe commitearse al repositorio** — `.gitignore` ya lo excluye para el futuro, pero si el archivo llego a subirse alguna vez a un repositorio remoto (incluso en un commit viejo), la clave debe considerarse comprometida y regenerarse.

---

## Middlewares globales

| Middleware | Archivo | Funcion |
|---|---|---|
| `verifyToken` | `authMiddleware.js` | Valida el header `Authorization: Bearer <idToken>` contra Firebase Auth. Cachea el rol del usuario en memoria por 5 minutos (`userRoleCache`) para no pegarle a Firestore en cada request. Distingue token expirado de token invalido. |
| `requireAdmin` | `authMiddleware.js` | Corta con `403` si `req.user.role !== "admin"`. Se usa siempre despues de `verifyToken`. |
| `validate` | `validate.js` | Lee el resultado de `express-validator` y responde `400` con el detalle de errores si la validacion declarada en la ruta falla. |
| `errorHandler` | `errorHandler.js` | Manejador global (ultimo middleware). Traduce errores de Mongoose (`ValidationError` → 400, `CastError` → 400 ID invalido, codigo `11000` → 409 clave duplicada) y expone el `stack` solo en `NODE_ENV=development`. |
| `requirePageAccess(path)` | `pageAccess.middleware.js` | Middleware opcional (no aplicado globalmente) para bloquear rutas de API cuya pagina asociada este desactivada via feature flag. Los admins siempre pasan. |

## Restricciones globales (`src/index.js`)

* **Helmet:** cabeceras de seguridad HTTP. `crossOriginEmbedderPolicy` desactivado para permitir embeds de YouTube; CSP desactivada porque la maneja el frontend.
* **CORS:** whitelist dinamica desde la variable de entorno `FRONTEND_URL` (soporta multiples origenes separados por coma). Permite requests sin `origin` (Postman, apps moviles, curl).
* **Body limit:** `express.json({ limit: "2mb" })` y `urlencoded` con el mismo limite.
* **Compression:** gzip habilitado (importante en el free tier de Render).
* **Rate limiting (`express-rate-limit`):**
  * Global (`/api/*`): **200 peticiones cada 15 minutos** por IP.
  * IA (`/api/ai/*`): **10 peticiones por minuto** por IP (mas estricto porque consume creditos/tokens).
* **Health check:** `GET /health` devuelve estado, uptime y timestamp (usado por Render para saber si el servicio esta vivo).
* **Anti-sleep:** en produccion, un cron cada 14 minutos hace un self-ping a `/health` para evitar que Render duerma el servicio free tier (que duerme a los 15 min de inactividad).
* **404 handler:** cualquier ruta no reconocida responde `{ error: true, message: "Endpoint no encontrado" }`.
* **Manejo de errores no controlados:** `unhandledRejection` se loguea; `uncaughtException` termina el proceso (`process.exit(1)`).

---

## Documentacion de endpoints por modulo

> Convencion de la tabla: **Auth** indica el middleware de acceso — `Publico` (sin token), `Token` (`verifyToken`, cualquier usuario logueado), `Admin` (`verifyToken` + `requireAdmin`), o reglas especiales indicadas en la fila.

### 1. `ads` — Anuncios institucionales
Prefijo: `/api/announcements`

**Schema Mongo (`Announcement`):**
```js
{
  title:      String,   // requerido
  message:    String,   // requerido
  active:     Boolean,  // default true
  isCritical: Boolean,  // default false — si es true, dispara push a todos
  expiresAt:  Date,     // requerido
  timestamps: true
}
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/active` | Publico | Devuelve los anuncios activos, ordenados por criticidad y fecha. Antes de responder, desactiva en la misma llamada (`updateMany`) los anuncios cuyo `expiresAt` ya paso, evitando necesitar un cron aparte. |
| POST | `/` | Admin | Crea un anuncio. Calcula `expiresAt` a partir de `hoursActive` (default 24h, max 168h). Si `isCritical=true`, dispara un **push broadcast** a todos los suscriptores. |
| DELETE | `/:id` | Admin | Desactiva (soft-delete, `active=false`) el anuncio para conservar el historial de auditoria. |

---

### 2. `ais` — Chatbot institucional (IA)
Prefijo: `/api/ai` (rate limit especial: 10 req/min por IP)

**Schema Mongo (`AIContext`, documento singleton):**
```js
{
  personality:           String,  // default: personalidad del bot
  institutionalContext:  String,  // default: contexto de UTN FRBA
  rules:                 [String],
  aiCost:                Number,  // puntos que cuesta una consulta (default 2, min 1)
  singleton:             Boolean, // true, unique — garantiza un solo documento
  timestamps: true
}
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| POST | `/chat` | Token | Envia un mensaje al modelo de IA (GROQ, `openai/gpt-oss-20b`). Construye un *system prompt* dinamico cacheado 5 minutos, compuesto por: personalidad/reglas (Mongo), Top 15 FAQs mas consultadas (Mongo) y proximos eventos de calendario (Supabase). Devuelve `429` si GROQ esta saturado. |
| PATCH | `/deduct-points` | Token | Descuenta puntos al usuario en Firestore usando una **transaccion atomica** (`runTransaction`) para evitar condiciones de carrera; el costo se lee de `AIContext.aiCost` salvo que el body lo sobreescriba. |
| GET | `/context` | Publico | Devuelve el documento de contexto/personalidad de la IA (crea uno por defecto si no existe). |
| PATCH | `/context` | Admin | Actualiza personalidad, contexto institucional, reglas o costo en puntos. Limpia automaticamente el cache del *system prompt*. |
| POST | `/clear-cache` | Admin | Fuerza la limpieza manual del cache del *system prompt* desde el panel admin. |

---

### 3. `aulas` — Buscador de aulas / espacios fisicos
Prefijo: `/api/aulas`

**Schema Mongo (`Aula`):**
```js
{
  numero:      String,   // requerido
  slug:        String,   // unique, autogenerado desde "numero" (sin tildes, url-safe)
  sede:        String,   // enum: "medrano" | "campus", requerido
  piso:        Number,   // requerido
  funcion:     String,   // enum: aula_comun | laboratorio_informatica | laboratorio_especialidad
                          //       | departamento | bedelia | ceit | sala_reunion | secretaria | otro
  pasillo:     String,
  ala:         String,
  capacidad:   Number,
  carrera:     String,
  descripcion: String,
  referencias: String,
  imagenes:    [String],  // max 10, URLs de Cloudinary
  videos:      [String],  // max 3, URLs externas (YouTube, Drive, etc.)
  activo:      Boolean,   // default true — soft delete
  timestamps: true
}
// Indices: { sede, funcion }, { sede, activo }
// Hook pre-save: genera slug único (agrega sufijo -1, -2... si colisiona)
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/` | Publico | Lista aulas activas, filtrables por `sede`/`funcion`. Devuelve un payload reducido (sin `imagenes`/`videos`/`referencias`) y un campo `version` (el `updatedAt` mas reciente) para que el frontend invalide su cache local. |
| GET | `/all` | Admin | Lista **todas** las aulas (incluye inactivas), sin recortar campos. |
| GET | `/:identificador` | Publico | Detalle completo de un aula. El identificador puede ser el `_id` de Mongo **o** el `slug`. |
| POST | `/` | Admin | Crea un aula. Valida sede/funcion contra las listas cerradas del modelo; limita `videos` a 3. |
| PATCH | `/:id` | Admin | Actualizacion parcial (solo los campos permitidos que vengan en el body). Si cambia `numero`, regenera el `slug`. |
| DELETE | `/:id` | Admin | Soft delete (`activo=false`). |
| POST | `/:id/media` | Admin | Sube imagenes (`multipart/form-data`, campo `imagenes`, max 5 archivos x 5MB via Multer). Comprime cada imagen con **Sharp** (resize 600x600, WebP calidad 80) y la sube a **Cloudinary**. Respeta el limite de 10 imagenes por aula. |
| DELETE | `/:id/media` | Admin | Elimina una imagen o video del aula (body: `{ tipo: "imagen"|"video", url }`), y borra el recurso en Cloudinary si aplica. |
| POST | `/:id/media/video` | Admin | Agrega un link de video externo (YouTube/Drive), maximo 3 por aula, sin duplicados. |

---

### 4. `benefits` — Beneficios y canje de puntos
Prefijo: `/api/benefits`

**Schemas Mongo:**
```js
// Benefit
{
  title:       String,  // requerido
  description: String,
  discount:    String,
  location:    String,  // default "-"
  category:    String,  // enum: medrano | campus | digital
  img:         String,
  icon:        String,  // default "gift"
  pointsCost:  Number,  // default 0 (0 = acceso libre, sin canje)
  isActive:    Boolean, // default true
  order:       Number,
  timestamps: true
}

// Redemption (registro de canjes)
{
  userId:       String,  // requerido
  userEmail:    String,  // requerido
  benefitId:    ObjectId, // ref: Benefit
  benefitTitle: String,
  pointsCost:   Number,
  payload:      Object,  // datos libres del canje
  status:       String,  // enum: pending | completed | cancelled, default pending
  timestamps: true
}
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/` | Publico | Lista beneficios activos. Filtros opcionales: `category`, `type=free` (gratis) o `type=points` (con costo). |
| POST | `/redeem` | Token | Canjea un beneficio con puntos. Descuenta el saldo en **Firestore con transaccion atomica**, valida saldo suficiente, registra el canje en Mongo y envia una push de confirmacion. Los beneficios de `pointsCost=0` no pasan por este endpoint (son de acceso libre). |
| GET | `/all` | Admin | Lista todos los beneficios (activos e inactivos). |
| GET | `/redemptions` | Admin | Lista todos los canjes realizados. |
| POST | `/` | Admin | Crea un beneficio. Dispara push broadcast anunciando el nuevo beneficio/recompensa. |
| PATCH | `/:id` | Admin | Actualiza un beneficio. |
| DELETE | `/:id` | Admin | Soft delete (`isActive=false`). |

---

### 5. `calendar` — Calendario academico (Supabase)
Prefijo: `/api/calendar` — **unica fuente de datos: tabla `calendar_events` en Supabase (Postgres)**, no usa Mongo.

**Tabla `calendar_events` (Supabase):** `id, title, description, subtitle, date, type`.

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/` | Publico | Lista todos los eventos ordenados por fecha ascendente. |
| POST | `/` | Admin | Crea un evento (`title, description, subtitle, date, type`). |
| PATCH | `/:id` | Admin | Actualizacion parcial de un evento. |
| DELETE | `/:id` | Admin | Elimina un evento. |

**Tareas programadas asociadas (no son endpoints HTTP):**
* `autoCleanup()` — borra eventos con fecha pasada.
* `checkAndSendReminders()` — cada dia busca eventos que ocurren "mañana" y envia una **web push** a todos los suscriptores del foro (reutiliza la tabla `push_subscriptions` de Turso).

---

### 6. `courses` — Cursos / videotecas de YouTube
Prefijo: `/api/courses`

**Schema Mongo (`Course`):**
```js
{
  title:       String,  // requerido
  description: String,
  imageUrl:    String,
  playlistId:  String,
  materia:     String,
  categoria:   String,  // enum: Oficial | Comunidad, default Comunidad
  status:      String,  // enum: draft | approved | archived, default approved
  videos: [{
    youtubeId:     String,   // requerido
    title:         String,   // requerido
    duration:      String,   // default "0:00"
    brokenReports: [{ reportedBy: String, reason: String, createdAt: Date }],
    isBroken:      Boolean,  // default false — se activa automaticamente con 3+ reportes
  }],
  createdBy:   String,
  _searchable: String,  // campo desnormalizado sin tildes, regenerado en cada save (indice de busqueda)
  timestamps: true
}
// Indices: status, materia, _searchable, "videos.isBroken", createdAt
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/?search=&materia=&categoria=&page=&limit=` | Publico | Lista cursos **aprobados**, con busqueda normalizada (sin tildes) sobre `_searchable`, filtro exacto por materia/categoria y paginacion (max 50 por pagina). |
| GET | `/admin/all` | Admin | Lista cursos en **cualquier estado** (draft/approved/archived), con busqueda y paginacion. |
| GET | `/admin/broken-videos` | Admin | Lista todos los videos marcados como rotos o con reportes pendientes, ordenados por cantidad de reportes. |
| POST | `/fetch-playlist` | Admin | Recibe una URL de playlist de YouTube y usa **ytpl** para extraer titulo y lista de videos (id, titulo, duracion) — no persiste nada, solo devuelve el preview para armar el curso. |
| POST | `/` | Admin | Crea un curso (requiere `title` y al menos 1 video). |
| GET | `/:id` | Publico | Detalle de un curso por ID. |
| PUT | `/:id` | Admin | Actualizacion (campos permitidos: title, description, imageUrl, playlistId, videos, materia, categoria, status). Regenera `_searchable` si cambia texto relevante. |
| PATCH | `/:id/status` | Admin | Cambia solo el estado (`draft`/`approved`/`archived`). |
| DELETE | `/:id` | Admin | Elimina el curso definitivamente. |
| PATCH | `/:id/videos/:videoId` | Admin | Corrige un video roto (youtubeId/title/duration) y limpia sus reportes. |
| DELETE | `/:id/videos/:videoId` | Admin | Elimina un video puntual del curso. |
| DELETE | `/:id/videos/:videoId/reports` | Admin | Limpia los reportes de un video sin modificarlo. |
| POST | `/:id/videos/:videoId/report` | Token | Un usuario reporta un video roto (motivo: `no-reproduce`, `error-404`, `privado`, `contenido-incorrecto`). No permite reportar dos veces el mismo video; al llegar a 3 reportes, `isBroken` pasa a `true` automaticamente. |

---

### 7. `faq` — Preguntas frecuentes
Prefijo: `/api/faqs` y `/api/faq` (alias, el frontend usa el plural)

**Schema Mongo (`FAQ`):**
```js
{
  question:   String,   // requerido
  answer:     String,   // requerido
  keywords:   [String], // lowercase
  category:   String,   // default "general"
  popularity: Number,   // default 0, se incrementa con /use
  isActive:   Boolean,  // default true
  createdBy:  String,
  timestamps: true
}
// Indice de texto completo (text index) sobre question + answer + keywords
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/` | Publico | Lista todas las FAQs activas ordenadas por popularidad. |
| GET | `/top` | Publico | Top 15 FAQs mas populares (usado tambien como contexto del chatbot). |
| GET | `/search?q=` | Publico | Busqueda por texto completo (indice `$text`) con fallback a `$regex` sobre pregunta/respuesta/keywords si no hay resultados de texto. |
| PATCH | `/:id/use` | Publico | Incrementa el contador de `popularity` en 1 (tracking silencioso: si falla, no rompe la experiencia del usuario). |
| POST | `/` | Admin | Crea una FAQ (`question` 5-500 chars, `answer` 5-3000 chars). |
| PATCH | `/:id` | Admin | Actualizacion parcial. |
| DELETE | `/:id` | Admin | Elimina la FAQ. |

---

### 8. `forum` — Foro anonimo (Turso / SQLite distribuido)
Prefijo: `/api/forum` — **toda la persistencia es en Turso, no en Mongo.**

**Esquema SQL (Turso, inicializado en `config/turso.js`):**
```sql
anonymous_posts (
  id INTEGER PK, parent_id INTEGER (FK self, ON DELETE CASCADE),
  pseudonym TEXT, user_hash TEXT, body TEXT,
  upvotes INTEGER DEFAULT 0, reposts INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0, views INTEGER DEFAULT 0,
  root_id INTEGER, created_at TEXT, expires_at TEXT
)
post_votes (user_hash TEXT, post_id INTEGER FK, value INTEGER CHECK(-1,1), PK(user_hash, post_id))
post_reposts (user_hash TEXT, post_id INTEGER FK, created_at TEXT, PK(user_hash, post_id))
push_subscriptions (user_hash TEXT PK, subscription TEXT, updated_at TEXT)
forum_banners (id INTEGER PK, title, description, redirect_url, svg_content, is_active, created_at, updated_at)
```
Indices sobre `parent_id`, `root_id`, `expires_at`, `upvotes DESC`, `is_active`.

**Identidad anonima:** cada usuario se identifica en el foro con un **pseudonimo deterministico** (`Adjetivo + Sustantivo + #HASH`, generado con SHA-256 sobre `uid + salt`) y un **hash irreversible** de su UID (`user_hash`) que se usa como clave para votos, reposts y suscripciones, sin exponer nunca el UID real de Firebase. Incluye ademas un **filtro de malas palabras** que rechaza publicaciones con vocabulario inapropiado. Las publicaciones **expiran a los 6 meses** (`expires_at`) y se filtran automaticamente de las consultas.

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/push/vapid-key` | Publico | Clave publica VAPID para suscribirse a push. |
| POST | `/push/subscribe` | Token | Guarda/actualiza la suscripcion push del usuario (upsert por `user_hash`). |
| GET | `/posts?tab=&page=` | Publico/Token opcional | Feed paginado (20 por pagina). Tabs: `para-ti` (mas reciente), `tendencias` (por score), `materias` (posts con `#hashtag`), `siguiendo`. Si hay token, incluye el voto propio y si el post fue repostado por el usuario. |
| GET | `/posts/:id` | Publico/Token opcional | Thread completo (post + respuestas). Incrementa `views` de forma asincrona (fire & forget). |
| POST | `/posts` | Token | Crea una publicacion (3-1000 caracteres). Si es respuesta (`parent_id`), notifica por push al autor del post padre. |
| POST | `/posts/:id/replies` | Token | Responde a un post existente (valida que no este expirado). |
| POST | `/posts/:id/vote` | Token | Vota (+1/-1) con logica *toggle*: votar de nuevo con el mismo valor retira el voto; votar distinto lo cambia. |
| POST | `/posts/:id/repost` | Token | Repostea/quita repost (toggle). |
| DELETE | `/posts/:id` | Token (autor o admin) | Elimina el post. |
| GET | `/trending` | Publico/Token opcional | Top 50 posts de los ultimos 7 dias segun un **score compuesto**: `upvotes*2 + reposts*3 + respuestas − horas_desde_creacion*0.5`. |
| GET | `/banners` | Publico | Lista banners (filtro opcional `?active=1`). |
| POST | `/banners` | Admin | Crea un banner (title, redirect_url requeridos; description/svg_content opcionales). |
| PATCH | `/banners/:id` | Admin | Actualizacion parcial de un banner. |
| DELETE | `/banners/:id` | Admin | Elimina un banner. |

---

### 9. `groups` — Grupos de estudio (WhatsApp/Telegram) por comision
Prefijo: `/api/groups`

**Schema Mongo (`Group`):**
```js
{
  carrera:     String,  // requerido, whitelist cerrada (sistemas, industrial, civil, etc.)
  nivel:       String,  // requerido, "0" a "6"
  materia:     String,  // requerido
  comision:    String,  // requerido
  link:        String,  // requerido, URL http(s)
  tipo:        String,  // enum: Oficial | Alumnos, default Alumnos
  submittedBy: String,
  isApproved:  Boolean, // default false — cola de moderacion
  reports:     [{ reportedBy: String, reason: String, reportedAt: Date }],
  reportCount: Number,  // default 0
  timestamps: true
}
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/?carrera=&nivel=&materia=&comision=&page=` | Publico | Requiere **(carrera + nivel + materia) o comision (min. 3 caracteres)**. Paginado, 16 resultados por pagina, con proteccion anti-ReDoS (escape de regex) y whitelist de carreras/niveles validos. Los grupos "Oficiales" aparecen primero. Los grupos de la carrera `homogeneas` aparecen en cualquier busqueda de carreras de ingenieria. |
| GET | `/stats` | Admin | Estadisticas: total aprobados, oficiales, reportados, cantidad de carreras. |
| GET | `/pending` | Admin | Grupos pendientes de aprobacion. |
| GET | `/reported` | Admin | Grupos con al menos un reporte, ordenados por cantidad de reportes. |
| POST | `/` | Token | Propone un grupo nuevo (queda `isApproved=false`). |
| PUT | `/:id/approve` | Admin | Aprueba el grupo. |
| PUT | `/:id/link` | Admin | Actualiza el link del grupo y **resetea sus reportes** (usado cuando se corrige un link roto). |
| POST | `/:id/report` | Token | Reporta un grupo (motivos: link-invalido, link-incorrecto, grupo-lleno, otro). Envia email al admin y al usuario reportante via **Nodemailer**. No permite reportar dos veces. |
| DELETE | `/:id` | Admin | Elimina el grupo definitivamente. |

---

### 10. `links` — Enlaces institucionales rapidos
Prefijo: `/api/links`

**Schema Mongo (`Link`):**
```js
{ title: String, url: String, icon: String, order: Number, timestamps: true }
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/` | Publico | Lista de enlaces ordenados por `order`. |
| POST | `/` | Admin | Crea un enlace (title, url, icon requeridos; url debe empezar con `http` o `/`). |
| PUT | `/:id` | Admin | Actualiza un enlace. |
| DELETE | `/:id` | Admin | Elimina un enlace. |

---

### 11. `messages` — Mensajeria interna (admin → alumno)
Prefijo: `/api/messages`

**Schema Mongo (`Message`):**
```js
{ userId: String, subject: String, content: String, isRead: Boolean, timestamps: true }
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/my-messages` | Token | Mensajes propios del usuario logueado, ordenados por fecha descendente. |
| PATCH | `/:id/read` | Token | Marca un mensaje como leido. |
| POST | `/send` | Admin | Guarda un mensaje interno y **ademas** intenta enviarlo por email (plantilla HTML con branding iTEC) via Nodemailer. Si el email falla, el mensaje interno igual queda guardado. |

---

### 12. `notifications` — Web Push (VAPID)
Prefijo: `/api/notifications` — usa la tabla `push_subscriptions` de **Turso** (compartida con el foro).

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/vapid-key` | Publico | Clave publica VAPID. |
| POST | `/subscribe` | Token | Guarda/actualiza (upsert) la suscripcion push del usuario. |
| DELETE | `/unsubscribe` | Token | Elimina la suscripcion (busca por coincidencia de `endpoint` dentro del JSON guardado). |

Este modulo tambien expone funciones internas usadas por otros modulos (no son rutas HTTP): `broadcastPush(payload)` (a todos los suscriptores) y `pushToUser(uid, payload)` (a un usuario puntual).

---

### 13. `padron` — Consulta de padron de examenes (scraping)
Prefijo: `/api/padron`

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| POST | `/consultar` | Publico | Recibe `{ dni }` y usa **Puppeteer headless** para automatizar la busqueda en una pagina externa (CloudFront), bloqueando imagenes/CSS/fuentes para acelerar la carga. Extrae nombre, especialidad, sede, mesa y observaciones, separando heuristicamente apellido/nombre segun mayusculas. Devuelve `404` si el DNI no figura, `500` ante errores del scraper. No persiste nada en ninguna base de datos: es una consulta en vivo. |

---

### 14. `pageAccess` — Feature flags de paginas (Firestore)
Prefijo: `/api/page-access` — persistencia: **un unico documento** `config/pageAccess` en Firestore, con forma `{ pages: { "/ruta": { enabled, comingSoon, hidden, label, updatedAt, updatedBy } } }`.

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/` | Admin | Devuelve el documento completo de configuracion de paginas. (El frontend publico se suscribe directo a Firestore con el SDK — este endpoint es un *fallback* administrativo/para consumidores externos.) |
| PUT | `/{*path}` | Admin | Crea o actualiza el estado de una pagina (soporta rutas con barras, ej. `/admin/dashboard`, usando el wildcard de Express 5). Body: `{ enabled?, comingSoon?, hidden?, label? }`. |
| DELETE | `/{*path}` | Admin | Elimina la configuracion custom de una pagina (vuelve al estado por defecto: habilitada). |

Incluye ademas un middleware opcional `requirePageAccess(path)` (no aplicado por defecto a ningun modulo) para bloquear tambien las **APIs** de una seccion desactivada, con cache en memoria de 30s.

---

### 15. `points` — Sistema de gamificacion por puntos
Prefijo: `/api/points`

**Schemas Mongo:**
```js
// PointActivity (catalogo editable por el admin)
{
  key:             String,  // unique, ej: "forum_post" — identificador usado en el codigo
  name:            String,  // nombre visible en el panel
  description:     String,
  points:          Number,  // puntos otorgados por ocurrencia
  cooldownMinutes: Number,  // minutos minimos entre dos otorgamientos (0 = sin cooldown)
  dailyCap:        Number,  // tope de veces por dia (0 = sin limite)
  isActive:        Boolean,
  timestamps: true
}

// PointLog (auditoria, TTL 90 dias)
{
  uid:           String,  // indexado
  activityKey:   String,
  pointsAwarded: Number,
  context:       Mixed,   // metadatos libres (postId, resourceId, etc.)
  createdAt:     Date     // TTL index: se autoborra a los 90 dias
}
// Indice compuesto: uid + activityKey + createdAt (para chequear cooldown/cap sin ir a Firestore)
```

Actividades por defecto (se siembran automaticamente si la coleccion esta vacia): `forum_post`, `forum_reply`, `resource_upload`, `group_propose`, `profile_complete`, `daily_login`, `trueketec_post` — cada una con sus propios puntos, cooldown y tope diario.

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/activities` | Publico | Catalogo de actividades **activas** (solo campos publicos: key, name, points, cooldown, cap). |
| GET | `/activities/admin` | Admin | Catalogo completo (incluye inactivas y campos internos). |
| PATCH | `/activities/:id` | Admin | Edita una actividad (puntos, cooldown, cap, activo/inactivo, nombre, descripcion). |
| POST | `/grant` | Token | Otorga puntos por una actividad (`activityKey` + `context` opcional). El `uid` **siempre** se toma del token, nunca del body (previene fraude). La logica central (`grantPoints`) verifica cooldown y tope diario contra `PointLog` en Mongo, y si corresponde, incrementa `points` en Firestore de forma **atomica** (`FieldValue.increment`). Nunca lanza excepciones: si algo falla, devuelve `{ granted: false, reason }`. |
| GET | `/history` | Token | Ultimos 50 movimientos de puntos del usuario, enriquecidos con el nombre legible de cada actividad. |

---

### 16. `progress` — Progreso academico del alumno (Firestore)
Prefijo: `/api/progress` (todas las rutas requieren `verifyToken`) — persistencia: coleccion `progress` en Firestore, un documento por `uid`.

**Forma del documento (`progress/{uid}`):**
```js
{
  activeCareer:    String,          // carrera actualmente seleccionada
  enrolledCareers: [String],        // hasta 3 carreras
  p: {                              // mapa de materias cursadas
    "<codigo_materia>": {
      s: "a" | "pr" | "promocionada" | "r" | "c",  // estado
      n: Number,   // nota (1-10), solo si aprobada/promocionada
      y: Number,   // año en que se curso/aprobo/recurso
    }
  }
}
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/:uid` | Token (solo el propio uid) | Devuelve el progreso del alumno. Si no tiene `enrolledCareers` guardado aun, lo infiere a partir de su perfil (`careers`/`specialty` en la coleccion `users`, mapeando el codigo de carrera con `CAREER_CODE_MAP`) y lo persiste. Responde con headers `no-cache` para no servir datos desactualizados. |
| PATCH | `/:uid/subject` | Token (solo el propio uid) | Actualiza el estado de **una** materia (`codigo, state, grade?, year?`). `state=null` (o `habilitada_cursar`/`bloqueada`) borra la entrada. |
| PUT | `/:uid/bulk` | Token (solo el propio uid) | Guarda/reemplaza el progreso completo (`activeCareer`, `enrolledCareers` max 3, `p` completo) — usado para sincronizar el estado local del frontend de una sola vez. |

---

### 17. `resources` — Repositorio de apuntes / materiales
Prefijo: `/api/resources`

**Schema Mongo (`Resource`):**
```js
{
  title:       String,  // requerido
  carrera:     String,  // requerido
  nivel:       String,  // requerido
  materia:     String,  // requerido
  tipo:        String,  // requerido
  formato:     String,  // requerido
  link:        String,  // requerido, URL
  autor:       String,  // default "Comunidad ITEC"
  submittedBy: String,  // UID de Firebase
  isApproved:  Boolean, // default false — cola de moderacion
  timestamps: true
}
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/?carrera=&materia=&nivel=&tipo=&formato=` | Publico | Lista recursos **aprobados**, con filtros opcionales por regex. |
| POST | `/` | Token | Sube un recurso nuevo (queda pendiente de aprobacion). |
| GET | `/pending` | Admin | Recursos pendientes de moderacion. |
| PUT | `/:id/approve` | Admin | Aprueba el recurso. |
| DELETE | `/:id` | Admin | Elimina el recurso. |

---

### 18. `subjects` — Plan de estudios / correlatividades (Supabase)
Prefijo: `/api/subjects` — persistencia: tablas `subjects` y `subjects_correlativas` en **Supabase**. Reemplaza a un modulo viejo (`materias`) que usaba una tabla ya eliminada; ver `src/modules/subjects/docs/subjects_api_contract.md` para el detalle historico de la migracion.

**Tabla `subjects` (Supabase):** `id, subject_key (identificador estable), materia, codigo, carrera, nivel (INTEGER), sigla`.
**Tabla `subjects_correlativas`:** relaciona `subject_id` con `requisito_subject_key` y un `tipo` (`cursada` | `aprobada`).

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/?carrera=&nivel=` | Publico | Lista materias, filtrable por carrera y/o nivel (numerico). Incluye diagnostico automatico en logs si hay datos en la tabla pero la consulta devuelve 0 filas (posible problema de RLS en Supabase). |
| GET | `/carreras` | Publico | Lista de carreras unicas presentes en la tabla. |
| GET | `/search?q=` | Publico | Busqueda combinada por nombre, codigo **y** sigla (minimo 2 caracteres), resultados deduplicados. |
| GET | `/:subjectKey/correlativas` | Publico | Devuelve `{ cursada: [...], aprobada: [...] }` con los `subject_key` de las materias requisito. |
| POST | `/` | Admin | Crea una materia. Si no se envia `subjectKey`, se genera uno sintetico (`<carrera>_<nombre_normalizado>`). |
| PUT | `/:id` | Admin | Actualiza una materia. |
| DELETE | `/:id` | Admin | Elimina una materia. |

---

### 19. `trueketec` — Intercambio de comisiones entre alumnos
Prefijo: `/api/trueketec` — **restringido a cuentas `@frba.utn.edu.ar`** en casi todos los endpoints.

**Schema Mongo (`Trueketec`):**
```js
{
  userId: String, userEmail: String, userName: String,
  departamento:     String,  // requerido
  materia:          String,  // requerido
  comision_actual:  String,  // requerido
  turno_actual:     String,  // enum: Mañana | Tarde | Noche
  comision_deseada: String,  // requerido (o "Cualquiera")
  turno_deseado:    String,  // enum: Mañana | Tarde | Noche | Cualquiera
  estado:           String,  // enum: Activo | En Negociación | Trueque Realizado, default Activo
  postulaciones: [{ userId, userEmail, userName, timestamps }],
  matchedWith:  String,  // uid de la contraparte, tras aceptar match
  matchedEmail: String,
  expiresAt:    Date,    // TTL de 21 dias — Mongo lo borra automaticamente (expireAfterSeconds: 0)
  timestamps: true
}
// Indices compuestos para las búsquedas de matches: {estado, materia}, {estado, departamento},
// {estado, comision_actual}, {userId, estado}, {estado, comision_actual, comision_deseada, materia}
```

**Logica de "match perfecto":** un post A hace match con un post B (mismo `materia`, distinto usuario, ambos `Activo`) cuando la comision actual de uno coincide con la deseada del otro **en ambos sentidos** (o alguno acepta "Cualquiera"). Esta busqueda se resuelve enteramente con una query de Mongo (aprovechando los indices compuestos), sin traer la coleccion completa a memoria.

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/?materia=&departamento=&turno_deseado=&comision=&page=` | Token (UTN) | Feed publico de publicaciones activas (16 por pagina). Requiere `materia` **o** `departamento`, o un codigo de `comision` de al menos 2 caracteres. Cada item incluye un flag `isPerfectMatch` calculado contra las publicaciones activas propias del usuario, y oculta el email del autor hasta que haya match confirmado. |
| GET | `/my-posts` | Token (UTN) | Publicaciones propias, en cualquier estado. |
| GET | `/my-matches` | Token (UTN) | Publicaciones ajenas que hacen match perfecto con alguna publicacion activa propia. |
| POST | `/` | Token (UTN) | Crea una publicacion (max **3 activas** por usuario, expira a los **21 dias**). Detecta matches en segundo plano y notifica por push tanto al creador como a las contrapartes encontradas. |
| PATCH | `/:id/estado` | Token (dueño) | Cambia el estado de la publicacion propia (`Activo`, `En Negociación`, `Trueque Realizado`). |
| POST | `/:id/postular` | Token (UTN) | Se postula como interesado en el trueque de otro usuario (no permite postularse a la propia ni dos veces). |
| GET | `/:id/postulantes` | Token (dueño) | Lista los postulantes a la publicacion propia, junto con las ofertas activas de cada uno. |
| POST | `/:id/accept-match` | Token (UTN) | Confirma un match entre `req.params.id` (propio) y `targetPostId` (ajeno): **revela los emails de ambas partes**, marca ambas publicaciones como `Trueque Realizado` y notifica por push. |
| DELETE | `/:id` | Token (dueño o admin) | Soft-delete: cambia el estado a `Trueque Realizado` en lugar de borrar fisicamente. |
| GET | `/admin` | Admin | Lista todas las publicaciones (filtro opcional por `estado`), paginado de a 50. |
| DELETE | `/admin/:id` | Admin | Borrado fisico definitivo (uso excepcional/moderacion). |

**Tarea programada:** `cleanExpiredPosts()` corre cada 12 horas desde `index.js` y elimina fisicamente las publicaciones con `expiresAt` vencido.

---

### 20. `users` — Administracion de usuarios (Firebase Auth + Firestore)
Prefijo: `/api/users` — no tiene modelo Mongo: la identidad vive en **Firebase Authentication** y los metadatos extendidos (rol, puntos, perfil) en la coleccion `users` de **Firestore**.

**Forma del documento (`users/{uid}` en Firestore):**
```js
{
  role:        "student" | "admin" | "moderator",  // default "student"
  points:      Number,
  displayName: String,
  dni:         String,
  legajo:      String,
  specialty:   String,
  careers:     [{ code, name }],
  startYear:   Number,
  photoURL:    String,
  phone:       String,
}
```

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| PATCH | `/:uid/profile` | Token (solo el propio uid, o admin) | El usuario actualiza su propio perfil extendido (displayName, dni, legajo, specialty, careers, startYear, phone, photoURL). Si cambia `displayName`, tambien se sincroniza en Firebase Auth. |
| GET | `/count` | Admin | Cantidad total de usuarios registrados en Firebase Auth (paginando internamente de a 1000). Cacheado en memoria por 5 minutos. |
| GET | `/?limit=&pageToken=` | Admin | Lista paginada de usuarios (usa la paginacion nativa de Firebase Auth `listUsers`), enriquecida con `role` y `points` desde Firestore. |
| GET | `/search?email=` | Admin | Busca un usuario puntual por email. |
| PATCH | `/:uid/role` | Admin | Cambia el rol de un usuario (`student`/`admin`/`moderator`). Un admin no puede quitarse su propio rol de admin (evita auto-bloqueo). |
| PATCH | `/:uid/points` | Admin | Suma o resta puntos manualmente (el resultado nunca baja de 0). |

---

## Autenticacion y autorizacion (resumen transversal)

* **Identidad:** Firebase Authentication. El frontend obtiene un `idToken` y lo envia como `Authorization: Bearer <token>` en cada request protegido.
* **Roles:** `student` (default), `moderator`, `admin`, guardados en el documento `users/{uid}` de Firestore. `verifyToken` cachea el rol 5 minutos para reducir lecturas a Firestore.
* **Rutas restringidas por dominio de correo:** el modulo `trueketec` exige ademas que el email termine en `@frba.utn.edu.ar`.
* **Ownership checks:** varios endpoints (`progress/:uid`, `users/:uid/profile`, `trueketec/:id/*`, `forum` delete) verifican explicitamente que `req.user.uid` coincida con el recurso solicitado, ademas del rol.

## Variables de entorno requeridas

```
# Servidor
PORT, NODE_ENV, FRONTEND_URL

# MongoDB
MONGODB_URI

# Firebase Admin
FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

# Supabase
SUPABASE_URL, SUPABASE_SERVICE_KEY

# Turso
TURSO_URL, TURSO_AUTH_TOKEN

# IA (chatbot)
GROQ_API_KEY

# Push (Web Push / VAPID)
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL

# Email (Nodemailer)
EMAIL_USER, EMAIL_PASS, ADMIN_EMAIL

# Cloudinary
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

# Foro
FORUM_SALT
```

> El servidor valida al arrancar las variables criticas de Firebase, Mongo y Supabase, y termina el proceso (`process.exit(1)`) si falta alguna — revisar los logs de arranque ante cualquier fallo de despliegue.

---

### Configuracion del Entorno de Desarrollo Local

1.  **Clonar el repositorio.**
2.  **Configurar el Backend:**
    * Navegar al directorio: `cd itecba-backend`
    * Instalar dependencias: `npm install`
    * Duplicar el archivo de entorno de ejemplo (si aplica) a `.env` y completar las variables listadas en la seccion anterior.
    * Iniciar el servidor en modo desarrollo: `npm run dev` (utiliza Nodemon para recarga automatica). El backend normalmente escuchara en el puerto configurado en el archivo `.env`.

### Despliegue

El backend se despliega en **Render** (`render.yaml`, region Ohio) como servicio web de Node, con `npm install` como build command y `npm start` como start command. Al estar en el free tier, el servicio "duerme" tras 15 minutos de inactividad; el propio backend hace self-ping cada 14 minutos en produccion para mitigar esto.

### Flujo de Trabajo en GitHub

Para mantener un codigo limpio y estable, se sugiere a todos los colaboradores seguir este flujo de trabajo tecnico:

* **Ramas (Branches):** El proyecto utiliza una rama `main` o `master` protegida. Ningun desarrollador debe hacer *push* directo a esta rama. Se debe utilizar un modelo tipo Feature Branch:
    * Nuevas funcionalidades: `feature/nombre-de-la-funcionalidad`
    * Correccion de errores: `fix/descripcion-del-bug`
    * Refactorizaciones: `refactor/descripcion-de-mejora`
* **Pull Requests (PRs):** Todo codigo nuevo debe integrarse mediante un PR. Los PRs deben tener un titulo descriptivo y explicar que problema resuelve o que nueva caracteristica anade. Es necesario que el codigo este alineado con las reglas de linting del proyecto (`npm run lint` en el frontend).
* **Dependencias de Modulos:** Al desarrollar una nueva vista en el frontend, priorice la arquitectura "Feature-Driven". Si un componente solo pertenece a "Cursos", creelo dentro de `src/features/courses/components/` en lugar de abarrotar la carpeta global `src/components/`. Reserve los atomos y moleculas globales unicamente para elementos visuales genericos (botones, inputs reutilizables, etc.).
* **Backend:** al agregar un modulo nuevo, seguir el mismo patron `feature-based` ya usado (`*.controller.js`, `*.model.js`, `*.routes.js`, y `*.service.js` si hay logica de negocio reutilizable), registrar sus rutas en `src/index.js` bajo un prefijo `/api/<modulo>`, y documentar el nuevo modulo en este README siguiendo el mismo formato (schema + tabla de endpoints).
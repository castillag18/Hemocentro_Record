# HUAV — Guía de instalación y despliegue

Plataforma web para gestionar donantes de sangre, enviar recordatorios por **WhatsApp** y **correo**, y agendar citas vía WhatsApp con **Google Calendar**.

Use este documento tanto en su **PC de desarrollo** como en el **servidor del cliente** al terminar el proyecto.

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Instalación rápida (PC de desarrollo)](#2-instalación-rápida-pc-de-desarrollo)
3. [Instalación en servidor del cliente (producción)](#3-instalación-en-servidor-del-cliente-producción)
4. [Variables de entorno (.env)](#4-variables-de-entorno-env)
5. [Base de datos MySQL](#5-base-de-datos-mysql)
6. [WhatsApp con OpenWA](#6-whatsapp-con-openwa)
7. [Google OAuth y Google Calendar](#7-google-oauth-y-google-calendar)
8. [Correo electrónico (SMTP)](#8-correo-electrónico-smtp)
9. [Recordatorios automáticos (cron)](#9-recordatorios-automáticos-cron)
10. [Importar donantes](#10-importar-donantes)
11. [Acceso desde la red local](#11-acceso-desde-la-red-local)
12. [Referencia de comandos](#12-referencia-de-comandos)
13. [Solución de problemas](#13-solución-de-problemas)

---

## 1. Requisitos

| Software | Versión mínima | Notas |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) LTS |
| npm | 10+ | Incluido con Node.js |
| Docker Desktop | Reciente | Recomendado para MySQL local |
| Git | Opcional | Para clonar el repositorio |

Servicios adicionales (según funcionalidades):

| Servicio | Puerto | Obligatorio |
|---|---|---|
| MySQL 8 | 3306 | Sí |
| OpenWA | 2785 | Sí (modo WhatsApp recomendado) |
| HUAV (Next.js) | 3000 | Sí |

---

## 2. Instalación rápida (PC de desarrollo)

### Paso a paso

```bash
# 1. Obtener el proyecto
git clone <URL-DEL-REPOSITORIO> recordatorio_hemocentro
cd recordatorio_hemocentro

# 2. Instalar dependencias
npm install

# 3. Crear y editar variables de entorno
copy .env.example .env        # Windows
# cp .env.example .env        # Linux/macOS

# 4. Instalación completa: Docker MySQL + tablas + usuario admin + plantillas
npm run install:local
# Alternativa equivalente:
# npm run local:setup

# 5. (Opcional) Importar donantes desde Excel
npm run import:donors

# 6. Verificar base de datos
npm run db:check

# 7. Iniciar aplicación en modo desarrollo
npm run dev:fresh
```

Abrir: [http://localhost:3000/login](http://localhost:3000/login)

**Credenciales iniciales:**

| Campo | Valor |
|---|---|
| Correo | `admin@hemocentro.local` |
| Contraseña | `Admin123!` |

### Verificar salud del sistema

```bash
# Debe responder database: connected
curl http://localhost:3000/api/health
```

---

## 3. Instalación en servidor del cliente (producción)

### 3.1 Preparar el servidor

```bash
# Clonar o copiar el proyecto al servidor
git clone <URL-DEL-REPOSITORIO> /opt/recordatorio_hemocentro
cd /opt/recordatorio_hemocentro

npm install
cp .env.example .env
nano .env   # o el editor de su preferencia
```

### 3.2 Configurar `.env` para producción

Valores mínimos (ajuste IP/dominio real):

```env
NODE_ENV="production"
# BD HUAV en el servidor (192.168.1.4). En ese servidor use HUAV_DB_HOST=localhost
HUAV_DB_HOST="localhost"
HUAV_DB_PORT="3306"
HUAV_DB_NAME="huav"
HUAV_DB_USER="He_mo_center"
HUAV_DB_PASSWORD="***"
DATABASE_URL="mysql://He_mo_center:***@localhost:3306/huav"
HUAV_DONORS_SQL="donantes_info.sql"
AUTH_SECRET="generar-secreto-largo-y-aleatorio"
NEXT_PUBLIC_APP_URL="http://192.168.1.4:3000"
PORT=3000
HOSTNAME=0.0.0.0

WHATSAPP_MODE="openwa"
WHATSAPP_OPENWA_URL="http://localhost:2785"
WHATSAPP_OPENWA_API_KEY="copiar-desde-dashboard-openwa"
WHATSAPP_OPENWA_SESSION_ID="default"
OPENWA_WEBHOOK_SECRET="secreto-minimo-16-caracteres"

GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
GOOGLE_REDIRECT_URI="http://192.168.1.4:3000/api/auth/google/callback"

CRON_SECRET="generar-secreto-cron"
```

> **Importante:** `NEXT_PUBLIC_APP_URL`, `GOOGLE_REDIRECT_URI` y los orígenes en Google Cloud deben usar la **misma URL pública** (IP o dominio) del servidor.

### 3.3 Base de datos en producción (HUAV — `192.168.1.4`)

En el servidor de la empresa la app usa la base **`huav`** existente (MySQL/MariaDB). Prisma crea sus tablas (`Donor`, `Settings`, etc.) **en la misma base**, junto a las tablas legadas (`person`, `donation`, …).

1. En `.env`, configure `HUAV_DB_*` y `DATABASE_URL` (codifique `*` en la contraseña como `%2A` en la URL).
2. Desde el servidor use `HUAV_DB_HOST=localhost`; desde otra PC en la red use `192.168.1.4`.

```bash
# Sincronizar tablas de la app (Settings, Donor, citas, etc.)
npm run db:sync

# Datos iniciales (admin + plantillas)
npm run db:seed

# Verificar conexión
npm run db:check

# Importar donantes desde donantes_info.sql (consulta directa a huav)
npm run import:donors:huav
```

> **Desarrollo local con Docker:** puede usar `mysql://root:password@localhost:3306/hemocentro` y `npm run db:up` en lugar de la BD HUAV.

> **Windows:** Si `db:sync` falla con `EPERM`, detenga la app (`Ctrl+C`) y vuelva a ejecutar `npm run db:sync`. El script libera el puerto 3000 automáticamente antes de `prisma generate`.

### 3.4 Compilar e iniciar en producción

```bash
npm run build
npm run start
```

La app quedará en `http://<IP-SERVIDOR>:3000`.

### 3.5 Mantener la app corriendo (recomendado en Linux)

Con **PM2**:

```bash
npm install -g pm2
pm2 start npm --name "hemocentro" -- start
pm2 save
pm2 startup
```

### 3.6 Checklist post-instalación en servidor

Ejecutar en orden:

```bash
# 1. MySQL activo
npm run db:up
npm run db:check

# 2. App compilada y corriendo
npm run build
npm run start

# 3. OpenWA activo (ver sección 6)
curl http://localhost:2785/api/health

# 4. Registrar webhook de WhatsApp (respuestas Sí / selección de fechas)
npm run openwa:register-webhook

# 5. En la UI: Configuración → WhatsApp → Generar QR → escanear → estado «ready»
# 6. En la UI: Configuración → Google Calendar → Conectar con Google
# 7. (Opcional) Importar donantes
npm run import:donors
```

---

## 4. Variables de entorno (.env)

Copie siempre desde el ejemplo:

```bash
copy .env.example .env    # Windows
cp .env.example .env      # Linux
```

### Tabla completa

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión MySQL (Prisma). Producción HUAV: `mysql://He_mo_center:***@localhost:3306/huav` |
| `HUAV_DB_HOST` | Prod | Host MySQL HUAV (`localhost` en servidor, `192.168.1.4` desde otra PC) |
| `HUAV_DB_PORT` | No | Puerto MySQL (default `3306`) |
| `HUAV_DB_NAME` | Prod | Nombre de la base (`huav`) |
| `HUAV_DB_USER` | Prod | Usuario MySQL (`He_mo_center`) |
| `HUAV_DB_PASSWORD` | Prod | Contraseña MySQL |
| `HUAV_DONORS_SQL` | No | Ruta al SQL de extracción (default `donantes_info.sql`) |
| `AUTH_SECRET` | Sí | Secreto aleatorio para sesiones JWT |
| `NEXT_PUBLIC_APP_URL` | Sí | URL pública de la app (sin barra final) |
| `PORT` | No | Puerto HTTP (default `3000`) |
| `HOSTNAME` | No | `0.0.0.0` para escuchar en toda la red |
| `NODE_ENV` | No | `development` o `production` |
| `SMTP_HOST` | No* | Servidor SMTP |
| `SMTP_PORT` | No* | Puerto SMTP (587) |
| `SMTP_USER` | No* | Usuario SMTP |
| `SMTP_PASS` | No* | Contraseña SMTP |
| `SMTP_FROM` | No* | Remitente (ej. `banco@hemocentro.org`) |
| `WHATSAPP_MODE` | Sí | `openwa` (recomendado), `wame` o `api` |
| `WHATSAPP_OPENWA_URL` | Sí** | URL de OpenWA (default `http://localhost:2785`) |
| `WHATSAPP_OPENWA_API_KEY` | Sí** | API Key del dashboard OpenWA |
| `WHATSAPP_OPENWA_SESSION_ID` | No | Nombre de sesión (default `default`) |
| `WHATSAPP_DAILY_LIMIT` | No | Límite diario de mensajes (default `1000`) |
| `OPENWA_WEBHOOK_SECRET` | Sí** | Secreto webhook, **mínimo 16 caracteres** |
| `OPENWA_WEBHOOK_URL` | Sí** | URL del webhook **vista desde OpenWA**. Con OpenWA en Docker: `http://host.docker.internal:3000/api/webhooks/openwa` |
| `GOOGLE_CLIENT_ID` | Sí*** | OAuth Google Cloud (solo en `.env`, no en UI) |
| `GOOGLE_CLIENT_SECRET` | Sí*** | Secreto OAuth Google Cloud |
| `GOOGLE_REDIRECT_URI` | No | Default: `{NEXT_PUBLIC_APP_URL}/api/auth/google/callback` |
| `GOOGLE_CALENDAR_ID` | No | ID calendario (`primary` o compartido) |
| `CRON_SECRET` | Sí**** | Secreto para endpoint de recordatorios automáticos |
| `SEED_ADMIN_EMAIL` | No | Correo admin inicial (solo seed) |
| `SEED_ADMIN_PASSWORD` | No | Contraseña admin inicial (solo seed) |

\* Obligatorio si se envían correos.  
\** Obligatorio con `WHATSAPP_MODE=openwa`.  
\*** Obligatorio para login con Google y agendar citas en Calendar.  
\**** Obligatorio si se programan recordatorios automáticos.

> **Seguridad:** Nunca suba el archivo `.env` al repositorio. Configure las credenciales **una sola vez** en el servidor.

---

## 5. Base de datos MySQL

### Docker (recomendado)

```bash
npm run db:up       # Levantar MySQL
npm run db:down     # Detener MySQL
npm run db:check    # Verificar conexión y esquema
npm run db:sync     # Sincronizar esquema Prisma (detiene puerto 3000 si hace falta)
npm run db:seed     # Usuario admin + plantillas por defecto
npm run db:setup    # db:push + seed (sin Docker)
```

Credenciales Docker por defecto (`docker-compose.yml`):

| Parámetro | Valor |
|---|---|
| Host | `localhost:3306` |
| Usuario | `root` |
| Contraseña | `password` |
| Base de datos | `hemocentro` |

### MySQL nativo (sin Docker)

1. Instale MySQL 8 en el servidor.
2. Cree la base de datos:

```sql
CREATE DATABASE hemocentro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. Actualice `DATABASE_URL` en `.env`.
4. Ejecute:

```bash
npm run db:sync
npm run db:seed
npm run db:check
```

---

## 6. WhatsApp con OpenWA

[OpenWA](https://www.open-wa.org/) es la pasarela WhatsApp self-hosted recomendada.

### 6.1 Instalar y levantar OpenWA

```bash
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA
docker compose -f docker-compose.dev.yml up -d
```

- Dashboard y API: `http://localhost:2785`
- Swagger: `http://localhost:2785/api/docs`

Verificar:

```bash
curl http://localhost:2785/api/health
```

### 6.2 Configurar en `.env` (servidor)

```env
WHATSAPP_MODE="openwa"
WHATSAPP_OPENWA_URL="http://localhost:2785"
WHATSAPP_OPENWA_API_KEY="copiar-desde-dashboard-openwa"
WHATSAPP_OPENWA_SESSION_ID="default"
OPENWA_WEBHOOK_SECRET="secreto-minimo-16-caracteres"
```

La API Key se obtiene en el dashboard de OpenWA (`:2785`).

### 6.3 Vincular WhatsApp (escanear QR)

1. Inicie la app HUAV: `npm run dev:fresh` o `npm run start`
2. Inicie sesión como **admin**
3. Vaya a **Configuración → WhatsApp y Google Calendar**
4. Pulse **Generar código QR** y escanéelo con WhatsApp → Dispositivos vinculados
5. Espere estado **Conectado** (`ready`)
6. Pulse **Probar conexión** y **Enviar prueba**

### 6.4 Registrar webhook (obligatorio para agendar citas)

El webhook permite que cuando un donante responda **Sí** por WhatsApp, la app le envíe fechas disponibles y confirme la cita.

**Si OpenWA corre en Docker** (caso habitual en Windows), agregue en `.env`:

```env
OPENWA_WEBHOOK_URL="http://host.docker.internal:3000/api/webhooks/openwa"
```

> OpenWA dentro del contenedor **no puede** llamar a `http://localhost:3000` de su PC. Debe usar `host.docker.internal`.

```bash
# Con la app corriendo y OPENWA_WEBHOOK_SECRET configurado en .env
npm run openwa:register-webhook
```

También se registra automáticamente al **Generar QR** en Configuración, si el secreto webhook tiene al menos 16 caracteres.

### 6.5 Ver citas en la app

Las citas confirmadas por WhatsApp aparecen en **Citas** del menú lateral, aunque Google Calendar no esté conectado. Cada fila indica si ya se sincronizó con Calendar (**Sincronizada** / **Pendiente**).

### 6.6 Flujo de agendamiento por WhatsApp

1. Se envía recordatorio al donante.
2. Donante responde **Sí**.
3. La app responde con **5 fechas numeradas**.
4. Donante responde con un **número** (1, 2, 3…).
5. Se confirma la cita y se crea evento en **Google Calendar** (si está conectado).

**Horario del hemocentro** (fechas ofrecidas automáticamente):

| Día | Horario de atención | Citas ofrecidas |
|---|---|---|
| Lunes–viernes | 7:30 a.m.–12 p.m. y 2–5 p.m. | 8:00, 9:00, 10:00, 11:00, 14:00, 15:00, 16:00 |
| Sábado | 8 a.m.–12:30 p.m. | 8:00, 9:00, 10:00, 11:00 |
| Domingo | Cerrado | — |

**Sede:** Carrera 13 # 13c-39, Valledupar, Cesar · **Tel:** (605) 5732706

### 6.7 Motor Baileys (recomendado si los envíos fallan)

El motor por defecto **whatsapp-web.js** puede fallar al enviar mensajes con el error:

`TypeError: Cannot read properties of undefined (reading 'id')`

Esto ocurre con contactos migrados a `@lid`. **Baileys** no tiene ese bug.

En la carpeta de OpenWA, edite `data/.env.generated` y agregue:

```env
ENGINE_TYPE=baileys
```

Reinicie OpenWA y vuelva a vincular WhatsApp:

```bash
docker restart openwa-api
npm run openwa:restart-session
node scripts/check-openwa-engine.cjs   # debe mostrar engine.type = baileys
```

Luego escanee el QR en **Configuración → WhatsApp** (Baileys usa credenciales distintas; es obligatorio re-vincular).

---

## 7. Google OAuth y Google Calendar

Las credenciales OAuth se configuran **solo en `.env`** (no en la interfaz de usuario).

### 7.1 Google Cloud Console

1. Cree un proyecto en [Google Cloud Console](https://console.cloud.google.com/)
2. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente OAuth**
3. Tipo: **Aplicación web**
4. Configure:
   - **Orígenes JS autorizados:** `http://<IP-SERVIDOR>:3000`
   - **URIs de redirección:** `http://<IP-SERVIDOR>:3000/api/auth/google/callback`
5. Copie **ID de cliente** y **Secreto de cliente** al `.env`

### 7.2 Variables en `.env`

```env
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
GOOGLE_REDIRECT_URI="http://192.168.1.50:3000/api/auth/google/callback"
```

### 7.3 Conectar Calendar

**Opción A — iniciar sesión con Google (más simple)**

1. Cierre sesión en la app
2. En `/login`, pulse **Continuar con Google** con un correo registrado en **Usuarios** (ej. `orlandojs199918@gmail.com`)
3. Acepte el permiso de **Google Calendar** cuando Google lo solicite
4. Verifique con `node scripts/check-google-oauth.cjs` → `calendarConfigured: true`

**Opción B — desde Configuración**

1. Inicie sesión como **admin**
2. **Configuración → WhatsApp y Google Calendar**
3. Pulse **Conectar Google Calendar** con la cuenta del funcionario
4. Autorice el acceso (debe aparecer «Google Calendar conectado»)

**Opción C — script CLI** (si las opciones anteriores fallan)

```bash
npm run google:connect-calendar
```

1. Abra la URL que imprime el script
2. Autorice con el correo del funcionario
3. Copie el parámetro `code` de la URL de redirección y péguelo en la terminal

> En modo **Prueba** de Google Cloud, agregue cada correo en **Pantalla de consentimiento OAuth → Usuarios de prueba**.

Verifique la conexión:

```bash
node scripts/check-google-oauth.cjs
# calendarConfigured debe ser true

npm run google:test-calendar
# crea un evento de prueba y muestra el enlace en Calendar
```

Opcional: en **ID del calendario Google** use `primary` o el ID de un calendario compartido del equipo.

### 7.4 Cita en WhatsApp pero no en Calendar

Si el donante recibe confirmación por WhatsApp pero **no hay evento en Calendar**:

1. `node scripts/check-google-oauth.cjs` → si `hasRefreshToken: false`, conecte Google Calendar (paso 7.3)
2. Revise que el correo conectado sea el que usa el funcionario en Google Calendar
3. Si usa calendario compartido, configure el **ID del calendario** en Configuración
4. Vuelva a conectar si Google muestra error 403 (agregue el correo como usuario de prueba)

---

## 8. Correo electrónico (SMTP)

Configure en `.env`:

```env
SMTP_HOST="smtp.ejemplo.com"
SMTP_PORT="587"
SMTP_USER="usuario@smtp.com"
SMTP_PASS="contraseña"
SMTP_FROM="HUAV Banco de Sangre <noreply@hemocentro.org>"
```

Las plantillas de correo se editan en **Mensajería**. Las imágenes adjuntas se incluyen en el cuerpo HTML.

---

## 9. Recordatorios automáticos (cron)

Para enviar recordatorios, cumpleaños y fechas especiales de forma automática:

### 9.1 Configurar secreto

```env
CRON_SECRET="generar-secreto-cron-largo"
```

### 9.2 Ejecutar manualmente (prueba)

```bash
npm run cron:reminders
```

### 9.3 Programar en el servidor (Linux crontab)

Ejemplo: todos los días a las 8:00 AM:

```cron
0 8 * * * cd /opt/recordatorio_hemocentro && /usr/bin/node scripts/run-cron.cjs >> /var/log/hemocentro-cron.log 2>&1
```

Active los envíos automáticos en **Configuración → Configuración general**.

---

## 10. Importar donantes

### Opción A — Base de datos HUAV (recomendado en producción)

Consulta oficial en la raíz del proyecto:

```
donantes_info.sql
```

Extrae donantes desde las tablas `person`, `donation`, etc. de la BD **`huav`**. El script quita el `LIMIT 1000` del SQL para importar **todos** los registros y deduplica por identificación conservando la última donación.

```bash
npm run import:donors:huav
```

Requisitos: `HUAV_DB_*` / `DATABASE_URL` configurados y acceso de red al servidor `192.168.1.4`.

### Opción B — Excel exportado

Archivo:

```
data/Info Donates 2026.xlsx
```

```bash
npm run import:donors
```

Importa ~6.000 registros, deduplica por teléfono/nombre y conserva la última fecha de donación.

### Desde la interfaz web

1. **Donantes → Importar**
2. Seleccione el Excel
3. Verifique mapeo de columnas y pulse **Importar base**

---

## 11. Acceso desde la red local

### Obtener IP del servidor

**Windows (PowerShell):**

```powershell
ipconfig
```

**Linux:**

```bash
ip addr show
```

Ejemplo: `192.168.1.50`

### Configurar `.env`

```env
NEXT_PUBLIC_APP_URL="http://192.168.1.50:3000"
GOOGLE_REDIRECT_URI="http://192.168.1.50:3000/api/auth/google/callback"
```

Reinicie la app después de cambiar `.env`.

### Acceder desde otro dispositivo

```
http://192.168.1.50:3000
```

### Firewall Windows (puerto 3000)

1. **Firewall de Windows Defender → Configuración avanzada**
2. **Reglas de entrada → Nueva regla → Puerto → TCP 3000**
3. **Permitir la conexión**

---

## 12. Referencia de comandos

### Instalación y arranque

| Comando | Descripción |
|---|---|
| `npm install` | Instalar dependencias |
| `npm run install:local` | Instalación completa: .env + Docker MySQL + tablas + seed |
| `npm run local:setup` | Alias de `install:local` |
| `npm run dev` | Modo desarrollo |
| `npm run dev:fresh` | Verifica BD, libera puerto 3000 e inicia dev |
| `npm run build` | Compilar para producción |
| `npm run start` | Servidor de producción |

### Base de datos

| Comando | Descripción |
|---|---|
| `npm run db:up` | Levantar MySQL (Docker) |
| `npm run db:down` | Detener MySQL (Docker) |
| `npm run db:check` | Verificar conexión y esquema |
| `npm run db:sync` | Sincronizar esquema + generar cliente Prisma |
| `npm run db:push` | Solo `prisma db push` |
| `npm run db:seed` | Usuario admin + plantillas |
| `npm run db:setup` | `db:push` + seed |

### Datos y automatización

| Comando | Descripción |
|---|---|
| `npm run import:donors` | Importar Excel de donantes |
| `npm run import:donors:huav` | Importar desde BD HUAV (`donantes_info.sql`) |
| `npm run cron:reminders` | Ejecutar recordatorios automáticos |
| `npm run openwa:register-webhook` | Registrar webhook OpenWA para respuestas WhatsApp |

### Diagnóstico (scripts internos)

| Comando | Descripción |
|---|---|
| `node scripts/check-openwa-status.cjs` | Estado sesión OpenWA |
| `node scripts/check-openwa-engine.cjs` | Motor activo (baileys / whatsapp-web.js) |
| `npm run openwa:restart-session` | Reiniciar sesión OpenWA tras cambio de motor |
| `node scripts/test-openwa-booking-flow.cjs` | Probar flujo Sí → fechas → confirmación |
| `curl http://localhost:3000/api/health` | Salud app + BD |
| `curl http://localhost:2785/api/health` | Salud OpenWA |

---

## 13. Solución de problemas

| Problema | Solución |
|---|---|
| `/api/health` responde 503 | `npm run db:up` y `npm run db:check` |
| Error 500 en dashboard/settings | `npm run db:sync` (esquema desactualizado) |
| `EPERM` en `prisma generate` (Windows) | Detenga la app (`Ctrl+C`) y ejecute `npm run db:sync` |
| Puerto 3000 ocupado | `npm run dev:fresh` o detenga el proceso manualmente |
| No accede desde otro PC | Verifique IP, firewall y `NEXT_PUBLIC_APP_URL` |
| OpenWA: «API Key incorrecta» | Copie la key del dashboard `:2785` a `WHATSAPP_OPENWA_API_KEY` en `.env` |
| WhatsApp no envía / no conecta | Escanee QR → espere estado `ready` en Configuración |
| Donante responde Sí pero no recibe fechas | Configure `OPENWA_WEBHOOK_URL=http://host.docker.internal:3000/api/webhooks/openwa` si OpenWA está en Docker; luego `npm run openwa:register-webhook` |
| OpenWA: mensajes en status `failed` | Cambie el motor a **Baileys** (ver abajo), reinicie OpenWA, escanee el QR y pruebe envío desde Configuración |
| OpenWA: error `Cannot read properties of undefined (reading 'id')` | Bug del motor **whatsapp-web.js** con contactos `@lid`. Solución: usar motor **Baileys** |
| «Google OAuth no configurado» | Configure `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env` y reinicie |
| Google bloquea acceso (403) | Agregue el correo en Google Cloud → Usuarios de prueba |
| «Ya tiene cita confirmada» al responder Sí | El donante ya tiene cita futura; use otro donante o cancele la cita existente |
| Cita confirmada por WhatsApp pero no en Calendar | Conecte Google Calendar en Configuración (`node scripts/check-google-oauth.cjs` → `hasRefreshToken: true`) |
| Imagen no llega por WhatsApp | Use modo `openwa` o WhatsApp Cloud API |

---

## Enlaces útiles

- OpenWA: [https://www.open-wa.org/](https://www.open-wa.org/)
- Repositorio OpenWA: [github.com/rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA)
- Google Cloud Console: [https://console.cloud.google.com/](https://console.cloud.google.com/)

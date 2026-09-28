# HUAV — Recordatorios de donantes

Plataforma administrativa para **HUAV Banco de Sangre**: gestión de donantes, importación desde Excel, recordatorios periódicos por WhatsApp y correo.

> **Bases de datos separadas:** `DATABASE_URL` → `hemocentro_app` (esta app). `HUAV_DB_*` → `huav` (sistema corporativo, solo lectura). **Nunca** ejecute `prisma db push` sobre `huav`. Recuperación: [docs/RECUPERACION-BD-HUAV.md](docs/RECUPERACION-BD-HUAV.md).

## Inicio rápido (desarrollo Windows)

```bash
npm install
copy .env.example .env
npm run local:setup
npm run dev:fresh
```

## Instalación en servidor Linux (VM + Docker)

```bash
chmod +x scripts/install-server.sh
cp .env.server.example .env   # edite credenciales HUAV / OpenWA / Google
./scripts/install-server.sh   # MySQL externo (huav) según .env
# ./scripts/install-server.sh --docker   # MySQL en Docker (pruebas)
```

Ver **[docs/INSTALACION-SERVIDOR.md](docs/INSTALACION-SERVIDOR.md)** para el paso a paso completo.

Abra [http://localhost:3000/login](http://localhost:3000/login) con `admin@hemocentro.local` / `Admin123!`.

## Importar donantes HUAV

```bash
npm run import:donors
```

Usa el archivo `data/Info Donates 2026.xlsx`.

## Pruebas (Google Calendar)

```bash
npm run test:google-calendar
```

Valida OAuth, creación de eventos, sincronización de citas y mensajes de confirmación (15 pruebas con mocks).

## Documentación completa

Consulte **[docs/INSTALACION.md](docs/INSTALACION.md)** para:

- Instalar en otro equipo
- Acceder desde la red local cambiando la IP
- Configurar OpenWA ([open-wa.org](https://www.open-wa.org/))
- Configurar SMTP e imágenes en plantillas
- Solución de problemas

## Stack

Next.js 16 · TypeScript · Tailwind v4 · Prisma · MySQL · OpenWA / WhatsApp Cloud API · Nodemailer
# Hemocentro_Record

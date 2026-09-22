# HUAV — Recordatorios de donantes

Plataforma administrativa para **HUAV Banco de Sangre**: gestión de donantes, importación desde Excel, recordatorios periódicos por WhatsApp y correo.

## Inicio rápido

```bash
npm install
copy .env.example .env
npm run local:setup
npm run dev:fresh
```

Abra [http://localhost:3000/login](http://localhost:3000/login) con `admin@hemocentro.local` / `Admin123!`.

## Importar donantes HUAV

```bash
npm run import:donors
```

Usa el archivo `data/Info Donates 2026.xlsx`.

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

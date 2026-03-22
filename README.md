# Nexus

Workspace de consultoría de implementación de HubSpot potenciado por IA. Permite planificar y ejecutar proyectos de CRM con agentes de IA, gestión de clientes, análisis de transcripciones (Fireflies) y auditoría de HubSpot.

## Stack

- **Frontend/Backend**: Next.js 15 (App Router) + TypeScript
- **Base de datos**: Supabase PostgreSQL + Prisma 7 (`@prisma/adapter-pg`)
- **IA**: Claude API (`claude-sonnet-4-6`) vía Anthropic SDK
- **Auth**: HubSpot OAuth
- **Integraciones**: Fireflies API, HubSpot API (`@hubspot/api-client`)

## Setup local

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd nexus
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
```

Completa cada variable en `.env`:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de Supabase PostgreSQL |
| `HUBSPOT_CLIENT_ID` | App de HubSpot (OAuth) |
| `HUBSPOT_CLIENT_SECRET` | Secret de la app de HubSpot |
| `HUBSPOT_REDIRECT_URI` | Callback OAuth (ej: `http://localhost:3000/api/auth/callback`) |
| `ANTHROPIC_API_KEY` | API key de Anthropic |
| `APP_URL` | URL base de la app (ej: `http://localhost:3000`) |
| `CONSULTANT_SECRET` | Token de sesión para consultores |
| `FIREFLIES_API_KEY` | API key de Fireflies.ai |
| `DATA_LAKE_URL` | URL del Supabase secundario (Data Lake) |
| `DATA_LAKE_PUBLISHABLE_KEY` | Publishable key del Data Lake |
| `DATA_LAKE_SECRET_KEY` | Secret key del Data Lake |

### 3. Sincronizar schema de base de datos

```bash
npx prisma db push
```

### 4. Correr en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

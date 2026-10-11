-- 2026-10-09 · Tareas internas: lo que se acuerda en una reunión termina en la semana y en la agenda de cada persona.
--
-- Por qué: el equipo lleva sus tareas en TaskView y en un Excel, y lo que se acuerda en el planning del lunes no
-- aparece en ningún lado de Nexus (los rituales de Marketing tienen 0 ActionItems). Este módulo lee las notas de Gemini
-- de las reuniones internas, PROPONE las tareas de cada persona (nada entra solo), y las lleva a la semana, a la agenda
-- de Google Calendar y a la revisión del viernes. El plan entero: docs/tareas-plan.md.
--
-- Las 13 tablas entran juntas (decisión 12 del plan): "Tarea" no existe en producción, sumar columnas ahora no cuesta
-- un ALTER, y se evitan varias coordinaciones de DDL entre las dos PCs. El modelo vive en la sección «Tareas internas»
-- de prisma/schema.prisma. Las escribe SOLO lib/tareas/mutaciones.ts.
--
--   · "EspacioDeTareas", "MiembroDeEspacio"     — dónde vive el trabajo: el espacio de cada equipo y los libres.
--   · "ProyectoDeTareas", "PlantillaDeTareas"   — proyectos de tareas internas (NO son Project de HubSpot) y planes.
--   · "Tarea"                                   — una tarea, de la propuesta a la lápida: UNA fila.
--   · "TareaRelacion", "TareaComentario"        — dependencias y comentarios.
--   · "TareaVinculo"                            — registros de HubSpot, propuestas y preventas vinculados.
--   · "TareaEvento"                             — bitácora de solo agregar.
--   · "ResultadoDeSemana", "CierreDeSemana"     — la revisión de cada semana.
--   · "LecturaDeReunion", "FuenteDeTareas"      — qué reunión se leyó y cuáles se leen cada semana (desde 1C).
--
-- ⚠ Estados, tipos y orígenes van como TEXT y no como enum (misma decisión que Feedback y Tiempos): sumar uno no debe
-- exigir un ALTER TYPE. Los valores los fija lib/tareas/estados.ts y los valida la API.
-- ⚠ Personas por CORREO, sin FK a TeamMember (como "Aviso").
--
-- ADITIVO: 13 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy que trae el código. Sin él, /api/health responde 503 (el cliente Prisma pide
-- tablas que no existen) y el deploy se revierte solo. Antes, los SQL pendientes de otras sesiones: npm run
-- check:esquema tiene que quedar sin faltantes.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-09-tareas.sql
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA prisma db push: droppearía columnas (regla dual-PC, schema.prisma).

CREATE TABLE IF NOT EXISTS "EspacioDeTareas" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "equipo" TEXT,
    "nombre" TEXT NOT NULL,
    "icono" TEXT,
    "visibilidad" TEXT NOT NULL DEFAULT 'miembros',
    "creadoPorEmail" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "archivadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspacioDeTareas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MiembroDeEspacio" (
    "espacioId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'miembro',
    "agregadoPorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiembroDeEspacio_pkey" PRIMARY KEY ("espacioId","email")
);

CREATE TABLE IF NOT EXISTS "ProyectoDeTareas" (
    "id" TEXT NOT NULL,
    "espacioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "responsableEmail" TEXT,
    "iniciaEl" DATE,
    "venceEl" DATE,
    "clientId" TEXT,
    "projectId" TEXT,
    "secciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "origen" TEXT NOT NULL,
    "creadoPorEmail" TEXT,
    "lecturaId" TEXT,
    "sessionId" TEXT,
    "cita" TEXT,
    "plantillaId" TEXT,
    "origenId" TEXT,
    "decision" TEXT,
    "decididaPorEmail" TEXT,
    "decididaAt" TIMESTAMP(3),
    "motivo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "archivadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoDeTareas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlantillaDeTareas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "espacioId" TEXT,
    "duracionDias" INTEGER NOT NULL,
    "tareas" JSONB NOT NULL,
    "desdeProyectoId" TEXT,
    "creadaPorEmail" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "archivadaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantillaDeTareas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Tarea" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "notas" TEXT,
    "contexto" TEXT,
    "pasos" JSONB,
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "prioridad" TEXT NOT NULL DEFAULT 'media',
    "tipo" TEXT NOT NULL DEFAULT 'puesto',
    "privada" BOOLEAN NOT NULL DEFAULT false,
    "seccion" TEXT,
    "orden" DOUBLE PRECISION,
    "equipo" TEXT,
    "responsableEmail" TEXT,
    "semana" DATE,
    "venceEl" DATE,
    "minutosEstimados" INTEGER,
    "completadaAt" TIMESTAMP(3),
    "proyectoId" TEXT,
    "clientId" TEXT,
    "projectId" TEXT,
    "origen" TEXT NOT NULL,
    "creadaPorEmail" TEXT,
    "pedidaPorEmail" TEXT,
    "pedidaPorEquipo" TEXT,
    "pedidaPorTexto" TEXT,
    "lecturaId" TEXT,
    "sessionId" TEXT,
    "origenTitulo" TEXT,
    "cita" TEXT,
    "origenId" TEXT,
    "mismaQueId" TEXT,
    "decision" TEXT,
    "decididaPorEmail" TEXT,
    "decididaAt" TIMESTAMP(3),
    "motivo" TEXT,
    "agendaEstado" TEXT NOT NULL DEFAULT 'sin_agendar',
    "agendaInicio" TIMESTAMP(3),
    "agendaBloques" JSONB,
    "agendadaAt" TIMESTAMP(3),
    "agendaVerificadaAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "archivadaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tarea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TareaRelacion" (
    "desdeId" TEXT NOT NULL,
    "haciaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "creadaPorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TareaRelacion_pkey" PRIMARY KEY ("desdeId","haciaId","tipo")
);

CREATE TABLE IF NOT EXISTS "TareaComentario" (
    "id" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "autorEmail" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "editadoAt" TIMESTAMP(3),
    "archivadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TareaComentario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TareaVinculo" (
    "id" TEXT NOT NULL,
    "tareaId" TEXT,
    "proyectoId" TEXT,
    "hubspotPortalId" TEXT,
    "hubspotObjeto" TEXT,
    "externalHubspotRecordId" TEXT,
    "businessCaseId" TEXT,
    "exploracionId" TEXT,
    "etiqueta" TEXT NOT NULL,
    "detalle" TEXT,
    "empresaResuelta" TEXT NOT NULL DEFAULT 'pendiente',
    "clientId" TEXT,
    "projectId" TEXT,
    "fotoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ausenteAt" TIMESTAMP(3),
    "creadoPorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TareaVinculo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TareaEvento" (
    "id" TEXT NOT NULL,
    "tareaId" TEXT,
    "proyectoId" TEXT,
    "tipo" TEXT NOT NULL,
    "porEmail" TEXT NOT NULL,
    "sessionId" TEXT,
    "cita" TEXT,
    "datos" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TareaEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ResultadoDeSemana" (
    "tareaId" TEXT NOT NULL,
    "semana" DATE NOT NULL,
    "equipo" TEXT,
    "responsableEmail" TEXT,
    "fotoCliente" TEXT,
    "fotoClienteNombre" TEXT,
    "fotoAmbito" TEXT NOT NULL,
    "fotoAmbitoNombre" TEXT,
    "proyectoId" TEXT,
    "venceEl" DATE,
    "resultado" TEXT NOT NULL,
    "decididoPor" TEXT NOT NULL,
    "decididoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutosEstimados" INTEGER,

    CONSTRAINT "ResultadoDeSemana_pkey" PRIMARY KEY ("tareaId","semana")
);

CREATE TABLE IF NOT EXISTS "CierreDeSemana" (
    "id" TEXT NOT NULL,
    "personaEmail" TEXT NOT NULL,
    "semana" DATE NOT NULL,
    "cerradaPor" TEXT NOT NULL,
    "cerradaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreDeSemana_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LecturaDeReunion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "texto" TEXT,
    "huellaTexto" TEXT,
    "copiaDeId" TEXT,
    "fuenteId" TEXT,
    "equipo" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "semana" DATE NOT NULL,
    "semanaQueCierra" DATE,
    "estado" TEXT NOT NULL DEFAULT 'leyendo',
    "procesarDesde" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "leyendoDesde" TIMESTAMP(3),
    "modo" TEXT,
    "avisar" BOOLEAN NOT NULL DEFAULT true,
    "pedidaPorEmail" TEXT,
    "agentRunId" TEXT,
    "resumen" JSONB,
    "error" TEXT,
    "leidaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LecturaDeReunion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FuenteDeTareas" (
    "id" TEXT NOT NULL,
    "equipo" TEXT,
    "duenoEmail" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "diaSemana" INTEGER,
    "finHora" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "pausadaMotivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuenteDeTareas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EspacioDeTareas_equipo_key" ON "EspacioDeTareas"("equipo");

CREATE INDEX IF NOT EXISTS "MiembroDeEspacio_email_idx" ON "MiembroDeEspacio"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoDeTareas_origenId_key" ON "ProyectoDeTareas"("origenId");

CREATE INDEX IF NOT EXISTS "ProyectoDeTareas_espacioId_estado_idx" ON "ProyectoDeTareas"("espacioId", "estado");

CREATE INDEX IF NOT EXISTS "ProyectoDeTareas_responsableEmail_estado_idx" ON "ProyectoDeTareas"("responsableEmail", "estado");

CREATE INDEX IF NOT EXISTS "ProyectoDeTareas_clientId_idx" ON "ProyectoDeTareas"("clientId");

CREATE INDEX IF NOT EXISTS "ProyectoDeTareas_projectId_idx" ON "ProyectoDeTareas"("projectId");

CREATE INDEX IF NOT EXISTS "ProyectoDeTareas_lecturaId_idx" ON "ProyectoDeTareas"("lecturaId");

CREATE INDEX IF NOT EXISTS "ProyectoDeTareas_sessionId_idx" ON "ProyectoDeTareas"("sessionId");

CREATE INDEX IF NOT EXISTS "ProyectoDeTareas_plantillaId_idx" ON "ProyectoDeTareas"("plantillaId");

CREATE INDEX IF NOT EXISTS "PlantillaDeTareas_espacioId_archivadaAt_idx" ON "PlantillaDeTareas"("espacioId", "archivadaAt");

CREATE INDEX IF NOT EXISTS "PlantillaDeTareas_desdeProyectoId_idx" ON "PlantillaDeTareas"("desdeProyectoId");

CREATE UNIQUE INDEX IF NOT EXISTS "Tarea_numero_key" ON "Tarea"("numero");

CREATE UNIQUE INDEX IF NOT EXISTS "Tarea_origenId_key" ON "Tarea"("origenId");

CREATE INDEX IF NOT EXISTS "Tarea_responsableEmail_estado_idx" ON "Tarea"("responsableEmail", "estado");

CREATE INDEX IF NOT EXISTS "Tarea_equipo_semana_estado_idx" ON "Tarea"("equipo", "semana", "estado");

CREATE INDEX IF NOT EXISTS "Tarea_proyectoId_estado_idx" ON "Tarea"("proyectoId", "estado");

CREATE INDEX IF NOT EXISTS "Tarea_clientId_completadaAt_idx" ON "Tarea"("clientId", "completadaAt");

CREATE INDEX IF NOT EXISTS "Tarea_projectId_idx" ON "Tarea"("projectId");

CREATE INDEX IF NOT EXISTS "Tarea_pedidaPorEmail_estado_idx" ON "Tarea"("pedidaPorEmail", "estado");

CREATE INDEX IF NOT EXISTS "Tarea_creadaPorEmail_idx" ON "Tarea"("creadaPorEmail");

CREATE INDEX IF NOT EXISTS "Tarea_sessionId_idx" ON "Tarea"("sessionId");

CREATE INDEX IF NOT EXISTS "Tarea_mismaQueId_idx" ON "Tarea"("mismaQueId");

CREATE INDEX IF NOT EXISTS "Tarea_lecturaId_idx" ON "Tarea"("lecturaId");

CREATE INDEX IF NOT EXISTS "Tarea_huella_idx" ON "Tarea"("huella");

CREATE INDEX IF NOT EXISTS "TareaRelacion_haciaId_idx" ON "TareaRelacion"("haciaId");

CREATE INDEX IF NOT EXISTS "TareaComentario_tareaId_createdAt_idx" ON "TareaComentario"("tareaId", "createdAt");

CREATE INDEX IF NOT EXISTS "TareaVinculo_tareaId_idx" ON "TareaVinculo"("tareaId");

CREATE INDEX IF NOT EXISTS "TareaVinculo_proyectoId_idx" ON "TareaVinculo"("proyectoId");

CREATE INDEX IF NOT EXISTS "TareaVinculo_hubspotObjeto_externalHubspotRecordId_idx" ON "TareaVinculo"("hubspotObjeto", "externalHubspotRecordId");

CREATE INDEX IF NOT EXISTS "TareaVinculo_clientId_idx" ON "TareaVinculo"("clientId");

CREATE INDEX IF NOT EXISTS "TareaVinculo_projectId_idx" ON "TareaVinculo"("projectId");

CREATE INDEX IF NOT EXISTS "TareaVinculo_businessCaseId_idx" ON "TareaVinculo"("businessCaseId");

CREATE INDEX IF NOT EXISTS "TareaVinculo_exploracionId_idx" ON "TareaVinculo"("exploracionId");

CREATE INDEX IF NOT EXISTS "TareaEvento_tareaId_createdAt_idx" ON "TareaEvento"("tareaId", "createdAt");

CREATE INDEX IF NOT EXISTS "TareaEvento_proyectoId_createdAt_idx" ON "TareaEvento"("proyectoId", "createdAt");

CREATE INDEX IF NOT EXISTS "TareaEvento_porEmail_idx" ON "TareaEvento"("porEmail");

CREATE INDEX IF NOT EXISTS "TareaEvento_sessionId_idx" ON "TareaEvento"("sessionId");

CREATE INDEX IF NOT EXISTS "ResultadoDeSemana_equipo_semana_idx" ON "ResultadoDeSemana"("equipo", "semana");

CREATE INDEX IF NOT EXISTS "ResultadoDeSemana_responsableEmail_semana_idx" ON "ResultadoDeSemana"("responsableEmail", "semana");

CREATE INDEX IF NOT EXISTS "ResultadoDeSemana_fotoCliente_semana_idx" ON "ResultadoDeSemana"("fotoCliente", "semana");

CREATE INDEX IF NOT EXISTS "ResultadoDeSemana_proyectoId_semana_idx" ON "ResultadoDeSemana"("proyectoId", "semana");

CREATE INDEX IF NOT EXISTS "CierreDeSemana_semana_idx" ON "CierreDeSemana"("semana");

CREATE UNIQUE INDEX IF NOT EXISTS "CierreDeSemana_personaEmail_semana_key" ON "CierreDeSemana"("personaEmail", "semana");

CREATE UNIQUE INDEX IF NOT EXISTS "LecturaDeReunion_sessionId_key" ON "LecturaDeReunion"("sessionId");

CREATE INDEX IF NOT EXISTS "LecturaDeReunion_estado_procesarDesde_idx" ON "LecturaDeReunion"("estado", "procesarDesde");

CREATE INDEX IF NOT EXISTS "LecturaDeReunion_huellaTexto_idx" ON "LecturaDeReunion"("huellaTexto");

CREATE INDEX IF NOT EXISTS "LecturaDeReunion_pedidaPorEmail_createdAt_idx" ON "LecturaDeReunion"("pedidaPorEmail", "createdAt");

CREATE INDEX IF NOT EXISTS "LecturaDeReunion_copiaDeId_idx" ON "LecturaDeReunion"("copiaDeId");

CREATE INDEX IF NOT EXISTS "LecturaDeReunion_fuenteId_idx" ON "LecturaDeReunion"("fuenteId");

CREATE INDEX IF NOT EXISTS "LecturaDeReunion_agentRunId_idx" ON "LecturaDeReunion"("agentRunId");

CREATE INDEX IF NOT EXISTS "FuenteDeTareas_serie_idx" ON "FuenteDeTareas"("serie");

DO $$ BEGIN
  ALTER TABLE "MiembroDeEspacio" ADD CONSTRAINT "MiembroDeEspacio_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "EspacioDeTareas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProyectoDeTareas" ADD CONSTRAINT "ProyectoDeTareas_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "EspacioDeTareas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProyectoDeTareas" ADD CONSTRAINT "ProyectoDeTareas_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProyectoDeTareas" ADD CONSTRAINT "ProyectoDeTareas_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProyectoDeTareas" ADD CONSTRAINT "ProyectoDeTareas_lecturaId_fkey" FOREIGN KEY ("lecturaId") REFERENCES "LecturaDeReunion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProyectoDeTareas" ADD CONSTRAINT "ProyectoDeTareas_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProyectoDeTareas" ADD CONSTRAINT "ProyectoDeTareas_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "PlantillaDeTareas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PlantillaDeTareas" ADD CONSTRAINT "PlantillaDeTareas_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "EspacioDeTareas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PlantillaDeTareas" ADD CONSTRAINT "PlantillaDeTareas_desdeProyectoId_fkey" FOREIGN KEY ("desdeProyectoId") REFERENCES "ProyectoDeTareas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "ProyectoDeTareas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_lecturaId_fkey" FOREIGN KEY ("lecturaId") REFERENCES "LecturaDeReunion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_mismaQueId_fkey" FOREIGN KEY ("mismaQueId") REFERENCES "Tarea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaRelacion" ADD CONSTRAINT "TareaRelacion_desdeId_fkey" FOREIGN KEY ("desdeId") REFERENCES "Tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaRelacion" ADD CONSTRAINT "TareaRelacion_haciaId_fkey" FOREIGN KEY ("haciaId") REFERENCES "Tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaComentario" ADD CONSTRAINT "TareaComentario_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaVinculo" ADD CONSTRAINT "TareaVinculo_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaVinculo" ADD CONSTRAINT "TareaVinculo_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "ProyectoDeTareas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaVinculo" ADD CONSTRAINT "TareaVinculo_businessCaseId_fkey" FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaVinculo" ADD CONSTRAINT "TareaVinculo_exploracionId_fkey" FOREIGN KEY ("exploracionId") REFERENCES "ExploracionDeVenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaVinculo" ADD CONSTRAINT "TareaVinculo_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaVinculo" ADD CONSTRAINT "TareaVinculo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaEvento" ADD CONSTRAINT "TareaEvento_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaEvento" ADD CONSTRAINT "TareaEvento_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "ProyectoDeTareas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TareaEvento" ADD CONSTRAINT "TareaEvento_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ResultadoDeSemana" ADD CONSTRAINT "ResultadoDeSemana_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ResultadoDeSemana" ADD CONSTRAINT "ResultadoDeSemana_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "ProyectoDeTareas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LecturaDeReunion" ADD CONSTRAINT "LecturaDeReunion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LecturaDeReunion" ADD CONSTRAINT "LecturaDeReunion_copiaDeId_fkey" FOREIGN KEY ("copiaDeId") REFERENCES "LecturaDeReunion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LecturaDeReunion" ADD CONSTRAINT "LecturaDeReunion_fuenteId_fkey" FOREIGN KEY ("fuenteId") REFERENCES "FuenteDeTareas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LecturaDeReunion" ADD CONSTRAINT "LecturaDeReunion_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Reglas que la base hace cumplir (docs/tareas-plan.md §2) ─────────────────────────────
DO $$ BEGIN
  ALTER TABLE "EspacioDeTareas" ADD CONSTRAINT "EspacioDeTareas_equipo_si_es_de_equipo" CHECK (("tipo" = 'equipo') = ("equipo" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EspacioDeTareas" ADD CONSTRAINT "EspacioDeTareas_tipo_valido" CHECK ("tipo" IN ('equipo', 'libre'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProyectoDeTareas" ADD CONSTRAINT "ProyectoDeTareas_etiquetas_tope" CHECK (cardinality("etiquetas") <= 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProyectoDeTareas" ADD CONSTRAINT "ProyectoDeTareas_secciones_tope" CHECK (cardinality("secciones") <= 12);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_hecha_con_fecha" CHECK (("estado" = 'hecha') = ("completadaAt" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_sprint_o_proyecto_sin_responsable" CHECK ("equipo" IS NOT NULL OR ("proyectoId" IS NOT NULL AND "responsableEmail" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_semana_con_responsable" CHECK ("responsableEmail" IS NOT NULL OR "semana" IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_etiquetas_tope" CHECK (cardinality("etiquetas") <= 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_minutos_rango" CHECK ("minutosEstimados" IS NULL OR ("minutosEstimados" >= 1 AND "minutosEstimados" <= 14400));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TareaRelacion" ADD CONSTRAINT "TareaRelacion_no_a_si_misma" CHECK ("desdeId" <> "haciaId");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TareaRelacion" ADD CONSTRAINT "TareaRelacion_par_ordenado" CHECK ("tipo" <> 'relacionada' OR "desdeId" < "haciaId");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TareaComentario" ADD CONSTRAINT "TareaComentario_cuerpo_tope" CHECK (char_length("cuerpo") <= 4000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TareaVinculo" ADD CONSTRAINT "TareaVinculo_un_dueno" CHECK (num_nonnulls("tareaId", "proyectoId") = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TareaVinculo" ADD CONSTRAINT "TareaVinculo_un_destino" CHECK (num_nonnulls("externalHubspotRecordId", "businessCaseId", "exploracionId") = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TareaVinculo" ADD CONSTRAINT "TareaVinculo_hubspot_completo" CHECK (("externalHubspotRecordId" IS NULL) = ("hubspotObjeto" IS NULL) AND ("externalHubspotRecordId" IS NULL) = ("hubspotPortalId" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TareaEvento" ADD CONSTRAINT "TareaEvento_un_dueno" CHECK (num_nonnulls("tareaId", "proyectoId") = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LecturaDeReunion" ADD CONSTRAINT "LecturaDeReunion_reunion_o_texto" CHECK (num_nonnulls("sessionId", "texto") >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Únicos que Prisma no sabe declarar ───────────────────────────────────────────────────
-- Un proyecto PROPUESTO no se repite en su espacio: las líneas nuevas se suman al que ya está.
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoDeTareas_propuesta_unica"
  ON "ProyectoDeTareas" ("espacioId", "huella") WHERE "estado" = 'propuesta';
-- Una mención idéntica para la misma persona, del mismo cliente y del mismo pedido suma la cita en vez de crear otra.
-- Lleva el cliente y quién pidió: dos pedidos iguales de dos personas, o para dos clientes, NO se funden.
CREATE UNIQUE INDEX IF NOT EXISTS "Tarea_propuesta_unica"
  ON "Tarea" (coalesce("responsableEmail", "equipo", "proyectoId"), coalesce("clientId", ''), coalesce("pedidaPorEmail", ''), "huella") WHERE "estado" = 'propuesta';
-- El mismo registro no se vincula dos veces a la misma tarea o proyecto.
CREATE UNIQUE INDEX IF NOT EXISTS "TareaVinculo_unico"
  ON "TareaVinculo" (coalesce("tareaId", "proyectoId"), coalesce("hubspotObjeto", ''), coalesce("externalHubspotRecordId", "businessCaseId", "exploracionId"));
-- Una serie la lee una sola vez cada equipo (o cada persona, si es personal).
CREATE UNIQUE INDEX IF NOT EXISTS "FuenteDeTareas_serie_activa"
  ON "FuenteDeTareas" (coalesce("equipo", "duenoEmail"), "serie") WHERE "activa";
-- Lo abierto de cada persona por semana: Mis tareas y la revisión.
CREATE INDEX IF NOT EXISTS "Tarea_abiertas_por_semana"
  ON "Tarea" ("responsableEmail", "semana") WHERE "estado" IN ('pendiente', 'en_curso') AND "archivadaAt" IS NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a anon sobre todo public: sin esto, las tareas de cada persona, las
-- citas de las reuniones y los vínculos con clientes serían leíbles con la clave pública que viaja en el navegador. RLS
-- sin policy SELECT = cerrado para anon y authenticated; la RESTRICTIVE de encima lo mantiene cerrado aunque alguien
-- sume mañana una policy permisiva. postgres (Prisma) tiene BYPASSRLS.
ALTER TABLE "EspacioDeTareas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MiembroDeEspacio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoDeTareas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlantillaDeTareas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tarea" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TareaRelacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TareaComentario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TareaVinculo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TareaEvento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResultadoDeSemana" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CierreDeSemana" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LecturaDeReunion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FuenteDeTareas" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "EspacioDeTareas";
CREATE POLICY deny_all_non_superuser ON "EspacioDeTareas" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "MiembroDeEspacio";
CREATE POLICY deny_all_non_superuser ON "MiembroDeEspacio" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "ProyectoDeTareas";
CREATE POLICY deny_all_non_superuser ON "ProyectoDeTareas" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "PlantillaDeTareas";
CREATE POLICY deny_all_non_superuser ON "PlantillaDeTareas" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "Tarea";
CREATE POLICY deny_all_non_superuser ON "Tarea" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "TareaRelacion";
CREATE POLICY deny_all_non_superuser ON "TareaRelacion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "TareaComentario";
CREATE POLICY deny_all_non_superuser ON "TareaComentario" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "TareaVinculo";
CREATE POLICY deny_all_non_superuser ON "TareaVinculo" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "TareaEvento";
CREATE POLICY deny_all_non_superuser ON "TareaEvento" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "ResultadoDeSemana";
CREATE POLICY deny_all_non_superuser ON "ResultadoDeSemana" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "CierreDeSemana";
CREATE POLICY deny_all_non_superuser ON "CierreDeSemana" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "LecturaDeReunion";
CREATE POLICY deny_all_non_superuser ON "LecturaDeReunion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "FuenteDeTareas";
CREATE POLICY deny_all_non_superuser ON "FuenteDeTareas" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: 13 filas, todas con rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('EspacioDeTareas', 'MiembroDeEspacio', 'ProyectoDeTareas', 'PlantillaDeTareas', 'Tarea', 'TareaRelacion', 'TareaComentario', 'TareaVinculo', 'TareaEvento', 'ResultadoDeSemana', 'CierreDeSemana', 'LecturaDeReunion', 'FuenteDeTareas') ORDER BY tablename;

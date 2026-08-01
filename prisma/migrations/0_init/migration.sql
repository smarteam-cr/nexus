-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ImplementationStatus" AS ENUM ('PLANNING', 'READY', 'EXECUTING', 'DONE', 'PAUSED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('SUCCESS', 'FAILED', 'MANUAL_REQUIRED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CALL_TRANSCRIPT', 'BRIEF', 'FREE_TEXT', 'URL', 'FILE');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'DRAFT');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'ERROR', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AgentOutputType" AS ENUM ('CARDS', 'STREAM', 'FLOWCHART', 'CARDS_AND_FLOWCHARTS', 'CARDS_AND_CHARTS', 'AUDIT_REPORT');

-- CreateEnum
CREATE TYPE "AgentScope" AS ENUM ('CLIENT', 'GLOBAL');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('SECTION', 'CANVAS_PROJECT', 'CANVAS_CLIENT', 'SESSION_PROCESSOR');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('BASE_IMPLEMENTATION', 'USE_CASE');

-- CreateEnum
CREATE TYPE "ImplementationType" AS ENUM ('IMPLEMENTATION', 'REIMPLEMENTATION');

-- CreateEnum
CREATE TYPE "CardSource" AS ENUM ('AGENT', 'HUMAN', 'MODIFIED');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('TEXT', 'FLOWCHART', 'CHART');

-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('TEXT', 'HEADING', 'TABLE', 'METRIC', 'CALLOUT', 'CARD', 'FLOWCHART', 'CHART', 'IMAGE');

-- CreateEnum
CREATE TYPE "BlockSource" AS ENUM ('AGENT', 'HUMAN', 'MODIFIED');

-- CreateEnum
CREATE TYPE "BlockStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "BusinessCaseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BusinessCaseBlockType" AS ENUM ('HERO', 'PAIN_POINTS', 'BEFORE_AFTER', 'SOLUTION', 'ROI_METRICS', 'TIMELINE', 'INVESTMENT', 'PARTNER', 'CTA');

-- CreateEnum
CREATE TYPE "BusinessCaseTranscriptSource" AS ENUM ('PASTED', 'UPLOADED');

-- CreateEnum
CREATE TYPE "ProjectHealth" AS ENUM ('SALUDABLE', 'EN_FRICCION', 'EN_RIESGO', 'PAUSADO');

-- CreateEnum
CREATE TYPE "ProjectLifecycleStage" AS ENUM ('HAND_OFF', 'EXPLORACION', 'DIAGNOSTICO', 'PLANIFICACION', 'CONFIGURACION_TECNICA', 'ADOPCION', 'VALIDACION_USO', 'ENTREGA', 'OPERACION_CONTINUA', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "ProjectStageGateKey" AS ENUM ('ENTENDIMIENTO_CERRADO', 'DIAGNOSTICO_COMPARTIDO', 'CRONOGRAMA_CONSENSUADO', 'DEMO_APROBADA', 'CLIENTE_OPERANDO', 'USO_VALIDADO', 'ENTREGA_REALIZADA');

-- CreateEnum
CREATE TYPE "TimelinePhaseSource" AS ENUM ('AGENT', 'MODIFIED', 'HUMAN');

-- CreateEnum
CREATE TYPE "TimelineStatusSource" AS ENUM ('HUMAN', 'AI_CONFIRMED');

-- CreateEnum
CREATE TYPE "TaskParty" AS ENUM ('CLIENTE', 'SMARTEAM', 'AMBOS', 'DEV');

-- CreateEnum
CREATE TYPE "TimelineTaskType" AS ENUM ('SESSION', 'TASK');

-- CreateEnum
CREATE TYPE "ParticularidadKind" AS ENUM ('ATRASO', 'SOLICITUD', 'COMPROMISO', 'AVISO');

-- CreateEnum
CREATE TYPE "ParticularidadSource" AS ENUM ('AGENT', 'HUMAN');

-- CreateEnum
CREATE TYPE "TimelineChangeKind" AS ENUM ('MANUAL', 'AI_ASSIST', 'PROGRESS', 'REANCHOR');

-- CreateEnum
CREATE TYPE "TimelineActivityType" AS ENUM ('EXPLORACION', 'PLANIFICACION', 'CONFIGURACION', 'ADOPCION', 'SEGUIMIENTO');

-- CreateEnum
CREATE TYPE "TimelineTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('CSE', 'VENTAS', 'CSL', 'MARKETING', 'DEV', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AppUserKind" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ClientKind" AS ENUM ('CLIENTE', 'PROSPECTO', 'ALIADO', 'INTERNO');

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('GRANT', 'REVOKE');

-- CreateEnum
CREATE TYPE "KnowledgeType" AS ENUM ('PROCESS', 'METHODOLOGY', 'HUBSPOT_SPEC', 'BEST_PRACTICE', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TagCategory" AS ENUM ('SERVICE', 'STAGE', 'SUBSTAGE', 'DOMAIN', 'HUBSPOT_AREA', 'TOPIC');

-- CreateEnum
CREATE TYPE "MinuteStatus" AS ENUM ('DRAFT', 'REVIEWED', 'EDITED');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "IcpSection" AS ENUM ('FIRMOGRAFICA_DESCRIPTOR', 'FIRMOGRAFICA_INDUSTRIA', 'BEHAVIORAL_REVENUE', 'BEHAVIORAL_CANALES', 'BEHAVIORAL_ORG', 'BEHAVIORAL_DECISION', 'SIGNAL_ANTI', 'SIGNAL_FUERTE', 'SIGNAL_MEDIA', 'SIGNAL_DEBIL');

-- CreateEnum
CREATE TYPE "PillarOrigin" AS ENUM ('HUMAN', 'AGENT');

-- CreateEnum
CREATE TYPE "MarketingApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('GOOGLE_SEARCH', 'PAID_SOCIAL', 'DISPLAY', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketingRunKind" AS ENUM ('INGEST', 'GENERATE', 'CHAIN');

-- CreateEnum
CREATE TYPE "MarketingPostType" AS ENUM ('EMPRESA', 'PERSONA');

-- CreateEnum
CREATE TYPE "MarketingJourneyStage" AS ENUM ('CONCIENCIA', 'ESTRATEGIA', 'INSPIRACION');

-- CreateEnum
CREATE TYPE "MarketingUsageTarget" AS ENUM ('PERSONAL', 'SMARTEAM');

-- CreateEnum
CREATE TYPE "MarketingRunTrigger" AS ENUM ('MANUAL', 'CRON');

-- CreateEnum
CREATE TYPE "MarketingRunStatus" AS ENUM ('RUNNING', 'DONE', 'ERROR');

-- CreateEnum
CREATE TYPE "CsEventEntity" AS ENUM ('TIMELINE', 'PHASE', 'TASK');

-- CreateEnum
CREATE TYPE "CsEventAction" AS ENUM ('STATUS_CHANGED', 'CREATED', 'DELETED', 'MOVED', 'EDITED', 'ANCHOR_CHANGED', 'PROGRESS_APPLIED', 'TIMELINE_DELETED', 'DETAIL_DELETED');

-- CreateEnum
CREATE TYPE "CsEventSource" AS ENUM ('UI_PATCH', 'UI_PUT', 'AI_ASSIST_APPLY', 'PROGRESS_APPLY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CsAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CsAlertCategory" AS ENUM ('TIMELINE_OVERDUE', 'TASK_MODIFICATION', 'SESSION_MISSED', 'PIPELINE_MISMATCH', 'ENGAGEMENT_COLD', 'SUPPORT_TICKETS', 'RENEWAL_RISK', 'CHURN_RISK', 'EXPANSION_OPPORTUNITY', 'PROACTIVE_ACTION', 'OTHER', 'ADOPTION_RISK', 'LICENSE_UNUSED', 'PROJECT_BLOCKED', 'STAGE_STALLED');

-- CreateEnum
CREATE TYPE "CsAlertStatus" AS ENUM ('OPEN', 'SEEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CobranzaTipoCuenta" AS ENUM ('NACIONAL', 'INTERNACIONAL');

-- CreateEnum
CREATE TYPE "CobranzaViaCobro" AS ENUM ('MERCURY', 'ODOO', 'OTRA');

-- CreateEnum
CREATE TYPE "CobranzaMoneda" AS ENUM ('CRC', 'USD');

-- CreateEnum
CREATE TYPE "CobranzaTerminosPago" AS ENUM ('ANTICIPADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "CobranzaEstadoCuenta" AS ENUM ('PENDIENTE_DATOS', 'PENDIENTE_CONTRATO', 'ACTIVA', 'CON_ATRASO', 'SUSPENDIDA');

-- CreateEnum
CREATE TYPE "CobranzaTipoServicio" AS ENUM ('SUSCRIPCION', 'IMPLEMENTACION', 'WEB', 'SOPORTE', 'CRM', 'CONECTOR', 'OTRO');

-- CreateEnum
CREATE TYPE "CobranzaModalidad" AS ENUM ('RECURRENTE', 'PROYECTO');

-- CreateEnum
CREATE TYPE "CobranzaEstadoServicio" AS ENUM ('ACTIVO', 'FINALIZADO', 'PAUSADO');

-- CreateEnum
CREATE TYPE "CobranzaPlanTemplate" AS ENUM ('PAREJO', 'ENTRADA_Y_RESTO', 'SUSCRIPCION', 'PERSONALIZADO');

-- CreateEnum
CREATE TYPE "CobranzaPlanOrigen" AS ENUM ('AUTO_HANDOFF', 'MANUAL');

-- CreateEnum
CREATE TYPE "CobranzaCuotaBase" AS ENUM ('PORCENTAJE', 'MONTO_FIJO');

-- CreateEnum
CREATE TYPE "CobranzaEstadoCobro" AS ENUM ('PROGRAMADO', 'POR_COBRAR', 'COBRADO', 'SIN_DATO');

-- CreateEnum
CREATE TYPE "CobranzaOrigenCobro" AS ENUM ('PLAN', 'CATCH_UP', 'MANUAL', 'IMPORTACION');

-- CreateEnum
CREATE TYPE "CobranzaTipoAlerta" AS ENUM ('COBRO_PROXIMO', 'FACTURACION_ATRASADA', 'COBRO_VENCIDO', 'CUENTA_SIN_DATOS', 'INCONSISTENCIA_CICLO', 'ARRANQUE_CAMBIADO', 'MONTOS_DESCUADRADOS', 'PROMESA_INCUMPLIDA');

-- CreateEnum
CREATE TYPE "CobranzaUrgencia" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "CobranzaAlertaEstado" AS ENUM ('ABIERTA', 'VISTA', 'RESUELTA', 'DESCARTADA');

-- CreateEnum
CREATE TYPE "BitacoraCobroTipo" AS ENUM ('LLAMADA', 'CORREO', 'NOTA', 'ACTUALIZACION_IA');

-- CreateEnum
CREATE TYPE "CobranzaImportEstado" AS ENUM ('BORRADOR', 'EN_REVISION', 'APLICADO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "CobranzaImportFilaEstado" AS ENUM ('VALIDA', 'REVISAR', 'APLICADA', 'OMITIDA');

-- CreateEnum
CREATE TYPE "CobranzaCategoriaCosto" AS ENUM ('SALARIO', 'HERRAMIENTA', 'FIJO_OPERACION');

-- CreateEnum
CREATE TYPE "CobranzaFrecuenciaCosto" AS ENUM ('MENSUAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "CostoMovimientoTipo" AS ENUM ('ALTA', 'BAJA', 'REACTIVACION', 'PAUSA', 'CAMBIO_MONTO', 'ELIMINACION');

-- CreateEnum
CREATE TYPE "RoleDocType" AS ENUM ('PERFIL', 'PROPUESTA');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "industry" TEXT,
    "notes" TEXT,
    "hubspotCompanyId" TEXT,
    "emailDomains" TEXT[],
    "logoUrl" TEXT,
    "logoDarkUrl" TEXT,
    "logoScale" INTEGER,
    "kind" "ClientKind" NOT NULL DEFAULT 'CLIENTE',
    "isProspect" BOOLEAN NOT NULL DEFAULT false,
    "tamUsd" DECIMAL(12,2),
    "source" TEXT,
    "sourceExternalId" TEXT,
    "ignoredHubspotServiceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "canvas" JSONB,
    "canvasConfidence" JSONB,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'system',
    "smarteamLogoUrl" TEXT,
    "hubspotLogoUrl" TEXT,
    "insiderLogoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "projectType" "ProjectType" NOT NULL DEFAULT 'USE_CASE',
    "implementationType" "ImplementationType",
    "serviceType" TEXT,
    "hubspotDealId" TEXT,
    "hubspotServiceId" TEXT,
    "currentStage" INTEGER NOT NULL DEFAULT 1,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "canvas" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shareToken" TEXT,
    "nextSessionDate" TIMESTAMP(3),
    "nextSessionNote" TEXT,
    "lastSessionSummary" TEXT,
    "pendingItems" JSONB,
    "salesNextSessionDate" TIMESTAMP(3),
    "salesNextSessionNote" TEXT,
    "csNextSessionDate" TIMESTAMP(3),
    "csNextSessionNote" TEXT,
    "handoffGeneratedAt" TIMESTAMP(3),
    "kickoffPublishedAt" TIMESTAMP(3),
    "timelinePublishedAt" TIMESTAMP(3),
    "desarrolloPublishedAt" TIMESTAMP(3),
    "hiddenKickoffKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "procesosHiddenFromKickoff" BOOLEAN NOT NULL DEFAULT false,
    "kickoffHorarioAssignments" JSONB,
    "hubspotOwnerId" TEXT,
    "hubspotOwnerName" TEXT,
    "hubspotOwnerEmail" TEXT,
    "hubspotCreatedAt" TIMESTAMP(3),
    "hubspotPipelineName" TEXT,
    "hubspotPipelineId" TEXT,
    "proyectoInterno" BOOLEAN NOT NULL DEFAULT false,
    "hubspotRelatedProjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hermanoCsProjectId" TEXT,
    "altaEstado" TEXT,
    "altaPipelineElegido" TEXT,
    "altaInternoDeclarado" BOOLEAN,
    "altaHermanoHsId" TEXT,
    "altaSinTratoMotivo" TEXT,
    "altaError" TEXT,
    "altaIntentos" INTEGER NOT NULL DEFAULT 0,
    "altaUltimoIntentoAt" TIMESTAMP(3),
    "altaIniciadaAt" TIMESTAMP(3),
    "altaActorEmail" TEXT,
    "altaReclasificadoAt" TIMESTAMP(3),
    "hubspotPipelineStageLabel" TEXT,
    "hubspotPipelineStageId" TEXT,
    "hubspotStageSyncedAt" TIMESTAMP(3),
    "hubspotPriority" TEXT,
    "hubspotStatus" TEXT,
    "hubspotBlockReason" TEXT,
    "hubspotBlockDetail" TEXT,
    "hubspotAdoptionState" TEXT,
    "healthStatusOverride" "ProjectHealth",
    "healthStatusOverrideReason" TEXT,
    "healthStatusOverrideAt" TIMESTAMP(3),
    "healthStatusOverrideBy" TEXT,
    "lifecycleStageOverride" "ProjectLifecycleStage",
    "lifecycleStageOverrideReason" TEXT,
    "lifecycleStageOverrideAt" TIMESTAMP(3),
    "lifecycleStageOverrideBy" TEXT,
    "lifecycleCycle" TEXT,
    "adoptionMode" TEXT,
    "adoptionModeConfirmedAt" TIMESTAMP(3),
    "adoptionModeConfirmedBy" TEXT,
    "isSuccessCase" BOOLEAN NOT NULL DEFAULT false,
    "healthProposed" "ProjectHealth",
    "healthProposedReason" TEXT,
    "healthProposedAt" TIMESTAMP(3),
    "healthProposedByRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevEstimate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "hours" INTEGER,
    "estimatedDate" TIMESTAMP(3),
    "note" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStageGate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gate" "ProjectStageGateKey" NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "markedBy" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cse',
    "note" TEXT,
    "evidence" JSONB,

    CONSTRAINT "ProjectStageGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handoff" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "hubspotDealId" TEXT,
    "hubspotProjectId" TEXT,
    "hubspotSyncStatus" TEXT NOT NULL DEFAULT 'pending',
    "hubspotSyncError" TEXT,
    "hubspotOwnerIdOnCreate" TEXT,
    "generatedByAgentRunId" TEXT,
    "contextExclusions" TEXT,
    "excludedEngagementIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Handoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HandoffSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTimeline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "anchorStartDate" TIMESTAMP(3),
    "lastEditedByHuman" TIMESTAMP(3),
    "publishedSnapshot" JSONB,
    "generatedByAgentRunId" TEXT,
    "detailConfirmedAt" TIMESTAMP(3),
    "detailGeneratedByAgentRunId" TEXT,
    "pendingProposal" JSONB,
    "pendingProposalRunId" TEXT,
    "pendingProgress" JSONB,
    "pendingProgressRunId" TEXT,
    "pendingParticularidades" JSONB,
    "pendingParticularidadesRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelinePhase" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "durationWeeks" INTEGER NOT NULL DEFAULT 1,
    "startWeek" INTEGER,
    "sessionCount" INTEGER,
    "notes" TEXT,
    "activityType" "TimelineActivityType",
    "source" "TimelinePhaseSource" NOT NULL DEFAULT 'AGENT',
    "needsValidation" BOOLEAN NOT NULL DEFAULT false,
    "status" "TimelineTaskStatus" NOT NULL DEFAULT 'PENDING',
    "statusSource" "TimelineStatusSource" NOT NULL DEFAULT 'HUMAN',
    "statusChangedByEmail" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelinePhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineTask" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "TimelineTaskStatus" NOT NULL DEFAULT 'PENDING',
    "statusSource" "TimelineStatusSource" NOT NULL DEFAULT 'HUMAN',
    "statusChangedByEmail" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "startDateOverride" TIMESTAMP(3),
    "dueDateOverride" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "notes" TEXT,
    "needsValidation" BOOLEAN NOT NULL DEFAULT false,
    "party" "TaskParty",
    "type" "TimelineTaskType",
    "source" "TimelinePhaseSource" NOT NULL DEFAULT 'AGENT',
    "committedDueDate" TIMESTAMP(3),
    "originFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Particularidad" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "phaseId" TEXT,
    "kind" "ParticularidadKind" NOT NULL,
    "party" "TaskParty" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "sourceQuote" TEXT,
    "weeksImpact" INTEGER,
    "visibleExternal" BOOLEAN NOT NULL DEFAULT false,
    "source" "ParticularidadSource" NOT NULL DEFAULT 'HUMAN',
    "needsValidation" BOOLEAN NOT NULL DEFAULT false,
    "createdByEmail" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedTaskId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Particularidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineChange" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "kind" "TimelineChangeKind" NOT NULL DEFAULT 'MANUAL',
    "instruction" TEXT,
    "changedByEmail" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineBaseline" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "anchorStartDate" TIMESTAMP(3),
    "snapshot" JSONB NOT NULL,
    "firmness" JSONB NOT NULL,
    "publishedByEmail" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectExternalAccess" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "accessPassword" TEXT,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectExternalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCanvas" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "businessCaseId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "disabledAt" TIMESTAMP(3),
    "disabledBy" TEXT,
    "disabledReason" TEXT,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedSnapshot" JSONB,
    "publishedSnapshotAt" TIMESTAMP(3),
    "contentUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectCanvas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasSection" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "titleOverride" TEXT,
    "eyebrowOverride" TEXT,
    "previousTitleOverride" TEXT,
    "previousEyebrowOverride" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "layout" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasBlock" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "blockType" "BlockType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "data" JSONB,
    "previousContent" TEXT,
    "previousData" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "colSpan" INTEGER NOT NULL DEFAULT 4,
    "colStart" INTEGER,
    "rowSpan" INTEGER NOT NULL DEFAULT 4,
    "source" "BlockSource" NOT NULL DEFAULT 'AGENT',
    "status" "BlockStatus" NOT NULL DEFAULT 'DRAFT',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageNote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "stage" INTEGER NOT NULL,
    "step" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDocument" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "stage" INTEGER,
    "step" INTEGER,
    "title" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "content" TEXT,
    "url" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContextCard" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "agentRunId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "source" "CardSource" NOT NULL DEFAULT 'HUMAN',
    "cardType" "CardType" NOT NULL DEFAULT 'TEXT',
    "canvasId" TEXT,
    "canvasSection" TEXT,
    "canvasOrder" INTEGER,
    "canvasStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "parentCardId" TEXT,
    "diagramData" JSONB,
    "chartConfig" JSONB,
    "publishedToClient" BOOLEAN NOT NULL DEFAULT false,
    "publishedContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContextCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubspotAccount" (
    "id" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "hubspotPortalId" TEXT NOT NULL,
    "hubName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "portalSnapshot" JSONB,
    "portalSnapshotAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubspotAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Knowledge" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Implementation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "status" "ImplementationStatus" NOT NULL DEFAULT 'PLANNING',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "plan" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Implementation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "implementationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "additionalInstructions" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "associatedStages" INTEGER[],
    "associatedStep" INTEGER,
    "sectionLabel" TEXT,
    "outputType" "AgentOutputType" NOT NULL DEFAULT 'CARDS',
    "scope" "AgentScope" NOT NULL DEFAULT 'CLIENT',
    "agentType" "AgentType" NOT NULL DEFAULT 'SECTION',
    "defaultCanvasSection" TEXT,
    "agentGroup" TEXT,
    "groupOrder" INTEGER NOT NULL DEFAULT 0,
    "pinnedKnowledgeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "clientId" TEXT,
    "projectId" TEXT,
    "businessCaseId" TEXT,
    "stage" INTEGER,
    "step" INTEGER,
    "stepLabel" TEXT,
    "sectionLabel" TEXT,
    "serviceType" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "currentPhase" TEXT,
    "output" TEXT,
    "triggeredByEmail" TEXT,
    "sourceSessionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filters" JSONB,
    "agentSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCase" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "hubspotCompanyId" TEXT,
    "hubspotDealId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "BusinessCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "language" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "implementationType" "ImplementationType",
    "caseType" TEXT,
    "caseSubtype" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedSnapshot" JSONB,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UseCase" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" TEXT,
    "appliesTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UseCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCaseUseCase" (
    "id" TEXT NOT NULL,
    "businessCaseId" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "priceOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCaseUseCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCaseSession" (
    "id" TEXT NOT NULL,
    "businessCaseId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCaseSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCaseBlock" (
    "id" TEXT NOT NULL,
    "businessCaseId" TEXT NOT NULL,
    "blockType" "BusinessCaseBlockType" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL,
    "previousContent" JSONB,
    "status" "BlockStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "BlockSource" NOT NULL DEFAULT 'AGENT',
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "needsValidation" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByEmail" TEXT,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCaseBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCaseTranscript" (
    "id" TEXT NOT NULL,
    "businessCaseId" TEXT NOT NULL,
    "source" "BusinessCaseTranscriptSource" NOT NULL,
    "rawText" TEXT NOT NULL,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCaseTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCaseExternalAccess" (
    "id" TEXT NOT NULL,
    "businessCaseId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "accessPassword" TEXT,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCaseExternalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalVerifyAttempt" (
    "token" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalVerifyAttempt_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "PrintJobToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "docType" TEXT,
    "docId" TEXT,
    "businessCaseId" TEXT,
    "canvasId" TEXT,
    "createdByEmail" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintJobToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "area" TEXT,
    "roleEnum" "TeamRole" NOT NULL DEFAULT 'CSE',
    "photoUrl" TEXT,
    "canViewAllClients" BOOLEAN NOT NULL DEFAULT false,
    "canViewAllExpiresAt" TIMESTAMP(3),
    "permissionOverrides" JSONB,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role" "TeamRole" NOT NULL,
    "permissions" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByEmail" TEXT,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT,
    "email" TEXT NOT NULL,
    "kind" "AppUserKind" NOT NULL,
    "teamMemberId" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAssignment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "teamMemberId" TEXT,
    "targetRole" "TeamRole",
    "kind" "AssignmentKind" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionLog" (
    "id" TEXT NOT NULL,
    "implementationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "type" "KnowledgeType" NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByEmail" TEXT,
    "updatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeTag" (
    "id" TEXT NOT NULL,
    "category" "TagCategory" NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "KnowledgeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEmbedding" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "chunkText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirefliesSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "participants" TEXT[],
    "summary" JSONB,
    "transcript" TEXT,
    "enrichedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'google_meet',
    "googleDocId" TEXT,
    "googleEventId" TEXT,
    "organizerEmail" TEXT,
    "manualClientId" TEXT,
    "resolvedClientId" TEXT,
    "detectedTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "FirefliesSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionMinute" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "agreements" JSONB,
    "decisions" JSONB,
    "risks" JSONB,
    "topics" JSONB,
    "status" "MinuteStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedByAgentRunId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionMinute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "sessionId" TEXT,
    "ownerEmail" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "generatedByAgentRunId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionProject" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "confidence" DOUBLE PRECISION,
    "rationale" TEXT,
    "handoffOverride" BOOLEAN,
    "generatedByAgentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "SessionProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectParticipantSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    "sessionsAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "generatedByAgentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectParticipantSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasSuggestion" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "section" TEXT NOT NULL,
    "field" TEXT,
    "current" JSONB,
    "suggested" JSONB NOT NULL,
    "suggestedValue" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "sourceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domains" TEXT[],
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSettings" (
    "id" TEXT NOT NULL DEFAULT 'marketing',
    "brandVoice" TEXT NOT NULL,
    "genEmpresaTarget" INTEGER NOT NULL DEFAULT 9,
    "genPersonaTarget" INTEGER NOT NULL DEFAULT 6,
    "lastCronRunAt" TIMESTAMP(3),
    "lastCronDateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcpItem" (
    "id" TEXT NOT NULL,
    "section" "IcpSection" NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcpItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerPersona" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "description" TEXT NOT NULL,
    "pains" TEXT,
    "goals" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPillar" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "origin" "PillarOrigin" NOT NULL DEFAULT 'HUMAN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isCampaign" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspirationSource" (
    "id" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "lastFetchError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspirationSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspirationPost" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "authorName" TEXT,
    "text" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "repostCount" INTEGER NOT NULL DEFAULT 0,
    "hasImage" BOOLEAN NOT NULL DEFAULT false,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspirationPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingRun" (
    "id" TEXT NOT NULL,
    "kind" "MarketingRunKind" NOT NULL,
    "trigger" "MarketingRunTrigger" NOT NULL DEFAULT 'MANUAL',
    "status" "MarketingRunStatus" NOT NULL DEFAULT 'RUNNING',
    "phase" TEXT,
    "newPostsCount" INTEGER,
    "fetchedPostsCount" INTEGER,
    "sourcesOkCount" INTEGER,
    "sourcesErrorCount" INTEGER,
    "contentIdeasCount" INTEGER,
    "campaignIdeasCount" INTEGER,
    "pillarSuggestionsCount" INTEGER,
    "error" TEXT,
    "rawOutput" TEXT,
    "startedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MarketingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentIdea" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "pillarId" TEXT,
    "suggestedPillarName" TEXT,
    "title" TEXT NOT NULL,
    "copy" TEXT NOT NULL,
    "imageConcept" TEXT NOT NULL,
    "postType" "MarketingPostType" NOT NULL DEFAULT 'EMPRESA',
    "journeyStage" "MarketingJourneyStage",
    "acceptedByEmail" TEXT,
    "acceptedFor" "MarketingUsageTarget",
    "selectedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),
    "hubspotDraftAt" TIMESTAMP(3),
    "hubspotDraftGuids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentIdeaSource" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,

    CONSTRAINT "ContentIdeaSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignIdea" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "title" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "MarketingApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PillarSuggestion" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rationale" TEXT,
    "status" "MarketingApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedPillarId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PillarSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "timelineId" TEXT,
    "entityType" "CsEventEntity" NOT NULL,
    "entityId" TEXT,
    "label" TEXT NOT NULL,
    "action" "CsEventAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actorEmail" TEXT,
    "source" "CsEventSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedByRunId" TEXT,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsAlert" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "severity" "CsAlertSeverity" NOT NULL,
    "category" "CsAlertCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suggestedAction" TEXT,
    "evidence" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CsAlertStatus" NOT NULL DEFAULT 'OPEN',
    "seenAt" TIMESTAMP(3),
    "seenByEmail" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByEmail" TEXT,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCsSignals" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchStatus" TEXT NOT NULL DEFAULT 'ok',
    "errors" JSONB,
    "deals" JSONB,
    "engagement" JSONB,
    "tickets" JSONB,
    "lastEngagementAt" TIMESTAMP(3),
    "engagements90d" INTEGER,
    "openTicketCount" INTEGER,
    "ticketsSupported" BOOLEAN NOT NULL DEFAULT false,
    "nextRenewalCloseAt" TIMESTAMP(3),
    "openExpansionAmount" DOUBLE PRECISION,
    "openDealCount" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCsSignals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPartnerSnapshot" (
    "id" TEXT NOT NULL,
    "hubspotPartnerClientId" TEXT NOT NULL,
    "clientId" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchStatus" TEXT NOT NULL DEFAULT 'ok',
    "properties" JSONB NOT NULL,
    "domain" TEXT,
    "associatedCompanyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uusScore" DOUBLE PRECISION,
    "uusTrend" DOUBLE PRECISION,
    "activationScore" DOUBLE PRECISION,
    "toolUsageScore" DOUBLE PRECISION,
    "valueMetricsScore" DOUBLE PRECISION,
    "consumptionScore" DOUBLE PRECISION,
    "marketingScore" DOUBLE PRECISION,
    "salesScore" DOUBLE PRECISION,
    "serviceScore" DOUBLE PRECISION,
    "commerceScore" DOUBLE PRECISION,
    "seats" JSONB,
    "marketingContactsLimit" INTEGER,
    "marketingContactsUsed" INTEGER,
    "mrrTotal" DOUBLE PRECISION,
    "mrrManaged" DOUBLE PRECISION,
    "mrrUpForRenewal" DOUBLE PRECISION,
    "nextRenewalAt" TIMESTAMP(3),
    "renewalsByHub" JSONB,
    "managedExpiryAt" TIMESTAMP(3),
    "cancellationHubs" TEXT,
    "revenueSignal" TEXT,
    "revenueSignalDetail" TEXT,
    "hubEditions" JSONB,
    "activeProducts" TEXT,
    "hsCsmName" TEXT,
    "hsCsmEmail" TEXT,
    "hsGrowthName" TEXT,
    "hsGrowthEmail" TEXT,
    "cslImplementaciones" TEXT,
    "country" TEXT,
    "portalLink" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPartnerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerUsageSnapshot" (
    "id" TEXT NOT NULL,
    "hubspotPartnerClientId" TEXT NOT NULL,
    "clientId" TEXT,
    "weekKey" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uusScore" DOUBLE PRECISION,
    "activationScore" DOUBLE PRECISION,
    "toolUsageScore" DOUBLE PRECISION,
    "valueMetricsScore" DOUBLE PRECISION,
    "consumptionScore" DOUBLE PRECISION,
    "marketingScore" DOUBLE PRECISION,
    "salesScore" DOUBLE PRECISION,
    "serviceScore" DOUBLE PRECISION,
    "marketingContactsUsed" INTEGER,
    "marketingContactsLimit" INTEGER,
    "seats" JSONB,
    "mrrTotal" DOUBLE PRECISION,
    "nextRenewalAt" TIMESTAMP(3),

    CONSTRAINT "PartnerUsageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsAccountBrief" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "headline" TEXT,
    "statements" JSONB NOT NULL,
    "agentRunId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staleAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsAccountBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsSettings" (
    "id" TEXT NOT NULL DEFAULT 'cs',
    "watchdogEnabled" BOOLEAN NOT NULL DEFAULT true,
    "uusValidationThreshold" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronJobState" (
    "id" TEXT NOT NULL,
    "lastRunDateKey" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronJobState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaFinanciera" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tipo" "CobranzaTipoCuenta" NOT NULL DEFAULT 'NACIONAL',
    "viaCobro" "CobranzaViaCobro" NOT NULL DEFAULT 'ODOO',
    "moneda" "CobranzaMoneda" NOT NULL DEFAULT 'CRC',
    "terminosPago" "CobranzaTerminosPago" NOT NULL DEFAULT 'ANTICIPADO',
    "diaCobroAncla" INTEGER,
    "creditoDias" INTEGER,
    "estadoCuenta" "CobranzaEstadoCuenta" NOT NULL DEFAULT 'PENDIENTE_DATOS',
    "excluidaOperacion" BOOLEAN NOT NULL DEFAULT false,
    "responsableCobroTerceros" TEXT,
    "notas" TEXT,
    "estadoActualizadoPor" TEXT,
    "estadoActualizadoEn" TIMESTAMP(3),
    "fuente" TEXT,
    "fuenteIdExterno" TEXT,
    "correoCobro" TEXT,
    "razonSocial" TEXT,
    "cedulaJuridica" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaFinanciera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicioContratado" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "tipoServicio" "CobranzaTipoServicio" NOT NULL,
    "modalidad" "CobranzaModalidad" NOT NULL,
    "montoTotal" DECIMAL(12,2) NOT NULL,
    "moneda" "CobranzaMoneda" NOT NULL,
    "fechaInicioFacturacion" TIMESTAMP(3),
    "duracionMeses" INTEGER,
    "projectId" TEXT,
    "estado" "CobranzaEstadoServicio" NOT NULL DEFAULT 'ACTIVO',
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicioContratado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanDePago" (
    "id" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "template" "CobranzaPlanTemplate" NOT NULL,
    "origen" "CobranzaPlanOrigen" NOT NULL DEFAULT 'MANUAL',
    "numCuotas" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanDePago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuotaPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "base" "CobranzaCuotaBase" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "offsetMeses" INTEGER NOT NULL DEFAULT 0,
    "descripcion" TEXT,

    CONSTRAINT "CuotaPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobro" (
    "id" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "planId" TEXT,
    "numCuota" INTEGER,
    "periodo" TEXT NOT NULL,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" "CobranzaMoneda" NOT NULL,
    "estado" "CobranzaEstadoCobro" NOT NULL DEFAULT 'PROGRAMADO',
    "origen" "CobranzaOrigenCobro" NOT NULL DEFAULT 'PLAN',
    "fechaEmision" TIMESTAMP(3),
    "facturadoPor" TEXT,
    "facturadoEn" TIMESTAMP(3),
    "fechaCobro" TIMESTAMP(3),
    "confirmadoPor" TEXT,
    "confirmadoEn" TIMESTAMP(3),
    "referenciaExterna" TEXT,
    "promesaPago" TIMESTAMP(3),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaCobro" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "cobroId" TEXT,
    "tipo" "CobranzaTipoAlerta" NOT NULL,
    "urgencia" "CobranzaUrgencia" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "evidencia" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "CobranzaAlertaEstado" NOT NULL DEFAULT 'ABIERTA',
    "vistaEn" TIMESTAMP(3),
    "vistaPor" TEXT,
    "resueltaEn" TIMESTAMP(3),
    "resueltaPor" TEXT,
    "posponerHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertaCobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotCartera" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertSet" JSONB NOT NULL,
    "resumen" JSONB NOT NULL,
    "metricas" JSONB,
    "triggeredBy" TEXT,

    CONSTRAINT "SnapshotCartera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BitacoraCobro" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "cobroId" TEXT,
    "tipo" "BitacoraCobroTipo" NOT NULL,
    "contenido" TEXT NOT NULL,
    "usuarioEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BitacoraCobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacionCobranza" (
    "id" TEXT NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "fuente" TEXT NOT NULL DEFAULT 'sheet',
    "mapeo" JSONB NOT NULL,
    "columnas" JSONB NOT NULL,
    "estado" "CobranzaImportEstado" NOT NULL DEFAULT 'BORRADOR',
    "totalFilas" INTEGER NOT NULL DEFAULT 0,
    "creadoPor" TEXT NOT NULL,
    "aplicadoEn" TIMESTAMP(3),
    "aplicadoPor" TEXT,
    "resumen" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacionCobranza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacionFila" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "numFila" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "canonico" JSONB,
    "estado" "CobranzaImportFilaEstado" NOT NULL DEFAULT 'REVISAR',
    "errores" JSONB,
    "dedup" JSONB,
    "idExterno" TEXT,
    "aplicadoClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacionFila_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostoRecurrente" (
    "id" TEXT NOT NULL,
    "categoria" "CobranzaCategoriaCosto" NOT NULL,
    "nombre" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" "CobranzaMoneda" NOT NULL,
    "frecuencia" "CobranzaFrecuenciaCosto" NOT NULL DEFAULT 'MENSUAL',
    "teamMemberId" TEXT,
    "montoBase" DECIMAL(12,2),
    "factorCargas" DECIMAL(6,4),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "finalizadoEl" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostoRecurrente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostoMovimiento" (
    "id" TEXT NOT NULL,
    "costoId" TEXT,
    "tipo" "CostoMovimientoTipo" NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CobranzaCategoriaCosto" NOT NULL,
    "moneda" "CobranzaMoneda" NOT NULL,
    "frecuencia" "CobranzaFrecuenciaCosto" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "montoAnterior" DECIMAL(12,2),
    "fechaEfectiva" DATE NOT NULL,
    "usuarioEmail" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostoMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GastoPuntual" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" "CobranzaMoneda" NOT NULL,
    "fecha" DATE NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GastoPuntual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngresoVariable" (
    "id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" "CobranzaMoneda" NOT NULL,
    "fecha" DATE NOT NULL,
    "clientId" TEXT,
    "notas" TEXT,
    "registradoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngresoVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleProfile" (
    "id" TEXT NOT NULL,
    "docType" "RoleDocType" NOT NULL DEFAULT 'PERFIL',
    "title" TEXT NOT NULL,
    "area" TEXT,
    "summary" TEXT,
    "content" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdByEmail" TEXT,
    "publicToken" TEXT,
    "publicPublishedAt" TIMESTAMP(3),
    "publicPublishedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleProfileShare" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "grantedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleProfileShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_KnowledgeDocumentToKnowledgeTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_KnowledgeDocumentToKnowledgeTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_source_sourceExternalId_key" ON "Client"("source", "sourceExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_hubspotServiceId_key" ON "Project"("hubspotServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_shareToken_key" ON "Project"("shareToken");

-- CreateIndex
CREATE INDEX "DevEstimate_projectId_createdAt_idx" ON "DevEstimate"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectStageGate_projectId_idx" ON "ProjectStageGate"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStageGate_projectId_gate_key" ON "ProjectStageGate"("projectId", "gate");

-- CreateIndex
CREATE UNIQUE INDEX "Handoff_projectId_key" ON "Handoff"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Handoff_hubspotDealId_key" ON "Handoff"("hubspotDealId");

-- CreateIndex
CREATE INDEX "Handoff_clientId_idx" ON "Handoff"("clientId");

-- CreateIndex
CREATE INDEX "HandoffSource_projectId_createdAt_idx" ON "HandoffSource"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTimeline_projectId_key" ON "ProjectTimeline"("projectId");

-- CreateIndex
CREATE INDEX "ProjectTimeline_projectId_idx" ON "ProjectTimeline"("projectId");

-- CreateIndex
CREATE INDEX "TimelinePhase_timelineId_order_idx" ON "TimelinePhase"("timelineId", "order");

-- CreateIndex
CREATE INDEX "TimelineTask_phaseId_weekIndex_order_idx" ON "TimelineTask"("phaseId", "weekIndex", "order");

-- CreateIndex
CREATE INDEX "TimelineTask_originFingerprint_idx" ON "TimelineTask"("originFingerprint");

-- CreateIndex
CREATE INDEX "Particularidad_timelineId_occurredAt_idx" ON "Particularidad"("timelineId", "occurredAt");

-- CreateIndex
CREATE INDEX "Particularidad_timelineId_visibleExternal_idx" ON "Particularidad"("timelineId", "visibleExternal");

-- CreateIndex
CREATE INDEX "Particularidad_dedupeKey_idx" ON "Particularidad"("dedupeKey");

-- CreateIndex
CREATE INDEX "TimelineChange_timelineId_createdAt_idx" ON "TimelineChange"("timelineId", "createdAt");

-- CreateIndex
CREATE INDEX "TimelineBaseline_timelineId_isActive_idx" ON "TimelineBaseline"("timelineId", "isActive");

-- CreateIndex
CREATE INDEX "TimelineBaseline_timelineId_version_idx" ON "TimelineBaseline"("timelineId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectExternalAccess_projectId_key" ON "ProjectExternalAccess"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectExternalAccess_accessToken_key" ON "ProjectExternalAccess"("accessToken");

-- CreateIndex
CREATE INDEX "ProjectExternalAccess_accessToken_idx" ON "ProjectExternalAccess"("accessToken");

-- CreateIndex
CREATE INDEX "ProjectExternalAccess_projectId_idx" ON "ProjectExternalAccess"("projectId");

-- CreateIndex
CREATE INDEX "ProjectCanvas_projectId_idx" ON "ProjectCanvas"("projectId");

-- CreateIndex
CREATE INDEX "ProjectCanvas_businessCaseId_idx" ON "ProjectCanvas"("businessCaseId");

-- CreateIndex
CREATE INDEX "CanvasSection_canvasId_idx" ON "CanvasSection"("canvasId");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasSection_canvasId_key_key" ON "CanvasSection"("canvasId", "key");

-- CreateIndex
CREATE INDEX "CanvasBlock_sectionId_idx" ON "CanvasBlock"("sectionId");

-- CreateIndex
CREATE INDEX "CanvasBlock_agentRunId_idx" ON "CanvasBlock"("agentRunId");

-- CreateIndex
CREATE UNIQUE INDEX "StageNote_clientId_stage_step_key" ON "StageNote"("clientId", "stage", "step");

-- CreateIndex
CREATE INDEX "ClientContextCard_clientId_agentRunId_idx" ON "ClientContextCard"("clientId", "agentRunId");

-- CreateIndex
CREATE INDEX "ClientContextCard_agentRunId_idx" ON "ClientContextCard"("agentRunId");

-- CreateIndex
CREATE INDEX "ClientContextCard_canvasId_idx" ON "ClientContextCard"("canvasId");

-- CreateIndex
CREATE INDEX "ClientContextCard_canvasSection_idx" ON "ClientContextCard"("canvasSection");

-- CreateIndex
CREATE INDEX "ClientContextCard_parentCardId_idx" ON "ClientContextCard"("parentCardId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientContextCard_agentRunId_title_key" ON "ClientContextCard"("agentRunId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "HubspotAccount_clientId_key" ON "HubspotAccount"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "HubspotAccount_hubspotPortalId_key" ON "HubspotAccount"("hubspotPortalId");

-- CreateIndex
CREATE INDEX "Agent_associatedStep_idx" ON "Agent"("associatedStep");

-- CreateIndex
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- CreateIndex
CREATE INDEX "AgentRun_clientId_agentSlug_createdAt_idx" ON "AgentRun"("clientId", "agentSlug", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCase_slug_key" ON "BusinessCase"("slug");

-- CreateIndex
CREATE INDEX "BusinessCase_clientId_idx" ON "BusinessCase"("clientId");

-- CreateIndex
CREATE INDEX "UseCase_active_idx" ON "UseCase"("active");

-- CreateIndex
CREATE INDEX "BusinessCaseUseCase_businessCaseId_idx" ON "BusinessCaseUseCase"("businessCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCaseUseCase_businessCaseId_useCaseId_key" ON "BusinessCaseUseCase"("businessCaseId", "useCaseId");

-- CreateIndex
CREATE INDEX "BusinessCaseSession_businessCaseId_idx" ON "BusinessCaseSession"("businessCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCaseSession_businessCaseId_sessionId_key" ON "BusinessCaseSession"("businessCaseId", "sessionId");

-- CreateIndex
CREATE INDEX "BusinessCaseBlock_businessCaseId_idx" ON "BusinessCaseBlock"("businessCaseId");

-- CreateIndex
CREATE INDEX "BusinessCaseTranscript_businessCaseId_idx" ON "BusinessCaseTranscript"("businessCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCaseExternalAccess_businessCaseId_key" ON "BusinessCaseExternalAccess"("businessCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCaseExternalAccess_accessToken_key" ON "BusinessCaseExternalAccess"("accessToken");

-- CreateIndex
CREATE INDEX "BusinessCaseExternalAccess_accessToken_idx" ON "BusinessCaseExternalAccess"("accessToken");

-- CreateIndex
CREATE INDEX "BusinessCaseExternalAccess_businessCaseId_idx" ON "BusinessCaseExternalAccess"("businessCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintJobToken_token_key" ON "PrintJobToken"("token");

-- CreateIndex
CREATE INDEX "PrintJobToken_token_idx" ON "PrintJobToken"("token");

-- CreateIndex
CREATE INDEX "PrintJobToken_expiresAt_idx" ON "PrintJobToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_email_key" ON "TeamMember"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_authUserId_key" ON "AppUser"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_teamMemberId_key" ON "AppUser"("teamMemberId");

-- CreateIndex
CREATE INDEX "AppUser_email_idx" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "AppUser_authUserId_idx" ON "AppUser"("authUserId");

-- CreateIndex
CREATE INDEX "ClientAssignment_teamMemberId_idx" ON "ClientAssignment"("teamMemberId");

-- CreateIndex
CREATE INDEX "ClientAssignment_clientId_idx" ON "ClientAssignment"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAssignment_clientId_teamMemberId_targetRole_key" ON "ClientAssignment"("clientId", "teamMemberId", "targetRole");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_type_status_idx" ON "KnowledgeDocument"("type", "status");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_createdAt_idx" ON "KnowledgeDocument"("createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeTag_category_idx" ON "KnowledgeTag"("category");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeTag_category_value_key" ON "KnowledgeTag"("category", "value");

-- CreateIndex
CREATE INDEX "KnowledgeEmbedding_documentId_idx" ON "KnowledgeEmbedding"("documentId");

-- CreateIndex
CREATE INDEX "FirefliesSession_date_idx" ON "FirefliesSession"("date" DESC);

-- CreateIndex
CREATE INDEX "FirefliesSession_manualClientId_idx" ON "FirefliesSession"("manualClientId");

-- CreateIndex
CREATE INDEX "FirefliesSession_resolvedClientId_date_idx" ON "FirefliesSession"("resolvedClientId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SessionMinute_sessionId_key" ON "SessionMinute"("sessionId");

-- CreateIndex
CREATE INDEX "SessionMinute_status_idx" ON "SessionMinute"("status");

-- CreateIndex
CREATE INDEX "ActionItem_clientId_done_idx" ON "ActionItem"("clientId", "done");

-- CreateIndex
CREATE INDEX "ActionItem_projectId_done_idx" ON "ActionItem"("projectId", "done");

-- CreateIndex
CREATE INDEX "ActionItem_projectId_deletedAt_idx" ON "ActionItem"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "ActionItem_sessionId_idx" ON "ActionItem"("sessionId");

-- CreateIndex
CREATE INDEX "ActionItem_ownerEmail_done_idx" ON "ActionItem"("ownerEmail", "done");

-- CreateIndex
CREATE INDEX "ActionItem_dueDate_idx" ON "ActionItem"("dueDate");

-- CreateIndex
CREATE INDEX "SessionProject_projectId_isPrimary_idx" ON "SessionProject"("projectId", "isPrimary");

-- CreateIndex
CREATE INDEX "SessionProject_sessionId_idx" ON "SessionProject"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionProject_sessionId_projectId_key" ON "SessionProject"("sessionId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectParticipantSnapshot_projectId_key" ON "ProjectParticipantSnapshot"("projectId");

-- CreateIndex
CREATE INDEX "CanvasSuggestion_clientId_status_idx" ON "CanvasSuggestion"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SessionCategory_name_key" ON "SessionCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SessionCategory_slug_key" ON "SessionCategory"("slug");

-- CreateIndex
CREATE INDEX "IcpItem_section_order_idx" ON "IcpItem"("section", "order");

-- CreateIndex
CREATE INDEX "BuyerPersona_active_idx" ON "BuyerPersona"("active");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPillar_name_key" ON "ContentPillar"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InspirationSource_profileUrl_key" ON "InspirationSource"("profileUrl");

-- CreateIndex
CREATE INDEX "InspirationSource_active_idx" ON "InspirationSource"("active");

-- CreateIndex
CREATE UNIQUE INDEX "InspirationPost_externalId_key" ON "InspirationPost"("externalId");

-- CreateIndex
CREATE INDEX "InspirationPost_postedAt_idx" ON "InspirationPost"("postedAt");

-- CreateIndex
CREATE INDEX "InspirationPost_sourceId_postedAt_idx" ON "InspirationPost"("sourceId", "postedAt");

-- CreateIndex
CREATE INDEX "MarketingRun_status_createdAt_idx" ON "MarketingRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingRun_kind_createdAt_idx" ON "MarketingRun"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "ContentIdea_pillarId_idx" ON "ContentIdea"("pillarId");

-- CreateIndex
CREATE INDEX "ContentIdea_createdAt_idx" ON "ContentIdea"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentIdeaSource_ideaId_postId_key" ON "ContentIdeaSource"("ideaId", "postId");

-- CreateIndex
CREATE INDEX "CampaignIdea_status_createdAt_idx" ON "CampaignIdea"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PillarSuggestion_approvedPillarId_key" ON "PillarSuggestion"("approvedPillarId");

-- CreateIndex
CREATE INDEX "PillarSuggestion_status_idx" ON "PillarSuggestion"("status");

-- CreateIndex
CREATE INDEX "TimelineEvent_projectId_processedAt_idx" ON "TimelineEvent"("projectId", "processedAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_createdAt_idx" ON "TimelineEvent"("createdAt");

-- CreateIndex
CREATE INDEX "CsAlert_status_severity_lastDetectedAt_idx" ON "CsAlert"("status", "severity", "lastDetectedAt");

-- CreateIndex
CREATE INDEX "CsAlert_clientId_status_idx" ON "CsAlert"("clientId", "status");

-- CreateIndex
CREATE INDEX "CsAlert_dedupeKey_status_idx" ON "CsAlert"("dedupeKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCsSignals_clientId_key" ON "ClientCsSignals"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPartnerSnapshot_hubspotPartnerClientId_key" ON "ClientPartnerSnapshot"("hubspotPartnerClientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPartnerSnapshot_clientId_key" ON "ClientPartnerSnapshot"("clientId");

-- CreateIndex
CREATE INDEX "PartnerUsageSnapshot_clientId_weekKey_idx" ON "PartnerUsageSnapshot"("clientId", "weekKey");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerUsageSnapshot_hubspotPartnerClientId_weekKey_key" ON "PartnerUsageSnapshot"("hubspotPartnerClientId", "weekKey");

-- CreateIndex
CREATE UNIQUE INDEX "CsAccountBrief_clientId_key" ON "CsAccountBrief"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaFinanciera_clientId_key" ON "CuentaFinanciera"("clientId");

-- CreateIndex
CREATE INDEX "CuentaFinanciera_estadoCuenta_idx" ON "CuentaFinanciera"("estadoCuenta");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaFinanciera_fuente_fuenteIdExterno_key" ON "CuentaFinanciera"("fuente", "fuenteIdExterno");

-- CreateIndex
CREATE INDEX "ServicioContratado_cuentaId_estado_idx" ON "ServicioContratado"("cuentaId", "estado");

-- CreateIndex
CREATE INDEX "ServicioContratado_projectId_idx" ON "ServicioContratado"("projectId");

-- CreateIndex
CREATE INDEX "PlanDePago_servicioId_activo_idx" ON "PlanDePago"("servicioId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "CuotaPlan_planId_orden_key" ON "CuotaPlan"("planId", "orden");

-- CreateIndex
CREATE INDEX "Cobro_cuentaId_fechaProgramada_idx" ON "Cobro"("cuentaId", "fechaProgramada");

-- CreateIndex
CREATE INDEX "Cobro_estado_fechaProgramada_idx" ON "Cobro"("estado", "fechaProgramada");

-- CreateIndex
CREATE UNIQUE INDEX "Cobro_servicioId_numCuota_key" ON "Cobro"("servicioId", "numCuota");

-- CreateIndex
CREATE INDEX "AlertaCobro_estado_urgencia_lastDetectedAt_idx" ON "AlertaCobro"("estado", "urgencia", "lastDetectedAt");

-- CreateIndex
CREATE INDEX "AlertaCobro_cuentaId_estado_idx" ON "AlertaCobro"("cuentaId", "estado");

-- CreateIndex
CREATE INDEX "AlertaCobro_dedupeKey_estado_idx" ON "AlertaCobro"("dedupeKey", "estado");

-- CreateIndex
CREATE INDEX "SnapshotCartera_capturedAt_idx" ON "SnapshotCartera"("capturedAt");

-- CreateIndex
CREATE INDEX "BitacoraCobro_cuentaId_createdAt_idx" ON "BitacoraCobro"("cuentaId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportacionFila_importId_estado_idx" ON "ImportacionFila"("importId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ImportacionFila_importId_numFila_key" ON "ImportacionFila"("importId", "numFila");

-- CreateIndex
CREATE INDEX "CostoRecurrente_activo_categoria_idx" ON "CostoRecurrente"("activo", "categoria");

-- CreateIndex
CREATE INDEX "CostoMovimiento_fechaEfectiva_idx" ON "CostoMovimiento"("fechaEfectiva");

-- CreateIndex
CREATE INDEX "CostoMovimiento_costoId_createdAt_idx" ON "CostoMovimiento"("costoId", "createdAt");

-- CreateIndex
CREATE INDEX "GastoPuntual_fecha_idx" ON "GastoPuntual"("fecha");

-- CreateIndex
CREATE INDEX "IngresoVariable_fecha_idx" ON "IngresoVariable"("fecha");

-- CreateIndex
CREATE INDEX "IngresoVariable_clientId_idx" ON "IngresoVariable"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleProfile_publicToken_key" ON "RoleProfile"("publicToken");

-- CreateIndex
CREATE INDEX "RoleProfile_active_order_idx" ON "RoleProfile"("active", "order");

-- CreateIndex
CREATE INDEX "RoleProfileShare_teamMemberId_idx" ON "RoleProfileShare"("teamMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleProfileShare_roleId_teamMemberId_key" ON "RoleProfileShare"("roleId", "teamMemberId");

-- CreateIndex
CREATE INDEX "_KnowledgeDocumentToKnowledgeTag_B_index" ON "_KnowledgeDocumentToKnowledgeTag"("B");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevEstimate" ADD CONSTRAINT "DevEstimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStageGate" ADD CONSTRAINT "ProjectStageGate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffSource" ADD CONSTRAINT "HandoffSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTimeline" ADD CONSTRAINT "ProjectTimeline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTimeline" ADD CONSTRAINT "ProjectTimeline_generatedByAgentRunId_fkey" FOREIGN KEY ("generatedByAgentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTimeline" ADD CONSTRAINT "ProjectTimeline_detailGeneratedByAgentRunId_fkey" FOREIGN KEY ("detailGeneratedByAgentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelinePhase" ADD CONSTRAINT "TimelinePhase_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "ProjectTimeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineTask" ADD CONSTRAINT "TimelineTask_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "TimelinePhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Particularidad" ADD CONSTRAINT "Particularidad_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "ProjectTimeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Particularidad" ADD CONSTRAINT "Particularidad_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "TimelinePhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineChange" ADD CONSTRAINT "TimelineChange_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "ProjectTimeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineBaseline" ADD CONSTRAINT "TimelineBaseline_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "ProjectTimeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExternalAccess" ADD CONSTRAINT "ProjectExternalAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExternalAccess" ADD CONSTRAINT "ProjectExternalAccess_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCanvas" ADD CONSTRAINT "ProjectCanvas_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCanvas" ADD CONSTRAINT "ProjectCanvas_businessCaseId_fkey" FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasSection" ADD CONSTRAINT "CanvasSection_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "ProjectCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasBlock" ADD CONSTRAINT "CanvasBlock_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CanvasSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasBlock" ADD CONSTRAINT "CanvasBlock_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageNote" ADD CONSTRAINT "StageNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageNote" ADD CONSTRAINT "StageNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContextCard" ADD CONSTRAINT "ClientContextCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContextCard" ADD CONSTRAINT "ClientContextCard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContextCard" ADD CONSTRAINT "ClientContextCard_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContextCard" ADD CONSTRAINT "ClientContextCard_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "ProjectCanvas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContextCard" ADD CONSTRAINT "ClientContextCard_parentCardId_fkey" FOREIGN KEY ("parentCardId") REFERENCES "ClientContextCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubspotAccount" ADD CONSTRAINT "HubspotAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Knowledge" ADD CONSTRAINT "Knowledge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HubspotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Knowledge" ADD CONSTRAINT "Knowledge_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HubspotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Implementation" ADD CONSTRAINT "Implementation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HubspotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Implementation" ADD CONSTRAINT "Implementation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_implementationId_fkey" FOREIGN KEY ("implementationId") REFERENCES "Implementation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_businessCaseId_fkey" FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCase" ADD CONSTRAINT "BusinessCase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCaseUseCase" ADD CONSTRAINT "BusinessCaseUseCase_businessCaseId_fkey" FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCaseUseCase" ADD CONSTRAINT "BusinessCaseUseCase_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCaseSession" ADD CONSTRAINT "BusinessCaseSession_businessCaseId_fkey" FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCaseBlock" ADD CONSTRAINT "BusinessCaseBlock_businessCaseId_fkey" FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCaseTranscript" ADD CONSTRAINT "BusinessCaseTranscript_businessCaseId_fkey" FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCaseExternalAccess" ADD CONSTRAINT "BusinessCaseExternalAccess_businessCaseId_fkey" FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_implementationId_fkey" FOREIGN KEY ("implementationId") REFERENCES "Implementation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEmbedding" ADD CONSTRAINT "KnowledgeEmbedding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionMinute" ADD CONSTRAINT "SessionMinute_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionProject" ADD CONSTRAINT "SessionProject_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionProject" ADD CONSTRAINT "SessionProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectParticipantSnapshot" ADD CONSTRAINT "ProjectParticipantSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasSuggestion" ADD CONSTRAINT "CanvasSuggestion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspirationPost" ADD CONSTRAINT "InspirationPost_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "InspirationSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketingRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "ContentPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdeaSource" ADD CONSTRAINT "ContentIdeaSource_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ContentIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdeaSource" ADD CONSTRAINT "ContentIdeaSource_postId_fkey" FOREIGN KEY ("postId") REFERENCES "InspirationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignIdea" ADD CONSTRAINT "CampaignIdea_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketingRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PillarSuggestion" ADD CONSTRAINT "PillarSuggestion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketingRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PillarSuggestion" ADD CONSTRAINT "PillarSuggestion_approvedPillarId_fkey" FOREIGN KEY ("approvedPillarId") REFERENCES "ContentPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsAlert" ADD CONSTRAINT "CsAlert_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsAlert" ADD CONSTRAINT "CsAlert_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsAlert" ADD CONSTRAINT "CsAlert_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCsSignals" ADD CONSTRAINT "ClientCsSignals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPartnerSnapshot" ADD CONSTRAINT "ClientPartnerSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsAccountBrief" ADD CONSTRAINT "CsAccountBrief_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaFinanciera" ADD CONSTRAINT "CuentaFinanciera_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicioContratado" ADD CONSTRAINT "ServicioContratado_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicioContratado" ADD CONSTRAINT "ServicioContratado_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDePago" ADD CONSTRAINT "PlanDePago_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "ServicioContratado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuotaPlan" ADD CONSTRAINT "CuotaPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanDePago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "ServicioContratado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanDePago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaCobro" ADD CONSTRAINT "AlertaCobro_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BitacoraCobro" ADD CONSTRAINT "BitacoraCobro_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionFila" ADD CONSTRAINT "ImportacionFila_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportacionCobranza"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionFila" ADD CONSTRAINT "ImportacionFila_aplicadoClientId_fkey" FOREIGN KEY ("aplicadoClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostoRecurrente" ADD CONSTRAINT "CostoRecurrente_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostoMovimiento" ADD CONSTRAINT "CostoMovimiento_costoId_fkey" FOREIGN KEY ("costoId") REFERENCES "CostoRecurrente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngresoVariable" ADD CONSTRAINT "IngresoVariable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleProfileShare" ADD CONSTRAINT "RoleProfileShare_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "RoleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleProfileShare" ADD CONSTRAINT "RoleProfileShare_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KnowledgeDocumentToKnowledgeTag" ADD CONSTRAINT "_KnowledgeDocumentToKnowledgeTag_A_fkey" FOREIGN KEY ("A") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KnowledgeDocumentToKnowledgeTag" ADD CONSTRAINT "_KnowledgeDocumentToKnowledgeTag_B_fkey" FOREIGN KEY ("B") REFERENCES "KnowledgeTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

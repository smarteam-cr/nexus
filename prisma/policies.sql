-- prisma/policies.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Estado de seguridad a nivel base de datos (RLS + objetos que Prisma no
-- gestiona) del proyecto Supabase de Nexus. Versiona lo que hasta ahora vivía
-- solo como prosa en ARCHITECTURE.md §4.5 y como SQL ad-hoc tipeado a mano en la
-- consola de Supabase.
--
-- IDEMPOTENTE: se puede correr múltiples veces sin efectos colaterales.
-- Correr DESPUÉS de `npm run db:sync` (prisma db push) en cualquier proyecto
-- Supabase nuevo, o como hardening del actual.
--
-- Runner:
--   npx tsx scripts/apply-policies.ts           # dry-run (imprime, no ejecuta)
--   npx tsx scripts/apply-policies.ts --apply   # aplica contra DATABASE_URL
--   npm run db:policies                         # = --apply
--
-- Contexto (ARCHITECTURE.md §4.5): Supabase auto-otorga
--   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon
-- → cualquier tabla SIN RLS es leíble con la publishable key, que viaja en el
-- bundle JS del browser. La defensa es habilitar RLS en TODAS las tablas de
-- `public`. Los roles `postgres` (que usa Prisma vía DATABASE_URL) y
-- `service_role` tienen BYPASSRLS, así que las queries internas NO se ven
-- afectadas. Las policies SELECT del cliente externo se agregarán cuando se
-- construya ese módulo (ver FUTURO al final).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Extensión pgvector + columna vector de KnowledgeEmbedding (1024 dims).
--    Prisma no modela el tipo `vector`; se crea por SQL (ver schema.prisma:1023-1024).
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE IF EXISTS "KnowledgeEmbedding"
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- 2) RLS en TODAS las tablas de `public` excepto `_prisma_migrations` (metadata
--    interna de Prisma, no se expone vía PostgREST). Bloque dinámico → cubre
--    también cualquier tabla agregada en el futuro, sin mantener la lista a mano.
--    `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` es idempotente por naturaleza.
--
--    Tablas cubiertas al momento de escribir esto (38):
--      Client, SystemConfig, Project, Handoff, HandoffSource, ProjectTimeline,
--      TimelinePhase, TimelineTask, TimelineChange, TimelineBaseline,
--      ProjectExternalAccess, ProjectCanvas, CanvasSection, CanvasBlock,
--      StageNote, ClientDocument, ClientContextCard, HubspotAccount, Knowledge,
--      Audit, Implementation, Message, Agent, AgentRun, TeamMember, AppUser,
--      ClientAssignment, ExecutionLog, KnowledgeDocument, KnowledgeTag,
--      KnowledgeEmbedding, FirefliesSession, SessionMinute, ActionItem,
--      SessionProject, ProjectParticipantSnapshot, CanvasSuggestion,
--      SessionCategory
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- 3) Policy explícita RESTRICTIVE en HubspotAccount: deny-all para cualquier rol
--    no-superuser. Defensa en profundidad para los tokens OAuth de HubSpot (hoy
--    en texto plano — deuda 🟡 #17). Las RESTRICTIVE se AND-ean con cualquier
--    policy permisiva futura: `false AND x = false`. DROP+CREATE = idempotente.
DROP POLICY IF EXISTS deny_all_non_superuser ON "HubspotAccount";
CREATE POLICY deny_all_non_superuser ON "HubspotAccount"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (el runner con --apply ya la corre):
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename <> '_prisma_migrations'
--     AND NOT rowsecurity;
--   -- debe devolver 0 filas (todas con RLS habilitado)
--
-- Y desde el cliente, con la NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable):
--   for (const t of ALL_PUBLIC_TABLES) {
--     const { count } = await supabase.from(t).select('*', { count:'exact', head:true });
--     console.log(t, count);  // 0 en TODAS hasta que existan policies SELECT
--   }
--
-- FUTURO (al construir el módulo de cliente externo): agregar policies SELECT a
-- las 5 tablas de la superficie externa — Project, Client, ClientContextCard,
-- ActionItem, SessionMinute — con filtros tipo
--   EXISTS (... project_id = current_setting('request.jwt.claims')::json->>'project_id')
-- El resto de las tablas se quedan en lock-down permanente (sin policy SELECT).
-- ─────────────────────────────────────────────────────────────────────────────

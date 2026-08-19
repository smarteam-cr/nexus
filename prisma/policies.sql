-- prisma/policies.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Estado de seguridad a nivel base de datos (RLS + objetos que Prisma no
-- gestiona) del proyecto Supabase de Nexus. Versiona lo que hasta ahora vivía
-- solo como prosa en ARCHITECTURE.md §4.5 y como SQL ad-hoc tipeado a mano en la
-- consola de Supabase.
--
-- IDEMPOTENTE: se puede correr múltiples veces sin efectos colaterales.
-- Correr DESPUÉS de aplicar el schema (bootstrap: prisma/migrations/0_init +
-- su after.sql) en cualquier proyecto Supabase nuevo, o como hardening del actual.
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
--    Prisma no modela el tipo `vector`; se crea por SQL (el modelo vive en schema.prisma
--    con la columna como comentario). TOLERANTE a pgvector ausente: el Postgres LOCAL
--    embebido (db:local, F1 2026-08-01) no trae la extensión — ahí se emite un NOTICE y
--    se sigue, porque la columna embedding no tiene hoy ni un lector ni un escritor en
--    lib/ o app/ (auditado 2026-08-01). En Supabase la extensión existe y esto es un no-op.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE IF EXISTS "KnowledgeEmbedding"
    ADD COLUMN IF NOT EXISTS embedding vector(1024);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector no disponible en este servidor (%). Columna embedding OMITIDA — sin efecto: no tiene lectores.', SQLERRM;
END $$;

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

-- 4) Ídem para CostoRecurrente (Cobranza fase 4): salarios estimados — junto a
--    los tokens de HubSpot, la información más sensible del sistema. Deny-all
--    RESTRICTIVE contra cualquier policy permisiva futura. La privacidad ante
--    roles INTERNOS vive en los guards de la app (Prisma bypassa RLS).
DROP POLICY IF EXISTS deny_all_non_superuser ON "CostoRecurrente";
CREATE POLICY deny_all_non_superuser ON "CostoRecurrente"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

-- 5) Ídem para GastoPuntual y CostoMovimiento (Cobranza fase 4.5): los gastos
--    puntuales y la historia de movimientos de costos llevan los MISMOS montos
--    sensibles (salarios estimados, bajas de personal). Deny-all RESTRICTIVE.
DROP POLICY IF EXISTS deny_all_non_superuser ON "GastoPuntual";
CREATE POLICY deny_all_non_superuser ON "GastoPuntual"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

DROP POLICY IF EXISTS deny_all_non_superuser ON "CostoMovimiento";
CREATE POLICY deny_all_non_superuser ON "CostoMovimiento"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

-- 6) Ídem para RoleProfile y RoleProfileShare (Roles: perfiles de puesto y propuestas
--    de contratación): un documento PROPUESTA lleva la oferta salarial, así que pesa lo
--    mismo que un salario de CostoRecurrente. Deny-all RESTRICTIVE contra el `anon` de
--    Supabase. NO protege del rol interno (Prisma conecta con BYPASSRLS) — eso lo hace
--    `visibleRoleWhere` en lib/roles/access.ts.
--    ⚠ Nacieron en scripts/sql/2026-07-30-role-doctype-share-publico.sql, que se corre UNA
--    vez; viven acá para que `npm run db:policies` las RESTABLEZCA en cada corrida.
DROP POLICY IF EXISTS deny_all_non_superuser ON "RoleProfile";
CREATE POLICY deny_all_non_superuser ON "RoleProfile"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

DROP POLICY IF EXISTS deny_all_non_superuser ON "RoleProfileShare";
CREATE POLICY deny_all_non_superuser ON "RoleProfileShare"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

-- 7) Ídem para las CINCO tablas SUPER_ADMIN de la tanda de planilla, tarjetas y
--    comisiones (2026-08-16). Qué llevan y por qué pesan lo mismo que un salario:
--      TarjetaCredito         límite, saldo y últimos 4 de las tarjetas de la empresa
--      TarjetaCreditoCosto    qué se paga con cuál (deduce el gasto por tarjeta)
--      PagoPlanilla           lo que se le PAGÓ a cada persona, quincena por quincena
--      ReglaComisionVendedor  el % que le toca a cada vendedor
--      ComisionVendedor       la comisión liquidada, con su base y su monto
--    ⚠ `ComisionPartner` NO va en esta lista A PROPÓSITO: es un INGRESO (lo que
--    Smarteam gana de un aliado), su superficie es la de ADMIN igual que
--    `IngresoVariable`, y ninguno de los dos lleva deny-all. Tiene RLS habilitado
--    por el bloque dinámico de arriba, que es lo que tapa al `anon` de Supabase.
--    Nacieron en scripts/sql/2026-08-16-planilla-tarjetas-comisiones.sql, que se
--    corre UNA vez; viven acá para que `npm run db:policies` las RESTABLEZCA.
DROP POLICY IF EXISTS deny_all_non_superuser ON "TarjetaCredito";
CREATE POLICY deny_all_non_superuser ON "TarjetaCredito"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

DROP POLICY IF EXISTS deny_all_non_superuser ON "TarjetaCreditoCosto";
CREATE POLICY deny_all_non_superuser ON "TarjetaCreditoCosto"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

DROP POLICY IF EXISTS deny_all_non_superuser ON "PagoPlanilla";
CREATE POLICY deny_all_non_superuser ON "PagoPlanilla"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

DROP POLICY IF EXISTS deny_all_non_superuser ON "ReglaComisionVendedor";
CREATE POLICY deny_all_non_superuser ON "ReglaComisionVendedor"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

DROP POLICY IF EXISTS deny_all_non_superuser ON "ComisionVendedor";
CREATE POLICY deny_all_non_superuser ON "ComisionVendedor"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

-- 8) `EgresoMensual` — el libro de egresos mes a mes (2026-08-17, reporte anual de
--    equilibrio). Lleva la estructura de costos de la empresa concepto por concepto y
--    el cargo de las tarjetas: pesa lo mismo que `CostoRecurrente` y `TarjetaCredito`,
--    aunque el CHECK de la tabla impida que entren filas de PLANILLA (esas viven en
--    `PagoPlanilla`, que ya está en la lista de arriba).
--    ⚠ Su hermana `TipoCambioMes` NO va acá, a propósito: una tasa de cambio publicada
--    no es información sensible — mismo criterio que `PartnerComercial`. Tiene RLS por
--    el bloque dinámico del principio, que es lo que tapa al `anon` de Supabase.
--    Nació en scripts/sql/2026-08-17-reporte-equilibrio.sql, que se corre UNA vez; vive
--    acá para que `npm run db:policies` la RESTABLEZCA.
-- 9) `VentaGanada` y `VentaGanadaCambio` — el espejo de lo VENDIDO (2026-08-19). Son
--    montos de venta con nombre de cliente: mismo peso que el libro de egresos. La tabla
--    de cambios lleva los montos anteriores, así que va igual de tapada que la principal.
--    Nacieron en scripts/sql/2026-08-19-espejo-ventas-ganadas.sql; viven acá para que
--    `npm run db:policies` las RESTABLEZCA.
DROP POLICY IF EXISTS deny_all_non_superuser ON "VentaGanada";
CREATE POLICY deny_all_non_superuser ON "VentaGanada"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

DROP POLICY IF EXISTS deny_all_non_superuser ON "VentaGanadaCambio";
CREATE POLICY deny_all_non_superuser ON "VentaGanadaCambio"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

DROP POLICY IF EXISTS deny_all_non_superuser ON "EgresoMensual";
CREATE POLICY deny_all_non_superuser ON "EgresoMensual"
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

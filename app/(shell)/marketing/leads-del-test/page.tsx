/**
 * /marketing/leads-del-test — el reporte de Marketing de los leads del test, POR EMPRESA (K10 etapa 3, 2026-10-27).
 *
 * Cuántas empresas llegaron por el test del diagnóstico de rendimiento, con cuántas áreas, cuántas lo terminaron y
 * cuántas pasaron a preventa; y los intentos de gente sin empresa en HubSpot, por el dominio de su correo. Sale de la
 * misma lectura de HubSpot que «Llegaron por el test» de Ventas (lib/exploraciones/llegadas-server.ts). Solo lee.
 * Pide `preventa.read` (la misma celda de «Llegaron por el test» en Ventas): muestra los nombres y los correos de quienes
 * hicieron el test. Marketing en general es de lectura universal; esta página no.
 */
import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import LeadsDelTest from "@/components/marketing/LeadsDelTest";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { reporteDeLeadsDelTest } from "@/lib/exploraciones/llegadas-server";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";

export const dynamic = "force-dynamic";

export default async function MarketingLeadsDelTestPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  if (!(await can(ctx.teamMember, "preventa", "read"))) {
    return (
      <div className="space-y-6">
        <PageHeader title="Leads del test" />
        <Alert variant="warning">Esta página muestra los contactos de cada prospecto: la ve quien tiene acceso a Preventa. Pídele el acceso a un super admin.</Alert>
      </div>
    );
  }
  const [reporte, escala, portalId] = await Promise.all([
    reporteDeLeadsDelTest().catch((e) => {
      console.error("[marketing/leads-del-test] no se pudo armar el reporte", e instanceof Error ? e.message : e);
      return null;
    }),
    leerEscalaVigente().catch(() => null),
    portalDelSistema().catch(() => null),
  ]);
  const nombresDeAreas = escala?.estado === "ok" ? Object.fromEntries(escala.escala.areas.map((a) => [a.id, a.nombre])) : {};
  return (
    <div className="space-y-6">
      <PageHeader title="Leads del test" description="Las empresas que llegaron por el test del diagnóstico de rendimiento: con cuántas áreas y cuántas pasaron a preventa." />
      {reporte ? (
        <LeadsDelTest reporte={reporte} nombresDeAreas={nombresDeAreas} portalId={portalId} />
      ) : (
        <Alert variant="danger">No se pudo consultar HubSpot. Revisa la conexión del sistema en Integraciones y recarga la página.</Alert>
      )}
    </div>
  );
}

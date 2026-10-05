/**
 * /sales/use-cases — el catálogo de casos de uso de Ventas (rediseño del 2026-10-05).
 * Cada caso: título, descripción, precio (texto), a qué tipos de propuesta aplica, etiquetas y si
 * está activo. Quien vende los marca en el contexto de cada propuesta. Gateado por `ventas.read`.
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import UseCasesAdminClient from "./UseCasesAdminClient";

export const dynamic = "force-dynamic";

export default async function UseCasesAdminPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");

  return (
    <div className="max-w-6xl px-6 py-8">
      <PageHeader
        title="Casos de uso"
        description="Servicios con precio fijo que quien vende marca en el contexto de una propuesta. Entran al documento con su precio exacto: el agente nunca los escribe ni los inventa."
      />
      <UseCasesAdminClient />
    </div>
  );
}

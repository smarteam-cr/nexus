/**
 * /sales/sicop — LICITACIONES PÚBLICAS, listadas por etapa.
 *
 * Las licitaciones del Estado no son tratos: son tickets del pipeline "Gobiernos" del CRM
 * de Smarteam. Esta pantalla las lee en vivo (no hay espejo en la base: HubSpot es la
 * fuente y el equipo de Ventas trabaja ahí) y las agrupa por la etapa del portal.
 *
 * Gateada por `ventas.read`, igual que el resto del área.
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { leerTableroSicop } from "@/lib/ventas/sicop";
import SicopClient from "./SicopClient";

export const dynamic = "force-dynamic";

export default async function SicopPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");

  const tablero = await leerTableroSicop();
  const abiertas = tablero.etapas
    .filter((e) => !e.cerrada)
    .reduce((n, e) => n + e.licitaciones.length, 0);

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="SICOP"
        description="Licitaciones públicas del pipeline «Gobiernos» de HubSpot, por etapa."
        crumbs={[{ label: "Ventas", href: "/business-cases" }, { label: "SICOP" }]}
        action={
          <div className="text-right">
            <p className="text-xl font-semibold text-fg tabular-nums">{abiertas}</p>
            <p className="text-2xs uppercase tracking-widest text-fg-muted">
              en juego · {tablero.total} en total
            </p>
          </div>
        }
      />
      <SicopClient tablero={tablero} />
    </div>
  );
}

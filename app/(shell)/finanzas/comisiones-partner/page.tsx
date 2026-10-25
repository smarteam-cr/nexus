/**
 * /finanzas/comisiones-partner — lo que Smarteam GANA de cada aliado comercial.
 *
 * ⚠ Gate `cobranza.read` (ADMIN + SUPER_ADMIN), NO `isCostosRole`: esto es un
 * INGRESO, igual que /finanzas/ingresos-variables. Copiar acá el guard de costos
 * dejaría la pantalla en SUPER_ADMIN sin que nadie lo note — y Alex, que es
 * quien registra estas comisiones, se quedaría afuera.
 *
 * Por eso está declarada en la allowlist `NO_COSTOS` de costos-privacy.test.ts:
 * el escaneo de esa suite exige `isCostosRole` en TODA página bajo finanzas
 * salvo las que se declaren explícitamente como no-costos.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { loadComisionesPartner } from "@/lib/cobranza";
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { crDateParts } from "@/lib/jobs/time";
import ComisionesPartnerPanel from "@/components/finanzas/ComisionesPartnerPanel";
import { cargarComisionDeHubspot } from "@/lib/cobranza/comision-hubspot-server";
import { esquemaDesactualizado } from "@/lib/db/esquema";

export const dynamic = "force-dynamic";

export default async function ComisionesPartnerPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");

  const ahora = new Date();
  const hoy = crDateParts(ahora).dateKey;
  const [data, aliados, hubspot] = await Promise.all([
    loadComisionesPartner(),
    // Los aliados de la cartera, para poder ligar la comisión cuando el partner
    // SÍ existe como Client. Ninguno de los 4 del Excel existe hoy — por eso el
    // vínculo es opcional y el partner vive como string.
    prisma.client.findMany({
      where: { OR: [{ kind: "ALIADO" }, CS_CLIENT_WHERE] },
      select: { id: true, name: true, kind: true },
      orderBy: { name: "asc" },
    }),
    // U25: la comisión del próximo pago de HubSpot, armada desde la copia de Partner. Solo lecturas. Sin el SQL del
    // 2026-10-25 la caja no aparece y el resto de la página sigue andando (KNOWN-ERRORS › P2021 en el 3004).
    cargarComisionDeHubspot(prisma, hoy, ahora).catch((e) => {
      if (esquemaDesactualizado(e)) return null;
      throw e;
    }),
  ]);

  return (
    <div className={SHELL_DEFAULT}>
      <ComisionesPartnerPanel initial={data} clientes={aliados} todayISO={hoy} hubspot={hubspot} />
    </div>
  );
}

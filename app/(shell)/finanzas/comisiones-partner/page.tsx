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
import ComisionesPartnerPanel from "@/components/finanzas/ComisionesPartnerPanel";

export const dynamic = "force-dynamic";

export default async function ComisionesPartnerPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");

  const [data, aliados] = await Promise.all([
    loadComisionesPartner(),
    // Los aliados de la cartera, para poder ligar la comisión cuando el partner
    // SÍ existe como Client. Ninguno de los 4 del Excel existe hoy — por eso el
    // vínculo es opcional y el partner vive como string.
    prisma.client.findMany({
      where: { OR: [{ kind: "ALIADO" }, CS_CLIENT_WHERE] },
      select: { id: true, name: true, kind: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className={SHELL_DEFAULT}>
      <ComisionesPartnerPanel initial={data} clientes={aliados} />
    </div>
  );
}

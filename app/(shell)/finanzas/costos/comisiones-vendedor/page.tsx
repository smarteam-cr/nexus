/**
 * /finanzas/costos/comisiones-vendedor — lo que Smarteam le PAGA a quien vendió,
 * SOLO SUPER_ADMIN. Gate AUTÓNOMO isCostosRole(role) antes de cualquier query.
 *
 * ⚠ Es remuneración de una persona: la misma superficie que los salarios. NO
 * confundir con /finanzas/comisiones-partner, que es lo que Smarteam GANA de un
 * aliado (un ingreso, gate cobranza.read). Nunca comparten ruta ni loader.
 *
 * La comisión DEVENGADA es una vista derivada de los cobros COBRADO: no existe
 * como fila hasta que alguien la liquida.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadComisionesVendedor } from "@/lib/cobranza";
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import ComisionesVendedorPanel from "@/components/finanzas/ComisionesVendedorPanel";

export const dynamic = "force-dynamic";

export default async function FinanzasComisionesVendedorPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const [data, personas, clientes] = await Promise.all([
    loadComisionesVendedor(),
    // Solo gente activa: una regla nueva para alguien dado de baja no tiene
    // sentido. Las reglas YA cargadas de una persona que se fue siguen listadas
    // (el loader no filtra) — borrar su historia no es tarea de este selector.
    prisma.teamMember.findMany({
      where: { deactivatedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: CS_CLIENT_WHERE,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className={SHELL_DEFAULT}>
      <ComisionesVendedorPanel initial={data} personas={personas} clientes={clientes} />
    </div>
  );
}

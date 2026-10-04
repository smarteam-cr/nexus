/**
 * /finanzas — la puerta de Finanzas (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md).
 *
 * No muestra nada: lleva a cada persona a la pantalla de entrada de SU vista (lib/finanzas/vista.ts). Es adonde apunta
 * «Finanzas» en el menú de la izquierda. Sin Cobranza, ni siquiera llega acá: el menú no se lo muestra y la puerta lo
 * manda a Clientes, igual que las demás páginas del módulo.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { ENTRADA_DE_VISTA, vistaFinanzasDe } from "@/lib/finanzas/vista";

export const dynamic = "force-dynamic";

export default async function FinanzasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");
  redirect(ENTRADA_DE_VISTA[vistaFinanzasDe(ctx.teamMember)]);
}

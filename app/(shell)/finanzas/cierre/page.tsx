/**
 * /finanzas/cierre — el cierre del mes (rediseño de Finanzas, 2026-10-03, etapa «Cierre del mes»).
 *
 * Abre en el mes anterior al de hoy (el que toca cerrar) o en el de `?mes=YYYY-MM`. Solo dirección: lee la planilla, así
 * que el gate es el de Costos (`isCostosRole`), y las rutas que escribe lo vuelven a pedir (`guardSupervisionFinanzas`).
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { crDateParts } from "@/lib/jobs/time";
import { cargarCierre } from "@/lib/finanzas/cierre-server";
import { mesParaCerrar } from "@/lib/finanzas/cierre";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import CierreClient from "@/components/finanzas/CierreClient";

export const dynamic = "force-dynamic";

export default async function CierrePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (!isCostosRole(ctx.role)) redirect("/finanzas/pendientes");
  const hoyISO = crDateParts(new Date()).dateKey;
  const { mes } = await searchParams;
  const periodo = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : mesParaCerrar(hoyISO);
  const d = await cargarCierre(periodo, hoyISO, { conEquipo: true });
  return (
    <div className={SHELL_DEFAULT}>
      <CierreClient d={d} />
    </div>
  );
}

/**
 * /finanzas/tipo-de-cambio — el tipo de cambio del BCCR día por día, con su histórico (2026-10-05).
 *
 * Mismo gate que Cobranza (`cobranza.read`): una tasa publicada no es información sensible. «Actualizar» pide poder
 * editar Cobranza (la ruta lo vuelve a mirar).
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { leerHistorico } from "@/lib/finanzas/tipo-cambio-server";
import { avisoDelTipoDeCambio } from "@/lib/finanzas/tipo-cambio-planilla-server";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import TipoDeCambioClient from "@/components/finanzas/TipoDeCambioClient";
import PlanillaEnDolares from "@/components/finanzas/PlanillaEnDolares";

export const dynamic = "force-dynamic";

export default async function TipoDeCambioPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");
  const hoyISO = crDateParts(new Date()).dateKey;
  const [historico, manuales, puedeActualizar, aviso] = await Promise.all([
    leerHistorico(),
    // Las tasas cargadas a mano por mes (el ₡500 de antes): se muestran al lado para ver la diferencia.
    prisma.tipoCambioMes.findMany({ select: { periodo: true, crcPorUsd: true, fuente: true }, orderBy: { periodo: "asc" } }),
    can(ctx.teamMember, "cobranza", "write"),
    // El aviso de la planilla (2026-11-13), SIN plata: esta página la ve quien no ve salarios.
    avisoDelTipoDeCambio(hoyISO),
  ]);
  return (
    <div className={SHELL_DEFAULT}>
      <TipoDeCambioClient
        dias={historico?.dias ?? []}
        traidoEn={historico?.traidoEn ?? null}
        sinTabla={historico === null}
        manuales={manuales.map((m) => ({ periodo: m.periodo, crcPorUsd: Number(m.crcPorUsd), fuente: m.fuente }))}
        hoyISO={hoyISO}
        puedeActualizar={puedeActualizar}
        aviso={<PlanillaEnDolares movimiento={aviso.movimiento} umbrales={aviso.umbrales} puedeEditarTopes={ctx.role === "SUPER_ADMIN"} />}
      />
    </div>
  );
}

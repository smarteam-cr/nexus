/**
 * /finanzas/costos/aguinaldo — la provisión estimada por colaborador, SOLO
 * SUPER_ADMIN. Gate AUTÓNOMO isCostosRole(role) antes de cualquier query.
 *
 * Es un DATO OBSERVADO del libro (suma dic→nov ÷ 12), no una tasa: Nexus no
 * tiene ni va a tener tablas de CCSS, cargas ni renta.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadAguinaldo } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import AguinaldoPanel from "@/components/finanzas/AguinaldoPanel";

export const dynamic = "force-dynamic";

export default async function FinanzasAguinaldoPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const hoyISO = crDateParts(new Date()).dateKey;
  const anioActual = Number(hoyISO.slice(0, 4));
  // ⚠ El año viene por la URL. Sin esto, en enero de 2027 el aguinaldo de 2026
  // —con su pago recién registrado— quedaba inalcanzable desde la interfaz a los
  // quince días de escribirlo. Se acota al rango razonable para que un ?anio=99
  // no dispare una ventana absurda.
  const pedido = Number(String((await searchParams).anio ?? ""));
  const anio =
    Number.isInteger(pedido) && pedido >= 2020 && pedido <= anioActual + 1 ? pedido : anioActual;

  const aguinaldo = await loadAguinaldo(anio, hoyISO);

  return (
    <div className={SHELL_DEFAULT}>
      <AguinaldoPanel initial={aguinaldo} anioActual={anioActual} />
    </div>
  );
}

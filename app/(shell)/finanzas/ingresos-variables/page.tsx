/**
 * /finanzas/ingresos-variables — el dinero que entró FUERA del ciclo quincenal.
 *
 * ⚠ Gate `cobranza.read`, NO `isCostosRole`: son ingresos, no salarios. Es la
 * superficie de ADMIN (quien cobra), igual que /cobranza. Copiar acá el guard de
 * costos dejaría la pantalla en SUPER_ADMIN sin que nadie lo note.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { loadIngresosVariables, RESCATE_UMBRAL_DIAS } from "@/lib/cobranza";
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import IngresosVariablesPanel from "@/components/finanzas/IngresosVariablesPanel";

export const dynamic = "force-dynamic";

export default async function IngresosVariablesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");

  const todayISO = crDateParts(new Date()).dateKey;
  // El selector de cliente del alta va contra la CARTERA, no contra las cuentas
  // configuradas: un ingreso variable no exige servicio contratado (y puede no
  // tener cliente del todo). CS_CLIENT_WHERE es el filtro único de "esto es un
  // cliente" — no se escribe `kind` a mano.
  const [filas, clientes] = await Promise.all([
    loadIngresosVariables(todayISO),
    prisma.client.findMany({
      where: { ...CS_CLIENT_WHERE },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className={SHELL_DEFAULT}>
      <IngresosVariablesPanel
        filas={filas}
        clientes={clientes}
        todayISO={todayISO}
        umbralRescateDias={RESCATE_UMBRAL_DIAS}
      />
    </div>
  );
}

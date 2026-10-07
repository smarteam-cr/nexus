/**
 * /finanzas/costos/planillas — la planilla, SOLO SUPER_ADMIN.
 * Gate AUTÓNOMO isCostosRole(role) — el redirect corta ANTES de cualquier query,
 * así ni un byte de costos entra al payload RSC de un no-SUPER_ADMIN. El filtro
 * por categoría se hace acá para no mandar salarios a una hoja de herramientas.
 *
 * ⚠ Acá vive la CONFIGURACIÓN (cuánto cuesta cada persona por mes, todo incluido)
 * y de acá sale el burn y la caja neta. Lo que se PAGÓ de verdad está en
 * `historial/`, al que se llega por el botón del encabezado. Son dos números
 * distintos y por eso siguen siendo dos pantallas: el libro no existe hacia
 * adelante (no hay con qué proyectar) y encima se materializa DESDE esta
 * configuración — sumarlos sería doble conteo.
 * Hasta 2026-08-16 el menú decía «Planillas (estimado)»: el paréntesis era una
 * muleta para distinguirla de un segundo ítem «Libro de planilla», que ya no
 * existe. La distinción ahora la hace el copy, que es donde se explica.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { puedePorPersona } from "@/lib/auth/salarios-por-persona";
import { loadCostos } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { buttonVariants } from "@/components/ui";
import FinanzasCostosCategoriaClient from "@/components/finanzas/FinanzasCostosCategoriaClient";

export const dynamic = "force-dynamic";

export default async function FinanzasCostosPlanillasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  // Super Admin, o la persona con «Planilla» en su override de /team (2026-10-07: Dinia).
  if (!ctx || !(isCostosRole(ctx.role) || puedePorPersona(ctx.role, ctx.teamMember, { section: "planilla", action: "read" }))) {
    redirect("/clients");
  }

  const todayISO = crDateParts(new Date()).dateKey;
  const costos = await loadCostos();

  return (
    <div className={SHELL_DEFAULT}>
      <FinanzasCostosCategoriaClient recorrido="finanzas-planilla"
        categoria="SALARIO"
        titulo="Planillas"
        descripcion="Lo que la planilla cuesta por mes con la configuración de hoy, todo incluido. Lo que se pagó de verdad está en Historial."
        leyenda="Costo por persona con las cargas ya adentro. El número que manda es el monto, no la base por el factor."
        accion={
          <div data-recorrido="fin.planilla.atajos" className="flex flex-wrap gap-2">
            <Link
              href="/finanzas/costos/planillas/calendario"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              Calendario
            </Link>
            <Link
              href="/finanzas/costos/planillas/historial"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              Historial
            </Link>
            {/* Rediseño de Finanzas (2026-10-03): el aguinaldo y las comisiones de vendedor salieron del menú y viven
                con la planilla, que es de donde salen. */}
            <Link href="/finanzas/costos/aguinaldo" className={buttonVariants({ variant: "secondary", size: "md" })}>
              Aguinaldo
            </Link>
            <Link
              href="/finanzas/costos/comisiones-vendedor"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              Comisiones de vendedor
            </Link>
          </div>
        }
        initialCostos={costos.filter((c) => c.categoria === "SALARIO")}
        todayISO={todayISO}
      />
    </div>
  );
}

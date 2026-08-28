/**
 * /finanzas/costos/planillas/calendario — el año de cada persona, quincena por quincena.
 * SOLO SUPER_ADMIN.
 *
 * Gate AUTÓNOMO `isCostosRole(role)` — el redirect corta ANTES de cualquier query, así ni
 * un byte de planilla entra al payload RSC de un no-SUPER_ADMIN. Se repite acá porque una
 * ruta hija NO hereda el gate de su madre: lo pone la page, y el escaneo P4 de
 * `costos-privacy.test.ts` lo exige archivo por archivo justamente para que nadie asuma
 * esa herencia.
 *
 * ⚠ ES OTRO EJE del mismo dato, no una tercera pantalla de planilla:
 *   · `planillas/`           cuánto cuesta cada persona AL MES, con la configuración de hoy
 *   · `planillas/historial/` lo que se pagó, agrupado por mes y quincena
 *   · `planillas/calendario/` lo mismo transpuesto: una persona, sus 24 quincenas
 *
 * Ninguna de las tres escribe planilla. Esta además NO materializa: las quincenas futuras
 * se calculan al leer y no se guardan, así que un aumento no obliga a reescribir filas.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadCalendarioPlanilla, loadCostos } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { buttonVariants } from "@/components/ui";
import CalendarioPlanillaPanel from "@/components/finanzas/CalendarioPlanillaPanel";

export const dynamic = "force-dynamic";

export default async function CalendarioPlanillaPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const todayISO = crDateParts(new Date()).dateKey;
  // El año por query param para poder mirar el anterior sin otra pantalla. Se valida:
  // un `?anio=chau` no puede hacer que el calendario salga vacío sin explicación.
  const { anio: crudo } = await searchParams;
  const pedido = Number(crudo);
  const anio = Number.isInteger(pedido) && pedido >= 2020 && pedido <= 2100 ? pedido : Number(todayISO.slice(0, 4));

  /* Los costos van junto al calendario para poder EDITAR el salario desde acá: la pantalla
     donde se ve el año entero es donde uno decide el aumento, y mandar a la persona a otra
     hoja para teclearlo es perder de vista justo lo que estaba mirando. Es la misma fila de
     `CostoRecurrente` que edita /planillas — no hay una segunda fuente. */
  const [personas, costos] = await Promise.all([
    loadCalendarioPlanilla(anio, todayISO),
    loadCostos(),
  ]);
  const salarios = costos.filter((c) => c.categoria === "SALARIO");

  return (
    <div className={SHELL_DEFAULT}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Link
          href="/finanzas/costos/planillas"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          ← Planillas
        </Link>
        <Link
          href={`/finanzas/costos/planillas/calendario?anio=${anio - 1}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          {anio - 1}
        </Link>
        <Link
          href={`/finanzas/costos/planillas/calendario?anio=${anio + 1}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          {anio + 1}
        </Link>
      </div>
      <CalendarioPlanillaPanel
        personas={personas}
        salarios={salarios}
        anio={anio}
        todayISO={todayISO}
      />
    </div>
  );
}

/**
 * /finanzas/conciliacion — lo que no cuadra con Odoo y Mercury, en una sola lista (rediseño de Finanzas, 2026-10-03).
 *
 * Mismo gate que Cobranza (`cobranza.read`); el enforcement real vive en las rutas de Odoo y Mercury que la pantalla usa.
 * Los números con que abren las pestañas se leen acá, en el servidor; después los mueve la propia pantalla.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { cargarDiferencias, contarEmparejado } from "@/lib/cobranza/odoo/servicio";
import { cargarDiferenciasMercury, cargarEmparejadoMercury } from "@/lib/cobranza/mercury/servicio";
import { ultimaCorrida } from "@/lib/cobranza/odoo/sync";
import { ultimaCorridaMercury } from "@/lib/cobranza/mercury/sync";
import { horaDeCostaRica } from "@/lib/cobranza/odoo/espejo";
import { porDocumento } from "@/lib/finanzas/conciliacion-por-documento";
import { cargarGastosContraMercury } from "@/lib/finanzas/gastos-mercury-server";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import ConciliacionClient from "@/components/finanzas/ConciliacionClient";
import { isCostosRole } from "@/lib/auth/cobranza-roles";

export const dynamic = "force-dynamic";

export default async function ConciliacionPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");
  // Gastos contra Mercury (2026-10-06): solo con `gastos.read`. Son cargos de tarjeta, nunca transferencias ni planilla.
  const puedeVerGastos = await can(ctx.teamMember, "gastos", "read");
  const [puedeEditar, puedeEditarGastos, odoo, mercury, empOdoo, empMercury, copiaOdoo, copiaMercury, gastosMercury] = await Promise.all([
    can(ctx.teamMember, "cobranza", "write"),
    puedeVerGastos ? can(ctx.teamMember, "gastos", "write") : Promise.resolve(false),
    cargarDiferencias(),
    cargarDiferenciasMercury(),
    contarEmparejado(),
    cargarEmparejadoMercury().then((e) => e.conteos),
    ultimaCorrida(),
    ultimaCorridaMercury(),
    puedeVerGastos ? cargarGastosContraMercury(crDateParts(new Date()).dateKey) : Promise.resolve(null),
  ]);
  const ver = (await searchParams).ver;
  /* El número de la pestaña: documentos por resolver (facturas, cuotas, depósitos, cuentas), no filas. */
  const porResolver = porDocumento([...odoo.inconsistencias, ...mercury.inconsistencias]).porResolver;
  return (
    <div className={`${SHELL_DEFAULT} space-y-4`}>
      <ConciliacionClient
        /* Supervisión › «Decidir» llega con ?ver=decisiones. */
        soloDecisiones={ver === "decisiones"}
        /* Pendientes › «Cobrar lo pagado» llega con ?ver=pagados; la tarea de gastos financieros, con ?ver=gastos. */
        abrirEn={ver === "pagados" ? "pagado" : ver === "gastos" && gastosMercury ? "gastos" : "no-cuadra"}
        puedeEditarGastos={puedeEditarGastos}
        gastosMercury={gastosMercury}
        puedeEditar={puedeEditar}
        conIntegraciones={isCostosRole(ctx.role)}
        copias={{
          odoo: copiaOdoo?.ultimaOkEn ? horaDeCostaRica(copiaOdoo.ultimaOkEn) : null,
          mercury: copiaMercury?.ultimaOkEn ? horaDeCostaRica(copiaMercury.ultimaOkEn) : null,
        }}
        conteos={{
          noCuadra: porResolver,
          porEmparejarOdoo: empOdoo.porEmparejar,
          porEmparejarMercury: empMercury.sinEmparejar,
        }}
      />
    </div>
  );
}

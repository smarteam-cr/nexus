/**
 * /finanzas/integraciones — si las copias de Odoo, Mercury y HubSpot están al día y cuánto falta conciliar de cada una
 * (rediseño de Finanzas, 2026-10-03). Es de dirección y de quien supervisa: SOLO Super Admin, el mismo gate que el punto
 * de equilibrio. El detalle se trabaja en Conciliación; la conexión técnica (contraseñas, corridas) sigue en
 * Administración › Integraciones.
 *
 * ⛔ Solo mira. Lo único que cambia algo es «Actualizar todo», que vuelve a copiar lo que esos sistemas ya dicen.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { ultimaCorrida } from "@/lib/cobranza/odoo/sync";
import { ultimaCorridaMercury } from "@/lib/cobranza/mercury/sync";
import { cargarDiferencias, contarEmparejado } from "@/lib/cobranza/odoo/servicio";
import { cargarDiferenciasMercury, cargarEmparejadoMercury } from "@/lib/cobranza/mercury/servicio";
import { horaDeCostaRica } from "@/lib/cobranza/odoo/espejo";
import { resumenDeDiferencias, textoDeMontos, type DiferenciaOdoo } from "@/lib/cobranza/odoo/diferencias";
import { filasPorQuien } from "@/lib/finanzas/conciliacion";
import { PageHeader } from "@/components/ui";
import ActualizarTodo from "@/components/finanzas/ActualizarTodo";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

type Estado = "al-dia" | "vieja" | "fallo" | "nunca";

const CHIP: Record<Estado, { texto: string; clase: string }> = {
  "al-dia": { texto: "✓ Al día", clase: "border-success-line bg-success-surface text-success-ink" },
  vieja: { texto: "● Vieja", clase: "border-warn-line bg-warn-surface text-warn-ink" },
  fallo: { texto: "✕ Falló", clase: "border-danger-line bg-danger-surface text-danger-ink" },
  nunca: { texto: "○ Sin copia", clase: "border-dashed border-line bg-surface-muted text-fg-muted" },
};

function estadoDe(c: { ok: boolean; vencido: boolean; ultimaOkEn: string | null } | null): Estado {
  if (!c || !c.ultimaOkEn) return "nunca";
  if (c.vencido) return "vieja";
  return c.ok ? "al-dia" : "fallo";
}

interface Fila {
  que: string;
  cuanto: string;
  atencion?: boolean;
}

function Tarjeta({
  nombre,
  estado,
  copia,
  filas,
  pendienteRotulo,
  pendiente,
  quien,
  enlaces,
}: {
  nombre: string;
  estado: Estado;
  copia: string;
  filas: Fila[];
  pendienteRotulo: string;
  pendiente: string;
  quien: string;
  enlaces: Array<{ href: string; texto: string }>;
}) {
  const chip = CHIP[estado];
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold text-fg">{nombre}</h2>
        <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${chip.clase}`}>{chip.texto}</span>
      </div>
      <span className="text-xs text-fg-muted">{copia}</span>
      <div className="flex flex-col">
        {filas.map((f) => (
          <div key={f.que} className="flex justify-between gap-3 border-t border-line py-2 text-[13px]">
            <span className="text-fg-secondary">{f.que}</span>
            <span className={`text-right font-semibold tabular-nums ${f.atencion ? "text-warn-ink" : "text-fg"}`}>{f.cuanto}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-1 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
        <span className="text-xs text-fg-muted">{pendienteRotulo}</span>
        <span className="text-sm font-semibold tabular-nums text-fg">{pendiente}</span>
        <span className="text-xs text-fg-secondary">{quien}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {enlaces.map((e) => (
          <Link key={e.href} href={e.href} className="text-[13px] font-semibold text-brand hover:text-brand-light">
            {e.texto}
          </Link>
        ))}
      </div>
    </article>
  );
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

function pendienteDe(lineas: readonly DiferenciaOdoo[]) {
  const r = resumenDeDiferencias(lineas);
  const q = filasPorQuien(lineas);
  return {
    rotulo: r.filas === 0 ? "Nada por conciliar" : `Falta conciliar · ${plural(r.filas, "cosa", "cosas")}`,
    plata: r.plata.length ? textoDeMontos(r.plata) : "—",
    quien:
      r.filas === 0
        ? "Cuadra con Nexus."
        : q.decisiones > 0
          ? `Lo trabaja quien registra; ${q.decisiones} ${q.decisiones === 1 ? "es una decisión" : "son decisiones"} de quien supervisa.`
          : "Lo trabaja quien registra.",
  };
}

export default async function IntegracionesFinanzasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");
  const hoy = crDateParts(new Date()).dateKey;
  const anio = Number(hoy.slice(0, 4));
  const desde = new Date(`${anio}-01-01T00:00:00Z`);
  const hasta = new Date(`${anio + 1}-01-01T00:00:00Z`);

  const [odooCopia, mercuryCopia, facturasOdoo, facturasMercury, empOdoo, empMercury, difOdoo, difMercury, ventasJob, ventas, sinMonto] =
    await Promise.all([
      ultimaCorrida(),
      ultimaCorridaMercury(),
      prisma.facturaOdoo.count({ where: { estadoEspejo: "VIGENTE" } }),
      prisma.facturaMercury.count({ where: { estadoEspejo: "VIGENTE" } }),
      contarEmparejado(),
      cargarEmparejadoMercury().then((e) => e.conteos),
      cargarDiferencias(),
      cargarDiferenciasMercury(),
      prisma.cronJobState.findUnique({ where: { id: "ventas-ganadas-daily" }, select: { lastRunAt: true, lastRunDateKey: true } }),
      prisma.ventaGanada.count({ where: { estado: "GANADA", fechaCierre: { gte: desde, lt: hasta } } }),
      prisma.ventaGanada.count({
        where: { estado: "GANADA", fechaCierre: { gte: desde, lt: hasta }, monto: null, montoConvertidoHubspot: null },
      }),
    ]);

  const pOdoo = pendienteDe(difOdoo.inconsistencias);
  const pMercury = pendienteDe(difMercury.inconsistencias);
  const ventasAlDia = ventasJob?.lastRunDateKey === hoy;

  return (
    <div className={`${SHELL_DEFAULT} space-y-5`}>
      <PageHeader
        title="Integraciones"
        description="Si las copias de Odoo, Mercury y HubSpot están al día, y cuánto falta conciliar de cada una. Nexus solo las lee: nunca escribe en ellas ni mueve un cobro solo."
        action={<ActualizarTodo />}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Tarjeta
          nombre="Odoo"
          estado={estadoDe(odooCopia)}
          copia={
            odooCopia?.ultimaOkEn
              ? `Facturas y clientes del ERP · copia del ${horaDeCostaRica(odooCopia.ultimaOkEn)}`
              : "Todavía no hay ninguna copia buena."
          }
          filas={[
            { que: "Facturas copiadas", cuanto: String(facturasOdoo) },
            { que: "Cuentas emparejadas", cuanto: `${empOdoo.vinculadas} de ${empOdoo.deOdoo}`, atencion: empOdoo.porEmparejar > 0 },
            { que: "Cuentas que facturan por Mercury", cuanto: String(empOdoo.enMercury) },
          ]}
          pendienteRotulo={pOdoo.rotulo}
          pendiente={pOdoo.plata}
          quien={pOdoo.quien}
          enlaces={[
            { href: "/finanzas/conciliacion", texto: "Ver en Conciliación" },
            { href: "/cobranza/odoo", texto: "Cómo funciona y facturación por cliente" },
          ]}
        />
        <Tarjeta
          nombre="Mercury"
          estado={estadoDe(mercuryCopia)}
          copia={
            mercuryCopia?.ultimaOkEn
              ? `Facturas, clientes y pagos · copia del ${horaDeCostaRica(mercuryCopia.ultimaOkEn)}`
              : "Todavía no hay ninguna copia buena."
          }
          filas={[
            { que: "Facturas copiadas", cuanto: String(facturasMercury) },
            { que: "Clientes emparejados", cuanto: `${empMercury.emparejados} de ${empMercury.clientes}`, atencion: empMercury.sinEmparejar > 0 },
            {
              que: "Cuentas sin su cliente de Mercury",
              cuanto: String(empMercury.cuentasSinCliente),
              atencion: empMercury.cuentasSinCliente > 0,
            },
          ]}
          pendienteRotulo={pMercury.rotulo}
          pendiente={pMercury.plata}
          quien={pMercury.quien}
          enlaces={[
            { href: "/finanzas/conciliacion", texto: "Ver en Conciliación" },
            { href: "/cobranza/mercury", texto: "Cómo funciona" },
          ]}
        />
        <Tarjeta
          nombre="HubSpot · ventas"
          estado={!ventasJob?.lastRunAt ? "nunca" : ventasAlDia ? "al-dia" : "vieja"}
          copia={
            ventasJob?.lastRunAt
              ? `Ventas ganadas del año · copia del ${horaDeCostaRica(ventasJob.lastRunAt.toISOString())}`
              : "Todavía no hay ninguna copia."
          }
          filas={[
            { que: `Ventas ganadas en ${anio}`, cuanto: String(ventas) },
            { que: "Sin monto en HubSpot", cuanto: String(sinMonto), atencion: sinMonto > 0 },
          ]}
          pendienteRotulo="Lo vendido que no está en Cobranza"
          pendiente="En el punto de equilibrio"
          quien="Lo decide dirección: ¿se cargan sus servicios o no son venta propia?"
          enlaces={[{ href: "/finanzas/equilibrio", texto: "Ver en el punto de equilibrio" }]}
        />
      </div>

      <section
        aria-label="Cómo se lee"
        className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-fg-secondary"
      >
        <span>
          <span className="font-semibold text-success-ink">✓ Al día</span> · la copia de esta mañana salió bien
        </span>
        <span>
          <span className="font-semibold text-warn-ink">● Vieja</span> · la última copia buena tiene más de un día
        </span>
        <span>
          <span className="font-semibold text-danger-ink">✕ Falló</span> · Nexus no pudo leer: se muestra la copia anterior
        </span>
        <span className="text-fg-muted">
          Contraseñas, token y corridas siguen en{" "}
          <Link href="/integrations" className="font-semibold text-brand hover:text-brand-light">
            Administración › Integraciones
          </Link>
          .
        </span>
      </section>
    </div>
  );
}

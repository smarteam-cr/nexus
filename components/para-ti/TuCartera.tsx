/**
 * TuCartera — las cuentas del CSE en «Para ti» (etapa 4c de docs/mi-dia-plan.md): las de los proyectos donde es el
 * CSE encargado, con su siguiente paso de CS y sus tickets abiertos. Server Component.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import type { CuentaDelCse } from "@/lib/mi-dia/cartera-server";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;

export default function TuCartera({ cuentas, hoyISO }: { cuentas: CuentaDelCse[]; hoyISO: string }) {
  if (cuentas.length === 0) return null;
  const sinPaso = cuentas.filter((c) => !c.paso).length;
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface p-4" aria-labelledby="tu-cartera-cs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tu-cartera-cs" className={ROTULO_DEL_SISTEMA}>
          Tus cuentas
        </h2>
        <span className="text-xs text-fg-muted">
          {cuentas.length} {cuentas.length === 1 ? "cuenta" : "cuentas"}
          {sinPaso > 0 && ` · ${sinPaso} sin siguiente paso de CS`}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {cuentas.map((c) => {
          const vencido = !!c.paso?.fecha && c.paso.fecha < hoyISO;
          return (
            <li key={c.clientId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-[13px]">
              <Link href={`/clients/${c.clientId}`} className="w-56 truncate font-semibold text-fg transition-colors hover:text-brand">
                {c.empresa}
              </Link>
              <span className={cn("min-w-0 flex-1", !c.paso ? "text-warn-ink" : vencido ? "text-warn-ink" : "text-fg-secondary")}>
                {c.paso ? (
                  <>
                    {c.paso.que}
                    {c.paso.fecha && <span className="text-fg-muted"> · {vencido ? `venció el ${fecha(c.paso.fecha)}` : `para el ${fecha(c.paso.fecha)}`}</span>}
                  </>
                ) : (
                  "Sin siguiente paso de CS"
                )}
              </span>
              <span className="text-xs text-fg-muted">
                {c.proyectos.length} {c.proyectos.length === 1 ? "proyecto" : "proyectos"}
                {c.ticketsAbiertos > 0 && ` · ${c.ticketsAbiertos} ${c.ticketsAbiertos === 1 ? "ticket abierto" : "tickets abiertos"}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

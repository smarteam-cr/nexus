/**
 * TuAgenda — las reuniones de hoy en tu calendario, con la empresa de cada una y «Preparar» (etapa 4c de
 * docs/mi-dia-plan.md). Server Component: lo arma la página de «Para ti» con `agendaDeHoy`.
 *
 * «Preparar» abre el resumen de la cuenta para esa reunión (/para-ti/reunion/[evento]?cliente=…), que pide acceso al
 * cliente. Con varias empresas posibles (alguien de HubSpot, de una agencia), se elige cuál.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import type { AgendaDeHoy } from "@/lib/mi-dia/agenda-server";

const hora = (iso: string) => new Date(new Date(iso).getTime() - 6 * 3_600_000).toISOString().slice(11, 16);

const SIN_AGENDA: Record<Exclude<AgendaDeHoy["estado"], "ok">, string> = {
  "sin-google": "La agenda de Google no está configurada en este servidor.",
  "sin-permiso": "Nexus no pudo leer tu calendario (falta el permiso en Google Workspace).",
  error: "Tu calendario no se pudo leer ahora. Vuelve a intentarlo en un rato.",
};

export default function TuAgenda({ agenda, ahora }: { agenda: AgendaDeHoy; ahora: Date }) {
  const conEmpresa = agenda.reuniones.filter((r) => r.empresas.length > 0).length;
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface p-4" aria-labelledby="tu-agenda">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tu-agenda" className={ROTULO_DEL_SISTEMA}>
          Tu agenda de hoy
        </h2>
        <span className="flex flex-wrap items-baseline gap-3 text-xs text-fg-muted">
          {agenda.estado === "ok" && agenda.reuniones.length > 0 && (
            <span>
              {agenda.reuniones.length} {agenda.reuniones.length === 1 ? "reunión" : "reuniones"}
              {conEmpresa > 0 && `, ${conEmpresa} con clientes`}
            </span>
          )}
          <Link href="/tareas?vista=calendario" className="font-semibold text-brand transition-colors hover:text-brand-light">
            Planificar la semana
          </Link>
        </span>
      </div>
      {agenda.estado !== "ok" ? (
        <p className="text-[13px] text-fg-muted">{SIN_AGENDA[agenda.estado]}</p>
      ) : agenda.reuniones.length === 0 ? (
        <p className="text-[13px] text-fg-muted">No tienes reuniones hoy.</p>
      ) : (
        <ul className="divide-y divide-line">
          {agenda.reuniones.map((r) => {
            const paso = Date.parse(r.fin ?? r.inicio) < ahora.getTime();
            return (
              <li key={r.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[13px]", paso && "opacity-60")}>
                <span className="w-24 tabular-nums text-fg-secondary">
                  {hora(r.inicio)}
                  {r.fin && `–${hora(r.fin)}`}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">{r.titulo}</span>
                  <span className="block text-xs text-fg-muted">
                    {r.empresas.length === 0
                      ? r.externos > 0
                        ? "Con alguien de afuera, sin empresa de Nexus"
                        : "Interna"
                      : r.empresas.length === 1
                        ? r.nombres[r.empresas[0]]
                        : `Puede ser de ${r.empresas.length} empresas`}
                  </span>
                </span>
                {r.empresas.length > 0 && (
                  <span className="flex flex-wrap items-center gap-2">
                    {r.empresas.slice(0, 3).map((id) => (
                      <Link
                        key={id}
                        href={`/para-ti/reunion/${encodeURIComponent(r.id)}?cliente=${encodeURIComponent(id)}`}
                        className="inline-flex items-center rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
                      >
                        {r.empresas.length === 1 ? "Preparar" : `Preparar · ${r.nombres[id]}`}
                      </Link>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

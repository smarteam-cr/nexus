"use client";

/**
 * components/tareas/ProximasReunionesDeLaCuenta.tsx — «Próximas reuniones» en la ficha del cliente › La cuenta › Tareas
 * (fase 2.2 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17).
 *
 * Las reuniones con la cuenta de los próximos 8 días, de los calendarios de la gente de Smarteam que la trabaja y de las
 * reuniones planeadas en Tareas, con quién de Smarteam va a cada una. Son hechos (no lleva la chispa). Datos: GET
 * /api/tareas/del-cliente/[clientId]/reuniones (lib/mi-dia/proximas-server.ts).
 */
import { useEffect, useState } from "react";
import { SkeletonText } from "@/components/ui/Skeleton";
import { horaCR } from "@/lib/mi-dia/inicio";
import { cuandoEsLaReunion, DIAS_PARA_LA_REUNION } from "@/lib/mi-dia/servicio";
import { hoyEnCostaRica } from "@/lib/tareas/semana";
import type { ProximasDeLaCuenta } from "@/lib/mi-dia/proximas-server";

const listar = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export default function ProximasReunionesDeLaCuenta({ clientId }: { clientId: string }) {
  const [datos, setDatos] = useState<{ clientId: string; d: ProximasDeLaCuenta | null } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/tareas/del-cliente/${encodeURIComponent(clientId)}/reuniones`)
      .then((r) => (r.ok ? (r.json() as Promise<ProximasDeLaCuenta>) : null))
      .catch(() => null)
      .then((d) => vivo && setDatos({ clientId, d }));
    return () => {
      vivo = false;
    };
  }, [clientId]);

  const hoy = hoyEnCostaRica();
  const d = datos?.clientId === clientId ? datos.d : undefined;

  return (
    <section aria-labelledby="proximas-t" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="proximas-t" className="text-sm font-semibold text-fg">
          Próximas reuniones
        </h2>
        <span className="text-xs text-fg-muted">próximos {DIAS_PARA_LA_REUNION} días</span>
      </div>
      {d === undefined ? (
        <div aria-busy="true" className="min-h-[56px]">
          <SkeletonText lines={2} />
        </div>
      ) : d === null ? (
        <p className="text-[13px] text-fg-muted">No se pudieron leer las reuniones ahora. Vuelve a intentarlo en un rato.</p>
      ) : d.reuniones.length === 0 ? (
        <p className="text-[13px] text-fg-secondary">
          Nada agendado con la cuenta en los próximos {DIAS_PARA_LA_REUNION} días.
          {d.miradas.length > 0 && <span className="text-fg-muted"> Se miró el calendario de {listar(d.miradas)}.</span>}
        </p>
      ) : (
        <ul className="flex flex-col">
          {d.reuniones.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-line py-2 first:border-t-0 first:pt-0">
              <span className="w-[112px] flex-none text-[13px] font-semibold tabular-nums text-fg">
                {cuandoEsLaReunion(r.inicio, hoy)} · {horaCR(r.inicio)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg" title={r.titulo}>
                {r.titulo}
              </span>
              <span className="w-full pl-[124px] text-xs text-fg-secondary max-sm:pl-0">
                {r.vanDeSmarteam.length ? `Van ${listar(r.vanDeSmarteam)}` : "Sin nadie de Smarteam invitado"}
                {r.externos > 0 && ` · ${r.externos} del cliente`}
                {r.fuente === "tarea" && r.numero != null && <span className="text-fg-muted"> · planeada en Tareas (T-{r.numero})</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {d && d.sinLeer.length > 0 && (
        <p className="text-xs text-warn-ink">No se pudo leer el calendario de {listar(d.sinLeer)}: puede haber más reuniones.</p>
      )}
    </section>
  );
}

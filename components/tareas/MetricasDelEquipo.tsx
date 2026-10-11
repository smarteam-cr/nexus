"use client";

/**
 * components/tareas/MetricasDelEquipo.tsx — las métricas de una semana del sprint (lib/tareas/metricas.ts), en la Semana
 * del equipo. Solo sobre lo que ves. Cada cifra dice de dónde sale; sin respuestas no hay porcentaje.
 */
import { useEffect, useState } from "react";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { SkeletonPanel, Skeleton } from "@/components/ui";
import type { MetricasDeLaSemana } from "@/lib/tareas/metricas";
import { apiTareas } from "./api";

function Cifra({ valor, texto }: { valor: string; texto: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums text-fg">{valor}</p>
      <p className="text-xs text-fg-muted">{texto}</p>
    </div>
  );
}

export function MetricasDelEquipo({ equipo, semana }: { equipo: string; semana: string }) {
  const [m, setM] = useState<MetricasDeLaSemana | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    apiTareas
      .metricasDelEquipo(equipo, semana)
      .then((r) => vivo && setM(r))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudieron calcular."));
    return () => {
      vivo = false;
    };
  }, [equipo, semana]);

  if (error) return <p className="text-[13px] text-danger-ink">{error}</p>;
  if (!m) {
    return (
      <SkeletonPanel minH="min-h-[260px]" bodyClassName="grid gap-3 p-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" delay={i * 40} />
        ))}
      </SkeletonPanel>
    );
  }
  const r = m.revision;
  const p = m.propuestasDeReuniones;
  return (
    <div className="space-y-5" data-recorrido="equipo.metricas">
      <section className="space-y-2">
        <p className={ROTULO_DEL_SISTEMA}>La revisión de la semana</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Cifra valor={r.cumplimiento === null ? "—" : `${r.cumplimiento} %`} texto={r.cumplimiento === null ? "Todavía nadie marcó su semana" : "Terminadas sobre lo marcado"} />
          <Cifra valor={String(r.hechas)} texto="Terminadas" />
          <Cifra valor={String(r.siguen)} texto="Siguen a otra semana" />
          <Cifra valor={String(r.sinMarcar)} texto="Abiertas sin marcar" />
        </div>
        {(r.masAdelante > 0 || r.noSeHaran > 0) && (
          <p className="text-xs text-fg-muted">
            {r.masAdelante > 0 ? `${r.masAdelante} para más adelante` : ""}
            {r.masAdelante > 0 && r.noSeHaran > 0 ? " · " : ""}
            {r.noSeHaran > 0 ? `${r.noSeHaran} ya no se harán` : ""}
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Cómo entraron</p>
          {m.comoEntran.length === 0 ? (
            <p className="text-[13px] text-fg-muted">No se sumó nada esta semana.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {m.comoEntran.map((c) => (
                <li key={c.origen} className="flex items-center justify-between px-3 py-2 text-[13px]">
                  <span className="text-fg">{c.nombre}</span>
                  <span className="tabular-nums text-fg-secondary">{c.cuantas}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Lo que propuso Nexus desde reuniones · {p.total}</p>
          {p.total === 0 ? (
            <p className="text-[13px] text-fg-muted">No se leyó ninguna reunión esta semana.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-[13px]">
              {[
                ["Usadas tal cual", p.talCual],
                ["Usadas con cambios", p.conCambios],
                ["Descartadas", p.descartadas],
                ["Eran otra tarea", p.eraOtra],
                ["Nadie las decidió", p.vencidas],
                ["Sin decidir todavía", p.sinDecidir],
              ]
                .filter(([, n]) => (n as number) > 0)
                .map(([texto, n]) => (
                  <li key={texto as string} className="flex items-center justify-between px-3 py-2">
                    <span className="text-fg">{texto}</span>
                    <span className="tabular-nums text-fg-secondary">{n}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Terminado por cliente</p>
          {m.porCliente.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nada terminado todavía.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {m.porCliente.slice(0, 10).map((c) => (
                <li key={c.nombre} className="flex items-center justify-between px-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate text-fg">{c.nombre}</span>
                  <span className="tabular-nums text-fg-secondary">{c.hechas}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

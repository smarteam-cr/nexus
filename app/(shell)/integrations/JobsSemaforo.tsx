/**
 * app/(shell)/integrations/JobsSemaforo.tsx — LOS JOBS DEL SERVER, A LA VISTA.
 *
 * Server component: no tiene estado ni handlers, solo pinta lo que la página ya leyó
 * (`leerEstadoDeJobs`, B-03). Diez jobs corren solos en el VPS —señales y watchdog de CS,
 * partner, cobranza, ventas ganadas, Odoo, mantenimiento— y hasta el 2026-09-04 un fallo era
 * una línea en `docker logs` que nadie leía. Acá: verde si la última corrida terminó bien, rojo
 * con el error si no, gris si nunca corrió desde que existe el registro.
 *
 * ⚠ «Apagado» no es «nunca corrió». Hasta el 2026-09-12 un job sin su variable en el `.env` se
 * pintaba igual que uno que todavía no llegó a su hora, y el espejo de Odoo pasó diez días en gris
 * sin que la pantalla dijera que al servidor le faltaba la contraseña. Ahora el motivo se escribe,
 * y sale de la MISMA regla que usa `shouldRun` (`lib/jobs/requisitos.ts`).
 *
 * Va en Integraciones y no en Preferencias (decisión por default del plan 2026-09-04): es el
 * estado del SISTEMA, no una preferencia de quien mira.
 */
import type { EstadoDeJob } from "@/lib/jobs/estado";

export interface JobEnSemaforo extends EstadoDeJob {
  /** Por qué la configuración de este servidor no lo deja correr; null = encendido. */
  motivoApagado: string | null;
}

interface Props {
  jobs: JobEnSemaforo[];
  /** Sin CRON_ENABLED=1 no corre ninguno: en las PCs es lo normal. */
  schedulerApagado: string | null;
}

const fecha = (iso: string | Date | null) => {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" });
};

export default function JobsSemaforo({ jobs, schedulerApagado }: Props) {
  /* Un apagado con un fallo viejo no cuenta como «con problema»: su problema es que está apagado,
     y eso ya se dice en su fila. */
  const conProblema = jobs.filter((j) => !j.motivoApagado && j.resultado && !j.resultado.ok).length;
  const apagados = jobs.filter((j) => j.motivoApagado).length;
  return (
    <section className="rounded-xl bg-surface border border-line p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-fg mb-1">Jobs del servidor</h2>
          <p className="text-xs text-fg-muted">
            Lo que corre solo en el VPS: señales y watchdog de Éxito del cliente, partner, cobranza,
            ventas ganadas, Odoo y mantenimiento. El punto dice cómo terminó la última corrida.
          </p>
        </div>
        <span
          className={
            conProblema > 0
              ? "shrink-0 text-xs font-medium text-danger-ink"
              : "shrink-0 text-xs font-medium text-success-ink"
          }
        >
          {conProblema > 0 ? `${conProblema} con problema` : "Todos bien"}
          {apagados > 0 && <span className="text-fg-muted"> · {apagados} apagado{apagados !== 1 ? "s" : ""}</span>}
        </span>
      </div>

      {schedulerApagado && (
        <p className="mt-3 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs text-warn-ink">
          {schedulerApagado}
        </p>
      )}

      <ul className="mt-4 divide-y divide-line text-xs">
        {jobs.map((j) => {
          const r = j.resultado;
          const apagado = j.motivoApagado;
          const punto = apagado || !r ? "bg-fg-muted" : r.ok ? "bg-success" : "bg-danger-ink";
          const titulo = apagado
            ? "Apagado en este servidor"
            : !r
              ? "Nunca corrió (desde que existe el registro)"
              : r.ok
                ? "Última corrida OK"
                : "Última corrida falló";
          return (
            <li key={j.key} className="flex items-start gap-3 py-2">
              <span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${punto}`} title={titulo} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium text-fg">{j.key}</span>
                  <span className="text-fg-muted">
                    {apagado ? "apagado" : r ? fecha(r.at) : j.lastRunAt ? fecha(j.lastRunAt) : "nunca corrió"}
                  </span>
                </div>
                {apagado && (
                  <p className="mt-0.5 break-words text-fg-muted">
                    {apagado}
                    {r && ` La última vez que corrió (${fecha(r.at)}) ${r.ok ? "terminó bien" : "falló"}.`}
                  </p>
                )}
                {!apagado && r && !r.ok && <p className="mt-0.5 break-words text-danger-ink">{r.error}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

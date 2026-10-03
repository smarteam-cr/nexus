"use client";

/**
 * SesionNueva — lo primero que se ve en Exploración (pedido de Elías, 2026-10-02): si llegó una
 * sesión que el agente todavía no leyó, cuál es, cuándo fue y de dónde viene (Google Meet, HubSpot o
 * sumada a mano), con el botón para que la lea. Mientras lee, en qué va. Si no hay nada nuevo, la
 * última que leyó y dónde quedó lo que propuso.
 */
import { Alert, Badge, Button } from "@/components/ui";
import { diaYHora } from "@/lib/exploraciones/fechas";
import type { ReunionSinLeer } from "@/lib/exploraciones/lectura";
import { cn } from "@/lib/cn";
import { useLienzo } from "./contexto";
import { useCorrida } from "./useCorrida";

const ORIGEN: Record<ReunionSinLeer["origen"], string> = {
  meet: "Google Meet",
  hubspot: "HubSpot",
  documento: "Sumada a mano",
};

function Marco({ tono, eyebrow, children }: { tono: "nuevo" | "neutro"; eyebrow: string; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "space-y-3 rounded-xl border px-5 py-4",
        tono === "nuevo" ? "border-brand/30 bg-brand/5" : "border-line bg-surface",
      )}
    >
      <p className={cn("text-2xs font-semibold uppercase tracking-widest", tono === "nuevo" ? "text-brand-light" : "text-fg-muted")}>{eyebrow}</p>
      {children}
    </section>
  );
}

export default function SesionNueva() {
  const { exp, sinLeer, puedeEditar, irA } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const leyendo = corriendo && corrida?.modo === "leer";
  const ultimaLectura = [...exp.estado.propuesta.corridas].reverse().find((c) => c.modo === "leer");

  if (leyendo) {
    return (
      <Marco tono="nuevo" eyebrow="El agente está leyendo">
        <p className="text-sm text-fg" role="status">
          {corrida?.fase ?? "Empezando…"}
        </p>
        <p className="text-xs text-fg-secondary">Cuando termine, lo que propuso aparece marcado como «Propuesto» en su lugar.</p>
      </Marco>
    );
  }

  const error = corrida?.estado === "ERROR" && corrida.modo === "leer" ? corrida.error : null;

  if (sinLeer.length > 0) {
    const [r, ...otras] = sinLeer;
    return (
      <Marco tono="nuevo" eyebrow={sinLeer.length === 1 ? "Nueva sesión detectada" : `${sinLeer.length} sesiones nuevas detectadas`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <p className="text-base font-semibold text-fg">{r.titulo}</p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
              <span>{diaYHora(r.fecha)}</span>
              <Badge size="xs" variant={r.origen === "meet" ? "success" : r.origen === "hubspot" ? "warning" : "default"}>
                {ORIGEN[r.origen]}
              </Badge>
            </p>
            <p className="max-w-2xl text-sm text-fg-secondary">
              Pídele al agente que la lea: propone lo que salió, con la frase del cliente que lo respalda. Lo encuentras marcado como «Propuesto» en el Resumen, en La escala y aquí abajo.
            </p>
          </div>
          {puedeEditar && (
            <Button variant="primary" loading={lanzando} disabled={corriendo} onClick={() => void lanzar("leer")}>
              Leer con el agente
            </Button>
          )}
        </div>
        {otras.length > 0 && (
          <ul className="space-y-1 border-t border-brand/15 pt-3 text-xs text-fg-secondary">
            {otras.slice(0, 3).map((o) => (
              <li key={`${o.origen}-${o.id}`} className="flex flex-wrap items-center gap-2">
                <span className="text-fg">{o.titulo}</span>
                <span>· {diaYHora(o.fecha)}</span>
                <Badge size="xs">{ORIGEN[o.origen]}</Badge>
              </li>
            ))}
          </ul>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
      </Marco>
    );
  }

  if (ultimaLectura) {
    return (
      <Marco tono="neutro" eyebrow="Última sesión leída">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-secondary">
            {diaYHora(ultimaLectura.en)} ·{" "}
            {ultimaLectura.propuestos === 0
              ? "no había nada nuevo que proponer"
              : `${ultimaLectura.propuestos} ${ultimaLectura.propuestos === 1 ? "propuesta" : "propuestas"}: revísalas en el Resumen y en La escala`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => irA("resumen")}>
              Ir al Resumen
            </Button>
            {puedeEditar && (
              <Button size="sm" variant="secondary" loading={lanzando} disabled={corriendo} onClick={() => void lanzar("leer")}>
                Buscar sesiones nuevas
              </Button>
            )}
          </div>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
      </Marco>
    );
  }

  return (
    <Marco tono="neutro" eyebrow="Sesiones">
      <p className="text-sm text-fg-secondary">
        Todavía no hay sesiones con el cliente. Cuando llegue la transcripción de la primera reunión (Google Meet o el notetaker de HubSpot), aparece aquí y el agente la lee sola.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
    </Marco>
  );
}

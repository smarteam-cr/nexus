"use client";

/**
 * components/sessions/QuienEstuvo.tsx — «Quién estuvo», arriba de cada sesión (2026-11-27).
 *
 * Una línea plegable («Estuvieron 2 de 3 · nadie del cliente»); al abrirla, cada persona con su lado, su respuesta a la
 * invitación y, si fue por Meet, si entró y cuántos minutos. La regla y los textos viven en lib/sessions/quien-estuvo.ts.
 */
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { textoDeLaRespuesta, type PersonaDeLaReunion, type QuienEstuvo as QuienEstuvoDatos } from "@/lib/sessions/quien-estuvo";

const ROTULO_DEL_LADO: Record<PersonaDeLaReunion["lado"], string> = { smarteam: "Smarteam", cliente: "El cliente", otro: "Otro" };

function lado(p: PersonaDeLaReunion): string {
  if (p.lado !== "otro") return ROTULO_DEL_LADO[p.lado];
  return p.dominio ?? "Sin correo";
}

function asistencia(p: PersonaDeLaReunion): string | null {
  if (p.entro === true) return p.minutos !== null ? `Entró · ${p.minutos} min` : "Entró";
  if (p.entro === false) return "No entró";
  return null;
}

/**
 * «Quién estuvo» de una reunión que se carga sola (donde la pantalla no la trae del servidor: la sesión de la preventa).
 * Mientras carga o si no se puede leer, no muestra nada: es una ayuda, no un bloqueo.
 */
export function QuienEstuvoDeLaReunion({ sessionId }: { sessionId: string }) {
  const [datos, setDatos] = useState<{ id: string; q: QuienEstuvoDatos } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/quien-estuvo`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ quienEstuvo: QuienEstuvoDatos }>) : null))
      .then((j) => {
        if (j?.quienEstuvo) setDatos({ id: sessionId, q: j.quienEstuvo });
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [sessionId]);
  // La de otra sesión (se cambió de pestaña) no se muestra mientras llega la nueva.
  if (!datos || datos.id !== sessionId) return null;
  return <QuienEstuvo key={sessionId} datos={datos.q} />;
}

export default function QuienEstuvo({ datos, abierto = false }: { datos: QuienEstuvoDatos; abierto?: boolean }) {
  const [open, setOpen] = useState(abierto);
  if (datos.personas.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover rounded-xl"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-fg-muted transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-xs font-semibold text-fg-muted">Quién estuvo</span>
        <span className={`text-xs ${datos.nadieDelCliente ? "font-semibold text-fg" : "text-fg-secondary"}`}>{datos.resumen}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2">
          {datos.nota && <p className="text-xs text-fg-muted">{datos.nota}</p>}
          <ul className="space-y-1">
            {datos.personas.map((p, i) => {
              const respuesta = textoDeLaRespuesta(p.respuesta);
              const entro = asistencia(p);
              return (
                <li key={p.correo ?? `sin-correo-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="text-fg" title={p.correo ?? undefined}>
                    {p.nombre ?? p.correo ?? "Sin nombre"}
                  </span>
                  {p.cargo && <span className="text-fg-muted">{p.cargo}</span>}
                  <span className="rounded-md border border-line bg-surface-muted px-1.5 text-fg-secondary">{lado(p)}</span>
                  {p.organizo && <span className="text-fg-muted">organizó</span>}
                  {respuesta && <span className="text-fg-muted">{respuesta}</span>}
                  {entro && <span className={p.entro ? "text-fg-secondary" : "text-fg-muted"}>{entro}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * components/canvas/ElegirPlantilla.tsx — elegir la PLANTILLA de un entregable antes de generarlo (2026-10-23).
 *
 * Elías: al activar el Diagnóstico, ver las dos plantillas con sus secciones, elegir una y que ahí empiece la
 * generación (lo dibujó como el selector de HubSpot «Elige cómo crear el formulario»: dos tarjetas con radio, dibujo y
 * descripción, y cada una con «Secciones · N»). Las plantillas y sus secciones salen del registro de entregables
 * (lib/entregables/registro.ts) y del canon del canvas: sumar una plantilla allá la muestra acá sola.
 *
 * UI interna: primitivas y tokens, tuteo. El botón es el de siempre (`CanvasAgentButton`), con la plantilla elegida:
 * mismo permiso, misma corrida y el mismo aviso si casi nada está confirmado. «Escribirlo yo» abre el documento con las
 * secciones de la plantilla elegida y sin la IA (POST …/diagnostico/plantilla): antes del selector, un diagnóstico vacío
 * se podía escribir a mano, y esa puerta no se cierra.
 */
import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import CanvasAgentButton from "@/components/clients/CanvasAgentButton";
import { canvasDefForSlug } from "@/lib/canvas/canvas-defs";
import { entregableDe, seccionesDeLaPlantilla, type PlantillaDeEntregable } from "@/lib/entregables/registro";

/** El rótulo de una sección en la lista: la portada se llama por lo que es. */
const ROTULO: Record<string, string> = { diagnostico: "Portada" };

/** El dibujo de la tarjeta: una hoja con la portada y una raya por sección (más rayas, más largo el documento). */
function Dibujo({ secciones }: { secciones: number }) {
  const rayas = Math.min(secciones - 1, 12);
  const alto = 14 + rayas * 6;
  return (
    <svg viewBox={`0 0 120 ${alto + 16}`} className="h-20 w-auto" aria-hidden>
      <rect x="1" y="1" width="118" height={alto + 14} rx="6" className="fill-surface stroke-line" strokeWidth="1.5" />
      <rect x="8" y="8" width="104" height="12" rx="3" className="fill-brand opacity-80" />
      {Array.from({ length: rayas }, (_, i) => (
        <rect key={i} x="8" y={26 + i * 6} width={i % 3 === 2 ? 64 : 104} height="3" rx="1.5" className="fill-fg-muted opacity-40" />
      ))}
    </svg>
  );
}

export default function ElegirPlantilla({
  slug,
  clientId,
  projectId,
  canvasId,
  agentId,
  onGenerado,
}: {
  slug: string;
  clientId: string;
  projectId: string;
  canvasId: string;
  agentId: string;
  onGenerado?: () => void;
}) {
  const plantillas: readonly PlantillaDeEntregable[] = entregableDe(slug)?.plantillas ?? [];
  const canon = canvasDefForSlug(slug)?.sections ?? [];
  const [elegida, setElegida] = useState<string>(() => (plantillas.find((p) => p.recomendada) ?? plantillas[0])?.id ?? "");
  const [abriendo, setAbriendo] = useState(false);
  const toast = useToast();
  if (plantillas.length < 2) return null;

  const escribirloYo = async () => {
    setAbriendo(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/diagnostico/plantilla`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantilla: elegida }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        toast.error(j?.error ?? "No se pudo abrir el documento en blanco. Vuelve a intentarlo.");
        return;
      }
      onGenerado?.();
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setAbriendo(false);
    }
  };

  const alTeclado = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setElegida(id);
    }
  };

  return (
    <section className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 py-6">
      <div className="space-y-1">
        <p className={ROTULO_DEL_SISTEMA}>Antes de generar</p>
        <h2 className="text-sm font-semibold text-fg">Elige cómo armar el diagnóstico</h2>
        <p className="text-xs text-fg-muted">
          Los dos le explican al cliente por qué tiene los resultados que tiene y qué vamos a hacer. Después puedes ocultar,
          mover o quitar cualquier parte.
        </p>
      </div>

      <div role="radiogroup" aria-label="Plantilla del diagnóstico" className="grid gap-4 sm:grid-cols-2">
        {plantillas.map((p) => {
          const secciones = seccionesDeLaPlantilla(p, canon);
          const activa = p.id === elegida;
          return (
            <div
              key={p.id}
              role="radio"
              aria-checked={activa}
              tabIndex={activa ? 0 : -1}
              onClick={() => setElegida(p.id)}
              onKeyDown={(e) => alTeclado(e, p.id)}
              className={cn(
                "relative flex cursor-pointer flex-col gap-4 rounded-lg border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                activa ? "border-brand bg-surface-muted ring-1 ring-brand" : "border-line bg-surface hover:bg-surface-hover",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute right-4 top-4 flex h-4 w-4 items-center justify-center rounded-full border",
                  activa ? "border-brand" : "border-line",
                )}
              >
                {activa && <span className="h-2 w-2 rounded-full bg-brand" />}
              </span>
              <div className="flex justify-center">
                <Dibujo secciones={secciones.length} />
              </div>
              <div className="space-y-1 text-center">
                <p className="flex items-center justify-center gap-2 text-sm font-semibold text-fg">
                  {p.nombre}
                  {p.recomendada && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">Recomendada</span>
                  )}
                </p>
                <p className="text-xs text-fg-secondary">{p.paraQue}</p>
              </div>
              <div>
                <p className={ROTULO_DEL_SISTEMA}>Secciones · {secciones.length}</p>
                <ol className="mt-2 divide-y divide-line rounded-md border border-line bg-surface">
                  {secciones.map((s, i) => (
                    <li key={s.key} className="flex items-baseline gap-3 px-3 py-1.5 text-xs">
                      <span className="w-4 shrink-0 text-right tabular-nums text-fg-muted">{i + 1}</span>
                      <span className="text-fg">{ROTULO[s.key] ?? s.label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CanvasAgentButton
          clientId={clientId}
          projectId={projectId}
          canvasId={canvasId}
          agentId={agentId}
          async
          plantilla={elegida}
          label="Generar con esta plantilla"
          notifyLabel="diagnóstico"
          alreadyGenerated={false}
          onDone={onGenerado}
        />
        <BotonBlanco onClick={() => void escribirloYo()} disabled={abriendo} title="Abre el documento con estas secciones, vacío, para escribirlo a mano">
          {abriendo ? "Abriendo…" : "Escribirlo yo"}
        </BotonBlanco>
        <span className="text-xs text-fg-muted">La corrida aparece en el centro de corridas: puedes seguir navegando.</span>
      </div>
    </section>
  );
}

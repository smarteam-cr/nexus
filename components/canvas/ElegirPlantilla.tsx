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
 *
 * El Kickoff (2026-10-30): se elige al entrar por primera vez, con las mismas tarjetas de «Nuevo artefacto»; sus
 * secciones salen de `canonDelKickoff`, porque las del servicio recurrente no están en el canon de su canvas. En un
 * servicio por ciclos la plantilla no se elige (`soloPlantilla`): la impone lib/entregables/generar-server.ts.
 *
 * La Planificación (2026-10-29, pregunta 44): la lista sigue, y Nexus sugiere una según el caso, con su razón en una línea
 * (lib/planificacion/plantilla-sugerida.ts). `sugerida` la deja marcada y gana a la `recomendada` del registro; la persona
 * elige. Si alguien ya tocó una tarjeta, la sugerencia que llega tarde no le cambia la elección.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import CanvasAgentButton from "@/components/clients/CanvasAgentButton";
import { canonDelKickoff, canvasDefForSlug } from "@/lib/canvas/canvas-defs";
import { entregableDe, seccionesDeLaPlantilla, type PlantillaDeEntregable } from "@/lib/entregables/registro";
import { SECCIONES_SOLO_INTERNAS } from "@/lib/business-cases/section-briefs";

/** El rótulo de una sección en la lista: la portada se llama por lo que es. */
const ROTULO: Record<string, string> = { diagnostico: "Portada", planificacion: "Portada" };

/**
 * Lo que cambia por documento (la Planificación tiene dos plantillas desde el 2026-10-27, I2): el texto de arriba, a dónde
 * va «Escribirlo yo» y cómo se llama la corrida en el aviso.
 */
const POR_DOCUMENTO: Record<string, { titulo: string; bajada: string; ruta: string; corrida: string }> = {
  kickoff: {
    titulo: "Elige cómo armar el kickoff",
    bajada: "Los dos presentan el arranque al cliente; el de servicio recurrente cuenta cómo se trabaja cada ciclo.",
    ruta: "kickoff/plantilla",
    corrida: "kickoff",
  },
  diagnosis: {
    titulo: "Elige cómo armar el diagnóstico",
    bajada: "Los dos le explican al cliente por qué tiene los resultados que tiene y qué vamos a hacer.",
    ruta: "diagnostico/plantilla",
    corrida: "diagnóstico",
  },
  planning: {
    titulo: "Elige cómo armar la planificación",
    bajada: "Las dos dicen lo que va a quedar configurado en HubSpot; la esencial deja lo justo para configurar el portal.",
    ruta: "planificacion/plantilla",
    corrida: "planificación",
  },
};

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

/** Una plantilla con su descripción y sus secciones. La misma al generar un entregable y al crear un artefacto. */
export function TarjetaDePlantilla({
  plantilla: p,
  secciones,
  activa,
  distintivo,
  onElegir,
  onKeyDown,
  enfocable,
}: {
  plantilla: Pick<PlantillaDeEntregable, "nombre" | "paraQue">;
  secciones: ReadonlyArray<{ key: string; nombre: string }>;
  activa: boolean;
  distintivo?: string | null;
  onElegir: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** Se llega con Tab aunque no esté elegida: quien no tiene flechas entre tarjetas. */
  enfocable?: boolean;
}) {
  return (
    <div
      role="radio"
      aria-checked={activa}
      tabIndex={activa || enfocable ? 0 : -1}
      onClick={onElegir}
      onKeyDown={onKeyDown}
      className={cn(
        "relative flex cursor-pointer flex-col gap-4 rounded-lg border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        activa ? "border-brand bg-surface-muted ring-1 ring-brand" : "border-line bg-surface hover:bg-surface-hover",
      )}
    >
      <span aria-hidden className={cn("absolute right-4 top-4 flex h-4 w-4 items-center justify-center rounded-full border", activa ? "border-brand" : "border-line")}>
        {activa && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      <div className="flex justify-center">
        <Dibujo secciones={secciones.length} />
      </div>
      <div className="space-y-1 text-center">
        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-fg">
          {p.nombre}
          {distintivo && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">{distintivo}</span>}
        </p>
        <p className="text-xs text-fg-secondary">{p.paraQue}</p>
      </div>
      <div>
        <p className={ROTULO_DEL_SISTEMA}>Secciones · {secciones.length}</p>
        <ol className="mt-2 divide-y divide-line rounded-md border border-line bg-surface">
          {secciones.map((s, i) => (
            <li key={s.key} className="flex items-baseline gap-3 px-3 py-1.5 text-xs">
              <span className="w-4 shrink-0 text-right tabular-nums text-fg-muted">{i + 1}</span>
              <span className="text-fg">{s.nombre}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function ElegirPlantilla({
  slug,
  clientId,
  projectId,
  canvasId,
  agentId,
  onGenerado,
  sugerida,
  traerBrief,
  briefTraido,
  quitarBrief,
  soloPlantilla,
}: {
  slug: string;
  clientId: string;
  projectId: string;
  canvasId: string;
  agentId: string;
  onGenerado?: () => void;
  /** La plantilla que sugiere Nexus para este proyecto y por qué. Sin ella, la `recomendada` del registro. */
  sugerida?: { plantilla: string; razon: string } | null;
  /** La Planificación (2026-10-29): traer el Brief ANTES de generar, que es cuando más le sirve al agente. */
  traerBrief?: (url: string, confirmado?: boolean) => Promise<{ ok: boolean; error?: string; confirmar?: boolean }>;
  /** El título de la hoja ya traída, o null. */
  briefTraido?: string | null;
  /** Quitar la hoja traída: antes de generar es la única salida si no era la de este cliente. */
  quitarBrief?: () => Promise<void>;
  /** La única plantilla que le toca a este proyecto: se muestra sola. */
  soloPlantilla?: string | null;
}) {
  const todas: readonly PlantillaDeEntregable[] = entregableDe(slug)?.plantillas ?? [];
  const plantillas = soloPlantilla ? todas.filter((p) => p.id === soloPlantilla) : todas;
  const textos = POR_DOCUMENTO[slug] ?? POR_DOCUMENTO.diagnosis;
  const canon = canvasDefForSlug(slug)?.sections ?? [];
  const [elegida, setElegida] = useState<string>(() => (plantillas.find((p) => p.recomendada) ?? plantillas[0])?.id ?? "");
  const [abriendo, setAbriendo] = useState(false);
  const [enlace, setEnlace] = useState("");
  const [trayendo, setTrayendo] = useState(false);
  // La hoja no nombra al cliente: la pregunta se queda a la vista hasta que alguien conteste (no un aviso que se va).
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);
  const toast = useToast();
  // La sugerencia llega por red: marca la tarjeta solo si nadie eligió todavía.
  const tocada = useRef(false);
  const idSugerida = sugerida && plantillas.some((p) => p.id === sugerida.plantilla) ? sugerida.plantilla : null;
  useEffect(() => {
    if (idSugerida && !tocada.current) setElegida(idSugerida);
  }, [idSugerida]);
  const elegir = (id: string) => {
    tocada.current = true;
    setElegida(id);
  };
  if ((plantillas.length < 2 && !soloPlantilla) || !POR_DOCUMENTO[slug]) return null;

  const escribirloYo = async () => {
    setAbriendo(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/${textos.ruta}`, {
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

  const pedirBrief = async (confirmado?: boolean) => {
    if (!traerBrief || !enlace.trim()) return;
    setTrayendo(true);
    try {
      const r = await traerBrief(enlace.trim(), confirmado);
      if (r.ok) {
        setEnlace("");
        setPorConfirmar(null);
      } else if (r.confirmar) setPorConfirmar(r.error ?? "La hoja no nombra a este cliente. ¿Es la de este cliente?");
      else toast.error(r.error ?? "No se pudo traer la hoja.");
    } finally {
      setTrayendo(false);
    }
  };

  const alTeclado = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      elegir(id);
    }
  };

  return (
    <section className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 py-6">
      <div className="space-y-1">
        <p className={ROTULO_DEL_SISTEMA}>Antes de generar</p>
        <h2 className="text-sm font-semibold text-fg">{textos.titulo}</h2>
        <p className="text-xs text-fg-muted">
          {soloPlantilla ? "Este proyecto es un servicio por ciclos: lleva el kickoff del servicio." : textos.bajada} Después puedes ocultar, mover o quitar cualquier parte.
        </p>
        {idSugerida && sugerida && <p className="text-xs text-fg-secondary">Nexus sugiere la {plantillas.find((p) => p.id === idSugerida)?.nombre}. {sugerida.razon}</p>}
      </div>

      {traerBrief && (
        <div className="space-y-1 rounded-lg border border-line bg-surface p-3">
          {briefTraido ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs text-fg-secondary">Brief traído: «{briefTraido}». La IA lo lee al generar y el cliente no lo ve.</p>
              {quitarBrief && <BotonBlanco onClick={() => void quitarBrief()}>Quitar</BotonBlanco>}
            </div>
          ) : (
            <>
              <p className="text-xs text-fg-secondary">¿Este cliente ya tiene su Brief de implementación lleno? Tráelo antes de generar: la IA lo lee y el cliente no lo ve.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="url"
                  aria-label="Enlace de la hoja del Brief"
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={enlace}
                  onChange={(e) => {
                    setEnlace(e.target.value);
                    setPorConfirmar(null);
                  }}
                  className="min-w-0 flex-1"
                />
                <BotonBlanco onClick={() => void pedirBrief()} disabled={trayendo || !enlace.trim()}>
                  {trayendo ? "Trayendo…" : "Traer el Brief"}
                </BotonBlanco>
              </div>
              {porConfirmar && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-xs text-fg-secondary">{porConfirmar}</p>
                  <BotonBlanco onClick={() => void pedirBrief(true)} disabled={trayendo}>Sí, es de este cliente</BotonBlanco>
                  <BotonBlanco onClick={() => setPorConfirmar(null)}>No</BotonBlanco>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div role="radiogroup" aria-label="Plantillas del documento" className="grid gap-4 sm:grid-cols-2">
        {plantillas.map((p) => {
          // Lo solo interno (el Brief traído de la hoja) no es parte de lo que se elige.
          const secciones = (slug === "kickoff" ? canonDelKickoff(p.secciones) : seccionesDeLaPlantilla(p, canon)).filter((s) => !SECCIONES_SOLO_INTERNAS.has(s.key));
          return (
            <TarjetaDePlantilla
              key={p.id}
              plantilla={p}
              secciones={secciones.map((x) => ({ key: x.key, nombre: ROTULO[x.key] ?? x.label }))}
              activa={p.id === elegida}
              distintivo={(idSugerida ? p.id === idSugerida : p.recomendada) ? (idSugerida ? "Sugerida" : "Recomendada") : null}
              onElegir={() => elegir(p.id)}
              onKeyDown={(e) => alTeclado(e, p.id)}
            />
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
          notifyLabel={textos.corrida}
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

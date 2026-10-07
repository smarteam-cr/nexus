"use client";

/**
 * components/clients/EncuestaDeEtapa.tsx — la ÚNICA puerta por la que Nexus escribe la etapa de un
 * proyecto en HubSpot (2026-10-07).
 *
 * Elías: «Para escribir en HS debe salir un pop-up, como si fuese una encuesta. Y el CSE debe
 * aprobarlo.» Una pregunta —«¿En qué etapa está el proyecto?»— con una respuesta por etapa del
 * tablero, escritas como respuestas («Sigue en Handoff», «Pasó a Diagnóstico»). Si una reunión dejó
 * una sugerencia, arriba va de dónde salió (la reunión y la frase, tal cual) y esa respuesta viene
 * marcada con la chispa; nada se escribe hasta que el CSE la elige y aprieta el botón.
 *
 * Escribe por `estado-hubspot` (relee HubSpot en vivo, devuelve 409 si alguien la movió allá) y
 * anuncia lo que VOLVIÓ del espejo, no lo que se pidió. «Sigue en …» con una sugerencia la descarta
 * (DELETE `etapa-sugerida`) sin tocar HubSpot.
 */
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonBlanco, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import type { EtapaEnHubspot } from "@/lib/projects/etapa-sugerida";

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" });
}

export default function EncuestaDeEtapa({
  projectId,
  proyecto,
  etapa,
  abierta,
  puedeResponder,
  onCerrar,
  onCambio,
}: {
  projectId: string;
  proyecto: string;
  etapa: EtapaEnHubspot;
  abierta: boolean;
  /** `proyectos.cambiarEstadoHubspot`: lo aprueba el CSE (y el CSL y dirección). */
  puedeResponder: boolean;
  onCerrar: () => void;
  /** Después de escribir (o de un 409): la ficha vuelve a leer la etapa. */
  onCambio: () => void;
}) {
  const toast = useToast();
  const { sugerencia, actualStageId, actualLabel, opciones } = etapa;
  const inicial = sugerencia?.stageId ?? actualStageId ?? null;
  const [elegida, setElegida] = useState<string | null>(inicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada vez que se abre, vuelve a la respuesta sugerida (o a la de hoy).
  useEffect(() => {
    if (!abierta) return;
    setElegida(inicial);
    setError(null);
  }, [abierta, inicial]);

  const indiceActual = opciones.findIndex((o) => o.id === actualStageId);
  const indiceElegida = opciones.findIndex((o) => o.id === elegida);
  const salto = indiceActual >= 0 && indiceElegida >= 0 ? indiceElegida - indiceActual : null;
  const eligioLaDeHoy = !!elegida && elegida === actualStageId;
  const elegidaLabel = opciones.find((o) => o.id === elegida)?.label ?? null;

  async function mover() {
    if (!elegida || eligioLaDeHoy) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/estado-hubspot`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapaStageId: elegida, visto: { etapaStageId: actualStageId } }),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string; etapaLabel?: string | null };
      if (!res.ok) {
        setError(r.error ?? `No se pudo mover la etapa (${res.status}).`);
        if (res.status === 409) onCambio();
        return;
      }
      toast.success(`Quedó en ${r.etapaLabel ?? elegidaLabel ?? "la etapa elegida"} en HubSpot.`);
      onCambio();
      onCerrar();
    } catch {
      setError("No se pudo conectar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setEnviando(false);
    }
  }

  async function seguirEnLaDeHoy() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/etapa-sugerida`, { method: "DELETE" });
      if (!res.ok) {
        const r = (await res.json().catch(() => ({}))) as { error?: string };
        setError(r.error ?? `No se pudo guardar tu respuesta (${res.status}).`);
        return;
      }
      toast.success(`Listo: sigue en ${actualLabel ?? "la etapa de hoy"}.`);
      onCambio();
      onCerrar();
    } catch {
      setError("No se pudo conectar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setEnviando(false);
    }
  }

  const botonPrincipal = !puedeResponder ? null : eligioLaDeHoy ? (
    sugerencia ? (
      <BotonAzul onClick={() => void seguirEnLaDeHoy()} disabled={enviando}>
        {enviando ? "Guardando…" : `Responder: sigue en ${actualLabel ?? "la de hoy"}`}
      </BotonAzul>
    ) : (
      <BotonAzul onClick={() => undefined} disabled title="Elige otra etapa para moverla">
        Mover en HubSpot
      </BotonAzul>
    )
  ) : (
    <BotonAzul onClick={() => void mover()} disabled={enviando || !elegida}>
      {enviando ? "Moviendo…" : `Mover a ${elegidaLabel ?? "…"} en HubSpot`}
    </BotonAzul>
  );

  return (
    <Modal
      open={abierta}
      onClose={() => !enviando && onCerrar()}
      title="¿En qué etapa está el proyecto?"
      description={`«${proyecto}» · Lo que respondas se escribe en HubSpot y todo el equipo lo ve en el tablero.`}
      size="lg"
      footer={
        <>
          <BotonBlanco onClick={onCerrar} disabled={enviando}>
            {puedeResponder ? "Ahora no" : "Cerrar"}
          </BotonBlanco>
          {botonPrincipal}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {sugerencia && (
          <section className="flex flex-col gap-2 rounded-[10px] border border-info-line bg-info-surface px-3.5 py-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-brand">
              <IconoDeSugerencia className="h-4 w-4 flex-shrink-0" />
              Nexus cree que ya pasó a {sugerencia.hasta}
            </p>
            {sugerencia.reunion && (
              <p className="text-xs text-fg-secondary">
                Lo vio en la reunión «{sugerencia.reunion.titulo}»
                {fechaCorta(sugerencia.reunion.fecha) ? ` del ${fechaCorta(sugerencia.reunion.fecha)}` : ""}:
              </p>
            )}
            {sugerencia.cita && (
              <blockquote className="border-l-2 border-info-line pl-3 text-[13px] italic leading-[1.45] text-fg">
                «{sugerencia.cita}»
              </blockquote>
            )}
            {sugerencia.motivo && <p className="text-[13px] leading-[1.45] text-fg-secondary">{sugerencia.motivo}</p>}
          </section>
        )}

        <fieldset className="flex flex-col gap-1.5" disabled={!puedeResponder || enviando}>
          <legend className={cn(ROTULO_DEL_SISTEMA, "mb-1.5")}>Elige una respuesta</legend>
          {opciones.map((o) => {
            const esHoy = o.id === actualStageId;
            const esSugerida = o.id === sugerencia?.stageId;
            const activa = o.id === elegida;
            return (
              <label
                key={o.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  activa ? "border-brand bg-info-surface" : "border-line bg-surface hover:bg-surface-hover",
                  (!puedeResponder || enviando) && "cursor-default opacity-70",
                )}
              >
                <input
                  type="radio"
                  name="etapa-del-proyecto"
                  value={o.id}
                  checked={activa}
                  onChange={() => setElegida(o.id)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                <span className={cn("min-w-0 flex-1 text-sm", activa ? "font-semibold text-fg" : "text-fg-secondary")}>
                  {esHoy ? `Sigue en ${o.label}` : `Pasó a ${o.label}`}
                </span>
                {esHoy && (
                  <span className="rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11px] text-fg-muted">
                    Hoy en HubSpot
                  </span>
                )}
                {esSugerida && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-info-line bg-surface px-2 py-0.5 text-[11px] font-medium text-brand">
                    <IconoDeSugerencia className="h-3 w-3" />
                    Sugerida
                  </span>
                )}
              </label>
            );
          })}
          {!actualStageId && actualLabel && (
            <p className="text-xs text-fg-muted">Hoy en HubSpot: {actualLabel} (fuera de esta lista).</p>
          )}
        </fieldset>

        {puedeResponder && salto != null && (salto > 1 || salto < 0) && (
          <p className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-[13px] text-warn-ink">
            {salto > 1
              ? `Salta ${salto} etapas de una vez: revisa que de verdad se hicieron las del medio.`
              : `Vuelve ${-salto} ${salto === -1 ? "etapa" : "etapas"} atrás en el tablero.`}
          </p>
        )}

        {!puedeResponder && (
          <p className="text-[13px] text-fg-muted">Lo aprueba el CSE del proyecto: puedes verlo, pero no responderlo.</p>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-[13px] text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

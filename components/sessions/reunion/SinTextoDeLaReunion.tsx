"use client";

/**
 * SinTextoDeLaReunion — una reunión que terminó sin texto lo dice en la reunión misma (T4, 2026-10-25): por qué (el
 * motivo guardado, lib/sessions/motivo-sin-texto.ts), quién lo arregla y, para quien la organizó o estuvo, cómo evitarlo
 * la próxima vez. Y lo que se puede hacer ahora:
 *   · quien estuvo responde las preguntas de Nexus, armadas con las otras reuniones de la empresa (T9): lo que cuenta
 *     queda como el texto de la reunión, marcado «lo contó una persona», y se lee como cualquier otra;
 *   · subir el audio, si fue presencial y se grabó (T5, con la transcripción de audio prendida);
 *   · quien no estuvo, agregar lo que sabe con «Agregar lo que pasó».
 * Reemplaza el aviso «Terminó sin transcripción ni notas» de la lista de avisos. Solo tokens del tema.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { BotonAgregarReunion } from "@/components/sessions/AgregarReunion";
import { SubirAudio, type AudioVisto } from "@/components/sessions/SubirAudio";
import { fetchJson } from "@/lib/api/fetch-json";
import { problemaDeLasRespuestas, type PreguntaDeContexto } from "@/lib/sessions/preguntas-de-contexto";
import type { MotivoVistoEnLaReunion } from "@/lib/sessions/motivo-sin-texto";
import type { DuenoDelArreglo } from "@/lib/google/por-que-falta";

const QUIEN_LO_ARREGLA: Record<DuenoDelArreglo, string> = {
  google_workspace: "Lo arregla Google Meet: activar las notas y la transcripción",
  nexus: "Lo arregla Nexus: lo reintenta solo",
  persona: "Lo arregla quien la organiza",
  nada: "No hay nada que arreglar",
};

export function SinTextoDeLaReunion({
  sessionId,
  motivo,
  preguntas,
  cliente,
  audio,
}: {
  sessionId: string;
  motivo: MotivoVistoEnLaReunion;
  /** null = quien mira no estuvo en la reunión, o la reunión no tiene empresa: no se le pregunta. */
  preguntas: PreguntaDeContexto[] | null;
  cliente: { id: string; nombre: string } | null;
  /** null = la transcripción de audio está apagada en este servidor. */
  audio: { inicial: AudioVisto | null } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lista = (preguntas ?? []).map((p) => ({ pregunta: p.texto, respuesta: respuestas[p.id] ?? "" }));
  const problema = problemaDeLasRespuestas(lista, extra);

  async function guardar() {
    if (problema) {
      setError(problema);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await fetchJson<{ lectura?: { mensaje: string } }>(`/api/sessions/${encodeURIComponent(sessionId)}/contexto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuestas: lista, extra }),
      });
      toast.success(r.lectura?.mensaje ?? "Listo: lo que contaste quedó en la reunión.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section aria-label="Por qué no dejó texto" className="space-y-4 rounded-2xl border border-warn-line bg-warn-surface p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-warn-ink">Esta reunión no dejó texto</h2>
        <p className="text-[13px] leading-[19px] text-fg">{motivo.texto}</p>
        <p className="text-xs text-fg-muted">{QUIEN_LO_ARREGLA[motivo.dueno]}.</p>
      </div>

      {motivo.comoEvitarlo && (
        <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <p className="text-xs font-semibold text-fg-secondary">Para la próxima</p>
          <p className="text-[13px] leading-[19px] text-fg">{motivo.comoEvitarlo}</p>
        </div>
      )}

      {preguntas && preguntas.length > 0 && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-fg">Cuéntale a Nexus qué pasó</p>
              <p className="text-xs text-fg-muted">
                Estuviste en la reunión: responde {preguntas.length === 1 ? "esta pregunta" : `estas ${preguntas.length} preguntas`} y queda como el texto de la reunión, marcado «lo contó una
                persona». Nexus la lee como cualquier otra.
              </p>
            </div>
            {!abierto && (
              <Button variant="primary" size="sm" onClick={() => setAbierto(true)}>
                Responder
              </Button>
            )}
          </div>
          {abierto && (
            <div className="space-y-3">
              {preguntas.map((p) => (
                <Field key={p.id} label={p.texto} hint={p.porque ?? undefined}>
                  <Textarea rows={3} value={respuestas[p.id] ?? ""} onChange={(e) => setRespuestas((r) => ({ ...r, [p.id]: e.target.value }))} />
                </Field>
              ))}
              <Field label="Algo más que quieras contar" hint="Opcional: acuerdos, quién dijo qué, lo que preocupa al cliente.">
                <Textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} />
              </Field>
              {error && <Alert variant="danger">{error}</Alert>}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" loading={guardando} disabled={!!problema && !error} onClick={() => void guardar()}>
                  Guardar lo que pasó
                </Button>
                <Button variant="secondary" size="sm" disabled={guardando} onClick={() => setAbierto(false)}>
                  Ahora no
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {(audio || (!preguntas?.length && cliente)) && (
        <div className="flex flex-wrap items-start gap-4">
          {audio && (
            <div className="min-w-0 flex-[1_1_360px] space-y-1">
              <p className="text-xs font-semibold text-fg-secondary">¿Fue presencial y la grabaste?</p>
              <SubirAudio sessionId={sessionId} inicial={audio.inicial} />
            </div>
          )}
          {!preguntas?.length && cliente && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-fg-secondary">¿Sabes qué pasó?</p>
              <BotonAgregarReunion clienteFijo={cliente} etiqueta="+ Agregar lo que pasó" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

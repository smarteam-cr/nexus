"use client";

/**
 * components/escala/comentarios/ControlDeEstado.tsx — el estado de un comentario, para el
 * responsable de la escala. Nadie más lo ve (y la API lo vuelve a exigir).
 *
 * Pasar a «cambio pendiente» pide la fila de la tabla del manual: qué cambiaría, el caso que lo
 * originó y —obligatorio— qué decisión con el cliente cambiaría. Vienen propuestas desde el
 * comentario; el responsable las corrige.
 */
import { useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ESTADOS_DE_COMENTARIO, filaSugerida, type ComentarioVisto, type EstadoDeComentario } from "@/lib/escala/comentarios/reglas";
import type { NuevoEstado } from "./almacen";

const TONO: Record<EstadoDeComentario, string> = {
  abierto: "border-info-line bg-info-surface text-info-ink",
  respondido: "border-success-line bg-success-surface text-success-ink",
  cambio_pendiente: "border-warn-line bg-warn-surface text-warn-ink",
  descartado: "border-line bg-surface-hover text-fg-secondary",
};

export function EtiquetaDeEstado({ estado }: { estado: EstadoDeComentario }) {
  const e = ESTADOS_DE_COMENTARIO.find((x) => x.clave === estado);
  return <span className={cn("rounded-full border px-2 py-0.5 text-2xs font-semibold", TONO[estado])}>{e?.etiqueta ?? estado}</span>;
}

export default function ControlDeEstado({
  comentario,
  onGuardar,
}: {
  comentario: ComentarioVisto;
  onGuardar: (estado: NuevoEstado) => Promise<boolean>;
}) {
  const [elegido, setElegido] = useState<EstadoDeComentario | null>(null);
  const sugerida = filaSugerida(comentario);
  const [que, setQue] = useState(sugerida.que);
  const [caso, setCaso] = useState(sugerida.caso);
  const [decision, setDecision] = useState(sugerida.decision);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (estado: NuevoEstado) => {
    setGuardando(true);
    const ok = await onGuardar(estado);
    setGuardando(false);
    if (ok) {
      setElegido(null);
      setTexto("");
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-line px-3 py-2.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">Estado · solo tú lo cambias</p>
      <div role="group" aria-label="Cambiar el estado" className="flex flex-wrap gap-1.5">
        {ESTADOS_DE_COMENTARIO.map((e) => {
          const actual = comentario.estado === e.clave;
          const abierto = elegido === e.clave;
          return (
            <button
              key={e.clave}
              type="button"
              aria-pressed={actual || abierto}
              disabled={actual}
              onClick={() => setElegido(abierto ? null : e.clave)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                actual ? cn(TONO[e.clave], "font-semibold") : abierto ? "border-brand/40 bg-surface-hover text-fg" : "border-line text-fg-secondary hover:bg-surface-hover",
              )}
            >
              {e.etiqueta}
            </button>
          );
        })}
      </div>

      {elegido === "abierto" && (
        <div className="flex justify-end">
          <Button size="xs" variant="primary" loading={guardando} onClick={() => void guardar({ estado: "abierto" })}>
            Volver a abrirlo
          </Button>
        </div>
      )}

      {elegido === "respondido" && (
        <div className="space-y-1.5">
          <Textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Tu respuesta (opcional): queda en el hilo." aria-label="Respuesta" />
          <div className="flex justify-end">
            <Button size="xs" variant="primary" loading={guardando} onClick={() => void guardar({ estado: "respondido", respuesta: texto.trim() || null })}>
              Marcar como respondido
            </Button>
          </div>
        </div>
      )}

      {elegido === "cambio_pendiente" && (
        <div className="space-y-2 rounded-lg border border-warn-line bg-warn-surface px-3 py-2.5">
          <p className="text-xs font-semibold text-warn-ink">La fila para «Cambios pendientes» del manual</p>
          <label className="block text-2xs text-fg-secondary">
            Qué cambiaría
            <Textarea rows={2} value={que} onChange={(e) => setQue(e.target.value)} className="mt-0.5" />
          </label>
          <label className="block text-2xs text-fg-secondary">
            Caso que lo originó
            <Textarea rows={2} value={caso} onChange={(e) => setCaso(e.target.value)} className="mt-0.5" placeholder="Qué cliente y qué pasó" />
          </label>
          <label className="block text-2xs text-fg-secondary">
            Qué decisión cambiaría · obligatorio
            <Textarea rows={2} value={decision} onChange={(e) => setDecision(e.target.value)} className="mt-0.5" placeholder="Qué decisión con el cliente cambiaría" />
          </label>
          <p className="text-2xs text-fg-muted">La fecha y quién lo propone salen del comentario.</p>
          <div className="flex justify-end">
            <Button
              size="xs"
              variant="primary"
              loading={guardando}
              disabled={!que.trim() || !decision.trim()}
              onClick={() => void guardar({ estado: "cambio_pendiente", cambioQue: que.trim(), cambioCaso: caso.trim() || null, cambioDecision: decision.trim() })}
            >
              Pasar a cambio pendiente
            </Button>
          </div>
        </div>
      )}

      {elegido === "descartado" && (
        <div className="space-y-1.5">
          <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por qué se descarta (opcional)" aria-label="Motivo" />
          <div className="flex justify-end">
            <Button size="xs" variant="primary" loading={guardando} onClick={() => void guardar({ estado: "descartado", motivoDescarte: texto.trim() || null })}>
              Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

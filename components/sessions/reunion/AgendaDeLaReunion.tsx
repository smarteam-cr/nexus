"use client";

/**
 * AgendaDeLaReunion — lo que se iba a tratar en la reunión (ficha G, 2026-10-17): lo que escribió una persona, la
 * invitación del calendario y la próxima reunión que dejó planeada otra reunión con el mismo cliente. Cada parte dice
 * de dónde sale. Se puede escribir o corregir a mano (antes o después): lo escrito va primero. Las reglas:
 * lib/seguimiento/reunion/agenda.ts.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Textarea, useToast } from "@/components/ui";
import { BotonBlanco, BotonEnlace, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { MAX_AGENDA_ESCRITA, type AgendaDeLaReunion as Agenda } from "@/lib/seguimiento/reunion/agenda";

export function AgendaDeLaReunion({ sessionId, agenda, puedeEscribir }: { sessionId: string; agenda: Agenda; puedeEscribir: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(agenda.escrita);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/seguimiento`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agenda: texto }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        toast.error(d.error ?? "No se pudo guardar la agenda.");
        return;
      }
      setEditando(false);
      router.refresh();
    } catch {
      toast.error("No se pudo guardar la agenda: revisa la conexión.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section aria-label="Agenda de la reunión" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-[18px] py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">Agenda</h2>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">Lo que se iba a tratar. Sale de la invitación del calendario y de lo que escribas acá.</p>
        </div>
        {puedeEscribir && !editando && (
          <BotonEnlace onClick={() => setEditando(true)}>{agenda.escrita ? "Cambiar lo escrito" : "Escribir la agenda"}</BotonEnlace>
        )}
      </header>

      {editando ? (
        <div className="space-y-2.5 px-[18px] py-4">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={MAX_AGENDA_ESCRITA}
            rows={6}
            placeholder="Qué se iba a ver en la reunión, en una lista corta."
            aria-label="La agenda de la reunión"
            className="resize-y"
          />
          <div className="flex items-center gap-2">
            <BotonBlanco onClick={() => void guardar()} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </BotonBlanco>
            <BotonTexto
              onClick={() => {
                setTexto(agenda.escrita);
                setEditando(false);
              }}
              disabled={guardando}
            >
              Cancelar
            </BotonTexto>
            {agenda.escrita && <span className="text-xs text-fg-muted">Si la dejas vacía, vuelve a mandar la invitación.</span>}
          </div>
        </div>
      ) : agenda.partes.length === 0 ? (
        <p className="px-[18px] py-4 text-[13px] text-fg-muted">La invitación no traía agenda y nadie la escribió.</p>
      ) : (
        <ul className="divide-y divide-line">
          {agenda.partes.map((p) => (
            <li key={p.fuente} className="space-y-1 px-[18px] py-3.5">
              <p className={ROTULO_DEL_SISTEMA}>
                {p.deDonde}
                {p.reunion && (
                  <>
                    {" · "}
                    <Link href={`/sessions/${encodeURIComponent(p.reunion.id)}`} className="normal-case tracking-normal text-brand hover:text-brand-light">
                      {p.reunion.titulo}
                    </Link>
                  </>
                )}
              </p>
              <p className="whitespace-pre-wrap text-[13px] leading-[1.55] text-fg">{p.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

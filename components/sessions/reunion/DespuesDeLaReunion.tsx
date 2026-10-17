"use client";

/**
 * DespuesDeLaReunion — después de una reunión con un cliente (ficha G, 2026-10-17): el correo de seguimiento y la
 * próxima reunión sugerida.
 *
 *   · El correo es el mismo de las exploraciones: lo arma el agente a pedido (lo entendido, lo acordado, los próximos
 *     pasos y la próxima reunión) y lo revisa y lo manda una persona desde su correo. Nexus no envía nada.
 *   · La próxima reunión: título, objetivo, cuándo y cuánto dura, con el objetivo que sugirió el agente al armar el
 *     correo (o uno de Nexus). «Agendar en Google Calendar» abre el evento con todo lleno; la persona lo guarda y Google
 *     manda la invitación. Nexus no escribe en el calendario. Después: «Ya la agendé» o «No hace falta».
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog, Input, Select, Textarea, useToast } from "@/components/ui";
import { BotonBlanco, BotonEnlace, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { EditorDelCorreo } from "@/components/exploraciones/CorreoDeSeguimiento";
import { diaCortoCR } from "@/lib/seguimiento/reunion/agenda";
import {
  aHoraLocalCR,
  deHoraLocalCR,
  DURACIONES,
  enlaceParaAgendar,
  fechaYHoraCR,
  MAX_OBJETIVO_DE_LA_PROXIMA,
  MAX_TITULO_DE_LA_PROXIMA,
} from "@/lib/seguimiento/reunion/proxima";
import type { DespuesDeLaReunion as Despues } from "@/lib/seguimiento/reunion/pagina-server";

async function patch(sessionId: string, body: unknown): Promise<string | null> {
  try {
    const r = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/seguimiento`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) return null;
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    return d.error ?? "No se pudo guardar.";
  } catch {
    return "No se pudo guardar: revisa la conexión.";
  }
}

function CorreoDeLaReunion({ sessionId, despues, puedeEscribir }: { sessionId: string; despues: Despues; puedeEscribir: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [armando, setArmando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  // Por qué no se armó (la reunión no tiene la conversación): se dice ahí mismo, no en un aviso que se va.
  const [aviso, setAviso] = useState<string | null>(null);
  const correo = despues.correo;

  const armar = async () => {
    setConfirmar(false);
    setAviso(null);
    setArmando(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/correo`, { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        setAviso(d.error ?? "No se pudo armar el correo.");
        router.refresh();
        return;
      }
      if (!res.ok) {
        toast.error(d.error ?? "No se pudo armar el correo.");
        return;
      }
      router.refresh();
    } catch {
      toast.error("No se pudo armar el correo: revisa la conexión.");
    } finally {
      setArmando(false);
    }
  };

  return (
    <section aria-label="Correo de seguimiento" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-[18px] py-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-fg">Correo de seguimiento</h3>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            Lo que entendimos, lo acordado, los próximos pasos y la próxima reunión. Lo revisas y lo mandas tú desde tu correo: Nexus no envía nada.
          </p>
        </div>
        {correo && puedeEscribir && (
          <BotonEnlace disabled={armando} title="El agente lo vuelve a escribir con lo que hay hoy de la reunión." onClick={() => (correo.editado ? setConfirmar(true) : void armar())}>
            <span className="inline-flex items-center gap-1.5">
              <IconoDeSugerencia className="h-[13px] w-[13px]" />
              {armando ? "Regenerando…" : "Regenerar"}
            </span>
          </BotonEnlace>
        )}
      </header>
      {correo && armando && (
        <p role="status" className="border-b border-info-line bg-info-surface px-[18px] py-2 text-[12.5px] text-brand">
          Escribiendo el correo de nuevo: tarda unos segundos.
        </p>
      )}
      {correo ? (
        <EditorDelCorreo
          key={correo.corridaId}
          correo={correo}
          puedeEditar={puedeEscribir}
          guardar={async (c) => {
            const error = await patch(sessionId, { correo: c });
            if (error) toast.error(error);
            return !error;
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3 px-[18px] py-4">
          {aviso && (
            <p role="status" className="w-full rounded-lg border border-warn-line bg-warn-surface px-3.5 py-2.5 text-[13px] leading-[19px] text-warn-ink">
              {aviso}
            </p>
          )}
          <p className="min-w-0 flex-1 text-[13px] leading-[19px] text-fg-secondary">
            Lo escribe el agente con lo que se dijo en la reunión, su minuta y lo que ya se sabe de {despues.empresa}. De paso sugiere el objetivo de la próxima reunión.
          </p>
          {puedeEscribir && (
            <BotonBlanco disabled={armando} onClick={() => void armar()}>
              <span className="inline-flex items-center gap-1.5">
                <IconoDeSugerencia className="h-[14px] w-[14px] text-brand" />
                {armando ? "Escribiendo el correo…" : "Armar el correo"}
              </span>
            </BotonBlanco>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmar}
        onCancel={() => setConfirmar(false)}
        onConfirm={() => armar()}
        title="¿Regenerar el correo?"
        description="Lo cambiaste a mano: si el agente lo vuelve a escribir, tus cambios se pierden."
        confirmLabel="Regenerar"
        variant="default"
      />
    </section>
  );
}

const DE_DONDE: Record<Despues["proxima"]["deDonde"], string> = {
  agente: "Lo sugirió el agente al armar el correo",
  persona: "Con tus cambios",
  nexus: "Sugerida por Nexus. Arma el correo y el agente propone el objetivo con lo que se habló",
};

function ProximaReunion({ sessionId, despues, puedeEscribir }: { sessionId: string; despues: Despues; puedeEscribir: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const p = despues.proxima;
  const [titulo, setTitulo] = useState(p.titulo);
  const [objetivo, setObjetivo] = useState(p.objetivo);
  const [cuando, setCuando] = useState(aHoraLocalCR(p.inicio));
  const [duracion, setDuracion] = useState(p.duracionMin);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const inicio = deHoraLocalCR(cuando) ?? p.inicio;
  const enlace = enlaceParaAgendar({ titulo: titulo.trim() || p.titulo, objetivo, inicio, duracionMin: duracion, invitados: p.invitados });

  const guardar = async (cambio: Record<string, unknown>) => {
    setGuardando(true);
    const error = await patch(sessionId, { proxima: cambio });
    setGuardando(false);
    if (error) {
      toast.error(error);
      return false;
    }
    router.refresh();
    return true;
  };
  const datos = () => ({ titulo: titulo.trim(), objetivo: objetivo.trim(), inicio, duracionMin: duracion });

  return (
    <section aria-label="Próxima reunión sugerida" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-[18px] py-3.5">
        <h3 className="text-sm font-semibold text-fg">Próxima reunión</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">Se agenda en tu Google Calendar con todo lleno: tú la guardas y Google manda la invitación. Nexus no escribe en el calendario.</p>
      </header>

      {despues.siguiente && (
        <p className="border-b border-line bg-surface-muted px-[18px] py-2.5 text-xs text-fg-secondary">
          Ya hubo otra reunión con {despues.empresa} después de esta:{" "}
          <Link href={`/sessions/${encodeURIComponent(despues.siguiente.id)}`} className="text-brand hover:text-brand-light">
            {despues.siguiente.titulo}
          </Link>{" "}
          del {diaCortoCR(despues.siguiente.fecha)}.
        </p>
      )}

      {p.estado !== "pendiente" ? (
        <div className="flex flex-wrap items-center gap-3 px-[18px] py-4">
          <p className="min-w-0 flex-1 text-[13px] text-fg">
            {p.estado === "agendada" ? (
              <>
                Agendada para el <span className="font-semibold">{fechaYHoraCR(p.inicio)}</span>: {p.titulo}
              </>
            ) : (
              "No hace falta otra reunión por ahora."
            )}
            {p.decidida && (
              <span className="text-fg-muted">
                {" "}
                · {p.decidida.porNombre ?? "alguien del equipo"}, el {diaCortoCR(p.decidida.en)}
              </span>
            )}
          </p>
          {p.estado === "agendada" && (
            <a href={p.enlace} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand hover:text-brand-light">
              Abrir en Google Calendar ↗
            </a>
          )}
          {puedeEscribir && (
            <BotonTexto disabled={guardando} onClick={() => void guardar({ estado: null })}>
              {p.estado === "agendada" ? "Cambiar" : "Deshacer"}
            </BotonTexto>
          )}
        </div>
      ) : (
        <div className="space-y-3 px-[18px] py-4">
          <p className={`${ROTULO_DEL_SISTEMA} flex items-center gap-1.5`}>
            {p.deDonde === "agente" && <IconoDeSugerencia className="h-[13px] w-[13px] text-brand" />}
            {DE_DONDE[p.deDonde]}
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">Título</span>
            <Input
              value={titulo}
              maxLength={MAX_TITULO_DE_LA_PROXIMA}
              disabled={!puedeEscribir}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={() => titulo.trim() !== p.titulo && void guardar({ titulo: titulo.trim() })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">Objetivo · va en la invitación: lo lee el cliente</span>
            <Textarea
              value={objetivo}
              rows={3}
              maxLength={MAX_OBJETIVO_DE_LA_PROXIMA}
              disabled={!puedeEscribir}
              onChange={(e) => setObjetivo(e.target.value)}
              onBlur={() => objetivo.trim() !== p.objetivo && void guardar({ objetivo: objetivo.trim() })}
              className="resize-y"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">Cuándo (hora de Costa Rica)</span>
              <Input type="datetime-local" value={cuando} disabled={!puedeEscribir} onChange={(e) => setCuando(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">Cuánto dura</span>
              <Select value={String(duracion)} disabled={!puedeEscribir} onChange={(e) => setDuracion(Number(e.target.value))}>
                {DURACIONES.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <p className="text-xs text-fg-muted">
            {p.invitados.length
              ? `Invitados: ${p.invitados.join(", ")}.`
              : "Sin invitados de la reunión: agrégalos en Google Calendar."}
          </p>
          {puedeEscribir && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={enlace}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setAbierto(true)}
                className="rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
              >
                Agendar en Google Calendar ↗
              </a>
              {abierto ? (
                <>
                  <span className="text-xs text-fg-secondary">¿La guardaste en tu calendario?</span>
                  <BotonBlanco disabled={guardando} onClick={() => void guardar({ ...datos(), estado: "agendada" })}>
                    Ya la agendé
                  </BotonBlanco>
                  <BotonTexto disabled={guardando} onClick={() => setAbierto(false)}>
                    Todavía no
                  </BotonTexto>
                </>
              ) : (
                <BotonTexto disabled={guardando} onClick={() => void guardar({ estado: "descartada" })}>
                  No hace falta
                </BotonTexto>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function DespuesDeLaReunion({ sessionId, despues, puedeEscribir }: { sessionId: string; despues: Despues; puedeEscribir: boolean }) {
  return (
    <section aria-label="Después de la reunión" className="space-y-3">
      <h2 className="text-sm font-semibold text-fg">Después de la reunión</h2>
      <CorreoDeLaReunion sessionId={sessionId} despues={despues} puedeEscribir={puedeEscribir} />
      <ProximaReunion sessionId={sessionId} despues={despues} puedeEscribir={puedeEscribir} />
    </section>
  );
}

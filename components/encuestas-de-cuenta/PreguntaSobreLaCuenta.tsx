"use client";

/**
 * components/encuestas-de-cuenta/PreguntaSobreLaCuenta.tsx — la pregunta sobre la cuenta, al entrar a un cliente
 * (2026-10-13, pedido de Elías). Abajo a la derecha, como el pedido de opinión de Feedback, y nunca a la vez que él ni
 * con el panel de Feedback abierto; las otras preguntas del rincón van antes (components/ui/turno-de-tarjetas.ts). Qué
 * preguntar y cuándo lo decide el servidor (lib/encuestas-de-cuenta/servidor.ts): acá solo se pinta y se guarda lo que
 * pasó (mostrada · respondida · ahora_no).
 *
 * Dos tipos (2026-10-25): la de Sí o No de Customer Success y lo que falta de los datos de la empresa (R2 etapa 3), que
 * se responde con las opciones del dato y trae lo que Nexus propone ya elegido: la persona solo confirma o corrige.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Select } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { cn } from "@/lib/cn";
import { Z } from "@/lib/ui/z";
import { PRIORIDAD_DE_TARJETA, useTurnoDeTarjeta } from "@/components/ui/turno-de-tarjetas";
import type { PreguntaParaMostrar } from "@/lib/encuestas-de-cuenta/preguntas";
import { textoDeLaEscritura, type EstadoDeLaEscritura } from "@/lib/clients/escritura-en-hubspot";

/** Con más opciones que esto, se elige en una lista (la industria tiene 17). */
const MAX_BOTONES = 6;

/** No apura: la ficha termina de cargar antes de preguntar. */
const ESPERA_MS = 2500;

const ENTRE_PARENTESIS: Record<PreguntaParaMostrar["motivo"], string | null> = {
  nunca: null,
  "no-sabia": "La última vez respondiste «No sé». ¿Ya lo sabes?",
  despues: null,
  "version-nueva": "La pregunta cambió: vuelve a responderla.",
};

export default function PreguntaSobreLaCuenta({ clientId }: { clientId: string }) {
  const feedback = useFeedback();
  const [pregunta, setPregunta] = useState<PreguntaParaMostrar | null>(null);
  const [valor, setValor] = useState<string | null>(null);
  const [porQue, setPorQue] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [enHubspot, setEnHubspot] = useState<string | null>(null);
  const [yaEstaba, setYaEstaba] = useState(false);

  useEffect(() => {
    let vivo = true;
    /* eslint-disable react-hooks/set-state-in-effect -- otro cliente: se empieza de cero */
    setPregunta(null);
    setValor(null);
    setPorQue("");
    setListo(null);
    setError(null);
    setEnHubspot(null);
    setYaEstaba(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(() => {
      fetch(`/api/clients/${clientId}/preguntas-de-la-cuenta`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { pregunta?: PreguntaParaMostrar | null } | null) => {
          if (!vivo || !d?.pregunta) return;
          setPregunta(d.pregunta);
          // Lo que propone Nexus ya viene elegido: la persona solo confirma o corrige.
          if (d.pregunta.propuesta) setValor(d.pregunta.propuesta.valor);
        })
        .catch(() => {});
    }, ESPERA_MS);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [clientId]);

  const tapada = !!feedback?.abierto || !!feedback?.hayPedido;
  const toca = useTurnoDeTarjeta("cuenta", !!pregunta && !tapada, PRIORIDAD_DE_TARJETA.cuenta);

  // Cuántas veces se mostró, una por sesión del navegador: dice si la gente la ve y no la contesta.
  useEffect(() => {
    if (!pregunta || !toca) return;
    const clave = `nexus-pregunta-cuenta:${pregunta.clave}:${pregunta.version}:${clientId}`;
    try {
      if (sessionStorage.getItem(clave)) return;
      sessionStorage.setItem(clave, "1");
    } catch {
      /* sin storage: el servidor no repite una «mostrada» en 12 h */
    }
    void enviar(clientId, { clave: pregunta.clave, evento: "mostrada" });
  }, [pregunta, toca, clientId]);

  // Después de responder, se va sola.
  useEffect(() => {
    if (!listo) return;
    const t = setTimeout(() => setPregunta(null), 3000);
    return () => clearTimeout(t);
  }, [listo]);

  if (!pregunta || !toca || typeof document === "undefined") return null;

  const guardar = async () => {
    if (!valor) return;
    setGuardando(true);
    setError(null);
    const r = await enviar(clientId, {
      clave: pregunta.clave,
      evento: "respondida",
      valor,
      porQue: porQue.trim() || null,
      ruta: window.location.pathname,
    });
    setGuardando(false);
    if (r.ok) {
      setListo(valor);
      setEnHubspot(r.hubspot ? textoDeLaEscritura(r.hubspot) : null);
      setYaEstaba(!!r.yaEstaba);
    } else setError(r.error);
  };

  const ahoraNo = () => {
    void enviar(clientId, { clave: pregunta.clave, evento: "ahora_no" });
    setPregunta(null);
  };

  const aclaracion = ENTRE_PARENTESIS[pregunta.motivo];

  return createPortal(
    <section
      aria-label="Pregunta sobre el cliente"
      className="fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-32px)]"
      style={{ zIndex: Z.DRAWER }}
    >
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-left">
        <p className={ROTULO_DEL_SISTEMA}>Sobre {pregunta.cliente}</p>
        {listo ? (
          <p className="text-[13px] text-fg-secondary" role="status">
            {yaEstaba
              ? "Alguien ya lo había confirmado mientras tanto: queda como estaba. Tu respuesta quedó guardada."
              : listo === "no_se"
              ? `Listo. Te lo volvemos a preguntar en ${pregunta.tipo === "dato" ? "dos semanas" : "una semana"}.`
              : `Gracias. Queda guardado${pregunta.tipo === "dato" ? " en los datos de la empresa" : ""}.${enHubspot ? ` ${enHubspot}` : ""}`}
          </p>
        ) : (
          <>
            <p className="text-[14.5px] font-semibold leading-[21px] text-fg">{pregunta.pregunta}</p>
            <p className="text-xs text-fg-muted">{pregunta.descripcion}</p>
            {aclaracion && <p className="text-xs text-fg-secondary">{aclaracion}</p>}
            {pregunta.propuesta && (
              <p className="rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs text-fg-secondary">
                Nexus propone <span className="font-semibold text-fg">{pregunta.propuesta.rotulo}</span> (de {pregunta.propuesta.deDonde.toLowerCase()})
                {pregunta.propuesta.cita ? <span className="mt-0.5 block text-fg-muted">«{pregunta.propuesta.cita.slice(0, 200)}»</span> : null}
              </p>
            )}
            {pregunta.respuestas.length > MAX_BOTONES ? (
              <Select aria-label={pregunta.pregunta} value={valor ?? ""} onChange={(e) => setValor(e.target.value || null)} className="mt-1">
                <option value="">Elige una opción</option>
                {pregunta.respuestas.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.rotulo}
                  </option>
                ))}
              </Select>
            ) : (
              <div role="radiogroup" aria-label={pregunta.pregunta} className={cn("mt-1 gap-1.5", pregunta.respuestas.length > 3 ? "flex flex-col" : "flex")}>
                {pregunta.respuestas.map((r) => (
                  <button
                    key={r.valor}
                    type="button"
                    role="radio"
                    aria-checked={valor === r.valor}
                    onClick={() => setValor(r.valor)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-[7px] text-[13px] font-semibold transition-colors",
                      valor === r.valor
                        ? "border-brand bg-info-surface text-brand"
                        : "border-line bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg",
                    )}
                  >
                    {r.rotulo}
                  </button>
                ))}
              </div>
            )}
            {valor && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-fg-muted">¿Por qué? (opcional)</span>
                <textarea
                  value={porQue}
                  onChange={(e) => setPorQue(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder={valor === "no_se" ? "Qué te falta para saberlo" : "Lo que te lo dice"}
                  className="resize-none rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
                />
              </label>
            )}
            {error && <p className="text-xs text-danger-ink">{error}</p>}
            <div className="mt-1 flex items-center gap-1">
              <Button variant="primary" size="sm" onClick={guardar} disabled={!valor} loading={guardando}>
                Guardar
              </Button>
              <button type="button" onClick={ahoraNo} className="rounded px-2 py-[7px] text-[13px] text-fg-muted hover:text-fg">
                Ahora no
              </button>
            </div>
          </>
        )}
      </div>
    </section>,
    document.body,
  );
}

async function enviar(clientId: string, cuerpo: Record<string, unknown>): Promise<{ ok: true; hubspot?: EstadoDeLaEscritura; yaEstaba?: boolean } | { ok: false; error: string }> {
  try {
    const r = await fetch(`/api/clients/${clientId}/preguntas-de-la-cuenta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (r.ok) {
      const j = (await r.json().catch(() => null)) as { hubspot?: EstadoDeLaEscritura; yaEstaba?: boolean } | null;
      return { ok: true, hubspot: j?.hubspot, yaEstaba: j?.yaEstaba };
    }
    const j = await r.json().catch(() => null);
    return { ok: false, error: j?.error ?? "No se pudo guardar. Intenta de nuevo." };
  } catch {
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
}

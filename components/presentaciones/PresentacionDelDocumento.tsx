"use client";

/**
 * components/presentaciones/PresentacionDelDocumento.tsx — cuándo se le presenta este documento al cliente (2026-10-14).
 * Las reglas: lib/presentaciones/reglas.ts.
 *
 * Dos piezas, para el kickoff, el diagnóstico, la planificación y la entrega:
 *   · la LÍNEA arriba del documento (la ve todo el que lo abre): en qué está, quién respondió y cuándo, y la fecha que
 *     leyó Nexus en una reunión (solo el diagnóstico);
 *   · la TARJETA abajo a la derecha, que sale sola cuando hay que preguntar y la persona es de Customer Success (el
 *     encargado del proyecto, quien generó el documento o la CSL). No bloquea nada: «Ahora no» la calla unas horas y el
 *     pendiente sigue en «Para ti». Reemplaza al modal que se abría solo, también a dirección, hasta el 2026-10-14.
 *
 * Va fuera de `.stl`: es del equipo, no de lo que ve el cliente.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { PRIORIDAD_DE_TARJETA, useTurnoDeTarjeta } from "@/components/ui/turno-de-tarjetas";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { mostrarPreguntaDeTiempo } from "@/components/tiempos/PreguntasFlotantes";
import { cn } from "@/lib/cn";
import { Z } from "@/lib/ui/z";
import { fechaEnPalabras } from "@/lib/canvas/presentacion-del-diagnostico";
import {
  elDocumento,
  lineaDelEstado,
  loDocumento,
  nombreDelDocumento,
  preguntaDelEstado,
  type AccionDePresentacion,
  type Documento,
  type EstadoDeLaPresentacion,
  type MotivoParaResponder,
} from "@/lib/presentaciones/reglas";
import type { VistaDeLaPresentacion } from "@/lib/presentaciones/servidor";
import type { PreguntaParaResponder } from "@/lib/tiempos/tipos";

type Opcion = "fecha" | "sin-fecha" | "presentado" | "listo";

const POR_QUE_TE_TOCA: Record<MotivoParaResponder, string> = {
  encargado: "quien lleva el proyecto en HubSpot",
  genero: "quien generó el documento",
  lider: "líder de Customer Success",
};

interface Respuesta {
  vista?: VistaDeLaPresentacion;
  aviso?: { avisado: boolean; vendedor: string | null; motivo: string | null } | null;
  preguntaDeTiempo?: PreguntaParaResponder | null;
  error?: string;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «9 oct», en la hora de Costa Rica (UTC-6) y armada a mano: así servidor y navegador dicen lo mismo. */
function diaCorto(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}
function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number);
  return m && d ? `${d} ${MESES[m - 1]}` : fecha;
}

/** Las respuestas que se ofrecen en cada estado, en el orden en que se leen. */
function opcionesDe(estado: EstadoDeLaPresentacion, documento: Documento): { clave: Opcion; rotulo: string }[] {
  const lo = loDocumento(documento);
  switch (estado) {
    case "por-reconfirmar":
      return [
        { clave: "listo", rotulo: "Está listo" },
        { clave: "fecha", rotulo: "Cambió la fecha" },
        { clave: "presentado", rotulo: `Ya ${lo} presenté` },
      ];
    case "paso-la-fecha":
      return [
        { clave: "presentado", rotulo: `Sí, ya ${lo} presenté` },
        { clave: "fecha", rotulo: "Se movió" },
        { clave: "sin-fecha", rotulo: "Todavía no sé" },
      ];
    case "presentado":
      return [
        { clave: "presentado", rotulo: "Corregir el día" },
        { clave: "fecha", rotulo: "Se presenta de nuevo" },
      ];
    default:
      return [
        { clave: "fecha", rotulo: "Tengo la fecha" },
        { clave: "sin-fecha", rotulo: "Todavía no sé" },
        { clave: "presentado", rotulo: `Ya ${lo} presenté` },
      ];
  }
}

/** ¿Con `?presentacion=responder` en la dirección? Lo pone el enlace de «Para ti»: la tarjeta sale aunque se haya dicho «Ahora no». */
function pedidaPorLaDireccion(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("presentacion") === "responder";
  } catch {
    return false;
  }
}

export default function PresentacionDelDocumento({ projectId, documento }: { projectId: string; documento: Documento }) {
  const toast = useToast();
  const feedback = useFeedback();
  const [vista, setVista] = useState<VistaDeLaPresentacion | null>(null);
  const [sinTabla, setSinTabla] = useState<string | null>(null);
  /** La tarjeta abierta con el botón (o por la dirección): sale aunque no le toque sola. */
  const [aMano, setAMano] = useState(false);
  /** Se respondió o se cerró en esta visita: no vuelve a salir sola. */
  const [cerrada, setCerrada] = useState(false);
  const [opcion, setOpcion] = useState<Opcion | null>(null);
  const [dia, setDia] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/presentaciones/${documento}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as Respuesta | null;
        if (!vivo) return;
        if (r.status === 503) setSinTabla(j?.error ?? "La fecha de presentación todavía no está disponible.");
        else if (r.ok && j?.vista) {
          setVista(j.vista);
          if (j.vista.tuMotivo && pedidaPorLaDireccion()) setAMano(true);
        }
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId, documento]);

  const tapada = !!feedback?.abierto || !!feedback?.hayPedido;
  const sola = !!vista && vista.pide && !!vista.tuMotivo && !vista.dijisteAhoraNo && !cerrada;
  const quiere = !!vista && !!vista.tuMotivo && (aMano || sola) && !tapada;
  const toca = useTurnoDeTarjeta(`presentacion:${projectId}:${documento}`, quiere, PRIORIDAD_DE_TARJETA.presentacion);

  const opciones = useMemo(() => (vista ? opcionesDe(vista.estado, documento) : []), [vista, documento]);

  /** La fecha que se propone al elegir una respuesta. */
  const diaPara = useCallback(
    (o: Opcion): string => {
      if (!vista) return "";
      const p = vista.presentacion;
      if (o === "presentado") return p.presentado?.fecha ?? (p.fecha && p.fecha <= vista.hoy ? p.fecha : vista.hoy);
      if (o === "listo") return p.fecha ?? "";
      if (o === "fecha") return p.propuesta?.fecha ?? (p.fecha && p.fecha >= vista.hoy ? p.fecha : "");
      return "";
    },
    [vista],
  );

  const elegir = (o: Opcion) => {
    setOpcion(o);
    setDia(diaPara(o));
    setError(null);
  };

  const cerrar = () => {
    setAMano(false);
    setCerrada(true);
    setOpcion(null);
    setError(null);
  };

  const pedir = async (cuerpo: AccionDePresentacion): Promise<Respuesta | null> => {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/presentaciones/${documento}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = (await r.json().catch(() => null)) as Respuesta | null;
      if (!r.ok || !j?.vista) {
        setError(j?.error ?? `No se pudo guardar (${r.status}). Vuelve a intentarlo.`);
        return null;
      }
      setVista(j.vista);
      return j;
    } catch {
      setError("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async () => {
    if (!opcion || (opcion !== "sin-fecha" && !dia)) return;
    const usaLaPropuesta = opcion === "fecha" && vista?.presentacion.propuesta?.fecha === dia;
    const cuerpo: AccionDePresentacion =
      opcion === "sin-fecha" ? { accion: "sin-fecha" } : usaLaPropuesta ? { accion: "usar-propuesta" } : { accion: opcion, fecha: dia };
    const j = await pedir(cuerpo);
    if (!j) return;
    cerrar();
    if (opcion === "sin-fecha") toast.info("Listo. Te lo volvemos a preguntar en una semana.");
    else if (opcion === "presentado") toast.success(`Quedó: se presentó el ${fechaEnPalabras(dia)}.`);
    else if (opcion === "listo") {
      if (j.aviso?.avisado) toast.success(`Listo. Le avisamos a ${j.aviso.vendedor ?? "el vendedor"} para que lo revise antes del ${fechaEnPalabras(dia)}.`);
      else toast.info(`Quedó listo para el ${fechaEnPalabras(dia)}. ${j.aviso?.motivo ?? ""}`.trim());
    } else toast.success(`Quedó: se presenta el ${fechaEnPalabras(dia)}.`);
    mostrarPreguntaDeTiempo(j.preguntaDeTiempo);
  };

  const ahoraNo = () => {
    if (!aMano) void pedir({ accion: "ahora-no" });
    cerrar();
  };

  if (sinTabla) {
    return <div className="mx-4 mt-3 rounded-xl border border-warn-line bg-warn-surface px-4 py-2.5 text-xs text-warn-ink">{sinTabla}</div>;
  }
  if (!vista || !vista.hayContenido) return null;

  const { presentacion: p, estado, tuMotivo } = vista;
  // El diagnóstico marcado «Presentado» en su estado: la franja de su estado ya lo dice todo.
  const presentadoFormal = estado === "presentado" && !p.presentado;
  if (presentadoFormal) return null;
  // Un documento viejo que nadie respondió no pide nada: no hay qué decir (ya se habrá presentado).
  if (estado === "sin-responder" && !vista.pide && !aMano) return null;
  const propuesta = p.propuesta && p.propuesta.fecha !== p.fecha && estado !== "presentado" ? p.propuesta : null;
  const nombre = (email: string) => vista.nombres[email] ?? vista.responden.find((r) => r.email === email)?.nombre ?? email;
  const quienes = vista.responden.map((r) => r.nombre).join(" o ");
  const pide = vista.pide;

  const quien = p.ultima
    ? `Respondió ${nombre(p.ultima.por)}, el ${diaCorto(p.ultima.en)}.`
    : quienes
      ? `Lo responde ${quienes}.`
      : "";

  const tarjeta =
    toca && typeof document !== "undefined"
      ? createPortal(
          <section
            aria-label={`Cuándo se presenta ${elDocumento(documento)}`}
            className="fixed bottom-6 right-6 w-[400px] max-w-[calc(100vw-32px)]"
            style={{ zIndex: Z.DRAWER }}
          >
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-left">
              <p className={ROTULO_DEL_SISTEMA}>
                {nombreDelDocumento(documento)} · {vista.empresa}
              </p>
              <p className="text-[14.5px] font-semibold leading-[21px] text-fg">{preguntaDelEstado(estado, p, documento)}</p>
              {tuMotivo && (
                <p className="text-xs text-fg-muted">
                  Te lo preguntamos porque eres {POR_QUE_TE_TOCA[tuMotivo]}.
                </p>
              )}
              {propuesta && (
                <div className="flex items-start gap-2 rounded-[10px] border border-info-line bg-info-surface px-3 py-2">
                  <IconoDeSugerencia className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />
                  <div className="min-w-0 flex-1 text-xs text-fg-secondary">
                    <span className="font-semibold text-brand">Nexus leyó el {fechaEnPalabras(propuesta.fecha)}</span> en «
                    {propuesta.reunion.titulo ?? "una reunión"}»:
                    <span className="mt-0.5 block italic text-fg">«{propuesta.cita}»</span>
                    <button
                      type="button"
                      onClick={() => {
                        setOpcion("fecha");
                        setDia(propuesta.fecha);
                        setError(null);
                      }}
                      className="mt-1 text-xs font-semibold text-brand hover:text-brand-light"
                    >
                      Usar esa fecha
                    </button>
                  </div>
                </div>
              )}
              <div role="radiogroup" aria-label={preguntaDelEstado(estado, p, documento)} className="mt-1 flex flex-wrap gap-1.5">
                {opciones.map((o) => (
                  <button
                    key={o.clave}
                    type="button"
                    role="radio"
                    aria-checked={opcion === o.clave}
                    onClick={() => elegir(o.clave)}
                    className={cn(
                      "flex-1 whitespace-nowrap rounded-lg border px-3 py-[7px] text-[13px] font-semibold transition-colors",
                      opcion === o.clave
                        ? "border-brand bg-info-surface text-brand"
                        : "border-line bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg",
                    )}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
              {opcion && opcion !== "sin-fecha" && (
                <label className="flex flex-col gap-1 text-xs text-fg-muted">
                  {opcion === "presentado" ? "El día que se presentó" : opcion === "listo" ? "Se presenta el" : "El día de la presentación"}
                  <input
                    type="date"
                    value={dia}
                    min={opcion === "presentado" ? undefined : vista.hoy}
                    max={opcion === "presentado" ? vista.hoy : undefined}
                    onChange={(e) => setDia(e.target.value)}
                    className="w-48 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-fg focus:border-brand focus:outline-none"
                  />
                </label>
              )}
              {opcion === "listo" && (
                <p className="text-xs text-fg-muted">Le avisamos al vendedor de la empresa en HubSpot para que lo revise antes de la presentación.</p>
              )}
              {opcion === "presentado" && documento === "diagnostico" && (
                <p className="text-xs text-fg-muted">
                  Para guardar la versión que vio el cliente, usa también «Presentar al cliente», en el estado del documento.
                </p>
              )}
              {error && <p className="text-xs text-danger-ink">{error}</p>}
              <div className="mt-1 flex items-center gap-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void guardar()}
                  disabled={!opcion || (opcion !== "sin-fecha" && !dia)}
                  loading={ocupado}
                >
                  Guardar
                </Button>
                <button type="button" onClick={ahoraNo} className="rounded px-2 py-[7px] text-[13px] text-fg-muted hover:text-fg">
                  {aMano ? "Cancelar" : "Ahora no"}
                </button>
              </div>
            </div>
          </section>,
          document.body,
        )
      : null;

  const abrirAMano = () => {
    setAMano(true);
    setCerrada(false);
    setOpcion(null);
    setError(null);
  };

  return (
    <>
      <div className={cn("mx-4 mt-3 rounded-xl border px-4 py-2.5", pide ? "border-warn-line bg-warn-surface" : "border-line bg-surface")}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Presentación</span>
          <span className="min-w-[200px] flex-1 text-xs text-fg-secondary">
            {lineaDelEstado(estado, p, documento)}
            {quien && <span className="text-fg-muted"> {quien}</span>}
          </span>
          {tuMotivo &&
            (pide ? (
              <BotonBlanco onClick={abrirAMano}>Responder</BotonBlanco>
            ) : (
              <BotonTexto onClick={abrirAMano}>Cambiar</BotonTexto>
            ))}
        </div>
        {estado === "presentado" && documento === "diagnostico" && (
          <p className="mt-1 text-xs text-fg-muted">Para guardar la versión que vio el cliente, usa «Presentar al cliente», en el estado del documento.</p>
        )}
        {propuesta && (
          <div className="mt-2 flex flex-wrap items-start gap-2.5 rounded-[10px] border border-info-line bg-info-surface px-3 py-2">
            <IconoDeSugerencia className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />
            <div className="min-w-0 flex-1 text-xs text-fg-secondary">
              <span className="font-semibold text-brand">Nexus leyó que se presenta el {fechaEnPalabras(propuesta.fecha)}</span>
              {" · "}en «{propuesta.reunion.titulo ?? "una reunión"}» del {fechaCorta(propuesta.reunion.fecha)}:
              <span className="mt-0.5 block italic text-fg">«{propuesta.cita}»</span>
            </div>
            {tuMotivo && (
              <div className="flex gap-2">
                <BotonTexto onClick={() => void pedir({ accion: "descartar-propuesta" })} disabled={ocupado}>
                  Descartar
                </BotonTexto>
                <BotonAzul
                  onClick={() =>
                    void pedir({ accion: "usar-propuesta" }).then((j) => {
                      if (j) toast.success(`Quedó: se presenta el ${fechaEnPalabras(propuesta.fecha)}.`);
                    })
                  }
                  disabled={ocupado}
                >
                  Usar
                </BotonAzul>
              </div>
            )}
          </div>
        )}
        {error && !toca && <p className="mt-2 text-xs text-danger-ink">{error}</p>}
      </div>
      {tarjeta}
    </>
  );
}

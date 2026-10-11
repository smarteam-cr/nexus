"use client";

/**
 * components/canvas/PresentacionDelDiagnostico.tsx — cuándo se le presenta el diagnóstico al cliente
 * (2026-10-07). Las reglas: lib/canvas/presentacion-del-diagnostico.ts.
 *
 * Elías: al generar un diagnóstico, Nexus pregunta cuándo se planea presentar; si una reunión lo dice,
 * Nexus lo propone y la persona lo usa o lo cambia; cuando se acerca, la persona confirma que está
 * terminado y reconfirma la fecha, y le llega un aviso al vendedor dueño de la empresa en HubSpot.
 *
 * Una franja sobre el documento (fuera de `.stl`: es del equipo) y la encuesta en un modal. La
 * encuesta se abre sola una vez por sesión del navegador cuando hace falta una respuesta: con el
 * diagnóstico recién generado y sin fecha, y cuando llega el momento de reconfirmar.
 */
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import {
  fechaEnPalabras,
  type EstadoDeLaPresentacion,
  type PresentacionDelDiagnostico as Presentacion,
} from "@/lib/canvas/presentacion-del-diagnostico";

interface Respuesta {
  presentacion: Presentacion;
  estado: EstadoDeLaPresentacion;
  hoy: string;
  puedeCambiar: boolean;
  aviso?: { avisado: boolean; vendedor: string | null; motivo: string | null } | null;
  error?: string;
}

type Modo = "fecha" | "listo";

function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  if (!a || !m || !d) return fecha;
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Una vez por sesión del navegador: la encuesta no persigue a nadie en cada recarga. */
function yaSePregunto(clave: string): boolean {
  try {
    return sessionStorage.getItem(clave) === "1";
  } catch {
    return false;
  }
}
function marcarPreguntado(clave: string): void {
  try {
    sessionStorage.setItem(clave, "1");
  } catch {
    /* sin almacenamiento: se vuelve a preguntar, y está bien */
  }
}

export default function PresentacionDelDiagnostico({
  projectId,
  hayContenido,
}: {
  projectId: string;
  /** El diagnóstico ya se generó: antes no hay nada que presentar. */
  hayContenido: boolean;
}) {
  const toast = useToast();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [sinTabla, setSinTabla] = useState(false);
  const [modo, setModo] = useState<Modo | null>(null);
  const [dia, setDia] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/presentacion-del-diagnostico`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as Respuesta | null;
        if (!vivo) return;
        if (r.status === 503) setSinTabla(true);
        else if (r.ok && j) setDatos(j);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId]);

  const abrir = useCallback(
    (m: Modo) => {
      const p = datos?.presentacion;
      setDia(m === "listo" ? (p?.fecha ?? datos?.hoy ?? "") : (p?.propuesta?.fecha ?? p?.fecha ?? ""));
      setError(null);
      setModo(m);
    },
    [datos],
  );

  // La encuesta se abre sola cuando hace falta una respuesta.
  useEffect(() => {
    if (!datos || !hayContenido || !datos.puedeCambiar || modo) return;
    const { estado, presentacion } = datos;
    const m: Modo | null = estado === "sin-responder" ? "fecha" : estado === "por-reconfirmar" ? "listo" : null;
    if (!m) return;
    const clave = `nexus-presentacion:${projectId}:${m}:${presentacion.fecha ?? ""}`;
    if (yaSePregunto(clave)) return;
    marcarPreguntado(clave);
    abrir(m);
  }, [datos, hayContenido, modo, projectId, abrir]);

  const pedir = async (cuerpo: Record<string, unknown>): Promise<Respuesta | null> => {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/presentacion-del-diagnostico`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = (await r.json().catch(() => null)) as Respuesta | null;
      if (!r.ok || !j) {
        setError(j?.error ?? `No se pudo guardar (${r.status}). Vuelve a intentarlo.`);
        return null;
      }
      setDatos(j);
      return j;
    } catch {
      setError("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const guardarFecha = async () => {
    if (!dia) return;
    const usaLaPropuesta = datos?.presentacion.propuesta?.fecha === dia;
    const j = await pedir(usaLaPropuesta ? { accion: "usar-propuesta" } : { accion: "fijar", fecha: dia });
    if (j) {
      setModo(null);
      toast.success(`Quedó: se presenta el ${fechaEnPalabras(dia)}.`);
    }
  };

  const todaviaNoSe = async () => {
    const j = await pedir({ accion: "sin-fecha" });
    if (j) {
      setModo(null);
      toast.info("Te la volvemos a pedir cuando una reunión diga la fecha, o cuando la pongas aquí.");
    }
  };

  const estaListo = async () => {
    if (!dia) return;
    const j = await pedir({ accion: "listo", fecha: dia });
    if (!j) return;
    setModo(null);
    if (j.aviso?.avisado) {
      toast.success(`Listo. Le avisamos a ${j.aviso.vendedor ?? "el vendedor"} para que lo revise antes del ${fechaEnPalabras(dia)}.`);
    } else {
      toast.info(`Quedó listo para el ${fechaEnPalabras(dia)}. ${j.aviso?.motivo ?? ""}`.trim());
    }
  };

  const usarPropuesta = async () => {
    const j = await pedir({ accion: "usar-propuesta" });
    if (j?.presentacion.fecha) toast.success(`Quedó: se presenta el ${fechaEnPalabras(j.presentacion.fecha)}.`);
  };

  if (sinTabla) {
    return (
      <div className="rounded-xl border border-warn-line bg-warn-surface text-warn-ink mx-4 mt-3 px-4 py-2.5 text-xs">
        La fecha de presentación todavía no está disponible: falta aplicar su migración en la base.
      </div>
    );
  }
  if (!datos || !hayContenido) return null;

  const { presentacion: p, estado, puedeCambiar } = datos;
  const propuesta = p.propuesta && p.propuesta.fecha !== p.fecha ? p.propuesta : null;

  let linea: string;
  let accion: React.ReactNode = null;
  let tono = "border-line bg-surface";
  switch (estado) {
    case "sin-responder":
      linea = "¿Cuándo planeas presentarlo al cliente?";
      if (puedeCambiar) accion = <BotonBlanco onClick={() => abrir("fecha")}>Poner la fecha</BotonBlanco>;
      break;
    case "sin-fecha":
      linea = "Todavía sin fecha de presentación.";
      if (puedeCambiar) accion = <BotonTexto onClick={() => abrir("fecha")}>Poner la fecha</BotonTexto>;
      break;
    case "con-fecha":
      linea = `Se presenta el ${fechaEnPalabras(p.fecha!)}. Dos días antes te pedimos confirmar que está terminado.`;
      if (puedeCambiar) accion = <BotonTexto onClick={() => abrir("fecha")}>Cambiar</BotonTexto>;
      break;
    case "por-reconfirmar":
      tono = "border-warn-line bg-warn-surface";
      linea = `Se presenta el ${fechaEnPalabras(p.fecha!)}. ¿Está terminado?`;
      if (puedeCambiar) accion = <BotonAzul onClick={() => abrir("listo")}>Confirmar</BotonAzul>;
      break;
    case "listo":
      linea = `Listo para presentarlo el ${fechaEnPalabras(p.fecha!)}.${
        p.aviso?.para ? ` Le avisamos a ${p.aviso.para}.` : p.aviso?.motivo ? ` ${p.aviso.motivo}` : ""
      }`;
      if (puedeCambiar) accion = <BotonTexto onClick={() => abrir("fecha")}>Cambiar la fecha</BotonTexto>;
      break;
  }

  return (
    <>
      <div className={`rounded-xl border mx-4 mt-3 px-4 py-2.5 ${tono}`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Presentación</span>
          <span className="text-xs text-fg-secondary flex-1 min-w-[200px]">{linea}</span>
          {accion}
        </div>
        {propuesta && (
          <div className="mt-2 flex flex-wrap items-start gap-2.5 rounded-[10px] border border-info-line bg-info-surface px-3 py-2">
            <IconoDeSugerencia className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />
            <div className="min-w-0 flex-1 text-xs text-fg-secondary">
              <span className="font-semibold text-brand">Nexus leyó que se presenta el {fechaEnPalabras(propuesta.fecha)}</span>
              {" · "}en «{propuesta.reunion.titulo ?? "una reunión"}» del {fechaCorta(propuesta.reunion.fecha)}:
              <span className="block italic text-fg mt-0.5">«{propuesta.cita}»</span>
            </div>
            {puedeCambiar && (
              <div className="flex gap-2">
                <BotonTexto onClick={() => void pedir({ accion: "descartar-propuesta" })} disabled={ocupado}>
                  Descartar
                </BotonTexto>
                <BotonAzul onClick={() => void usarPropuesta()} disabled={ocupado}>
                  Usar
                </BotonAzul>
              </div>
            )}
          </div>
        )}
        {error && !modo && <p className="mt-2 text-xs text-danger-ink">{error}</p>}
      </div>

      <Modal
        open={modo === "fecha"}
        onClose={() => !ocupado && setModo(null)}
        title="¿Cuándo planeas presentarlo al cliente?"
        description="Dos días antes te pedimos confirmar que está terminado, y ahí le avisamos al vendedor de la empresa para que lo revise antes."
        size="md"
        footer={
          <>
            <BotonBlanco onClick={() => void todaviaNoSe()} disabled={ocupado}>
              Todavía no sé
            </BotonBlanco>
            <BotonAzul onClick={() => void guardarFecha()} disabled={ocupado || !dia}>
              {ocupado ? "Guardando…" : "Guardar la fecha"}
            </BotonAzul>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {propuesta && (
            <section className="flex flex-col gap-1.5 rounded-[10px] border border-info-line bg-info-surface px-3.5 py-3">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-brand">
                <IconoDeSugerencia className="h-4 w-4 flex-shrink-0" />
                Nexus leyó que se presenta el {fechaEnPalabras(propuesta.fecha)}
              </p>
              <p className="text-xs text-fg-secondary">
                En la reunión «{propuesta.reunion.titulo ?? "sin título"}» del {fechaCorta(propuesta.reunion.fecha)}:
              </p>
              <blockquote className="border-l-2 border-info-line pl-3 text-[13px] italic leading-[1.45] text-fg">
                «{propuesta.cita}»
              </blockquote>
            </section>
          )}
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            El día de la presentación
            <input
              type="date"
              value={dia}
              min={datos.hoy}
              onChange={(e) => setDia(e.target.value)}
              className="w-48 px-2.5 py-1.5 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
            />
          </label>
          {error && <p className="text-xs text-danger-ink">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={modo === "listo"}
        onClose={() => !ocupado && setModo(null)}
        title="¿Está terminado el diagnóstico?"
        description="Reconfirma la fecha: le avisamos al vendedor dueño de la empresa en HubSpot, con el enlace, para que lo revise antes de la presentación."
        size="md"
        footer={
          <>
            <BotonBlanco onClick={() => setModo(null)} disabled={ocupado}>
              Todavía no
            </BotonBlanco>
            <BotonAzul onClick={() => void estaListo()} disabled={ocupado || !dia}>
              {ocupado ? "Guardando…" : dia ? `Está listo: se presenta el ${fechaEnPalabras(dia)}` : "Está listo"}
            </BotonAzul>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Se presenta el
            <input
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="w-48 px-2.5 py-1.5 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
            />
          </label>
          {error && <p className="text-xs text-danger-ink">{error}</p>}
        </div>
      </Modal>
    </>
  );
}

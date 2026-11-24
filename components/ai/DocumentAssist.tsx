"use client";

/**
 * components/ai/DocumentAssist.tsx — «✨ Mejorar con IA» de los documentos sobre CanvasBlock que no tienen el chat de
 * conversar (los artefactos, y cualquier documento sin proveedor del chat): el botón abre el chat «Nexus», se escribe el
 * pedido y la propuesta llega dentro del chat, con una casilla por sección, «Fuentes consultadas», «Aplicar» y «Descartar»
 * (components/ai/PropuestaDeSecciones.tsx). El caller SOLO define de dónde viene la propuesta (`url` + `extraBody`) y cómo
 * se aplica una sección (`onApplySection` — típicamente `hook.upsertCardData`, que ya trae optimismo, undo por bloque y
 * pendingWrites).
 *
 * UN SOLO CHAT (24 nov, Elías: «todo debe abrir el mismo chat con la misma interfaz»): hasta ese día abría una ventana modal
 * (AssistDialog) y la propuesta quedaba en la página. Ahora es el mismo cajón que todos (components/asistente/ChatDeUnPedido.tsx).
 *
 * Roles tiene su propio montaje en RoleWorkspace (el mismo chat y la misma propuesta, pero su apply mapea el hero a
 * METADATOS y pasa por el autosave — no por upsertCardData). Doctrina: DECISIONS §Roles.
 */
import { useState, type CSSProperties } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import ChatDeUnPedido, { PuntoDePropuesta, useAvisoDePropuestaLista } from "@/components/asistente/ChatDeUnPedido";
import { Burbuja } from "@/components/asistente/CajonDeNexus";
import PropuestaDeSecciones from "@/components/ai/PropuestaDeSecciones";
import { useChatDeSeccion } from "@/components/asistente/chat-de-seccion";
import { BOTON_DE_HERRAMIENTA, IconoDeSugerencia } from "@/components/ui/sistema";

/** Respuesta de los endpoints .../assist (espejo de DocumentAssistResult). */
export interface DocAssistResult {
  proposal: Record<string, unknown>;
  summary: string[];
  reasoning?: string;
  warnings: string[];
  citations: { url: string; title: string }[];
  usedWebSearch: boolean;
}

export default function DocumentAssist({
  url,
  extraBody,
  dialogTitle,
  chips,
  placeholder,
  labelFor,
  onApplySection,
  onApplied,
  className,
  style,
}: {
  /** Endpoint POST del assist (ej. `/api/projects/${projectId}/canvas-assist`). */
  url: string;
  /** Body extra junto a la instrucción (ej. { canvasId }). */
  extraBody?: Record<string, unknown>;
  /** De qué se habla, en el subtítulo del chat («Mejorar el kickoff con IA»). */
  dialogTitle: string;
  /** Los ejemplos del chat vacío (un clic los pone en la caja). */
  chips: string[];
  placeholder?: string;
  /** Label humano de una key de sección (de las defs del documento). */
  labelFor: (key: string) => string;
  /** Aplica UNA sección seleccionada (ej. upsertCardData del hook del canvas). */
  onApplySection: (key: string, data: unknown) => Promise<void> | void;
  /** Tras aplicar todo (ej. refetch/marcar dirty). */
  onApplied?: () => void;
  className?: string;
  /** Estilo del contenedor. Va acá y no en un div de afuera: cuando hay chat el componente no pinta
   *  nada, y un envoltorio con padding dejaba una franja vacía sobre el documento. */
  style?: CSSProperties;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocAssistResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  /** Lo que quedó al aplicar o descartar, en el hilo («Listo: …»). */
  const [aplicado, setAplicado] = useState<string | null>(null);

  /* ⚠ ACÁ ESTABA EL REGISTRO DEL APLICADOR, y se mudó el 2026-08-22.
     Este componente tiene el ASSIST —instrucción → propuesta → revisar— pero no tiene los verbos
     de escritura del documento. Desde que el chat emite operaciones, el que ejecuta es el
     workspace, que sí los tiene (`useEjecutarOperacionesDelChat`). Dejarlo acá habría hecho que el
     chat mandara operaciones a un segundo modelo que espera prosa. */

  const avisarSiEstaCerrado = useAvisoDePropuestaLista(open);

  /* ⚠ La propuesta de antes NO se borra al pedir otra: se esconde mientras Nexus piensa y, si el pedido nuevo falla,
     vuelve (con su pedido). Pedirla de nuevo cuesta 40 s y la IA. */
  const submit = async (instruction: string): Promise<boolean> => {
    const antes = { enviado, aplicado };
    setLoading(true);
    setEnviado(instruction);
    setError(null);
    setAplicado(null);
    try {
      const r = await fetchJson<DocAssistResult>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, ...extraBody }),
      });
      setResult(r);
      setSelected(new Set(Object.keys(r.proposal)));
      // Llegó con el chat cerrado (se puede cerrar mientras piensa): se avisa, y el botón lleva su punto.
      avisarSiEstaCerrado();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Nexus no pudo proponer. Prueba de nuevo.");
      setEnviado(antes.enviado);
      setAplicado(antes.aplicado);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    setApplying(true);
    try {
      let n = 0;
      for (const key of selected) {
        const data = result.proposal[key];
        if (data !== undefined) {
          await onApplySection(key, data);
          n++;
        }
      }
      setResult(null);
      setAplicado(n === 1 ? "Listo: se aplicó una sección. Revísala en el documento." : `Listo: se aplicaron ${n} secciones. Revísalas en el documento.`);
      onApplied?.();
      toast.success("Propuesta aplicada.");
    } catch {
      setError("No se pudo aplicar la propuesta completa. Revisa las secciones.");
    } finally {
      setApplying(false);
    }
  };

  const empezarDeNuevo = () => {
    setEnviado(null);
    setError(null);
    setResult(null);
    setAplicado(null);
  };

  /* Donde el documento tiene chat, «✨ Mejorar con IA» sobra (2026-10-04, Elías): el «Mejorar con IA» de
     cada sección abre el chat, que arma la lista de cambios con casillas y la aplica por el mismo
     editor. El botón queda solo donde no hay chat (Roles monta el suyo aparte; acá, cualquier
     documento sin proveedor del chat). */
  const { disponible: hayChat } = useChatDeSeccion();

  if (hayChat && !result) return null;

  return (
    <div className={className} style={style}>
      {!hayChat && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className={BOTON_DE_HERRAMIENTA}
          >
            <IconoDeSugerencia className="h-[15px] w-[15px] text-brand" />
            Mejorar con IA
            {result && !open && <PuntoDePropuesta />}
          </button>
        </div>
      )}

      <ChatDeUnPedido
        abierto={open}
        onClose={() => setOpen(false)}
        subtitulo={dialogTitle}
        vacio={{
          intro: "Describe la mejora; Nexus propone y tú revisas antes de aplicar. Por ejemplo:",
          ejemplos: chips,
          cierre: "Puede investigar en línea si hace falta.",
        }}
        placeholder={placeholder ?? "Escribe qué quieres mejorar…"}
        minimo={4}
        enviado={enviado}
        pidiendo={loading}
        textoPensando="Nexus está preparando la propuesta… (puede investigar en línea)"
        error={error}
        onPedir={submit}
        ocupado={applying}
        onNueva={empezarDeNuevo}
      >
        {result && !loading ? (
          <PropuestaDeSecciones
            propuesta={result}
            elegidas={selected}
            alElegir={(key, va) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (va) next.add(key);
                else next.delete(key);
                return next;
              })
            }
            nombreDe={labelFor}
            onAplicar={() => void apply()}
            onDescartar={() => {
              setResult(null);
              setAplicado("Descartaste la propuesta: no cambió nada.");
            }}
            aplicando={applying}
          />
        ) : aplicado && !loading ? (
          <Burbuja de="nexus">{aplicado}</Burbuja>
        ) : null}
      </ChatDeUnPedido>
    </div>
  );
}

"use client";
/**
 * components/tareas/AsistenteDeTareas.tsx — EL CHAT DE TAREAS, una vez en el shell (docs/tareas-plan.md §6.1).
 *
 * El hilo es uno por persona y la sigue por todas las pantallas: por eso el cajón se monta acá y no en cada página.
 * Lo abren el botón «Asistente» de las pantallas de Tareas, «Preguntarle al asistente» en el cajón de una tarea o de
 * un proyecto (con su chip), y «o pídeselo al asistente» de «+ Tarea» (con lo que ya se escribió).
 *
 * ⛔ El cajón (ChatDelAsistente) no sabe de tareas: este envoltorio le pasa sus rótulos, el texto del botón y el
 * aplicar, que va al SERVIDOR (`POST /api/tareas/operaciones`): ahí se lee el acuerdo del hilo, se aplica todo o
 * nada y se escribe el desenlace en la misma transacción. Acá solo se pinta el hilo que vuelve.
 *
 * Un solo panel derecho a la vez: abrir el chat cierra el Feedback, y abrir el Feedback cierra el chat.
 */
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AccionDelChat, AcuerdoDelChat, ChipDelChat, ResultadoDeAplicar, RotulosDelChat } from "@/components/asistente/ChatDelAsistente";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { textoDelBotonDeTareas } from "@/lib/tareas/chat/lineas";
import { PIEZA_TAREAS } from "@/lib/asistente/piezas";
import type { TareaVista } from "@/lib/tareas/tipos";
import { apiTareas, avisarQueCambiaronLasTareas } from "./api";
import { useToast } from "@/components/ui/Toast";
import { Agendar } from "./Agendar";

/* El cajón se carga recién con la primera apertura: en el shell pesaría en todas las pantallas internas. */
const ChatDelAsistente = dynamic(() => import("@/components/asistente/ChatDelAsistente"), { ssr: false });

export interface AbrirElAsistente {
  /** Lo que se señala (una tarea, un proyecto, un cliente o una reunión). `null` lo suelta. */
  chip?: ChipDelChat | null;
  /** Llena el campo sin mandarlo. */
  borrador?: string;
}

interface ContextoDelAsistente {
  abierto: boolean;
  abrir: (o?: AbrirElAsistente) => void;
  cerrar: () => void;
}

const Contexto = createContext<ContextoDelAsistente | null>(null);

/** El chat de tareas, o `null` si esta persona no lo tiene (fuera del piloto o sin la celda `asistente.read`). */
export function useAsistenteDeTareas(): ContextoDelAsistente | null {
  return useContext(Contexto);
}

const ROTULOS: RotulosDelChat = {
  alDestino: "a tus tareas",
  vacio: {
    intro: "Pídele lo que harías a mano. Por ejemplo:",
    cierre: "Te deja cada cambio en una lista para revisar. Nada se crea hasta que lo apliques.",
  },
  boton: (a, desmarcadas) => textoDelBotonDeTareas(a.rotulos, desmarcadas),
};

const AVISO = {
  variante: "sin-propuesta" as const,
  subtitulo: "Tus tareas, desde cualquier pantalla",
  aviso: "Lo tuyo lo decides tú; lo de otra persona le llega como sugerencia. Nada se crea hasta que lo apliques.",
  placeholder: "Pídele algo sobre tus tareas…",
  tono: "neutro" as const,
  bienvenida: null,
  ejemplos: [
    "Anótame revisar los copies para el jueves",
    "Sugiérele a una persona del equipo que revise la landing",
    "Arma un plan de onboarding de 30 días para un cliente",
    "¿Qué tengo sin agendar esta semana?",
  ],
};

type TareaAplicada = { id: string; numero: number; estado: string; responsableEmail: string | null; semana: string | null };

export function AsistenteDeTareasProvider({ habilitado, email, children }: { habilitado: boolean; email: string; children: ReactNode }) {
  const router = useRouter();
  const feedback = useFeedback();
  const toast = useToast();
  const [montado, setMontado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [chip, setChip] = useState<ChipDelChat | null>(null);
  const [borrador, setBorrador] = useState<{ texto: string; n: number } | null>(null);
  const [pedidoDeFoco, setPedidoDeFoco] = useState(0);
  const [paraAgendar, setParaAgendar] = useState<TareaVista[] | null>(null);
  const [ancho, setAncho] = useState<"normal" | "amplio">("normal");
  const yo = email.toLowerCase();

  const abrir = useCallback(
    (o: AbrirElAsistente = {}) => {
      if (!habilitado) return;
      // Un solo panel derecho a la vez: el Feedback se cierra (lo que se escribió ahí se pierde: es un clic a propósito).
      if (feedback?.abierto) feedback.alternar();
      setMontado(true);
      setAbierto(true);
      if (o.chip !== undefined) setChip(o.chip);
      if (o.borrador) setBorrador((b) => ({ texto: o.borrador!, n: (b?.n ?? 0) + 1 }));
      setPedidoDeFoco((n) => n + 1);
    },
    [habilitado, feedback],
  );
  const cerrar = useCallback(() => setAbierto(false), []);

  // Y al revés: abrir el Feedback cierra el chat (se mira el cambio durante el render, sin un efecto).
  const feedbackAbierto = feedback?.abierto ?? false;
  const [feedbackAntes, setFeedbackAntes] = useState(feedbackAbierto);
  if (feedbackAbierto !== feedbackAntes) {
    setFeedbackAntes(feedbackAbierto);
    if (feedbackAbierto && abierto) setAbierto(false);
  }

  const abrirAgendar = useCallback(async (ids: readonly string[]) => {
    const vistas = (await Promise.all(ids.map((id) => apiTareas.una(id).then((r) => r.tarea).catch(() => null)))).filter((t): t is TareaVista => !!t && t.acciones.agendar);
    if (vistas.length) setParaAgendar(vistas);
    // Un clic que no hace nada no puede quedar mudo (la tarea cambió de semana o de dueña en el medio).
    else toast.error(ids.length === 1 ? "Esa tarea ya no se puede agendar desde acá: ábrela en Mis tareas." : "Esas tareas ya no se pueden agendar desde acá: ábrelas en Mis tareas.");
  }, [toast]);

  const onAplicar = useCallback(
    async (_acuerdo: AcuerdoDelChat, de?: { turnoId: string; desmarcadas: readonly number[] }): Promise<ResultadoDeAplicar> => {
      if (!de) return { fallo: "No se pudo identificar el acuerdo: recarga el chat.", avisos: [] };
      const hiloFresco = async () => {
        const r = await fetch(`/api/tareas/asistente?pieza=${PIEZA_TAREAS}`).catch(() => null);
        const j = r?.ok ? await r.json().catch(() => null) : null;
        return j?.hilo ?? undefined;
      };
      const r = await fetch("/api/tareas/operaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(de) }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!r?.ok) {
        const hilo = await hiloFresco();
        return { fallo: j?.error ?? "No se pudo aplicar. Prueba de nuevo.", avisos: [], ...(hilo ? { hilo } : {}) };
      }
      avisarQueCambiaronLasTareas();
      router.refresh();
      const acciones: AccionDelChat[] = [];
      const mias = ((j.tareas ?? []) as TareaAplicada[]).filter((t) => t.responsableEmail === yo && t.estado === "pendiente" && !!t.semana);
      if (mias.length) acciones.push({ texto: mias.length === 1 ? "Agendarla" : `Agendar las ${mias.length}`, alHacer: () => void abrirAgendar(mias.map((t) => t.id)) });
      for (const p of (j.proyectos ?? []) as { id: string; nombre: string; borrador: boolean }[]) {
        acciones.push({ texto: p.borrador ? "Abrir el borrador" : "Abrir el proyecto", alHacer: () => router.push(`/tareas/proyectos/${p.id}`) });
      }
      const hilo = j.hilo ?? (await hiloFresco());
      return { fallo: null, avisos: [], ...(hilo ? { hilo } : {}), acciones };
    },
    [router, yo, abrirAgendar],
  );

  const valor = useMemo<ContextoDelAsistente | null>(() => (habilitado ? { abierto, abrir, cerrar } : null), [habilitado, abierto, abrir, cerrar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {habilitado && montado ? (
        <ChatDelAsistente
          base="/api/tareas"
          pieza={PIEZA_TAREAS}
          piezaLabel="Tus tareas"
          abierto={abierto}
          onClose={cerrar}
          onAplicar={onAplicar}
          aviso={AVISO}
          rotulos={ROTULOS}
          ancho={ancho}
          onAncho={() => setAncho((a) => (a === "amplio" ? "normal" : "amplio"))}
          chip={chip}
          onSoltarChip={() => setChip(null)}
          borrador={borrador}
          pedidoDeFoco={pedidoDeFoco}
        />
      ) : null}
      {paraAgendar ? (
        <Agendar
          tareas={paraAgendar}
          onCerrar={() => {
            setParaAgendar(null);
            avisarQueCambiaronLasTareas();
          }}
        />
      ) : null}
    </Contexto.Provider>
  );
}

/** El botón «Asistente» de las cabeceras de Tareas. Sin el chat (fuera del piloto o sin la celda), no se pinta. */
export function BotonDelAsistente({ chip = null }: { chip?: ChipDelChat | null }) {
  const asistente = useAsistenteDeTareas();
  if (!asistente) return null;
  return (
    <button
      type="button"
      onClick={() => (asistente.abierto && !chip ? asistente.cerrar() : asistente.abrir({ chip }))}
      aria-expanded={asistente.abierto}
      aria-controls="cajon-del-asistente"
      data-recorrido="tareas.asistente"
      className={
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors " +
        (asistente.abierto ? "border-info-line bg-info-surface text-brand" : "border-line bg-surface text-fg hover:bg-surface-hover")
      }
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
      </svg>
      Asistente
    </button>
  );
}

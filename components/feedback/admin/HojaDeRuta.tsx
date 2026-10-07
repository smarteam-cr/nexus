"use client";

/**
 * La Hoja de ruta de /feedback: los temas, en cinco columnas (Por decidir · Planeado · En curso · Listo · En Nexus).
 * Diseño aprobado el 2026-10-06: «Hoja de ruta · rediseño» (Claude Design).
 *
 * Un tema junta los reportes que piden lo mismo. Llega desde la Bandeja («Llevar a la hoja de ruta»), porque
 * se parecía a otro reporte, o a mano con «Nuevo tema»; cada tarjeta dice de dónde salió. Dentro de cada
 * columna, primero lo que pidieron más personas y, a igual cuenta, lo que les frena el trabajo.
 *
 * Un tema se mueve arrastrándolo (dnd-kit, la misma librería del Gantt y de Documentación): al pasar el mouse
 * aparecen los puntitos para agarrarlo. Arrastrar cambia la columna, no el orden. Un clic lo abre en el panel
 * de la derecha: ahí está todo el tema, su columna (el camino por teclado), «Generar prompt» y cada reporte.
 * «Listo» es hecho y espera la próxima subida; «En Nexus», ya subido (2026-10-07). Pasar a cualquiera de las dos le avisa
 * a quien lo pidió —que llega con la próxima subida, o que ya lo puede probar—, así que pide confirmación. Después de
 * una subida, «Ya se subió» (en la columna «Listo») pasa todo lo de «Listo» a «En Nexus» de una vez.
 *
 * Desde el 2026-10-06 («Feedback · rediseño completo») el tema se abre en el panel de la página (Disposicion.tsx),
 * que se ensancha a 440 px (560 con un reporte abierto), y no en una capa encima del tablero: ya no tapa la
 * columna «Listo», así que se puede arrastrar con un tema abierto. Sin tema, el panel dice qué sigue.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Modal } from "@/components/ui/Modal";
import { usePanelLateral } from "@/components/ui/PanelLateral";
import { Segmentado } from "@/components/ui/Segmentado";
import { Skeleton } from "@/components/ui/Skeleton";
import { QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import type { ReporteDelTema, TemaDeHoja } from "@/lib/feedback/queries";
import { EVENTO_DEL_RECORRIDO, type AccionDelRecorrido } from "@/lib/recorridos/tipos";
import { COLUMNA, COLUMNAS, COLUMNAS_DE_ENTRADA, estaTerminada, numeroDeReporte, TIPO, type Columna } from "@/lib/feedback/reglas";
import { Iniciales } from "../piezas";
import { DisposicionDeFeedback } from "./Disposicion";
import DialogoPrompt from "./DialogoPrompt";
import ReporteEnElTema from "./ReporteEnElTema";

const TONO: Record<string, string> = { muted: "text-fg-muted", warning: "text-warning", brand: "text-brand", success: "text-success" };

/** Lo que dice una columna vacía: qué se arrastra ahí. */
const VACIA: Record<Columna, string> = {
  decidir: "Lleva un reporte desde la Bandeja o crea un tema.",
  planeado: "Arrastra aquí lo que decidiste hacer.",
  curso: "Arrastra aquí lo que estás haciendo.",
  listo: "Arrastra aquí lo que ya está hecho: entra en la próxima subida.",
  subido: "Lo que ya se subió. Después de una subida, «Ya se subió» en «Listo» lo trae todo.",
};

/** Lo que dice la confirmación al pasar un tema a una columna que le avisa a quien lo pidió. */
const CONFIRMAR: Record<"listo" | "subido", { titulo: (tema: string) => string; aviso: string; boton: string }> = {
  listo: { titulo: (tema) => `¿«${tema}» ya está hecho?`, aviso: "que ya está hecho y llega con la próxima subida", boton: "Pasar a Listo" },
  subido: { titulo: (tema) => `¿«${tema}» ya está en Nexus?`, aviso: "que ya está en Nexus y lo puede probar", boton: "Pasar a En Nexus" },
};

/** Pasar un tema a esta columna le avisa a quien lo pidió: solo si avanza a «En curso», «Listo» o «En Nexus». */
function avisa(t: TemaDeHoja, columna: Columna): boolean {
  return t.personas.length > 0 && ["curso", "listo", "subido"].includes(columna) && COLUMNAS.indexOf(columna) > COLUMNAS.indexOf(t.columna);
}

/** El ícono de «de dónde salió», por el origen del tema. */
const ICONO_DE_ORIGEN: Record<string, string> = {
  reporte: "M4 13h4l2 3h4l2-3h4 M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
  sugerencia: "M8 7h8 M8 12h8 M8 17h5 M4 7h.01 M4 12h.01 M4 17h.01",
};
const ICONO_A_MANO = "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z";

/** La columna que ya se ve en pantalla mientras el servidor confirma el cambio. */
type Movida = { columna: Columna; enViaje: boolean };

/** Lo que trae el panel de un tema: sus reportes y el prompt para Claude Code. */
type DetalleDelTema = { ok: true; prompt: string; reportes: ReporteDelTema[] } | { ok: false; error: string };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function cuentaDe(t: TemaDeHoja): string {
  if (t.personas.length === 0) return "Sin reportes todavía";
  return `${plural(t.personas.length, "persona", "personas")} · ${plural(t.reportes, "reporte", "reportes")}`;
}

export default function HojaDeRuta({
  encabezado,
  temas,
  temaInicial = null,
  reporteInicial = null,
}: {
  /** El título y las pestañas (los arma la página). */
  encabezado: ReactNode;
  temas: TemaDeHoja[];
  /** `?tema=`: abre ese tema en el panel (un reporte que está en la hoja de ruta se abre acá, no en la Bandeja). */
  temaInicial?: string | null;
  /** `?reporte=`: y dentro del tema, ese reporte. */
  reporteInicial?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const panelLateral = usePanelLateral();
  const temaRef = useRef<HTMLDivElement>(null);
  const [nuevo, setNuevo] = useState(false);
  const [arrastrando, setArrastrando] = useState<TemaDeHoja | null>(null);
  /** El tema que va a pasar a «Listo» o a «En Nexus», mientras se confirma. */
  const [aConfirmar, setAConfirmar] = useState<{ t: TemaDeHoja; columna: "listo" | "subido" } | null>(null);
  /** «Ya se subió»: se confirma antes; `true` mientras el servidor mueve todo. */
  const [subir, setSubir] = useState<"confirmar" | "subiendo" | null>(null);
  const [abierto, setAbierto] = useState<string | null>(() => (temaInicial && temas.some((t) => t.id === temaInicial) ? temaInicial : null));
  /** El reporte abierto dentro del panel del tema; null = se ve el tema. */
  const [reporteAbierto, setReporteAbierto] = useState<string | null>(() =>
    temaInicial && temas.some((t) => t.id === temaInicial) ? reporteInicial : null,
  );
  const [detalles, setDetalles] = useState<Record<string, DetalleDelTema>>({});
  const [prompt, setPrompt] = useState<{ sobre: string; texto: string | null; error: string | null } | null>(null);

  // Lo que se movió se ve enseguida en su columna nueva. Cuando llega la hoja del servidor, se queda solo lo
  // que todavía va en camino: lo demás ya lo trae el servidor (o lo cambió otra persona, y gana eso).
  const [movidas, setMovidas] = useState<{ base: TemaDeHoja[]; mapa: Record<string, Movida> }>({ base: temas, mapa: {} });
  if (movidas.base !== temas) {
    setMovidas({ base: temas, mapa: Object.fromEntries(Object.entries(movidas.mapa).filter(([, m]) => m.enViaje)) });
  }
  const vistos = temas.map((t) => (movidas.mapa[t.id] ? { ...t, columna: movidas.mapa[t.id].columna } : t));
  const ultimaHoja = useRef(temas);
  useEffect(() => {
    ultimaHoja.current = temas;
  }, [temas]);

  const temaAbierto = abierto ? (vistos.find((t) => t.id === abierto) ?? null) : null;

  const cerrarPanel = () => {
    setAbierto(null);
    setReporteAbierto(null);
  };

  // Esc vuelve del reporte al tema, y del tema cierra el panel (salvo con un diálogo encima: ese se cierra primero).
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || aConfirmar || subir || prompt) return;
      if (reporteAbierto) setReporteAbierto(null);
      else setAbierto(null);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto, reporteAbierto, aConfirmar, subir, prompt]);

  // Mouse y dedo por separado: con el dedo hay que mantener apretado un momento, así deslizar sigue
  // desplazando la página. Con teclado, la columna se cambia desde el panel.
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  /** Los reportes y el prompt de un tema (GET /api/feedback/temas/[id]). Queda guardado mientras dura la pantalla. */
  const cargar = useCallback(async (id: string): Promise<DetalleDelTema> => {
    let detalle: DetalleDelTema;
    try {
      const r = await fetch(`/api/feedback/temas/${id}`, { cache: "no-store" });
      const d = (await r.json().catch(() => null)) as { prompt?: string; reportes?: ReporteDelTema[]; error?: string } | null;
      detalle =
        r.ok && d?.prompt && d.reportes
          ? { ok: true, prompt: d.prompt, reportes: d.reportes }
          : { ok: false, error: d?.error ?? "No se pudo leer el tema." };
    } catch {
      detalle = { ok: false, error: "No hay conexión." };
    }
    setDetalles((m) => ({ ...m, [id]: detalle }));
    return detalle;
  }, []);

  // Llegó con un enlace a un tema (`?tema=`): sus reportes se leen al montar.
  const temaDelEnlace = useRef(abierto);
  useEffect(() => {
    if (temaDelEnlace.current) void cargar(temaDelEnlace.current);
  }, [cargar]);

  const abrir = (t: TemaDeHoja) => {
    setAbierto(t.id);
    setReporteAbierto(null);
    if (!detalles[t.id]?.ok) void cargar(t.id);
    // El tema se lee en el panel: si estaba plegado, se abre. En una pantalla angosta el panel va abajo del
    // tablero, así que se baja hasta él.
    if (panelLateral && !panelLateral.abierto) panelLateral.alternar();
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      requestAnimationFrame(() => temaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  // El recorrido de Feedback abre el primer tema para mostrar el panel, y lo cierra en los demás pasos.
  useEffect(() => {
    const alPedido = (e: Event) => {
      const a = (e as CustomEvent<AccionDelRecorrido>).detail;
      if (a?.evento !== "feedback.tema") return;
      if (!a.valor) {
        setAbierto(null);
        setReporteAbierto(null);
        return;
      }
      const t = vistos.find((x) => !estaTerminada(x.columna)) ?? vistos[0];
      if (t) abrir(t);
    };
    window.addEventListener(EVENTO_DEL_RECORRIDO, alPedido);
    return () => window.removeEventListener(EVENTO_DEL_RECORRIDO, alPedido);
  });

  /** Una respuesta o una lectura cambió el tema: se vuelven a leer sus reportes y la hoja de ruta. */
  const alCambiarElTema = (id: string) => {
    void cargar(id);
    router.refresh();
  };

  const generarPrompt = async (t: TemaDeHoja) => {
    const sobre = `«${t.titulo}»`;
    const guardado = detalles[t.id];
    if (guardado?.ok) {
      setPrompt({ sobre, texto: guardado.prompt, error: null });
      return;
    }
    setPrompt({ sobre, texto: null, error: null });
    const d = await cargar(t.id);
    setPrompt(d.ok ? { sobre, texto: d.prompt, error: null } : { sobre, texto: null, error: d.error });
  };

  /**
   * Los cambios de la escala que están en la hoja de ruta, con las columnas de «Cambios pendientes» del
   * manual (Markdown): se pegan en el manual o en el chat de la escala.
   */
  const copiarCambiosDeLaEscala = async () => {
    try {
      const r = await fetch("/api/feedback/cambios-de-la-escala", { cache: "no-store" });
      const d = (await r.json().catch(() => null)) as { markdown?: string; filas?: number; error?: string } | null;
      if (!r.ok || !d?.markdown) {
        toast.error(d?.error ?? "No se pudieron leer los cambios de la escala.");
        return;
      }
      if (!d.filas) {
        toast.info("No hay cambios de la escala en la hoja de ruta.");
        return;
      }
      await navigator.clipboard.writeText(d.markdown);
      toast.success(`Copiados ${d.filas} ${d.filas === 1 ? "cambio" : "cambios"} de la escala, con las columnas del manual.`);
    } catch {
      toast.error("No se pudieron copiar los cambios de la escala.");
    }
  };

  const marcar = (id: string, movida: Movida | null) =>
    setMovidas((m) => {
      const base = ultimaHoja.current;
      const mapa = { ...(m.base === base ? m.mapa : {}) };
      if (movida) mapa[id] = movida;
      else delete mapa[id];
      return { base, mapa };
    });

  const mover = async (t: TemaDeHoja, columna: Columna) => {
    marcar(t.id, { columna, enViaje: true });
    try {
      const r = await fetch(`/api/feedback/temas/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columna }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        marcar(t.id, null);
        toast.error(d?.error ?? "No se pudo mover el tema.");
        return;
      }
      marcar(t.id, { columna, enViaje: false });
      toast.success(
        avisa(t, columna)
          ? `«${t.titulo}» pasó a «${COLUMNA[columna].nombre}»: se avisó a quien lo pidió.`
          : `«${t.titulo}» pasó a «${COLUMNA[columna].nombre}».`,
      );
      router.refresh();
    } catch {
      marcar(t.id, null);
      toast.error("No hay conexión.");
    }
  };

  /** Pasar a «Listo» o a «En Nexus» le dice algo a quien lo pidió: eso se confirma antes. Volver atrás no avisa. */
  const pedirMover = (t: TemaDeHoja, columna: Columna) => {
    if (columna === t.columna || movidas.mapa[t.id]?.enViaje) return;
    if ((columna === "listo" || columna === "subido") && avisa(t, columna)) {
      setAConfirmar({ t, columna });
      return;
    }
    void mover(t, columna);
  };

  /** «Ya se subió»: todo lo de «Listo» pasa a «En Nexus» y a cada persona le llega que ya lo puede probar. */
  const subirLoListo = async () => {
    setSubir("subiendo");
    try {
      const r = await fetch("/api/feedback/temas/subir", { method: "POST" });
      const d = (await r.json().catch(() => null)) as { temas?: number; error?: string } | null;
      if (!r.ok) {
        toast.error(d?.error ?? "No se pudo pasar a «En Nexus».");
        return;
      }
      const n = d?.temas ?? 0;
      toast.success(n === 0 ? "No había nada en «Listo»." : `${plural(n, "tema pasó", "temas pasaron")} a «En Nexus»: se avisó a quien los pidió.`);
      router.refresh();
    } catch {
      toast.error("No hay conexión.");
    } finally {
      setSubir(null);
    }
  };
  const listos = vistos.filter((t) => t.columna === "listo");
  const personasDeLoListo = new Set(listos.flatMap((t) => t.personas.map((p) => p.email))).size;

  const guardarTexto = async (t: TemaDeHoja, titulo: string, detalle: string): Promise<boolean> => {
    try {
      const r = await fetch(`/api/feedback/temas/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, detalle }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        toast.error(d?.error ?? "No se pudo guardar el tema.");
        return false;
      }
      toast.success("Tema guardado.");
      void cargar(t.id); // el prompt lleva el título
      router.refresh();
      return true;
    } catch {
      toast.error("No hay conexión.");
      return false;
    }
  };

  // El panel ya no tapa el tablero: arrastrar no lo cierra.
  const alEmpezar = (e: DragStartEvent) => {
    setArrastrando(vistos.find((t) => t.id === e.active.id) ?? null);
  };
  const alSoltar = (e: DragEndEvent) => {
    setArrastrando(null);
    const t = vistos.find((x) => x.id === e.active.id);
    const columna = COLUMNAS.find((c) => c === e.over?.id);
    if (t && columna) pedirMover(t, columna);
  };

  const personas = new Set(temas.flatMap((t) => t.personas.map((p) => p.email))).size;
  const resumen = personas > 0 ? `${plural(temas.length, "tema", "temas")}, pedidos por ${plural(personas, "persona", "personas")}.` : `${plural(temas.length, "tema", "temas")}.`;

  const herramientas = (
    <>
      <p className="text-[13px] text-fg-muted">{resumen} Arrastra un tema para cambiarlo de columna; ábrelo para ver sus reportes.</p>
      <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copiarCambiosDeLaEscala()}
            title="Los cambios de la escala que están en la hoja de ruta, en una tabla con las columnas de «Cambios pendientes» del manual."
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-[7px] text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Copiar los cambios de la escala
          </button>
          <button
            type="button"
            data-recorrido="feedback.hoja.nuevo"
            onClick={() => setNuevo(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          Nuevo tema
        </button>
      </div>
    </>
  );

  const panel = temaAbierto ? (
    <div ref={temaRef} className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <PanelDelTema
        key={temaAbierto.id}
        t={temaAbierto}
        detalle={detalles[temaAbierto.id] ?? null}
        moviendo={!!movidas.mapa[temaAbierto.id]?.enViaje}
        reporteAbierto={reporteAbierto}
        onAbrirReporte={setReporteAbierto}
        onCerrar={cerrarPanel}
        onMover={(c) => pedirMover(temaAbierto, c)}
        onPrompt={() => void generarPrompt(temaAbierto)}
        onPromptDelReporte={(sobre, texto) => setPrompt({ sobre, texto, error: null })}
        onReintentar={() => void cargar(temaAbierto.id)}
        onGuardar={(titulo, detalle) => guardarTexto(temaAbierto, titulo, detalle)}
        onCambio={() => alCambiarElTema(temaAbierto.id)}
      />
    </div>
  ) : (
    <PanelSinTema temas={vistos} onAbrir={abrir} />
  );

  return (
    <DisposicionDeFeedback
      encabezado={encabezado}
      herramientas={herramientas}
      panel={panel}
      etiquetaPanel={temaAbierto ? "Tema abierto" : "Hoja de ruta"}
      // Un tema necesita más lugar que «Qué sigue», y un reporte trae su captura.
      anchoPanel={temaAbierto ? (reporteAbierto ? "lg:w-[560px]" : "lg:w-[440px]") : "lg:w-[340px]"}
    >
      <DndContext sensors={sensores} collisionDetection={pointerWithin} onDragStart={alEmpezar} onDragEnd={alSoltar} onDragCancel={() => setArrastrando(null)}>
        <div data-recorrido="feedback.hoja.tablero" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {COLUMNAS.map((c) => (
            <ColumnaDeLaHoja
              key={c}
              columna={c}
              temas={vistos.filter((t) => t.columna === c)}
              desde={arrastrando?.columna ?? null}
              arrastrando={arrastrando?.id ?? null}
              abierto={abierto}
              onAbrir={abrir}
              onPrompt={(t) => void generarPrompt(t)}
              onSubir={c === "listo" ? () => setSubir("confirmar") : undefined}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{arrastrando && <ContenidoDeTarjeta t={arrastrando} levantada />}</DragOverlay>
      </DndContext>
      <p className="text-xs text-fg-muted">Dentro de cada columna va primero lo que pidieron más personas y, a igual cuenta, lo que les frena el trabajo.</p>

      {nuevo && <NuevoTema onCerrar={() => setNuevo(false)} />}
      {prompt && <DialogoPrompt sobre={prompt.sobre} prompt={prompt.texto} error={prompt.error} onCerrar={() => setPrompt(null)} />}
      <Modal
        open={aConfirmar !== null}
        onClose={() => setAConfirmar(null)}
        size="md"
        title={aConfirmar ? CONFIRMAR[aConfirmar.columna].titulo(aConfirmar.t.titulo) : undefined}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setAConfirmar(null)} className="rounded px-2.5 py-2 text-[13px] text-fg-muted hover:text-fg">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                const c = aConfirmar;
                setAConfirmar(null);
                if (c) void mover(c.t, c.columna);
              }}
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              {aConfirmar ? CONFIRMAR[aConfirmar.columna].boton : ""}
            </button>
          </div>
        }
      >
        {aConfirmar && (
          <p className="text-sm text-fg-secondary">
            {aConfirmar.t.personas.length === 1 ? "A la persona que lo pidió le llega" : `A las ${aConfirmar.t.personas.length} personas que lo pidieron les llega`}{" "}
            en «Para ti» {CONFIRMAR[aConfirmar.columna].aviso}.
          </p>
        )}
      </Modal>
      <Modal
        open={subir !== null}
        onClose={() => {
          if (subir === "confirmar") setSubir(null);
        }}
        size="md"
        title="¿Ya se subió lo que está en «Listo»?"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={subir === "subiendo"}
              onClick={() => setSubir(null)}
              className="rounded px-2.5 py-2 text-[13px] text-fg-muted hover:text-fg disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={subir === "subiendo"}
              onClick={() => void subirLoListo()}
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {subir === "subiendo" ? "Pasando…" : "Pasar todo a En Nexus"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-fg-secondary">
          {listos.length === 1 ? "El tema de «Listo» pasa" : `Los ${listos.length} temas de «Listo» pasan`} a «En Nexus»
          {personasDeLoListo > 0
            ? ` y a ${personasDeLoListo === 1 ? "la persona que lo pidió le llega" : `las ${personasDeLoListo} personas que los pidieron les llega`} en «Para ti» que ya lo pueden probar.`
            : "."}{" "}
          Hazlo después de que la subida esté en producción.
        </p>
      </Modal>
    </DisposicionDeFeedback>
  );
}

/** El panel sin un tema abierto: qué sigue en la hoja de ruta. */
function PanelSinTema({ temas, onAbrir }: { temas: TemaDeHoja[]; onAbrir: (t: TemaDeHoja) => void }) {
  const abiertos = temas.filter((t) => !estaTerminada(t.columna));
  const listos = temas.filter((t) => t.columna === "listo");
  const conRespuesta = abiertos.filter((t) => t.respondieron > 0);
  const porDecidir = abiertos.filter((t) => t.columna === "decidir");
  const frena = [...abiertos].filter((t) => t.frena > 0).sort((a, b) => b.frena - a.frena || b.personas.length - a.personas.length)[0] ?? null;

  let texto: string;
  let siguiente: TemaDeHoja | null = null;
  if (conRespuesta.length > 0) {
    texto = conRespuesta.length === 1 ? `En «${conRespuesta[0].titulo}» te volvieron a escribir.` : `En ${conRespuesta.length} temas te volvieron a escribir.`;
    siguiente = conRespuesta[0];
  } else if (porDecidir.length > 0) {
    texto = `${plural(porDecidir.length, "tema espera", "temas esperan")} que decidas si se ${porDecidir.length === 1 ? "hace" : "hacen"}.`;
    if (frena) texto += ` «${frena.titulo}» ${frena.frena === 1 ? "le frena el trabajo a una persona" : `les frena el trabajo a ${frena.frena} personas`}.`;
    siguiente = frena ?? porDecidir[0];
  } else if (listos.length > 0) {
    texto = `${plural(listos.length, "tema está hecho", "temas están hechos")} y ${listos.length === 1 ? "espera" : "esperan"} la próxima subida. Cuando esté en producción, «Ya se subió» los pasa a «En Nexus» y avisa a quien los pidió.`;
  } else if (abiertos.length > 0) {
    texto = "Nada espera que decidas. Lo que está en curso se ve en su columna.";
  } else {
    texto = "La hoja de ruta está vacía. Un tema llega desde la Bandeja o con «Nuevo tema».";
  }

  return (
    <>
      <QueSigue
        accion={
          siguiente ? (
            <button type="button" onClick={() => onAbrir(siguiente)} className="text-[13px] font-semibold text-brand hover:text-brand-light">
              Abrir ese tema →
            </button>
          ) : undefined
        }
      >
        {texto}
      </QueSigue>
      <div className="space-y-1.5">
        <p className={ROTULO_DEL_SISTEMA}>Los avisos</p>
        <p className="text-[13px] leading-[1.45] text-fg-secondary">
          Al pasar un tema a «En curso», a «Listo» o a «En Nexus», a quien lo pidió le llega en «Para ti» que se está haciendo, que llega con
          la próxima subida o que ya lo puede probar. Las dos últimas piden confirmación.
        </p>
      </div>
    </>
  );
}

function ColumnaDeLaHoja({
  columna,
  temas,
  desde,
  arrastrando,
  abierto,
  onAbrir,
  onPrompt,
  onSubir,
}: {
  columna: Columna;
  temas: TemaDeHoja[];
  /** La columna de la tarjeta que se está arrastrando; null si no se arrastra nada. */
  desde: Columna | null;
  arrastrando: string | null;
  abierto: string | null;
  onAbrir: (t: TemaDeHoja) => void;
  onPrompt: (t: TemaDeHoja) => void;
  /** Solo en «Listo»: «Ya se subió». */
  onSubir?: () => void;
}) {
  const def = COLUMNA[columna];
  const { setNodeRef, isOver } = useDroppable({ id: columna });
  const otra = desde !== null && desde !== columna;
  const sobre = otra && isOver;
  return (
    <section
      ref={setNodeRef}
      aria-label={def.nombre}
      className={cn(
        "flex min-h-[260px] flex-col gap-2.5 rounded-xl border p-3 transition-colors",
        sobre ? "border-brand bg-info-surface" : otra ? "border-dashed border-line bg-surface-muted" : "border-line bg-surface-muted",
      )}
    >
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5")}>
          <span className={cn("text-xs tracking-normal", TONO[def.tono])}>{def.marca}</span>
          {def.nombre} · {temas.length}
        </p>
        {columna === "subido" && <span className="text-[11px] text-fg-muted">últimas 4 semanas</span>}
        {onSubir && temas.length > 0 && (
          <button
            type="button"
            data-recorrido="feedback.hoja.subir"
            onClick={onSubir}
            title="Después de una subida: todo lo de «Listo» pasa a «En Nexus» y se avisa a quien lo pidió."
            className="text-xs font-semibold text-brand hover:text-brand-light"
          >
            Ya se subió
          </button>
        )}
      </div>
      {sobre && (
        <p className="rounded-[10px] border border-dashed border-brand bg-surface px-3 py-3.5 text-center text-xs font-semibold text-brand">Suelta para pasarlo a «{def.nombre}»</p>
      )}
      {temas.length === 0 && !sobre && (
        <p className="rounded-[10px] border border-dashed border-line px-3 py-[18px] text-center text-xs text-fg-muted">{VACIA[columna]}</p>
      )}
      {temas.map((t) => (
        <Tarjeta key={t.id} t={t} abierta={abierto === t.id} arrastrada={arrastrando === t.id} onAbrir={() => onAbrir(t)} onPrompt={() => onPrompt(t)} />
      ))}
    </section>
  );
}

/** La tarjeta en su columna: se arrastra entera y un clic la abre en el panel. */
function Tarjeta({
  t,
  abierta,
  arrastrada,
  onAbrir,
  onPrompt,
}: {
  t: TemaDeHoja;
  abierta: boolean;
  /** Se está arrastrando: queda tenue en su lugar hasta que se suelta. */
  arrastrada: boolean;
  onAbrir: () => void;
  onPrompt: () => void;
}) {
  const { setNodeRef, listeners } = useDraggable({ id: t.id });
  return (
    <div ref={setNodeRef} {...listeners} data-recorrido="feedback.hoja.tarjeta" onClick={onAbrir} className={cn(arrastrada && "opacity-40")}>
      <ContenidoDeTarjeta t={t} abierta={abierta} onAbrir={onAbrir} onPrompt={onPrompt} />
    </div>
  );
}

function Agarre() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function IconoDeOrigen({ origen }: { origen: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px] flex-none" aria-hidden="true">
      <path d={ICONO_DE_ORIGEN[origen] ?? ICONO_A_MANO} />
    </svg>
  );
}

function Chips({ t }: { t: TemaDeHoja }) {
  if (!t.pantalla && t.frena === 0 && t.respondieron === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5">
      {t.pantalla && <span className="rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-fg-secondary">{t.pantalla}</span>}
      {t.frena > 0 && (
        <span className="rounded-full border border-warn-line bg-warn-surface px-2 text-[11px] font-semibold text-warn-ink">
          {t.frena === 1 ? "A 1 le frena" : `A ${t.frena} les frena`}
        </span>
      )}
      {/* Alguien te volvió a escribir en uno de sus reportes: se contesta desde el panel del tema. */}
      {t.respondieron > 0 && (
        <span className="rounded-full border border-warn-line bg-warn-surface px-2 text-[11px] font-semibold text-warn-ink">
          {t.respondieron === 1 ? "Te respondió" : `Te respondieron en ${t.respondieron}`}
        </span>
      )}
    </p>
  );
}

function ContenidoDeTarjeta({
  t,
  abierta = false,
  levantada = false,
  onAbrir,
  onPrompt,
}: {
  t: TemaDeHoja;
  abierta?: boolean;
  /** La copia que va bajo el puntero mientras se arrastra: sin botones. */
  levantada?: boolean;
  onAbrir?: () => void;
  onPrompt?: () => void;
}) {
  const caras = t.personas.slice(0, 4);
  const resto = t.personas.length - caras.length;
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl border bg-surface p-3.5 transition-colors",
        levantada
          ? "cursor-grabbing border-brand shadow-[0_12px_32px_rgba(17,24,39,0.16)]"
          : abierta
            ? "cursor-grab border-brand ring-1 ring-brand"
            : "cursor-grab border-line hover:border-fg-muted/40",
      )}
    >
      <div className="flex items-start gap-1.5">
        {estaTerminada(t.columna) && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("mt-0.5 h-4 w-4 flex-none", t.columna === "subido" ? "text-success" : "text-brand")}
            aria-hidden="true"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
        {levantada ? (
          <span className="min-w-0 flex-1 text-[15px] font-semibold leading-5 text-fg">{t.titulo}</span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAbrir?.();
            }}
            className="min-w-0 flex-1 cursor-pointer text-left text-[15px] font-semibold leading-5 text-fg"
          >
            {t.titulo}
          </button>
        )}
        <span
          title="Arrastra para moverlo"
          className={cn(
            "-mr-1.5 flex flex-none rounded-md p-0.5 text-fg-muted transition-opacity",
            levantada ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
          )}
        >
          <Agarre />
        </span>
      </div>
      {t.detalle && <p className="line-clamp-2 text-[13px] leading-[1.45] text-fg-secondary">{t.detalle}</p>}
      <Chips t={t} />
      <p className="flex items-center gap-1.5 text-xs text-fg-muted">
        <IconoDeOrigen origen={t.origen} />
        {t.origenTexto}
      </p>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
        <span className="flex min-w-0 items-center gap-2">
          {caras.length > 0 && (
            <span className="flex">
              {caras.map((p, i) => (
                <Iniciales key={p.email} texto={p.iniciales} className={cn("h-[22px] w-[22px] border-2 border-surface text-[9px]", i > 0 && "-ml-1.5")} />
              ))}
              {resto > 0 && <Iniciales texto={`+${resto}`} className="-ml-1.5 h-[22px] w-[22px] border-2 border-surface text-[9px]" />}
            </span>
          )}
          <span className="whitespace-nowrap text-xs text-fg-muted">{cuentaDe(t)}</span>
        </span>
        {!levantada && !estaTerminada(t.columna) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrompt?.();
            }}
            title="Un prompt para aplicarlo en Claude Code"
            className="flex-none cursor-pointer py-0.5 text-xs font-semibold text-fg-secondary hover:text-fg"
          >
            Generar prompt
          </button>
        )}
      </div>
      {t.pie && <p className="text-xs text-fg-muted">{t.pie}</p>}
    </article>
  );
}

/**
 * El tema abierto, en el panel de la derecha. No oscurece el tablero ni lo bloquea: otro clic en otra tarjeta
 * cambia el panel, y Esc o la × lo cierran.
 */
function PanelDelTema({
  t,
  detalle,
  moviendo,
  reporteAbierto,
  onAbrirReporte,
  onCerrar,
  onMover,
  onPrompt,
  onPromptDelReporte,
  onReintentar,
  onGuardar,
  onCambio,
}: {
  t: TemaDeHoja;
  /** null mientras se lee. */
  detalle: DetalleDelTema | null;
  moviendo: boolean;
  /** El reporte abierto dentro del panel; null = se ve el tema. */
  reporteAbierto: string | null;
  onAbrirReporte: (id: string | null) => void;
  onCerrar: () => void;
  onMover: (c: Columna) => void;
  onPrompt: () => void;
  /** El prompt de un reporte abierto adentro del tema: solo lo suyo. */
  onPromptDelReporte: (sobre: string, texto: string) => void;
  onReintentar: () => void;
  onGuardar: (titulo: string, detalle: string) => Promise<boolean>;
  /** Una respuesta o una lectura cambió el tema. */
  onCambio: () => void;
}) {
  const def = COLUMNA[t.columna];
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(t.titulo);
  const [texto, setTexto] = useState(t.detalle ?? "");
  const [guardando, setGuardando] = useState(false);

  const editar = () => {
    setTitulo(t.titulo);
    setTexto(t.detalle ?? "");
    setEditando(true);
  };
  const guardar = async () => {
    if (titulo.trim().length < 3 || guardando) return;
    setGuardando(true);
    const ok = await onGuardar(titulo.trim(), texto.trim());
    setGuardando(false);
    if (ok) setEditando(false);
  };

  const campo = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none";
  return (
    <section aria-label={`Tema: ${t.titulo}`} data-recorrido="feedback.hoja.tema" className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        {reporteAbierto ? (
          <button
            type="button"
            onClick={() => onAbrirReporte(null)}
            className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-fg-secondary transition-colors hover:text-fg"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-none" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="truncate">Volver a «{t.titulo}»</span>
          </button>
        ) : (
          <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5")}>
            <span className={cn("text-xs tracking-normal", TONO[def.tono])}>{def.marca}</span>
            {def.nombre}
          </p>
        )}
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {reporteAbierto && (
        <div>
          <ReporteEnElTema
            key={reporteAbierto}
            id={reporteAbierto}
            tema={{ titulo: t.titulo, columna: t.columna, reportes: detalle?.ok ? detalle.reportes.length : t.reportes }}
            onPrompt={onPromptDelReporte}
            teRespondio={!!(detalle?.ok && detalle.reportes.find((r) => r.id === reporteAbierto)?.respondio)}
            onCambio={onCambio}
            onDevuelto={() => {
              onAbrirReporte(null);
              onCambio();
            }}
          />
        </div>
      )}
      {/* El tema queda montado debajo del reporte: volver no pierde lo que se estaba editando. */}
      <div className={cn("flex flex-col gap-[22px]", reporteAbierto && "hidden")}>
        <div className="space-y-2">
          {editando ? (
            <div className="space-y-2.5">
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-semibold text-fg">Nombre del tema</span>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} autoFocus />
              </label>
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-semibold text-fg">Qué pide, en una línea</span>
                <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Opcional" className={campo} />
              </label>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setEditando(false)} className="rounded px-2.5 py-1.5 text-[13px] text-fg-muted hover:text-fg">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={titulo.trim().length < 3 || guardando}
                  onClick={() => void guardar()}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold leading-[26px] text-fg">{t.titulo}</h2>
                <button type="button" onClick={editar} className="flex-none py-1 text-xs text-fg-muted hover:text-fg">
                  Editar
                </button>
              </div>
              {t.detalle && <p className="text-sm text-fg-secondary">{t.detalle}</p>}
            </>
          )}
          <Chips t={t} />
          <p className="flex items-center gap-1.5 text-xs text-fg-muted">
            <IconoDeOrigen origen={t.origen} />
            {t.origenTexto}
          </p>
        </div>

        <div className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Columna</p>
          <Segmentado<Columna>
            lleno
            etiqueta="Columna"
            valor={t.columna}
            onCambio={onMover}
            deshabilitado={moviendo}
            opciones={COLUMNAS.map((c) => ({ clave: c, etiqueta: COLUMNA[c].nombre }))}
          />
          <p className="text-xs text-fg-muted">Al pasarlo a «En curso», «Listo» o «En Nexus», a quien lo pidió le llega el aviso.</p>
        </div>

        {!estaTerminada(t.columna) && (
          <div className="space-y-1.5">
            <p className={ROTULO_DEL_SISTEMA}>Para Claude Code</p>
            <button
              type="button"
              onClick={onPrompt}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13.5 6l-3 12" />
              </svg>
              Generar prompt
            </button>
            <p className="text-xs text-fg-muted">Lo que pide el tema y lo que dijo cada reporte, en un prompt para pegar en Claude Code.</p>
          </div>
        )}

        <div className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Reportes{detalle?.ok ? ` · ${detalle.reportes.length}` : ""}</p>
          {detalle === null &&
            [0, 1].map((i) => (
              <div key={i} className="space-y-2 rounded-lg border border-line px-3 py-2.5" aria-hidden="true">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          {detalle && !detalle.ok && (
            <p className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2.5 text-[13px] text-danger-ink">
              {detalle.error}{" "}
              <button type="button" onClick={onReintentar} className="font-semibold underline">
                Reintentar
              </button>
            </p>
          )}
          {detalle?.ok && detalle.reportes.length === 0 && (
            <p className="text-[13px] text-fg-muted">Lo cargaste a mano: todavía no tiene reportes. Se suman desde la Bandeja.</p>
          )}
          {detalle?.ok &&
            detalle.reportes.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onAbrirReporte(r.id)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-lg border bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-hover",
                  r.respondio ? "border-warn-line" : "border-line",
                )}
              >
                <span className="flex w-full flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold tabular-nums text-fg-secondary">{numeroDeReporte(r.numero)}</span>
                  <span className="rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-fg-secondary">{TIPO[r.tipo].nombre}</span>
                  {r.frena && <span className="rounded-full border border-warn-line bg-warn-surface px-2 text-[11px] font-semibold text-warn-ink">Le frena</span>}
                  {r.respondio && <span className="rounded-full border border-warn-line bg-warn-surface px-2 text-[11px] font-semibold text-warn-ink">Te respondió</span>}
                  <span className="ml-auto text-xs text-fg-muted">{r.fecha}</span>
                </span>
                <span className="text-[13px] text-fg">
                  <span className="font-semibold">{r.persona}</span> <span className="text-fg-muted">· {r.rol}</span>
                </span>
                <span className="line-clamp-3 whitespace-pre-line text-[13px] leading-[1.45] text-fg-secondary">«{r.cuerpo}»</span>
                <span className="text-xs font-semibold text-brand">Ver el reporte completo</span>
              </button>
            ))}
        </div>

        {t.pie && <p className="text-xs text-fg-muted">{t.pie}</p>}
      </div>
    </section>
  );
}

function NuevoTema({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [pantalla, setPantalla] = useState("");
  const [aNombreDe, setANombreDe] = useState("");
  const [columna, setColumna] = useState<Columna>("decidir");
  const [guardando, setGuardando] = useState(false);
  const listo = titulo.trim().length >= 3;

  const crear = async () => {
    if (!listo || guardando) return;
    setGuardando(true);
    try {
      const r = await fetch("/api/feedback/temas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim(),
          detalle: detalle.trim() || undefined,
          pantalla: pantalla.trim() || undefined,
          aNombreDe: aNombreDe.trim() || undefined,
          columna,
        }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        toast.error(d?.error ?? "No se pudo crear el tema.");
        return;
      }
      toast.success("Tema creado.");
      onCerrar();
      router.refresh();
    } finally {
      setGuardando(false);
    }
  };

  const campo = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none";
  return (
    <Modal
      open
      onClose={onCerrar}
      title="Nuevo tema"
      description="Para lo que alguien te dijo en una sesión o lo que viste tú. Los reportes se suman después, desde la Bandeja."
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded px-2.5 py-2 text-[13px] text-fg-muted hover:text-fg">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!listo || guardando}
            onClick={() => void crear()}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          >
            {guardando ? "Creando…" : "Crear el tema"}
          </button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-semibold text-fg">Nombre del tema</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Lo que se va a hacer, en pocas palabras" className={campo} />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-semibold text-fg">Qué pide, en una línea</span>
          <input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Opcional" className={campo} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-semibold text-fg">Dónde se nota</span>
            <input value={pantalla} onChange={(e) => setPantalla(e.target.value)} placeholder="Clientes, Cobranza…" className={campo} />
          </label>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-semibold text-fg">A nombre de</span>
            <input value={aNombreDe} onChange={(e) => setANombreDe(e.target.value)} placeholder="Quién lo pidió (opcional)" className={campo} />
          </label>
        </div>
        <div className="space-y-1.5">
          <p className="text-[13px] font-semibold text-fg">En qué columna entra</p>
          <Segmentado<Columna>
            etiqueta="En qué columna entra"
            valor={columna}
            onCambio={setColumna}
            opciones={COLUMNAS_DE_ENTRADA.map((c) => ({ clave: c, etiqueta: COLUMNA[c].nombre }))}
          />
          <p className="text-xs text-fg-muted">{COLUMNA[columna].ayuda}</p>
        </div>
      </div>
    </Modal>
  );
}

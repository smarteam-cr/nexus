"use client";

import { ChatDeSeccionProvider, ChatDeSeccionDisponible } from "@/components/asistente/chat-de-seccion";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import ProjectGPS from "./ProjectGPS";
import SectionBlockList from "@/components/canvas/SectionBlockList";
import CanvasLinearView from "@/components/canvas/CanvasLinearView";
import { HANDOFF_SECCION_PRINCIPAL } from "@/lib/canvas/canvas-defs";
import KickoffWorkspace from "@/components/canvas/KickoffWorkspace";
import DesarrolloWorkspace from "@/components/canvas/DesarrolloWorkspace";
import ExploracionWorkspace from "@/components/canvas/ExploracionWorkspace";
import ExploracionConCuestionario from "@/components/cuestionario/ExploracionConCuestionario";
import DiagnosticoWorkspace from "@/components/canvas/DiagnosticoWorkspace";
import PlanificacionWorkspace from "@/components/canvas/PlanificacionWorkspace";
import ImplementacionWorkspace from "@/components/canvas/ImplementacionWorkspace";
import EntregaWorkspace from "@/components/canvas/EntregaWorkspace";
import { UnreviewedSessionsChip } from "./ProjectSessionsReview";
import CronogramaCanvas from "@/components/canvas/CronogramaCanvas";
import CanvasBoundary from "./CanvasBoundary";
import PrintDocButton from "@/components/print/PrintDocButton";
import { PrintStagingProvider } from "@/components/print/PrintStaging";
import CanvasAgentButton from "@/components/clients/CanvasAgentButton";
import { SelectorDePiezas, type FilaDePieza } from "@/components/canvas/SelectorDePiezas";
import VersionesDelDocumento from "@/components/canvas/VersionesDelDocumento";
import { CANVAS_PRIMARY_AGENT } from "@/lib/agents/canvas-agents";
import { slugForCanvas, pieceBySlug, pieceLabel, PIECES } from "@/lib/pieces/registry";
import { buscarDocumento, vistaDeLaUrl } from "@/lib/flow/vista-de-la-url";
// La dirección de la ficha del documento dentro del manual — un solo lugar que sabe dónde vive.
import { urlDeDocumentoEnManual } from "@/lib/manual/anclas";
import ChatDelDocumento from "@/components/asistente/ChatDelDocumento";
import { puedeConversar, PIEZA_CRONOGRAMA } from "@/lib/asistente/piezas";
import { buildPieceRows, type RowState } from "@/lib/flow/dropdown-rows";
import { AVISO_DESACTUALIZADA, AVISO_DESACTUALIZADA_LARGO } from "@/lib/pieces/piece-staleness";
import { pieceReadiness } from "@/lib/flow/piece-readiness";
import { ExternalAccessButton } from "./ExternalAccessPanel";
import ProjectHandoffSection from "./ProjectHandoffSection";
import { WorkspaceSkeleton } from "./skeletons";
import { useWorkspace } from "./WorkspaceContext";
import { useToast } from "@/components/ui/Toast";
import { readCanvasCache } from "@/lib/clients/canvas-cache";
import { AplicadorDeDocumentoProvider } from "@/components/asistente/aplicador-de-documento";

/**
 * Canvases que tienen su PROPIO renderer más abajo (motor de landing, Gantt o vista lineal).
 * La grilla genérica `SectionBlockList` los excluye: si un canvas con renderer propio no cae
 * en este set, se pinta DOS VECES — el suyo arriba y la grilla vieja debajo.
 *
 * ── POR QUÉ SE DERIVA Y YA NO SE ESCRIBE A MANO (2026-08-12) ─────────────────
 * Era una lista transcrita, con un comentario que decía «sumar un canvas nuevo obliga a mirar
 * acá». Un comentario no obliga a nada: le pasó a Exploración, y le volvió a pasar a Entrega
 * el día que nació. Y al ir a arreglarlo aparecieron TRES listas de lo mismo que ya no
 * coincidían — ésta, el campo `ownRenderer` del registro (mal en cuatro piezas, porque nadie
 * lo leía) y los `activeSlug === "…"` de este archivo.
 *
 * Ahora hay UNA: el registro. `ownRenderer` pasó de campo decorativo a la fuente, y una guarda
 * (`lib/pieces/registry.test.ts`) cruza los `activeSlug === "…"` de este archivo contra él en
 * los dos sentidos. Agregar un canvas con renderer propio y olvidarse ya no compila verde.
 */
const CANVAS_CON_RENDERER_PROPIO = new Set(
  PIECES.filter((p) => p.scope === "project" && p.ownRenderer).map((p) => p.slug),
);

/** Cómo se lee de un vistazo el estado de una pieza en el desplegable. */
const ESTADO_PIEZA: Record<RowState, { hint: string }> = {
  generada:    { hint: "Generada" },
  vacia:       { hint: "Todavía sin contenido — entra y genérala" },
  por_activar: { hint: "Este proyecto todavía no la tiene" },
};

// ── Canvas types ────────────────────────────────────────────────────────────

interface CanvasMeta {
  id: string;
  /** Identidad de la pieza (lib/pieces/registry). null en canvases custom del CSE. */
  slug: string | null;
  name: string;
  isDefault: boolean;
  sections: Array<{ key: string; label: string }>;
  /**
   * ¿Alguien escribió acá de verdad? Ojo: NO es "tiene algún bloque" — crear una pieza
   * ya siembra los bloques curados (el cierre), así que ese criterio daba "generada"
   * sobre documentos vacíos. El criterio único vive en lib/pieces/piece-content.ts y lo
   * informan tanto el listado como el seed server-side, para que el primer pintado no
   * mienta. Sigue opcional porque los canvases del Business Case no lo traen.
   */
  hasContent?: boolean;
  /** El handoff corrió después de escribirse este documento (lib/pieces/piece-staleness.ts). */
  stale?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProjectCanvasPanel({
  projectId,
  tags,
  hubspotPipelineId,
  initialCanvases,
}: {
  projectId: string;
  tags?: string[];
  /** De qué pipeline viene (lib/projects/kind.ts). Decide qué piezas le corresponden. */
  hubspotPipelineId?: string | null;
  /** Canvases sembrados server-side (page.tsx) para el proyecto inicial. */
  initialCanvases?: CanvasMeta[] | null;
}) {
  const params = useParams();
  const clientId = params?.id as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const canvasFromUrl = searchParams.get("canvas");
  /* ¿La URL es de OTRO proyecto? Pasa al cambiar de pestaña (este panel se monta antes de que la URL
     cambie) y con el «Ver» de una corrida de otro proyecto del mismo cliente: ese `?canvas=` no es de
     este proyecto y no se aplica acá (la pestaña correcta se monta con su propio panel). */
  const urlDeOtroProyecto = (() => {
    const tab = searchParams.get("tab");
    return !!tab && tab !== projectId;
  })();

  // Siembra del primer paint: props del server (carga inicial) o cache de módulo
  // (revisitas al cambiar de tab). Con siembra, el panel NO pinta el WorkspaceSkeleton
  // — antes re-fetcheaba /canvases al montar y el usuario veía el skeleton DOS veces
  // (el del loading.tsx del route y este). useState perezoso: se resuelve UNA vez por
  // montaje y nunca se re-setea (el refetch de fondo escribe `canvases` directo).
  /**
   * Qué canvas pide la URL. Acepta el ID **o el SLUG de la pieza** (`?canvas=timeline`).
   *
   * El slug existe porque hay enlaces que apuntan a un documento desde fuera de esta pantalla
   * —el «Revisar» del aviso de propuesta de cronograma es el caso— y ahí NADIE conoce el id
   * del canvas: es una fila distinta por proyecto. Con solo ids, ese botón tenía que mandar a
   * `?tab=<proyecto>` a secas… que desde esta tanda abre el RESUMEN, o sea que el enlace
   * dejaba de llegar al Gantt sin que nada fallara. Un slug es estable, legible y el mismo
   * para los 111 cronogramas.
   */
  const buscarCanvasDeLaUrl = useCallback(
    (lista: CanvasMeta[], pedido: string | null): CanvasMeta | null => buscarDocumento(lista, pedido),
    [],
  );

  const [seeded] = useState<CanvasMeta[] | null>(() =>
    initialCanvases && initialCanvases.length > 0
      ? initialCanvases
      : (readCanvasCache<CanvasMeta[]>(projectId)?.data ?? null),
  );

  const [loading, setLoading] = useState(!seeded);
  /** ¿Ya volvió la consulta de la lista de canvases? (con éxito o con error). Es lo que
   *  destraba el esqueleto — no que la lista traiga algo. */
  const [listLoaded, setListLoaded] = useState(!!seeded);

  // Multi-canvas state (sembrado si hay seed; el refetch de fondo revalida igual)
  const [canvases, setCanvases] = useState<CanvasMeta[]>(seeded ?? []);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(() => {
    if (!seeded) return null;
    const fromUrl = buscarCanvasDeLaUrl(seeded, urlDeOtroProyecto ? null : canvasFromUrl);
    return (fromUrl ?? seeded[0])?.id ?? null;
  });
  // Se incrementa al terminar una corrida de agente desde el CTA → remonta el canvas
  // activo (key) para que muestre los bloques nuevos sin recargar la página.
  const [agentNonce, setAgentNonce] = useState(0);
  // Para refrescar el widget del proyecto (ProjectGPS + pills de setup) al generar un canvas.
  const { bumpGpsRefresh, canvasRefreshSignal } = useWorkspace();
  /* ⛔ ACÁ SE CONSUMÍA EL APLICADOR, y era el bug: este componente MONTA el proveedor, así que
     leía el contexto de afuera de su propio proveedor — `null`, siempre. El botón «Aplicar» del
     chat de documentos nunca funcionó. Ahora lo consume `ChatDelDocumento`, que vive adentro. */
  const toast = useToast();
  const [canvasDropdownOpen, setCanvasDropdownOpen] = useState(false);
  /**
   * ¿Se está mirando el RESUMEN del proyecto o un documento?
   *
   * Sale de la URL y no de un estado suelto: **`?canvas=` vacío ES el resumen**. Con eso, un
   * enlace pegado abre lo mismo que veía quien lo pegó, y entrar a un proyecto abre por la
   * respuesta a «¿cómo va esto?» en vez de por el primer documento de la lista.
   *
   * ⚠ Hasta el 2026-09-27 el resumen del proyecto, el widget y el handoff se pintaban ARRIBA
   * de todos los documentos, siempre. O sea que los tres se repetían en las nueve piezas: para
   * leer el cronograma había que pasar por medio metro de contexto que ya se había leído, y el
   * desplegable —que es el control principal de la pantalla— quedaba empujado fuera de vista.
   * Ahora son una parada más del mismo desplegable, y la primera.
   */
  /* Un `?canvas=` que no RESUELVE a un documento de este proyecto abre el Resumen: el del handoff
     (que no está en la lista: vive en el Resumen), uno borrado o el de OTRO proyecto que quedó en
     la URL al cambiar de pestaña. Antes bastaba con que el parámetro existiera para caer en el
     primer documento, con la URL diciendo otra cosa. */
  const [enResumen, setEnResumen] = useState(
    () => vistaDeLaUrl(seeded ?? [], urlDeOtroProyecto ? null : canvasFromUrl, seeded !== null).tipo === "resumen",
  );
  /* Slot en el header para los CTAs de un canvas que necesita ESTADO PROPIO para decidir
     qué botón mostrar. El canvas los renderiza acá por portal y quedan junto al nombre, en
     el mismo lugar que el `CanvasAgentButton` que este panel monta para los demás.
     Existe porque `CANVAS_PRIMARY_AGENT` solo alcanza para un botón fijo: el Cronograma
     alterna entre "Generar cronograma" y "Chequear avance" según tenga tareas, y Desarrollo
     necesita saber si la auto-generación posterior al handoff sigue en curso para no
     disparar dos veces. Era exclusivo del Cronograma; dejarlo así obligó a Desarrollo a
     armarse una segunda barra debajo del nombre, que es el defecto que esto corrige. */
  const [canvasHeaderSlot, setCanvasHeaderSlot] = useState<HTMLDivElement | null>(null);

  /* El asistente que conversa, para los DOCUMENTOS. ⚠ El cronograma monta el suyo adentro de
     CronogramaCanvas, porque su «Aplicar» tiene que entrar por `submitAssist` — el mismo camino
     que «Pedir cambio con IA», con su vista previa. Acá todavía no hay `onAplicar`: el panel
     muestra la instrucción para copiarla, y enchufarla es la etapa 3 del roadmap. */
  const [chatAbierto, setChatAbierto] = useState(false);
  /* ⚠ Estable: `ChatDeSeccionProvider` lo mete en su `useMemo`, así que una flecha inline recrearía
     el contexto en CADA render del panel y re-renderizaría el chrome de todas las secciones. */
  const abrirChat = useCallback(() => setChatAbierto(true), []);

  const activeCanvas = canvases.find((c) => c.id === activeCanvasId) ?? canvases.find((c) => c.isDefault) ?? canvases[0] ?? null;
  /**
   * Identidad de la PIEZA que se está mirando. `slugForCanvas` cae al nombre visible solo si
   * el canvas todavía no tiene slug (canvas viejo sin backfillear): así el renderer no
   * depende del rótulo, que es justo lo que se renombra.
   *
   * ⚠ `null` mientras se mira el RESUMEN, y eso hace el trabajo pesado: todo lo que cuelga de
   * un documento —su CTA, su chat, su «¿Qué es esto?», su renderer— se apaga solo, en vez de
   * pedir un `&& !enResumen` en once lugares, que son once oportunidades de olvidarse uno.
   * Los dos que NO se apagan con un slug vacío —la grilla genérica y el botón de PDF— llevan
   * el gate escrito a mano, porque para ellos "sin slug" significa otra cosa.
   */
  const activeSlug = !enResumen && activeCanvas ? slugForCanvas(activeCanvas) : null;
  // Las filas del desplegable salen del FLUJO (lib/flow), no de la lista de canvases.
  const pieceRows = buildPieceRows(canvases);
  // Qué piezas ya tienen algo escrito — lo mira `pieceReadiness` para avisar cuando a una
  // pieza le faltan sus pasos previos.
  const piezasConContenido = pieceRows.filter((r) => r.state === "generada").map((r) => r.slug);
  /* ⛔ MIENTRAS EL CRONOGRAMA ESPERA A LA IA, NO SE CAMBIA DE PIEZA (2026-09-24). Las esperas de
     «Regenerar todo» y de «Regenerar» una fase eran una ventana que tapaba toda la página; Elías
     pidió el aviso en el cronograma y no encima, así que el resto de la pantalla quedó libre.
     Cambiar de pieza desmonta el cronograma, y la propuesta que se estaba armando —ya pagada— se
     pierde: la vista previa no se guarda en ningún lado. El cronograma avisa con `onOcupado`. */
  const [cronogramaOcupado, setCronogramaOcupado] = useState(false);
  // Update URL when canvas changes (no page reload)
  const switchCanvas = useCallback((canvasId: string) => {
    if (cronogramaOcupado) return;
    /* ⛔ Cambiar de documento NO prende el esqueleto del panel. `loading` significa una sola cosa:
       «la lista de documentos todavía no volvió», y lo apaga un efecto que depende SOLO de
       `listLoaded`, que después de la primera carga ya no cambia. Un `setLoading(true)` acá dejaba
       la pantalla en el esqueleto para siempre (visto en producción el 2026-09-28, tras 14b8c920:
       antes lo apagaba el fetch de las tarjetas del Resumen viejo, que se retiró). Cada documento
       pinta su propio esqueleto mientras carga. Guarda: lib/flow/resumen-del-proyecto.test.ts. */
    /* ⚠ El bail-out temprano mira TAMBIÉN de dónde se viene: volver al mismo documento
       desde el resumen es un cambio de vista aunque el id no cambie, y con el `return`
       viejo el click no hacía nada. */
    if (canvasId === activeCanvasId && !enResumen) return;
    setEnResumen(false);
    setActiveCanvasId(canvasId);
    const url = new URL(window.location.href);
    /* SIEMPRE se escribe el `?canvas=`, incluso para el canvas por defecto: la URL sin el
       parámetro ya significa otra cosa —el resumen—, así que omitirlo mandaría al kickoff
       a una dirección que abre el resumen. */
    url.searchParams.set("canvas", canvasId);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router, activeCanvasId, cronogramaOcupado, enResumen]);

  /** Volver al resumen: la URL pierde el `?canvas=`, que es exactamente lo que lo define. */
  const irAlResumen = useCallback(() => {
    if (cronogramaOcupado) return;
    setEnResumen(true);
    setCanvasDropdownOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("canvas");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router, cronogramaOcupado]);

  /* Ir al Resumen Y bajar a un ancla que vive ahí (el bloque «Etapa» del widget). El scroll espera a
     que el Resumen se vea: con el widget oculto, `scrollIntoView` no mueve nada. */
  const [anclaPendiente, setAnclaPendiente] = useState<string | null>(null);
  const irAlResumenEn = useCallback((ancla: string) => {
    if (cronogramaOcupado) return;
    setAnclaPendiente(ancla);
    irAlResumen();
  }, [irAlResumen, cronogramaOcupado]);
  useEffect(() => {
    if (!enResumen || !anclaPendiente) return;
    document.getElementById(anclaPendiente)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setAnclaPendiente(null);
  }, [enResumen, anclaPendiente]);

  // `canvasFromUrl` en un ref (no en las deps de `refetchCanvases`): `switchCanvas`
  // reescribe el `?canvas=` en cada click de tab, así que si el callback dependiera
  // de ese valor cambiaría de identidad en cada click → el effect de abajo dispararía
  // un refetch innecesario por cada cambio de tab. El ref deja leer el valor vigente
  // sin atarle la identidad del callback.
  const canvasFromUrlRef = useRef(canvasFromUrl);
  useEffect(() => { canvasFromUrlRef.current = canvasFromUrl; }, [canvasFromUrl]);

  // Fetch (o REFETCH) la lista de canvases. PRESERVA la selección activa: al
  // refrescar (ej: el handoff auto-creó "Desarrollo") no queremos saltar de canvas.
  // Solo elige uno si aún no hay activo (primer load), respetando el ?canvas de la URL.
  const refetchCanvases = useCallback(() => {
    return fetch(`/api/projects/${projectId}/canvases`)
      .then((r) => r.json())
      .then((d) => {
        const list: CanvasMeta[] = d.canvases ?? [];
        setCanvases(list);
        setActiveCanvasId((prev) => {
          // Selección vigente que sigue existiendo → se mantiene.
          if (prev && list.some((c) => c.id === prev)) return prev;
          if (list.length === 0) return prev;
          const fromUrl = buscarCanvasDeLaUrl(list, canvasFromUrlRef.current);
          return fromUrl ? fromUrl.id : list[0].id;
        });
      })
      .catch(() => {})
      // Pase lo que pase, la consulta terminó. Antes el loading colgaba de
      // `canvases.length > 0`: con la lista vacía —o con este `.catch` comiéndose un
      // error de red— la pantalla quedaba en esqueleto PARA SIEMPRE, sin timeout y sin
      // forma de recuperarse. Y a partir de F2 la lista puede quedar vacía a propósito.
      .finally(() => setListLoaded(true));
  }, [projectId, buscarCanvasDeLaUrl]);

  const [activando, setActivando] = useState<string | null>(null);

  /**
   * Activar una pieza desde el `+`. Crea el documento VACÍO y lleva ahí: generar es un
   * segundo clic a propósito — disparar un agente sin que nadie lo pida gasta tokens y,
   * sobre una pieza que ya tuviera contenido, lo pisaría.
   */
  const activarPieza = useCallback(async (slug: string) => {
    setActivando(slug);
    try {
      const res = await fetch(`/api/projects/${projectId}/pieces/${slug}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "No se pudo activar la pieza.");
        return;
      }
      await refetchCanvases();
      switchCanvas(data.canvasId);
      setCanvasDropdownOpen(false);
      if (data.outcome === "reactivada") {
        toast.info(`${data.label} vuelve a estar activa — su contenido sigue ahí.`);
      }
    } catch {
      toast.error("No se pudo activar la pieza.");
    } finally {
      setActivando(null);
    }
  }, [projectId, refetchCanvases, switchCanvas, toast]);

  // Primer load + refetch cuando la señal genérica de canvases bumpea (canvas
  // auto-creado por un agente). La señal es el punto de escalabilidad: cualquier
  // flujo que cree/borre un canvas la bumpea y el panel se re-sincroniza sin recargar.
  useEffect(() => {
    void refetchCanvases();
  }, [refetchCanvases, canvasRefreshSignal]);

  /* El esqueleto se apaga cuando VOLVIÓ la consulta de la lista, no cuando la lista trae
     algo: un proyecto sin piezas es un estado válido y antes se quedaba cargando para
     siempre. Acá colgaba también el fetch de los «cards» del Resumen viejo, retirado el
     2026-09-27 con el resto de ese subsistema. */
  useEffect(() => {
    if (listLoaded) setLoading(false);
  }, [listLoaded]);

  /* LA PANTALLA SIGUE A LA URL (2026-09-28). `enResumen` y el documento activo se calculaban una
     sola vez al montar, así que un cambio de URL que no pasaba por el desplegable (la pestaña de
     otro proyecto, que monta este panel con el `?canvas=` del anterior todavía puesto, o un enlace
     del centro de corridas) dejaba la pantalla en un documento con la URL diciendo «Resumen».
     Corre cuando cambia el parámetro y cuando llega la lista; la lista se lee por ref para que un
     refetch de fondo no vuelva a aplicar la URL encima de un clic que todavía no la escribió.
     Mientras el cronograma espera a la IA no se mueve, igual que el desplegable. */
  const canvasesRef = useRef(canvases);
  useEffect(() => { canvasesRef.current = canvases; }, [canvases]);
  useEffect(() => {
    if (cronogramaOcupado || urlDeOtroProyecto) return;
    const vista = vistaDeLaUrl(canvasesRef.current, canvasFromUrl, listLoaded);
    if (vista.tipo === "esperar") return;
    if (vista.tipo === "resumen") {
      setEnResumen(true);
      return;
    }
    setEnResumen(false);
    setActiveCanvasId(vista.canvasId);
  }, [canvasFromUrl, listLoaded, cronogramaOcupado, urlDeOtroProyecto]);

  // La MISMA pieza que pinta app/(shell)/clients/[id]/loading.tsx: el RSC y este gate
  // client-side se ven uno tras otro, así que tienen que hablar el mismo vocabulario.
  if (loading) return <WorkspaceSkeleton />;

  return (
    /* El editor de un canvas puede tener cambios EN PANTALLA que aún no guardó y que cambian
       lo que sale impreso (el ojo de "no visible" del kickoff es staged). Este proveedor es
       el canal por el que se lo cuenta al botón de exportar — ver PrintStaging.tsx. */
    <PrintStagingProvider>
    {/* Envuelve los workspaces Y el cajón: el chat necesita alcanzar el aplicador de la pieza
        activa, que se monta más adentro. */}
    <AplicadorDeDocumentoProvider>
    {/* El botón «Cambiar» de cada sección vive adentro del motor y pide el chat por acá. Los
        ocho documentos lo heredan sin tocar ninguno — y la vista del cliente y el PDF, que montan
        el mismo motor, no lo pintan porque no tienen proveedor. */}
    <ChatDeSeccionProvider onAbrir={abrirChat}>
    {/* ⚠ La disponibilidad se DECLARA desde adentro, nunca por prop del proveedor: mientras era
        una prop, el proveedor tenía que bajar hasta donde vive ese estado y el cajón quedaba
        afuera. Ver `chat-de-seccion.tsx`. Acá el panel ya tiene el dato, así que la línea va
        pegada al proveedor — pero por el mismo canal que usan los otros dos documentos. */}
    <ChatDeSeccionDisponible
      cuando={!!activeSlug && puedeConversar(activeSlug, piezasConContenido.includes(activeSlug ?? ""))}
    />
    <div className="px-6 py-8 space-y-6">
      {/* La sección "Ciclo de vida" se PLEGÓ dentro del widget (2026-07-30). Eran dos lugares
          con la misma respuesta a "¿en qué etapa va esto?": el widget mostraba la etapa de
          HubSpot como texto y esta sección su propio chip con tooltip. Desde que la etapa la
          manda HubSpot también en las implementaciones, no queda nada que marcar acá —las
          validaciones de salida se apagaron con el motor de 8 etapas—, así que la etapa vive
          en el bloque "Etapa" del widget de arriba, con el ancla `#proyecto-etapa`.
          `ProjectLifecyclePanel` NO se borró: queda parqueado junto al motor, para evaluarlo
          con las alarmas nuevas basadas en sesiones. */}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            {/* El selector de piezas (components/canvas/SelectorDePiezas.tsx, compartido con la
                exploración de venta). El desplegable es el MAPA DEL FLUJO, no la lista de lo que
                existe: las piezas del recorrido, tenga el proyecto las que tenga. CTA a la derecha
                con jerarquía — Generar sólido (la acción natural siguiente), Regenerar y Activar
                fantasma (pisan trabajo o son secundarias). El rótulo sale del REGISTRO y no del
                nombre guardado en la base: renombrar una pieza es una línea en
                `lib/pieces/registry.ts`. Un canvas suelto del CSE se llama como él lo llamó. */}
            <SelectorDePiezas
              titulo={
                enResumen
                  ? "Resumen"
                  : activeCanvas
                    ? (activeSlug ? pieceLabel(activeSlug) : activeCanvas.name)
                    : "Sin piezas"
              }
              abierto={canvasDropdownOpen}
              onCambiarAbierto={setCanvasDropdownOpen}
              deshabilitado={cronogramaOcupado}
              motivoDeshabilitado="Espera a que la IA termine en el cronograma para cambiar de pieza."
              resumen={{
                activo: enResumen,
                ayuda: "Cómo va el proyecto: el resumen con fuentes, el estado de la cuenta y el handoff.",
                onElegir: irAlResumen,
              }}
              activa={enResumen ? null : (pieceRows.find((r) => r.canvasId !== null && r.canvasId === activeCanvasId)?.slug ?? null)}
              bloqueadas={activando !== null}
              onElegir={(slug) => {
                const row = pieceRows.find((r) => r.slug === slug);
                if (!row) return;
                if (!row.canvasId) {
                  void activarPieza(row.slug);
                  return;
                }
                switchCanvas(row.canvasId);
                setCanvasDropdownOpen(false);
              }}
              filas={pieceRows.map((row): FilaDePieza => {
                // ¿Esta pieza le corresponde a este proyecto, y están sus pasos previos?
                // Nunca bloquea: informa (lib/flow/piece-readiness).
                const readiness = pieceReadiness(row.slug, {
                  tags: tags ?? [],
                  piezasConContenido,
                  hubspotPipelineId: hubspotPipelineId ?? null,
                });
                return {
                  clave: row.slug,
                  etiqueta: row.label,
                  estado: row.state === "generada" ? "generada" : row.state === "vacia" ? "pendiente" : "vacia",
                  ayuda: ESTADO_PIEZA[row.state].hint,
                  atenuada: !row.canvasId,
                  ocupada: activando === row.slug,
                  /* El aviso COMPRIMIDO ("Sin tag X" / "Antes: Y"); la frase completa va en el title.
                     Si no, el de «el handoff corrió después»: el encadenado ya NO reescribe solo
                     (borraba ediciones a mano) y sin este renglón el CSE creía que estaba al día. */
                  aviso: readiness.shortReason
                    ? { corto: readiness.shortReason, largo: readiness.reason ?? undefined }
                    : row.stale
                      ? { corto: AVISO_DESACTUALIZADA, largo: AVISO_DESACTUALIZADA_LARGO }
                      : null,
                  accion:
                    /* Exploración ya no se GENERA (2026-10-02): su informe quedó en solo lectura y la
                       guía de exploración tiene su propio agente, adentro de la pieza. */
                    row.agent && row.canvasId && row.slug !== "exploration" ? (
                      <CanvasAgentButton
                        clientId={clientId}
                        projectId={projectId}
                        agentId={row.agent.agentId}
                        canvasId={row.canvasId}
                        label={row.state === "generada" ? "Regenerar" : "Generar"}
                        async={row.agent.async}
                        appearance={row.state === "generada" ? "ghost" : "primary"}
                        className="shrink-0"
                        onDone={() => {
                          setAgentNonce((n) => n + 1);
                          bumpGpsRefresh();
                          void refetchCanvases();
                        }}
                      />
                    ) : !row.canvasId ? (
                      <button
                        onClick={() => void activarPieza(row.slug)}
                        disabled={activando !== null}
                        className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold text-fg-muted border border-line hover:text-fg hover:bg-surface-hover disabled:opacity-60 transition-colors"
                      >
                        {activando === row.slug ? "Activando…" : "Activar"}
                      </button>
                    ) : null,
                };
              })}
            />
            {/* CTA por-canvas: ejecuta el agente primario del canvas, anclado junto al
                nombre (reemplaza el pop-up). Handoff/Cronograma tienen su propio CTA. */}
            {activeCanvas && CANVAS_PRIMARY_AGENT[activeSlug ?? ""] && activeSlug !== "exploration" && (
              <CanvasAgentButton
                clientId={clientId}
                projectId={projectId}
                agentId={CANVAS_PRIMARY_AGENT[activeSlug ?? ""].agentId}
                canvasId={activeCanvasId}
                label={CANVAS_PRIMARY_AGENT[activeSlug ?? ""].label}
                async={CANVAS_PRIMARY_AGENT[activeSlug ?? ""].async}
                /* Mismo cierre que el CTA de la fila del desplegable, incluido el refetch:
                   sin él, generar desde acá dejaba la fila en ámbar con "Generar" y las
                   piezas siguientes avisando "Antes: …" sobre algo que ya estaba hecho.
                   El documento se veía bien y el mapa del flujo mentía hasta recargar. */
                onDone={() => {
                  setAgentNonce((n) => n + 1);
                  bumpGpsRefresh();
                  void refetchCanvases();
                }}
              />
            )}
            {/* Las fotos que se toman antes de cada regeneración (lib/canvas/versiones.ts): en todo
                documento que la IA reescribe, incluido Desarrollo (su CTA viene por portal). */}
            {activeCanvas && activeCanvasId && (CANVAS_PRIMARY_AGENT[activeSlug ?? ""] || activeSlug === "tech-requirements" || activeSlug === "handoff") && (
              <VersionesDelDocumento
                projectId={projectId}
                canvasId={activeCanvasId}
                onCambio={() => {
                  setAgentNonce((n) => n + 1);
                  bumpGpsRefresh();
                  void refetchCanvases();
                }}
              />
            )}
            {/* CTAs de los canvas que se los inyectan por portal (Cronograma y Desarrollo) —
                A LA PAR DEL NOMBRE, en el mismo lugar que el CanvasAgentButton de los demás. */}
            {(activeSlug === "timeline" || activeSlug === "tech-requirements") && (
              <div ref={setCanvasHeaderSlot} className="flex items-center gap-2" />
            )}
            {/* Aviso (nunca bloqueo): en clientes multi-proyecto, links de IA sin revisar
                pueden mezclar contexto de otro proyecto en el handoff/kickoff. */}
            {(activeSlug === "handoff" || activeSlug === "kickoff") && (
                <UnreviewedSessionsChip projectId={projectId} />
              )}
            {/* Puerta al manual, en el momento de la duda. La sección /documentacion existe
                desde el 2026-08-02 y su única entrada era acordarse del ítem del sidebar — para
                un equipo que la abre pocas veces al mes, eso es no tenerla. Va acá porque es
                donde alguien se pregunta "¿y esto para qué era?", con el slug ya resuelto. */}
            {/* Conversar el cambio antes de generarlo. El cronograma tiene el suyo propio (con
                «Aplicar» cableado), así que acá se ofrece para el resto de los documentos. */}
            {activeSlug !== PIEZA_CRONOGRAMA &&
              puedeConversar(activeSlug, piezasConContenido.includes(activeSlug ?? "")) && (
                <button
                  onClick={() => setChatAbierto((v) => !v)}
                  className={
                    chatAbierto
                      ? "shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-secondary text-secondary-fg transition-colors"
                      : "shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold text-fg-muted border border-line hover:text-fg hover:bg-surface-hover transition-colors"
                  }
                  title="Conversa el cambio con el asistente antes de generarlo"
                >
                  💬 Asistente
                </button>
              )}
            {activeSlug && pieceBySlug(activeSlug) && (
              <a
                href={urlDeDocumentoEnManual(activeSlug)}
                className="shrink-0 text-xs text-fg-muted hover:text-fg transition-colors"
                title={`Qué es el canvas ${pieceLabel(activeSlug)} y cuándo se usa`}
              >
                ¿Qué es esto?
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Acceso del cliente externo (token + contraseña) — PROJECT-LEVEL:
              las mismas credenciales destraban todas las superficies externas
              (kickoff, cronograma), por eso vive acá y no en un canvas. */}
          <ExternalAccessButton projectId={projectId} />
          {/* Export PDF. Qué camino toma lo decide el REGISTRO de impresión leyendo la
              pieza del canvas activo, no un `if` acá: las piezas del motor bajan el PDF con
              el diseño del documento, y todo lo demás —Resumen, handoff, cronograma, los
              canvas a medida— sigue con la vista imprimible de siempre. */}
          {/* El resumen no se imprime: no es un documento, es la foto de cómo va el
              proyecto — y sus dos piezas (el brief y el handoff) tienen su propio PDF. */}
          {!enResumen && (
            <PrintDocButton
              projectId={projectId}
              activeSlug={activeSlug ?? null}
              canvasHref={`/print/canvas/${clientId}/${activeCanvasId ?? "default"}?print=1&projectId=${projectId}`}
            />
          )}

        </div>
      </div>


      {/* ── RESUMEN ────────────────────────────────────────────────────────────────
          Cómo va el proyecto (el brief con fuentes y el widget de la cuenta) y el handoff
          del que sale todo lo demás. Vivía ARRIBA de los nueve documentos y por eso se
          repetía en los nueve; acá es una parada del mismo desplegable. */}
      {/* ⛔ OCULTO, NO DESMONTADO (2026-09-28). Con `{enResumen && …}`, ir a un documento
          desmontaba el widget y el handoff: se perdía el «Generando…» del handoff (y un segundo
          clic lanzaba otra corrida pagada), el widget se quedaba con datos viejos porque los
          avisos de refrescar llegaban cuando no estaba montado, «Generar resumen» se rehabilitaba
          a mitad de la corrida y las exclusiones sin guardar desaparecían. Con `hidden` siguen
          vivos y vuelven como quedaron; se pintan UNA vez, solo en el Resumen. Guarda:
          lib/flow/resumen-del-proyecto.test.ts. */}
      <div hidden={!enResumen} className="space-y-6">
        <ProjectGPS projectId={projectId} clientId={clientId} />
        <ProjectHandoffSection projectId={projectId} clientId={clientId} visible={enResumen} />
      </div>

      {/* Handoff: vista lineal (lectura/curación del CSE, sin grilla) */}
      {activeSlug === "handoff" && activeCanvasId && (
        <CanvasBoundary label="el Handoff">
          <CanvasLinearView destacarKey={HANDOFF_SECCION_PRINCIPAL} projectId={projectId} canvasId={activeCanvasId} />
        </CanvasBoundary>
      )}

      {/* Kickoff: landing (Camino C) editable in-situ por el CSE.
          El div rompe el padding del panel (px-6 py-8 space-y-6) para que las
          secciones del landing sean full-bleed dentro del scroll container. */}
      {activeSlug === "kickoff" && activeCanvasId && (
        // Publicar/ocultar el kickoff vive en el pop-up "Acceso del cliente"
        // (toolbar del proyecto), junto al resto de la visibilidad por superficie.
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          {/* agentNonce remonta el landing al terminar una corrida del CTA → refetch.
              Editor sobre el motor LandingView (drag&drop + edición tipada); el fallback
              tolerante del motor pinta la prosa markdown heredada. El renderer viejo
              (KickoffLanding) y su escape `?kve=old` se borraron en la Ola 4 del plan
              de puestos — rollback de esa ola = git revert. */}
          <CanvasBoundary label="el Kickoff">
            <KickoffWorkspace key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
          </CanvasBoundary>
        </div>
      )}

      {/* Integraciones («Desarrollo» hasta el 2026-09-27): requerimiento técnico editable
          in-situ (mismo motor que el Kickoff,
          sin staging: la vista externa lee el canvas vivo). El canvas es on-demand — solo
          aparece si el handoff detectó trabajo técnico (o se regenera con el botón). */}
      {activeSlug === "tech-requirements" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="el canvas de Integraciones">
            <DesarrolloWorkspace key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} clientId={clientId} canvasId={activeCanvasId} headerSlot={canvasHeaderSlot} />
          </CanvasBoundary>
        </div>
      )}

      {/* Exploración: guía INTERNA de descubrimiento del negocio (mismo motor, paleta gris).
          Canvas de primera clase como Kickoff: vive en el dropdown y su agente se dispara
          desde el header (CANVAS_PRIMARY_AGENT). NO tiene vista externa ni publicación. */}
      {/* Implementación: la guía de construcción del CSE (motor de landings, interna).
          El margen negativo es OBLIGATORIO en todo canvas del motor: anula el px-6 py-8
          del panel para que las bandas de sección lleguen a los bordes. Sin él, el hero
          y el cierre —que llevan fondo propio— quedan recortados con calles a los lados. */}
      {activeSlug === "implementation" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="la ejecución">
            <ImplementacionWorkspace key={`implementacion-${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
          </CanvasBoundary>
        </div>
      )}

      {/* Entrega: el documento de cierre (motor de landings, paleta de MARCA — lo ve el cliente). */}
      {activeSlug === "delivery" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="la entrega">
            <EntregaWorkspace key={`entrega-${activeCanvasId}-${agentNonce}`} projectId={projectId} clientId={clientId} canvasId={activeCanvasId} />
          </CanvasBoundary>
        </div>
      )}

      {/* Planificación: el plan que aprueba el cliente (motor de landings, interno). */}
      {activeSlug === "planning" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="la planificación">
            <PlanificacionWorkspace key={`planificacion-${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
          </CanvasBoundary>
        </div>
      )}

      {/* Diagnóstico: informe de rendimiento para el cliente (motor de landings). Es el
          que más lo necesita: se proyecta en la sesión con el cliente. */}
      {activeSlug === "diagnosis" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="el diagnóstico">
            <DiagnosticoWorkspace key={`diagnostico-${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
          </CanvasBoundary>
        </div>
      )}

      {activeSlug === "exploration" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="el canvas de Exploración">
            {/* 4A Cuestionario previo + 4B Informe: la misma fase, dos momentos. */}
            <ExploracionConCuestionario
              projectId={projectId}
              informeAnterior={
                piezasConContenido.includes("exploration") ? (
                  <ExploracionWorkspace key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} soloLectura />
                ) : null
              }
            />
          </CanvasBoundary>
        </div>
      )}

      {/* Cronograma: Gantt + editor del ProjectTimeline (fases/tareas/semanas).
          Fuente única — el Kickoff lo refleja read-only. clientId habilita el
          disparo del agente de detalle (POST /api/clients/[clientId]/analyze). */}
      {activeSlug === "timeline" && (
        // agentNonce remonta el canvas al terminar el CTA de avance → muestra el banner
        <CanvasBoundary label="el Cronograma">
          <CronogramaCanvas
            key={`cronograma-${agentNonce}`}
            projectId={projectId}
            clientId={clientId}
            headerSlot={canvasHeaderSlot}
            onOcupado={setCronogramaOcupado}
            onIrAlResumen={irAlResumenEn}
          />
        </CanvasBoundary>
      )}

      {/* Resto de canvases custom: grilla de bloques (Diagnóstico, Planificación, …).
          Los que tienen renderer PROPIO se excluyen por `CANVAS_CON_RENDERER_PROPIO`:
          si uno falta ahí, su canvas se pinta DOS veces (el motor arriba y esta grilla
          abajo). Pasó con Exploración — por eso es un set con nombre y no otra `&&`. */}
      {!enResumen && !CANVAS_CON_RENDERER_PROPIO.has(activeSlug ?? "") && activeCanvasId && (
        // agentNonce remonta la grilla al terminar una corrida del CTA → refetch
        <CanvasBoundary label="este canvas">
          <SectionBlockList key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
        </CanvasBoundary>
      )}

      {/* Sin ninguna pieza activa. Antes este caso no existía en la UI: la pantalla se
          quedaba en esqueleto para siempre (el loading colgaba de que la lista trajera
          algo). Ahora es un estado con nombre — y a partir del interruptor de piezas
          puede darse a propósito, no solo por un error. */}
      {!enResumen && canvases.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-sm font-medium text-fg">Este proyecto no tiene piezas activas.</p>
          <p className="mt-1 text-sm text-fg-muted">
            El handoff está en el Resumen, acá arriba. Para trabajar el contenido del
            proyecto, activa una pieza desde el desplegable.
          </p>
        </div>
      )}


      {/* El asistente de los DOCUMENTOS. Sin `onAplicar` todavía: muestra la instrucción
          acordada para copiarla al «Pedir cambio con IA» del documento. Cablearla es la
          etapa 3 — y va a entrar por el editor de la pieza, nunca por una escritura propia. */}
      {/* Mismo gate que el botón: si el canvas activo no tiene chat, el cajón se va con él.
         Si no, quedaría abierto sobre una pieza que no puede conversar. */}
      {activeSlug &&
        activeSlug !== PIEZA_CRONOGRAMA &&
        puedeConversar(activeSlug, piezasConContenido.includes(activeSlug ?? "")) && (
        /* ⚠ `key` POR PIEZA, igual que los workspaces de arriba. Cambiar de canvas es puro
           estado —`switchCanvas` hace `router.replace` sobre la misma ruta— así que sin esto el
           panel NO se remonta: se queda con el hilo del documento ANTERIOR mientras el
           encabezado ya dice el nombre nuevo, y «Nueva» y el envío postean contra la pieza
           NUEVA. La conversación que se lee y la que se toca dejan de ser la misma. */
        /* ⚠ `key` POR PIEZA, igual que los workspaces de arriba. Cambiar de canvas es puro
           estado —`switchCanvas` hace `router.replace` sobre la misma ruta— así que sin esto el
           panel NO se remonta: se queda con el hilo del documento ANTERIOR mientras el
           encabezado ya dice el nombre nuevo, y «Nueva» y el envío postean contra la pieza
           NUEVA. La conversación que se lee y la que se toca dejan de ser la misma. */
        <ChatDelDocumento
          key={activeSlug}
          base={`/api/projects/${projectId}`}
          pieza={activeSlug}
          piezaLabel={pieceLabel(activeSlug)}
          abierto={chatAbierto}
          onClose={() => setChatAbierto(false)}
        />
      )}
    </div>
    </ChatDeSeccionProvider>
    </AplicadorDeDocumentoProvider>
    </PrintStagingProvider>
  );

}

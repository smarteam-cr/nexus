"use client";

/**
 * components/clients/ProjectHandoffSection.tsx
 *
 * Sección dedicada del HANDOFF dentro de cada proyecto (handoff por-proyecto, 1:1).
 * Siempre visible arriba del proyecto: muestra estado claro (Generado / No generado /
 * Generando…), botón para generar/regenerar, y el documento (CanvasLinearView del
 * canvas "Handoff"). La generación corre el agente scopeado a las sesiones de ESTE
 * proyecto (SessionProject) — async + polling.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import CanvasLinearView from "@/components/canvas/CanvasLinearView";
import ResultadosMediblesDelHandoff from "./ResultadosMediblesDelHandoff";
import PedidosFueraDeAlcance from "@/components/clients/PedidosFueraDeAlcance";
import { HANDOFF_SECCION_PRINCIPAL } from "@/lib/canvas/canvas-defs";
import { useAgentRun } from "@/hooks/useAgentRun";
import { pollAgentRun, type PolledRun } from "@/lib/clients/poll-agent-run";
import { useToast } from "@/components/ui/Toast";
import { notifyAgentDone, maybeRequestPermission } from "@/lib/notifications/client";
import { useWorkspace } from "./WorkspaceContext";
import { useMe } from "@/hooks/useMe";
import ProjectContextSection from "./ProjectContextSection";
import { Alert, ConfirmDialog, Field, Modal, Textarea } from "@/components/ui";
import { lineaDelCongelado, MOTIVO_MINIMO, type EstadoDelHandoff, type PedidoDelHandoff } from "@/lib/handoff/congelado";
import { BotonAzul, BotonBlanco, BotonEnlace, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { FilaDeAlrededor } from "./FilaDeAlrededor";
import { useContextoDelResumen } from "./contexto-del-resumen";
import TagsStrip from "@/components/tags/TagsStrip";
import { SENTINEL_SERVICE_TYPE, type ProjectPipelineKey } from "@/lib/projects/kind";
import { HandoffSectionSkeleton } from "./skeletons";
import HistorialHandoffModal from "./HistorialHandoffModal";
import { debeVerHistorial } from "@/lib/agents/historial-corridas";
import {
  readHandoffStatusCache,
  writeHandoffStatusCache,
  invalidateHandoffStatus,
} from "@/lib/clients/handoff-status-cache";

/**
 * El handoff de este proyecto PODRÍA ser el de OTRO — y hasta la Tanda F (2026-08-07) lo era
 * para todo desarrollo colgado de una implementación. Hoy las tres filas de `PROJECT_PIPELINES`
 * dicen `handoffDelHermano: false`, así que el servidor nunca manda `redirigido: true` y
 * `HandoffDelHermano` no se pinta nunca. Se conserva entero: apagar por celda es reversible.
 *
 * Lo que el hermano menor ve en su lugar es su propio handoff, con un enlace discreto al del
 * mayor (`hermanoMayor`) — decisión de Elías: el alcance vendido sigue estando allá.
 */
type DuenioDTO =
  | { redirigido: false }
  | { redirigido: true; projectId: string; projectName: string | null; clientId: string | null };

interface HandoffStatus {
  duenio?: DuenioDTO;
  /** De qué proyecto cuelga éste, si cuelga. NO redirige: es solo el enlace discreto. */
  hermanoMayor?: { projectId: string; projectName: string; clientId: string } | null;
  /** El tipo del proyecto — decide el título de la sección. `null` = pipeline sin declarar. */
  pipelineKey?: ProjectPipelineKey | null;
  handoffId: string | null;
  /** Id del agente de handoff, resuelto por grupo en el GET (no hardcodeado). */
  agentId: string | null;
  canvasId: string | null;
  generated: boolean;
  blockCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  /** La corrida del handoff que sigue en curso (no colgada). La sección la retoma al montar.
   *  `sugerir`: es «Buscar lo nuevo» (no reescribe el documento). Opcional: el cache de antes no lo trae. */
  corridaEnCurso?: { runId: string; sugerir?: boolean } | null;
  /** Cuántas corridas del agente de handoff existen — decide si se ofrece "Ver historial".
   *  Opcional: una entrada del cache de módulo anterior al deploy no lo trae. */
  handoffRunCount?: number;
  sourceSessions: { id: string; title: string; date: string }[];
  projectSessionCount: number;
  /** Qué alimentaría el handoff HOY (política de link + regla) y si hay material real. */
  handoffReadiness: { feedingCount: number; withTranscript: number; manualSources: number };
  /** Exclusiones que escribió EL CSE a mano (texto libre → reglas duras del prompt). */
  contextExclusions: string | null;
  /** La exclusión que pone LA APP, calculada en vivo. No se guarda y no se puede borrar. */
  exclusionAutomatica?: string | null;
  /** «¿Qué se vendió?» en tres frases (lib/handoff/resumen.ts). `null` = todavía no se escribió. */
  handoffResumen?: string | null;
  /** El handoff se regeneró DESPUÉS del resumen: lo que dice describe una versión anterior. */
  handoffResumenViejo?: boolean;
  /** 3b: ¿está congelado? (la foto fija de lo vendido). Opcional: el cache de antes del deploy no lo trae. */
  congelado?: EstadoDelHandoff;
  /** 3b: los bloques en borrador que esperan «Usar» o «Descartar» en el documento. */
  sugerenciasPendientes?: number;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * La sección cuando el handoff que aplica es el del PROYECTO PRINCIPAL.
 *
 * Se muestra el documento —es el alcance que hay que leer para trabajar acá— y se ocultan
 * Generar/Regenerar, el Contexto y las exclusiones: todo eso decide QUÉ entra al handoff, y
 * esa decisión se toma donde el handoff vive.
 *
 * ── LÍMITE HONESTO ───────────────────────────────────────────────────────────
 * La solo-lectura del documento es una AFORDANCIA de pantalla, no un permiso nuevo: quien
 * podría editarlo desde acá tiene la pestaña del hermano a un clic y el mismo permiso allá.
 * Lo que SÍ está cerrado con servidor es lo específico del handoff —crear la entidad,
 * cambiar exclusiones, elegir sesiones y fuentes, y regenerar con IA—, que es lo que
 * produciría dos documentos del mismo trato. Fingir lo contrario sería vender una seguridad
 * que no existe.
 */
/** Las corridas del handoff que esta pestaña ya está siguiendo (ver «RETOMAR LA CORRIDA EN CURSO»). */
const SEGUIMIENTOS_DEL_HANDOFF = new Map<string, Promise<PolledRun>>();

function HandoffDelHermano({
  canvasId,
  generated,
  duenio,
  showDoc,
  onToggleDoc,
  canEdit,
}: {
  canvasId: string | null;
  generated: boolean;
  duenio: { projectId: string; projectName: string | null; clientId: string | null };
  showDoc: boolean;
  onToggleDoc: () => void;
  canEdit: boolean;
}) {
  const nombre = duenio.projectName ?? "el proyecto principal";
  const hrefHermano = duenio.clientId ? `/clients/${duenio.clientId}?tab=${duenio.projectId}` : null;
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <svg className="w-4 h-4 text-fg-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m4 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-fg">Handoff del proyecto principal</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-secondary bg-surface-muted border border-line rounded-full px-2 py-0.5">
              Solo lectura
            </span>
          </div>
          <p className="text-xs text-fg-muted mt-0.5">
            Este desarrollo cuelga de{" "}
            {hrefHermano ? (
              <a href={hrefHermano} className="text-brand hover:underline font-medium">{nombre}</a>
            ) : (
              <strong className="text-fg-secondary">{nombre}</strong>
            )}
            : es el mismo alcance vendido, así que comparten handoff. Se genera y se edita allá.
          </p>
        </div>
        {generated && canvasId && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onToggleDoc}
              className="text-xs font-medium text-fg-muted hover:text-fg px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors"
            >
              {showDoc ? "Ocultar" : "Ver documento"}
            </button>
            {duenio.clientId && (
              <a
                href={`/print/canvas/${duenio.clientId}/${canvasId}?print=1&projectId=${duenio.projectId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-surface-muted border-line text-fg-secondary hover:bg-surface-hover"
                title="Abre una vista imprimible para guardar como PDF"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Exportar PDF
              </a>
            )}
          </div>
        )}
      </div>
      {!generated && (
        <p className="px-5 pb-3.5 -mt-1 text-xs text-fg-muted">
          {nombre} todavía no tiene su handoff generado.
        </p>
      )}
      {generated && showDoc && canvasId && duenio.clientId && (
        <div className="border-t border-line">
          {/* El documento es del hermano: el canvas y el proyecto que se le pasan son los
              SUYOS. Pasar este projectId acá rendería el canvas contra el proyecto
              equivocado. */}
          <CanvasLinearView projectId={duenio.projectId} canvasId={canvasId} canEdit={canEdit} destacarKey={HANDOFF_SECCION_PRINCIPAL} />
        </div>
      )}
    </section>
  );
}

export default function ProjectHandoffSection({
  projectId,
  clientId,
  visible: visibleEnElPanel = true,
  servicio = null,
}: {
  projectId: string;
  clientId: string;
  /** El servicio recurrente del proyecto («SmartLoop»), si lo es (2026-10-11): el traspaso lo muestra en vez
   *  de pedir el «tipo de implementación», que en un servicio recurrente no aplica. */
  servicio?: string | null;
  /** ¿Se ve el Resumen? La sección queda MONTADA aunque no se vea (conserva «Generando…» y las
   *  exclusiones sin guardar), pero el DOCUMENTO se desmonta: montado y oculto, sus entradas de
   *  deshacer seguían en la pila y un Ctrl+Z en otro documento revertía, sin que se viera, un cambio
   *  del handoff (y consultaba cada 5 s). Guarda: lib/flow/resumen-del-proyecto.test.ts. */
  visible?: boolean;
}) {
  /* Con algo de la cuenta en el centro (Información del cliente, Procesos) el panel del proyecto
     queda montado y oculto: el documento se desmonta igual que fuera del Resumen. */
  const { aLaVista, proyectoVisible } = useContextoDelResumen();
  const visible = visibleEnElPanel && proyectoVisible;
  // Siembra desde el cache de módulo: al volver a un tab ya visitado, la sección pinta
  // su estado real AL INSTANTE con la altura correcta (sin skeleton ni empujón).
  const cached = readHandoffStatusCache<HandoffStatus>(projectId);
  const [status, setStatus] = useState<HandoffStatus | null>(cached);
  const [tags, setTagsState] = useState<string[]>([]); // #5 — tags de producto/alcance del proyecto
  const [loading, setLoading] = useState(!cached);
  const [generating, setGenerating] = useState(false);
  const { phase, track } = useAgentRun(clientId);
  const [error, setError] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  /* 3b (DECISIONS «El handoff se congela»): «Congelar», con su confirmación, y «Rehacer desde cero», con su
     motivo. «Congelar» y «Buscar lo nuevo» los ve quien tiene `handoff.congelar`; «Rehacer desde cero», quien
     puede regenerar el handoff. Las mismas celdas que pide el servidor. */
  const [confirmarCongelar, setConfirmarCongelar] = useState(false);
  const [congelando, setCongelando] = useState(false);
  const [rehacerAbierto, setRehacerAbierto] = useState(false);
  const [motivoRehacer, setMotivoRehacer] = useState("");
  const { bumpTimelineRefresh, bumpGpsRefresh, bumpCanvasRefresh } = useWorkspace();
  const toast = useToast();
  const pathname = usePathname();
  // RBAC: solo VENTAS/CSL/MARKETING/SUPER_ADMIN editan el handoff (capacidad
  // handoffAnywhere). El CSE lo VE pero no lo genera ni edita.
  const me = useMe();
  const canEdit = me?.capabilities.includes("handoffAnywhere") ?? false;
  // Gestionar el CONTEXTO del handoff (incluir/excluir sesiones, pegar fuentes, tags) lo
  // hace el OWNER del cliente además de handoffAnywhere — el CSE cura el contexto de SUS
  // proyectos. El workspace ya restringe al CSE a sus clientes (owner), y el server enforce
  // owner||handoffAnywhere (guardProjectHandoffAccess) en cada mutación, así que alcanza con
  // "es interno". Editar el DOCUMENTO del handoff y las exclusiones libres siguen en canEdit.
  const canManageContext = me != null;
  // Generar/regenerar con IA es su propia celda (handoff.generate|regenerate), independiente de
  // editar a mano (handoff.write = canEdit). (C) Se gatea por la celda que el server EXIGIRÁ según
  // el estado del artefacto: ya generado → `regenerate`; sin generar → `generate` (mismo criterio
  // que resolveArtifactGate). Así el CTA no aparece si va a dar 403. Con status aún sin cargar
  // (status null) el botón no se renderiza igual (early-return abajo), así que el default a
  // `generate` es inocuo. Por default los tres van juntos; esto cubre config custom asimétrica.
  const handoffPerms = me?.permissions?.sections?.handoff;
  const canGenerateHandoff = status?.generated
    ? handoffPerms?.regenerate === true
    : handoffPerms?.generate === true;
  /* 3b: congelar y «Buscar lo nuevo» son su propia celda (`handoff.congelar`, 2026-10-10): el CSE la tiene y no
     regenera. Ninguna de las dos reescribe el documento; «Rehacer desde cero» sí, y sigue con `canGenerateHandoff`. */
  const puedeCongelar = handoffPerms?.congelar === true;
  /* Ver el historial no lleva celda de permiso, igual que ver el documento: se gobierna por
     acceso al proyecto (el endpoint lo hace cumplir). Se ofrece con 2+ corridas, o con una
     sola que FALLÓ — ahí el historial es el único lugar donde queda escrito el motivo. */
  const puedeVerHistorial = debeVerHistorial({
    corridas: status?.handoffRunCount,
    ultimoEstado: status?.lastRunStatus,
  });

  /* Exclusiones del CSE (textarea colapsable). El draft vive aparte del status para no pisar lo
     tipeado en cada refetch.

     ── EL BUG QUE `exclusionsDirty` ARREGLA (2026-08-08) ─────────────────────
     Antes esto era un `exclusionsLoaded` que sembraba el textarea UNA sola vez — y esa vez era
     ANTES de que el handoff existiera, o sea con "". Después de generar, el refetch traía la
     nota guardada y el textarea seguía vacío. Al apretar **Regenerar**, el paso 0 comparaba
     "vacío ≠ la nota guardada", lo leía como «el CSE la borró» y mandaba un PATCH a null: la
     segunda corrida —justo la que uno hace porque el documento no le gustó— salía SIN
     exclusiones, y la nota quedaba destruida.
     Con un flag de "lo tocó una persona": el draft se re-siembra en cada refetch mientras nadie
     haya escrito, y el PATCH del paso 0 solo sale si de verdad alguien escribió. */
  const [exclusions, setExclusions] = useState("");
  const [exclusionsDirty, setExclusionsDirty] = useState(false);
  const [savingExcl, setSavingExcl] = useState(false);
  /** Corriendo el resumen del handoff (la puerta manual). Aparte de `generating`: no es lo mismo
   *  reescribir el documento que redactar tres frases sobre el que ya está. */
  const [resumiendo, setResumiendo] = useState(false);
  const [showExcl, setShowExcl] = useState(false);
  /** La fila «Resultados que persigue el cliente» y su cuenta (la reporta el componente al cargar). */
  const [verResultados, setVerResultados] = useState(false);
  const [cuentaDeResultados, setCuentaDeResultados] = useState<{ total: number; pendientes: number } | null>(null);
  const alContarResultados = useCallback((total: number, pendientes: number) => {
    setCuentaDeResultados((c) => (c && c.total === total && c.pendientes === pendientes ? c : { total, pendientes }));
  }, []);
  /* «Ver documento» abre el documento pegado a su tarjeta y la vista baja hasta él: sin esto, con la
     tarjeta arriba de la pantalla, el documento se abría fuera de la vista y el botón parecía roto.
     Solo cuando lo pide el CLIC: al terminar una generación también se abre, y ahí la vista no puede
     saltar debajo de alguien que está leyendo otra cosa. */
  const docRef = useRef<HTMLElement>(null);
  const bajarAlDocumento = useRef(false);
  useEffect(() => {
    if (!showDoc || !bajarAlDocumento.current) return;
    bajarAlDocumento.current = false;
    docRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showDoc]);

  const fetchStatus = useCallback(async (): Promise<HandoffStatus | null> => {
    let leido: HandoffStatus | null = null;
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff`);
      if (r.ok) {
        const d = (await r.json()) as HandoffStatus;
        leido = d;
        writeHandoffStatusCache(projectId, d); // revisitas pintan sin skeleton
        setStatus(d);
        // Se re-siembra SIEMPRE que nadie haya tipeado — no una sola vez. Ver el comentario
        // de `exclusionsDirty`: sembrar una vez sola es lo que hacía que "Regenerar" borrara.
        setExclusionsDirty((sucio) => {
          if (!sucio) setExclusions(d.contextExclusions ?? "");
          return sucio;
        });
      }
    } catch { /* ignore */ }
    setLoading(false);
    return leido;
  }, [projectId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // #5 — tags de producto/alcance del proyecto (tira compartida con el business case).
  const fetchTags = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/tags`);
      if (r.ok) { const d = await r.json(); setTagsState(d.tags ?? []); }
    } catch { /* ignore */ }
  }, [projectId]);
  useEffect(() => { fetchTags(); }, [fetchTags]);

  const saveTags = useCallback(async (slugs: string[]) => {
    setTagsState(slugs); // optimista
    try {
      const r = await fetch(`/api/projects/${projectId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: slugs }),
      });
      // res.ok=false NO lanza → chequear explícito para no dejar el chip "guardado" sin serlo.
      if (!r.ok) { setError("No se pudieron guardar los tags."); fetchTags(); }
    } catch { setError("Error de conexión al guardar los tags."); fetchTags(); }
  }, [projectId, fetchTags]);

  /* 2026-08-12: el tipo de implementación dejó de tener su propio `setModality` + su propio
     endpoint `PATCH /implementation-type`. Es un tag como cualquier otro y viaja por `saveTags`. */

  // Guardar exclusiones (fetch + error visible + refetch).
  const saveExclusions = useCallback(async () => {
    setSavingExcl(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextExclusions: exclusions.trim() || null }),
      });
      if (!r.ok) setError("No se pudieron guardar las exclusiones.");
      else {
        // Guardado = el draft y el servidor coinciden: el refetch puede volver a sembrar.
        setExclusionsDirty(false);
        fetchStatus();
      }
    } catch {
      setError("Error de conexión al guardar las exclusiones.");
    }
    setSavingExcl(false);
  }, [projectId, exclusions, fetchStatus]);

  /**
   * Escribir el resumen a mano — la puerta RETROACTIVA.
   *
   * No dispara el agente de handoff: llama a su propio endpoint, que solo lee el documento ya
   * escrito y redacta tres frases. Es la diferencia entera con «Regenerar»: eso reescribe el
   * documento (y pisa lo editado a mano); esto no lo toca.
   */
  const handleResumen = useCallback(async (silencioso = false) => {
    setResumiendo(true);
    if (!silencioso) setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff/resumen`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (!silencioso) setError(d.error ?? "No se pudo escribir el resumen.");
      } else {
        // El status guarda caché de módulo: sin invalidar, cambiar de pestaña y volver
        // repintaría la versión sin resumen y el botón parecería no haber hecho nada.
        invalidateHandoffStatus(projectId);
        fetchStatus();
      }
    } catch {
      if (!silencioso) setError("Error de conexión al escribir el resumen.");
    }
    setResumiendo(false);
  }, [projectId, fetchStatus]);

  /* «QUÉ SE VENDIÓ» SE ESCRIBE SOLO AL ABRIR EL RESUMEN (2026-10-04, decisión de Elías). Si el
     handoff está generado y el resumen falta o quedó viejo, se pide una vez por versión del
     handoff y por sesión del navegador, sin avisos. Solo quien puede generarlo: el servidor pide
     la misma celda (`guardProjectGenerateHandoff`), así que para el resto sería un 403 seguro.
     Lo de antes de esta tanda lo llena una sola vez `scripts/backfill-resumen-handoff.ts`. */
  const puedeResumir = handoffPerms?.write === true || handoffPerms?.generate === true || handoffPerms?.regenerate === true;
  const faltaResumen = !!status?.generated && (!status.handoffResumen || !!status.handoffResumenViejo);
  const versionDelHandoff = status?.lastRunAt ?? "none";
  /* La versión del handoff para la que ya se pidió: si se regenera sin salir de la pantalla, la
     versión nueva vuelve a poder pedirlo (un booleano lo trababa para siempre). */
  const resumenPedido = useRef<string | null>(null);
  useEffect(() => {
    if (!aLaVista || !faltaResumen || !puedeResumir || generating || resumenPedido.current === versionDelHandoff) return;
    const clave = `nexus-resumen-venta-auto:${projectId}:${versionDelHandoff}`;
    try {
      if (sessionStorage.getItem(clave)) return;
      sessionStorage.setItem(clave, "1");
    } catch {
      /* Sin sessionStorage: igual se pide una sola vez por montaje. */
    }
    resumenPedido.current = versionDelHandoff;
    void handleResumen(true);
  }, [aLaVista, faltaResumen, puedeResumir, generating, projectId, versionDelHandoff, handleResumen]);

  /* RETOMAR LA CORRIDA EN CURSO (2026-09-28). Recargar, abrir el proyecto en otra pestaña o volver
     al Resumen a mitad de una generación dejaba «Generar» habilitado: un segundo clic lanzaba otra
     corrida pagada sobre el mismo documento, y al terminar la primera nadie refrescaba esta
     pantalla. Si el servidor dice que hay una corrida viva, la sección la sigue: «Generando…», botón
     deshabilitado y, al terminar, el estado nuevo.
     · Se sigue con `pollAgentRun` y NO con `track`: `track` marca la corrida como anunciada y el
       centro de corridas se callaba el «Listo / Falló» (la sección, oculta, no avisa nada).
     · Un solo seguimiento por corrida en la pestaña (SEGUIMIENTOS_DEL_HANDOFF): cambiar de proyecto
       y volver remonta la sección, y la seguía dos veces. Los pasos de cierre (sincronizar con
       HubSpot, el aviso del cronograma sin sincronizar) los hace solo quien la sigue primero. */
  const retomadaRef = useRef<string | null>(null);
  const runIdEnCurso = status?.corridaEnCurso?.runId ?? null;
  /* «Buscar lo nuevo» (3b): al terminar NO se sincroniza con HubSpot ni se avisa al cronograma, igual que cuando la
     búsqueda se lanzó desde esta pestaña (handleGenerate › `sugiriendo`). Sin esto, recargar a mitad de una búsqueda
     creaba el proyecto en HubSpot si el handoff no estaba vinculado. */
  const sugiriendoEnCurso = status?.corridaEnCurso?.sugerir === true;
  const handoffIdEnCurso = status?.handoffId ?? null;
  useEffect(() => {
    if (!runIdEnCurso || generating || retomadaRef.current === runIdEnCurso) return;
    retomadaRef.current = runIdEnCurso;
    setGenerating(true);
    let seguimiento = SEGUIMIENTOS_DEL_HANDOFF.get(runIdEnCurso);
    const propio = !seguimiento;
    if (!seguimiento) {
      seguimiento = pollAgentRun(clientId, runIdEnCurso);
      SEGUIMIENTOS_DEL_HANDOFF.set(runIdEnCurso, seguimiento);
      const id = runIdEnCurso;
      void seguimiento.finally(() => SEGUIMIENTOS_DEL_HANDOFF.delete(id));
    }
    const enCurso = seguimiento;
    void (async () => {
      try {
        const result = await enCurso;
        if (sugiriendoEnCurso) {
          if (result.status === "ERROR") {
            setError(
              puedeCongelar
                ? (result.error ?? "No se pudo buscar lo nuevo. Vuelve a intentarlo.")
                : "La última búsqueda de lo nuevo en el handoff falló.",
            );
          } else if (result.status === "TIMEOUT") {
            setError("La búsqueda de lo nuevo está tardando más de lo normal. Revisa en unos minutos.");
          }
          await fetchStatus();
          return;
        }
        if (result.status === "ERROR") {
          setError(
            canGenerateHandoff
              ? (result.error ?? "La generación del handoff falló. Vuelve a intentarlo.")
              : "La última generación del handoff falló.",
          );
        } else if (result.status === "TIMEOUT") {
          setError("La generación está tardando más de lo normal. Revisa en unos minutos.");
        } else if (propio && result.status === "DONE") {
          if (result.timelineSyncError) {
            toast.error(`El handoff se generó, pero el cronograma no se actualizó: ${result.timelineSyncError}`, {
              action: { label: "Entendido", onClick: () => {} },
            });
          }
          if (handoffIdEnCurso) {
            fetch("/api/handoffs/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ handoffId: handoffIdEnCurso }),
            }).catch(() => {});
          }
        }
        await fetchStatus();
        fetchTags();
        bumpTimelineRefresh();
        bumpGpsRefresh();
        bumpCanvasRefresh();
      } catch {
        /* sin red: el próximo GET dirá cómo quedó */
      } finally {
        setGenerating(false);
      }
    })();
  }, [runIdEnCurso, sugiriendoEnCurso, handoffIdEnCurso, generating, clientId, canGenerateHandoff, puedeCongelar, toast, fetchStatus, fetchTags, bumpTimelineRefresh, bumpGpsRefresh, bumpCanvasRefresh]);

  /* `pedido` (3b): sin nada, la generación de siempre; con el handoff congelado, «Buscar lo nuevo»
     (`sugerir`: deja sugerencias en borrador, no reescribe nada) o «Rehacer desde cero» (`rehacer`, con
     motivo: la generación de siempre, y queda congelado otra vez). */
  const handleGenerate = useCallback(async (pedido?: PedidoDelHandoff) => {
    const sugiriendo = pedido?.modo === "sugerir";
    const agentId = status?.agentId;
    if (!agentId) { setError("No se encontró el agente de handoff."); return; }
    maybeRequestPermission(); // gesto del usuario → ofrecer activar notificaciones (una vez)
    invalidateHandoffStatus(projectId); // el status va a cambiar: que un cambio de tab no pinte el viejo
    setGenerating(true);
    setError(null);
    // A la pestaña del proyecto, no a la home del cliente (el handoff vive ahí).
    const notifyUrl = `/clients/${clientId}?tab=${encodeURIComponent(projectId)}`;
    try {
      // 0. (Va antes de mirar si hay una corrida viva: si termina en «la sigo», lo escrito no se pierde.)
      //    Guardar exclusiones PENDIENTES del textarea: escribir y regenerar directo
      //    (sin apretar "Guardar") perdía el texto en silencio y el prompt corría sin
      //    la regla (visto en RC). Best-effort: si falla, la generación sigue igual.
      const pendingExcl = exclusions.trim() || null;
      /* ⚠ SOLO SI UNA PERSONA ESCRIBIÓ. Comparar contra el status era el bug: un textarea que
         nunca se re-sembró se ve igual que uno que alguien vació a mano. */
      if (exclusionsDirty && pendingExcl !== (status?.contextExclusions ?? null)) {
        await fetch(`/api/projects/${projectId}/handoff`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contextExclusions: pendingExcl }),
        }).catch(() => {});
      }

      /* -1. ¿Ya hay una corrida en curso? (2026-09-28) Una pestaña abierta ANTES de que otra (o
         alguien más) lanzara el handoff sigue mostrando «Regenerar», y el servidor no frena corridas
         paralelas: sin esta consulta, el clic pagaba una segunda. Si hay una viva, se la sigue en vez
         de lanzar otra (el efecto «RETOMAR» la toma apenas llega el estado). */
      const fresco = await fetch(`/api/projects/${projectId}/handoff`)
        .then((r) => (r.ok ? (r.json() as Promise<HandoffStatus>) : null))
        .catch(() => null);
      if (fresco?.corridaEnCurso?.runId) {
        /* Si esta sección ya la había seguido y se rindió (TIMEOUT a los ~6 min), el retomar no la
           volvía a tomar (`retomadaRef` seguía con ese id): el aviso decía «la sigo» y no seguía
           nada, hasta 30 min. Se suelta el ref para que el efecto la retome de verdad. */
        if (retomadaRef.current === fresco.corridaEnCurso.runId) retomadaRef.current = null;
        writeHandoffStatusCache(projectId, fresco);
        setStatus(fresco);
        toast.info("Ya hay una generación del handoff en curso: la sigo en vez de lanzar otra.");
        return;
      }

      // 1. Asegurar entidad Handoff + canvas. «Buscar lo nuevo» se lo salta: solo corre sobre un handoff
      //    congelado, que ya tiene documento, y quien lo pide puede ser un CSE (`handoff.congelar`), que no
      //    tiene la celda que pide este paso (generar, regenerar o editar el handoff).
      let handoffId: string | undefined;
      if (!sugiriendo) {
        const ensure = await fetch(`/api/projects/${projectId}/handoff`, { method: "POST" });
        const ensureData = await ensure.json().catch(() => ({}));
        if (!ensure.ok) { setError(ensureData.error ?? "No se pudo preparar el handoff."); return; }
        handoffId = ensureData.handoffId;
      }

      // 2. Correr el agente handoff (async/background, scopeado a las sesiones del proyecto)
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, projectId, async: true, ...(pedido ? { handoff: pedido } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // «Buscar lo nuevo» sin nada posterior al congelado no es un error: no hay qué buscar todavía.
        if (data.error === "SIN_NOVEDADES") {
          toast.info(data.message ?? "No hay reuniones nuevas desde que se congeló el handoff.");
          return;
        }
        // NO_PROJECT_SESSIONS u otro error → mostrar el mensaje claro, no generar.
        setError(data.message ?? data.error ?? (sugiriendo ? "No se pudo buscar lo nuevo." : "No se pudo generar el handoff."));
        if (data.error === "HANDOFF_CONGELADO" || data.error === "NO_CONGELADO") void fetchStatus();
        return;
      }
      let resultado: PolledRun | null = null;
      if (data.runId) {
        /* La corrida es de esta sección: el retomar no la vuelve a seguir, y una sección remontada
           en esta pestaña (cambiar de proyecto y volver) espera este mismo seguimiento. */
        retomadaRef.current = data.runId;
        const seguimiento = track(data.runId);
        SEGUIMIENTOS_DEL_HANDOFF.set(data.runId, seguimiento);
        const id = data.runId as string;
        void seguimiento.finally(() => SEGUIMIENTOS_DEL_HANDOFF.delete(id)).catch(() => {});
        const result = await seguimiento;
        resultado = result;
        if (result.status === "ERROR") {
          // result.error viene humanizado desde AgentRun.output.error (créditos/429/timeout…).
          setError(
            result.error ??
              (sugiriendo ? "No se pudo buscar lo nuevo. Vuelve a intentarlo." : "El handoff falló durante la generación. Vuelve a intentarlo."),
          );
          void notifyAgentDone({ group: "handoff", ok: false, url: notifyUrl });
          return;
        }
        if (result.status === "TIMEOUT") { setError("La generación está tardando más de lo normal. Revisa en unos minutos."); return; }
        // Tanda M — el handoff (documento) puede haber terminado DONE mientras el cronograma
        // no se pudo sincronizar (ej. reconciliación fallida, error de base). Sin esto, el CSE
        // solo se enteraba si por casualidad abría la pestaña Cronograma. Sticky (con acción)
        // para que no se pierda entre los demás toasts.
        if (result.timelineSyncError) {
          toast.error(
            `El handoff se generó, pero el cronograma no se actualizó: ${result.timelineSyncError}`,
            { action: { label: "Entendido", onClick: () => {} } },
          );
        }
      }
      /* «Buscar lo nuevo» no reescribe el documento: no hay nada que sincronizar con HubSpot ni que avisar
         al cronograma. Se abre el documento si dejó sugerencias. */
      if (sugiriendo) {
        const fresco = await fetchStatus();
        if ((resultado?.sectionCount ?? 0) > 0) {
          const n = fresco?.sugerenciasPendientes ?? 0;
          /* Usarlas o descartarlas es editar el documento (`handoff.write`): quien solo puede congelar (el CSE)
             las pide, pero las revisa quien edita el handoff. */
          toast.success(
            canEdit
              ? n === 1
                ? "Lo nuevo quedó como una sugerencia en el documento: úsala o descártala."
                : `Lo nuevo quedó como ${n} sugerencias en el documento: úsalas o descártalas.`
              : n === 1
                ? "Lo nuevo quedó como una sugerencia en el documento. La revisa quien edita el handoff."
                : `Lo nuevo quedó como ${n} sugerencias en el documento. Las revisa quien edita el handoff.`,
          );
          bajarAlDocumento.current = true;
          setShowDoc(true);
        } else {
          toast.info("No encontré nada nuevo en las reuniones desde que se congeló el handoff.");
        }
        return;
      }
      // 3. Sync a HubSpot (best-effort; reconciliable)
      if (handoffId) {
        fetch("/api/handoffs/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handoffId }),
        }).catch(() => {});
      }
      // 4. Refrescar estado + tags + abrir el doc + avisar al cronograma (las fases las creó el handoff)
      await fetchStatus();
      fetchTags(); // el agente puede haber detectado/actualizado la clasificación (tags + modalidad)
      setShowDoc(true);
      bumpTimelineRefresh();
      bumpGpsRefresh(); // el widget del proyecto (pills de setup) se actualiza: handoff → ✓
      bumpCanvasRefresh(); // el handoff pudo auto-crear el canvas "Desarrollo" → el panel lo muestra sin recargar
      void notifyAgentDone({ group: "handoff", ok: true, url: notifyUrl });
    } catch {
      setError(sugiriendo ? "Error de conexión al buscar lo nuevo." : "Error de conexión al generar el handoff.");
    } finally {
      setGenerating(false);
    }
  }, [projectId, clientId, track, toast, fetchStatus, fetchTags, status?.agentId, status?.contextExclusions, exclusions, exclusionsDirty, canEdit, bumpTimelineRefresh, bumpGpsRefresh, bumpCanvasRefresh]);

  /** «Congelar» (3b): foto protegida + hito; desde ahí la IA ya no lo regenera. */
  const handleCongelar = useCallback(async () => {
    setCongelando(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff/congelar`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.message ?? d.error ?? "No se pudo congelar el handoff.");
      } else {
        invalidateHandoffStatus(projectId);
        await fetchStatus();
        toast.success("Handoff congelado: la IA ya no lo regenera.");
      }
    } catch {
      setError("Error de conexión al congelar el handoff.");
    } finally {
      setCongelando(false);
      setConfirmarCongelar(false);
    }
  }, [projectId, fetchStatus, toast]);

  /** «Rehacer desde cero» (3b): con el motivo, la generación de siempre; al terminar queda congelado otra vez. */
  const motivoListo = motivoRehacer.trim().length >= MOTIVO_MINIMO;
  const handleRehacer = useCallback(() => {
    const motivo = motivoRehacer.trim();
    if (motivo.length < MOTIVO_MINIMO) return;
    setRehacerAbierto(false);
    setMotivoRehacer("");
    void handleGenerate({ modo: "rehacer", motivo });
  }, [motivoRehacer, handleGenerate]);

  // Gate CONJUNTO status+me: si la sección se pintara apenas llega el status pero antes
  // de /api/me, el bloque de contexto de editores se INSERTARÍA después (canEdit pasa a
  // true tarde) empujando todo el canvas — era el segundo salto. `me` está cacheado a
  // nivel módulo, así que esta espera extra solo existe en el primer montaje de la sesión.
  if (loading || me === null) return <HandoffSectionSkeleton expanded={me?.capabilities.includes("handoffAnywhere") ?? false} />;
  if (!status) return null;

  if (status.duenio?.redirigido) {
    return (
      <HandoffDelHermano
        canvasId={status.canvasId}
        generated={status.generated}
        duenio={status.duenio}
        showDoc={showDoc && visible}
        onToggleDoc={() => setShowDoc((v) => !v)}
        canEdit={canEdit}
      />
    );
  }

  const { generated } = status;
  const readiness = status.handoffReadiness ?? { feedingCount: 0, withTranscript: 0, manualSources: 0 };
  // Hay quién alimente, pero nada con transcript ni fuentes manuales → generaría vacío
  // (el gate del server igual corta con mensaje claro; esto evita el click a ciegas).
  const noMaterial =
    readiness.feedingCount > 0 && readiness.withTranscript === 0 && readiness.manualSources === 0;

  const badge = generating
    ? <span className="rounded-full border border-warn-line bg-warn-surface px-2 py-px text-[11px] font-semibold text-warn-ink">{phase ?? "Generando…"}</span>
    : generated
    ? <span className="rounded-full border border-success-line bg-success-surface px-2 py-px text-[11px] font-semibold text-success-ink">✓ Generado</span>
    : <span className="rounded-full border border-line bg-surface-muted px-2 py-px text-[11px] font-semibold text-fg-muted">Sin generar</span>;

  const esVenta = status.pipelineKey !== "development" && status.pipelineKey !== "web";
  const estaCongelado = status.congelado?.congelado === true;
  const sugerenciasPendientes = status.sugerenciasPendientes ?? 0;
  const exclusionesSinGuardar = exclusionsDirty && exclusions.trim() !== (status.contextExclusions ?? "");

  return (
    <div className="contents">
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      {/* ── LA CABECERA, con la acción arriba a la derecha (pedido de Elías, 2026-10-04) ───
          «Handoff Sales→CS» nombra el PROCESO que produjo el documento, no lo que contiene: quien
          abre un proyecto busca qué se vendió. El rótulo del proceso se queda —es como el equipo lo
          llama— pero deja de ser lo primero que se lee. Para un Desarrollo o un Sitio web no hubo
          traspaso de Ventas a CS, así que tampoco se titula como una venta. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className={ROTULO_DEL_SISTEMA}>
            {esVenta ? "Información de la venta" : "Información del proyecto"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* ⚠ "Sales→CS" SOLO para una Implementación de HubSpot —y para un pipeline sin
                declarar, que degrada al comportamiento de siempre—. */}
            <h3 className="text-[15px] font-semibold text-fg">
              {esVenta ? "Handoff Sales→CS" : "Handoff del proyecto"}
            </h3>
            {badge}
          </div>
          <p className="text-xs text-fg-muted">
            {generated
              ? `Armado con ${status.sourceSessions.length} reunión${status.sourceSessions.length === 1 ? "" : "es"} del proyecto${status.lastRunAt ? ` · ${fmtDate(status.lastRunAt)}` : ""}`
              : readiness.feedingCount > 0 || readiness.manualSources > 0
              ? // Tanda L: ya no es un cupo fijo — "cumplen la regla" en vez de "alimentarán", porque
                // cuáles entran de verdad al documento depende del presupuesto de contexto.
                `${readiness.feedingCount} reunión${readiness.feedingCount === 1 ? "" : "es"} cumplen la regla (${readiness.withTranscript} con transcripción${readiness.manualSources > 0 ? `, ${readiness.manualSources} fuente${readiness.manualSources === 1 ? "" : "s"} manual${readiness.manualSources === 1 ? "" : "es"}` : ""}). Las que entran al documento dependen del espacio disponible.`
              : "Ninguna reunión alimenta este handoff todavía: revisa el contexto o pega una fuente manual."}
          </p>
          {/* 3b: «Congelado el 2 sep, al aplicar el cronograma · N sugerencias para revisar». */}
          {estaCongelado && status.congelado && (
            <p className="text-xs text-fg-muted">
              {lineaDelCongelado(status.congelado)}
              {sugerenciasPendientes > 0 && (
                <>
                  {" · "}
                  <BotonEnlace
                    className="py-0"
                    onClick={() => {
                      if (!showDoc) bajarAlDocumento.current = true;
                      setShowDoc(true);
                    }}
                  >
                    {sugerenciasPendientes === 1 ? "1 sugerencia para revisar" : `${sugerenciasPendientes} sugerencias para revisar`}
                  </BotonEnlace>
                </>
              )}
            </p>
          )}
          {/* ── EL ENLACE DISCRETO AL HERMANO MAYOR ── una línea, no un bloque: este proyecto TIENE
              su handoff y lo genera acá; el alcance vendido vive en la implementación. */}
          {status.hermanoMayor && (
            <p className="text-xs text-fg-muted">
              Cuelga de{" "}
              <a
                href={`/clients/${status.hermanoMayor.clientId}?tab=${status.hermanoMayor.projectId}`}
                className="font-medium text-brand hover:underline"
              >
                {status.hermanoMayor.projectName}
              </a>
              {" "}— ver su handoff
            </p>
          )}
        </div>
        {/* 3b: congelado, «Regenerar» pasa a «Buscar lo nuevo» (sugerencias en borrador) y queda el enlace
            secundario «Rehacer desde cero», con motivo. Sin congelar, «Congelar» al lado de «Regenerar».
            «Congelar» y «Buscar lo nuevo» piden `handoff.congelar` (el CSE la tiene); generar, regenerar y
            rehacer, la celda de siempre. Las mismas que pide el servidor. */}
        {(canGenerateHandoff || (generated && puedeCongelar)) &&
          (!generated && estaCongelado ? (
            /* Congelado y vacío (alguien lo vació a mano: sigue editable). «Generar» daría 409 HANDOFF_CONGELADO y
               «Buscar lo nuevo» no tiene sobre qué sugerir: la salida es rehacerlo, con motivo, y queda congelado
               otra vez. */
            <BotonAzul
              className="flex-shrink-0"
              onClick={() => setRehacerAbierto(true)}
              disabled={generating}
              title="El handoff está congelado y vacío. La IA lo vuelve a escribir con todas las reuniones; pide un motivo y al terminar queda congelado otra vez."
            >
              {generating ? (phase ?? "Generando…") : "Rehacer desde cero"}
            </BotonAzul>
          ) : !generated ? (
            <BotonAzul className="flex-shrink-0" onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? (phase ?? "Generando…") : "Generar handoff"}
            </BotonAzul>
          ) : estaCongelado ? (
            <div className="flex flex-shrink-0 items-center gap-2">
              {canGenerateHandoff && (
                <BotonTexto
                  onClick={() => setRehacerAbierto(true)}
                  disabled={generating}
                  title="La IA lo vuelve a escribir con todas las reuniones. Pide un motivo y al terminar queda congelado otra vez."
                >
                  Rehacer desde cero
                </BotonTexto>
              )}
              {puedeCongelar && (
                <BotonEnlace
                  onClick={() => void handleGenerate({ modo: "sugerir" })}
                  disabled={generating}
                  title="Lee las reuniones posteriores al congelado y deja lo nuevo como sugerencias en el documento, con su cita."
                >
                  {generating ? (phase ?? "Buscando…") : "Buscar lo nuevo"}
                </BotonEnlace>
              )}
            </div>
          ) : (
            <div className="flex flex-shrink-0 items-center gap-2">
              {puedeCongelar && (
                <BotonBlanco
                  onClick={() => setConfirmarCongelar(true)}
                  disabled={generating || congelando}
                  title="Deja el handoff como la foto fija de lo vendido: la IA ya no lo regenera."
                >
                  {congelando ? "Congelando…" : "Congelar"}
                </BotonBlanco>
              )}
              {canGenerateHandoff && (
                <BotonEnlace onClick={() => void handleGenerate()} disabled={generating}>
                  {generating ? (phase ?? "Generando…") : "Regenerar"}
                </BotonEnlace>
              )}
            </div>
          ))}
      </div>

      {/* ── «¿QUÉ SE VENDIÓ?», EN TRES FRASES ────────────────────────────────
          El documento son 12 secciones y esa pregunta —la única con la que todo el mundo lo
          abre— solo se contestaba leyéndolo entero. Lo escribe la IA a partir del documento
          ya generado (criterio y tope en `lib/handoff/resumen.ts`). Desde el 2026-10-04 se
          escribe SOLO al abrir el Resumen si falta o quedó viejo (ver el efecto de `resumenPedido`);
          el botón queda para cuando eso falló o quien mira no puede generar. */}
      {generated && (status.handoffResumen || (puedeResumir && resumiendo)) && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-muted p-3">
          <span className={`flex items-center gap-1 ${ROTULO_DEL_SISTEMA}`}>
            <IconoDeSugerencia className="h-3 w-3 text-brand" />
            Qué se vendió
          </span>
          {status.handoffResumen ? (
            <p className="text-[13px] leading-relaxed text-fg-secondary">{status.handoffResumen}</p>
          ) : (
            <p className="text-[13px] leading-relaxed text-fg-muted">La IA está leyendo el handoff para resumirlo en tres frases…</p>
          )}
          {status.handoffResumen && status.handoffResumenViejo && (
            <p className="text-xs text-warn-ink">
              El handoff se regeneró después de este resumen.{" "}
              {puedeResumir && (
                <button
                  onClick={() => void handleResumen()}
                  disabled={resumiendo}
                  className="font-semibold underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
                >
                  {resumiendo ? "Actualizando…" : "Actualizarlo"}
                </button>
              )}
            </p>
          )}
        </div>
      )}
      {generated && !status.handoffResumen && !resumiendo && puedeResumir && (
        <div className="-ml-1.5">
          <BotonTexto
            onClick={() => void handleResumen()}
            title="Escribe con IA un resumen de tres frases de lo que se vendió, a partir de este handoff."
          >
            Resumir qué se vendió
          </BotonTexto>
        </div>
      )}
      {noMaterial && !generated && (
        <p className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs text-warn-ink">
          Las reuniones que alimentan este handoff aún no tienen transcripción: el handoff saldría vacío.
        </p>
      )}
      {/* #5 — la clasificación del proyecto, compartida con el BC. UN solo eje de datos. */}
      <TagsStrip tags={tags} canEdit={canManageContext} onSetTags={saveTags} servicio={servicio} />

      {/* «Contexto del handoff» — HubSpot · Reuniones · Fuentes manuales (· Preventa). Vive ADENTRO
          de la tarjeta del handoff (2026-10-07, pedido de Elías): solo lo lee su agente, y a todo el
          ancho, debajo del resumen del proyecto, se leía como contexto del Resumen. El CSE (owner)
          también lo ve y gestiona; el server enforce el scope de owner. */}
      {canManageContext && (
        <div className="overflow-hidden rounded-lg border border-line [&>div]:border-t-0">
          <ProjectContextSection
            projectId={projectId}
            canEdit={canManageContext}
            generated={generated}
            onSessionsChange={fetchStatus}
          />
        </div>
      )}

      {(generated && status.canvasId) || puedeVerHistorial ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {generated && status.canvasId && (
            <BotonBlanco
              className="rounded-lg px-3 py-[7px] text-[13px] font-normal"
              onClick={() => {
                if (!showDoc) bajarAlDocumento.current = true;
                setShowDoc(!showDoc);
              }}
            >
              {showDoc ? "Ocultar el documento" : "Ver documento"}
            </BotonBlanco>
          )}
          <span className="flex-1" />
          {/* Regenerar BORRA los bloques de la corrida anterior, así que lo que el agente había
              escrito antes sobrevive solo dentro del run — y no había forma de abrirlo. */}
          {puedeVerHistorial && (
            <BotonTexto onClick={() => setShowHistorial(true)} title="Corridas anteriores del agente de handoff (solo lectura)">
              Ver historial
            </BotonTexto>
          )}
          {/* El handoff no aparece en el desplegable de canvases: a su PDF solo se llega por acá. */}
          {generated && status.canvasId && (
            <a
              href={`/print/canvas/${clientId}/${status.canvasId}?print=1&projectId=${projectId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded px-1.5 py-[5px] text-xs text-fg-muted transition-colors hover:text-fg"
              title="Abre una vista imprimible para guardar como PDF"
            >
              Exportar PDF
            </a>
          )}
        </div>
      ) : null}

      {error && (
        <Alert variant="danger" title="No se pudo completar">
          {error}
        </Alert>
      )}
    </section>

      {/* ── EL DOCUMENTO, PEGADO A SU TARJETA ──────────────────────────────────────
          Iba al final, debajo de «Alrededor del handoff»: con el contexto abierto quedaba a dos
          pantallas y «Ver documento» parecía no hacer nada. Ahora se abre acá, a todo el ancho,
          y la vista baja hasta él. Es interno: nunca se publica al cliente. */}
      {generated && showDoc && visible && status.canvasId && (
        <section ref={docRef} className="scroll-mt-6 overflow-hidden rounded-xl border border-line bg-surface lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-muted px-4 py-2">
            <span className={ROTULO_DEL_SISTEMA}>El documento del handoff · interno</span>
            <span className="flex items-center gap-2 text-xs text-fg-muted">
              {canEdit ? "Se edita en el lugar" : "Solo lectura"}
              <BotonTexto onClick={() => setShowDoc(false)}>Cerrar</BotonTexto>
            </span>
          </div>
          <div className="bg-surface-muted p-4">
            <CanvasLinearView projectId={projectId} canvasId={status.canvasId} canEdit={canEdit} destacarKey={HANDOFF_SECCION_PRINCIPAL} />
          </div>
        </section>
      )}

    {/* ── ALREDEDOR DEL HANDOFF ──────────────────────────────────────────────────
        Lo que persigue el cliente, lo que pidió fuera de lo vendido y las exclusiones. Filas
        plegables con la misma cabecera (FilaDeAlrededor). A todo el ancho; desaparece si no hay
        ninguna fila. El contexto se mudó a la tarjeta del handoff (2026-10-07). */}
    <section className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface empty:hidden lg:col-span-2 [&>*:first-child]:border-t-0">

      {/* Los resultados del cliente como lista medible (2026-10-02): la única captura de su línea
          base y su meta — los objetivos del diagnóstico los toman de acá. Desde el 2026-10-05 se
          editan y se confirman en Información del cliente («Resultados que persigue»): acá solo se
          leen, con el enlace para ir allá (pedido de Elías: estaban dos veces, en dos formatos). */}
      {generated && visible && (
        <FilaDeAlrededor
          titulo="Resultados que persigue el cliente"
          ayuda="Se leen acá; se editan y se confirman en Información del cliente."
          meta={
            cuentaDeResultados === null
              ? undefined
              : cuentaDeResultados.pendientes > 0
              ? `${cuentaDeResultados.pendientes} sin confirmar`
              : `${cuentaDeResultados.total} resultado${cuentaDeResultados.total === 1 ? "" : "s"}`
          }
          metaTono={cuentaDeResultados && cuentaDeResultados.pendientes > 0 ? "atencion" : "neutro"}
          abierto={verResultados}
          onAlternar={() => setVerResultados((v) => !v)}
        >
          <ResultadosMediblesDelHandoff
            projectId={projectId}
            canEdit={false}
            soloLectura
            enlaceParaEditar={`${pathname}?tab=${SENTINEL_SERVICE_TYPE}`}
            onCuenta={alContarResultados}
          />
        </FilaDeAlrededor>
      )}

      {/* Lo que el cliente pidió en las reuniones y no está en lo vendido (2026-10-02): el CSE decide. */}
      {visible && <PedidosFueraDeAlcance projectId={projectId} clientId={clientId} />}

      {/* Exclusiones para el handoff — texto libre del CSE que el agente debe ignorar
          (temas de OTROS proyectos del cliente). Se inyecta como regla dura al generar. */}
      {canEdit && (
        <FilaDeAlrededor
          titulo="Exclusiones para el handoff"
          ayuda="Lo que el agente no debe tomar en cuenta."
          meta={
            exclusionesSinGuardar
              ? "sin guardar · se guardan al regenerar"
              : status.contextExclusions || status.exclusionAutomatica
              ? "activas"
              : "ninguna"
          }
          metaTono={exclusionesSinGuardar ? "atencion" : "neutro"}
          abierto={showExcl}
          onAlternar={() => setShowExcl((v) => !v)}
        >
          <div className="space-y-2">
            {/* ── LA EXCLUSIÓN QUE PONE LA APP ─────────────────────────────────
                Se calcula en cada generación y no se guarda en ningún lado: no se puede
                borrar ni por accidente ni a propósito (decisión de Elías, 2026-08-08).
                Se PINTA porque si no, el encargado abriría este panel, vería el campo vacío,
                creería que el proyecto no tiene ninguna exclusión, y escribiría a mano lo que
                la app ya está diciendo. */}
            {status.exclusionAutomatica && (
              <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <svg className="h-3 w-3 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className={ROTULO_DEL_SISTEMA}>
                    La pone la app · siempre activa
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-fg-secondary">
                  {status.exclusionAutomatica}
                </p>
              </div>
            )}
            <p className="text-xs leading-relaxed text-fg-muted">
              {status.exclusionAutomatica ? "Suma acá otros t" : "T"}emas que el agente debe
              IGNORAR al generar: útil cuando el cliente tiene varios proyectos (ej.
              &quot;ignora el proyecto DocuSign&quot;, &quot;no hables de contratos&quot;).
              {estaCongelado
                ? " El handoff está congelado: si las cambias, valen la próxima vez que busques lo nuevo."
                : " Si las cambias, regenera el handoff (y después el kickoff)."}
            </p>
            <textarea
              value={exclusions}
              onChange={(e) => { setExclusions(e.target.value); setExclusionsDirty(true); }}
              rows={3}
              maxLength={5000}
              placeholder='Ej.: "Ignora todo lo relativo al proyecto de contratos en DocuSign."'
              className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
            />
            <div className="flex justify-end">
              <BotonBlanco
                onClick={() => void saveExclusions()}
                disabled={savingExcl || !exclusionsDirty || exclusions.trim() === (status.contextExclusions ?? "")}
              >
                {savingExcl ? "Guardando…" : "Guardar exclusiones"}
              </BotonBlanco>
            </div>
          </div>
        </FilaDeAlrededor>
      )}
    </section>

      {showHistorial && (
        <HistorialHandoffModal projectId={projectId} onClose={() => setShowHistorial(false)} />
      )}

      {/* 3b · «Congelar»: se confirma, porque desde ahí la IA ya no lo regenera. */}
      <ConfirmDialog
        open={confirmarCongelar}
        onCancel={() => !congelando && setConfirmarCongelar(false)}
        onConfirm={handleCongelar}
        loading={congelando}
        variant="default"
        title="¿Congelar el handoff?"
        description="Queda como la foto fija de lo vendido: la IA ya no lo regenera. Lo puedes seguir editando a mano, y lo nuevo de las reuniones llega como sugerencias con «Buscar lo nuevo». Para volver a escribirlo entero hay que rehacerlo desde cero, con un motivo."
        confirmLabel="Congelar"
      />

      {/* 3b · «Rehacer desde cero»: pide el motivo (queda en el historial del documento). */}
      <Modal
        open={rehacerAbierto}
        onClose={() => setRehacerAbierto(false)}
        title="¿Rehacer el handoff desde cero?"
        description="La IA lo vuelve a escribir con todas las reuniones, como la primera vez. Lo que editaste a mano se conserva y las sugerencias sin revisar se descartan. Al terminar queda congelado otra vez."
        size="md"
        footer={
          <>
            <BotonBlanco onClick={() => setRehacerAbierto(false)}>Cancelar</BotonBlanco>
            <BotonAzul onClick={handleRehacer} disabled={!motivoListo || generating}>
              Rehacer desde cero
            </BotonAzul>
          </>
        }
      >
        <Field
          label="Por qué lo rehaces"
          hint={`${MOTIVO_MINIMO} caracteres o más. Por ejemplo: «Ciclo 2: arranca el área de Servicio».`}
          required
        >
          <Textarea
            value={motivoRehacer}
            onChange={(e) => setMotivoRehacer(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Cuenta qué cambió para que haga falta volver a escribirlo."
          />
        </Field>
      </Modal>
    </div>
  );
}

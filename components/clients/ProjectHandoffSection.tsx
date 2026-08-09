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
import { useState, useEffect, useCallback } from "react";
import CanvasLinearView from "@/components/canvas/CanvasLinearView";
import { useAgentRun } from "@/hooks/useAgentRun";
import { notifyAgentDone, maybeRequestPermission } from "@/lib/notifications/client";
import { useWorkspace } from "./WorkspaceContext";
import { useMe } from "@/hooks/useMe";
import ProjectContextSection from "./ProjectContextSection";
import TagsStrip from "@/components/tags/TagsStrip";
import type { ImplementationType } from "@prisma/client";
import type { ProjectPipelineKey } from "@/lib/projects/kind";
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
  implementationType: "IMPLEMENTATION" | "REIMPLEMENTATION" | null;
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
          <CanvasLinearView projectId={duenio.projectId} canvasId={canvasId} canEdit={canEdit} />
        </div>
      )}
    </section>
  );
}

export default function ProjectHandoffSection({ projectId, clientId }: { projectId: string; clientId: string }) {
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
  const { bumpTimelineRefresh, bumpGpsRefresh, bumpCanvasRefresh } = useWorkspace();
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
  const [showExcl, setShowExcl] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff`);
      if (r.ok) {
        const d = (await r.json()) as HandoffStatus;
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

  // Modalidad (impl/re-impl) — override del CSE/editor; acepta null ("Sin definir"). Optimista.
  const setModality = useCallback(async (value: ImplementationType | null) => {
    setStatus((s) => (s ? { ...s, implementationType: value } : s));
    try {
      const r = await fetch(`/api/projects/${projectId}/implementation-type`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationType: value }),
      });
      if (!r.ok) { setError("No se pudo guardar la modalidad."); fetchStatus(); }
    } catch {
      setError("Error de conexión al guardar la modalidad."); fetchStatus();
    }
  }, [projectId, fetchStatus]);

  // Guardar exclusiones (mismo patrón que setModality: fetch + error visible + refetch).
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

  const handleGenerate = useCallback(async () => {
    const agentId = status?.agentId;
    if (!agentId) { setError("No se encontró el agente de handoff."); return; }
    maybeRequestPermission(); // gesto del usuario → ofrecer activar notificaciones (una vez)
    invalidateHandoffStatus(projectId); // el status va a cambiar: que un cambio de tab no pinte el viejo
    setGenerating(true);
    setError(null);
    // A la pestaña del proyecto, no a la home del cliente (el handoff vive ahí).
    const notifyUrl = `/clients/${clientId}?tab=${encodeURIComponent(projectId)}`;
    try {
      // 0. Guardar exclusiones PENDIENTES del textarea: escribir y regenerar directo
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

      // 1. Asegurar entidad Handoff + canvas
      const ensure = await fetch(`/api/projects/${projectId}/handoff`, { method: "POST" });
      const ensureData = await ensure.json().catch(() => ({}));
      if (!ensure.ok) { setError(ensureData.error ?? "No se pudo preparar el handoff."); return; }
      const handoffId: string | undefined = ensureData.handoffId;

      // 2. Correr el agente handoff (async/background, scopeado a las sesiones del proyecto)
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, projectId, async: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // NO_PROJECT_SESSIONS u otro error → mostrar el mensaje claro, no generar.
        setError(data.message ?? data.error ?? "No se pudo generar el handoff.");
        return;
      }
      if (data.runId) {
        const result = await track(data.runId);
        if (result.status === "ERROR") {
          // result.error viene humanizado desde AgentRun.output.error (créditos/429/timeout…).
          setError(result.error ?? "El handoff falló durante la generación. Reintentá.");
          void notifyAgentDone({ group: "handoff", ok: false, url: notifyUrl });
          return;
        }
        if (result.status === "TIMEOUT") { setError("La generación está tardando más de lo normal. Revisá en unos minutos."); return; }
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
      setError("Error de conexión al generar el handoff.");
    } finally {
      setGenerating(false);
    }
  }, [projectId, clientId, track, fetchStatus, fetchTags, status?.agentId, status?.contextExclusions, exclusions, exclusionsDirty, bumpTimelineRefresh, bumpGpsRefresh, bumpCanvasRefresh]);

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
        showDoc={showDoc}
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
    ? <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{phase ?? "Generando…"}</span>
    : generated
    ? <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Generado</span>
    : <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted bg-surface-muted border border-line rounded-full px-2 py-0.5">No generado</span>;

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <svg className="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m4 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* ⚠ "Sales→CS" SOLO para una Implementación de HubSpot —y para un pipeline sin
                declarar, que degrada al comportamiento de siempre—. Un proyecto de Desarrollo
                o un Sitio web no se entrega de Ventas a CS: titularlo así era describir un
                flujo que no ocurre. El requisito duro de la tanda es que la Implementación se
                vea EXACTAMENTE como antes, y por eso el default es el rótulo viejo. */}
            <h3 className="text-sm font-bold text-fg">
              {status.pipelineKey === "development" || status.pipelineKey === "web"
                ? "Handoff del proyecto"
                : "Handoff Sales→CS"}
            </h3>
            {badge}
          </div>
          <p className="text-xs text-fg-muted mt-0.5 truncate">
            {generated
              ? `Armado con ${status.sourceSessions.length} sesión${status.sourceSessions.length === 1 ? "" : "es"} del proyecto${status.lastRunAt ? ` · ${fmtDate(status.lastRunAt)}` : ""}`
              : readiness.feedingCount > 0 || readiness.manualSources > 0
              ? `${readiness.feedingCount} sesión${readiness.feedingCount === 1 ? "" : "es"} alimentarán este handoff (${readiness.withTranscript} con transcript${readiness.manualSources > 0 ? `, ${readiness.manualSources} fuente${readiness.manualSources === 1 ? "" : "s"} manual${readiness.manualSources === 1 ? "" : "es"}` : ""})`
              : "Ninguna sesión alimenta este handoff todavía — revisá el Contexto o pegá una fuente manual"}
          </p>
          {/* ── EL ENLACE DISCRETO AL HERMANO MAYOR ──────────────────────────────────
              Una línea, no un bloque: este proyecto TIENE su handoff y lo genera acá. Lo que
              el enlace resuelve es que el alcance vendido vive en la implementación, y quien
              lea éste probablemente quiera verlo. (Antes, en su lugar, se pintaba la sección
              entera del hermano en SOLO LECTURA y no había forma de generar nada acá.) */}
          {status.hermanoMayor && (
            <p className="text-[11px] text-fg-muted mt-1">
              Cuelga de{" "}
              <a
                href={`/clients/${status.hermanoMayor.clientId}?tab=${status.hermanoMayor.projectId}`}
                className="text-brand hover:underline font-medium"
              >
                {status.hermanoMayor.projectName}
              </a>
              {" "}— ver su handoff
            </p>
          )}
          {noMaterial && !generated && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1.5 inline-block">
              Las sesiones que alimentan este handoff aún no tienen transcripción — el handoff saldría vacío.
            </p>
          )}
          {/* #5 — clasificación del proyecto (modalidad + productos/alcance), compartida con el BC. */}
          <div className="mt-2">
            <TagsStrip
              tags={tags}
              implementationType={status.implementationType}
              canEdit={canManageContext}
              onSetTags={saveTags}
              onSetModality={setModality}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {generated && status.canvasId && (
            <button
              onClick={() => setShowDoc((v) => !v)}
              className="text-xs font-medium text-fg-muted hover:text-fg px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors"
            >
              {showDoc ? "Ocultar" : "Ver documento"}
            </button>
          )}
          {/* Regenerar BORRA los bloques de la corrida anterior, así que lo que el agente había
              escrito antes sobrevive solo dentro del run — y no había forma de abrirlo. Estilo
              de texto igual que "Ver documento" a propósito: los dos son el mismo gesto (abrir
              algo para leer), y el botón brand sigue siendo el único enfatizado de la barra. */}
          {puedeVerHistorial && (
            <button
              onClick={() => setShowHistorial(true)}
              className="text-xs font-medium text-fg-muted hover:text-fg px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors"
              title="Corridas anteriores del agente de handoff (solo lectura)"
            >
              Ver historial
            </button>
          )}
          {/* El handoff no aparece en el desplegable de canvases, así que nunca pasó por el
              botón del panel: hasta ahora, a su PDF solo se llegaba escribiendo la URL a
              mano. Su contenido son bloques de canvas y la vista imprimible ya los rinde
              bien — le faltaba únicamente la puerta. Mismo enlace que usa ClientInfoPanel. */}
          {generated && status.canvasId && (
            <a
              href={`/print/canvas/${clientId}/${status.canvasId}?print=1&projectId=${projectId}`}
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
          {canGenerateHandoff && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {generating ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : null}
              {generating ? (phase ?? "Generando…") : generated ? "Regenerar" : "Generar handoff"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 pb-3 -mt-1">
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        </div>
      )}

      {/* Contexto — HubSpot · Google Meet · Fuentes manuales, en 3 columnas colapsables.
          El CSE (owner) también lo ve y gestiona; el server enforce el scope de owner. */}
      {canManageContext && (
        <ProjectContextSection
          projectId={projectId}
          canEdit={canManageContext}
          generated={generated}
          onSessionsChange={fetchStatus}
        />
      )}

      {/* Exclusiones para el handoff — texto libre del CSE que el agente debe ignorar
          (temas de OTROS proyectos del cliente). Se inyecta como regla dura al generar. */}
      {canEdit && (
        <div className="border-t border-line px-5 py-3">
          <button
            onClick={() => setShowExcl((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-fg hover:text-brand transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showExcl ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Exclusiones para el handoff
            {exclusionsDirty && exclusions.trim() !== (status.contextExclusions ?? "") ? (
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                sin guardar — se guardan al regenerar
              </span>
            ) : status.contextExclusions || status.exclusionAutomatica ? (
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                activas
              </span>
            ) : null}
          </button>
          {showExcl && (
            <div className="mt-2 space-y-2">
              {/* ── LA EXCLUSIÓN QUE PONE LA APP ─────────────────────────────────
                  Se calcula en cada generación y no se guarda en ningún lado: no se puede
                  borrar ni por accidente ni a propósito (decisión de Elías, 2026-08-08).
                  Se PINTA porque si no, el encargado abriría este panel, vería el campo vacío,
                  creería que el proyecto no tiene ninguna exclusión, y escribiría a mano lo que
                  la app ya está diciendo. */}
              {status.exclusionAutomatica && (
                <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <svg className="w-3 h-3 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                      La pone la app · siempre activa
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-secondary leading-relaxed">
                    {status.exclusionAutomatica}
                  </p>
                </div>
              )}
              <p className="text-[11px] text-fg-muted leading-relaxed">
                {status.exclusionAutomatica ? "Sumá acá otros t" : "T"}emas que el agente debe
                IGNORAR al generar — útil cuando el cliente tiene varios proyectos (ej.
                &quot;ignorá el proyecto DocuSign&quot;, &quot;no hables de contratos&quot;).
                Si las cambiás, regenerá el handoff (y después el kickoff).
              </p>
              <textarea
                value={exclusions}
                onChange={(e) => { setExclusions(e.target.value); setExclusionsDirty(true); }}
                rows={3}
                maxLength={5000}
                placeholder='Ej.: "Ignorá todo lo relativo al proyecto de contratos en DocuSign."'
                className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand resize-y"
              />
              <div className="flex justify-end">
                <button
                  onClick={saveExclusions}
                  disabled={savingExcl || !exclusionsDirty || exclusions.trim() === (status.contextExclusions ?? "")}
                  className="text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {savingExcl ? "Guardando…" : "Guardar exclusiones"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {generated && showDoc && status.canvasId && (
        <div className="border-t border-line px-4 py-4">
          <CanvasLinearView projectId={projectId} canvasId={status.canvasId} canEdit={canEdit} />
        </div>
      )}

      {showHistorial && (
        <HistorialHandoffModal projectId={projectId} onClose={() => setShowHistorial(false)} />
      )}
    </section>
  );
}

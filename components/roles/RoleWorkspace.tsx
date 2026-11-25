"use client";

/**
 * components/roles/RoleWorkspace.tsx — la página de UN rol (perfil de puesto),
 * renderizada y EDITADA con el mismo motor de landing (`LandingView`) que los business
 * cases y el kickoff. Un toggle "Editar" cambia de lectura a edición WYSIWYG in-situ
 * (cards, bloque 4DX, escalera de madurez, tooltips) + drag&drop de ítems. Los cambios se
 * guardan solos (PATCH /api/roles/[id], debounce): el hero (title/area/summary) va a los
 * metadatos, el resto a `content[sectionKey]`.
 *
 * Robustez del autosave (2026-07-19): el debounce de 700ms flushea también en
 * `pagehide`/`visibilitychange→hidden` con fetch keepalive (cerrar la pestaña en la
 * ventana del debounce ya no pierde el último cambio), y cada edición registra su
 * deshacer en el UndoProvider global (Ctrl+Z fuera de un campo; adentro sigue siendo
 * el undo nativo del texto — guard del provider).
 *
 * SOLO SUPER_ADMIN (la ruta ya gatea antes de montar esto) — no hay vista pública de un
 * rol, así que lectura y edición conviven en un solo componente con el toggle.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconCheck } from "@/components/ui";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { useUndo } from "@/components/ui/UndoProvider";
import ChatDeUnPedido, { PuntoDePropuesta } from "@/components/asistente/ChatDeUnPedido";
import { Burbuja } from "@/components/asistente/CajonDeNexus";
import PropuestaDeSecciones from "@/components/ai/PropuestaDeSecciones";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import { useEjecutarOperacionesDelChatDeRol } from "@/components/asistente/ejecutar-operaciones-de-rol";
import { ChatDeSeccionDisponible } from "@/components/asistente/chat-de-seccion";
import { landingConfigForDocType } from "@/components/landing/configs/doc-type";
import { contentKeysForDocType, escalaForDocType, sectionDefsForDocType } from "@/lib/roles/doc-type";
import { ROLE_DOC_TYPE_LABEL, type RoleDocTypeValue } from "@/lib/roles/roles-ui";

/** Respuesta de POST /api/roles/[id]/assist (espejo de DocumentAssistResult + runId). */
interface AssistResult {
  proposal: Record<string, unknown>;
  summary: string[];
  reasoning?: string;
  warnings: string[];
  citations: { url: string; title: string }[];
  usedWebSearch: boolean;
  runId: string;
}

const ASSIST_CHIPS = [
  "Documenta mejor este puesto respecto a 4DX",
  "Haz las medidas más accionables",
  "Resume el perfil en menos líneas",
  "Completa las secciones vacías",
];

interface RoleInput {
  id: string;
  docType: RoleDocTypeValue;
  title: string;
  area: string | null;
  summary: string | null;
  content: Record<string, unknown>;
}

type SaveState = "idle" | "saving" | "saved";

/** Estable, para no recrear el contexto del chat cuando no hay chat que abrir. */
const NO_ABRE = () => {};

export default function RoleWorkspace({
  role,
  onAbrirChat,
}: {
  role: RoleInput;
  /**
   * Abre el cajón del asistente. Lo pasa `RolConChat`, que es quien lo monta.
   *
   * ⚠ Opcional: sin él el botón «Cambiar» de cada sección no aparece, en vez de aparecer y no
   * hacer nada.
   */
  onAbrirChat?: () => void;
}) {
  const docType = role.docType;
  // Label humano de una sección para el toast de undo ("Edición en Responsabilidades").
  // Sale de la plantilla del TIPO: las dos comparten keys con títulos distintos.
  const SECTION_LABELS: Record<string, string> = Object.fromEntries(
    sectionDefsForDocType(docType).map((d) => [d.key, d.label]),
  );
  const toast = useToast();
  const { pushUndo, registerScope } = useUndo();
  const undoScope = `roles:${role.id}`;
  useEffect(() => registerScope(undoScope), [registerScope, undoScope]);

  const [editing, setEditing] = useState(false);
  const [meta, setMeta] = useState({ title: role.title, area: role.area ?? "", summary: role.summary ?? "" });
  const [content, setContent] = useState<Record<string, unknown>>(role.content ?? {});
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Verdad viva para el flush (el debounce no debe cerrar sobre estado viejo). Se
  // actualiza en el event handler (nunca durante el render) y es la base para derivar
  // el próximo estado, así ediciones rápidas encadenadas no pisan lo anterior.
  const latest = useRef({ meta, content });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flush = useCallback(async (opts?: { keepalive?: boolean }) => {
    const { meta: m, content: c } = latest.current;
    const body: Record<string, unknown> = {
      area: m.area.trim() || null,
      summary: m.summary.trim() || null,
      content: c,
    };
    if (m.title.trim()) body.title = m.title.trim(); // title es requerido: nunca vacío
    if (opts?.keepalive) {
      // La página se está cerrando/ocultando: fetch keepalive fire-and-forget, sin UI.
      // El content de un rol pesa KBs — muy por debajo del límite de 64KB de keepalive.
      void fetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
      return;
    }
    try {
      await fetchJson(`/api/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaveState("saved");
    } catch (e) {
      setSaveState("idle");
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    }
  }, [role.id, toast]);

  const schedule = useCallback(() => {
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 700);
  }, [flush]);

  // Cerrar la pestaña / cambiar de app en la ventana del debounce YA NO pierde el
  // último PATCH: se flushea con keepalive. visibilitychange→hidden además guarda
  // más temprano al cambiar de tab (el timer pendiente se consume, no se duplica).
  useEffect(() => {
    const flushPending = () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      void flush({ keepalive: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushPending();
    };
    window.addEventListener("pagehide", flushPending);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushPending);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flush]);

  // "Guardado ✓" vuelve a idle solo (antes quedaba pegado para siempre).
  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  const onSectionChange = (key: string, data: unknown) => {
    // Snapshot PREVIO para el undo — capturado antes de mutar. El coalesce del
    // provider conserva la PRIMERA entrada de una ráfaga (~800ms), así Ctrl+Z
    // revierte al estado pre-ráfaga, no al del último tecleo.
    const prevMeta = latest.current.meta;
    const prevSectionData = key === "hero" ? null : latest.current.content[key];

    if (key === "hero") {
      const d = data as { title?: string; area?: string; summary?: string };
      const nextMeta = { title: d.title ?? "", area: d.area ?? "", summary: d.summary ?? "" };
      latest.current = { ...latest.current, meta: nextMeta };
      setMeta(nextMeta);
    } else {
      const nextContent = { ...latest.current.content, [key]: data };
      latest.current = { ...latest.current, content: nextContent };
      setContent(nextContent);
    }

    pushUndo({
      scope: undoScope,
      label: `Edición en ${SECTION_LABELS[key] ?? "el perfil"}`,
      coalesceKey: `${undoScope}|${key}`,
      undo: () => {
        if (key === "hero") {
          latest.current = { ...latest.current, meta: prevMeta };
          setMeta(prevMeta);
        } else {
          const restored = { ...latest.current.content, [key]: prevSectionData };
          latest.current = { ...latest.current, content: restored };
          setContent(restored);
        }
        schedule(); // el deshacer también persiste
      },
    });

    schedule();
  };

  // ── Assist de documento ("✨ Mejorar con IA"): instrucción → propuesta →
  // revisar → aplicar (merge local + el autosave de siempre) o descartar (la
  // propuesta nunca tocó el server). Doctrina: DECISIONS §Roles. Desde el 24 nov
  // va en el chat «Nexus» de todos (ChatDeUnPedido), no en una ventana modal.
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [assistSelected, setAssistSelected] = useState<Set<string>>(new Set());
  const [assistEnviado, setAssistEnviado] = useState<string | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);
  /** Lo que quedó al aplicar o descartar, en el hilo del chat. */
  const [assistHecho, setAssistHecho] = useState<string | null>(null);

  const assistLabel = (key: string) =>
    key === "hero" ? "Título, área y resumen" : SECTION_LABELS[key] ?? key;

  // ⚠ La propuesta de antes no se borra al pedir otra: se esconde mientras Nexus piensa y vuelve si el pedido falla.
  const submitAssist = async (instruction: string): Promise<boolean> => {
    const antes = { enviado: assistEnviado, hecho: assistHecho };
    setAssistLoading(true);
    setAssistEnviado(instruction);
    setAssistError(null);
    setAssistHecho(null);
    try {
      const result = await fetchJson<AssistResult>(`/api/roles/${role.id}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      setAssist(result);
      setAssistSelected(new Set(Object.keys(result.proposal)));
      // Si llegó con el chat cerrado, el botón lleva su punto rojo (25 nov: sin aviso flotante).
      return true;
    } catch (e) {
      setAssistError(e instanceof ApiError ? e.message : "Nexus no pudo proponer. Prueba de nuevo.");
      setAssistEnviado(antes.enviado);
      setAssistHecho(antes.hecho);
      return false;
    } finally {
      setAssistLoading(false);
    }
  };

  const applyAssist = () => {
    if (!assist) return;
    // Snapshot COMPLETO previo → una sola entrada de undo: Ctrl+Z revierte el
    // apply entero (y re-agenda el autosave — deshacer también persiste).
    const prevMeta = latest.current.meta;
    const prevContent = latest.current.content;

    let nextMeta = prevMeta;
    let nextContent = prevContent;
    for (const key of assistSelected) {
      const data = assist.proposal[key];
      if (data === undefined) continue;
      if (key === "hero") {
        const d = data as { title?: string; area?: string; summary?: string };
        nextMeta = { title: d.title ?? "", area: d.area ?? "", summary: d.summary ?? "" };
      } else {
        nextContent = { ...nextContent, [key]: data };
      }
    }
    latest.current = { meta: nextMeta, content: nextContent };
    setMeta(nextMeta);
    setContent(nextContent);

    pushUndo({
      scope: undoScope,
      label: "Propuesta de IA aplicada",
      undo: () => {
        latest.current = { meta: prevMeta, content: prevContent };
        setMeta(prevMeta);
        setContent(prevContent);
        schedule();
      },
    });

    schedule();
    setAssist(null);
    setAssistHecho("Listo: aplicado en el puesto. Ctrl+Z lo deshace.");
    toast.success("Propuesta aplicada. Ctrl+Z para deshacer.");
  };

  const sections: LandingSectionData[] = [
    { key: "hero", data: { title: meta.title, area: meta.area, summary: meta.summary } },
    ...contentKeysForDocType(docType).map((k) => ({ key: k, data: content[k] ?? null })),
  ];

  /* ⭐ El chat escribe por el MISMO camino que la edición a mano (`onSectionChange`): mismo
     autoguardado, mismo deshacer. No se abre un segundo camino de escritura.
     ⛔ `puedeOcultar`/`puedeCrear` en false los pone el ejecutor: la lista de secciones de un rol
     es fija. Ver `ejecutar-operaciones-de-rol.ts`. */
  const defsDelDoc = useMemo(
    () => Object.fromEntries(sectionDefsForDocType(docType).map((d) => [d.key, d])),
    [docType],
  );
  useEjecutarOperacionesDelChatDeRol(sections, defsDelDoc, onSectionChange);

  // El assist todavía NO corre en propuestas: 3 de sus secciones (Smarteam, partnerships y la
  // oferta) tienen el schema vacío, y `coerceToSchema` las VACIARÍA al aplicar. El endpoint
  // responde 409; acá directamente no se ofrece el botón.
  const asistible = docType === "PERFIL";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-3">
        <p className="text-xs text-fg-muted">
          {editing
            ? "Edita el contenido directamente. Arrastra ⠿ para reordenar los ítems. Se guarda solo."
            : `Vista de ${ROLE_DOC_TYPE_LABEL[docType].toLowerCase()}. Toca “Editar” para ${
                docType === "PERFIL" ? "modificarlo" : "modificarla"
              }.`}
        </p>
        <div className="flex items-center gap-3">
          {editing && (
            <span className="inline-flex items-center gap-1 text-xs text-fg-muted" aria-live="polite">
              {saveState === "saving" ? "Guardando…" : saveState === "saved" ? <>Guardado<IconCheck className="w-3 h-3" /></> : ""}
            </span>
          )}
          {asistible && (
            <button
              type="button"
              onClick={() => setAssistOpen(true)}
              aria-expanded={assistOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-line text-fg-secondary hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
            >
              ✨ Mejorar con IA
              {assist && !assistOpen && <PuntoDePropuesta />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className={
              editing
                ? "px-3 py-1.5 text-sm font-medium rounded-lg border border-line text-fg-secondary hover:bg-surface-hover"
                : "px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-fg hover:bg-primary-hover"
            }
          >
            {editing ? "Listo" : "Editar"}
          </button>
        </div>
      </div>

      <ChatDeUnPedido
        abierto={assistOpen}
        onClose={() => setAssistOpen(false)}
        subtitulo="Mejorar este puesto con IA"
        vacio={{
          intro: "Describe la mejora; Nexus propone y tú revisas antes de aplicar. Por ejemplo:",
          ejemplos: ASSIST_CHIPS,
          cierre: "Puede investigar en línea si hace falta.",
        }}
        placeholder="Por ejemplo: «documenta mejor este puesto respecto a 4DX»"
        minimo={4}
        enviado={assistEnviado}
        pidiendo={assistLoading}
        textoPensando="Nexus está preparando la propuesta… (puede investigar en línea)"
        error={assistError}
        onPedir={submitAssist}
        onNueva={() => {
          setAssistEnviado(null);
          setAssistError(null);
          setAssist(null);
          setAssistHecho(null);
        }}
      >
        {assist && !assistLoading ? (
          <PropuestaDeSecciones
            propuesta={assist}
            elegidas={assistSelected}
            alElegir={(key, va) =>
              setAssistSelected((prev) => {
                const next = new Set(prev);
                if (va) next.add(key);
                else next.delete(key);
                return next;
              })
            }
            nombreDe={assistLabel}
            onAplicar={applyAssist}
            onDescartar={() => {
              setAssist(null);
              setAssistHecho("Descartaste la propuesta: no cambió nada.");
            }}
            aplicando={false}
          />
        ) : assistHecho && !assistLoading ? (
          <Burbuja de="nexus">{assistHecho}</Burbuja>
        ) : null}
      </ChatDeUnPedido>

      <div
        className={[escalaForDocType(docType), "overflow-hidden rounded-2xl border border-line"]
          .filter(Boolean)
          .join(" ")}
      >
        {/* El botón «Cambiar» de cada sección lo pinta el motor y lo enciende esta línea.
            ⚠ Solo EDITANDO: en modo lectura no hay nada que cambiar, y el botón invitaría a
            acordar algo que después no se aplica. */}
        <ChatDeSeccionDisponible cuando={!!onAbrirChat && editing} />
        <LandingView
          config={landingConfigForDocType(docType)}
          ctx={{ clientName: "" }}
          sections={sections}
          mode={editing ? "edit" : "read"}
          showBriefs={false}
          onSectionChange={onSectionChange}
        />
      </div>
    </div>
  );
}

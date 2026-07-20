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
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { useUndo } from "@/components/ui/UndoProvider";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import { landingConfigForRoles } from "@/components/landing/configs/roles";
import { ROLE_CONTENT_KEYS, ROLE_SECTION_DEFS } from "@/components/landing/configs/roles.defs";

interface RoleInput {
  id: string;
  title: string;
  area: string | null;
  summary: string | null;
  content: Record<string, unknown>;
}

type SaveState = "idle" | "saving" | "saved";

/** Label humano de una sección para el toast de undo ("Edición en Responsabilidades"). */
const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_SECTION_DEFS.map((d) => [d.key, d.label]),
);

export default function RoleWorkspace({ role }: { role: RoleInput }) {
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

  const sections: LandingSectionData[] = [
    { key: "hero", data: { title: meta.title, area: meta.area, summary: meta.summary } },
    ...ROLE_CONTENT_KEYS.map((k) => ({ key: k, data: content[k] ?? null })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-3">
        <p className="text-xs text-fg-muted">
          {editing
            ? "Edita el contenido directamente. Arrastra ⠿ para reordenar los ítems. Se guarda solo."
            : "Vista del perfil. Toca “Editar” para modificarlo."}
        </p>
        <div className="flex items-center gap-3">
          {editing && (
            <span className="text-xs text-fg-muted" aria-live="polite">
              {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado ✓" : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className={
              editing
                ? "px-3 py-1.5 text-sm font-medium rounded-lg border border-line text-fg-secondary hover:bg-surface-hover"
                : "px-3 py-1.5 text-sm font-medium rounded-lg bg-brand text-white hover:opacity-90"
            }
          >
            {editing ? "Listo" : "Editar"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line">
        <LandingView
          config={landingConfigForRoles()}
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

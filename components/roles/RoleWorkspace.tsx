"use client";

/**
 * components/roles/RoleWorkspace.tsx — la página de UN rol (perfil de puesto),
 * renderizada y EDITADA con el mismo motor de landing (`LandingView`) que los business
 * cases y el kickoff. Un toggle "Editar" cambia de lectura a edición WYSIWYG in-situ
 * (cards, KPIs, escalera de madurez, tooltips) + drag&drop de ítems. Los cambios se
 * guardan solos (PATCH /api/roles/[id], debounce): el hero (title/area/summary) va a los
 * metadatos, el resto a `content[sectionKey]`.
 *
 * SOLO SUPER_ADMIN (la ruta ya gatea antes de montar esto) — no hay vista pública de un
 * rol, así que lectura y edición conviven en un solo componente con el toggle.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import { landingConfigForRoles } from "@/components/landing/configs/roles";
import { ROLE_CONTENT_KEYS } from "@/components/landing/configs/roles.defs";

interface RoleInput {
  id: string;
  title: string;
  area: string | null;
  summary: string | null;
  content: Record<string, unknown>;
}

type SaveState = "idle" | "saving" | "saved";

export default function RoleWorkspace({ role }: { role: RoleInput }) {
  const toast = useToast();
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

  const flush = useCallback(async () => {
    const { meta: m, content: c } = latest.current;
    const body: Record<string, unknown> = {
      area: m.area.trim() || null,
      summary: m.summary.trim() || null,
      content: c,
    };
    if (m.title.trim()) body.title = m.title.trim(); // title es requerido: nunca vacío
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

  const onSectionChange = (key: string, data: unknown) => {
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
            ? "Editá el contenido directamente. Arrastrá ⠿ para reordenar los ítems. Se guarda solo."
            : "Vista del perfil. Tocá “Editar” para modificarlo."}
        </p>
        <div className="flex items-center gap-3">
          {editing && (
            <span className="text-xs text-fg-muted" aria-live="polite">
              {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado" : ""}
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

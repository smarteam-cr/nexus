"use client";

/**
 * RoleTemplatesPanel — pestaña "Plantillas por rol" de /team (solo SUPER_ADMIN).
 *
 * Edita la PLANTILLA de cada rol (RolePermission): la herencia que reciben todos
 * los miembros del rol (los pines por persona van en el modal del miembro).
 * Bi-estado: click flipea la celda; el punto ámbar marca celdas DISTINTAS del
 * default de código. SUPER_ADMIN se muestra all-true bloqueado (anti-lockout).
 * Guarda por rol vía PUT /api/team/role-permissions/[role] (el resto de las
 * instancias ve el cambio en ≤60s por el TTL del cache del engine).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Spinner, useToast } from "@/components/ui";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { PermissionMap } from "@/lib/auth/permissions/types";
import PermissionMatrix from "./PermissionMatrix";

const ROLE_LABEL: Record<string, string> = {
  CSE: "CSE",
  VENTAS: "Sales",
  DEV: "Dev",
  CSL: "CSL",
  MARKETING: "Marketing",
  ADMIN: "Asistente administrativo",
  SUPER_ADMIN: "Super Admin",
};

interface RoleRow {
  role: string;
  editable: boolean;
  default: PermissionMap;
  template: PermissionMap | null;
  effective: PermissionMap;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

export default function RoleTemplatesPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [selected, setSelected] = useState("CSE");
  // Mapa editable por rol (arranca en el EFECTIVO del rol: default ← plantilla).
  const [drafts, setDrafts] = useState<Record<string, PermissionMap>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ roles: RoleRow[] }>(`/api/team/role-permissions`);
      setRows(data.roles);
      setDrafts(Object.fromEntries(data.roles.map((r) => [r.role, structuredClone(r.effective)])));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las plantillas.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const row = rows.find((r) => r.role === selected);
  const draft = drafts[selected];

  const dirty = useMemo(() => {
    if (!row || !draft) return false;
    return JSON.stringify(draft.sections) !== JSON.stringify(row.effective.sections);
  }, [row, draft]);

  const getCell = useCallback(
    (section: string, action: string) => {
      if (!row || !draft) return { checked: false, pinned: false };
      if (!row.editable) return { checked: true, pinned: false };
      const checked = draft.sections[section]?.[action] === true;
      const dflt = row.default.sections[section]?.[action] === true;
      return { checked, pinned: checked !== dflt };
    },
    [row, draft],
  );

  const onToggle = useCallback(
    (section: string, action: string) => {
      if (!row?.editable) return;
      setDrafts((prev) => {
        const copy = structuredClone(prev);
        const map = copy[selected];
        (map.sections[section] ??= {})[action] = !(map.sections[section]?.[action] === true);
        return copy;
      });
    },
    [row, selected],
  );

  const onResetSection = useCallback(
    (section: string) => {
      if (!row) return;
      setDrafts((prev) => {
        const copy = structuredClone(prev);
        copy[selected].sections[section] = structuredClone(row.default.sections[section] ?? {});
        return copy;
      });
    },
    [row, selected],
  );

  const save = async () => {
    if (!row || !draft) return;
    setSaving(true);
    try {
      await fetchJson(`/api/team/role-permissions/${row.role}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: draft }),
      });
      toast.success(`Plantilla de ${ROLE_LABEL[row.role] ?? row.role} guardada.`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la plantilla.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs text-fg-muted">
        La plantilla define lo que HEREDA todo miembro del rol. El punto ámbar marca celdas
        distintas del default de código. Los pines por persona se editan clickeando al miembro.
      </p>

      {/* Selector de rol */}
      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <button
            key={r.role}
            type="button"
            onClick={() => setSelected(r.role)}
            className={[
              "rounded-full border px-3 py-1 text-xs transition-colors",
              r.role === selected
                ? "border-brand/40 bg-brand/10 text-brand"
                : "border-line bg-surface-muted text-fg-muted hover:text-fg-secondary",
            ].join(" ")}
          >
            {ROLE_LABEL[r.role] ?? r.role}
          </button>
        ))}
      </div>

      {row && !row.editable && (
        <p className="rounded-md border border-line bg-surface-muted px-3 py-2 text-xs text-fg-muted">
          Super Admin siempre tiene todos los permisos (anti-lockout) — su plantilla no se edita.
        </p>
      )}

      <PermissionMatrix
        getCell={getCell}
        onToggle={row?.editable ? onToggle : undefined}
        onResetSection={row?.editable ? onResetSection : undefined}
        disabled={!row?.editable}
        pinLabel="Distinto del default de código"
      />

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-fg-muted">
          {row?.updatedAt
            ? `Última edición: ${row.updatedByEmail ?? "?"} · ${new Date(row.updatedAt).toLocaleString()}`
            : "Sin plantilla en DB (rige el default de código)."}
        </span>
        {row?.editable && (
          <Button variant="primary" size="sm" onClick={save} disabled={!dirty || saving} loading={saving}>
            Guardar plantilla
          </Button>
        )}
      </div>
    </div>
  );
}

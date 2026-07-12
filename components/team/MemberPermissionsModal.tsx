"use client";

/**
 * MemberPermissionsModal — pop-up de permisos de UN miembro (/team, solo SUPER_ADMIN).
 *
 * Cabecera: selector de ROL (la plantilla del rol es la herencia) + toggle de
 * visibilidad de clientes (escribe canViewAllClients/ExpiresAt, que access.ts ya
 * evalúa) + matriz TRI-ESTADO: cada celda muestra el valor EFECTIVO; clickearla
 * lo flipea — si el valor nuevo coincide con lo heredado, el pin se quita
 * (vuelve a heredar); si difiere, queda PINEADO para este usuario (punto ámbar).
 * "Restaurar herencia" por sección y global. Un SUPER_ADMIN se muestra all-true
 * deshabilitado (anti-lockout, el server también lo rechaza).
 *
 * Guarda TODO junto vía PATCH /api/team/[id]/permissions (overrides = REPLACE).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Button, Select, Avatar, Spinner, useToast } from "@/components/ui";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { PermissionMap } from "@/lib/auth/permissions/types";
import PermissionMatrix from "./PermissionMatrix";

// Espejo client-safe de ROLE_LABEL (lib/auth/roles.ts) — el enum de DB no cambia.
const ROLE_OPTIONS = [
  { value: "CSE", label: "CSE" },
  { value: "VENTAS", label: "Sales" },
  { value: "DEV", label: "Dev" },
  { value: "CSL", label: "CSL" },
  { value: "MARKETING", label: "Marketing" },
  { value: "ADMIN", label: "Asistente administrativo" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
] as const;

interface MemberBundle {
  member: {
    id: string;
    name: string;
    email: string;
    area: string | null;
    roleEnum: string;
    photoUrl: string | null;
    canViewAllClients: boolean;
    canViewAllExpiresAt: string | null;
  };
  base: PermissionMap;
  overrides: PermissionMap | null;
  effective: PermissionMap;
}

interface RolePermissionRow {
  role: string;
  editable: boolean;
  effective: PermissionMap;
}

type SparseSections = { [section: string]: { [action: string]: boolean } };

interface Props {
  memberId: string;
  onClose: () => void;
  /** Se llama tras guardar OK (para refrescar la lista). */
  onSaved: () => void;
}

export default function MemberPermissionsModal({ memberId, onClose, onSaved }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bundle, setBundle] = useState<MemberBundle | null>(null);
  const [roleBases, setRoleBases] = useState<Map<string, PermissionMap>>(new Map());

  // Estado editable local
  const [role, setRole] = useState<string>("CSE");
  const [viewAll, setViewAll] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string>(""); // yyyy-mm-dd o ""
  const [overrides, setOverrides] = useState<SparseSections>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [b, rp] = await Promise.all([
          fetchJson<MemberBundle>(`/api/team/${memberId}/permissions`),
          fetchJson<{ roles: RolePermissionRow[] }>(`/api/team/role-permissions`),
        ]);
        if (!active) return;
        setBundle(b);
        setRoleBases(new Map(rp.roles.map((r) => [r.role, r.effective])));
        setRole(b.member.roleEnum);
        setViewAll(b.member.canViewAllClients);
        setExpiresAt(b.member.canViewAllExpiresAt ? b.member.canViewAllExpiresAt.slice(0, 10) : "");
        setOverrides(structuredClone(b.overrides?.sections ?? {}));
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar los permisos.");
        onClose();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial por memberId
  }, [memberId]);

  const isSA = role === "SUPER_ADMIN";
  const base = roleBases.get(role) ?? null;
  const roleChangedToSA = isSA && bundle?.member.roleEnum !== "SUPER_ADMIN";
  const overrideCount = useMemo(
    () => Object.values(overrides).reduce((n, s) => n + Object.keys(s).length, 0),
    [overrides],
  );
  // ¿El valor EFECTIVO de clientes.viewAll (plantilla del rol + pin del usuario) ya
  // concede "ver todo"? Entonces el flag por-persona (canViewAllClients) es redundante
  // → checkbox deshabilitado. Si está pineado en ✕, el flag SÍ importa (es un canal de
  // acceso aparte en access.ts) → debe quedar editable, no bloqueado con leyenda falsa.
  const effViewAll = overrides.clientes?.viewAll ?? base?.sections.clientes?.viewAll === true;
  const roleSeesAll = effViewAll === true;

  const getCell = useCallback(
    (section: string, action: string) => {
      if (isSA) return { checked: true, pinned: false };
      const inherited = base?.sections[section]?.[action] === true;
      const pin = overrides[section]?.[action];
      return { checked: pin ?? inherited, pinned: pin !== undefined };
    },
    [isSA, base, overrides],
  );

  const onToggle = useCallback(
    (section: string, action: string) => {
      if (isSA || !base) return;
      const inherited = base.sections[section]?.[action] === true;
      const current = overrides[section]?.[action] ?? inherited;
      const next = !current;
      setOverrides((prev) => {
        const copy = structuredClone(prev);
        if (next === inherited) {
          // volver al valor heredado = quitar el pin
          if (copy[section]) {
            delete copy[section][action];
            if (Object.keys(copy[section]).length === 0) delete copy[section];
          }
        } else {
          (copy[section] ??= {})[action] = next;
        }
        return copy;
      });
    },
    [isSA, base, overrides],
  );

  const onResetSection = useCallback((section: string) => {
    setOverrides((prev) => {
      const copy = structuredClone(prev);
      delete copy[section];
      return copy;
    });
  }, []);

  const save = async () => {
    if (!bundle) return;
    setSaving(true);
    try {
      await fetchJson(`/api/team/${bundle.member.id}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleEnum: role,
          canViewAllClients: viewAll,
          // Fin del día en UTC (no local): al recargar, el input hace slice(0,10) del ISO
          // UTC, así que guardar en local (T23:59:59 sin Z) corría la fecha +1 día por ciclo
          // en husos negativos (CR = UTC-6). Con `Z` el round-trip es estable.
          canViewAllExpiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.999Z`).toISOString() : null,
          permissionOverrides: isSA || overrideCount === 0 ? null : { v: 1, sections: overrides },
        }),
      });
      toast.success("Permisos guardados.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron guardar los permisos.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Permisos del miembro"
      description="El rol define la herencia (plantilla editable en la pestaña Plantillas); las celdas pineadas la pisan solo para esta persona."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={saving || loading} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      {loading || !bundle ? (
        <div className="flex items-center justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Cabecera: identidad + rol */}
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={bundle.member.name} src={bundle.member.photoUrl ?? undefined} colorSeed={bundle.member.id} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-fg">{bundle.member.name}</div>
              <div className="truncate text-xs text-fg-muted">{bundle.member.email}</div>
            </div>
            <label className="flex items-center gap-2 text-xs text-fg-secondary">
              Rol
              <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-52">
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          {roleChangedToSA && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              Al pasar a Super Admin, esta persona tendrá TODOS los permisos y sus pines actuales se limpian.
            </p>
          )}

          {isSA ? (
            <p className="rounded-md border border-line bg-surface-muted px-3 py-2 text-xs text-fg-muted">
              Super Admin siempre tiene todos los permisos (regla anti-lockout) — no se puede recortar ni pinear.
            </p>
          ) : (
            <>
              {/* Visibilidad de clientes (override por persona; el row-level lo aplica access.ts) */}
              <div className="rounded-lg border border-line px-3 py-2.5">
                <label className="flex items-center gap-2 text-xs text-fg-secondary">
                  <input
                    type="checkbox"
                    checked={roleSeesAll ? true : viewAll}
                    disabled={roleSeesAll}
                    onChange={(e) => setViewAll(e.target.checked)}
                    className="h-3.5 w-3.5 accent-emerald-500"
                  />
                  Ver todos los clientes
                  {roleSeesAll ? (
                    <span className="text-fg-muted">(su rol ya ve todos — el flag por persona no aplica)</span>
                  ) : (
                    <span className="text-fg-muted">(override por persona, ej. un CSE con acceso temporal)</span>
                  )}
                </label>
                {!roleSeesAll && viewAll && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
                    Expira
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg"
                    />
                    <span>(vacío = sin expiración)</span>
                  </label>
                )}
              </div>

              {/* Matriz tri-estado */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-muted">
                  {overrideCount === 0
                    ? "Sin pines: hereda todo de la plantilla del rol."
                    : `${overrideCount} ${overrideCount === 1 ? "celda pineada" : "celdas pineadas"} para esta persona.`}
                </span>
                {overrideCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setOverrides({})}
                    className="text-xs text-amber-500/90 underline decoration-dotted underline-offset-2 hover:text-amber-400"
                  >
                    Restaurar herencia completa
                  </button>
                )}
              </div>
              <PermissionMatrix
                getCell={getCell}
                onToggle={onToggle}
                onResetSection={onResetSection}
                pinLabel="Pineado para este usuario"
              />
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

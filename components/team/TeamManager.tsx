"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Badge,
  Avatar,
  EmptyState,
  Table,
  TableSkeleton,
  type TableColumn,
} from "@/components/ui";
import MemberPermissionsModal from "./MemberPermissionsModal";
import RoleTemplatesPanel from "./RoleTemplatesPanel";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string;
  /** Área funcional (eje de ANÁLISIS de sesiones): Ventas / CSE / Marketing / … */
  area: string | null;
  /** Rol de PERMISO (TeamRole). */
  roleEnum: "CSE" | "VENTAS" | "DEV" | "CSL" | "MARKETING" | "ADMIN" | "SUPER_ADMIN" | string;
  /** Foto de la persona (bucket público). Se muestra en el selector de equipo del Kickoff. */
  photoUrl: string | null;
  createdAt: string;
}

// Etiqueta inline (no se importa lib/auth/roles para no arrastrar Prisma al cliente).
// Espejo de ROLE_LABEL de lib/auth/roles.ts — el VALOR del enum de DB no cambia.
const ROLE_LABEL: Record<string, string> = {
  CSE: "CSE",
  VENTAS: "Sales",
  DEV: "Dev",
  CSL: "CSL",
  MARKETING: "Marketing",
  ADMIN: "Asistente administrativo", // Finanzas: solo Cobranza
  SUPER_ADMIN: "Super Admin",
};

// ── Avatar con edición de foto (lápiz al hover) ─────────────────────────────────
/**
 * Muestra la foto (o iniciales) del miembro. Si `editable`, al pasar el mouse
 * aparece un CTA de lápiz ENCIMA de la foto → abre el file picker y sube a
 * /api/team/[id]/photo. Sin columna aparte: el avatar ES el control de subida.
 */
function TeamPhotoAvatar({
  member,
  editable,
  onUploaded,
}: {
  member: TeamMember;
  editable: boolean;
  onUploaded: (id: string, photoUrl: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/team/${member.id}/photo`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.photoUrl) onUploaded(member.id, data.photoUrl);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const avatar = <Avatar name={member.name} src={member.photoUrl ?? undefined} colorSeed={member.id} size="lg" />;

  if (!editable) return avatar;

  return (
    <div className="group/photo relative h-11 w-11 flex-shrink-0">
      {avatar}
      <button
        type="button"
        onClick={(e) => {
          // La fila puede ser clickeable (abre el modal de permisos) — no burbujear.
          e.stopPropagation();
          inputRef.current?.click();
        }}
        disabled={busy}
        title={member.photoUrl ? "Cambiar foto" : "Subir foto"}
        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover/photo:opacity-100 focus-visible:opacity-100 disabled:cursor-wait"
      >
        {busy ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.83a4 4 0 01-1.414.94l-2.83.943.943-2.83a4 4 0 01.94-1.414z" />
          </svg>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onFile}
        // El .click() programático sobre este input dispara un evento que burbujea hasta
        // el <tr> clickeable (abre el modal de permisos) — cortarlo acá.
        onClick={(e) => e.stopPropagation()}
        className="hidden"
      />
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────────────

export default function TeamManager({
  canManage = false,
  canAdminPermissions = false,
}: {
  canManage?: boolean;
  /** SOLO Super Admin (gate duro, no delegable): filas clickeables + pestaña Plantillas. */
  canAdminPermissions?: boolean;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"miembros" | "plantillas">("miembros");
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team");
      const data = await res.json();
      setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onUploaded = useCallback((id: string, photoUrl: string | null) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, photoUrl } : m)));
  }, []);

  const columns: TableColumn<TeamMember>[] = [
    {
      key: "member",
      header: "Miembro",
      sortValue: (m) => m.name,
      render: (m) => (
        <Table.IdentityCell
          leading={<TeamPhotoAvatar member={m} editable={canManage} onUploaded={onUploaded} />}
          primary={m.name}
          secondary={m.email}
        />
      ),
    },
    {
      key: "role",
      header: "Rol (permiso)",
      sortValue: (m) => m.roleEnum,
      width: "w-44",
      render: (m) => (
        <Badge variant={m.roleEnum === "SUPER_ADMIN" ? "success" : "default"} size="xs">
          {ROLE_LABEL[m.roleEnum] ?? m.roleEnum}
        </Badge>
      ),
    },
    {
      key: "area",
      header: "Área (análisis)",
      sortValue: (m) => m.area ?? "",
      width: "w-44",
      hideOnMobile: true,
      render: (m) =>
        m.area ? (
          <span className="text-xs text-fg-muted">{m.area}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Pestañas (Plantillas solo para Super Admin) */}
      {canAdminPermissions && (
        <div className="flex gap-1.5">
          {(
            [
              ["miembros", "Miembros"],
              ["plantillas", "Plantillas por rol"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={[
                "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                tab === key
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-line bg-surface-muted text-fg-muted hover:text-fg-secondary",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "plantillas" && canAdminPermissions ? (
        <RoleTemplatesPanel />
      ) : (
        <>
          <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs text-fg-muted">
            {canAdminPermissions
              ? "Clickeá un miembro para editar su rol, visibilidad y permisos (los pines pisan la plantilla del rol solo para esa persona). Pasá el mouse sobre una foto para cambiarla."
              : canManage
                ? "Pasá el mouse sobre una foto para cambiarla; se usan en el selector de equipo del Kickoff. Los permisos los administra un Super Admin."
                : "Los roles y permisos los administra un Super Admin desde esta página."}
          </div>

          {loading ? (
            <TableSkeleton columns={3} rows={5} toolbar />
          ) : members.length === 0 ? (
            <EmptyState
              variant="dashed"
              title="Aún no hay miembros del equipo activos"
              description="Los miembros se siembran/gestionan por scripts (seed-team, assign-team-roles)."
            />
          ) : (
            <Table
              columns={columns}
              rows={members}
              rowKey={(m) => m.id}
              onRowClick={canAdminPermissions ? (m) => setEditingId(m.id) : undefined}
              search={{
                placeholder: "Buscar miembro…",
                getText: (m) => `${m.name} ${m.email} ${m.area ?? ""} ${m.roleEnum}`,
              }}
              initialSort={{ key: "member", dir: "asc" }}
            />
          )}
        </>
      )}

      {editingId && (
        <MemberPermissionsModal
          memberId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

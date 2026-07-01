"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Badge,
  Avatar,
  EmptyState,
  Table,
  TableSkeleton,
  type TableColumn,
} from "@/components/ui";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string;
  /** Área funcional (eje de ANÁLISIS de sesiones): Ventas / CSE / Marketing / … */
  area: string | null;
  /** Rol de PERMISO (TeamRole). */
  roleEnum: "CSE" | "VENTAS" | "DEV" | "CSL" | "MARKETING" | "SUPER_ADMIN" | string;
  createdAt: string;
}

// Etiqueta inline (no se importa lib/auth/roles para no arrastrar Prisma al cliente).
const ROLE_LABEL: Record<string, string> = {
  CSE: "CSE",
  VENTAS: "Ventas",
  DEV: "Dev",
  CSL: "CSL",
  MARKETING: "Marketing",
  SUPER_ADMIN: "Super Admin",
};

// ── Componente principal (solo lectura esta etapa) ──────────────────────────────

export default function TeamManager() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

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

  const columns: TableColumn<TeamMember>[] = [
    {
      key: "member",
      header: "Miembro",
      sortValue: (m) => m.name,
      render: (m) => (
        <Table.IdentityCell
          leading={<Avatar name={m.name} colorSeed={m.id} size="sm" />}
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
          <span className="text-gray-600">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs text-fg-muted">
        Vista de solo lectura. Los <strong className="text-fg-secondary">roles de permiso</strong> y
        las <strong className="text-fg-secondary">áreas</strong> se gestionan por scripts en esta
        etapa; la edición desde la app llega en una próxima iteración.
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
          search={{
            placeholder: "Buscar miembro…",
            getText: (m) => `${m.name} ${m.email} ${m.area ?? ""} ${m.roleEnum}`,
          }}
          initialSort={{ key: "member", dir: "asc" }}
        />
      )}
    </div>
  );
}

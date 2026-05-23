"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Modal,
  ConfirmDialog,
  Button,
  Input,
  Select,
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
  role: string | null;
  createdAt: string;
}

interface FormState {
  name: string;
  email: string;
  role: string;
}

const EMPTY_FORM: FormState = { name: "", email: "", role: "" };

const ROLES = ["Sales", "CSE", "Development", "PM", "RevOps", "Admin"];

// ── Componente principal ──────────────────────────────────────────────────────

export default function TeamManager() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("Todos");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { load(); }, [load]);

  // Tabs = "Todos" + roles que tengan al menos 1 miembro, en orden canónico
  const tabs = useMemo(() => {
    const present = new Set(members.map((m) => m.role).filter(Boolean));
    const ordered = ROLES.filter((r) => present.has(r));
    const extra = [...present].filter((r) => r && !ROLES.includes(r)) as string[];
    return ["Todos", ...ordered, ...extra];
  }, [members]);

  const filtered = useMemo(
    () => (activeTab === "Todos" ? members : members.filter((m) => m.role === activeTab)),
    [members, activeTab]
  );

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(m: TeamMember) {
    setEditId(m.id);
    setForm({ name: m.name, email: m.email, role: m.role ?? "" });
    setError(null);
    setShowForm(true);
  }

  function cancel() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Nombre y correo son requeridos.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editId ? `/api/team/${editId}` : "/api/team";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar.");
        return;
      }
      await load();
      cancel();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    await fetch(`/api/team/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    await load();
  }

  const deletingMember = members.find((m) => m.id === deleteId);

  // ── Columnas de la tabla ──────────────────────────────────────────────────────
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
      header: "Rol",
      sortValue: (m) => m.role,
      width: "w-44",
      render: (m) =>
        m.role ? (
          <Badge variant="default" size="xs">{m.role}</Badge>
        ) : (
          <span className="text-gray-600">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-24",
      render: (m) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => openEdit(m)}
            title="Editar"
            className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setDeleteId(m.id)}
            title="Eliminar"
            className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  // Tabs de rol — viajan al slot `filters` del toolbar de la tabla.
  const roleTabs = tabs.map((tab) => {
    const count =
      tab === "Todos" ? members.length : members.filter((m) => m.role === tab).length;
    const isActive = activeTab === tab;
    return (
      <button
        key={tab}
        onClick={() => setActiveTab(tab)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          isActive
            ? "bg-gray-700 text-white"
            : "bg-gray-900 text-gray-400 border border-gray-800 hover:text-white hover:border-gray-700"
        }`}
      >
        {tab}
        <span className={`text-xs tabular-nums ${isActive ? "text-gray-400" : "text-gray-600"}`}>
          {count}
        </span>
      </button>
    );
  });

  return (
    <div className="space-y-4">
      {loading ? (
        <TableSkeleton columns={3} rows={5} toolbar />
      ) : members.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Aún no hay miembros del equipo"
          description="Agregá a las personas que participan en las sesiones y proyectos."
          action={
            <Button variant="ghost" size="sm" onClick={openCreate}>
              Agregar el primero
            </Button>
          }
        />
      ) : (
        <Table
          columns={columns}
          rows={filtered}
          rowKey={(m) => m.id}
          search={{ placeholder: "Buscar miembro…", getText: (m) => `${m.name} ${m.email}` }}
          initialSort={{ key: "member", dir: "asc" }}
          filters={roleTabs}
          action={
            <Button variant="primary" size="sm" onClick={openCreate}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Agregar miembro
            </Button>
          }
        />
      )}

      {/* ── Modal crear / editar ── */}
      <Modal
        open={showForm}
        onClose={cancel}
        title={editId ? "Editar miembro" : "Nuevo miembro"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={cancel} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" size="md" loading={saving} onClick={save}>
              {editId ? "Guardar cambios" : "Crear miembro"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Nombre completo *</label>
              <Input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: María López"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Correo *</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Ej: mlopez@empresa.com"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">
              Rol / Área <span className="text-gray-600">(opcional)</span>
            </label>
            <Select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="">Sin rol</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </Modal>

      {/* ── Confirmación de borrado ── */}
      <ConfirmDialog
        open={!!deleteId}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
        title="¿Eliminar miembro?"
        description={deletingMember?.name}
        confirmLabel="Eliminar"
      />
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500/20 text-blue-300",
  "bg-purple-500/20 text-purple-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-brand/20 text-brand-light",
  "bg-rose-500/20 text-rose-300",
  "bg-cyan-500/20 text-cyan-300",
];

function avatarColor(id: string) {
  const idx = id.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function TeamManager() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Cargar miembros ────────────────────────────────────────────────────────
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

  // ── Abrir formulario de creación ───────────────────────────────────────────
  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  // ── Abrir formulario de edición ────────────────────────────────────────────
  function openEdit(m: TeamMember) {
    setEditId(m.id);
    setForm({ name: m.name, email: m.email, role: m.role ?? "" });
    setError(null);
    setShowForm(true);
  }

  // ── Cancelar ───────────────────────────────────────────────────────────────
  function cancel() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  // ── Guardar (create o update) ──────────────────────────────────────────────
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
      if (!res.ok) { setError(data.error ?? "Error al guardar."); return; }
      await load();
      cancel();
    } finally {
      setSaving(false);
    }
  }

  // ── Eliminar ───────────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteId) return;
    await fetch(`/api/team/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    await load();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {members.length} {members.length === 1 ? "miembro" : "miembros"}
        </p>
        {!showForm && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-light text-white text-sm font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Agregar miembro
          </button>
        )}
      </div>

      {/* ── Formulario inline ── */}
      {showForm && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-3">
          <p className="text-sm font-medium text-white">
            {editId ? "Editar miembro" : "Nuevo miembro"}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Nombre completo *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Fidel Castro"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Correo *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Ej: fcastro@empresa.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Rol / Área <span className="text-gray-600">(opcional)</span></label>
            <input
              type="text"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="Ej: Ventas, Marketing, Soporte…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 transition-colors"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-brand hover:bg-brand-light disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear miembro"}
            </button>
            <button
              onClick={cancel}
              className="px-4 py-1.5 rounded-lg text-gray-400 hover:text-white text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Lista ── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-900 animate-pulse border border-gray-800" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
          <p className="text-sm text-gray-600">Aún no hay miembros del equipo.</p>
          <button onClick={openCreate} className="mt-2 text-sm text-brand-light hover:text-brand-light">
            Agregar el primero
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 group hover:border-gray-700 transition-colors"
            >
              {/* Avatar */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${avatarColor(m.id)}`}>
                {initials(m.name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{m.name}</p>
                <p className="text-xs text-gray-500 truncate">{m.email}</p>
              </div>

              {/* Rol */}
              {m.role && (
                <span className="hidden sm:block text-2xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 flex-shrink-0">
                  {m.role}
                </span>
              )}

              {/* Acciones */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
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
            </div>
          ))}
        </div>
      )}

      {/* ── Modal de confirmación de eliminación ── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4.5 h-4.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">¿Eliminar miembro?</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {members.find((m) => m.id === deleteId)?.name}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={confirmDelete}
                className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-sm font-medium transition-colors"
              >
                Eliminar
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white text-sm transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

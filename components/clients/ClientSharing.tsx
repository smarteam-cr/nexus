"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

// Etiquetas inline (no se importa lib/auth/roles para no arrastrar Prisma al cliente).
const ROLE_OPTIONS = [
  { value: "CSE", label: "CSE" },
  { value: "VENTAS", label: "Sales" },
  { value: "DEV", label: "Dev" },
  { value: "CSL", label: "CSL" },
  { value: "MARKETING", label: "Marketing" },
  { value: "ADMIN", label: "Asistente administrativo" }, // Finanzas: solo Cobranza (no ve clientes)
  { value: "SUPER_ADMIN", label: "Super Admin" },
] as const;
const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label]),
);

interface Assignment {
  id: string;
  kind: "GRANT" | "REVOKE";
  targetRole: string | null;
  reason: string | null;
  createdAt: string;
  teamMember: { id: string; name: string; email: string } | null;
  grantedBy: { id: string; name: string } | null;
}

interface Member {
  id: string;
  name: string;
  email: string;
  roleEnum: string;
}

/**
 * Panel de compartir un cliente (a una persona o a un rol entero). Solo se monta
 * cuando el usuario tiene la capacidad `shareClients` (gating en la página). El
 * endpoint igual valida server-side (`guardCapability("shareClients")`).
 */
export default function ClientSharing({ clientId }: { clientId: string }) {
  const toast = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [targetType, setTargetType] = useState<"person" | "role">("person");
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<string>("CSE");
  const [kind, setKind] = useState<"GRANT" | "REVOKE">("GRANT");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, mRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/assignments`),
        fetch(`/api/team`),
      ]);
      if (aRes.ok) setAssignments((await aRes.json()).assignments ?? []);
      if (mRes.ok) setMembers((await mRes.json()).members ?? []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetType === "person" && !personId) {
      toast.error("Elegí una persona");
      return;
    }
    setSaving(true);
    try {
      const body =
        targetType === "person"
          ? { teamMemberId: personId, kind, reason: reason.trim() || undefined }
          : { targetRole: role, kind, reason: reason.trim() || undefined };
      const res = await fetch(`/api/clients/${clientId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo compartir");
      }
      toast.success(kind === "GRANT" ? "Acceso otorgado" : "Acceso revocado");
      setReason("");
      setPersonId("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al compartir");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/assignments/${assignmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("No se pudo quitar");
      setAssignments((as) => as.filter((a) => a.id !== assignmentId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al quitar");
    }
  };

  const targetLabel = (a: Assignment) =>
    a.teamMember
      ? a.teamMember.name
      : a.targetRole
        ? `Rol: ${ROLE_LABEL[a.targetRole] ?? a.targetRole}`
        : "—";

  return (
    <section className="rounded-xl bg-gray-900 border border-gray-800 p-5">
      <h2 className="text-sm font-semibold text-white mb-1">Compartir cliente</h2>
      <p className="text-xs text-gray-500 mb-4">
        Otorgá o revocá acceso a este cliente a una persona o a un rol entero. Un <strong>Revocar</strong>{" "}
        tiene prioridad sobre cualquier otro acceso.
      </p>

      {loading ? (
        <div className="text-xs text-gray-600 py-2">Cargando…</div>
      ) : assignments.length === 0 ? (
        <div className="text-xs text-gray-600 mb-4">Todavía no se compartió con nadie.</div>
      ) : (
        <ul className="space-y-2 mb-4">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-800 border border-gray-700"
            >
              <span
                className={`flex-shrink-0 text-2xs font-semibold px-2 py-0.5 rounded-full border ${
                  a.kind === "GRANT"
                    ? "text-green-400 bg-green-500/10 border-green-500/20"
                    : "text-red-400 bg-red-500/10 border-red-500/20"
                }`}
              >
                {a.kind === "GRANT" ? "Acceso" : "Revocado"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{targetLabel(a)}</p>
                {a.teamMember && (
                  <p className="text-2xs text-gray-500 truncate">{a.teamMember.email}</p>
                )}
                {a.reason && <p className="text-2xs text-gray-600 truncate">{a.reason}</p>}
              </div>
              <button
                onClick={() => handleRemove(a.id)}
                className="flex-shrink-0 text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-3 pt-3 border-t border-gray-800">
        <div className="flex gap-2">
          {(["person", "role"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTargetType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                targetType === t
                  ? "bg-brand/20 border-brand/30 text-brand"
                  : "border-gray-700 text-gray-400 hover:bg-gray-800"
              }`}
            >
              {t === "person" ? "Persona" : "Rol entero"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {targetType === "person" ? (
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-brand/50"
            >
              <option value="">Elegí una persona…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({ROLE_LABEL[m.roleEnum] ?? m.roleEnum})
                </option>
              ))}
            </select>
          ) : (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-brand/50"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          )}

          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "GRANT" | "REVOKE")}
            className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-brand/50"
          >
            <option value="GRANT">Otorgar acceso</option>
            <option value="REVOKE">Revocar acceso</option>
          </select>
        </div>

        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (opcional)"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-brand/50"
        />

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-light disabled:bg-brand/40 text-white text-sm font-medium transition-colors"
        >
          {saving ? "Guardando…" : "Aplicar"}
        </button>
      </form>
    </section>
  );
}

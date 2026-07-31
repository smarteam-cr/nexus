"use client";

/**
 * components/roles/RoleSharePanel.tsx — "¿quién puede ver este documento?", en un solo lugar.
 *
 * Dos bloques, porque son dos preguntas distintas:
 *  · CON EL EQUIPO — personas de Nexus que lo pueden LEER (no editar, no re-compartir).
 *  · LINK PÚBLICO — una URL oculta con un token de 64 hex, sin login y sin contraseña.
 *    Publicar la genera; revocar la mata (y no vuelve: republicar da un token nuevo).
 *
 * Solo lo monta la página cuando el usuario es SUPER_ADMIN — los 3 endpoints que consume
 * exigen lo mismo del lado del server.
 */
import { useCallback, useEffect, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, Skeleton } from "@/components/ui";
// No está re-exportado por el barrel de `components/ui` (nadie más lo usaba); se importa
// del archivo. Si aparece un tercer consumidor, va al index.
import CollapsibleSection from "@/components/ui/CollapsibleSection";

interface Share {
  id: string;
  teamMemberId: string;
  teamMember: { name: string; email: string; roleEnum: string };
}
interface Miembro {
  id: string;
  name: string;
  email: string;
  roleEnum: string;
}
interface EstadoPublico {
  url: string | null;
  publishedAt: string | null;
  publishedByEmail: string | null;
}

export default function RoleSharePanel({ roleId }: { roleId: string }) {
  const toast = useToast();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [publico, setPublico] = useState<EstadoPublico | null>(null);
  const [elegido, setElegido] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, t, p] = await Promise.all([
        fetchJson<{ shares: Share[] }>(`/api/roles/${roleId}/shares`),
        fetchJson<{ members: Miembro[] }>("/api/team"),
        fetchJson<EstadoPublico>(`/api/roles/${roleId}/publico`),
      ]);
      setShares(s.shares);
      setMiembros(t.members);
      setPublico(p);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar quién lo ve.");
      setShares([]);
    }
  }, [roleId, toast]);
  useEffect(() => {
    load();
  }, [load]);

  const compartir = async () => {
    if (!elegido || busy) return;
    setBusy(true);
    try {
      const d = await fetchJson<{ shares: Share[] }>(`/api/roles/${roleId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamMemberId: elegido }),
      });
      setShares(d.shares);
      setElegido("");
      toast.success("Compartido. Ya lo puede leer.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo compartir.");
    } finally {
      setBusy(false);
    }
  };

  const dejarDeCompartir = async (teamMemberId: string) => {
    try {
      const d = await fetchJson<{ shares: Share[] }>(`/api/roles/${roleId}/shares`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamMemberId }),
      });
      setShares(d.shares);
      toast.info("Ya no lo ve.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo quitar.");
    }
  };

  const publicar = async () => {
    setBusy(true);
    try {
      const d = await fetchJson<EstadoPublico>(`/api/roles/${roleId}/publico`, { method: "POST" });
      setPublico(d);
      toast.success("Link generado. Cualquiera con la URL puede leerlo.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo publicar.");
    } finally {
      setBusy(false);
    }
  };

  const revocar = async () => {
    setBusy(true);
    try {
      const d = await fetchJson<EstadoPublico>(`/api/roles/${roleId}/publico`, { method: "DELETE" });
      setPublico(d);
      toast.info("Link revocado. El anterior ya no funciona.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo revocar.");
    } finally {
      setBusy(false);
    }
  };

  const copiar = async () => {
    if (!publico?.url) return;
    await navigator.clipboard.writeText(publico.url);
    toast.success("Link copiado.");
  };

  // Quien ya lo tiene compartido no vuelve a aparecer en el selector.
  const yaCompartido = new Set((shares ?? []).map((s) => s.teamMemberId));
  const disponibles = miembros.filter((m) => !yaCompartido.has(m.id));

  return (
    <CollapsibleSection title="Quién puede ver este documento" defaultOpen={false}>
      <div className="space-y-5 pt-1">
        {/* ── Con el equipo ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-fg">Con el equipo</p>
          <p className="text-xs text-fg-muted">
            Quien lo tenga compartido lo ve en su sección Roles y lo puede leer. No lo edita ni lo
            comparte con nadie más.
          </p>

          {shares === null ? (
            <Skeleton className="h-8 w-full" />
          ) : shares.length === 0 ? (
            <p className="text-xs text-fg-muted italic">Todavía no lo ve nadie más.</p>
          ) : (
            <ul className="space-y-1">
              {shares.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
                >
                  <span className="min-w-0 text-xs text-fg">
                    {s.teamMember.name}
                    <span className="ml-2 text-fg-muted">{s.teamMember.email}</span>
                  </span>
                  <button
                    onClick={() => dejarDeCompartir(s.teamMemberId)}
                    className="flex-shrink-0 text-xs text-fg-muted hover:text-fg"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2 pt-1">
            <select
              value={elegido}
              onChange={(e) => setElegido(e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
            >
              <option value="">Elige a una persona…</option>
              {disponibles.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.email}
                </option>
              ))}
            </select>
            <button
              onClick={compartir}
              disabled={!elegido || busy}
              className="px-3 py-2 text-sm rounded-lg bg-primary text-primary-fg disabled:opacity-40 hover:bg-primary-hover"
            >
              Compartir
            </button>
          </div>
        </div>

        {/* ── Link público ──────────────────────────────────────────────────── */}
        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-xs font-semibold text-fg">Link público</p>
          <p className="text-xs text-fg-muted">
            Una URL oculta, sin login. No se puede adivinar, pero{" "}
            <strong className="text-fg-secondary">cualquiera que la tenga puede leer el documento</strong> —
            incluida la oferta económica, si es una propuesta.
          </p>

          {publico === null ? (
            <Skeleton className="h-8 w-full" />
          ) : publico.url ? (
            <div className="space-y-2">
              <code className="block break-all rounded-lg border border-line bg-surface-muted px-3 py-2 text-[11px] text-fg-secondary">
                {publico.url}
              </code>
              <div className="flex items-center gap-2">
                <button
                  onClick={copiar}
                  className="px-3 py-1.5 text-xs rounded-lg border border-line text-fg-secondary hover:bg-surface-hover"
                >
                  Copiar link
                </button>
                <button
                  onClick={() => setConfirmRevoke(true)}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs rounded-lg border border-line text-red-400 hover:text-red-300 disabled:opacity-40"
                >
                  Revocar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={publicar}
              disabled={busy}
              className="px-3 py-2 text-sm rounded-lg bg-primary text-primary-fg disabled:opacity-40 hover:bg-primary-hover"
            >
              {busy ? "Generando…" : "Publicar link"}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={async () => {
          setConfirmRevoke(false);
          await revocar();
        }}
        title="¿Revocar el link público?"
        description="El link deja de funcionar de inmediato. Si vuelves a publicar, se genera uno nuevo: el anterior no se recupera."
        confirmLabel="Revocar"
      />
    </CollapsibleSection>
  );
}

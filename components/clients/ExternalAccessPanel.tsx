"use client";

/**
 * ExternalAccessButton
 *
 * Botón en el toolbar del proyecto + modal para gestionar el acceso del cliente
 * externo (token revocable + contraseña) a las superficies externas — kickoff y
 * cronograma comparten el MISMO acceso (D.1.5); qué ve el cliente lo deciden los
 * flags de publicación de cada superficie por separado.
 *
 * La contraseña se guarda en plano (accessPassword) además del hash → queda
 * VISIBLE en el panel: el CSE puede verla, copiarla, escribir una propia o
 * generar otra, y recién ahí entregarla. Dos operaciones:
 *   - PATCH  → cambia SOLO la contraseña (mismo token / mismos links).
 *   - POST   → "Regenerar todo": rota token + contraseña (caso "se filtró el link").
 *   - DELETE → revoca el acceso.
 *
 * Endpoint backend: app/api/projects/[projectId]/external-access/route.ts
 */
import { useState, useEffect, useCallback, type ReactNode } from "react";

interface AccessState {
  exists: boolean;
  accessToken?: string;
  accessPassword?: string | null;
  url?: string;
  enabledAt?: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  createdBy?: { name: string; email: string } | null;
  kickoffPublished?: boolean;
  timelinePublished?: boolean;
}

// Alphabet sin caracteres ambiguos (igual que el server) para las sugerencias
// del lado del cliente. El server re-valida + hashea, esto es solo una propuesta.
const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function suggestPassword(len = 12): string {
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < len; i++) out += PW_ALPHABET[arr[i] % PW_ALPHABET.length];
  return out;
}

export function ExternalAccessButton({ projectId }: { projectId: string }) {
  const [state, setState] = useState<AccessState | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState<"regenerate" | "revoke" | null>(null);
  const [justGenerated, setJustGenerated] = useState(false);

  // ── Fetch estado actual ───────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/external-access`);
      if (!res.ok) {
        setState({ exists: false });
        return;
      }
      setState(await res.json());
    } catch {
      setState({ exists: false });
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  // POST: generar o regenerar TODO (token + contraseña nuevos).
  const generateAll = async () => {
    setWorking(true);
    setConfirming(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/external-access`, { method: "POST" });
      if (!res.ok) {
        alert("No se pudo generar el acceso.");
        return;
      }
      await refresh();
      setJustGenerated(true);
    } finally {
      setWorking(false);
    }
  };

  // PATCH: cambiar SOLO la contraseña (custom). Devuelve mensaje de error o null.
  const savePassword = async (password: string): Promise<string | null> => {
    const res = await fetch(`/api/projects/${projectId}/external-access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return d?.error ?? "No se pudo guardar la contraseña.";
    }
    await refresh();
    return null;
  };

  const revoke = async () => {
    setWorking(true);
    setConfirming(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/external-access`, { method: "DELETE" });
      if (!res.ok) {
        alert("No se pudo revocar el acceso.");
        return;
      }
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  const closeModal = () => {
    setOpen(false);
    setConfirming(null);
    setJustGenerated(false);
  };

  // ── Botón ─────────────────────────────────────────────────────────────────

  if (!state) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-xs font-medium bg-surface-muted text-fg-muted opacity-50"
      >
        Acceso del cliente
      </button>
    );
  }

  const isRevoked = state.exists && !!state.revokedAt;
  const isActive = state.exists && !state.revokedAt;

  const buttonClasses = isActive
    ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
    : isRevoked
    ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
    : "bg-surface-muted border-line text-fg-secondary hover:bg-surface-hover";

  const buttonLabel = isActive ? "Acceso activo" : isRevoked ? "Acceso revocado" : "Acceso del cliente";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${buttonClasses}`}
        title="Generar / ver / revocar el acceso del cliente externo al proyecto"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        {buttonLabel}
      </button>

      {open && (
        <Modal onClose={closeModal}>
          {!state.exists ? (
            <EmptyState onGenerate={generateAll} working={working} />
          ) : (
            <ManageView
              state={state}
              isRevoked={isRevoked}
              justGenerated={justGenerated}
              confirming={confirming}
              working={working}
              onSavePassword={savePassword}
              onAskRegenerate={() => setConfirming("regenerate")}
              onAskRevoke={() => setConfirming("revoke")}
              onCancelConfirm={() => setConfirming(null)}
              onConfirmRegenerate={generateAll}
              onConfirmRevoke={revoke}
            />
          )}
        </Modal>
      )}
    </>
  );
}

// ── Modal wrapper (overlay + centered card, theme-safe) ──────────────────────

function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface border border-line shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ── Sub-vistas ────────────────────────────────────────────────────────────────

function EmptyState({ onGenerate, working }: { onGenerate: () => void; working: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-fg mb-1">Acceso del cliente al proyecto</h2>
        <p className="text-sm text-fg-muted leading-relaxed">
          Generá un acceso restringido con token + contraseña para que el cliente entre al kickoff y
          al cronograma de SU proyecto. La contraseña se genera automáticamente (12 chars seguros) y
          después podés verla, cambiarla por una propia o regenerarla acá mismo.
        </p>
      </div>
      <button
        onClick={onGenerate}
        disabled={working}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
      >
        {working ? "Generando…" : "Generar acceso"}
      </button>
    </div>
  );
}

function ManageView({
  state,
  isRevoked,
  justGenerated,
  confirming,
  working,
  onSavePassword,
  onAskRegenerate,
  onAskRevoke,
  onCancelConfirm,
  onConfirmRegenerate,
  onConfirmRevoke,
}: {
  state: AccessState;
  isRevoked: boolean;
  justGenerated: boolean;
  confirming: "regenerate" | "revoke" | null;
  working: boolean;
  onSavePassword: (pw: string) => Promise<string | null>;
  onAskRegenerate: () => void;
  onAskRevoke: () => void;
  onCancelConfirm: () => void;
  onConfirmRegenerate: () => void;
  onConfirmRevoke: () => void;
}) {
  // D.1.5 — un link de ENTRADA por superficie (mismo token, mismo verify): el
  // ?next decide dónde aterriza el cliente tras verificar (whitelist).
  const links = state.url
    ? [
        { kind: "kickoff" as const, label: "Link Kickoff", url: state.url, published: !!state.kickoffPublished },
        { kind: "cronograma" as const, label: "Link Cronograma", url: `${state.url}?next=cronograma`, published: !!state.timelinePublished },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-fg mb-1">Acceso del cliente al proyecto</h2>
          <p className="text-xs text-fg-muted">
            {isRevoked
              ? "El acceso está revocado. Generá uno nuevo para reactivarlo."
              : "Activo. El cliente entra con el link + la contraseña. Entregásela por canal seguro."}
          </p>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
            isRevoked
              ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
              : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
          }`}
        >
          {isRevoked ? "Revocado" : "Activo"}
        </span>
      </div>

      {justGenerated && !isRevoked && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-700">
          ✓ Acceso generado. Podés cambiar la contraseña antes de entregarla.
        </div>
      )}

      {!isRevoked && (
        <>
          {/* Links de entrada — uno por superficie (kickoff / cronograma) */}
          <div className="space-y-3">
            {links.map((l) => (
              <LinkRow key={l.kind} label={l.label} url={l.url} published={l.published} />
            ))}
          </div>

          {/* Editor de contraseña — visible, editable, copiable, regenerable */}
          <PasswordEditor saved={state.accessPassword ?? null} onSave={onSavePassword} />
        </>
      )}

      {/* Metadata */}
      <div className="space-y-2 rounded-lg bg-surface-muted border border-line p-3">
        <MetaRow label="Token" value={state.accessToken ?? "—"} mono truncate />
        <MetaRow label="Generado" value={formatDateTime(state.enabledAt)} />
        <MetaRow label="Generado por" value={state.createdBy?.name ?? state.createdBy?.email ?? "—"} />
        <MetaRow label="Último uso" value={state.lastUsedAt ? formatDateTime(state.lastUsedAt) : "Nunca"} />
        {isRevoked && <MetaRow label="Revocado" value={formatDateTime(state.revokedAt)} />}
      </div>

      {/* Acciones destructivas */}
      {!confirming && (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onAskRevoke}
            disabled={isRevoked || working}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Revocar acceso
          </button>
          <button
            onClick={onAskRegenerate}
            disabled={working}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            {isRevoked ? "Generar nuevo acceso" : "Regenerar todo"}
          </button>
        </div>
      )}

      {confirming === "regenerate" && (
        <ConfirmBlock
          message="Regenerar TODO crea un token y una contraseña nuevos: el link actual deja de funcionar inmediatamente. Para cambiar solo la contraseña (manteniendo el link), usá el editor de arriba."
          confirmLabel="Sí, regenerar todo"
          onConfirm={onConfirmRegenerate}
          onCancel={onCancelConfirm}
          working={working}
          destructive
        />
      )}

      {confirming === "revoke" && (
        <ConfirmBlock
          message="Revocar bloquea el acceso del cliente inmediatamente. La metadata se mantiene para auditoría. Después podés generar uno nuevo."
          confirmLabel="Sí, revocar"
          onConfirm={onConfirmRevoke}
          onCancel={onCancelConfirm}
          working={working}
          destructive
        />
      )}
    </div>
  );
}

// ── Editor de contraseña ──────────────────────────────────────────────────────

function PasswordEditor({
  saved,
  onSave,
}: {
  saved: string | null;
  onSave: (pw: string) => Promise<string | null>;
}) {
  const [input, setInput] = useState(saved ?? "");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Re-sembrar cuando cambia el valor guardado (tras guardar / regenerar todo).
  useEffect(() => {
    setInput(saved ?? "");
  }, [saved]);

  const trimmed = input.trim();
  const dirty = input !== (saved ?? "");
  const validLen = trimmed.length >= 8 && trimmed.length <= 64 && !/\s/.test(trimmed);

  const copy = async () => {
    if (!input) return;
    await navigator.clipboard.writeText(input);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    setSavedOk(false);
    const err = await onSave(trimmed);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2500);
  };

  return (
    <div>
      <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
        Contraseña del cliente
      </label>
      <div className="flex items-center gap-1">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          placeholder={saved ? "" : "Generá o escribí una contraseña"}
          className="flex-1 px-2 py-1.5 text-sm bg-surface-muted border border-line rounded-lg text-fg font-mono tracking-wider focus:outline-none focus:border-brand"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          onClick={copy}
          disabled={!input}
          className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted transition-colors flex-shrink-0 disabled:opacity-40"
        >
          {copied ? "✓" : "Copiar"}
        </button>
      </div>

      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={() => {
            setInput(suggestPassword());
            setError(null);
          }}
          className="text-[11px] font-medium text-brand hover:underline"
        >
          Generar otra
        </button>
        <div className="flex-1" />
        {savedOk && <span className="text-[11px] text-emerald-600">Guardada ✓</span>}
        <button
          onClick={save}
          disabled={!dirty || !validLen || saving}
          className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Guardando…" : "Guardar contraseña"}
        </button>
      </div>

      {error && <p className="text-[11px] text-red-500 mt-1.5">{error}</p>}
      {!error && trimmed.length > 0 && !validLen && (
        <p className="text-[11px] text-amber-600 mt-1.5">La contraseña debe tener 8–64 caracteres, sin espacios.</p>
      )}
    </div>
  );
}

// ── Helpers de fila ────────────────────────────────────────────────────────────

function LinkRow({ label, url, published }: { label: string; url: string; published: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">{label}</label>
        <span
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
            published
              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
          }`}
        >
          {published ? "publicado" : "sin publicar"}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <input
          readOnly
          value={url}
          className="flex-1 px-2 py-1.5 text-[11px] bg-surface-muted border border-line rounded-lg text-fg-secondary font-mono"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          onClick={copy}
          className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted transition-colors flex-shrink-0"
        >
          {copied ? "✓" : "Copiar"}
        </button>
      </div>
      {!published && (
        <p className="text-[10px] text-amber-600 mt-1">
          El cliente verá &quot;no disponible&quot; hasta que publiques esta superficie.
        </p>
      )}
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="text-fg-muted w-24 flex-shrink-0">{label}</span>
      <span
        className={`flex-1 text-fg-secondary ${mono ? "font-mono text-[11px]" : ""} ${
          truncate ? "truncate" : "break-all"
        }`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function ConfirmBlock({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  working,
  destructive,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  working: boolean;
  destructive?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 border ${
        destructive ? "bg-red-500/5 border-red-500/30" : "bg-surface-muted border-line"
      }`}
    >
      <p className="text-xs text-fg-secondary leading-relaxed mb-3">{message}</p>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={working}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-muted hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={working}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50 ${
            destructive ? "bg-red-600 hover:bg-red-500" : "bg-brand hover:bg-brand/90"
          }`}
        >
          {working ? "Procesando…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

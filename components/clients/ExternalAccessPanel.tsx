"use client";

/**
 * ExternalAccessButton
 *
 * Botón en el toolbar del proyecto + modal para gestionar el acceso del cliente
 * externo (token revocable + contraseña) al landing del Kickoff:
 *
 *   - "Acceso del cliente" → /external/verify/[accessToken] → token + pass
 *
 * Flujo:
 *   1. Al montar, GET para ver si existe acceso.
 *   2. Si no existe → botón gris "Acceso del cliente" → click → POST → modal
 *      con credenciales nuevas (UNA SOLA VEZ visible la password).
 *   3. Si existe activo → botón verde → click → modal con metadata + acciones
 *      (Regenerar / Revocar).
 *   4. Si existe revocado → botón ámbar → click → modal informa + opción de
 *      regenerar (crea token+pass nuevos).
 *
 * Endpoint backend: app/api/projects/[projectId]/external-access/route.ts
 */
import { useState, useEffect, useCallback } from "react";

interface AccessState {
  exists: boolean;
  accessToken?: string;
  url?: string;
  enabledAt?: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  createdBy?: { name: string; email: string } | null;
}

interface NewCredentials {
  accessToken: string;
  password: string;
  url: string;
  enabledAt: string;
}

export function ExternalAccessButton({ projectId }: { projectId: string }) {
  const [state, setState] = useState<AccessState | null>(null);
  const [open, setOpen] = useState(false);
  const [newCreds, setNewCreds] = useState<NewCredentials | null>(null);
  const [working, setWorking] = useState(false);
  const [confirmingDestructive, setConfirmingDestructive] = useState<
    "regenerate" | "revoke" | null
  >(null);

  // ── Fetch estado actual ───────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/external-access`);
      if (!res.ok) {
        setState({ exists: false });
        return;
      }
      const data = await res.json();
      setState(data);
    } catch {
      setState({ exists: false });
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  const generateOrRegenerate = async () => {
    setWorking(true);
    setConfirmingDestructive(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/external-access`, {
        method: "POST",
      });
      if (!res.ok) {
        alert("No se pudo generar el acceso.");
        return;
      }
      const data: NewCredentials = await res.json();
      setNewCreds(data);
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  const revoke = async () => {
    setWorking(true);
    setConfirmingDestructive(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/external-access`, {
        method: "DELETE",
      });
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
    // Si hay credenciales nuevas visibles, doble-check antes de cerrar
    // (la password no se podrá ver más después).
    if (newCreds) {
      const confirmed = window.confirm(
        "Cerrar va a ocultar la contraseña para siempre. ¿Ya la copiaste y la guardaste en un lugar seguro?",
      );
      if (!confirmed) return;
    }
    setOpen(false);
    setNewCreds(null);
    setConfirmingDestructive(null);
  };

  // ── Botón ─────────────────────────────────────────────────────────────────

  if (!state) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-800 text-xs font-medium bg-gray-900 text-gray-500 opacity-50"
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
    : "bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800";

  const buttonLabel = isActive
    ? "Acceso activo"
    : isRevoked
    ? "Acceso revocado"
    : "Acceso del cliente";

  return (
    <>
      <button
        onClick={() => {
          if (!state.exists) {
            // No existe → abrir modal vacío, el CSE clickea "Generar"
            setOpen(true);
            return;
          }
          setOpen(true);
        }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${buttonClasses}`}
        title="Generar / ver / revocar el acceso del cliente externo al proyecto"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
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
          {newCreds ? (
            <NewCredentialsView creds={newCreds} onAcknowledge={closeModal} />
          ) : !state.exists ? (
            <EmptyState onGenerate={generateOrRegenerate} working={working} />
          ) : (
            <ActiveOrRevokedState
              state={state}
              isRevoked={isRevoked}
              confirming={confirmingDestructive}
              working={working}
              onAskRegenerate={() => setConfirmingDestructive("regenerate")}
              onAskRevoke={() => setConfirmingDestructive("revoke")}
              onCancelConfirm={() => setConfirmingDestructive(null)}
              onConfirmRegenerate={generateOrRegenerate}
              onConfirmRevoke={revoke}
            />
          )}
        </Modal>
      )}
    </>
  );
}

// ── Modal wrapper (overlay + centered card, tema dark) ───────────────────────

function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ── Sub-vistas ────────────────────────────────────────────────────────────────

function EmptyState({
  onGenerate,
  working,
}: {
  onGenerate: () => void;
  working: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white mb-1">
          Acceso del cliente al proyecto
        </h2>
        <p className="text-sm text-gray-400 leading-relaxed">
          Generá un acceso restringido con token + contraseña para que el cliente
          externo entre al landing de SU proyecto. La contraseña se genera
          automáticamente (12 chars seguros) y se muestra UNA SOLA VEZ.
        </p>
      </div>
      <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-3 text-xs text-gray-400 space-y-1">
        <p>
          <span className="font-semibold text-gray-300">Este acceso:</span>{" "}
          requiere token + contraseña, podés revocarlo o regenerarlo cuando
          quieras. El cliente ve el Kickoff publicado en su landing.
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

function NewCredentialsView({
  creds,
  onAcknowledge,
}: {
  creds: NewCredentials;
  onAcknowledge: () => void;
}) {
  const [copiedPwd, setCopiedPwd] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const copy = async (text: string, kind: "pwd" | "url") => {
    await navigator.clipboard.writeText(text);
    if (kind === "pwd") {
      setCopiedPwd(true);
      setTimeout(() => setCopiedPwd(false), 2000);
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white mb-1">
          Credenciales generadas
        </h2>
        <p className="text-sm text-amber-300 leading-relaxed">
          ⚠ La contraseña se muestra <span className="font-semibold">una sola vez</span>.
          Copiala y entregásela al cliente por canal seguro AHORA. Si la perdés,
          tenés que regenerar (el cliente no podrá entrar con la URL hasta ese
          momento).
        </p>
      </div>

      <div className="space-y-3">
        {/* URL */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            URL del cliente
          </label>
          <div className="flex items-center gap-1">
            <input
              readOnly
              value={creds.url}
              className="flex-1 px-2 py-1.5 text-[11px] bg-gray-800 border border-gray-700 rounded-lg text-gray-300 font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={() => copy(creds.url, "url")}
              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition-colors flex-shrink-0"
            >
              {copiedUrl ? "✓" : "Copiar"}
            </button>
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Contraseña (única visualización)
          </label>
          <div className="flex items-center gap-1">
            <input
              readOnly
              value={creds.password}
              className="flex-1 px-2 py-1.5 text-sm bg-gray-800 border border-amber-500/40 rounded-lg text-amber-200 font-mono tracking-wider"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={() => copy(creds.password, "pwd")}
              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-brand text-white hover:bg-brand/90 transition-colors flex-shrink-0"
            >
              {copiedPwd ? "✓" : "Copiar"}
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={onAcknowledge}
        className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 transition-colors"
      >
        Ya copié la contraseña — cerrar
      </button>
    </div>
  );
}

function ActiveOrRevokedState({
  state,
  isRevoked,
  confirming,
  working,
  onAskRegenerate,
  onAskRevoke,
  onCancelConfirm,
  onConfirmRegenerate,
  onConfirmRevoke,
}: {
  state: AccessState;
  isRevoked: boolean;
  confirming: "regenerate" | "revoke" | null;
  working: boolean;
  onAskRegenerate: () => void;
  onAskRevoke: () => void;
  onCancelConfirm: () => void;
  onConfirmRegenerate: () => void;
  onConfirmRevoke: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white mb-1">
            Acceso del cliente al proyecto
          </h2>
          <p className="text-xs text-gray-400">
            {isRevoked
              ? "El acceso está revocado. Generá uno nuevo para reactivarlo."
              : "El acceso está activo. El cliente puede entrar con su URL + contraseña."}
          </p>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
            isRevoked
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          }`}
        >
          {isRevoked ? "Revocado" : "Activo"}
        </span>
      </div>

      {/* Metadata */}
      <div className="space-y-2 rounded-lg bg-gray-800/50 border border-gray-700 p-3">
        <MetaRow label="URL" value={state.url ?? "—"} mono copyable />
        <MetaRow label="Token" value={state.accessToken ?? "—"} mono truncate />
        <MetaRow
          label="Generado"
          value={formatDateTime(state.enabledAt)}
        />
        <MetaRow
          label="Generado por"
          value={state.createdBy?.name ?? state.createdBy?.email ?? "—"}
        />
        <MetaRow
          label="Último uso"
          value={state.lastUsedAt ? formatDateTime(state.lastUsedAt) : "Nunca"}
        />
        {isRevoked && (
          <MetaRow
            label="Revocado"
            value={formatDateTime(state.revokedAt)}
          />
        )}
      </div>

      {/* Acciones */}
      {!confirming && (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onAskRevoke}
            disabled={isRevoked || working}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Revocar acceso
          </button>
          <button
            onClick={onAskRegenerate}
            disabled={working}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {isRevoked ? "Generar nuevo acceso" : "Regenerar"}
          </button>
        </div>
      )}

      {confirming === "regenerate" && (
        <ConfirmBlock
          message="Regenerar va a crear un token y contraseña nuevos. Las credenciales actuales dejarán de funcionar inmediatamente."
          confirmLabel="Sí, regenerar"
          onConfirm={onConfirmRegenerate}
          onCancel={onCancelConfirm}
          working={working}
          destructive
        />
      )}

      {confirming === "revoke" && (
        <ConfirmBlock
          message="Revocar bloquea el acceso del cliente inmediatamente. La metadata se mantiene para auditoría (quién lo creó, cuándo se usó por última vez). Después podés generar uno nuevo."
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

function MetaRow({
  label,
  value,
  mono,
  truncate,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="text-gray-500 w-24 flex-shrink-0">{label}</span>
      <span
        className={`flex-1 text-gray-300 ${mono ? "font-mono text-[11px]" : ""} ${
          truncate ? "truncate" : "break-all"
        }`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
      {copyable && value && value !== "—" && (
        <button
          onClick={copy}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
        >
          {copied ? "✓" : "Copiar"}
        </button>
      )}
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
        destructive
          ? "bg-red-500/5 border-red-500/30"
          : "bg-gray-800/50 border-gray-700"
      }`}
    >
      <p className="text-xs text-gray-300 leading-relaxed mb-3">{message}</p>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={working}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors disabled:opacity-50"
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

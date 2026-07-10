"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui";

// ── Acceso del cliente (pill + modal) ─────────────────────────────────────────
export default function BcAccessButton({ bcId, refreshKey, onRevoked }: { bcId: string; refreshKey: number; onRevoked: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ exists: boolean; url?: string; accessPassword?: string | null; revokedAt?: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  // F5.4 — la contraseña arranca enmascarada (pantallas compartidas/screenshots);
  // se revela a demanda. Copiar siempre copia el valor real, visible o no.
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => { if (!open) setShowPassword(false); }, [open]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/business-cases/${bcId}/external-access`);
      setState(r.ok ? await r.json() : { exists: false });
    } catch {
      setState({ exists: false });
    }
  }, [bcId]);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  const active = !!state?.exists && !state?.revokedAt;
  const copy = (text: string, label: string) =>
    navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copiado.`), () => toast.error("No se pudo copiar."));

  const revoke = async () => {
    setWorking(true);
    try {
      await fetch(`/api/business-cases/${bcId}/revoke`, { method: "POST" });
      await refresh();
      onRevoked();
      toast.info("Acceso revocado.");
    } catch {
      toast.error("No se pudo revocar.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          active ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" : "bg-surface-muted border-line text-fg-secondary hover:bg-surface-hover"
        }`}
        title="Acceso del prospecto al caso de negocio"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        {active ? "Acceso activo" : "Acceso del cliente"}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Acceso del prospecto" size="md">
        {!active ? (
          <p className="text-sm text-fg-muted leading-relaxed">
            Todavía no compartiste el caso. Confirmá secciones y tocá <strong className="text-fg">&quot;Subir al cliente&quot;</strong> para generar el link + contraseña del prospecto.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">El prospecto entra con el link + la contraseña. Entregásela por canal seguro.</p>
            <div>
              <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">Link</label>
              <div className="flex items-center gap-1">
                <input readOnly value={state?.url ?? ""} onFocus={(e) => e.currentTarget.select()} className="flex-1 px-2 py-1.5 text-[11px] bg-surface-muted border border-line rounded-lg text-fg-secondary font-mono" />
                <button onClick={() => state?.url && copy(state.url, "Link")} className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted flex-shrink-0">Copiar</button>
              </div>
            </div>
            {state?.accessPassword && (
              <div>
                <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">Contraseña</label>
                <div className="flex items-center gap-1">
                  <input
                    readOnly
                    type={showPassword ? "text" : "password"}
                    value={state.accessPassword}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 px-2 py-1.5 text-sm bg-surface-muted border border-line rounded-lg text-fg font-mono tracking-wider"
                  />
                  <button
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Ocultar la contraseña" : "Mostrar la contraseña"}
                    className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted flex-shrink-0"
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                  <button onClick={() => state.accessPassword && copy(state.accessPassword, "Contraseña")} className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted flex-shrink-0">Copiar</button>
                </div>
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button onClick={revoke} disabled={working} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                {working ? "Revocando…" : "Revocar acceso"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

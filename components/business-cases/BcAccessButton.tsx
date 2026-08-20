"use client";

/**
 * components/business-cases/BcAccessButton.tsx — el panel de COMPARTIR de una propuesta.
 *
 * Desde el 2026-08-20 la propuesta se comparte SIN contraseña por defecto (Ventas pidió
 * bajar la fricción) y la contraseña es un check opcional. Este modal es donde el CSE:
 *   · copia el link del modo vigente,
 *   · enciende/apaga el check de contraseña (el link cambia de forma, el token NO rota,
 *     así que lo ya enviado sigue funcionando: la puerta vieja redirige a la nueva),
 *   · fija en cuántos días caduca (o que no caduque),
 *   · ve si el cliente ya aprobó, y con qué correo,
 *   · revoca.
 */
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui";

type Aprobacion = {
  approvedAt: string;
  approvedByEmail: string | null;
  approvedByName: string | null;
  /** El cliente aprobó una versión anterior a la publicada hoy. */
  desactualizada: boolean;
};

type Estado = {
  exists: boolean;
  url?: string;
  requiresPassword: boolean;
  accessPassword?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  approval: Aprobacion | null;
};

const VACIO: Estado = { exists: false, requiresPassword: false, approval: null };

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });

/** Días que faltan para `iso` (0 si ya venció). */
const diasHasta = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

export default function BcAccessButton({
  bcId,
  refreshKey,
  onRevoked,
}: {
  bcId: string;
  refreshKey: number;
  onRevoked: () => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<Estado | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  // F5.4 — la contraseña arranca enmascarada (pantallas compartidas/screenshots);
  // se revela a demanda. Copiar siempre copia el valor real, visible o no.
  const [showPassword, setShowPassword] = useState(false);
  // Borrador del campo de días: se escribe libre y se guarda al salir del campo, para no
  // disparar un PATCH por cada tecla (y para que "3" no se guarde camino a "30").
  const [diasDraft, setDiasDraft] = useState("");
  useEffect(() => {
    if (!open) setShowPassword(false);
  }, [open]);

  const aplicar = useCallback((d: Estado) => {
    setState(d);
    setDiasDraft(d.expiresAt ? String(diasHasta(d.expiresAt)) : "");
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/business-cases/${bcId}/external-access`);
      aplicar(r.ok ? await r.json() : VACIO);
    } catch {
      aplicar(VACIO);
    }
  }, [bcId, aplicar]);
  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  const active = !!state?.exists && !state?.revokedAt;
  const aprobada = !!state?.approval;
  const copy = (text: string, label: string) =>
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(`${label} copiado.`), () => toast.error("No se pudo copiar."));

  /** Un solo camino para los tres ajustes del panel (modo, caducidad, aprobación). */
  const patch = async (body: Record<string, unknown>, okMsg?: string) => {
    setWorking(true);
    try {
      const r = await fetch(`/api/business-cases/${bcId}/external-access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d?.error ?? "No se pudo guardar el cambio.");
        await refresh();
        return;
      }
      aplicar(await r.json());
      if (okMsg) toast.success(okMsg);
    } catch {
      toast.error("No se pudo guardar el cambio.");
    } finally {
      setWorking(false);
    }
  };

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

  const guardarDias = () => {
    const limpio = diasDraft.trim();
    // Vacío no significa nada: "que no caduque" tiene su propio botón, y tratar el campo
    // en blanco como "sin vencimiento" abriría el link para siempre por un backspace.
    if (limpio === "") return;
    const n = Number(limpio);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Poné un número de días válido.");
      return;
    }
    if (state?.expiresAt && diasHasta(state.expiresAt) === n) return;
    void patch({ expiresInDays: n }, "Caducidad actualizada.");
  };

  return (
    <>
      {/* Chip de APROBADA junto al botón de acceso. Vive acá y no en el workspace porque el
          estado ya está en este componente: pasarlo por props desde el server dejaría el
          chip viejo después de "Quitar aprobación", que es justo cuando importa que no. */}
      {state?.approval && (
        <button
          onClick={() => setOpen(true)}
          title={`Aprobada el ${fechaCorta(state.approval.approvedAt)}${state.approval.approvedByEmail ? ` por ${state.approval.approvedByEmail}` : ""}`}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            state.approval.desactualizada
              ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
              : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          ✓ {state.approval.desactualizada ? "Aprobó otra versión" : "Aprobada"}
        </button>
      )}

      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          active
            ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            : "bg-surface-muted border-line text-fg-secondary hover:bg-surface-hover"
        }`}
        title="Acceso del prospecto a la propuesta"
      >
        {/* Candado cerrado solo cuando de verdad hay contraseña; si no, un eslabón de link.
            El ícono es lo primero que mira el vendedor y no puede mentir sobre el modo. */}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {state?.requiresPassword ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5"
            />
          )}
        </svg>
        {active ? "Acceso activo" : "Acceso del cliente"}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Acceso del prospecto" size="md">
        {!active ? (
          <p className="text-sm text-fg-muted leading-relaxed">
            Todavía no compartiste la propuesta. Confirmá secciones y tocá{" "}
            <strong className="text-fg">&quot;Subir al cliente&quot;</strong> para generar el link
            del prospecto.
          </p>
        ) : (
          <div className="space-y-4">
            {/* ── Link ──────────────────────────────────────────────────────── */}
            <div>
              <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">
                Link
              </label>
              <div className="flex items-center gap-1">
                <input
                  readOnly
                  value={state?.url ?? ""}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 px-2 py-1.5 text-[11px] bg-surface-muted border border-line rounded-lg text-fg-secondary font-mono"
                />
                <button
                  onClick={() => state?.url && copy(state.url, "Link")}
                  className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted flex-shrink-0"
                >
                  Copiar
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-fg-muted leading-relaxed">
                {state?.requiresPassword
                  ? "El prospecto entra con el link + la contraseña. Entregásela por canal seguro."
                  : "Con este link el prospecto abre la propuesta directo, sin contraseña. Cualquiera que lo reciba puede verla."}
              </p>
            </div>

            {/* ── Contraseña (opcional) ─────────────────────────────────────── */}
            <div className="rounded-lg border border-line p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!state?.requiresPassword}
                  disabled={working}
                  onChange={(e) =>
                    patch(
                      { requiresPassword: e.target.checked },
                      e.target.checked
                        ? "Ahora pide contraseña. El link cambió de forma; el anterior redirige."
                        : "Contraseña quitada. El link anterior redirige al nuevo.",
                    )
                  }
                  className="mt-0.5 accent-brand"
                />
                <span>
                  <span className="block text-xs font-medium text-fg">
                    Pedir contraseña al prospecto
                  </span>
                  <span className="block text-[11px] text-fg-muted leading-relaxed">
                    Para propuestas sensibles. El token no cambia: quien ya tenga el link
                    anterior llega igual, pero por la puerta que corresponda.
                  </span>
                </span>
              </label>

              {state?.requiresPassword && state?.accessPassword && (
                <div>
                  <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">
                    Contraseña
                  </label>
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
                    <button
                      onClick={() =>
                        state.accessPassword && copy(state.accessPassword, "Contraseña")
                      }
                      className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted flex-shrink-0"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Caducidad ─────────────────────────────────────────────────── */}
            <div className="rounded-lg border border-line p-3">
              <span className="block text-xs font-medium text-fg mb-1.5">Caducidad del link</span>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number"
                  min={0}
                  value={diasDraft}
                  disabled={working}
                  onChange={(e) => setDiasDraft(e.target.value)}
                  onBlur={guardarDias}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  placeholder="—"
                  className="w-20 px-2 py-1.5 text-xs bg-surface-muted border border-line rounded-lg text-fg"
                />
                <span className="text-xs text-fg-muted">días desde hoy</span>
                <button
                  onClick={() => patch({ expiresInDays: null }, "El link ya no caduca.")}
                  disabled={working || !state?.expiresAt}
                  className="ml-auto text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-muted disabled:opacity-40"
                >
                  No caduca
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-fg-muted leading-relaxed">
                {state?.expiresAt
                  ? `Vence el ${fechaCorta(state.expiresAt)}. Después el prospecto ve un aviso con tu correo, no un error.`
                  : "Sin vencimiento: el link vive hasta que lo revoques."}
                {aprobada && state?.expiresAt
                  ? " Ya está aprobada, así que no se cierra: el cliente puede releer lo que aprobó."
                  : ""}
              </p>
            </div>

            {/* ── Aprobación del cliente ────────────────────────────────────── */}
            <div className="rounded-lg border border-line p-3">
              <span className="block text-xs font-medium text-fg mb-1.5">
                Aprobación del cliente
              </span>
              {state?.approval ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-emerald-600">
                    ✓ Aprobada el {fechaCorta(state.approval.approvedAt)}
                    {state.approval.approvedByEmail ? ` · ${state.approval.approvedByEmail}` : ""}
                    {state.approval.approvedByName ? ` (${state.approval.approvedByName})` : ""}
                  </p>
                  {state.approval.desactualizada && (
                    <p className="text-[11px] text-amber-600 leading-relaxed">
                      Ojo: la subiste de nuevo después de que aprobara. Lo que aprobó no es lo que
                      el cliente ve hoy.
                    </p>
                  )}
                  <button
                    onClick={() => patch({ clearApproval: true }, "Aprobación quitada.")}
                    disabled={working}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-line text-fg-secondary hover:bg-surface-muted disabled:opacity-50"
                  >
                    Quitar aprobación
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-fg-muted leading-relaxed">
                  Sin aprobar. El prospecto la aprueba desde la propia propuesta dejando su correo,
                  sin crear ninguna cuenta.
                </p>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={revoke}
                disabled={working}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {working ? "Revocando…" : "Revocar acceso"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

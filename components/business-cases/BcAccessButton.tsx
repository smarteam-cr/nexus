"use client";

/**
 * components/business-cases/BcAccessButton.tsx — el panel de COMPARTIR de una propuesta.
 *
 * La propuesta se comparte con un link: la URL es el acceso. Desde el 2026-09-10 no hay
 * contraseña (el modo se retiró; el porqué, en lib/business-cases/access-url.ts). Este modal es
 * donde el CSE:
 *   · copia el link,
 *   · fija en cuántos días caduca (o que no caduque),
 *   · ve si el cliente ya aprobó, y con qué correo,
 *   · revoca (si el link se filtró: revocar y volver a subirla da un link nuevo).
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
  expiresAt?: string | null;
  revokedAt?: string | null;
  approval: Aprobacion | null;
};

const VACIO: Estado = { exists: false, approval: null };

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
  // Borrador del campo de días: se escribe libre y se guarda al salir del campo, para no
  // disparar un PATCH por cada tecla (y para que "3" no se guarde camino a "30").
  const [diasDraft, setDiasDraft] = useState("");

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

  /** Un solo camino para los dos ajustes del panel (caducidad y aprobación). */
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
        {/* Un eslabón de link, no un candado: la propuesta se comparte por link, sin contraseña. */}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5"
          />
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
                Con este link el prospecto abre la propuesta directo, sin contraseña. Cualquiera que
                lo reciba puede verla: si se filtró, revocá el acceso y volvé a subirla al cliente
                para generar un link nuevo.
              </p>
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

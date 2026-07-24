"use client";

/**
 * components/canvas/SugerirParticularidad.tsx
 *
 * El canal que faltaba: el equipo técnico ve el hecho (el cliente se atrasó con los accesos,
 * hoy probamos la conectividad y funcionó, pidieron estos cambios en la sesión) pero solo el
 * CSE puede tocar el cronograma. Hasta ahora eso se resolvía por WhatsApp y se perdía.
 *
 * Manda una SUGERENCIA, no una particularidad: nace con `needsValidation: true`, no suma al
 * corrimiento de semanas ni sale al cliente, y espera a que el CSE la revise en el cronograma
 * (`SugerenciasParticularidad`). Quien sugiere NO aprueba — es la mitad de la que este
 * componente se ocupa.
 *
 * Se monta en el header del canvas Desarrollo, que es donde vive el DEV.
 */
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { useMe } from "@/hooks/useMe";

/** Los tres tipos que el equipo técnico realmente reporta, con el ejemplo que los explica. */
const KINDS = [
  { value: "ATRASO", label: "Atraso", hint: "Algo corrió la fecha (ej. el cliente tardó una semana con los accesos)" },
  { value: "AVISO", label: "Aviso", hint: "Un hecho que el CSE debe saber (ej. probamos la conectividad y funcionó)" },
  { value: "COMPROMISO", label: "Compromiso", hint: "Alguien se comprometió a algo (ej. pidieron estos cambios en la sesión)" },
] as const;

const PARTIES = [
  { value: "CLIENTE", label: "El cliente" },
  { value: "SMARTEAM", label: "Smarteam" },
  { value: "DEV", label: "Desarrollo" },
  { value: "AMBOS", label: "Ambos" },
] as const;

export default function SugerirParticularidad({ projectId }: { projectId: string }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("AVISO");
  const [party, setParty] = useState<string>("CLIENTE");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [weeks, setWeeks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // Gate COSMÉTICO (la barrera real es `cronograma.suggest` en el POST). `=== true` para no
  // parpadear el botón mientras /api/me carga.
  if (me?.permissions?.sections?.cronograma?.suggest !== true) return null;

  const kindMeta = KINDS.find((k) => k.value === kind);

  function reset() {
    setKind("AVISO");
    setParty("CLIENTE");
    setTitle("");
    setDetail("");
    setWeeks("");
    setError(null);
  }

  async function enviar() {
    if (!title.trim()) {
      setError("Escribí qué pasó.");
      return;
    }
    // Un ATRASO sin semanas no es un corrimiento: el servidor lo rechaza igual, pero avisarlo
    // acá evita el viaje y explica POR QUÉ hace falta el número.
    const n = weeks.trim() ? Number(weeks.trim()) : null;
    if (kind === "ATRASO" && (n === null || !Number.isFinite(n) || n < 1)) {
      setError("Un atraso necesita cuántas semanas corrió (al menos 1).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/particularidades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggest: true,
          kind,
          party,
          title: title.trim(),
          detail: detail.trim() || undefined,
          weeksImpact: n,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "No se pudo enviar la sugerencia.");
        return;
      }
      reset();
      setOpen(false);
      setOk(true);
      setTimeout(() => setOk(false), 4000);
    } catch {
      setError("Error de conexión al enviar la sugerencia.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Manda un hecho al CSE para que lo registre en el cronograma. No lo escribe vos: él lo revisa y decide."
        style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
          padding: "6px 12px", borderRadius: 8, cursor: "pointer",
          color: "var(--text-secondary, #6b7280)", background: "transparent",
          border: "1px solid var(--border, #e5e7eb)",
        }}
      >
        {ok ? "✓ Enviada al CSE" : "Sugerir al cronograma"}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Sugerir una particularidad al cronograma">
        <div className="space-y-4">
          <p className="text-xs text-fg-muted">
            Esto no modifica el cronograma. Le llega al CSE como propuesta: él la revisa, la ajusta
            si hace falta y decide si entra.
          </p>

          {error && <Alert variant="danger">{error}</Alert>}

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-fg-secondary">Qué tipo de hecho es</span>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={`text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors ${
                    kind === k.value
                      ? "border-brand text-fg bg-surface-hover"
                      : "border-line text-fg-muted hover:bg-surface-hover"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            {kindMeta && <p className="text-2xs text-fg-muted">{kindMeta.hint}</p>}
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-fg-secondary">Qué pasó</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. El cliente entregó los accesos una semana tarde"
              className="w-full text-sm text-fg bg-transparent border border-line rounded-lg px-3 py-2 focus:outline-none focus:border-brand"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-fg-secondary">Detalle (opcional)</span>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              placeholder="Contexto que el CSE necesita para decidir"
              className="w-full text-sm text-fg bg-transparent border border-line rounded-lg px-3 py-2 focus:outline-none focus:border-brand"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="space-y-1.5">
              <span className="block text-xs font-semibold text-fg-secondary">De quién viene</span>
              <select
                value={party}
                onChange={(e) => setParty(e.target.value)}
                className="text-sm text-fg bg-transparent border border-line rounded-lg px-3 py-2 focus:outline-none focus:border-brand"
              >
                {PARTIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="block text-xs font-semibold text-fg-secondary">
                Semanas de impacto {kind === "ATRASO" ? "(requerido)" : "(opcional)"}
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
                className="w-24 text-sm text-fg bg-transparent border border-line rounded-lg px-3 py-2 focus:outline-none focus:border-brand"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-fg-muted hover:text-fg px-3 py-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={saving}
              className="text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? "Enviando…" : "Enviar al CSE"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

"use client";

/**
 * CanalesSection — sección CURADA "Canales de atención" del Kickoff.
 * Read: horario + lista de canales + correo de soporte (estilo mockup).
 * Edit (CSE): campos inline (horario, correo) + lista add/remove de canales.
 * Persiste toda la `data` del bloque vía onChange (un solo CanvasBlock por sección).
 */
import { useState } from "react";
import type { SectionProps } from "@/components/landing/types";
import { normalizeCanales, type CanalesData } from "./types";

const ICONS: Record<string, string> = {
  horario:
    "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", // reloj
  soporte:
    "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", // sobre
};

function Icon({ path }: { path: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export default function CanalesSection({ data, editable = false, onChange }: SectionProps<CanalesData>) {
  const [draft, setDraft] = useState<CanalesData>(() => normalizeCanales(data));

  // En modo lectura el fresco viene de props (snapshot); en edición mandamos el draft.
  const view = editable ? draft : normalizeCanales(data);

  const commit = (next: CanalesData) => {
    setDraft(next);
    onChange?.(next);
  };

  if (!editable) {
    return (
      <div className="stl-pair" style={{ gap: 20 }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--brand-blue)", marginBottom: 12 }}>
            <Icon path={ICONS.horario} />
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>
              Horario de atención
            </span>
          </div>
          <p style={{ fontSize: 16, color: "var(--text)", lineHeight: 1.5 }}>{view.horario || "—"}</p>
          {view.soporteEmail && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--brand-blue)", marginBottom: 8 }}>
                <Icon path={ICONS.soporte} />
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>
                  Soporte
                </span>
              </div>
              <a href={`mailto:${view.soporteEmail}`} style={{ fontSize: 15, color: "var(--brand-blue)", fontWeight: 600, textDecoration: "none" }}>
                {view.soporteEmail}
              </a>
            </div>
          )}
        </div>
        <div className="card" style={{ padding: 22 }}>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>
            Canales
          </span>
          <ul style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {view.canales.length === 0 && <li style={{ color: "var(--text-muted)", fontSize: 14 }}>—</li>}
            {view.canales.map((c, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: "var(--text)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--brand-teal)", flexShrink: 0 }} />
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // ── Editor (CSE) ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label className="stl-edit-field">
        <span>Horario de atención</span>
        <input
          className="stl-edit-input"
          value={draft.horario}
          placeholder="Lunes a viernes de 8 a.m. a 5 p.m."
          onChange={(e) => setDraft({ ...draft, horario: e.target.value })}
          onBlur={() => onChange?.(draft)}
        />
      </label>

      <div className="stl-edit-field">
        <span>Canales</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {draft.canales.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8 }}>
              <input
                className="stl-edit-input"
                value={c}
                placeholder="WhatsApp (grupos asignados)"
                onChange={(e) => {
                  const canales = [...draft.canales];
                  canales[i] = e.target.value;
                  setDraft({ ...draft, canales });
                }}
                onBlur={() => onChange?.(draft)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => commit({ ...draft, canales: draft.canales.filter((_, j) => j !== i) })}
                title="Quitar canal"
                className="btn-secondary-light"
                style={{ padding: "0 12px" }}
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => commit({ ...draft, canales: [...draft.canales, ""] })}
            className="btn-secondary-light"
            style={{ alignSelf: "flex-start", padding: "7px 12px", fontSize: 13 }}
          >
            + Agregar canal
          </button>
        </div>
      </div>

      <label className="stl-edit-field">
        <span>Correo de soporte</span>
        <input
          className="stl-edit-input"
          value={draft.soporteEmail}
          placeholder="soporte@smarteamcr.com"
          onChange={(e) => setDraft({ ...draft, soporteEmail: e.target.value })}
          onBlur={() => onChange?.(draft)}
        />
      </label>
    </div>
  );
}

"use client";

/**
 * EquipoSection — sección CURADA "Equipo del proyecto" del Kickoff.
 * Read (cliente): grid GRANDE de fotos circulares + nombre + rol (estilo "Equipo Smarteam").
 * Edit (CSE): preview grande de los seleccionados (arrastrables por el ⠿ para ordenarlos,
 * con quitar + rol editable) + picker colapsable para agregar/quitar personas
 * (GET /api/team, con foto). Snapshotea name/role/photoUrl al seleccionar.
 * Persiste `{ members }` (en el orden elegido) vía onChange.
 *
 * El drag vive SOLO en el editor: la vista del cliente sigue siendo un map plano, sin
 * DndContext, para no meter dnd-kit en el SSR de la página externa.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { SectionProps } from "@/components/landing/types";
import { SortableItems } from "@/components/landing/sortable";
import { normalizeEquipo, type EquipoData, type EquipoMember } from "./types";

interface ApiTeamMember {
  id: string;
  name: string;
  email: string;
  area: string | null;
  roleEnum: string;
  photoUrl: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  CSE: "CSE",
  VENTAS: "Sales",
  DEV: "Dev",
  CSL: "CSL",
  MARKETING: "Marketing",
  SUPER_ADMIN: "Super Admin",
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

/** Avatar del landing (foto circular o iniciales sobre azul suave de marca). */
function LandingAvatar({ name, photoUrl, size = 64 }: { name: string; photoUrl: string | null; size?: number }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", display: "block" }} />;
  }
  return (
    <div
      aria-label={name}
      style={{
        width: size, height: size, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--brand-blue-soft)", color: "var(--brand-blue-dark)", fontWeight: 700, fontSize: size * 0.32,
      }}
    >
      {initials(name)}
    </div>
  );
}

/** Persona en GRANDE (foto circular + nombre + rol). En edit: arrastrar + quitar + rol editable. */
function BigMember({
  m, editable, handle, onRemove, onRole, onRoleCommit,
}: {
  m: EquipoMember;
  editable: boolean;
  /** ⠿ que inyecta SortableItems (null con <2 miembros o en lectura). */
  handle?: ReactNode;
  onRemove?: () => void;
  onRole?: (role: string) => void;
  onRoleCommit?: () => void;
}) {
  return (
    // `stl-item` = el CSS del motor revela y posiciona el ⠿ al hacer hover (landing-engine.css).
    <div className={editable ? "stl-item" : undefined} style={{ position: "relative", width: 200, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
      {handle}
      {editable && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Quitar del equipo"
          style={{ position: "absolute", top: -6, right: 24, zIndex: 2, width: 24, height: 24, borderRadius: 999, border: "1px solid var(--border-strong)", background: "var(--bg)", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
        >
          ×
        </button>
      )}
      <LandingAvatar name={m.name} photoUrl={m.photoUrl} size={140} />
      <div style={{ width: "100%" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{m.name}</div>
        {editable ? (
          <input
            className="stl-edit-input"
            value={m.role}
            placeholder="Rol de cara al cliente"
            onChange={(e) => onRole?.(e.target.value)}
            // El rol se persistía solo si además tocabas otra cosa (setRole no llamaba a
            // onChange): escribirlo y salir de la sección lo perdía. Commit en blur.
            onBlur={onRoleCommit}
            style={{ marginTop: 6, fontSize: 14, textAlign: "center" }}
          />
        ) : (
          m.role && <div style={{ fontSize: 15, color: "var(--text-secondary)", marginTop: 2 }}>{m.role}</div>
        )}
      </div>
    </div>
  );
}

const BIG_GRID: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 40, justifyContent: "center" };

export default function EquipoSection({ data, editable = false, onChange }: SectionProps<EquipoData>) {
  const members = normalizeEquipo(editable ? undefined : data).members; // read: desde props
  const [draft, setDraft] = useState<EquipoMember[]>(() => normalizeEquipo(data).members);
  const [team, setTeam] = useState<ApiTeamMember[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(() => normalizeEquipo(data).members.length === 0);

  useEffect(() => {
    if (!editable) return;
    let alive = true;
    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setTeam(d?.members ?? []); })
      .catch(() => { if (alive) setTeam([]); });
    return () => { alive = false; };
  }, [editable]);

  const commit = (next: EquipoMember[]) => {
    setDraft(next);
    onChange?.({ members: next });
  };

  // ── Read (cliente) ──────────────────────────────────────────────────────────
  if (!editable) {
    if (members.length === 0) return null; // sección vacía → el motor la omite
    return <div style={BIG_GRID}>{members.map((m) => <BigMember key={m.teamMemberId} m={m} editable={false} />)}</div>;
  }

  // ── Editor (CSE) ──────────────────────────────────────────────────────────
  const selectedById = new Map(draft.map((m) => [m.teamMemberId, m]));

  const toggle = (t: ApiTeamMember) => {
    if (selectedById.has(t.id)) {
      commit(draft.filter((m) => m.teamMemberId !== t.id));
    } else {
      commit([...draft, {
        teamMemberId: t.id,
        name: t.name,
        role: t.area || ROLE_LABEL[t.roleEnum] || t.roleEnum,
        photoUrl: t.photoUrl,
      }]);
    }
  };

  const setRole = (id: string, role: string) => {
    setDraft((cur) => cur.map((m) => (m.teamMemberId === id ? { ...m, role } : m)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Preview GRANDE de los seleccionados (lo que ve el cliente), reordenable por el ⠿. */}
      {draft.length > 0 && (
        <SortableItems
          items={draft}
          onReorder={commit}
          container={(nodes) => <div style={BIG_GRID}>{nodes}</div>}
        >
          {(m, _i, handle) => (
            <BigMember
              m={m}
              editable
              handle={handle}
              onRemove={() => commit(draft.filter((x) => x.teamMemberId !== m.teamMemberId))}
              onRole={(role) => setRole(m.teamMemberId, role)}
              onRoleCommit={() => onChange?.({ members: draft })}
            />
          )}
        </SortableItems>
      )}

      {/* Picker colapsable para agregar/quitar. */}
      <div style={{ borderTop: draft.length > 0 ? "1px solid var(--border)" : "none", paddingTop: draft.length > 0 ? 16 : 0 }}>
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="btn-secondary-light"
          style={{ padding: "7px 12px", fontSize: 13 }}
        >
          {pickerOpen ? "Ocultar lista" : "+ Agregar / quitar personas"}
        </button>

        {pickerOpen && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
              Tocá una persona para agregarla o quitarla. Las fotos se cargan desde{" "}
              <strong style={{ color: "var(--text-secondary)" }}>Equipo</strong> (una vez por persona).
            </p>
            {team === null ? (
              // Skeleton ESTRUCTURAL: misma grilla y cáscara de card del picker cargado
              // (avatar 40px + dos líneas de texto) para que al llegar la data nada salte.
              // Estilos inline / vars del motor .stl a propósito (este componente también
              // renderiza en la vista externa/PDF — sin tokens Tailwind del tema).
              <div
                role="status"
                aria-label="Cargando el equipo"
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      border: "1.5px solid var(--border)", background: "var(--bg)",
                      borderRadius: 12, padding: 10,
                    }}
                  >
                    <div className="skeleton-shimmer" style={{ width: 40, height: 40, borderRadius: 999, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div className="skeleton-shimmer" style={{ height: 12, width: "70%", borderRadius: 4 }} />
                      <div className="skeleton-shimmer" style={{ height: 10, width: "45%", borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : team.length === 0 ? (
              <p style={{ fontSize: 14, color: "var(--text-muted)" }}>No hay miembros del equipo activos.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {team.map((t) => {
                  const selected = selectedById.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer",
                        border: `1.5px solid ${selected ? "var(--brand-blue)" : "var(--border)"}`,
                        background: selected ? "var(--brand-blue-soft)" : "var(--bg)",
                        borderRadius: 12, padding: 10, transition: "border-color .15s, background .15s",
                      }}
                    >
                      <LandingAvatar name={t.name} photoUrl={t.photoUrl} size={40} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                        <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{t.area || ROLE_LABEL[t.roleEnum] || t.roleEnum}</span>
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: selected ? "var(--brand-blue)" : "var(--text-muted)", flexShrink: 0 }}>
                        {selected ? "✓" : "+"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

/**
 * components/landing/lo-del-cliente.tsx — el cliente llena su parte de la Planificación en el enlace (L4 etapa 6,
 * 2026-10-27). La regla vive en lib/planificacion/lo-del-cliente.ts; acá, las dos caras:
 *
 *   · `PanelDelCliente` (el enlace): debajo de la sección, la lista que el cliente puede tocar con «Editar», «Quitar» (lo
 *     suyo) y «Agregar». Guarda por la server action del enlace y recarga: lo que ve es el documento vivo.
 *   · `ControlDelCse` (el editor): abrir o cerrar la sección al cliente, y lo que escribió sin revisar.
 *
 * Es un documento del cliente (tema claro con los valores del motor, `var(--…)`), no la UI interna. Tuteo.
 */
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { LandingContext } from "./types";
import {
  CLAVE_ABIERTA_AL_CLIENTE,
  REGLAS_DEL_CLIENTE,
  abiertaAlCliente,
  elClienteEdita,
  filasPorRevisar,
  marcarRevisado,
  type SeccionDelCliente,
} from "@/lib/planificacion/lo-del-cliente";

type Fila = Record<string, unknown> & { id?: string };

interface Campo {
  key: string;
  label: string;
  tipo?: "si-no" | "equipo";
  ancho?: boolean;
}

const CAMPOS: Record<SeccionDelCliente, Campo[]> = {
  usuarios_permisos: [
    { key: "nombre", label: "Nombre" },
    { key: "apellido", label: "Apellido" },
    { key: "correo", label: "Correo" },
    { key: "cargo", label: "Cargo" },
    { key: "equipoId", label: "Equipo", tipo: "equipo" },
    { key: "licencia", label: "Licencia que necesita" },
    { key: "superAdmin", label: "Superadministrador", tipo: "si-no" },
    { key: "champion", label: "Champion", tipo: "si-no" },
  ],
  canales_entrada: [
    { key: "canal", label: "Canal" },
    { key: "responsable", label: "Quién lo atiende" },
    { key: "atencion", label: "Cómo se atiende", ancho: true },
    { key: "pasaA", label: "Cómo pasa a otra área", ancho: true },
  ],
  ficha_proyecto: [
    { key: "nombre", label: "Nombre" },
    { key: "cargo", label: "Cargo" },
    { key: "correo", label: "Correo" },
    { key: "telefono", label: "Teléfono" },
  ],
};

const TITULO: Record<SeccionDelCliente, { lista: string; agregar: string }> = {
  usuarios_permisos: { lista: "Los usuarios de tu equipo", agregar: "Agregar un usuario" },
  canales_entrada: { lista: "Tus canales", agregar: "Agregar un canal" },
  ficha_proyecto: { lista: "Quiénes participan de tu lado", agregar: "Agregar una persona" },
};

const txt = (v: unknown) => (typeof v === "string" ? v : "");
const caja: CSSProperties = { border: "1px dashed var(--border)", borderRadius: 12, padding: 16, marginTop: 16, display: "flex", flexDirection: "column", gap: 10 };
const input: CSSProperties = { width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 14, background: "var(--bg)", color: "var(--text)" };
const boton: CSSProperties = { border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", fontSize: 13, background: "var(--bg)", color: "var(--text)", cursor: "pointer" };
const botonAzul: CSSProperties = { ...boton, background: "var(--brand-blue)", borderColor: "var(--brand-blue)", color: "#fff" };

function FormularioDeFila({
  seccion,
  fila,
  equipos,
  guardando,
  onGuardar,
  onCancelar,
}: {
  seccion: SeccionDelCliente;
  fila: Fila;
  equipos: Array<{ id: string; nombre: string }>;
  guardando: boolean;
  onGuardar: (f: Record<string, string>) => void;
  onCancelar: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS[seccion].map((c) => [c.key, txt(fila[c.key])])),
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ ...valores, ...(fila.id ? { id: fila.id } : {}) });
      }}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}
    >
      {CAMPOS[seccion].map((c) => (
        <label key={c.key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-secondary)", gridColumn: c.ancho ? "1 / -1" : undefined }}>
          {c.label}
          {c.tipo === "si-no" ? (
            <select style={input} value={valores[c.key]} onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}>
              <option value="">—</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          ) : c.tipo === "equipo" ? (
            <select style={input} value={valores[c.key]} onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}>
              <option value="">Sin equipo</option>
              {equipos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          ) : (
            <input style={input} value={valores[c.key]} maxLength={300} onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })} />
          )}
        </label>
      ))}
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
        <button type="submit" style={botonAzul} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" style={boton} onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * El enlace: lo que el cliente puede escribir en una sección abierta. Nada si la sección no está abierta (el editor, el PDF
 * y las pruebas no montan el panel ni el router).
 */
export function PanelDelCliente({ seccion, data, ctx }: { seccion: SeccionDelCliente; data: unknown; ctx: LandingContext }) {
  const cliente = ctx.planificacion?.cliente;
  if (!cliente || !elClienteEdita(data)) return null;
  return <PanelAbierto seccion={seccion} data={data} cliente={cliente} />;
}

function PanelAbierto({
  seccion,
  data,
  cliente,
}: {
  seccion: SeccionDelCliente;
  data: unknown;
  cliente: NonNullable<NonNullable<LandingContext["planificacion"]>["cliente"]>;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null); // id de la fila, o "nueva"
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regla = REGLAS_DEL_CLIENTE[seccion];
  const d = (data ?? {}) as Record<string, unknown>;
  const filas = (Array.isArray(d[regla.lista]) ? (d[regla.lista] as Fila[]) : []).filter((f) => f && typeof f === "object" && (!regla.lado || f.lado === regla.lado));
  const equipos = (Array.isArray(d.equipos) ? (d.equipos as Fila[]) : [])
    .filter((e) => e && typeof e.id === "string" && txt(e.nombre).trim())
    .map((e) => ({ id: e.id as string, nombre: txt(e.nombre) }));

  const ejecutar = async (op: Parameters<typeof cliente.guardar>[0]) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await cliente.guardar(op);
      if (!r.ok) return setError(r.error ?? "No se pudo guardar. Vuelve a intentarlo.");
      setEditando(null);
      router.refresh();
    } catch {
      setError("No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.");
    } finally {
      setGuardando(false);
    }
  };

  const nombreDe = (f: Fila) =>
    seccion === "canales_entrada" ? txt(f.canal) : [txt(f.nombre), txt(f.apellido)].filter(Boolean).join(" ") || txt(f.correo) || "Sin nombre";

  return (
    <div style={caja} data-lo-del-cliente={seccion}>
      <strong style={{ fontSize: 14, color: "var(--text)" }}>Completa esta parte</strong>
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        Lo que escribas aquí le llega a tu consultor de Smarteam, que lo revisa antes de configurar HubSpot.
      </span>
      {filas.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>{TITULO[seccion].lista}</span>
          {filas.map((f) =>
            editando === f.id ? (
              <FormularioDeFila
                key={f.id}
                seccion={seccion}
                fila={f}
                equipos={equipos}
                guardando={guardando}
                onGuardar={(v) => void ejecutar({ seccion, op: "guardar", fila: v })}
                onCancelar={() => setEditando(null)}
              />
            ) : (
              <div key={f.id ?? nombreDe(f)} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: "var(--text)" }}>
                <span style={{ flex: 1 }}>
                  {nombreDe(f)}
                  {f.porRevisar === "si" && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}> · por revisar</span>}
                </span>
                {f.id && (
                  <button type="button" style={boton} onClick={() => setEditando(f.id!)} disabled={guardando}>
                    Editar
                  </button>
                )}
                {f.id && f.autor === "cliente" && (
                  <button type="button" style={boton} onClick={() => void ejecutar({ seccion, op: "quitar", id: f.id! })} disabled={guardando}>
                    Quitar
                  </button>
                )}
              </div>
            ),
          )}
        </div>
      )}
      {editando === "nueva" ? (
        <FormularioDeFila
          seccion={seccion}
          fila={{}}
          equipos={equipos}
          guardando={guardando}
          onGuardar={(v) => void ejecutar({ seccion, op: "guardar", fila: v })}
          onCancelar={() => setEditando(null)}
        />
      ) : (
        <div>
          <button type="button" style={boton} onClick={() => setEditando("nueva")} disabled={guardando}>
            + {TITULO[seccion].agregar}
          </button>
        </div>
      )}
      {error && <span style={{ fontSize: 13, color: "#b91c1c" }}>{error}</span>}
    </div>
  );
}

/** El editor: abrir la sección al cliente y lo que escribió sin revisar. Escribe sobre la data cruda de la sección. */
export function ControlDelCse({ seccion, data, onChange }: { seccion: SeccionDelCliente; data: unknown; onChange?: (d: Record<string, unknown>) => void }) {
  if (!onChange) return null;
  const base = { ...((data ?? {}) as Record<string, unknown>) };
  const abierta = abiertaAlCliente(base);
  const porRevisar = filasPorRevisar(base, seccion);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={abierta}
          onChange={(e) => onChange({ ...base, [CLAVE_ABIERTA_AL_CLIENTE]: e.target.checked ? "si" : "no" })}
        />
        El cliente puede llenarla en el enlace
      </label>
      {porRevisar > 0 && (
        <>
          <span style={{ color: "var(--brand-blue)", fontWeight: 600 }}>
            {porRevisar === 1 ? "1 fila que escribió el cliente sin revisar" : `${porRevisar} filas que escribió el cliente sin revisar`}
          </span>
          <button type="button" style={boton} onClick={() => onChange(marcarRevisado(base, seccion))}>
            Marcar revisadas
          </button>
        </>
      )}
    </div>
  );
}

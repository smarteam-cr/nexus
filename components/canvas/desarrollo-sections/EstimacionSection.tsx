"use client";

/**
 * components/canvas/desarrollo-sections/EstimacionSection.tsx
 *
 * Estimación de esfuerzo del equipo técnico. Es `ctxDriven`: NO lee ni escribe el
 * `CanvasBlock` de su sección — el dato vive en la tabla `DevEstimate` y llega por
 * `ctx.desarrollo` (mismo patrón que el cronograma del kickoff). Por eso ignora
 * `data`/`onChange` del motor.
 *
 * APPEND-ONLY: "Volver a estimar" no edita la vigente, agrega una entrada. El historial
 * es el punto — permite ver que se estimó 40h y terminó en 90h, que es lo único con lo
 * que se puede calibrar la próxima.
 *
 * NO SE PUBLICA AL CLIENTE: la superficie externa no arma `ctx.desarrollo`, así que la
 * sección se apaga sola (`ctxEmpty` en la def). El esfuerzo estimado aproxima el costo
 * interno; que no salga es fail-closed por construcción.
 */
import { useState, type FC } from "react";
import type { SectionProps, DevEstimateCtx } from "@/components/landing/types";

/** `2026-08-01` → `1 de agosto de 2026`. Se parsea a mano (sin `new Date`) porque
 *  `new Date("2026-08-01")` es medianoche UTC y al oeste de Greenwich muestra el día previo. */
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
function fmtFecha(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES[m - 1]} de ${y}`;
}
function fmtCuando(iso: string): string {
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("es-CR");
}

function Cifra({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="stl-est-cifra">
      <div className="stl-est-valor">{valor}</div>
      <div className="stl-est-rotulo">{rotulo}</div>
    </div>
  );
}

export const EstimacionSection: FC<SectionProps<Record<string, never>>> = ({ ctx }) => {
  const d = ctx.desarrollo;
  const actual: DevEstimateCtx | null = d?.estimate ?? null;
  const historial = d?.history ?? [];

  const [abierto, setAbierto] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [horas, setHoras] = useState("");
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEstimar = d?.canEstimate === true && typeof d?.onEstimate === "function";

  async function guardar() {
    const h = horas.trim() ? Number(horas.trim()) : null;
    if (h !== null && (!Number.isFinite(h) || h <= 0)) {
      setError("Las horas tienen que ser un número mayor que cero.");
      return;
    }
    if (h === null && !fecha) {
      setError("Indica al menos las horas o la fecha estimada.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await d!.onEstimate!({ hours: h, estimatedDate: fecha || null, note: nota.trim() });
      setHoras("");
      setFecha("");
      setNota("");
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la estimación.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="stl-est">
      {actual ? (
        <>
          <div className="stl-est-cifras">
            {actual.hours != null && <Cifra valor={`${actual.hours} h`} rotulo="Esfuerzo estimado" />}
            {actual.estimatedDate && (
              <Cifra valor={fmtFecha(actual.estimatedDate)} rotulo="Fecha estimada de entrega" />
            )}
          </div>
          {actual.note && <p className="stl-est-nota">{actual.note}</p>}
          <p className="stl-est-meta">
            Estimado por {actual.createdByEmail} · {fmtCuando(actual.createdAt)}
            {historial.length > 0 && (
              <>
                {" · "}
                <button type="button" className="stl-est-link" onClick={() => setVerHistorial((v) => !v)}>
                  {verHistorial
                    ? "Ocultar estimaciones anteriores"
                    : `Ver ${historial.length} estimación${historial.length === 1 ? "" : "es"} anterior${historial.length === 1 ? "" : "es"}`}
                </button>
              </>
            )}
          </p>
        </>
      ) : (
        <p className="stl-est-vacio">
          Todavía no se estimó el esfuerzo de este requerimiento.
          {!puedeEstimar && " La estimación la registra el equipo de desarrollo."}
        </p>
      )}

      {verHistorial && historial.length > 0 && (
        <ul className="stl-est-hist">
          {historial.map((h) => (
            <li key={h.id}>
              <span className="stl-est-hist-cifra">
                {[h.hours != null ? `${h.hours} h` : null, fmtFecha(h.estimatedDate) || null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="stl-est-hist-meta">
                {h.createdByEmail} · {fmtCuando(h.createdAt)}
              </span>
              {h.note && <span className="stl-est-hist-nota">{h.note}</span>}
            </li>
          ))}
        </ul>
      )}

      {/* Gate COSMÉTICO: la barrera real es guardPermission("desarrollo","estimate") en el POST. */}
      {puedeEstimar &&
        (abierto ? (
          <div className="stl-est-form">
            <div className="stl-est-campos">
              <label className="stl-est-campo">
                <span>Horas estimadas</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="stl-est-input"
                  value={horas}
                  onChange={(e) => setHoras(e.target.value)}
                  placeholder="40"
                />
              </label>
              <label className="stl-est-campo">
                <span>Fecha estimada de entrega</span>
                <input
                  type="date"
                  className="stl-est-input"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </label>
            </div>
            <label className="stl-est-campo">
              <span>{actual ? "Por qué cambió respecto a la anterior" : "Nota (opcional)"}</span>
              <input
                type="text"
                className="stl-est-input"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder={
                  actual
                    ? "Ej. el cliente sumó la sincronización de facturas"
                    : "Supuestos o riesgos de la estimación"
                }
              />
            </label>
            {error && <p className="stl-est-error">{error}</p>}
            <div className="stl-est-acciones">
              <button type="button" className="stl-est-btn" onClick={guardar} disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar estimación"}
              </button>
              <button
                type="button"
                className="stl-est-link"
                onClick={() => {
                  setAbierto(false);
                  setError(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="stl-est-btn" onClick={() => setAbierto(true)}>
            {actual ? "Volver a estimar" : "Registrar estimación"}
          </button>
        ))}
    </div>
  );
};

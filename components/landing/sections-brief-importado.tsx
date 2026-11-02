"use client";

/**
 * components/landing/sections-brief-importado.tsx — «El Brief de implementación (la hoja)» en la Planificación
 * (2026-10-29, pregunta 32 del roadmap; lib/planificacion/brief-importado.ts).
 *
 * La hoja que el equipo ya llenó con el cliente, traída de Google Sheets tal cual: una pestaña por botón y sus celdas en
 * una tabla. SOLO INTERNA (el motor no la pinta en lectura, ni en el enlace ni en el PDF): por eso puede tener lo que
 * la hoja traía, correos y notas incluidos.
 *
 * En el editor: sin Brief, un cuadro para pegar el enlace de la hoja; con Brief, de dónde salió, «Volver a traer» (lee la
 * hoja otra vez y reemplaza lo traído) y «Quitar». Traer lo hace el workspace (`ctx.planificacion.traerBrief`): la sección
 * no sabe de rutas.
 */
import { useState } from "react";
import type { SectionProps } from "./types";
import { adoptarBrief, briefImportadoVacio, filasConAlgo, BRIEF_IMPORTADO_VACIO } from "@/lib/planificacion/brief-importado";

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" });
}

export function BriefImportadoSection({ data, ctx, editable, onChange }: SectionProps<unknown>) {
  const b = adoptarBrief(data);
  const vacio = briefImportadoVacio(b);
  const traer = ctx.planificacion?.traerBrief;
  const [activa, setActiva] = useState(0);
  const [enlace, setEnlace] = useState("");
  const [trayendo, setTrayendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // La hoja no nombra al cliente: se pregunta antes de guardarla.
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);
  const [abrirPegar, setAbrirPegar] = useState(false);
  if (!editable) return null; // Solo interna: nunca en lectura.

  const pedir = async (url: string, confirmado?: boolean) => {
    if (!traer || !url.trim()) return;
    setTrayendo(true);
    setAviso(null);
    setPorConfirmar(null);
    try {
      const r = await traer(url.trim(), confirmado);
      if (r.confirmar) setPorConfirmar(url.trim());
      if (!r.ok) setAviso(r.error ?? "No se pudo traer la hoja.");
      else {
        setEnlace("");
        setAbrirPegar(false);
        setActiva(0);
      }
    } finally {
      setTrayendo(false);
    }
  };

  const confirmar = porConfirmar && (
    <div className="stl-plan-acciones">
      <button type="button" className="stl-plan-mini stl-plan-mini--fuerte" disabled={trayendo} onClick={() => void pedir(porConfirmar, true)}>
        Sí, es de este cliente
      </button>
      <button type="button" className="stl-plan-mini" onClick={() => { setPorConfirmar(null); setAviso(null); }}>
        No
      </button>
    </div>
  );

  const pegar = (
    <div className="stl-plan-pegar">
      <label className="stl-plan-pegar-l" htmlFor="brief-enlace">
        Pega el enlace de la hoja del Brief de implementación de este cliente (Google Sheets). Nexus la lee con tu cuenta:
        tienes que poder abrirla.
      </label>
      <input
        id="brief-enlace"
        className="stl-plan-pegar-t"
        type="url"
        placeholder="https://docs.google.com/spreadsheets/d/…"
        value={enlace}
        onChange={(e) => setEnlace(e.target.value)}
      />
      <div className="stl-plan-acciones">
        <button type="button" className="stl-plan-mini stl-plan-mini--fuerte" disabled={!traer || !enlace.trim() || trayendo} onClick={() => void pedir(enlace)}>
          {trayendo ? "Trayendo…" : vacio ? "Traer el Brief" : "Traer esta hoja"}
        </button>
        {!vacio && (
          <button type="button" className="stl-plan-mini" onClick={() => setAbrirPegar(false)}>
            Cancelar
          </button>
        )}
      </div>
      {aviso && <p className="stl-plan-aviso">{aviso}</p>}
      {confirmar}
    </div>
  );

  if (vacio) {
    return (
      <div>
        <p className="stl-plan-aviso">
          Si este cliente ya tiene su Brief de implementación lleno, tráelo acá: queda en la Planificación para el equipo (el
          cliente no lo ve) y la IA lo lee al generar.
        </p>
        {pegar}
      </div>
    );
  }

  const p = b.pestanas[Math.min(activa, b.pestanas.length - 1)];
  const cuando = fecha(b.importadoEn);
  return (
    <div>
      <p className="stl-plan-meta">
        <span>
          {b.url ? (
            <a href={b.url} target="_blank" rel="noreferrer">
              {b.titulo || "La hoja"}
            </a>
          ) : (
            b.titulo || "La hoja"
          )}
        </span>
        <span>· {b.pestanas.length} {b.pestanas.length === 1 ? "pestaña" : "pestañas"} · {filasConAlgo(b)} filas</span>
        {b.pestanasSinTraer ? <span>· {b.pestanasSinTraer} sin traer: la hoja es más grande que lo que entra</span> : null}
        {cuando && <span>· traída el {cuando}{b.importadoPor && b.importadoPor !== "script" ? ` por ${b.importadoPor}` : ""}</span>}
      </p>
      <div className="stl-plan-acciones">
        {b.url && traer && (
          <button type="button" className="stl-plan-mini" disabled={trayendo} onClick={() => void pedir(b.url)} title="Lee la hoja otra vez y reemplaza lo traído">
            {trayendo ? "Trayendo…" : "Volver a traer"}
          </button>
        )}
        {traer && (
          <button type="button" className="stl-plan-mini" onClick={() => setAbrirPegar((v) => !v)}>
            Traer otra hoja
          </button>
        )}
        {onChange && (
          <button type="button" className="stl-plan-mini" onClick={() => onChange({ ...BRIEF_IMPORTADO_VACIO })} title="Quita lo traído de la Planificación (la hoja no se toca)">
            Quitar
          </button>
        )}
      </div>
      {aviso && !abrirPegar && <p className="stl-plan-aviso">{aviso}</p>}
      {!abrirPegar && confirmar}
      {abrirPegar && pegar}
      <div className="stl-plan-tabs" role="tablist" aria-label="Pestañas del Brief">
        {b.pestanas.map((x, i) => (
          <button key={`${x.nombre}-${i}`} type="button" role="tab" aria-selected={x === p} className="stl-plan-tab" onClick={() => setActiva(i)}>
            {x.nombre}
          </button>
        ))}
      </div>
      {p.recortada && <p className="stl-plan-aviso">Esta pestaña es más grande que lo que entra: se trajeron las primeras filas y columnas.</p>}
      <div className="stl-props-scroll">
        <table className="stl-props stl-plan-tabla">
          <tbody>
            {p.filas.map((f, i) => (
              <tr key={i}>
                {f.map((c, j) => (
                  <td key={j} style={{ whiteSpace: "pre-wrap", verticalAlign: "top" }}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

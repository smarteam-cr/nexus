"use client";

/**
 * components/landing/sections-propuesta.tsx — lo propio de la PROPUESTA.
 *
 * Dos secciones:
 *  · `PropuestaSesionesSection` — las mismas sesiones de seguimiento que el
 *    perfil de puesto, pero en rejilla de 2 columnas en vez de la escalera
 *    vertical. Es un componente aparte y NO un prop del de roles porque el mapa
 *    sectionType → Component es POR PLANTILLA: cambiar el mapa de la propuesta
 *    deja intactos los 3 perfiles de puesto, que siguen con su escalera.
 *  · `PropuestaEconomicaSection` — la oferta.
 *
 * ⚠ Ambas renderizan en LECTURA (contenido hardcodeado, ver lib/propuestas/csl.ts).
 * Por eso no llevan `Editable` ni Add/Remove: sin storage detrás sería un editor
 * que no guarda nada.
 */
import type { FC } from "react";
import type { SectionProps } from "./types";
import type { RoleCadenceData } from "./sections-roles";

// ── Quiénes somos: propósito + esqueleto del equipo ─────────────────────────

export interface SmarteamNodo { nodo: string; equipo?: string }
export interface PropuestaSmarteamData {
  proposito: string;
  estructuraTitulo?: string;
  estructuraNota?: string;
  estructura: SmarteamNodo[];
}

export const PropuestaSmarteamSection: FC<SectionProps<PropuestaSmarteamData>> = ({ data }) => {
  const estructura = Array.isArray(data.estructura) ? data.estructura : [];
  return (
    <div className="stl-smarteam">
      <blockquote className="stl-smarteam-proposito">{data.proposito}</blockquote>

      {estructura.length > 0 && (
        <div className="stl-smarteam-estructura">
          {data.estructuraTitulo && <h3 className="stl-card-title">{data.estructuraTitulo}</h3>}
          {/* La nota importa: la lista es el ESQUELETO del equipo, no el
              organigrama de mando. Sin decirlo, se lee como jerarquía. */}
          {data.estructuraNota && <p className="stl-card-detail">{data.estructuraNota}</p>}
          <ul className="stl-checklist">
            {estructura.map((n, i) => (
              <li key={i}>
                <span className="stl-check" aria-hidden>
                  {IconCheck}
                </span>
                <span>
                  <span className="stl-smarteam-nombre">{n.nodo}</span>
                  {n.equipo && <span className="stl-smarteam-equipo"> {n.equipo}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ── Sesiones de seguimiento (2 por fila) ────────────────────────────────────

export const PropuestaSesionesSection: FC<SectionProps<RoleCadenceData>> = ({ data }) => {
  const items = Array.isArray(data.items) ? data.items : [];
  return (
    <>
      {(data.intro ?? "").trim() && <p className="stl-lead">{data.intro}</p>}
      <div className="stl-grid stl-grid-2" style={{ marginTop: 18 }}>
        {items.map((it, i) => (
          <div key={i} className="stl-card stl-cadence">
            <h3 className="stl-card-title">{it.evento}</h3>
            <div className="stl-cadence-meta">
              <div>
                <div className="stl-kpi-field-label">Quiénes</div>
                <div className="stl-kpi-field-value">{it.quienes}</div>
              </div>
              <div>
                <div className="stl-kpi-field-label">Cuándo</div>
                <div className="stl-kpi-field-value">{it.cuando}</div>
              </div>
            </div>
            <div>
              <div className="stl-kpi-field-label">De qué se trata</div>
              <div className="stl-kpi-field-value">{it.formato}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

// ── Propuesta económica ─────────────────────────────────────────────────────

export interface PropuestaFila { concepto: string; quincenal: string; mensual: string }
export interface PropuestaDestacado { titulo: string; texto: string; enfasis?: boolean }
export interface PropuestaBloque { titulo: string; items: string[] }
export interface PropuestaEconomicaData {
  tituloTabla: string;
  encabezados: { concepto: string; quincenal: string; mensual: string };
  filas: PropuestaFila[];
  /** Lo que no es salario base: crecimiento, comisiones. Cards, 2 por fila. */
  destacados?: PropuestaDestacado[];
  /** Listas (condiciones, beneficios). Cards con viñetas de verdad. */
  bloques?: PropuestaBloque[];
}

const IconCheck = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
  </svg>
);

export const PropuestaEconomicaSection: FC<SectionProps<PropuestaEconomicaData>> = ({ data }) => {
  const filas = Array.isArray(data.filas) ? data.filas : [];
  const destacados = Array.isArray(data.destacados) ? data.destacados : [];
  const bloques = Array.isArray(data.bloques) ? data.bloques : [];
  return (
    <div className="stl-oferta">
      <table className="stl-oferta-tabla">
        <caption className="stl-oferta-caption">{data.tituloTabla}</caption>
        <thead>
          <tr>
            <th scope="col">{data.encabezados.concepto}</th>
            <th scope="col">{data.encabezados.quincenal}</th>
            <th scope="col">{data.encabezados.mensual}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              <th scope="row">{f.concepto}</th>
              <td>{f.quincenal}</td>
              <td>{f.mensual}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {destacados.length > 0 && (
        <div className="stl-grid stl-grid-2">
          {destacados.map((d, i) => (
            <div key={i} className={`stl-card stl-oferta-destacado${d.enfasis ? " is-enfasis" : ""}`}>
              <h3 className="stl-card-title">{d.titulo}</h3>
              <p className="stl-card-detail">{d.texto}</p>
            </div>
          ))}
        </div>
      )}

      {/* Los bloques (otros detalles / beneficios) van EN UNA MISMA FILA: son
          dos listas del mismo peso y apiladas alargaban la sección de gusto. */}
      {bloques.length > 0 && (
        <div className="stl-grid stl-grid-2">
          {bloques.map((b, i) => (
            <div key={i} className="stl-card stl-oferta-bloque">
              <h3 className="stl-card-title">{b.titulo}</h3>
              <ul className="stl-checklist">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <span className="stl-check" aria-hidden>
                      {IconCheck}
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

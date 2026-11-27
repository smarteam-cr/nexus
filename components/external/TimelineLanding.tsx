"use client";

/**
 * components/external/TimelineLanding.tsx
 *
 * Render de las páginas externas del cronograma (D.1.5): /external/cronograma (un proyecto) y /external/plan (el plan
 * general de la cuenta). Recibe el shape EXTERNO ya resuelto y filtrado por el chokepoint — read-only, sin nada
 * interno.
 *
 * Estructura: logo de la cuenta, titular «{título} · {cuenta}», la bienvenida si hay, y el Gantt (TimelineSection SIN
 * su header propio — el titular de la página lo reemplaza).
 *
 * ── LO QUE EL EQUIPO DECIDE (2026-11-27) ─────────────────────────────────────
 * `timeline.pagina` (lib/external/pagina-del-cliente.ts) trae lo que el equipo eligió desde adentro: el título (vacío
 * = sin título), si va el nombre de la cuenta, si va el logo, una bienvenida, y qué se muestra del cronograma. Llega
 * congelado en la foto publicada, así que lo que ve el cliente es lo que se publicó.
 *
 * Con `edicion` es la MISMA página dentro de Nexus, editable encima (opción B de Elías, 26 nov): el título se escribe
 * en su lugar y cada pieza que se puede ocultar trae su botón al lado. Sin `edicion`, nada de eso se pinta: el cliente
 * nunca ve un control.
 *
 * Es el wrapper que cumple los dos requisitos de TimelineSection:
 *   - className="kickoff-landing": scope del design system de landing
 *     (app/kickoff-landing.css — nombre histórico, lo usan ambas superficies).
 *   - useReveal sobre el contenedor: las .reveal arrancan en opacity:0 y
 *     aparecen con .is-visible — sin el observer quedarían invisibles.
 */
import { useRef, useState } from "react";
import TimelineSection, { TIMELINE_CONTAINER } from "@/components/canvas/TimelineSection";
import { useReveal } from "@/components/canvas/useLandingMotion";
import type { ExternalTimelineData } from "@/lib/external/timeline-view-types";
import {
  BIENVENIDA_MAX,
  opcionesDelCronograma,
  PAGINA_DEL_CRONOGRAMA,
  resolverPagina,
  TITULO_MAX,
  type PaginaDelCliente,
} from "@/lib/external/pagina-del-cliente";
import { logoHeightCalc, logoScaleStyle, resolveLogoScale } from "@/lib/ui/logo-scale";

/* El contenedor sale importado del Gantt, no copiado: era un número repetido en los dos
   archivos y con el tiempo dejaron de coincidir (1024 acá, 1040 en el motor). */

/** Editar la página desde adentro. Cada cambio llega entero (la página como queda). */
export interface EdicionDeLaPagina {
  onCambio: (pagina: PaginaDelCliente) => void;
}

/* Los controles de edición van con la letra y los grises de la interfaz interna (hex literal: esta página vive fuera
   del tema de la app). Nunca se pintan para el cliente. */
const CONTROL: React.CSSProperties = {
  fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  height: 28,
  padding: "0 10px",
  fontSize: 12,
  color: "#3d4b63",
  background: "#ffffff",
  border: "1px solid #d6dee9",
  borderRadius: 8,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
};
const AYUDA: React.CSSProperties = {
  fontFamily: CONTROL.fontFamily,
  fontSize: 12,
  color: "#5f6d85",
};

export default function TimelineLanding({
  clientName,
  clientLogoUrl,
  clientLogoScale,
  timeline,
  titulo = PAGINA_DEL_CRONOGRAMA.titulo,
  textoVacio = PAGINA_DEL_CRONOGRAMA.vacio,
  edicion,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  /** Tamaño base del cliente. Acá NO hay ajuste por documento: el cronograma no es un
   *  canvas con bloques. Y el fondo es BLANCO, así que siempre va el logo claro. */
  clientLogoScale?: number | null;
  timeline: ExternalTimelineData;
  /** El titular de siempre de esta página (el plan general usa «Plan de trabajo»). El equipo lo puede cambiar. */
  titulo?: string;
  textoVacio?: string;
  /** Solo dentro de Nexus: la página se edita encima. */
  edicion?: EdicionDeLaPagina;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef, [timeline.phases.length]);

  const start = timeline.anchorStartDate;
  const guardada: PaginaDelCliente = timeline.pagina ?? {};
  const pagina = resolverPagina(guardada, titulo);
  const cambiar = (cambio: PaginaDelCliente) => edicion?.onCambio({ ...guardada, ...cambio });

  // El título y la bienvenida se escriben en su lugar y se guardan al salir del campo (no en cada letra).
  const [tituloEnEdicion, setTituloEnEdicion] = useState(pagina.titulo);
  const [bienvenidaEnEdicion, setBienvenidaEnEdicion] = useState(pagina.bienvenida);
  const [escribiendoBienvenida, setEscribiendoBienvenida] = useState(false);
  // Si lo guardado cambia por fuera del campo (al guardar o al deshacer un error), el campo lo sigue. Se compara en el
  // render, no en un efecto: un efecto que copia props al estado pinta dos veces.
  const [vistos, setVistos] = useState({ titulo: pagina.titulo, bienvenida: pagina.bienvenida });
  if (vistos.titulo !== pagina.titulo || vistos.bienvenida !== pagina.bienvenida) {
    setVistos({ titulo: pagina.titulo, bienvenida: pagina.bienvenida });
    setTituloEnEdicion(pagina.titulo);
    setBienvenidaEnEdicion(pagina.bienvenida);
  }

  const conLogo = !!clientLogoUrl && pagina.conLogo;
  const conTitulo = !!pagina.titulo || !!edicion;

  return (
    <div ref={rootRef} className="kickoff-landing">
      {/* Titular de la página (la marca la pone ExternalShell) */}
      <section className="section-light" style={{ padding: "clamp(36px, 5vw, 56px) 24px 0" }}>
        <div style={TIMELINE_CONTAINER}>
          {(conLogo || (edicion && clientLogoUrl)) && (
            <div className="reveal" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
              {conLogo && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={clientLogoUrl!}
                    alt={clientName}
                    style={{
                      ...logoScaleStyle(resolveLogoScale(clientLogoScale)),
                      height: logoHeightCalc(40),
                      // El tope de ancho escala junto con el alto (ver CronogramaCanvas).
                      width: "auto", maxWidth: logoHeightCalc(180), objectFit: "contain", display: "block",
                    }}
                  />
                </>
              )}
              {edicion && (
                <button type="button" style={CONTROL} onClick={() => cambiar({ conLogo: !pagina.conLogo })}>
                  {pagina.conLogo ? "Ocultar el logo" : "Mostrar el logo de la cuenta"}
                </button>
              )}
            </div>
          )}

          {conTitulo && (
            <h1
              className="font-display display-tight reveal"
              style={{ fontSize: "clamp(26px, 3.6vw, 38px)", color: "var(--text)", lineHeight: 1.15, margin: 0, display: "flex", flexWrap: "wrap", alignItems: "baseline" }}
            >
              {edicion ? (
                <input
                  aria-label="Título de la página"
                  value={tituloEnEdicion}
                  maxLength={TITULO_MAX}
                  placeholder="Sin título"
                  onChange={(e) => setTituloEnEdicion(e.target.value)}
                  onBlur={() => tituloEnEdicion.trim() !== pagina.titulo && cambiar({ titulo: tituloEnEdicion.trim() })}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  size={Math.max(8, tituloEnEdicion.length + 1)}
                  style={{
                    font: "inherit", color: "inherit", letterSpacing: "inherit", background: "transparent",
                    border: 0, borderRadius: 6, outline: "2px dashed #93c5fd", outlineOffset: 4, padding: 0, maxWidth: "100%",
                  }}
                />
              ) : (
                pagina.titulo
              )}
              {/* Sin título no va el nombre solo: la vista de adentro muestra lo mismo que el cliente. */}
              {pagina.conNombre && pagina.titulo && (
                <span>
                  <span style={{ color: "var(--text-muted)", fontWeight: 400, margin: "0 10px" }}>·</span>
                  <span className="display-italic" style={{ color: "var(--brand-blue)" }}>{clientName}</span>
                </span>
              )}
            </h1>
          )}
          {edicion && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>
              <span style={AYUDA}>Escribe el título en su lugar; bórralo entero y la página va sin título.</span>
              {/* Sin título el nombre no se pinta solo: el botón no haría nada visible. */}
              {pagina.titulo && (
                <button type="button" style={CONTROL} onClick={() => cambiar({ conNombre: !pagina.conNombre })}>
                  {pagina.conNombre ? `Quitar «· ${clientName}»` : `Poner «· ${clientName}»`}
                </button>
              )}
            </div>
          )}

          {/* La bienvenida: una o dos frases del equipo, debajo del título. */}
          {edicion && (escribiendoBienvenida || pagina.bienvenida) ? (
            <textarea
              aria-label="Bienvenida"
              value={bienvenidaEnEdicion}
              maxLength={BIENVENIDA_MAX}
              rows={2}
              autoFocus={escribiendoBienvenida && !pagina.bienvenida}
              placeholder="Una o dos frases para el cliente"
              onChange={(e) => setBienvenidaEnEdicion(e.target.value)}
              onBlur={() => {
                setEscribiendoBienvenida(false);
                if (bienvenidaEnEdicion.trim() !== pagina.bienvenida) cambiar({ bienvenida: bienvenidaEnEdicion.trim() });
              }}
              style={{
                display: "block", width: "100%", maxWidth: 720, marginTop: 14, font: "inherit", fontSize: 15, lineHeight: 1.6,
                color: "var(--text-secondary)", background: "transparent", border: 0, outline: "2px dashed #93c5fd",
                outlineOffset: 4, borderRadius: 6, padding: 0, resize: "vertical",
              }}
            />
          ) : edicion ? (
            <button type="button" style={{ ...CONTROL, marginTop: 14, borderStyle: "dashed", background: "#f4f7fb" }} onClick={() => setEscribiendoBienvenida(true)}>
              + Agregar una bienvenida
            </button>
          ) : (
            pagina.bienvenida && (
              <p className="reveal" style={{ margin: "14px 0 0", maxWidth: 720, fontSize: 15, lineHeight: 1.6, color: "var(--text-secondary)", whiteSpace: "pre-line" }}>
                {pagina.bienvenida}
              </p>
            )
          )}

          {/* Lo que se muestra del cronograma: tres interruptores, solo adentro. */}
          {edicion && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 18 }}>
              <span style={AYUDA}>Se muestra:</span>
              {(
                [
                  ["conAtrasadas", "Las tareas atrasadas"],
                  ["conResponsables", "Quién hace cada tarea"],
                  ["conResumen", "El resumen del final"],
                ] as const
              ).map(([clave, etiqueta]) => (
                <button
                  key={clave}
                  type="button"
                  role="switch"
                  aria-checked={pagina[clave]}
                  style={{ ...CONTROL, ...(pagina[clave] ? { color: "#1e4b9e", background: "#eaf2ff", borderColor: "#d6e5fb" } : { textDecoration: "line-through" }) }}
                  onClick={() => cambiar({ [clave]: !pagina[clave] })}
                >
                  {pagina[clave] ? "✓ " : ""}
                  {etiqueta}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {timeline.phases.length > 0 ? (
        <TimelineSection
          phases={timeline.phases}
          anchor={start}
          showHeader={false}
          showProgress
          particularidades={timeline.particularidades}
          opciones={opcionesDelCronograma(guardada)}
        />
      ) : (
        <section className="section-light" style={{ padding: "32px 24px 24px" }}>
          <div style={TIMELINE_CONTAINER}>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              {textoVacio}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

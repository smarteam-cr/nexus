"use client";

/**
 * components/canvas/kickoff-sections/AccesoYAcademy.tsx — las dos mejoras del kickoff del 2026-10-23 (área Q del roadmap,
 * docs/kickoff-mejoras-plan.md), sobre el motor de documentos:
 *
 *   · `TuRolSection` («Lo que necesitamos de tu equipo»): la TARJETA FIJA del acceso al portal de HubSpot arriba de todo
 *     y, debajo, las tarjetas de siempre (las escribe el agente). La tarjeta no depende del agente: la pinta la sección.
 *     Aparece en un kickoff que la tiene (`data.acceso`): los generados desde que existe la tarjeta, o uno viejo donde el
 *     CSE la sumó. Así un cliente que ya dio el acceso hace meses no ve un pedido nuevo de un día para el otro.
 *     Con el acceso marcado dado (vivo, `ctx.kickoff.accesoAlPortal`), dice gracias en vez de pedirlo.
 *   · `RutaDeAcademySection` («Tu ruta en HubSpot Academy»): las listas de Academy por rol. Curada: el editor ofrece la
 *     ruta que sugiere Nexus (lib/kickoff/academy.ts) y el CSE quita o suma del catálogo.
 *
 * Tema claro con valores del motor (`var(--…)` del documento): va al enlace del cliente y al PDF. Tuteo.
 */
import type { CSSProperties, FC } from "react";
import Link from "next/link";
import type { SectionProps } from "@/components/landing/types";
import { Editable, RemoveBtn, AddBtn, removeAt } from "@/components/landing/inline";
import { KickoffProseSection } from "./KickoffSections";
import type { ProseData } from "./types";
import { ACCESO_POR_DEFECTO, accesoPedidoDe, paraCuandoEnPalabras, pasosDelAcceso, type AccesoPedido } from "@/lib/kickoff/acceso-al-portal";
import {
  adoptarRutaDeAcademy,
  copiaParaElKickoff,
  etiquetaDeHub,
  listaVisible,
  porRol,
  type ListaEnElKickoff,
  type RutaDeAcademyData,
} from "@/lib/kickoff/academy";

const ROTULO: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" };

/* ── Lo que necesitamos de tu equipo, con el acceso al portal primero ─────────── */

function TarjetaDelAccesoAlPortal({
  acceso,
  dadoEn,
  editable,
  onAcceso,
}: {
  acceso: AccesoPedido;
  dadoEn: string | null;
  editable: boolean;
  onAcceso: (a: AccesoPedido) => void;
}) {
  const fecha = dadoEn ? new Date(dadoEn) : null;
  const dado = !!fecha && !Number.isNaN(fecha.getTime());
  return (
    <div className="card" style={{ padding: 22, borderLeft: "4px solid var(--brand-blue)", marginBottom: 16 }} data-tarjeta="acceso-al-portal">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={ROTULO}>Lo primero</span>
        {dado && (
          <span style={{ fontSize: 13, color: "var(--brand-blue)", fontWeight: 600 }}>
            ✓ Ya nos diste acceso el {fecha!.toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" })}. ¡Gracias!
          </span>
        )}
      </div>
      <h3 style={{ fontSize: 19, fontWeight: 700, color: "var(--text)", margin: "8px 0 6px" }}>{ACCESO_POR_DEFECTO.titulo}</h3>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Sin él no podemos empezar a configurar. Lo necesitamos <strong>{paraCuandoEnPalabras(acceso.para)}</strong>.
      </p>
      <ol style={{ margin: "12px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15, color: "var(--text)", lineHeight: 1.5 }}>
        {pasosDelAcceso(acceso).map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      {editable && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)", display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
          <span style={ROTULO}>Lo ajustas tú (el cliente ve el resultado arriba)</span>
          <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            A quién invitar:
            <Editable as="span" editable value={acceso.correo ?? ""} placeholder={ACCESO_POR_DEFECTO.correo} onCommit={(v) => onAcceso({ ...acceso, correo: v.trim() })} />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            Con qué permisos:
            <Editable as="span" editable value={acceso.permisos ?? ""} placeholder={ACCESO_POR_DEFECTO.permisos} onCommit={(v) => onAcceso({ ...acceso, permisos: v.trim() })} />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            Para cuándo (AAAA-MM-DD o un texto):
            <Editable as="span" editable value={acceso.para ?? ""} placeholder={ACCESO_POR_DEFECTO.para} onCommit={(v) => onAcceso({ ...acceso, para: v.trim() })} />
          </label>
        </div>
      )}
    </div>
  );
}

export const TuRolSection: FC<SectionProps<ProseData>> = (props) => {
  const { data, ctx, editable, onChange } = props;
  const crudo = (data ?? {}) as unknown as Record<string, unknown>;
  const tieneLaTarjeta = !!crudo.acceso && typeof crudo.acceso === "object";
  // Escribe sobre la data CRUDA (como la prosa): las tarjetas de abajo quedan como estaban.
  const setAcceso = (a: AccesoPedido) => onChange?.({ ...crudo, acceso: a } as unknown as ProseData);
  return (
    <>
      {tieneLaTarjeta ? (
        <TarjetaDelAccesoAlPortal
          acceso={accesoPedidoDe(crudo)}
          dadoEn={ctx.kickoff?.accesoAlPortal?.dadoEn ?? null}
          editable={!!editable}
          onAcceso={setAcceso}
        />
      ) : (
        editable && (
          <div style={{ marginBottom: 16 }}>
            <AddBtn onClick={() => setAcceso({ desde: new Date().toISOString() })} label="Sumar el pedido de acceso al portal de HubSpot" />
          </div>
        )
      )}
      <KickoffProseSection {...props} />
    </>
  );
};

/* ── Tu ruta en HubSpot Academy ──────────────────────────────────────────────── */

function TarjetaDeLista({ l, editable, onQuitar }: { l: ListaEnElKickoff; editable: boolean; onQuitar: () => void }) {
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
      {editable && (
        <span style={{ position: "absolute", top: 8, right: 8 }}>
          <RemoveBtn onClick={onQuitar} title="Quitar esta lista" />
        </span>
      )}
      <a href={l.enlace} target="_blank" rel="noopener noreferrer" style={{ fontSize: 16, fontWeight: 700, color: "var(--brand-blue)", textDecoration: "none", paddingRight: 24 }}>
        {l.nombre}
      </a>
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        {[l.hub && l.hub !== "general" ? etiquetaDeHub(l.hub) : "", l.duracion].filter(Boolean).join(" · ") || "HubSpot Academy"}
      </span>
    </div>
  );
}

export const RutaDeAcademySection: FC<SectionProps<RutaDeAcademyData>> = ({ data, ctx, editable, onChange }) => {
  const d = adoptarRutaDeAcademy(data);
  const crudo = (data ?? {}) as unknown as Record<string, unknown>;
  const set = (next: Partial<RutaDeAcademyData>) => onChange?.({ ...crudo, ...d, ...next } as RutaDeAcademyData);
  const visibles = editable ? d.listas : d.listas.filter(listaVisible);
  if (!editable && !visibles.length) return null;

  const academia = ctx.kickoff?.academia;
  const ya = new Set(d.listas.map((l) => l.catalogoId).filter(Boolean));
  const sugeridas = (academia?.sugerida ?? []).filter((l) => !ya.has(l.catalogoId));
  const otras = (academia?.catalogo ?? []).filter((l) => !ya.has(l.id) && !sugeridas.some((s) => s.catalogoId === l.id));
  const quitar = (l: ListaEnElKickoff) => set({ listas: removeAt(d.listas, d.listas.indexOf(l)) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {(editable || d.intro) && (
        <Editable
          as="p"
          className="stl-prose"
          editable={editable}
          value={d.intro ?? ""}
          placeholder="Una frase: para qué le sirve a tu equipo esta ruta…"
          onCommit={(v) => set({ intro: v })}
        />
      )}
      {porRol(visibles).map((g) => (
        <div key={g.rol || "todos"} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={ROTULO}>{g.etiqueta}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {g.listas.map((l) => (
              <TarjetaDeLista key={l.id ?? l.enlace} l={l} editable={!!editable} onQuitar={() => quitar(l)} />
            ))}
          </div>
        </div>
      ))}
      {editable && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 13, color: "var(--text-secondary)" }}>
          {!academia ? (
            <span>Cargando el catálogo de HubSpot Academy…</span>
          ) : !academia.catalogo.length ? (
            <span>
              El catálogo de HubSpot Academy está vacío. Lo llena la líder de Customer Success en{" "}
              <Link href="/customer-success/academy" style={{ color: "var(--brand-blue)" }}>
                Éxito del cliente › HubSpot Academy
              </Link>
              .
            </span>
          ) : (
            <>
              {sugeridas.length > 0 && (
                <AddBtn
                  onClick={() => set({ listas: [...d.listas, ...sugeridas] })}
                  label={`Sumar la ruta que sugiere Nexus (${sugeridas.length} ${sugeridas.length === 1 ? "lista" : "listas"}, por los hubs vendidos)`}
                />
              )}
              {otras.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span>Del catálogo:</span>
                  {otras.map((l) => (
                    <AddBtn key={l.id} onClick={() => set({ listas: [...d.listas, copiaParaElKickoff(l)] })} label={l.nombre} />
                  ))}
                </div>
              )}
              <a href="/customer-success/academy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-blue)" }}>
                Ver el catálogo
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
};

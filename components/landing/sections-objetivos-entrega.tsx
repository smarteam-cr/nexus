"use client";

/**
 * components/landing/sections-objetivos-entrega.tsx — «Objetivos alcanzados» de la Entrega.
 *
 * Desde el 2026-10-07 (pedido de Elías) la entrega muestra los objetivos que definió el
 * Diagnóstico, uno por uno, con su estado: alcanzado, en camino o por medir. Las reglas viven en
 * `lib/delivery/objetivos.ts`; acá solo se pintan.
 *
 * Dos listas, como el impacto (`sections-impacto.tsx`):
 *   · `objetivosPropuestos` — lo que propone la IA, con su evidencia. SOLO en edición.
 *   · `objetivosConfirmados` — lo que el CSE aceptó. Es lo ÚNICO que ve el cliente.
 *
 * Una sección de antes de esta fecha trae capacidades en prosa (`items`) y se sigue pintando con
 * el componente de prosa hasta que se regenere.
 */
import type { FC } from "react";
import type { SectionProps } from "./types";
import { Editable, RemoveBtn, replaceAt, removeAt } from "./inline";
import { KickoffProseSection } from "@/components/canvas/kickoff-sections/KickoffSections";
import {
  ESTADOS_DEL_OBJETIVO,
  ROTULO_DEL_ESTADO,
  esFormatoDeObjetivos,
  estadoDelObjetivo,
  leerObjetivosDeLaEntrega,
  type EstadoDelObjetivo,
  type ObjetivoDeLaEntrega,
  type ObjetivosDeLaEntregaData,
} from "@/lib/delivery/objetivos";

const CLASE_DEL_ESTADO: Record<EstadoDelObjetivo, string> = {
  alcanzado: "stl-origen stl-origen--acordado",
  en_camino: "stl-origen",
  por_medir: "stl-origen stl-origen--supuesto",
};

function Estado({
  estado,
  editable,
  onCambiar,
}: {
  estado: EstadoDelObjetivo;
  editable?: boolean;
  onCambiar?: (e: EstadoDelObjetivo) => void;
}) {
  if (!editable || !onCambiar) return <span className={CLASE_DEL_ESTADO[estado]}>{ROTULO_DEL_ESTADO[estado]}</span>;
  return (
    <span className={CLASE_DEL_ESTADO[estado]}>
      <select
        className="stl-select"
        aria-label="Estado del objetivo"
        value={estado}
        onChange={(e) => onCambiar(estadoDelObjetivo(e.target.value))}
      >
        {ESTADOS_DEL_OBJETIVO.map((e) => (
          <option key={e} value={e}>
            {ROTULO_DEL_ESTADO[e]}
          </option>
        ))}
      </select>
    </span>
  );
}

export const ObjetivosEntregaSection: FC<SectionProps<ObjetivosDeLaEntregaData>> = (props) => {
  const { data, editable, onChange } = props;
  if (!esFormatoDeObjetivos(data)) {
    // Una entrega de antes del 2026-10-07: sus capacidades en prosa, como siempre.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <KickoffProseSection {...(props as SectionProps<any>)} />;
  }

  const propuestos = leerObjetivosDeLaEntrega(data.objetivosPropuestos);
  const confirmados = leerObjetivosDeLaEntrega(data.objetivosConfirmados);
  const set = (next: Partial<ObjetivosDeLaEntregaData>) => onChange?.({ ...data, ...next });
  const cambiar = (i: number, o: ObjetivoDeLaEntrega) => set({ objetivosConfirmados: replaceAt(confirmados, i, o) });

  /* Aceptar MUEVE: sale de las propuestas y entra a lo confirmado. Si quedara en las dos, una
     regeneración reviviría la propuesta que el CSE ya resolvió. */
  const aceptar = (i: number) =>
    set({ objetivosConfirmados: [...confirmados, propuestos[i]], objetivosPropuestos: removeAt(propuestos, i) });

  return (
    <>
      {(editable || data.intro) && (
        <Editable
          as="p"
          className="stl-lead"
          editable={editable}
          value={data.intro ?? ""}
          placeholder="Una frase que enmarca los objetivos (opcional)…"
          onCommit={(v) => set({ intro: v })}
        />
      )}

      {/* ── Lo confirmado: lo ÚNICO que ve el cliente ── */}
      {confirmados.length > 0 && (
        <div className="stl-grid stl-grid-3 stl-obj-lista">
          {confirmados.map((o, i) => (
            <div key={`${o.id}-${i}`} className="stl-item stl-card stl-obj">
              {editable && <RemoveBtn onClick={() => set({ objetivosConfirmados: removeAt(confirmados, i) })} />}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {o.id && <span className="stl-codigo" style={{ marginBottom: 0 }}>{o.id}</span>}
                <Estado estado={o.estado} editable={editable} onCambiar={(estado) => cambiar(i, { ...o, estado })} />
              </div>
              <Editable
                as="h3"
                className="stl-card-title"
                editable={editable}
                value={o.titulo}
                placeholder="El objetivo…"
                onCommit={(v) => cambiar(i, { ...o, titulo: v })}
              />
              {o.medida && <p className="stl-card-detail stl-obj-medida">{o.medida}</p>}
              <Editable
                as="p"
                className="stl-card-detail"
                editable={editable}
                value={o.evidencia}
                placeholder="De dónde sale: lo que dijo quién y cuándo, o qué lo sostiene…"
                onCommit={(v) => cambiar(i, { ...o, evidencia: v })}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Las propuestas de la IA: SOLO en edición, nunca en lectura ── */}
      {editable && propuestos.length > 0 && (
        <div className="stl-kpi-propuestas">
          <p className="stl-kpi-propuestas-titulo">
            Nexus propone el estado de {propuestos.length} {propuestos.length === 1 ? "objetivo" : "objetivos"} del
            diagnóstico. Revisa la evidencia antes de aceptar: al cliente solo le llega lo que aceptes.
          </p>
          {propuestos.map((o, i) => (
            <div key={`${o.id}-${i}`} className="stl-kpi-propuesta">
              <div className="stl-kpi-propuesta-dato" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                {o.id && <span className="stl-codigo" style={{ marginBottom: 0 }}>{o.id}</span>}
                <Estado estado={o.estado} />
                <strong>{o.titulo}</strong>
              </div>
              {o.evidencia ? (
                <blockquote className="stl-kpi-propuesta-cita">{o.evidencia}</blockquote>
              ) : (
                <div className="stl-kpi-propuesta-fuente">Sin evidencia en las reuniones ni en el cronograma.</div>
              )}
              <div className="stl-kpi-propuesta-acciones">
                <button type="button" className="stl-kpi-aceptar" onClick={() => aceptar(i)}>
                  Aceptar
                </button>
                <button
                  type="button"
                  className="stl-kpi-descartar"
                  onClick={() => set({ objetivosPropuestos: removeAt(propuestos, i) })}
                >
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

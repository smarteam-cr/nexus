"use client";

/**
 * components/landing/sections-escala.tsx — la posición en la Escala de Rendimiento.
 *
 * UN renderer para los cuatro documentos que la usan: la Propuesta la estima, el Kickoff dice desde
 * dónde se arranca, el Diagnóstico la ubica con evidencia y la Entrega la devuelve como punto de
 * partida. La forma del dato vive en `lib/escala/posicion.ts`.
 *
 * Una tarjeta por área, y adentro las DOS capas —base operativa y producción— con su nivel, los
 * cinco tramos y lo que marca el piso. Se lee por capa y no con una cifra suelta a propósito: el
 * reglamento dice que «tu base operativa está en Funcional, tu producción en Inicial» dice qué hacer,
 * y «Ventas: Inicial» lo esconde.
 *
 * ⚠ Los diagnósticos de antes de la 5.2 guardan tarjetas «N/5» (medidas con la v4). Se siguen
 * pintando con la grilla de métricas de siempre: otra vara, y el documento ya se le presentó así.
 */
import type { FC } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { RoiSection } from "./sections";
import { landingLang, t, type LandingLang } from "./i18n";
import type { RoiData, SectionProps } from "./types";
import {
  esPosicionLegada,
  valorDeNivel,
  type AreaEnLaEscala,
  type PosicionEnLaEscala,
} from "@/lib/escala/posicion";

type EscalaData = Partial<PosicionEnLaEscala> & { metrics?: RoiData["metrics"] };

const AREA_NUEVA: AreaEnLaEscala = {
  area: "",
  base: "",
  basePiso: "",
  produccion: "",
  produccionPiso: "",
  brecha: "",
  cercania: "",
  meta: "",
};

/** Los cinco tramos, encendidos hasta el nivel. Decorativos: el nivel ya se dice con su nombre. */
function Tramos({ nivel }: { nivel: string }) {
  const valor = valorDeNivel(nivel) ?? 0;
  return (
    <div className="stl-escala-tramos" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= valor ? "is-on" : undefined} />
      ))}
    </div>
  );
}

/** El nivel con su cifra delante («3 Funcional»). La cifra se deriva: lo guardado es el nombre. */
function Nivel({
  nivel,
  editable,
  onCommit,
}: {
  nivel: string;
  editable?: boolean;
  onCommit: (v: string) => void;
}) {
  const valor = valorDeNivel(nivel);
  return (
    <span className="stl-escala-nivel">
      {valor !== null && <span className="stl-escala-cifra">{valor}</span>}
      <Editable as="span" editable={editable} value={nivel} placeholder="Funcional" onCommit={onCommit} />
    </span>
  );
}

function Capa({
  rotulo,
  nivel,
  piso,
  editable,
  onNivel,
  onPiso,
}: {
  rotulo: string;
  nivel: string;
  piso: string;
  editable?: boolean;
  onNivel: (v: string) => void;
  onPiso: (v: string) => void;
}) {
  // Una capa sin evidencia no lleva nivel, y en lectura no se muestra: un casillero vacío se
  // leería como «cero», que es exactamente lo que no se midió.
  if (!editable && !nivel) return null;
  return (
    <div className="stl-escala-capa">
      <div className="stl-escala-fila">
        <span className="stl-escala-rotulo">{rotulo}</span>
        <Nivel nivel={nivel} editable={editable} onCommit={onNivel} />
      </div>
      <Tramos nivel={nivel} />
      {(piso || editable) && (
        <Editable
          as="p"
          className="stl-escala-piso"
          editable={editable}
          value={piso}
          placeholder="La dimensión que marca el piso y su evidencia, en una línea"
          onCommit={onPiso}
        />
      )}
    </div>
  );
}

function Area({
  a,
  lang,
  editable,
  onChange,
  onRemove,
}: {
  a: AreaEnLaEscala;
  lang: LandingLang;
  editable?: boolean;
  onChange: (cambio: Partial<AreaEnLaEscala>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="stl-item stl-card stl-escala-area">
      {editable && <RemoveBtn onClick={onRemove} />}
      <Editable
        as="h3"
        className="stl-card-title"
        editable={editable}
        value={a.area}
        placeholder="Ventas"
        onCommit={(v) => onChange({ area: v })}
      />
      <Capa
        rotulo={t(lang, "escalaBase")}
        nivel={a.base}
        piso={a.basePiso}
        editable={editable}
        onNivel={(v) => onChange({ base: v })}
        onPiso={(v) => onChange({ basePiso: v })}
      />
      <Capa
        rotulo={t(lang, "escalaProduccion")}
        nivel={a.produccion}
        piso={a.produccionPiso}
        editable={editable}
        onNivel={(v) => onChange({ produccion: v })}
        onPiso={(v) => onChange({ produccionPiso: v })}
      />
      {(a.brecha || editable) && (
        <div className="stl-escala-capa">
          <span className="stl-escala-rotulo">{t(lang, "escalaBrecha")}</span>
          <Editable
            as="p"
            className="stl-escala-brecha"
            editable={editable}
            value={a.brecha}
            placeholder="Qué dice la distancia entre las dos capas"
            onCommit={(v) => onChange({ brecha: v })}
          />
        </div>
      )}
      {(a.cercania || editable) && (
        <Editable
          as="p"
          className="stl-escala-cercania"
          editable={editable}
          value={a.cercania}
          placeholder="Cerca del siguiente nivel (opcional)"
          onCommit={(v) => onChange({ cercania: v })}
        />
      )}
      {(a.meta || editable) && (
        <div className="stl-escala-fila stl-escala-meta">
          <span className="stl-escala-rotulo">{t(lang, "escalaMeta")}</span>
          <Nivel nivel={a.meta} editable={editable} onCommit={(v) => onChange({ meta: v })} />
        </div>
      )}
    </div>
  );
}

export const EscalaPosicionSection: FC<SectionProps<EscalaData>> = (props) => {
  const { data, ctx, editable, onChange } = props;
  if (esPosicionLegada(data)) {
    return <RoiSection {...(props as unknown as SectionProps<RoiData>)} />;
  }
  const lang = landingLang(ctx.lang);
  const areas = data.areas ?? [];
  const set = (next: Partial<EscalaData>) => onChange?.({ ...data, ...next });

  return (
    <>
      {(data.intro || editable) && (
        <Editable
          as="p"
          className="stl-intro"
          editable={editable}
          value={data.intro ?? ""}
          placeholder="Una frase de encuadre"
          onCommit={(v) => set({ intro: v })}
        />
      )}
      {areas.length > 0 && (
        <div className="stl-escala-grid">
          {areas.map((a, i) => (
            <Area
              key={i}
              a={a}
              lang={lang}
              editable={editable}
              onChange={(cambio) => set({ areas: replaceAt(areas, i, { ...a, ...cambio }) })}
              onRemove={() => set({ areas: removeAt(areas, i) })}
            />
          ))}
        </div>
      )}
      {editable && <AddBtn label="Agregar área" onClick={() => set({ areas: appendItem(areas, { ...AREA_NUEVA }) })} />}
      {(data.remedicion || editable) && (
        <p className="stl-escala-remedicion">
          <span className="stl-escala-rotulo">{t(lang, "escalaRemedicion")}</span>
          <Editable
            as="span"
            editable={editable}
            value={data.remedicion ?? ""}
            placeholder="Cuándo se vuelve a medir"
            onCommit={(v) => set({ remedicion: v })}
          />
        </p>
      )}
    </>
  );
};

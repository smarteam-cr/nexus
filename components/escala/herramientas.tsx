"use client";

/**
 * components/escala/herramientas.tsx — el filtro «Herramientas» de la escala y sus marcas.
 *
 * Pedido de Elías (2026-10-01): poder prender Insider One, HubSpot o Smarteam y ver en qué celdas y
 * en qué criterios aplica cada una, varias a la vez. Todo sale del mapa de herramientas PUBLICADO
 * (`lib/escala/herramientas`): ni una herramienta ni lo que aporta está escrito acá.
 *
 *   · `FiltroDeHerramientas`: los botones que se prenden y se apagan (no son excluyentes).
 *   · `ResumenDeHerramientas`: con alguna prendida, qué es cada una y en cuántos criterios aplica.
 *   · `MarcaDeHerramienta`: el isotipo de la herramienta en un círculo claro (o, si no tiene, un
 *     punto de su color con su sigla). ⛔ Nunca pinta una celda: el color de una celda es SIEMPRE el
 *     de su nivel (rueda legible, 09-30); la herramienta va encima.
 *   · `HerramientasDelCriterio`: debajo de un criterio, lo que aporta cada herramienta prendida.
 *
 * «Aplica» quiere decir que la herramienta lo hace posible, no que lo cumple: lo dice el mapa en su
 * introducción, y el resumen lo muestra.
 */
import { createContext, useContext, useMemo } from "react";
import { cn } from "@/lib/cn";
import { aplica, type Perfil } from "@/lib/escala/documento/perfil";
import type { Criterio } from "@/lib/escala/documento/tipos";
import { LETRAS_QUE_SE_MAPEAN, type ColorDeHerramienta, type Herramienta } from "@/lib/escala/herramientas/tipos";
import { aportesDelCriterio, type HerramientasDeLaVista } from "@/lib/escala/herramientas/vista";
import type { DatosDeLaVista } from "@/lib/escala/vista";
import { Isotipo, tieneIsotipo } from "./isotipos";
import { GrupoDeControl, ParrafoDeLaEscala } from "./piezas";

/** Para el SVG de la rueda. Tokens del tema (globals.css), nunca hex sueltos. */
export const COLOR_DE_HERRAMIENTA: Record<ColorDeHerramienta, string> = {
  celeste: "var(--color-herramienta-celeste)",
  naranja: "var(--color-herramienta-naranja)",
  fucsia: "var(--color-herramienta-fucsia)",
  turquesa: "var(--color-herramienta-turquesa)",
  lima: "var(--color-herramienta-lima)",
};

/** Las mismas, como clase (escritas enteras para que Tailwind las genere). */
const FONDO_DE_HERRAMIENTA: Record<ColorDeHerramienta, string> = {
  celeste: "bg-herramienta-celeste",
  naranja: "bg-herramienta-naranja",
  fucsia: "bg-herramienta-fucsia",
  turquesa: "bg-herramienta-turquesa",
  lima: "bg-herramienta-lima",
};

interface HerramientasPrendidas {
  /** Las claves prendidas en el filtro, en el orden del documento. */
  activas: readonly string[];
  mapa: HerramientasDeLaVista | null;
}

const Contexto = createContext<HerramientasPrendidas>({ activas: [], mapa: null });

/** Lo pone la sección una vez, arriba: las tres vistas leen de acá qué está prendido. */
export const ProveedorDeHerramientas = Contexto.Provider;

/**
 * Lo que necesita una vista para marcar sus criterios: qué aporta cada herramienta prendida en un
 * criterio y si el criterio queda a media luz (hay herramientas prendidas y ninguna aplica ahí).
 */
export function useHerramientas() {
  const { activas, mapa } = useContext(Contexto);
  return useMemo(() => {
    const hayFiltro = activas.length > 0 && !!mapa;
    const aportesDe = (criterio: string) => aportesDelCriterio(mapa, activas, criterio);
    return {
      activas,
      mapa,
      hayFiltro,
      aportesDe,
      /** Con herramientas prendidas, lo que ninguna toca se aclara (como en la rueda). */
      atenuado: (criterio: string) => hayFiltro && aportesDe(criterio).length === 0,
      /** Las herramientas prendidas, en el orden del documento. */
      prendidas: mapa ? mapa.herramientas.filter((h) => activas.includes(h.clave)) : [],
    };
  }, [activas, mapa]);
}

/**
 * La marca de una herramienta: su isotipo sobre un círculo claro (pedido de Elías, 2026-10-02). Una
 * herramienta sin isotipo lleva un punto de su color con su sigla.
 */
export function MarcaDeHerramienta({ herramienta, className }: { herramienta: Pick<Herramienta, "clave" | "color" | "sigla">; className?: string }) {
  if (tieneIsotipo(herramienta.clave)) {
    return (
      <span className={cn("inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-line", className)} aria-hidden>
        <Isotipo clave={herramienta.clave} width={11} height={11} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-herramienta-fg",
        FONDO_DE_HERRAMIENTA[herramienta.color],
        className,
      )}
      aria-hidden
    >
      {herramienta.sigla}
    </span>
  );
}

/**
 * Cuántos criterios de lo que se ve (con el perfil elegido) toca una herramienta, de los que se
 * pueden mapear: de Funcional para arriba (Deficiente e Inicial describen lo que falta).
 */
function cuantosToca(datos: DatosDeLaVista, perfil: Perfil, h: Herramienta): { toca: number; de: number } {
  const criterios = datos.area.dimensiones
    .flatMap((d) => d.niveles.filter((n) => LETRAS_QUE_SE_MAPEAN.includes(n.letra)).flatMap((n) => n.criterios))
    .filter((c) => aplica(c, perfil));
  return { toca: criterios.filter((c) => h.aportes[c.id] !== undefined).length, de: criterios.length };
}

/** «Funcional», con la grafía de la escala publicada. */
const nombreDeNivel = (datos: DatosDeLaVista, letra: string) => datos.niveles.find((n) => n.letra === letra)?.nombre ?? letra;

/** Las negritas de markdown, fuera: el tooltip es texto plano. */
const sinMarcas = (s: string) => s.replace(/\*\*/g, "");

export function FiltroDeHerramientas({
  datos,
  perfil,
  activas,
  onCambio,
}: {
  datos: DatosDeLaVista;
  perfil: Perfil;
  activas: readonly string[];
  onCambio: (activas: string[]) => void;
}) {
  const mapa = datos.herramientas;
  if (!mapa || mapa.herramientas.length === 0) return null;
  const alternar = (clave: string) => {
    const nuevas = activas.includes(clave) ? activas.filter((a) => a !== clave) : [...activas, clave];
    // En el orden del documento, para que la URL y las marcas salgan siempre igual.
    onCambio(mapa.herramientas.map((h) => h.clave).filter((c) => nuevas.includes(c)));
  };
  // Qué es el mapa y cómo se lee (sus dos primeros párrafos), sin escribirlo acá: sale del documento.
  const ayuda = `${mapa.intro.slice(0, 2).map(sinMarcas).join(" ")} Se pueden prender varias a la vez. Mapa de herramientas ${mapa.version}.`;
  return (
    <GrupoDeControl nombre="Herramientas" ayuda={ayuda}>
      <div className="flex flex-col gap-1">
        <span className="text-2xs text-fg-secondary">Dónde ayuda cada una</span>
        <div role="group" aria-label="Herramientas" className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-line bg-surface-muted p-0.5">
          {mapa.herramientas.map((h) => {
            const prendida = activas.includes(h.clave);
            const { toca } = cuantosToca(datos, perfil, h);
            return (
              <button
                key={h.clave}
                type="button"
                aria-pressed={prendida}
                onClick={() => alternar(h.clave)}
                title={`${h.nombre}: ${h.queEs}${h.cuandoConviene ? ` Cuándo conviene: ${h.cuandoConviene}` : ""} Aplica en ${toca} ${toca === 1 ? "criterio" : "criterios"} de ${datos.area.nombre}.`}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors",
                  prendida ? "bg-surface font-semibold text-fg shadow-sm" : "text-fg-muted hover:text-fg-secondary",
                )}
              >
                <MarcaDeHerramienta herramienta={h} className={cn(!prendida && "opacity-60")} />
                {h.nombre}
                <span className="tabular-nums text-2xs font-normal text-fg-muted">{toca}</span>
              </button>
            );
          })}
        </div>
      </div>
    </GrupoDeControl>
  );
}

/**
 * Con alguna herramienta prendida, debajo de los filtros: qué es cada una, en cuántos criterios de
 * esta área aplica y lo que el mapa dice de cómo leerlo («lo habilita, no lo cumple»).
 */
export function ResumenDeHerramientas({ datos, perfil, activas }: { datos: DatosDeLaVista; perfil: Perfil; activas: readonly string[] }) {
  const mapa = datos.herramientas;
  if (!mapa) return null;
  const prendidas = mapa.herramientas.filter((h) => activas.includes(h.clave));
  if (prendidas.length === 0) return null;
  // El primer párrafo con título de la introducción del mapa («Lo habilita, no lo cumple.»): cómo se lee.
  const principio = mapa.intro.find((p) => p.startsWith("**"));
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-2 text-xs text-fg-secondary">
      <ul className="flex flex-col gap-1.5">
        {prendidas.map((h) => {
          const { toca, de } = cuantosToca(datos, perfil, h);
          return (
            <li key={h.clave} className="flex items-start gap-2">
              <MarcaDeHerramienta herramienta={h} className="mt-px" />
              <span className="min-w-0">
                <span className="font-semibold text-fg">{h.nombre}</span> aplica en <span className="font-semibold tabular-nums text-fg">{toca}</span> de los {de}{" "}
                criterios de {nombreDeNivel(datos, LETRAS_QUE_SE_MAPEAN[0])} a {nombreDeNivel(datos, LETRAS_QUE_SE_MAPEAN[LETRAS_QUE_SE_MAPEAN.length - 1])} de{" "}
                {datos.area.nombre}. {h.queEs}
                {(h.revisado || h.responsable) && (
                  <span className="text-fg-muted">
                    {" "}
                    ({[h.revisado && `revisado el ${h.revisado}`, h.responsable && `responsable: ${h.responsable}`].filter(Boolean).join(" · ")})
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {principio && (
        <div className="rounded-md bg-info-surface px-2 py-1.5 leading-relaxed text-info-ink">
          <ParrafoDeLaEscala texto={principio} className="text-info-ink" />
        </div>
      )}
    </div>
  );
}

/**
 * Debajo de un criterio: lo que aporta cada herramienta prendida. Compacto (la matriz) es una
 * etiqueta por herramienta con lo que aporta al pasar el cursor; con texto (la escalera, el panel de
 * la rueda), una línea por herramienta.
 */
export function HerramientasDelCriterio({ criterio, conTexto = false, className }: { criterio: Pick<Criterio, "id">; conTexto?: boolean; className?: string }) {
  const { aportesDe } = useHerramientas();
  const aportes = aportesDe(criterio.id);
  if (aportes.length === 0) return null;
  if (conTexto) {
    return (
      <ul className={cn("flex flex-col gap-1", className)}>
        {aportes.map(({ herramienta: h, aporte }) => (
          <li key={h.clave} className="flex items-start gap-1.5 text-xs leading-snug text-fg-secondary">
            <MarcaDeHerramienta herramienta={h} className="mt-px" />
            <span>
              <span className="font-semibold text-fg">{h.nombre}:</span> {aporte}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {aportes.map(({ herramienta: h, aporte }) => (
        <span
          key={h.clave}
          title={`${h.nombre}: ${aporte}`}
          className="inline-flex cursor-help items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-0.5 text-2xs font-medium text-fg-secondary"
        >
          <MarcaDeHerramienta herramienta={h} />
          {h.nombre}
        </span>
      ))}
    </span>
  );
}

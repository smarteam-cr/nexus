"use client";

/**
 * components/escala/herramientas.tsx — el filtro «Herramientas» de la escala y sus marcas.
 *
 * Pedido de Elías (2026-10-01): poder prender Insider One, HubSpot o Smarteam y ver en qué celdas y
 * en qué criterios aplica cada una, varias a la vez. Todo sale del mapa de herramientas PUBLICADO
 * (`lib/escala/herramientas`): ni una herramienta ni lo que aporta está escrito acá.
 *
 *   · `FiltroDeHerramientas`: chips que se prenden y se apagan (no son excluyentes); la prendida,
 *     en azul con ✓ (el azul es «lo activo» en el sistema «Nexus · interfaz interna»).
 *   · `ResumenDeHerramientas`: con alguna prendida, el aviso de cómo se lee. La cuenta ya va en el
 *     chip: no se repite.
 *   · `MarcaDeHerramienta`: el isotipo de la herramienta (o, si no tiene, un punto de su color con
 *     su sigla). En la rueda va sobre un círculo claro. ⛔ Nunca pinta una celda: el color de una
 *     celda es SIEMPRE el de su nivel (rueda legible, 09-30); la herramienta va encima.
 *   · `HerramientasDelCriterio`: debajo de un criterio, lo que aporta cada herramienta prendida.
 *
 * «Aplica» quiere decir que la herramienta lo hace posible, no que lo cumple: lo dice el mapa en su
 * introducción, y el resumen lo muestra.
 */
import { createContext, useContext, useMemo } from "react";
import { Alert } from "@/components/ui";
import { cn } from "@/lib/cn";
import { aplica, type Perfil } from "@/lib/escala/documento/perfil";
import type { Criterio } from "@/lib/escala/documento/tipos";
import { LETRAS_QUE_SE_MAPEAN, type ColorDeHerramienta, type Herramienta } from "@/lib/escala/herramientas/tipos";
import { aportesDelCriterio, type HerramientasDeLaVista } from "@/lib/escala/herramientas/vista";
import type { DatosDeLaVista } from "@/lib/escala/vista";
import { Isotipo, tieneIsotipo } from "./isotipos";
import { GrupoDeControl } from "./piezas";

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
 * La marca de una herramienta: su isotipo (pedido de Elías, 2026-10-02), de 16 px junto a un texto
 * y de 14 en una etiqueta chica. Una herramienta sin isotipo lleva un punto de su color con su sigla.
 */
export function MarcaDeHerramienta({
  herramienta,
  tamano = 16,
  className,
}: {
  herramienta: Pick<Herramienta, "clave" | "color" | "sigla">;
  tamano?: number;
  className?: string;
}) {
  if (tieneIsotipo(herramienta.clave)) {
    return <Isotipo clave={herramienta.clave} width={tamano} height={tamano} className={cn("flex-shrink-0", className)} />;
  }
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-herramienta-fg",
        FONDO_DE_HERRAMIENTA[herramienta.color],
        className,
      )}
      style={{ minWidth: tamano, height: tamano }}
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
      <div role="group" aria-label="Herramientas" className="flex flex-wrap gap-1.5">
        {mapa.herramientas.map((h) => {
          const prendida = activas.includes(h.clave);
          const { toca, de } = cuantosToca(datos, perfil, h);
          const vigencia = [h.revisado && `Revisado el ${h.revisado}`, h.responsable && `responsable: ${h.responsable}`].filter(Boolean).join(" · ");
          return (
            <button
              key={h.clave}
              type="button"
              aria-pressed={prendida}
              onClick={() => alternar(h.clave)}
              title={`${h.nombre}: ${h.queEs}${h.cuandoConviene ? ` Cuándo conviene: ${h.cuandoConviene}` : ""} Aplica en ${toca} de los ${de} criterios de Funcional a Óptimo de ${datos.area.nombre}.${vigencia ? ` ${vigencia}.` : ""}`}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border py-[5px] pl-[7px] pr-2.5 text-[13px] leading-tight transition-colors",
                prendida ? "border-info-line bg-info-surface font-semibold text-brand" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
              )}
            >
              <MarcaDeHerramienta herramienta={h} />
              {h.nombre}
              <span className={cn("text-[11px] font-normal tabular-nums", prendida ? "text-brand" : "text-fg-muted")}>{toca}</span>
              {prendida && (
                <svg className="h-[13px] w-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </GrupoDeControl>
  );
}

/**
 * Con alguna herramienta prendida, debajo de los filtros, el aviso de cómo se lee («Lo habilita, no
 * lo cumple»): el primer párrafo con título de la introducción del mapa. Qué es cada herramienta y en
 * cuántos criterios aplica ya lo dice su chip: no se repite.
 */
export function ResumenDeHerramientas({ datos, activas }: { datos: DatosDeLaVista; activas: readonly string[] }) {
  const mapa = datos.herramientas;
  if (!mapa || !mapa.herramientas.some((h) => activas.includes(h.clave))) return null;
  const principio = mapa.intro.find((p) => p.startsWith("**"));
  if (!principio) return null;
  const partes = /^\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(principio);
  return (
    <Alert variant="info" title={partes ? partes[1] : undefined}>
      {partes ? partes[2] : sinMarcas(principio)}
    </Alert>
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
          <li key={h.clave} className="flex items-start gap-1.5 text-[13px] leading-snug text-fg-secondary">
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
          className="inline-flex cursor-help items-center gap-1 rounded-full border border-line bg-surface py-px pl-1 pr-2 text-[11px] font-medium leading-[18px] text-fg-secondary"
        >
          <MarcaDeHerramienta herramienta={h} tamano={14} />
          {h.nombre}
        </span>
      ))}
    </span>
  );
}

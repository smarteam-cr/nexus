"use client";

/**
 * Resumen — las ocho casillas del marco de calificación, en filas a lo ancho, y lo que sale de cada reunión.
 *
 * Pedido de Elías (2026-10-01): el vendedor tiene que ver DE UN VISTAZO qué le falta para poder
 * proponer. Metas, planes, retos y tiempos; presupuesto y quién decide; consecuencias de no actuar e
 * implicaciones de lograrlo. Cada tarjeta muestra lo confirmado o se ve vacía cuando falta, y avisa
 * cuando el agente propuso algo para ella; al tocarla se abre la casilla para completarla o revisar
 * lo propuesto. «Qué sigue» y a qué proyecto le llega viven en la columna de la derecha, a la vista en
 * todas las piezas (rediseño de escritorio, 2026-10-03); el cajón de la casilla vive en el lienzo.
 *
 * Debajo, lo que sale de cada reunión (pedido de Elías, 2026-10-01): las objeciones y las
 * particularidades de la cuenta, que el agente propone al leer cada sesión, como el cronograma
 * propone sus particularidades. Y, si ya hay un proyecto, a cuál le llega la exploración.
 */
import {
  CASILLAS_DE_LAS_REUNIONES,
  CASILLAS_DEL_RESUMEN,
  definicionDe,
  ETIQUETA_DEL_ROL,
  type ClaveDeCasilla,
  type Meta,
  type Persona,
  type Reto,
} from "@/lib/exploraciones/casillas";
import type { ItemPropuesto } from "@/lib/exploraciones/contenido";
import { cn } from "@/lib/cn";
import { Casilla } from "./Casilla";
import FranjaDeSugerencias, { BotonAzul, BotonBlanco, IconoDeSugerencia } from "./FranjaDeSugerencias";
import { describirPropuesta } from "./Propuestas";
import { useLienzo } from "./contexto";

/** La letra del marco de cada tarjeta (GPCT, presupuesto y autoridad, C&I), con su nombre en inglés. */
export const LETRA_DEL_MARCO: Record<(typeof CASILLAS_DEL_RESUMEN)[number], { letra: string; marco: string }> = {
  metas: { letra: "G", marco: "Goals" },
  planes: { letra: "P", marco: "Plans" },
  retos: { letra: "C", marco: "Challenges" },
  tiempos: { letra: "T", marco: "Timeline" },
  presupuesto: { letra: "B", marco: "Budget" },
  autoridad: { letra: "A", marco: "Authority" },
  consecuencias: { letra: "C", marco: "Consequences" },
  implicaciones: { letra: "I", marco: "Implications" },
};

/** Lo confirmado de una casilla, en líneas cortas para la tarjeta. */
export function lineasDe(clave: ClaveDeCasilla, valor: unknown): string[] {
  if (valor === undefined || valor === null) return [];
  const tipo = definicionDe(clave).tipo;
  switch (tipo) {
    case "texto":
      return typeof valor === "string" && valor.trim() ? [valor] : [];
    case "lista":
      return valor as string[];
    case "metas":
      return (valor as Meta[]).map((m) => {
        const cifras = [m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).join(" ");
        return cifras ? `${m.que}: ${cifras}` : m.que;
      });
    case "retos":
      return (valor as Reto[]).map((r) => r.texto);
    case "autoridad":
      return (valor as Persona[]).map((p) => `${p.nombre} · ${ETIQUETA_DEL_ROL[p.rol]}`);
    default:
      return [];
  }
}

/** La pastilla azul que cuenta lo sugerido. */
function Sugeridas({ n, mas }: { n: number; mas: boolean }) {
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-info-line bg-info-surface py-px pl-1.5 pr-2 text-[11px] font-semibold text-brand">
      <IconoDeSugerencia className="h-[13px] w-[13px]" />
      {mas ? "+" : ""}
      {n} {n === 1 ? "sugerida" : "sugeridas"}
    </span>
  );
}

/**
 * Una fila del marco (Elías, 2026-10-05: las cuatro columnas se leían apretadas incluso a 1080). A la
 * izquierda la letra, el nombre y en qué está (confirmado, sugeridas o falta); a la derecha, lo
 * confirmado en viñetas a lo ancho, o lo que sugirió el agente en azul. Toda la fila abre la casilla.
 */
function Fila({ clave, sugeridas, onAbrir, ultima }: { clave: (typeof CASILLAS_DEL_RESUMEN)[number]; sugeridas: ItemPropuesto[]; onAbrir: () => void; ultima: boolean }) {
  const { exp, escala, nombreDeNivel } = useLienzo();
  const def = definicionDe(clave);
  const lineas = lineasDe(clave, exp.estado.contenido.casillas[clave]);
  const vacia = lineas.length === 0;
  const n = sugeridas.length;
  const { letra, marco } = LETRA_DEL_MARCO[clave];
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "grid w-full gap-x-4 gap-y-2 px-[18px] py-4 text-left transition-colors hover:bg-surface-hover sm:grid-cols-[190px_minmax(0,1fr)_auto]",
        !ultima && "border-b border-line",
      )}
    >
      <span className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-xs font-bold",
              !vacia ? "bg-success-surface text-success-ink" : n > 0 ? "bg-info-surface text-brand" : "border border-dashed border-line text-fg-muted",
            )}
            title={marco}
          >
            {letra}
          </span>
          <span className="text-[15px] font-semibold text-fg">{def.etiqueta}</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {!vacia && (
            <span className="rounded-full border border-success-line bg-success-surface px-2 py-px text-[11px] font-semibold text-success-ink">✓ Confirmado</span>
          )}
          {n > 0 && <Sugeridas n={n} mas={!vacia} />}
          {vacia && n === 0 && <span className="rounded-full border border-dashed border-line px-2 py-px text-[11px] font-semibold text-fg-muted">Falta</span>}
        </span>
      </span>
      <span className="min-w-0">
        {!vacia ? (
          <ul className="list-disc space-y-1 pl-[18px] marker:text-fg-muted">
            {lineas.map((l, i) => (
              <li key={i} className="text-sm leading-[1.5] text-fg-secondary">
                {l}
              </li>
            ))}
          </ul>
        ) : n > 0 ? (
          <ul className="space-y-1">
            {sugeridas.map((it) => (
              <li key={it.id} className="text-sm leading-[1.5] text-brand">
                «{describirPropuesta(it, escala, nombreDeNivel)}»
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[13px] text-fg-muted">Falta: se pregunta en la próxima sesión.</span>
        )}
      </span>
      <span className="self-start pt-0.5 text-xs font-semibold text-brand">{!vacia ? (n > 0 ? "Revisar" : "Editar") : n > 0 ? "Revisar" : "Completar"}</span>
    </button>
  );
}

/** Las ocho casillas del marco, en tres bloques que se leen como una conversación. */
const BLOQUES: { titulo: string; claves: (typeof CASILLAS_DEL_RESUMEN)[number][] }[] = [
  { titulo: "El objetivo", claves: ["metas", "planes", "retos", "tiempos"] },
  { titulo: "Quién y con qué", claves: ["presupuesto", "autoridad"] },
  { titulo: "Lo que está en juego", claves: ["consecuencias", "implicaciones"] },
];

export default function Resumen() {
  const { pendientesPara, puedeEditar, guardando, cambiar, abrirCasilla, abrirRevision } = useLienzo();
  const deLaCasilla = (clave: ClaveDeCasilla) => pendientesPara((d) => d.tipo === "casilla" && d.clave === clave);
  // Lo sugerido para las tarjetas y lo que sale de cada reunión: lo que se revisa en esta pieza.
  const delResumen = pendientesPara((d) => d.tipo === "casilla" && definicionDe(d.clave).paso === "resumen");

  return (
    <div className="space-y-6">
      {delResumen.length > 0 && (
        <div data-recorrido="preventa.resumen.sugerencias">
        <FranjaDeSugerencias
          acciones={
            <>
              <BotonBlanco onClick={() => abrirRevision("resumen")}>Revisar una por una</BotonBlanco>
              {puedeEditar && (
                <BotonAzul disabled={guardando} onClick={() => void cambiar([{ op: "usarVarias", items: delResumen.map((it) => ({ itemId: it.id, valor: it.valor })) }])}>
                  Usar {delResumen.length === 1 ? "la sugerida" : `las ${delResumen.length}`}
                </BotonAzul>
              )}
            </>
          }
        >
          <strong>El agente sugiere {delResumen.length === 1 ? "una cosa" : `${delResumen.length} cosas`}</strong> para estas tarjetas. Nada se confirma solo.
        </FranjaDeSugerencias>
        </div>
      )}

      <div data-recorrido="preventa.resumen.marco" className="space-y-5">
        {BLOQUES.map((b) => (
          <section key={b.titulo} className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{b.titulo}</h3>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {b.claves.map((clave, i) => (
                <Fila key={clave} clave={clave} sugeridas={deLaCasilla(clave)} onAbrir={() => abrirCasilla(clave)} ultima={i === b.claves.length - 1} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Lo que sale de cada reunión: lo propone el agente al leerla, con la frase del cliente. */}
      <div data-recorrido="preventa.resumen.casillas" className="grid gap-4 lg:grid-cols-2">
        {CASILLAS_DE_LAS_REUNIONES.map((clave) => (
          <Casilla key={clave} clave={clave} />
        ))}
      </div>
    </div>
  );
}

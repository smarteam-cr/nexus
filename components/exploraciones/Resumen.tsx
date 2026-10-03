"use client";

/**
 * Resumen — las ocho tarjetas del marco de calificación, grandes, y lo que sale de cada reunión.
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
import { Button } from "@/components/ui";
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
import FranjaDeSugerencias from "./FranjaDeSugerencias";
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
    <span className="flex-shrink-0 rounded-full border border-info-line bg-info-surface px-2 py-px text-2xs font-semibold text-info-ink">
      {mas ? "+" : ""}
      {n} {n === 1 ? "sugerida" : "sugeridas"}
    </span>
  );
}

/**
 * Una tarjeta del marco, en sus cuatro estados (diseño «Una sugerencia, en su lugar»): falta
 * (punteada); falta con sugerencias (punteada en azul, con lo sugerido en azul todavía sin confirmar);
 * confirmada con algo nuevo (lo confirmado se lee normal y la sugerencia solo se cuenta); confirmada.
 */
function Tarjeta({ clave, sugeridas, onAbrir }: { clave: (typeof CASILLAS_DEL_RESUMEN)[number]; sugeridas: ItemPropuesto[]; onAbrir: () => void }) {
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
        "flex min-h-[8.5rem] flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-surface-hover",
        vacia ? (n > 0 ? "border-dashed border-info-line bg-surface-muted" : "border-dashed border-line bg-surface-muted") : "border-line bg-surface",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md text-2xs font-bold",
            vacia ? "bg-info-surface text-info-ink" : "bg-success-surface text-success-ink",
          )}
          title={marco}
        >
          {letra}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{def.etiqueta}</span>
        {n > 0 && <Sugeridas n={n} mas={!vacia} />}
      </span>
      {vacia ? (
        n > 0 ? (
          <span className="line-clamp-3 text-sm leading-snug text-info-ink">{sugeridas.map((it) => `«${describirPropuesta(it, escala, nombreDeNivel)}»`).join(" · ")}</span>
        ) : (
          <span className="text-xs text-fg-muted">Falta: se pregunta en la próxima sesión</span>
        )
      ) : (
        <span className="space-y-1">
          {lineas.slice(0, 3).map((l, i) => (
            <span key={i} className="line-clamp-2 block text-sm leading-snug text-fg-secondary">
              {l}
            </span>
          ))}
          {lineas.length > 3 && <span className="block text-2xs text-fg-muted">y {lineas.length - 3} más</span>}
        </span>
      )}
      {n > 0 && <span className="mt-auto text-xs font-semibold text-info-ink">Revisar →</span>}
    </button>
  );
}

export default function Resumen() {
  const { pendientesPara, puedeEditar, guardando, cambiar, abrirCasilla, abrirRevision } = useLienzo();
  const deLaCasilla = (clave: ClaveDeCasilla) => pendientesPara((d) => d.tipo === "casilla" && d.clave === clave);
  // Lo sugerido para las tarjetas y lo que sale de cada reunión: lo que se revisa en esta pieza.
  const delResumen = pendientesPara((d) => d.tipo === "casilla" && definicionDe(d.clave).paso === "resumen");

  return (
    <div className="space-y-6">
      {delResumen.length > 0 && (
        <FranjaDeSugerencias
          acciones={
            <>
              <Button size="sm" variant="secondary" className="bg-surface" onClick={() => abrirRevision("resumen")}>
                Revisar una por una
              </Button>
              {puedeEditar && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={guardando}
                  onClick={() => void cambiar([{ op: "usarVarias", items: delResumen.map((it) => ({ itemId: it.id, valor: it.valor })) }])}
                >
                  Usar {delResumen.length === 1 ? "la sugerida" : `las ${delResumen.length}`}
                </Button>
              )}
            </>
          }
        >
          <strong>El agente sugiere {delResumen.length === 1 ? "una cosa" : `${delResumen.length} cosas`}</strong> para estas tarjetas. Nada se confirma solo.
        </FranjaDeSugerencias>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CASILLAS_DEL_RESUMEN.map((clave) => (
          <Tarjeta key={clave} clave={clave} sugeridas={deLaCasilla(clave)} onAbrir={() => abrirCasilla(clave)} />
        ))}
      </div>

      {/* Lo que sale de cada reunión: lo propone el agente al leerla, con la frase del cliente. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {CASILLAS_DE_LAS_REUNIONES.map((clave) => (
          <Casilla key={clave} clave={clave} />
        ))}
      </div>
    </div>
  );
}

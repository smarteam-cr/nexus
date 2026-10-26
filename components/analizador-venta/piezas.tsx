/**
 * Las piezas que comparten «Cómo trabajaste esta sesión» (S4) y la pieza «Análisis» (S5) de la preventa (2026-10-27;
 * vinieron de la reunión en Sesiones, que ya no analiza: S6). Client-safe, solo tokens del tema.
 *
 * Es COACHING, no evaluación: ningún valor es un puntaje. El tono del valor (verde el mejor, ámbar el que pide atención)
 * es para leer rápido, no para comparar a nadie.
 */
import { cn } from "@/lib/cn";
import { PROCESO_CONSULTIVO, PUNTOS_DEL_ANALISIS } from "@/lib/analizador-venta/criterio";
import { TEXTO_DEL_VALOR, VALORES, type Cita, type Juicio, type ResultadoDelAnalisis } from "@/lib/analizador-venta/analisis";
import { quienHabloEnPalabras, type QuienHablo } from "@/lib/analizador-venta/quien-hablo";
import type { Continuidad } from "@/lib/analizador-venta/revision";

export const fechaDelAnalisis = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" }).replace(".", "");

/** El tono del valor: el primero de su lista es el mejor (verde), el último el peor (ámbar). */
export function tonoDelValor(j: Pick<Juicio, "punto" | "valor">): string {
  const lista = VALORES[j.punto];
  const i = j.valor ? lista.indexOf(j.valor) : -1;
  if (j.valor?.startsWith("sin_") && j.valor !== "sin_explorar") return "bg-surface-muted text-fg-muted";
  if (i === 0) return "bg-success-surface text-success-ink";
  if (i === lista.length - 1 || j.valor === "sin_explorar" || j.valor === "ninguno") return "bg-warn-surface text-warn-ink";
  return "bg-surface-muted text-fg-secondary";
}

export function ChipDelValor({ j, prefijo }: { j: Pick<Juicio, "punto" | "valor"> | null; prefijo?: string }) {
  if (!j?.valor) return null;
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", tonoDelValor(j))}>
      {prefijo ? `${prefijo}: ` : ""}
      {TEXTO_DEL_VALOR[j.valor] ?? j.valor}
    </span>
  );
}

export function Citas({ citas }: { citas: readonly Cita[] }) {
  if (!citas.length) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {citas.map((c, i) => (
        <li key={i} className="border-l-2 border-line pl-2.5 text-xs leading-[18px] text-fg-secondary">
          «{c.texto}» <span className="text-fg-muted">— {c.hablante}, turno {c.turno}</span>
        </li>
      ))}
    </ul>
  );
}

export function JuicioVisto({ j, titulo }: { j: Juicio; titulo?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {titulo && <span className="text-[13px] font-semibold text-fg">{titulo}</span>}
        <ChipDelValor j={j} />
      </div>
      <p className="text-[13px] leading-[19px] text-fg">{j.lectura}</p>
      {j.porAusencia && <p className="text-xs text-fg-muted">No se encontró en la reunión: por eso no trae cita.</p>}
      <Citas citas={j.citas} />
    </div>
  );
}

export function BarraDeQuienHablo({ q }: { q: QuienHablo }) {
  if (q.fuente === "nada") return <p className="text-xs text-fg-muted">{quienHabloEnPalabras(q)}</p>;
  return (
    <div className="space-y-1.5">
      <div aria-hidden className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
        <span className="bg-brand" style={{ width: `${q.smarteam.porcentaje}%` }} />
        <span className="bg-success" style={{ width: `${q.cliente.porcentaje}%` }} />
      </div>
      <p className="text-xs text-fg-secondary">
        {quienHabloEnPalabras(q)} <span className="text-fg-muted">({q.fuente === "meet" ? "según las frases de Meet" : "según la transcripción"}; lo cuenta Nexus)</span>
      </p>
      <p className="text-xs text-fg-muted">{q.personas.slice(0, 6).map((p) => `${p.nombre} ${p.porcentaje} %`).join(" · ")}</p>
    </div>
  );
}

/** Si el siguiente paso tuvo continuidad, en palabras. */
export function textoDeLaContinuidad(c: Continuidad): { texto: string; aviso: boolean } {
  switch (c.tipo) {
    case "sin_paso":
      return { texto: "No quedó un siguiente paso.", aviso: true };
    case "hubo":
      return { texto: `Tuvo continuidad: la siguiente reunión fue el ${fechaDelAnalisis(c.fecha)} (${c.dias} ${c.dias === 1 ? "día" : "días"} después).`, aviso: false };
    case "tarde":
      return { texto: `Siguió tarde: la siguiente reunión fue el ${fechaDelAnalisis(c.fecha)}, ${c.dias} días después.`, aviso: true };
    case "no_hubo":
      return { texto: "No tuvo continuidad: no hubo otra reunión de venta con la empresa después.", aviso: true };
    case "pendiente":
      return { texto: "Todavía a tiempo: no ha habido otra reunión desde entonces.", aviso: false };
  }
}

/** El análisis entero, punto por punto, con sus citas (lo que antes se veía en la reunión, en Sesiones). */
export function AnalisisCompleto({ r }: { r: ResultadoDelAnalisis }) {
  const juiciosDe = (punto: Juicio["punto"]) => r.juicios.filter((j) => j.punto === punto);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {PUNTOS_DEL_ANALISIS.filter((p) => !["quien_hablo", "recomendaciones", "exploracion"].includes(p.id)).map((p) =>
          juiciosDe(p.id as Juicio["punto"]).map((j, i) => <JuicioVisto key={`${p.id}-${i}`} j={j} titulo={p.titulo} />),
        )}
      </div>
      {juiciosDe("exploracion").length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-fg">Qué se exploró, de lo que se esperaba en esta sesión</h4>
          <div className="grid gap-3 md:grid-cols-2">
            {juiciosDe("exploracion").map((j, i) => (
              <JuicioVisto key={i} j={j} titulo={j.dimension ?? undefined} />
            ))}
          </div>
        </div>
      )}
      {juiciosDe("etapa").length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-fg">El proceso consultivo</h4>
          <div className="grid gap-3 md:grid-cols-2">
            {PROCESO_CONSULTIVO.map((e) =>
              juiciosDe("etapa")
                .filter((j) => j.etapa === e.id)
                .map((j, i) => <JuicioVisto key={`${e.id}-${i}`} j={j} titulo={e.nombre} />),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

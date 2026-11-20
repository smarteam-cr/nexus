/**
 * components/trivias/TableroDeOpciones.tsx — las opciones de una pregunta como fichas de color con su letra.
 *
 * Sin hooks ni "use client": lo pintan la consola del anfitrión y el resultado de la partida (servidor).
 *
 * - Con la pregunta abierta (`distribucion` null): solo las fichas, para que se lean proyectadas.
 * - Con la pregunta cerrada: cada ficha suma cuántos la eligieron y una barra; las correctas llevan ✓ y el resto se
 *   atenúa. Una encuesta (sin correctas) muestra solo cómo votaron, sin ✓ y sin atenuar.
 *
 * Los colores son DE LA TRIVIA (lib/trivias/colores.ts) y van con `style`; la letra va siempre, así el color nunca es
 * la única pista (daltonismo, proyector lavado). La barra mide la parte de las respuestas que se llevó cada opción.
 */
import { cn } from "@/lib/cn";
import { colorDeOpcion } from "@/lib/trivias/colores";

export interface TableroDeOpcionesProps {
  opciones: string[];
  /** Las correctas (vacío = encuesta). Solo se marcan junto con la distribución. */
  correctas?: number[] | null;
  /** Cuántos eligieron cada opción; null mientras la pregunta sigue abierta. */
  distribucion?: number[] | null;
  /** `escenario`: fichas grandes para proyectar · `compacto`: filas para el resultado de la partida. */
  variante?: "escenario" | "compacto";
  className?: string;
}

function IconoCorrecta({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function personas(n: number): string {
  return n === 1 ? "1 persona" : `${n} personas`;
}

export function TableroDeOpciones({
  opciones,
  correctas = null,
  distribucion = null,
  variante = "escenario",
  className,
}: TableroDeOpcionesProps) {
  const conResultado = distribucion !== null;
  const marcadas = distribucion !== null ? (correctas ?? []) : [];
  const hayCorrectas = marcadas.length > 0;
  const total = distribucion !== null ? distribucion.reduce((s, n) => s + n, 0) : 0;

  if (variante === "compacto") {
    return (
      <ul className={cn("space-y-2", className)}>
        {opciones.map((texto, i) => {
          const color = colorDeOpcion(i);
          const cuantos = distribucion?.[i] ?? 0;
          const esCorrecta = marcadas.includes(i);
          const parte = total > 0 ? (cuantos / total) * 100 : 0;
          return (
            <li key={i} className="flex items-center gap-3">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                style={{ background: color.fondo, color: color.texto }}
                aria-hidden="true"
              >
                {color.letra}
              </span>
              <span className={cn("min-w-0 flex-1 break-words text-sm", esCorrecta ? "font-medium text-fg" : "text-fg-secondary")}>
                <span className="sr-only">{color.letra}: </span>
                {texto}
                {esCorrecta && <span className="sr-only"> (correcta)</span>}
              </span>
              {conResultado && (
                <>
                  <span className="hidden h-2 w-24 shrink-0 overflow-hidden rounded-full bg-surface-muted sm:block" aria-hidden="true">
                    <span className="block h-full rounded-full" style={{ width: `${parte}%`, background: color.fondo }} />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-fg-secondary">{personas(cuantos)}</span>
                </>
              )}
              <span className="flex w-4 shrink-0 justify-center text-success-ink">
                {esCorrecta && <IconoCorrecta className="h-4 w-4" />}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className={cn("grid w-full gap-3 sm:grid-cols-2 md:gap-4", className)}>
      {opciones.map((texto, i) => {
        const color = colorDeOpcion(i);
        const cuantos = distribucion?.[i] ?? 0;
        const esCorrecta = marcadas.includes(i);
        const atenuada = hayCorrectas && !esCorrecta;
        const parte = total > 0 ? (cuantos / total) * 100 : 0;
        return (
          <li
            key={i}
            className={cn(
              "flex min-h-20 flex-col justify-center gap-3 rounded-2xl px-4 py-4 shadow-sm transition-opacity md:px-6 md:py-5",
              atenuada && "opacity-40",
            )}
            style={{ background: color.fondo, color: color.texto }}
          >
            <div className="flex items-center gap-4">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/20 text-2xl font-bold md:h-12 md:w-12"
                aria-hidden="true"
              >
                {color.letra}
              </span>
              <span className="min-w-0 flex-1 break-words text-xl font-semibold leading-snug md:text-2xl">
                <span className="sr-only">{color.letra}: </span>
                {texto}
                {esCorrecta && <span className="sr-only"> (correcta)</span>}
              </span>
              {conResultado && (
                <span className="shrink-0 text-3xl font-bold tabular-nums md:text-4xl">
                  {cuantos}
                  <span className="sr-only"> {cuantos === 1 ? "la eligió" : "la eligieron"}</span>
                </span>
              )}
              {esCorrecta && (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full md:h-10 md:w-10"
                  style={{ background: color.texto, color: color.fondo }}
                  aria-hidden="true"
                >
                  <IconoCorrecta className="h-5 w-5 md:h-6 md:w-6" />
                </span>
              )}
            </div>
            {conResultado && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/20" aria-hidden="true">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${parte}%`, background: color.texto }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

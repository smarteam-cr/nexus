"use client";

/**
 * PreparacionParaEngagement — la lectura «Preparación para engagement avanzado» (N6) en la escala de la
 * exploración: la de la preventa y la del proyecto del CSE (las dos montan el mismo lienzo).
 *
 * No cambia el nivel. Dice si la empresa está «Lista», «Casi lista» (con los cimientos que le faltan, que es lo
 * que se trabaja antes de una plataforma de personalización) o «Todavía no», y si le falta un dato lo dice en vez
 * de adivinar. La regla vive en lib/escala/preparacion.ts y lo que pide cada estado sale de la escala publicada:
 * hasta que se publique una versión con la lectura (la 9.0), esta tarjeta no aparece. No nombra herramientas.
 *
 * Los cimientos se marcan aquí mismo (la operación `falta`, como lo que pide Funcional). Sin marca decide
 * `cumpleElCimiento`; el nivel de Marketing y el de cada dimensión son los de lo confirmado con evidencia.
 */
import { DESPUES, type Despues, type Letra } from "@/lib/escala/documento/tipos";
import { cumpleElCimiento, ETIQUETA_DE_PREPARACION, leerPreparacion, type EstadoDePreparacion } from "@/lib/escala/preparacion";
import { cn } from "@/lib/cn";
import { useLienzo } from "./contexto";

const COLOR_DEL_ESTADO: Record<EstadoDePreparacion, string> = {
  lista: "border-success-line bg-success-surface text-success-ink",
  "casi-lista": "border-warn-line bg-warn-surface text-warn-ink",
  "todavia-no": "border-line bg-surface-muted text-fg-secondary",
  "falta-saber": "border-dashed border-line bg-surface text-fg-muted",
};

const esDespues = (x: string | null | undefined): x is Despues => !!x && (DESPUES as readonly string[]).includes(x);

export default function PreparacionParaEngagement() {
  const { exp, escala, chequeo, cambiar, puedeEditar, guardando } = useLienzo();
  const p = escala.preparacion;
  if (!p) return null;

  const contenido = exp.estado.contenido;
  const vende = exp.empresa.vende;
  const despues = exp.estado.perfilDespues ?? (esDespues(vende?.despues) ? vende.despues : null);
  const nivelDe = (dimId: string): Letra | null => {
    for (const a of chequeo.areas) for (const d of a.dimensiones) if (d.id === dimId) return d.nivel;
    return null;
  };

  const lectura = leerPreparacion(p, {
    aQuienVende: vende?.aQuienVende ?? null,
    despues,
    trafico: vende?.trafico ?? null,
    base: vende?.base ?? null,
    nivelDeMarketing: chequeo.areas.find((a) => a.id === "2")?.nivel ?? null,
    cimientos: Object.fromEntries(p.cimientos.map((c) => [c.id, cumpleElCimiento(c, contenido.falta[c.id]?.estado, nivelDe(c.dimension))])),
  });
  const marcar = (id: string, estado: "tiene" | "no_tiene" | null) =>
    void cambiar([{ op: "falta", criterioId: id, estado: estado ? { estado } : null }]);

  return (
    <section aria-label="Preparación para engagement avanzado" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-fg">Preparación para engagement avanzado</h3>
          <p className="text-xs text-fg-muted">Una lectura aparte: no cambia el nivel. Dice si está lista para personalizar a cada persona en todos sus canales.</p>
        </div>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", COLOR_DEL_ESTADO[lectura.estado])}>{ETIQUETA_DE_PREPARACION[lectura.estado]}</span>
      </div>

      {lectura.queDiceLaEscala && <p className="text-[13px] text-fg-secondary">{lectura.queDiceLaEscala}</p>}

      {lectura.noCumple.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-fg-secondary">
          {lectura.noCumple.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      {lectura.faltaSaber.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-fg-muted">Falta saber</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-fg-secondary">
            {lectura.faltaSaber.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="text-xs text-fg-muted">El tráfico, la base y a quién le vende se cargan en los datos de la empresa.</p>
        </div>
      )}

      {lectura.cimientos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-fg-muted">Los cimientos</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {lectura.cimientos.map((c) => {
              const marca = contenido.falta[c.id]?.estado;
              return (
                <li key={c.id} className="flex flex-wrap items-start gap-2.5 px-2.5 py-2">
                  <span
                    className={cn(
                      "mt-px flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      c.cumple === true
                        ? "border border-success-line bg-success-surface text-success-ink"
                        : c.cumple === false
                          ? "border border-danger-line bg-danger-surface text-danger-ink"
                          : "border border-dashed border-line text-fg-muted",
                    )}
                    aria-label={c.cumple === true ? "Lo tiene" : c.cumple === false ? "No lo tiene" : "No se sabe"}
                  >
                    {c.cumple === true ? "✓" : c.cumple === false ? "✕" : ""}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-fg-secondary">{c.texto}</span>
                  {puedeEditar && (
                    <span className="flex flex-shrink-0 gap-1">
                      {(["tiene", "no_tiene"] as const).map((e) => (
                        <button
                          key={e}
                          type="button"
                          aria-pressed={marca === e}
                          disabled={guardando}
                          onClick={() => marcar(c.id, marca === e ? null : e)}
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                            marca === e ? "border-brand bg-brand-soft text-fg" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
                          )}
                        >
                          {e === "tiene" ? "Lo tiene" : "No lo tiene"}
                        </button>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

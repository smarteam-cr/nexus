/**
 * MetricasDeExploraciones — los tres números arriba de la lista (lib/exploraciones/metricas.ts).
 *
 * Presentacional y de servidor: la página le pasa los números ya calculados. Mide el proceso con la
 * foto de cada propuesta al armarse; nunca evalúa a quien vende.
 */
import { cn } from "@/lib/cn";
import { DIAS_DE_LA_METRICA, OBJETIVO_CON_META, type Metricas } from "@/lib/exploraciones/metricas";

function Cifra({ titulo, valor, de, ayuda, destacada }: { titulo: string; valor: number; de: number; ayuda: string; destacada?: boolean }) {
  const pct = de > 0 ? Math.round((valor / de) * 100) : null;
  return (
    <div className={cn("space-y-1 rounded-xl border bg-surface p-4", destacada ? "border-brand/30" : "border-line")}>
      <p className="text-xs font-medium text-fg-secondary">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums text-fg">
        {de > 0 ? (
          <>
            {valor} <span className="text-sm font-normal text-fg-muted">de {de}</span>
          </>
        ) : (
          <span className="text-sm font-normal text-fg-muted">Sin propuestas todavía</span>
        )}
      </p>
      <p className="text-2xs text-fg-muted">
        {pct !== null ? `${pct} % · ` : ""}
        {ayuda}
      </p>
    </div>
  );
}

export default function MetricasDeExploraciones({ metricas }: { metricas: Metricas }) {
  const m = metricas;
  return (
    <section className="mb-6 space-y-2" aria-label="Cómo sabemos si la exploración sirve">
      <div className="grid gap-3 md:grid-cols-3">
        <Cifra
          destacada
          titulo="Propuestas con una meta del cliente en cifras"
          valor={m.conMeta}
          de={m.propuestas}
          ayuda={`El objetivo es ${Math.round(OBJETIVO_CON_META * 10)} de cada 10.`}
        />
        <Cifra titulo="Llegaron listas para proponer" valor={m.listas} de={m.propuestas} ayuda="Con los siete puntos al armar la propuesta." />
        <Cifra titulo="Con el siguiente paso con fecha" valor={m.conSiguientePaso} de={m.propuestas} ayuda="Al armar la propuesta." />
      </div>
      <p className="text-2xs text-fg-muted">
        Propuestas de primera venta de los últimos {DIAS_DE_LA_METRICA} días, armadas desde una exploración.
        {m.sinExploracion > 0
          ? ` ${m.sinExploracion} ${m.sinExploracion === 1 ? "propuesta a un prospecto salió" : "propuestas a prospectos salieron"} sin exploración: no se pueden medir.`
          : ""}{" "}
        Sirve para mejorar el proceso, nunca para evaluar a quien vende.
      </p>
    </section>
  );
}

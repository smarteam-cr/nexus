/**
 * «Por vendedor» — la tendencia de cada vendedor (S7, 2026-10-27): cuánto explora, cuánto habla, cuántas sesiones dejan un
 * siguiente paso con fecha y cuántas tienen transcripción, mes a mes. Server component, solo tokens.
 *
 * No es un ranking: cada vendedor se compara con sus propios meses, y lo que juzga el análisis (cuánto exploró, el
 * siguiente paso) cuenta solo si una persona lo confirmó (lib/analizador-venta/tendencia.ts).
 */
import { EmptyState } from "@/components/ui";
import type { CifrasDeLaTendencia } from "@/lib/analizador-venta/tendencia";
import type { TendenciaDelEquipo } from "@/lib/analizador-venta/tendencia-server";

const MES = new Intl.DateTimeFormat("es-CR", { month: "short", year: "numeric", timeZone: "UTC" });
const nombreDelMes = (mes: string) => MES.format(new Date(`${mes}-15T12:00:00Z`)).replace(".", "");
const pct = (n: number | null) => (n === null ? "—" : `${n} %`);
const deCuantas = (x: { con: number; de: number }) => (x.de ? `${x.con} de ${x.de}` : "—");

const COLUMNAS: { rotulo: string; ayuda: string; valor: (c: CifrasDeLaTendencia) => string }[] = [
  { rotulo: "Reuniones", ayuda: "de venta, por el calendario y por quién habló", valor: (c) => String(c.reuniones) },
  { rotulo: "Con transcripción", ayuda: "sin ella no se sabe quién dijo qué", valor: (c) => deCuantas({ con: c.conTranscripcion, de: c.reuniones }) },
  { rotulo: "Habló", ayuda: "su parte de las palabras, en promedio", valor: (c) => pct(c.hablo) },
  { rotulo: "Habló el cliente", ayuda: "en promedio", valor: (c) => pct(c.clienteHablo) },
  { rotulo: "Exploró a fondo", ayuda: "de lo que se esperaba explorar, en las confirmadas", valor: (c) => pct(c.exploro) },
  { rotulo: "Siguiente paso con fecha", ayuda: "en las confirmadas", valor: (c) => deCuantas(c.conFecha) },
];

function Fila({ c, rotulo, fuerte }: { c: CifrasDeLaTendencia; rotulo: string; fuerte?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_repeat(6,minmax(88px,1fr))] items-baseline gap-3 border-t border-line px-4 py-2 text-[13px] first:border-t-0">
      <span className={fuerte ? "font-semibold text-fg" : "text-fg-muted"}>{rotulo}</span>
      {COLUMNAS.map((k) => (
        <span key={k.rotulo} className={fuerte ? "font-semibold tabular-nums text-fg" : "tabular-nums text-fg-secondary"}>
          {k.valor(c)}
        </span>
      ))}
    </div>
  );
}

export function TendenciaPorVendedor({ t }: { t: TendenciaDelEquipo }) {
  if (!t.vendedores.length) {
    return <EmptyState title={`No hubo reuniones de venta en estos ${t.dias} días`} description="Cuentan las reuniones con un prospecto, y las de un cliente con una preventa abierta en las que estuvo alguien de Ventas." />;
  }
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-secondary">
        {t.reuniones} reuniones de venta en los últimos {t.dias} días. Cada una cuenta para quien habló en ella (o, sin transcripción, para quien estaba en la invitación y no la
        rechazó), nunca por la asistencia de Meet. Lo que juzga el análisis solo cuenta si alguien lo confirmó. No es un ranking: compara a cada uno con sus propios meses.
      </p>
      {t.vendedores.map((v) => (
        <section key={v.correo} aria-label={v.nombre} className="overflow-hidden rounded-xl border border-line bg-surface">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-fg">{v.nombre}</h2>
            <span className="text-xs text-fg-muted">
              {v.confirmadas} de {v.reuniones} con el análisis confirmado
            </span>
          </header>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[88px_repeat(6,minmax(88px,1fr))] gap-3 bg-surface-muted px-4 py-2">
                <span />
                {COLUMNAS.map((k) => (
                  <span key={k.rotulo} title={k.ayuda} className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    {k.rotulo}
                  </span>
                ))}
              </div>
              {v.porMes.map((m) => (
                <Fila key={m.mes} c={m} rotulo={nombreDelMes(m.mes)} />
              ))}
              {v.porMes.length > 1 && <Fila c={v} rotulo="En total" fuerte />}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * components/uso/piezas.tsx — las piezas que comparten las pestañas de «Uso de Nexus»: la cifra de arriba, la tabla de
 * números y la barra de lo que se usó. Sin estado: sirven en el servidor y en el cliente.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { numero, parteUsada, pct, type UsoDeLoQuePropone } from "@/lib/uso/ia";

export function Cifra({ titulo, valor, pie, tono }: { titulo: string; valor: string; pie?: ReactNode; tono?: "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-fg-muted">{titulo}</p>
      <p className={cn("text-xl font-semibold tabular-nums", tono === "warn" ? "text-warn-ink" : "text-fg")}>{valor}</p>
      {pie && <p className="text-xs text-fg-muted">{pie}</p>}
    </div>
  );
}

export interface FilaDeTabla {
  clave: string;
  nombre: ReactNode;
  valores: (number | string)[];
  resaltada?: boolean;
}

export function Tabla({
  titulo,
  nota,
  columnas,
  filas,
  anchoColumna = 96,
}: {
  titulo: string;
  nota?: ReactNode;
  columnas: string[];
  filas: FilaDeTabla[];
  anchoColumna?: number;
}) {
  const plantilla = { gridTemplateColumns: `minmax(0, 1fr) repeat(${columnas.length}, ${anchoColumna}px)` };
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
        {nota && <span className="text-xs text-fg-muted">{nota}</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <div style={{ minWidth: 240 + columnas.length * anchoColumna }}>
          <div className="grid gap-2 border-b border-line px-4 py-2 text-xs text-fg-muted" style={plantilla}>
            <span />
            {columnas.map((c) => (
              <span key={c} className="text-right">
                {c}
              </span>
            ))}
          </div>
          {filas.map((f, i) => (
            <div
              key={f.clave}
              className={cn("grid gap-2 px-4 py-2 text-[13px]", i > 0 && "border-t border-line", f.resaltada && "bg-surface-muted font-semibold")}
              style={plantilla}
            >
              <span className="min-w-0 truncate text-fg">{f.nombre}</span>
              {f.valores.map((v, j) => (
                <span key={j} className={cn("text-right tabular-nums", v === 0 || v === "—" ? "text-fg-muted" : "text-fg")}>
                  {typeof v === "number" ? numero(v) : v}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Lo que se hizo con lo propuesto, en una barra: usado (verde), desestimado (rojo), venció (gris) y pendiente (punteado).
 * Con el porcentaje usado de lo cerrado al lado, o «—» si no se cerró nada.
 */
export function BarraDeUso({ u }: { u: UsoDeLoQuePropone }) {
  if (u.nacieron === 0) return <span className="text-xs text-fg-muted">no propuso nada</span>;
  const parte = parteUsada(u);
  const tramo = (n: number) => `${(n / u.nacieron) * 100}%`;
  return (
    <span className="flex items-center gap-2" title={`Propuso ${u.nacieron}: usó ${u.usados}, desestimó ${u.desestimados}, venció ${u.vencidos} y ${u.pendientes} esperan.`}>
      <span className="flex h-2 w-24 shrink-0 overflow-hidden rounded-full bg-surface-muted">
        <span className="bg-success-ink" style={{ width: tramo(u.usados) }} />
        <span className="bg-danger-ink" style={{ width: tramo(u.desestimados) }} />
        <span className="bg-fg-muted" style={{ width: tramo(u.vencidos) }} />
      </span>
      <span className="whitespace-nowrap text-xs tabular-nums text-fg-secondary">
        {parte === null ? "nada cerrado" : `${pct(parte)} usado`} <span className="text-fg-muted">· {numero(u.nacieron)}</span>
      </span>
    </span>
  );
}

export function LeyendaDeUso() {
  return (
    <span className="flex flex-wrap items-center gap-3 text-[11px] text-fg-muted">
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-success-ink" /> Usado
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-danger-ink" /> Desestimado
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-fg-muted" /> Venció
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-surface-muted ring-1 ring-line" /> Espera decisión
      </span>
    </span>
  );
}

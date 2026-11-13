/**
 * components/finanzas/caja/piezas.tsx — las piezas chicas de «Dónde está la plata»: montos en dos monedas, la tarjeta de
 * un número con su explicación y el encabezado de una sección. Sin estado.
 */
import { InfoHint } from "@/components/ui";
import { fmtMonto } from "@/components/cobranza/format";
import type { TotalesMoneda } from "@/lib/finanzas/caja/proyeccion";

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("es-CR")}`;
}

/** Las dos monedas, cada una en su línea; la que está en cero no se muestra (salvo que las dos lo estén). */
export function DosMonedas({ t, className = "" }: { t: TotalesMoneda; className?: string }) {
  const lineas = (["USD", "CRC"] as const).filter((m) => t[m] !== 0);
  if (lineas.length === 0) return <span className={`tabular-nums text-fg-muted ${className}`}>0</span>;
  return (
    <span className={`flex flex-col tabular-nums ${className}`}>
      {lineas.map((m) => (
        <span key={m} className={t[m] < 0 ? "text-danger-ink" : undefined}>
          {fmtMonto(t[m], m)}
        </span>
      ))}
    </span>
  );
}

/** Un número grande con qué mide y de dónde sale (el ⓘ). */
export function Cifra({
  titulo,
  explicacion,
  valor,
  detalle,
  tono = "normal",
}: {
  titulo: string;
  explicacion: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
  tono?: "normal" | "bien" | "mal";
}) {
  const borde = tono === "mal" ? "border-danger-line bg-danger-surface" : tono === "bien" ? "border-success-line bg-success-surface" : "border-line bg-surface";
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-xl border p-4 ${borde}`}>
      <span className="flex items-center gap-1.5 text-xs text-fg-muted">
        {titulo}
        <InfoHint text={explicacion} />
      </span>
      <span className="text-xl font-semibold tabular-nums text-fg">{valor}</span>
      {detalle && <span className="text-xs text-fg-secondary">{detalle}</span>}
    </div>
  );
}

export function Seccion({
  titulo,
  explicacion,
  accion,
  children,
}: {
  titulo: string;
  explicacion?: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={titulo} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
        {explicacion && <InfoHint text={explicacion} />}
        {accion && <div className="ml-auto">{accion}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * components/cs/piezas.tsx — las piezas chicas de Éxito del cliente (rediseño 2026-10-04, sistema
 * «Nexus · interfaz interna»): chips, punto de salud, avatar, barra de uso y la tabla con
 * encabezado gris. Las comparten el índice de la CSL y la ficha de cada cuenta.
 *
 * Solo tokens semánticos. El color dice el ESTADO y siempre va con una palabra: rojo = en riesgo o
 * bloqueado, ámbar = atención, verde = al día. La chispa marca SOLO lo que dijo la IA.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { iniciales } from "@/lib/cs/formato";
import type { SaludDeCuenta } from "@/lib/cs/cartera-reglas";

export type TonoDeChip = "neutro" | "atencion" | "ia" | "cruce" | "confirmado";

const TONO: Record<TonoDeChip, string> = {
  neutro: "border-line bg-surface-hover text-fg-secondary font-medium",
  atencion: "border-warn-line bg-warn-surface text-warn-ink font-semibold",
  ia: "border-info-line bg-info-surface text-brand font-semibold pl-1.5",
  /* «Cruce»: junta dos fuentes que HubSpot no ve juntas. Borde en tinta y fondo blanco: no es un
     estado (no lleva color), es una marca de procedencia. */
  cruce: "border-fg bg-surface text-fg font-semibold",
  confirmado: "border-success-line bg-success-surface text-success-ink font-semibold",
};

/** La píldora chica de 11 px. */
export function Chip({ tono = "neutro", children, title }: { tono?: TonoDeChip; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[11px]", TONO[tono])}>
      {tono === "ia" && <IconoDeSugerencia className="h-[13px] w-[13px] flex-shrink-0 text-brand" />}
      {children}
    </span>
  );
}

/** El chip de cabecera (12 px, blanco). */
export function ChipDeCabecera({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-[3px] text-xs font-medium text-fg-secondary">
      {children}
    </span>
  );
}

export type ColorDePunto = "rojo" | "ambar" | "verde" | "gris";

const PUNTO: Record<ColorDePunto, string> = {
  rojo: "bg-destructive",
  ambar: "bg-warning",
  verde: "bg-success",
  gris: "bg-fg-muted",
};

export function Punto({ color, className }: { color: ColorDePunto; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 flex-shrink-0 rounded-full", PUNTO[color], className)} />;
}

export const META_DE_SALUD: Record<SaludDeCuenta, { texto: string; color: ColorDePunto }> = {
  "en-riesgo": { texto: "En riesgo", color: "rojo" },
  "en-friccion": { texto: "En fricción", color: "ambar" },
  saludable: { texto: "Saludable", color: "verde" },
};

/** La salud de una cuenta: punto + palabra (nunca solo el color). */
export function Salud({ salud }: { salud: SaludDeCuenta }) {
  const m = META_DE_SALUD[salud];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-fg">
      <Punto color={m.color} />
      {m.texto}
    </span>
  );
}

/** El avatar con iniciales del CSE (22 px). */
export function Avatar({ nombre, title }: { nombre: string | null; title?: string }) {
  return (
    <span
      title={title ?? nombre ?? "Sin CSE"}
      className={cn(
        "flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border bg-surface-hover text-[10px] font-semibold text-fg-secondary",
        nombre ? "border-line" : "border-dashed border-line",
      )}
    >
      {nombre ? iniciales(nombre) : "?"}
    </span>
  );
}

/** La barra de un puntaje 0–100. Ámbar cuando está en zona de atención. */
export function Barra({ valor, atencion = false, ancho = "w-12" }: { valor: number; atencion?: boolean; ancho?: string }) {
  return (
    <span aria-hidden className={cn("inline-block h-1.5 flex-shrink-0 overflow-hidden rounded-full bg-surface-active", ancho)}>
      <span className={cn("block h-full", atencion ? "bg-warning" : "bg-fg-muted")} style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
    </span>
  );
}

/** La caja de una tabla: borde, esquinas de 12 px y scroll horizontal propio en pantallas angostas. */
export function CajaDeTabla({ children, minimo }: { children: ReactNode; minimo: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <div className={minimo}>{children}</div>
    </div>
  );
}

/** El encabezado gris de una tabla (rótulos de 11 px en mayúscula). */
export function EncabezadoDeTabla({ columnas, children }: { columnas: string; children: ReactNode }) {
  return (
    <div className={cn("grid items-center gap-4 rounded-t-xl border-b border-line bg-surface-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted", columnas)}>
      {children}
    </div>
  );
}

/** Un subtítulo de grupo dentro de una tabla («Próximos 30 días · 2»). */
export function GrupoDeTabla({ titulo, detalle, primero = false }: { titulo: string; detalle?: string; primero?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-line bg-surface-muted px-4 py-2", !primero && "border-t")}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{titulo}</span>
      {detalle && <span className="text-xs text-fg-muted">{detalle}</span>}
    </div>
  );
}

/** El chevron de una fila que abre la ficha. */
export function Flecha() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-fg-muted" aria-hidden>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** Un título de sección del centro (18 px) con su ayuda. */
export function TituloDeSeccion({ titulo, ayuda, derecha }: { titulo: string; ayuda?: ReactNode; derecha?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold leading-[26px] text-fg">{titulo}</h2>
        {ayuda && <p className="mt-0.5 text-xs text-fg-muted">{ayuda}</p>}
      </div>
      {derecha && <div className="flex flex-wrap items-center gap-1.5">{derecha}</div>}
    </div>
  );
}

/**
 * components/carga/piezas.tsx — las piezas chicas de las pantallas de carga de Customer Success (sistema «Nexus ·
 * interfaz interna»). Sin hooks: las usan páginas del servidor y componentes del navegador.
 *
 * El color dice el estado y siempre va con una palabra o un número: verde = con espacio, ámbar = llena, rojo =
 * sobrecarga. Lo proyectado lleva borde punteado; lo que no cuenta (antes de entrar al equipo), gris punteado.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ETIQUETA_DEL_SEMAFORO, type Semaforo } from "@/lib/carga/config";
import type { SemanaDePersona } from "@/lib/carga/utilizacion";

/** 47 → «47,0». */
export function coma(x: number, decimales = 1): string {
  return x.toFixed(decimales).replace(".", ",");
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * «5 oct 2026, 16:40» en hora de Costa Rica (UTC-6 todo el año), armado a mano: `Intl` escribe distinto en Node y en
 * el navegador y rompe la hidratación.
 */
export function fechaYHora(iso: string): string {
  const d = new Date(Date.parse(iso) - 6 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

/** 47 → «47,0 h». */
export function horas(x: number): string {
  return `${coma(x)} h`;
}

const TONO_DE_SEMAFORO: Record<Semaforo, string> = {
  "con-espacio": "border-success-line bg-success-surface text-success-ink",
  llena: "border-warn-line bg-warn-surface text-warn-ink",
  sobrecarga: "border-danger-line bg-danger-surface text-danger-ink",
};

/** El chip de estado de una persona: la palabra siempre, el color solo acompaña. */
export function EstadoDeCarga({ semaforo, detalle }: { semaforo: Semaforo; detalle?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold", TONO_DE_SEMAFORO[semaforo])}>
      {ETIQUETA_DEL_SEMAFORO[semaforo]}
      {detalle && <span className="font-medium">· {detalle}</span>}
    </span>
  );
}

/** Una celda de la tabla de utilización: el porcentaje de la semana. */
export function CeldaDeSemana({ semana }: { semana: SemanaDePersona }) {
  if (!semana.enElEquipo) {
    return (
      <div title="Todavía no estaba en el equipo" className="flex h-[30px] items-center justify-center rounded-md border border-dashed border-line bg-surface-muted text-xs font-semibold text-fg-muted">
        —
      </div>
    );
  }
  return (
    <div
      title={`${horas(semana.total)} de ${horas(semana.disponible)}${semana.proyectada ? " · proyectada" : ""}`}
      className={cn(
        "flex h-[30px] items-center justify-center rounded-md border text-xs font-semibold tabular-nums",
        TONO_DE_SEMAFORO[semana.semaforo],
        semana.proyectada && "border-dashed",
      )}
    >
      {semana.utilizacion}
    </div>
  );
}

/** La muestra de color de la leyenda. */
export function Muestra({ className }: { className: string }) {
  return <span aria-hidden className={cn("inline-block h-3.5 w-[18px] flex-shrink-0 rounded-[4px] border", className)} />;
}

export const LEYENDA_DE_SEMAFORO: Array<{ clase: string; texto: string }> = [
  { clase: TONO_DE_SEMAFORO["con-espacio"], texto: "Con espacio · menos de 70 %" },
  { clase: TONO_DE_SEMAFORO.llena, texto: "Llena · 70 a 85 %" },
  { clase: TONO_DE_SEMAFORO.sobrecarga, texto: "Sobrecarga · más de 85 %" },
  { clase: "border-dashed border-line bg-surface-muted", texto: "Borde punteado: proyectada" },
];

/** Una cifra grande con su rótulo y su nota (la tarjeta de arriba de las pantallas). */
export function Cifra({ rotulo, valor, nota, alerta = false }: { rotulo: string; valor: ReactNode; nota?: ReactNode; alerta?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3.5">
      <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-fg-muted">{rotulo}</span>
      <span className={cn("text-[22px] font-bold leading-7 tabular-nums", alerta ? "text-danger-ink" : "text-fg")}>{valor}</span>
      {nota && <span className="text-xs leading-4 text-fg-muted">{nota}</span>}
    </div>
  );
}

/** Las cinco partes de la semana, en el orden de la barra. */
export const PARTES_DE_LA_SEMANA = [
  { clave: "cliente", texto: "Reuniones con clientes", clase: "bg-fg border-fg" },
  { clave: "comercial", texto: "Prospectos y aliados", clase: "bg-fg-secondary border-fg-secondary" },
  { clave: "interna", texto: "Reuniones internas", clase: "bg-fg-muted border-fg-muted" },
  { clave: "preparacion", texto: "Preparación", clase: "bg-surface-active border-surface-active" },
  { clave: "entrega", texto: "Entrega estimada del cronograma", clase: "bg-surface-muted border-dashed border-fg-muted" },
] as const;

type Partes = Record<(typeof PARTES_DE_LA_SEMANA)[number]["clave"], number>;

/** En qué se va la semana: una barra apilada, en proporción al total. */
export function BarraDeLaSemana({ partes, ancho = "w-[180px]" }: { partes: Partes; ancho?: string }) {
  const total = PARTES_DE_LA_SEMANA.reduce((a, p) => a + partes[p.clave], 0);
  if (total <= 0) return <span className={cn("block h-2.5 rounded-full bg-surface-muted", ancho)} />;
  return (
    <span className={cn("flex h-2.5 gap-px overflow-hidden rounded-full bg-surface-muted", ancho)}>
      {PARTES_DE_LA_SEMANA.map((p) =>
        partes[p.clave] > 0 ? <span key={p.clave} title={`${p.texto}: ${horas(partes[p.clave])}`} className={cn("h-full border", p.clase)} style={{ width: `${(partes[p.clave] / total) * 100}%` }} /> : null,
      )}
    </span>
  );
}

/** La leyenda de la barra. */
export function LeyendaDeLaSemana({ preparacionMin }: { preparacionMin: number }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-fg-secondary">
      {PARTES_DE_LA_SEMANA.map((p) => (
        <span key={p.clave} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("inline-block h-2.5 w-2.5 rounded-sm border", p.clase)} />
          {p.clave === "preparacion" ? `Preparación (${preparacionMin} min por reunión con un cliente)` : p.texto}
        </span>
      ))}
    </div>
  );
}

/** «Ver esto»: un enlace con forma de botón blanco del sistema. */
export const ENLACE_BLANCO =
  "inline-flex items-center rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg";
/** El enlace de texto azul. */
export const ENLACE_AZUL = "text-xs font-semibold text-brand transition-colors hover:text-brand-light";

"use client";

/**
 * components/feedback/piezas.tsx — las piezas chicas que comparten el panel de Feedback y la bandeja.
 * Solo tokens del sistema «Nexus · interfaz interna».
 */
import { cn } from "@/lib/cn";
import { TIPO, type EstadoVisible, type TipoDeFeedback } from "@/lib/feedback/reglas";

export function Trazo({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function IconoDeTipo({ tipo, className = "h-[13px] w-[13px]" }: { tipo: TipoDeFeedback; className?: string }) {
  return <Trazo d={TIPO[tipo].icono} className={cn("flex-shrink-0", className)} />;
}

export const ICONO_FEEDBACK = "M4 5h16v11H10l-6 4z M8 9h8 M8 12h5";
export const ICONO_SENALAR = "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 2v3 M12 19v3 M2 12h3 M19 12h3";
export const ICONO_CERRAR = "M6 6l12 12 M18 6L6 18";

const TONO_DE_MARCA: Record<EstadoVisible["tono"], string> = {
  muted: "text-fg-muted",
  warning: "text-warning",
  brand: "text-brand",
  success: "text-success-ink",
};

/** El chip del estado: siempre con palabra y marca, nunca solo el color. */
export function ChipDeEstado({ estado, className }: { estado: EstadoVisible; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-semibold",
        estado.verde ? "border-success-line bg-success-surface text-success-ink" : "border-line bg-surface text-fg-secondary",
        className,
      )}
    >
      <span className={TONO_DE_MARCA[estado.tono]}>{estado.marca}</span>
      {estado.texto}
    </span>
  );
}

export function Iniciales({ texto, className }: { texto: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full border border-line bg-surface-hover text-[10px] font-bold text-fg-secondary",
        className,
      )}
    >
      {texto}
    </span>
  );
}

/** La marca numerada de «Señalar» (azul: es lo activo, lo que se está mostrando). */
export function MarcaNumerada({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-fg",
        className,
      )}
    >
      {n}
    </span>
  );
}

export interface MensajeDelHilo {
  id: string;
  autor: { nombre: string; iniciales: string };
  deQuienReporto: boolean;
  /**
   * Lo escribió quien está mirando. Hace falta desde que en un comentario de la escala responde
   * cualquiera del equipo (2026-10-05): ya no alcanza con «no es de quien reportó» para decir «Tú».
   */
  esMio?: boolean;
  cuerpo: string;
  creado: string;
}

/** La conversación de un reporte. `yoReporte` cambia cómo se nombra a cada lado («Tú»). */
export function Hilo({ mensajes, yoReporte, haceCuanto }: { mensajes: MensajeDelHilo[]; yoReporte: boolean; haceCuanto: (iso: string) => string }) {
  if (mensajes.length === 0) return null;
  return (
    <div className="space-y-3.5">
      {mensajes.map((m) => {
        const soyYo = m.esMio ?? (yoReporte ? m.deQuienReporto : !m.deQuienReporto);
        return (
          <div key={m.id} className="flex gap-2.5">
            <Iniciales texto={m.autor.iniciales} />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-fg">{soyYo ? "Tú" : m.autor.nombre}</span>
                <span className="text-fg-muted">{haceCuanto(m.creado)}</span>
              </p>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.5] text-fg-secondary">{m.cuerpo}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

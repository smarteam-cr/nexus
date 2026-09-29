"use client";

/**
 * components/escala/piezas.tsx — piezas chicas que comparten las tres vistas de la escala.
 *
 *   · `MetaDelCriterio`: debajo del texto, en chico, el identificador, cómo se verifica y si es
 *     hábito, riesgo o de un perfil. Cada marca explica en su tooltip lo que la escala dice de ella.
 *   · `Contador`: cuántos comentarios tiene algo; en azul si hay abiertos.
 *   · `Segmentado`: un grupo de opciones excluyentes (radio), con flechas.
 *   · `BotonComentar`: el globito que abre el panel de comentarios de un ancla.
 */
import { useRef } from "react";
import { InfoHint } from "@/components/ui";
import { cn } from "@/lib/cn";
import { explicarMarca } from "@/lib/escala/documento/perfil";
import type { BloqueDeTexto, Criterio } from "@/lib/escala/documento/tipos";
import type { Conteo } from "@/lib/escala/comentarios/reglas";
import { partirPorPalabras, type DatosDeLaVista, type TerminoSubrayado } from "@/lib/escala/vista";

export function IconoComentario({ className }: { className?: string }) {
  return (
    <svg className={cn("h-3.5 w-3.5 flex-shrink-0", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function definicion(datos: DatosDeLaVista, termino: string): string | undefined {
  return datos.glosario.find((t) => t.termino.toLowerCase() === termino.toLowerCase())?.significado;
}

export function MetaDelCriterio({ criterio: c, datos, className }: { criterio: Criterio; datos: DatosDeLaVista; className?: string }) {
  const mensaje = datos.riesgos[c.id];
  return (
    <span className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs leading-none text-fg-muted", className)}>
      <span className="font-mono">{c.id}</span>
      <span title={datos.verificacion[c.verificacion] ? `${c.verificacion[0].toUpperCase()}${c.verificacion.slice(1)}: ${datos.verificacion[c.verificacion]}` : undefined}>
        · {c.verificacion}
      </span>
      {c.habito && (
        <span className="rounded bg-surface-hover px-1 py-0.5 text-fg-secondary" title={definicion(datos, "Hábito") ?? "Hábito"}>
          hábito
        </span>
      )}
      {c.riesgo && (
        <span
          className="rounded border border-warn-line bg-warn-surface px-1 py-0.5 font-medium text-warn-ink"
          title={mensaje ? `No decide el nivel, pero es requisito para pasar a Eficiente. Si no se cumple, el cliente ve: «${mensaje}»` : "Riesgo"}
        >
          riesgo
        </span>
      )}
      {c.perfil && (
        <span className="rounded bg-info-surface px-1 py-0.5 text-info-ink" title={explicarMarca(c.perfil) ?? undefined}>
          {c.perfil}
        </span>
      )}
    </span>
  );
}

export function Contador({ conteo, className, conTexto = false }: { conteo: Conteo; className?: string; conTexto?: boolean }) {
  if (conteo.total === 0) return null;
  const titulo = `${conteo.total} ${conteo.total === 1 ? "comentario" : "comentarios"}${conteo.abiertos ? ` · ${conteo.abiertos} ${conteo.abiertos === 1 ? "abierto" : "abiertos"}` : ""}`;
  return (
    <span
      title={titulo}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums",
        conteo.abiertos ? "bg-info-surface text-info-ink" : "bg-surface-hover text-fg-muted",
        className,
      )}
    >
      <IconoComentario className="h-3 w-3" />
      {conTexto ? titulo : conteo.total}
    </span>
  );
}

export function BotonComentar({
  conteo,
  onClick,
  etiqueta,
  className,
}: {
  conteo: Conteo;
  onClick: () => void;
  etiqueta: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        "inline-flex flex-shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-2xs font-semibold tabular-nums transition-colors",
        conteo.total
          ? conteo.abiertos
            ? "border-info-line bg-info-surface text-info-ink hover:bg-surface-hover"
            : "border-line bg-surface-hover text-fg-secondary hover:bg-surface-active"
          : "border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg",
        className,
      )}
    >
      <IconoComentario className="h-3 w-3" />
      {conteo.total > 0 && conteo.total}
    </button>
  );
}

export interface OpcionSegmentada<K extends string> {
  clave: K;
  etiqueta: string;
  title?: string;
  /** Se ve pero no se elige (con su `title` explicando por qué). */
  deshabilitada?: boolean;
}

/** Opciones excluyentes: role="radiogroup", flechas para moverse, la selección sigue al foco. */
export function Segmentado<K extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
  className,
}: {
  opciones: readonly OpcionSegmentada<K>[];
  valor: K;
  onCambio: (k: K) => void;
  etiqueta: string;
  className?: string;
}) {
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const mover = (paso: 1 | -1) => {
    const activas = opciones.filter((o) => !o.deshabilitada);
    if (activas.length === 0) return;
    const i = activas.findIndex((o) => o.clave === valor);
    const sig = activas[(i + paso + activas.length) % activas.length];
    onCambio(sig.clave);
    refs.current.get(sig.clave)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className={cn("inline-flex max-w-full flex-wrap rounded-lg border border-line bg-surface-muted p-0.5", className)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          mover(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          mover(-1);
        }
      }}
    >
      {opciones.map((o) => {
        const activo = o.clave === valor;
        return (
          <button
            key={o.clave}
            ref={(el) => {
              if (el) refs.current.set(o.clave, el);
              else refs.current.delete(o.clave);
            }}
            type="button"
            role="radio"
            aria-checked={activo}
            tabIndex={activo ? 0 : -1}
            title={o.title}
            aria-disabled={o.deshabilitada || undefined}
            onClick={() => !o.deshabilitada && onCambio(o.clave)}
            className={cn(
              "whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors",
              activo
                ? "bg-surface font-semibold text-fg shadow-sm"
                : o.deshabilitada
                  ? "cursor-not-allowed text-fg-muted opacity-50"
                  : "text-fg-muted hover:text-fg-secondary",
            )}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/** Un párrafo de la escala con sus negritas (`**Título.**`), sin más markdown. */
export function ParrafoDeLaEscala({ texto, className }: { texto: string; className?: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className={className}>
      {partes.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-fg">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

/** Párrafos y puntos de lista de la escala, en su orden (los puntos, como lista). */
export function BloquesDeLaEscala({ bloques, className }: { bloques: BloqueDeTexto[]; className?: string }) {
  const grupos: BloqueDeTexto[][] = [];
  for (const b of bloques) {
    const ultimo = grupos[grupos.length - 1];
    if (b.tipo === "punto" && ultimo?.[0].tipo === "punto") ultimo.push(b);
    else grupos.push([b]);
  }
  return (
    <div className={cn("space-y-2", className)}>
      {grupos.map((g, i) =>
        g[0].tipo === "punto" ? (
          <ul key={i} className="flex flex-col gap-1.5">
            {g.map((b, j) => (
              <li key={j} className="flex gap-2">
                <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-fg-muted" aria-hidden />
                <ParrafoDeLaEscala texto={b.texto} className="text-sm leading-relaxed text-fg-secondary" />
              </li>
            ))}
          </ul>
        ) : (
          <ParrafoDeLaEscala key={i} texto={g[0].texto} className="text-sm leading-relaxed text-fg-secondary" />
        ),
      )}
    </div>
  );
}

/** Un grupo de controles con su nombre arriba (y, si hace falta, un (i) que lo explica). */
export function GrupoDeControl({
  nombre,
  ayuda,
  children,
  className,
}: {
  nombre: string;
  ayuda?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-fg-muted">
        {nombre}
        {ayuda && <InfoHint text={ayuda} />}
      </span>
      {children}
    </div>
  );
}

/** «al menos 80%» → «Al menos 80%.»: el significado solo, como una frase. */
function comoFrase(s: string): string {
  const t = s.trim();
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}`;
}

/**
 * Un texto de la escala con sus palabras subrayadas y su significado al pasar el cursor: las de
 * valor fijo («la mayoría» = al menos 80%), para que dos personas decidan igual, y los términos del
 * glosario («pipeline review»), para no tener que ir a buscarlos. El tooltip dice solo el significado.
 */
export function TextoConPalabras({ texto, palabras }: { texto: string; palabras: TerminoSubrayado[] }) {
  const trozos = partirPorPalabras(texto, palabras);
  if (trozos.length === 1 && !trozos[0].palabra) return <>{texto}</>;
  return (
    <>
      {trozos.map((t, i) =>
        t.palabra ? (
          <abbr
            key={i}
            title={comoFrase(t.palabra.significado)}
            className={cn(
              "cursor-help underline decoration-dotted underline-offset-2",
              t.palabra.tipo === "glosario"
                ? "decoration-fg-muted [text-decoration-thickness:1px]"
                : "decoration-info-ink [text-decoration-thickness:1.5px]",
            )}
          >
            {t.texto}
          </abbr>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </>
  );
}

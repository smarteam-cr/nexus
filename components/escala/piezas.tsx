"use client";

/**
 * components/escala/piezas.tsx — piezas chicas que comparten las tres vistas de la escala.
 *
 *   · `MetaDelCriterio`: debajo del texto, en chico, el identificador, cómo se verifica y si es
 *     hábito, riesgo o de un perfil. Cada marca explica en su tooltip lo que la escala dice de ella.
 *     Al final, qué otros criterios requiere y cuántos lo requieren a él.
 *   · `EnlacesDelCriterio`: esos requeridos escritos enteros, para leerlos y para ir a ellos.
 *   · `Contador`: cuántos comentarios tiene algo; en azul si hay abiertos.
 *   · `Segmentado`: un grupo de opciones excluyentes (radio), con flechas.
 *   · `BotonComentar`: el globito que abre el panel de comentarios de un ancla.
 */
import { InfoHint } from "@/components/ui";
import { cn } from "@/lib/cn";
import { explicarMarca, SIN_PERFIL, type Perfil } from "@/lib/escala/documento/perfil";
import { enlacesQueAplican, type EnlaceDeCriterio } from "@/lib/escala/documento/requeridos";
import type { BloqueDeTexto, Criterio, Nivel } from "@/lib/escala/documento/tipos";
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

/** «1.5.F1 · Propuesta y Coherencia · Funcional — Existe un documento…»: un criterio del otro lado de un enlace, en una línea. */
function enUnaLinea(datos: DatosDeLaVista, e: EnlaceDeCriterio): string {
  const nivel = datos.niveles.find((n) => n.letra === e.letra)?.nombre ?? e.letra;
  const area = e.area !== datos.area.id ? `${e.areaNombre} · ` : "";
  return `${e.id} · ${area}${e.dimensionNombre} · ${nivel} — ${e.texto}`;
}

/** Lo que un criterio requiere y quiénes lo requieren, de lo que aplica al perfil elegido. */
export function enlacesDe(datos: DatosDeLaVista, id: string, perfil: Perfil = SIN_PERFIL): { requiere: EnlaceDeCriterio[]; loRequieren: EnlaceDeCriterio[] } {
  return {
    requiere: enlacesQueAplican(datos.requeridos.requiere[id], perfil),
    loRequieren: enlacesQueAplican(datos.requeridos.loRequieren[id], perfil),
  };
}

export function MetaDelCriterio({
  criterio: c,
  datos,
  perfil,
  className,
}: {
  criterio: Criterio;
  datos: DatosDeLaVista;
  /** Con un perfil elegido, no se cuentan los enlaces hacia criterios que ese perfil esconde. */
  perfil?: Perfil;
  className?: string;
}) {
  const mensaje = datos.riesgos[c.id];
  const { requiere, loRequieren } = enlacesDe(datos, c.id, perfil);
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
      {c.propio && (
        <span
          className="rounded bg-success-surface px-1 py-0.5 font-medium text-success-ink"
          title={`Solo existe en la edición ${datos.edicion?.nombre ?? ""}: la escala general no lo tiene.`}
        >
          de la edición
        </span>
      )}
      {c.textoGeneral !== undefined && (
        <span
          className="cursor-help rounded border border-line px-1 py-0.5 text-fg-secondary"
          title={`Es el mismo criterio de la escala general, dicho con las palabras de la edición. En la general dice: «${c.textoGeneral}»`}
        >
          con sus palabras
        </span>
      )}
      {requiere.length > 0 && (
        <span
          className="cursor-help rounded border border-dashed border-info-line px-1 py-0.5 text-info-ink"
          title={`Para cumplirse necesita ${requiere.length === 1 ? "este otro criterio" : "estos otros criterios"}:\n${requiere.map((e) => enUnaLinea(datos, e)).join("\n")}`}
        >
          requiere {requiere.length === 1 ? <span className="font-mono">{requiere[0].id}</span> : requiere.length}
        </span>
      )}
      {loRequieren.length > 0 && (
        <span
          className="cursor-help rounded border border-dashed border-line px-1 py-0.5 text-fg-secondary"
          title={`${loRequieren.length === 1 ? "Lo necesita este otro criterio" : "Lo necesitan estos otros criterios"}:\n${loRequieren.map((e) => enUnaLinea(datos, e)).join("\n")}`}
        >
          lo {loRequieren.length === 1 ? "requiere" : "requieren"} {loRequieren.length === 1 ? <span className="font-mono">{loRequieren[0].id}</span> : loRequieren.length}
        </span>
      )}
    </span>
  );
}

/**
 * Los requeridos de un criterio, escritos: lo que necesita y quiénes lo necesitan, cada uno con su
 * dimensión, su nivel y su texto. Si se puede ir a ellos (`onIr`), cada uno es un botón.
 */
export function EnlacesDelCriterio({
  criterio: c,
  datos,
  perfil,
  onIr,
  className,
}: {
  criterio: Criterio;
  datos: DatosDeLaVista;
  perfil?: Perfil;
  /** Ir al criterio del otro lado. Solo se ofrece para los de esta área (los demás se nombran). */
  onIr?: (enlace: EnlaceDeCriterio) => void;
  className?: string;
}) {
  const { requiere, loRequieren } = enlacesDe(datos, c.id, perfil);
  if (requiere.length + loRequieren.length === 0) return null;
  const grupo = (titulo: string, enlaces: EnlaceDeCriterio[]) =>
    enlaces.length > 0 && (
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">{titulo}</p>
        <ul className="mt-1 flex flex-col gap-1">
          {enlaces.map((e) => {
            const nivel = datos.niveles.find((n) => n.letra === e.letra)?.nombre ?? e.letra;
            const deOtraArea = e.area !== datos.area.id;
            const contenido = (
              <>
                <span className="flex flex-wrap items-baseline gap-x-1.5 text-2xs text-fg-muted">
                  <span className="font-mono">{e.id}</span>
                  <span>
                    {deOtraArea ? `${e.areaNombre} · ` : ""}
                    {e.dimensionNombre} · {nivel}
                  </span>
                </span>
                <span className="block text-xs leading-snug text-fg-secondary">{e.texto}</span>
              </>
            );
            return (
              <li key={e.id}>
                {onIr && !deOtraArea ? (
                  <button
                    type="button"
                    onClick={() => onIr(e)}
                    title="Ir a este criterio"
                    className="w-full rounded-md border border-dashed border-info-line px-2 py-1 text-left transition-colors hover:bg-surface-hover"
                  >
                    {contenido}
                  </button>
                ) : (
                  <div className="rounded-md border border-dashed border-line px-2 py-1">{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {grupo(requiere.length === 1 ? "Requiere este criterio" : "Requiere estos criterios", requiere)}
      {grupo(loRequieren.length === 1 ? "Lo requiere" : "Lo requieren", loRequieren)}
    </div>
  );
}

/** «En la escala general: Tracción del Deal», cuando una edición le cambió el nombre a una dimensión. */
export function NombreGeneral({ nombre, className }: { nombre: string | undefined; className?: string }) {
  if (!nombre) return null;
  return <span className={cn("block text-2xs font-normal text-fg-muted", className)}>En la escala general: {nombre}</span>;
}

/**
 * Los criterios de la escala general que la edición sacó de un nivel: se dice cuántos, y cuáles al
 * pasar el cursor (no desaparecen en silencio).
 */
export function NoAplicanEnLaEdicion({ nivel, className }: { nivel: Nivel; className?: string }) {
  const fuera = nivel.noAplican ?? [];
  if (fuera.length === 0) return null;
  return (
    <span
      className={cn("cursor-help text-2xs text-fg-muted underline decoration-dotted underline-offset-2", className)}
      title={fuera.map((c) => `${c.id} · ${c.texto}`).join("\n")}
    >
      {fuera.length} de la escala general {fuera.length === 1 ? "no aplica" : "no aplican"} en esta edición
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

/** Opciones excluyentes: vive en components/ui (la usa también la exploración de venta). */
export { Segmentado, type OpcionSegmentada } from "@/components/ui/Segmentado";

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

/**
 * «al menos 80%» → «Al menos 80%.»: el significado solo, como una frase. La escala lo escribe para
 * seguir a «quiere decir» («que se revisa…»): suelto, sin ese «que».
 */
function comoFrase(s: string): string {
  const t = s.trim().replace(/^que\s+/i, "");
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

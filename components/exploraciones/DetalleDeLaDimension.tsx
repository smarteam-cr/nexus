"use client";

/**
 * DetalleDeLaDimension — una dimensión de La escala abierta: cómo está hoy, qué preguntar, los cinco niveles, lo que pide
 * Funcional y «Explorarla a fondo». Salió de PasoEscala.tsx el 8 nov (La escala interna editable) para que lo usen las
 * dos vistas: debajo del radar en «Comparar áreas» y «Mapa», y en el panel lateral de la página del cliente
 * (PaginaDeLaEscala.tsx). Lo mismo en las dos: no hay una copia.
 */
import { Alert } from "@/components/ui";
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import { cn } from "@/lib/cn";
import type { Letra } from "@/lib/escala/documento/tipos";
import { esHipotesisDeNivel, type EstimadoGuardado } from "@/lib/exploraciones/contenido";
import type { DimensionDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { nivelDelVendedor, sinRiesgoSiSube } from "@/lib/exploraciones/mapa";
import { useLienzo } from "./contexto";
import { IconoDeSugerencia } from "./FranjaDeSugerencias";
import { PreguntasDeLaDimension } from "./TarjetaDelRadar";

const LETRAS: Letra[] = ["D", "I", "F", "E", "O"];

/** El rótulo chico en mayúsculas del tablero. */
export function Rotulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("block text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted", className)}>{children}</span>;
}

/**
 * El vendedor dice dónde está una dimensión: los cinco niveles del detalle y el arrastre del radar de la página
 * (PaginaDeLaEscala) escriben por acá. Si coincide con lo que propone el agente, se usa esa propuesta (con su porqué y su
 * frase); una hipótesis que el vendedor confirma pasa a ser suya. Devuelve si mandó algo: marcar el mismo nivel no toca
 * nada (se perdería la frase que lo respalda).
 */
export function useMarcarNivel(): (dimensionId: string, nivel: Letra) => Promise<boolean> {
  const { exp, mapa, cambiar, usar } = useLienzo();
  return async (dimensionId, nivel) => {
    const p = mapa.posiciones[dimensionId];
    const pend = p?.pendiente;
    const v = pend?.valor as EstimadoGuardado | undefined;
    if (pend && v?.nivel === nivel) {
      const valor: EstimadoGuardado = sinRiesgoSiSube(esHipotesisDeNivel(pend) ? { ...v, fuente: "vendedor" } : v);
      // Por el «Usar» del lienzo (K12): con su aviso, Ctrl+Z y su lugar en «Usadas hoy».
      return usar([{ ...pend, valor }]);
    }
    // Por encima de Funcional, el riesgo se quita.
    const estimado = nivelDelVendedor(nivel, exp.estado.contenido.chequeo[dimensionId], p);
    return estimado ? cambiar([{ op: "nivel", dimensionId, estimado }]) : false;
  };
}

/**
 * Una dimensión abierta: cómo está hoy, la pregunta, los cinco niveles y lo que pide Funcional. `enPanel`: dentro del
 * panel lateral de la página (PaginaDeLaEscala), que ya trae el nombre y el botón de cerrar.
 */
export function DetalleDeDimension({ d, onCerrar, enPanel = false }: { d: DimensionDelLienzo; onCerrar: () => void; enPanel?: boolean }) {
  const { exp, escala, mapa, cambiar, usar, puedeEditar, guardando, nombreDeNivel, pendientesPara, lugar } = useLienzo();
  const p = mapa.posiciones[d.id];
  const marcada = exp.estado.contenido.aExplorar[d.id];
  const nombreDeCapa = escala.capas.find((c) => c.clave === d.capa)?.nombre ?? d.capa;
  const sugeridoNivel = p?.porRevisar ? (p.pendiente?.valor as EstimadoGuardado | undefined)?.nivel : undefined;
  const marcarNivel = useMarcarNivel();
  const marcar = (nivel: Letra) => void marcarNivel(d.id, nivel);

  // Lo que sugirió el agente para explorar a fondo: marcarla usa su sugerencia, con su razón.
  const sugerida = pendientesPara((x) => x.tipo === "aExplorar" && x.dimensionId === d.id)[0];
  const explorar = () =>
    !marcada && sugerida
      ? void usar([sugerida])
      : void cambiar([
          {
            op: "aExplorar",
            dimensionId: d.id,
            valor: marcada
              ? null
              : {
                  motivo: p && LETRAS.indexOf(p.nivel) < LETRAS.indexOf("F") ? "indicio" : "otro",
                  ...(p?.porQue ? { razon: p.porQue.slice(0, 300) } : {}),
                },
          },
        ]);

  const porConfirmar = d.funcional.filter((c) => exp.estado.contenido.falta[c.id]?.estado !== "tiene").length;

  return (
    <div className={cn("flex flex-col gap-4", !enPanel && "border-t border-line pt-4")}>
      {!enPanel && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Rotulo>
              {nombreDeCapa} · {d.id}
            </Rotulo>
            <h4 className="mt-0.5 text-[15px] font-semibold text-fg">{d.nombre}</h4>
            {d.descripcion && <p className="mt-0.5 text-xs text-fg-muted">{d.descripcion}</p>}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar la dimensión"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Rotulo>Hoy</Rotulo>
          {p ? (
            <>
              <p className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
                  <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[p.nivel])} aria-hidden="true" />
                  {nombreDeNivel(p.nivel)}
                </span>
                {p.clase === "evidencia" ? (
                  <span className="inline-flex rounded-full border border-success-line bg-success-surface px-2 py-px text-[11px] font-semibold text-success-ink">
                    ✓ Con evidencia
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-warn-line bg-warn-surface px-2 py-px text-[11px] font-semibold text-warn-ink">
                    ○ Hipótesis
                  </span>
                )}
              </p>
              {/* Sin de dónde sale, su porqué ni la frase (novena vuelta, 8 nov, Elías: «toda la parte de dónde sale cada
                  nivel me parece irrelevante»): el nivel y si está confirmado o por explorar. */}
              {p.origen === "propuesto" && p.clase === "hipotesis" && puedeEditar && p.pendiente && (
                <button
                  type="button"
                  className="self-start text-xs text-fg-muted hover:text-fg hover:underline"
                  disabled={guardando}
                  onClick={() => void cambiar([{ op: "descartar", itemIds: [p.pendiente!.id] }])}
                >
                  Descartar esta hipótesis
                </button>
              )}
            </>
          ) : (
            <p className="text-[13px] text-fg-muted">Todavía sin dato: pregúntalo en la reunión.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Rotulo>Para confirmarlo, pregunta</Rotulo>
          <div className="flex items-start gap-2.5">
            <span
              className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] bg-surface-hover text-xs font-bold text-fg-secondary"
              aria-hidden="true"
            >
              ?
            </span>
            <p className="text-[14.5px] font-semibold leading-[1.45] text-fg">{d.pregunta}</p>
          </div>
        </div>
      </div>

      {lugar !== "cuenta" && (
        <div className="flex flex-col gap-1.5">
          <Rotulo>Para explorar más, pregunta</Rotulo>
          <PreguntasDeLaDimension dimensionId={d.id} porQue={p?.porQue ?? null} preguntaDeLaEscala={d.pregunta} conNivel={!!p} />
        </div>
      )}

      {p?.riesgo && (
        <Alert variant="warning" title={`Dejó ver un riesgo: por eso no se estima por encima de ${nombreDeNivel("F")}.`}>
          {d.riesgos.map((r) => (
            <p key={r.id}>{r.mensaje ?? r.texto}</p>
          ))}
          {puedeEditar && (
            <p className="mt-1 font-medium">
              Si ya no está, marca {nombreDeNivel("E")} u {nombreDeNivel("O")}: el riesgo se quita y el radar sube.
            </p>
          )}
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Rotulo>{puedeEditar ? "¿Dónde está? Elige el nivel que mejor lo describe" : "Lo que describe cada nivel"}</Rotulo>
        <div role="radiogroup" aria-label={`Nivel de ${d.nombre}`} className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
          {LETRAS.map((l) => {
            const actual = p?.nivel === l;
            const sugerido = sugeridoNivel === l;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={actual}
                disabled={!puedeEditar || guardando}
                onClick={() => marcar(l)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg bg-surface p-2.5 text-left transition-colors hover:bg-surface-muted disabled:cursor-default disabled:hover:bg-surface",
                  actual ? "border border-fg shadow-[inset_0_0_0_1px_var(--color-fg)]" : sugerido ? "border border-dashed border-brand" : "border border-line",
                )}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg">
                    <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[l])} aria-hidden="true" />
                    {nombreDeNivel(l)}
                  </span>
                  {sugerido && <IconoDeSugerencia className="h-3 w-3 text-brand" />}
                </span>
                <span className="line-clamp-4 text-xs leading-[1.4] text-fg-muted">{d.niveles.find((n) => n.letra === l)?.descripcion}</span>
                {l === "F" && (
                  <span className="self-start rounded-full border border-line bg-surface px-[7px] text-[11px] font-semibold text-fg-secondary">La base</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {d.funcional.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Rotulo>
            Lo que pide {nombreDeNivel("F")} · {porConfirmar === 0 ? "lo tiene todo" : `${porConfirmar} de ${d.funcional.length} por confirmar`}
          </Rotulo>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {d.funcional.map((c) => {
              const estado = exp.estado.contenido.falta[c.id]?.estado;
              return (
                <li key={c.id} className="flex items-start gap-2.5 px-2.5 py-2">
                  <span
                    className={cn(
                      "mt-px flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      estado === "tiene"
                        ? "border border-success-line bg-success-surface text-success-ink"
                        : estado === "no_tiene"
                          ? "border border-danger-line bg-danger-surface text-danger-ink"
                          : "border border-dashed border-line text-fg-muted",
                    )}
                    aria-label={estado === "tiene" ? "Lo tiene" : estado === "no_tiene" ? "No lo tiene" : "No se sabe"}
                  >
                    {estado === "tiene" ? "✓" : estado === "no_tiene" ? "✕" : ""}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-fg-secondary">{c.texto}</span>
                  {c.verificacion === "comprobable" && (
                    <span className="flex-shrink-0 rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-fg-secondary">
                      Míralo en el portal
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {puedeEditar && lugar !== "cuenta" && (
        <div>
          <button
            type="button"
            aria-pressed={!!marcada}
            disabled={guardando}
            onClick={explorar}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              marcada
                ? "border border-success-line bg-success-surface text-success-ink"
                : "border border-line bg-surface text-fg-secondary hover:bg-surface-hover",
            )}
          >
            {marcada ? "✓ Se explora a fondo en la próxima sesión" : "Explorarla a fondo en la próxima sesión"}
          </button>
        </div>
      )}
    </div>
  );
}

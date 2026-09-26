"use client";

/**
 * components/canvas/TareasDeLaPropuesta.tsx — LAS TAREAS de la propuesta del cronograma, dentro de la
 * barra de revisión (E2a del borrador, 2026-09-25).
 *
 * «Regenerar todo» deja UNA propuesta con fases y tareas. Una lista de 40 renglones sueltos enterraría
 * los cambios de fases, así que las tareas van agrupadas por FASE, un renglón por fase, siguiendo la
 * numeración de la lista de arriba:
 *   N. [casilla del grupo] «Fase» · 12 nuevas · 9 se van · ⚠ 2 quedan fuera  ▸
 * y adentro, plegadas, las tareas una por una: «+ S3 · título» (se crea) o «− S1 · título» (se quita),
 * con su casilla chica.
 *
 *   · La casilla del grupo marca o desmarca de una vez las que se pueden marcar (`onMarcarVarios`); si
 *     hay algunas sí y otras no, queda a medias (indeterminada).
 *   · Las tareas de una fase NUEVA que desmarcaste quedan fuera CON ella: no se marcan solas, vuelven
 *     cuando la marcas («Va con el cambio N»).
 *   · E2c P3: las de una fase cuyo cambio desmarcaste (sus semanas, su nombre, sus sesiones) quedaron
 *     armadas para otra forma: la fase está DESFASADA y sus tareas se recalculan solas. Mientras tanto
 *     se ven marcadas (`enEspera`) y se pueden desmarcar, y el grupo dice en qué está el recálculo
 *     («recalculando…», «no se pudieron recalcular», «sigue después», «falta recalcularlas»). Revisión
 *     de E2c: solo con dos o más fases desfasadas; con una, lo dice la línea del recálculo (no dos veces).
 *   · Lo que choca con algo que editaste a mano lleva su ⚠ y no se puede marcar; lo que ya está así va
 *     tachado.
 *   · E3 P3: una tarea que ya existe y CAMBIA (renombre, semana, dueño o tipo) va con «~», y una que se
 *     MUDA a esta fase, con «→» en el grupo de su destino; en los dos, qué le cambia («pasa a «Pruebas»,
 *     S3», «renombrada a «Y»»), en gris.
 *
 * Solo pinta: los grupos, los estados y los avisos salen de `resumir` (lib/timeline/borrador.ts).
 * Tokens del tema SIEMPRE (success = lo que se crea, warn = lo que se quita o choca, info = lo que cambia
 * o llega).
 */
import { cn } from "@/lib/cn";
import { plural } from "@/lib/timeline/weeks";
import type { GrupoDeTareas, ItemDeTarea } from "@/lib/timeline/borrador";
import { textoDelGrupoDesfasado, type RecalculoEnPantalla } from "@/lib/timeline/recalculo-de-tareas";

/** Lo que dice el grupo después del nombre: cuántas se crean, cuántas se quitan y (E3) cuántas cambian. */
function cuentaDelGrupo(g: GrupoDeTareas): string {
  const partes: string[] = [];
  if (g.nuevas > 0) partes.push(plural(g.nuevas, "nueva", "nuevas"));
  if (g.seVan > 0) partes.push(`${g.seVan} ${g.seVan === 1 ? "se va" : "se van"}`);
  if (g.cambian > 0) partes.push(`${g.cambian} ${g.cambian === 1 ? "cambia" : "cambian"}`);
  return partes.length > 0 ? partes.join(" · ") : "ya está así";
}

/** El color del signo: se crea (success), se quita (warn), cambia o llega (info). */
const COLOR_DEL_SIGNO: Record<ItemDeTarea["signo"], string> = {
  "+": "text-success-ink",
  "−": "text-warn-ink",
  "~": "text-info-ink",
  "→": "text-info-ink",
};

/** Lo que dice la casilla de una tarea al lector de pantalla. */
const ACCION_DEL_SIGNO: Record<ItemDeTarea["signo"], string> = {
  "+": "Crear",
  "−": "Quitar",
  "~": "Cambiar",
  "→": "Traer",
};

function tituloDeLaFuga(f: NonNullable<ItemDeTarea["fuga"]>): string {
  const nota = f.motivoDeLaNota ? ` La nota también ${f.motivoDeLaNota}.` : "";
  return (
    `El cliente lee el título y la nota: ${f.campo === "titulo" ? "el título" : "la nota"} ${f.motivo}.${nota} ` +
    "Después de aplicar, corrígela en el Gantt."
  );
}

function RenglonDeTarea({
  t,
  onMarcar,
  trabajando,
}: {
  t: ItemDeTarea;
  onMarcar: (clave: string, incluir: boolean) => void;
  trabajando: boolean;
}) {
  const seAplica = t.estado === "aplica";
  // E2c: en espera de recalcularse se ve marcada (su estado es «excluido» hasta que lleguen las nuevas).
  const seVeMarcada = seAplica || !!t.enEspera;
  return (
    <li className="flex items-start gap-1.5">
      <input
        type="checkbox"
        className="mt-0.5 h-3 w-3 flex-shrink-0 accent-brand"
        checked={seAplica || !!t.enEspera}
        disabled={trabajando || !t.seMarca}
        onChange={(e) => onMarcar(t.clave, e.target.checked)}
        aria-label={`${ACCION_DEL_SIGNO[t.signo]} la tarea «${t.titulo}»`}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span
            className={cn(
              "break-words",
              seVeMarcada ? "text-fg" : "text-fg-muted",
              t.estado === "ya-esta" && "line-through",
            )}
          >
            <span className={cn("font-semibold", COLOR_DEL_SIGNO[t.signo])}>{t.signo}</span>{" "}
            S{t.semana} · {t.titulo}
          </span>
          {/* E3: qué le cambia a una que ya existe («pasa a «Pruebas», S3», «renombrada a «Y»»). */}
          {t.cambio && <span className="text-fg-muted">{t.cambio}</span>}
          {t.porValidar && (
            <span className="rounded border border-line bg-surface-muted px-1 py-px text-[10px] text-fg-muted" title={t.porValidar}>
              por validar
            </span>
          )}
          {t.fuga && (
            <span
              className="rounded border border-warn-line bg-warn-surface px-1 py-px text-[10px] font-semibold text-warn-ink"
              title={tituloDeLaFuga(t.fuga)}
            >
              revisa el texto
            </span>
          )}
          {t.repetida && (
            <span
              className={cn(
                "rounded border px-1 py-px text-[10px] font-semibold",
                t.repetida.yaAvanzada ? "border-warn-line bg-warn-surface text-warn-ink" : "border-line bg-surface-muted text-fg-muted",
              )}
              title={
                t.repetida.yaAvanzada
                  ? `Esta tarea ya existe en «${t.repetida.fase}» y allá está ${t.repetida.status === "DONE" ? "HECHA" : "en curso"}: si la creas, el avance del proyecto la cuenta dos veces.`
                  : `Esta tarea ya existe en «${t.repetida.fase}», también pendiente.`
              }
            >
              ya existe en «{t.repetida.fase}»
            </span>
          )}
        </p>
        {t.aviso && <p className={t.estado === "choque" ? "text-warn-ink" : "text-fg-muted"}>{t.aviso}</p>}
      </div>
    </li>
  );
}

function GrupoDeLaLista({
  g,
  onMarcar,
  onMarcarVarios,
  trabajando,
  recalculo,
  desfasadas,
}: {
  g: GrupoDeTareas;
  onMarcar: (clave: string, incluir: boolean) => void;
  onMarcarVarios: (claves: readonly string[], incluir: boolean) => void;
  trabajando: boolean;
  recalculo: RecalculoEnPantalla | null;
  /** Cuántas fases desfasadas hay en la lista (con una sola, el grupo no repite la línea). */
  desfasadas: number;
}) {
  // La casilla del grupo cuenta solo las que se pueden marcar: un choque o una heredada no se tocan.
  // E2c: una en espera de recalcularse cuenta como marcada (así se ve).
  const marcables = g.tareas.filter((t) => t.seMarca);
  const marcadas = marcables.filter((t) => t.estado === "aplica" || t.enEspera).length;
  const todas = marcables.length > 0 && marcadas === marcables.length;
  const aMedias = marcadas > 0 && marcadas < marcables.length;
  const heredado = g.dependeDe !== null;
  const avisoEsChoque = !!g.aviso && g.aviso.startsWith("⚠");
  const desfase = g.desfasada ? textoDelGrupoDesfasado(g.fase, recalculo, desfasadas) : null;
  // El nombre no se apaga en una desfasada: sus tareas siguen marcadas, esperando.
  const apagado = (g.estado === "excluido" || g.estado === "choque") && !g.desfasada;
  return (
    <li className="flex items-start gap-2">
      <span className="w-6 flex-shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-fg-muted">{g.numero}.</span>
      <input
        type="checkbox"
        className="mt-0.5 flex-shrink-0 accent-brand"
        checked={todas}
        ref={(el) => {
          if (el) el.indeterminate = aMedias;
        }}
        disabled={trabajando || marcables.length === 0}
        onChange={(e) =>
          onMarcarVarios(
            marcables.map((t) => t.clave),
            e.target.checked,
          )
        }
        title={heredado ? `Va con el cambio ${g.dependeDe}` : undefined}
        aria-label={`Incluir las tareas de «${g.nombre}» (cambio ${g.numero})`}
      />
      <details className="min-w-0 flex-1 text-xs">
        <summary className="cursor-pointer">
          <span className={cn("font-semibold", apagado ? "text-fg-muted" : "text-fg")}>
            Tareas de «{g.nombre}»
          </span>
          <span className="text-fg-secondary"> · {cuentaDelGrupo(g)}</span>
          {g.aviso && (
            <span className={avisoEsChoque ? "text-warn-ink" : "text-fg-muted"}> · {g.aviso}</span>
          )}
          {/* E2c: en qué está el recálculo de ESTA fase. Info con el spinner mientras corre; warn si falta o falló. */}
          {desfase && (
            <span className={desfase.enCurso ? "text-info-ink" : "text-warn-ink"}>
              {" · "}
              {desfase.enCurso && (
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-info-line border-t-info-ink align-middle"
                />
              )}
              {desfase.texto}
            </span>
          )}
        </summary>
        <ul className="mt-1 space-y-1 rounded border border-line bg-surface px-2 py-1.5">
          {g.tareas.map((t) => (
            <RenglonDeTarea key={t.clave} t={t} onMarcar={onMarcar} trabajando={trabajando} />
          ))}
        </ul>
      </details>
    </li>
  );
}

export default function TareasDeLaPropuesta({
  grupos,
  onMarcar,
  onMarcarVarios,
  trabajando,
  recalculo = null,
}: {
  grupos: readonly GrupoDeTareas[];
  onMarcar: (clave: string, incluir: boolean) => void;
  onMarcarVarios: (claves: readonly string[], incluir: boolean) => void;
  /** Aplicando o descartando: las casillas se apagan hasta que termine. Mientras se recalcula, no:
   *  el CSE siempre puede desmarcar las tareas en espera (E2c). */
  trabajando: boolean;
  /** E2c: en qué está el recálculo de las fases desfasadas (lo dice cada grupo desfasado). */
  recalculo?: RecalculoEnPantalla | null;
}) {
  if (grupos.length === 0) return null;
  const desfasadas = grupos.filter((g) => g.desfasada).length;
  return (
    <ol aria-label="Tareas propuestas" className="max-h-80 overflow-y-auto space-y-1.5 border-t border-line pt-1.5 pr-1">
      {grupos.map((g) => (
        <GrupoDeLaLista
          key={g.fase}
          g={g}
          onMarcar={onMarcar}
          onMarcarVarios={onMarcarVarios}
          trabajando={trabajando}
          recalculo={recalculo}
          desfasadas={desfasadas}
        />
      ))}
    </ol>
  );
}

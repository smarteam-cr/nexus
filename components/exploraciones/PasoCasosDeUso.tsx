"use client";

/**
 * PasoCasosDeUso — los casos de uso de la primera propuesta.
 *
 * Pedido de Elías (2026-10-01): «la parte de propuestas, yo le pondría casos de uso; y ahí debería
 * arrancar un agente, en modo experimental, que proponga casos de uso sin la biblioteca, porque en
 * este momento está vacía». La PRIMERA vez que se abre el paso, el agente propone solo; después, otra
 * tanda con un botón (cada tanda cuesta unos centavos). El vendedor usa o descarta cada uno; lo
 * descartado no vuelve. Desde el 2026-10-07, solo con base en la escala (`laEscalaTieneBase`): sin un
 * nivel, no habría sobre qué apoyarlos.
 *
 * Desde el 2026-10-12 el agente parte del catálogo de Smarteam (lib/casos-de-uso, ids `cat-…`) y la lista «Del catálogo
 * de Smarteam» muestra los casos que tocan las áreas en juego, con un enlace a su ficha.
 *
 * Los casos de uso del agente entran a la propuesta como contexto; la sección de casos de uso con
 * precio sale solo del catálogo, como siempre. Armar la propuesta es su propia pieza desde el
 * 2026-10-01 (PasoPropuesta.tsx).
 *
 * Desde el 2026-11-08 (pedido de Elías con Centauro Solutions; lib/casos-de-uso/armado.ts) aquí se PERSONALIZA la
 * propuesta: cada caso se arma con actividades de la biblioteca (el agente las propone; un caso del catálogo elegido a
 * mano trae las de su ficha), se quitan y se ponen actividades, y cada caso dice sus horas, su precio mínimo (horas ×
 * tarifa del segmento) y, para el vendedor, cómo subir el ticket vendiendo por valor.
 *
 * Desde la tercera vuelta del 2026-11-08 (lib/casos-de-uso/personalizar.ts): al ACEPTAR un sugerido, el agente
 * personaliza sus actividades para la empresa y la fila dice qué cambió frente a la ficha; «REVISAR» vuelve a mirar todo
 * con lo que se sabe hoy y dice qué cambió, sin tocar lo elegido. Nada corre solo al entrar. Quitar un elegido lo devuelve
 * a los sugeridos.
 *
 * Desde la décima vuelta del 2026-11-08 (Elías con Centauro; lib/casos-de-uso/orden.ts y mejorar.ts):
 *   - UNA sola lista, un caso por fila: los elegidos, los que sugiere el agente y los de la biblioteca que sugiere la
 *     escala, en el orden que propone el agente con todo lo que se sabe de la empresa. Una etiqueta dice de dónde viene
 *     cada uno (ya no hay grillas separadas ni «Usadas hoy» aparte: el elegido dice en su fila cuándo se aceptó). Cada
 *     fila usa el ancho: a la izquierda el título y los porqués, a la derecha el precio, lo que mueve y las acciones.
 *   - Las actividades de un caso, por etapa, con quién la hace, las veces, las horas y cómo se reparten (con el cliente /
 *     internas); el ⓘ abre qué se hace, qué incluye y de qué está hecho su tiempo.
 *   - «Mejorar con IA»: el CSE escribe una instrucción y el agente propone cómo quedan las actividades y lo que conviene
 *     sumar aparte; se revisa en `<AgentProposal>` y se aplica (con «Deshacer») o se descarta.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useUndo } from "@/components/ui/UndoProvider";
import {
  actividadesDelElegido,
  cambiarVeces,
  cambiosRespectoDeLaFicha,
  enOrdenDelPlan,
  horasDeLaActividad,
  horasDeLaVenta,
  horasDelCaso,
  lineaDeCambios,
  palancaEnPalabras,
  precioMinimo,
  quitarActividad,
  repartoDeLaActividad,
  repartoDelCaso,
  sumarActividad,
  type ActividadDelCaso,
  type ActividadLigera,
  type TarifaDeLaEmpresa,
  type ValorDeVenta,
} from "@/lib/casos-de-uso/armado";
import { ETAPAS_DE_ACTIVIDAD, formatoHoras, formatoUsd, nombreVisible, sobreQueAparte } from "@/lib/casos-de-uso/actividades-puras";
import { enElOrden, type CasoEnElOrden } from "@/lib/casos-de-uso/orden";
import { aplicarMejora, diferenciaDeActividades, MAX_LARGO_DE_LA_INSTRUCCION, resumenDeLaMejora, type PropuestaDeMejora } from "@/lib/casos-de-uso/mejorar";
import Link from "next/link";
import { AgentProposal } from "@/components/ai/AgentProposal";
import { Alert, Badge, IconButton, Select, Selector, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useMe } from "@/hooks/useMe";
import { esCasoLibre, laEscalaTieneBase, sePuedeDeshacer, type CasoDeUsoElegido, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import { casosPorLaEscala, type CasoPorLaEscala } from "@/lib/exploraciones/casos-de-uso";
import {
  nadaCambio,
  novedadesEnUnaFrase,
  revisionEnUnaFrase,
  sePersonalizaAlAceptar,
  vuelveASugeridos,
  type CambioDeLaRevision,
  type NovedadesDeLosCasos,
} from "@/lib/casos-de-uso/personalizar";
import { useLienzo } from "./contexto";
import FranjaDeSugerencias, { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "./FranjaDeSugerencias";
import { useCorrida } from "./useCorrida";
import { BotonUsarTodas } from "./Propuestas";

interface Caso {
  id: string;
  titulo: string;
  descripcion: string;
  precio: string | null;
  /** Solo los del catálogo de Smarteam: sus áreas y las dimensiones que mueve. */
  areas?: string[];
  dimensiones?: string[];
}
interface DatosDelPaso {
  catalogo: Caso[];
  /** Lo que llegó desde la última vez que el agente miró los casos (lib/exploraciones/novedades-de-los-casos.ts). */
  novedades: NovedadesDeLosCasos | null;
}

/** Lo que llega con el paso para contar horas y precio (lib/casos-de-uso/armado-server.ts). */
interface Armado {
  biblioteca: ActividadLigera[];
  porId: ReadonlyMap<string, ActividadLigera>;
  /** Por el id del catálogo, sin `cat-`. */
  porDefecto: Record<string, ActividadDelCaso[]>;
  tarifa: TarifaDeLaEmpresa;
}
const ArmadoContexto = createContext<Armado | null>(null);

/** Las actividades de un caso de la preventa: las suyas o, si es del catálogo y no tiene, las de su ficha. */
function actividadesDe(id: string, caso: CasoDeUsoElegido, armado: Armado | null): ActividadDelCaso[] {
  return actividadesDelElegido(caso, id.startsWith("cat-") ? armado?.porDefecto[id.slice(4)] : undefined);
}

/** «CSE (Dev si enseña…)» → «CSE»: en la columna, lo corto; lo largo va en el ⓘ. */
const quienCorto = (quien: string) => quien.split(" (")[0];

/** «9 h con el cliente · 16 h internas», o la mitad que tenga. */
function repartoEnPalabras(r: { conElCliente: number; internas: number }): string {
  const partes = [r.conElCliente > 0 ? `${formatoHoras(r.conElCliente)} con el cliente` : "", r.internas > 0 ? `${formatoHoras(r.internas)} ${r.internas === 1 ? "interna" : "internas"}` : ""];
  return partes.filter(Boolean).join(" · ");
}

/**
 * El precio del caso en la columna de la derecha: desde cuánto, las horas, cuántas actividades y cómo se reparten. Lo que
 * falta (Dev o Diseño, o que ninguna actividad calza) va debajo. `conLaFicha`: un sugerido sin personalizar, cuyo precio
 * sale de la ficha del catálogo (al aceptarlo, el agente lo ajusta a la empresa).
 */
function PrecioDelCaso({ id, caso, conLaFicha = false }: { id: string; caso: CasoDeUsoElegido; conLaFicha?: boolean }) {
  const armado = useContext(ArmadoContexto);
  if (!armado) return null;
  const acts = actividadesDe(id, caso, armado);
  if (!acts.length)
    return (
      <p className="text-xs leading-normal text-fg-muted">
        {caso.sinActividad ?? (conLaFicha ? "Sin ficha en el catálogo: el precio sale al aceptarlo, cuando el agente arme sus actividades." : "Sin actividades de la biblioteca: todavía sin precio.")}
      </p>
    );
  const { horas, sinTiempo } = horasDelCaso(acts, armado.porId);
  const reparto = repartoEnPalabras(repartoDelCaso(acts, armado.porId));
  return (
    <div className="space-y-0.5">
      {conLaFicha && <p className="text-[11px] text-fg-muted">Con la ficha del catálogo</p>}
      <p className="text-base font-semibold tabular-nums text-fg">desde {formatoUsd(precioMinimo(horas, armado.tarifa))}</p>
      <p className="text-xs tabular-nums text-fg-secondary">
        {formatoHoras(horas)} · {acts.length} {acts.length === 1 ? "actividad" : "actividades"}
      </p>
      {reparto && <p className="text-[11px] tabular-nums text-fg-muted">{reparto}</p>}
      {sinTiempo.length > 0 && <p className="text-[11px] text-fg-muted">+ lo que defina {sinTiempo.join(" y ")}</p>}
    </div>
  );
}

/**
 * Cómo subir el ticket: lo ve solo el vendedor (nunca llega a la propuesta del cliente). Desde el 2026-11-08 (Elías con
 * Centauro: «costo de la mala calidad» no se entendía) en palabras simples: de dónde sale el valor, la idea, lo que ya
 * sabemos y las anclas (los datos) que faltan por averiguar con el cliente.
 */
function ValorDelCaso({ valor }: { valor: ValorDeVenta }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-[13px] leading-normal text-fg-secondary">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
        Cómo subir el ticket <span className="font-normal normal-case tracking-normal">(solo lo ves tú)</span>
      </p>
      {valor.palanca && (
        <p className="text-xs">
          <span className="font-medium text-fg">De dónde sale el valor:</span> {palancaEnPalabras(valor.palanca)}.
        </p>
      )}
      <p>{valor.argumento}</p>
      {valor.numeros.length > 0 && (
        <div className="text-xs">
          <p className="font-medium text-fg">Lo que ya sabemos</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {valor.numeros.map((n, i) => (
              <li key={i}>
                {n.dato}
                {n.fuente && <span className="text-fg-muted"> · {n.fuente}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {valor.falta.length > 0 && (
        <div className="text-xs">
          <p className="font-medium text-fg">Anclas por averiguar con el cliente</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {valor.falta.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Cómo se arma un caso elegido (2026-11-08, Elías con Centauro: «Ventas tiene que entender qué actividades sí y cuáles
 * no»): cómo se armó y, en uno del catálogo, qué cambió frente a su ficha (eso lo calcula la pantalla, así que sigue los
 * cambios a mano). El porqué y el lugar en la lista van arriba, en la fila.
 */
function ComoSeArma({ id, caso }: { id: string; caso: CasoDeUsoElegido }) {
  const armado = useContext(ArmadoContexto);
  const comoSeArma = caso.paraVentas?.comoSeArma ?? "";
  const ficha = id.startsWith("cat-") ? armado?.porDefecto[id.slice(4)] : undefined;
  const cambios = armado ? cambiosRespectoDeLaFicha(actividadesDe(id, caso, armado), ficha, (a) => armado.porId.get(a)?.nombre) : null;
  /* Personalizado y sin tocar a mano, el resumen del agente (`LoPersonalizado`) ya dice qué cambió frente a la ficha: la
     línea calculada sería la misma dos veces. Si lo cambiaron a mano, la calculada es la de hoy. */
  const frente = cambios && (!caso.personalizado || caso.aMano) ? lineaDeCambios(cambios) : "";
  if (!comoSeArma && !frente) return null;
  return (
    <div className="space-y-0.5 rounded-lg bg-surface-muted px-3 py-2 text-xs leading-normal text-fg-secondary">
      {comoSeArma && (
        <p>
          {/* Lo escribió el agente: si después cambiaste las actividades a mano, la línea de abajo es la de hoy. */}
          <span className="font-medium text-fg">{caso.aMano ? "Cómo lo armó el agente (antes de tus cambios):" : "Cómo se arma:"}</span> {comoSeArma}
        </p>
      )}
      {frente && <p className="text-fg-muted">{frente}</p>}
    </div>
  );
}

/** El ⓘ abierto de una actividad: qué se hace, qué incluye, quién la hace y de qué está hecho su tiempo. */
function DetalleDeLaActividad({ a, lib }: { a: ActividadDelCaso; lib: ActividadLigera }) {
  const reparto = repartoDeLaActividad(a, lib);
  return (
    <div className="space-y-1.5 rounded-md bg-surface-muted px-3 py-2 text-xs leading-normal text-fg-secondary">
      <p className="text-fg">{lib.resumen}</p>
      {lib.incluye && lib.incluye.length > 0 && (
        <div>
          <p className="font-medium text-fg">Incluye</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {lib.incluye.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <p>
        <span className="font-medium text-fg">Quién la hace:</span> {lib.quien}
      </p>
      {lib.horasPendientes ? (
        <p>
          <span className="font-medium text-fg">Su tiempo:</span> lo define {quienCorto(lib.quien)} al ver el alcance.
        </p>
      ) : (
        reparto.partes.length > 0 && (
          <div>
            <p className="font-medium text-fg">
              Su tiempo en este caso{a.veces > 1 ? ` (${a.veces} veces)` : ""}: {formatoHoras(reparto.conElCliente + reparto.internas)}
            </p>
            <ul className="space-y-0.5">
              {reparto.partes.map((p) => (
                <li key={p.nombre} className="flex gap-2">
                  <span className="w-12 flex-shrink-0 text-right tabular-nums">{formatoHoras(p.horas)}</span>
                  <span className="min-w-0 flex-1">
                    {p.nombre} <span className="text-fg-muted">· {p.conElCliente ? "con el cliente" : "interna"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

/**
 * La lista de actividades de un caso (décima vuelta: legible de un vistazo). Por etapa, cada una con quién la hace, las
 * veces, sus horas y cómo se reparten; el ⓘ abre su detalle debajo. Editable en un caso elegido: quitar, poner de la
 * biblioteca y cambiar las veces. Abajo, el total con su reparto.
 */
function ActividadesDelCaso({ id, caso, editable }: { id: string; caso: CasoDeUsoElegido; editable: boolean }) {
  const armado = useContext(ArmadoContexto);
  const { exp, cambiar, guardando } = useLienzo();
  const { pushUndo } = useUndo();
  const [detalle, setDetalle] = useState<number | null>(null);
  if (!armado) return null;
  const acts = actividadesDe(id, caso, armado);
  /* Cada cambio se puede deshacer (el aviso y Ctrl+Z): vuelve el caso como estaba. Si es del catálogo y no tenía
     actividades propias, deshacer lo devuelve a las de su ficha. */
  const guardar = (nuevo: CasoDeUsoElegido, que: string) => {
    if (nuevo === caso) return;
    // Solo si se guardó: si chocó con otro cambio, Ctrl+Z pisaría lo de la otra persona con esta versión vieja.
    void cambiar([{ op: "casoDeUso", useCaseId: id, valor: nuevo }]).then((ok) => {
      if (ok) pushUndo({ scope: `exploracion:${exp.id}`, label: que, undo: () => void cambiar([{ op: "casoDeUso", useCaseId: id, valor: caso }]) });
    });
  };
  const yaEstan = new Set(acts.map((a) => a.actividadId));
  const filas = acts.map((a, i) => ({ a, i, lib: armado.porId.get(a.actividadId) }));
  // Por etapa, en el orden del proyecto; lo que ya no está en la biblioteca, al final.
  const grupos = [
    ...ETAPAS_DE_ACTIVIDAD.map((e) => ({ clave: e.clave, nombre: e.nombre, filas: filas.filter((f) => f.lib?.etapa === e.clave) })),
    { clave: "fuera", nombre: "Ya no están en la biblioteca", filas: filas.filter((f) => !f.lib) },
  ].filter((g) => g.filas.length > 0);
  const { horas } = horasDelCaso(acts, armado.porId);
  const reparto = repartoEnPalabras(repartoDelCaso(acts, armado.porId));
  const columnas = cn("grid items-center gap-x-3", editable ? "grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto]", "sm:grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_6rem]", editable && "sm:grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_6rem_1.75rem]");
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-line">
        <div className={cn(columnas, "border-b border-line bg-surface-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted")}>
          <span>Actividad</span>
          <span className="hidden sm:block">Quién</span>
          <span className={cn("text-center", !editable && "hidden sm:block")}>Veces</span>
          <span className="text-right">Horas</span>
          {editable && <span className="hidden sm:block" />}
        </div>
        {grupos.map((g) => (
          <div key={g.clave}>
            <p className="border-b border-line bg-surface px-3 pb-1 pt-2 text-[11px] font-semibold text-fg-muted">{g.nombre}</p>
            <ul className="divide-y divide-line">
              {g.filas.map(({ a, i, lib }) => {
                const nombre = nombreVisible(a, lib?.nombre);
                const sobre = a.sobreQue ? sobreQueAparte({ nombre, sobreQue: a.sobreQue }) : "";
                const rep = lib ? repartoDeLaActividad(a, lib) : null;
                const abierto = detalle === i;
                return (
                  <li key={`${a.actividadId}-${a.sobreQue ?? ""}-${i}`} className="px-3 py-2">
                    <div className={columnas}>
                      <div className="min-w-0">
                        <p className="flex items-start gap-1.5 text-[13px] leading-snug text-fg">
                          <span className="min-w-0">
                            {nombre}
                            {sobre && <span className="text-fg-muted"> · {sobre}</span>}
                          </span>
                          {lib && (
                            <button
                              type="button"
                              aria-expanded={abierto}
                              aria-label={abierto ? `Cerrar el detalle de «${nombre}»` : `Qué se hace en «${nombre}»`}
                              title={abierto ? "Cerrar el detalle" : lib.resumen}
                              onClick={() => setDetalle(abierto ? null : i)}
                              className={cn(
                                "mt-[1px] inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold leading-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-brand",
                                abierto ? "border-brand bg-brand text-primary-fg" : "border-line text-fg-muted hover:border-brand hover:text-brand",
                              )}
                            >
                              i
                            </button>
                          )}
                        </p>
                        {/* La actividad de la biblioteca detrás del nombre del caso: de ahí sale el tiempo. */}
                        {lib && lib.nombre !== nombre && <p className="text-[11px] text-fg-muted">De la biblioteca: {lib.nombre}</p>}
                        {!lib && <p className="text-[11px] text-danger-ink">Ya no está en la biblioteca: sin horas.</p>}
                        {lib && <p className="text-[11px] text-fg-muted sm:hidden">{quienCorto(lib.quien)}</p>}
                      </div>
                      <span className="hidden truncate text-xs text-fg-secondary sm:block" title={lib?.quien}>
                        {lib ? quienCorto(lib.quien) : "—"}
                      </span>
                      {editable && lib?.seRepite ? (
                        <span className="flex items-center justify-center gap-0.5">
                          <IconButton
                            size="xs"
                            variant="subtle"
                            aria-label={`Una vez menos «${nombre}»`}
                            icon={<span aria-hidden="true">−</span>}
                            disabled={guardando || a.veces <= 1}
                            onClick={() => guardar(cambiarVeces(caso, acts, i, a.veces - 1), `Bajaste «${nombre}» a ${a.veces - 1}`)}
                          />
                          <span className="w-6 text-center text-xs tabular-nums text-fg">{a.veces}×</span>
                          <IconButton
                            size="xs"
                            variant="subtle"
                            aria-label={`Una vez más «${nombre}»`}
                            icon={<span aria-hidden="true">+</span>}
                            disabled={guardando}
                            onClick={() => guardar(cambiarVeces(caso, acts, i, a.veces + 1), `Subiste «${nombre}» a ${a.veces + 1}`)}
                          />
                        </span>
                      ) : (
                        <span className={cn("text-center text-xs tabular-nums text-fg-secondary", !editable && "hidden sm:block")}>{a.veces > 1 ? `${a.veces}×` : "1"}</span>
                      )}
                      <span className="text-right">
                        <span className="block text-[13px] tabular-nums text-fg">
                          {lib ? (lib.horasPendientes ? `Lo define ${quienCorto(lib.quien)}` : formatoHoras(horasDeLaActividad(a, lib))) : "—"}
                        </span>
                        {rep && rep.conElCliente > 0 && rep.internas > 0 && (
                          <span className="block text-[11px] tabular-nums text-fg-muted">
                            {formatoHoras(rep.conElCliente).replace(" h", "")} cliente · {formatoHoras(rep.internas).replace(" h", "")} int.
                          </span>
                        )}
                        {rep && (rep.conElCliente > 0) !== (rep.internas > 0) && (
                          <span className="block text-[11px] text-fg-muted">{rep.conElCliente > 0 ? "con el cliente" : "interna"}</span>
                        )}
                      </span>
                      {editable && (
                        <span className="hidden justify-end sm:flex">
                          <IconButton
                            size="xs"
                            aria-label={`Quitar «${nombre}»`}
                            title="Quitar la actividad"
                            icon={<span aria-hidden="true">×</span>}
                            disabled={guardando}
                            onClick={() => guardar(quitarActividad(caso, acts, i), `Quitaste «${nombre}» de «${caso.titulo}»`)}
                          />
                        </span>
                      )}
                    </div>
                    {editable && (
                      // En el teléfono, «Quitar» va debajo: la fila no da para una quinta columna.
                      <BotonTexto className="mt-0.5 -ml-1.5 sm:hidden" disabled={guardando} onClick={() => guardar(quitarActividad(caso, acts, i), `Quitaste «${nombre}» de «${caso.titulo}»`)}>
                        Quitar
                      </BotonTexto>
                    )}
                    {abierto && lib && (
                      <div className="mt-2">
                        <DetalleDeLaActividad a={a} lib={lib} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {acts.length === 0 && <p className="px-3 py-2 text-xs text-fg-muted">Sin actividades.</p>}
        {acts.length > 0 && (
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line bg-surface-muted px-3 py-1.5 text-xs text-fg-secondary">
            <span>
              Total · {acts.length} {acts.length === 1 ? "actividad" : "actividades"}
            </span>
            <span className="tabular-nums">
              <span className="font-semibold text-fg">{formatoHoras(horas)}</span>
              {reparto && <span className="text-fg-muted"> · {reparto}</span>}
            </span>
          </p>
        )}
      </div>
      {caso.sinActividad && acts.length > 0 && <p className="text-xs text-warning-fg">Falta en la biblioteca: {caso.sinActividad}</p>}
      {editable && (
        /* El select de Nexus, con buscador: la biblioteca es larga y el nativo no se podía buscar. Lo que ya está sin
           «sobre qué» y no se repite se ve, pero no se elige: sumarla no cambiaba nada (la misma regla de `sumarActividad`). */
        <Selector
          etiqueta={`Agregar una actividad a «${caso.titulo}»`}
          placeholder="Agregar una actividad de la biblioteca…"
          placeholderBusqueda="Buscar actividad o etapa…"
          disabled={guardando}
          opciones={ETAPAS_DE_ACTIVIDAD.flatMap((e) =>
            armado.biblioteca
              .filter((x) => x.etapa === e.clave)
              .map((x) => ({
                value: x.id,
                label: x.nombre,
                grupo: e.nombre,
                marca: yaEstan.has(x.id) ? (x.seRepite ? "una vez más" : "ya está") : undefined,
                deshabilitada: !x.seRepite && acts.some((a) => a.actividadId === x.id && !(a.sobreQue ?? "").trim()),
              })),
          )}
          onElegir={(value) => {
            const lib = armado.porId.get(value);
            if (lib) guardar(sumarActividad(caso, acts, lib), `Agregaste «${lib.nombre}» a «${caso.titulo}»`);
          }}
        />
      )}
    </div>
  );
}

/**
 * «Mejorar con IA» de las actividades de un caso elegido (décima vuelta, lib/casos-de-uso/mejorar.ts): el CSE escribe
 * una instrucción, el agente propone cómo queda la lista y lo que conviene sumar aparte, y el CSE lo revisa en
 * `<AgentProposal>`: aplica (con «Deshacer») o descarta. Nada se guarda hasta aplicar.
 */
function MejorarConIA({ id, caso }: { id: string; caso: CasoDeUsoElegido }) {
  const armado = useContext(ArmadoContexto);
  const { exp, cambiar, guardando } = useLienzo();
  const { pushUndo } = useUndo();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [instruccion, setInstruccion] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<{ p: PropuestaDeMejora; base: ActividadDelCaso[]; instruccion: string } | null>(null);
  const [elegidas, setElegidas] = useState<ReadonlySet<number>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  if (!armado) return null;
  const acts = actividadesDe(id, caso, armado);

  const pedir = async () => {
    const texto = instruccion.trim();
    if (texto.length < 3 || pidiendo) return;
    setPidiendo(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/casos/mejorar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCaseId: id, instruccion: texto }),
      });
      const data = (await res.json().catch(() => ({}))) as { propuesta?: PropuestaDeMejora; error?: string };
      if (!res.ok || !data.propuesta) {
        setError(data.error ?? "No se pudo pedir la mejora.");
        return;
      }
      setPropuesta({ p: data.propuesta, base: acts, instruccion: texto });
      setElegidas(new Set());
    } catch {
      setError("No se pudo pedir la mejora. Revisa tu conexión.");
    } finally {
      setPidiendo(false);
    }
  };
  const cerrar = () => {
    setPropuesta(null);
    setAbierto(false);
    setInstruccion("");
    setError(null);
  };
  const aplicar = async () => {
    if (!propuesta) return;
    setAplicando(true);
    try {
      const nuevo = aplicarMejora(caso, propuesta.p, elegidas, armado.porId);
      const ok = await cambiar([{ op: "casoDeUso", useCaseId: id, valor: nuevo }]);
      if (!ok) return;
      pushUndo({ scope: `exploracion:${exp.id}`, label: `Aplicaste la mejora a «${caso.titulo}»`, undo: () => void cambiar([{ op: "casoDeUso", useCaseId: id, valor: caso }]) });
      toast.success(`Las actividades de «${caso.titulo}» quedaron con la mejora.`);
      cerrar();
    } finally {
      setAplicando(false);
    }
  };

  if (!abierto)
    return (
      <BotonBlanco className="inline-flex items-center gap-1.5" disabled={guardando} onClick={() => setAbierto(true)}>
        <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />
        Mejorar con IA
      </BotonBlanco>
    );

  if (propuesta) {
    const filas = diferenciaDeActividades(propuesta.base, propuesta.p.actividades);
    const r = resumenDeLaMejora(filas);
    const cambian = filas.filter((f) => f.estado !== "igual");
    const iguales = filas.filter((f) => f.estado === "igual");
    const antes = horasDelCaso(propuesta.base, armado.porId).horas;
    const despues = horasDelCaso(aplicarMejora(caso, propuesta.p, elegidas, armado.porId).actividades ?? [], armado.porId).horas;
    const cambioMientras = JSON.stringify(propuesta.base) !== JSON.stringify(acts);
    const nombreDe = (a: ActividadDelCaso) => nombreVisible(a, armado.porId.get(a.actividadId)?.nombre);
    const horasDe = (a: ActividadDelCaso) => {
      const lib = armado.porId.get(a.actividadId);
      return lib && !lib.horasPendientes ? formatoHoras(horasDeLaActividad(a, lib)) : "";
    };
    return (
      <AgentProposal
        title="Propuesta para las actividades"
        subtitle={`Tu instrucción: «${propuesta.instruccion}»`}
        summary={[
          r.nuevas ? `${r.nuevas} ${r.nuevas === 1 ? "entra" : "entran"}` : "",
          r.quitadas ? `${r.quitadas} ${r.quitadas === 1 ? "sale" : "salen"}` : "",
          r.cambiadas ? `${r.cambiadas} ${r.cambiadas === 1 ? "cambia" : "cambian"}` : "",
          antes !== despues ? `${formatoHoras(antes)} → ${formatoHoras(despues)} (desde ${formatoUsd(precioMinimo(despues, armado.tarifa))})` : "mismas horas",
        ].filter(Boolean)}
        reasoning={propuesta.p.cambios.join(" ")}
        warnings={cambioMientras ? ["Las actividades cambiaron mientras el agente trabajaba: al aplicar, quedan las de esta propuesta."] : undefined}
        applyLabel="Aplicar"
        discardLabel="Descartar"
        applying={aplicando || guardando}
        onApply={aplicar}
        onDiscard={cerrar}
      >
        <div className="space-y-3 text-xs">
          {cambian.length === 0 ? (
            <p className="text-fg-secondary">La lista queda igual{propuesta.p.sugeridas.length ? ": lo que propone está en las sugeridas de abajo." : "."}</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {cambian.map((f, i) => (
                <li key={`${f.actividad.actividadId}-${i}`} className="flex items-center gap-2 px-3 py-1.5">
                  <span
                    aria-hidden="true"
                    className={cn("w-4 flex-shrink-0 text-center font-semibold", f.estado === "nueva" ? "text-success-ink" : f.estado === "quitada" ? "text-danger-ink" : "text-brand")}
                  >
                    {f.estado === "nueva" ? "+" : f.estado === "quitada" ? "−" : "~"}
                  </span>
                  <span className={cn("min-w-0 flex-1 text-[13px]", f.estado === "quitada" ? "text-fg-muted line-through" : "text-fg")}>
                    {nombreDe(f.actividad)}
                    {f.estado === "cambiada" && f.antes && (
                      <span className="ml-1 text-xs text-fg-muted no-underline">
                        {f.antes.veces !== f.actividad.veces ? `(${f.antes.veces}× → ${f.actividad.veces}×)` : `(antes: ${nombreDe(f.antes)})`}
                      </span>
                    )}
                  </span>
                  <span className="sr-only">{f.estado === "nueva" ? "entra" : f.estado === "quitada" ? "sale" : "cambia"}</span>
                  <span className="tabular-nums text-fg-muted">{horasDe(f.actividad)}</span>
                </li>
              ))}
            </ul>
          )}
          {iguales.length > 0 && (
            <p className="text-fg-muted">
              <span className="font-medium text-fg-secondary">Sin cambios ({iguales.length}):</span> {iguales.map((f) => nombreDe(f.actividad)).join(" · ")}
            </p>
          )}
          {propuesta.p.sugeridas.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-semibold text-fg">También te sugiere sumar · marca las que van</p>
              <ul className="space-y-1.5">
                {propuesta.p.sugeridas.map((s, i) => {
                  const lib = s.actividadId ? armado.porId.get(s.actividadId) : undefined;
                  const marcada = elegidas.has(i);
                  return (
                    <li key={`${s.nombre}-${i}`}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                          checked={marcada}
                          onChange={() =>
                            setElegidas((x) => {
                              const n = new Set(x);
                              if (n.has(i)) n.delete(i);
                              else n.add(i);
                              return n;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-fg">
                            {s.nombre}
                            {s.sobreQue && <span className="text-fg-muted"> · {s.sobreQue}</span>}
                          </span>
                          {s.porQue && <span className="block text-fg-secondary">{s.porQue}</span>}
                          <span className="block text-[11px] text-fg-muted">
                            {lib
                              ? `De la biblioteca: ${lib.nombre}${lib.horasPendientes ? ` · lo define ${quienCorto(lib.quien)}` : ` · ${formatoHoras(horasDeLaActividad({ actividadId: lib.id, nombre: lib.nombre, veces: 1 }, lib))}`}`
                              : "Nueva: no está en la biblioteca, así que no tiene horas. Si la marcas, queda anotada en «Falta en la biblioteca»."}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </AgentProposal>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-info-line bg-info-surface px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
        <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />
        Mejorar con IA las actividades de este caso
      </p>
      <Textarea
        aria-label="Qué quieres cambiar en las actividades"
        rows={2}
        maxLength={MAX_LARGO_DE_LA_INSTRUCCION}
        placeholder="Por ejemplo: quita la capacitación y suma la integración con WhatsApp."
        value={instruccion}
        disabled={pidiendo}
        onChange={(e) => setInstruccion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void pedir();
        }}
      />
      {error && <p className="text-xs text-danger-ink">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {pidiendo ? (
          <p role="status" className="flex items-center gap-1.5 text-xs text-brand">
            <IconoDeSugerencia className="h-3.5 w-3.5" />
            El agente está revisando las actividades con tu instrucción… (unos 20 segundos)
          </p>
        ) : (
          <>
            <BotonAzul disabled={instruccion.trim().length < 3} onClick={() => void pedir()}>
              Proponer cambios
            </BotonAzul>
            <BotonTexto onClick={cerrar}>Cancelar</BotonTexto>
            <span className="text-[11px] text-fg-muted">No cambia nada hasta que apliques la propuesta.</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Las dimensiones que mueve un caso, por nombre. */
function useMueve(dimensiones: readonly string[] | undefined): string[] {
  const { escala } = useLienzo();
  const nombreDim = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre;
  return (dimensiones ?? []).map(nombreDim).filter((x): x is string => !!x);
}

/**
 * Personalizar un caso aceptado (2026-11-08, lib/casos-de-uso/personalizar.ts): la llamada al agente, cuáles están en
 * curso y qué dijo la última revisión de cada caso. Lo comparten todas las filas.
 */
interface Personalizar {
  personalizando: ReadonlySet<string>;
  personalizar: (useCaseId: string) => void;
  /** Lo que dijo «Revisar» de cada caso que ya estaba, por su id (solo la revisión de hoy). */
  revisionDe: ReadonlyMap<string, CambioDeLaRevision>;
}
const PersonalizarContexto = createContext<Personalizar>({ personalizando: new Set(), personalizar: () => {}, revisionDe: new Map() });

/** Lo que dijo «Revisar» de un caso que ya estaba: cambia o ya no hace falta, y por qué. */
function NotaDeLaRevision({ cambio, children }: { cambio: CambioDeLaRevision; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning bg-surface-muted px-3 py-1.5 text-xs text-fg-secondary">
      <span className="min-w-0 flex-1">
        <span className="font-medium text-fg">{cambio.veredicto === "cambia" ? "Con lo nuevo, cambiaría:" : "Con lo nuevo, ya no parece hacer falta:"}</span> {cambio.motivo}
      </span>
      {children}
    </div>
  );
}

/** Qué cambió frente a la ficha, en dos o tres líneas (pedido 5 de Elías: «un resumen corto de por qué»). */
function LoPersonalizado({ caso }: { caso: CasoDeUsoElegido }) {
  if (!caso.personalizado) return null;
  return (
    <div className="rounded-lg border border-info-line bg-info-surface px-3 py-2 text-xs leading-normal text-fg-secondary">
      <p className="flex items-center gap-1.5 font-medium text-fg">
        <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />
        {caso.aMano ? "Lo que personalizó el agente (antes de tus cambios)" : "Personalizado para esta empresa"}
      </p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
        {caso.personalizado.cambios.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

// ── La lista: un caso por fila ───────────────────────────────────────────────────────────────────

/** Una fila de la lista: un caso elegido, uno que sugiere el agente o uno de la biblioteca que sugiere la escala. */
type Fila =
  | { tipo: "elegido"; id: string; caso: CasoDeUsoElegido }
  | { tipo: "agente"; id: string; item: ItemPropuesto }
  | { tipo: "escala"; id: string; c: CasoPorLaEscala };

/** De dónde viene el caso: la etiqueta de su fila. */
function EtiquetaDeOrigen({ tipo }: { tipo: Fila["tipo"] }) {
  if (tipo === "elegido")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-surface py-0.5 pl-1.5 pr-2 text-[11px] font-semibold leading-none text-success-ink">
        <span aria-hidden="true">✓</span>
        Elegido
      </span>
    );
  if (tipo === "agente")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-info-line bg-info-surface py-0.5 pl-1.5 pr-2 text-[11px] font-semibold leading-none text-brand">
        <IconoDeSugerencia className="h-[13px] w-[13px]" />
        Sugerido por el agente
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11px] font-semibold leading-none text-fg-secondary">
      De la biblioteca · por la escala
    </span>
  );
}

/** El marco de toda fila: número, etiqueta y título a la izquierda; precio, lo que mueve y las acciones a la derecha. */
function MarcoDeLaFila({
  numero,
  tipo,
  area,
  titulo,
  subtitulo,
  cuerpo,
  precio,
  mueve,
  acciones,
  desplegable,
  abierta,
  alAbrir,
  etiquetaDelDesplegable,
  pie,
}: {
  numero: number;
  tipo: Fila["tipo"];
  area: string | null;
  titulo: string;
  subtitulo?: React.ReactNode;
  cuerpo: React.ReactNode;
  precio: React.ReactNode;
  mueve: string[];
  acciones: React.ReactNode;
  desplegable: React.ReactNode | null;
  abierta: boolean;
  alAbrir: () => void;
  etiquetaDelDesplegable: [string, string];
  pie?: React.ReactNode;
}) {
  /* Lo de adentro queda montado después de abrirlo una vez (revisión del 2026-11-08): plegar la fila mientras «Mejorar con
     IA» espera al agente perdía la propuesta, ya pagada. */
  const [montado, setMontado] = useState(abierta);
  if (abierta && !montado) setMontado(true);
  return (
    <li className={cn("rounded-xl border bg-surface", tipo === "agente" ? "border-info-line" : "border-line")}>
      <div className="grid gap-x-6 gap-y-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-hover px-1 text-[11px] font-semibold tabular-nums text-fg-secondary"
              aria-label={`Lugar ${numero} en la lista`}
            >
              {numero}
            </span>
            <EtiquetaDeOrigen tipo={tipo} />
            {area && <span className="text-xs text-fg-muted">{area}</span>}
          </p>
          <h3 className="text-[15px] font-semibold leading-[1.35] text-fg">{titulo}</h3>
          {subtitulo}
          {cuerpo}
        </div>
        <div className="flex flex-col gap-2.5 border-line md:border-l md:pl-5">
          {precio}
          {mueve.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] text-fg-muted">Mueve</p>
              <p className="flex flex-wrap gap-1">
                {mueve.map((m) => (
                  <span key={m} className="rounded-md border border-line bg-surface-hover px-1.5 py-0.5 text-[11px] font-medium text-fg-secondary">
                    {m}
                  </span>
                ))}
              </p>
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-end gap-1 pt-1">
            {desplegable && (
              <button type="button" aria-expanded={abierta} className="mr-auto text-xs font-medium text-brand hover:underline" onClick={alAbrir}>
                {abierta ? `${etiquetaDelDesplegable[1]} ▴` : `${etiquetaDelDesplegable[0]} ▾`}
              </button>
            )}
            {acciones}
          </div>
        </div>
      </div>
      {pie}
      {montado && desplegable && (
        <div hidden={!abierta} className="space-y-3 border-t border-line px-4 py-3.5">
          {desplegable}
        </div>
      )}
    </li>
  );
}

/** «Por qué:» y «Por qué va aquí:», las dos líneas que se leen primero en cada fila. */
function LosPorques({ porQue, lugar }: { porQue: string; lugar: string }) {
  if (!porQue && !lugar) return null;
  return (
    <div className="space-y-1 text-[13px] leading-normal text-fg-secondary">
      {porQue && (
        <p>
          <span className="font-medium text-fg">Por qué: </span>
          {porQue}
        </p>
      )}
      {lugar && (
        <p className="text-xs">
          <span className="font-medium text-fg">Por qué va aquí: </span>
          {lugar}
        </p>
      )}
    </div>
  );
}

/**
 * «Aceptado hoy a las 14:05 · tú» y «Revertir»: lo que antes decía «Usadas hoy», ahora en la fila del caso. La hora es la
 * de la primera vez que se usó hoy (la aceptación); «Revertir» deshace el ÚLTIMO uso (la personalización que se aplicó
 * sola o «Usar la nueva», si los hubo; si no, la aceptación, y el caso vuelve a los sugeridos), como el «Revertir» de
 * antes. Si alguien lo cambió después, no se revierte y lo dice.
 */
function AceptadoHoy({ id }: { id: string }) {
  const { usadasHoy, exp, deshacer, puedeEditar, guardando } = useLienzo();
  const me = useMe();
  const usos = usadasHoy.filter((x) => x.item.destino.tipo === "casoDeUso" && x.item.destino.useCaseId === id).sort((a, b) => a.en.localeCompare(b.en));
  if (!usos.length) return null;
  const primero = usos[0];
  const ultimo = usos[usos.length - 1];
  const hora = (en: string) => new Date(en).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
  const quien = !primero.por ? "Nexus" : me?.email && primero.por.toLowerCase() === me.email.toLowerCase() ? "tú" : primero.por.split("@")[0];
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-[11px] text-fg-muted">
      <span>
        Aceptado hoy a las {hora(primero.en)} · {quien}
        {usos.length > 1 && ` · cambió por sugerencia a las ${hora(ultimo.en)}`}
      </span>
      {puedeEditar &&
        (sePuedeDeshacer(exp.estado, ultimo) ? (
          <BotonTexto
            className="py-0 text-[11px]"
            disabled={guardando}
            title={usos.length > 1 ? "Deshace el último cambio que llegó por sugerencia y deja el caso como estaba antes" : "Deshace la aceptación: el caso vuelve a los sugeridos"}
            onClick={() => void deshacer([ultimo.id])}
          >
            Revertir
          </BotonTexto>
        ) : (
          <span title="Alguien lo cambió después de usarla: revertir pisaría ese cambio">· cambió después</span>
        ))}
    </p>
  );
}

/**
 * Un caso elegido. Al aceptarlo se personalizan sus actividades (dice «Personalizando…» mientras tanto) y después muestra
 * qué cambió frente a la ficha. Se abre para ver y cambiar sus actividades (a mano o con «Mejorar con IA») y el argumento
 * de valor. Si quedó una versión nueva (la personalizada, cuando se tocó el caso mientras tanto), lo dice ahí mismo.
 * Quitarlo lo devuelve a los sugeridos.
 */
function FilaElegida({ numero, id, caso, lugar, nueva, onQuitar }: { numero: number; id: string; caso: CasoDeUsoElegido; lugar?: CasoEnElOrden; nueva?: ItemPropuesto; onQuitar?: () => void }) {
  const { escala, guardando, puedeEditar, usar, cambiar } = useLienzo();
  const { personalizando, personalizar, revisionDe } = useContext(PersonalizarContexto);
  const [abierta, setAbierta] = useState(false);
  const mueve = useMueve(caso.dimensiones);
  const area = escala.areas.find((a) => a.id === caso.areaId)?.nombre ?? "Sin área";
  const enCurso = personalizando.has(id);
  const revision = revisionDe.get(id);
  // Los de antes que armó «Regenerar» (`armado`) ya tienen sus actividades para la empresa: no se ofrecen de nuevo.
  const sinPersonalizar = !caso.personalizado && !caso.armado && !caso.aMano;
  /* La razón, solo si la escribió el agente para esta empresa: en un caso elegido a mano del catálogo es la descripción
     genérica de la ficha (revisión del 2026-11-08). */
  const porQue = caso.paraVentas?.porQue || (caso.armado ? (caso.razon ?? "") : "");
  return (
    <MarcoDeLaFila
      numero={numero}
      tipo="elegido"
      area={area}
      titulo={caso.titulo}
      subtitulo={
        <>
          {(caso.tituloDelCatalogo || !esCasoLibre(id) || caso.aMano) && (
            <p className="text-[11px] text-fg-muted">
              {!esCasoLibre(id) && (caso.tituloDelCatalogo ? `Del catálogo: «${caso.tituloDelCatalogo}»` : "Del catálogo")}
              {caso.aMano && `${esCasoLibre(id) ? "" : " · "}actividades editadas a mano`}
            </p>
          )}
          <AceptadoHoy id={id} />
        </>
      }
      cuerpo={
        <>
          <LosPorques porQue={porQue} lugar={lugar?.porQue || caso.plan?.despuesDe || ""} />
          {enCurso ? (
            <p role="status" className="flex items-center gap-1.5 text-xs text-brand">
              <IconoDeSugerencia className="h-3.5 w-3.5" />
              Personalizando sus actividades con lo que sabemos de la empresa… (unos 30 segundos)
            </p>
          ) : (
            sinPersonalizar &&
            puedeEditar && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                Todavía con las actividades de la ficha del catálogo{esCasoLibre(id) ? " (o ninguna)" : ""}.
                <BotonTexto disabled={guardando} onClick={() => personalizar(id)}>
                  Personalizar
                </BotonTexto>
              </p>
            )
          )}
          <LoPersonalizado caso={caso} />
          {revision && (
            <NotaDeLaRevision cambio={revision}>
              {puedeEditar && revision.veredicto === "cambia" && (
                <BotonTexto disabled={guardando || enCurso} onClick={() => personalizar(id)}>
                  Volver a personalizar
                </BotonTexto>
              )}
            </NotaDeLaRevision>
          )}
        </>
      }
      precio={<PrecioDelCaso id={id} caso={caso} />}
      mueve={mueve}
      acciones={
        onQuitar && (
          <BotonTexto disabled={guardando} title="Lo saca de los elegidos y vuelve a los sugeridos" onClick={onQuitar}>
            Quitar
          </BotonTexto>
        )
      }
      abierta={abierta}
      alAbrir={() => setAbierta((x) => !x)}
      etiquetaDelDesplegable={["Actividades", "Actividades"]}
      pie={
        nueva &&
        puedeEditar && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-info-surface px-4 py-2 text-xs text-fg-secondary">
            <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />
            <span className="min-w-0 flex-1">
              {(nueva.valor as CasoDeUsoElegido).personalizado
                ? caso.aMano
                  ? "Está lista la versión personalizada para esta empresa. Cambiaste sus actividades a mano: tu versión se queda hasta que elijas la nueva."
                  : "Está lista la versión personalizada para esta empresa."
                : caso.aMano
                  ? "Hay una versión nueva de este caso. Cambiaste sus actividades a mano: tu versión se queda hasta que elijas la nueva."
                  : "Hay una versión nueva de este caso, armada con la biblioteca de actividades."}
            </span>
            <BotonTexto disabled={guardando} onClick={() => void cambiar([{ op: "descartar", itemIds: [nueva.id] }])}>
              Quedarme con esta
            </BotonTexto>
            <BotonAzul disabled={guardando} onClick={() => void usar([nueva], { lugar: "casos" })}>
              Usar la nueva
            </BotonAzul>
          </div>
        )
      }
      desplegable={
        <>
          <ComoSeArma id={id} caso={caso} />
          <ActividadesDelCaso id={id} caso={caso} editable={!!onQuitar} />
          {/* Montado también mientras se personaliza: una propuesta abierta no se pierde (al aplicar, avisa si cambió). */}
          {onQuitar && <MejorarConIA id={id} caso={caso} />}
          {caso.valorDeVenta && <ValorDelCaso valor={caso.valorDeVenta} />}
          {puedeEditar && !sinPersonalizar && !enCurso && (
            <p className="text-xs text-fg-muted">
              <BotonTexto disabled={guardando} onClick={() => personalizar(id)}>
                Volver a personalizar
              </BotonTexto>{" "}
              con lo que se sabe hoy{caso.aMano ? " (tus cambios se quedan hasta que elijas la versión nueva)" : ""}.
            </p>
          )}
        </>
      }
    />
  );
}

/**
 * Un caso que sugiere el agente: su PORQUÉ a la vista (lo primero que hay que ver, pedido 8 de Elías), «Descartar» y
 * «Aceptar». Al aceptarlo se personalizan sus actividades. «Ver más» abre la descripción entera, la cita, las actividades
 * de la ficha y el valor, si los tiene.
 */
function FilaSugerida({ numero, item, lugar, onAceptar }: { numero: number; item: ItemPropuesto; lugar?: CasoEnElOrden; onAceptar: (item: ItemPropuesto) => void }) {
  const { escala, cambiar, queHace, puedeEditar, guardando } = useLienzo();
  const { revisionDe } = useContext(PersonalizarContexto);
  const [abierta, setAbierta] = useState(false);
  const caso = item.valor as CasoDeUsoElegido;
  const useCaseId = item.destino.tipo === "casoDeUso" ? item.destino.useCaseId : "";
  const mueve = useMueve(caso.dimensiones);
  const area = escala.areas.find((a) => a.id === caso.areaId)?.nombre ?? null;
  const cita = item.fuentes.find((f) => f.cita);
  const porQue = caso.paraVentas?.porQue || caso.razon || item.razon || "";
  const revision = revisionDe.get(useCaseId);
  const conActividades = !!useCaseId && (useCaseId.startsWith("cat-") || !!caso.actividades);
  const hayMas = !!cita || (caso.descripcion?.length ?? 0) > 160 || conActividades || !!caso.valorDeVenta || !!caso.personalizado;
  return (
    <MarcoDeLaFila
      numero={numero}
      tipo="agente"
      area={area}
      titulo={caso.titulo}
      subtitulo={caso.tituloDelCatalogo && <p className="text-[11px] text-fg-muted">Del catálogo: «{caso.tituloDelCatalogo}»</p>}
      cuerpo={
        <>
          <LosPorques porQue={porQue} lugar={lugar?.porQue || caso.plan?.despuesDe || ""} />
          {revision && <NotaDeLaRevision cambio={revision} />}
          {caso.descripcion && <p className={cn("text-xs leading-normal text-fg-muted", !abierta && "line-clamp-2")}>{caso.descripcion}</p>}
        </>
      }
      precio={<PrecioDelCaso id={useCaseId} caso={caso} conLaFicha={!caso.personalizado && !caso.armado} />}
      mueve={mueve}
      acciones={
        puedeEditar && (
          <>
            <BotonTexto disabled={guardando} onClick={() => void cambiar([{ op: "descartar", itemIds: [item.id] }])}>
              Descartar
            </BotonTexto>
            <BotonAzul
              disabled={guardando}
              title={`${queHace(item).texto}${sePersonalizaAlAceptar(caso) ? " y personalizar sus actividades para esta empresa" : ""}`}
              onClick={() => onAceptar(item)}
            >
              Aceptar
            </BotonAzul>
          </>
        )
      }
      abierta={abierta}
      alAbrir={() => setAbierta((x) => !x)}
      etiquetaDelDesplegable={["Ver más", "Ver menos"]}
      desplegable={
        hayMas ? (
          <>
            {cita?.cita && (
              <p className="text-xs italic text-fg-muted">
                «{cita.cita}» · {cita.etiqueta}
              </p>
            )}
            <LoPersonalizado caso={caso} />
            {conActividades && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  {caso.personalizado || caso.armado ? "Sus actividades" : "Las actividades de la ficha"}
                </p>
                <ActividadesDelCaso id={useCaseId} caso={caso} editable={false} />
              </div>
            )}
            {caso.valorDeVenta && <ValorDelCaso valor={caso.valorDeVenta} />}
          </>
        ) : null
      }
    />
  );
}

/**
 * Un caso de la biblioteca que sugiere la escala (Ficha B, 2026-10-17; sin IA: sale del mapa y del catálogo). Con el
 * título claro que le dio el agente al ordenar la lista, si lo tiene (el del catálogo queda al lado). «Elegir para» lo
 * suma a los elegidos en esa área y lo personaliza.
 */
function FilaDeLaEscala({ numero, c, lugar, onElegir }: { numero: number; c: CasoPorLaEscala; lugar?: CasoEnElOrden; onElegir: (c: CasoPorLaEscala, titulo: string) => void }) {
  const { puedeEditar, guardando } = useLienzo();
  const [abierta, setAbierta] = useState(false);
  const id = `cat-${c.caso.id}`;
  const titulo = lugar?.titulo || c.caso.titulo;
  const dimensiones = c.caso.mueve.map((m) => m.dimension).filter((d) => d.split(".")[0] === c.area.id);
  const mueve = useMueve(dimensiones);
  const caso: CasoDeUsoElegido = { titulo, areaId: c.area.id };
  return (
    <MarcoDeLaFila
      numero={numero}
      tipo="escala"
      area={c.area.nombre}
      titulo={titulo}
      subtitulo={titulo !== c.caso.titulo && <p className="text-[11px] text-fg-muted">Del catálogo: «{c.caso.titulo}»</p>}
      cuerpo={
        <>
          <LosPorques porQue={c.razon} lugar={lugar?.porQue ?? ""} />
          <p className="text-xs leading-normal text-fg-muted">{c.caso.promesa}</p>
        </>
      }
      precio={<PrecioDelCaso id={id} caso={caso} conLaFicha />}
      mueve={mueve}
      acciones={
        <>
          <Link href={"/sales/use-cases/" + c.caso.id} target="_blank" className="px-1.5 py-[5px] text-xs text-brand hover:text-brand-light">
            Ver el caso
          </Link>
          {puedeEditar && (
            <BotonBlanco disabled={guardando} onClick={() => onElegir(c, titulo)}>
              Elegir para {c.area.nombre}
            </BotonBlanco>
          )}
        </>
      }
      abierta={abierta}
      alAbrir={() => setAbierta((x) => !x)}
      etiquetaDelDesplegable={["Actividades", "Actividades"]}
      desplegable={
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Las actividades de la ficha</p>
          <ActividadesDelCaso id={id} caso={caso} editable={false} />
        </div>
      }
    />
  );
}

/** Cuántas personalizaciones a la vez, al aceptar varias juntas: cada una es una llamada al agente. */
const PERSONALIZACIONES_A_LA_VEZ = 3;

function CasosDeUso({ catalogo, novedades }: { catalogo: Caso[]; novedades: NovedadesDeLosCasos | null }) {
  const { exp, escala, cambiar, puedeEditar, guardando, pendientesPara, mapa, nombreDeNivel, usar, recargar } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const armado = useContext(ArmadoContexto);
  const { pushUndo } = useUndo();
  const toast = useToast();
  const e = exp.estado;
  // En el orden del plan que armó el agente (2026-11-08): la base de la lista cuando no hay un orden propuesto.
  const elegidos = enOrdenDelPlan(Object.entries(e.contenido.casosDeUso), ([, c]) => c.plan?.paso);
  const areas = escala.areas.filter((a) => e.areas.includes(a.id));
  const todosLosPropuestos = pendientesPara((d) => d.tipo === "casoDeUso");
  /* La versión nueva de un caso ya elegido (la personalizada que no se usó sola) va en su fila, no entre los sugeridos. */
  const nuevaDe = new Map(todosLosPropuestos.flatMap((it) => (it.destino.tipo === "casoDeUso" && it.destino.useCaseId in e.contenido.casosDeUso ? [[it.destino.useCaseId, it] as const] : [])));
  const propuestos = enOrdenDelPlan(
    todosLosPropuestos.filter((it) => !(it.destino.tipo === "casoDeUso" && nuevaDe.has(it.destino.useCaseId))),
    (it) => (it.valor as CasoDeUsoElegido).plan?.paso,
  );
  // Del catálogo de Smarteam, solo los que tocan un área en juego; los de la tabla (con precio), todos.
  const libres = catalogo.filter((c) => !(c.id in e.contenido.casosDeUso) && (!c.areas || c.areas.some((a) => e.areas.includes(a))));
  const yaPropuso = e.propuesta.corridas.some((c) => c.modo === "casos");
  const conBase = laEscalaTieneBase(e);
  const esPropia = corrida?.modo === "casos";
  const nombresDeAreas = areas.map((a) => a.nombre).join(" y ");

  /* La última revisión (2026-11-08): se muestra el día que se hizo, hasta que el vendedor la cierra. */
  const [abiertoEn] = useState(() => Date.now());
  const [revisionCerrada, setRevisionCerrada] = useState<string | null>(null);
  const ultimaRevision = e.propuesta.revisionDeLosCasos ?? null;
  const revisionDeHoy = ultimaRevision?.revisada && abiertoEn - Date.parse(ultimaRevision.en) < 12 * 3600_000 ? ultimaRevision : null;
  const enLaRevision = new Set([...Object.keys(e.contenido.casosDeUso), ...propuestos.map((it) => (it.destino as { useCaseId: string }).useCaseId)]);
  const cambiosVigentes = (revisionDeHoy?.cambios ?? []).filter((c) => enLaRevision.has(c.useCaseId));
  const revisionDe = new Map(cambiosVigentes.map((c) => [c.useCaseId, c]));
  // Las novedades valen hasta que el agente vuelve a mirar: después de una corrida en esta pantalla ya no son nuevas.
  const novedadesVigentes = novedades && !(ultimaRevision && Date.parse(ultimaRevision.en) > Date.parse(novedades.desde)) ? novedades : null;

  /* Personalizar (2026-11-08): una llamada por caso, que la pantalla espera. Si nadie tocó el caso mientras tanto, la
     versión personalizada se usa sola; si no, queda en su fila para que el vendedor decida. */
  const [personalizando, setPersonalizando] = useState<ReadonlySet<string>>(new Set());
  const enCurso = useRef(new Set<string>());
  const personalizarUno = useCallback(
    /** `callado`: en un lote, el caso que se saltó al aceptar (ya no estaba) no avisa «ya no está elegido». */
    async (useCaseId: string, callado = false): Promise<void> => {
      if (enCurso.current.has(useCaseId)) return;
      enCurso.current.add(useCaseId);
      setPersonalizando(new Set(enCurso.current));
      try {
        const res = await fetch(`/api/sales/exploraciones/${exp.id}/casos/personalizar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useCaseId }),
        });
        const data = (await res.json().catch(() => ({}))) as { item?: ItemPropuesto; seUsaSola?: boolean; segundos?: number; error?: string };
        if (!res.ok || !data.item) {
          if (!(callado && res.status === 409)) toast.error(data.error ?? "No se pudo personalizar el caso.");
          return;
        }
        const titulo = (data.item.valor as CasoDeUsoElegido).titulo;
        // Primero la versión en pantalla (la dejó el servidor): así «usar» sabe qué se veía, también si reintenta.
        await recargar();
        if (data.seUsaSola && (await cambiar([{ op: "usar", itemId: data.item.id, valor: data.item.valor }]))) {
          toast.success(`«${titulo}» quedó personalizado para ${exp.empresa.nombre}.`);
        } else {
          toast.info(`Está lista la versión personalizada de «${titulo}»: elígela en su fila.`);
        }
      } catch {
        toast.error("No se pudo personalizar el caso. Revisa tu conexión.");
      } finally {
        enCurso.current.delete(useCaseId);
        setPersonalizando(new Set(enCurso.current));
      }
    },
    [exp.id, exp.empresa.nombre, cambiar, recargar, toast],
  );
  const personalizarVarios = useCallback(
    async (ids: string[]) => {
      const cola = [...ids];
      await Promise.all(
        Array.from({ length: Math.min(PERSONALIZACIONES_A_LA_VEZ, cola.length) }, async () => {
          for (let id = cola.shift(); id; id = cola.shift()) await personalizarUno(id, true);
        }),
      );
    },
    [personalizarUno],
  );
  const personalizar = useCallback((useCaseId: string) => void personalizarUno(useCaseId), [personalizarUno]);
  const contexto: Personalizar = { personalizando, personalizar, revisionDe };

  const idDe = (it: ItemPropuesto) => (it.destino as { useCaseId: string }).useCaseId;
  const aceptar = async (item: ItemPropuesto) => {
    if (!(await usar([item], { lugar: "casos" }))) return;
    if (sePersonalizaAlAceptar(item.valor as CasoDeUsoElegido)) personalizar(idDe(item));
  };
  const alAceptarVarios = (items: ItemPropuesto[]) =>
    void personalizarVarios(items.filter((it) => sePersonalizaAlAceptar(it.valor as CasoDeUsoElegido)).map(idDe));

  /* Quitar (pedido 4 de Elías): el que sugirió el agente vuelve a los sugeridos con su porqué. Se deshace con el aviso o
     Ctrl+Z: el caso vuelve a los elegidos como estaba. */
  const quitar = (id: string) => {
    const caso = e.contenido.casosDeUso[id];
    if (!caso) return;
    void cambiar([{ op: "quitarCaso", useCaseId: id }]).then((ok) => {
      if (!ok) return;
      pushUndo({
        scope: `exploracion:${exp.id}`,
        label: vuelveASugeridos(id, caso) ? `Quitaste «${caso.titulo}»: volvió a los sugeridos` : `Quitaste «${caso.titulo}»`,
        undo: () => void cambiar([{ op: "casoDeUso", useCaseId: id, valor: caso }]),
      });
    });
  };
  const elegirDelCatalogo = (caso: Caso, areaId: string | null, tituloClaro?: string) => {
    // Las dimensiones que mueve en el área elegida (sin área, todas): así el caso dice qué sube, como los del agente.
    const dimensiones = (caso.dimensiones ?? []).filter((d) => !areaId || d.split(".")[0] === areaId).slice(0, 8);
    // El título claro que le dio el agente al ordenar (décima vuelta); el del catálogo queda al lado, como en los suyos.
    const conTitulo = tituloClaro && tituloClaro !== caso.titulo ? { titulo: tituloClaro, tituloDelCatalogo: caso.titulo } : { titulo: caso.titulo };
    void cambiar([
      {
        op: "casoDeUso",
        useCaseId: caso.id,
        valor: { ...conTitulo, areaId, razon: caso.descripcion.slice(0, 400), ...(dimensiones.length ? { dimensiones } : {}) },
      },
    ]).then((ok) => {
      // Elegido a mano también es aceptado: se personaliza igual (los de la tabla vieja, sin ficha, no).
      if (ok && caso.id.startsWith("cat-")) personalizar(caso.id);
    });
  };
  const elegirDeLaEscala = (c: CasoPorLaEscala, titulo: string) =>
    elegirDelCatalogo({ id: "cat-" + c.caso.id, titulo: c.caso.titulo, descripcion: c.caso.descripcion, precio: null, dimensiones: c.caso.mueve.map((m) => m.dimension) }, c.area.id, titulo);
  const revisar = () => void lanzar("casos", { revisar: true });
  const sinPersonalizar = elegidos.filter(([id, c]) => !c.personalizado && !c.armado && !c.aMano && !personalizando.has(id) && (!c.areaId || e.areas.includes(c.areaId)) && !nuevaDe.has(id));

  /* Ficha B (2026-10-17): los casos de la biblioteca que mueven a cada área desde donde parece estar hoy. Desde la décima
     vuelta no repiten lo que ya está en la lista (elegido o sugerido por el agente) y comparten la cuenta con el agente
     que ordena (lib/exploraciones/casos-de-uso.ts › casosPorLaEscala). */
  const enLaLista = new Set([...elegidos.map(([id]) => id), ...propuestos.map(idDe)].filter((id) => id.startsWith("cat-")).map((id) => id.slice(4)));
  const porLaEscala = conBase ? casosPorLaEscala({ escala, areas: e.areas, mapa, excluir: enLaLista, nombreDeNivel }) : [];

  /* La lista entera, uno por fila (décima vuelta): en el orden que propuso el agente; lo que llegó después de su última
     vuelta va al final, en el orden de antes (elegidos, sugeridos, escala). */
  const orden = e.propuesta.ordenDeLosCasos ?? null;
  const lugarDe = new Map((orden?.casos ?? []).map((c) => [c.id, c]));
  const filas = enElOrden<Fila>(
    [
      ...elegidos.map(([id, caso]): Fila => ({ tipo: "elegido", id, caso })),
      ...propuestos.map((item): Fila => ({ tipo: "agente", id: idDe(item), item })),
      ...porLaEscala.map((c): Fila => ({ tipo: "escala", id: `cat-${c.caso.id}`, c })),
    ],
    (f) => f.id,
    orden,
  );
  const sinPoder = lanzando || corriendo || areas.length === 0 || !conBase;

  return (
    <PersonalizarContexto.Provider value={contexto}>
      <div className="space-y-6">
        <div data-recorrido="preventa.casos.agente">
          <FranjaDeSugerencias
            acciones={
              puedeEditar && (
                <>
                  {/* Nada corre solo al entrar (pedido 4b de Elías: cada vuelta cuesta). La primera vez, «Sugerir casos»;
                      después, «Revisar»: vuelve a mirar, sugiere lo nuevo, reordena la lista y dice qué cambió, sin tocar
                      lo elegido. */}
                  <BotonBlanco
                    disabled={sinPoder}
                    title={yaPropuso ? "Vuelve a mirar los casos con lo que se sabe hoy, ordena la lista y te dice qué cambió. No toca lo elegido." : undefined}
                    onClick={() => (yaPropuso ? revisar() : void lanzar("casos"))}
                  >
                    {lanzando ? "Pidiendo…" : yaPropuso ? "Revisar" : "Sugerir casos de uso"}
                  </BotonBlanco>
                  {propuestos.length > 1 && <BotonUsarTodas items={propuestos} lugar="casos" alUsar={alAceptarVarios} />}
                </>
              )
            }
          >
            {corriendo && esPropia ? (
              <span role="status">El agente está mirando los casos: {corrida?.fase ?? "empezando…"}</span>
            ) : !conBase ? (
              <>
                Los casos de uso se sugieren cuando la escala tenga sus primeros niveles: después del diagnóstico o de la primera reunión. Sin eso, no habría sobre qué
                basarlos.
              </>
            ) : propuestos.length > 0 ? (
              <>
                <strong>
                  El agente sugiere {propuestos.length} {propuestos.length === 1 ? "caso" : "casos"}
                </strong>
                {nombresDeAreas ? ` para ${nombresDeAreas}` : ""}, cada uno con su porqué. Acepta los que van: el agente personaliza sus actividades para esta
                empresa.
              </>
            ) : (
              <>
                El agente sugiere casos de uso del catálogo de Smarteam según dónde está cada equipo en la escala y lo que contó el cliente, cada uno con su porqué,
                y ordena la lista. Al aceptar uno, personaliza sus actividades para esta empresa. Cada vuelta cuesta unos centavos.
              </>
            )}
          </FranjaDeSugerencias>
        </div>

        {corrida?.estado === "ERROR" && esPropia && <Alert variant="danger">{corrida.error}</Alert>}
        {puedeEditar && conBase && novedadesVigentes && !(corriendo && esPropia) && (
          <Alert
            variant="info"
            title="Hay información nueva"
            action={
              <BotonAzul disabled={sinPoder} onClick={revisar}>
                Revisar
              </BotonAzul>
            }
          >
            {novedadesEnUnaFrase(novedadesVigentes)} «Revisar» vuelve a mirar los casos y te dice qué cambia; no toca lo elegido.
          </Alert>
        )}
        {revisionDeHoy && revisionCerrada !== revisionDeHoy.corridaId && !(corriendo && esPropia) && (
          <Alert variant={nadaCambio(revisionDeHoy) ? "success" : "info"} title="Revisaste los casos" onDismiss={() => setRevisionCerrada(revisionDeHoy.corridaId)}>
            {revisionEnUnaFrase(revisionDeHoy)}
            {revisionDeHoy.nuevos.length > 0 && <span className="block">Nuevos: {revisionDeHoy.nuevos.map((t) => `«${t}»`).join(", ")}.</span>}
            {cambiosVigentes.length > 0 && <span className="block">Cada caso que cambia lo dice en su fila.</span>}
          </Alert>
        )}
        {puedeEditar && sinPersonalizar.length > 0 && (
          <Alert
            variant="warning"
            title={sinPersonalizar.length === 1 ? "Un caso elegido sin personalizar" : `${sinPersonalizar.length} casos elegidos sin personalizar`}
            action={
              <BotonAzul disabled={guardando} onClick={() => void personalizarVarios(sinPersonalizar.map(([id]) => id))}>
                {sinPersonalizar.length === 1 ? "Personalizar" : `Personalizar los ${sinPersonalizar.length}`}
              </BotonAzul>
            }
          >
            Sus actividades son las de la ficha (o ninguna) y no tienen cómo subir el ticket. El agente las arma para esta empresa con lo que contó el cliente; lo que
            cambiaste a mano no se pisa.
          </Alert>
        )}
        {areas.length === 0 && <p className="text-sm text-fg-muted">Elige primero las áreas en juego (en «La escala»): los casos de uso se sugieren por área.</p>}

        {filas.length > 0 && (
          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                Los casos · {filas.length}
                {elegidos.length > 0 && <span className="font-normal normal-case tracking-normal"> · {elegidos.length} elegidos</span>}
              </h2>
              <p className="text-[11px] text-fg-muted">
                {orden ? "En el orden que sugiere el agente con lo que se sabe de la empresa" : "«Revisar» los ordena con todo lo que se sabe de la empresa"}
              </p>
            </div>
            <ol className="space-y-3">
              {filas.map((f, i) =>
                f.tipo === "elegido" ? (
                  <FilaElegida
                    key={`e-${f.id}`}
                    numero={i + 1}
                    id={f.id}
                    caso={f.caso}
                    lugar={lugarDe.get(f.id)}
                    nueva={nuevaDe.get(f.id)}
                    onQuitar={puedeEditar ? () => quitar(f.id) : undefined}
                  />
                ) : f.tipo === "agente" ? (
                  <FilaSugerida key={`a-${f.item.id}`} numero={i + 1} item={f.item} lugar={lugarDe.get(f.id)} onAceptar={(x) => void aceptar(x)} />
                ) : (
                  <FilaDeLaEscala key={`s-${f.c.area.id}-${f.c.caso.id}`} numero={i + 1} c={f.c} lugar={lugarDe.get(f.id)} onElegir={elegirDeLaEscala} />
                ),
              )}
            </ol>
            {armado && elegidos.length > 0 && <TotalDeLaVenta elegidos={elegidos} armado={armado} />}
          </section>
        )}

        {libres.length > 0 && (
          <details className="rounded-xl border border-line bg-surface">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg">
              Del catálogo de Smarteam <span className="font-normal text-fg-muted">· {libres.length}</span>
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {libres.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">
                      {c.titulo}
                      {c.precio && (
                        <Badge size="xs" className="ml-2">
                          {c.precio}
                        </Badge>
                      )}
                    </p>
                    <p className="line-clamp-2 text-xs text-fg-muted">{c.descripcion}</p>
                    {c.id.startsWith("cat-") && (
                      <Link href={`/sales/use-cases/${c.id.slice(4)}`} target="_blank" className="text-xs text-brand hover:text-brand-light">
                        Ver el caso
                      </Link>
                    )}
                  </div>
                  {puedeEditar && (
                    <Select
                      aria-label={`Agregar «${c.titulo}»`}
                      value=""
                      disabled={guardando}
                      onChange={(ev) => {
                        if (ev.target.value) elegirDelCatalogo(c, ev.target.value === "-" ? null : ev.target.value);
                      }}
                    >
                      <option value="">Agregar a…</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                      <option value="-">Sin área</option>
                    </Select>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </PersonalizarContexto.Provider>
  );
}

/** El total mínimo de los elegidos: lo que se repite entre casos (el kickoff, un mismo canal) se cuenta una vez. */
function TotalDeLaVenta({ elegidos, armado }: { elegidos: [string, CasoDeUsoElegido][]; armado: Armado }) {
  const listas = elegidos.map(([id, c]) => actividadesDe(id, c, armado));
  const horas = horasDeLaVenta(listas, armado.porId);
  if (!horas) return null;
  const sumaSuelta = listas.reduce((s, acts) => s + horasDelCaso(acts, armado.porId).horas, 0);
  return (
    <p className="px-1 text-xs text-fg-secondary">
      Los elegidos juntos: <span className="font-semibold text-fg">{formatoHoras(horas)}</span> ·{" "}
      <span className="font-semibold text-fg">desde {formatoUsd(precioMinimo(horas, armado.tarifa))}</span>
      {sumaSuelta > horas && <span className="text-fg-muted"> (lo que comparten se cuenta una vez: {formatoHoras(sumaSuelta - horas)} menos)</span>}
      <span className="text-fg-muted">
        {" "}
        · Tarifa {armado.tarifa.nombre}, {armado.tarifa.usdPorHora} USD por hora
        {armado.tarifa.supuesta ? " (la empresa no tiene segmento: se usa la Estándar; se elige en Información del cliente)" : ""}.
      </span>
    </p>
  );
}

export default function PasoCasosDeUso() {
  const { exp, irA } = useLienzo();
  const [datos, setDatos] = useState<DatosDelPaso | null>(null);
  const [armadoCrudo, setArmadoCrudo] = useState<Omit<Armado, "porId"> | null>(null);
  const armado = useMemo<Armado | null>(() => (armadoCrudo ? { ...armadoCrudo, porId: new Map(armadoCrudo.biblioteca.map((a) => [a.id, a])) } : null), [armadoCrudo]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/sales/exploraciones/${exp.id}/propuesta`);
        const data = (await res.json().catch(() => ({}))) as Partial<DatosDelPaso> & Partial<Omit<Armado, "porId">> & { error?: string };
        if (!vivo) return;
        if (!res.ok) {
          setError(data.error ?? "No se pudo cargar el paso.");
          return;
        }
        setError(null);
        setDatos({ catalogo: data.catalogo ?? [], novedades: data.novedades ?? null });
        if (data.biblioteca && data.porDefecto && data.tarifa) setArmadoCrudo({ biblioteca: data.biblioteca, porDefecto: data.porDefecto, tarifa: data.tarifa });
      } catch {
        if (vivo) setError("No se pudo cargar el paso. Revisa tu conexión.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [exp.id]);

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}
      <ArmadoContexto.Provider value={armado}>
        <CasosDeUso catalogo={datos?.catalogo ?? []} novedades={datos?.novedades ?? null} />
      </ArmadoContexto.Provider>
      <p className="text-xs text-fg-muted">
        Con los casos elegidos, la propuesta se arma en{" "}
        <button type="button" className="text-brand hover:underline" onClick={() => irA("propuesta")}>
          Propuesta
        </button>
        .
      </p>
    </div>
  );
}

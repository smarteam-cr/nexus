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
 * Se ve como en el diseño del 2026-10-03: una franja azul arriba (cuántos sugiere el agente, otra
 * tanda, usar todos), los elegidos como filas con su marca verde, y los sugeridos en dos columnas de
 * tarjetas compactas con el porqué plegado.
 *
 * Los casos de uso del agente entran a la propuesta como contexto; la sección de casos de uso con
 * precio sale solo del catálogo, como siempre. Armar la propuesta es su propia pieza desde el
 * 2026-10-01 (PasoPropuesta.tsx).
 *
 * Desde el 2026-11-08 (pedido de Elías con Centauro Solutions; lib/casos-de-uso/armado.ts) aquí se PERSONALIZA la
 * propuesta: cada caso se arma con actividades de la biblioteca (el agente las propone; un caso del catálogo elegido a
 * mano trae las de su ficha), se quitan y se ponen actividades, y cada caso dice sus horas, su precio mínimo (horas ×
 * tarifa del segmento) y, para el vendedor, cómo subir el ticket vendiendo por valor. Si hay casos sin armar (de
 * antes), «Regenerar» los vuelve a armar: se aplica con un solo «Deshacer» (y Ctrl+Z), y lo editado a mano no se pisa.
 *
 * Desde la segunda vuelta del 2026-11-08 (Elías con Centauro: «Ventas tiene que entender qué actividades sí y cuáles no»)
 * los casos van en el orden del plan del agente, cada uno dice por qué tiene sentido para esta empresa y cómo se arma
 * (`PorQueYComo`), cada actividad tiene su ⓘ y «Cómo subir el ticket» habla en palabras simples.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useUndo } from "@/components/ui/UndoProvider";
import {
  actividadesDelElegido,
  cambiarVeces,
  cambiosRespectoDeLaFicha,
  casosSinArmar,
  enOrdenDelPlan,
  horasDeLaActividad,
  horasDeLaVenta,
  horasDelCaso,
  lineaDeCambios,
  palancaEnPalabras,
  precioMinimo,
  quitarActividad,
  sumarActividad,
  versionesQueSeAplicanSolas,
  type ActividadDelCaso,
  type ActividadLigera,
  type TarifaDeLaEmpresa,
  type ValorDeVenta,
} from "@/lib/casos-de-uso/armado";
import { ETAPAS_DE_ACTIVIDAD, formatoHoras, formatoUsd, nombreVisible, sobreQueAparte } from "@/lib/casos-de-uso/actividades-puras";
import Link from "next/link";
import { Alert, Badge, IconButton, Select, Selector } from "@/components/ui";
import { cn } from "@/lib/cn";
import { esCasoLibre, laEscalaTieneBase, type CasoDeUsoElegido, type DestinoDePropuesta, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import { useRecorridos } from "@/components/recorridos/contexto";
import { useLienzo } from "./contexto";
import { casosParaElArea, type AreaParaElCamino } from "@/lib/casos-de-uso/camino";
import { loQueLaFrena } from "@/lib/exploraciones/mapa";
import FranjaDeSugerencias, { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "./FranjaDeSugerencias";
import { useCorrida } from "./useCorrida";
import { BotonUsarTodas, UsadasHoy } from "./Propuestas";

/** Las exploraciones en las que esta pestaña ya lanzó la primera tanda (un montaje doble no lanza dos). */
const yaLanzadas = new Set<string>();

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

/** «18 h · desde 1.440 USD» y lo que falta (Dev o Diseño, o que ninguna actividad calza). */
function PrecioDelCaso({ id, caso }: { id: string; caso: CasoDeUsoElegido }) {
  const armado = useContext(ArmadoContexto);
  if (!armado) return null;
  const acts = actividadesDe(id, caso, armado);
  if (!acts.length) return <p className="text-xs text-fg-muted">{caso.sinActividad ?? "Sin actividades de la biblioteca: todavía sin precio."}</p>;
  const { horas, sinTiempo } = horasDelCaso(acts, armado.porId);
  return (
    <p className="text-xs text-fg-secondary">
      <span className="font-semibold text-fg">{formatoHoras(horas)}</span>
      {" · "}
      <span className="font-semibold text-fg">desde {formatoUsd(precioMinimo(horas, armado.tarifa))}</span>
      {sinTiempo.length > 0 && <span className="text-fg-muted"> + lo que defina {sinTiempo.join(" y ")}</span>}
      <span className="text-fg-muted">
        {" "}
        · {acts.length} {acts.length === 1 ? "actividad" : "actividades"}
      </span>
    </p>
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
 * Por qué el caso y cómo se arma (2026-11-08, Elías con Centauro: «Ventas tiene que entender qué actividades sí y cuáles
 * no»). Corto, para quien vende: su lugar en el plan, por qué para esta empresa, cómo se armó y, en uno del catálogo, qué
 * cambió frente a su ficha (eso lo calcula la pantalla, así que sigue los cambios a mano).
 */
function PorQueYComo({ id, caso, conRazon }: { id: string; caso: CasoDeUsoElegido; conRazon: boolean }) {
  const armado = useContext(ArmadoContexto);
  /* La razón, solo si la escribió el agente para esta empresa: en un caso elegido a mano del catálogo es la descripción
     genérica de la ficha (revisión del 2026-11-08). */
  const porQue = caso.paraVentas?.porQue || (conRazon && caso.armado ? caso.razon : "");
  const comoSeArma = caso.paraVentas?.comoSeArma ?? "";
  const ficha = id.startsWith("cat-") ? armado?.porDefecto[id.slice(4)] : undefined;
  const cambios = armado ? cambiosRespectoDeLaFicha(actividadesDe(id, caso, armado), ficha, (a) => armado.porId.get(a)?.nombre) : null;
  const frente = cambios ? lineaDeCambios(cambios) : "";
  if (!porQue && !comoSeArma && !frente && !caso.plan?.despuesDe) return null;
  return (
    <div className="mt-1.5 space-y-0.5 rounded-lg bg-surface-muted px-3 py-2 text-xs leading-normal text-fg-secondary">
      {caso.plan?.despuesDe && (
        <p>
          <span className="font-medium text-fg">Por qué en este orden:</span> {caso.plan.despuesDe}
        </p>
      )}
      {porQue && (
        <p>
          <span className="font-medium text-fg">Por qué para esta empresa:</span> {porQue}
        </p>
      )}
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

/** La lista de actividades de un caso. Editable en un caso elegido: quitar, poner de la biblioteca y cambiar las veces. */
function ActividadesDelCaso({ id, caso, editable }: { id: string; caso: CasoDeUsoElegido; editable: boolean }) {
  const armado = useContext(ArmadoContexto);
  const { exp, cambiar, guardando } = useLienzo();
  const { pushUndo } = useUndo();
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
  return (
    <div className="space-y-1.5">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {acts.map((a, i) => {
          const lib = armado.porId.get(a.actividadId);
          const nombre = nombreVisible(a, lib?.nombre);
          return (
            <li key={`${a.actividadId}-${a.sobreQue ?? ""}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <span className="min-w-0 flex-1 text-fg">
                {nombre}
                {a.sobreQue && sobreQueAparte({ nombre, sobreQue: a.sobreQue }) && <span className="text-fg-muted"> · {a.sobreQue}</span>}
                {/* Qué se hace en la actividad, en una frase de la biblioteca (2026-11-08): para quien vende. */}
                {lib?.resumen && (
                  <span
                    tabIndex={0}
                    role="img"
                    aria-label={`Qué se hace en «${nombre}»: ${lib.resumen}`}
                    title={lib.resumen}
                    className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-line align-[-1px] text-[9px] font-semibold leading-none text-fg-muted hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                  >
                    i
                  </span>
                )}
                {/* La actividad de la biblioteca detrás del nombre del caso: de ahí sale el tiempo. */}
                {lib && lib.nombre !== nombre && <span className="block text-[11px] text-fg-muted">Biblioteca: {lib.nombre}</span>}
                {!lib && <span className="text-danger-ink"> · ya no está en la biblioteca</span>}
              </span>
              {editable && lib?.seRepite ? (
                <span className="flex items-center gap-1">
                  <IconButton
                    size="xs"
                    variant="subtle"
                    aria-label={`Una vez menos «${nombre}»`}
                    icon={<span aria-hidden="true">−</span>}
                    disabled={guardando || a.veces <= 1}
                    onClick={() => guardar(cambiarVeces(caso, acts, i, a.veces - 1), `Bajaste «${nombre}» a ${a.veces - 1}`)}
                  />
                  <span className="w-6 text-center tabular-nums text-fg-secondary">{a.veces}×</span>
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
                a.veces > 1 && <span className="tabular-nums text-fg-muted">{a.veces}×</span>
              )}
              <span className="w-14 text-right tabular-nums text-fg-muted">
                {lib ? (lib.horasPendientes ? (lib.quien.startsWith("Dev") ? "Dev" : "Diseño") : formatoHoras(horasDeLaActividad(a, lib))) : "—"}
              </span>
              {editable && (
                <IconButton
                  size="xs"
                  aria-label={`Quitar «${nombre}»`}
                  title="Quitar la actividad"
                  icon={<span aria-hidden="true">×</span>}
                  disabled={guardando}
                  onClick={() => guardar(quitarActividad(caso, acts, i), `Quitaste «${nombre}» de «${caso.titulo}»`)}
                />
              )}
            </li>
          );
        })}
        {acts.length === 0 && <li className="px-3 py-2 text-xs text-fg-muted">Sin actividades.</li>}
      </ul>
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

/** Las dimensiones que mueve un caso, por nombre. */
function useMueve(caso: CasoDeUsoElegido): string[] {
  const { escala } = useLienzo();
  const nombreDim = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre;
  return (caso.dimensiones ?? []).map(nombreDim).filter((x): x is string => !!x);
}

/**
 * Un caso elegido: una fila con su marca verde, el área, lo que mueve y su precio mínimo. Se abre para ver y cambiar
 * sus actividades y el argumento de valor. Si «Regenerar» dejó una versión nueva, lo dice ahí mismo.
 */
function FilaElegida({
  id,
  caso,
  onQuitar,
  nueva,
  paso,
}: {
  id: string;
  caso: CasoDeUsoElegido;
  onQuitar?: () => void;
  nueva?: ItemPropuesto;
  /** Su número en el plan, contado entre los elegidos (el del agente puede saltar uno que no se eligió). */
  paso?: number;
}) {
  const { escala, guardando, puedeEditar, usar, cambiar } = useLienzo();
  const [abierta, setAbierta] = useState(false);
  const mueve = useMueve(caso);
  const area = escala.areas.find((a) => a.id === caso.areaId)?.nombre ?? "Sin área";
  return (
    <li className="rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success-surface text-xs font-bold text-success-ink" aria-hidden="true">
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">
            {caso.titulo}
            {caso.aMano && <span className="ml-2 text-[11px] font-normal text-fg-muted">· actividades editadas a mano</span>}
          </p>
          <p className="text-xs text-fg-muted">
            {paso && <span className="font-medium text-fg-secondary">Paso {paso} · </span>}
            {area}
            {!esCasoLibre(id) && (caso.tituloDelCatalogo ? ` · del catálogo: «${caso.tituloDelCatalogo}»` : " · del catálogo")}
            {mueve.length > 0 && ` · Mueve: ${mueve.join(", ")}`}
          </p>
          <PrecioDelCaso id={id} caso={caso} />
          <PorQueYComo id={id} caso={caso} conRazon />
        </div>
        <button type="button" aria-expanded={abierta} className="flex-shrink-0 text-xs font-medium text-brand hover:underline" onClick={() => setAbierta((x) => !x)}>
          {abierta ? "Actividades ▴" : "Actividades ▾"}
        </button>
        {onQuitar && (
          <BotonTexto className="flex-shrink-0" disabled={guardando} onClick={onQuitar}>
            Quitar
          </BotonTexto>
        )}
      </div>
      {nueva && puedeEditar && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-info-surface px-3.5 py-2 text-xs text-fg-secondary">
          <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />
          <span className="min-w-0 flex-1">
            {caso.aMano
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
      )}
      {abierta && (
        <div className="space-y-2 border-t border-line px-3.5 py-3">
          <ActividadesDelCaso id={id} caso={caso} editable={!!onQuitar} />
          {caso.valorDeVenta && <ValorDelCaso valor={caso.valorDeVenta} />}
        </div>
      )}
    </li>
  );
}

/** Un caso sugerido: tarjeta compacta con el porqué plegado, «Descartar» en texto y «Usar». */
function TarjetaSugerida({ item }: { item: ItemPropuesto }) {
  const { escala, cambiar, usar, queHace, puedeEditar, guardando } = useLienzo();
  const [abierta, setAbierta] = useState(false);
  const caso = item.valor as CasoDeUsoElegido;
  const mueve = useMueve(caso);
  const area = escala.areas.find((a) => a.id === caso.areaId)?.nombre;
  const cita = item.fuentes.find((f) => f.cita);
  const porQue = caso.razon || item.razon;
  const hayMas = !!porQue || !!cita || (caso.descripcion?.length ?? 0) > 120 || !!caso.actividades || !!caso.valorDeVenta;
  return (
    <li className="flex flex-col rounded-xl border border-info-line bg-surface">
      <div className="flex flex-col gap-1.5 px-4 pb-3 pt-3.5">
        <p className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-info-line bg-info-surface py-0.5 pl-1.5 pr-2 text-[11px] font-semibold leading-none text-brand">
            <IconoDeSugerencia className="h-[13px] w-[13px]" />
            Sugerido
          </span>
          {area && <span className="text-xs text-fg-muted">{area}</span>}
        </p>
        <h3 className="text-[15px] font-semibold leading-[1.35] text-fg">{caso.titulo}</h3>
        {caso.tituloDelCatalogo && <p className="text-[11px] text-fg-muted">Del catálogo: «{caso.tituloDelCatalogo}»</p>}
        {caso.descripcion && <p className={cn("text-[13px] leading-normal text-fg-secondary", !abierta && "line-clamp-2")}>{caso.descripcion}</p>}
        <PrecioDelCaso id={item.destino.tipo === "casoDeUso" ? item.destino.useCaseId : ""} caso={caso} />
        {item.destino.tipo === "casoDeUso" && <PorQueYComo id={item.destino.useCaseId} caso={caso} conRazon={false} />}
        {mueve.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-fg-muted">Mueve</span>
            {mueve.map((m) => (
              <span key={m} className="rounded-md border border-line bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-fg-secondary">
                {m}
              </span>
            ))}
          </p>
        )}
        {abierta && (porQue || cita?.cita) && (
          <div className="mt-1 rounded-lg bg-surface-muted px-3 py-2.5 text-[13px] leading-normal text-fg-secondary">
            {porQue && (
              <>
                <span className="font-medium text-fg">Por qué: </span>
                {porQue}
              </>
            )}
            {cita?.cita && (
              <span className="mt-1 block text-xs italic text-fg-muted">
                «{cita.cita}» · {cita.etiqueta}
              </span>
            )}
          </div>
        )}
        {abierta && caso.actividades && item.destino.tipo === "casoDeUso" && <ActividadesDelCaso id={item.destino.useCaseId} caso={caso} editable={false} />}
        {abierta && caso.valorDeVenta && <ValorDelCaso valor={caso.valorDeVenta} />}
      </div>
      <div className="mt-auto flex items-center gap-1 border-t border-line py-2 pl-4 pr-2.5">
        {hayMas && (
          <button type="button" aria-expanded={abierta} className="text-xs font-medium text-brand hover:underline" onClick={() => setAbierta((x) => !x)}>
            {abierta ? "Por qué y actividades ▴" : "Por qué y actividades ▾"}
          </button>
        )}
        <span className="flex-1" />
        {puedeEditar && (
          <>
            <BotonTexto disabled={guardando} onClick={() => void cambiar([{ op: "descartar", itemIds: [item.id] }])}>
              Descartar
            </BotonTexto>
            <BotonAzul disabled={guardando} title={queHace(item).texto} onClick={() => void usar([item])}>
              Usar
            </BotonAzul>
          </>
        )}
      </div>
    </li>
  );
}

const esCaso = (d: DestinoDePropuesta) => d.tipo === "casoDeUso";

function CasosDeUso({ catalogo }: { catalogo: Caso[] }) {
  const { exp, escala, cambiar, puedeEditar, guardando, pendientesPara, mapa, nombreDeNivel, deshacer } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const armado = useContext(ArmadoContexto);
  const { pushUndo } = useUndo();
  const e = exp.estado;
  // En el orden del plan que armó el agente (2026-11-08): uno detrás de otro.
  const elegidos = enOrdenDelPlan(Object.entries(e.contenido.casosDeUso), ([, c]) => c.plan?.paso);
  const areas = escala.areas.filter((a) => e.areas.includes(a.id));
  const todosLosPropuestos = pendientesPara((d) => d.tipo === "casoDeUso");
  /* La versión nueva de un caso ya elegido (la deja «Regenerar») va en su fila, no entre los sugeridos. */
  const nuevaDe = new Map(todosLosPropuestos.flatMap((it) => (it.destino.tipo === "casoDeUso" && it.destino.useCaseId in e.contenido.casosDeUso ? [[it.destino.useCaseId, it] as const] : [])));
  const propuestos = enOrdenDelPlan(
    todosLosPropuestos.filter((it) => !(it.destino.tipo === "casoDeUso" && nuevaDe.has(it.destino.useCaseId))),
    (it) => (it.valor as CasoDeUsoElegido).plan?.paso,
  );
  const sinArmar = casosSinArmar(
    elegidos.map(([, c]) => c),
    propuestos.map((it) => it.valor as CasoDeUsoElegido),
    e.areas,
  );
  const anteriores = e.propuesta.casosAnteriores ?? null;
  /* «Deshacer» del último «Regenerar» vale el mismo día: después ya deshacería lo que el vendedor eligió entretanto. */
  const [abiertoEn] = useState(() => Date.now());
  const anterioresRecientes = anteriores && abiertoEn - Date.parse(anteriores.en) < 12 * 3600_000 ? anteriores : null;

  /* «Regenerar» (2026-11-08): cuando termina la corrida que lanzó ESTA pestaña, las versiones nuevas de los casos
     elegidos se usan solas —menos las de los que el vendedor editó a mano— y todo se deshace junto: el aviso, Ctrl+Z o
     el botón «Deshacer» de la franja. */
  const esperando = useRef<string | null | undefined>(undefined);
  /** La corrida que había al lanzar: si la que sigue termina con error, esta pestaña deja de esperar. */
  const corridaAlLanzar = useRef<string | null>(null);
  /* `usadas`: las versiones nuevas que se usaron (su id); deshacer las devuelve con lo que había y después vuelven las
     sugerencias de antes. `deshacer` lee lo guardado al momento, no esta pantalla. */
  const deshacerRegenerar = useCallback(
    async (corridaId: string, usadas: string[]): Promise<boolean> => {
      // Si no se pudieron devolver los casos, no se traen las sugerencias de antes: quedaría deshecho a medias.
      if (usadas.length && !(await deshacer(usadas, "la versión nueva de los casos"))) return false;
      return cambiar([{ op: "devolverCasosAnteriores", corridaId }]);
    },
    [deshacer, cambiar],
  );
  useEffect(() => {
    if (esperando.current === undefined || corriendo) return;
    // La corrida que lanzó terminó con error: ya no espera (si no, aplicaría el «Regenerar» de otra pestaña).
    if (corrida && corrida.id !== corridaAlLanzar.current && corrida.estado === "ERROR") {
      esperando.current = undefined;
      return;
    }
    if (!anteriores || anteriores.corridaId === esperando.current) return;
    esperando.current = undefined;
    const corridaId = anteriores.corridaId;
    const aUsar = versionesQueSeAplicanSolas(todosLosPropuestos, e.contenido.casosDeUso, corridaId);
    void (async () => {
      if (aUsar.length && !(await cambiar([{ op: "usarVarias", items: aUsar.map((it) => ({ itemId: it.id, valor: it.valor })) }]))) return;
      pushUndo({
        scope: `exploracion:${exp.id}`,
        label: aUsar.length ? `Regeneraste los casos: ${aUsar.length} ${aUsar.length === 1 ? "se actualizó" : "se actualizaron"}` : "Regeneraste los casos de uso",
        undo: () => deshacerRegenerar(
          corridaId,
          aUsar.map((it) => it.id),
        ),
      });
    })();
  }, [anteriores, corriendo, corrida, todosLosPropuestos, e.contenido.casosDeUso, cambiar, pushUndo, exp.id, deshacerRegenerar]);
  const regenerar = async () => {
    esperando.current = anteriores?.corridaId ?? null;
    corridaAlLanzar.current = corrida?.id ?? null;
    const arranco = await lanzar("casos", { regenerar: true });
    if (!arranco) esperando.current = undefined;
  };
  const usadasDelRegenerar = anterioresRecientes ? (e.contenido.usadas ?? []).filter((u) => u.item.corridaId === anterioresRecientes.corridaId).map((u) => u.id) : [];
  // Del catálogo de Smarteam, solo los que tocan un área en juego; los de la tabla (con precio), todos.
  const libres = catalogo.filter((c) => !(c.id in e.contenido.casosDeUso) && (!c.areas || c.areas.some((a) => e.areas.includes(a))));
  const yaPropuso = e.propuesta.corridas.some((c) => c.modo === "casos");
  const conBase = laEscalaTieneBase(e);

  /* La primera vez que se abre el paso, el agente propone solo. Si en ese momento ya trabajaba en
     otra cosa, no se insiste: queda el botón. Un recorrido guiado abre la pieza para mostrarla: ahí
     no se gasta al agente. */
  const enRecorrido = !!useRecorridos()?.activo;
  useEffect(() => {
    if (enRecorrido || !puedeEditar || areas.length === 0 || !conBase || yaPropuso || yaLanzadas.has(exp.id)) return;
    yaLanzadas.add(exp.id);
    void lanzar("casos");
  }, [enRecorrido, puedeEditar, areas.length, conBase, yaPropuso, exp.id, lanzar]);

  const quitar = (id: string) => void cambiar([{ op: "casoDeUso", useCaseId: id, valor: null }]);
  const elegirDelCatalogo = (caso: Caso, areaId: string | null) => {
    // Las dimensiones que mueve en el área elegida (sin área, todas): así el caso dice qué sube, como los del agente.
    const dimensiones = (caso.dimensiones ?? []).filter((d) => !areaId || d.split(".")[0] === areaId).slice(0, 8);
    void cambiar([
      {
        op: "casoDeUso",
        useCaseId: caso.id,
        valor: { titulo: caso.titulo, areaId, razon: caso.descripcion.slice(0, 400), ...(dimensiones.length ? { dimensiones } : {}) },
      },
    ]);
  };
  /* Ficha B (2026-10-17): los casos de la biblioteca que mueven a cada área desde donde parece estar hoy (lo confirmado
     y, donde no hay, las hipótesis), los que destraban lo que la frena primero. Sin IA: sale del mapa y del catálogo
     (lib/casos-de-uso/camino.ts). */
  const yaElegidos = new Set(elegidos.map(([id]) => (id.startsWith("cat-") ? id.slice(4) : id)));
  const porLaEscala = conBase
    ? areas.flatMap((a) => {
        const calculo = mapa.chequeo.areas.find((x) => x.id === a.id);
        if (!calculo?.nivel) return [];
        const paraElCamino: AreaParaElCamino = {
          id: a.id,
          nombre: a.nombre,
          nivel: calculo.nivel,
          objetivo: calculo.objetivo,
          frena: loQueLaFrena(calculo),
          capas: {
            base: { nombre: "", nivel: calculo.capas.base.nivel },
            produccion: { nombre: "", nivel: calculo.capas.produccion.nivel },
          },
          dimensiones: calculo.dimensiones.map((d) => ({ id: d.id, nombre: d.nombre, aplica: d.aplica, nivel: d.nivel, clase: mapa.posiciones[d.id]?.clase ?? null })),
        };
        return casosParaElArea(paraElCamino, { excluir: yaElegidos, nombreDeNivel }).map((c) => ({ ...c, area: a }));
      })
    : [];
  const esPropia = corrida?.modo === "casos";
  const nombresDeAreas = areas.map((a) => a.nombre).join(" y ");

  return (
    <div className="space-y-6">
      <div data-recorrido="preventa.casos.agente">
        <FranjaDeSugerencias
          acciones={
            puedeEditar && (
              <>
                <BotonBlanco disabled={lanzando || corriendo || areas.length === 0 || !conBase} onClick={() => void lanzar("casos")}>
                  {lanzando ? "Pidiendo…" : yaPropuso || propuestos.length > 0 ? "Proponer otra tanda" : "Proponer casos de uso"}
                </BotonBlanco>
                {(elegidos.length > 0 || yaPropuso) && (
                  <BotonBlanco
                    disabled={lanzando || corriendo || areas.length === 0 || !conBase}
                    title="Vuelve a armar los casos elegidos con la biblioteca de actividades y reemplaza las sugerencias sin armar. Se puede deshacer."
                    onClick={() => void regenerar()}
                  >
                    Regenerar
                  </BotonBlanco>
                )}
                {propuestos.length > 1 && <BotonUsarTodas items={propuestos} lugar="casos" />}
              </>
            )
          }
        >
          {corriendo && esPropia ? (
            <span role="status">El agente está pensando los casos: {corrida?.fase ?? "empezando…"}</span>
          ) : !conBase ? (
            <>
              Los casos de uso se proponen cuando la escala tenga sus primeros niveles: después del diagnóstico o de la primera reunión. Sin eso, no habría sobre qué
              basarlos.
            </>
          ) : propuestos.length > 0 ? (
            <>
              <strong>
                El agente sugiere {propuestos.length} {propuestos.length === 1 ? "caso" : "casos"}
              </strong>
              {nombresDeAreas ? ` para ${nombresDeAreas}` : ""}, según dónde está cada equipo. Parte del catálogo de Smarteam; cada uno con su precio mínimo por sus actividades.
            </>
          ) : (
            <>El agente propone casos de uso del catálogo de Smarteam según dónde está cada equipo en la escala y lo que contó el cliente, y uno propio si ninguno calza, cada uno con sus actividades y su precio mínimo. Cada tanda cuesta unos centavos.</>
          )}
        </FranjaDeSugerencias>
      </div>

      {corrida?.estado === "ERROR" && esPropia && <Alert variant="danger">{corrida.error}</Alert>}
      {puedeEditar && conBase && sinArmar > 0 && !(corriendo && esPropia) && (
        <Alert
          variant="warning"
          title="Regenera para actualizar"
          action={
            <BotonAzul disabled={lanzando || corriendo || areas.length === 0} onClick={() => void regenerar()}>
              Regenerar
            </BotonAzul>
          }
        >
          {sinArmar === 1 ? "Un caso todavía no está armado" : `${sinArmar} casos todavía no están armados`} para esta empresa: sus actividades son las de la ficha (o
          ninguna) y no tienen el argumento de valor. Regenerar los arma con la biblioteca de actividades; lo que cambiaste a mano no se pisa, y se puede deshacer
          con Ctrl+Z.
        </Alert>
      )}
      {puedeEditar && anterioresRecientes && !corriendo && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          Regeneraste los casos hoy.
          <BotonTexto disabled={guardando} onClick={() => void deshacerRegenerar(anterioresRecientes.corridaId, usadasDelRegenerar)}>
            Deshacer
          </BotonTexto>
        </p>
      )}
      {areas.length === 0 && <p className="text-sm text-fg-muted">Elige primero las áreas en juego (en «La escala»): los casos de uso se proponen por área.</p>}

      {elegidos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Elegidos · {elegidos.length}</h2>
          <ul className="space-y-2">
            {elegidos.map(([id, caso], i) => (
              <FilaElegida
                key={id}
                id={id}
                caso={caso}
                nueva={nuevaDe.get(id)}
                paso={caso.plan ? i + 1 : undefined}
                onQuitar={puedeEditar ? () => quitar(id) : undefined}
              />
            ))}
          </ul>
          {armado && <TotalDeLaVenta elegidos={elegidos} armado={armado} />}
        </section>
      )}

      {propuestos.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Sugeridos por el agente · {propuestos.length}</h2>
          <ul className="grid items-start gap-3 xl:grid-cols-2">
            {propuestos.map((it) => (
              <TarjetaSugerida key={it.id} item={it} />
            ))}
          </ul>
          <UsadasHoy filtro={esCaso} />
        </section>
      ) : (
        <UsadasHoy filtro={esCaso} sinPendientes />
      )}

      {porLaEscala.length > 0 && (
        <section className="space-y-2" data-recorrido="preventa.casos.biblioteca">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Sugeridos por la escala · de la biblioteca · {porLaEscala.length}</h2>
          <ul className="grid items-start gap-3 xl:grid-cols-2">
            {porLaEscala.map((c) => (
              <li key={c.area.id + c.caso.id} className="flex flex-col gap-1.5 rounded-xl border border-info-line bg-info-surface p-3.5">
                <p className="flex items-start gap-2 text-sm font-medium text-fg">
                  <IconoDeSugerencia className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">{c.caso.titulo}</span>
                </p>
                <p className="text-xs text-fg-secondary">{c.caso.promesa}</p>
                <p className="text-xs text-brand">
                  {c.area.nombre}: {c.razon}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={"/sales/use-cases/" + c.caso.id} target="_blank" className="text-xs text-brand hover:text-brand-light">
                    Ver el caso
                  </Link>
                  {puedeEditar && (
                    <BotonBlanco
                      disabled={guardando}
                      onClick={() =>
                        elegirDelCatalogo(
                          { id: "cat-" + c.caso.id, titulo: c.caso.titulo, descripcion: c.caso.descripcion, precio: null, dimensiones: c.caso.mueve.map((m) => m.dimension) },
                          c.area.id,
                        )
                      }
                    >
                      Elegir para {c.area.nombre}
                    </BotonBlanco>
                  )}
                </div>
              </li>
            ))}
          </ul>
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
      Todos juntos: <span className="font-semibold text-fg">{formatoHoras(horas)}</span> ·{" "}
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
        setDatos({ catalogo: data.catalogo ?? [] });
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
        <CasosDeUso catalogo={datos?.catalogo ?? []} />
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

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
 *
 * Desde la tercera vuelta del 2026-11-08 (Elías: «lo más importante es ver qué casos se sugieren y por qué; luego, que la
 * persona los acepte y ya aparezcan las actividades personalizadas»; lib/casos-de-uso/personalizar.ts) el paso va en tres
 * tiempos: arriba los SUGERIDOS con su porqué a la vista; al ACEPTAR uno, el agente personaliza sus actividades para la
 * empresa y la fila dice qué cambió frente a la ficha en dos o tres líneas; y «REVISAR» vuelve a mirar todo con lo que se
 * sabe hoy y dice qué cambió (o que nada), sin tocar lo elegido. Nada corre solo al entrar: si llegó algo nuevo desde la
 * última mirada (reuniones, la escala), un aviso arriba lo dice y ofrece revisar. Quitar un elegido lo devuelve a los
 * sugeridos. «Regenerar» y «Proponer otra tanda» se fueron: los reemplazan «Revisar» y «Personalizar» de cada caso.
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
  sumarActividad,
  type ActividadDelCaso,
  type ActividadLigera,
  type TarifaDeLaEmpresa,
  type ValorDeVenta,
} from "@/lib/casos-de-uso/armado";
import { ETAPAS_DE_ACTIVIDAD, formatoHoras, formatoUsd, nombreVisible, sobreQueAparte } from "@/lib/casos-de-uso/actividades-puras";
import Link from "next/link";
import { Alert, Badge, IconButton, Select, Selector, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { esCasoLibre, laEscalaTieneBase, type CasoDeUsoElegido, type DestinoDePropuesta, type ItemPropuesto } from "@/lib/exploraciones/contenido";
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
import { casosParaElArea, type AreaParaElCamino } from "@/lib/casos-de-uso/camino";
import { loQueLaFrena } from "@/lib/exploraciones/mapa";
import FranjaDeSugerencias, { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "./FranjaDeSugerencias";
import { useCorrida } from "./useCorrida";
import { BotonUsarTodas, UsadasHoy } from "./Propuestas";

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

/**
 * «18 h · desde 1.440 USD» y lo que falta (Dev o Diseño, o que ninguna actividad calza). `conLaFicha`: un sugerido sin
 * personalizar, cuyo precio sale de la ficha del catálogo (al aceptarlo, el agente lo ajusta a la empresa).
 */
function PrecioDelCaso({ id, caso, conLaFicha = false }: { id: string; caso: CasoDeUsoElegido; conLaFicha?: boolean }) {
  const armado = useContext(ArmadoContexto);
  if (!armado) return null;
  const acts = actividadesDe(id, caso, armado);
  if (!acts.length)
    return (
      <p className="text-xs text-fg-muted">
        {caso.sinActividad ?? (conLaFicha ? "Sin ficha en el catálogo: el precio sale al aceptarlo, cuando el agente arme sus actividades." : "Sin actividades de la biblioteca: todavía sin precio.")}
      </p>
    );
  const { horas, sinTiempo } = horasDelCaso(acts, armado.porId);
  return (
    <p className="text-xs text-fg-secondary">
      {conLaFicha && <span className="text-fg-muted">Con la ficha del catálogo: </span>}
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
  /* Personalizado y sin tocar a mano, el resumen del agente (`LoPersonalizado`) ya dice qué cambió frente a la ficha: la
     línea calculada sería la misma dos veces. Si lo cambiaron a mano, la calculada es la de hoy. */
  const frente = cambios && (!caso.personalizado || caso.aMano) ? lineaDeCambios(cambios) : "";
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
 * Personalizar un caso aceptado (2026-11-08, lib/casos-de-uso/personalizar.ts): la llamada al agente, cuáles están en
 * curso y qué dijo la última revisión de cada caso. Lo comparten las filas, las tarjetas y la lista del catálogo.
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
    <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-warning bg-surface-muted px-3 py-1.5 text-xs text-fg-secondary">
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
    <div className="mt-1.5 rounded-lg border border-info-line bg-info-surface px-3 py-2 text-xs leading-normal text-fg-secondary">
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

/**
 * Un caso elegido: una fila con su marca verde, el área, lo que mueve y su precio mínimo. Al aceptarlo se personalizan sus
 * actividades (dice «Personalizando…» mientras tanto) y después muestra qué cambió frente a la ficha. Se abre para ver y
 * cambiar sus actividades y el argumento de valor. Si quedó una versión nueva (la personalizada, cuando se tocó el caso
 * mientras tanto), lo dice ahí mismo. Quitarlo lo devuelve a los sugeridos.
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
  const { personalizando, personalizar, revisionDe } = useContext(PersonalizarContexto);
  const [abierta, setAbierta] = useState(false);
  const mueve = useMueve(caso);
  const area = escala.areas.find((a) => a.id === caso.areaId)?.nombre ?? "Sin área";
  const enCurso = personalizando.has(id);
  const revision = revisionDe.get(id);
  // Los de antes que armó «Regenerar» (`armado`) ya tienen sus actividades para la empresa: no se ofrecen de nuevo.
  const sinPersonalizar = !caso.personalizado && !caso.armado && !caso.aMano;
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
          {enCurso ? (
            <p role="status" className="mt-1.5 flex items-center gap-1.5 text-xs text-brand">
              <IconoDeSugerencia className="h-3.5 w-3.5" />
              Personalizando sus actividades con lo que sabemos de la empresa… (unos 30 segundos)
            </p>
          ) : (
            sinPersonalizar &&
            puedeEditar && (
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                Todavía con las actividades de la ficha del catálogo{esCasoLibre(id) ? " (o ninguna)" : ""}.
                <BotonTexto disabled={guardando} onClick={() => personalizar(id)}>
                  Personalizar
                </BotonTexto>
              </p>
            )
          )}
          <LoPersonalizado caso={caso} />
          <PorQueYComo id={id} caso={caso} conRazon />
          {revision && (
            <NotaDeLaRevision cambio={revision}>
              {puedeEditar && revision.veredicto === "cambia" && (
                <BotonTexto disabled={guardando || enCurso} onClick={() => personalizar(id)}>
                  Volver a personalizar
                </BotonTexto>
              )}
            </NotaDeLaRevision>
          )}
        </div>
        <button type="button" aria-expanded={abierta} className="flex-shrink-0 text-xs font-medium text-brand hover:underline" onClick={() => setAbierta((x) => !x)}>
          {abierta ? "Actividades ▴" : "Actividades ▾"}
        </button>
        {onQuitar && (
          <BotonTexto className="flex-shrink-0" disabled={guardando} title="Lo saca de los elegidos y vuelve a los sugeridos" onClick={onQuitar}>
            Quitar
          </BotonTexto>
        )}
      </div>
      {nueva && puedeEditar && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-info-surface px-3.5 py-2 text-xs text-fg-secondary">
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
      )}
      {abierta && (
        <div className="space-y-2 border-t border-line px-3.5 py-3">
          <ActividadesDelCaso id={id} caso={caso} editable={!!onQuitar} />
          {caso.valorDeVenta && <ValorDelCaso valor={caso.valorDeVenta} />}
          {puedeEditar && !sinPersonalizar && !enCurso && (
            <p className="text-xs text-fg-muted">
              <BotonTexto disabled={guardando} onClick={() => personalizar(id)}>
                Volver a personalizar
              </BotonTexto>{" "}
              con lo que se sabe hoy{caso.aMano ? " (tus cambios se quedan hasta que elijas la versión nueva)" : ""}.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Un caso sugerido: tarjeta compacta con su PORQUÉ a la vista (lo primero que hay que ver, pedido 8 de Elías), «Descartar»
 * en texto y «Aceptar». Al aceptarlo se personalizan sus actividades. «Ver más» abre la descripción entera, la cita, las
 * actividades de la ficha y el valor, si los tiene: el desplegable ya no es una tabla grande (pedido 5).
 */
function TarjetaSugerida({ item, onAceptar }: { item: ItemPropuesto; onAceptar: (item: ItemPropuesto) => void }) {
  const { escala, cambiar, queHace, puedeEditar, guardando } = useLienzo();
  const { revisionDe } = useContext(PersonalizarContexto);
  const [abierta, setAbierta] = useState(false);
  const caso = item.valor as CasoDeUsoElegido;
  const useCaseId = item.destino.tipo === "casoDeUso" ? item.destino.useCaseId : "";
  const mueve = useMueve(caso);
  const area = escala.areas.find((a) => a.id === caso.areaId)?.nombre;
  const cita = item.fuentes.find((f) => f.cita);
  const porQue = caso.paraVentas?.porQue || caso.razon || item.razon;
  const revision = revisionDe.get(useCaseId);
  const hayMas = !!cita || (caso.descripcion?.length ?? 0) > 120 || (porQue?.length ?? 0) > 200 || useCaseId.startsWith("cat-") || !!caso.actividades || !!caso.valorDeVenta;
  return (
    <li className="flex flex-col rounded-xl border border-info-line bg-surface">
      <div className="flex flex-col gap-1.5 px-4 pb-3 pt-3.5">
        <p className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-info-line bg-info-surface py-0.5 pl-1.5 pr-2 text-[11px] font-semibold leading-none text-brand">
            <IconoDeSugerencia className="h-[13px] w-[13px]" />
            Sugerido
          </span>
          {area && <span className="text-xs text-fg-muted">{area}</span>}
          {caso.plan && <span className="text-xs text-fg-muted">· Paso {caso.plan.paso}</span>}
        </p>
        <h3 className="text-[15px] font-semibold leading-[1.35] text-fg">{caso.titulo}</h3>
        {caso.tituloDelCatalogo && <p className="text-[11px] text-fg-muted">Del catálogo: «{caso.tituloDelCatalogo}»</p>}
        {porQue && (
          <p className={cn("text-[13px] leading-normal text-fg-secondary", !abierta && "line-clamp-3")}>
            <span className="font-medium text-fg">Por qué: </span>
            {porQue}
          </p>
        )}
        {caso.plan?.despuesDe && (
          <p className={cn("text-xs leading-normal text-fg-secondary", !abierta && "line-clamp-2")}>
            <span className="font-medium text-fg">Por qué en este orden:</span> {caso.plan.despuesDe}
          </p>
        )}
        {revision && <NotaDeLaRevision cambio={revision} />}
        {caso.descripcion && <p className={cn("text-xs leading-normal text-fg-muted", !abierta && "line-clamp-2")}>{caso.descripcion}</p>}
        <PrecioDelCaso id={useCaseId} caso={caso} conLaFicha={!caso.personalizado && !caso.armado} />
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
        {abierta && (
          <div className="mt-1 space-y-2">
            {cita?.cita && (
              <p className="text-xs italic text-fg-muted">
                «{cita.cita}» · {cita.etiqueta}
              </p>
            )}
            <LoPersonalizado caso={caso} />
            {useCaseId && (useCaseId.startsWith("cat-") || caso.actividades) && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  {caso.personalizado || caso.armado ? "Sus actividades" : "Las actividades de la ficha"}
                </p>
                <ActividadesDelCaso id={useCaseId} caso={caso} editable={false} />
              </div>
            )}
            {caso.valorDeVenta && <ValorDelCaso valor={caso.valorDeVenta} />}
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center gap-1 border-t border-line py-2 pl-4 pr-2.5">
        {hayMas && (
          <button type="button" aria-expanded={abierta} className="text-xs font-medium text-brand hover:underline" onClick={() => setAbierta((x) => !x)}>
            {abierta ? "Ver menos ▴" : "Ver más ▾"}
          </button>
        )}
        <span className="flex-1" />
        {puedeEditar && (
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
        )}
      </div>
    </li>
  );
}

const esCaso = (d: DestinoDePropuesta) => d.tipo === "casoDeUso";

/** Cuántas personalizaciones a la vez, al aceptar varias juntas: cada una es una llamada al agente. */
const PERSONALIZACIONES_A_LA_VEZ = 3;

function CasosDeUso({ catalogo, novedades }: { catalogo: Caso[]; novedades: NovedadesDeLosCasos | null }) {
  const { exp, escala, cambiar, puedeEditar, guardando, pendientesPara, mapa, nombreDeNivel, usar, recargar } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const armado = useContext(ArmadoContexto);
  const { pushUndo } = useUndo();
  const toast = useToast();
  const e = exp.estado;
  // En el orden del plan que armó el agente (2026-11-08): uno detrás de otro.
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
  const elegirDelCatalogo = (caso: Caso, areaId: string | null) => {
    // Las dimensiones que mueve en el área elegida (sin área, todas): así el caso dice qué sube, como los del agente.
    const dimensiones = (caso.dimensiones ?? []).filter((d) => !areaId || d.split(".")[0] === areaId).slice(0, 8);
    void cambiar([
      {
        op: "casoDeUso",
        useCaseId: caso.id,
        valor: { titulo: caso.titulo, areaId, razon: caso.descripcion.slice(0, 400), ...(dimensiones.length ? { dimensiones } : {}) },
      },
    ]).then((ok) => {
      // Elegido a mano también es aceptado: se personaliza igual (los de la tabla vieja, sin ficha, no).
      if (ok && caso.id.startsWith("cat-")) personalizar(caso.id);
    });
  };
  const revisar = () => void lanzar("casos", { revisar: true });
  const sinPersonalizar = elegidos.filter(([id, c]) => !c.personalizado && !c.armado && !c.aMano && !personalizando.has(id) && (!c.areaId || e.areas.includes(c.areaId)) && !nuevaDe.has(id));

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
                      después, «Revisar»: vuelve a mirar, sugiere lo nuevo y dice qué cambió, sin tocar lo elegido. */}
                  <BotonBlanco
                    disabled={sinPoder}
                    title={yaPropuso ? "Vuelve a mirar los casos con lo que se sabe hoy y te dice qué cambió. No toca lo elegido." : undefined}
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
                El agente sugiere casos de uso del catálogo de Smarteam según dónde está cada equipo en la escala y lo que contó el cliente, cada uno con su porqué.
                Al aceptar uno, personaliza sus actividades para esta empresa. Cada vuelta cuesta unos centavos.
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
            {cambiosVigentes.length > 0 && <span className="block">Cada caso que cambia lo dice en su tarjeta.</span>}
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

        {propuestos.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Sugeridos por el agente · {propuestos.length}</h2>
            <ul className="grid items-start gap-3 xl:grid-cols-2">
              {propuestos.map((it) => (
                <TarjetaSugerida key={it.id} item={it} onAceptar={(x) => void aceptar(x)} />
              ))}
            </ul>
            <UsadasHoy filtro={esCaso} />
          </section>
        ) : (
          <UsadasHoy filtro={esCaso} sinPendientes />
        )}

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

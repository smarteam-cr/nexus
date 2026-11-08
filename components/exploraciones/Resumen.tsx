"use client";

/**
 * Resumen — las ocho casillas del marco de calificación, en filas a lo ancho, y lo que sale de cada reunión.
 *
 * Pedido de Elías (2026-10-01): el vendedor tiene que ver DE UN VISTAZO qué le falta para poder
 * proponer. Metas, planes, retos y tiempos; presupuesto y quién decide; consecuencias de no actuar e
 * implicaciones de lograrlo. Cada tarjeta muestra lo confirmado o se ve vacía cuando falta, y avisa
 * cuando el agente propuso algo para ella; al tocarla se abre la casilla para completarla o revisar
 * lo propuesto. «Qué sigue» y a qué proyecto le llega viven en la columna de la derecha, a la vista en
 * todas las piezas (rediseño de escritorio, 2026-10-03); el cajón de la casilla vive en el lienzo.
 *
 * Debajo, lo que sale de cada reunión (pedido de Elías, 2026-10-01): las objeciones y las
 * particularidades de la cuenta, que el agente propone al leer cada sesión, como el cronograma
 * propone sus particularidades. Y, si ya hay un proyecto, a cuál le llega la exploración.
 *
 * Cada cosa en un solo lugar (2026-11-07): lo que sugirió la lectura de una sesión se revisa en «Lo que aprendimos» de
 * esa sesión; acá se ve lo acumulado (lo confirmado) y lo sugerido desde otras fuentes (el test, HubSpot, la preparación).
 * Antes, al agregar una sesión, las mismas sugerencias aparecían en los dos lados. Lo usado en la sesión ya no es pendiente.
 *
 * Arriba de todo, si la última reunión que leyó el agente se puso técnica (Elías, 2026-10-06), un
 * aviso con de qué se habló y la frase que lo muestra: para sumar a alguien técnico a la próxima.
 * Solo avisa; «Entendido» lo cierra hasta que otra reunión vuelva a ponerse técnica.
 *
 * Un resumen de verdad (Elías, 2026-11-08, tercera vuelta con Centauro): arriba, en qué va la exploración (activa, en qué
 * sesión va), los hallazgos generales y el botón del momento: «Analizar la sesión N» si la última ya pasó y no se leyó, o
 * «Preparar la sesión N» (lib/exploraciones/objetivo-y-hallazgos.ts). Las tarjetas quedan debajo.
 */
import {
  CASILLAS_DE_LAS_REUNIONES,
  CASILLAS_DEL_RESUMEN,
  definicionDe,
  ETIQUETA_DEL_ROL,
  type ClaveDeCasilla,
  type Meta,
  type Persona,
  type Reto,
} from "@/lib/exploraciones/casillas";
import { claveDeLaReunion, type DestinoDePropuesta, type ItemPropuesto, type LecturaDeReunion } from "@/lib/exploraciones/contenido";
import type { PestanaDeSesion } from "@/lib/exploraciones/guia";
import { EQUIPOS, EQUIPOS_DEL_CLIENTE, type ClaveDeEquipo } from "@/lib/exploraciones/equipos";
import { esDeUnaSesion } from "@/lib/exploraciones/despues-de-la-sesion";
import { BotonAzul, BotonEnlace, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { diaCorto, diaYHora } from "@/lib/exploraciones/fechas";
import { hallazgosParaMostrar, momentoDeLaExploracion } from "@/lib/exploraciones/objetivo-y-hallazgos";
import { useSesiones } from "./useSesiones";
import { cn } from "@/lib/cn";
import { Casilla } from "./Casilla";
import FranjaDeSugerencias, { BotonBlanco, IconoDeSugerencia } from "./FranjaDeSugerencias";
import { BotonUsarTodas, describirPropuesta, UsadasHoy } from "./Propuestas";
import { useLienzo } from "./contexto";

/** La letra del marco de cada tarjeta (GPCT, presupuesto y autoridad, C&I), con su nombre en inglés. */
export const LETRA_DEL_MARCO: Record<(typeof CASILLAS_DEL_RESUMEN)[number], { letra: string; marco: string }> = {
  metas: { letra: "G", marco: "Goals" },
  planes: { letra: "P", marco: "Plans" },
  retos: { letra: "C", marco: "Challenges" },
  tiempos: { letra: "T", marco: "Timeline" },
  presupuesto: { letra: "B", marco: "Budget" },
  autoridad: { letra: "A", marco: "Authority" },
  consecuencias: { letra: "C", marco: "Consequences" },
  implicaciones: { letra: "I", marco: "Implications" },
};

/**
 * Los tres niveles (2026-11-07): los retos y las metas de un equipo del cliente van juntos y con su nombre («Ventas · …»),
 * después de los de la empresa entera.
 */
function porEquipo<T extends { equipo?: ClaveDeEquipo }>(xs: readonly T[], texto: (x: T) => string): string[] {
  const orden = (x: T) => (x.equipo ? EQUIPOS_DEL_CLIENTE.indexOf(x.equipo) + 1 : 0);
  return [...xs].sort((a, b) => orden(a) - orden(b)).map((x) => (x.equipo ? `${EQUIPOS[x.equipo].nombre} · ${texto(x)}` : texto(x)));
}

/** Lo confirmado de una casilla, en líneas cortas para la tarjeta. */
export function lineasDe(clave: ClaveDeCasilla, valor: unknown): string[] {
  if (valor === undefined || valor === null) return [];
  const tipo = definicionDe(clave).tipo;
  switch (tipo) {
    case "texto":
      return typeof valor === "string" && valor.trim() ? [valor] : [];
    case "lista":
      return valor as string[];
    case "metas":
      return porEquipo(valor as Meta[], (m) => {
        const cifras = [m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).join(" ");
        return cifras ? `${m.que}: ${cifras}` : m.que;
      });
    case "retos":
      return porEquipo(valor as Reto[], (r) => r.texto);
    case "autoridad":
      return (valor as Persona[]).map((p) => `${p.nombre} · ${ETIQUETA_DEL_ROL[p.rol]}`);
    default:
      return [];
  }
}

/** La pastilla azul que cuenta lo sugerido. */
function Sugeridas({ n, mas }: { n: number; mas: boolean }) {
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-info-line bg-info-surface py-px pl-1.5 pr-2 text-[11px] font-semibold text-brand">
      <IconoDeSugerencia className="h-[13px] w-[13px]" />
      {mas ? "+" : ""}
      {n} {n === 1 ? "sugerida" : "sugeridas"}
    </span>
  );
}

/**
 * Una fila del marco (Elías, 2026-10-05: las cuatro columnas se leían apretadas incluso a 1080). A la
 * izquierda la letra, el nombre y en qué está (confirmado, sugeridas o falta); a la derecha, lo
 * confirmado en viñetas a lo ancho, o lo que sugirió el agente en azul. Toda la fila abre la casilla.
 */
function Fila({ clave, sugeridas, onAbrir, ultima }: { clave: (typeof CASILLAS_DEL_RESUMEN)[number]; sugeridas: ItemPropuesto[]; onAbrir: () => void; ultima: boolean }) {
  const { exp, escala, nombreDeNivel } = useLienzo();
  const def = definicionDe(clave);
  const lineas = lineasDe(clave, exp.estado.contenido.casillas[clave]);
  const vacia = lineas.length === 0;
  const n = sugeridas.length;
  const { letra, marco } = LETRA_DEL_MARCO[clave];
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "grid w-full gap-x-4 gap-y-2 px-[18px] py-4 text-left transition-colors hover:bg-surface-hover sm:grid-cols-[190px_minmax(0,1fr)_auto]",
        !ultima && "border-b border-line",
      )}
    >
      <span className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-xs font-bold",
              !vacia ? "bg-success-surface text-success-ink" : n > 0 ? "bg-info-surface text-brand" : "border border-dashed border-line text-fg-muted",
            )}
            title={marco}
          >
            {letra}
          </span>
          <span className="text-[15px] font-semibold text-fg">{def.etiqueta}</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {!vacia && (
            <span className="rounded-full border border-success-line bg-success-surface px-2 py-px text-[11px] font-semibold text-success-ink">✓ Confirmado</span>
          )}
          {n > 0 && <Sugeridas n={n} mas={!vacia} />}
          {vacia && n === 0 && <span className="rounded-full border border-dashed border-line px-2 py-px text-[11px] font-semibold text-fg-muted">Falta</span>}
        </span>
      </span>
      <span className="min-w-0">
        {!vacia ? (
          <ul className="list-disc space-y-1 pl-[18px] marker:text-fg-muted">
            {lineas.map((l, i) => (
              <li key={i} className="text-sm leading-[1.5] text-fg-secondary">
                {l}
              </li>
            ))}
          </ul>
        ) : n > 0 ? (
          <ul className="space-y-1">
            {sugeridas.map((it) => (
              <li key={it.id} className="text-sm leading-[1.5] text-brand">
                «{describirPropuesta(it, escala, nombreDeNivel)}»
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[13px] text-fg-muted">Falta: se pregunta en la próxima sesión.</span>
        )}
      </span>
      <span className="self-start pt-0.5 text-xs font-semibold text-brand">{!vacia ? (n > 0 ? "Revisar" : "Editar") : n > 0 ? "Revisar" : "Completar"}</span>
    </button>
  );
}

/** Las ocho casillas del marco, en tres bloques que se leen como una conversación. */
const BLOQUES: { titulo: string; claves: (typeof CASILLAS_DEL_RESUMEN)[number][] }[] = [
  { titulo: "El objetivo", claves: ["metas", "planes", "retos", "tiempos"] },
  { titulo: "Quién y con qué", claves: ["presupuesto", "autoridad"] },
  { titulo: "Lo que está en juego", claves: ["consecuencias", "implicaciones"] },
];

/** La última reunión se puso técnica: de qué se habló, la frase y qué conviene hacer. */
function AvisoTecnico() {
  const { exp, puedeEditar, guardando, cambiar } = useLienzo();
  const a = exp.estado.propuesta.alertaTecnica;
  if (!a || a.vista) return null;
  return (
    <section data-recorrido="preventa.resumen.tecnica" role="status" className="flex flex-wrap items-start gap-3 rounded-xl border border-warn-line bg-warn-surface px-4 py-3.5">
      <IconoDeSugerencia className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-warn-ink" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold text-warn-ink">La última reunión se puso técnica</p>
        <p className="text-[13px] text-fg-secondary">
          {a.reunion}
          {a.temas.length > 0 ? ` · ${a.temas.join(", ")}` : ""}
          {a.momento ? `. ${a.momento}` : ""}
        </p>
        {a.cita && <p className="text-[13px] italic text-fg-secondary">«{a.cita}»</p>}
        <p className="text-xs text-fg-muted">Suma a alguien técnico a la próxima reunión, o lleva esas preguntas preparadas.</p>
      </div>
      {puedeEditar && (
        <BotonBlanco disabled={guardando} onClick={() => void cambiar([{ op: "alertaTecnicaVista" }])}>
          Entendido
        </BotonBlanco>
      )}
    </section>
  );
}

/** Arriba del Resumen: en qué va la exploración, el botón del momento y los hallazgos generales. */
function EstadoDeLaExploracion() {
  const { exp, irA, sesion } = useLienzo();
  const { todas, claveDeLaProxima, estadoDeLaReunion } = useSesiones();
  const proxima = todas.find((p) => p.clave === claveDeLaProxima) ?? todas[todas.length - 1];
  const momento = momentoDeLaExploracion(
    todas.map((p) => ({ clave: p.clave, numero: p.numero, hecha: p.hecha, noSeHizo: p.noSeHizo, estado: estadoDeLaReunion(p), fecha: p.fecha })),
    { clave: proxima.clave, numero: proxima.numero },
    { archivada: exp.estado.archivada, diaCorto },
  );
  const leidas = todas.flatMap((p) => {
    const l = p.hecha && p.reunion ? exp.estado.propuesta.lecturas[claveDeLaReunion(p.reunion)] : undefined;
    return l?.resumen ? [{ numero: p.numero, resumen: l.resumen }] : [];
  });
  const hallazgos = hallazgosParaMostrar(exp.estado.propuesta.hallazgos, leidas);
  const ir = (a: NonNullable<typeof momento.accion>) => {
    irA("exploracion");
    sesion.elegir(a.clave);
    sesion.ponerMomento(a.clave, a.tipo === "analizar" ? "despues" : "antes");
  };
  return (
    <section data-recorrido="preventa.resumen.estado" className="space-y-3 rounded-xl border border-line bg-surface px-[18px] py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-[1_1_320px] space-y-0.5">
          <p className={ROTULO_DEL_SISTEMA}>La exploración</p>
          <p className="text-[15px] font-semibold text-fg">{momento.titulo}</p>
          {momento.detalle && <p className="text-[13px] text-fg-secondary">{momento.detalle}</p>}
        </div>
        {momento.accion && (
          <BotonAzul onClick={() => ir(momento.accion!)}>
            {momento.accion.tipo === "analizar" ? "Analizar" : "Preparar"} la sesión {momento.accion.numero}
          </BotonAzul>
        )}
      </div>
      <div className="space-y-1.5 border-t border-line pt-3">
        <p className={ROTULO_DEL_SISTEMA}>Hallazgos</p>
        {hallazgos.lista.length ? (
          <>
            <ul className="list-disc space-y-1 pl-[18px] marker:text-fg-muted">
              {hallazgos.lista.map((h) => (
                <li key={h} className="text-sm leading-[1.5] text-fg">
                  {h}
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted">
              {hallazgos.de === "nexus"
                ? `Los escribió Nexus al armar la última guía${hallazgos.en ? `, el ${diaYHora(hallazgos.en)}` : ""}, con todo lo que se sabe hasta hoy.`
                : "Lo que dejó cada sesión. Nexus los junta al armar la próxima guía."}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-fg-muted">Todavía no hay hallazgos: salen de las sesiones.</p>
        )}
      </div>
    </section>
  );
}

const esDelResumen = (d: DestinoDePropuesta) => d.tipo === "casilla" && definicionDe(d.clave).paso === "resumen";

/**
 * Las lecturas que se ven en «Lo que aprendimos» de su sesión: la de una sesión que ya pasó y no quedó como «se cortó»,
 * «otro canal» o «no se hizo». Lo de una reunión sacada de la exploración, o leída sin ser sesión, sigue en el Resumen.
 */
function useLecturasEnSusSesiones(): { lecturas: Record<string, LecturaDeReunion>; sesionDe: (it: ItemPropuesto) => PestanaDeSesion | null } {
  const { exp } = useLienzo();
  const { todas } = useSesiones();
  const conLectura = todas.flatMap((p) => {
    const l = p.hecha && !p.sesion?.resultado && p.reunion ? exp.estado.propuesta.lecturas[claveDeLaReunion(p.reunion)] : undefined;
    return l ? [{ p, l, k: claveDeLaReunion(p.reunion!) }] : [];
  });
  return {
    lecturas: Object.fromEntries(conLectura.map((x) => [x.k, x.l])),
    sesionDe: (it) => [...conLectura].reverse().find((x) => it.fuentes.some((f) => f.etiqueta === x.l.etiqueta))?.p ?? null,
  };
}

/** Las sugerencias que salieron de una sesión se revisan allá: cuántas hay y un enlace a la más reciente. */
function EnLasSesiones({ items }: { items: ItemPropuesto[] }) {
  const { sesion, irA } = useLienzo();
  const { sesionDe } = useLecturasEnSusSesiones();
  if (!items.length) return null;
  const conAlguna = items.map(sesionDe).filter((p): p is PestanaDeSesion => !!p).sort((a, b) => b.numero - a.numero)[0] ?? null;
  return (
    <p className="text-[13px] text-fg-secondary">
      {items.length === 1 ? "1 sugerencia de las sesiones espera" : `${items.length} sugerencias de las sesiones esperan`} en «Lo que aprendimos» de su sesión.{" "}
      {conAlguna && (
        <BotonEnlace
          className="text-[13px]"
          onClick={() => {
            irA("exploracion");
            sesion.elegir(conAlguna.clave);
            sesion.ponerMomento(conAlguna.clave, "despues");
          }}
        >
          Ir a la sesión {conAlguna.numero}
        </BotonEnlace>
      )}
    </p>
  );
}

export default function Resumen() {
  const { pendientesPara, abrirCasilla, abrirRevision } = useLienzo();
  const { lecturas } = useLecturasEnSusSesiones();
  // Lo que sugirió la lectura de una sesión se revisa en esa sesión: acá no se repite (2026-11-07).
  const deOtraFuente = (it: ItemPropuesto) => !esDeUnaSesion(it, lecturas);
  const deLaCasilla = (clave: ClaveDeCasilla) => pendientesPara((d) => d.tipo === "casilla" && d.clave === clave).filter(deOtraFuente);
  // Lo sugerido para las tarjetas y lo que sale de cada reunión: lo que se revisa en esta pieza.
  const todasDelResumen = pendientesPara(esDelResumen);
  const delResumen = todasDelResumen.filter(deOtraFuente);
  const deLasSesiones = todasDelResumen.filter((it) => !deOtraFuente(it));

  return (
    <div className="space-y-6">
      <EstadoDeLaExploracion />
      <AvisoTecnico />
      {delResumen.length > 0 ? (
        <div data-recorrido="preventa.resumen.sugerencias" className="space-y-1.5">
        <FranjaDeSugerencias
          acciones={
            <>
              <BotonBlanco onClick={() => abrirRevision("resumen")}>Revisar una por una</BotonBlanco>
              <BotonUsarTodas items={delResumen} lugar="resumen" />
            </>
          }
        >
          <strong>El agente sugiere {delResumen.length === 1 ? "una cosa" : `${delResumen.length} cosas`}</strong> para estas tarjetas. Nada se confirma solo.
        </FranjaDeSugerencias>
        <UsadasHoy filtro={esDelResumen} />
        </div>
      ) : (
        <UsadasHoy filtro={esDelResumen} sinPendientes={!deLasSesiones.length} />
      )}
      <EnLasSesiones items={deLasSesiones} />

      <div data-recorrido="preventa.resumen.marco" className="space-y-5">
        {BLOQUES.map((b) => (
          <section key={b.titulo} className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{b.titulo}</h3>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {b.claves.map((clave, i) => (
                <Fila key={clave} clave={clave} sugeridas={deLaCasilla(clave)} onAbrir={() => abrirCasilla(clave)} ultima={i === b.claves.length - 1} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Lo que sale de cada reunión: lo propone el agente al leerla, con la frase del cliente. */}
      <div data-recorrido="preventa.resumen.casillas" className="grid gap-4 lg:grid-cols-2">
        {CASILLAS_DE_LAS_REUNIONES.map((clave) => (
          <Casilla key={clave} clave={clave} />
        ))}
      </div>
    </div>
  );
}

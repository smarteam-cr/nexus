"use client";

/**
 * DespuesDeLaSesion — la reunión que ya pasó. Desde el 2026-11-07 (Elías, tras probarla con Centauro Solutions: «lo
 * siento complicado y con sobreingeniería… la idea es que el usuario no rellene forms, valide o modifique sugerencias»),
 * tres bloques y ningún campo vacío:
 *   · «Qué pasó»: el resumen que dejó la lectura y si se cumplió el objetivo (Sí · En parte · No), con lo que sugiere
 *     Nexus marcado; un clic lo valida. Lo que se preguntó y lo que no, plegado.
 *   · «Lo que aprendimos»: lo que Nexus encontró en ESTA reunión, cada cosa con Usar (va sola a su lugar en el Resumen) o
 *     Descartar. Sin el lote «Pasar las N…»: se decide una por una, mirando cada una.
 *   · «Lo que queda para la próxima» (LoQueQueda.tsx): una sola lista, todo marcado, que arma la guía y el objetivo de la
 *     siguiente sesión.
 * El correo de seguimiento queda como botón; cómo trabajaste la sesión, el siguiente paso, las casillas y tus notas,
 * plegados a un clic.
 *
 * Una reunión que casi no tiene conversación (o una sesión sin reunión, o una que terminó sin transcripción
 * ni notas) no espera una lectura: pregunta qué pasó —se hizo por otro canal, se cortó y hay que
 * reagendarla, o no se hizo— para que no quede como una reunión hecha que nadie analizó. Ahí mismo se
 * suma la minuta (etapa A): lo sumado pasa a ser la reunión de ESA sesión (SumarAMano › `paraSesionId`).
 */
import { useState } from "react";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { listaParaProponer } from "@/lib/exploraciones/calidad";
import { type SiguientePaso } from "@/lib/exploraciones/casillas";
import { avanceDeLaEstrategia, escalaConEvidencia } from "@/lib/exploraciones/avance-del-proyecto";
import { definicionEnElMarco, type Marco } from "@/lib/exploraciones/marco";
import { claveDeLaReunion, type DestinoDePropuesta, type ItemPropuesto, type LecturaDeReunion, type Operacion } from "@/lib/exploraciones/contenido";
import {
  CUMPLIMIENTOS,
  cumplimientoSugerido,
  esDeLaReunion,
  NOMBRE_DEL_CUMPLIMIENTO,
  objetivoSugeridoDeLaSiguiente,
  type Cumplimiento,
} from "@/lib/exploraciones/despues-de-la-sesion";
import { MAX_SESIONES, type PestanaDeSesion, type PreguntaParaMostrar, type ResultadoDeLaSesion } from "@/lib/exploraciones/guia";
import { claveDeNotaDeSesion } from "@/lib/exploraciones/notas-de-sesion";
import ComoTrabajasteEstaSesion from "@/components/analizador-venta/ComoTrabajasteEstaSesion";
import { Casilla } from "./Casilla";
import { CorreoDeSeguimiento } from "./CorreoDeSeguimiento";
import { useLienzo } from "./contexto";
import SumarAMano from "./SumarAMano";
import { diaLargo, EtiquetaDePregunta, nombreDelPara, Rotulo, useEditarLaSesion, useFocoDeLaGuia } from "./piezas-de-la-sesion";
import { FilaSugerida, UsadasHoy } from "./Propuestas";
import { useCorrida } from "./useCorrida";
import { useSesiones } from "./useSesiones";
import { LaEscalaDespuesDeLaSesion } from "./LoQueDejoLaSesion";
import { LoQueQuedaParaLaProxima, useLoQueQueda, usePorAveriguar } from "./LoQueQueda";

/** Dónde aterriza lo propuesto, en una palabra o dos, sobre la fila. */
function destinoCorto(d: DestinoDePropuesta, nombreDeDimension: (id: string) => string, marco: Marco): string {
  switch (d.tipo) {
    case "casilla":
      return definicionEnElMarco(d.clave, marco).etiqueta;
    case "nivel":
      return `Escala · ${nombreDeDimension(d.dimensionId)}`;
    case "aExplorar":
      return `Explorar · ${nombreDeDimension(d.dimensionId)}`;
    case "falta":
      return "Criterio de la escala";
    case "area":
      return "Área en juego";
    case "edicion":
      return "Escala";
    case "perfil":
      return "Perfil";
    case "casoDeUso":
      return "Caso de uso";
  }
}

// ── Qué pasó ──────────────────────────────────────────────────────────────────

/** La conversación se puso técnica en esta reunión: de qué se habló y qué hacer. */
function AvisoTecnico({ pestana }: { pestana: PestanaDeSesion }) {
  const { exp, cambiar, puedeEditar, guardando } = useLienzo();
  const t = exp.estado.propuesta.alertaTecnica;
  const r = pestana.reunion;
  if (!t || t.vista || !r || !t.reunion.includes(r.titulo)) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-warn-line bg-warn-surface px-3.5 py-2.5">
      <span className="text-sm leading-5 text-warn-ink" aria-hidden="true">
        !
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-[19px] text-warn-ink">
        <strong className="font-semibold">La conversación se puso técnica{t.temas.length ? `: ${t.temas.join(", ").toLowerCase()}` : ""}.</strong> {t.momento ? `${t.momento}. ` : ""}
        Suma a alguien técnico a la próxima sesión.
      </p>
      {puedeEditar && (
        <button type="button" className="text-xs text-warn-ink hover:underline" disabled={guardando} onClick={() => void cambiar([{ op: "alertaTecnicaVista" }])}>
          Entendido
        </button>
      )}
    </div>
  );
}

/** ¿Se cumplió el objetivo? Sí · En parte · No, con lo que sugiere Nexus marcado: un clic lo valida. */
function SeCumplio({ pestana, lectura }: { pestana: PestanaDeSesion; lectura: LecturaDeReunion }) {
  const { puedeEditar, guardando } = useLienzo();
  const editar = useEditarLaSesion(pestana, "despues");
  const s = pestana.sesion;
  const objetivo = s?.objetivo ?? lectura.objetivo ?? null;
  const sugerido = cumplimientoSugerido(lectura);
  if (!objetivo && !sugerido) return null;
  const validado = s?.cumplido ?? null;
  const elegido = validado ?? sugerido;
  const elegir = (c: Cumplimiento) => void editar((x) => ({ ...x, cumplido: c }));
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-info-line bg-surface px-3.5 py-3">
      <p className="text-[13px] text-fg">
        <span className="font-semibold">¿Se cumplió el objetivo?</span>
        {objetivo && <span className="text-fg-secondary"> {objetivo}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {CUMPLIMIENTOS.map((c) => {
          const activo = elegido === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={activo}
              disabled={!puedeEditar || guardando}
              onClick={() => elegir(c)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] transition-colors disabled:opacity-60",
                activo && validado ? "border-primary bg-primary text-primary-fg" : activo ? "border-brand bg-info-surface text-brand" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
              )}
            >
              {activo && !validado && <IconoDeSugerencia className="h-3 w-3" />}
              {NOMBRE_DEL_CUMPLIMIENTO[c]}
            </button>
          );
        })}
        <span className="text-xs text-fg-muted">{validado ? "Lo validaste tú." : sugerido ? "Lo sugiere Nexus: tócalo para validarlo o elige otro." : "Elige cómo salió."}</span>
      </div>
    </div>
  );
}

/**
 * A1 (2026-11-07, Elías: «no vi ningún indicador de carga»): mientras Nexus vuelve a leer la reunión, el bloque lo dice en
 * grande, con la fase en que va, en el lugar donde va a aparecer lo nuevo.
 */
function Leyendo({ fase }: { fase: string | null }) {
  return (
    <section role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-info-line bg-info-surface px-[18px] py-5">
      <Spinner size="md" color="border-brand" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-fg">Nexus está leyendo la reunión</p>
        <p className="mt-0.5 text-[13px] text-fg-secondary">{fase ?? "Empezando…"} Lo nuevo aparece acá en un minuto o dos.</p>
      </div>
    </section>
  );
}

function QuePasoEnLaReunion({ pestana, lectura }: { pestana: PestanaDeSesion; lectura: LecturaDeReunion | null }) {
  const { puedeEditar } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const r = pestana.reunion;
  // El cartel es de ESTA sesión: sale cuando se pidió volver a leer su reunión, no con cualquier corrida del agente.
  /* Cuándo se tocó «Volver a leer» acá. El cartel se va cuando termina una lectura que empezó después de eso: entre el
     pedido y la corrida hay un momento sin ninguna de las dos, y ahí no se tiene que ir. Se deriva: sin efecto. */
  const [pedidaEn, setPedidaEn] = useState<number | null>(null);
  const leyendo = corriendo && corrida?.modo === "leer";
  /* También terminó si después arrancó la guía de la próxima sesión, que se arma sola al terminar de leer (2026-11-08). */
  const termino =
    !!corrida &&
    pedidaEn !== null &&
    Date.parse(corrida.empezo) >= pedidaEn - 5000 &&
    (corrida.modo === "leer" ? corrida.estado !== "RUNNING" : corrida.modo === "guia");
  /* Volver a leerla aunque ya tenga lectura: la grabación de una reunión de HubSpot puede no haber estado
     cuando el agente la leyó (CreditForce, 28 sep: leyó la invitación y dijo que no hubo conversación). */
  const releer = puedeEditar && r && (r.origen === "meet" || r.origen === "hubspot");
  const volverALeer = () => {
    if (!r) return;
    setPedidaEn(Date.now());
    void lanzar("leer", r.origen === "meet" ? { sesionId: r.id } : { hubspotId: r.id }).then((ok) => {
      if (!ok) setPedidaEn(null);
    });
  };
  if (pedidaEn !== null && !termino) return <Leyendo fase={leyendo ? (corrida?.fase ?? null) : null} />;
  if (!lectura) {
    return (
      <section data-recorrido="preventa.sesion.salio" className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-[18px] py-4">
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">
          {r?.leida
            ? "El agente la leyó antes de que resumiera cada reunión: vuelve a leerla para ver qué pasó y qué quedó."
            : "Todavía sin leer: cuando el agente la lea, acá aparece qué pasó, lo que aprendimos y lo que queda."}
        </p>
        {releer && r?.leida && (
          <BotonBlanco disabled={lanzando || corriendo} onClick={volverALeer}>
            Volver a leer
          </BotonBlanco>
        )}
      </section>
    );
  }
  const respondidas = lectura.cobertura.filter((c) => c.respondida).length;
  return (
    <section data-recorrido="preventa.sesion.salio" className="flex flex-col gap-3 rounded-xl border border-info-line bg-info-surface px-[18px] py-4">
      <div className="flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-[15px] font-semibold text-fg">
          <IconoDeSugerencia className="h-[14px] w-[14px] text-brand" />
          Qué pasó
        </h3>
        {releer && (
          <BotonTexto disabled={lanzando || corriendo} title="El agente la vuelve a leer entera: lo que dice de ella se reemplaza." onClick={volverALeer}>
            Volver a leer
          </BotonTexto>
        )}
      </div>
      <p className="text-sm leading-[21px] text-fg">{lectura.resumen}</p>
      <SeCumplio pestana={pestana} lectura={lectura} />
      {lectura.cobertura.length > 0 && (
        <details className="rounded-lg border border-info-line bg-surface">
          <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[13px] text-fg-secondary">
            Lo que se preguntó de la guía · {respondidas} de {lectura.cobertura.length} respondidas
          </summary>
          <ul className="border-t border-info-line px-3.5">
            {lectura.cobertura.map((x) => {
              const p: PreguntaParaMostrar = { para: x.para, tipo: /^\d/.test(x.para) ? "dimension" : x.para.startsWith("vendido:") ? "vendido" : "tarjeta", pregunta: x.pregunta, repreguntas: [] };
              return (
                <li key={x.para} className="flex items-center gap-2.5 border-b border-surface-hover py-[7px] last:border-b-0">
                  <span className="scale-[0.85]">
                    <EtiquetaDePregunta p={p} />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-fg">
                    {x.pregunta}
                    {x.detalle && <span className="text-fg-muted"> · {x.detalle}</span>}
                  </span>
                  {x.respondida ? (
                    <span className="flex-none rounded-full border border-success-line bg-success-surface px-2 py-px text-[11.5px] text-success-ink">Respondida</span>
                  ) : (
                    <span className="flex-none rounded-full border border-dashed border-line bg-surface-muted px-2 py-px text-[11.5px] text-fg-muted">No se preguntó</span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <AvisoTecnico pestana={pestana} />
    </section>
  );
}

// ── Lo que aprendimos ─────────────────────────────────────────────────────────

function LoQueAprendimos({ pestana, lectura }: { pestana: PestanaDeSesion; lectura: LecturaDeReunion | null }) {
  const { revisables, escala, marco, usar, puedeEditar, guardando } = useLienzo();
  const [todas, setTodas] = useState(false);
  const r = pestana.reunion;
  const s = pestana.sesion;
  // Lo que el cliente dijo y nadie siguió va en «Lo que queda para la próxima»; los casos de uso, en su pieza.
  const deEsta = (d: DestinoDePropuesta, it: ItemPropuesto) =>
    d.tipo !== "casoDeUso" && !(d.tipo === "casilla" && d.clave === "noExplorado") && esDeLaReunion(it, lectura, r?.titulo ?? null);
  const items = revisables.filter((it) => deEsta(it.destino, it));
  const visibles = todas ? items : items.slice(0, 8);
  const nombreDeDimension = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre ?? id;
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-[18px] py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-fg">Lo que aprendimos</h3>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            {items.length
              ? `Nexus encontró ${items.length === 1 ? "1 cosa" : `${items.length} cosas`} en esta reunión. «Usar» la pasa sola a su lugar en el Resumen; nada se confirma solo.`
              : "Lo nuevo de esta reunión. El Resumen junta lo de todas las sesiones."}
          </p>
        </div>
        {/* A1 (2026-11-07, Elías): todas de un clic, también las que reemplazan algo; el aviso trae «Deshacer». */}
        {puedeEditar && items.length > 1 && (
          <BotonAzul disabled={guardando} onClick={() => void usar(items, { lugar: "sesion" })}>
            Usar todas ({items.length})
          </BotonAzul>
        )}
      </div>
      {s?.desafio?.texto && (
        <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px] text-fg">
          <span className="text-fg-muted">Desafío principal que dejó esta sesión: </span>
          {s.desafio.texto}
          {s.desafio.resultado && <span className="block text-fg-secondary">El resultado que buscan: {s.desafio.resultado}</span>}
        </p>
      )}
      {visibles.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {visibles.map((it) => (
            <FilaSugerida key={it.id} item={it} destino={destinoCorto(it.destino, nombreDeDimension, marco)} />
          ))}
        </ul>
      )}
      {items.length > visibles.length && (
        <button type="button" className="self-start text-[13px] text-brand hover:underline" onClick={() => setTodas(true)}>
          Ver las {items.length - visibles.length} restantes
        </button>
      )}
      <UsadasHoy filtro={deEsta} sinPendientes={!items.length} />
      {!items.length && !s?.desafio?.texto && lectura && <p className="text-[13px] text-fg-muted">Nada nuevo por revisar de esta reunión.</p>}
    </section>
  );
}

/** El correo de seguimiento, a un clic: se abre al pedirlo (o si ya está escrito). */
function CorreoComoBoton({ pestana }: { pestana: PestanaDeSesion }) {
  const { exp } = useLienzo();
  const r = pestana.reunion;
  const escrito = !!(r && exp.estado.propuesta.correos[claveDeLaReunion(r)]);
  const [abierto, setAbierto] = useState(escrito);
  if (abierto) return <CorreoDeSeguimiento pestana={pestana} />;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <BotonBlanco onClick={() => setAbierto(true)}>Correo de seguimiento para el cliente</BotonBlanco>
      <span className="text-xs text-fg-muted">Lo que entendimos, lo acordado y lo que queda. Lo revisas y lo mandas tú.</span>
    </div>
  );
}

// ── El siguiente paso y cuánto avanzó ─────────────────────────────────────────

function PasoYAvance({ pestana, lectura }: { pestana: PestanaDeSesion; lectura: LecturaDeReunion | null }) {
  const { exp, chequeo, marco } = useLienzo();
  const enProyecto = marco.clave === "cs";
  const { todas } = useSesiones();
  const paso = exp.estado.contenido.casillas.siguientePaso as SiguientePaso | undefined;
  // El paso acordado es de la última sesión hecha antes de su fecha: ahí se acordó.
  const hechas = todas.filter((p) => p.hecha && !p.noSeHizo && p.fecha && (!paso?.fecha || p.fecha <= paso.fecha));
  const esDeEsta = !!paso?.que && hechas[hechas.length - 1]?.clave === pestana.clave;
  // En un proyecto, lo que avanza es la estrategia del cliente (avance-del-proyecto.ts).
  const puntos: { id: string; corto: string; cumplido: boolean }[] = enProyecto ? avanceDeLaEstrategia(exp.estado) : listaParaProponer(exp.estado, chequeo);
  const listos = puntos.filter((p) => p.cumplido);
  const escala = enProyecto ? escalaConEvidencia(chequeo) : null;
  // Sin `listosAntes` (el resumen de una reunión leída antes del rediseño) no se sabe qué faltaba ese día.
  const antes = lectura?.listosAntes ? new Set(lectura.listosAntes) : null;
  const sumo = antes ? listos.filter((p) => !antes.has(p.id)) : [];
  return (
    <section className="grid gap-[18px] rounded-xl border border-line bg-surface px-[18px] py-4 sm:grid-cols-2">
      <div className="min-w-0">
        <Rotulo>Siguiente paso acordado</Rotulo>
        {esDeEsta ? (
          <>
            <p className="mt-1.5 text-[15px] font-semibold text-fg">{paso!.que}</p>
            <p className="mt-0.5 text-[13px] text-fg-secondary">
              {[paso!.fecha ? diaLargo(paso!.fecha) : "sin fecha", paso!.conQuien ? `con ${paso!.conQuien}` : null].filter(Boolean).join(" · ")}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-[13px] text-fg-muted">No quedó uno confirmado de esta reunión.</p>
        )}
      </div>
      <div className="min-w-0">
        <Rotulo>Cuánto avanzó</Rotulo>
        <p className="mt-1.5 text-[15px] font-semibold text-fg">
          {enProyecto ? "Estrategia" : "Para proponer"}: {antes ? `${antes.size} → ` : ""}
          {listos.length} de {puntos.length}
        </p>
        {escala && escala.de > 0 && (
          <p className="text-[13px] text-fg-secondary">
            Escala: {escala.con} de {escala.de} dimensiones con evidencia
          </p>
        )}
        <p className="mt-0.5 text-[13px] text-fg-secondary">
          {!antes
            ? "Hoy, con todo lo confirmado."
            : sumo.length
              ? `Sumó: ${sumo.map((p) => p.corto.toLowerCase()).join(", ")}.`
              : "Todavía no sumó: usa lo que sugirió el agente."}
        </p>
      </div>
    </section>
  );
}

// ── Datos de la sesión ────────────────────────────────────────────────────────

function SinPortal() {
  const { exp, cambiar, puedeEditar, guardando } = useLienzo();
  const sin = exp.estado.contenido.sinPortal;
  if (!puedeEditar && !sin) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-fg-muted">
      <span>{sin ? "Marcado: el prospecto no usa HubSpot (no hay portal que mirar)." : "¿No usa HubSpot? Márcalo: cuenta como portal revisado."}</span>
      {puedeEditar && (
        <BotonBlanco disabled={guardando} onClick={() => void cambiar([{ op: "sinPortal", valor: !sin }])}>
          {sin ? "Sí usa HubSpot" : "No usa HubSpot"}
        </BotonBlanco>
      )}
    </div>
  );
}

function TusNotas({ pestana, vacio }: { pestana: PestanaDeSesion; vacio?: boolean }) {
  const { exp, sesion: seleccion } = useLienzo();
  const s = pestana.sesion;
  const prefijo = s ? claveDeNotaDeSesion(s.id) : null;
  const notas = prefijo ? Object.entries(exp.estado.contenido.notas).filter(([k, v]) => (k === prefijo || k.startsWith(`${prefijo}:`)) && v.trim()) : [];
  if (!notas.length) {
    if (!vacio) return null;
    return (
      <section className="flex flex-col gap-1 rounded-xl border border-dashed border-line bg-surface-muted px-[18px] py-[22px] text-center">
        <p className="text-sm font-semibold text-fg-secondary">Sin notas tuyas de esta sesión</p>
        <p className="text-[13px] text-fg-muted">
          Lo que anotes en{" "}
          <button type="button" className="text-brand hover:underline" onClick={() => seleccion.ponerMomento(pestana.clave, "durante")}>
            «En vivo»
          </button>{" "}
          aparece acá y el agente lo usa.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface px-[18px] py-4">
      <Rotulo>Tus notas</Rotulo>
      {notas.map(([k, v]) => (
        <p key={k} className="whitespace-pre-wrap text-[13px] leading-[19px] text-fg-secondary">
          {v}
        </p>
      ))}
    </section>
  );
}

// ── Sin transcripción: qué pasó con la sesión ─────────────────────────────────

const OPCIONES: { clave: ResultadoDeLaSesion; titulo: string; ayuda: (siguiente: number) => string }[] = [
  { clave: "otroCanal", titulo: "Se hizo por otro canal", ayuda: () => "Teléfono o WhatsApp. Escribe lo que pasó en «En vivo» y el agente lo lee como tus notas." },
  { clave: "cortada", titulo: "Se cortó: hay que reagendarla", ayuda: (n) => `Lo que tenía preparado pasa a la sesión ${n}.` },
  { clave: "noSeHizo", titulo: "No se hizo", ayuda: () => "Sale de las sesiones. La reunión sigue en Meet." },
];

function QuePaso({
  pestana,
  numeroSiguiente,
  claveSiguiente,
  minutaAbierta,
  onMinuta,
}: {
  pestana: PestanaDeSesion;
  numeroSiguiente: number;
  claveSiguiente: string | null;
  minutaAbierta: boolean;
  onMinuta: (sesionId: string) => void;
}) {
  const { exp, escala, marco, puedeEditar, guardando, sesion: seleccion } = useLienzo();
  const editar = useEditarLaSesion(pestana, "despues");
  // Lo que tenía preparado, si no se armó su guía: lo que falta hoy (en la preventa, el plan de la guía).
  const { foco } = useFocoDeLaGuia(pestana.sesion?.id ?? null);
  /* «Sumar la minuta»: el formulario, con la sesión de la que es. Si era una reunión suelta, se vuelve
     sesión primero (cambia de pestaña: por eso lo abierto vive en SesionesDeExploracion). */
  const minutaDe = minutaAbierta ? (pestana.sesion?.id ?? null) : null;
  const sumarLaMinuta = async () => {
    const id = await editar(null);
    if (id) onMinuta(id);
  };
  const r = pestana.reunion;
  const s = pestana.sesion;
  const resultado = s?.resultado ?? null;
  const e = exp.estado;

  const elegir = (clave: ResultadoDeLaSesion) =>
    void editar((x) => {
      if (x.resultado === clave) return { ...x, resultado: undefined, pasaron: undefined };
      if (clave !== "cortada") return { ...x, resultado: clave, pasaron: undefined };
      // Lo que tenía preparado: su guía o, si no se armó, lo que faltaba al cortarse.
      const guia = e.propuesta.guias[x.id] ?? null;
      const pasaron = guia ? [...guia.huecos, ...guia.enfoque] : [...foco.huecos, ...foco.enfoque];
      return { ...x, resultado: clave, pasaron: pasaron.slice(0, 20) };
    }).then((id) => {
      if (id && clave === "otroCanal" && resultado !== "otroCanal") seleccion.ponerMomento(id, "durante");
    });

  const irALaSiguiente = () => {
    if (!claveSiguiente) return;
    seleccion.elegir(claveSiguiente);
    seleccion.ponerMomento(claveSiguiente, "antes");
  };
  const nombres = (s?.pasaron ?? []).map((p) => nombreDelPara(p, escala, marco).toLowerCase());

  return (
    <>
      {r?.corta && (
        <section role="status" className="flex flex-col gap-1.5 rounded-xl border border-warn-line bg-warn-surface px-[18px] py-3.5">
          <p className="text-sm font-semibold text-warn-ink">Esta reunión no tiene qué leer.</p>
          <p className="text-[13px] leading-[19px] text-warn-ink">
            {r.corta.minutos !== null ? `La transcripción termina a los ${r.corta.minutos} ${r.corta.minutos === 1 ? "minuto" : "minutos"} y` : "La transcripción"} casi no tiene
            conversación: el agente no tiene de dónde sacar nada.
          </p>
        </section>
      )}
      <section data-recorrido="preventa.sesion.salio" className="overflow-hidden rounded-xl border border-line bg-surface">
        <header className="border-b border-line px-[18px] py-3.5">
          <h3 className="text-[15px] font-semibold text-fg">¿Qué pasó con esta sesión?</h3>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">Así no queda como una reunión hecha que nadie analizó.</p>
        </header>
        <div className="grid gap-3 px-[18px] py-3.5 md:grid-cols-3">
          {OPCIONES.map((o) => {
            const elegida = resultado === o.clave;
            return (
              <button
                key={o.clave}
                type="button"
                aria-pressed={elegida}
                disabled={!puedeEditar || guardando}
                onClick={() => elegir(o.clave)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:opacity-60",
                  elegida ? "border-brand bg-info-surface" : "border-line bg-surface hover:bg-surface-hover",
                )}
              >
                <span className="text-sm font-semibold text-fg">
                  {elegida && "● "}
                  {o.titulo}
                </span>
                <span className={cn("text-[12.5px] leading-[18px]", elegida ? "text-fg-secondary" : "text-fg-muted")}>{o.ayuda(numeroSiguiente)}</span>
              </button>
            );
          })}
        </div>
        {resultado === "cortada" && (
          <div className="mx-[18px] mb-3.5 rounded-lg border border-success-line bg-success-surface px-3.5 py-2.5 text-[13px] leading-[19px] text-success-ink">
            Listo: {nombres.length ? `las preguntas de ${nombres.join(", ")} pasaron` : "lo que faltaba pasó"} a la guía de la sesión {numeroSiguiente}, con la etiqueta «Pasó de la
            sesión {pestana.numero}».{" "}
            {claveSiguiente && (
              <button type="button" className="text-brand hover:underline" onClick={irALaSiguiente}>
                Ver la sesión {numeroSiguiente} →
              </button>
            )}
          </div>
        )}
        {resultado === "noSeHizo" && (
          <div className="mx-[18px] mb-3.5 rounded-lg border border-line bg-surface-muted px-3.5 py-2.5 text-[13px] text-fg-secondary">
            Ya no cuenta como sesión. Si te equivocaste, vuelve a tocar «No se hizo».
          </div>
        )}
        {minutaDe ? (
          <div className="px-[18px] pb-4">
            <SumarAMano paraSesionId={minutaDe} sinLista abiertoAlInicio />
          </div>
        ) : (
          <p className="px-[18px] pb-4 text-[13px] text-fg-secondary">
            ¿Tienes la grabación o una minuta de otro lado?{" "}
            {puedeEditar ? (
              <button type="button" className="text-brand hover:underline" disabled={guardando} onClick={() => void sumarLaMinuta()}>
                Súmala
              </button>
            ) : (
              "Súmala"
            )}{" "}
            y pasa a ser la reunión de esta sesión: el agente la lee.
          </p>
        )}
      </section>
      <TusNotas pestana={pestana} vacio />
    </>
  );
}

export default function DespuesDeLaSesion({
  pestana,
  numeroSiguiente,
  claveSiguiente,
  armarLaSiguiente,
  minutaAbierta = false,
  onMinuta,
}: {
  pestana: PestanaDeSesion;
  /** «Sumar la minuta» abierto (también desde el enlace del encabezado de una sesión que terminó sin transcripción). */
  minutaAbierta?: boolean;
  onMinuta: (sesionId: string) => void;
  numeroSiguiente: number;
  /** La sesión siguiente, si ya existe (para ir a ella). */
  claveSiguiente: string | null;
  /** Abre la siguiente sesión (o la crea) en su Preparación, con `extra` en el mismo cambio. */
  armarLaSiguiente: (extra?: Operacion[]) => void;
}) {
  const { exp, marco, puedeEditar } = useLienzo();
  const enProyecto = marco.clave === "cs";
  const { sesiones } = useSesiones();
  const { corriendo, lanzando } = useCorrida();
  const { pendientes, sugeridas } = useLoQueQueda(pestana);
  // El mismo objetivo que va a sugerir la Preparación de la siguiente (LoQueQueda.tsx › `useObjetivoDeLaSiguiente`).
  const porAveriguarHoy = usePorAveriguar();
  const r = pestana.reunion;
  const lectura = r ? (exp.estado.propuesta.lecturas[claveDeLaReunion(r)] ?? null) : null;
  // Sin transcripción ni notas (etapa A) tampoco hay qué leer: se pregunta qué pasó y se suma la minuta.
  const sinQueLeer = !!pestana.sesion?.resultado || (!!r?.corta && !lectura) || (r?.texto === "nada" && !lectura) || !r;

  if (sinQueLeer) {
    return (
      <div className="space-y-5">
        <QuePaso pestana={pestana} numeroSiguiente={numeroSiguiente} claveSiguiente={claveSiguiente} minutaAbierta={minutaAbierta} onMinuta={onMinuta} />
        {pestana.sesion?.resultado !== "noSeHizo" && <LoQueQuedaParaLaProxima pestana={pestana} numeroSiguiente={numeroSiguiente} />}
      </div>
    );
  }

  const objetivoDeLaSiguiente = objetivoSugeridoDeLaSiguiente({ pendientes, objetivoSiguiente: lectura?.objetivoSiguiente ?? null, porAveriguar: porAveriguarHoy });
  /* Al preparar la siguiente, lo que el cliente dijo y nadie siguió (todavía sugerido) se usa si se ve marcado en la lista
     y se descarta si se ve tachado: así no queda pendiente para siempre. Lo que no se ve en la lista (pasado el tope, o
     repetido con otro renglón) no se toca. */
  const vistas = new Map(pendientes.flatMap((p) => (p.itemId ? [[p.itemId, p.marcado] as const] : [])));
  const tachadas = sugeridas.filter((it) => vistas.get(it.id) === false).map((it) => it.id);
  const alPreparar: Operacion[] = [
    ...sugeridas.filter((it) => vistas.get(it.id) === true).map((it) => ({ op: "usar" as const, itemId: it.id, valor: it.valor })),
    ...(tachadas.length ? [{ op: "descartar" as const, itemIds: tachadas }] : []),
  ];

  return (
    <div className="space-y-5">
      <QuePasoEnLaReunion pestana={pestana} lectura={lectura} />
      <LoQueAprendimos pestana={pestana} lectura={lectura} />
      <LoQueQuedaParaLaProxima pestana={pestana} numeroSiguiente={numeroSiguiente} />
      <CorreoComoBoton pestana={pestana} />

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer select-none px-[18px] py-3.5 text-sm font-semibold text-fg">
          Más de esta sesión{" "}
          <span className="text-[13px] font-normal text-fg-muted">
            {enProyecto ? "· siguiente paso, cuánto avanzó, la escala, lo propio de la cuenta, tus notas" : "· cómo trabajaste, siguiente paso, cuánto avanzó, la escala, portal, apertura, tus notas"}
          </span>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          {/* S4 (2026-10-27): la autoevaluación de la sesión, aparte de lo de arriba. */}
          {!enProyecto && <ComoTrabajasteEstaSesion pestana={pestana} />}
          <PasoYAvance pestana={pestana} lectura={lectura} />
          <LaEscalaDespuesDeLaSesion />
          <Casilla clave="siguientePaso" />
          {enProyecto ? (
            <Casilla clave="particularidades" />
          ) : (
            <>
              <div className="space-y-2">
                <Casilla clave="portal" />
                <SinPortal />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <Casilla clave="apertura" />
                <Casilla clave="producto" />
              </div>
            </>
          )}
          <TusNotas pestana={pestana} />
        </div>
      </details>

      {puedeEditar && (
        <div className="sticky bottom-0 z-10 -mx-6 -mb-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface px-6 py-3.5 xl:-mx-8 xl:px-8">
          <p className="min-w-0 flex-1 text-[13.5px] text-fg-secondary">
            {objetivoDeLaSiguiente ? (
              <>
                <span className="text-fg-muted">La sesión {numeroSiguiente} arranca con: </span>
                {objetivoDeLaSiguiente}
              </>
            ) : (
              `Lo que quede marcado arriba entra en la guía de la sesión ${numeroSiguiente}.`
            )}
          </p>
          <BotonAzul
            className="rounded-lg px-4 py-[9px] text-[13px]"
            disabled={lanzando || corriendo || sesiones.length >= MAX_SESIONES}
            onClick={() => armarLaSiguiente(alPreparar)}
          >
            {lanzando ? "Armando…" : `Preparar la sesión ${numeroSiguiente}`}
          </BotonAzul>
        </div>
      )}
    </div>
  );
}

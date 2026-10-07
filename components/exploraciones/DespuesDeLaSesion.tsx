"use client";

/**
 * DespuesDeLaSesion — la reunión que ya pasó (tableros «Después · Sesión 1» y «Sesión 2 sin
 * transcripción», 2026-10-07). Arriba, lo que leyó el agente: su resumen y, de lo que se planeó
 * preguntar, qué se respondió. Después, lo que sugiere de ESTA reunión (cada cosa con Usar o
 * Descartar), la alerta si se puso técnica, el siguiente paso acordado y cuánto avanzó la preventa, y
 * «Quedó abierto»: lo que no se preguntó y lo que se dijo sin explorar, con una casilla para llevarlo
 * a la próxima sesión (entra primero en su guía, con «Quedó abierto en la sesión N»).
 *
 * Una reunión que casi no tiene conversación (o una sesión sin reunión) no espera una lectura: pregunta
 * qué pasó —se hizo por otro canal, se cortó y hay que reagendarla, o no se hizo— para que no quede
 * como una reunión hecha que nadie analizó.
 */
import { useState } from "react";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { listaParaProponer } from "@/lib/exploraciones/calidad";
import { definicionDe, type SiguientePaso } from "@/lib/exploraciones/casillas";
import { claveDeLaReunion, type DestinoDePropuesta, type ItemPropuesto, type LecturaDeReunion } from "@/lib/exploraciones/contenido";
import { focoDeLaGuia, MAX_SESIONES, separarPregunta, type PestanaDeSesion, type PreguntaParaMostrar, type ResultadoDeLaSesion } from "@/lib/exploraciones/guia";
import { claveDeNotaDeSesion } from "@/lib/exploraciones/notas-de-sesion";
import { Casilla } from "./Casilla";
import { abrirElContextoAdicional } from "./ContextoDeLaPreventa";
import { useLienzo } from "./contexto";
import { diaLargo, EtiquetaDePregunta, nombreDelPara, Rotulo, useEditarLaSesion } from "./piezas-de-la-sesion";
import { FilaSugerida } from "./Propuestas";
import { useCorrida } from "./useCorrida";
import { useSesiones } from "./useSesiones";

/** Lo que se lleva a la próxima sesión desde «Quedó abierto». */
/** Un punto que se lleva a la próxima sesión: su texto, la sugerencia que se usa con él y, si se sabe, a qué apunta. */
export type Llevar = { texto: string; item: ItemPropuesto | null; para?: string };

/** Dónde aterriza lo propuesto, en una palabra o dos, sobre la fila. */
function destinoCorto(d: DestinoDePropuesta, nombreDeDimension: (id: string) => string): string {
  switch (d.tipo) {
    case "casilla":
      return definicionDe(d.clave).etiqueta;
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

/** ¿Lo sugerido sale de esta reunión? Por cómo la nombró la lectura o, sin lectura, por su título. */
function deEstaReunion(it: ItemPropuesto, lectura: LecturaDeReunion | null, titulo: string | null): boolean {
  return it.fuentes.some((f) => (lectura ? f.etiqueta === lectura.etiqueta : !!titulo && f.etiqueta.includes(titulo)));
}

// ── Lo que leyó el agente ─────────────────────────────────────────────────────

function cumplimiento(cobertura: LecturaDeReunion["cobertura"]): { texto: string; aviso: boolean } {
  const si = cobertura.filter((c) => c.respondida).length;
  const n = cobertura.length;
  const de = `${si} de ${n} ${n === 1 ? "pregunta respondida" : "preguntas respondidas"}`;
  if (si === n) return { texto: `Se cumplió: ${de}.`, aviso: false };
  if (si === 0) return { texto: `No se cumplió: ${de}.`, aviso: true };
  return { texto: `Se cumplió en parte: ${de}.`, aviso: true };
}

function LoQueLeyo({ pestana, lectura }: { pestana: PestanaDeSesion; lectura: LecturaDeReunion | null }) {
  const { puedeEditar } = useLienzo();
  const { corriendo, lanzando, lanzar } = useCorrida();
  const r = pestana.reunion;
  if (!lectura) {
    return (
      <section data-recorrido="preventa.sesion.salio" className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-[18px] py-4">
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">
          {r?.leida
            ? "El agente la leyó antes de que resumiera cada reunión: vuelve a leerla para ver qué se habló y qué se respondió."
            : "Todavía sin leer: cuando el agente la lea, acá aparece qué se habló y qué se respondió de lo planeado."}
        </p>
        {puedeEditar && r?.leida && r.origen === "meet" && (
          <BotonBlanco disabled={lanzando || corriendo} onClick={() => void lanzar("leer", { sesionId: r.id })}>
            Volver a leer
          </BotonBlanco>
        )}
      </section>
    );
  }
  const c = lectura.cobertura.length ? cumplimiento(lectura.cobertura) : null;
  return (
    <section data-recorrido="preventa.sesion.salio" className="flex flex-col gap-3 rounded-xl border border-info-line bg-info-surface px-[18px] py-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
        <IconoDeSugerencia className="h-[13px] w-[13px]" />
        Lo que leyó el agente
      </p>
      <p className="text-sm leading-[21px] text-fg">{lectura.resumen}</p>
      {!c && <p className="text-[12.5px] text-fg-muted">No había una guía armada antes de esta reunión: no hay con qué comparar lo que se preguntó.</p>}
      {c && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-info-line bg-surface px-3.5 py-3">
          <div className="flex flex-wrap items-baseline gap-2">
            {lectura.objetivo && <span className="text-[13px] font-semibold text-fg">Objetivo: {lectura.objetivo}</span>}
            <span className={cn("text-[12.5px]", c.aviso ? "text-warn-ink" : "text-success-ink")}>{c.texto}</span>
          </div>
          <ul>
            {lectura.cobertura.map((x) => {
              const p: PreguntaParaMostrar = { para: x.para, tipo: /^\d/.test(x.para) ? "dimension" : "tarjeta", pregunta: x.pregunta, repreguntas: [] };
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
        </div>
      )}
    </section>
  );
}

// ── Lo que sugiere de esta reunión ────────────────────────────────────────────

function LoQueSugiere({ pestana, lectura }: { pestana: PestanaDeSesion; lectura: LecturaDeReunion | null }) {
  const { exp, revisables, escala, cambiar, puedeEditar, guardando, abrirRevision } = useLienzo();
  const [todas, setTodas] = useState(false);
  const r = pestana.reunion;
  const items = revisables.filter(
    (it) => it.destino.tipo !== "casoDeUso" && !(it.destino.tipo === "casilla" && it.destino.clave === "noExplorado") && deEstaReunion(it, lectura, r?.titulo ?? null),
  );
  const visibles = todas ? items : items.slice(0, 6);
  const nombreDeDimension = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre ?? id;
  const refrescar = items.some((it) => it.destino.tipo === "edicion" || it.destino.tipo === "perfil");
  const t = exp.estado.propuesta.alertaTecnica;
  const tecnica = t && !t.vista && r && t.reunion.includes(r.titulo) ? t : null;
  if (!items.length && !tecnica) return null;
  return (
    <section className="flex flex-col gap-1.5">
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-info-line bg-info-surface px-3.5 py-2.5">
          <IconoDeSugerencia className="h-[15px] w-[15px] text-brand" />
          <span className="min-w-0 flex-1 text-[13.5px] text-fg">
            El agente sugiere {items.length === 1 ? "1 cosa" : `${items.length} cosas`} de esta reunión. Nada se confirma solo.
          </span>
          {puedeEditar && (
            <>
              <BotonBlanco onClick={() => abrirRevision()}>Revisar una por una</BotonBlanco>
              {items.length > 1 && (
                <BotonAzul
                  disabled={guardando}
                  onClick={() => void cambiar([{ op: "usarVarias", items: items.map((it) => ({ itemId: it.id, valor: it.valor })) }], { refrescar })}
                >
                  Usar las {items.length}
                </BotonAzul>
              )}
            </>
          )}
        </div>
      )}
      {visibles.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {visibles.map((it) => (
            <FilaSugerida key={it.id} item={it} destino={destinoCorto(it.destino, nombreDeDimension)} />
          ))}
        </ul>
      )}
      {items.length > visibles.length && (
        <button type="button" className="self-start text-[13px] text-brand hover:underline" onClick={() => setTodas(true)}>
          Ver las {items.length - visibles.length} restantes
        </button>
      )}
      {tecnica && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn-line bg-warn-surface px-3.5 py-2.5">
          <span className="text-sm leading-5 text-warn-ink" aria-hidden="true">
            !
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-[19px] text-warn-ink">
            <strong className="font-semibold">La conversación se puso técnica{tecnica.temas.length ? `: ${tecnica.temas.join(", ").toLowerCase()}` : ""}.</strong>{" "}
            {tecnica.momento ? `${tecnica.momento}. ` : ""}Suma a alguien técnico a la próxima sesión.
          </p>
          {puedeEditar && (
            <button type="button" className="text-xs text-warn-ink hover:underline" disabled={guardando} onClick={() => void cambiar([{ op: "alertaTecnicaVista" }])}>
              Entendido
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ── El siguiente paso y cuánto avanzó ─────────────────────────────────────────

function PasoYAvance({ pestana, lectura }: { pestana: PestanaDeSesion; lectura: LecturaDeReunion | null }) {
  const { exp, chequeo } = useLienzo();
  const { todas } = useSesiones();
  const paso = exp.estado.contenido.casillas.siguientePaso as SiguientePaso | undefined;
  // El paso acordado es de la última sesión hecha antes de su fecha: ahí se acordó.
  const hechas = todas.filter((p) => p.hecha && !p.noSeHizo && p.fecha && (!paso?.fecha || p.fecha <= paso.fecha));
  const esDeEsta = !!paso?.que && hechas[hechas.length - 1]?.clave === pestana.clave;
  const puntos = listaParaProponer(exp.estado, chequeo);
  const listos = puntos.filter((p) => p.cumplido);
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
          Para proponer: {antes ? `${antes.size} → ` : ""}
          {listos.length} de {puntos.length}
        </p>
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

// ── Quedó abierto ─────────────────────────────────────────────────────────────

function QuedoAbierto({
  pestana,
  lectura,
  numeroSiguiente,
  llevar,
  soltar,
}: {
  pestana: PestanaDeSesion;
  lectura: LecturaDeReunion | null;
  numeroSiguiente: number;
  llevar: (l: Llevar) => void;
  soltar: (texto: string) => void;
}) {
  const { exp, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const { todas } = useSesiones();
  const r = pestana.reunion;
  const enQue = (texto: string) => todas.find((p) => p.sesion?.explorar?.includes(texto));
  const ultimaHecha = [...todas].reverse().find((p) => p.hecha && !p.noSeHizo);
  const confirmados = ultimaHecha?.clave === pestana.clave ? ((exp.estado.contenido.casillas.noExplorado as string[] | undefined) ?? []) : [];
  const sugeridos = pendientesPara((d) => d.tipo === "casilla" && d.clave === "noExplorado").filter((it) => deEstaReunion(it, lectura, r?.titulo ?? null));
  const noPreguntadas = (lectura?.cobertura ?? []).filter((c) => !c.respondida);

  type Fila = { clave: string; texto: string; titulo: string; sub: string | null; item: ItemPropuesto | null; para?: string; quitar?: () => void };
  const filas: Fila[] = [
    // Lo que no se preguntó sabe a qué apunta: la próxima guía lo muestra con su letra o su número.
    ...noPreguntadas.map((c) => ({ clave: `np-${c.para}`, texto: `No se preguntó. Qué preguntar: ${c.pregunta}`, titulo: c.pregunta, sub: "No se preguntó", item: null, para: c.para })),
    ...sugeridos.map((it) => {
      const t = String(it.valor);
      const { dicho, pregunta } = separarPregunta(t);
      return { clave: it.id, texto: t, titulo: pregunta ?? dicho, sub: pregunta ? dicho : (it.razon ?? null), item: it };
    }),
    ...confirmados.map((t) => {
      const { dicho, pregunta } = separarPregunta(t);
      return {
        clave: `c-${t}`,
        texto: t,
        titulo: pregunta ?? dicho,
        sub: pregunta ? dicho : null,
        item: null,
        quitar: () => {
          const resto = confirmados.filter((x) => x !== t);
          void cambiar([{ op: "casilla", clave: "noExplorado", valor: resto.length ? resto : null }]);
        },
      };
    }),
  ];
  if (!filas.length && !lectura) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-[18px] py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">Quedó abierto</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">
          Lo que no se preguntó y lo que se dijo sin explorar. Lo que marques entra primero en la guía de la sesión {numeroSiguiente}
          {pestana.noSeHizo ? "" : `, con la etiqueta «Quedó abierto en la sesión ${pestana.numero}»`}.
        </p>
      </header>
      {filas.length === 0 ? (
        <p className="px-[18px] py-4 text-[13px] text-fg-muted">Nada quedó abierto: se preguntó todo lo planeado.</p>
      ) : (
        <ul>
          {filas.map((f) => {
            const en = enQue(f.texto);
            return (
              <li key={f.clave} className="flex items-start gap-3 border-b border-surface-hover px-[18px] py-3 last:border-b-0">
                <input
                  type="checkbox"
                  checked={!!en}
                  disabled={!puedeEditar || guardando}
                  aria-label={`Llevar «${f.titulo}» a la próxima sesión`}
                  onChange={() => (en ? soltar(f.texto) : llevar({ texto: f.texto, item: f.item, ...(f.para ? { para: f.para } : {}) }))}
                  className="mt-[3px] h-4 w-4 flex-shrink-0 accent-brand"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{f.titulo}</p>
                  {(f.sub || en) && (
                    <p className="mt-0.5 text-xs text-fg-muted">{[f.sub, en && !en.noSeHizo ? `en la sesión ${en.numero}` : null].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                {puedeEditar && (f.item || f.quitar) && (
                  <BotonTexto
                    disabled={guardando}
                    onClick={() => (f.item ? void cambiar([{ op: "descartar", itemIds: [f.item.id] }]) : f.quitar?.())}
                  >
                    {f.item ? "Descartar" : "Quitar"}
                  </BotonTexto>
                )}
              </li>
            );
          })}
        </ul>
      )}
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

function QuePaso({ pestana, numeroSiguiente, claveSiguiente }: { pestana: PestanaDeSesion; numeroSiguiente: number; claveSiguiente: string | null }) {
  const { exp, escala, mapa, puedeEditar, guardando, sesion: seleccion } = useLienzo();
  const editar = useEditarLaSesion(pestana, "despues");
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
      const foco = focoDeLaGuia(e.contenido.casillas, escala, e.areas, mapa.posiciones, e.contenido.aExplorar);
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
  const nombres = (s?.pasaron ?? []).map((p) => nombreDelPara(p, escala).toLowerCase());

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
        <p className="px-[18px] pb-4 text-[13px] text-fg-secondary">
          ¿Tienes la grabación o una minuta de otro lado? Súmala en{" "}
          <button type="button" className="text-brand hover:underline" onClick={abrirElContextoAdicional}>
            «Contexto adicional»
          </button>{" "}
          y el agente la lee.
        </p>
      </section>
      <TusNotas pestana={pestana} vacio />
    </>
  );
}

export default function DespuesDeLaSesion({
  pestana,
  numeroSiguiente,
  claveSiguiente,
  llevados,
  armarLaSiguiente,
  soltar,
}: {
  pestana: PestanaDeSesion;
  numeroSiguiente: number;
  /** La sesión siguiente, si ya existe (para ir a ella). */
  claveSiguiente: string | null;
  /** Cuántos puntos de esta sesión ya se llevaron a la siguiente. */
  llevados: number;
  armarLaSiguiente: (llevar?: Llevar) => void;
  soltar: (texto: string) => void;
}) {
  const { exp, puedeEditar } = useLienzo();
  const { sesiones } = useSesiones();
  const { corriendo, lanzando } = useCorrida();
  const r = pestana.reunion;
  const lectura = r ? (exp.estado.propuesta.lecturas[claveDeLaReunion(r)] ?? null) : null;
  const sinQueLeer = !!pestana.sesion?.resultado || (!!r?.corta && !lectura) || !r;

  if (sinQueLeer) {
    return (
      <div className="space-y-5">
        <QuePaso pestana={pestana} numeroSiguiente={numeroSiguiente} claveSiguiente={claveSiguiente} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <LoQueLeyo pestana={pestana} lectura={lectura} />
      <LoQueSugiere pestana={pestana} lectura={lectura} />
      <PasoYAvance pestana={pestana} lectura={lectura} />
      <QuedoAbierto pestana={pestana} lectura={lectura} numeroSiguiente={numeroSiguiente} llevar={(l) => armarLaSiguiente(l)} soltar={soltar} />

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer select-none px-[18px] py-3.5 text-sm font-semibold text-fg">
          Datos de la sesión <span className="text-[13px] font-normal text-fg-muted">· siguiente paso, portal visto, apertura, producto mostrado, tus notas</span>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          <Casilla clave="siguientePaso" />
          <div className="space-y-2">
            <Casilla clave="portal" />
            <SinPortal />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Casilla clave="apertura" />
            <Casilla clave="producto" />
          </div>
          <TusNotas pestana={pestana} />
        </div>
      </details>

      {puedeEditar && (
        <div className="sticky bottom-0 z-10 -mx-6 -mb-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface px-6 py-3.5 xl:-mx-8 xl:px-8">
          <p className="min-w-0 flex-1 text-[13.5px] text-fg-secondary">
            {llevados > 0
              ? `Llevas ${llevados === 1 ? "1 punto" : `${llevados} puntos`} a la sesión ${numeroSiguiente}. El agente arma su guía con ${llevados === 1 ? "él" : "ellos"} primero.`
              : `Marca lo que quedó abierto para llevarlo a la sesión ${numeroSiguiente}.`}
          </p>
          <BotonAzul
            className="rounded-lg px-4 py-[9px] text-[13px]"
            disabled={lanzando || corriendo || sesiones.length >= MAX_SESIONES}
            onClick={() => armarLaSiguiente()}
          >
            {lanzando ? "Armando…" : `Armar la sesión ${numeroSiguiente}`}
          </BotonAzul>
        </div>
      )}
    </div>
  );
}

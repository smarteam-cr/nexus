"use client";

/**
 * PasoEscala — dónde parece estar cada equipo en la escala, y por qué.
 *
 * Tercera vuelta (2026-11-08, Elías con Centauro Solutions): «lo importante es que el vendedor VEA la escala, con los
 * nodos y el puntaje, exactamente como se ve en el diagnóstico de rendimiento». En este orden:
 *   1. Arriba, «Ubicar con las reuniones» (solo la preventa: el agente lee las transcripciones de las sesiones y ubica las
 *      tres áreas con su evidencia, y lo que no tiene evidencia directa como hipótesis por explorar) y «Acceso».
 *   2. Lo que sugiere el agente, en una franja: cuántas con evidencia y cuántas por explorar, «Pasar las N al mapa» y la
 *      lista solo si se pide. Sin «Usadas hoy» (el aviso de cada uso ya deshace).
 *   3. Dónde está hoy: una frase de lo explorado (equipos-de-la-escala.ts) y las tres áreas como pestañas. Cada área se
 *      ve con el RADAR DEL DIAGNÓSTICO (`RadarDeUnaEmpresa`, el mismo de la página del cliente: nodos, puntaje y nivel en
 *      el centro), y la rueda queda como segunda vista («Mapa»). Un área con algo se ve aunque no esté en juego: si en
 *      las reuniones salió Marketing, su escala se llena. Tocar un nodo abre la dimensión: cómo está, la pregunta para
 *      confirmarlo y los cinco niveles.
 *   4. Con qué se mide, qué va primero y el agente, al pie.
 * Se fue «Qué explorar en la próxima sesión»: la guía ya elige primero lo que no tiene evidencia, y cada dimensión
 * conserva «Explorarla a fondo».
 *
 * ESCALA ÚNICA (2026-10-28): la misma pieza es La cuenta › La escala de la ficha del cliente (`lugar = "cuenta"`). Ahí
 * no va «Explorarla a fondo» (la cuenta no tiene sesiones), y el agente es el de la ficha (`agente`: «Actualizar
 * escala»), no «Ubicar con las reuniones». «Acceso» (30 oct, cuenta y preventa): el enlace con que el cliente la ve
 * (AccesoALaEscala.tsx).
 */
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Alert, Button } from "@/components/ui";
import { BOTON_DE_HERRAMIENTA, BOTON_DE_HERRAMIENTA_ACTIVO } from "@/components/ui/sistema";
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import RadarDeUnaEmpresa from "@/components/escala/RadarDeUnaEmpresa";
import { cn } from "@/lib/cn";
import type { AreaDelChequeo } from "@/lib/escala/chequeo";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import { esHipotesisDeNivel, type DestinoDePropuesta, type EstimadoGuardado, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import type { AreaDelLienzo, DimensionDelLienzo, EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { resumenDeLoExplorado } from "@/lib/exploraciones/equipos-de-la-escala";
import { chequeoDelMapa, cuentaDelArea, loQueLaFrena, type PosicionEnElMapa } from "@/lib/exploraciones/mapa";
import { diaCorto } from "@/lib/exploraciones/fechas";
import AccesoALaEscala from "./AccesoALaEscala";
import { AL_LUGAR, DEL_LUGAR, useLienzo } from "./contexto";
import FranjaDeSugerencias, { IconoDeSugerencia } from "./FranjaDeSugerencias";
import { ConQueSeMide } from "./Identificacion";
import PanelDelAgente from "./PanelDelAgente";
import { piezaDelDestino } from "./piezas";
import { BotonUsarTodas, FilaSugerida } from "./Propuestas";
import PreparacionParaEngagement from "./PreparacionParaEngagement";
import { QueVaPrimero } from "./QueVaPrimero";
import RuedaDelEquipo from "./RuedaDelEquipo";
import { useAreasDeLaEscala } from "./useAreasDeLaEscala";
import { useCorrida } from "./useCorrida";

const LETRAS: Letra[] = ["D", "I", "F", "E", "O"];

/** «A», «A y B», «A, B y C». */
const enLista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** El rótulo chico en mayúsculas del tablero. */
function Rotulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("block text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted", className)}>{children}</span>;
}

/** De dónde sale lo dibujado, en palabras. */
function deDonde(p: PosicionEnElMapa): string {
  if (p.fuente === "test") return "Lo marcó en el test (con la escala anterior).";
  if (p.fuente === "hipotesis") return "Lo deduce el agente de lo que hay en HubSpot.";
  if (p.fuente === "vendedor") return "Lo marcaste tú.";
  if (p.fuente === "portal") return "Se vio en su portal.";
  return p.origen === "propuesto" ? "Lo dijo en una reunión (el agente lo leyó de la transcripción)." : "Lo dijo en una reunión.";
}

/** Dónde cae una sugerencia de esta pieza, en una línea: «Ventas · Datos», «Áreas», «Con qué se mide». */
function dondeCae(d: DestinoDePropuesta, escala: EscalaDelLienzo): string {
  const deDim = (id: string) => {
    const area = escala.areas.find((a) => a.dimensiones.some((x) => x.id === id));
    const dim = area?.dimensiones.find((x) => x.id === id);
    return area && dim ? `${area.nombre} · ${dim.nombre}` : id;
  };
  switch (d.tipo) {
    case "nivel":
    case "aExplorar":
      return deDim(d.dimensionId);
    case "falta":
      return deDim(d.criterioId.split(".").slice(0, 2).join("."));
    case "area":
      return "Áreas";
    case "edicion":
    case "perfil":
      return "Con qué se mide";
    default:
      return "La escala";
  }
}

/** Una dimensión abierta: cómo está hoy, la pregunta, los cinco niveles y lo que pide Funcional. */
function DetalleDeDimension({ d, onCerrar }: { d: DimensionDelLienzo; onCerrar: () => void }) {
  const { exp, escala, mapa, cambiar, usar, puedeEditar, guardando, nombreDeNivel, pendientesPara, lugar } = useLienzo();
  const p = mapa.posiciones[d.id];
  const confirmado = exp.estado.contenido.chequeo[d.id];
  const marcada = exp.estado.contenido.aExplorar[d.id];
  const nombreDeCapa = escala.capas.find((c) => c.clave === d.capa)?.nombre ?? d.capa;
  const sugeridoNivel = p?.porRevisar ? (p.pendiente?.valor as EstimadoGuardado | undefined)?.nivel : undefined;

  /* El vendedor dice dónde está. Si coincide con lo que propone el agente, se usa esa propuesta (con
     su porqué y su frase); una hipótesis que el vendedor confirma pasa a ser suya. */
  const marcar = (nivel: Letra) => {
    const pend = p?.pendiente;
    const v = pend?.valor as EstimadoGuardado | undefined;
    if (pend && v?.nivel === nivel) {
      const valor: EstimadoGuardado = esHipotesisDeNivel(pend) ? { ...v, fuente: "vendedor" } : v;
      // Por el «Usar» del lienzo (K12): con su aviso, Ctrl+Z y su lugar en «Usadas hoy».
      return void usar([{ ...pend, valor }]);
    }
    // Ya está en ese nivel y es lo que se ve: no se toca (se perdería la frase que lo respalda).
    if (confirmado?.nivel === nivel && p?.origen === "confirmado") return;
    const estimado: EstimadoGuardado = {
      nivel,
      fuente: "vendedor",
      ...(p?.nivel === nivel && p.porQue ? { porQue: p.porQue } : {}),
      ...(confirmado?.riesgo ? { riesgo: true } : {}),
    };
    void cambiar([{ op: "nivel", dimensionId: d.id, estimado }]);
  };

  // Lo que sugirió el agente para explorar a fondo: marcarla usa su sugerencia, con su razón.
  const sugerida = pendientesPara((x) => x.tipo === "aExplorar" && x.dimensionId === d.id)[0];
  const explorar = () =>
    !marcada && sugerida
      ? void usar([sugerida])
      : void cambiar([
          {
            op: "aExplorar",
            dimensionId: d.id,
            valor: marcada ? null : { motivo: p && LETRAS.indexOf(p.nivel) < LETRAS.indexOf("F") ? "indicio" : "otro", ...(p?.porQue ? { razon: p.porQue.slice(0, 300) } : {}) },
          },
        ]);

  const porConfirmar = d.funcional.filter((c) => exp.estado.contenido.falta[c.id]?.estado !== "tiene").length;

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-4">
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
                  <span className="inline-flex rounded-full border border-success-line bg-success-surface px-2 py-px text-[11px] font-semibold text-success-ink">✓ Con evidencia</span>
                ) : (
                  <span className="inline-flex rounded-full border border-warn-line bg-warn-surface px-2 py-px text-[11px] font-semibold text-warn-ink">○ Hipótesis</span>
                )}
              </p>
              <p className="text-[13px] text-fg-secondary">{deDonde(p)}</p>
              {p.porQue && <p className="text-[13px] text-fg-secondary">{p.porQue}</p>}
              {p.citas.map((c, i) => (
                <p key={`${c.id}-${i}`} className="text-[13px] italic text-fg-secondary">
                  «{c.cita}» <span className="not-italic text-fg-muted">— {c.etiqueta}</span>
                </p>
              ))}
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
            <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] bg-surface-hover text-xs font-bold text-fg-secondary" aria-hidden="true">
              ?
            </span>
            <p className="text-[14.5px] font-semibold leading-[1.45] text-fg">{d.pregunta}</p>
          </div>
        </div>
      </div>

      {p?.riesgo && (
        <Alert variant="warning" title={`Dejó ver un riesgo: por eso no se estima por encima de ${nombreDeNivel("F")}.`}>
          {d.riesgos.map((r) => (
            <p key={r.id}>{r.mensaje ?? r.texto}</p>
          ))}
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
                {l === "F" && <span className="self-start rounded-full border border-line bg-surface px-[7px] text-[11px] font-semibold text-fg-secondary">La base</span>}
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
                    <span className="flex-shrink-0 rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-fg-secondary">Míralo en el portal</span>
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
              marcada ? "border border-success-line bg-success-surface text-success-ink" : "border border-line bg-surface text-fg-secondary hover:bg-surface-hover",
            )}
          >
            {marcada ? "✓ Se explora a fondo en la próxima sesión" : "Explorarla a fondo en la próxima sesión"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * De dónde sale cada nivel, de un vistazo (ficha B, 2026-10-17: «pintar la escala con su evidencia»): cada dimensión
 * con su nivel, si es evidencia o hipótesis, de dónde sale y la frase que lo respalda. Tocar una abre su detalle.
 */
function EvidenciaDelArea({ area, onElegir }: { area: AreaDelLienzo; onElegir: (id: string) => void }) {
  const { mapa, nombreDeNivel } = useLienzo();
  const dims = area.dimensiones.filter((d) => d.aplica);
  return (
    <div data-recorrido="preventa.escala.evidencia" className="flex flex-col gap-1.5 border-t border-line pt-4">
      <Rotulo>De dónde sale cada nivel</Rotulo>
      <ul className="flex flex-col divide-y divide-line">
        {dims.map((d) => {
          const p = mapa.posiciones[d.id];
          const cita = p?.citas[0]?.cita;
          return (
            <li key={d.id}>
              <button type="button" onClick={() => onElegir(d.id)} className="flex w-full flex-col gap-0.5 py-1.5 text-left hover:bg-surface-hover">
                <span className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-fg-secondary">
                    <span className="tabular-nums text-fg-muted">{d.id}</span> {d.nombre}
                  </span>
                  {p ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                      <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[p.nivel])} aria-hidden="true" />
                      {nombreDeNivel(p.nivel)}
                      <span className={cn("text-[11px] font-semibold", p.clase === "evidencia" ? "text-success-ink" : "text-warn-ink")}>
                        {p.clase === "evidencia" ? "✓ evidencia" : "○ hipótesis"}
                      </span>
                      {p.origen === "propuesto" && <span className="text-[11px] font-semibold text-brand">sugerido</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-fg-muted">Sin dato: pregúntalo</span>
                  )}
                </span>
                {p && (
                  <span className="text-xs text-fg-muted">
                    {deDonde(p)}
                    {cita ? <span className="italic text-fg-secondary">{" «" + (cita.length > 140 ? cita.slice(0, 139) + "…" : cita) + "»"}</span> : null}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Un área fuera de la preventa: se suma desde su pestaña. */
function AreaFuera({ area, onSumar }: { area: AreaDelLienzo; onSumar: () => void }) {
  const { puedeEditar, guardando, lugar } = useLienzo();
  const enLaCuenta = lugar === "cuenta";
  return (
    <div role="tabpanel" className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface-muted px-5 py-7 text-center">
      <p className="text-sm font-semibold text-fg">
        {area.nombre} no está en juego en {enLaCuenta ? "la escala de la cuenta" : lugar === "proyecto" ? "este proyecto" : "esta preventa"}
      </p>
      <p className="max-w-[460px] text-[13px] text-fg-muted">
        {enLaCuenta
          ? "Súmala si el cliente la trabaja o paga licencias que no usa. Después, «Actualizar escala» la ubica con lo que Nexus ya sabe."
          : "Súmala si el prospecto la nombra o paga licencias que no usa. Al sumarla, el agente la ubica en la escala con lo que ya sabe."}
      </p>
      {puedeEditar && (
        <Button size="sm" variant="secondary" className="mt-1" disabled={guardando} onClick={onSumar}>
          Sumar {area.nombre} {AL_LUGAR[lugar]}
        </Button>
      )}
    </div>
  );
}

// ── 1 · Ubicar con las reuniones (solo la preventa) ─────────────────────────

/**
 * El agente que ubica la escala con las TRANSCRIPCIONES de las sesiones (modo «posicionar», el mismo de «Actualizar
 * escala» de la cuenta): lo lanza una persona, nunca corre solo ni en cada visita. Dice cuándo corrió por última vez.
 */
function UbicarConLasReuniones() {
  const { exp, puedeEditar } = useLienzo();
  const { corriendo, lanzando, lanzar } = useCorrida();
  if (!puedeEditar) return null;
  const ultima = [...exp.estado.propuesta.corridas].reverse().find((c) => c.modo === "posicionar");
  return (
    <span className="inline-flex items-center gap-2">
      {ultima && <span className="text-xs text-fg-muted">Ubicada el {diaCorto(ultima.en)}</span>}
      <Button
        size="sm"
        variant="primary"
        loading={lanzando}
        disabled={corriendo}
        title="El agente lee las transcripciones de las sesiones y ubica Ventas, Marketing y Servicio: lo que dijo el cliente con su cita, y lo demás como hipótesis por explorar. Nada se confirma solo."
        onClick={() => void lanzar("posicionar")}
      >
        {corriendo ? "Ubicando…" : ultima ? "Volver a ubicar con las reuniones" : "Ubicar con las reuniones"}
      </Button>
    </span>
  );
}

// ── 2 · Lo que sugiere el agente, arriba y una vez ──────────────────────────

const deLaEscala = (d: DestinoDePropuesta) => piezaDelDestino(d) === "escala";

/** Las hipótesis de nivel que el agente sugiere y se dibujan en el radar (nadie las usó todavía). */
function hipotesisPendientes(posiciones: Readonly<Record<string, PosicionEnElMapa>>): ItemPropuesto[] {
  return Object.values(posiciones).flatMap((p) => (p.origen === "propuesto" && p.clase === "hipotesis" && p.pendiente && esHipotesisDeNivel(p.pendiente) ? [p.pendiente] : []));
}

/**
 * Una franja: cuántas sugerencias con evidencia y cuántas por explorar, y «Pasar las N al mapa». Las por explorar ya se
 * ven en el radar con su aro punteado; usarlas es lo que las deja llegar a la página del cliente como «por explorar».
 */
function SugerenciasDeLaEscala() {
  const { revisables, escala, mapa } = useLienzo();
  const [verLista, setVerLista] = useState(false);
  const conEvidencia = revisables.filter((it) => deLaEscala(it.destino));
  const porExplorar = hipotesisPendientes(mapa.posiciones);
  const todas = [...conEvidencia, ...porExplorar];
  if (!todas.length) return null;
  const partes = [
    conEvidencia.length ? `${conEvidencia.length} con lo que dijo el cliente` : null,
    porExplorar.length ? `${porExplorar.length} por explorar` : null,
  ].filter(Boolean);
  return (
    <section aria-label="Lo que sugiere el agente" className="space-y-1.5">
      <FranjaDeSugerencias
        acciones={
          <>
            {conEvidencia.length > 0 && (
              <button type="button" onClick={() => setVerLista((v) => !v)} className={verLista ? BOTON_DE_HERRAMIENTA_ACTIVO : BOTON_DE_HERRAMIENTA}>
                {verLista ? "Ocultar la lista" : "Revisar una por una"}
              </button>
            )}
            <BotonUsarTodas items={todas} lugar="escala" />
          </>
        }
      >
        El agente sugiere {partes.join(" y ")} en La escala. Las por explorar son el aro punteado del radar. Nada se confirma solo.
      </FranjaDeSugerencias>
      {verLista && (
        <ul className="space-y-1.5">
          {conEvidencia.map((it) => (
            <FilaSugerida key={it.id} item={it} destino={dondeCae(it.destino, escala)} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 3 · Dónde está hoy: las áreas como pestañas ──────────────────────────────

/** El chequeo de UN área con lo que dibuja el mapa, esté o no en juego. */
const calculoDelArea = (escala: EscalaDelLienzo, area: AreaDelLienzo, posiciones: Readonly<Record<string, PosicionEnElMapa>>): AreaDelChequeo | undefined =>
  chequeoDelMapa(escala, [area.id], posiciones).areas[0];

const tieneAlgo = (area: AreaDelLienzo, posiciones: Readonly<Record<string, PosicionEnElMapa>>) => area.dimensiones.some((d) => d.aplica && posiciones[d.id]);

/** Lo que dice la pestaña de un área: su nivel y cuánto tiene con evidencia, o que está fuera. */
function PestanaDeArea({ area, activa, orden, onElegir }: { area: AreaDelLienzo; activa: boolean; orden: number; onElegir: () => void }) {
  const { mapa, escala, nombreDeNivel, lugar } = useLienzo();
  const conAlgo = tieneAlgo(area, mapa.posiciones);
  const calculo = orden > 0 || conAlgo ? calculoDelArea(escala, area, mapa.posiciones) : undefined;
  const cuenta = calculo ? cuentaDelArea(calculo, mapa.posiciones) : null;
  const todo = !!cuenta && cuenta.hipotesis === 0 && cuenta.sinDato === 0;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onElegir}
      className={cn(
        "flex flex-col items-stretch gap-1 rounded-xl px-3.5 py-3 text-left transition-colors",
        activa ? "border border-brand bg-surface shadow-[inset_0_0_0_1px_var(--color-brand)]" : calculo ? "border border-line bg-surface hover:bg-surface-hover" : "border border-dashed border-line bg-surface-muted hover:bg-surface-hover",
      )}
    >
      <span className="flex items-center justify-between gap-1.5">
        <span className="text-sm font-semibold text-fg">{area.nombre}</span>
        {orden > 0 ? (
          <span className="text-[11px] tabular-nums text-fg-muted">{orden}.º en juego</span>
        ) : conAlgo ? (
          <span className="text-[11px] text-fg-muted">salió en las reuniones</span>
        ) : null}
      </span>
      {calculo ? (
        <>
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
            {calculo.nivel ? (
              <>
                <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[calculo.nivel])} aria-hidden="true" />
                {nombreDeNivel(calculo.nivel)}
                {calculo.puntaje !== null && <span className="text-xs tabular-nums text-fg-muted">{Math.round(calculo.puntaje)}/100</span>}
                <span className={cn("text-[11px] font-semibold", todo ? "text-success-ink" : "text-warn-ink")}>{todo ? "con evidencia" : "parece"}</span>
              </>
            ) : (
              <span className="text-fg-muted">Sin ubicar todavía</span>
            )}
          </span>
          {cuenta && (
            <span className="text-xs text-fg-muted">
              {cuenta.conEvidencia} con evidencia · {cuenta.hipotesis} por explorar{cuenta.sinDato > 0 ? ` · ${cuenta.sinDato} sin dato` : ""}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="text-[13px] text-fg-muted">Fuera {DEL_LUGAR[lugar]}</span>
          <span className="text-xs text-fg-muted">Súmala desde aquí</span>
        </>
      )}
    </button>
  );
}

/**
 * El radar del diagnóstico de rendimiento (`RadarDeUnaEmpresa`, el mismo componente de la página del cliente), con lo
 * que dibuja el mapa: lo confirmado y lo sugerido. Una hipótesis va con aro punteado («por explorar»); lo que no tiene
 * nada, con el eje punteado («Sin medir»). Tocar un nodo, una porción o un nombre abre la dimensión.
 */
function RadarDelArea({ area, calculo, onElegir }: { area: AreaDelLienzo; calculo: AreaDelChequeo; onElegir: (id: string) => void }) {
  const { mapa, escala } = useLienzo();
  const frena = loQueLaFrena(calculo);
  const nombreDeCapa = (c: ClaveDeCapa) => escala.capas.find((x) => x.clave === c)?.nombre ?? c;
  const aplican = new Set(area.dimensiones.filter((d) => d.aplica).map((d) => d.id));
  const elegirDesde = (e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    const id = (e.target as Element).closest("[data-d]")?.getAttribute("data-d");
    if (id && aplican.has(id)) onElegir(id);
  };
  return (
    // El radar es SVG estático (sin JavaScript propio): el clic se lee del `data-d` del nodo, la porción o el nombre.
    // El foco y el rol de botón los tiene cada nodo del SVG.
    <div
      className="rounded-xl border border-line p-4"
      style={{ background: "#ffffff" }}
      onClick={elegirDesde}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") elegirDesde(e);
      }}
    >
      <RadarDeUnaEmpresa
        area={area.nombre}
        dimensiones={calculo.dimensiones
          .filter((d) => aplican.has(d.id))
          .map((d) => {
            const p = mapa.posiciones[d.id];
            return {
              clave: d.id,
              nombre: d.nombre,
              capa: d.capa,
              preguntada: !!p,
              sinMedir: true,
              nivel: d.nivel,
              noLoSe: !!p?.noSabe,
              porExplorar: p?.clase === "hipotesis",
              puntaje: d.puntaje,
            };
          })}
        capas={(["base", "produccion"] as const).map((c) => ({ clave: c, nombre: nombreDeCapa(c), nivel: calculo.capas[c].nivel, puntaje: calculo.capas[c].puntaje }))}
        niveles={escala.niveles}
        resultado={{ nivel: calculo.nivel, puntaje: calculo.puntaje }}
        frena={frena && frena.dimensiones[0] ? { clave: frena.dimensiones[0], objetivo: calculo.objetivo ?? "F" } : null}
      />
    </div>
  );
}

type Vista = "nodos" | "mapa";

/** Un área con algo (en juego o no): su nivel, por qué está ahí, el radar o la rueda y la dimensión abierta. */
function AreaConAlgo({ area, enJuego, vista, onAlternar }: { area: AreaDelLienzo; enJuego: boolean; vista: Vista; onAlternar: () => void }) {
  const { mapa, escala, nombreDeNivel, puedeEditar, guardando, lugar } = useLienzo();
  const [elegida, setElegida] = useState<string | null>(null);
  const calculo = calculoDelArea(escala, area, mapa.posiciones);
  if (!calculo) return null;
  const cuenta = cuentaDelArea(calculo, mapa.posiciones);
  const frena = loQueLaFrena(calculo);
  const nombreDeCapa = (c: string) => escala.capas.find((x) => x.clave === c)?.nombre ?? c;
  const nombresDeCapa = { base: nombreDeCapa("base"), produccion: nombreDeCapa("produccion") } as Record<ClaveDeCapa, string>;
  const dimDeLaFrena = frena?.dimensiones.map((id) => area.dimensiones.find((d) => d.id === id)).filter((d): d is DimensionDelLienzo => !!d) ?? [];
  const porQueDelAgente = dimDeLaFrena.map((d) => mapa.posiciones[d.id]?.porQue).find(Boolean);
  const todoConEvidencia = cuenta.hipotesis === 0 && cuenta.sinDato === 0;
  const verbo = todoConEvidencia ? "está en" : "parece estar en";
  const aplican = area.dimensiones.filter((d) => d.aplica).length;
  const abierta = elegida ? area.dimensiones.find((d) => d.id === elegida) : null;

  return (
    <div role="tabpanel" data-recorrido="preventa.escala.mapa" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-fg">
            {area.nombre}
            {calculo.nivel ? (
              <>
                <span className="font-normal text-fg-secondary">{verbo}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[calculo.nivel])} aria-hidden="true" />
                  {nombreDeNivel(calculo.nivel)}
                </span>
                {calculo.puntaje !== null && <span className="text-sm font-normal tabular-nums text-fg-muted">{Math.round(calculo.puntaje)}/100</span>}
              </>
            ) : (
              <span className="font-normal text-fg-muted">todavía sin ubicar</span>
            )}
          </p>
          <p className="text-xs text-fg-muted">
            {cuenta.conEvidencia} de {aplican} con evidencia · {cuenta.hipotesis} por explorar{cuenta.sinDato > 0 ? ` · ${cuenta.sinDato} sin dato` : ""}
            {!enJuego && ` · no está en juego ${DEL_LUGAR[lugar]}`}
          </p>
        </div>
        {puedeEditar && (
          <button type="button" disabled={guardando} onClick={onAlternar} className="px-1.5 py-1 text-xs font-semibold text-fg-muted hover:text-fg hover:underline">
            {enJuego ? `Sacar ${area.nombre} ${DEL_LUGAR[lugar]}` : `Sumar ${area.nombre} ${AL_LUGAR[lugar]}`}
          </button>
        )}
      </div>

      <div className="flex gap-2.5 rounded-lg border border-info-line bg-info-surface px-3 py-2.5">
        <IconoDeSugerencia className="mt-0.5 h-[15px] w-[15px] flex-shrink-0 text-brand" />
        <div className="flex flex-col gap-1 text-[13px] leading-[1.45]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">Por qué está ahí</span>
          {calculo.nivel && frena ? (
            <span className="text-fg">
              {dimDeLaFrena.length === 1 ? "Lo frena " : "Lo frenan "}
              {enLista(dimDeLaFrena.map((d) => `«${d.nombre}»`))}, en {nombreDeNivel(frena.nivel)}: {dimDeLaFrena.length === 1 ? "es" : "son"} lo más débil de su{" "}
              {nombreDeCapa(frena.capa).toLowerCase()}, y la escala ubica al equipo en su capa más baja.
            </span>
          ) : (
            <span className="text-fg">
              {calculo.faltan.length === 1 ? "Falta una dimensión" : `Faltan ${calculo.faltan.length} dimensiones`} sin dato: pregúntalas en la reunión. Sin las ocho no se sabe cuál es la más débil.
            </span>
          )}
          {porQueDelAgente && <span className="text-fg-secondary">{porQueDelAgente}</span>}
        </div>
      </div>

      {vista === "nodos" ? (
        <figure className="m-0 flex flex-col gap-2">
          <RadarDelArea key={area.id} area={area} calculo={calculo} onElegir={setElegida} />
          {!abierta && <figcaption className="text-xs text-fg-muted">Toca un nodo o el nombre de una dimensión para ver por qué está ahí y cómo confirmarlo. «Ver puntajes» muestra el puntaje de cada una.</figcaption>}
        </figure>
      ) : (
        <figure className="m-0 flex flex-col gap-3">
          <RuedaDelEquipo
            area={area}
            posiciones={mapa.posiciones}
            niveles={escala.niveles}
            nombresDeCapa={nombresDeCapa}
            nivelDelArea={calculo.nivel}
            verbo={verbo}
            elegida={elegida}
            onElegir={setElegida}
          />
          <figcaption data-recorrido="preventa.escala.leyenda" className="flex flex-wrap items-center gap-x-[18px] gap-y-2 border-t border-line pt-3 text-xs text-fg-secondary">
            <span className="text-fg-muted">Cada porción se pinta hasta el nivel en que está esa dimensión.</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-success bg-surface text-[11px] font-bold text-success-ink" aria-hidden="true">
                ✓
              </span>
              Con evidencia: lo dijo el cliente o se vio
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-dashed border-warning bg-surface text-[11px] font-bold text-warn-ink" aria-hidden="true">
                ?
              </span>
              Hipótesis: color más claro, se confirma en la reunión
            </span>
          </figcaption>
        </figure>
      )}

      {abierta ? <DetalleDeDimension key={abierta.id} d={abierta} onCerrar={() => setElegida(null)} /> : <EvidenciaDelArea area={area} onElegir={setElegida} />}
    </div>
  );
}

function DondeEstaHoy() {
  const { exp, escala, mapa, cambiar, nombreDeNivel, lugar } = useLienzo();
  const enJuego = exp.estado.areas;
  const [cual, setCual] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("nodos");
  const areas = useAreasDeLaEscala();
  // De entrada, la más explorada: la que tiene más con evidencia; si no, la primera en juego.
  const masExplorada = [...areas].sort((a, b) => b.conEvidencia - a.conEvidencia || b.sesiones - a.sesiones)[0];
  const activa =
    escala.areas.find((a) => a.id === cual) ??
    (masExplorada && masExplorada.conEvidencia > 0 ? escala.areas.find((a) => a.id === masExplorada.id) : undefined) ??
    escala.areas.find((a) => enJuego.includes(a.id)) ??
    escala.areas[0];
  if (!activa) return null;
  const orden = (id: string) => enJuego.indexOf(id) + 1;
  // Sumar o sacar se deshace con el mismo botón: la lista entera, en el orden en que se eligieron.
  const alternar = (id: string) => void cambiar([{ op: "areas", areas: enJuego.includes(id) ? enJuego.filter((a) => a !== id) : [...enJuego, id] }]);
  const conAlgo = enJuego.includes(activa.id) || tieneAlgo(activa, mapa.posiciones);

  return (
    <section aria-label="Dónde está hoy" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-fg">Dónde está hoy</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-fg-muted">
            {lugar === "preventa" ? "Objetivo de la primera venta" : "El objetivo"}: llevar cada área en juego a {nombreDeNivel("F")}
          </span>
          <div role="radiogroup" aria-label="Cómo se ve la escala" className="inline-flex gap-1">
            {(["nodos", "mapa"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={vista === v} onClick={() => setVista(v)} className={vista === v ? BOTON_DE_HERRAMIENTA_ACTIVO : BOTON_DE_HERRAMIENTA}>
                {v === "nodos" ? "Nodos" : "Mapa"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[13px] leading-[1.5] text-fg-secondary">{resumenDeLoExplorado(areas)}</p>
      <div data-recorrido="preventa.escala.areas" role="tablist" aria-label="Áreas" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {escala.areas.map((a) => (
          <PestanaDeArea key={a.id} area={a} activa={a.id === activa.id} orden={orden(a.id)} onElegir={() => setCual(a.id)} />
        ))}
      </div>
      {conAlgo ? (
        <AreaConAlgo key={activa.id} area={activa} enJuego={enJuego.includes(activa.id)} vista={vista} onAlternar={() => alternar(activa.id)} />
      ) : (
        <AreaFuera area={activa} onSumar={() => alternar(activa.id)} />
      )}
    </section>
  );
}

/** `agente`: el panel del agente de este lugar (en la cuenta, «Actualizar escala»). Sin él, el de la exploración. */
export default function PasoEscala({ agente }: { agente?: ReactNode } = {}) {
  const { exp, lugar } = useLienzo();
  const hayAreas = exp.estado.areas.length > 0;
  // El título y de qué va la pieza los pone el lienzo, como en las demás piezas.
  return (
    <div className="flex flex-col gap-5">
      {lugar !== "proyecto" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {lugar === "preventa" && <UbicarConLasReuniones />}
          <AccesoALaEscala />
        </div>
      )}
      <SugerenciasDeLaEscala />
      <DondeEstaHoy />
      <ConQueSeMide />
      <PreparacionParaEngagement />
      {hayAreas && (
        <div data-recorrido="preventa.escala.primero">
          <QueVaPrimero />
        </div>
      )}
      {agente ?? <PanelDelAgente modoPrincipal="leer" compacto />}
    </div>
  );
}

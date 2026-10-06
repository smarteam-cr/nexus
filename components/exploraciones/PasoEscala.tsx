"use client";

/**
 * PasoEscala — dónde parece estar cada equipo en la escala, y por qué.
 *
 * Copia el tablero «Preventa · La escala» (Claude Design, aprobado por Elías el 2026-10-05), en este
 * orden:
 *   1. Arriba, una sola vez, lo que sugiere el agente en esta pieza (niveles, áreas, qué explorar a
 *      fondo, industria y perfil), para usar o descartar ahí mismo.
 *   2. Con qué se mide: industria, perfil y los datos para comparar (Identificacion.tsx).
 *   3. Dónde está hoy: las tres áreas son las pestañas del mapa. La que está en juego muestra su nivel,
 *      por qué está ahí, la rueda (RuedaDelEquipo.tsx) y, al tocar una dimensión, cómo está hoy, la
 *      pregunta para confirmarlo, los cinco niveles para elegir y lo que pide Funcional. La que no
 *      está en juego se suma desde su pestaña, y la que está se saca: las dos cosas se deshacen igual.
 *   4. Qué va primero y el agente, al pie.
 * El «Por qué Ventas / Marketing» escrito a mano se fue de la pantalla (lo que dijo el cliente queda
 * como la fuente de la sugerencia); los porqués guardados se conservan.
 */
import { useState } from "react";
import { Alert, Button } from "@/components/ui";
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import { cn } from "@/lib/cn";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import { esHipotesisDeNivel, type DestinoDePropuesta, type EstimadoGuardado } from "@/lib/exploraciones/contenido";
import type { AreaDelLienzo, DimensionDelLienzo, EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { cuentaDelArea, loQueLaFrena, type PosicionEnElMapa } from "@/lib/exploraciones/mapa";
import { useLienzo } from "./contexto";
import FranjaDeSugerencias, { BotonAzul, IconoDeSugerencia } from "./FranjaDeSugerencias";
import { ConQueSeMide } from "./Identificacion";
import PanelDelAgente from "./PanelDelAgente";
import { piezaDelDestino } from "./piezas";
import { FilaSugerida } from "./Propuestas";
import { QueVaPrimero } from "./QueVaPrimero";
import RuedaDelEquipo from "./RuedaDelEquipo";

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

// ── 1 · Lo que sugiere el agente, arriba y una vez ──────────────────────────

function SugerenciasDeLaEscala() {
  const { revisables, escala, cambiar, puedeEditar, guardando } = useLienzo();
  const items = revisables.filter((it) => piezaDelDestino(it.destino) === "escala");
  if (items.length === 0) return null;
  const refrescar = items.some((it) => it.destino.tipo === "edicion" || it.destino.tipo === "perfil");
  return (
    <section aria-label="Lo que sugiere el agente" className="space-y-1.5">
      <FranjaDeSugerencias
        acciones={
          puedeEditar && (
            <BotonAzul disabled={guardando} onClick={() => void cambiar([{ op: "usarVarias", items: items.map((it) => ({ itemId: it.id, valor: it.valor })) }], { refrescar })}>
              {items.length === 1 ? "Usar la sugerida" : `Usar las ${items.length}`}
            </BotonAzul>
          )
        }
      >
        El agente sugiere {items.length === 1 ? "una cosa" : `${items.length} cosas`} en La escala. Nada se confirma solo.
      </FranjaDeSugerencias>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <FilaSugerida key={it.id} item={it} destino={dondeCae(it.destino, escala)} />
        ))}
      </ul>
    </section>
  );
}

// ── 3 · Dónde está hoy: las áreas como pestañas ──────────────────────────────

/** Lo que dice la pestaña de un área: su nivel y cuánto tiene con evidencia, o que está fuera. */
function PestanaDeArea({ area, activa, orden, onElegir }: { area: AreaDelLienzo; activa: boolean; orden: number; onElegir: () => void }) {
  const { mapa, nombreDeNivel } = useLienzo();
  const calculo = orden > 0 ? mapa.chequeo.areas.find((a) => a.id === area.id) : undefined;
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
        activa ? "border border-brand bg-surface shadow-[inset_0_0_0_1px_var(--color-brand)]" : orden > 0 ? "border border-line bg-surface hover:bg-surface-hover" : "border border-dashed border-line bg-surface-muted hover:bg-surface-hover",
      )}
    >
      <span className="flex items-center justify-between gap-1.5">
        <span className="text-sm font-semibold text-fg">{area.nombre}</span>
        {orden > 0 && <span className="text-[11px] tabular-nums text-fg-muted">{orden}.º en juego</span>}
      </span>
      {orden > 0 ? (
        <>
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
            {calculo?.nivel ? (
              <>
                <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[calculo.nivel])} aria-hidden="true" />
                {nombreDeNivel(calculo.nivel)}
                <span className={cn("text-[11px] font-semibold", todo ? "text-success-ink" : "text-warn-ink")}>{todo ? "con evidencia" : "parece"}</span>
              </>
            ) : (
              <span className="text-fg-muted">Sin ubicar todavía</span>
            )}
          </span>
          {cuenta && (
            <span className="text-xs text-fg-muted">
              {cuenta.conEvidencia} con evidencia · {cuenta.hipotesis} hipótesis{cuenta.sinDato > 0 ? ` · ${cuenta.sinDato} sin dato` : ""}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="text-[13px] text-fg-muted">Fuera de la preventa</span>
          <span className="text-xs text-fg-muted">Súmala desde aquí</span>
        </>
      )}
    </button>
  );
}

/** Una dimensión abierta: cómo está hoy, la pregunta, los cinco niveles y lo que pide Funcional. */
function DetalleDeDimension({ d, onCerrar }: { d: DimensionDelLienzo; onCerrar: () => void }) {
  const { exp, escala, mapa, cambiar, puedeEditar, guardando, nombreDeNivel, pendientesPara } = useLienzo();
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
      return void cambiar([{ op: "usar", itemId: pend.id, valor }]);
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
      ? void cambiar([{ op: "usar", itemId: sugerida.id, valor: sugerida.valor }])
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

      {puedeEditar && (
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

/** El área en juego: su nivel, por qué está ahí, la rueda y la dimensión abierta. */
function AreaEnJuego({ area, onSacar }: { area: AreaDelLienzo; onSacar: () => void }) {
  const { mapa, escala, nombreDeNivel, puedeEditar, guardando } = useLienzo();
  const [elegida, setElegida] = useState<string | null>(null);
  const calculo = mapa.chequeo.areas.find((a) => a.id === area.id);
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
              </>
            ) : (
              <span className="font-normal text-fg-muted">todavía sin ubicar</span>
            )}
          </p>
          <p className="text-xs text-fg-muted">
            {cuenta.conEvidencia} de {aplican} con evidencia · {cuenta.hipotesis} hipótesis por confirmar{cuenta.sinDato > 0 ? ` · ${cuenta.sinDato} sin dato` : ""}
          </p>
        </div>
        {puedeEditar && (
          <button type="button" disabled={guardando} onClick={onSacar} className="px-1.5 py-1 text-xs font-semibold text-fg-muted hover:text-fg hover:underline">
            Sacar {area.nombre} de la preventa
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
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-info" aria-hidden="true" />
            El agente sugiere algo
          </span>
        </figcaption>
        {!abierta && <p className="text-xs text-fg-muted">Toca una dimensión o su nombre para ver por qué está ahí y cómo confirmarlo. Al pasar el cursor por una celda, ves qué dice la escala de ese nivel.</p>}
      </figure>

      {abierta && <DetalleDeDimension key={abierta.id} d={abierta} onCerrar={() => setElegida(null)} />}
    </div>
  );
}

/** Un área fuera de la preventa: se suma desde su pestaña. */
function AreaFuera({ area, onSumar }: { area: AreaDelLienzo; onSumar: () => void }) {
  const { puedeEditar, guardando } = useLienzo();
  return (
    <div role="tabpanel" className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface-muted px-5 py-7 text-center">
      <p className="text-sm font-semibold text-fg">{area.nombre} no está en juego en esta preventa</p>
      <p className="max-w-[460px] text-[13px] text-fg-muted">Súmala si el prospecto la nombra o paga licencias que no usa. Al sumarla, el agente la ubica en la escala con lo que ya sabe.</p>
      {puedeEditar && (
        <Button size="sm" variant="secondary" className="mt-1" disabled={guardando} onClick={onSumar}>
          Sumar {area.nombre} a la preventa
        </Button>
      )}
    </div>
  );
}

function DondeEstaHoy() {
  const { exp, escala, cambiar, nombreDeNivel } = useLienzo();
  const enJuego = exp.estado.areas;
  const [cual, setCual] = useState<string | null>(null);
  const activa = escala.areas.find((a) => a.id === cual) ?? escala.areas.find((a) => enJuego.includes(a.id)) ?? escala.areas[0];
  if (!activa) return null;
  const orden = (id: string) => enJuego.indexOf(id) + 1;
  // Sumar o sacar se deshace con el mismo botón: la lista entera, en el orden en que se eligieron.
  const alternar = (id: string) => void cambiar([{ op: "areas", areas: enJuego.includes(id) ? enJuego.filter((a) => a !== id) : [...enJuego, id] }]);

  return (
    <section aria-label="Dónde está hoy" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-fg">Dónde está hoy</h3>
        <span className="text-xs text-fg-muted">Objetivo de la primera venta: llevar cada área en juego a {nombreDeNivel("F")}</span>
      </div>
      <div data-recorrido="preventa.escala.areas" role="tablist" aria-label="Áreas" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {escala.areas.map((a) => (
          <PestanaDeArea key={a.id} area={a} activa={a.id === activa.id} orden={orden(a.id)} onElegir={() => setCual(a.id)} />
        ))}
      </div>
      {enJuego.includes(activa.id) ? (
        <AreaEnJuego key={activa.id} area={activa} onSacar={() => alternar(activa.id)} />
      ) : (
        <AreaFuera area={activa} onSumar={() => alternar(activa.id)} />
      )}
    </section>
  );
}

export default function PasoEscala() {
  const { exp } = useLienzo();
  const hayAreas = exp.estado.areas.length > 0;
  // El título y de qué va la pieza los pone el lienzo, como en las demás piezas.
  return (
    <div className="flex flex-col gap-5">
      <SugerenciasDeLaEscala />
      <ConQueSeMide />
      <DondeEstaHoy />
      {hayAreas && (
        <div data-recorrido="preventa.escala.primero">
          <QueVaPrimero />
        </div>
      )}
      <PanelDelAgente modoPrincipal="leer" compacto />
    </div>
  );
}

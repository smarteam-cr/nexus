"use client";

/**
 * AntesDeLaSesion — preparar la sesión (tableros «Antes · Sesión 3», en orden y por sección,
 * 2026-10-07). De arriba hacia abajo: el objetivo que sugiere el agente (se usa, se edita o se
 * descarta), cuándo y con quién (con lo que falta: quién firma, alguien técnico), lo que traes de las
 * sesiones anteriores (y qué cambió en la guía por eso), y la guía en tres tramos —abrir, preguntar,
 * cerrar— con las preguntas en el orden de la conversación o separadas en «Arquitectura de la venta» y
 * «Escala de rendimiento». Abajo, plegado, qué hacer si se resiste.
 */
import { useState } from "react";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { puntoQueSePregunta, listaParaProponer } from "@/lib/exploraciones/calidad";
import { CASILLAS_DEL_RESUMEN, ETIQUETA_DEL_ROL, type Persona, type SiguientePaso } from "@/lib/exploraciones/casillas";
import { esFuenteDeHipotesis } from "@/lib/exploraciones/contenido";
import { diaCorto } from "@/lib/exploraciones/fechas";
import {
  APERTURA_DE_BASE,
  CIERRE_DE_BASE,
  CONEXION_DE_BASE,
  DURACION_DE_LA_SESION,
  loQueTraes,
  OBJECION,
  OBJECIONES_DE_BASE,
  POCA_APERTURA_DE_BASE,
  TRAMOS_DE_LA_SESION,
  type PestanaDeSesion,
  type PreguntaParaMostrar,
} from "@/lib/exploraciones/guia";
import { REUNIONES } from "@/lib/exploraciones/sesion";
import { useLienzo } from "./contexto";
import { DeQueEs, diaLargo, EtiquetaDePregunta, nombreDelPara, Rotulo, useEditarLaSesion, useGuiaDeLaSesion } from "./piezas-de-la-sesion";
import { QueVaPrimero } from "./QueVaPrimero";
import Segmentos from "./Segmentos";
import { lineasDe } from "./Resumen";
import { useSesiones } from "./useSesiones";

type Vista = "orden" | "seccion";

// ── El objetivo ───────────────────────────────────────────────────────────────

/** «Si sale bien…»: cuántos de los puntos que faltan para proponer cubre la guía. */
function siSaleBien(faltan: number, cubre: number): string {
  if (faltan === 0) return "La preventa ya está lista para proponer: esta sesión confirma y profundiza.";
  if (cubre === faltan) return `Si sale bien, la preventa queda lista para proponer: la guía cubre ${faltan === 1 ? "el punto que falta" : `los ${faltan} puntos que faltan`}.`;
  return `La guía cubre ${cubre} de los ${faltan} puntos que faltan para proponer.`;
}

function Objetivo({ pestana, esLaProxima, sugerido, preguntas }: { pestana: PestanaDeSesion; esLaProxima: boolean; sugerido: string | null; preguntas: PreguntaParaMostrar[] }) {
  const { exp, chequeo, puedeEditar, guardando } = useLienzo();
  const editar = useEditarLaSesion(pestana, "antes");
  const s = pestana.sesion;
  const confirmado = s?.objetivo ?? null;
  const ofrecer = !confirmado && sugerido && sugerido !== s?.objetivoDescartado ? sugerido : null;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");

  const puntos = listaParaProponer(exp.estado, chequeo);
  const paras = new Set(preguntas.map((p) => p.para));
  const hayDimensiones = preguntas.some((p) => p.tipo === "dimension");
  const faltan = puntos.filter((p) => !p.cumplido);
  const cubre = faltan.filter((p) => puntoQueSePregunta(p.id, paras, hayDimensiones)).length;

  const guardar = (valor: string) => {
    const t = valor.trim();
    void editar((x) => ({ ...x, ...(t ? { objetivo: t.slice(0, 400) } : { objetivo: undefined }) })).then((ok) => ok && setEditando(false));
  };

  if (editando) {
    return (
      <section className="space-y-2.5 rounded-xl border border-line bg-surface px-[18px] py-4">
        <Rotulo>Objetivo de la sesión</Rotulo>
        <textarea
          value={texto}
          onChange={(ev) => setTexto(ev.target.value)}
          maxLength={400}
          rows={3}
          autoFocus
          aria-label="Objetivo de la sesión"
          placeholder="Qué tienes que salir sabiendo de esta sesión"
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-[1.5] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <BotonTexto onClick={() => setEditando(false)}>Cancelar</BotonTexto>
          <BotonAzul disabled={guardando} onClick={() => guardar(texto)}>
            Guardar
          </BotonAzul>
        </div>
      </section>
    );
  }

  if (confirmado) {
    return (
      <section className="flex items-start gap-4 rounded-xl border border-line bg-surface px-[18px] py-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Rotulo>Objetivo de la sesión</Rotulo>
          <p className="text-[15px] font-semibold leading-[1.4] text-fg">{confirmado}</p>
          {esLaProxima && <p className="text-[13px] leading-[1.45] text-fg-secondary">{siSaleBien(faltan.length, cubre)}</p>}
        </div>
        {puedeEditar && (
          <BotonBlanco
            onClick={() => {
              setTexto(confirmado);
              setEditando(true);
            }}
          >
            Editar
          </BotonBlanco>
        )}
      </section>
    );
  }

  if (ofrecer) {
    return (
      <section className="space-y-2.5 rounded-xl border border-info-line bg-info-surface px-[18px] py-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
          <IconoDeSugerencia className="h-[13px] w-[13px]" />
          El agente sugiere el objetivo de esta sesión
        </p>
        <p className="text-[15px] font-semibold leading-[1.4] text-fg">{ofrecer}</p>
        {esLaProxima && <p className="text-[13px] leading-[1.45] text-fg-secondary">{siSaleBien(faltan.length, cubre)}</p>}
        {puedeEditar && (
          <div className="flex items-center justify-end gap-2">
            <BotonTexto disabled={guardando} onClick={() => void editar((x) => ({ ...x, objetivoDescartado: ofrecer }))}>
              Descartar
            </BotonTexto>
            <BotonBlanco
              onClick={() => {
                setTexto(ofrecer);
                setEditando(true);
              }}
            >
              Editar
            </BotonBlanco>
            <BotonAzul disabled={guardando} onClick={() => guardar(ofrecer)}>
              Usar
            </BotonAzul>
          </div>
        )}
      </section>
    );
  }

  if (!puedeEditar) return null;
  return (
    <section className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-[18px] py-3.5">
      <p className="min-w-0 flex-1 text-[13px] text-fg-muted">Sin objetivo todavía: lo sugiere el agente al armar la guía, o escríbelo tú.</p>
      <BotonBlanco
        onClick={() => {
          setTexto("");
          setEditando(true);
        }}
      >
        Escribirlo
      </BotonBlanco>
    </section>
  );
}

// ── Cuándo y con quién ────────────────────────────────────────────────────────

function CuandoYConQuien({ pestana }: { pestana: PestanaDeSesion }) {
  const { exp } = useLienzo();
  const { hoy, todas } = useSesiones();
  const c = exp.estado.contenido.casillas;
  const paso = c.siguientePaso as SiguientePaso | undefined;
  const personas = ((c.autoridad as Persona[] | undefined) ?? []).slice(0, 3);
  const fecha = pestana.sesion?.fecha ?? pestana.fecha;
  const pasoVencido = !!paso?.fecha && paso.fecha < hoy;
  const faltan: string[] = [];
  if (!personas.some((p) => p.rol === "firma")) faltan.push("Falta: quién firma");
  const t = exp.estado.propuesta.alertaTecnica;
  if (t && !t.vista) {
    const de = todas.find((p) => p.reunion && t.reunion.includes(p.reunion.titulo));
    faltan.push(`Falta: alguien técnico${de && !de.noSeHizo ? ` · lo pidió la sesión ${de.numero}` : ""}`);
  }
  return (
    <section className="grid gap-[18px] rounded-xl border border-line bg-surface px-[18px] py-4 sm:grid-cols-2">
      <div className="min-w-0">
        <Rotulo>Cuándo</Rotulo>
        <p className="mt-1.5 text-sm text-fg">{fecha ? diaLargo(fecha) : "Sin agendar"}</p>
        {pasoVencido ? (
          <p className="mt-0.5 text-xs text-warn-ink">No hay un siguiente paso vigente: el último era del {diaCorto(paso!.fecha!)}.</p>
        ) : (
          paso?.que && <p className="mt-0.5 text-xs text-fg-muted">Acordado: {paso.que}</p>
        )}
      </div>
      <div className="min-w-0">
        <Rotulo>Con quién</Rotulo>
        {personas.length ? (
          <p className="mt-1.5 text-sm text-fg">
            {personas.map((p, i) => (
              <span key={`${p.nombre}-${i}`}>
                {i > 0 && ", "}
                {p.nombre}
                <span className="text-[13px] text-fg-muted"> · {p.cargo ?? ETIQUETA_DEL_ROL[p.rol]}</span>
              </span>
            ))}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-fg-muted">Sin nadie confirmado todavía</p>
        )}
        {faltan.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {faltan.map((f) => (
              <span key={f} className="rounded-full border border-dashed border-line bg-surface-muted px-[9px] py-0.5 text-xs text-fg-muted">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Lo que traes de las sesiones anteriores ───────────────────────────────────

function LoQueTraes({ pestana }: { pestana: PestanaDeSesion }) {
  const { exp, escala, sesion: seleccion } = useLienzo();
  const { todas } = useSesiones();
  const filas = loQueTraes(pestana, todas, { nombreDe: (para) => nombreDelPara(para, escala), tecnica: exp.estado.propuesta.alertaTecnica });
  const respondidas = CASILLAS_DEL_RESUMEN.filter((c) => lineasDe(c, exp.estado.contenido.casillas[c]).length > 0);
  const hayAnteriores = todas.slice(0, Math.max(0, todas.findIndex((p) => p.clave === pestana.clave))).some((p) => p.hecha && !p.noSeHizo);
  if (!filas.length && !(hayAnteriores && respondidas.length)) return null;
  const ir = (clave: string) => {
    seleccion.elegir(clave);
    seleccion.ponerMomento(clave, "despues");
  };
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-[18px] py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">Lo que traes de las sesiones anteriores</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">Esto ya cambió la guía de hoy.</p>
      </header>
      {filas.map((f) => (
        <div key={f.clave} className="flex gap-4 border-b border-surface-hover px-[18px] py-3.5 last:border-b-0">
          <div className="w-[110px] flex-none">
            <button type="button" className="text-[13px] font-semibold text-brand hover:underline" onClick={() => ir(f.clave)}>
              Sesión {f.numero}
            </button>
            <p className={cn("mt-0.5 text-xs", f.aviso ? "text-warn-ink" : "text-fg-muted")}>
              {[f.fecha ? diaCorto(f.fecha) : null, f.estado].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ul className="min-w-0 flex-1 space-y-[9px] text-[13px] leading-[19px] text-fg-secondary">
            {f.lineas.map((l, i) => (
              <li key={i}>
                {l.texto} <span className="font-semibold text-fg">→ {l.consecuencia}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {hayAnteriores && respondidas.length > 0 && (
        <div className="flex gap-4 px-[18px] py-3.5">
          <div className="w-[110px] flex-none text-xs text-fg-muted">Hasta hoy</div>
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[13px] leading-[19px] text-fg-secondary">
            Ya respondido:
            {respondidas.map((c) => (
              <span key={c} className="rounded-full border border-success-line bg-success-surface px-2 py-px text-[11.5px] text-success-ink">
                ✓ {nombreDelPara(c, escala)}
              </span>
            ))}
            <span className="font-semibold text-fg">→ no se repregunta.</span>
          </p>
        </div>
      )}
    </section>
  );
}

// ── La guía ───────────────────────────────────────────────────────────────────

/** Un tramo de la sesión: su nombre y sus minutos a la izquierda, lo que se hace a la derecha. */
function Tramo({ nombre, minutos, children, className }: { nombre: string; minutos: readonly [number, number]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 px-[18px] py-4 sm:flex-row sm:gap-4", className)}>
      <div className="sm:w-[92px] sm:flex-none">
        <Rotulo>{nombre}</Rotulo>
        <p className="mt-0.5 text-xs text-fg-muted">
          {minutos[0]} – {minutos[1]} min
        </p>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Pregunta({ p, corta, borde }: { p: PreguntaParaMostrar; corta?: boolean; borde?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <li className={cn("flex gap-3 py-3.5 first:pt-0 last:pb-0", borde && "border-b border-surface-hover last:border-b-0")}>
      <EtiquetaDePregunta p={p} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold leading-[21px] text-fg">{p.pregunta}</p>
        <DeQueEs p={p} corta={corta} />
        {p.repreguntas.length > 0 && (
          <>
            {abierta && (
              <div className="mt-2 flex flex-col gap-1 border-l-2 border-line pl-3">
                <span className="text-xs text-fg-muted">Si responde rápido, profundiza:</span>
                {p.repreguntas.map((r, i) => (
                  <span key={i} className="text-[13px] text-fg-secondary">
                    {r}
                  </span>
                ))}
              </div>
            )}
            <button type="button" aria-expanded={abierta} onClick={() => setAbierta((x) => !x)} className="mt-1.5 text-[12.5px] text-brand hover:underline">
              {abierta ? "Ocultar repreguntas" : `${p.repreguntas.length} ${p.repreguntas.length === 1 ? "repregunta" : "repreguntas"}`}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** Una de las dos columnas de «Por sección». */
function Columna({ titulo, detalle, preguntas, vacio }: { titulo: string; detalle: string; preguntas: PreguntaParaMostrar[]; vacio: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line">
      <div className="flex items-baseline gap-2 border-b border-line px-4 py-3">
        <h4 className="text-[15px] font-semibold text-fg">{titulo}</h4>
        <span className="text-xs text-fg-muted">{detalle}</span>
      </div>
      {preguntas.length ? (
        <ul className="px-4 py-3">
          {preguntas.map((p) => (
            <Pregunta key={`${p.para}-${p.pregunta}`} p={p} corta borde />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-[13px] text-fg-muted">{vacio}</p>
      )}
    </div>
  );
}

function LaGuia({ pestana, esLaProxima }: { pestana: PestanaDeSesion; esLaProxima: boolean }) {
  const { exp, escala } = useLienzo();
  const { guia, preguntas, enOrden } = useGuiaDeLaSesion(pestana, esLaProxima);
  const [vista, setVista] = useState<Vista>("orden");
  const e = exp.estado;
  const conTest = exp.leido.tests.length > 0;
  const conEvidencia = Object.values(e.contenido.chequeo).some((x) => !esFuenteDeHipotesis(x.fuente)) || e.propuesta.leidas.sesiones.length > 0;
  const desdeCero = esLaProxima && !conTest && !conEvidencia && pestana.numero === 1;
  const apertura = guia?.apertura ?? [];
  const deTarjetas = preguntas.filter((p) => p.tipo === "tarjeta");
  const deDimensiones = preguntas.filter((p) => p.tipo === "dimension");
  const sueltas = preguntas.filter((p) => p.tipo === "abierto");
  const faltan = CASILLAS_DEL_RESUMEN.filter((c) => lineasDe(c, e.contenido.casillas[c]).length === 0).length;
  const areasEnJuego = escala.areas.filter((a) => e.areas.includes(a.id)).map((a) => a.nombre);

  return (
    <section data-recorrido="preventa.sesion.preguntas" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-[18px] py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">La guía</h3>
        <span className="text-[12.5px] text-fg-muted">
          {DURACION_DE_LA_SESION} min · {preguntas.length} {preguntas.length === 1 ? "pregunta" : "preguntas"}
        </span>
        <span className="flex-1" />
        <Segmentos
          etiqueta="Cómo ver las preguntas"
          opciones={[
            { clave: "orden", nombre: "En orden" },
            { clave: "seccion", nombre: "Por sección" },
          ]}
          valor={vista}
          onCambiar={setVista}
        />
      </header>

      <Tramo nombre="Abrir" minutos={TRAMOS_DE_LA_SESION.abrir} className="border-b border-line">
        <div className="space-y-2">
          {conTest && pestana.numero === 1 && <p className="text-[13px] text-fg-muted">{REUNIONES[0].promesa}</p>}
          {desdeCero && <p className="text-[13px] text-fg-muted">No hizo el test: empieza conectando, y después explícale la escala en simple.</p>}
          {apertura.map((a, i) => (
            <p key={`a-${i}`} className="text-[14.5px] leading-[21px] text-fg">
              «{a.replace(/^«|»$/g, "")}»
            </p>
          ))}
          {desdeCero &&
            CONEXION_DE_BASE.map((q, i) => (
              <p key={`c-${i}`} className="text-[14.5px] leading-[21px] text-fg">
                «{q}»
              </p>
            ))}
          {desdeCero && guia?.escalaEnSimple && (
            <p className="text-[13px] text-fg-secondary">
              <span className="font-semibold text-fg">La escala, en simple: </span>
              {guia.escalaEnSimple}
            </p>
          )}
          {!apertura.length && !desdeCero && <p className="text-[14.5px] leading-[21px] text-fg">{APERTURA_DE_BASE}</p>}
        </div>
      </Tramo>

      {vista === "orden" ? (
        <Tramo nombre="Preguntar" minutos={TRAMOS_DE_LA_SESION.preguntar}>
          {enOrden.length ? (
            <ol>
              {enOrden.map((p) => (
                <Pregunta key={`${p.para}-${p.pregunta}`} p={p} borde />
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-fg-muted">
              {e.areas.length === 0 ? "Elige las áreas en juego en «La escala» para saber qué preguntar." : "El marco está completo y las dimensiones en juego tienen evidencia: esta sesión confirma y profundiza."}
            </p>
          )}
        </Tramo>
      ) : (
        <div className="space-y-4 px-[18px] py-4">
          {sueltas.length > 0 && (
            <div className="rounded-xl border border-line px-4 py-3">
              <p className="mb-2 text-[13px] font-semibold text-fg">Quedó abierto</p>
              <ul>
                {sueltas.map((p) => (
                  <Pregunta key={p.para} p={p} borde />
                ))}
              </ul>
            </div>
          )}
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Columna
              titulo="Arquitectura de la venta"
              detalle={faltan > 0 ? `faltan ${faltan} de 8` : "completa"}
              preguntas={deTarjetas}
              vacio="El marco está completo: no falta nada por preguntar."
            />
            <Columna
              titulo="Escala de rendimiento"
              detalle={[areasEnJuego.join(" · "), deDimensiones.length ? `${deDimensiones.length} sin evidencia` : ""].filter(Boolean).join(" · ")}
              preguntas={deDimensiones}
              vacio={e.areas.length === 0 ? "Elige las áreas en juego en «La escala» para saber qué dimensiones preguntar." : "Todas las dimensiones en juego ya tienen evidencia."}
            />
          </div>
        </div>
      )}

      <Tramo nombre="Cerrar" minutos={TRAMOS_DE_LA_SESION.cerrar} className="border-t border-line">
        <p className="text-[14.5px] font-semibold leading-[21px] text-fg">Pide el siguiente paso con fecha y con quién.</p>
        <p className="mt-1 text-[13px] leading-[19px] text-fg-secondary">{guia?.cierre ?? CIERRE_DE_BASE}</p>
      </Tramo>
    </section>
  );
}

/** Qué hacer si se resiste, plegado: lo que se pregunta ante cada objeción, y la señal de poca apertura. */
export function SiSeResiste({ pestana, esLaProxima, compacto = false }: { pestana: PestanaDeSesion; esLaProxima: boolean; compacto?: boolean }) {
  const { abrirObjeciones } = useLienzo();
  const { guia } = useGuiaDeLaSesion(pestana, esLaProxima);
  const objeciones = guia?.objeciones.length ? guia.objeciones : OBJECIONES_DE_BASE;
  const nombres = objeciones.slice(0, 3).map((o) => OBJECION[o.tipo].toLowerCase());
  return (
    <details className="rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer select-none px-[18px] py-3.5 text-sm font-semibold text-fg">
        Si se resiste {!compacto && <span className="text-[13px] font-normal text-fg-muted">· {nombres.join(", ")}</span>}
      </summary>
      <div className="space-y-2 px-[18px] pb-4 text-[13px] leading-[19px] text-fg-secondary">
        {objeciones.map((o) => (
          <p key={o.tipo}>
            <span className="font-medium text-fg">{OBJECION[o.tipo]}</span> → {o.explorar}
          </p>
        ))}
        {!compacto && <p className="text-fg-muted">{guia?.pocaApertura ?? POCA_APERTURA_DE_BASE}</p>}
        <button type="button" className="text-[12.5px] text-brand hover:underline" onClick={abrirObjeciones}>
          Ver cómo responder cada una
        </button>
      </div>
    </details>
  );
}

export default function AntesDeLaSesion({ pestana, esLaProxima }: { pestana: PestanaDeSesion; esLaProxima: boolean }) {
  const { exp } = useLienzo();
  const { guia, preguntas } = useGuiaDeLaSesion(pestana, esLaProxima);
  const traidos = pestana.sesion?.explorar ?? [];
  const conTest = exp.leido.tests.length > 0;

  if (!esLaProxima && !guia) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-[13px] text-fg-muted">
        <p>
          {pestana.hecha
            ? "No quedó guardada la guía con que se preparó esta sesión. La de la próxima está en su sesión, a la izquierda."
            : "Su guía se arma cuando sea la próxima sesión: primero va la que está antes."}
        </p>
        {!pestana.hecha && traidos.length > 0 && (
          <div className="mx-auto max-w-xl text-left">
            <Rotulo>Te llevas a esta sesión</Rotulo>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13.5px] text-fg-secondary">
              {traidos.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Objetivo pestana={pestana} esLaProxima={esLaProxima} sugerido={guia?.objetivo ?? null} preguntas={preguntas} />
      {esLaProxima && <CuandoYConQuien pestana={pestana} />}
      {esLaProxima && <LoQueTraes pestana={pestana} />}
      <LaGuia pestana={pestana} esLaProxima={esLaProxima} />
      {conTest && pestana.numero === 1 && (
        <details className="rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer select-none px-[18px] py-3.5 text-sm font-semibold text-fg">Su plan: qué va primero (es lo que se lleva de esta reunión)</summary>
          <div className="border-t border-line p-4">
            <QueVaPrimero />
          </div>
        </details>
      )}
      <SiSeResiste pestana={pestana} esLaProxima={esLaProxima} />
    </div>
  );
}

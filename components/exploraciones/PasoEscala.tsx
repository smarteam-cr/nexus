"use client";

/**
 * PasoEscala — dónde parece estar cada equipo en la escala, y por qué.
 *
 * Pedido de Elías (2026-10-01): «la escala con las etapas en las que parece estar el equipo, con una
 * justificación del por qué generada por IA», con lo que tiene evidencia y lo que es hipótesis (se
 * cree que está ahí y hay que explorarlo para saber si está o no). Por área en juego: la rueda
 * (components/exploraciones/RuedaDelEquipo.tsx), el nivel del área con lo que lo deja ahí y, al
 * costado, las ocho dimensiones —o la elegida, con su porqué, sus frases, la pregunta para
 * confirmarla y lo que pide Funcional—. El vendedor no estima a mano: confirma o corrige con un clic.
 */
import { useState } from "react";
import { Alert, Badge, Button, Tabs } from "@/components/ui";
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import { cn } from "@/lib/cn";
import type { Letra } from "@/lib/escala/documento/tipos";
import { esHipotesisDeNivel, type EstimadoGuardado } from "@/lib/exploraciones/contenido";
import type { AreaDelLienzo, DimensionDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { cuentaDelArea, loQueLaFrena, type PosicionEnElMapa } from "@/lib/exploraciones/mapa";
import { useLienzo } from "./contexto";
import PanelDelAgente from "./PanelDelAgente";
import { Propuestas } from "./Propuestas";
import { NivelChip, QueVaPrimero } from "./QueVaPrimero";
import RuedaDelEquipo from "./RuedaDelEquipo";

const LETRAS: Letra[] = ["D", "I", "F", "E", "O"];

/** «A», «A y B», «A, B y C». */
const enLista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** «Con evidencia» / «Hipótesis» / «Sin dato», con el color que las distingue. */
function Clase({ p }: { p: PosicionEnElMapa | undefined }) {
  if (!p) return <Badge size="xs">Sin dato</Badge>;
  return p.clase === "evidencia" ? (
    <Badge size="xs" variant="success">
      Con evidencia
    </Badge>
  ) : (
    <Badge size="xs" variant="warning" title="Se cree que está ahí: hay que explorarlo en la reunión para saber si está o no.">
      Hipótesis
    </Badge>
  );
}

/** De dónde sale lo dibujado, en palabras. */
function deDonde(p: PosicionEnElMapa): string {
  if (p.fuente === "test") return "Lo marcó en el test (con la escala anterior).";
  if (p.fuente === "hipotesis") return "Lo deduce el agente de lo que hay en HubSpot.";
  if (p.fuente === "vendedor") return "Lo marcaste tú.";
  if (p.fuente === "portal") return "Se vio en su portal.";
  return p.origen === "propuesto" ? "Lo dijo en una reunión (el agente lo leyó de la transcripción)." : "Lo dijo en una reunión.";
}

function Leyenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-sm bg-fg-muted" aria-hidden="true" /> Lleno: con evidencia (lo dijo el cliente o se vio)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-3 w-5 rounded-sm border border-dashed border-fg-muted"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, var(--color-fg-muted) 0 2px, transparent 2px 5px)" }}
          aria-hidden="true"
        />{" "}
        Rayado: hipótesis, para explorar en la reunión
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-brand" aria-hidden="true" /> El agente propone algo nuevo
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0 w-5 border-t-2 border-dashed border-success" aria-hidden="true" /> Funcional, el objetivo de la primera venta
      </span>
    </div>
  );
}

/** La lista de las ocho dimensiones del área (al costado de la rueda, cuando no hay una abierta). */
function ListaDeDimensiones({ area, onElegir }: { area: AreaDelLienzo; onElegir: (id: string) => void }) {
  const { mapa, exp } = useLienzo();
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {area.dimensiones.map((d) => {
        const p = d.aplica ? mapa.posiciones[d.id] : undefined;
        return (
          <li key={d.id}>
            <button
              type="button"
              disabled={!d.aplica}
              onClick={() => onElegir(d.id)}
              className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-surface-muted disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-sm text-fg">
                  {p?.porRevisar && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-brand" aria-label="Algo nuevo del agente" />}
                  <span>{d.nombre}</span>
                  {d.id in exp.estado.contenido.aExplorar && (
                    <Badge size="xs" variant="primary">
                      A explorar
                    </Badge>
                  )}
                </span>
                {!d.aplica && <span className="block text-xs text-fg-muted">No aplica a este perfil de negocio</span>}
              </span>
              {d.aplica && (
                <span className="flex flex-shrink-0 items-center gap-2">
                  <NivelChip nivel={p?.nivel ?? null} />
                  <Clase p={p} />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Una dimensión abierta: dónde parece estar, por qué, cómo confirmarlo y lo que pide Funcional. */
function DetalleDeDimension({ area, d, onCerrar }: { area: AreaDelLienzo; d: DimensionDelLienzo; onCerrar: () => void }) {
  const { exp, escala, mapa, cambiar, puedeEditar, guardando, nombreDeNivel, pendientesPara } = useLienzo();
  const p = mapa.posiciones[d.id];
  const confirmado = exp.estado.contenido.chequeo[d.id];
  const marcada = exp.estado.contenido.aExplorar[d.id];
  const nombreDeCapa = escala.capas.find((c) => c.clave === d.capa)?.nombre ?? d.capa;

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

  const explorar = () =>
    void cambiar([
      {
        op: "aExplorar",
        dimensionId: d.id,
        valor: marcada ? null : { motivo: p && LETRAS.indexOf(p.nivel) < LETRAS.indexOf("F") ? "indicio" : "otro", ...(p?.porQue ? { razon: p.porQue.slice(0, 300) } : {}) },
      },
    ]);

  const faltaPendiente = pendientesPara((x) => x.tipo === "falta" && d.funcional.some((c) => c.id === x.criterioId));

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">
            {area.nombre} · {nombreDeCapa}
          </p>
          <h3 className="text-base font-semibold text-fg">{d.nombre}</h3>
          {d.descripcion && <p className="text-xs text-fg-muted">{d.descripcion}</p>}
        </div>
        <Button size="xs" variant="ghost" onClick={onCerrar} aria-label="Volver a la lista">
          Volver
        </Button>
      </div>

      <div className="space-y-2 rounded-lg bg-surface-muted p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg-secondary">{p ? (p.clase === "evidencia" ? "Está en" : "Parece estar en") : "Todavía sin dato"}</span>
          {p && <NivelChip nivel={p.nivel} className="text-sm" />}
          <Clase p={p} />
        </div>
        {p?.porQue && (
          <p className="text-sm text-fg">
            <span className="font-medium">Por qué: </span>
            {p.porQue}
          </p>
        )}
        {p && <p className="text-xs text-fg-muted">{deDonde(p)}</p>}
        {p && p.citas.length > 0 && (
          <ul className="space-y-1">
            {p.citas.map((c, i) => (
              <li key={`${c.id}-${i}`} className="text-xs text-fg-secondary">
                <span className="italic">«{c.cita}»</span> <span className="text-fg-muted">— {c.etiqueta}</span>
              </li>
            ))}
          </ul>
        )}
        {p?.riesgo && (
          <Alert variant="warning" title={`Dejó ver un riesgo: por eso no se estima por encima de ${nombreDeNivel("F")}.`}>
            {d.riesgos.map((r) => (
              <p key={r.id}>{r.mensaje ?? r.texto}</p>
            ))}
          </Alert>
        )}
        {p?.origen === "propuesto" && p.clase === "hipotesis" && puedeEditar && p.pendiente && (
          <button
            type="button"
            className="text-xs text-fg-muted underline hover:text-fg"
            disabled={guardando}
            onClick={() => void cambiar([{ op: "descartar", itemIds: [p.pendiente!.id] }])}
          >
            Descartar esta hipótesis
          </button>
        )}
      </div>

      {p?.porRevisar && p.pendiente && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-fg-secondary">El agente propone, por lo que leyó de la reunión:</p>
          <Propuestas items={[p.pendiente]} />
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-fg-secondary">Para confirmarlo, pregunta:</p>
        <p className="rounded-lg border border-brand/25 bg-brand/5 px-3 py-2 text-sm text-fg">{d.pregunta}</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-fg-secondary">{puedeEditar ? "¿Dónde está? Elige el nivel que mejor lo describe" : "Lo que describe cada nivel"}</p>
        <ul className="space-y-1" role="radiogroup" aria-label={`Nivel de ${d.nombre}`}>
          {LETRAS.map((l) => {
            const nivel = d.niveles.find((n) => n.letra === l);
            const actual = p?.nivel === l;
            return (
              <li key={l}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={actual}
                  disabled={!puedeEditar || guardando}
                  onClick={() => marcar(l)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                    actual ? "border-fg/40 bg-surface-muted" : "border-line hover:bg-surface-muted",
                    "disabled:cursor-default",
                  )}
                >
                  <span className={cn("mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full", PUNTO_DE_NIVEL[l])} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{nombreDeNivel(l)}</span>
                    {nivel?.descripcion && <span className="line-clamp-3 block text-xs text-fg-muted">{nivel.descripcion}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {d.funcional.length > 0 && (
        <details className="rounded-lg border border-line" open={!!marcada}>
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-fg-secondary">
            Lo que pide {nombreDeNivel("F")} ({d.funcional.length}): la guía de qué falta
          </summary>
          <ul className="space-y-2 border-t border-line px-3 py-2">
            {d.funcional.map((c) => {
              const estado = exp.estado.contenido.falta[c.id]?.estado;
              return (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border text-2xs",
                      estado === "tiene" ? "border-success-line bg-success-surface text-success-ink" : estado === "no_tiene" ? "border-destructive/40 text-destructive" : "border-line text-fg-muted",
                    )}
                    aria-label={estado === "tiene" ? "Lo tiene" : estado === "no_tiene" ? "No lo tiene" : "No se sabe"}
                  >
                    {estado === "tiene" ? "✓" : estado === "no_tiene" ? "✕" : ""}
                  </span>
                  <span className="min-w-0 text-fg-secondary">
                    {c.texto}
                    {c.verificacion === "comprobable" && (
                      <Badge size="xs" variant="info" className="ml-1.5">
                        Míralo en el portal
                      </Badge>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {faltaPendiente.length > 0 && (
            <div className="border-t border-line px-3 py-2">
              <Propuestas items={faltaPendiente} compacto />
            </div>
          )}
        </details>
      )}

      {puedeEditar && (
        <Button size="sm" variant={marcada ? "ghost" : "secondary"} disabled={guardando} aria-pressed={!!marcada} onClick={explorar}>
          {marcada ? "✓ Se explora en la segunda reunión" : "Explorarla en la segunda reunión"}
        </Button>
      )}
    </div>
  );
}

function AreaDelMapa({ area }: { area: AreaDelLienzo }) {
  const { mapa, escala, nombreDeNivel } = useLienzo();
  const [elegida, setElegida] = useState<string | null>(null);
  const calculo = mapa.chequeo.areas.find((a) => a.id === area.id);
  if (!calculo) return null;
  const cuenta = cuentaDelArea(calculo, mapa.posiciones);
  const frena = loQueLaFrena(calculo);
  const nombreDeCapa = (c: string) => escala.capas.find((x) => x.clave === c)?.nombre ?? c;
  const dimDeLaFrena = frena?.dimensiones.map((id) => area.dimensiones.find((d) => d.id === id)).filter((d): d is DimensionDelLienzo => !!d) ?? [];
  const porQueDeLaFrena = dimDeLaFrena.map((d) => mapa.posiciones[d.id]?.porQue).find(Boolean);
  const todoConEvidencia = cuenta.hipotesis === 0 && cuenta.sinDato === 0;
  const abierta = elegida ? area.dimensiones.find((d) => d.id === elegida) : null;

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-fg">
            {area.nombre}
            {calculo.nivel ? (
              <span className="font-normal text-fg-secondary"> {todoConEvidencia ? "está en" : "parece estar en"} </span>
            ) : null}
          </h3>
          {calculo.nivel && (
            <span className="inline-flex items-center gap-1.5 text-base font-semibold text-fg">
              <span className={cn("h-3 w-3 rounded-full", PUNTO_DE_NIVEL[calculo.nivel])} aria-hidden="true" />
              {nombreDeNivel(calculo.nivel)}
            </span>
          )}
          <span className="text-xs text-fg-muted">
            · {cuenta.conEvidencia} con evidencia · {cuenta.hipotesis} hipótesis · {cuenta.sinDato} sin dato
          </span>
        </div>
        {calculo.nivel && frena ? (
          <p className="text-sm text-fg-secondary">
            <span className="font-medium text-fg">Por qué: </span>
            {dimDeLaFrena.length === 1 ? "lo frena " : "lo frenan "}
            {enLista(dimDeLaFrena.map((d) => `«${d.nombre}»`))}, en {nombreDeNivel(frena.nivel)}: {dimDeLaFrena.length === 1 ? "es" : "son"} lo más débil de su{" "}
            {nombreDeCapa(frena.capa).toLowerCase()}, y la escala ubica al equipo en su capa más baja.
            {porQueDeLaFrena ? ` ${porQueDeLaFrena}` : ""}
          </p>
        ) : (
          <p className="text-sm text-fg-muted">
            {calculo.faltan.length === 1 ? "Falta una dimensión" : `Faltan ${calculo.faltan.length} dimensiones`} sin dato: pregúntalas en la reunión. Sin las ocho no se sabe cuál es la más débil.
          </p>
        )}
        {calculo.objetivo && calculo.nivel && calculo.objetivo !== calculo.nivel && (
          <p className="text-xs text-fg-muted">Objetivo de la primera venta: {nombreDeNivel(calculo.objetivo)}.</p>
        )}
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <RuedaDelEquipo
          area={area}
          posiciones={mapa.posiciones}
          niveles={escala.niveles}
          nivelDelArea={calculo.nivel}
          elegida={elegida}
          onElegir={setElegida}
        />
        {abierta ? (
          <DetalleDeDimension key={abierta.id} area={area} d={abierta} onCerrar={() => setElegida(null)} />
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-fg-muted">Toca una dimensión (en la rueda o aquí) para ver por qué está ahí y cómo confirmarlo.</p>
            <ListaDeDimensiones area={area} onElegir={setElegida} />
          </div>
        )}
      </div>
    </section>
  );
}

export default function PasoEscala() {
  const { exp, escala, irA } = useLienzo();
  const enJuego = escala.areas.filter((a) => exp.estado.areas.includes(a.id));
  const [cual, setCual] = useState<string | null>(null);
  const area = enJuego.find((a) => a.id === cual) ?? enJuego[0];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-fg-secondary">
          Dónde parece estar cada equipo en la Escala de Rendimiento{escala.edicion ? ` (edición ${escala.edicion.nombre})` : ""}. Antes de hablar con el cliente son hipótesis del agente; después de cada reunión, el agente lee la transcripción y propone dónde está, con la frase que lo respalda.
        </p>
        <Leyenda />
      </div>

      {enJuego.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-fg-muted">
          Elige primero las áreas en juego, en{" "}
          <button type="button" className="text-brand-light underline" onClick={() => irA("preparacion")}>
            Preparación
          </button>
          .
        </p>
      ) : (
        <>
          {enJuego.length > 1 && (
            <Tabs<string>
              aria-label="Áreas en juego"
              variant="pill"
              value={area.id}
              onChange={setCual}
              items={enJuego.map((a) => ({ key: a.id, label: a.nombre }))}
            />
          )}
          <AreaDelMapa key={area.id} area={area} />
          <QueVaPrimero />
          <PanelDelAgente modoPrincipal="leer" compacto />
        </>
      )}
    </div>
  );
}

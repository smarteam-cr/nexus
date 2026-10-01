"use client";

/**
 * GuiaDeLaProxima — la guía de la PRÓXIMA reunión, para tenerla abierta mientras se conversa.
 *
 * Pedido de Elías (2026-10-01): que el vendedor llegue sabiendo con quién habla, qué preguntar, cómo
 * profundizar y cómo manejar las objeciones, sin anotar nada (la transcripción la lee el agente).
 * Apunta a lo que todavía falta: las tarjetas vacías del resumen y hasta 4 dimensiones sin evidencia.
 * Cada pregunta trae tres repreguntas PLEGADAS (la siguiente pregunta lógica, para llegar al dolor y
 * cuantificarlo), y las objeciones van con LAER. La arma el agente al final de cada preparación y de
 * cada lectura; sin ella, se ve la de base (lib/exploraciones/guia.ts).
 */
import { Alert, Badge, Button } from "@/components/ui";
import { definicionDe, type ClaveDeCasilla } from "@/lib/exploraciones/casillas";
import { diaConAnio, diaYHora, hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import {
  CIERRE_DE_BASE,
  CONEXION_DE_BASE,
  focoDeLaGuia,
  guiaVieja,
  OBJECION,
  OBJECIONES_DE_BASE,
  PASOS_LAER,
  POCA_APERTURA_DE_BASE,
  preguntasParaMostrar,
  proximaReunion,
  type PreguntaParaMostrar,
} from "@/lib/exploraciones/guia";
import { esFuenteDeHipotesis } from "@/lib/exploraciones/contenido";
import { REUNIONES } from "@/lib/exploraciones/sesion";
import { useLienzo } from "./contexto";
import { NivelChip, QueVaPrimero } from "./QueVaPrimero";
import { useCorrida } from "./useCorrida";

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{titulo}</p>
        {ayuda && <p className="text-xs text-fg-muted">{ayuda}</p>}
      </div>
      {children}
    </div>
  );
}

function Pregunta({ p }: { p: PreguntaParaMostrar }) {
  const { escala, mapa } = useLienzo();
  const dimension = p.tipo === "dimension" ? escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === p.para) : null;
  const pos = dimension ? mapa.posiciones[dimension.id] : undefined;
  return (
    <li className="space-y-1.5 rounded-lg border border-line bg-surface px-3 py-2">
      <p className="flex flex-wrap items-center gap-1.5 text-2xs text-fg-muted">
        {dimension ? (
          <>
            <span className="font-medium text-fg-secondary">{dimension.nombre}</span>
            {pos ? (
              <>
                · {pos.clase === "evidencia" ? "está en" : "creemos que está en"} <NivelChip nivel={pos.nivel} />
              </>
            ) : (
              "· sin dato todavía"
            )}
          </>
        ) : (
          <span className="font-medium text-fg-secondary">{definicionDe(p.para as ClaveDeCasilla).etiqueta}</span>
        )}
      </p>
      <p className="text-sm text-fg">«{p.pregunta}»</p>
      {p.repreguntas.length > 0 && (
        <details>
          <summary className="cursor-pointer select-none text-xs text-brand-light">
            {p.repreguntas.length} {p.repreguntas.length === 1 ? "repregunta" : "repreguntas"} para profundizar
          </summary>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-fg-secondary">
            {p.repreguntas.map((r, i) => (
              <li key={i}>«{r}»</li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}

export default function GuiaDeLaProxima() {
  const { exp, escala, mapa, puedeEditar } = useLienzo();
  const { corriendo, lanzando, lanzar } = useCorrida();
  const e = exp.estado;
  const guia = e.propuesta.guia;
  const hoy = hoyEnCostaRica();
  const proxima = proximaReunion(e.contenido.sesiones, exp.leido.agenda, hoy, e.propuesta.leidas.sesiones.length);

  const { huecos, enfoque } = focoDeLaGuia(e.contenido.casillas, escala, e.areas, mapa.posiciones, e.contenido.aExplorar);
  const preguntas = preguntasParaMostrar(guia, huecos, enfoque, escala);
  const deTarjetas = preguntas.filter((p) => p.tipo === "tarjeta");
  const deDimensiones = preguntas.filter((p) => p.tipo === "dimension");
  const objeciones = OBJECIONES_DE_BASE.map((base) => guia?.objeciones.find((o) => o.tipo === base.tipo) ?? base);

  const conTest = exp.leido.tests.length > 0;
  const conEvidencia = Object.values(e.contenido.chequeo).some((x) => !esFuenteDeHipotesis(x.fuente)) || e.propuesta.leidas.sesiones.length > 0;
  const desdeCero = !conTest && !conEvidencia && proxima.numero === 1;
  const vieja = guia && guiaVieja(guia, huecos, enfoque);
  const cuando = proxima.fecha ? (proxima.fecha.length > 10 ? diaYHora(proxima.fecha) : diaConAnio(proxima.fecha)) : null;

  return (
    <section className="space-y-5 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">La guía de la próxima reunión</h2>
          <p className="text-xs text-fg-muted">
            Sesión {proxima.numero}
            {proxima.titulo ? ` · ${proxima.titulo}` : ""}
            {cuando ? ` · ${cuando}` : ""}. No hace falta anotar: el agente lee la transcripción.
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-fg-muted">
            {guia ? (
              <>
                <Badge size="xs" variant={vieja ? "warning" : "info"}>
                  {vieja ? "Armada antes de lo último" : "Armada por el agente"}
                </Badge>
                {diaYHora(guia.en)}
              </>
            ) : (
              <Badge size="xs">De base: el agente todavía no la armó</Badge>
            )}
          </p>
        </div>
        {puedeEditar && (
          <Button size="sm" variant={!guia || vieja ? "primary" : "secondary"} loading={lanzando} disabled={corriendo} onClick={() => void lanzar("guia")}>
            {guia ? "Rearmar la guía" : "Armar la guía con el agente"}
          </Button>
        )}
      </div>

      {conTest && proxima.numero === 1 && <Alert variant="info">{REUNIONES[0].promesa}</Alert>}

      {(desdeCero || (guia && guia.apertura.length > 0)) && (
        <Bloque titulo="Para abrir" ayuda={desdeCero ? "No hizo el test: empieza conectando, y después explícale la escala en simple." : undefined}>
          <ul className="space-y-1.5">
            {(guia?.apertura.length ? guia.apertura : []).map((a, i) => (
              <li key={`a-${i}`} className="text-sm text-fg-secondary">
                {a}
              </li>
            ))}
            {desdeCero &&
              CONEXION_DE_BASE.map((q, i) => (
                <li key={`c-${i}`} className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-1.5 text-sm text-fg">
                  «{q}»
                </li>
              ))}
          </ul>
          {desdeCero && guia?.escalaEnSimple && (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-fg-secondary">
              <span className="font-medium text-fg">La escala, en simple: </span>
              {guia.escalaEnSimple}
            </p>
          )}
        </Bloque>
      )}

      {deTarjetas.length > 0 && (
        <Bloque titulo="Lo que falta del resumen" ayuda="Las tarjetas vacías de arriba: sin ellas no hay con qué proponer.">
          <ul className="space-y-2">
            {deTarjetas.map((p) => (
              <Pregunta key={`${p.para}-${p.pregunta}`} p={p} />
            ))}
          </ul>
        </Bloque>
      )}

      {deDimensiones.length > 0 ? (
        <Bloque titulo="Dónde está su operación" ayuda="Las dimensiones que más importan y todavía no tienen evidencia, empezando por las más bajas.">
          <ul className="space-y-2">
            {deDimensiones.map((p) => (
              <Pregunta key={`${p.para}-${p.pregunta}`} p={p} />
            ))}
          </ul>
        </Bloque>
      ) : (
        e.areas.length === 0 && <p className="text-xs text-fg-muted">Elige las áreas en juego, arriba, para que la guía sepa qué dimensiones preguntar.</p>
      )}

      {conTest && proxima.numero === 1 && (
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-fg-secondary">Su plan: qué va primero (es lo que se lleva de esta reunión)</summary>
          <div className="border-t border-line p-3">
            <QueVaPrimero />
          </div>
        </details>
      )}

      <Bloque titulo="Si aparece una objeción" ayuda="Con LAER: escuchar, reconocer, explorar y responder.">
        <ul className="space-y-1.5">
          {objeciones.map((o) => (
            <li key={o.tipo}>
              <details className="rounded-lg border border-line">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm text-fg">{OBJECION[o.tipo]}</summary>
                <dl className="space-y-1.5 border-t border-line px-3 py-2 text-sm">
                  {PASOS_LAER.map((paso) => (
                    <div key={paso.clave} className="grid gap-1 sm:grid-cols-[6rem_1fr]">
                      <dt className="text-xs font-medium text-fg-muted">{paso.nombre}</dt>
                      <dd className="text-fg-secondary">{o[paso.clave]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      </Bloque>

      <Alert variant="warning" title="Si no te deja explorar">
        {guia?.pocaApertura ?? POCA_APERTURA_DE_BASE}
      </Alert>

      <Bloque titulo="Para cerrar">
        <p className="text-sm text-fg-secondary">{guia?.cierre ?? CIERRE_DE_BASE}</p>
      </Bloque>
    </section>
  );
}

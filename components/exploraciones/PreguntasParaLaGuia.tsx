"use client";

/**
 * PreguntasParaLaGuia — lo que Nexus necesita saber para armar (o afinar) la guía de la sesión, en la Preparación.
 *
 * Décima vuelta (2026-11-08, Elías: «son botones que no parecen botones; que sea como las preguntas de Claude Code»): un
 * título que pide responder, una pregunta por fila y, en cada una, cuatro respuestas probables como tarjetas elegibles
 * (etiqueta y una línea de descripción, con su círculo de selección) más «Otra respuesta…» para escribir la tuya. La
 * elegida se nota (borde y fondo azules, el círculo lleno con su marca). El botón «Responder y armar la guía» se activa
 * al responder todas: elegir la última ya no manda sola (antes sí, quinta vuelta), así se puede revisar antes.
 *
 * Lo demás sigue como en la sexta vuelta: las preguntas son de ESTA sesión (`usePreguntasParaLaGuia`), lo elegido espera en
 * pantalla mientras Nexus trabaja en otra cosa, y el texto dice lo que de verdad corre.
 */
import { useState } from "react";
import { BotonAzul, IconoDeSugerencia } from "@/components/ui/sistema";
import { IconCheck, Input, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  completaLasPreguntas,
  MAX_RESPUESTA_PARA_LA_GUIA,
  respuestasParaMandar,
  vieneDeLasRespuestas,
  type PreguntaConOpciones,
} from "@/lib/exploraciones/objetivo-y-hallazgos";
import { useLienzo } from "./contexto";
import { useCorrida } from "./useCorrida";

/** Lo que hace Nexus mientras corre algo que NO lanzaron las respuestas (sexta vuelta): se dice tal cual. */
const QUE_HACE_NEXUS: Record<string, string> = {
  guia: "Nexus está armando la guía…",
  leer: "Nexus está leyendo las reuniones…",
  preparar: "Nexus está preparando la primera reunión…",
  casos: "Nexus está proponiendo los casos de uso…",
  posicionar: "Nexus está ubicando a la empresa en la escala…",
};

/** El círculo de selección de una tarjeta: vacío, o lleno con su marca cuando es la elegida. */
function Circulo({ elegida }: { elegida: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-[1px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-2 transition-colors",
        elegida ? "border-brand bg-primary text-primary-fg" : "border-line bg-surface",
      )}
    >
      {elegida && <IconCheck className="h-2.5 w-2.5" />}
    </span>
  );
}

const TARJETA = "flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const ELEGIDA = "border-brand bg-info-surface ring-2 ring-brand/30";
const SIN_ELEGIR = "border-line bg-surface hover:border-brand hover:bg-surface-hover";

/** Una pregunta: su texto y sus tarjetas, en una fila (dos columnas de tarjetas desde `sm`). */
function Pregunta({
  numero,
  total,
  p,
  elegida,
  libre,
  abierta,
  bloqueado,
  alElegir,
  alEscribir,
  alAbrir,
}: {
  numero: number;
  total: number;
  p: PreguntaConOpciones;
  elegida: string | undefined;
  libre: string;
  abierta: boolean;
  bloqueado: boolean;
  alElegir: (opcion: string) => void;
  alEscribir: (texto: string) => void;
  alAbrir: () => void;
}) {
  // Lo escrito cuenta como la respuesta mientras no haya una tarjeta elegida.
  const esLibre = !elegida && !!libre.trim();
  const conLibre = abierta || !p.opciones.length;
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2.5 w-full">
        {total > 1 && (
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Pregunta {numero} de {total}
          </span>
        )}
        <span className="mt-0.5 block text-[14.5px] font-semibold leading-[1.4] text-fg">{p.pregunta}</span>
      </legend>
      <div role="radiogroup" aria-label={p.pregunta} className="grid gap-2 sm:grid-cols-2">
        {p.opciones.map((o, k) => {
          const esta = elegida === o;
          const descripcion = p.descripciones?.[k]?.trim();
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={esta}
              disabled={bloqueado}
              onClick={() => alElegir(o)}
              className={cn(TARJETA, esta ? ELEGIDA : SIN_ELEGIR)}
            >
              <Circulo elegida={esta} />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[13.5px] leading-[1.35]", esta ? "font-semibold text-fg" : "font-medium text-fg")}>{o}</span>
                {descripcion && <span className="mt-0.5 block text-xs leading-[1.4] text-fg-muted">{descripcion}</span>}
              </span>
            </button>
          );
        })}
        {/* La respuesta abierta ocupa la fila entera: se escribe con espacio. */}
        {conLibre ? (
          <div className={cn("flex items-start gap-3 rounded-lg border px-3.5 py-2.5 sm:col-span-2", esLibre ? ELEGIDA : "border-dashed border-line bg-surface")}>
            <span className="pt-2">
              <Circulo elegida={esLibre} />
            </span>
            <Input
              autoFocus={p.opciones.length > 0}
              value={libre}
              onChange={(e) => alEscribir(e.target.value)}
              maxLength={MAX_RESPUESTA_PARA_LA_GUIA}
              disabled={bloqueado}
              placeholder="Escribe tu respuesta, en una línea"
              aria-label={`Tu respuesta a: ${p.pregunta}`}
            />
          </div>
        ) : (
          <button type="button" disabled={bloqueado} onClick={alAbrir} className={cn(TARJETA, "border-dashed border-line bg-surface hover:border-brand hover:bg-surface-hover sm:col-span-2")}>
            <Circulo elegida={false} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium leading-[1.35] text-fg-secondary">Otra respuesta…</span>
              <span className="mt-0.5 block text-xs leading-[1.4] text-fg-muted">Ninguna calza: escribe la tuya.</span>
            </span>
          </button>
        )}
      </div>
    </fieldset>
  );
}

/**
 * Las preguntas de Nexus con su encabezado. `conGuia`: ya hay guía (se afina) o todavía no (se arma). `conObjetivo`: sin el
 * objetivo de la sesión, las respuestas solo se guardan y se usan al armarla.
 */
export function PreguntasParaLaGuia({ conObjetivo, conGuia, lista }: { conObjetivo: boolean; conGuia: boolean; lista: PreguntaConOpciones[] }) {
  const { exp, puedeEditar, guardando, cambiar } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const preguntas = lista.map((x) => x.pregunta);
  // Por el TEXTO de la pregunta: si llegan otras con la pantalla abierta, lo elegido no queda debajo de otra pregunta.
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [libres, setLibres] = useState<Record<string, string>>({});
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  // Mientras sale el pedido de la guía que lanzaron las respuestas (después, lo dice la corrida: `vieneDeLasRespuestas`).
  const [lanzandoLaMia, setLanzandoLaMia] = useState(false);
  if (!lista.length) return null;
  const trabajando = corriendo || lanzando;
  // Lo que apaga las tarjetas: guardar. Una corrida no: lo elegido espera en pantalla.
  const bloqueado = !puedeEditar || guardando || enviando;
  // Con objetivo, mandar rehace la guía, y no se lanza una corrida encima de otra: se manda cuando termine.
  const esperaLaCorrida = conObjetivo && trabajando;
  // Lo escrito en «Otra respuesta…» cuenta solo sin una tarjeta elegida en esa pregunta (`respuestasParaMandar` lo resuelve).
  const respuestas = Object.fromEntries(
    preguntas.flatMap((p) => {
      const r = elegidas[p] ?? libres[p]?.trim();
      return r ? [[p, r]] : [];
    }),
  );
  const respondidas = Object.keys(respuestas).length;
  const completas = completaLasPreguntas(preguntas, respuestas);

  const enviar = async () => {
    const listas = respuestasParaMandar(preguntas, elegidas, libres);
    // Ni dos veces, ni con una corrida en curso que haya que rehacer, ni con alguna sin responder.
    if (!completas || !listas.length || bloqueado || esperaLaCorrida) return;
    setEnviando(true);
    try {
      const ok = await cambiar([{ op: "responderParaLaGuia", respuestas: listas }], conObjetivo ? undefined : { exito: "Respuestas guardadas: Nexus las usa al armar la guía." });
      if (ok) {
        setElegidas({});
        setLibres({});
        setAbiertas({});
        // Sin objetivo aceptado la guía no se arma: las respuestas esperan a que se arme.
        if (conObjetivo) {
          setLanzandoLaMia(true);
          setEnviando(false);
          await lanzar("guia").finally(() => setLanzandoLaMia(false));
        }
      }
    } finally {
      setEnviando(false);
    }
  };
  const elegir = (pregunta: string, opcion: string) => {
    if (bloqueado) return;
    setElegidas((r) => ({ ...r, [pregunta]: opcion }));
  };
  const escribir = (pregunta: string, texto: string) => {
    setLibres((r) => ({ ...r, [pregunta]: texto }));
    // Escribir la tuya deja de lado la tarjeta elegida de esa pregunta.
    setElegidas((r) => {
      if (!r[pregunta]) return r;
      const { [pregunta]: _antes, ...resto } = r;
      void _antes;
      return resto;
    });
  };
  const lasMias =
    lanzandoLaMia || (corriendo && corrida?.modo === "guia" && vieneDeLasRespuestas(corrida.empezo, exp.estado.contenido.respuestasParaLaGuia ?? []));
  const queCorre = enviando
    ? "Guardando tus respuestas…"
    : !trabajando
      ? null
      : lasMias
        ? "Rehaciendo la guía con tus respuestas…"
        : `${!corriendo ? "Nexus está empezando…" : (QUE_HACE_NEXUS[corrida?.modo ?? ""] ?? "Nexus está trabajando en la preventa…")}${
            esperaLaCorrida ? " Puedes elegir tus respuestas: las mandas cuando termine." : ""
          }`;
  const titulo = conGuia ? "Responde esto para afinar la guía" : "Responde esto para armar la guía";

  return (
    <section data-recorrido="preventa.sesion.lo-que-necesita" aria-label={titulo} className="space-y-4 rounded-xl border border-info-line bg-info-surface px-[18px] py-4">
      <div>
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">
          <IconoDeSugerencia className="h-4 w-4 text-brand" />
          {titulo}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-[1.45] text-fg-muted">
          Nexus necesita saber {preguntas.length === 1 ? "esto" : "estas cosas"}. Elige una opción en {preguntas.length === 1 ? "la pregunta" : "cada pregunta"} o escribe la tuya.{" "}
          {!conObjetivo
            ? "Se guardan y Nexus las usa al armar la guía, cuando elijas el objetivo."
            : conGuia
              ? "Con todo respondido, la guía se rehace con tus respuestas."
              : "Con todo respondido, la guía se arma con tus respuestas."}
        </p>
      </div>
      <div className="space-y-5">
        {lista.map((p, i) => (
          <Pregunta
            key={p.pregunta}
            numero={i + 1}
            total={lista.length}
            p={p}
            elegida={elegidas[p.pregunta]}
            libre={libres[p.pregunta] ?? ""}
            abierta={!!abiertas[p.pregunta]}
            bloqueado={bloqueado}
            alElegir={(o) => elegir(p.pregunta, o)}
            alEscribir={(t) => escribir(p.pregunta, t)}
            alAbrir={() => setAbiertas((r) => ({ ...r, [p.pregunta]: true }))}
          />
        ))}
      </div>
      {puedeEditar && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-info-line pt-3">
          {/* Lo que de verdad corre (sexta vuelta): «con tus respuestas» solo si lo lanzaron ellas. */}
          {queCorre ? (
            <span role="status" className="mr-auto flex items-center gap-2 text-[13px] text-fg-secondary">
              <Spinner size="sm" color="border-brand" />
              {queCorre}
            </span>
          ) : (
            <span className="mr-auto text-[12.5px] text-fg-muted">
              {completas ? "Todo respondido." : `${respondidas} de ${preguntas.length} respondidas`}
            </span>
          )}
          {!enviando && !lasMias && (
            <BotonAzul
              className="px-4 py-2 text-[13px]"
              disabled={bloqueado || esperaLaCorrida || !completas}
              title={!completas ? "Responde todas las preguntas para seguir" : undefined}
              onClick={() => void enviar()}
            >
              {!conObjetivo ? "Guardar respuestas" : "Responder y armar la guía"}
            </BotonAzul>
          )}
        </div>
      )}
    </section>
  );
}

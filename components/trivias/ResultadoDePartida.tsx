/**
 * components/trivias/ResultadoDePartida.tsx — el resultado de una partida terminada (historial del anfitrión).
 *
 * Sin hooks ni "use client": lo renderiza la página (Server Component) con lo que arma
 * lib/trivias/queries.ts › resultadoDePartida. Por eso las tablas son `<table>` con la forma de `Table` y no `Table`
 * misma: `Table` es de cliente y sus columnas llevan funciones, que no cruzan del servidor al cliente.
 *
 * De arriba abajo: el resumen y el podio · las posiciones de todos · cómo se respondió cada pregunta · lo que eligió
 * cada persona en cada pregunta (con scroll de costado en pantallas chicas y el nombre fijo a la izquierda).
 */
import Link from "next/link";
import { EmptyState, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";
import { COLORES_DEL_PODIO, colorDeOpcion } from "@/lib/trivias/colores";
import type { ResultadoDePartida as Resultado } from "@/lib/trivias/queries";
import { ETIQUETA_DEL_MODO, ETIQUETA_DEL_TIPO, EXPLICACION_DEL_MODO, type PreguntaDeTrivia } from "@/lib/trivias/tipos";
import { formatearCodigo, formatearPuntos } from "@/lib/trivias/formato";
import { tieneMedalla } from "@/lib/trivias/reglas";
import { Podio } from "./Podio";
import { TableroDeOpciones } from "./TableroDeOpciones";

const FECHA = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
});

type Respuesta = Resultado["respuestasPorJugador"][string][number];

export function ResultadoDePartida({ resultado: r }: { resultado: Resultado }) {
  const jugadores = r.posiciones.length;
  // Las encuestas no tienen correcta: los aciertos se cuentan sobre las demás.
  const puntuables = r.preguntas.filter((q) => q.tipo !== "ENCUESTA").length;

  return (
    <div className="space-y-6">
      <section aria-label="Resumen de la partida" className="space-y-6 rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <Dato etiqueta="Fecha">{FECHA.format(new Date(r.createdAt))}</Dato>
            <Dato etiqueta="Modo de puntos" ayuda={EXPLICACION_DEL_MODO[r.modo]}>
              {ETIQUETA_DEL_MODO[r.modo]}
            </Dato>
            <Dato etiqueta="Código">
              <span className="font-mono tracking-wider">{formatearCodigo(r.codigo)}</span>
            </Dato>
            <Dato etiqueta="Jugadores">{jugadores}</Dato>
            <Dato etiqueta="Preguntas jugadas">{r.preguntas.length}</Dato>
          </dl>
          {r.triviaId && (
            <Link href={`/trivia/${r.triviaId}`} className={buttonVariants({ variant: "secondary" })}>
              Volver a jugar
            </Link>
          )}
        </div>
        {jugadores > 0 && <Podio posiciones={r.posiciones} className="pt-2" />}
      </section>

      {jugadores === 0 ? (
        <EmptyState
          variant="dashed"
          title="Nadie entró a esta partida."
          description={
            r.triviaId ? "Para jugarla con el equipo, vuelve a lanzar la trivia y comparte el código o el QR." : undefined
          }
        />
      ) : (
        <>
          <Posiciones resultado={r} puntuables={puntuables} />
          <PreguntaPorPregunta resultado={r} jugadores={jugadores} />
          <LoQueRespondioCadaUno resultado={r} />
        </>
      )}
    </div>
  );
}

function Dato({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-fg-muted">{etiqueta}</dt>
      <dd className="text-sm font-medium text-fg" title={ayuda}>
        {children}
      </dd>
    </div>
  );
}

/** El encabezado de columna con la forma de `Table`. */
function Encabezado({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-fg-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}

function MarcoDeTabla({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Lugar({ lugar, puntos }: { lugar: number; puntos: number }) {
  const podio = tieneMedalla(lugar, puntos) ? COLORES_DEL_PODIO[lugar - 1] : null;
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums",
        !podio && "text-fg-secondary",
      )}
      style={podio ? { background: podio.fondo, color: podio.texto } : undefined}
    >
      {lugar}.º
    </span>
  );
}

function Posiciones({ resultado: r, puntuables }: { resultado: Resultado; puntuables: number }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-fg">Posiciones</h2>
      <MarcoDeTabla>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-hover">
              <Encabezado className="w-20">Lugar</Encabezado>
              <Encabezado>Nombre</Encabezado>
              <Encabezado className="text-right">Puntos</Encabezado>
              <Encabezado className="text-right">Aciertos</Encabezado>
            </tr>
          </thead>
          <tbody>
            {r.posiciones.map((p) => (
              <tr key={p.jugadorId} className="border-b border-line last:border-0">
                <td className="px-4 py-3 align-middle">
                  <Lugar lugar={p.lugar} puntos={p.puntos} />
                </td>
                <td className="px-4 py-3 align-middle font-medium text-fg">{p.nombre}</td>
                <td className="px-4 py-3 text-right align-middle tabular-nums text-fg">{formatearPuntos(p.puntos)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right align-middle tabular-nums text-fg-secondary">
                  {puntuables > 0 ? `${p.aciertos} de ${puntuables}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MarcoDeTabla>
    </section>
  );
}

function PreguntaPorPregunta({ resultado: r, jugadores }: { resultado: Resultado; jugadores: number }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-fg">Pregunta por pregunta</h2>
      {r.preguntas.length === 0 ? (
        <p className="text-sm text-fg-muted">La partida terminó antes de la primera pregunta.</p>
      ) : (
        <ol className="grid gap-4 lg:grid-cols-2">
          {r.preguntas.map((q, i) => {
            const encuesta = q.tipo === "ENCUESTA";
            return (
              <li key={i} className="space-y-4 rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-medium text-fg">
                    <span className="mr-1 tabular-nums text-fg-muted">{i + 1}.</span>
                    {q.texto}
                  </p>
                  <span className="shrink-0 rounded-full border border-line bg-surface-muted px-2.5 py-0.5 text-xs text-fg-secondary">
                    {ETIQUETA_DEL_TIPO[q.tipo]}
                  </span>
                </div>
                <TableroDeOpciones
                  variante="compacto"
                  opciones={q.opciones}
                  correctas={q.correctas}
                  distribucion={q.distribucion}
                />
                <p className="text-xs text-fg-muted">
                  {q.respondieron} de {jugadores} {q.respondieron === 1 ? "respondió" : "respondieron"}
                  {!encuesta && ` · ${q.aciertos} ${q.aciertos === 1 ? "acertó" : "acertaron"}`}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function LoQueRespondioCadaUno({ resultado: r }: { resultado: Resultado }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-fg">Lo que respondió cada uno</h2>
        <p className="text-xs text-fg-muted">
          La letra es la opción que eligió. Pasa el cursor sobre «P1», «P2»… para ver la pregunta, o sobre una respuesta
          para ver cuánto tardó.
        </p>
      </div>
      {r.preguntas.length === 0 ? (
        <p className="text-sm text-fg-muted">La partida terminó antes de la primera pregunta.</p>
      ) : (
        <MarcoDeTabla>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-hover">
                <Encabezado className="sticky left-0 z-10 bg-surface-hover">Persona</Encabezado>
                {r.preguntas.map((q, i) => (
                  <th
                    key={i}
                    scope="col"
                    title={q.texto}
                    className="whitespace-nowrap px-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-fg-muted"
                  >
                    P{i + 1}
                    <span className="sr-only">: {q.texto}</span>
                  </th>
                ))}
                <Encabezado className="text-right">Total</Encabezado>
              </tr>
            </thead>
            <tbody>
              {r.posiciones.map((p) => {
                const fila = r.respuestasPorJugador[p.jugadorId] ?? [];
                return (
                  <tr key={p.jugadorId} className="border-b border-line last:border-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-48 truncate bg-surface px-4 py-2.5 text-left font-medium text-fg"
                      title={p.nombre}
                    >
                      {p.nombre}
                    </th>
                    {r.preguntas.map((q, i) => (
                      <td key={i} className="whitespace-nowrap px-3 py-2.5 align-middle">
                        <CeldaDeRespuesta respuesta={fila[i] ?? null} pregunta={q} />
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-2.5 text-right align-middle font-medium tabular-nums text-fg">
                      {formatearPuntos(p.puntos)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </MarcoDeTabla>
      )}
    </section>
  );
}

function CeldaDeRespuesta({ respuesta, pregunta }: { respuesta: Respuesta; pregunta: PreguntaDeTrivia }) {
  if (!respuesta) {
    return (
      <span className="text-fg-muted" title="No respondió">
        <span aria-hidden="true">—</span>
        <span className="sr-only">No respondió</span>
      </span>
    );
  }
  const color = colorDeOpcion(respuesta.opcion);
  const opcion = pregunta.opciones[respuesta.opcion] ?? "";
  const segundos = (respuesta.tardoMs / 1000).toLocaleString("es-CR", { maximumFractionDigits: 1 });
  const veredicto = respuesta.esCorrecta === null ? "" : respuesta.esCorrecta ? ", correcta" : ", incorrecta";
  const conPuntos = respuesta.esCorrecta !== null;
  return (
    <span className="inline-flex items-center gap-1.5" title={`${color.letra}: ${opcion} · tardó ${segundos} s`}>
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold"
        style={{ background: color.fondo, color: color.texto }}
        aria-hidden="true"
      >
        {color.letra}
      </span>
      {respuesta.esCorrecta === true && <IconoBien />}
      {respuesta.esCorrecta === false && <IconoMal />}
      {conPuntos && (
        <span className="text-xs tabular-nums text-fg-muted" aria-hidden="true">
          {formatearPuntos(respuesta.puntos)}
        </span>
      )}
      <span className="sr-only">
        Eligió {color.letra}
        {veredicto}
        {conPuntos ? `, ${respuesta.puntos} puntos` : ""}
      </span>
    </span>
  );
}

function IconoBien() {
  return (
    <svg className="h-4 w-4 shrink-0 text-success-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconoMal() {
  return (
    <svg className="h-4 w-4 shrink-0 text-danger-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

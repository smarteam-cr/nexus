"use client";

/**
 * ComoTrabajasteEstaSesion — la autoevaluación de cada sesión de la preventa (S4, 2026-10-27; docs/analizador-reuniones-
 * venta-plan.md › «El rediseño de Elías (2026-10-26)»). Vive en Exploración › la sesión › Análisis, en un apartado APARTE
 * de lo que ya estaba ahí (siguiente paso acordado, cuánto avanzó, quedó abierto), que no se toca.
 *
 * Es FEEDBACK de cómo se trabajó esta sesión, no la planificación de la que sigue (Elías, 27 oct): arriba y en grande la
 * lectura general, después aterrizar y expandir (el dolor del área y la base para un caso de uso), quién habló, lo que
 * salió bien junto a «Para mejorar», lo que falta explorar y el proceso consultivo. Una persona lo confirma y lo
 * confirmado cuenta en la tendencia de cada vendedor (S7). Se fueron los comentarios del vendedor, el siguiente paso y las
 * casillas de «para la próxima».
 *
 * 29 oct (Elías, con Camosa): lo que salió bien, aparte y con su cita; lo que falta explorar, en lista y solo del área a
 * la que fueron las preguntas (el resto, en una línea); el proceso consultivo, también en lista. Nada de tarjetas.
 *
 * Lo ve quien entra a la preventa (`veAnalisisDeVenta` del lienzo, abierto el 2026-10-28). Solo tokens del tema.
 */
import { useMemo, useState } from "react";
import { Alert, Button, Field, Textarea, useToast } from "@/components/ui";
import { BotonTexto } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { equipoDeLaDimension, loDeLaSesion, loQueFaltaExplorar, MAX_LETRAS_DE_LA_NOTA, type LoDeLaSesion, type LoQueFaltaExplorar } from "@/lib/analizador-venta/revision";
import { TEXTO_DEL_HUECO, TEXTO_DEL_VALOR, type Cita, type CifraDicha, type Juicio, type Observacion } from "@/lib/analizador-venta/analisis";
import type { ReunionDeVentaVista } from "@/lib/analizador-venta/reuniones-de-venta-server";
import type { PestanaDeSesion } from "@/lib/exploraciones/guia";
import { useLienzo } from "@/components/exploraciones/contexto";
import { AnalisisCompleto, BarraDeQuienHablo, ChipDelValor, Citas, fechaDelAnalisis } from "./piezas";
import { useAnalisisDeLaVenta } from "./useAnalisisDeLaVenta";

function Encabezado() {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-[18px] py-3.5">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-fg">Cómo trabajaste esta sesión</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">Feedback, no evaluación: lo propone Nexus con citas de la reunión y una persona lo confirma.</p>
      </div>
    </header>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="px-[18px] py-4 text-[13px] text-fg-muted">{children}</p>;
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{children}</h4>;
}

export default function ComoTrabajasteEstaSesion({ pestana }: { pestana: PestanaDeSesion }) {
  const { exp, puedeEditar, veAnalisisDeVenta } = useLienzo();
  const analisis = useAnalisisDeLaVenta(exp.id, !!veAnalisisDeVenta);
  if (!veAnalisisDeVenta) return null;
  const r = pestana.reunion;
  const vista = r?.origen === "meet" ? (analisis.datos?.reuniones.find((x) => x.id === r.id) ?? null) : null;

  let cuerpo: React.ReactNode;
  if (!analisis.datos && !analisis.error) cuerpo = <Aviso>Leyendo el análisis…</Aviso>;
  else if (!analisis.datos && analisis.error)
    cuerpo = (
      <div className="px-[18px] py-4">
        <Alert variant="danger">{analisis.error}</Alert>
      </div>
    );
  else if (!r || r.origen !== "meet") cuerpo = <Aviso>Esta sesión no tiene una reunión de Meet: no hay una transcripción que analizar.</Aviso>;
  else if (!vista)
    cuerpo = <Aviso>Esta reunión no cuenta como de venta (fue solo con gente de Smarteam, o de entrega con un cliente sin nadie de Ventas): no se analiza.</Aviso>;
  else cuerpo = <ElAnalisis vista={vista} pestana={pestana} puedeEditar={puedeEditar} />;

  return (
    <section aria-label="Cómo trabajaste esta sesión" data-recorrido="preventa.sesion.como-trabajaste" className="overflow-hidden rounded-xl border border-line bg-surface">
      <Encabezado />
      {cuerpo}
    </section>
  );
}

function ElAnalisis({ vista, pestana, puedeEditar }: { vista: ReunionDeVentaVista; pestana: PestanaDeSesion; puedeEditar: boolean }) {
  const { exp, escala } = useLienzo();
  const { datos, analizar, revisar } = useAnalisisDeLaVenta(exp.id, true);
  const toast = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const d = vista.detalle ?? null;
  const res = d?.resultado ?? null;
  const lo = useMemo(() => (res ? loDeLaSesion(res) : null), [res]);
  const equipo = pestana.sesion?.equipo ?? null;
  const falta = useMemo(() => (lo ? loQueFaltaExplorar(lo, (dim) => equipoDeLaDimension(dim, { equipo, areas: escala.areas })) : null), [lo, equipo, escala.areas]);
  const delCliente = vista.quienHablo?.personas.filter((p) => p.lado === "cliente").map((p) => p.nombre) ?? [];
  const nombre = (correo: string) => datos?.nombres[correo] ?? correo;

  /** Corre una acción con su botón ocupado; devuelve si salió bien. */
  const hacer = async (clave: string, f: () => Promise<unknown>, exito?: string): Promise<boolean> => {
    setOcupado(clave);
    setError(null);
    try {
      await f();
      if (exito) toast.success(exito);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const botonAnalizar = puedeEditar && vista.texto === "transcripcion" && (
    <Button
      variant={d ? "secondary" : "primary"}
      size="sm"
      loading={ocupado === "analizar"}
      disabled={!!ocupado}
      onClick={() =>
        void hacer("analizar", async () => {
          const x = await analizar(vista.id);
          toast.success(`Listo: ${x.juicios} juicios con su cita${x.descartados ? ` (${x.descartados} sin cita, descartados)` : ""}.`);
        })
      }
    >
      {d ? "Volver a analizar" : "Analizar esta sesión"}
    </Button>
  );

  if (vista.texto !== "transcripcion") {
    return (
      <div className="space-y-2 px-[18px] py-4">
        <p className="text-[13px] text-fg-secondary">Sin transcripción no se puede analizar: las notas no dicen quién dijo qué.</p>
        {vista.motivo && <p className="text-xs text-fg-muted">{vista.motivo}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6 px-[18px] py-4">
      {error && <Alert variant="danger">{error}</Alert>}

      {!d && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-[13px] text-fg-secondary">Todavía no se analizó. Nexus lee la transcripción contra el criterio consultivo y cita cada juicio.</p>
          {botonAnalizar}
        </div>
      )}
      {d?.estado === "ERROR" && !res && (
        <div className="flex flex-wrap items-center gap-3">
          <Alert variant="danger" className="min-w-0 flex-1">
            El último análisis falló: {d.error ?? "sin detalle"}.
          </Alert>
          {botonAnalizar}
        </div>
      )}

      {d && res && lo ? (
        <>
          {/* Lo principal: la lectura general, arriba y en grande (Elías, 27 oct). */}
          <div className="rounded-xl border border-line border-l-4 border-l-brand bg-surface-muted px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <ChipDelValor j={lo.consultiva} />
              <ChipDelValor j={lo.posicion} />
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", d.confirmado ? "bg-success-surface text-success-ink" : "bg-info-surface text-brand")}>
                {d.confirmado ? `Confirmado por ${nombre(d.confirmado.por)}` : "Propuesta de Nexus: falta confirmarla"}
              </span>
            </div>
            <p className="mt-3 text-[17px] leading-[27px] text-fg">{lo.resumen}</p>
            <p className="mt-2.5 text-xs text-fg-muted">
              Analizada el {fechaDelAnalisis(d.analizadoAt)}
              {d.descartados ? ` · ${d.descartados} ${d.descartados === 1 ? "cosa se descartó" : "cosas se descartaron"}: sin una cita que esté en la transcripción, o fuera de lo que se esperaba explorar` : ""}.
            </p>
          </div>

          <AterrizarYExpandir lo={lo} />

          {vista.quienHablo && (
            <div className="space-y-1.5">
              <Subtitulo>Quién habló</Subtitulo>
              <BarraDeQuienHablo q={vista.quienHablo} />
            </div>
          )}

          <BienYParaMejorar bien={lo.bien} mejorar={lo.recomendaciones} />
          {falta && <LoQueFalta lo={lo} falta={falta} delCliente={delCliente} />}
          {/* «El resultado que busca» a la vista siempre, con su lectura y su cita (8 nov, Elías: estaba solo como etiqueta y
              su porqué había bajado a «Ver el análisis completo»). Los números, debajo, si los hay. */}
          <ElResultado lo={lo} />
          {lo.numeros.length > 0 && <LosNumeros lo={lo} />}
          <ElProcesoConsultivo lo={lo} juzgado={res.juicios.some((j) => j.punto === "etapa")} />

          <Confirmacion
            key={d.analizadoAt}
            vista={vista}
            puedeEditar={puedeEditar}
            ocupado={ocupado}
            nombre={nombre}
            confirmar={(nota) =>
              void hacer("confirmar", () => revisar({ accion: "confirmar", sessionId: vista.id, analizadoAt: d.analizadoAt, nota }), "Confirmado: ya cuenta en la tendencia del vendedor.")
            }
            desconfirmar={() => void hacer("desconfirmar", () => revisar({ accion: "desconfirmar", sessionId: vista.id }))}
          />

          <details className="rounded-lg border border-line">
            <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[13px] font-semibold text-fg">Ver el análisis completo, punto por punto</summary>
            <div className="border-t border-line p-3.5">
              <AnalisisCompleto r={res} />
            </div>
          </details>

          {botonAnalizar && <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">{botonAnalizar}</div>}
        </>
      ) : (
        vista.quienHablo && (
          <div className="space-y-1.5">
            <Subtitulo>Quién habló</Subtitulo>
            <BarraDeQuienHablo q={vista.quienHablo} />
          </div>
        )
      )}
    </div>
  );
}

type Tono = "aviso" | "info" | "neutro";

const TONO: Record<Tono, string> = {
  aviso: "bg-warn-surface text-warn-ink",
  info: "bg-info-surface text-brand",
  neutro: "bg-surface-muted text-fg-secondary",
};

/** Una fila de lista: a la izquierda qué y su etiqueta; a la derecha la lectura y la cita. Se lee de corrido. */
function Fila({ titulo, rotulo, etiqueta, tono, lectura, cita }: { titulo: string; rotulo?: string | null; etiqueta?: string; tono: Tono; lectura: string; cita: Cita | null }) {
  return (
    <li className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-1">
        <p className="text-[13px] font-semibold leading-[18px] text-fg">
          {titulo}
          {rotulo && <span className="font-normal text-fg-muted"> · {rotulo}</span>}
        </p>
        {etiqueta && <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", TONO[tono])}>{etiqueta}</span>}
      </div>
      <div className="min-w-0">
        <p className="text-[12.5px] leading-[18px] text-fg-secondary">{lectura}</p>
        {cita && <Citas citas={[cita]} />}
      </div>
    </li>
  );
}

/** El dolor del área y la base para un caso de uso: la estrategia de aterrizar y expandir. */
function AterrizarYExpandir({ lo }: { lo: LoDeLaSesion }) {
  const filas = [
    { titulo: "El dolor del área", j: lo.dolor },
    { titulo: "Base para un caso de uso", j: lo.casoDeUso },
  ].filter((f): f is { titulo: string; j: Juicio } => !!f.j);
  const fuera = lo.fueraDelObjetivo;
  if (!filas.length && !fuera.length) return null;
  const tono = (j: Juicio): Tono => (j.valor === "a_fondo" || j.valor === "hay_base" ? "info" : j.valor === "en_parte" || j.valor === "falta" ? "neutro" : "aviso");
  return (
    <div className="space-y-1">
      <Subtitulo>Para aterrizar y expandir</Subtitulo>
      <ul className="divide-y divide-line">
        {filas.map(({ titulo, j }) => (
          <Fila
            key={titulo}
            titulo={titulo}
            rotulo={j.caso ?? null}
            etiqueta={TEXTO_DEL_VALOR[j.valor ?? ""] ?? j.valor ?? ""}
            tono={tono(j)}
            lectura={j.lectura}
            cita={j.citas[0] ?? null}
          />
        ))}
        {/* 2026-11-08: lo importante que salió fuera del guion no se descarta (Centauro: los cortes por falta de pago). */}
        {fuera.map((f, i) => (
          <Fila key={`fuera-${i}`} titulo="Apareció fuera del objetivo" tono="aviso" lectura={f.texto} cita={f.citas[0] ?? null} />
        ))}
      </ul>
    </div>
  );
}

function Observaciones({ titulo, items, punto }: { titulo: string; items: readonly Observacion[]; punto: string }) {
  return (
    <div className="min-w-0 space-y-2.5">
      <Subtitulo>{titulo}</Subtitulo>
      <ul className="space-y-2.5">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2.5">
            <span aria-hidden className={cn("mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full", punto)} />
            <div className="min-w-0">
              <p className="text-[13px] leading-[19px] text-fg">{x.texto}</p>
              {x.decir && <p className="mt-1 text-[12.5px] leading-[18px] text-fg-secondary">La próxima vez: «{x.decir}»</p>}
              <Citas citas={x.citas.slice(0, 1)} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lo que salió bien al lado de «Para mejorar»: los dos con su cita (los análisis de antes del 29 oct no traen lo bien). */
function BienYParaMejorar({ bien, mejorar }: { bien: readonly Observacion[]; mejorar: readonly Observacion[] }) {
  if (!bien.length && !mejorar.length) return null;
  return (
    <div className={cn("grid gap-6", bien.length && mejorar.length && "lg:grid-cols-2")}>
      {bien.length > 0 && <Observaciones titulo="Lo que salió bien" items={bien} punto="bg-success" />}
      {mejorar.length > 0 && <Observaciones titulo="Para mejorar" items={mejorar} punto="bg-brand" />}
    </div>
  );
}

const enLista = (xs: readonly string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}` : (xs[0] ?? ""));

/**
 * Lo que falta explorar, del área a la que fueron las preguntas (Elías, 29 oct): con quién se habló y hacia dónde, la
 * lista de lo que se tocó sin profundizar o no se tocó, y del resto de las áreas solo su nombre, en una línea.
 */
function LoQueFalta({ lo, falta, delCliente }: { lo: LoDeLaSesion; falta: LoQueFaltaExplorar; delCliente: readonly string[] }) {
  const varias = falta.foco.length > 1;
  const contexto =
    lo.enfoque?.lectura ||
    [falta.foco.length ? `Las preguntas fueron a ${enLista(falta.foco)}.` : null, delCliente.length ? `Del cliente hablaron ${enLista(delCliente.slice(0, 4))}.` : null].filter(Boolean).join(" ");
  return (
    <div className="space-y-1.5">
      <Subtitulo>Lo que falta explorar</Subtitulo>
      {contexto && <p className="text-[12.5px] leading-[18px] text-fg-muted">{contexto}</p>}
      {falta.items.length ? (
        <ul className="divide-y divide-line">
          {falta.items.map((f, i) => (
            <Fila
              key={`${f.estado}-${i}-${f.dimension}`}
              titulo={f.dimension}
              rotulo={varias ? f.area : null}
              etiqueta={f.estado === "tocado" ? "Se mencionó sin profundizar" : "No se tocó"}
              tono={f.estado === "tocado" ? "info" : "aviso"}
              lectura={f.lectura}
              cita={f.cita}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-muted">
          {lo.exploradas.length ? `Se exploró a fondo lo que se esperaba: ${enLista(lo.exploradas)}.` : "El análisis no juzgó qué se exploró en esta sesión."}
        </p>
      )}
      {falta.items.length > 0 && lo.exploradas.length > 0 && <p className="text-[12.5px] text-fg-secondary">Se exploró a fondo: {enLista(lo.exploradas)}.</p>}
      {falta.sinTocar.length > 0 && <p className="text-[12.5px] text-fg-muted">No se tocó en esta sesión: {enLista(falta.sinTocar)}.</p>}
      <ParaDecidirYDemo lo={lo} />
    </div>
  );
}

/**
 * Dos líneas al pie de lo que falta (2026-11-08): los huecos de decisión que siguen abiertos y las funciones por las que
 * preguntó el cliente, para llevarlas al demo. Los análisis de antes no las traen: no se muestran.
 */
function ParaDecidirYDemo({ lo }: { lo: LoDeLaSesion }) {
  const abiertos = lo.decision?.filter((d) => !d.seSabe) ?? null;
  return (
    <>
      {abiertos && (
        <p className="text-[12.5px] leading-[18px] text-fg-secondary">
          <span className="font-semibold text-fg">Qué falta para decidir:</span>{" "}
          {abiertos.length ? `${enLista(abiertos.map((d) => TEXTO_DEL_HUECO[d.hueco]))}.` : "nada: ya se sabe quién decide, para cuándo, cuánto pueden invertir y qué pasa si no hacen nada."}
        </p>
      )}
      {lo.demo.length > 0 && (
        <p className="text-[12.5px] leading-[18px] text-fg-secondary">
          <span className="font-semibold text-fg">Preguntas para el demo:</span> {lo.demo.map((d) => `${d.pregunta} (${d.quien})`).join(" · ")}.
        </p>
      )}
    </>
  );
}

/**
 * Los números del cliente en una tabla corta (2026-11-08): la meta, lo que pasa hoy y lo que falta saber. Va debajo de
 * «El resultado que busca» (otra vez a la vista desde el 8 nov). La cita de cada cifra, al pasar el mouse.
 */
function LosNumeros({ lo }: { lo: LoDeLaSesion }) {
  const celda = (c: CifraDicha | null) =>
    c ? (
      <span title={`«${c.cita.texto}» — ${c.cita.hablante}, turno ${c.cita.turno}`} className="cursor-help underline decoration-line decoration-dotted underline-offset-2">
        {c.texto}
      </span>
    ) : (
      <span className="text-fg-muted">—</span>
    );
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Subtitulo>Los números del cliente</Subtitulo>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-[12.5px] leading-[18px]">
          <thead>
            <tr className="border-b border-line text-xs text-fg-muted">
              <th className="py-1.5 pr-3 font-medium"> </th>
              <th className="py-1.5 pr-3 font-medium">Lo que dijo como meta</th>
              <th className="py-1.5 pr-3 font-medium">Lo que pasa hoy</th>
              <th className="py-1.5 font-medium">Lo que falta saber</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lo.numeros.map((f, i) => (
              <tr key={i} className="align-top">
                <td className="py-2 pr-3 font-semibold text-fg">{f.que}</td>
                <td className="py-2 pr-3 text-fg">{celda(f.meta)}</td>
                <td className="py-2 pr-3 text-fg">{celda(f.realidad)}</td>
                <td className="py-2 text-fg-secondary">{f.falta ?? <span className="text-fg-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** ¿Se averiguó el resultado que busca? (2026-11-06). Los análisis de antes no lo tienen: no se muestra. */
function ElResultado({ lo }: { lo: LoDeLaSesion }) {
  const r = lo.resultado;
  if (!r) return null;
  return (
    <div className="space-y-1">
      <Subtitulo>El resultado que busca</Subtitulo>
      <ul className="divide-y divide-line">
        <Fila
          titulo="¿Se averiguó el resultado que busca?"
          etiqueta={r.valor === "si" ? "Sí" : r.valor === "en_parte" ? "En parte" : "No"}
          tono={r.valor === "si" ? "info" : r.valor === "en_parte" ? "neutro" : "aviso"}
          lectura={r.lectura}
          cita={r.citas[0] ?? null}
        />
      </ul>
    </div>
  );
}

function ElProcesoConsultivo({ lo, juzgado }: { lo: LoDeLaSesion; juzgado: boolean }) {
  if (!juzgado) return null;
  return (
    <div className="space-y-1.5">
      <Subtitulo>Del proceso consultivo</Subtitulo>
      {!lo.etapasFlojas.length ? (
        <p className="text-[13px] text-fg-muted">Se hicieron todas las etapas del proceso consultivo.</p>
      ) : (
        <ul className="divide-y divide-line">
          {lo.etapasFlojas.map((e) => (
            <Fila
              key={e.etapa}
              titulo={e.nombre}
              etiqueta={e.valor === "se_salto" ? "Se saltó" : "En parte"}
              tono={e.valor === "se_salto" ? "aviso" : "neutro"}
              lectura={e.lectura}
              cita={e.citas[0] ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Confirmacion({
  vista,
  puedeEditar,
  ocupado,
  nombre,
  confirmar,
  desconfirmar,
}: {
  vista: ReunionDeVentaVista;
  puedeEditar: boolean;
  ocupado: string | null;
  nombre: (correo: string) => string;
  confirmar: (nota: string) => void;
  desconfirmar: () => void;
}) {
  const d = vista.detalle!;
  const [nota, setNota] = useState("");

  if (d.confirmado) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-muted px-3.5 py-2.5">
        <p className="min-w-0 flex-1 text-[13px] text-fg-secondary">
          Confirmado por {nombre(d.confirmado.por)} el {fechaDelAnalisis(d.confirmado.en)}
          {d.confirmado.nota ? `: «${d.confirmado.nota}»` : "."}
        </p>
        {puedeEditar && (
          <BotonTexto disabled={!!ocupado} onClick={desconfirmar}>
            Quitar la confirmación
          </BotonTexto>
        )}
      </div>
    );
  }
  if (!puedeEditar) return null;
  return (
    <div className="space-y-2 rounded-lg bg-surface-muted p-3.5">
      <Field label="¿Algo que decir al confirmar? (opcional)">
        <Textarea rows={2} value={nota} maxLength={MAX_LETRAS_DE_LA_NOTA} onChange={(e) => setNota(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="primary" loading={ocupado === "confirmar"} disabled={!!ocupado} onClick={() => confirmar(nota)}>
          Confirmar el análisis
        </Button>
        <p className="min-w-0 flex-1 text-xs text-fg-muted">Confírmalo cuando el vendedor ya lo leyó: lo confirmado cuenta en su tendencia.</p>
      </div>
    </div>
  );
}

"use client";

/**
 * ComoTrabajasteEstaSesion — la autoevaluación de cada sesión de la preventa (S4, 2026-10-27; docs/analizador-reuniones-
 * venta-plan.md › «El rediseño de Elías (2026-10-26)»). Vive en Exploración › la sesión › Análisis, en un apartado APARTE
 * de lo que ya estaba ahí (siguiente paso acordado, cuánto avanzó, quedó abierto), que no se toca.
 *
 * Es FEEDBACK de cómo se trabajó esta sesión, no la planificación de la que sigue (Elías, 27 oct): arriba y en grande la
 * lectura general, después quién habló, lo que faltó explorar en tarjetas, el proceso consultivo en una fila y las
 * recomendaciones como «Para mejorar». Una persona lo confirma y lo confirmado cuenta en la tendencia de cada vendedor
 * (S7). Se fueron los comentarios del vendedor, el siguiente paso y las casillas de «para la próxima».
 *
 * Solo lo ven los super admin mientras se prueba (`veAnalisisDeVenta` del lienzo). Solo tokens del tema.
 */
import { useMemo, useState } from "react";
import { Alert, Button, Field, Textarea, useToast } from "@/components/ui";
import { BotonTexto } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { equipoDeLaDimension, loDeLaSesion, loQueFaltoPorEquipo, MAX_LETRAS_DE_LA_NOTA, type FaltaExplorar, type LoDeLaSesion } from "@/lib/analizador-venta/revision";
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
      <span className="rounded-full border border-line bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold text-fg-secondary">En prueba: solo super admin</span>
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
  const faltas = useMemo(() => (lo ? loQueFaltoPorEquipo(lo, (dim) => equipoDeLaDimension(dim, { equipo, areas: escala.areas })) : []), [lo, equipo, escala.areas]);
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
              {d.descartados ? ` · ${d.descartados} juicios sin una cita que esté en la transcripción se descartaron` : ""}.
            </p>
          </div>

          {vista.quienHablo && (
            <div className="space-y-1.5">
              <Subtitulo>Quién habló</Subtitulo>
              <BarraDeQuienHablo q={vista.quienHablo} />
            </div>
          )}

          <LoQueFalto lo={lo} faltas={faltas} />
          <ElProcesoConsultivo lo={lo} juzgado={res.juicios.some((j) => j.punto === "etapa")} />

          {lo.recomendaciones.length > 0 && (
            <div className="space-y-2.5">
              <Subtitulo>Para mejorar</Subtitulo>
              <ul className="space-y-2.5">
                {lo.recomendaciones.map((x, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand" />
                    <div className="min-w-0">
                      <p className="text-[13px] leading-[19px] text-fg">{x.texto}</p>
                      <Citas citas={x.citas.slice(0, 1)} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

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

/** Una tarjeta chica: título, etiqueta, una línea y la cita. */
function Tarjeta({ titulo, rotulo, etiqueta, tono, lectura, cita }: { titulo: string; rotulo?: string | null; etiqueta: string; tono: "aviso" | "info" | "neutro"; lectura: string; cita: FaltaExplorar["cita"] }) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-surface p-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-[18px] text-fg">{titulo}</p>
        {rotulo && <p className="text-[11.5px] text-fg-muted">{rotulo}</p>}
      </div>
      <span
        className={cn(
          "self-start rounded-full px-2 py-0.5 text-[11px] font-semibold",
          tono === "aviso" ? "bg-warn-surface text-warn-ink" : tono === "info" ? "bg-info-surface text-brand" : "bg-surface-muted text-fg-secondary",
        )}
      >
        {etiqueta}
      </span>
      <p className="line-clamp-2 text-[12.5px] leading-[18px] text-fg-secondary" title={lectura}>
        {lectura}
      </p>
      {cita && <Citas citas={[cita]} />}
    </li>
  );
}

function LoQueFalto({ lo, faltas }: { lo: LoDeLaSesion; faltas: ReturnType<typeof loQueFaltoPorEquipo> }) {
  const agrupado = faltas.length > 1;
  return (
    <div className="space-y-2.5">
      <Subtitulo>Lo que faltó explorar</Subtitulo>
      {!faltas.length ? (
        <p className="text-[13px] text-fg-muted">
          {lo.exploradas.length ? `Se exploró a fondo lo que se esperaba: ${lo.exploradas.join(", ")}.` : "El análisis no juzgó qué se exploró en esta sesión."}
        </p>
      ) : (
        faltas.map((g) => (
          <div key={g.equipo ?? "sin-equipo"} className="space-y-2">
            {agrupado && <p className="text-[12.5px] font-semibold text-fg-secondary">{g.equipo ?? "Otras"}</p>}
            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((f, i) => (
                <Tarjeta
                  key={`${f.estado}-${i}-${f.dimension}`}
                  titulo={f.dimension}
                  rotulo={agrupado ? null : f.equipo}
                  etiqueta={f.estado === "tocado" ? "Se tocó sin profundizar" : "No se tocó"}
                  tono={f.estado === "tocado" ? "info" : "aviso"}
                  lectura={f.lectura}
                  cita={f.cita}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function ElProcesoConsultivo({ lo, juzgado }: { lo: LoDeLaSesion; juzgado: boolean }) {
  if (!juzgado) return null;
  return (
    <div className="space-y-2.5">
      <Subtitulo>Del proceso consultivo</Subtitulo>
      {!lo.etapasFlojas.length ? (
        <p className="text-[13px] text-fg-muted">Se hicieron todas las etapas del proceso consultivo.</p>
      ) : (
        // En pantalla ancha, todas en una fila.
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {lo.etapasFlojas.map((e) => (
            <Tarjeta
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

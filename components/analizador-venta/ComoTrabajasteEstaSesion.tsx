"use client";

/**
 * ComoTrabajasteEstaSesion — la autoevaluación de cada sesión de la preventa (S4, 2026-10-27; docs/analizador-reuniones-
 * venta-plan.md › «El rediseño de Elías (2026-10-26)»). Vive en Exploración › la sesión › Análisis, en un apartado APARTE
 * de lo que ya estaba ahí (siguiente paso acordado, cuánto avanzó, quedó abierto), que no se toca.
 *
 * El análisis de la reunión (S3) resumido para ESTA sesión: cómo fue, quién habló, lo que faltó explorar con su cita, la
 * etapa que se saltó, el siguiente paso, y dos o tres cosas para la próxima. Es coaching, no evaluación: el vendedor lo
 * comenta o discrepa, y una persona lo confirma eligiendo qué va «para la próxima». Lo confirmado se lleva a la guía de la
 * siguiente sesión por el mismo camino que «Quedó abierto» (`llevar`), y cuenta en la tendencia de cada vendedor (S7).
 *
 * Solo lo ven los super admin mientras se prueba (`veAnalisisDeVenta` del lienzo). Solo tokens del tema.
 */
import { useMemo, useState } from "react";
import { Alert, Button, Field, Select, Textarea, useToast } from "@/components/ui";
import { BotonTexto } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { PUNTOS_DEL_ANALISIS } from "@/lib/analizador-venta/criterio";
import {
  candidatasParaLaProxima,
  continuidadDelSiguientePaso,
  loDeLaSesion,
  MAX_LETRAS_DEL_COMENTARIO,
  MAX_PARA_LA_PROXIMA,
  type PuntoDelComentario,
  type TipoDeComentario,
} from "@/lib/analizador-venta/revision";
import type { ReunionDeVentaVista } from "@/lib/analizador-venta/reuniones-de-venta-server";
import type { PestanaDeSesion } from "@/lib/exploraciones/guia";
import { useLienzo } from "@/components/exploraciones/contexto";
import type { Llevar } from "@/components/exploraciones/DespuesDeLaSesion";
import { useSesiones } from "@/components/exploraciones/useSesiones";
import { AnalisisCompleto, BarraDeQuienHablo, ChipDelValor, Citas, fechaDelAnalisis, textoDeLaContinuidad } from "./piezas";
import { useAnalisisDeLaVenta } from "./useAnalisisDeLaVenta";

const PUNTOS_PARA_COMENTAR = PUNTOS_DEL_ANALISIS.filter((p) => p.id !== "quien_hablo");

function Encabezado() {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-[18px] py-3.5">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-fg">Cómo trabajaste esta sesión</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">
          Coaching, no evaluación: lo propone Nexus con citas de la reunión, lo comentas o discrepas, y una persona lo confirma. Lo confirmado va a la guía de la próxima
          sesión.
        </p>
      </div>
      <span className="rounded-full border border-line bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold text-fg-secondary">En prueba: solo super admin</span>
    </header>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="px-[18px] py-4 text-[13px] text-fg-muted">{children}</p>;
}

export default function ComoTrabajasteEstaSesion({
  pestana,
  numeroSiguiente,
  llevar,
  soltar,
}: {
  pestana: PestanaDeSesion;
  numeroSiguiente: number;
  llevar: (l: Llevar) => void;
  soltar: (texto: string) => void;
}) {
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
  else cuerpo = <ElAnalisis vista={vista} numeroSiguiente={numeroSiguiente} llevar={llevar} soltar={soltar} puedeEditar={puedeEditar} />;

  return (
    <section aria-label="Cómo trabajaste esta sesión" data-recorrido="preventa.sesion.como-trabajaste" className="overflow-hidden rounded-xl border border-line bg-surface">
      <Encabezado />
      {cuerpo}
    </section>
  );
}

function ElAnalisis({
  vista,
  numeroSiguiente,
  llevar,
  soltar,
  puedeEditar,
}: {
  vista: ReunionDeVentaVista;
  numeroSiguiente: number;
  llevar: (l: Llevar) => void;
  soltar: (texto: string) => void;
  puedeEditar: boolean;
}) {
  const { exp } = useLienzo();
  const { todas } = useSesiones();
  const { datos, analizar, revisar } = useAnalisisDeLaVenta(exp.id, true);
  const toast = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const d = vista.detalle ?? null;
  const res = d?.resultado ?? null;
  const lo = useMemo(() => (res ? loDeLaSesion(res) : null), [res]);
  const despues = (datos?.reuniones ?? []).map((x) => x.fecha);
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
    <div className="space-y-5 px-[18px] py-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {vista.quienHablo && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-fg-secondary">Quién habló</p>
          <BarraDeQuienHablo q={vista.quienHablo} />
        </div>
      )}

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

      {d && res && lo && (
        <>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ChipDelValor j={lo.consultiva} />
              <ChipDelValor j={lo.posicion} />
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  d.confirmado ? "bg-success-surface text-success-ink" : "bg-info-surface text-brand",
                )}
              >
                {d.confirmado ? `Confirmado por ${nombre(d.confirmado.por)}` : "Propuesta de Nexus: falta confirmarla"}
              </span>
            </div>
            <p className="text-[13px] leading-[20px] text-fg">{lo.resumen}</p>
            <p className="text-xs text-fg-muted">
              Analizada el {fechaDelAnalisis(d.analizadoAt)}
              {d.descartados ? ` · ${d.descartados} juicios sin una cita que esté en la transcripción se descartaron` : ""}.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-fg-secondary">Lo que faltó explorar</p>
              {!lo.tocadas.length && !lo.sinExplorar.length ? (
                <p className="text-[13px] text-fg-muted">
                  {lo.exploradas.length ? `Se exploró a fondo lo que se esperaba: ${lo.exploradas.join(", ")}.` : "El análisis no juzgó qué se exploró en esta sesión."}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {lo.tocadas.map((t) => (
                    <li key={`t-${t.dimension}`}>
                      <p className="text-[13px] font-semibold text-fg">
                        {t.dimension} <span className="font-normal text-warn-ink">· se tocó sin profundizar</span>
                      </p>
                      <p className="text-[13px] leading-[19px] text-fg-secondary">{t.lectura}</p>
                      <Citas citas={t.citas} />
                    </li>
                  ))}
                  {lo.sinExplorar.map((t) => (
                    <li key={`s-${t.dimension}`}>
                      <p className="text-[13px] font-semibold text-fg">
                        {t.dimension} <span className="font-normal text-warn-ink">· no se tocó</span>
                      </p>
                      <p className="text-[13px] leading-[19px] text-fg-secondary">{t.lectura}</p>
                    </li>
                  ))}
                </ul>
              )}
              {lo.etapasFlojas.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold text-fg-secondary">Del proceso consultivo</p>
                  {lo.etapasFlojas.map((e) => (
                    <div key={e.etapa}>
                      <p className="text-[13px] font-semibold text-fg">
                        {e.nombre} <span className="font-normal text-warn-ink">· {e.valor === "se_salto" ? "se saltó" : "en parte"}</span>
                      </p>
                      <p className="text-[13px] leading-[19px] text-fg-secondary">{e.lectura}</p>
                      <Citas citas={e.citas} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-fg-secondary">El siguiente paso</p>
                {lo.siguientePaso ? (
                  <>
                    <ChipDelValor j={lo.siguientePaso} />
                    <p className="text-[13px] leading-[19px] text-fg">{lo.siguientePaso.lectura}</p>
                    <Citas citas={lo.siguientePaso.citas} />
                  </>
                ) : (
                  <p className="text-[13px] text-fg-muted">El análisis no lo juzgó.</p>
                )}
                {(() => {
                  const c = textoDeLaContinuidad(continuidadDelSiguientePaso({ siguientePaso: lo.siguientePaso, fecha: vista.fecha, despues, ahora: new Date() }));
                  return <p className={cn("text-xs", c.aviso ? "text-warn-ink" : "text-fg-muted")}>{c.texto}</p>;
                })()}
              </div>
              <ParaLaProxima
                key={d.analizadoAt}
                vista={vista}
                candidatas={candidatasParaLaProxima(res)}
                numeroSiguiente={numeroSiguiente}
                todas={todas}
                llevar={llevar}
                soltar={soltar}
                puedeEditar={puedeEditar}
                ocupado={ocupado}
                confirmar={(paraLaProxima, nota) =>
                  void hacer(
                    "confirmar",
                    () => revisar({ accion: "confirmar", sessionId: vista.id, analizadoAt: d.analizadoAt, paraLaProxima, nota }),
                    "Confirmado: ya cuenta para la próxima sesión.",
                  )
                }
                desconfirmar={() => void hacer("desconfirmar", () => revisar({ accion: "desconfirmar", sessionId: vista.id }))}
                nombre={nombre}
              />
            </div>
          </div>

          <Comentarios
            vista={vista}
            puedeEditar={puedeEditar}
            ocupado={ocupado}
            nombre={nombre}
            comentar={(tipo, punto, texto) => hacer("comentar", () => revisar({ accion: "comentar", sessionId: vista.id, tipo, punto, texto }), "Comentario guardado.")}
          />

          <details className="rounded-lg border border-line">
            <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[13px] font-semibold text-fg">Ver el análisis completo, punto por punto</summary>
            <div className="border-t border-line p-3.5">
              <AnalisisCompleto r={res} />
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
            {botonAnalizar}
            {puedeEditar && (
              <Button
                variant="secondary"
                size="sm"
                loading={ocupado === "referencia"}
                disabled={!!ocupado}
                onClick={() => void hacer("referencia", () => revisar({ accion: vista.referencia ? "quitar-referencia" : "referencia", sessionId: vista.id }))}
              >
                {vista.referencia ? "Quitar como referencia" : "Marcar como referencia"}
              </Button>
            )}
            <span className="min-w-0 flex-1 text-xs text-fg-muted">
              {vista.referencia ? "Esta reunión es una referencia de lo que sí es una reunión consultiva." : ""}
              {(datos?.referencias ?? []).filter((x) => x.sessionId !== vista.id).length > 0 &&
                ` Para comparar: ${(datos?.referencias ?? [])
                  .filter((x) => x.sessionId !== vista.id)
                  .map((x) => `«${x.titulo}» (${fechaDelAnalisis(x.fecha)})`)
                  .join(" · ")}. Nexus no las usa al analizar: son de otra empresa.`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function ParaLaProxima({
  vista,
  candidatas,
  numeroSiguiente,
  todas,
  llevar,
  soltar,
  puedeEditar,
  ocupado,
  confirmar,
  desconfirmar,
  nombre,
}: {
  vista: ReunionDeVentaVista;
  candidatas: string[];
  numeroSiguiente: number;
  todas: readonly PestanaDeSesion[];
  llevar: (l: Llevar) => void;
  soltar: (texto: string) => void;
  puedeEditar: boolean;
  ocupado: string | null;
  confirmar: (paraLaProxima: string[], nota: string) => void;
  desconfirmar: () => void;
  nombre: (correo: string) => string;
}) {
  const d = vista.detalle!;
  const recomendaciones = new Set((d.resultado?.recomendaciones ?? []).map((x) => x.texto.trim()));
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(candidatas.filter((c) => recomendaciones.has(c)).slice(0, MAX_PARA_LA_PROXIMA)));
  const lleno = elegidas.size >= MAX_PARA_LA_PROXIMA;
  const [nota, setNota] = useState("");
  const enQue = (texto: string) => todas.find((p) => p.sesion?.explorar?.includes(texto));

  if (d.confirmado) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-fg-secondary">Para la próxima</p>
        {d.paraLaProxima.length ? (
          <ul className="space-y-1.5">
            {d.paraLaProxima.map((t) => {
              const en = enQue(t);
              return (
                <li key={t} className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={!!en}
                    disabled={!puedeEditar}
                    aria-label={`Llevar «${t}» a la sesión ${numeroSiguiente}`}
                    onChange={() => (en ? soltar(t) : llevar({ texto: t, item: null }))}
                    className="mt-[3px] h-4 w-4 flex-shrink-0 accent-brand"
                  />
                  <span className="min-w-0 text-[13px] leading-[19px] text-fg">
                    {t}
                    {en && !en.noSeHizo && <span className="text-xs text-fg-muted"> · en la sesión {en.numero}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-fg-muted">Se confirmó sin nada para la próxima.</p>
        )}
        <p className="text-xs text-fg-muted">
          Marca lo que entra en la guía de la sesión {numeroSiguiente}. Confirmado por {nombre(d.confirmado.por)} el {fechaDelAnalisis(d.confirmado.en)}
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

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-fg-secondary">Para la próxima</p>
      {candidatas.length ? (
        <ul className="space-y-1.5">
          {candidatas.map((t) => (
            <li key={t} className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={elegidas.has(t)}
                disabled={!puedeEditar || (lleno && !elegidas.has(t))}
                aria-label={`Confirmar «${t}» para la próxima sesión`}
                onChange={() =>
                  setElegidas((x) => {
                    const y = new Set(x);
                    if (y.has(t)) y.delete(t);
                    else y.add(t);
                    return y;
                  })
                }
                className="mt-[3px] h-4 w-4 flex-shrink-0 accent-brand"
              />
              <span className="min-w-0 text-[13px] leading-[19px] text-fg">{t}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-muted">El análisis no dejó recomendaciones.</p>
      )}
      {candidatas.length > MAX_PARA_LA_PROXIMA && (
        <p className="text-xs text-fg-muted">
          Elige hasta {MAX_PARA_LA_PROXIMA}: una sesión no alcanza para más{lleno ? ". Ya elegiste el máximo." : "."}
        </p>
      )}
      {puedeEditar && (
        <div className="space-y-2 rounded-lg bg-surface-muted p-3">
          <Field label="¿Algo que decir al confirmar? (opcional)">
            <Textarea rows={2} value={nota} maxLength={MAX_LETRAS_DEL_COMENTARIO} onChange={(e) => setNota(e.target.value)} />
          </Field>
          <Button size="sm" variant="primary" loading={ocupado === "confirmar"} disabled={!!ocupado} onClick={() => confirmar([...elegidas], nota)}>
            Confirmar el análisis
          </Button>
          <p className="text-xs text-fg-muted">Confírmalo cuando el vendedor ya lo leyó. Lo que marques queda listo para llevarlo a la guía de la sesión {numeroSiguiente}.</p>
        </div>
      )}
    </div>
  );
}

function Comentarios({
  vista,
  puedeEditar,
  ocupado,
  nombre,
  comentar,
}: {
  vista: ReunionDeVentaVista;
  puedeEditar: boolean;
  ocupado: string | null;
  nombre: (correo: string) => string;
  comentar: (tipo: TipoDeComentario, punto: PuntoDelComentario, texto: string) => Promise<boolean>;
}) {
  const d = vista.detalle!;
  const [tipo, setTipo] = useState<TipoDeComentario>("comenta");
  const [punto, setPunto] = useState<string>("");
  const [texto, setTexto] = useState("");
  const tituloDe = (p: PuntoDelComentario) => (p ? (PUNTOS_DEL_ANALISIS.find((x) => x.id === p)?.titulo ?? p) : "Todo el análisis");
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold text-fg-secondary">Comentarios del vendedor</p>
      {d.comentarios.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nadie comentó todavía. Si no estás de acuerdo con algo, dilo: es una propuesta, no una evaluación.</p>
      ) : (
        <ul className="space-y-2">
          {d.comentarios.map((c) => (
            <li key={c.id} className="rounded-lg border border-line px-3 py-2">
              <p className="text-xs text-fg-muted">
                <span className="font-semibold text-fg-secondary">{nombre(c.por)}</span> · {c.tipo === "discrepa" ? "no está de acuerdo" : "comenta"} · {tituloDe(c.punto)} ·{" "}
                {fechaDelAnalisis(c.en)}
                {c.en < d.analizadoAt && " · sobre un análisis anterior"}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-[19px] text-fg">{c.texto}</p>
            </li>
          ))}
        </ul>
      )}
      {puedeEditar && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Qué haces">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeComentario)}>
                <option value="comenta">Comento</option>
                <option value="discrepa">No estoy de acuerdo</option>
              </Select>
            </Field>
            <Field label="Sobre qué">
              <Select value={punto} onChange={(e) => setPunto(e.target.value)}>
                <option value="">Todo el análisis</option>
                {PUNTOS_PARA_COMENTAR.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titulo}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={tipo === "discrepa" ? "No estoy de acuerdo porque…" : "Tu comentario"}>
            <Textarea rows={2} value={texto} maxLength={MAX_LETRAS_DEL_COMENTARIO} onChange={(e) => setTexto(e.target.value)} />
          </Field>
          <Button
            size="sm"
            variant="secondary"
            loading={ocupado === "comentar"}
            disabled={!!ocupado || !texto.trim()}
            onClick={() =>
              void comentar(tipo, (punto || null) as PuntoDelComentario, texto.trim()).then((ok) => {
                if (!ok) return;
                setTexto("");
                setPunto("");
              })

            }
          >
            Guardar el comentario
          </Button>
        </div>
      )}
    </div>
  );
}

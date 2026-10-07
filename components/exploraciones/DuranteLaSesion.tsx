"use client";

/**
 * DuranteLaSesion — la pestaña «En vivo» de una sesión: la reunión en curso (tablero «Durante · Sesión
 * 3», 2026-10-07). Arriba, el objetivo y las notas libres; debajo, las preguntas de la guía en el
 * orden de la conversación, con un filtro por sección (todas, la arquitectura de la venta o la
 * escala): cada una con su casilla de hecha y un campo para lo que respondió; la primera que falta va
 * marcada «Ahora», con su primera repregunta. Al final, qué hacer si se resiste.
 *
 * El siguiente paso ya no se escribe acá (Elías, 2026-10-07: «no es para que lo setee o edite en
 * vivo»): la idea de cuál puede ser está en el tramo «Cerrar» de la preparación, y el agente lo saca
 * de la transcripción.
 *
 * Todo se guarda solo. Lo que respondió y las notas libres van a `contenido.notas` (una nota por
 * pregunta, `sesion:<id>:<a qué apunta>`), y el agente las lee como contexto del vendedor, nunca como
 * palabras del cliente.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { ladoDeLaPregunta, type PestanaDeSesion, type PreguntaParaMostrar } from "@/lib/exploraciones/guia";
import { claveDeNotaDePregunta, claveDeNotaDeSesion, MAX_NOTA_DE_SESION } from "@/lib/exploraciones/notas-de-sesion";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { SiSeResiste } from "./AntesDeLaSesion";
import { useLienzo } from "./contexto";
import { EstadoDelGuardado, EtiquetaDePregunta, Rotulo, useEditarLaSesion, useGuiaDeLaSesion, useNotaQueSeGuarda } from "./piezas-de-la-sesion";
import Segmentos from "./Segmentos";

type Filtro = "todas" | "marco" | "escala";

const CAMPO = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none disabled:opacity-60";

/** Lo que respondió a una pregunta: se guarda solo, como nota de esa pregunta. */
function LoQueRespondio({ pestana, para, ahora }: { pestana: PestanaDeSesion; para: string; ahora: boolean }) {
  const { exp, puedeEditar } = useLienzo();
  const editar = useEditarLaSesion(pestana, "durante");
  const clave = pestana.sesion ? claveDeNotaDePregunta(pestana.sesion.id, para) : null;
  const nota = useNotaQueSeGuarda(clave ? (exp.estado.contenido.notas[clave] ?? "") : "", (texto) =>
    editar(null, (id) => [{ op: "nota", paso: claveDeNotaDePregunta(id, para), texto }]),
  );
  return (
    <div className="mt-2">
      <textarea
        value={nota.texto}
        onChange={(ev) => nota.alEscribir(ev.target.value)}
        onBlur={nota.alSalir}
        disabled={!puedeEditar}
        maxLength={MAX_NOTA_DE_SESION}
        rows={2}
        aria-label="Lo que respondió"
        placeholder="Lo que respondió, en pocas palabras"
        className={cn(CAMPO, "resize-y", ahora && "border-info-line")}
      />
      <div className="text-right">
        <EstadoDelGuardado estado={nota.estado} />
      </div>
    </div>
  );
}

function FilaDePregunta({ pestana, p, hecha, ahora, conNota, alMarcar, alElegir }: {
  pestana: PestanaDeSesion;
  p: PreguntaParaMostrar;
  hecha: boolean;
  ahora: boolean;
  conNota: boolean;
  alMarcar: () => void;
  alElegir: () => void;
}) {
  const { puedeEditar, guardando } = useLienzo();
  return (
    <li className={cn("flex gap-3 border-b border-surface-hover px-[18px] py-3.5 last:border-b-0", ahora && "bg-info-surface")}>
      <input
        type="checkbox"
        checked={hecha}
        disabled={!puedeEditar || guardando}
        onChange={alMarcar}
        aria-label={`Hecha: ${p.pregunta}`}
        className="mt-[5px] h-4 w-4 flex-shrink-0 accent-brand"
      />
      <EtiquetaDePregunta p={p} />
      <div className="min-w-0 flex-1">
        {ahora && <Rotulo className="mb-1 text-brand">Ahora</Rotulo>}
        <button type="button" onClick={alElegir} className="text-left">
          <span className={cn("text-[14.5px] font-semibold leading-[21px]", hecha ? "text-fg-muted line-through" : "text-fg")}>{p.pregunta}</span>
        </button>
        {ahora && p.repreguntas[0] && <p className="mt-1.5 text-[13px] text-fg-secondary">Profundiza: {p.repreguntas[0]}</p>}
        {(hecha || ahora || conNota) && <LoQueRespondio pestana={pestana} para={p.para} ahora={ahora} />}
      </div>
    </li>
  );
}

function NotasLibres({ pestana }: { pestana: PestanaDeSesion }) {
  const { exp, puedeEditar } = useLienzo();
  const editar = useEditarLaSesion(pestana, "durante");
  const clave = pestana.sesion ? claveDeNotaDeSesion(pestana.sesion.id) : null;
  const nota = useNotaQueSeGuarda(clave ? (exp.estado.contenido.notas[clave] ?? "") : "", (texto) =>
    editar(null, (id) => [{ op: "nota", paso: claveDeNotaDeSesion(id), texto }]),
  );
  return (
    <section data-recorrido="preventa.sesion.notas" className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2">
        <label htmlFor="notas-libres" className="text-[15px] font-semibold text-fg">
          Notas libres
        </label>
        <span className="flex-1" />
        <EstadoDelGuardado estado={nota.estado} />
      </div>
      <textarea
        id="notas-libres"
        value={nota.texto}
        onChange={(ev) => nota.alEscribir(ev.target.value)}
        onBlur={nota.alSalir}
        disabled={!puedeEditar}
        maxLength={MAX_NOTA_DE_SESION}
        rows={3}
        placeholder="Lo que no cae en ninguna pregunta: lo que te contaron, cómo lo dijeron, quién más apareció."
        className={cn(CAMPO, "resize-y leading-[1.5]")}
      />
      <span className="text-xs text-fg-muted">El agente las lee como tu contexto, no como palabras del cliente.</span>
    </section>
  );
}

export default function DuranteLaSesion({ pestana, esLaProxima }: { pestana: PestanaDeSesion; esLaProxima: boolean }) {
  const { exp } = useLienzo();
  const { guia, enOrden } = useGuiaDeLaSesion(pestana, esLaProxima);
  const editar = useEditarLaSesion(pestana, "durante");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [elegida, setElegida] = useState<string | null>(null);
  const s = pestana.sesion;
  const hechas = new Set(s?.hechas ?? []);
  const notas = exp.estado.contenido.notas;
  const delMarco = enOrden.filter((p) => ladoDeLaPregunta(p) === "tarjeta");
  const deLaEscala = enOrden.filter((p) => ladoDeLaPregunta(p) === "dimension");
  const visibles = filtro === "marco" ? delMarco : filtro === "escala" ? deLaEscala : enOrden;
  const ahora = elegida && visibles.some((p) => p.para === elegida) ? elegida : (visibles.find((p) => !hechas.has(p.para))?.para ?? null);
  const objetivo = s?.objetivo ?? guia?.objetivo ?? null;

  const marcar = (para: string) =>
    void editar((x) => {
      const actual = new Set(x.hechas ?? []);
      if (actual.has(para)) actual.delete(para);
      else actual.add(para);
      return { ...x, hechas: [...actual].slice(0, 20) };
    });

  return (
    <div className="space-y-5">
      {objetivo && (
        <section className="flex items-baseline gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <Rotulo className="flex-none">Objetivo</Rotulo>
          <p className="min-w-0 text-sm leading-5 text-fg">
            {!s?.objetivo && <IconoDeSugerencia className="mr-1 inline h-[13px] w-[13px] text-brand" />}
            {objetivo}
          </p>
        </section>
      )}
      <NotasLibres pestana={pestana} />
      <section data-recorrido="preventa.sesion.preguntas" className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
        <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-[18px] py-3">
          <h3 className="text-[15px] font-semibold text-fg">Preguntas</h3>
          <span className="text-[12.5px] text-fg-muted">
            {enOrden.filter((p) => hechas.has(p.para)).length} de {enOrden.length} hechas
          </span>
          <span className="flex-1" />
          <Segmentos
            etiqueta="Filtrar las preguntas"
            opciones={[
              { clave: "todas", nombre: "Todas", cuenta: enOrden.length },
              { clave: "marco", nombre: "Arquitectura de la venta", cuenta: delMarco.length },
              { clave: "escala", nombre: "Escala de rendimiento", cuenta: deLaEscala.length },
            ]}
            valor={filtro}
            onCambiar={setFiltro}
          />
        </header>
        {visibles.length ? (
          <ul>
            {visibles.map((p) => (
              <FilaDePregunta
                key={p.para}
                pestana={pestana}
                p={p}
                hecha={hechas.has(p.para)}
                ahora={p.para === ahora}
                conNota={!!s && !!notas[claveDeNotaDePregunta(s.id, p.para)]}
                alMarcar={() => marcar(p.para)}
                alElegir={() => setElegida(p.para)}
              />
            ))}
          </ul>
        ) : (
          <p className="px-[18px] py-5 text-[13px] text-fg-muted">
            {enOrden.length ? "No hay preguntas de esta sección en la guía." : "Esta sesión no tiene guía: anota lo que salga en las notas libres."}
          </p>
        )}
      </section>
      <SiSeResiste pestana={pestana} esLaProxima={esLaProxima} compacto />
    </div>
  );
}

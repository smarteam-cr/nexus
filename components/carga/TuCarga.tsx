/**
 * components/carga/TuCarga.tsx — «Tu carga»: las horas de UNA persona de CS, semana por semana, sus cuentas y lo que
 * tiene sin anotar de «¿cuánto te tomó?» (2026-10-07, tablero «Tu carga» de «Rentabilidad · diseño»).
 *
 * Solo lo suyo y sin montos: la página recorta en el servidor (`cargarTuCarga`) y acá no llega nada de otra persona.
 * No mide productividad: sirve para repartir bien las cuentas. Sin «Lectura del agente» (fase 5 del plan).
 */
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { cn } from "@/lib/cn";
import type { DatosDeTuCarga } from "@/lib/carga/queries";
import { RUTA_DE_LA_RENTABILIDAD } from "@/lib/carga/rutas";
import { etiquetaDelLunes } from "@/lib/carga/semana";
import type { SemanaDePersona } from "@/lib/carga/utilizacion";
import type { PreguntaParaResponder } from "@/lib/tiempos/tipos";
import { Cifra, ENLACE_BLANCO, EstadoDeCarga, coma, horas } from "./piezas";
import PreguntasDeTuCarga from "./PreguntasDeTuCarga";

/** Las cuatro partes de la barra de una semana. Las reuniones comerciales van con las internas: no son de una cuenta. */
const PARTES = [
  { clave: "cliente", texto: "Reuniones con clientes", clase: "bg-fg border-fg" },
  { clave: "internas", texto: "Internas", clase: "bg-fg-muted border-fg-muted" },
  { clave: "preparacion", texto: "Preparación", clase: "bg-surface-active border-surface-active" },
  { clave: "entrega", texto: "Entrega", clase: "bg-surface-muted border-dashed border-fg-muted" },
] as const;

const partesDe = (s: SemanaDePersona) => ({ cliente: s.cliente, internas: s.interna + s.comercial, preparacion: s.preparacion, entrega: s.entrega });

/** Cuántas cuentas se muestran por nombre; el resto va en una fila. */
const CUENTAS_A_LA_VISTA = 8;

export default function TuCarga({
  datos,
  preguntas,
  contenedor,
  conRentabilidad,
}: {
  datos: DatosDeTuCarga;
  preguntas: PreguntaParaResponder[];
  contenedor: string;
  /** Dirección la ve como pestaña de Rentabilidad: el enlace de vuelta solo para quien puede abrirla. */
  conRentabilidad: boolean;
}) {
  const p = datos.persona;
  const lunesActual = datos.futuras[0]?.lunes ?? datos.hoy;
  const cabecera = (
    <PageHeader
      title="Tu carga"
      badges={
        <>
          <ChipDeCabecera>Semana del {etiquetaDelLunes(lunesActual)}</ChipDeCabecera>
          {p && <ChipDeCabecera>{p.nombre}</ChipDeCabecera>}
        </>
      }
      description="Tus horas por semana: reuniones, preparación y entrega. Solo ves las tuyas. No mide productividad: sirve para repartir bien las cuentas."
      action={
        conRentabilidad ? (
          <Link href={RUTA_DE_LA_RENTABILIDAD} className={ENLACE_BLANCO}>
            Rentabilidad
          </Link>
        ) : undefined
      }
    />
  );

  if (!p) {
    return (
      <div className={cn(contenedor, "space-y-6")}>
        {cabecera}
        <EmptyState title="No encontramos tu carga" description="Tu correo no está activo en el equipo. Si es un error, avísale a la CSL." />
      </div>
    );
  }

  const estaSemana = p.proyeccion[0] ?? null;
  const real = p.promedio.total > 0 ? Math.round((p.promedio.conDatoReal / p.promedio.total) * 100) : null;
  const capacidadPct = p.disponible > 0 ? Math.round((p.promedio.total / p.disponible) * 100) : 0;
  const barras = [...p.semanas, ...p.proyeccion];
  const tope = Math.max(p.disponible, ...barras.map((s) => s.total)) * 1.15 || 1;
  const visibles = datos.cuentas.slice(0, CUENTAS_A_LA_VISTA);
  const resto = datos.cuentas.slice(CUENTAS_A_LA_VISTA);
  const internas = p.promedio.interna + p.promedio.comercial;
  const sumaResto = (k: "reuniones" | "preparacion" | "entrega" | "horas") => resto.reduce((a, c) => a + c[k], 0);

  return (
    <div className={cn(contenedor, "space-y-6")}>
      {cabecera}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Cifra
          rotulo="Esta semana"
          valor={
            <span className="inline-flex flex-wrap items-center gap-2">
              {horas(estaSemana?.total ?? 0)}
              {estaSemana && <EstadoDeCarga semaforo={estaSemana.semaforo} />}
            </span>
          }
          nota={`de ${horas(p.disponible)} disponibles · proyectada`}
        />
        <Cifra
          rotulo={`Últimas ${datos.semanas.length} semanas`}
          valor={horas(p.promedio.total)}
          nota={`Promedio por semana · ${capacidadPct} % de tu capacidad`}
        />
        <Cifra rotulo="Con dato real" valor={real === null ? "—" : `${real} %`} nota="Del calendario o respondido por ti. El resto es estimado." />
        <Cifra
          rotulo="Preguntas por responder"
          valor={preguntas.length}
          nota={preguntas.length ? "Abajo, en «¿Cuánto te tomó?»" : "Nada pendiente"}
        />
      </div>

      <section aria-label="Tus horas por semana" className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">Tus horas por semana</h2>
          <span className="flex flex-wrap items-center gap-3.5 text-xs text-fg-secondary">
            {PARTES.map((x) => (
              <span key={x.clave} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("inline-block h-2.5 w-2.5 rounded-sm border", x.clase)} />
                {x.texto}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0 w-4 border-t-2 border-dashed border-danger-ink" />
              {horas(p.disponible)} disponibles
            </span>
          </span>
        </div>
        <div>
          <div className="relative flex h-[200px] items-end gap-3 border-b border-line pb-px">
            {barras.map((s) => {
              const partes = partesDe(s);
              return (
                <div key={s.lunes} className={cn("flex h-full flex-1 flex-col items-center justify-end gap-1", s.proyectada && "opacity-60")}>
                  <span className="text-[11px] font-semibold tabular-nums text-fg-secondary">{Math.round(s.total)} h</span>
                  <div
                    className="flex w-full max-w-[56px] flex-col-reverse overflow-hidden rounded-t-[4px]"
                    style={{ height: `${(s.total / tope) * 100}%` }}
                    title={`${horas(s.total)} · ${s.utilizacion} %${s.proyectada ? " · proyectada" : ""}`}
                  >
                    {PARTES.map((x) =>
                      partes[x.clave] > 0 ? (
                        <span key={x.clave} className={cn("block w-full border", x.clase)} style={{ height: `${(partes[x.clave] / Math.max(s.total, 0.01)) * 100}%` }} />
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-danger-ink"
              style={{ bottom: `${(p.disponible / tope) * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex gap-3">
            {barras.map((s) => (
              <span key={s.lunes} className={cn("flex-1 text-center text-[11px]", s.proyectada ? "text-fg-muted" : "text-fg-secondary")}>
                {etiquetaDelLunes(s.lunes)}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-fg-muted">
          Las {datos.futuras.length} últimas son proyectadas: tu ritmo de reuniones de las {datos.semanas.length} semanas anteriores más lo que tu cronograma pone
          en cada semana.
        </p>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section aria-label="Tus cuentas" className="space-y-2 rounded-xl border border-line bg-surface py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-4">
              <h2 className="text-sm font-semibold text-fg">Tus cuentas · promedio por semana, últimas {datos.semanas.length}</h2>
              <span className="text-xs text-fg-muted">El factor dice cuánto más trabajo pide una cuenta que la base</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px] leading-[19px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    <th className="px-4 py-2">Cuenta</th>
                    <th className="px-3 py-2 text-right">Factor</th>
                    <th className="px-3 py-2 text-right">Reuniones</th>
                    <th className="px-3 py-2 text-right">Preparación</th>
                    <th className="px-3 py-2 text-right">Entrega</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-[13px] text-fg-secondary">
                        No tuviste horas en cuentas en las últimas {datos.semanas.length} semanas.
                      </td>
                    </tr>
                  )}
                  {visibles.map((c) => (
                    <tr key={c.clienteId} className="border-b border-line align-top">
                      <td className="min-w-[200px] px-4 py-2.5">
                        <span className="block font-semibold text-fg">{c.nombre}</span>
                        {c.etapa && <span className="block text-xs text-fg-muted">{c.etapa}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{coma(c.factor, 2)}</td>
                      <Celda horas={c.reuniones} tipo="del calendario" />
                      <Celda horas={c.preparacion} tipo="estimada" />
                      <Celda horas={c.entrega} tipo={tipoDeEntrega(c.entrega, c.entregaDeclarada)} />
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-fg">{horas(c.horas)}</td>
                    </tr>
                  ))}
                  {resto.length > 0 && (
                    <tr className="border-b border-line align-top">
                      <td className="px-4 py-2.5">
                        <span className="block font-semibold text-fg">
                          {resto.length} {resto.length === 1 ? "cuenta más" : "cuentas más"}
                        </span>
                        <span className="block text-xs text-fg-muted">{resto.map((c) => c.nombre).join(", ")}</span>
                      </td>
                      <td className="px-3 py-2.5" />
                      <Celda horas={sumaResto("reuniones")} tipo="del calendario" />
                      <Celda horas={sumaResto("preparacion")} tipo="estimada" />
                      <Celda horas={sumaResto("entrega")} tipo="" />
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-fg">{horas(sumaResto("horas"))}</td>
                    </tr>
                  )}
                  <tr className="align-top">
                    <td className="px-4 py-2.5">
                      <span className="block font-semibold text-fg">Reuniones internas</span>
                      <span className="block text-xs text-fg-muted">Equipo, Smarteam, prospectos y aliados</span>
                    </td>
                    <td className="px-3 py-2.5" />
                    <Celda horas={internas} tipo="del calendario" />
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-fg">{horas(internas)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section aria-label="¿Cuánto te tomó?" className="space-y-1 rounded-xl border border-line bg-surface px-4 py-4">
            <h2 className="text-sm font-semibold text-fg">¿Cuánto te tomó?</h2>
            <p className="text-xs text-fg-muted">
              Tu respuesta reemplaza al supuesto en tu carga y ayuda a calibrarlo para todo el equipo. Nadie ve lo que respondió cada persona.
            </p>
            <PreguntasDeTuCarga preguntas={preguntas} />
          </section>
        </div>

        <section className="flex flex-col gap-2.5 rounded-xl bg-surface-muted p-4">
          <h2 className="text-sm font-semibold text-fg">Cómo se calcula</h2>
          <ul className="list-disc space-y-1.5 pl-[18px] text-[13px] leading-[19px] text-fg-secondary">
            <li>
              <b className="text-fg">Disponibles:</b> {datos.config.capacidad.horasContrato} h × {Math.round(datos.config.capacidad.productiva * 100)} % ={" "}
              {coma(p.disponible, 0)} h.
            </li>
            <li>
              <b className="text-fg">Reuniones:</b> las de tu calendario (lo agendado), hasta tener la asistencia de Meet.
            </li>
            <li>
              <b className="text-fg">Preparación:</b> {datos.config.preparacionMin} min por reunión con un cliente.
            </li>
            <li>
              <b className="text-fg">Entrega:</b> lo que respondiste en «¿Cuánto te tomó?»; si no, el supuesto de su tipo de tarea × el factor de la cuenta.
              «Ambos» cuenta {Math.round(datos.config.ambosFraccion * 100)} %.
            </li>
            <li>
              <b className="text-fg">Estado:</b> con espacio por debajo de {datos.config.semaforo.llena} %, llena hasta {datos.config.semaforo.sobrecarga} %, sobrecarga
              arriba.
            </li>
          </ul>
          {p.atrasadas > 0 && (
            <p className="text-xs text-fg-muted">
              Tus cronogramas tienen {p.atrasadas} {p.atrasadas === 1 ? "tarea abierta" : "tareas abiertas"} con fecha pasada: si ya están hechas, márcalas.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function tipoDeEntrega(total: number, declarada: number): string {
  if (total <= 0) return "";
  if (declarada >= total - 0.05) return "respondida";
  if (declarada > 0) return "respondida en parte";
  return "estimada";
}

function Celda({ horas: h, tipo }: { horas: number; tipo: string }) {
  return (
    <td className="px-3 py-2.5 text-right tabular-nums">
      {h > 0 ? (
        <>
          <span className="block text-fg-secondary">{horas(h)}</span>
          {tipo && <span className="block text-[11px] text-fg-muted">{tipo}</span>}
        </>
      ) : (
        <span className="text-fg-muted">—</span>
      )}
    </td>
  );
}

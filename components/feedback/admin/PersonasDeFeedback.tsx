"use client";

/**
 * Personas de /feedback: quién reporta más y de qué tipo, quién no dijo nada en el período y qué pantallas reciben
 * más reportes. Sirve para saber quién mira Nexus con atención y a quién hay que preguntarle; no para evaluar a nadie.
 *
 * Diseño «Feedback · rediseño completo» (Claude Design, 2026-10-06): los cuatro números en una sola franja y las
 * tablas con la misma cabecera. Preguntarle algo a alguien vive en Encuestas desde ese día (decisión de Elías: la
 * pestaña junta todo lo que le preguntas al equipo); acá se marca a quién y el botón lleva allá con esas personas
 * elegidas (`?vista=encuestas&para=`).
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Segmentado } from "@/components/ui/Segmentado";
import { QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import type { DatosDePersonas } from "@/lib/feedback/queries";
import { fechaCorta, haceCuanto } from "@/lib/feedback/reglas";
import { Iniciales } from "../piezas";
import { DisposicionDeFeedback } from "./Disposicion";

type Periodo = "30" | "90" | "todo";

const CABECERA = "text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";

export default function PersonasDeFeedback({ encabezado, datos, periodo }: { encabezado: ReactNode; datos: DatosDePersonas; periodo: string }) {
  const router = useRouter();
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(datos.callados.slice(0, 1).map((c) => c.email)));
  const max = Math.max(1, ...datos.filas.map((f) => f.total));
  const maxPantalla = Math.max(1, ...datos.pantallas.map((p) => p.total));
  const enPeriodo = datos.dias ? `en ${datos.dias} días` : "desde que existe Feedback";
  const ventas = datos.callados.filter((c) => c.rol === "Sales").length;

  const alternar = (email: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });

  const herramientas = (
    <>
      <p className="text-[13px] text-fg-muted">
        {datos.total} {datos.total === 1 ? "reporte" : "reportes"} de {datos.personasQueReportaron}{" "}
        {datos.personasQueReportaron === 1 ? "persona" : "personas"} {enPeriodo}. Sirve para saber a quién preguntarle, no para evaluar a nadie.
      </p>
      <Segmentado<Periodo>
        etiqueta="Período"
        valor={(periodo as Periodo) ?? "30"}
        onCambio={(p) => router.push(p === "30" ? "/feedback?vista=personas" : `/feedback?vista=personas&periodo=${p}`)}
        opciones={[
          { clave: "30", etiqueta: "30 días" },
          { clave: "90", etiqueta: "90 días" },
          { clave: "todo", etiqueta: "Desde el inicio" },
        ]}
      />
    </>
  );

  const numeros = [
    { r: "Reportes", v: String(datos.total), s: `de ${datos.personasQueReportaron} de las ${datos.tamanoDelEquipo} personas` },
    { r: "Sin revisar", v: String(datos.sinRevisar), s: datos.masViejoSinRevisar ? `el más viejo, ${haceCuanto(datos.masViejoSinRevisar)}` : "nada esperando" },
    {
      r: "Tu primera respuesta",
      v: datos.primeraRespuestaDias === null ? "—" : `${String(datos.primeraRespuestaDias).replace(".", ",")} días`,
      s: datos.primeraRespuestaDias === null ? "todavía sin respuestas" : "en promedio",
    },
    { r: "Resueltos", v: `${datos.resueltos} de ${datos.total}`, s: "listos o respondidos" },
  ];

  const lista = [...elegidos];
  const panel = (
    <>
      <QueSigue>
        {datos.callados.length === 0
          ? "Todo el equipo dijo algo en este período."
          : `${datos.callados.length === 1 ? "Una persona no reportó" : `${datos.callados.length} personas no reportaron`} nada ${enPeriodo}${
              ventas > 0 ? `, ${ventas} de Ventas` : ""
            }. Una pregunta concreta funciona mejor que «¿algún comentario?».`}
      </QueSigue>

      {datos.callados.length > 0 && (
        <div data-recorrido="feedback.personas.callados" className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>
            Sin reportes {enPeriodo} · {datos.callados.length}
          </p>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {datos.callados.map((c, i) => {
              const elegido = elegidos.has(c.email);
              return (
                <label
                  key={c.email}
                  className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors", i > 0 && "border-t border-line", elegido ? "bg-info-surface" : "hover:bg-surface-hover")}
                >
                  <input type="checkbox" checked={elegido} onChange={() => alternar(c.email)} className="h-[15px] w-[15px] flex-none accent-brand" />
                  <Iniciales texto={c.iniciales} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-fg">{c.nombre}</span>
                    <span className="block text-xs text-fg-muted">
                      {c.rol} · {c.ultimo ? `último: ${fechaCorta(c.ultimo)}` : "nunca"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {lista.length > 0 ? (
            <Link
              href={`/feedback?vista=encuestas&para=${encodeURIComponent(lista.join(","))}`}
              className="flex w-full items-center justify-center rounded-lg bg-primary px-3.5 py-[9px] text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              {lista.length === 1 ? "Pedirle su opinión" : `Pedirles su opinión a ${lista.length}`}
            </Link>
          ) : (
            <p className="text-xs text-fg-muted">Marca a quién quieres preguntarle.</p>
          )}
          <p className="text-xs text-fg-muted">La pregunta se arma en Encuestas: le aparece al entrar a la pantalla que elijas.</p>
        </div>
      )}
    </>
  );

  return (
    <DisposicionDeFeedback encabezado={encabezado} herramientas={herramientas} panel={panel} etiquetaPanel="Personas">
      <div data-recorrido="feedback.personas.numeros" className="grid overflow-hidden rounded-xl border border-line bg-surface sm:grid-cols-2 xl:grid-cols-4">
        {numeros.map((n, i) => (
          <div key={n.r} className={cn("space-y-0.5 p-4", i > 0 && "border-t border-line sm:border-t-0", i % 2 === 1 && "sm:border-l", i >= 2 && "sm:border-t xl:border-t-0", i === 2 && "xl:border-l")}>
            <p className="text-xs text-fg-muted">{n.r}</p>
            <p className="text-[22px] font-semibold leading-7 tabular-nums text-fg">{n.v}</p>
            <p className="text-xs text-fg-muted">{n.s}</p>
          </div>
        ))}
      </div>

      <section data-recorrido="feedback.personas.tabla" className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Quién reporta más</h2>
        {datos.filas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface-muted p-4 text-[13px] text-fg-muted">Nadie reportó nada {enPeriodo}.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-line bg-surface-muted">
                  <th className={cn(CABECERA, "px-4 py-2.5")}>Persona</th>
                  <th className={cn(CABECERA, "w-[200px] px-3 py-2.5")}>Reportes</th>
                  <th className={cn(CABECERA, "px-3 py-2.5 text-right")}>Fallas</th>
                  <th className={cn(CABECERA, "px-3 py-2.5 text-right")}>Mejoras</th>
                  <th className={cn(CABECERA, "px-3 py-2.5 text-right")}>No se entiende</th>
                  <th className={cn(CABECERA, "px-3 py-2.5")}>Último</th>
                  <th className={cn(CABECERA, "px-4 py-2.5 text-right")}>Resueltos</th>
                </tr>
              </thead>
              <tbody>
                {datos.filas.map((f) => (
                  <tr key={f.persona.email} className="border-t border-line first:border-t-0 hover:bg-surface-muted">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <Iniciales texto={f.persona.iniciales} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-fg">{f.persona.nombre}</span>
                          <span className="block text-xs text-fg-muted">{f.persona.rol}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span className="w-6 text-right text-[13px] font-semibold tabular-nums text-fg">{f.total}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                          <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${Math.round((f.total / max) * 100)}%` }} />
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-fg-secondary">{f.falla}</td>
                    <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-fg-secondary">{f.mejora}</td>
                    <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-fg-secondary">{f.duda}</td>
                    <td className="px-3 py-2.5 text-xs text-fg-muted">{haceCuanto(f.ultimo)}</td>
                    <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-fg-secondary">
                      {f.resueltos} de {f.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-fg-muted">Resueltos: listos o respondidos, de los suyos.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Qué pantallas reciben más reportes</h2>
        {datos.pantallas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface-muted p-4 text-[13px] text-fg-muted">Todavía ninguna.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {datos.pantallas.map((p, i) => (
              <div key={p.nombre} className={cn("grid items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_40px_minmax(0,240px)]", i > 0 && "border-t border-line")}>
                <span className="truncate text-[13px] font-semibold text-fg">{p.nombre}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                  <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${Math.round((p.total / maxPantalla) * 100)}%` }} />
                </span>
                <span className="text-right text-[13px] font-semibold tabular-nums text-fg">{p.total}</span>
                <span className="truncate text-xs text-fg-muted">{p.detalle}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </DisposicionDeFeedback>
  );
}

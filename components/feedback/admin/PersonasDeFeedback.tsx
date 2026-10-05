"use client";

/**
 * Personas de /feedback: quién reporta más y de qué tipo, quién no dijo nada en el período (con «Pedir su
 * opinión» al lado) y qué pantallas reciben más reportes.
 *
 * Sirve para saber quién mira Nexus con atención y a quién hay que preguntarle; no para evaluar a nadie.
 * El pedido de opinión es la respuesta a «la gente no se acuerda»: una pregunta concreta sobre una
 * pantalla concreta, que le aparece a la persona cuando entra ahí.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Segmentado } from "@/components/ui/Segmentado";
import { QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { APP_NAV } from "@/components/layout/nav-config";
import { cn } from "@/lib/cn";
import type { DatosDePersonas, Persona } from "@/lib/feedback/queries";
import { fechaCorta, haceCuanto } from "@/lib/feedback/reglas";
import { Iniciales } from "../piezas";
import PanelLateral from "@/components/ui/PanelLateral";

type Periodo = "30" | "90" | "todo";

/** Las pantallas que se pueden elegir al pedir una opinión: las del menú, con sus hijos. */
function pantallasDelMenu(): { nombre: string; ruta: string }[] {
  const salida: { nombre: string; ruta: string }[] = [];
  for (const item of APP_NAV) {
    if (item.key === "feedback") continue;
    if (item.children?.length) {
      for (const h of item.children) salida.push({ nombre: `${item.label} › ${h.label}`, ruta: h.href });
    } else {
      salida.push({ nombre: item.label, ruta: item.href });
    }
  }
  return salida;
}

function dentroDeUnaSemana(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PersonasDeFeedback({ datos, periodo }: { datos: DatosDePersonas; periodo: string }) {
  const router = useRouter();
  const toast = useToast();
  const pantallas = useMemo(pantallasDelMenu, []);
  const [para, setPara] = useState<Persona[]>(datos.callados[0] ? [datos.callados[0]] : []);
  const [ruta, setRuta] = useState(pantallas[0]?.ruta ?? "/clients");
  const [pregunta, setPregunta] = useState("");
  const [hasta, setHasta] = useState(dentroDeUnaSemana());
  const [guardando, setGuardando] = useState(false);
  const max = Math.max(1, ...datos.filas.map((f) => f.total));
  const maxPantalla = Math.max(1, ...datos.pantallas.map((p) => p.total));
  const enPeriodo = datos.dias ? `en ${datos.dias} días` : "desde que existe Feedback";

  const pedir = async () => {
    if (!para.length || pregunta.trim().length < 5 || guardando) return;
    setGuardando(true);
    try {
      const pantalla = pantallas.find((p) => p.ruta === ruta)?.nombre ?? ruta;
      const r = await fetch("/api/feedback/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paraEmails: para.map((p) => p.email), pantalla, ruta, pregunta: pregunta.trim(), hasta }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        toast.error(d?.error ?? "No se pudo pedir la opinión.");
        return;
      }
      toast.success(para.length === 1 ? `Listo: a ${para[0].nombre.split(" ")[0]} le aparece al entrar a «${pantalla}».` : `Listo: les aparece a ${para.length} personas.`);
      setPregunta("");
      router.refresh();
    } finally {
      setGuardando(false);
    }
  };

  const ventas = datos.callados.filter((c) => c.rol === "Sales").length;

  return (
    <div className="-mx-6 flex flex-wrap items-stretch border-y border-line">
      <section className="min-w-0 flex-[999_1_640px] space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-fg-secondary">
            {datos.total} {datos.total === 1 ? "reporte" : "reportes"} de {datos.personasQueReportaron}{" "}
            {datos.personasQueReportaron === 1 ? "persona" : "personas"} {enPeriodo}.
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
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { r: "Reportes", v: String(datos.total), s: `de ${datos.personasQueReportaron} de las ${datos.tamanoDelEquipo} personas del equipo` },
            { r: "Sin revisar", v: String(datos.sinRevisar), s: datos.masViejoSinRevisar ? `el más viejo, ${haceCuanto(datos.masViejoSinRevisar)}` : "nada esperando" },
            {
              r: "Tu primera respuesta",
              v: datos.primeraRespuestaDias === null ? "—" : `${String(datos.primeraRespuestaDias).replace(".", ",")} días`,
              s: datos.primeraRespuestaDias === null ? "todavía sin respuestas" : "en promedio",
            },
            { r: "Resueltos", v: `${datos.resueltos} de ${datos.total}`, s: "listos o respondidos" },
          ].map((n) => (
            <div key={n.r} className="space-y-1 rounded-xl border border-line bg-surface p-4">
              <p className="text-xs text-fg-muted">{n.r}</p>
              <p className="text-2xl font-semibold tabular-nums leading-[30px] text-fg">{n.v}</p>
              <p className="text-xs text-fg-muted">{n.s}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Quién reporta más</p>
          {datos.filas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-surface-muted p-4 text-[13px] text-fg-muted">Nadie reportó nada {enPeriodo}.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-line bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    <th className="px-4 py-2.5 font-semibold">Persona</th>
                    <th className="px-3 py-2.5 font-semibold">Reportes</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Fallas</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Mejoras</th>
                    <th className="px-3 py-2.5 text-right font-semibold">No se entiende</th>
                    <th className="px-3 py-2.5 font-semibold">Último</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Resueltos</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.filas.map((f) => (
                    <tr key={f.persona.email} className="border-t border-line first:border-t-0">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <Iniciales texto={f.persona.iniciales} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-fg">{f.persona.nombre}</span>
                            <span className="block text-xs text-fg-muted">{f.persona.rol}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="w-7 text-right text-[13px] font-semibold tabular-nums text-fg">{f.total}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                            <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${Math.round((f.total / max) * 100)}%` }} />
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-fg-secondary">{f.falla}</td>
                      <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-fg-secondary">{f.mejora}</td>
                      <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-fg-secondary">{f.duda}</td>
                      <td className="px-3 py-2.5 text-xs text-fg-muted">{haceCuanto(f.ultimo)}</td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums text-fg-secondary">
                        {f.resueltos} de {f.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-fg-muted">Resueltos: listos o respondidos, de los suyos. Sirve para saber quién mira Nexus con atención, no para evaluar a nadie.</p>
        </div>

        <div className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Qué pantallas reciben más reportes</p>
          {datos.pantallas.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Todavía ninguna.</p>
          ) : (
            <div className="space-y-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
              {datos.pantallas.map((p) => (
                <div key={p.nombre} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_36px_minmax(0,220px)] items-center gap-3">
                  <span className="truncate text-[13px] text-fg">{p.nombre}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-hover">
                    <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${Math.round((p.total / maxPantalla) * 100)}%` }} />
                  </span>
                  <span className="text-right text-[13px] font-semibold tabular-nums text-fg">{p.total}</span>
                  <span className="truncate text-xs text-fg-muted">{p.detalle}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <PanelLateral etiqueta="Personas" ancho="lg:w-[380px] lg:flex-none" className="w-full p-5" gap="gap-4">
        <QueSigue>
          {datos.callados.length === 0
            ? "Todo el equipo dijo algo en este período."
            : ventas > 0
              ? `Hay ${datos.callados.length} personas sin reportes ${enPeriodo}, ${ventas} de Ventas. Una pregunta concreta funciona mejor que «¿algún comentario?».`
              : `Hay ${datos.callados.length} personas sin reportes ${enPeriodo}. Una pregunta concreta funciona mejor que «¿algún comentario?».`}
        </QueSigue>

        <div className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Sin reportes {enPeriodo} · {datos.callados.length}</p>
          {datos.callados.map((c) => {
            const elegido = para.some((p) => p.email === c.email);
            return (
              <div
                key={c.email}
                className={cn("flex items-center gap-2.5 rounded-lg border px-2.5 py-2", elegido ? "border-info-line bg-info-surface" : "border-line bg-surface")}
              >
                <Iniciales texto={c.iniciales} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-fg">{c.nombre}</span>
                  <span className="block text-xs text-fg-muted">
                    {c.rol} · {c.ultimo ? `último: ${fechaCorta(c.ultimo)}` : "nunca"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setPara((ps) => (elegido ? ps.filter((p) => p.email !== c.email) : [...ps, c]))}
                  className="flex-none rounded-md border border-line bg-surface px-2 py-[5px] text-xs font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg"
                >
                  {elegido ? "Quitar" : "Pedir su opinión"}
                </button>
              </div>
            );
          })}
        </div>

        <section aria-label="Pedir su opinión" className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <p className="text-[15px] font-semibold leading-5 text-fg">Pedir su opinión</p>
          <div className="space-y-1.5">
            <p className="text-[13px] font-semibold text-fg">A quién</p>
            {para.length === 0 ? (
              <p className="text-xs text-fg-muted">Elige a alguien de la lista de arriba.</p>
            ) : (
              <p className="flex flex-wrap gap-1.5">
                {para.map((p) => (
                  <span key={p.email} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-fg-secondary">
                    {p.nombre}
                    <button type="button" aria-label={`Quitar a ${p.nombre}`} onClick={() => setPara((ps) => ps.filter((x) => x.email !== p.email))} className="text-fg-muted hover:text-fg">
                      ✕
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-semibold text-fg">Sobre qué pantalla</span>
            <select value={ruta} onChange={(e) => setRuta(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-2.5 py-[7px] text-[13px] text-fg">
              {pantallas.map((p) => (
                <option key={p.ruta} value={p.ruta}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-semibold text-fg">La pregunta</span>
            <textarea
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              rows={3}
              placeholder="¿Qué haces todavía fuera de Nexus antes de una primera reunión?"
              className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] leading-[1.45] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
            />
            <span className="block text-xs text-fg-muted">Concreta y sobre algo que haga todas las semanas.</span>
          </label>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-semibold text-fg">Hasta cuándo</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-line bg-surface px-2.5 py-[7px] text-[13px] text-fg" />
          </label>
          <p className="text-xs text-fg-muted">Le aparece al entrar a esa pantalla, hasta que responda o diga «Ahora no». No le llega correo.</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void pedir()}
              disabled={!para.length || pregunta.trim().length < 5 || guardando}
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? "Pidiendo…" : "Pedir la opinión"}
            </button>
          </div>
        </section>

        <div className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Pedidos · {datos.pedidos.length}</p>
          {datos.pedidos.length === 0 && <p className="text-xs text-fg-muted">Todavía no le pediste la opinión a nadie.</p>}
          {datos.pedidos.slice(0, 8).map((p) => (
            <div key={p.id} className="space-y-1 rounded-lg border border-line bg-surface px-3 py-2.5">
              <p className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-fg">{p.para.nombre}</span>
                <span
                  className={cn(
                    "flex-none rounded-full border px-2 text-[11px] font-semibold",
                    p.estado === "respondido" ? "border-success-line bg-success-surface text-success-ink" : "border-line bg-surface text-fg-secondary",
                  )}
                >
                  {p.estado === "respondido"
                    ? `✓ Respondió${p.respondidoAt ? ` el ${fechaCorta(p.respondidoAt)}` : ""}`
                    : p.estado === "descartado"
                      ? "Dijo «Ahora no»"
                      : "○ Sin respuesta"}
                </span>
              </p>
              <p className="text-xs text-fg-secondary">«{p.pregunta}»</p>
              <p className="text-xs text-fg-muted">
                {p.pantalla}
                {p.hasta ? ` · hasta el ${fechaCorta(p.hasta)}` : ""}
                {p.estado === "abierto" ? ` · lo vio ${p.vistoVeces} ${p.vistoVeces === 1 ? "vez" : "veces"}` : ""}
              </p>
            </div>
          ))}
        </div>
      </PanelLateral>
    </div>
  );
}

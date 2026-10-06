"use client";

/**
 * components/carga/UnoAUno.tsx — la 1:1 de la CSL con una persona del equipo: cómo le fueron las últimas semanas, qué
 * cuentas le pesan y qué pasaría si alguna pasara a otra persona.
 *
 * ⛔ El simulador NO escribe nada: el dueño de un proyecto se cambia en HubSpot y Nexus lo toma en la copia siguiente.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader, Select } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { BotonBlanco, BotonTexto } from "@/components/ui/sistema";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { cn } from "@/lib/cn";
import type { ConfigCarga } from "@/lib/carga/config";
import type { CuentaConCarga, PersonaConCuentas } from "@/lib/carga/queries";
import { RUTA_DE_LA_CARGA } from "@/lib/carga/rutas";
import { etiquetaDelLunes } from "@/lib/carga/semana";
import { simularTraspasos, type Traspaso } from "@/lib/carga/simulacion";
import type { SemanaDePersona } from "@/lib/carga/utilizacion";
import { ENLACE_BLANCO, EstadoDeCarga, LeyendaDeLaSemana, PARTES_DE_LA_SEMANA, coma, horas } from "./piezas";

export default function UnoAUno({
  persona,
  equipo,
  cuentas,
  config,
  contenedor,
}: {
  persona: PersonaConCuentas;
  /** Todas las personas de CS (para elegir a quién pasar una cuenta y ver cómo queda). */
  equipo: PersonaConCuentas[];
  cuentas: CuentaConCarga[];
  config: ConfigCarga;
  contenedor: string;
}) {
  const toast = useToast();
  const [destino, setDestino] = useState<Record<string, string>>({});
  const porCuenta = useMemo(() => new Map(cuentas.map((c) => [c.clienteId, c])), [cuentas]);
  const traspasos: Traspaso[] = Object.entries(destino)
    .filter(([, a]) => a && a !== persona.email)
    .map(([clienteId, a]) => ({ clienteId, de: persona.email, a }));
  const resultado = useMemo(
    () =>
      simularTraspasos(
        equipo.map((p) => ({ email: p.email, horas: p.promedio.total, disponible: p.disponible, cuentas: p.cuentas.map((c) => ({ clienteId: c.clienteId, horas: c.horas })) })),
        traspasos,
        config,
      ),
    [equipo, traspasos, config],
  );
  const tocados = new Set([persona.email, ...traspasos.map((t) => t.a)]);
  const nombreDe = new Map(equipo.map((p) => [p.email, p.nombre]));
  const enCuentas = persona.cuentas.reduce((a, c) => a + c.horas, 0);
  const otras = Math.max(0, persona.promedio.total - enCuentas);

  const copiar = async () => {
    const lineas = [
      `1:1 con ${persona.nombre} · ${persona.promedio.utilizacion} % de utilización promedio (${horas(persona.promedio.total)} de ${horas(persona.disponible)} por semana).`,
      `Últimas semanas: ${persona.semanas.map((s) => `${etiquetaDelLunes(s.lunes)} ${s.enElEquipo ? `${s.utilizacion} %` : "—"}`).join(" · ")}.`,
      `Cuentas que más pesan: ${persona.cuentas
        .slice(0, 4)
        .map((c) => `${c.nombre} (${horas(c.horas)})`)
        .join(", ") || "ninguna"}.`,
      persona.atrasadas ? `Su cronograma suma ${persona.atrasadas} tareas atrasadas o sin marcar.` : "",
      ...traspasos.map((t) => `Si ${porCuenta.get(t.clienteId)?.nombre ?? "una cuenta"} pasara a ${nombreDe.get(t.a) ?? t.a}: ${resultado.find((r) => r.email === persona.email)?.utilizacionDespues} % para ${persona.nombre}.`),
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lineas.join("\n"));
      toast.success("Resumen copiado");
    } catch {
      toast.error("No se pudo copiar el resumen");
    }
  };

  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title={`La 1:1 con ${persona.nombre}`}
        crumbs={[{ label: "Éxito del cliente", href: "/customer-success" }, { label: "Carga del equipo", href: RUTA_DE_LA_CARGA }, { label: persona.nombre }]}
        badges={
          <>
            <EstadoDeCarga semaforo={persona.promedio.semaforo} detalle={persona.senal ? `${persona.racha} semanas` : undefined} />
            <ChipDeCabecera>
              {persona.cuentas.length} {persona.cuentas.length === 1 ? "cuenta" : "cuentas"} · {persona.promedio.utilizacion} % de promedio
            </ChipDeCabecera>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <BotonBlanco onClick={copiar}>Copiar el resumen</BotonBlanco>
            <Link href={RUTA_DE_LA_CARGA} className={ENLACE_BLANCO}>
              Volver al equipo
            </Link>
          </div>
        }
      />

      <HorasPorSemana persona={persona} config={config} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="space-y-3 rounded-xl border border-line bg-surface py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-4">
            <h2 className="text-sm font-semibold text-fg">Sus cuentas · promedio por semana, últimas {persona.semanas.length}</h2>
            <span className="text-xs text-fg-muted">«Frente a su complejidad»: lo que pide la cuenta ÷ lo que su factor predice</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] leading-[19px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  <th className="px-4 py-2">Cuenta</th>
                  <th className="px-3 py-2 text-right">Factor</th>
                  <th className="px-3 py-2 text-right">Reuniones</th>
                  <th className="px-3 py-2 text-right">Prep.</th>
                  <th className="px-3 py-2 text-right">Entrega est.</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Frente a su complejidad</th>
                  <th className="px-4 py-2">Simular: la lleva</th>
                </tr>
              </thead>
              <tbody>
                {persona.cuentas.map((c) => {
                  const cuenta = porCuenta.get(c.clienteId);
                  return (
                    <tr key={c.clienteId} className="border-b border-line">
                      <td className="min-w-[220px] px-4 py-2.5">
                        <span className="block font-semibold text-fg">{c.nombre}</span>
                        {cuenta?.etapas.length ? <span className="block text-xs text-fg-muted">{cuenta.etapas.join(" · ")}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{coma(c.factor, 2)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{horas(c.reuniones)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{horas(c.preparacion)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{horas(c.entrega)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{horas(c.horas)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {cuenta?.razon != null ? (
                          <span className={cn("tabular-nums", cuenta.razon >= 1.5 ? "font-semibold text-warn-ink" : "text-fg-secondary")}>{coma(cuenta.razon, 1)}×</span>
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <label>
                          <span className="sr-only">Quién llevaría {c.nombre}</span>
                          <Select
                            value={destino[c.clienteId] ?? persona.email}
                            onChange={(e) => setDestino((d) => ({ ...d, [c.clienteId]: e.target.value }))}
                            className="h-[30px] min-w-[170px] py-0 text-xs"
                          >
                            {equipo.map((p) => (
                              <option key={p.email} value={p.email}>
                                {p.email === persona.email ? `${p.nombre.split(" ")[0]} (sigue igual)` : p.nombre}
                              </option>
                            ))}
                          </Select>
                        </label>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="min-w-[220px] px-4 py-2.5">
                    <span className="block font-semibold text-fg">Reuniones internas y comerciales</span>
                    <span className="block text-xs text-fg-muted">Equipo, Smarteam, formación, prospectos y lo que no tiene empresa</span>
                  </td>
                  <td />
                  <td className="px-3 py-2.5 text-right tabular-nums">{horas(otras)}</td>
                  <td />
                  <td />
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{horas(otras)}</td>
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <h2 className="text-sm font-semibold text-fg">Si se repartiera así</h2>
            <p className="mt-0.5 text-xs text-fg-muted">Simulación. No cambia nada: el dueño se cambia en HubSpot y Nexus lo toma en la copia siguiente.</p>
          </div>
          {traspasos.length === 0 ? (
            <p className="text-[13px] text-fg-secondary">Elige en la tabla a quién pasaría una cuenta para ver cómo queda cada uno.</p>
          ) : (
            <ul className="space-y-3">
              {resultado
                .filter((r) => tocados.has(r.email))
                .map((r) => (
                  <li key={r.email} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="font-semibold text-fg">{nombreDe.get(r.email)}</span>
                      <span className="tabular-nums">
                        <span className="text-xs text-fg-muted">{r.utilizacionAntes} % → </span>
                        <span className={cn("font-semibold", r.semaforoPrimerMes === "sobrecarga" ? "text-danger-ink" : r.semaforoPrimerMes === "llena" ? "text-warn-ink" : "text-success-ink")}>
                          {r.utilizacionPrimerMes} %
                        </span>
                        {r.utilizacionPrimerMes !== r.utilizacionDespues && <span className="text-xs text-fg-muted"> · {r.utilizacionDespues} % desde el 2.º mes</span>}
                      </span>
                    </div>
                    <span className="block h-2 overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className={cn("block h-full", r.semaforoPrimerMes === "sobrecarga" ? "bg-destructive" : r.semaforoPrimerMes === "llena" ? "bg-warning" : "bg-success")}
                        style={{ width: `${Math.min(100, r.utilizacionPrimerMes / 1.5)}%` }}
                      />
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <p className="text-xs text-fg-muted">
            Quien recibe una cuenta carga un {Math.round(config.traspaso * 100)} % más el primer mes (conocerla, la reunión de presentación, el historial).
          </p>
          {traspasos.length > 0 && <BotonTexto onClick={() => setDestino({})}>Volver a como está</BotonTexto>}
        </section>
      </div>
    </div>
  );
}

/** Las barras de horas por semana: lo medido y lo proyectado, con la línea de lo disponible. */
function HorasPorSemana({ persona, config }: { persona: PersonaConCuentas; config: ConfigCarga }) {
  const semanas: SemanaDePersona[] = [...persona.semanas, ...persona.proyeccion];
  const tope = Math.max(persona.disponible * 1.5, ...semanas.map((s) => s.total), 1);
  const alto = (h: number) => `${(h / tope) * 100}%`;
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">Horas por semana</h2>
        <span className="text-xs text-fg-muted">
          Línea continua: {horas(persona.disponible)} disponibles · punteada: {config.semaforo.sobrecarga} % · borde punteado: proyectada
        </span>
      </div>
      <div className="relative h-[220px]">
        <span aria-hidden className="absolute inset-x-0 border-t border-fg-muted" style={{ bottom: alto(persona.disponible) }} />
        <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-warn-line" style={{ bottom: alto((persona.disponible * config.semaforo.sobrecarga) / 100) }} />
        <div className="relative flex h-full items-end gap-2">
          {semanas.map((s) => (
            <div key={s.lunes} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs font-semibold tabular-nums text-fg">{s.enElEquipo ? `${s.utilizacion} %` : "—"}</span>
              <div className={cn("flex w-full max-w-[56px] flex-col-reverse overflow-hidden rounded-t-md", s.proyectada && "border border-dashed border-fg-muted")} style={{ height: alto(s.total) }}>
                {PARTES_DE_LA_SEMANA.map((p) =>
                  s[p.clave] > 0 ? <span key={p.clave} title={`${p.texto}: ${horas(s[p.clave])}`} className={cn("w-full border-t", p.clase, s.proyectada && "opacity-60")} style={{ height: `${(s[p.clave] / Math.max(s.total, 0.01)) * 100}%` }} /> : null,
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {semanas.map((s) => (
          <span key={s.lunes} className="flex-1 text-center text-xs text-fg-muted">
            {etiquetaDelLunes(s.lunes)}
          </span>
        ))}
      </div>
      <LeyendaDeLaSemana preparacionMin={config.preparacionMin} />
    </section>
  );
}

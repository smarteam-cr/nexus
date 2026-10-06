"use client";

/**
 * components/carga/Supuestos.tsx — «Cómo se calcula la carga»: los supuestos a la vista y editables. Los ajustan la CSL
 * y dirección; cada guardado queda con quién y cuándo (tabla `ConfigCarga`, append-only).
 *
 * A la derecha, cómo queda cada persona con los valores del formulario, sin guardar. Es una vista previa: la
 * preparación y las horas disponibles se recalculan en vivo; la entrega estimada y el factor de cada cuenta se
 * recalculan recién al guardar (dependen de cada tarea y cada cuenta).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Input, PageHeader } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import {
  DESCRIPCION_DE_PESO,
  ETIQUETA_DE_TIPO,
  ETIQUETA_DE_TRATO,
  PESOS,
  TIPOS_DE_FASE,
  TIPOS_DE_TRATO,
  semaforoDe,
  type ConfigCarga,
} from "@/lib/carga/config";
import type { ConfigGuardada, PersonaConCuentas } from "@/lib/carga/queries";
import { RUTA_DE_LA_CARGA } from "@/lib/carga/rutas";
import { ENLACE_BLANCO, coma, fechaYHora, horas } from "./piezas";

export interface CoberturaDeVariable {
  con: number;
  total: number;
}


export default function Supuestos({
  configuracion,
  personas,
  coberturaDeVariables,
  tareasPorTipo,
  contenedor,
}: {
  configuracion: ConfigGuardada;
  personas: PersonaConCuentas[];
  coberturaDeVariables: Record<string, CoberturaDeVariable>;
  tareasPorTipo: Record<string, number>;
  contenedor: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [c, setC] = useState<ConfigCarga>(configuracion.config);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cambiado = JSON.stringify(c) !== JSON.stringify(configuracion.config);

  // La misma cuenta que la carga, semana por semana: solo cambian la preparación y las horas disponibles. La entrega
  // y el factor de cada cuenta dependen de cada tarea y cada cuenta: se recalculan al guardar.
  const vista = useMemo(
    () =>
      personas
        .filter((p) => p.semanasEnElEquipo > 0)
        .map((p) => {
          const propia = c.personas[p.email] ?? {};
          const disponible = (propia.horasContrato ?? c.capacidad.horasContrato) * (propia.productiva ?? c.capacidad.productiva);
          const semanas = p.semanas
            .filter((s) => s.enElEquipo)
            .map((s) => ({ horas: s.total - s.preparacion + (s.reunionesConCliente * c.preparacionMin) / 60, disponible }));
          const total = semanas.reduce((a, s) => a + s.horas, 0) / Math.max(1, semanas.length);
          const u = disponible > 0 ? (total / disponible) * 100 : 0;
          return { p, disponible, total, semanas, u: Math.round(u), semaforo: semaforoDe(u, c) };
        }),
    [personas, c],
  );
  const cse = vista.filter((v) => !v.p.esCsl);
  const sumaH = cse.reduce((a, v) => a + v.semanas.reduce((b, s) => b + s.horas, 0), 0);
  const sumaD = cse.reduce((a, v) => a + v.semanas.reduce((b, s) => b + s.disponible, 0), 0);
  const equipo = sumaD > 0 ? Math.round((sumaH / sumaD) * 100) : 0;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await fetch("/api/cs/carga/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valores: c, motivo: motivo.trim() || undefined }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(cuerpo.error ?? "No se pudieron guardar los supuestos.");
      toast.success("Supuestos guardados: la carga se recalcula con estos valores.");
      setMotivo("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron guardar los supuestos.");
    } finally {
      setGuardando(false);
    }
  };

  const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title="Cómo se calcula la carga"
        crumbs={[{ label: "Éxito del cliente", href: "/customer-success" }, { label: "Carga del equipo", href: RUTA_DE_LA_CARGA }, { label: "Cómo se calcula" }]}
        description="Los supuestos del cálculo, a la vista y editables. Los ajustan la CSL y dirección; cada cambio queda con quién y cuándo, y cuenta desde que se guarda."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs text-fg-muted">
              {configuracion.guardadaEn ? `Último cambio: ${fechaYHora(configuracion.guardadaEn)} · ${configuracion.guardadaPor}` : "Último cambio: nunca · valores de fábrica"}
            </span>
            <BotonAzul onClick={guardar} disabled={!cambiado || guardando || configuracion.sinTabla}>
              {guardando ? "Guardando…" : "Guardar los cambios"}
            </BotonAzul>
          </div>
        }
      />

      {configuracion.sinTabla && (
        <Alert variant="warning" title="Todavía no se pueden guardar.">
          Esta base no tiene la tabla de los supuestos (scripts/sql/2026-10-06-config-carga.sql). Puedes mover los valores y ver cómo queda cada persona.
        </Alert>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Bloque titulo="Capacidad">
            <Fila nombre="Horas de contrato por semana" nota="Por persona. Abajo se ajusta quien trabaja a medio tiempo o hace otra cosa">
              <Numero valor={c.capacidad.horasContrato} unidad="h" onCambio={(v) => setC({ ...c, capacidad: { ...c.capacidad, horasContrato: v } })} parse={num} />
            </Fila>
            <Fila nombre="Parte productiva" nota="Lo que queda después de correo, pausas y trámites">
              <Numero valor={Math.round(c.capacidad.productiva * 100)} unidad="%" onCambio={(v) => setC({ ...c, capacidad: { ...c.capacidad, productiva: v / 100 } })} parse={num} />
            </Fila>
            <Fila nombre="Ausencias" nota="Feriados, vacaciones e incapacidades: todavía no se leen. Mientras tanto, se baja la capacidad de esa persona abajo.">
              <span className="text-xs text-fg-muted">Pendiente</span>
            </Fila>
          </Bloque>

          <Bloque titulo="Tiempo fuera de reuniones">
            <Fila nombre="Preparación y seguimiento por reunión con un cliente" nota="Hasta que se pregunte cuánto tomó">
              <Numero valor={c.preparacionMin} unidad="min" onCambio={(v) => setC({ ...c, preparacionMin: v })} parse={num} />
            </Fila>
            <div className="pt-2">
              <span className="block text-[13px] font-semibold text-fg">Horas por tarea del cronograma, antes del factor de la cuenta</span>
              <span className="block text-xs text-fg-muted">Por tipo de fase. Se reemplazan cuando las tareas tengan horas propias</span>
            </div>
            <div className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-3">
              {TIPOS_DE_FASE.map((t) => (
                <label key={t} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-[13px] text-fg">{ETIQUETA_DE_TIPO[t]}</span>
                    <span className="block text-xs text-fg-muted">{tareasPorTipo[t] ?? 0} tareas</span>
                  </span>
                  <Numero valor={c.horasPorTipo[t]} unidad="h" paso={0.5} onCambio={(v) => setC({ ...c, horasPorTipo: { ...c.horasPorTipo, [t]: v } })} parse={num} />
                </label>
              ))}
            </div>
            <Fila nombre="Parte de Smarteam en las tareas «Ambos»" nota="Las de «Cliente» y «Desarrollo» no suman a la carga del CSE">
              <Numero valor={Math.round(c.ambosFraccion * 100)} unidad="%" onCambio={(v) => setC({ ...c, ambosFraccion: v / 100 })} parse={num} />
            </Fila>
          </Bloque>

          <section className="rounded-xl border border-line bg-surface py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-4">
              <h2 className="text-sm font-semibold text-fg">Factor de complejidad</h2>
              <span className="text-xs text-fg-muted">Base 1,0 más estas sumas · tope 3,0</span>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-[13px] leading-[19px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    <th className="px-4 py-2">Variable</th>
                    <th className="px-3 py-2">Cuándo suma</th>
                    <th className="px-3 py-2 text-right">Suma</th>
                    <th className="px-4 py-2 text-right">Cuentas con el dato</th>
                  </tr>
                </thead>
                <tbody>
                  {PESOS.map((p) => {
                    const d = DESCRIPCION_DE_PESO[p];
                    const cob = coberturaDeVariables[d.variable];
                    const completo = cob && cob.con >= cob.total;
                    return (
                      <tr key={p} className="border-b border-line last:border-b-0">
                        <td className="px-4 py-2 font-semibold text-fg">{d.nombre}</td>
                        <td className="px-3 py-2 text-fg-secondary">{d.cuando}</td>
                        <td className="px-3 py-1.5 text-right">
                          <Numero valor={c.pesos[p]} paso={0.05} etiqueta={d.nombre} onCambio={(v) => setC({ ...c, pesos: { ...c.pesos, [p]: v } })} parse={num} />
                        </td>
                        <td className="px-4 py-2 text-right">
                          {cob ? (
                            <span
                              className={cn(
                                "inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11px] font-semibold tabular-nums",
                                completo ? "border-success-line bg-success-surface text-success-ink" : cob.con === 0 ? "border-dashed border-line bg-surface-muted text-fg-muted" : "border-warn-line bg-warn-surface text-warn-ink",
                              )}
                            >
                              {cob.con} de {cob.total}
                            </span>
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <Bloque titulo="Semáforo y señales">
            <Fila nombre="«Llena» desde">
              <Numero valor={c.semaforo.llena} unidad="%" onCambio={(v) => setC({ ...c, semaforo: { ...c.semaforo, llena: v } })} parse={num} />
            </Fila>
            <Fila nombre="«Sobrecarga» desde">
              <Numero valor={c.semaforo.sobrecarga} unidad="%" onCambio={(v) => setC({ ...c, semaforo: { ...c.semaforo, sobrecarga: v } })} parse={num} />
            </Fila>
            <Fila nombre="Señal después de" nota="Semanas seguidas sobre «Sobrecarga» para que la persona aparezca en las señales de la 1:1">
              <Numero valor={c.semanasSenal} unidad="semanas" onCambio={(v) => setC({ ...c, semanasSenal: Math.round(v) })} parse={num} />
            </Fila>
            <Fila nombre="Traspaso de una cuenta" nota="Lo que suma quien la recibe el primer mes">
              <Numero valor={Math.round(c.traspaso * 100)} unidad="%" onCambio={(v) => setC({ ...c, traspaso: v / 100 })} parse={num} />
            </Fila>
          </Bloque>

          <Bloque titulo="Contratación (la ve dirección en Finanzas › Rentabilidad)">
            <Fila nombre="Contratar y formar a un CSE" nota="Para saber con cuánta anticipación avisar">
              <Numero valor={c.semanasParaContratar} unidad="semanas" onCambio={(v) => setC({ ...c, semanasParaContratar: Math.round(v) })} parse={num} />
            </Fila>
            <div className="pt-2">
              <span className="block text-[13px] font-semibold text-fg">Horas por semana que suma un trato ganado</span>
              <span className="block text-xs text-fg-muted">Desde el mes siguiente a su cierre. El tipo se deduce del nombre del trato</span>
            </div>
            <div className="grid gap-2 pt-2 sm:grid-cols-2">
              {TIPOS_DE_TRATO.map((t) => (
                <label key={t} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="text-[13px] text-fg">{ETIQUETA_DE_TRATO[t]}</span>
                  <Numero valor={c.horasPorTrato[t]} unidad="h" paso={0.5} onCambio={(v) => setC({ ...c, horasPorTrato: { ...c.horasPorTrato, [t]: v } })} parse={num} />
                </label>
              ))}
            </div>
          </Bloque>

          <Bloque titulo="Ajustes por persona">
            <p className="pb-1 text-xs text-fg-muted">Vacío = el valor del equipo. Quien trabaja a medio tiempo, está de vacaciones o hace otra cosa se ajusta acá.</p>
            {personas.map((p) => {
              const propia = c.personas[p.email] ?? {};
              const poner = (k: "horasContrato" | "productiva", v: number | undefined) => {
                const nueva = { ...propia, [k]: v };
                if (v === undefined) delete nueva[k];
                const resto = { ...c.personas };
                if (Object.keys(nueva).length === 0) delete resto[p.email];
                else resto[p.email] = nueva;
                setC({ ...c, personas: resto });
              };
              return (
                <div key={p.email} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
                  <span className="text-[13px] font-semibold text-fg">
                    {p.nombre}
                    {p.esCsl && <span className="font-normal text-fg-muted"> · CSL</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <Numero valor={propia.horasContrato ?? null} vacio={String(c.capacidad.horasContrato)} unidad="h" etiqueta={`Horas de contrato de ${p.nombre}`} onCambio={(v) => poner("horasContrato", v)} onVaciar={() => poner("horasContrato", undefined)} parse={num} opcional />
                    <Numero
                      valor={propia.productiva !== undefined ? Math.round(propia.productiva * 100) : null}
                      vacio={String(Math.round(c.capacidad.productiva * 100))}
                      unidad="%"
                      etiqueta={`Parte productiva de ${p.nombre}`}
                      onCambio={(v) => poner("productiva", v / 100)}
                      onVaciar={() => poner("productiva", undefined)}
                      parse={num}
                      opcional
                    />
                  </span>
                </div>
              );
            })}
          </Bloque>

          <Bloque titulo="Por qué cambias los supuestos">
            <label className="block">
              <span className="sr-only">Motivo del cambio</span>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional: queda con el cambio" maxLength={500} />
            </label>
          </Bloque>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6">
          <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-fg">Con estos valores</h2>
              <span className="text-xs text-fg-muted">Promedio de las últimas semanas</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Horas disponibles</span>
              <span className="text-[22px] font-bold tabular-nums text-fg">{horas(c.capacidad.horasContrato * c.capacidad.productiva)}</span>
            </div>
            {vista.map((v) => (
              <div key={v.p.email} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate font-semibold text-fg">{v.p.nombre}</span>
                  <span className={cn("font-semibold tabular-nums", v.semaforo === "sobrecarga" ? "text-danger-ink" : v.semaforo === "llena" ? "text-warn-ink" : "text-success-ink")}>{v.u} %</span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <span className={cn("block h-full", v.semaforo === "sobrecarga" ? "bg-destructive" : v.semaforo === "llena" ? "bg-warning" : "bg-success")} style={{ width: `${Math.min(100, v.u / 1.5)}%` }} />
                </span>
                <span className="block text-xs text-fg-muted">
                  {coma(v.total)} de {coma(v.disponible)} h
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-[13px] font-semibold text-fg">Equipo (sin la CSL)</span>
              <span className="text-[22px] font-bold tabular-nums text-fg">{equipo} %</span>
            </div>
            <p className="text-xs text-fg-muted">La entrega estimada y el factor de cada cuenta se recalculan al guardar.</p>
          </section>

          {configuracion.historia.length > 0 && (
            <section className="space-y-2 rounded-xl bg-surface-muted p-4">
              <h2 className="text-sm font-semibold text-fg">Cambios anteriores</h2>
              <ul className="space-y-1.5 text-xs text-fg-secondary">
                {configuracion.historia.map((h) => (
                  <li key={h.id}>
                    <span className="text-fg">{fechaYHora(h.en)}</span> · {h.por}
                    {h.motivo && <span className="block text-fg-muted">{h.motivo}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Link href={RUTA_DE_LA_CARGA} className={ENLACE_BLANCO}>
            Volver a la carga del equipo
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="pb-1 text-sm font-semibold text-fg">{titulo}</h2>
      {children}
    </section>
  );
}

function Fila({ nombre, nota, children }: { nombre: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-semibold text-fg">{nombre}</span>
        {nota && <span className="text-xs text-fg-muted">{nota}</span>}
      </span>
      <span className="flex-shrink-0">{children}</span>
    </div>
  );
}

/** Un número con su unidad. `opcional`: vacío = sin ajuste (null). */
function Numero({
  valor,
  unidad,
  paso = 1,
  etiqueta,
  vacio,
  opcional = false,
  onCambio,
  onVaciar,
  parse,
}: {
  valor: number | null;
  unidad?: string;
  paso?: number;
  etiqueta?: string;
  vacio?: string;
  opcional?: boolean;
  onCambio: (v: number) => void;
  /** Solo con `opcional`: se vació el campo (vuelve al valor del equipo). */
  onVaciar?: () => void;
  parse: (s: string) => number;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? (valor === null ? "" : String(valor).replace(".", ","));
  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        aria-label={etiqueta}
        inputMode="decimal"
        value={mostrado}
        placeholder={vacio}
        step={paso}
        className="h-[30px] w-20 text-right tabular-nums"
        onChange={(e) => {
          setTexto(e.target.value);
          const v = parse(e.target.value);
          if (e.target.value.trim() === "" && opcional) onVaciar?.();
          else if (Number.isFinite(v)) onCambio(v);
        }}
        onBlur={() => setTexto(null)}
      />
      {unidad && <span className="text-xs text-fg-muted">{unidad}</span>}
    </span>
  );
}

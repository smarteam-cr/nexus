"use client";

/**
 * components/gasto-ia/Proyeccion.tsx — «Proyección» de /integrations/gasto-ia: lo medido en los últimos 30 días por el
 * volumen esperado, con escenarios que se mueven en pantalla y NO se guardan (al recargar vuelven a hoy). La cuenta es
 * `proyectar` (lib/ai/proyeccion.ts, pura y probada); acá solo se mueven los números.
 */
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Interruptor } from "@/components/ui/Interruptor";
import { Button } from "@/components/ui/Button";
import { ESCENARIO_DE_HOY, proyectar, type BaseDeCalculo, type ClaveDeComponente, type Escenario } from "@/lib/ai/proyeccion";
import { numero, pct, usd } from "@/lib/uso/ia";
import GraficoApilado from "./GraficoApilado";
import { nombreDelMes } from "@/lib/ai/gasto-mensual";

const ORDEN: readonly ClaveDeComponente[] = ["reuniones", "hechos", "vigia", "procesos", "venta", "chat", "resto"];

function Numero({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs text-fg-muted">{etiqueta}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{valor}</p>
      {nota && <p className="mt-1 text-xs text-fg-muted">{nota}</p>}
    </Card>
  );
}

function Porcentaje({ etiqueta, valor, onCambio, hint }: { etiqueta: string; valor: number; onCambio: (n: number) => void; hint?: string }) {
  return (
    <Field label={etiqueta} hint={hint}>
      <Input type="number" inputMode="decimal" value={Number.isFinite(valor) ? valor : ""} onChange={(e) => onCambio(e.target.value === "" ? 0 : Number(e.target.value))} />
    </Field>
  );
}

export default function Proyeccion({ base }: { base: BaseDeCalculo }) {
  const deHoy = useMemo(() => ESCENARIO_DE_HOY(base), [base]);
  const [e, setE] = useState<Escenario>(deHoy);
  const cambiar = <K extends keyof Escenario>(k: K, v: Escenario[K]) => setE((x) => ({ ...x, [k]: v }));
  const p = useMemo(() => proyectar(base, e), [base, e]);
  const nombre = new Map(base.componentes.map((c) => [c.clave, c.nombre]));
  const visibles = ORDEN.filter((k) => p.meses.some((m) => m.porComponente[k] > 0));

  const ahorros: { clave: keyof Escenario; titulo: string; detalle: string; fraccion: number; donde: string }[] = [
    { clave: "modelosBaratos", titulo: "Clasificador con Haiku", detalle: "MODELO_DEL_CLASIFICADOR, tras la comparación", fraccion: base.ahorros.modelosBaratos, donde: "de leer cada reunión" },
    { clave: "lotes", titulo: "Lotes (API Batch)", detalle: "el barrido del vigía hoy; el avance y la ficha después", fraccion: base.ahorros.lotesVigia, donde: "del vigía" },
    { clave: "cache", titulo: "Caché compartida", detalle: "el prompt del vigía y la reunión de la lectura con los hechos", fraccion: base.ahorros.prefijoCompartido, donde: "de los hechos" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Numero etiqueta={`Próximos ${p.meses.length} meses`} valor={usd(p.total)} nota={`${usd(p.promedioMensual)} por mes en promedio`} />
        <Numero etiqueta="Lo que ahorran las palancas" valor={usd(p.ahorro)} nota={p.sinAhorros > 0 ? `${pct(p.ahorro / p.sinAhorros)} de ${usd(p.sinAhorros)}` : undefined} />
        <Numero
          etiqueta="Para comparar"
          valor={base.ultimoMesCompleto ? usd(base.ultimoMesCompleto.costo) : "—"}
          nota={base.ultimoMesCompleto ? `lo medido en ${nombreDelMes(base.ultimoMesCompleto.mes)}` : "todavía no hay un mes completo medido"}
        />
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">El escenario</h2>
          <Button size="sm" variant="secondary" onClick={() => setE(deHoy)}>
            Volver a hoy
          </Button>
        </div>
        <p className="text-xs text-fg-muted">Se mueve en pantalla y no se guarda: al recargar vuelve a lo de hoy.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Meses" hint="De 3 a 6">
            <Input type="number" min={3} max={6} value={e.meses} onChange={(x) => cambiar("meses", Number(x.target.value))} />
          </Field>
          <Porcentaje etiqueta="Clientes de más (%)" valor={e.clientesPct} onCambio={(n) => cambiar("clientesPct", n)} hint="Desde el primer mes" />
          <Porcentaje etiqueta="Crecimiento por mes (%)" valor={e.crecimientoMensualPct} onCambio={(n) => cambiar("crecimientoMensualPct", n)} hint="Encima de lo anterior" />
          <Porcentaje etiqueta="Reuniones de más por cliente (%)" valor={e.reunionesPct} onCambio={(n) => cambiar("reunionesPct", n)} />
          <Field label="Servicios recurrentes nuevos" hint="Cada uno suma reuniones y un proyecto al vigía">
            <Input type="number" min={0} value={e.serviciosRecurrentes} onChange={(x) => cambiar("serviciosRecurrentes", Number(x.target.value))} />
          </Field>
          <Field label="Reuniones por mes de cada uno">
            <Input type="number" min={0} value={e.reunionesPorRecurrente} onChange={(x) => cambiar("reunionesPorRecurrente", Number(x.target.value))} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border border-line p-3">
            <Interruptor activo={e.hechos} onCambio={(v) => cambiar("hechos", v)} etiqueta="Hechos de las reuniones" texto={e.hechos ? "Prendidos" : "Apagados"} />
            <p className="text-xs text-fg-muted">
              Los hechos de cada reunión (SEGUIMIENTO_HECHOS). {base.hechosPrendidosHoy ? "Hoy están prendidos." : "Hoy están apagados."}
            </p>
          </div>
          {ahorros.map((a) => (
            <div key={a.clave} className="flex items-start gap-3 rounded-lg border border-line p-3">
              <Interruptor activo={!!e[a.clave]} onCambio={(v) => cambiar(a.clave, v as never)} etiqueta={a.titulo} texto={e[a.clave] ? "Sí" : "No"} />
              <p className="text-xs text-fg-muted">
                <span className="font-medium text-fg-secondary">{a.titulo}</span>: {a.detalle}. Ahorra {pct(a.fraccion)} {a.donde}.
              </p>
            </div>
          ))}
        </div>
      </Card>

      <GraficoApilado
        meses={p.meses.map((m) => m.mes)}
        series={[
          ...visibles.slice(0, 5).map((k) => ({ nombre: nombre.get(k) ?? k, valores: p.meses.map((m) => m.porComponente[k]) })),
          ...(visibles.length > 5 ? [{ nombre: "Lo demás", valores: p.meses.map((m) => visibles.slice(5).reduce((s, k) => s + m.porComponente[k], 0)) }] : []),
        ]}
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2 text-left font-medium">Componente</th>
                {p.meses.map((m) => (
                  <th key={m.mes} className="px-3 py-2 text-right font-medium">
                    {nombreDelMes(m.mes)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((k) => (
                <tr key={k} className="border-b border-line">
                  <td className="px-5 py-2 text-fg-secondary">{nombre.get(k) ?? k}</td>
                  {p.meses.map((m) => (
                    <td key={m.mes} className="px-3 py-2 text-right tabular-nums text-fg">
                      {usd(m.porComponente[k])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="px-5 py-2 font-semibold text-fg">Total</td>
                {p.meses.map((m) => (
                  <td key={m.mes} className="px-3 py-2 text-right font-semibold tabular-nums text-fg">
                    {usd(m.total)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-fg">De dónde sale cada número</h2>
          <p className="mt-1 text-xs text-fg-muted">Costo unitario medido en los últimos 30 días, por el volumen de esos 30 días.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2 text-left font-medium">Componente</th>
                <th className="px-3 py-2 text-right font-medium">Por unidad</th>
                <th className="px-3 py-2 text-right font-medium">Por mes</th>
                <th className="px-5 py-2 text-left font-medium">De dónde sale</th>
              </tr>
            </thead>
            <tbody>
              {base.componentes.map((c) => (
                <tr key={c.clave} className="border-b border-line last:border-0">
                  <td className="px-5 py-2 text-fg-secondary">{c.nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg">
                    {usd(c.costoUnitario)} <span className="text-fg-muted">/ {c.unidad}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-muted">
                    {c.unidad === "mes" ? "—" : `${numero(c.volumenMensual)}`}
                  </td>
                  <td className="px-5 py-2 text-xs text-fg-muted">{c.deDondeSale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

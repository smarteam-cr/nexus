/**
 * /integrations/gasto-ia — CUÁNTO GASTA NEXUS EN CLAUDE. Solo lectura (salvo anotar la factura), SOLO SUPER_ADMIN.
 *
 * Gate igual al de `finanzas/costos`: el redirect corta ANTES de la query, así que ni un byte de gasto entra al payload
 * de un no-SUPER_ADMIN. Es plata, y se trata como tal.
 *
 * Cuatro pestañas (2026-10-18, DECISIONS «El gasto de la IA, por mes»):
 *   · Por mes: la tendencia sin tope de filas (la base suma), el tope diario y los días que lo pasaron, cuánto ahorró la
 *     caché, el costo por reunión leída, por proceso y por cliente.
 *   · Proyección: lo medido en 30 días por el volumen esperado, con escenarios que no se guardan.
 *   · Factura: lo que cobró Anthropic cada mes, anotado a mano, al lado de lo medido.
 *   · Últimos 30 días: la pantalla de antes (por agente y las corridas más caras).
 *
 * Va acá y no en «Uso de Nexus» porque esto es PLATA (lo mira dirección para decidir el gasto y cruzar la factura); Uso
 * de Nexus mira para qué se usa la IA (qué se usa de lo que propone), y ya enlaza acá.
 *
 * ⚠ NO ES CONTABILIDAD. El medidor pierde la fila si la base está caída (decisión escrita en `medidor.ts`: no puede
 * romper una corrida), y lo que no está tarifado no entra al total. Por eso la factura se anota y se compara.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import type { FilaDeGasto } from "@/lib/ai/gasto";
import { datosDelGasto, type DatosDelGasto } from "@/lib/ai/gasto-mensual-server";
import { diasDelMes, finDeMesAlRitmo, nombreDelMes, type MesDeGasto } from "@/lib/ai/gasto-mensual";
import { numero, pct, usd } from "@/lib/uso/ia";
import PestanasDelGasto, { VISTAS_DEL_GASTO, type VistaDelGasto } from "@/components/gasto-ia/PestanasDelGasto";
import GraficoApilado from "@/components/gasto-ia/GraficoApilado";
import Proyeccion from "@/components/gasto-ia/Proyeccion";
import Factura from "@/components/gasto-ia/Factura";
import DetalleDe30Dias, { TOPE_DE_FILAS } from "@/components/gasto-ia/DetalleDe30Dias";

export const dynamic = "force-dynamic";

function Numero({ etiqueta, valor, nota, aviso }: { etiqueta: string; valor: string; nota?: string; aviso?: string | null }) {
  return (
    <Card className="p-5">
      <p className="text-xs text-fg-muted">{etiqueta}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{valor}</p>
      {nota && <p className="mt-1 text-xs text-fg-muted">{nota}</p>}
      {aviso && <p className="mt-2 text-xs text-warn-ink">⚠ {aviso}</p>}
    </Card>
  );
}

function PorMes({ d, ahora }: { d: DatosDelGasto; ahora: Date }) {
  const hoyCr = new Date(ahora.getTime() - 6 * 3_600_000);
  const mesDeHoy = hoyCr.toISOString().slice(0, 7);
  const este: MesDeGasto | undefined = d.meses.find((m) => m.mes === mesDeHoy);
  const anterior = [...d.meses].reverse().find((m) => m.mes < mesDeHoy);
  const alRitmo = este ? finDeMesAlRitmo(este.costo, { dia: hoyCr.getUTCDate(), diasDelMes: diasDelMes(mesDeHoy) }) : null;
  const delMes = este ?? anterior;
  const modo = d.limites.bloquea ? "bloquea" : "solo avisa";
  const sugeridoDistinto = d.sugerido && (d.sugerido.automatico !== d.limites.automatico || d.sugerido.humano !== d.limites.humano);
  const diasAuto = d.meses.reduce((s, m) => s + m.diasSobreElTope.automatico, 0);
  const diasHum = d.meses.reduce((s, m) => s + m.diasSobreElTope.humano, 0);

  if (!d.meses.length) return <p className="text-sm text-fg-muted">Todavía no se midió ninguna llamada.</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          etiqueta={`Este mes (${nombreDelMes(mesDeHoy)})`}
          valor={usd(este?.costo ?? 0)}
          nota={alRitmo !== null ? `Al ritmo de hoy, ${usd(alRitmo)} a fin de mes` : undefined}
          aviso={este?.sinTarifa ? `${numero(este.sinTarifa)} llamadas sin tarifa: no están en el número` : null}
        />
        <Numero etiqueta={anterior ? `El mes pasado (${nombreDelMes(anterior.mes)})` : "El mes pasado"} valor={anterior ? usd(anterior.costo) : "—"} nota={anterior ? `${numero(anterior.llamadas)} llamadas` : undefined} />
        <Numero
          etiqueta="Ahorró la caché este mes"
          valor={usd(este?.ahorroCache ?? 0)}
          nota={este ? `${pct(este.parteDeLaCache)} de la entrada salió de la caché` : undefined}
          aviso={este && este.ahorroCache < 0 ? "Se escribe caché que nadie lee: es un recargo" : null}
        />
        <Numero
          etiqueta="Cada reunión leída"
          valor={delMes?.costoPorReunion != null ? usd(delMes.costoPorReunion) : "—"}
          nota={delMes ? `${numero(delMes.reuniones)} reuniones en ${nombreDelMes(delMes.mes)}, con todo lo que dispara su lectura` : undefined}
        />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-fg">El tope diario</h2>
        <p className="mt-1 text-sm text-fg-secondary">
          Automático: {usd(d.limites.automatico)} por día · humano: {usd(d.limites.humano)} por día · {modo}.
          {` Lo pasaron ${numero(diasAuto)} ${diasAuto === 1 ? "día" : "días"} lo automático y ${numero(diasHum)} lo humano.`}
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          Lo automático (lo que corre solo) frena los jobs que gastan IA aunque el bloqueo esté apagado: esperan al día siguiente.
          Lo humano solo avisa, salvo con PRESUPUESTO_IA_BLOQUEA=1.
        </p>
        {d.sugerido && (
          <p className={`mt-2 text-xs ${sugeridoDistinto ? "text-warn-ink" : "text-fg-muted"}`}>
            {sugeridoDistinto ? "⚠ " : ""}Con lo gastado en los últimos 60 días se sugiere {usd(d.sugerido.automatico)} automático y {usd(d.sugerido.humano)} humano
            {sugeridoDistinto ? " (se cambia en lib/ai/presupuesto.ts o con PRESUPUESTO_IA_*_USD_DIA)." : ": es lo que rige."}
          </p>
        )}
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-fg">Mes a mes</h2>
        <GraficoApilado
          meses={d.meses.map((m) => m.mes)}
          series={[
            { nombre: "Corre solo", valores: d.meses.map((m) => m.costoAutomatico) },
            { nombre: "Lo pidió una persona", valores: d.meses.map((m) => m.costoHumano) },
          ]}
          linea={d.facturas.some((f) => f.facturado !== null) ? { nombre: "Factura de Anthropic", valores: d.meses.map((m) => d.facturas.find((f) => f.mes === m.mes)?.facturado ?? null) } : undefined}
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2 text-left font-medium">Mes</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
                <th className="px-3 py-2 text-right font-medium">Llamadas</th>
                <th className="px-3 py-2 text-right font-medium">Corre solo</th>
                <th className="px-3 py-2 text-right font-medium">Ahorro de la caché</th>
                <th className="px-3 py-2 text-right font-medium">Ahorro por lote</th>
                <th className="px-3 py-2 text-right font-medium">Por reunión</th>
                <th className="px-3 py-2 text-right font-medium">Días sobre el tope</th>
                <th className="px-5 py-2 text-left font-medium">El día más caro</th>
              </tr>
            </thead>
            <tbody>
              {[...d.meses].reverse().map((m) => (
                <tr key={m.mes} className="border-b border-line last:border-0">
                  <td className="px-5 py-2 text-fg-secondary">{nombreDelMes(m.mes)}{m.mes === mesDeHoy ? " (en curso)" : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg">{usd(m.costo)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{numero(m.llamadas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{m.costo > 0 ? pct(m.costoAutomatico / m.costo) : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${m.ahorroCache < 0 ? "text-warn-ink" : "text-fg-muted"}`}>{usd(m.ahorroCache)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{usd(m.ahorroLote)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{m.costoPorReunion != null ? usd(m.costoPorReunion) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-muted">
                    {m.diasSobreElTope.automatico + m.diasSobreElTope.humano ? `${m.diasSobreElTope.automatico} auto · ${m.diasSobreElTope.humano} humano` : "0"}
                  </td>
                  <td className="px-5 py-2 text-fg-muted">{m.diaMasCaro ? `${Number(m.diaMasCaro.dia.slice(8, 10))} · ${usd(m.diaMasCaro.costo)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {delMes && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-fg">Por proceso · {nombreDelMes(delMes.mes)}</h2>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {delMes.procesos.map((p) => (
                  <tr key={p.clave} className="border-b border-line last:border-0">
                    <td className="px-5 py-2 text-fg-secondary">{p.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg">{usd(p.costo)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-fg-muted">
                      {delMes.costo > 0 ? pct(p.costo / delMes.costo) : "—"} · {numero(p.llamadas)} llamadas
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-fg">Por cliente · {nombreDelMes(delMes.mes)}</h2>
              <p className="mt-1 text-xs text-fg-muted">Los 10 que más gastan. La empresa de la llamada, la de su corrida o la dueña de su reunión.</p>
            </div>
            {delMes.clientes.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-muted">Ninguna llamada del mes quedó ubicada en una empresa.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {delMes.clientes.map((c) => (
                    <tr key={c.clientId} className="border-b border-line last:border-0">
                      <td className="px-5 py-2 text-fg-secondary">{c.nombre}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-fg">{usd(c.costo)}</td>
                      <td className="px-5 py-2 text-right tabular-nums text-fg-muted">{numero(c.llamadas)} llamadas</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default async function GastoDeIaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const sp = await searchParams;
  const pedida = typeof sp.vista === "string" ? sp.vista : "mes";
  const vista: VistaDelGasto = (VISTAS_DEL_GASTO as readonly string[]).includes(pedida) ? (pedida as VistaDelGasto) : "mes";
  const ahora = new Date();

  let detalle: FilaDeGasto[] | null = null;
  let datos: DatosDelGasto | null = null;
  if (vista === "detalle") {
    // La pantalla de antes: lee hasta TOPE_DE_FILAS y suma en memoria.
    detalle = await prisma.llmCall
      .findMany({
        where: { at: { gte: new Date(ahora.getTime() - 30 * 86_400_000) } },
        orderBy: { at: "desc" },
        take: TOPE_DE_FILAS,
        select: { at: true, model: true, ok: true, costUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheCreationTokens: true, agentSlug: true, agentRunId: true, triggeredByEmail: true, origen: true },
      })
      .catch(() => null);
  } else {
    datos = await datosDelGasto(ahora);
  }
  const faltaLaTabla = vista === "detalle" ? detalle === null : !!datos?.faltaLaTabla;
  const porRevisar = datos?.facturas.filter((f) => f.revisar).length ?? 0;
  const mesPasado = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Gasto en IA"
        description="Lo que cuesta Claude, mes a mes, hacia adelante y contra la factura. Medido con la tarifa publicada: se cruza contra la consola de Anthropic."
        backHref="/integrations"
        backLabel="Integraciones"
      />
      <div className="space-y-6">
        <PestanasDelGasto vista={vista} facturasPorRevisar={porRevisar} />
        {faltaLaTabla ? (
          <Alert variant="warning" title="El libro del medidor todavía no existe en esta base">
            Falta correr la migración <code>scripts/sql/2026-08-17-llm-call.sql</code>.
          </Alert>
        ) : (
          <>
            {datos?.faltaElSqlDeHoy && vista !== "factura" && (
              <Alert variant="warning" title="Falta el SQL del 18 de octubre">
                Sin <code>scripts/sql/2026-10-18-gasto-de-ia.sql</code> no se distinguen los pedidos por lote ni se anotan facturas. Lo demás se ve igual.
              </Alert>
            )}
            {vista === "mes" && datos && <PorMes d={datos} ahora={ahora} />}
            {vista === "proyeccion" && datos && (datos.base ? <Proyeccion base={datos.base} /> : <p className="text-sm text-fg-muted">No se pudo medir la base de la proyección.</p>)}
            {vista === "factura" && datos && <Factura filas={datos.facturas} mesSugerido={mesPasado} faltaElSql={datos.faltaElSqlDeHoy} />}
            {vista === "detalle" && detalle && <DetalleDe30Dias filas={detalle} ahora={ahora} />}
          </>
        )}
      </div>
      <p className="mt-6 text-xs text-fg-muted">
        El medidor arrancó el 17 de agosto de 2026 y anota una fila por llamada a Claude. Los precios están en <code>lib/ai/precios.ts</code>, con la
        fecha en que se verificaron; las palancas de ahorro, en <code>lib/ai/ahorro.ts</code>.
      </p>
    </div>
  );
}

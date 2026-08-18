/**
 * /settings/gasto-ia — CUÁNTO ESTÁ GASTANDO NEXUS EN CLAUDE. Solo lectura, SOLO SUPER_ADMIN.
 *
 * Gate igual al de `finanzas/costos`: el redirect corta ANTES de la query, así que ni un byte de
 * gasto entra al payload de un no-SUPER_ADMIN. Es plata, y se trata como tal.
 *
 * ── LO QUE ESTA PANTALLA CONVIERTE EN DECISIÓN ───────────────────────────────
 * El medidor (`lib/ai/medidor.ts`) escribe una fila por llamada desde el 2026-08-17. Sin una
 * pantalla, ese dato existe y nadie lo mira: el punto de medir es poder decidir —qué agente sale
 * caro, qué se disparó solo, si algo entró en loop— antes de que llegue la factura.
 *
 * ⚠ NO ES CONTABILIDAD. El medidor pierde la fila si la base está caída (decisión escrita en
 * `medidor.ts`: no puede romper una corrida), y lo que no está tarifado no entra al total. Estos
 * números se cruzan contra la consola de Anthropic, no la reemplazan. Por eso cada bloque que
 * puede estar incompleto lo dice en la propia pantalla en vez de mostrar un total redondo.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { formatearUsd } from "@/lib/ai/precios";
import { resumirGasto, type FilaDeGasto, type TotalesDeGasto } from "@/lib/ai/gasto";

export const dynamic = "force-dynamic";

/** Tope de filas leídas. Si se alcanza, la pantalla lo dice: un total recortado en silencio miente. */
const TOPE_DE_FILAS = 20_000;

const miles = (n: number) => n.toLocaleString("es-CR");

function Numero({ etiqueta, total }: { etiqueta: string; total: TotalesDeGasto }) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide text-fg-muted">{etiqueta}</p>
      <p className="mt-1 text-3xl font-bold text-fg tabular-nums">{formatearUsd(total.costoUsd)}</p>
      <p className="mt-1 text-sm text-fg-muted">
        {miles(total.llamadas)} {total.llamadas === 1 ? "llamada" : "llamadas"}
        {total.fallidas > 0 && ` · ${miles(total.fallidas)} con error`}
      </p>
      {total.sinTarifa > 0 && (
        <p className="mt-2 text-xs text-warn-ink">
          ⚠ {miles(total.sinTarifa)} de esas llamadas usan un modelo sin tarifa cargada: su costo NO
          está en este número.
        </p>
      )}
    </Card>
  );
}

export default async function GastoDeIaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const ahora = new Date();
  const desde30 = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);

  // La tabla `LlmCall` llega por migración aditiva (scripts/sql/2026-08-17-llm-call.sql). Si el
  // deploy corrió antes que el SQL, esta pantalla explica qué falta en vez de tirar un 500.
  let filas: FilaDeGasto[] | null = null;
  try {
    filas = await prisma.llmCall.findMany({
      where: { at: { gte: desde30 } },
      orderBy: { at: "desc" },
      take: TOPE_DE_FILAS,
      select: {
        at: true,
        model: true,
        ok: true,
        costUsd: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheCreationTokens: true,
        agentSlug: true,
        agentRunId: true,
        triggeredByEmail: true,
        origen: true,
      },
    });
  } catch {
    filas = null;
  }

  if (!filas) {
    return (
      <div className={SHELL_DEFAULT}>
        <PageHeader
          title="Gasto en IA"
          description="Lo que cuesta cada llamada a Claude"
          backHref="/settings"
          backLabel="Configuración"
        />
        <Alert variant="warning" title="El libro del medidor todavía no existe en esta base">
          Falta correr la migración <code>scripts/sql/2026-08-17-llm-call.sql</code>. Es aditiva
          (crea una tabla nueva) y se puede aplicar antes o después del deploy.
        </Alert>
      </div>
    );
  }

  const r = resumirGasto(filas, ahora);
  const recortado = filas.length >= TOPE_DE_FILAS;
  const total30 = r.ultimos30.costoUsd;
  const pct = (usd: number) => (total30 > 0 ? Math.round((usd / total30) * 100) : 0);

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Gasto en IA"
        description="Lo que cuesta cada llamada a Claude. Solo lectura — se cruza contra la consola de Anthropic, no la reemplaza."
        backHref="/settings"
        backLabel="Configuración"
      />

      {recortado && (
        <Alert variant="warning" className="mb-4" title="La lectura llegó al tope">
          Se leyeron las {miles(TOPE_DE_FILAS)} llamadas más recientes de los últimos 30 días. Los
          totales de abajo cubren solo esas: el gasto real del período es mayor.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Numero etiqueta="Hoy" total={r.hoy} />
        <Numero etiqueta="Últimos 7 días" total={r.ultimos7} />
        <Numero etiqueta="Últimos 30 días" total={r.ultimos30} />
      </div>

      {/* ── El corte que decide contra qué presupuesto se cobra ──────────────── */}
      <Card className="mt-6 p-5">
        <p className="text-sm font-semibold text-fg">Quién lo disparó · últimos 30 días</p>
        <p className="mt-1 text-xs text-fg-muted">
          Lo automático es lo que puede dispararse solo (watchdog, post-proceso, crons). Lo que no
          quedó atribuido cuenta como automático a propósito: el olvido se cobra a la vara corta.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-fg-muted">Alguien apretó un botón</p>
            <p className="mt-1 text-xl font-bold text-fg tabular-nums">
              {formatearUsd(r.ultimos30.costoHumano)}{" "}
              <span className="text-sm font-normal text-fg-muted">
                ({pct(r.ultimos30.costoHumano)}%)
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-fg-muted">Lo disparó el sistema</p>
            <p className="mt-1 text-xl font-bold text-fg tabular-nums">
              {formatearUsd(r.ultimos30.costoAutomatico)}{" "}
              <span className="text-sm font-normal text-fg-muted">
                ({pct(r.ultimos30.costoAutomatico)}%)
              </span>
            </p>
          </div>
        </div>
      </Card>

      {/* ── Por agente ───────────────────────────────────────────────────────── */}
      <Card className="mt-6">
        <div className="border-b border-line px-5 py-4">
          <p className="text-sm font-semibold text-fg">Por agente · últimos 30 días</p>
        </div>
        {r.porAgente.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">Todavía no se midió ninguna llamada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 text-left font-medium">Agente</th>
                  <th className="px-5 py-2 text-right font-medium">Costo</th>
                  <th className="px-5 py-2 text-right font-medium">Llamadas</th>
                  <th className="px-5 py-2 text-right font-medium">Entrada</th>
                  <th className="px-5 py-2 text-right font-medium">Salida</th>
                </tr>
              </thead>
              <tbody>
                {r.porAgente.map((a) => (
                  <tr key={a.agentSlug ?? "__sin__"} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 text-fg-secondary">
                      {a.agentSlug ?? <span className="text-fg-muted italic">sin atribuir</span>}
                      {a.sinTarifa > 0 && (
                        <span className="ml-2 text-xs text-warn-ink">
                          ⚠ {miles(a.sinTarifa)} sin tarifa
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                      {formatearUsd(a.costoUsd)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                      {miles(a.llamadas)}
                      {a.fallidas > 0 && (
                        <span className="text-danger-ink"> · {miles(a.fallidas)} con error</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                      {miles(a.tokensEntrada)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                      {miles(a.tokensSalida)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Las corridas más caras ───────────────────────────────────────────── */}
      <Card className="mt-6">
        <div className="border-b border-line px-5 py-4">
          <p className="text-sm font-semibold text-fg">Las corridas más caras · últimos 30 días</p>
          {/* ⚠ Sin esta línea la tabla se lee como si fuera el gasto entero, y hoy la mayoría de
              los caminos que llaman a Claude no crean una corrida. */}
          <p className="mt-1 text-xs text-fg-muted">
            {r.llamadasSinCorrida > 0
              ? `⚠ Esta tabla NO cubre todo: ${formatearUsd(r.costoSinCorrida)} (${pct(r.costoSinCorrida)}%) salió de ${miles(r.llamadasSinCorrida)} llamadas que no cuelgan de ninguna corrida.`
              : "Todas las llamadas del período cuelgan de una corrida."}
          </p>
        </div>
        {r.corridasCaras.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">Ninguna corrida medida todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 text-left font-medium">Cuándo</th>
                  <th className="px-5 py-2 text-left font-medium">Agente</th>
                  <th className="px-5 py-2 text-left font-medium">Quién</th>
                  <th className="px-5 py-2 text-right font-medium">Llamadas</th>
                  <th className="px-5 py-2 text-right font-medium">Costo</th>
                </tr>
              </thead>
              <tbody>
                {r.corridasCaras.map((c) => (
                  <tr key={c.agentRunId} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 whitespace-nowrap text-fg-muted">
                      {c.desde.toLocaleString("es-CR", {
                        timeZone: "America/Costa_Rica",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-5 py-2.5 text-fg-secondary">
                      {c.agentSlug ?? <span className="text-fg-muted italic">sin atribuir</span>}
                    </td>
                    <td className="px-5 py-2.5 text-fg-muted">
                      {c.triggeredByEmail ?? <span className="italic">el sistema</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                      {miles(c.llamadas)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                      {formatearUsd(c.costoUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-6 text-xs text-fg-muted">
        El medidor arrancó el 17 de agosto de 2026 y anota una fila por llamada a Claude. Los precios
        se verificaron ese día contra la tarifa publicada; si Anthropic cambia una, este total deja
        de ser cierto sin que nada falle. Ver <code>lib/ai/precios.ts</code>.
      </p>
    </div>
  );
}

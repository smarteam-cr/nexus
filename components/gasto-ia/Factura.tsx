"use client";

/**
 * components/gasto-ia/Factura.tsx — «Factura» de /integrations/gasto-ia: anotar cada mes lo que cobró Anthropic (de la
 * consola de facturación) y verlo al lado de lo que midió Nexus. La comparación es `compararConLaFactura`
 * (lib/ai/gasto-mensual.ts): más del 10 % y más de US$5 de diferencia piden revisar los precios o filas perdidas.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui";
import type { ComparacionConLaFactura } from "@/lib/ai/gasto-mensual";
import { pct, usd } from "@/lib/uso/ia";
import { nombreDelMes } from "@/lib/ai/gasto-mensual";
import { parseCantidad } from "@/lib/landing/money";

export default function Factura({ filas, mesSugerido, faltaElSql }: { filas: ComparacionConLaFactura[]; mesSugerido: string; faltaElSql: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [mes, setMes] = useState(mesSugerido);
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function enviar(metodo: "POST" | "DELETE", cuerpo: object) {
    setGuardando(true);
    try {
      const r = await fetch("/api/integrations/gasto-ia/factura", { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar.");
      toast.success(metodo === "POST" ? "Factura anotada." : "Factura borrada.");
      if (metodo === "POST") setMonto("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  // «1.234,56», «1,234.56» y «1234.56» son lo mismo (prueba 67): el último separador es decimal si lo siguen 1 o 2 dígitos.
  const montoNum = parseCantidad(monto) ?? Number.NaN;
  return (
    <div className="space-y-6">
      {faltaElSql && (
        <Alert variant="warning" title="Falta el SQL de hoy">
          Para anotar facturas hay que correr <code>scripts/sql/2026-10-18-gasto-de-ia.sql</code>. Lo medido se ve igual.
        </Alert>
      )}
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Anotar la factura de un mes</h2>
          <p className="mt-1 text-xs text-fg-muted">
            El total en dólares de la consola de Anthropic (Billing). Volver a anotar un mes lo corrige.
          </p>
        </div>
        <form
          className="grid gap-4 sm:grid-cols-[10rem_10rem_1fr_auto] sm:items-end"
          onSubmit={(ev) => {
            ev.preventDefault();
            void enviar("POST", { mes, montoUsd: montoNum, notas: notas.trim() || null });
          }}
        >
          <Field label="Mes">
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} required />
          </Field>
          <Field label="Monto (US$)">
            <Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0,00" required />
          </Field>
          <Field label="Notas">
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" maxLength={500} />
          </Field>
          <Button type="submit" variant="primary" loading={guardando} disabled={faltaElSql || !mes || !monto || !Number.isFinite(montoNum)}>
            Anotar
          </Button>
        </form>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-fg">Lo medido contra lo facturado</h2>
          <p className="mt-1 text-xs text-fg-muted">
            Lo medido es la suma de cada llamada con la tarifa publicada. Si se aleja de la factura, hay un precio viejo en
            lib/ai/precios.ts o llamadas que el medidor no anotó.
          </p>
        </div>
        {filas.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">Todavía no hay meses medidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 text-left font-medium">Mes</th>
                  <th className="px-3 py-2 text-right font-medium">Medido</th>
                  <th className="px-3 py-2 text-right font-medium">Facturado</th>
                  <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {[...filas].reverse().map((f) => (
                  <tr key={f.mes} className="border-b border-line last:border-0">
                    <td className="px-5 py-2 text-fg-secondary">{nombreDelMes(f.mes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg">{usd(f.medido)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg">{f.facturado === null ? <span className="text-fg-muted">sin anotar</span> : usd(f.facturado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {f.diferencia === null ? (
                        <span className="text-fg-muted">—</span>
                      ) : (
                        <span className={f.revisar ? "text-warn-ink" : "text-fg-muted"}>
                          {f.revisar ? "⚠ " : ""}
                          {f.diferencia >= 0 ? "+" : "−"}
                          {usd(Math.abs(f.diferencia))}
                          {f.parte !== null ? ` (${pct(Math.abs(f.parte))})` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-right">
                      {f.facturado !== null && (
                        <Button size="sm" variant="destructive" disabled={guardando} onClick={() => void enviar("DELETE", { mes: f.mes })}>
                          Borrar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

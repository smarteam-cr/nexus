/**
 * components/finanzas/PlanDeCobranzaPanel.tsx
 *
 * El cuerpo de /finanzas/plan-de-cobranza. Sin estado ni "use client": es una página para leer, y
 * se arma en el servidor con los textos de lib/finanzas/plan-de-cobranza.ts y los tres números que
 * trae la página.
 *
 * ⚠ Los textos NO se escriben acá: viven en el módulo tipado, donde un test fija que cada renglón
 * de «qué hace ahora» esté sostenido por algo commiteado. Un texto suelto en el JSX prometería sin
 * que nada lo vigile.
 */
import { PageHeader } from "@/components/ui";
import { fmtFecha } from "@/components/cobranza/format";
import { cn } from "@/lib/cn";
import { crDateParts } from "@/lib/jobs/time";
import {
  DECISIONES,
  DESCRIPCION,
  NO_SE_PUDO_LEER,
  NUMEROS_EN_VIVO,
  PERSONAS,
  QUE_HACE_AHORA,
  SIN_TAREAS,
  TAREAS,
  TITULO,
} from "@/lib/finanzas/plan-de-cobranza";
import type { EstadoDelPlan } from "@/lib/finanzas/plan-de-cobranza-vivo";

interface Numero {
  etiqueta: string;
  valor: string;
  detalle: string;
  enRojo: boolean;
}

/** Mismo corte que INV31: horas mientras son pocas, días después. */
function hace(horas: number): string {
  return horas < 48 ? `Hace ${horas} h` : `Hace ${Math.floor(horas / 24)} días`;
}

function numerosDe(vivo: EstadoDelPlan): Numero[] {
  const { espejo, facturas, verdes } = NUMEROS_EN_VIVO;
  const e = vivo.espejo;
  return [
    e === null
      ? { etiqueta: espejo.etiqueta, valor: "—", detalle: NO_SE_PUDO_LEER, enRojo: false }
      : {
          etiqueta: espejo.etiqueta,
          // El día de Costa Rica, no el de UTC: una corrida de la noche caería en el día siguiente.
          valor: e.ultimaBuenaISO ? fmtFecha(crDateParts(new Date(e.ultimaBuenaISO)).dateKey) : espejo.nunca,
          detalle: [
            e.horasDesdeLaUltimaBuena !== null ? `${hace(e.horasDesdeLaUltimaBuena)}.` : null,
            e.vencido ? espejo.vencido : espejo.alDia,
          ]
            .filter(Boolean)
            .join(" "),
          enRojo: e.vencido,
        },
    {
      etiqueta: facturas.etiqueta,
      valor: vivo.facturas ? `${vivo.facturas.conCuenta} de ${vivo.facturas.vigentes}` : "—",
      detalle: vivo.facturas ? facturas.detalle : NO_SE_PUDO_LEER,
      enRojo: false,
    },
    {
      etiqueta: verdes.etiqueta,
      valor: vivo.verdes ? `${vivo.verdes.deImportacion} de ${vivo.verdes.cobrados}` : "—",
      detalle: vivo.verdes ? verdes.detalle : NO_SE_PUDO_LEER,
      enRojo: false,
    },
  ];
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
      {children}
    </section>
  );
}

export default function PlanDeCobranzaPanel({ vivo }: { vivo: EstadoDelPlan }) {
  return (
    <>
      <PageHeader title={TITULO} description={DESCRIPCION} />

      <div className="max-w-3xl space-y-8">
        <Seccion titulo="Qué hace Nexus ahora">
          <ol className="space-y-2">
            {QUE_HACE_AHORA.map((c) => (
              <li key={c.titulo} className="rounded-lg border border-line bg-surface px-4 py-3">
                <p className="text-sm font-medium text-fg">{c.titulo}</p>
                <p className="mt-0.5 text-sm text-fg-secondary">{c.consecuencia}</p>
                {c.espera && <p className="mt-1.5 text-xs text-fg-muted">{c.espera}</p>}
              </li>
            ))}
          </ol>
        </Seccion>

        <Seccion titulo="Lo que falta y quién lo hace">
          <div className="grid gap-2 md:grid-cols-3">
            {numerosDe(vivo).map((n) => (
              /* ⚠ En rojo, todo el texto va con la tinta de la variante: el gris del tema pierde
                 contraste sobre el tinte (mismo criterio que <Alert>). */
              <div
                key={n.etiqueta}
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  n.enRojo ? "border-danger-line bg-danger-surface" : "border-line bg-surface",
                )}
              >
                <p className={cn("text-xs", n.enRojo ? "text-danger-ink" : "text-fg-muted")}>{n.etiqueta}</p>
                <p className={cn("text-lg font-semibold", n.enRojo ? "text-danger-ink" : "text-fg")}>{n.valor}</p>
                <p className={cn("text-xs", n.enRojo ? "text-danger-ink" : "text-fg-muted")}>{n.detalle}</p>
              </div>
            ))}
          </div>

          <div className="space-y-4 pt-1">
            {PERSONAS.map((p) => {
              const suyas = TAREAS.filter((t) => t.quien === p.quien);
              return (
                <div key={p.quien}>
                  <p className="text-sm font-medium text-fg">
                    {p.quien} <span className="font-normal text-fg-muted">· {p.rol}</span>
                  </p>
                  {suyas.length === 0 ? (
                    <p className="mt-1 text-sm text-fg-muted">{SIN_TAREAS}</p>
                  ) : (
                    <ul className="mt-1 list-disc space-y-1.5 pl-5">
                      {suyas.map((t) => (
                        <li key={t.que} className="text-sm text-fg-secondary">
                          {t.que}
                          {t.espera && <span className="block text-xs text-fg-muted">{t.espera}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Seccion>

        <Seccion titulo="Lo que espera una decisión">
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {DECISIONES.map((d) => (
              <li key={d.pregunta} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 flex-shrink-0 rounded-full border border-line px-2 py-0.5 text-2xs text-fg-muted">
                  {d.quien}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-fg">{d.pregunta}</p>
                  <p className="text-xs text-fg-muted">{d.mientras}</p>
                </div>
              </li>
            ))}
          </ul>
        </Seccion>
      </div>
    </>
  );
}

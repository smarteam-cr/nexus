"use client";

/**
 * components/carga/QueDatosHay.tsx — «Qué datos hay, qué falta y cómo se construye»: lo que el cálculo de la carga ya
 * puede usar y lo que falta para que sea cada vez más exacto. Cada fila sale de lo medido en la base; «Volver a medir»
 * la vuelve a leer.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PageHeader } from "@/components/ui";
import { BotonAzul } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import type { FilaDeCobertura } from "@/lib/carga/cobertura";
import { RUTA_DE_LA_CARGA } from "@/lib/carga/rutas";
import { ENLACE_BLANCO, fechaYHora } from "./piezas";

const ESTADO = {
  tenemos: { texto: "Tenemos", clase: "border-success-line bg-success-surface text-success-ink" },
  parcial: { texto: "Parcial", clase: "border-warn-line bg-warn-surface text-warn-ink" },
  falta: { texto: "Falta", clase: "border-dashed border-line bg-surface-muted text-fg-muted" },
} as const;

/** Lo que se suma al modelo de datos para pasar de estimado a medido. Todo aditivo. */
const MODELO: Array<{ campo: string; para: string; tipo: string }> = [
  { campo: "TimelineTask.horasEstimadas", para: "Horas de la tarea. Vacío = el supuesto por tipo de fase.", tipo: "Columna nueva" },
  { campo: "TimelineTask.horasReales · horasRealesPor · horasRealesEn", para: "Lo que respondió quien la marcó como hecha.", tipo: "Columnas nuevas" },
  { campo: "TimelineTask.responsableEmail", para: "Quién la hace, cuando no es el dueño del proyecto.", tipo: "Columna nueva" },
  { campo: "UseCase.horasEstimadas · semanas", para: "Para proyectar el pipeline y estimar el margen al vender.", tipo: "Columnas nuevas" },
  { campo: "CapacidadPersona", para: "Horas de contrato, parte productiva y para cuentas, con fecha desde y hasta.", tipo: "Tabla nueva" },
  { campo: "TiempoDeclarado", para: "Persona, cuenta, tarea o documento, minutos y de dónde vino.", tipo: "Tabla nueva" },
  { campo: "AsistenciaMeet", para: "Minutos conectados por persona y reunión, del registro de Meet.", tipo: "Tabla nueva" },
];

const ETAPAS: Array<{ n: string; titulo: string; items: string[]; mueve: string }> = [
  { n: "Etapa 1", titulo: "Con lo que ya hay", items: ["La carga del equipo para la 1:1", "Los supuestos editables", "Esta lista de datos"], mueve: "La utilización por persona desde la primera semana." },
  { n: "Etapa 2", titulo: "Medir", items: ["La asistencia real de Meet", "La pregunta al marcar una tarea y al publicar un documento", "Los bloques de ejecución del calendario"], mueve: "Lo estimado pasa a declarado o medido." },
  { n: "Etapa 3", titulo: "Horas en el plan", items: ["Horas por tarea y por caso de uso", "Las horas planeadas congeladas al aprobar", "El margen real contra el estimado"], mueve: "El margen real por cuenta." },
  { n: "Etapa 4", titulo: "Proyección y contratación", items: ["Pipeline × probabilidad × horas del caso", "La señal de contratación con confirmación", "El registro de la decisión"], mueve: "Nexus propone; dirección decide." },
];

export default function QueDatosHay({
  filas,
  resumen,
  medidoEn,
  supuestosGuardables,
  contenedor,
}: {
  filas: FilaDeCobertura[];
  resumen: { tenemos: number; parcial: number; falta: number; total: number };
  medidoEn: string;
  supuestosGuardables: boolean;
  contenedor: string;
}) {
  const router = useRouter();
  const [midiendo, iniciar] = useTransition();
  const pct = (x: number) => (resumen.total ? (x / resumen.total) * 100 : 0);

  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title="Qué datos hay, qué falta y cómo se construye"
        crumbs={[{ label: "Éxito del cliente", href: "/customer-success" }, { label: "Carga del equipo", href: RUTA_DE_LA_CARGA }, { label: "Qué datos hay" }]}
        description="Lo que el cálculo ya puede usar y lo que falta para que cada vez sea más exacto. Cada vez que se mide, los números salen de la base."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs text-fg-muted">Medido el {fechaYHora(medidoEn)}</span>
            <BotonAzul onClick={() => iniciar(() => router.refresh())} disabled={midiendo}>
              {midiendo ? "Midiendo…" : "Volver a medir"}
            </BotonAzul>
          </div>
        }
      />

      <section className="space-y-2.5 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">Qué tan completo está el cálculo</h2>
          <span className="text-[13px] text-fg-secondary">
            {resumen.tenemos} de {resumen.total} datos completos · {resumen.parcial} parciales · {resumen.falta} faltan
          </span>
        </div>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-muted">
          <span className="bg-success" style={{ width: `${pct(resumen.tenemos)}%` }} />
          <span className="bg-warning" style={{ width: `${pct(resumen.parcial)}%` }} />
          <span className="border border-dashed border-fg-muted bg-surface-muted" style={{ width: `${pct(resumen.falta)}%` }} />
        </div>
        <p className="text-xs text-fg-muted">Cuando un dato pasa de «Falta» a «Parcial» o a «Tenemos», el cálculo lo empieza a usar solo y deja de decir «estimado» donde ya no lo es.</p>
      </section>

      <section className="rounded-xl border border-line bg-surface py-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] leading-[19px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                <th className="px-4 py-2">Pieza</th>
                <th className="px-3 py-2">Dato</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Hoy</th>
                <th className="px-4 py-2">Lo que falta</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.pieza}·${f.dato}`} className="border-b border-line align-top last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-fg-muted">{f.pieza}</td>
                  <td className="min-w-[180px] px-3 py-2.5 font-semibold text-fg">{f.dato}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold", ESTADO[f.estado].clase)}>{ESTADO[f.estado].texto}</span>
                  </td>
                  <td className="min-w-[280px] px-3 py-2.5 text-fg-secondary">{f.hoy}</td>
                  <td className="min-w-[220px] px-4 py-2.5 text-fg-secondary">{f.falta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Lo que se suma al modelo de datos</h2>
          <p className="text-xs text-fg-muted">Todo aditivo: nada existente cambia ni se borra.</p>
          <ul>
            <li className="flex items-start justify-between gap-3 border-b border-line py-2">
              <span className="min-w-0">
                <span className="block font-mono text-xs text-fg">ConfigCarga</span>
                <span className="block text-xs text-fg-secondary">Los supuestos y los pesos del factor, con quién los cambió y cuándo.</span>
              </span>
              <Chip ok={supuestosGuardables}>{supuestosGuardables ? "Ya está" : "Falta su SQL"}</Chip>
            </li>
            {MODELO.map((m) => (
              <li key={m.campo} className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-b-0">
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-fg">{m.campo}</span>
                  <span className="block text-xs text-fg-secondary">{m.para}</span>
                </span>
                <Chip>{m.tipo}</Chip>
              </li>
            ))}
          </ul>
        </section>
        <section className="space-y-3 rounded-xl bg-surface-muted p-4">
          <h2 className="text-sm font-semibold text-fg">El plan</h2>
          {ETAPAS.map((e) => (
            <div key={e.n} className="space-y-1 rounded-lg border border-line bg-surface p-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{e.n}</span>
              <span className="block text-[13px] font-semibold text-fg">{e.titulo}</span>
              <ul className="list-disc pl-[18px] text-xs text-fg-secondary">
                {e.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <span className="block text-xs text-fg-muted">Mueve: {e.mueve}</span>
            </div>
          ))}
          <Link href={RUTA_DE_LA_CARGA} className={ENLACE_BLANCO}>
            Volver a la carga del equipo
          </Link>
        </section>
      </div>
    </div>
  );
}

function Chip({ children, ok = false }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] flex-shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold",
        ok ? "border-success-line bg-success-surface text-success-ink" : "border-line bg-surface text-fg-secondary",
      )}
    >
      {children}
    </span>
  );
}

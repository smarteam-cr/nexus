"use client";

/**
 * components/rentabilidad/LecturaDeLosNumeros.tsx — Rentabilidad › Lectura de los números (iniciativa C de
 * docs/roadmap.md). SOLO DIRECCIÓN.
 *
 * Nexus detecta lo que no progresa (la solvencia, el margen de una cuenta, las horas sin facturar, la meta) y propone
 * qué hacer y cuánto invertir. Una persona la usa o la desestima: solo lo usado vale. Corre a mano («Leer los números»)
 * o una vez por mes, el día 4. Cada corrida queda medida en Uso de Nexus (familia «Finanzas»).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, BotonUsar, FilaSugerida, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { rutaDelMargenDeLaCuenta } from "@/lib/carga/rutas";
import { ETIQUETA_DE_SENAL } from "@/lib/rentabilidad/lectura/senales";
import type { LecturaDeLosNumeros as Datos, PropuestaParaVer } from "@/lib/rentabilidad/lectura/servidor";

const miles = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dia = (iso: string) => {
  const d = new Date(Date.parse(iso) - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export default function LecturaDeLosNumeros({ datos }: { datos: Datos }) {
  const router = useRouter();
  const toast = useToast();
  const [leyendo, setLeyendo] = useState(false);
  const pendientes = datos.propuestas.filter((p) => p.estado === "pendiente" || p.estado === "vencido");
  const decididas = datos.propuestas.filter((p) => p.estado === "usado" || p.estado === "desestimado");

  const leer = async () => {
    setLeyendo(true);
    toast.info("Leyendo los números: puede tardar un minuto.");
    try {
      const r = await fetch("/api/cobranza/costos/lectura", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string; resultado?: { senales: number; nuevas: number } };
      if (!r.ok || !j.resultado) throw new Error(j.error ?? "No se pudo leer los números.");
      toast.success(
        j.resultado.senales === 0 ? "No hay nada que no progrese: no se llamó al modelo." : `${j.resultado.senales} señales · ${j.resultado.nuevas} propuestas nuevas.`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer los números.");
    } finally {
      setLeyendo(false);
    }
  };

  if (!datos.disponible) {
    return (
      <Alert variant="info" title="Falta el SQL de la lectura">
        Aplica scripts/sql/2026-10-18-rentabilidad-conectada.sql para guardar lo que propone la lectura de los números.
      </Alert>
    );
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-fg">Lo que Nexus propone</h2>
            <p className="text-xs text-fg-muted">Nexus detecta, una persona valida: lo pendiente no vale hasta que alguien lo usa.</p>
          </div>
          <BotonAzul onClick={leer} disabled={leyendo}>
            {leyendo ? "Leyendo…" : "Leer los números"}
          </BotonAzul>
        </div>
        {pendientes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-fg-muted">
            No hay propuestas pendientes. «Leer los números» las busca ahora; si no, Nexus lee solo el día 4 de cada mes.
          </p>
        ) : (
          <ul className="space-y-2">
            {pendientes.map((p) => (
              <Propuesta key={p.id} p={p} />
            ))}
          </ul>
        )}
        {decididas.length > 0 && (
          <div className="space-y-1.5 pt-2">
            <p className={ROTULO_DEL_SISTEMA}>Decidido en los últimos 90 días</p>
            <ul className="space-y-1 text-[13px] text-fg-secondary">
              {decididas.map((p) => (
                <li key={p.id} className="flex flex-wrap gap-x-2">
                  <span className="font-semibold text-fg">{p.titulo}</span>
                  <span className="text-fg-muted">
                    {p.estado === "usado" ? "Usada" : "Desestimada"} por {p.decididaPor} el {p.decididaAt ? dia(p.decididaAt) : "—"}
                    {p.motivo ? ` · ${p.motivo}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <aside className="space-y-3">
        <section className="space-y-2 rounded-xl bg-surface-muted p-4 text-[13px] leading-[19px] text-fg-secondary">
          <h2 className="text-sm font-semibold text-fg">Qué mira</h2>
          <p>
            <b className="text-fg">Solvencia:</b> los meses que no cubrieron el piso y los que vienen sin llegar con lo programado.
          </p>
          <p>
            <b className="text-fg">Margen de una cuenta:</b> cobros con un margen cargado bajo el 15 %, o en contra.
          </p>
          <p>
            <b className="text-fg">Horas sin facturar:</b> cuentas con 10 horas o más en el trimestre y sin un cobro.
          </p>
          <p>
            <b className="text-fg">Meta:</b> lo que falta para la meta con la recurrencia de hoy y el pipeline.
          </p>
          <p className="text-xs text-fg-muted">
            El modelo recibe solo números agregados: nunca el salario ni el nombre de una persona; del equipo, el costo cargado de la hora.
          </p>
        </section>
        <section className="space-y-2 rounded-xl bg-surface-muted p-4 text-[13px] leading-[19px] text-fg-secondary">
          <h2 className="text-sm font-semibold text-fg">Últimas lecturas</h2>
          {datos.corridas.length === 0 ? (
            <p className="text-xs text-fg-muted">Todavía no corrió.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {datos.corridas.map((c) => (
                <li key={c.id}>
                  <span className="font-semibold text-fg">{dia(c.creadaAt)}</span> · {c.por ?? "automática"} ·{" "}
                  {c.estado === "DONE" ? (c.resumen ?? "lista") : c.estado === "RUNNING" ? "leyendo…" : `falló${c.resumen ? `: ${c.resumen}` : ""}`}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-fg-muted">Lo que costó cada lectura está en Uso de Nexus › IA por proceso, en Finanzas.</p>
        </section>
      </aside>
    </div>
  );
}

function Propuesta({ p }: { p: PropuestaParaVer }) {
  const router = useRouter();
  const toast = useToast();
  const [desestimando, setDesestimando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const decidir = async (decision: "usado" | "desestimado") => {
    setGuardando(true);
    try {
      const r = await fetch(`/api/cobranza/costos/lectura/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, motivo: decision === "desestimado" ? motivo : null }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar.");
      toast.success(decision === "usado" ? "Propuesta usada." : "Propuesta desestimada.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <FilaSugerida
      encima={`${ETIQUETA_DE_SENAL[p.tipo] ?? p.tipo}${p.estado === "vencido" ? " · venció sin revisar" : ""}`}
      origen={
        <span>
          Leído el {dia(p.creadaAt)}
          {p.cuenta && p.clientId && (
            <>
              {" · "}
              <Link href={rutaDelMargenDeLaCuenta(p.clientId)} className="text-brand hover:underline">
                Ver el margen de {p.cuenta}
              </Link>
            </>
          )}
        </span>
      }
      debajo={
        <div className="mt-1.5 space-y-1.5 text-[13px] leading-[19px] text-fg-secondary">
          <p>{p.queVe}</p>
          <p className="text-fg">{p.propuesta}</p>
          <p className="text-xs text-fg-muted">
            {p.inversionUsd !== null ? `Inversión: US$ ${miles(p.inversionUsd)}` : "Sin una inversión calculada"}
            {p.inversionNota ? ` · ${p.inversionNota}` : ""}
          </p>
          {desestimando && (
            <div className="space-y-2">
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué no (queda escrito)" rows={2} />
              <div className="flex gap-2">
                <BotonTexto onClick={() => setDesestimando(false)} disabled={guardando}>
                  Cancelar
                </BotonTexto>
                <BotonBlanco onClick={() => decidir("desestimado")} disabled={guardando || !motivo.trim()}>
                  Desestimar
                </BotonBlanco>
              </div>
            </div>
          )}
        </div>
      }
      acciones={
        !desestimando && (
          <>
            <BotonTexto onClick={() => setDesestimando(true)} disabled={guardando}>
              Desestimar
            </BotonTexto>
            <BotonUsar onClick={() => decidir("usado")} disabled={guardando} />
          </>
        )
      }
    >
      <span className="font-semibold">{p.titulo}</span>
    </FilaSugerida>
  );
}

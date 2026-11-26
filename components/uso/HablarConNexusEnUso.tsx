/**
 * HablarConNexusEnUso — «Hablar con Nexus» en la pestaña Procesos de IA de «Uso de Nexus» (etapa 0 del plan maestro,
 * 22 nov): cuánto se conversa, qué se guarda, cuántas veces se leyó mal (los dos botones de salida), qué se hizo con los
 * cambios propuestos y cuánto se gastó, con el tope del mes (US$ 100). Los números salen de lib/uso/hablar-con-nexus*.ts.
 */
import { TOPE_DE_NEXUS_USD_MES } from "@/lib/ai/tope-de-nexus";
import { numero, pct, usd } from "@/lib/uso/ia";
import type { UsoDeHablarConNexus } from "@/lib/uso/hablar-con-nexus-server";
import { Cifra } from "./piezas";

export default function HablarConNexusEnUso({ datos }: { datos: UsoDeHablarConNexus | null }) {
  if (!datos) return null;
  const { conteo: c, dias, mes } = datos;
  const decididos = c.cambiosAplicados + c.cambiosDescartados;
  const salidas = c.eraUnaPregunta + c.guardarloComoNota;
  return (
    <section aria-label="Hablar con Nexus" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">Hablar con Nexus</h2>
        <p className="text-xs text-fg-muted">
          En los últimos {dias} días{c.personas ? `, ${c.personas === 1 ? "una persona" : `${numero(c.personas)} personas`}` : ""}. «¿Era una pregunta?» y
          «Guardarlo como nota» se cuentan desde el 22 nov.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra titulo="Vueltas" valor={numero(c.vueltas)} pie={`${numero(c.preguntasRespondidas)} preguntas respondidas`} />
        <Cifra titulo="Notas guardadas" valor={numero(c.notasGuardadas)} pie={salidas ? `${numero(c.eraUnaPregunta)} «¿Era una pregunta?» y ${numero(c.guardarloComoNota)} «Guardarlo como nota»` : "nadie tuvo que corregir cómo se leyó"} />
        <Cifra
          titulo="Cambios aplicados"
          valor={`${numero(c.cambiosAplicados)} de ${numero(c.cambiosPropuestos)}`}
          pie={decididos ? `${numero(c.cambiosDescartados)} descartados; ${pct(c.cambiosAplicados / decididos)} de los decididos se aplicó` : "ninguno decidido todavía"}
        />
        <Cifra titulo="Gasto" valor={usd(datos.gastoUsd)} pie={`en ${dias} días (la conversación y el aviso del Diagnóstico de rendimiento)`} />
        {mes ? (
          <Cifra
            titulo="Este mes"
            valor={`${usd(mes.gastadoUsd)} de ${usd(mes.topeUsd)}`}
            pie={mes.estado === "agotado" ? "llegó al tope: Nexus no conversa hasta el mes que viene" : mes.estado === "aviso" ? "pasó el 80 % del tope" : "el tope de Nexus conversando"}
            tono={mes.estado === "bien" ? undefined : "warn"}
          />
        ) : (
          <Cifra titulo="Este mes" valor="—" pie={`no se pudo leer el gasto del mes; el tope es de ${usd(TOPE_DE_NEXUS_USD_MES)}`} tono="warn" />
        )}
      </div>
    </section>
  );
}

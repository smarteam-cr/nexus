"use client";

/**
 * components/cs/account/pestanas/PestanaEstado.tsx — «Estado de la cuenta», la primera pestaña:
 * responde «¿cómo está?» en un vistazo y lleva a la pestaña donde está el detalle.
 *
 *   1. El resumen del agente, arriba y una sola vez (lo escribe la IA).
 *   2. Cómo está: las cuatro lecturas; cada una abre su pestaña.
 *   3. Pide atención: los mismos motivos que ponen a la cuenta en la lista de la semana.
 *   4. Lo que viene · 90 días: las fechas que ya están en Nexus y en HubSpot (`loQueViene`).
 */
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { diasEntre, enCuanto, fmtDia, plural } from "@/lib/cs/formato";
import type { Motivo } from "@/lib/cs/cartera-reglas";
import { DIAS_DE_LO_QUE_VIENE, loQueViene, type EventoQueViene } from "@/lib/cs/lo-que-viene";
import { NOMBRE_DE_LA_PESTANA, PESTANA_DE_LA_LECTURA, PESTANA_DEL_MOTIVO } from "@/lib/cs/pestanas-de-la-cuenta";
import type { CsAccountData } from "@/lib/cs/load-account";
import { Chip, Punto, TituloDeSeccion } from "../../piezas";
import AccountBriefSection from "../AccountBriefSection";
import { IrAPestana, Vacio, type IrA } from "./comun";

const COLOR_DE_LECTURA = { rojo: "rojo", ambar: "ambar", verde: "verde", gris: "gris" } as const;

function ChipDeMotivo({ m }: { m: Motivo }) {
  if (m.ia) return <Chip tono="ia">Agente vigía</Chip>;
  if (m.cruce) return <Chip tono="cruce">{m.clave === "riesgoDoble" ? "Riesgo doble" : "Cruce"}</Chip>;
  return m.prioridad === "alta" ? <Chip tono="atencion">Alta</Chip> : <Chip>Media</Chip>;
}

const PUNTO_DEL_EVENTO: Record<EventoQueViene["tono"], string> = {
  neutro: "bg-surface-active",
  atencion: "bg-warning",
  rojo: "bg-destructive",
};

export default function PestanaEstado({ data, irA }: { data: CsAccountData; irA: IrA }) {
  const eventos = loQueViene(data.cuenta, data.hoy);
  return (
    <div className="flex flex-col gap-8">
      <AccountBriefSection clientId={data.clientId} brief={data.brief} />

      <section className="flex flex-col gap-3">
        <TituloDeSeccion titulo="Cómo está" ayuda={`Al ${fmtDia(data.hoy)}. Cuatro lecturas, cada una con su porqué. Toca una para ver el detalle.`} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-recorrido="cs.estado">
          {data.estado.map((l) => {
            const pestana = PESTANA_DE_LA_LECTURA[l.rotulo];
            return (
              <button
                key={l.rotulo}
                type="button"
                onClick={() => irA(pestana)}
                className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:bg-surface-hover"
              >
                {/* «Uso» se lee como «Adopción», que es el nombre de su pestaña. */}
                <span className={ROTULO_DEL_SISTEMA}>{l.rotulo === "Uso" ? "Adopción" : l.rotulo}</span>
                <span className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                  <Punto color={COLOR_DE_LECTURA[l.color]} />
                  {l.palabra}
                </span>
                <span className="text-[13px] text-fg-secondary">{l.porque}</span>
                <span className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                  <Chip>{l.fuente}</Chip>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
                    {NOMBRE_DE_LA_PESTANA[pestana]}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {data.motivos.length > 0 && (
        <section className="flex flex-col gap-3">
          <TituloDeSeccion titulo={`Pide atención · ${data.motivos.length}`} ayuda="Los mismos motivos que ponen a la cuenta en la lista de la semana, del más urgente al menos." />
          <div className="divide-y divide-line rounded-xl border border-line bg-surface px-4" data-recorrido="cs.atencion">
            {data.motivos.map((m) => {
              const destino = PESTANA_DEL_MOTIVO[m.clave];
              return (
                <div key={m.clave + m.texto} className="flex flex-wrap items-center gap-2.5 py-3">
                  <ChipDeMotivo m={m} />
                  <span className="min-w-[240px] flex-1 text-[13px] text-fg">{m.texto}</span>
                  {destino ? (
                    <IrAPestana a={destino} irA={irA}>
                      Ver {NOMBRE_DE_LA_PESTANA[destino].toLowerCase()}
                    </IrAPestana>
                  ) : (
                    <span className="text-xs text-fg-muted">{m.fuente}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <TituloDeSeccion
          titulo={`Lo que viene · ${DIAS_DE_LO_QUE_VIENE} días`}
          ayuda="Las fechas que ya están en Nexus y en HubSpot, en orden. Lo que puede salir mal, en ámbar o rojo."
        />
        {eventos.length === 0 ? (
          <Vacio>No hay renovaciones, cierres ni vencimientos en los próximos {DIAS_DE_LO_QUE_VIENE} días.</Vacio>
        ) : (
          <ol className="rounded-xl border border-line bg-surface px-5 pb-1 pt-4">
            {eventos.map((e, i) => (
              <li key={`${e.fecha}-${e.texto}`} className="grid grid-cols-[80px_16px_minmax(0,1fr)_auto] gap-x-3">
                <span className="flex flex-col pb-4">
                  <span className="text-[13px] font-semibold text-fg">{fmtDia(e.fecha, data.hoy)}</span>
                  <span className="text-xs text-fg-muted">{diasEntre(data.hoy, e.fecha) <= 0 ? "hoy" : enCuanto(e.fecha, data.hoy)}</span>
                </span>
                {/* La línea de tiempo: el punto del tono y el trazo hasta el siguiente. */}
                <span className="relative flex justify-center">
                  {i < eventos.length - 1 && <span className="absolute bottom-0 top-3 w-0.5 bg-line" aria-hidden />}
                  <span className={cn("relative mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface", PUNTO_DEL_EVENTO[e.tono])} aria-hidden />
                </span>
                <span className="flex flex-col gap-0.5 pb-4">
                  <span className="text-[13px] text-fg">{e.texto}</span>
                  <span className={cn("text-xs", e.tono === "neutro" ? "text-fg-muted" : "text-warn-ink")}>{e.detalle}</span>
                </span>
                <span className="pb-4 pt-0.5">
                  {e.destino && (
                    <IrAPestana a={e.destino} irA={irA}>
                      {NOMBRE_DE_LA_PESTANA[e.destino]}
                    </IrAPestana>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
        {eventos.length > 0 && (
          <p className="text-xs text-fg-muted">
            {plural(eventos.length, "fecha", "fechas")} en los próximos {DIAS_DE_LO_QUE_VIENE} días. Las reuniones agendadas están en la ficha del cliente.
          </p>
        )}
      </section>
    </div>
  );
}

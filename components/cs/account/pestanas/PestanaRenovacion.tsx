"use client";

/**
 * components/cs/account/pestanas/PestanaRenovacion.tsx — «Renovación»: la plata de la cuenta y lo
 * que tiene que estar bien antes de que el cliente decida (rediseño del 2026-10-05).
 *
 *   1. La próxima renovación, su monto y el cambio que espera HubSpot; la siguiente al lado.
 *   2. Lista para renovar · N de 6 (`listaParaRenovar`), cada punto con su pestaña.
 *   3. Calendario de renovaciones por hub.
 *   4. Relación gestionada y nivel de partner.
 *   5. Crecimiento: las oportunidades (`oportunidades`).
 */
import { useState } from "react";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { diasEntre, enCuanto, fmtCambio, fmtDia, fmtMonto, haceCuanto, miles } from "@/lib/cs/formato";
import { oportunidades } from "@/lib/cs/cartera-reglas";
import { listaParaRenovar } from "@/lib/cs/lista-para-renovar";
import { NOMBRE_DE_LA_PESTANA } from "@/lib/cs/pestanas-de-la-cuenta";
import { PARTNER_STATE_META } from "@/lib/cs/partner-state";
import type { CsAccountData } from "@/lib/cs/load-account";
import { Chip, TituloDeSeccion } from "../../piezas";
import { Dato, IrAPestana, Vacio, type IrA } from "./comun";

export default function PestanaRenovacion({ data, irA }: { data: CsAccountData; irA: IrA }) {
  const p = data.cuenta.partner;
  const hoy = data.hoy;
  const lista = listaParaRenovar(data.cuenta, data.resultados, hoy);

  if (!p) {
    return (
      <div className="flex flex-col gap-8">
        <Vacio>{data.partnerState === "ok" ? "Sin datos de HubSpot Partner para esta cuenta: no hay fechas ni montos de renovación." : PARTNER_STATE_META[data.partnerState].message}</Vacio>
        <ListaParaRenovar lista={lista} irA={irA} />
      </div>
    );
  }

  // La próxima renovación: la que dice HubSpot o, si ya pasó, la primera fecha futura por hub.
  const futuras = [...new Set(p.hubs.map((h) => h.renovacion).filter((f): f is string => !!f && f >= hoy))].sort();
  const proxima = p.proximaRenovacion && p.proximaRenovacion >= hoy ? p.proximaRenovacion : (futuras[0] ?? null);
  const queRenueva = proxima ? p.hubs.filter((h) => h.renovacion === proxima) : [];
  const montoQueRenueva = queRenueva.reduce((s, h) => s + (h.montoMensual ?? 0), 0);
  const despues = futuras.find((f) => f !== proxima) ?? null;
  const queRenuevaDespues = despues ? p.hubs.filter((h) => h.renovacion === despues) : [];
  const venceEn = p.relacionGestionadaVence ? diasEntre(hoy, p.relacionGestionadaVence) : null;
  const calendario = [...p.hubs].sort((a, b) => (a.renovacion ?? "9999").localeCompare(b.renovacion ?? "9999"));
  const lineaDeHub = (hs: typeof p.hubs) => hs.map((h) => `${h.nombre.replace(/ Hub$/, "")}${h.plan ? ` ${h.plan}` : ""}`).join(" y ");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap gap-6 rounded-xl border border-line bg-surface p-5">
        <div className="flex min-w-[260px] flex-[1_1_360px] flex-col gap-1.5">
          <span className={ROTULO_DEL_SISTEMA}>Próxima renovación</span>
          {proxima ? (
            <>
              <span className="flex flex-wrap items-baseline gap-2.5">
                <span className="text-[26px] font-bold leading-8 text-fg">{fmtDia(proxima, hoy)}</span>
                <Chip tono={diasEntre(hoy, proxima) <= 60 ? "atencion" : "neutro"}>{enCuanto(proxima, hoy)}</Chip>
              </span>
              <span className="text-sm text-fg-secondary">{queRenueva.length ? lineaDeHub(queRenueva) : "HubSpot no dice qué hubs renuevan."}</span>
            </>
          ) : (
            <span className="text-sm text-fg-muted">HubSpot no da una fecha de renovación.</span>
          )}
        </div>
        <div className="flex min-w-[180px] flex-[0_1_220px] flex-col gap-1 border-line pl-0 sm:border-l sm:pl-5">
          <span className={ROTULO_DEL_SISTEMA}>Al mes</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">
            {montoQueRenueva > 0 ? fmtMonto(montoQueRenueva, p.moneda) : p.mrrTotal !== null ? fmtMonto(p.mrrTotal) : "—"}
          </span>
          {p.cambioAlRenovar !== null && p.cambioAlRenovar !== 0 ? (
            <span className={cn("text-xs font-semibold", p.cambioAlRenovar < 0 ? "text-warn-ink" : "text-success-ink")}>
              HubSpot espera un cambio de {fmtCambio(p.cambioAlRenovar, p.moneda)} al mes
            </span>
          ) : (
            <span className="text-xs text-fg-muted">{p.cambioAlRenovar === 0 ? "HubSpot no espera cambios" : "Sin dato del cambio al renovar"}</span>
          )}
        </div>
        {despues && (
          <div className="flex min-w-[180px] flex-[0_1_220px] flex-col gap-1 border-line pl-0 sm:border-l sm:pl-5">
            <span className={ROTULO_DEL_SISTEMA}>Después</span>
            <span className="text-[15px] font-semibold text-fg">
              {fmtDia(despues, hoy)}
              {(() => {
                const m = queRenuevaDespues.reduce((s, h) => s + (h.montoMensual ?? 0), 0);
                return m > 0 ? ` · ${fmtMonto(m, p.moneda)} al mes` : "";
              })()}
            </span>
            <span className="text-xs text-fg-muted">{lineaDeHub(queRenuevaDespues)}</span>
          </div>
        )}
      </section>

      <ListaParaRenovar lista={lista} irA={irA} />

      <section className="flex flex-col gap-3">
        <TituloDeSeccion titulo="Calendario de renovaciones" ayuda="Cada hub renueva por su lado. Lo que renueva primero, arriba." />
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[minmax(0,1fr)_150px_150px_110px] gap-4 border-b border-line bg-surface-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              <span>Hub y plan</span>
              <span>Renueva</span>
              <span>Falta</span>
              <span className="text-right">Al mes</span>
            </div>
            {calendario.map((h, i) => {
              const cerca = h.renovacion && h.renovacion >= hoy ? diasEntre(hoy, h.renovacion) <= 60 : false;
              return (
                <div key={h.hub} className={cn("grid grid-cols-[minmax(0,1fr)_150px_150px_110px] items-center gap-4 px-4 py-3.5 text-[13px] text-fg", i > 0 && "border-t border-line")}>
                  <span className="flex flex-col gap-px">
                    <span className="text-sm font-semibold">{h.nombre}</span>
                    <span className="text-xs text-fg-muted">{h.plan ?? "plan sin dato"}</span>
                  </span>
                  <span>{h.renovacion ? fmtDia(h.renovacion, hoy) : <span className="text-fg-muted">sin fecha</span>}</span>
                  <span className={cn(cerca ? "text-warn-ink" : "text-fg-muted")}>
                    {h.renovacion ? (h.renovacion >= hoy ? enCuanto(h.renovacion, hoy) : `pasó el ${fmtDia(h.renovacion, hoy)}`) : "—"}
                  </span>
                  <span className="text-right tabular-nums">{h.montoMensual !== null ? fmtMonto(h.montoMensual, p.moneda) : "—"}</span>
                </div>
              );
            })}
            <div className="flex justify-between gap-4 rounded-b-xl border-t border-line bg-surface-muted px-4 py-3 text-[13px]">
              <span className="text-fg-muted">Pago total al mes</span>
              <b className="font-semibold tabular-nums text-fg">{p.mrrTotal !== null ? fmtMonto(p.mrrTotal) : "sin dato"}</b>
            </div>
          </div>
        </div>
        {p.cancelacion && (
          <p className="text-[13px] font-semibold text-warn-ink">
            HubSpot registra una cancelación{p.cancelacion.hubs.length ? ` de ${p.cancelacion.hubs.join(", ")}` : ""}
            {p.cancelacion.fecha ? ` para el ${fmtDia(p.cancelacion.fecha, hoy)}` : ""}.
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface px-4 pb-1.5 pt-4">
          <span className="text-[15px] font-semibold text-fg">Relación gestionada</span>
          <Dato etiqueta="Vence (estimado por HubSpot)" primero>
            {p.gestionada && p.relacionGestionadaVence ? (
              <b className={cn("font-semibold", venceEn !== null && venceEn <= 30 && "text-warn-ink")}>
                {fmtDia(p.relacionGestionadaVence, hoy)}
                {venceEn !== null && venceEn >= 0 ? ` · ${enCuanto(p.relacionGestionadaVence, hoy)}` : ""}
              </b>
            ) : (
              <span className="text-fg-muted">{p.gestionada ? "sin fecha" : "no está gestionada"}</span>
            )}
          </Dato>
          <Dato etiqueta="Última actividad de Smarteam en el portal">
            {p.ultimaActividadDeSmarteam ? (
              <>
                {fmtDia(p.ultimaActividadDeSmarteam, hoy)}
                <br />
                <span className="text-xs text-fg-muted">{haceCuanto(p.ultimaActividadDeSmarteam, hoy)}</span>
              </>
            ) : (
              <span className="text-fg-muted">sin dato</span>
            )}
          </Dato>
          <Dato etiqueta="Otro partner también la gestiona">{(p.partnersQueGestionan ?? 1) >= 2 ? "Sí" : "No"}</Dato>
          <p className="border-t border-line py-2.5 text-xs text-fg-muted">
            HubSpot la quita tras 60 días sin que Smarteam cree o edite algo en el portal. Entrar no cuenta. Con ella se pierden los datos de uso y el MRR gestionado.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface px-4 pb-1.5 pt-4">
          <span className="text-[15px] font-semibold text-fg">Nivel de partner</span>
          <Dato etiqueta="Puntos vendidos" primero>
            <b className="font-semibold tabular-nums">{p.nivel.vendidos !== null ? miles(p.nivel.vendidos) : "—"}</b>
          </Dato>
          <Dato etiqueta="Puntos gestionados">
            <b className="font-semibold tabular-nums">{p.nivel.gestionados !== null ? miles(p.nivel.gestionados) : "—"}</b>
            {p.gestionada && (p.nivel.gestionados ?? 0) > 0 && (
              <>
                <br />
                <span className="text-xs text-warn-ink">se pierden si vence la relación</span>
              </>
            )}
          </Dato>
          <Dato etiqueta="Mercado">
            {p.nivel.mercado
              ? `${p.nivel.mercado === "growth_market" ? "crecimiento" : p.nivel.mercado === "core_market" ? "principal" : p.nivel.mercado}${p.nivel.multiplicador ? ` ×${p.nivel.multiplicador}` : ""}`
              : "—"}
          </Dato>
          <Dato etiqueta="Comisión proyectada">
            <b className="font-semibold tabular-nums">{p.nivel.comision !== null ? fmtMonto(p.nivel.comision) : "—"}</b>
          </Dato>
          {p.nivel.actualizadoEn && (
            <p className={cn("border-t border-line py-2.5 text-xs", diasEntre(p.nivel.actualizadoEn, hoy) > 60 ? "text-warn-ink" : "text-fg-muted")}>
              Puntos al {fmtDia(p.nivel.actualizadoEn, hoy)}
              {diasEntre(p.nivel.actualizadoEn, hoy) > 60 ? ": HubSpot no los actualiza desde entonces." : "."}
            </p>
          )}
        </div>
      </section>

      <Crecimiento data={data} />
    </div>
  );
}

function ListaParaRenovar({ lista, irA }: { lista: ReturnType<typeof listaParaRenovar>; irA: IrA }) {
  const faltan = lista.puntos.filter((x) => x.listo === false).length;
  return (
    <section className="flex flex-col gap-3">
      <TituloDeSeccion
        titulo={`Lista para renovar · ${lista.listos} de ${lista.conDato}`}
        ayuda="Lo que tiene que estar bien antes de que el cliente decida. Lo calcula Nexus con los datos de las otras pestañas."
        derecha={faltan > 0 ? <Chip tono="atencion">Faltan {faltan}</Chip> : <Chip tono="confirmado">Todo listo</Chip>}
      />
      <div className="divide-y divide-line rounded-xl border border-line bg-surface px-5">
        {lista.puntos.map((x) => (
          <div key={x.clave} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 py-3">
            {x.listo === true ? (
              <span className="text-sm font-bold text-success" aria-label="Listo">
                ✓
              </span>
            ) : x.listo === false ? (
              <span className="text-sm text-warning" aria-label="Falta">
                ○
              </span>
            ) : (
              <span className="text-sm text-fg-muted" aria-label="Sin dato">
                —
              </span>
            )}
            <span className="flex flex-col gap-px">
              <span className="text-[13px] font-semibold text-fg">{x.texto}</span>
              <span className={cn("text-xs", x.listo === false ? "text-warn-ink" : "text-fg-muted")}>{x.detalle}</span>
            </span>
            {x.destino ? (
              <IrAPestana a={x.destino} irA={irA}>
                {NOMBRE_DE_LA_PESTANA[x.destino]}
              </IrAPestana>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Crecimiento({ data }: { data: CsAccountData }) {
  const lista = oportunidades([data.cuenta]);
  const [abierta, setAbierta] = useState<number | null>(lista.findIndex((o) => !!o.comoPlantearlo));
  if (lista.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <TituloDeSeccion titulo="Crecimiento" ayuda="Lo que señala HubSpot y lo que se deduce de los datos. HubSpot no estima cuánto valen." />
      <div className="flex flex-col gap-2">
        {lista.map((o, i) => (
          <div key={o.titulo} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
            <div className="flex min-w-0 flex-col gap-1">
              <span>
                <Chip>{o.rotulo}</Chip>
              </span>
              <span className="text-sm text-fg">{o.titulo}</span>
              {o.detalle && <span className="text-xs text-fg-muted">{o.detalle}</span>}
              {o.comoPlantearlo && abierta !== i && (
                <button type="button" onClick={() => setAbierta(i)} className="self-start text-xs font-medium text-brand hover:text-brand-light">
                  Cómo plantearlo, según HubSpot
                </button>
              )}
            </div>
            {o.comoPlantearlo && abierta === i && (
              <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
                <span className={ROTULO_DEL_SISTEMA}>Cómo plantearlo, según HubSpot</span>
                <span className="text-[13px] text-fg-secondary">{o.comoPlantearlo}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

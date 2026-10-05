"use client";

/**
 * components/cs/account/pestanas/PestanaAdopcion.tsx — «Adopción»: cuánto de lo que paga el
 * cliente está prendido y se usa (rediseño del 2026-10-05; Elías: «la parte de adopción es muy
 * importante»).
 *
 *   1. Lo que lee el agente en la adopción: las frases del resumen citadas con HubSpot Partner.
 *   2. Uso de la plataforma, con su historial semanal y la línea del umbral de Smarteam.
 *   3. Del contrato al uso: contratado → activado → con uso sano (`delContratoAlUso`).
 *   4. Hub por hub: uso, uso de hace 4 semanas, activación y lo que le falta usar.
 *   5. Licencias: un cuadro por licencia; las pagadas sin asignar, punteadas.
 *   6. Capacidad y consumo · 7. Apps conectadas a su portal.
 *
 * El historial sale de `PartnerUsageSnapshot` (una foto por semana mientras corre la copia diaria
 * de HubSpot Partner). Con menos de dos semanas no hay gráfico: se dice por qué.
 */
import { ROTULO_DEL_SISTEMA, IconoDeSugerencia } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { diasEntre, enCuanto, fmtDia, plural } from "@/lib/cs/formato";
import { NOMBRE_DEL_HUB, UMBRALES, fraccion, porcentajeDeTendencia, usoCayendo, type HubDePartner } from "@/lib/cs/lectura-partner";
import {
  delContratoAlUso,
  licenciasDeLaCuenta,
  licenciasSinAsignar,
  lunesDeLaSemana,
  semanasBajoElUmbral,
  usoHaceSemanas,
  type FilaDeLicencias,
  type SemanaDeUso,
} from "@/lib/cs/adopcion";
import { PARTNER_STATE_META } from "@/lib/cs/partner-state";
import type { CsAccountData } from "@/lib/cs/load-account";
import { Barra, Chip, ChipDeCabecera, TituloDeSeccion } from "../../piezas";
import { IrAPestana, Medidor, Vacio, type IrA } from "./comun";

const PRINCIPALES: HubDePartner[] = ["marketing", "sales", "service", "operations", "content", "commerce"];

export default function PestanaAdopcion({ data, irA }: { data: CsAccountData; irA: IrA }) {
  const p = data.cuenta.partner;
  if (!p) {
    return <Vacio>{data.partnerState === "ok" ? "Sin datos de HubSpot Partner para esta cuenta." : PARTNER_STATE_META[data.partnerState].message}</Vacio>;
  }
  const fuente = data.partner?.fetchedAt ?? null;
  const lecturaDelAgente = (data.brief?.statements ?? []).filter((s) => s.source?.kind === "hubspot_partner");
  const pasos = delContratoAlUso(p.hubs);
  const licencias = licenciasDeLaCuenta(p);
  const sinAsignar = licenciasSinAsignar(licencias);
  const bajo = semanasBajoElUmbral(data.historialDeUso);
  const noContratados = PRINCIPALES.filter((h) => !p.hubs.some((x) => x.hub === h));

  return (
    <div className="flex flex-col gap-8">
      {/* Lo que escribe la IA va arriba y una sola vez (sistema «Nexus · interfaz interna»). */}
      {lecturaDelAgente.length > 0 && (
        <section className="flex items-start gap-2.5 rounded-xl border border-info-line bg-info-surface px-4 py-3.5">
          <IconoDeSugerencia className="mt-0.5 h-[15px] w-[15px] flex-shrink-0 text-brand" />
          <div className="flex min-w-0 flex-col gap-2">
            <span className={cn(ROTULO_DEL_SISTEMA, "text-brand")}>Lo que lee el agente en la adopción</span>
            <ul className="flex flex-col gap-1.5 text-sm text-fg">
              {lecturaDelAgente.map((s, i) => (
                <li key={i}>
                  · {s.text}{" "}
                  <span className="text-xs text-fg-muted">
                    {s.source.label}
                    {s.source.date ? ` · ${fmtDia(s.source.date, data.hoy)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {data.brief && <span className="text-xs text-fg-muted">Del resumen del agente, redactado el {fmtDia(data.brief.generatedAt, data.hoy)}.</span>}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <TituloDeSeccion
          titulo="Uso de la plataforma"
          ayuda="El puntaje de HubSpot compara el uso de todo el portal con cuentas parecidas. Una barra por semana."
          derecha={fuente ? <Chip tono={diasEntre(fuente, data.hoy) > 3 ? "atencion" : "neutro"}>HubSpot Partner · {fmtDia(fuente, data.hoy)}</Chip> : undefined}
        />
        <div className="flex flex-wrap gap-6 rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-[0_0_220px] flex-col gap-2">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[40px] font-bold leading-[44px] tabular-nums text-fg">{p.uso ?? "—"}</span>
              <span className="text-sm text-fg-muted">de 100</span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              {p.tendencia !== null && <Chip tono={usoCayendo(p) ? "atencion" : "neutro"}>{porcentajeDeTendencia(p.tendencia)} en 4 semanas</Chip>}
              {p.nivelDeUso && <Chip>Nivel de uso: {p.nivelDeUso}</Chip>}
            </span>
            <span className="text-[13px] text-fg-secondary">
              {p.uso === null
                ? "HubSpot todavía no da el puntaje de esta cuenta."
                : bajo > 0
                  ? `Lleva ${plural(bajo, "semana", "semanas")} bajo ${UMBRALES.usoBajo}, el umbral de Smarteam.`
                  : p.uso < UMBRALES.usoBajo
                    ? `Está bajo ${UMBRALES.usoBajo}, el umbral de Smarteam.`
                    : `Sobre ${UMBRALES.usoBajo}, el umbral de Smarteam.`}
            </span>
          </div>
          <GraficoDeUso historial={data.historialDeUso} hoy={data.hoy} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <TituloDeSeccion titulo="Del contrato al uso" ayuda="Cuánto de lo que paga ya está prendido y se usa. Lo que no llega al final es lo que más pesa al renovar." />
        <div className="flex flex-wrap items-stretch gap-2.5">
          {pasos.map((paso, i) => (
            <div key={paso.clave} className="flex min-w-[200px] flex-1 items-stretch gap-2.5">
              {i > 0 && (
                <span aria-hidden className="flex items-center text-lg text-fg-muted">
                  →
                </span>
              )}
              <div className="flex flex-1 flex-col gap-1.5 rounded-xl border border-line bg-surface p-4">
                <span className={ROTULO_DEL_SISTEMA}>
                  {i + 1} · {paso.titulo}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className={cn("text-[22px] font-bold leading-7 tabular-nums", paso.atencion ? "text-warn-ink" : "text-fg")}>{paso.cifra}</span>
                  <span className="text-[13px] text-fg-muted">{paso.de === null ? (paso.cifra === 1 ? "hub" : "hubs") : `de ${paso.de}`}</span>
                </span>
                <span className="text-xs text-fg-secondary">{paso.detalle}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <TituloDeSeccion titulo="Hub por hub" ayuda="Cuánto lo usa, si está activado y qué herramientas clave le faltan usar, según HubSpot." />
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <div className="min-w-[780px]">
            <div className="grid grid-cols-[minmax(0,1.1fr)_170px_140px_minmax(0,1.7fr)] gap-4 border-b border-line bg-surface-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              <span>Hub y plan</span>
              <span>Uso</span>
              <span>Activación</span>
              <span>Le falta usar</span>
            </div>
            {p.hubs.map((h, i) => {
              const antes = usoHaceSemanas(data.historialDeUso, h.hub);
              return (
                <div key={h.hub} className={cn("grid grid-cols-[minmax(0,1.1fr)_170px_140px_minmax(0,1.7fr)] items-center gap-4 px-4 py-3.5 text-[13px] text-fg", i > 0 && "border-t border-line")}>
                  <span className="flex flex-col gap-px">
                    <span className="text-sm font-semibold">{h.nombre}</span>
                    <span className="text-xs text-fg-muted">{h.plan ?? "plan sin dato"}</span>
                  </span>
                  {h.uso !== null ? (
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <b className="w-[22px] font-semibold tabular-nums">{h.uso}</b>
                        <Barra valor={h.uso} atencion={h.uso < UMBRALES.usoBajo} ancho="w-[72px]" />
                      </span>
                      <span className={cn("text-xs", antes !== null && antes > h.uso ? "text-warn-ink" : "text-fg-muted")}>
                        {antes !== null ? `hace 4 semanas: ${antes}` : "sin historia"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-fg-muted">HubSpot no lo mide</span>
                  )}
                  {h.activado === false ? (
                    <span className="text-warn-ink">○ Sin activar</span>
                  ) : h.activado === true ? (
                    <span className="text-success-ink">✓ Activado</span>
                  ) : (
                    <span className="text-fg-muted">sin dato</span>
                  )}
                  {h.porActivar.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {h.porActivar.map((t) => (
                        <Chip key={t} tono="atencion">
                          ○ {t}
                        </Chip>
                      ))}
                    </span>
                  ) : (
                    <span className="text-fg-muted">{h.uso === null ? "—" : "Usa todo lo que HubSpot mide"}</span>
                  )}
                </div>
              );
            })}
            <div className="m-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-line bg-surface-muted px-3 py-2.5 text-[13px] text-fg-muted">
              <span>
                {noContratados.length ? (
                  <>
                    No contratados:{" "}
                    {noContratados.map((h, i) => (
                      <span key={h}>
                        {i > 0 && " · "}
                        <b className="font-semibold text-fg-secondary">{NOMBRE_DEL_HUB[h]}</b>
                      </span>
                    ))}
                  </>
                ) : (
                  "Tiene todos los hubs."
                )}
              </span>
              {noContratados.length > 0 && (
                <IrAPestana a="renovacion" irA={irA}>
                  Ver crecimiento
                </IrAPestana>
              )}
            </div>
          </div>
        </div>
      </section>

      {licencias.length > 0 && (
        <section className="flex flex-col gap-3">
          <TituloDeSeccion
            titulo="Licencias"
            ayuda="Las punteadas están pagadas y nadie las usa: son las primeras que el cliente recorta al renovar."
            derecha={sinAsignar > 0 ? <Chip tono="atencion">{sinAsignar} sin asignar</Chip> : <Chip tono="confirmado">Todas asignadas</Chip>}
          />
          <div className="rounded-xl border border-line bg-surface px-5 py-1">
            {licencias.map((f, i) => (
              <FilaDeLicenciasVista key={f.tipo} fila={f} primera={i === 0} />
            ))}
          </div>
        </section>
      )}

      {(p.contactosDeMarketing || p.correosDelMes || p.creditos) && (
        <section className="flex flex-col gap-3">
          <TituloDeSeccion
            titulo="Capacidad y consumo"
            ayuda={`${Math.round(UMBRALES.alLimite * 100)} % o más: conversación para ampliar. ${Math.round(UMBRALES.pocoUso * 100)} % o menos en contactos: paga por lo que no usa.`}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {p.contactosDeMarketing && (
              <Medidor
                rotulo="Contactos de marketing"
                cupo={p.contactosDeMarketing}
                atencion={fraccion(p.contactosDeMarketing) >= UMBRALES.alLimite || fraccion(p.contactosDeMarketing) <= UMBRALES.pocoUso}
                nota={
                  fraccion(p.contactosDeMarketing) >= UMBRALES.alLimite
                    ? "Cerca del tramo: conversación para ampliar."
                    : fraccion(p.contactosDeMarketing) <= UMBRALES.pocoUso
                      ? "Usa poco del tramo que paga."
                      : "Dentro de lo normal."
                }
              />
            )}
            {p.correosDelMes && (
              <Medidor rotulo="Correos enviados este mes" cupo={p.correosDelMes} atencion={fraccion(p.correosDelMes) >= UMBRALES.alLimite} nota="El límite se reinicia cada mes." />
            )}
            {p.creditos && (
              <Medidor
                rotulo="Créditos de HubSpot"
                cupo={p.creditos}
                atencion={fraccion(p.creditos) >= UMBRALES.creditosAlLimite}
                nota={[
                  p.creditos.reinicio ? `Se reinician ${enCuanto(p.creditos.reinicio, data.hoy)}.` : null,
                  p.creditos.compraAutomatica === false ? "No tiene compra automática: si se acaban, los agentes de IA se detienen." : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            )}
          </div>
        </section>
      )}

      {p.apps.length > 0 && (
        <section className="flex flex-col gap-3">
          <TituloDeSeccion
            titulo={`Apps conectadas a su portal · ${p.apps.length}`}
            ayuda="Lo que el cliente ya integró. Muchas integraciones armadas a mano suelen ser una oportunidad de Operations Hub."
          />
          <div className="flex flex-wrap gap-1.5">
            {p.apps.map((a) => (
              <ChipDeCabecera key={a}>{a}</ChipDeCabecera>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const ALTO_DEL_GRAFICO = 140;
/** El techo del eje: el puntaje casi nunca pasa de 60; si pasa, el eje crece con él. */
const TECHO_MINIMO = 60;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaCorto = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;

/** Una barra por semana con la línea del umbral. Con menos de dos semanas, el porqué. */
function GraficoDeUso({ historial, hoy }: { historial: SemanaDeUso[]; hoy: string }) {
  const semanas = historial.filter((s) => s.uso !== null);
  if (semanas.length < 2) {
    return (
      <div className="flex min-w-0 flex-[1_1_480px] items-center rounded-lg border border-dashed border-line bg-surface-muted px-4 py-6 text-[13px] text-fg-muted">
        {semanas.length === 0
          ? "Todavía no hay historial semanal de uso de esta cuenta."
          : `Hay una sola semana guardada (${diaCorto(lunesDeLaSemana(semanas[0].semana) ?? hoy)}).`}{" "}
        El gráfico suma una barra por semana mientras corre la copia diaria de HubSpot Partner.
      </div>
    );
  }
  const techo = Math.max(TECHO_MINIMO, ...semanas.map((s) => s.uso as number));
  const yUmbral = ALTO_DEL_GRAFICO - Math.round((UMBRALES.usoBajo / techo) * ALTO_DEL_GRAFICO);
  return (
    <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-2">
      <div className="relative">
        <div className="flex items-end gap-1" role="img" aria-label={`Uso semanal: ${semanas.map((s) => s.uso).join(", ")}`}>
          {semanas.map((s, i) => {
            const lunes = lunesDeLaSemana(s.semana);
            const conRotulo = i % 3 === 0 || i === semanas.length - 1;
            return (
              <span key={s.semana} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="flex w-full items-end justify-center" style={{ height: ALTO_DEL_GRAFICO }}>
                  <span
                    title={`${lunes ? diaCorto(lunes) : s.semana}: ${s.uso}`}
                    className={cn("block w-[70%] max-w-[26px] rounded-t-[3px]", (s.uso as number) < UMBRALES.usoBajo ? "bg-warning" : "bg-fg-muted")}
                    style={{ height: Math.max(2, Math.round(((s.uso as number) / techo) * ALTO_DEL_GRAFICO)) }}
                  />
                </span>
                <span className={cn("whitespace-nowrap text-[11px]", conRotulo ? "text-fg-muted" : "text-transparent")}>{lunes ? diaCorto(lunes) : "·"}</span>
              </span>
            );
          })}
        </div>
        <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-warn-ink" style={{ top: yUmbral }} />
        <span aria-hidden className="absolute right-0 bg-surface px-1 text-[11px] text-warn-ink" style={{ top: yUmbral - 18 }}>
          umbral {UMBRALES.usoBajo}
        </span>
      </div>
    </div>
  );
}

/** Más licencias que esto se dibujan como una barra y no cuadro por cuadro. */
const MAX_CUADROS = 40;

function FilaDeLicenciasVista({ fila, primera }: { fila: FilaDeLicencias; primera: boolean }) {
  return (
    <div className={cn("grid grid-cols-[180px_minmax(0,1fr)_150px] items-center gap-4 py-3", !primera && "border-t border-line")}>
      <span className="text-[13px] font-semibold text-fg">
        {fila.tipo}
        {fila.nota && <span className="block text-xs font-normal text-fg-muted">{fila.nota}</span>}
      </span>
      {fila.total <= MAX_CUADROS ? (
        <span className="flex gap-[3px]" aria-hidden>
          {Array.from({ length: fila.total }, (_, i) => (
            <span
              key={i}
              className={cn("h-3.5 flex-1 rounded-[3px]", i < fila.asignadas ? "bg-fg-muted" : "border border-dashed border-warning bg-surface")}
            />
          ))}
        </span>
      ) : (
        <Barra valor={Math.round((fila.asignadas / fila.total) * 100)} atencion={fila.libres > 0} ancho="w-full" />
      )}
      <span className="text-right text-[13px] tabular-nums text-fg">
        {fila.asignadas} de {fila.total}
        <span className={cn("block text-xs", fila.libres > 0 ? "text-warn-ink" : "text-fg-muted")}>
          {fila.libres > 0 ? `${fila.libres} sin asignar` : "todas asignadas"}
        </span>
      </span>
    </div>
  );
}

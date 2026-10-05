"use client";

/**
 * components/cs/account/pestanas/PestanaConversaciones.tsx — «Conversaciones» (rediseño del
 * 2026-10-05): cómo está la relación. Cuatro cifras arriba, las últimas reuniones con lo que quedó
 * y lo que preocupa (filtro «Con riesgo»), y con quién hablamos: las personas del cliente en HubSpot
 * con su último contacto. Una cuenta que depende de una sola persona es frágil.
 */
import { useState } from "react";
import Link from "next/link";
import { Segmentado } from "@/components/ui/Segmentado";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { diasEntre, fmtDia, haceCuanto, plural } from "@/lib/cs/formato";
import { DIAS_SIN_CONTACTO } from "@/lib/cs/cartera-reglas";
import type { CsAccountData } from "@/lib/cs/load-account";
import { TituloDeSeccion } from "../../piezas";
import { Vacio } from "./comun";

/** Una persona sin contacto en más de esto se pinta en ámbar. */
const DIAS_PERSONA_FRIA = 45;

function Cifra({ rotulo, cifra, detalle, atencion = false }: { rotulo: string; cifra: string; detalle: string; atencion?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3.5">
      <span className={ROTULO_DEL_SISTEMA}>{rotulo}</span>
      <span className={cn("text-xl font-bold leading-[26px] tabular-nums", atencion ? "text-warn-ink" : "text-fg")}>{cifra}</span>
      <span className={cn("text-xs", atencion ? "text-warn-ink" : "text-fg-muted")}>{detalle}</span>
    </div>
  );
}

export default function PestanaConversaciones({ data }: { data: CsAccountData }) {
  const [filtro, setFiltro] = useState<"todas" | "riesgo">("todas");
  const c = data.cuenta;
  const dias = c.ultimoContacto ? diasEntre(c.ultimoContacto, data.hoy) : null;
  const frias = data.contactos.filter((x) => !x.ultimoContacto || diasEntre(x.ultimoContacto, data.hoy) > DIAS_PERSONA_FRIA);
  const conRiesgo = data.minutes.filter((m) => m.risks.length > 0);
  const reuniones = filtro === "riesgo" ? conRiesgo : data.minutes;
  const contactosOrdenados = [...data.contactos].sort((a, b) => (b.ultimoContacto ?? "").localeCompare(a.ultimoContacto ?? ""));

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra
          rotulo="Último contacto"
          cifra={dias === null ? "sin dato" : haceCuanto(c.ultimoContacto!, data.hoy)}
          detalle={dias === null ? "Sin contacto registrado" : fmtDia(c.ultimoContacto!, data.hoy)}
          atencion={dias === null || dias > DIAS_SIN_CONTACTO}
        />
        <Cifra
          rotulo="Actividades en 90 días"
          cifra={data.signals?.engagements90d != null ? String(data.signals.engagements90d) : "—"}
          detalle="Reuniones, correos y llamadas en HubSpot"
        />
        <Cifra
          rotulo="Tickets abiertos"
          cifra={c.ticketsAbiertos !== null ? String(c.ticketsAbiertos) : "—"}
          detalle={c.ticketsAbiertos === null ? "HubSpot no da los tickets de esta cuenta" : "En HubSpot"}
          atencion={(c.ticketsAbiertos ?? 0) > 0}
        />
        <Cifra
          rotulo="Personas sin contacto"
          cifra={data.contactos.length ? `${frias.length} de ${data.contactos.length}` : "—"}
          detalle={data.contactos.length ? `más de ${DIAS_PERSONA_FRIA} días sin hablar` : "Sin personas en HubSpot"}
          atencion={frias.length > 0}
        />
      </section>

      <section className="flex flex-col gap-3">
        <TituloDeSeccion
          titulo="Reuniones"
          ayuda="Lo que se habló, lo que quedó y lo que preocupa, de la más nueva a la más vieja."
          derecha={
            data.minutes.length > 0 ? (
              <Segmentado
                etiqueta="Qué reuniones ver"
                valor={filtro}
                onCambio={setFiltro}
                opciones={[
                  { clave: "todas", etiqueta: "Todas", cuenta: data.minutes.length },
                  { clave: "riesgo", etiqueta: "Con riesgo", cuenta: conRiesgo.length, deshabilitada: conRiesgo.length === 0 && filtro !== "riesgo" },
                ]}
              />
            ) : undefined
          }
        />
        {data.minutes.length === 0 ? (
          <Vacio>Todavía no hay minutas de reuniones de esta cuenta.</Vacio>
        ) : reuniones.length === 0 ? (
          <Vacio>Ninguna de las últimas reuniones dejó un riesgo anotado.</Vacio>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {reuniones.map((m) => (
              <div key={m.sessionId} className="flex flex-col gap-1 px-4 py-3.5">
                <div className="flex justify-between gap-3">
                  <Link href={`/sessions/${m.sessionId}`} className="truncate text-sm font-semibold text-fg hover:text-brand">
                    {m.sessionTitle}
                  </Link>
                  <span className="whitespace-nowrap text-xs text-fg-muted">{fmtDia(m.date, data.hoy)}</span>
                </div>
                {m.summary && <span className="line-clamp-3 text-[13px] text-fg-secondary">{m.summary}</span>}
                {m.agreements.length > 0 && (
                  <span className="text-xs text-fg-secondary">
                    <b className="font-semibold">Quedó:</b> {m.agreements.map((a) => a.text).slice(0, 2).join(" · ")}
                  </span>
                )}
                {m.risks.length > 0 && <span className="text-xs text-warn-ink">Riesgo: {m.risks.map((r) => r.text).slice(0, 2).join(" · ")}</span>}
              </div>
            ))}
          </div>
        )}
        {data.minutes.length > 0 && <p className="text-xs text-fg-muted">Las últimas {plural(data.minutes.length, "reunión con minuta", "reuniones con minuta")}. Las demás están en la ficha del cliente.</p>}
      </section>

      <section className="flex flex-col gap-3">
        <TituloDeSeccion
          titulo={`Con quién hablamos${data.contactos.length ? ` · ${data.contactos.length}` : ""}`}
          ayuda="Las personas del cliente en HubSpot y cuándo fue el último contacto. Una cuenta que depende de una sola persona es frágil."
        />
        {data.contactos.length === 0 ? (
          <Vacio>HubSpot no tiene personas asociadas a esta empresa, o la copia de señales todavía no corrió.</Vacio>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px] gap-4 border-b border-line bg-surface-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                <span>Persona</span>
                <span>Cargo</span>
                <span>Último contacto</span>
              </div>
              {contactosOrdenados.map((x, i) => {
                const fria = !x.ultimoContacto || diasEntre(x.ultimoContacto, data.hoy) > DIAS_PERSONA_FRIA;
                return (
                  <div
                    key={(x.email ?? "") + x.nombre}
                    title={x.email ?? undefined}
                    className={cn("grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px] items-center gap-4 px-4 py-2.5 text-[13px]", i > 0 && "border-t border-line")}
                  >
                    <span className="truncate font-semibold text-fg">{x.nombre}</span>
                    <span className="truncate text-fg-secondary">{x.cargo ?? "—"}</span>
                    <span className={cn(fria ? "text-warn-ink" : "text-fg-muted")}>{x.ultimoContacto ? haceCuanto(x.ultimoContacto, data.hoy) : "sin contacto registrado"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

/**
 * PanelDeLaCuenta — la columna derecha de la ficha mientras se mira «Información del cliente»
 * (rediseño del 2026-10-04, sistema «Nexus · interfaz interna»). Lo pinta `ClientInfoPanel` por
 * portal; con el panel oculto no existe.
 *
 *  · «Qué sigue»: la propuesta de la IA sin revisar, la ficha sin confirmar, o una licencia que
 *    renueva en los próximos 90 días. En ese orden: lo primero bloquea lo que leen los agentes.
 *  · «Licencias»: cuántas hay y cuál renueva primero.
 *  · «La empresa»: dominios, industria y TAM, tal como los tiene Nexus.
 */
import { useEffect, useState } from "react";
import { QueSigue, BotonAzul, BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { EVENTO_FICHA_CAMBIO, camposPropuestos, type FichaGuardada } from "@/lib/clients/ficha";
import { NOMBRE_DEL_HUB, avisoDeRenovacion, type LicenciaDeHub } from "@/lib/cs/licencias";

interface Empresa {
  emailDomains: string[];
  industry: string | null;
  tamUsd: number | null;
}

function fechaLarga(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
}

export default function PanelDeLaCuenta({
  clientId,
  tabActual,
  onIrA,
}: {
  clientId: string;
  /** La subpestaña abierta: si el «Qué sigue» ya está a la vista, no lleva botón (el azul de la
   *  pantalla es el de confirmar la ficha). */
  tabActual: string;
  /** Lleva a una subpestaña (Ficha, Licencias…). */
  onIrA: (tab: "ficha" | "licencias") => void;
}) {
  const [ficha, setFicha] = useState<FichaGuardada | null>(null);
  const [licencias, setLicencias] = useState<{ lista: LicenciaDeHub[]; hoy: string } | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);

  useEffect(() => {
    let vivo = true;
    const cargarFicha = () =>
      fetch(`/api/clients/${clientId}/ficha`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { ficha?: FichaGuardada } | null) => {
          if (vivo && j?.ficha) setFicha(j.ficha);
        })
        .catch(() => {});
    void cargarFicha();
    fetch(`/api/clients/${clientId}/licencias`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { licencias?: LicenciaDeHub[]; hoy?: string } | null) => {
        if (vivo && j?.licencias && j.hoy) setLicencias({ lista: j.licencias, hoy: j.hoy });
      })
      .catch(() => {});
    fetch(`/api/clients/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Empresa | null) => {
        if (vivo && j) setEmpresa({ emailDomains: j.emailDomains ?? [], industry: j.industry ?? null, tamUsd: j.tamUsd ?? null });
      })
      .catch(() => {});
    const alCambiar = (e: Event) => {
      if ((e as CustomEvent<{ clientId?: string }>).detail?.clientId === clientId) void cargarFicha();
    };
    window.addEventListener(EVENTO_FICHA_CAMBIO, alCambiar);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_FICHA_CAMBIO, alCambiar);
    };
  }, [clientId]);

  const propuestos = ficha ? camposPropuestos(ficha).length : 0;
  const renovaciones = (licencias?.lista ?? [])
    .map((l) => ({ l, aviso: avisoDeRenovacion(l.renovacion, licencias!.hoy) }))
    .filter((x): x is { l: LicenciaDeHub; aviso: { dias: number; umbral: 90 | 60 | 30 } } => x.aviso !== null)
    .sort((a, b) => a.aviso.dias - b.aviso.dias);
  const proxima = renovaciones[0] ?? null;

  const queSigue = !ficha
    ? null
    : propuestos > 0
      ? {
          texto: `La IA propone cambios en ${propuestos} ${propuestos === 1 ? "campo" : "campos"} de la ficha. Revísalos: nada llega a HubSpot hasta que confirmes.`,
          accion: tabActual === "ficha" ? null : <BotonAzul onClick={() => onIrA("ficha")}>Revisar la ficha</BotonAzul>,
        }
      : !ficha.confirmadaAt
        ? {
            texto: "La ficha todavía no está confirmada. Es lo que leen los agentes en cada documento: complétala y confírmala.",
            accion: tabActual === "ficha" ? null : <BotonBlanco onClick={() => onIrA("ficha")}>Abrir la ficha</BotonBlanco>,
          }
        : proxima
          ? {
              texto: `${NOMBRE_DEL_HUB[proxima.l.hub]}${proxima.l.plan ? ` ${proxima.l.plan}` : ""} renueva el ${fechaLarga(proxima.l.renovacion!)} (en ${proxima.aviso.dias} ${proxima.aviso.dias === 1 ? "día" : "días"}).`,
              accion: tabActual === "licencias" ? null : <BotonBlanco onClick={() => onIrA("licencias")}>Ver las licencias</BotonBlanco>,
            }
          : null;

  return (
    <>
      {queSigue && <QueSigue accion={queSigue.accion ?? undefined}>{queSigue.texto}</QueSigue>}

      {licencias && (
        <section data-recorrido="info.licencias" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className={ROTULO_DEL_SISTEMA}>Licencias · {licencias.lista.length}</span>
            <button type="button" onClick={() => onIrA("licencias")} className="text-[11px] text-brand hover:text-brand-light">
              Ver
            </button>
          </div>
          {licencias.lista.length > 0 ? (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-3">
              {licencias.lista.map((l) => {
                const aviso = avisoDeRenovacion(l.renovacion, licencias.hoy);
                return (
                  <li key={l.hub} className="flex flex-col gap-0.5 py-2">
                    <span className="text-[13px] font-semibold text-fg">
                      {NOMBRE_DEL_HUB[l.hub]}
                      {l.plan && <span className="font-normal text-fg-secondary"> {l.plan}</span>}
                    </span>
                    <span className={`text-xs ${aviso ? "text-warn-ink" : "text-fg-muted"}`}>
                      {l.renovacion ? `Renueva el ${fechaLarga(l.renovacion)}${aviso ? ` · en ${aviso.dias} días` : ""}` : "Sin fecha de renovación"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] text-fg-muted">Sin licencias registradas.</p>
          )}
        </section>
      )}

      {empresa && (
        <section className="flex flex-col gap-2.5">
          <span className={ROTULO_DEL_SISTEMA}>La empresa</span>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px]">
            <dt className="text-fg-muted">Dominios</dt>
            <dd className={empresa.emailDomains.length ? "break-words text-fg" : "text-fg-muted"}>
              {empresa.emailDomains.length ? empresa.emailDomains.join(", ") : "Sin dominio: las reuniones se asignan por el título"}
            </dd>
            {empresa.industry && (
              <>
                <dt className="text-fg-muted">Industria</dt>
                <dd className="text-fg">{empresa.industry}</dd>
              </>
            )}
            <dt className="text-fg-muted">TAM</dt>
            <dd className={empresa.tamUsd === null ? "text-fg-muted" : "text-fg tabular-nums"}>
              {empresa.tamUsd === null ? "Sin estimar" : `US$${empresa.tamUsd.toLocaleString("es-CR")} al año`}
            </dd>
          </dl>
        </section>
      )}
    </>
  );
}

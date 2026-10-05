"use client";

/**
 * components/cs/account/PanelDeLaCuenta.tsx — el panel de contexto de la ficha (300 px, a la
 * derecha), igual en todas las pestañas: «Qué sigue», el equipo de los dos lados, las alertas vivas
 * (con resolver y descartar) y de dónde salen los datos.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { BotonTexto, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { diasEntre, fmtDia } from "@/lib/cs/formato";
import { cseDeLaCuenta } from "@/lib/cs/cartera-reglas";
import type { CsAccountData } from "@/lib/cs/load-account";
import { Avatar, Chip } from "../piezas";

const BOTON_AZUL = "inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover";

export default function PanelDeLaCuenta({ data }: { data: CsAccountData }) {
  const c = data.cuenta;
  const p = c.partner;
  const primero = data.motivos[0];
  const cse = cseDeLaCuenta(c);
  // Quien HubSpot todavía tiene como dueño pero está de baja en Nexus: se nombra para reasignarlo.
  const deBaja = [...new Set(c.proyectos.filter((x) => x.activo && x.cseDeBaja).map((x) => x.cseDeBaja as string))];

  return (
    <aside className="flex flex-col gap-6 border-t border-line bg-surface-muted px-5 py-6 lg:w-[300px] lg:flex-shrink-0 lg:border-l lg:border-t-0">
      <QueSigue
        accion={
          primero?.clave === "relacionPorVencer" && p?.enlacePortal ? (
            <a href={p.enlacePortal} target="_blank" rel="noreferrer" className={BOTON_AZUL}>
              Abrir el portal del cliente ↗
            </a>
          ) : primero && c.proyectos.some((x) => x.activo) ? (
            <Link href={`/clients/${c.clientId}`} className={BOTON_AZUL}>
              Abrir la ficha del cliente →
            </Link>
          ) : undefined
        }
      >
        {primero ? `${primero.texto}.` : "Nada pide atención en esta cuenta hoy."}
      </QueSigue>

      <section className="flex flex-col gap-2.5">
        <span className={ROTULO_DEL_SISTEMA}>Equipo</span>
        <div className="rounded-xl border border-line bg-surface px-3 py-1">
          <FilaDeEquipo etiqueta="CSE">
            {cse ? (
              <span className="flex items-center gap-1.5">
                {cse.nombre}
                <Avatar nombre={cse.nombre} />
              </span>
            ) : (
              <span className="text-right text-warn-ink">
                sin asignar
                {deBaja.length > 0 && <span className="block text-xs">en HubSpot sigue {deBaja.join(", ")}, que ya no está</span>}
              </span>
            )}
          </FilaDeEquipo>
          {(p?.csmHubspot || p?.growthHubspot || p?.contratosHubspot) && (
            <>
              <p className={cn(ROTULO_DEL_SISTEMA, "border-t border-line pb-0.5 pt-2")}>De HubSpot</p>
              {p?.csmHubspot && <FilaDeEquipo etiqueta="Customer Success">{p.csmHubspot}</FilaDeEquipo>}
              {p?.growthHubspot && <FilaDeEquipo etiqueta="Crecimiento">{p.growthHubspot}</FilaDeEquipo>}
              {p?.contratosHubspot && <FilaDeEquipo etiqueta="Contratos">{p.contratosHubspot}</FilaDeEquipo>}
            </>
          )}
        </div>
      </section>

      <Alertas data={data} />

      {/* Las personas del cliente y las apps de su portal viven en sus pestañas desde el 2026-10-05
          (Conversaciones y Adopción): el panel queda para lo que vale en cualquier pestaña. */}

      <section className="flex flex-col gap-2.5">
        <span className={ROTULO_DEL_SISTEMA}>De dónde salen los datos</span>
        <div className="flex flex-col gap-1.5 text-[13px]">
          <Fuente nombre="HubSpot Partner" at={data.partner?.fetchedAt ?? null} hoy={data.hoy} />
          <Fuente nombre="Señales de HubSpot" at={data.signals?.fetchedAt ?? null} hoy={data.hoy} />
          <span className="flex justify-between gap-2">
            <span className="text-fg-secondary">Cronogramas de Nexus</span>
            <span className="text-fg-muted">en vivo</span>
          </span>
          <Fuente nombre="Minutas de reuniones" at={data.minutes[0]?.date ?? null} hoy={data.hoy} viejoDespues={DIAS_MINUTA_VIEJA} />
        </div>
      </section>
    </aside>
  );
}

/** Una minuta de hace más de un mes ya no describe la cuenta. */
const DIAS_MINUTA_VIEJA = 30;

function FilaDeEquipo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
      <span className="text-fg-muted">{etiqueta}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}

function Fuente({ nombre, at, hoy, viejoDespues = 3 }: { nombre: string; at: string | null; hoy: string; viejoDespues?: number }) {
  const viejo = !at || diasEntre(at, hoy) > viejoDespues;
  return (
    <span className="flex justify-between gap-2">
      <span className="text-fg-secondary">{nombre}</span>
      <span className={viejo ? "text-warn-ink" : "text-fg-muted"}>{at ? fmtDia(at, hoy) : "sin datos"}</span>
    </span>
  );
}

const SEVERIDAD: Record<string, { texto: string; tono: "atencion" | "neutro" }> = {
  HIGH: { texto: "Alta", tono: "atencion" },
  MEDIUM: { texto: "Media", tono: "neutro" },
  LOW: { texto: "Baja", tono: "neutro" },
};

function Alertas({ data }: { data: CsAccountData }) {
  const toast = useToast();
  const router = useRouter();
  const [ocupada, setOcupada] = useState<string | null>(null);
  const alertas = data.cuenta.alertas;

  async function cerrar(id: string, status: "RESOLVED" | "DISMISSED") {
    setOcupada(id);
    try {
      await fetchJson(`/api/cs/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      toast.success(status === "RESOLVED" ? "Alerta resuelta." : "Alerta descartada.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cerrar la alerta.");
    } finally {
      setOcupada(null);
    }
  }

  return (
    <section className="flex flex-col gap-2.5" data-recorrido="cs.alertas">
      <span className={ROTULO_DEL_SISTEMA}>Alertas · {alertas.length}</span>
      {alertas.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Ninguna alerta abierta.</p>
      ) : (
        alertas.map((a) => {
          const s = SEVERIDAD[a.severidad] ?? SEVERIDAD.LOW;
          return (
            <div key={a.id} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-3">
              <span className="flex flex-wrap items-center gap-1.5">
                <Chip tono={s.tono}>{s.texto}</Chip>
                {a.delAgente && <Chip tono="ia">Agente vigía</Chip>}
                <span className="text-[13px] font-semibold text-fg">{a.titulo}</span>
              </span>
              {a.razon && <span className="line-clamp-3 text-xs text-fg-secondary">{a.razon}</span>}
              {a.accion && <span className="text-xs text-fg-muted">Sugiere: {a.accion}</span>}
              <span className="flex items-center gap-1">
                {a.proyecto && <span className="mr-auto truncate text-xs text-fg-muted">{a.proyecto}</span>}
                <span className={cn("flex gap-1", !a.proyecto && "ml-auto")}>
                  <BotonTexto onClick={() => cerrar(a.id, "DISMISSED")} disabled={ocupada === a.id}>
                    Descartar
                  </BotonTexto>
                  <BotonTexto onClick={() => cerrar(a.id, "RESOLVED")} disabled={ocupada === a.id} className="text-brand hover:text-brand-light">
                    Resolver
                  </BotonTexto>
                </span>
              </span>
            </div>
          );
        })
      )}
    </section>
  );
}

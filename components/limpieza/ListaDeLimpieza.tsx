"use client";

/**
 * components/limpieza/ListaDeLimpieza.tsx — la lista de limpieza de HubSpot, por responsable (2026-10-16, fase 0.5 de
 * docs/nexus-sistema-de-trabajo-plan.md). La arma lib/limpieza; esta pantalla solo la muestra.
 */
import Link from "next/link";
import { EmptyState, PageHeader, Table, type TableColumn } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import type { ArregloDeLimpieza, ListaDeUnResponsable, MotivoDeLimpieza } from "@/lib/limpieza/reglas";

const NOMBRE_DEL_MOTIVO: Record<MotivoDeLimpieza, string> = {
  "encargado-de-baja": "Encargado que ya no está",
  "sin-encargado": "Sin encargado",
  "servicio-sin-registrar": "Servicio sin proyecto",
  "etapa-quieta": "Etapa quieta",
  "sin-actividad": "Sin actividad",
};

const COLUMNAS: TableColumn<ArregloDeLimpieza>[] = [
  {
    key: "cuenta",
    header: "Cuenta",
    width: "w-56",
    sortValue: (a) => a.cliente,
    render: (a) => (
      <span className="flex min-w-0 flex-col">
        <Link href={`/clients/${encodeURIComponent(a.clientId)}`} className="truncate text-fg hover:underline">
          {a.cliente}
        </Link>
        {a.proyecto && <span className="truncate text-xs text-fg-muted">{a.proyecto}</span>}
      </span>
    ),
  },
  { key: "motivo", header: "Qué pasa", width: "w-44", sortValue: (a) => NOMBRE_DEL_MOTIVO[a.motivo], render: (a) => <span className="text-fg-secondary">{NOMBRE_DEL_MOTIVO[a.motivo]}</span> },
  {
    key: "detalle",
    header: "Detalle",
    render: (a) => (
      <span className="flex flex-col gap-0.5 whitespace-normal">
        <span className="text-fg">{a.texto}</span>
        <span className="text-xs text-fg-muted">{a.queHacer}</span>
      </span>
    ),
  },
  {
    key: "abrir",
    header: "",
    width: "w-36",
    align: "right",
    render: (a) =>
      a.hubspotUrl ? (
        <a href={a.hubspotUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand hover:underline">
          Abrir en HubSpot ↗
        </a>
      ) : (
        <Link href={`/clients/${encodeURIComponent(a.clientId)}`} className="text-xs font-medium text-brand hover:underline">
          Abrir la cuenta
        </Link>
      ),
  },
];

export function ListaDeLimpieza({ grupos, contenedor }: { grupos: ListaDeUnResponsable[]; contenedor: string }) {
  const total = grupos.reduce((n, g) => n + g.arreglos.length, 0);
  const porMotivo = new Map<MotivoDeLimpieza, number>();
  for (const g of grupos) for (const a of g.arreglos) porMotivo.set(a.motivo, (porMotivo.get(a.motivo) ?? 0) + 1);

  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title="Limpieza de HubSpot"
        crumbs={[{ label: "Éxito del cliente", href: "/customer-success" }, { label: "Limpieza de HubSpot" }]}
        description="Lo que hay que poner al día en HubSpot, por quién lo tiene que hacer. Se arregla en HubSpot y la siguiente sincronización lo trae: Nexus usa estos datos para saber de quién es cada cuenta y en qué etapa va."
      />

      {total === 0 ? (
        <EmptyState title="HubSpot está al día" description="Ningún proyecto a nombre de alguien que se fue, quieto en su etapa o sin actividad." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(ROTULO_DEL_SISTEMA, "mr-1")}>{total === 1 ? "1 cosa" : `${total} cosas`}</span>
            {[...porMotivo].map(([m, n]) => (
              <span key={m} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-fg-secondary">
                {NOMBRE_DEL_MOTIVO[m]} · {n}
              </span>
            ))}
          </div>
          {grupos.map((g) => (
            <section key={g.responsable.email ?? "nadie"} className="space-y-2">
              <h2 className="text-sm font-semibold text-fg">
                {g.responsable.nombre ?? "Sin responsable"}
                <span className="ml-2 font-normal text-fg-muted">
                  {g.arreglos.length} · {g.responsable.porQue === "lider" ? "lidera el sprint" : "es el encargado"}
                </span>
              </h2>
              <Table variante="sistema" columns={COLUMNAS} rows={g.arreglos} rowKey={(a) => a.clave} />
            </section>
          ))}
        </>
      )}
    </div>
  );
}

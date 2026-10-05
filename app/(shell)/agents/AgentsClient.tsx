"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMe } from "@/hooks/useMe";
import {
  Button,
  Card,
  buttonVariants,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Table,
  type TableColumn,
} from "@/components/ui";
import {
  AGENT_CATEGORIES,
  categorizeAgent,
  agentTriggerHint,
  type AgentCategoryKey,
} from "@/lib/agents/catalog";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "DRAFT";
  scope: "CLIENT" | "GLOBAL";
  agentType: string;
  agentGroup: string | null;
  outputType: string;
  associatedStages: number[];
  createdAt: Date;
  _count: { runs: number };
}

/**
 * Cuándo corrió por última vez, en palabras. «Nunca» no es un hueco: es el dato.
 *
 * ⚠ Lo mide contra el reloj del browser y a propósito: la fecha llega en ISO desde el servidor y
 * acá solo se dice «hace cuánto». Sin esto la columna mostraba un timestamp que nadie compara.
 */
function haceCuanto(iso: string | undefined): string {
  if (!iso) return "Nunca";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 60) return `hace ${Math.round(dias / 7)} sem`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export interface UltimoErrorDeAgente {
  /** `null` en una corrida cuyo agente se borró: el error igual se muestra, sin enlace. */
  agentId: string | null;
  nombre: string;
  cuando: string;
}

export default function AgentsClient({
  agents,
  ultimaCorrida,
  corriendo,
  ultimoError,
}: {
  agents: Agent[];
  /** `agentId` → ISO de su última corrida. Sin entrada = nunca corrió. */
  ultimaCorrida: Record<string, string>;
  corriendo: number;
  ultimoError: UltimoErrorDeAgente | null;
}) {
  const router = useRouter();
  const me = useMe();
  // Administrar agentes = celda agentes.manage del mapa efectivo (delegable por
  // plantilla; SA la tiene por all-true). Antes era isSuperAdmin, que ocultaba la UI
  // aunque el endpoint (withPermission("agentes","manage")) ya se lo permitiera al rol.
  const isSuperAdmin = me?.permissions?.sections?.agentes?.manage === true;
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);

  async function handleDelete() {
    if (!confirmTarget) return;
    await fetch(`/api/agents/${confirmTarget.id}`, { method: "DELETE" });
    setConfirmTarget(null);
    router.refresh();
  }

  /**
   * Los que NUNCA corrieron salen de las categorías y van a un bloque propio al final.
   *
   * Medido el 2026-10-05: nueve de los 34 — más de un cuarto del catálogo — con cero corridas, y
   * repartidos entre las categorías se veían exactamente igual que el clasificador de sesiones,
   * que lleva 2.052. Mezclados, el catálogo miente sobre lo que Nexus hace de verdad; juntos, son
   * una lista corta sobre la que alguien puede decidir si siguen esperando o se retiran.
   */
  const nuncaCorrieron = useMemo(() => agents.filter((a) => a._count.runs === 0), [agents]);

  // Agrupar por categoría, en el orden curado, omitiendo las vacías.
  const groups = useMemo(() => {
    const byKey = new Map<AgentCategoryKey, Agent[]>();
    for (const a of agents) {
      if (a._count.runs === 0) continue;
      const key = categorizeAgent(a);
      const list = byKey.get(key) ?? [];
      list.push(a);
      byKey.set(key, list);
    }
    return AGENT_CATEGORIES.map((cat) => ({ cat, rows: byKey.get(cat.key) ?? [] })).filter(
      (g) => g.rows.length > 0,
    );
  }, [agents]);

  const columns: TableColumn<Agent>[] = [
    {
      key: "agent",
      header: "Agente",
      sortValue: (a) => a.name,
      render: (a) => (
        <Table.IdentityCell
          leading={
            <Card.Icon color={a.status === "ACTIVE" ? "brand" : "gray"}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </Card.Icon>
          }
          primary={a.name}
          secondary={a.description ?? undefined}
        />
      ),
    },
    {
      key: "trigger",
      header: "Disparo",
      sortValue: (a) => agentTriggerHint(a),
      width: "w-48",
      hideOnMobile: true,
      render: (a) => <span className="text-fg-muted">{agentTriggerHint(a)}</span>,
    },
    {
      key: "runs",
      header: "Corridas",
      sortValue: (a) => a._count.runs,
      align: "right",
      width: "w-28",
      /* Cero corridas no es un cero más: es el único dato que distingue un agente que trabaja
         de uno que nunca arrancó, y los 34 se veían igual porque todos dicen «Activo». */
      render: (a) =>
        a._count.runs === 0 ? (
          <span className="text-fg-muted">Nunca</span>
        ) : (
          <span className="tabular-nums font-medium text-fg">{a._count.runs.toLocaleString("es-CR")}</span>
        ),
    },
    {
      key: "ultima",
      header: "Última",
      sortValue: (a) => (ultimaCorrida[a.id] ? new Date(ultimaCorrida[a.id]) : null),
      align: "right",
      width: "w-32",
      hideOnMobile: true,
      render: (a) => (
        <span
          className={ultimaCorrida[a.id] ? "whitespace-nowrap text-fg-secondary" : "text-fg-muted"}
          title={ultimaCorrida[a.id] ? new Date(ultimaCorrida[a.id]).toLocaleString("es-ES") : undefined}
        >
          {haceCuanto(ultimaCorrida[a.id])}
        </span>
      ),
    },
    ...(isSuperAdmin
      ? ([
          {
            key: "actions",
            header: "",
            align: "right",
            width: "w-24",
            render: (a) => (
              <Button
                variant="destructive"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmTarget({ id: a.id, name: a.name });
                }}
              >
                Eliminar
              </Button>
            ),
          },
        ] as TableColumn<Agent>[])
      : []),
  ];

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Agentes IA"
        description="Catálogo de agentes. Se ejecutan desde su canvas en el proyecto o automáticamente al sincronizar sesiones — no desde aquí."
        action={
          isSuperAdmin ? (
            <Link href="/agents/new" className={buttonVariants({ variant: "primary", size: "md" })}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo agente
            </Link>
          ) : undefined
        }
      />

      {/* ── QUÉ ESTÁ PASANDO, ANTES DEL CATÁLOGO ──────────────────────────────
          La pregunta que trae alguien a esta pantalla no es «¿qué agentes hay?» sino «¿sigue
          andando?» y «¿se rompió algo?». Hasta hoy la segunda solo se contestaba entrando a un
          agente y abriendo su historial de corridas. */}
      {agents.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-info-line bg-info-surface px-4 py-3.5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">
                {corriendo === 0
                  ? "Nada corriendo ahora"
                  : `${corriendo} corriendo ahora`}
              </p>
              <p className="text-xs text-fg-secondary">
                {agents.length} agentes en el catálogo
              </p>
            </div>
          </div>

          {ultimoError ? (
            <div className="rounded-xl border border-danger-line bg-danger-surface px-4 py-3.5 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg truncate">Lo último que falló</p>
                <p className="text-xs text-danger-ink truncate">
                  {ultimoError.nombre} · {haceCuanto(ultimoError.cuando)}
                </p>
              </div>
              {ultimoError.agentId && (
                <Link
                  href={`/agents/${ultimoError.agentId}`}
                  className="flex-shrink-0 text-[13px] font-semibold text-brand hover:text-brand-light"
                >
                  Ver
                </Link>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-success-line bg-success-surface px-4 py-3.5 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">Ninguno falló</p>
                <p className="text-xs text-success-ink">No hay corridas con error</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-line bg-surface px-4 py-3.5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-fg-muted flex-shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">
                {nuncaCorrieron.length === 0
                  ? "Todos corrieron alguna vez"
                  : `${nuncaCorrieron.length} nunca corrieron`}
              </p>
              <p className="text-xs text-fg-muted">
                {nuncaCorrieron.length === 0
                  ? "El catálogo entero está en uso"
                  : `De ${agents.length} del catálogo`}
              </p>
            </div>
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
          title="Sin agentes aún"
          description="Crea tu primer agente para automatizar pasos del proceso de consultoría con IA."
          action={
            isSuperAdmin ? (
              <Link href="/agents/new" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Crear agente
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map(({ cat, rows }) => (
            <section key={cat.key}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-fg">{cat.label}</h2>
                <span className="text-xs tabular-nums text-fg-muted">{rows.length}</span>
              </div>
              <p className="mb-3 text-xs text-fg-muted">{cat.description}</p>
              <Table
                columns={columns}
                rows={rows}
                rowKey={(a) => a.id}
                onRowClick={(a) => router.push(`/agents/${a.id}`)}
                initialSort={{ key: "agent", dir: "asc" }}
              />
            </section>
          ))}

          {/* No se apagan solos: alguien decide si siguen esperando o se retiran. Pero primero
              hay que poder verlos, y mezclados entre los que trabajan son invisibles. */}
          {nuncaCorrieron.length > 0 && (
            <section>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-fg">Nunca corrieron</h2>
                <span className="text-xs tabular-nums text-fg-muted">{nuncaCorrieron.length}</span>
              </div>
              <p className="mb-3 text-xs text-fg-muted">
                Están activos y nadie los disparó todavía. Siguen acá hasta que se decida si
                esperan o se retiran.
              </p>
              <div className="rounded-xl border border-dashed border-line bg-surface-muted p-4 flex flex-wrap gap-2">
                {nuncaCorrieron.map((a) => (
                  <Link
                    key={a.id}
                    href={`/agents/${a.id}`}
                    className="text-[13px] text-fg-secondary bg-surface border border-line rounded-full px-3 py-1 hover:border-brand/40 hover:text-fg transition-colors"
                    title={a.description ?? undefined}
                  >
                    {a.name}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        onConfirm={handleDelete}
        onCancel={() => setConfirmTarget(null)}
        title="¿Eliminar agente?"
        description={
          confirmTarget
            ? `"${confirmTarget.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Eliminar"
      />
    </div>
  );
}

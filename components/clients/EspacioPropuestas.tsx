/**
 * EspacioPropuestas — lo que se abre al entrar a un PROSPECTO.
 *
 * Un prospecto no compró nada: no tiene proyectos, ni cronograma, ni canvas de ejecución.
 * Lo único que existe de él son sus **propuestas comerciales** (los business cases), y por
 * eso es lo único que esta pantalla muestra.
 *
 * Antes caía en el workspace de proyectos como cualquier cliente: Nexus le creaba un
 * "proyecto de estrategia" al entrar —a una empresa que no compró— y la persona quedaba
 * mirando un rail vacío con un desplegable de canvas que no aplicaba, sin nada que le dijera
 * que estaba en el lugar equivocado. El destino ahora lo decide la categoría, en
 * `lib/clients/kind.ts` (`ESPACIO_POR_CATEGORIA`).
 *
 * Server component: consulta y pinta. No hay estado.
 */
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Badge, EmptyState } from "@/components/ui";
import { resolveBcType } from "@/lib/business-cases/case-types";
import { hubspotCompanyUrl } from "@/lib/hubspot/urls";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
};

export default async function EspacioPropuestas({
  clientId,
  clientName,
  /** `ventas.read` EFECTIVO, resuelto por la page. Sin él, la propuesta no se puede abrir. */
  puedeVerVentas,
}: {
  clientId: string;
  clientName: string;
  puedeVerVentas: boolean;
}) {
  /* Las propuestas viven ENTERAS en el portal del SISTEMA (el CRM de Smarteam) — es donde
     Ventas crea a los prospectos. Por eso el link a la empresa se arma contra ese portal y
     nunca contra el que el cliente pudo haber conectado, donde esta empresa no existe. Misma
     regla que el hub de /business-cases. */
  const [propuestas, systemAccount, client] = await Promise.all([
    prisma.businessCase.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        caseType: true,
        approvedAt: true,
        publishedAt: true,
        updatedAt: true,
        hubspotCompanyId: true,
      },
    }),
    prisma.hubspotAccount.findFirst({
      where: { isSystem: true },
      select: { hubspotPortalId: true },
    }),
    prisma.client.findUnique({ where: { id: clientId }, select: { hubspotCompanyId: true } }),
  ]);

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-fg">Propuestas</h2>
          <p className="text-xs text-fg-muted mt-0.5">
            {propuestas.length === 0
              ? "Todavía no hay ninguna."
              : `${propuestas.length} propuesta${propuestas.length !== 1 ? "s" : ""} de ${clientName}.`}
          </p>
        </div>
        {puedeVerVentas && (
          <Link
            href="/business-cases/new"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
          >
            Nueva propuesta
          </Link>
        )}
      </div>

      {propuestas.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Sin propuestas todavía"
          description={
            puedeVerVentas
              ? "Un prospecto se trabaja desde su propuesta comercial. Cuando exista, aparece acá; " +
                "si compra, se re-clasifica como cliente y esta empresa pasa a tener proyectos."
              : "Las propuestas comerciales las gestiona Ventas. Esta empresa todavía no tiene ninguna."
          }
          action={
            puedeVerVentas ? (
              <Link
                href="/business-cases/new"
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/15 text-brand hover:bg-brand/25 transition-colors"
              >
                Crear la primera
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {propuestas.map((p) => {
            const tipo = resolveBcType(p.caseType);
            const empresaUrl = hubspotCompanyUrl(
              systemAccount?.hubspotPortalId,
              p.hubspotCompanyId ?? client?.hubspotCompanyId,
            );
            const fila = (
              <>
                <p className="text-sm font-medium text-fg truncate">{p.name}</p>
                <p className="text-xs text-fg-muted truncate">
                  Actualizada el{" "}
                  {p.updatedAt.toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </>
            );
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 hover:border-brand/40 transition-colors"
              >
                {/* Sin `ventas.read` la fila NO enlaza: /business-cases/[id] redirige a
                    /clients, y un link que rebota se lee como que la app está rota. */}
                {puedeVerVentas ? (
                  <Link href={`/business-cases/${p.id}`} className="flex-1 min-w-0">
                    {fila}
                  </Link>
                ) : (
                  <div className="flex-1 min-w-0">{fila}</div>
                )}
                <span className="flex-shrink-0 w-28 hidden sm:block">
                  <Badge variant={tipo.tone} size="xs">
                    {tipo.shortLabel}
                  </Badge>
                </span>
                {/* Fuera del <Link>: un <a> dentro de otro <a> es HTML inválido. */}
                <span className="flex-shrink-0 w-24 hidden sm:block">
                  {empresaUrl && (
                    <a
                      href={empresaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver empresa en HubSpot"
                      aria-label={`Ver ${clientName} en HubSpot`}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-line text-fg-muted hover:text-brand hover:border-brand/40 hover:bg-brand/5 transition-colors"
                    >
                      HubSpot
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </span>
                <span className="flex-shrink-0 w-24">
                  {/* "Aprobada" pisa a "Publicado": una vez que el cliente dijo que sí, saber
                      que además está publicada no le cambia el próximo paso a nadie. */}
                  {p.approvedAt ? (
                    <span
                      className="text-xs px-2 py-1 rounded bg-success-surface text-success-ink border border-success-line"
                      title={`El cliente la aprobó el ${p.approvedAt.toLocaleDateString("es-ES")}`}
                    >
                      ✓ Aprobada
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded bg-surface-muted text-fg-muted">
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

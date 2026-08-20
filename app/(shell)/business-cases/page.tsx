/**
 * /business-cases — hub del área de Ventas: lista todos los business cases
 * (prospectos y clientes) + "Nuevo". Gateado por el área de Ventas (VENTAS/DEV/CSL/SUPER_ADMIN).
 */
import { redirect } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import Link from "next/link";
import { requireInternalUser } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import DeleteBusinessCaseButton from "@/components/business-cases/DeleteBusinessCaseButton";
import { can } from "@/lib/auth/permissions/engine";
import { resolveBcType } from "@/lib/business-cases/case-types";
import { hubspotCompanyUrl } from "@/lib/hubspot/urls";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
};

export default async function BusinessCasesHubPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");

  /* Las propuestas viven ENTERAS en el portal del sistema (el CRM de Smarteam): tanto el alta
     desde empresa como el lookup y la generación usan `getSystemHubspotClient`. Por eso el link
     a la empresa se arma contra ese portal y no contra el que el cliente pudo haber conectado
     (ese es el CRM del cliente, donde esta empresa no existe). Una sola query para toda la
     lista — el id del portal es constante. */
  const [cases, systemAccount] = await Promise.all([
    prisma.businessCase.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        caseType: true,
        // El cliente aprobó desde la propia propuesta (sin login). Es el dato que Ventas
        // busca al abrir esta lista, así que gana la celda de estado.
        approvedAt: true,
        // La empresa del CASO manda sobre la del cliente: es la que se eligió al crearlo.
        hubspotCompanyId: true,
        client: { select: { name: true, kind: true, hubspotCompanyId: true } },
      },
    }),
    prisma.hubspotAccount.findFirst({
      where: { isSystem: true },
      select: { hubspotPortalId: true },
    }),
  ]);

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Ventas — Propuestas comerciales"
        description="Casos de negocio para prospectos y clientes."
        action={
          <div className="flex items-center gap-3">
            <Link href="/sales/use-cases" className="text-xs text-fg-muted hover:text-fg">
              Catálogo de casos de uso
            </Link>
            <Link
              href="/business-cases/new"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
            >
              Nueva propuesta
            </Link>
          </div>
        }
      />

      <div className="space-y-2">
        {cases.map((c) => {
          const tipo = resolveBcType(c.caseType);
          const empresaUrl = hubspotCompanyUrl(
            systemAccount?.hubspotPortalId,
            c.hubspotCompanyId ?? c.client.hubspotCompanyId,
          );
          return (
          <div
            key={c.id}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 hover:border-brand/40 transition-colors"
          >
            <Link href={`/business-cases/${c.id}`} className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fg truncate">{c.name}</p>
              <p className="text-xs text-fg-muted truncate">
                {c.client.name}
                {c.client.kind === "PROSPECTO" ? " (prospecto)" : ""}
              </p>
            </Link>
            {/* COLUMNAS de ancho fijo, no píldoras que se empujan entre sí. Con anchos libres, el
                tipo ("Integración" vs "HubSpot") corría el estado y el basurero fila por fila, y
                la tira dejaba de leerse en vertical. El tipo es TAG —descripción de la propuesta—
                y por eso NO enlaza: la píldora que enlaza es la de HubSpot y dice a dónde lleva.
                Confundirlos ya pasó: una propuesta de tipo "Sitio web" mostraba «Sitio web ↗» y
                abría la empresa en HubSpot. */}
            <span className="flex-shrink-0 w-28 hidden sm:block">
              <Badge variant={tipo.tone} size="xs">
                {tipo.shortLabel}
              </Badge>
            </span>
            {/* Las píldoras que siguen viven FUERA del <Link> de la fila: la de HubSpot es un <a>,
                y un <a> dentro de otro <a> es HTML inválido — el navegador parte el DOM. El área
                clickeable de la fila no se achica: el Link sigue siendo `flex-1`. */}
            <span className="flex-shrink-0 w-24 hidden sm:block">
              {/* Sin empresa vinculada (o sin el portal del sistema) la celda queda VACÍA, no
                  colapsada: un `/company/undefined` da un 404 en HubSpot que se lee como falta de
                  permisos, y una celda que desaparece corre toda la fila. */}
              {empresaUrl && (
                <a
                  href={empresaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver empresa en HubSpot"
                  aria-label={`Ver ${c.client.name} en HubSpot`}
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
              {/* "Aprobada" pisa a "Publicado": una vez que el cliente dijo que sí, saber que
                  además está publicada no le cambia el próximo paso a nadie. */}
              {c.approvedAt ? (
                <span className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ✓ Aprobada
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded bg-surface-muted text-fg-muted">
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              )}
            </span>
            <DeleteBusinessCaseButton
              bcId={c.id}
              description={`Se eliminará "${c.name}" (${c.client.name}) con todos sus casos de uso, secciones y contenido. Esta acción no se puede deshacer.`}
            />
          </div>
          );
        })}
        {cases.length === 0 && (
          <p className="text-sm text-fg-muted">No hay propuestas todavía. Creá la primera.</p>
        )}
      </div>
    </div>
  );
}

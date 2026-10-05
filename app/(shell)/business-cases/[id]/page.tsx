/**
 * /business-cases/[id] — la ficha de una propuesta (rediseño del 2026-10-05).
 *
 * Con el MISMO caparazón que la ficha del cliente y la de la preventa: la cabecera de la ficha a
 * todo el ancho (components/layout/CabeceraDeFicha.tsx) y debajo el lienzo de tres pasos
 * (BusinessCaseWorkspace). El paso con el que abre: el de `?paso=`, o el que toca por su estado
 * —el Contexto si todavía no se generó ninguna, la Propuesta si ya hay—.
 * Gateada por `ventas.read`; editar pide `ventas.write`.
 */
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
/* El envoltorio y no el workspace: el proveedor del aplicador del chat tiene que ser ANCESTRO del
   editor, y esta página es de servidor. Ver `PropuestaConChat`. */
import PropuestaConChat from "@/components/business-cases/PropuestaConChat";
import DeleteBusinessCaseButton from "@/components/business-cases/DeleteBusinessCaseButton";
import { AccionDeCabecera, CabeceraDeFicha } from "@/components/layout/CabeceraDeFicha";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import { getBrandLogos, brandLogoMap } from "@/lib/external/smarteam-logo";
import { hubspotCompanyUrl, hubspotDealUrl } from "@/lib/hubspot/urls";
import type { PasoDeLaPropuesta } from "@/components/propuestas/PasosDeLaPropuesta";

export const dynamic = "force-dynamic";

const PASOS: readonly PasoDeLaPropuesta[] = ["contexto", "propuesta", "compartir"];

/** Los chips de la cabecera, como en la ficha de la preventa: píldoras blancas con borde, de 12 px. */
const CLASE_DE_CHIP =
  "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-[3px] text-xs font-medium text-fg-secondary";

export default async function PropuestaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paso?: string }>;
}) {
  const [{ id }, { paso }] = await Promise.all([params, searchParams]);
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");
  const puedeEditar = await can(ctx.teamMember, "ventas", "write");

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      publishedAt: true,
      hubspotDealId: true,
      hubspotCompanyId: true,
      caseType: true,
      caseSubtype: true,
      language: true,
      client: { select: { id: true, name: true, kind: true, logoUrl: true, logoDarkUrl: true, logoScale: true, hubspotCompanyId: true } },
    },
  });
  if (!bc) notFound();

  const [brandLogos, v0, generadas, portal] = await Promise.all([
    // Logos de marca (Smarteam + HubSpot + Insider One): el hero los pinta en la fila de marcas.
    getBrandLogos(),
    // Tipo y plantilla (columna → __meta del v0 → hubspot por defecto).
    prisma.projectCanvas.findFirst({ where: { businessCaseId: id, version: 0 }, select: { sections: true } }),
    prisma.projectCanvas.count({ where: { businessCaseId: id, version: { gt: 0 } } }),
    prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { hubspotPortalId: true } }),
  ]);
  const resolved = resolveCaseTypeFor(bc, v0?.sections);
  const subtipo = resolved.caseSubtype
    ? (resolved.typeDef.subtypes?.find((s) => s.id === resolved.caseSubtype)?.label ?? resolved.caseSubtype)
    : null;
  const pasoInicial: PasoDeLaPropuesta = PASOS.includes(paso as PasoDeLaPropuesta)
    ? (paso as PasoDeLaPropuesta)
    : generadas > 0
      ? "propuesta"
      : "contexto";
  const empresaUrl = hubspotCompanyUrl(portal?.hubspotPortalId, bc.hubspotCompanyId ?? bc.client.hubspotCompanyId);
  const tratoUrl = hubspotDealUrl(portal?.hubspotPortalId, bc.hubspotDealId);

  return (
    <div className="flex min-h-screen flex-col">
      <CabeceraDeFicha
        volver={{ href: "/business-cases", etiqueta: "Propuestas" }}
        titulo={bc.name}
        chips={
          <>
            <span className={CLASE_DE_CHIP}>
              {bc.client.name}
              {bc.client.kind === "PROSPECTO" ? " · prospecto" : ""}
            </span>
            <span className={CLASE_DE_CHIP}>
              {resolved.typeDef.shortLabel}
              {subtipo ? ` · ${subtipo}` : ""}
            </span>
          </>
        }
        acciones={
          <>
            {bc.client.kind === "CLIENTE" && (
              <AccionDeCabecera href={`/clients/${bc.client.id}`} title="La ficha del cliente">
                Ver ficha del cliente
              </AccionDeCabecera>
            )}
            {empresaUrl && (
              <AccionDeCabecera href={empresaUrl} externa title="La empresa en HubSpot">
                Abrir en HubSpot ↗
              </AccionDeCabecera>
            )}
            {puedeEditar && (
              <DeleteBusinessCaseButton
                bcId={bc.id}
                redirectTo="/business-cases"
                description={`Se borrará «${bc.name}» de ${bc.client.name} con todas sus versiones. Esto no se puede deshacer.`}
              />
            )}
          </>
        }
      />
      <PropuestaConChat
        bcId={bc.id}
        clientId={bc.client.id}
        clientName={bc.client.name}
        clientLogoUrl={bc.client.logoUrl}
        clientLogoDarkUrl={bc.client.logoDarkUrl}
        clientLogoScale={bc.client.logoScale}
        smarteamLogoUrl={brandLogos.smarteam}
        brandLogos={brandLogoMap(brandLogos)}
        status={bc.status}
        publishedAt={bc.publishedAt ? bc.publishedAt.toISOString() : null}
        templateId={resolved.templateId}
        language={bc.language}
        pasoInicial={pasoInicial}
        puedeEditar={puedeEditar}
        tratoUrl={tratoUrl}
      />
    </div>
  );
}

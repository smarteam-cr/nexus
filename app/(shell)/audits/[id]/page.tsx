/**
 * /audits/[id] — la ficha de una auditoría del portal de HubSpot.
 *
 * Con el caparazón de las fichas (diseño del 2026-10-04): la cabecera de la ficha a todo el ancho y,
 * debajo, el lienzo en tres columnas (secciones, la sección abierta y el panel). Todo lo que la
 * pantalla muestra lo decide `armarVista` (lib/auditoria-portal/vista.ts): la página solo lee. Una
 * auditoría de la versión anterior se muestra en solo lectura (`leerFotoAnterior`).
 * Gateada por `auditoria.read` y, si es el portal de un cliente, por el acceso a ese cliente.
 */
import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui";
import { CabeceraDeFicha, AccionDeCabecera } from "@/components/layout/CabeceraDeFicha";
import FichaDeAuditoria from "@/components/auditoria/FichaDeAuditoria";
import AccionesDeLaAuditoria from "@/components/auditoria/AccionesDeLaAuditoria";
import { Chip } from "@/components/auditoria/piezas";
import { requireAccessToClient } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions/engine";
import { ForbiddenError, requireInternalUser, UnauthorizedError } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import FotoAnteriorDeAuditoria from "@/components/auditoria/FotoAnterior";
import { leerFoto } from "@/lib/auditoria-portal/foto";
import { leerFotoAnterior, ROTULO_DE_LA_VERSION_ANTERIOR } from "@/lib/auditoria-portal/foto-anterior";
import { armarVista, type AuditoriaAnterior } from "@/lib/auditoria-portal/vista";

export const dynamic = "force-dynamic";

const VOLVER = { href: "/audits", etiqueta: "Auditorías" };

export default async function AuditoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  if (!(await can(ctx.teamMember, "auditoria", "read"))) redirect("/clients");

  const audit = await prisma.audit.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      clientId: true,
      accountId: true,
      data: true,
      createdAt: true,
      client: { select: { name: true } },
      account: { select: { isSystem: true, hubspotPortalId: true, hubName: true } },
    },
  });
  if (!audit) notFound();
  if (audit.clientId) {
    try {
      await requireAccessToClient(audit.clientId);
    } catch (e) {
      if (e instanceof UnauthorizedError) redirect("/");
      if (e instanceof ForbiddenError) redirect("/audits");
      throw e;
    }
  }
  const puedeBorrar = await can(ctx.teamMember, "auditoria", "delete");
  const esDelSistema = audit.account?.isSystem ?? !audit.clientId;
  const titulo = esDelSistema ? "Portal de Smarteam" : (audit.client?.name ?? "Portal de un cliente");

  const foto = leerFoto(audit.data);

  // Una foto de antes del rediseño (2026-10-04) no tiene inventario ni registro de lecturas: sus
  // números pueden ser ceros falsos. No se migra ni se reescribe, pero lo que guardó (totales,
  // embudos, propietarios e insights de la IA, que ya se pagaron) se sigue viendo, en SOLO LECTURA
  // y con el rótulo que lo dice (lib/auditoria-portal/foto-anterior.ts).
  if (!foto) {
    const anterior = leerFotoAnterior(audit.data);
    return (
      <div className="flex min-h-screen flex-col">
        <CabeceraDeFicha
          volver={VOLVER}
          titulo={titulo}
          chips={
            <>
              <Chip>{audit.name}</Chip>
              <Chip title="Se muestra tal como quedó guardada">Versión anterior · solo lectura</Chip>
            </>
          }
          acciones={<AccionesDeLaAuditoria auditId={audit.id} clientId={audit.clientId} puedeBorrar={puedeBorrar} versionAnterior />}
        />
        {anterior ? (
          <FotoAnteriorDeAuditoria foto={anterior} />
        ) : (
          <div className="max-w-3xl px-6 py-8">
            <Alert variant="warning" title={ROTULO_DE_LA_VERSION_ANTERIOR}>
              Esta auditoría no guardó datos que se puedan mostrar. Vuelve a correrla para ver el portal completo, la configuración y el análisis nuevo.
            </Alert>
          </div>
        )}
      </div>
    );
  }
  const acciones = <AccionesDeLaAuditoria auditId={audit.id} clientId={audit.clientId} puedeBorrar={puedeBorrar} />;

  // Las tres anteriores del mismo portal, para ver cómo cambió.
  const previas = audit.accountId
    ? await prisma.audit.findMany({
        where: { accountId: audit.accountId, id: { not: audit.id }, createdAt: { lt: audit.createdAt } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, createdAt: true, data: true },
      })
    : [];
  const anteriores: AuditoriaAnterior[] = previas.map((p) => ({
    id: p.id,
    fecha: p.createdAt.toISOString(),
    contactos: leerFoto(p.data)?.lifecycleStats?.totalContacts ?? null,
  }));

  const portalId = foto.cuenta?.portalId != null ? String(foto.cuenta.portalId) : (audit.account?.hubspotPortalId ?? null);
  const vista = armarVista({
    audit: { id: audit.id, name: audit.name },
    foto,
    portal: { titulo, esDelSistema, portalId, dominio: foto.cuenta?.uiDomain ?? null },
    anteriores,
  });

  return (
    <div className="flex min-h-screen flex-col">
      <CabeceraDeFicha
        volver={VOLVER}
        titulo={titulo}
        chips={
          <>
            <Chip title="Cuándo se leyó el portal">
              {new Date(foto.capturedAt ?? foto.iniciadaEn).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
            </Chip>
            {portalId && <Chip title="El id del portal en HubSpot">Portal {portalId}</Chip>}
            <Chip title="Con qué conexión se leyó">{esDelSistema ? "Cuenta del sistema" : "Conexión del cliente"}</Chip>
          </>
        }
        acciones={
          <>
            {audit.clientId && (
              <AccionDeCabecera href={`/clients/${audit.clientId}`} title="La ficha del cliente, con sus proyectos">
                Ver ficha del cliente
              </AccionDeCabecera>
            )}
            {acciones}
          </>
        }
      />
      <FichaDeAuditoria vista={vista} clientId={audit.clientId} />
    </div>
  );
}

import { requireAccessToClient } from "@/lib/auth/access";
import { UnauthorizedError, ForbiddenError, requireInternalUser } from "@/lib/auth/supabase";
import { elegirProyectoParaQuienMira, SELECT_PARA_ELEGIR_PROYECTO } from "@/lib/clients/proyecto-inicial-server";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { esCseDeLaCuenta } from "@/lib/cs/adopcion-del-cse-server";
import { LecturaDeLaCuenta } from "@/components/cs/LecturaDeLaCuenta";
import { leerAjustes } from "@/lib/cs/ajustes-de-salud-server";
import { hoyEnCostaRica } from "@/lib/cs/cartera";
import { NOMBRE_DE_LA_SALUD, quienCorrigio } from "@/lib/cs/cartera-reglas";
import { fmtDia } from "@/lib/cs/formato";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import WorkspaceShell from "@/components/clients/WorkspaceShell";
import { AccionDeCabecera, CabeceraDeFicha, ChipHubspot } from "@/components/layout/CabeceraDeFicha";
import { BotonAgregarReunion } from "@/components/sessions/AgregarReunion";
import { ChatDeNexus } from "@/components/nexus-chat/ChatDeNexus";
import { can } from "@/lib/auth/permissions/engine";
// WorkspaceHeaderPopovers (drawer Contexto con Docs/Sesiones/Deal) — eliminado.
// Docs y Sesiones se migraron al panel "Información del cliente"; el Deal se
// descontinuó.

import { getHubspotClient, getSystemHubspotClient } from "@/lib/hubspot/client";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { proyectoNavegableWhere } from "@/lib/projects/scope";
import { CLIENT_KIND_META, espacioDe } from "@/lib/clients/kind";

// Obtiene el nombre de la empresa desde la cuenta del cliente o del sistema
async function fetchHsCompanyName(
  companyId: string,
  accountId?: string
): Promise<string | null> {
  try {
    const hsClient = accountId
      ? await getHubspotClient(accountId)
      : await getSystemHubspotClient();
    const res = await hsClient.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${companyId}?properties=name`,
    });
    const data = (await res.json()) as {
      properties?: { name?: string | null };
    };
    return data.properties?.name ?? null;
  } catch {
    return null;
  }
}

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Acceso a nivel cliente: CSE solo a los suyos/compartidos; roles "ve todo" pasan.
  try {
    await requireAccessToClient(id);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/");
    if (e instanceof ForbiddenError) redirect("/clients?error=no_access");
    throw e;
  }

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      hubspotAccount: {
        select: { id: true, hubName: true, hubspotPortalId: true },
      },
    },
  });

  if (!client) notFound();

  // ── Determinar pestaña inicial ──────────────────────────────────────────
  // Regla: si el cliente tiene un único proyecto activo (no estrategia), entrar
  // directamente a ese proyecto. Si tiene 0 o 2+, entrar a Estrategia.
  //
  // El filtro TIENE que coincidir con `visibleProjects` de page.tsx o el tab seleccionado
  // no existe en el rail. No coincidía: acá se filtraba en SQL (`{ not: SENTINEL }`, que
  // descarta los serviceType NULL) y allá en JavaScript (`!==`, que los conserva). Ahora
  // los dos importan `esProyectoNavegable` / `PROYECTO_NAVEGABLE_WHERE`, que son el mismo
  // criterio escrito una vez.
  //
  // ⚠ Solo cuando la empresa ABRE proyectos. Una empresa que no es cartera —un prospecto,
  // un aliado, nosotros— no tiene rail de proyectos: preguntar por su pestaña inicial es
  // una query por una respuesta que nadie va a leer. Qué abre cada categoría lo decide
  // `ESPACIO_POR_CATEGORIA` (lib/clients/kind.ts), no este archivo.
  const enProyectos = espacioDe(client.kind) === "proyectos";
  const activeProjects = enProyectos
    ? await prisma.project.findMany({
        where: proyectoNavegableWhere({ clientId: id }),
        select: SELECT_PARA_ELEGIR_PROYECTO,
        orderBy: { createdAt: "asc" },
      })
    : [];
  /* Con uno real abre en él; con varios, en el que le corresponde a quien mira: el que lleva, el del tipo de su equipo,
     el más vivo; dirección y la CSL, la cuenta (lib/clients/proyecto-inicial.ts, Cemaco 2026-10-19). */
  const quienMira = enProyectos ? await requireInternalUser().catch(() => null) : null;
  const initialProjectId =
    (await elegirProyectoParaQuienMira(activeProjects, { email: quienMira?.teamMember.email, rol: quienMira?.role })).id ??
    SENTINEL_SERVICE_TYPE;

  // Nombre de empresa live desde HubSpot. Es una llamada de RED en el camino crítico del
  // header: solo se paga en el espacio de proyectos, donde el nombre de HubSpot es el que
  // manda. En los otros dos alcanza con lo que Nexus ya tiene guardado.
  let hsCompanyName: string | null = null;
  if (enProyectos && client.hubspotCompanyId) {
    hsCompanyName = await fetchHsCompanyName(
      client.hubspotCompanyId,
      client.hubspotAccount?.id
    );
  }

  const displayCompany = hsCompanyName ?? client.company;

  // El atajo a la ficha de la cuenta en Éxito del cliente, con la MISMA condición que esa página
  // (`esLiderDeCs`: CSL y dirección, por rol). Colgaba de «ver todos los clientes», que Ventas,
  // Desarrollo y Marketing tienen por default: les mostraba un botón que los rebotaba.
  // `requireInternalUser` está memoizado por petición: requireAccessToClient ya lo resolvió arriba.
  const ctx = await requireInternalUser().catch(() => null);
  const canSeeCs = !!ctx && esLiderDeCs(ctx.role);
  /* El chat de Nexus sobre la cuenta (2026-10-17, ficha H): la misma celda que los otros chats (conversar consume modelo). */
  const puedeChat = !!ctx && (await can(ctx.teamMember, "asistente", "read").catch(() => false));

  /* Lo que la CSL le hizo al color de la cuenta en Éxito del cliente (2026-10-09): «en espera del cliente» y la
     corrección del color. Lo ve todo quien abre la ficha —también el CSE, que no entra a Éxito del cliente—: la
     corrección se VE, no se hace acá. La vigencia por fecha es la de la regla; si Nexus vio algo rojo nuevo, eso lo
     dice Éxito del cliente (calcularlo acá costaría armar la cuenta entera en cada navegación de la ficha). */
  const ajustes = (await leerAjustes([id]).catch(() => null))?.porCliente.get(id) ?? null;
  const hoy = hoyEnCostaRica();
  const correccionVigente = ajustes?.correccion && ajustes.correccion.vence >= hoy ? ajustes.correccion : null;

  /* La lectura de la cuenta (2026-10-16, fase 1.2): el color y hasta tres motivos, para quien lidera Customer Success y
     el CSE de la cuenta. Se pide al montar el chip, en el navegador: la cabecera no la espera. Con
     ella, el color corregido va adentro del chip; sin ella, se sigue viendo el chip de la corrección. */
  const veLaLectura = enProyectos && !!ctx && (canSeeCs || (await esCseDeLaCuenta(id, ctx.teamMember.email)));

  // Dominio del cliente (para filtrar sesiones de Fireflies)
  const clientDomain = (() => {
    const raw = client.company?.trim();
    if (!raw) return undefined;
    try {
      if (/^https?:\/\//i.test(raw))
        return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
      const cleaned = raw.toLowerCase().replace(/^www\./, "");
      if (/^[\w-]+(\.[\w-]+)+$/.test(cleaned)) return cleaned;
    } catch { /* URL inválida */ }
    return undefined;
  })();

  return (
    <WorkspaceShell clientId={id} initialProjectId={initialProjectId}>
      <div className="flex-1 flex flex-col min-h-screen">
      {/* Header del cliente — el caparazón compartido con la exploración de venta (CabeceraDeFicha). */}
      <CabeceraDeFicha
        volver={{ href: "/clients", etiqueta: "Clientes" }}
        titulo={client.name}
        /* El recorrido explica el espacio de proyectos (riel, etapa, resumen): un prospecto o un
           aliado no lo tienen, así que ahí no se ofrece. */
        recorrido={enProyectos ? "ficha-cliente" : undefined}
        chips={
          <>
            {/* La CATEGORÍA, cuando no es la de siempre. Un chip «Cliente» en las 155 fichas
                de cartera sería ruido; en las otras es lo que explica por qué esta pantalla
                no se parece a la de al lado — por qué no hay proyectos ni cronograma. */}
            {!enProyectos && (
              <span
                title={CLIENT_KIND_META[client.kind].help}
                className="flex-shrink-0 px-1.5 py-0.5 rounded text-2xs font-medium bg-surface-hover text-fg-secondary border border-line cursor-help"
              >
                {CLIENT_KIND_META[client.kind].label}
              </span>
            )}
            {displayCompany && displayCompany !== client.name && (
              <>
                <span className="text-xs text-fg-muted">·</span>
                <span className="truncate text-xs text-fg-muted">{displayCompany}</span>
              </>
            )}
            {ajustes?.espera && (
              <span
                title={`${ajustes.espera.nota} · lo marcó ${quienCorrigio(ajustes.espera)} en Éxito del cliente`}
                className="flex-shrink-0 cursor-help rounded border border-line bg-surface-hover px-1.5 py-0.5 text-2xs font-medium text-fg-secondary"
              >
                ⏸ En espera del cliente
              </span>
            )}
            {veLaLectura && <LecturaDeLaCuenta clientId={id} />}
            {correccionVigente && !veLaLectura && (
              <span
                title={`«${correccionVigente.nota}» · corregido por ${quienCorrigio(correccionVigente)} en Éxito del cliente, hasta el ${fmtDia(correccionVigente.vence, hoy)}`}
                className="flex-shrink-0 cursor-help rounded border border-line bg-surface px-1.5 py-0.5 text-2xs font-medium text-fg-secondary"
              >
                Color: {NOMBRE_DE_LA_SALUD[correccionVigente.salud].toLowerCase()} (lo corrigió {quienCorrigio(correccionVigente)})
              </span>
            )}
            {client.hubspotAccount ? (
              <ChipHubspot conectado title={client.hubspotAccount.hubName ?? "HubSpot conectado"} />
            ) : (
              <ChipHubspot conectado={false} title="Conectar HubSpot del cliente" href={`/clients/${id}/settings`} />
            )}
          </>
        }
        acciones={
          <>
            {/* Una reunión que no pasó por Meet, o lo que pasó en una que no dejó transcripción (etapa 4f). */}
            <BotonAgregarReunion clienteFijo={{ id, nombre: client.name }} etiqueta="+ Reunión" />
            {/* El chat de Nexus sobre esta cuenta y lo que te sugiere (lib/nexus-chat). */}
            {puedeChat && <ChatDeNexus clientId={id} nombre={client.name} />}
            {canSeeCs && (
              <AccionDeCabecera href={`/customer-success/${id}`} title="Estado de la cuenta en Customer Success">
                🧭 Ver portal del cliente
              </AccionDeCabecera>
            )}
            <Link
              href={`/clients/${id}/settings`}
              className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
              title="Configuración"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </>
        }
      />

      <div className="flex-1 relative">
        {children}
      </div>
    </div>
    </WorkspaceShell>
  );
}

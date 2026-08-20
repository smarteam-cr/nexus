/**
 * /external/business-case
 *
 * La puerta CON CONTRASEÑA (el modo opcional, el check del panel de Ventas). Server
 * component: lee la cookie httpOnly `nexus_bc_access` (token, fuera de la URL), pasa por
 * el chokepoint server-side y renderiza read-only con el MOTOR de landing.
 *
 * Toda la seguridad vive en resolveBusinessCaseAccess (re-chequea revocación, publicación
 * y caducidad EN CADA render). `force-dynamic`: nunca se cachea.
 *
 * ⚠ Exige `requiresPassword === true`. La cookie sola no alcanza y no debe alcanzar: si el
 * CSE apagó el check, esta superficie deja de servir y manda a la URL abierta. Sin ese
 * chequeo habría dos modos vigentes a la vez para el mismo token — y el que decide sería
 * "por qué puerta entró el cliente la primera vez", que es exactamente lo que no queremos.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import PropuestaCaducada from "@/components/external/PropuestaCaducada";
import BusinessCaseLanding from "@/components/external/BusinessCaseLanding";
import { getBrandLogos } from "@/lib/external/smarteam-logo";
import {
  BUSINESS_CASE_COOKIE,
  resolveBusinessCaseAccess,
} from "@/lib/external/business-case-view";
import { bcOpenPath } from "@/lib/business-cases/access-url";

export const dynamic = "force-dynamic";

export default async function ExternalBusinessCasePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(BUSINESS_CASE_COOKIE)?.value ?? "";

  const [state, brandLogos] = await Promise.all([
    token ? resolveBusinessCaseAccess(token) : Promise.resolve({ kind: "denied" as const }),
    getBrandLogos(),
  ]);

  if (state.kind === "expired") {
    return (
      <ExternalShell smarteamLogoUrl={brandLogos.smarteam}>
        <PropuestaCaducada contactEmail={state.contactEmail} />
      </ExternalShell>
    );
  }

  // La propuesta ya no pide contraseña → el link abierto es el que manda.
  if (state.kind === "ok" && !state.requiresPassword) redirect(bcOpenPath(token));

  return state.kind === "ok" ? (
    <BusinessCaseLanding
      data={state.data}
      approval={state.approval}
      approveToken={token}
      brandLogos={brandLogos}
    />
  ) : (
    <ExternalShell smarteamLogoUrl={brandLogos.smarteam}>
      <NoAccess />
    </ExternalShell>
  );
}

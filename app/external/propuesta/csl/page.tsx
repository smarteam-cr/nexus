/**
 * /external/propuesta/csl — la propuesta del Customer Success Lead, PÚBLICA.
 *
 * A pedido de Elías: la persona candidata abre el link y lee la propuesta, sin
 * login y sin ver nada de Nexus. Vive bajo `/external/` porque ese prefijo ya es
 * público en el middleware y su layout fija el tema claro (el documento no debe
 * flipear a oscuro por la cookie de un interno que previsualice el link).
 *
 * ⚠ SIN TOKEN NI CONTRASEÑA, a diferencia del resto de `/external/*`: cualquiera
 * con la URL ve el documento, incluida la oferta salarial. Es la decisión
 * pedida; si mañana hace falta cerrarla, el patrón que ya existe es
 * `ProjectExternalAccess` (token + password, `app/external/verify/[token]`).
 * Mientras tanto, `robots: noindex` evita al menos que la indexen los buscadores.
 *
 * Es la MISMA fuente que la vista interna (`lib/propuestas/csl.ts`) renderizada
 * por el MISMO componente: no hay copia que se desincronice. Cambiar un monto se
 * sigue haciendo en un solo archivo.
 */
import type { Metadata } from "next";
import ExternalShell from "@/components/external/ExternalShell";
import PropuestaView from "@/components/roles/PropuestaView";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import { PROPUESTA_CSL_HERO, PROPUESTA_CSL_CONTENT } from "@/lib/propuestas/csl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${PROPUESTA_CSL_HERO.title} · Smarteam`,
  robots: { index: false, follow: false },
};

export default async function PropuestaCslPublicaPage() {
  const smarteamLogoUrl = await getSmarteamLogoUrl();

  return (
    <ExternalShell smarteamLogoUrl={smarteamLogoUrl}>
      <PropuestaView hero={PROPUESTA_CSL_HERO} content={PROPUESTA_CSL_CONTENT} framed={false} />
    </ExternalShell>
  );
}

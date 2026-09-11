/**
 * /external/business-case — la dirección SIN propuesta. Nunca muestra contenido ni redirige.
 *
 * Era el destino del modo con contraseña, retirado el 2026-09-10 (el porqué, en
 * lib/business-cases/access-url.ts): servía la propuesta de la cookie `nexus_bc_access` y, si esa
 * propuesta ya estaba abierta, redirigía a SU enlace abierto. Como la dirección no nombraba la
 * propuesta, reenviarla mostraba —o dejaba en la barra, con precios— la última que hubiera abierto
 * el navegador de quien la recibía: el mismo defecto que el incidente de proyectos de ese día.
 *
 * Ahora no lee cookies, no resuelve ningún token y no redirige: dice que la dirección no indica
 * la propuesta y cómo llegar a la suya. Queda viva —y no como un 404 de Next— porque sigue en
 * historiales y favoritos, y un cliente no tiene por qué ver una página de error.
 *
 * `force-dynamic`: el logo de marca sale de la config global (lib/external/smarteam-logo.ts) y
 * no se resuelve al compilar.
 */
import type { Metadata } from "next";
import ExternalShell from "@/components/external/ExternalShell";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smarteam",
  robots: { index: false, follow: false },
};

export default async function PropuestaSinDireccion() {
  const smarteamLogoUrl = await getSmarteamLogoUrl();

  return (
    <ExternalShell smarteamLogoUrl={smarteamLogoUrl}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          padding: "48px 16px",
        }}
      >
        <div style={{ maxWidth: 400, textAlign: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 600,
              color: "#111827",
              fontFamily: "var(--font-montserrat), system-ui, sans-serif",
            }}
          >
            Esta dirección no indica la propuesta
          </h1>
          <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "#6b7280" }}>
            Para ver tu propuesta, abre el enlace que te compartió tu contacto en Smarteam: lleva
            directo a ella.
          </p>
        </div>
      </div>
    </ExternalShell>
  );
}

/**
 * components/external/DireccionSinProyecto.tsx — qué muestra una dirección que no dice el proyecto.
 *
 * `/external/kickoff`, `/cronograma`, `/desarrollo` y `/entrega` sin id eran el destino después de
 * poner la contraseña: quedaron en favoritos, en historiales y en al menos un mensaje reenviado
 * (incidente del 2026-09-10: Elías abrió «el cronograma de Judesur» y vio el de Wherex, el último
 * que había abierto su navegador).
 *
 * Como no nombran ningún proyecto, NUNCA muestran contenido. Listan los proyectos que ESTE
 * navegador ya abrió con su contraseña —con esa superficie publicada— y la persona elige. Sin nada
 * que listar → el mismo «Acceso no disponible» de siempre.
 *
 * ⚠ Si lo abierto es de MÁS DE UN cliente (el navegador de un CSE), la lista queda plegada detrás
 * de un clic: esta página también puede estar en la pantalla compartida de una reunión, y no puede
 * mostrar el nombre de otro cliente sin que alguien lo pida.
 *
 * Server component y sin JS: son enlaces a la dirección de cada proyecto, y el pliegue es un
 * <details>.
 */
import Link from "next/link";
import ExternalShell from "./ExternalShell";
import NoAccess from "./NoAccess";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import { opcionesParaDireccionSinProyecto } from "@/lib/external/selector-de-proyectos";
import type { PublishSurfaceKey } from "@/lib/projects/publish-surfaces";

const QUE_ES: Record<PublishSurfaceKey, string> = {
  kickoff: "el kickoff",
  cronograma: "el cronograma",
  desarrollo: "el requerimiento técnico",
  entrega: "la entrega",
};

const TEXTO = { fontSize: 14, lineHeight: 1.6, color: "#6b7280" } as const;

export default async function DireccionSinProyecto({ superficie }: { superficie: PublishSurfaceKey }) {
  const [accesos, smarteamLogoUrl] = await Promise.all([accesosDelNavegador(), getSmarteamLogoUrl()]);
  const { opciones, variosClientes } = opcionesParaDireccionSinProyecto(accesos, superficie);

  const lista = (
    <ul style={{ listStyle: "none", margin: "18px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {opciones.map((o) => (
        <li key={o.href}>
          <Link
            href={o.href}
            style={{
              display: "block",
              padding: "14px 16px",
              border: "1px solid #dbe3f0",
              borderRadius: 12,
              background: "#fff",
              textDecoration: "none",
            }}
          >
            <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: "#0B58D3", overflowWrap: "anywhere" }}>
              {o.nombre}
            </span>
            <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "#6b7280" }}>{o.cliente}</span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <ExternalShell smarteamLogoUrl={smarteamLogoUrl}>
      {opciones.length === 0 ? (
        <NoAccess />
      ) : (
        <div style={{ display: "flex", justifyContent: "center", padding: "56px 16px 72px" }}>
          <div style={{ width: "100%", maxWidth: 460, fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
                color: "#111827",
                fontFamily: "var(--font-montserrat), system-ui, sans-serif",
              }}
            >
              ¿De qué proyecto quieres ver {QUE_ES[superficie]}?
            </h1>
            {variosClientes ? (
              <>
                <p style={{ ...TEXTO, marginTop: 10 }}>
                  Esta dirección no indica el proyecto, y en este navegador hay proyectos abiertos de más de
                  un cliente. Por eso no se muestran hasta que lo pidas.
                </p>
                <details style={{ marginTop: 16 }}>
                  {/* `display: inline-flex` apaga el triángulo nativo del <summary>. */}
                  <summary
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                      listStyle: "none",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#0B58D3",
                      border: "1px solid #d7e1f3",
                      borderRadius: 999,
                      padding: "8px 14px",
                      background: "#fff",
                      userSelect: "none",
                    }}
                  >
                    Ver los proyectos abiertos en este navegador ({opciones.length}) <span aria-hidden="true">▾</span>
                  </summary>
                  {lista}
                </details>
              </>
            ) : (
              <>
                <p style={{ ...TEXTO, marginTop: 10 }}>
                  Esta dirección no indica el proyecto. Estos son los que ya abriste en este navegador:
                </p>
                {lista}
              </>
            )}
            <p style={{ ...TEXTO, marginTop: 18, fontSize: 13 }}>
              ¿No está el que buscas? Abre el enlace que te compartió tu equipo de Smarteam, el que pide la
              contraseña.
            </p>
          </div>
        </div>
      )}
    </ExternalShell>
  );
}

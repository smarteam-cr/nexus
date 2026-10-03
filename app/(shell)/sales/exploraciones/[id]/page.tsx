/**
 * /sales/exploraciones/[id] — el lienzo de la exploración de venta de una empresa.
 *
 * Con el MISMO caparazón que la ficha del cliente y del proyecto (pedido de Elías, 2026-10-01): la
 * cabecera de la ficha a todo el ancho (components/layout/CabeceraDeFicha.tsx) y, debajo, el lienzo
 * en tres columnas (las piezas, la tarea y el contexto), de borde a borde. El servidor lee la exploración y la escala PUBLICADA (con la edición y
 * el perfil de la exploración) y le baja al lienzo solo lo que usa (lib/exploraciones/escala-del-lienzo.ts).
 * Gateada por `ventas.read`; editar pide `ventas.write`.
 */
import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui";
import LienzoDeExploracion from "@/components/exploraciones/LienzoDeExploracion";
import { AccionDeCabecera, CabeceraDeFicha, ChipHubspot } from "@/components/layout/CabeceraDeFicha";
import { can } from "@/lib/auth/permissions/engine";
import { requireInternalUser } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import { hubspotCompanyUrl } from "@/lib/hubspot/urls";
import {
  escalaDeLaExploracion,
  escalaParaExplorar,
  leerExploracion,
  SQL_DE_EXPLORACIONES,
} from "@/lib/exploraciones/servidor";
import { paraLaPantallaCompleta } from "@/lib/exploraciones/pantalla";

export const dynamic = "force-dynamic";

const VOLVER = { href: "/sales/exploraciones", etiqueta: "Exploraciones" };

/** El chip de al lado del nombre: qué es esta pantalla y con qué escala se mide. */
function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="flex-shrink-0 rounded border border-line bg-surface-hover px-1.5 py-0.5 text-2xs font-medium text-fg-secondary">
      {children}
    </span>
  );
}

export default async function ExploracionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pieza?: string }>;
}) {
  const [{ id }, { pieza }] = await Promise.all([params, searchParams]);
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");
  const puedeEditar = await can(ctx.teamMember, "ventas", "write");

  const lectura = await leerExploracion(id);
  if (lectura.estado === "no-existe") notFound();
  if (lectura.estado === "sin-tablas") {
    return (
      <div className="flex min-h-screen flex-col">
        <CabeceraDeFicha volver={VOLVER} titulo="Exploración" />
        <div className="px-6 py-8">
          <Alert variant="warning" title="Falta preparar la base">
            Hay que aplicar {SQL_DE_EXPLORACIONES} y reiniciar el servidor.
          </Alert>
        </div>
      </div>
    );
  }

  const exp = await paraLaPantallaCompleta(lectura.fila);
  const escala = await escalaParaExplorar();
  const portal = await prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { hubspotPortalId: true } });
  const empresaUrl = hubspotCompanyUrl(portal?.hubspotPortalId ?? null, exp.empresa.hubspotCompanyId);
  const edicion = escala.estado === "ok" ? (escalaDeLaExploracion(escala.general, exp.estado).edicion?.nombre ?? "Escala general") : null;

  return (
    <div className="flex min-h-screen flex-col">
      <CabeceraDeFicha
        volver={VOLVER}
        titulo={exp.empresa.nombre}
        chips={
          <>
            <Chip title="La escala con la que se mide esta exploración">Exploración de venta{edicion ? ` · ${edicion}` : ""}</Chip>
            {exp.estado.archivada && <Chip>Archivada</Chip>}
            {empresaUrl ? (
              <ChipHubspot conectado title="Ver la empresa en HubSpot" href={empresaUrl} />
            ) : (
              <ChipHubspot conectado={false} title="La empresa no está en HubSpot" />
            )}
          </>
        }
        acciones={
          exp.empresa.kind === "CLIENTE" ? (
            <AccionDeCabecera href={`/clients/${exp.empresa.clientId}`} title="La ficha del cliente, con sus proyectos">
              Ver ficha del cliente
            </AccionDeCabecera>
          ) : undefined
        }
      />
      {escala.estado !== "ok" ? (
        <div className="px-6 py-8">
          <Alert variant="warning" title="La escala no está publicada en Nexus">
            Sin ella el lienzo no puede mostrar las dimensiones ni calcular el nivel. Se publica desde la sección Escala.
          </Alert>
        </div>
      ) : (
        <>
          {escala.aviso && (
            <div className="px-6 pt-4">
              <Alert variant="warning">{escala.aviso}</Alert>
            </div>
          )}
          <LienzoDeExploracion
            inicial={exp}
            escala={escalaDeLaExploracion(escala.general, exp.estado)}
            puedeEditar={puedeEditar && !exp.estado.archivada}
            piezaInicial={pieza ?? null}
          />
        </>
      )}
    </div>
  );
}

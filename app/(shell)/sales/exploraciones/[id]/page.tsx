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
import ElegirResponsable from "@/components/exploraciones/ElegirResponsable";
import LienzoDeExploracion from "@/components/exploraciones/LienzoDeExploracion";
import { AccionDeCabecera, CabeceraDeFicha, ChipHubspot } from "@/components/layout/CabeceraDeFicha";
import { can } from "@/lib/auth/permissions/engine";
import { requireInternalUser } from "@/lib/auth/supabase";
import { ensureClientInfoProject } from "@/lib/canvas/strategy-project";
import { prisma } from "@/lib/db/prisma";
import { hubspotCompanyUrl } from "@/lib/hubspot/urls";
import {
  equipoParaLaPreventa,
  escalaDeLaExploracion,
  escalaParaExplorar,
  leerExploracion,
  SQL_DE_EXPLORACIONES,
} from "@/lib/exploraciones/servidor";
import { paraLaPantallaCompleta } from "@/lib/exploraciones/pantalla";

export const dynamic = "force-dynamic";

const VOLVER = { href: "/sales/exploraciones", etiqueta: "Preventa" };

/** Los chips de la cabecera, como en el tablero: píldoras blancas con borde, de 12 px. */
const CLASE_DE_CHIP = "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-[3px] text-xs font-medium text-fg-secondary";

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={CLASE_DE_CHIP}>
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
  if (!ctx || !(await can(ctx.teamMember, "preventa", "read"))) redirect("/clients");
  const puedeEditar = await can(ctx.teamMember, "preventa", "write");
  // Customer Success trabaja la preventa; armar la propuesta comercial sigue siendo de Ventas.
  const puedeProponer = await can(ctx.teamMember, "ventas", "write");

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
  /* La información de la empresa es la MISMA de su ficha de cliente (Elías, 2026-10-06): vive en su
     proyecto de estrategia, que se crea acá si un prospecto todavía no lo tiene (como al mapear sus
     procesos). Un prospecto con una preventa ya es una empresa con la que se trabaja. */
  const infoDeLaEmpresa = await ensureClientInfoProject(exp.empresa.clientId);
  const [escala, equipo] = await Promise.all([escalaParaExplorar(), equipoParaLaPreventa()]);
  const portal = await prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { hubspotPortalId: true } });
  const empresaUrl = hubspotCompanyUrl(portal?.hubspotPortalId ?? null, exp.empresa.hubspotCompanyId);
  const delLienzo = escala.estado === "ok" ? escalaDeLaExploracion(escala.general, exp.estado) : null;
  const edicion = delLienzo ? (delLienzo.edicion?.nombre ?? "Escala general") : null;
  const areas = delLienzo ? delLienzo.areas.filter((a) => exp.estado.areas.includes(a.id)).map((a) => a.nombre) : [];

  return (
    <div className="flex min-h-screen flex-col">
      <CabeceraDeFicha recorrido="preventa"
        volver={VOLVER}
        titulo={exp.empresa.nombre}
        chips={
          <>
            {edicion && <Chip title="La escala con la que se mide esta preventa">{edicion}</Chip>}
            {areas.length > 0 && <Chip title="Las áreas en juego">{areas.join(" · ")}</Chip>}
            {exp.estado.archivada && <Chip>Archivada</Chip>}
          </>
        }
        acciones={
          <>
            {/* Quién la lleva: se elige acá y en el listado (decide el «Para ti» de cada persona). */}
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-2.5 pr-1.5 text-xs">
              <span className="text-fg-muted">La lleva</span>
              <span className="min-w-[7.5rem] max-w-[11rem] font-medium">
                <ElegirResponsable
                  exploracionId={exp.id}
                  version={exp.version}
                  responsableEmail={exp.estado.responsableEmail}
                  empresa={exp.empresa.nombre}
                  equipo={equipo}
                  puedeEditar={puedeEditar && !exp.estado.archivada}
                />
              </span>
            </span>
            {exp.empresa.kind === "CLIENTE" && (
              <AccionDeCabecera href={`/clients/${exp.empresa.clientId}`} title="La ficha del cliente, con sus proyectos">
                Ver ficha del cliente
              </AccionDeCabecera>
            )}
            {empresaUrl ? (
              <a href={empresaUrl} target="_blank" rel="noreferrer" className={`${CLASE_DE_CHIP} transition-colors hover:bg-surface-hover hover:text-fg`}>
                Abrir en HubSpot ↗
              </a>
            ) : (
              <ChipHubspot conectado={false} title="La empresa no está en HubSpot" />
            )}
          </>
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
            puedeProponer={puedeProponer}
            infoDeLaEmpresa={infoDeLaEmpresa}
            piezaInicial={pieza ?? null}
          />
        </>
      )}
    </div>
  );
}

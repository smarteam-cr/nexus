import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { revalidateClientsSidebar } from "@/lib/cache/clients";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";
import { guardAccessToClient, guardCapability } from "@/lib/auth/api-guards";
import { clampLogoScale } from "@/lib/ui/logo-scale";

// GET /api/clients/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      hubspotAccount: { select: { id: true, hubName: true, hubspotPortalId: true } },
      projects: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, status: true, projectType: true, serviceType: true, tags: true, currentStage: true, currentStep: true },
      },
      _count: { select: { audits: true, implementations: true, documents: true } },
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // `tamUsd` es Decimal(12,2): sin esto se serializa como STRING y el form de la ficha
  // recibiría "36000.00" donde espera un número. La frontera lo cruza acá, una vez.
  return NextResponse.json({
    ...client,
    tamUsd: client.tamUsd === null ? null : Number(client.tamUsd),
  });
}

// PATCH /api/clients/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const data = await request.json();
  const client = await prisma.client.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.company !== undefined && { company: data.company?.trim() || null }),
      ...(data.industry !== undefined && { industry: data.industry?.trim() || null }),
      ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
      ...(data.emailDomains !== undefined && {
        emailDomains: (data.emailDomains as string[])
          .map((d: string) => d.trim().toLowerCase().replace(/^@/, ""))
          .filter(Boolean),
      }),
      // Tamaño del logo. `null` explícito = "volver al default", y por eso se distingue
      // de `undefined` (= "no lo mandé"): son cosas distintas. El clamp es del servidor
      // porque la barra es solo una UI — un PATCH a mano con 5000 haría que el logo tape
      // el documento entero en una propuesta que el cliente está mirando.
      ...(data.logoScale !== undefined && { logoScale: clampLogoScale(data.logoScale) }),
    },
  });

  if (data.name !== undefined || data.company !== undefined) {
    revalidateClientsSidebar();
  }
  /* PERF #1: si cambió algo que afecta el match (name/company/emailDomains), re-resolver en
     background. ⚠ El catch LOGUEA: renombrar un cliente cambia de quién son sus reuniones, así
     que un refresco que falla en silencio deja la atribución vieja sin que nadie se entere. */
  if (data.name !== undefined || data.company !== undefined || data.emailDomains !== undefined) {
    void resolveAllSessions().catch((e) => {
      console.error(`[clients] re-resolver tras editar ${id} falló:`, e);
    });
  }

  return NextResponse.json(client);
}

// DELETE /api/clients/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardCapability("deleteClients");
  if (guard instanceof NextResponse) return guard;

  /* ⚠ SOLTAR LAS SESIONES ANTES DE BORRAR, Y DENTRO DE LA MISMA TRANSACCIÓN.
     `manualClientId` y `resolvedClientId` NO son claves foráneas, así que la base no las limpia:
     borrar el cliente las deja apuntando a un id muerto. Y ahí la sesión desaparece de todos lados
     a la vez — no pertenece a ningún cliente vivo, pero tampoco cuenta como "sin dueño", así que
     el buscador de reuniones internas (que exige las dos columnas en null) también la rechaza.
     Invisible en la pantalla, invisible para INV1 y para INV2. Es lo que escondió una reunión en
     un demo en vivo el 2026-08-04, y solo se pudo diagnosticar leyendo la base a mano.

     El `resolveAllSessions()` de abajo NO alcanzaba: reescribe `resolvedClientId` y **nunca toca
     `manualClientId`**. Por eso el override quedaba colgado para siempre.

     Va sincrónico y transaccional porque es correctitud, no refresco: son dos `updateMany` sobre
     columnas indexadas, milisegundos. Dejar las sesiones huérfanas un rato es estrictamente mejor
     que dejarlas apuntando a una lápida — y es el estado honesto. */
  await prisma.$transaction(async (tx) => {
    await tx.firefliesSession.updateMany({
      where: { manualClientId: id },
      data: { manualClientId: null },
    });
    await tx.firefliesSession.updateMany({
      where: { resolvedClientId: id },
      data: { resolvedClientId: null },
    });
    await tx.client.delete({ where: { id } });
  });
  revalidateClientsSidebar();
  /* El re-resolve queda en background porque es lo que es: un refresco que les vuelve a encontrar
     dueño por dominio a las que lo tengan. Carga ~16k filas y pega a HubSpot, así que `await`earlo
     acá sería un timeout esperando ocurrir. ⚠ El `catch` ahora LOGUEA: tragarse el error en
     silencio fue cómplice de este bug durante meses. INV2 vigila que el refresco haya corrido. */
  void resolveAllSessions().catch((e) => {
    console.error(`[clients] re-resolver tras borrar ${id} falló:`, e);
  });

  return NextResponse.json({ ok: true });
}

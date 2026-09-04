import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { buildPortalSnapshot, PortalSnapshot } from "@/lib/hubspot/portal-analyzer";

/** GET → devuelve snapshot desde DB (o lo construye si no existe) */
export const GET = withAuth(async () => {
  try {
    /* ⛔ SIEMPRE la cuenta del SISTEMA. Auditoría 2026-09-03: sin `where`, Postgres devolvía «la
       primera cuenta que haya» — con ~50 cuentas de clientes en la tabla, una arbitraria — y este GET
       servía el snapshot del portal de un CLIENTE a cualquier sesión. Lectura cross-cliente sin error. */
    const account = await prisma.hubspotAccount.findFirst({
      where: { isSystem: true },
      select: { id: true, portalSnapshot: true, portalSnapshotAt: true },
    });

    if (!account) {
      return NextResponse.json({ error: "No hay cuenta HubSpot conectada" }, { status: 400 });
    }

    if (account.portalSnapshot) {
      return NextResponse.json({
        snapshot: account.portalSnapshot as unknown as PortalSnapshot,
        cachedAt: account.portalSnapshotAt,
        fromCache: true,
      });
    }

    // Sin caché: construir y guardar
    const snapshot = await buildPortalSnapshot(account.id);
    await prisma.hubspotAccount.update({
      where: { id: account.id },
      data: { portalSnapshot: snapshot as object, portalSnapshotAt: new Date() },
    });

    return NextResponse.json({ snapshot, cachedAt: new Date(), fromCache: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

/** POST → fuerza re-fetch, guarda en DB */
export const POST = withAuth(async () => {
  try {
    const account = await prisma.hubspotAccount.findFirst({
      where: { isSystem: true },
      select: { id: true },
    });

    if (!account) {
      return NextResponse.json({ error: "No hay cuenta HubSpot conectada" }, { status: 400 });
    }

    const snapshot = await buildPortalSnapshot(account.id);
    await prisma.hubspotAccount.update({
      where: { id: account.id },
      data: { portalSnapshot: snapshot as object, portalSnapshotAt: new Date() },
    });
    return NextResponse.json({ snapshot, cachedAt: new Date(), fromCache: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

export const GET = withAuth(async () => {
  try {
    const implementations = await prisma.implementation.findMany({
      where: { archived: false },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { messages: true, executions: true } },
      },
    });
    return NextResponse.json(implementations);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 401 });
  }
});

export const POST = withAuth(async (request) => {
  try {
    const { name, clientId } = await request.json() as { name: string; clientId?: string };

    const implementation = await prisma.implementation.create({
      data: {
        name: name ?? "Nueva implementación",
        status: "PLANNING",
        ...(clientId && { clientId }),
      },
    });

    return NextResponse.json(implementation, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

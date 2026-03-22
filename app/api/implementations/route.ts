import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    await requireConsultantSession();
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
}

export async function POST(request: NextRequest) {
  try {
    await requireConsultantSession();
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
}

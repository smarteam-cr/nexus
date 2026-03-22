import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
    const { id } = await params;

    const implementation = await prisma.implementation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        executions: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!implementation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(implementation);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
    const { id } = await params;
    const body = await request.json() as { status?: string; plan?: object; name?: string };

    const updated = await prisma.implementation.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status as "PLANNING" | "READY" | "EXECUTING" | "DONE" | "PAUSED" }),
        ...(body.plan && { plan: body.plan }),
        ...(body.name && { name: body.name }),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
    const { id } = await params;

    await prisma.implementation.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

export const GET = withAuth(async (
  _request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
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
});

export const PATCH = withAuth(async (
  request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
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
});

export const DELETE = withAuth(async (
  _request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    await prisma.implementation.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

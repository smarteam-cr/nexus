/**
 * /api/marketing/runs — corridas del motor de contenido.
 *   GET  → historial (últimas 10) + la corrida activa si hay (cualquier interno)
 *   POST → { kind: INGEST | GENERATE | CHAIN } dispara una corrida async → 202
 *          { runId }. Guard anti-doble-run (409). Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser, guardMarketingEditor } from "@/lib/auth/api-guards";
import { getRunHistory } from "@/lib/marketing/queries";
import { findActiveRun, startMarketingRun } from "@/lib/marketing/runs";
import { runCreateSchema } from "@/lib/marketing/schema";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const [runs, active] = await Promise.all([getRunHistory(10), findActiveRun()]);
  return NextResponse.json({ runs, activeRunId: active?.id ?? null });
}

export async function POST(req: NextRequest) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = runCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "kind inválido (INGEST | GENERATE | CHAIN)" }, { status: 400 });
  }

  const active = await findActiveRun();
  if (active) {
    return NextResponse.json(
      { error: "Ya hay una corrida en curso. Esperá a que termine.", runId: active.id },
      { status: 409 },
    );
  }

  const run = await startMarketingRun(parsed.data.kind, "MANUAL", guard.teamMember.email);
  return NextResponse.json({ runId: run.id, status: run.status }, { status: 202 });
}

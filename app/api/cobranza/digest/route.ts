/**
 * /api/cobranza/digest — el corte de cartera (diff-based).
 *   GET  → resumen del último SnapshotCartera (para render inicial).
 *   POST → correr el corte AHORA (el botón del demo; el JobDef del lunes llama a
 *          la misma runCobranzaDigest). Si nada cambió → digest con sinCambios.
 */
import { NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { getLatestSnapshot } from "@/lib/cobranza/queries";
import { runCobranzaDigest } from "@/lib/cobranza/digest";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const snapshot = await getLatestSnapshot();
  return NextResponse.json({ snapshot });
}

export async function POST() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const digest = await runCobranzaDigest(new Date(), guard.user.email);
  return NextResponse.json({ digest });
}

/**
 * POST /api/cobranza/cuentas/crear-empresa — alta de una empresa LIVIANA + su
 * cuenta financiera desde el módulo Cobranza (AccountSource "manual", puerto 1).
 * Deja entrar a las empresas que hoy no tienen proyecto en Nexus (el rol ADMIN
 * no puede usar POST /api/clients — gate seeAllClients). Cuando llegue el
 * adaptador de HubSpot, estas empresas se mapean por (fuente + id_externo).
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN).
 */
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { getAccountSource } from "@/lib/cobranza/adapters";
import { crearEmpresaSchema } from "@/lib/cobranza/schema";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = crearEmpresaSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const [resultado] = await getAccountSource("manual").ingest(
    [
      {
        fuenteRef: { fuente: "manual", idExterno: randomUUID() },
        clienteNombre: d.nombre,
        dominio: d.dominio ?? null,
        correoCobro: d.correoCobro ?? null,
        tipo: d.tipo,
        viaCobro: d.viaCobro,
        moneda: d.moneda,
        terminosPago: d.terminosPago,
        diaCobroAncla: d.diaCobroAncla ?? null,
        notas: d.notas ?? null,
      },
    ],
    { byEmail: guard.user.email },
  );

  if (resultado.error) {
    return NextResponse.json({ error: resultado.error }, { status: 400 });
  }

  // Es UNA creación (patrón POST /api/clients): re-resolver sesiones en background
  // para que el dominio nuevo reclame lo suyo. El import por lotes NO hace esto por
  // fila — batchea uno al final.
  if (resultado.clientCreado) {
    void resolveAllSessions().catch(() => {});
  }

  return NextResponse.json(
    {
      clientId: resultado.clientId,
      cuentaId: resultado.cuentaId,
      clientCreado: resultado.clientCreado,
      cuentaCreada: resultado.cuentaCreada,
    },
    { status: resultado.clientCreado ? 201 : 200 },
  );
}

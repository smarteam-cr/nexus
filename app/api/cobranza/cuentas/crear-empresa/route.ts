/**
 * POST /api/cobranza/cuentas/crear-empresa — alta de una empresa LIVIANA + su
 * cuenta financiera desde el módulo Cobranza (AccountSource "manual", puerto 1).
 * Deja entrar a las empresas que hoy no tienen proyecto en Nexus (el rol ADMIN
 * no puede usar POST /api/clients — gate seeAllClients). Cuando llegue el
 * adaptador de HubSpot, estas empresas se mapean por (fuente + id_externo).
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN).
 *
 * ── ETAPA 12: NO DUPLICAR (2026-09-13) ──────────────────────────────────────────
 * Antes de crear, se buscan las empresas que se le parecen, de TODOS los tipos
 * (lib/cobranza/empresas-parecidas.ts). Medido: la misma empresa ya estaba dos veces
 * en 4 casos (BLUESAT, Areyá, Euro Stone, MINEC). Con parecidas, responde 409 con la
 * lista y la persona decide:
 *   · `empresaExistenteId` → es esa: se le abre (o se abre) su cuenta;
 *   · `noEsNingunaParecida` → es otra: se crea. ⛔ Salvo que una comparta el dominio.
 * Nexus no elige por la persona ni une dos empresas por un nombre parecido.
 */
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getAccountSource } from "@/lib/cobranza/adapters";
import { crearEmpresaSchema } from "@/lib/cobranza/schema";
import { empresasParecidas } from "@/lib/cobranza/empresas-parecidas";
import { cargarEmpresasExistentes, etiquetaDeTipo } from "@/lib/cobranza/import-server";
import { esClienteDeCartera } from "@/lib/clients/kind";
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
  let dedupClientId: string | null = null;

  if (d.empresaExistenteId) {
    const elegida = await prisma.client.findUnique({
      where: { id: d.empresaExistenteId },
      select: { id: true, name: true, kind: true },
    });
    if (!elegida) return NextResponse.json({ error: "Esa empresa ya no existe." }, { status: 404 });
    /* ⚠ No se le cambia el tipo desde Cobranza: pasar un prospecto a cliente es una decisión de la
       ficha de la empresa, y tiene efectos en otros módulos. Se dice dónde hacerlo. */
    if (!esClienteDeCartera(elegida.kind)) {
      return NextResponse.json(
        {
          error: `«${elegida.name}» está como ${etiquetaDeTipo(elegida.kind)}. Pasala a Cliente en su ficha y volvé a intentar: una cuenta de cobro de un ${etiquetaDeTipo(elegida.kind).toLowerCase()} no aparece en la cartera.`,
        },
        { status: 409 },
      );
    }
    dedupClientId = elegida.id;
  } else {
    const parecidas = empresasParecidas({ nombre: d.nombre, dominio: d.dominio ?? null }, await cargarEmpresasExistentes());
    const delDominio = parecidas.find((p) => p.via === "DOMINIO");
    if (delDominio) {
      return NextResponse.json(
        {
          error: `El dominio ya es de «${delDominio.nombre}». Si es la misma empresa, elegila; si es otra, sacá el dominio.`,
          parecidas,
        },
        { status: 409 },
      );
    }
    if (parecidas.length > 0 && !d.noEsNingunaParecida) {
      return NextResponse.json(
        { error: "Ya hay empresas que se le parecen. Decí si es alguna antes de crear otra.", parecidas },
        { status: 409 },
      );
    }
  }

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
        creditoDias: d.creditoDias ?? null,
        notas: d.notas ?? null,
        dedupClientId,
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

import { NextRequest, NextResponse } from "next/server";
import { getDataLake } from "@/lib/data-lake/client";
import { prisma } from "@/lib/db/prisma";
import { withAuth, apiError } from "@/lib/api";

export interface DataLakeNote {
  id: string | number;
  content: string;
  metadata: Record<string, unknown> | null;
}

export const GET = withAuth(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: clientId } = await params;

  // Cargar datos del cliente
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, company: true, hubspotCompanyId: true },
  });

  if (!client) {
    return NextResponse.json({ notes: [], error: "not_found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const companyOverride = searchParams.get("company");

  // Términos de búsqueda: nombre de empresa (o override) + nombre del cliente
  const companyName = companyOverride ?? client.company ?? null;
  const clientName  = client.name ?? null;

  // Construir términos únicos para evitar duplicados
  const searchTerms = Array.from(
    new Set(
      [companyName, clientName]
        .filter((t): t is string => !!t && t.trim().length > 0)
        .map((t) => t.trim())
    )
  );

  try {
    // Schema real de hs_notes: id, content, metadata, embedding
    let query = getDataLake()
      .from("hs_notes")
      .select("id, content, metadata")
      .order("id", { ascending: false })
      .limit(50);

    if (searchTerms.length === 1) {
      // Solo un término: ilike simple
      query = query.ilike("content", `%${searchTerms[0]}%`);
    } else if (searchTerms.length > 1) {
      // Múltiples términos: OR entre ellos
      const orFilter = searchTerms
        .map((t) => `content.ilike.%${t}%`)
        .join(",");
      query = query.or(orFilter);
    }

    const { data: rows, error } = await query;

    if (error) return apiError(error.message);

    const notes: DataLakeNote[] = (rows ?? []).map((row) => ({
      id: row.id,
      content: row.content ?? "(sin contenido)",
      metadata: row.metadata ?? null,
    }));

    return NextResponse.json({ notes });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "unexpected_error");
  }
});

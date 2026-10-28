/**
 * GET /api/external/test/[token]/pdf — EL RESULTADO DEL TEST EN PDF (28 oct). Público: el token es la llave, como la
 * página del resultado.
 *
 * Usa el motor de PDF de siempre (lib/print/pdf-runner.ts: Chromium abre una página de la propia app y la imprime, con
 * el semáforo único de 2 a la vez y cola de 4 para todo Nexus). Imprime /external/test/resultado/imprimir: la misma vista
 * del resultado sin botones ni calendario, con el radar en SVG. El orden:
 *   1. el token con su forma y el tope por dirección (lib/tests-diagnostico/limite.ts) → sin tocar la base;
 *   2. que el resultado exista y esté terminado → 404 neutro antes de gastar un Chromium;
 *   3. el tope total por hora, que cuenta solo resultados reales (un script con tokens inventados no lo agota);
 *   4. el turno del semáforo; renderizar y soltarlo SIEMPRE.
 * El nombre del archivo sale de la regla de todos los PDF (`slugify`), y el token nunca se escribe en el log.
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { acquirePdfSlot, pdfErrorMessage, renderPathToPdf, slugify } from "@/lib/print/pdf-runner";
import { direccionDelVisitante, permitirPdfDeLaDireccion, permitirPdfEnTotal } from "@/lib/tests-diagnostico/limite";
import { rutaDeImpresion, sinElToken, TOKEN_DEL_RESULTADO } from "@/lib/tests-diagnostico/pagina-del-resultado";
import { resultadoPublico } from "@/lib/tests-diagnostico/servicio-server";

export const dynamic = "force-dynamic";

const NO_EXISTE = { error: "Este resultado no existe." };

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_DEL_RESULTADO.test(token)) return NextResponse.json(NO_EXISTE, { status: 404 });
  const ip = direccionDelVisitante(req.headers);
  const hash = ip ? createHash("sha256").update(`test-diagnostico:${ip}`).digest("hex").slice(0, 32) : null;
  if (!permitirPdfDeLaDireccion(hash)) {
    return NextResponse.json({ error: "Ya pediste varios PDF seguidos. Espera unos minutos y vuelve a intentarlo." }, { status: 429 });
  }
  const res = await resultadoPublico(token);
  if (!res) return NextResponse.json(NO_EXISTE, { status: 404 });
  if (!permitirPdfEnTotal()) {
    return NextResponse.json({ error: "Estamos preparando muchos PDF en este momento. Vuelve a intentarlo en un rato." }, { status: 429 });
  }

  const release = await acquirePdfSlot();
  if (!release) {
    return NextResponse.json({ error: "Estamos preparando varios PDF a la vez. Espera unos segundos y vuelve a intentarlo." }, { status: 429 });
  }
  try {
    const { pdf } = await renderPathToPdf(rutaDeImpresion(token));
    const empresa = res.intento.empresa || res.intento.dominio || "";
    const archivo = `${["diagnostico", slugify(res.resultado.areaNombre, ""), slugify(empresa, "")].filter(Boolean).join("-")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${archivo}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    // El mensaje del motor habla de Chromium y de .env.local: eso es para el log, no para el prospecto. Un error de
    // navegación trae la dirección entera, con el token: se tapa antes de escribirlo (sinElToken).
    console.error("[test-diagnostico/pdf] error:", pdfErrorMessage(e), sinElToken(e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ error: "No se pudo preparar el PDF. Vuelve a intentarlo en un momento." }, { status: 500 });
  } finally {
    release();
  }
}

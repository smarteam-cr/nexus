/**
 * /external/escala/[token] — LA ESCALA de una empresa, para presentársela (Elías, 30 oct). Se ve como el resultado del
 * test (ResultadoDelTestVista), con lo que ya está medido. Mismo modelo que un documento de la empresa: la URL es el
 * secreto (256 bits), sin contraseña.
 *
 * Toda la seguridad vive en `escalaParaElToken` (chokepoint fail-closed, re-chequea en CADA render). `force-dynamic` no es
 * decoración: sin él, revocar no surtiría efecto. El `Referrer-Policy: no-referrer` de `/external/*` vive en
 * next.config.ts. `noindex`: la URL circula por correo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ResultadoDelTestVista, { EscalaSinMedir } from "@/components/external/test/ResultadoDelTestVista";
import { escalaParaElToken } from "@/lib/external/escala-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Genérico a propósito: el título de la pestaña viaja en historiales y capturas.
  title: "Smarteam",
  robots: { index: false, follow: false },
};

export default async function EscalaDelClientePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ area?: string | string[] }> }) {
  const { token } = await params;
  const { area } = await searchParams;
  const d = await escalaParaElToken(token);
  // Un 404 neutro: no distingue un token inválido de uno revocado.
  if (!d) notFound();
  const r = d.resultados.find((x) => x.areaId === area) ?? d.resultados[0];
  if (!r) return <EscalaSinMedir />;
  return (
    <ResultadoDelTestVista
      r={r}
      empresa={d.empresa}
      dominio={d.dominio}
      fecha={d.fecha}
      agenda=""
      detalles={d.detalles}
      dimensionDelRiesgo={d.dimensionDelRiesgo}
      deLaEscala={{ areas: d.areas.map((a) => ({ ...a, href: `/external/escala/${token}?area=${encodeURIComponent(a.id)}` })), porExplorar: d.porExplorar[r.areaId] ?? [] }}
    />
  );
}

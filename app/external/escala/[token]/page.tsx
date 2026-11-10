/**
 * /external/escala/[token] — LA ESCALA de una empresa, para presentársela (Elías, 30 oct). Se ve como el resultado del
 * test (ResultadoDelTestVista), con lo que ya está medido. Mismo modelo que un documento de la empresa: la URL es el
 * secreto (256 bits), sin contraseña.
 *
 * Desde el 9 nov abre en la pestaña «Resumen» (ResumenDeLaEscalaVista: lo que hicimos, los datos rojos, lo que
 * encontramos, dónde queda cada equipo y la validación) y cada equipo es otra pestaña (`?area=<id>`). `?area=resumen`, o
 * un área que no está, vuelve al Resumen.
 *
 * Toda la seguridad vive en `escalaParaElToken` (chokepoint fail-closed, re-chequea en CADA render). `force-dynamic` no es
 * decoración: sin él, revocar no surtiría efecto. El `Referrer-Policy: no-referrer` de `/external/*` vive en
 * next.config.ts. `noindex`: la URL circula por correo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PESTANA_DEL_RESUMEN } from "@/components/external/test/ArribaDeLaEscala";
import ResultadoDelTestVista, { EscalaSinMedir } from "@/components/external/test/ResultadoDelTestVista";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
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
  if (!d.resultados.length) return <EscalaSinMedir />;
  const base = `/external/escala/${token}`;
  const areas = d.areas.map((a) => ({ ...a, href: `${base}?area=${encodeURIComponent(a.id)}` }));
  const r = typeof area === "string" && area !== PESTANA_DEL_RESUMEN ? d.resultados.find((x) => x.areaId === area) : undefined;
  if (!r)
    return (
      <ResumenDeLaEscalaVista
        resumen={d.resumen}
        empresa={d.empresa}
        dominio={d.dominio}
        fecha={d.fecha}
        pestanas={[{ id: PESTANA_DEL_RESUMEN, nombre: "Resumen", href: base }, ...areas]}
      />
    );
  return (
    <ResultadoDelTestVista
      r={r}
      empresa={d.empresa}
      dominio={d.dominio}
      fecha={d.fecha}
      agenda=""
      detalles={d.detalles}
      dimensionDelRiesgo={d.dimensionDelRiesgo}
      deLaEscala={{ areas, porExplorar: d.porExplorar[r.areaId] ?? [], resumen: { href: base } }}
    />
  );
}

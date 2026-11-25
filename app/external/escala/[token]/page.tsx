/**
 * /external/escala/[token] — LA ESCALA de una empresa, para presentársela (Elías, 30 oct). Se ve como el resultado del
 * test (ResultadoDelTestVista), con lo que ya está medido. Mismo modelo que un documento de la empresa: la URL es el
 * secreto (256 bits), sin contraseña.
 *
 * Desde el 9 nov abre en la pestaña «Resumen» (ResumenDeLaEscalaVista: lo que hicimos, los datos rojos, lo que
 * encontramos, dónde queda cada equipo y la validación) y cada equipo es otra pestaña (`?area=<id>`). `?area=resumen`, o
 * un área que no está, vuelve al Resumen.
 *
 * Lo que ve es la foto PUBLICADA (16 nov, lib/exploraciones/escala-publicada.ts), con los textos que el equipo cambió
 * (`textos`, lib/external/textos-de-la-pagina.ts).
 *
 * Sin Resumen en lo publicado (24 nov, TEC · AE se publicó antes de armarlo), no hay pestaña «Resumen»: sería una portada
 * con huecos y texto de relleno. Abre en la página de un equipo y las pestañas son las de los equipos
 * (lib/external/escala-sin-resumen.ts). Armado el Resumen y publicado otra vez, la pestaña vuelve.
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
import { areaSinResumen, tieneResumen } from "@/lib/external/escala-sin-resumen";
import { nivelesConElVistazoDeHoy } from "@/lib/tests-diagnostico/servicio-server";

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
  if (d === "sin-publicar" || !d.resultados.length) return <EscalaSinMedir />;
  const base = `/external/escala/${token}`;
  // Un equipo sin sesiones dice «Por explorar» y no se abre, tampoco con su dirección directa (Elías, 11 nov).
  const sinExplorar = new Set(d.resumen.sinExplorar);
  const areas = d.areas.map((a) => ({ ...a, href: `${base}?area=${encodeURIComponent(a.id)}`, ...(sinExplorar.has(a.id) ? { porExplorar: true } : {}) }));
  const pedida = typeof area === "string" ? area : null;
  const conResumen = tieneResumen(d.resumen);
  const r = conResumen
    ? pedida && pedida !== PESTANA_DEL_RESUMEN && !sinExplorar.has(pedida)
      ? d.resultados.find((x) => x.areaId === pedida)
      : undefined
    : d.resultados.find((x) => x.areaId === areaSinResumen(d.resultados, pedida));
  if (!r && !conResumen) return <EscalaSinMedir />;
  if (!r)
    return (
      <ResumenDeLaEscalaVista
        resumen={d.resumen}
        empresa={d.empresa}
        dominio={d.dominio}
        logo={d.logo}
        fecha={d.fecha}
        pestanas={[{ id: PESTANA_DEL_RESUMEN, nombre: "Resumen", href: base }, ...areas]}
        textos={d.textos}
      />
    );
  // La tarjeta de cada nivel de la escalera (21 nov): una foto publicada antes no trae su vistazo; sale de la escala de hoy.
  const niveles = await nivelesConElVistazoDeHoy(r);
  return (
    <ResultadoDelTestVista
      r={{ ...r, niveles }}
      empresa={d.empresa}
      dominio={d.dominio}
      fecha={d.fecha}
      agenda=""
      detalles={d.detalles}
      dimensionDelRiesgo={d.dimensionDelRiesgo}
      logo={d.logo}
      deLaEscala={{
        areas,
        porExplorar: d.porExplorar[r.areaId] ?? [],
        // Sin Resumen publicado, ni su pestaña ni «← Volver al Resumen».
        resumen: conResumen ? { href: base } : null,
        textos: d.textos,
        // Lo que más le cuesta al área (20 nov): su tarjeta del Resumen publicado.
        tarjeta: d.resumen.tarjetas.find((t) => t.areaId === r.areaId) ?? null,
      }}
    />
  );
}

/**
 * /external/business-case/verify/[token] — la dirección de las propuestas CON contraseña.
 *
 * El modo con contraseña se retiró el 2026-09-10 (el porqué, en lib/business-cases/access-url.ts).
 * Esta dirección sigue en correos ya enviados, así que vive: lleva a la propuesta del token de SU
 * PROPIA URL y a ninguna otra. No lee cookies ni toca la base —la puerta abierta decide si se
 * sirve: revocada, sin publicar o caducada, igual que siempre— y ya no pide una contraseña que
 * nadie recuerda: el token de esta URL abría la propuesta por la puerta abierta de todos modos.
 *
 * Un valor sin forma de token no se redirige: 404 neutro. Así, de la URL solo pasan al destino
 * 64 hex. `redirect()` temporal, NUNCA `permanentRedirect()`: un 308 queda cacheado en el
 * navegador.
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { bcOpenPath } from "@/lib/business-cases/access-url";
import { BC_TOKEN_RE } from "@/lib/external/business-case-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // A-14: la URL lleva el token y circula por correo — que ningún buscador la indexe.
  title: "Smarteam",
  robots: { index: false, follow: false },
};

export default async function PropuestaConContrasenaRetirada({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!BC_TOKEN_RE.test(token)) notFound();
  redirect(bcOpenPath(token));
}

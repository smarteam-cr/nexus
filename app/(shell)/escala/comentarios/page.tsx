/**
 * app/(shell)/escala/comentarios/page.tsx — la vieja bandeja de comentarios de la escala.
 *
 * Desde el 2026-10-05 los comentarios de la escala se deciden en la bandeja de /feedback, junto con el
 * resto (Elías: «es mejor que todo se maneje desde el módulo de feedback nuevo»). Esta dirección queda
 * para que no se rompa un enlace viejo: a quien revisa el feedback lo lleva a la bandeja con los de la
 * escala; al resto, a la escala, donde cada comentario se ve sobre su criterio.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { esRevisorDeFeedback } from "@/lib/feedback/reglas";

export default async function BandejaDeLaEscala() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  redirect(esRevisorDeFeedback(ctx.role) ? "/feedback?origen=escala" : "/escala");
}

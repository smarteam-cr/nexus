/**
 * /para-ti/reunion/[eventoId] — retirada el 2026-10-20 (decisión de Elías): «Preparar» abre el panel de la reunión en
 * la agenda de «Para ti», con la guía, los pendientes que se pueden cerrar o agendar y la búsqueda en las reuniones.
 * Lleva ahí a quien llegue por un enlace viejo (un correo de la mañana anterior).
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ eventoId: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const { eventoId } = await params;
  redirect(`/para-ti?reunion=${encodeURIComponent(decodeURIComponent(eventoId))}`);
}

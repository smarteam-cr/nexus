import { redirect } from "next/navigation";

// La sección de documentos ahora está integrada en el panel del cliente (ClientInfoPanel).
// Redirigir al workspace principal.
export default async function ClientDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/clients/${id}/stage/1`);
}

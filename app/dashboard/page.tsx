import { redirect } from "next/navigation";

// "Gestión de cartera" evolucionó a "Éxito del cliente" (/exito-cliente):
// mismos buckets de salud + alertas del watchdog + señales de HubSpot.
// La ruta vieja se conserva como redirect (bookmarks/links internos).
export default function DashboardPage() {
  redirect("/customer-success");
}

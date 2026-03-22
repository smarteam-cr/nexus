import { redirect } from "next/navigation";

// Las auditorías ahora viven dentro del workspace del cliente
// Etapa 1 → Auditoría del CRM
export default function AuditsPage() {
  redirect("/clients");
}

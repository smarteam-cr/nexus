import { redirect } from "next/navigation";

// El hub de Marketing abre en Contenido (el índice de ideas) — el equipo
// llega el lunes y las ve de una.
export default function MarketingIndexPage() {
  redirect("/marketing/contenido");
}

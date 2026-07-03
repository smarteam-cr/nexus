import { redirect } from "next/navigation";

// El hub de Marketing abre en el motor de Contenido.
export default function MarketingIndexPage() {
  redirect("/marketing/contenido");
}

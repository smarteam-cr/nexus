import { redirect } from "next/navigation";

// El motor vive dentro de Marketing (sección "Generación"). Redirect para no
// romper links/bookmarks a la URL vieja (/marketing/contenido ahora es otra
// página — el índice de ideas, antes llamado "Ideas").
export default function ContenidoRedirect() {
  redirect("/marketing/generacion");
}

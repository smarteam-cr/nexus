import { redirect } from "next/navigation";

// El motor vive dentro de Marketing (tab "Contenido"). Redirect para no romper
// links/bookmarks a la URL vieja.
export default function ContenidoRedirect() {
  redirect("/marketing/contenido");
}

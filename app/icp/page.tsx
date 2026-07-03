import { redirect } from "next/navigation";

/**
 * /icp — ruta vieja (era universal, con vista propia). El ICP ahora vive
 * completo dentro de Marketing → Audiencia → ICP (lectura universal ya
 * garantizada ahí: canEdit=false para roles no-editores). Redirect para no
 * romper bookmarks/links viejos.
 */
export default function IcpRedirectPage() {
  redirect("/marketing/icp");
}

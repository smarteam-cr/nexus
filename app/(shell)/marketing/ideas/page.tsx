import { redirect } from "next/navigation";

// "Ideas" se renombró a "Contenido". Redirect para no romper bookmarks.
export default function MarketingIdeasRedirect() {
  redirect("/marketing/contenido");
}

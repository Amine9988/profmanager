import type { MetadataRoute } from "next";
import { getT } from "@/lib/i18n";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getT();
  return {
    name: "ProfManager",
    short_name: "ProfManager",
    description: t("metadata.manifest_description"),
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#18181b",
    icons: [
      { src: "/favicon.ico", sizes: "256x256", type: "image/x-icon" },
    ],
  };
}

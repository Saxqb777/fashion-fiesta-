import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fashion Fiesta Studio",
    short_name: "Fashion Fiesta",
    description: "The shop system for Fashion Fiesta Ladies Tailoring & Textiles.",
    start_url: "/today",
    display: "standalone",
    background_color: "#FAF7F2",
    theme_color: "#D7182A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

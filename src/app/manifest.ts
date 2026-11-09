import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IPL Auction Arena",
    short_name: "Auction Arena",
    description:
      "A realistic IPL auction simulator with verified player statistics, explainable ratings and a full season simulator.",
    start_url: "/",
    display: "standalone",
    background_color: "#070b12",
    theme_color: "#ff7a1a",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

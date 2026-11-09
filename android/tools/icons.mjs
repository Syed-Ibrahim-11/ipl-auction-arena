import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const androidDir = path.resolve(here, "..");
const projectDir = path.resolve(androidDir, "..");
const sourceIcon = path.join(projectDir, "public", "brand", "icon-512.png");

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

for (const [density, size] of Object.entries(DENSITIES)) {
  const dir = path.join(androidDir, "res", `mipmap-${density}`);
  await mkdir(dir, { recursive: true });
  for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
    await sharp(sourceIcon)
      .resize(size, size, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toFile(path.join(dir, name));
  }
}

// Adaptive icons render the foreground inside a 108dp box; the artwork already
// carries its own dark background, so a full-bleed square crops cleanly.
const foregroundDir = path.join(androidDir, "res", "drawable-nodpi");
await mkdir(foregroundDir, { recursive: true });
await sharp(sourceIcon)
  .resize(432, 432, { fit: "cover" })
  .png({ compressionLevel: 9 })
  .toFile(path.join(foregroundDir, "ic_launcher_foreground.png"));

await mkdir(path.join(androidDir, "assets"), { recursive: true });
await sharp(sourceIcon).resize(192, 192).png({ compressionLevel: 9 }).toFile(
  path.join(androidDir, "assets", "logo.png"),
);

await mkdir(path.join(androidDir, "store"), { recursive: true });
await copyFile(sourceIcon, path.join(androidDir, "store", "icon-512.png"));

console.log("icons: wrote launcher mipmaps, adaptive foreground, offline logo, store icon");

// Rasterises public/icons/*.svg into the PNG sizes the web manifest needs.
// Run with `npm run icons` after changing the SVGs.
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../public/icons/", import.meta.url));
const jobs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["maskable.svg", "maskable-512.png", 512],
];
for (const [src, out, size] of jobs) {
  await sharp(dir + src, { density: 600 }).resize(size, size).png().toFile(dir + out);
  console.log(`${out} (${size}px)`);
}

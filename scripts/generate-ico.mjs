import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pngToIco from "png-to-ico";

const sizes = [16, 24, 32, 48, 64, 128, 256];
const sourceFiles = sizes.map((size) => resolve(`build/icon-${size}.png`));
const ico = await pngToIco(sourceFiles);
await writeFile(resolve("build/icon.ico"), ico);

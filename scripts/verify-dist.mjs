import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const absoluteAsset = /(?:src|href)="\/assets\//;

if (absoluteAsset.test(html)) {
  throw new Error("生产构建包含绝对资源路径，Electron file:// 页面将无法加载");
}

if (!html.includes('src="./assets/') || !html.includes('href="./assets/')) {
  throw new Error("生产构建缺少相对 JS/CSS 资源路径");
}

console.log("生产资源路径验证通过");

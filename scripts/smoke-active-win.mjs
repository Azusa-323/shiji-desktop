import activeWindow from "active-win";

const active = await activeWindow();
if (!active?.owner?.name) {
  throw new Error("未能识别当前前台应用");
}

console.log(JSON.stringify({ recognized: true, platform: process.platform }));

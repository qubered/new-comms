// node scripts/icons.mjs: render the app icon to the PNG sizes browsers need for installing.
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("apps/talk/public/icon.svg", "utf8");
// Maskable icons are cropped to a circle or squircle: keep the artwork inside the centre 80%.
const maskable = svg.replace('<rect width="96" height="96" rx="20" fill="#121417"/>', '<rect width="96" height="96" fill="#121417"/>').replace(/<rect x="34"/, '<g transform="translate(9.6 9.6) scale(.8)"><rect x="34"').replace("</svg>", "</g></svg>");
const render = (source, size, file) => writeFileSync(file, new Resvg(source, { fitTo: { mode: "width", value: size } }).render().asPng());
for (const app of ["talk", "manager"]) {
  const dir = `apps/${app}/public`;
  render(svg, 192, `${dir}/icon-192.png`);
  render(svg, 512, `${dir}/icon-512.png`);
  render(svg, 180, `${dir}/apple-touch-icon.png`);
  render(maskable, 512, `${dir}/icon-maskable-512.png`);
}
console.log("icons written");

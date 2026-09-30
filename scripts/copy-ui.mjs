import fs from "fs";
import path from "path";

const src = path.join("client", "dist");
const dest = path.join("server", "public");

if (!fs.existsSync(path.join(src, "index.html"))) {
  console.error("client/dist/index.html is missing. Run the client build first.");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} -> ${dest}`);

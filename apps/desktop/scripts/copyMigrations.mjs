import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..", "..", "..");
const sourceDir = path.resolve(root, "packages", "persistence", "src", "db", "migrations");
const targetDir = path.resolve(root, "apps", "desktop", "dist-electron", "migrations");

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Migrations source does not exist: ${sourceDir}`);
}

fs.mkdirSync(targetDir, { recursive: true });
const files = fs.readdirSync(sourceDir).filter((name) => name.endsWith(".sql"));
for (const file of files) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
}

console.log(`Copied ${files.length} migration file(s) to ${targetDir}`);


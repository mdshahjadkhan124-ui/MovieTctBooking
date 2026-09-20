// Regenerates the frontend's copy of buildSeatGrid from the backend's.
//
// Why a copy at all: the frontend deploys from frontend/ (Vercel) and the
// backend from backend/ (Render), so neither build can reach a folder
// outside its own root. Rather than restructure both deployments, the
// backend owns the logic and this script mirrors it, with tests that fail
// the moment the two drift (see buildSeatGrid.parity.test.js in each app).
//
// Run: npm run sync:shared    (from backend/)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(here, "..", "src", "utils", "buildSeatGrid.js");
const TARGET = path.join(here, "..", "..", "frontend", "src", "utils", "buildSeatGrid.js");

const BANNER = `// GENERATED FILE — do not edit here.
//
// Mirrored from backend/src/utils/buildSeatGrid.js by \`npm run sync:shared\`
// (backend/scripts/syncSharedCode.js). The seat grid the UI renders and the
// grid the recommendation engine scores must be identical, and the two apps
// deploy from separate roots so neither can import the other's files.
// Edit the backend copy, re-run the script, and the parity tests will keep
// the two honest.
`;

const source = fs.readFileSync(SOURCE, "utf8");
const generated = `${BANNER}\n${source}`;

const existing = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, "utf8") : null;
if (existing === generated) {
  console.log("frontend copy already up to date.");
} else {
  fs.writeFileSync(TARGET, generated);
  console.log(`Wrote ${path.relative(path.join(here, "..", ".."), TARGET)} from the backend source.`);
}

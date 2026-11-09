import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error("usage: node build.mjs PRODUCT_JSON OUTPUT_JSON");
}

const sourcePath = resolve(process.cwd(), inputPath);
const destinationPath = resolve(process.cwd(), outputPath);
const contract = JSON.parse(await readFile(sourcePath, "utf8"));
const requiredStrings = [
  "technicalId",
  "displayName",
  "ownedPluginId",
  "sourceRoot",
  "currentRuntimeStatus",
  "releaseBranchPrefix"
];

for (const key of requiredStrings) {
  if (typeof contract[key] !== "string" || !contract[key].trim()) {
    throw new Error(`product contract requires ${key}`);
  }
}

for (const key of ["runtimeModules", "requiredEnvironment", "forbiddenEnvironment", "sharedIdentityContract"]) {
  if (!Array.isArray(contract[key]) || contract[key].some((value) => typeof value !== "string" || !value)) {
    throw new Error(`product contract requires a string array for ${key}`);
  }
}

const overlap = contract.requiredEnvironment.filter((key) => contract.forbiddenEnvironment.includes(key));
if (overlap.length) {
  throw new Error(`required and forbidden environment keys overlap: ${overlap.join(", ")}`);
}

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
for (const path of [contract.sourceRoot, ...contract.runtimeModules]) {
  await access(resolve(repositoryRoot, path));
}

const canonical = JSON.stringify(contract);
const manifest = {
  schemaVersion: 1,
  buildKind: "local-product-boundary-contract",
  currentRuntimeStatus: contract.currentRuntimeStatus,
  claim: "This artifact verifies a product-owned boundary contract; it is not a standalone Next.js deployment.",
  contract,
  contractSha256: createHash("sha256").update(canonical).digest("hex")
};

await mkdir(dirname(destinationPath), { recursive: true });
await writeFile(destinationPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`${contract.technicalId}: wrote ${destinationPath}`);

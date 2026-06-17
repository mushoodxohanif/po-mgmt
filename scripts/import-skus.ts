import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { importSkuDirectory, formatImportSummary } = await import(
    "../lib/services/sku-import"
  );

  const directoryArg = process.argv[2];
  const skusDir = directoryArg
    ? join(process.cwd(), directoryArg)
    : join(process.cwd(), "skus");

  const summary = await importSkuDirectory(skusDir);

  console.log(formatImportSummary(summary));

  if (summary.filesFailed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});

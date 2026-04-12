import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(process.cwd(), ".cloudflare-pages");

async function main() {
  await mkdir(outputDir, { recursive: true });

  await writeFile(
    path.join(outputDir, "_redirects"),
    [
      "/* /index.html 200",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    path.join(outputDir, "_headers"),
    [
      "/_expo/static/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
      "/assets/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(`Prepared Cloudflare Pages assets in ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

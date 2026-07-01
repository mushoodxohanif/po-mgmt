import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(scriptDir, "..");
const docsDir = path.join(rootDir, "docs");
const diagramsDir = path.join(docsDir, "diagrams");
const mdPath = path.join(docsDir, "STATEMENT_OF_WORK.md");
const processedPath = path.join(docsDir, "STATEMENT_OF_WORK.processed.md");
const htmlPath = path.join(docsDir, "STATEMENT_OF_WORK.html");
const pdfPath = path.join(docsDir, "STATEMENT_OF_WORK.pdf");
const mmdc = path.join(rootDir, "node_modules/.bin/mmdc");
const chromePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function run(command: string) {
  execSync(command, { cwd: rootDir, stdio: "inherit", env: process.env });
}

function renderMermaidDiagrams(markdown: string): string {
  mkdirSync(diagramsDir, { recursive: true });

  let index = 0;

  return markdown.replace(
    /```mermaid\n([\s\S]*?)```/g,
    (_match, code: string) => {
      index += 1;
      const name = `diagram-${index}`;
      const mmdPath = path.join(diagramsDir, `${name}.mmd`);
      const pngPath = path.join(diagramsDir, `${name}.png`);
      const diagramSource = `${code.trim()}\n`;

      writeFileSync(mmdPath, diagramSource);

      const isGantt = diagramSource.includes("gantt");
      const width = isGantt ? 1800 : 1200;

      run(`"${mmdc}" -i "${mmdPath}" -o "${pngPath}" -b white -w ${width}`);

      if (!existsSync(pngPath)) {
        throw new Error(`Failed to render Mermaid diagram: ${name}`);
      }

      return `\n![${name}](diagrams/${name}.png)\n`;
    },
  );
}

function buildHtml(): void {
  const css = `
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1a1a1a;
      max-width: 900px;
      margin: 2rem auto;
      padding: 0 1rem;
    }
    h1 { font-size: 22pt; border-bottom: 2px solid #e5e5e5; padding-bottom: 0.3em; }
    h2 { font-size: 16pt; margin-top: 1.5em; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.2em; }
    h3 { font-size: 13pt; margin-top: 1.2em; }
    h4 { font-size: 11pt; margin-top: 1em; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 9pt; page-break-inside: avoid; }
    th, td { border: 1px solid #d4d4d4; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; font-weight: 600; }
    img { max-width: 100%; height: auto; display: block; margin: 1em auto; page-break-inside: avoid; }
    code { background: #f5f5f5; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
    hr { border: none; border-top: 1px solid #e5e5e5; margin: 2em 0; }
    @media print {
      body { margin: 0; max-width: none; }
      h2, h3 { page-break-after: avoid; }
    }
  `;

  const cssPath = path.join(docsDir, "sow-print.css");
  writeFileSync(cssPath, css);

  run(
    `pandoc "${processedPath}" -o "${htmlPath}" --standalone --metadata title="Statement of Work" --metadata lang=en --css sow-print.css`,
  );
}

function buildPdf(): void {
  if (!existsSync(chromePath)) {
    throw new Error(
      `Google Chrome not found at ${chromePath}. Install Chrome or update chromePath in build-sow-pdf.ts.`,
    );
  }

  const fileUrl = `file://${htmlPath}`;

  run(
    `"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${fileUrl}"`,
  );
}

function main() {
  if (!existsSync(mdPath)) {
    throw new Error(`Missing source file: ${mdPath}`);
  }

  const markdown = readFileSync(mdPath, "utf-8");
  const processed = renderMermaidDiagrams(markdown);
  writeFileSync(processedPath, processed);

  buildHtml();
  buildPdf();

  if (!existsSync(pdfPath)) {
    throw new Error(`PDF was not created: ${pdfPath}`);
  }

  unlinkSync(processedPath);

  console.log(`\nPDF written to ${pdfPath}`);
}

main();

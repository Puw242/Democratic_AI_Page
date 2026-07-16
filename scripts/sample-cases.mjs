import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const resultsRoot = join(repoRoot, "..", "results_anal");
const supplementaryRoot = join(resultsRoot, "supplementary");
const analysisRoot = join(supplementaryRoot, "analysis");

const selectedCaseRoot = join(supplementaryRoot, "case_pipeline_w2c_no_badges_pdfs", "pdf");
const visualizationRoot = join(analysisRoot, "case_pipeline_merged_visualization");
const sourceCaseDir = join(visualizationRoot, "case_pages");
const metadataFile = join(
  analysisRoot,
  "case_pipeline_w2c_no_badges_visualization",
  "case_pipeline_w2c_no_badges_visualization.json",
);
const claudeMetadataFile = join(
  analysisRoot,
  "case_pipeline_claude_visualization",
  "case_pipeline_claude_visualization.json",
);
const geminiMetadataFile = join(
  analysisRoot,
  "case_pipeline_no_error_visualization",
  "case_pipeline_no_error_visualization.json",
);

const additionalSelections = [
  { displayId: "Case 680", rawId: "6_297", source: "W2C" },
  { displayId: "Case 020", rawId: "1_1085", source: "Gemini" },
  { displayId: "Case 065", rawId: "CKSUnA8f2e4FZyu5pXFuhm", source: "Claude" },
  { displayId: "Case 047", rawId: "424_0_Perspective_Taking", source: "Claude" },
  { displayId: "Case 706", rawId: "885_1_Perspective_Taking", source: "W2C" },
  { displayId: "Case 643", rawId: "4_849", source: "W2C" },
  { displayId: "Case 719", rawId: "959_1_Perspective_Taking", source: "W2C" },
  { displayId: "Case 048", rawId: "3_1489", source: "Gemini" },
  { displayId: "Case 323", rawId: "6_549", source: "W2C" },
  { displayId: "Case 687", rawId: "6_601", source: "W2C" },
  { displayId: "Case 271", rawId: "4_117", source: "W2C" },
  { displayId: "Case 015", rawId: "1_1912", source: "Gemini" },
  { displayId: "Case 221", rawId: "1_542", source: "W2C" },
  { displayId: "Case 686", rawId: "6_529", source: "W2C" },
  { displayId: "Case 673", rawId: "6_204", source: "W2C" },
  { displayId: "Case 264", rawId: "3asRExdxmWQtJw4sv49AGZ", source: "W2C" },
  { displayId: "Case 684", rawId: "6_389", source: "W2C" },
  { displayId: "Case 310", rawId: "6_142", source: "W2C" },
  { displayId: "Case 548", rawId: "1595_1_Perspective_Taking", source: "W2C" },
  { displayId: "Case 602", rawId: "2_1313", source: "W2C" },
  { displayId: "Case 638", rawId: "4_524", source: "W2C" },
  { displayId: "Case 041", rawId: "1_2947", source: "Gemini" },
  { displayId: "Case 044", rawId: "261_0_Spatial_Interaction", source: "Gemini" },
  { displayId: "Case 054", rawId: "VWfKcAKJSwowZ7bGBCTpc6", source: "Gemini" },
  { displayId: "Case 099", rawId: "71_0_Dynamic_Reasoning", source: "Gemini" },
  { displayId: "Case 069", rawId: "3409", source: "Claude" },
  { displayId: "Case 024", rawId: "38_0_Dynamic_Reasoning", source: "Claude" },
  { displayId: "Case 038", rawId: "245_0_Dynamic_Reasoning", source: "Claude" },
  { displayId: "Case 019", rawId: "15_1_Dynamic_Reasoning", source: "Claude" },
  { displayId: "Case 067", rawId: "3_3385", source: "Claude" },
];

const outputRoot = "public/cases";
const outputCaseDir = join(outputRoot, "case_pages");
const outputDataFile = "src/data/caseSamples.json";
const depthOverrides = new Map([
  ["15_1_Dynamic_Reasoning", join(repoRoot, "..", "depth", "supp_ds_depth", "15_1_Dynamic_Reasoning.jpg")],
]);

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function decodeHtml(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number.parseInt(value, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html) {
  return decodeHtml(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function matchOne(html, pattern) {
  return html.match(pattern)?.[1] ?? "";
}

function displayNumber(folderName) {
  return folderName.match(/^Case_(\d+)/)?.[1] ?? "";
}

function copyAsset(relativeHref) {
  const cleanHref = decodeHtml(relativeHref).split("#")[0].split("?")[0];
  if (!cleanHref.startsWith("../assets/")) return null;

  const sourcePath = normalize(join(sourceCaseDir, cleanHref));
  if (!sourcePath.startsWith(join(visualizationRoot, "assets"))) {
    throw new Error(`Refusing to copy asset outside source assets: ${cleanHref}`);
  }
  const publicHref = cleanHref.replace("../", "cases/");
  const outputPath = join("public", publicHref);
  if (!existsSync(sourcePath) && existsSync(outputPath)) {
    return publicHref;
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing asset referenced by case page: ${cleanHref}`);
  }

  ensureDir(outputPath);
  copyFileSync(sourcePath, outputPath);
  return publicHref;
}

function applyDepthOverride(html, rawId) {
  const overridePath = depthOverrides.get(String(rawId));
  if (!overridePath) return html;
  if (!existsSync(overridePath)) {
    throw new Error(`Missing depth override for ${rawId}: ${overridePath}`);
  }

  const fileName = overridePath.split("/").at(-1);
  const publicHref = `cases/assets/depth_maps/${fileName}`;
  const outputPath = join("public", publicHref);
  ensureDir(outputPath);
  copyFileSync(overridePath, outputPath);

  const { document } = parseHTML(html);
  for (const image of [...document.querySelectorAll(".depth-evidence .evidence-stage > img:first-child")]) {
    image.setAttribute("src", `../assets/depth_maps/${fileName}`);
  }
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

function selectedFolders() {
  return readdirSync(selectedCaseRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => displayNumber(name) !== "099")
    .sort((a, b) => displayNumber(a).localeCompare(displayNumber(b), undefined, { numeric: true }));
}

function loadMetadata() {
  return {
    W2C: JSON.parse(readFileSync(metadataFile, "utf8")),
    Claude: JSON.parse(readFileSync(claudeMetadataFile, "utf8")),
    Gemini: JSON.parse(readFileSync(geminiMetadataFile, "utf8")),
  };
}

function findMetadataBySelection(metadataBySource, selection) {
  const data = metadataBySource[selection.source];
  if (!data) throw new Error(`Unknown metadata source: ${selection.source}`);

  const meta = data.find(
    (item) => item.display_id === selection.displayId && String(item.id) === String(selection.rawId),
  );
  if (!meta) {
    throw new Error(`No metadata found for ${selection.displayId} / ${selection.rawId} in ${selection.source}`);
  }
  return meta;
}

function candidatePages(meta) {
  const model = String(meta.model).toLowerCase();
  const caseNo = String(meta.display_id).match(/Case\s+(\d+)/)?.[1];
  const prefix = `${model}_case${caseNo}_`;
  return readdirSync(sourceCaseDir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".html"))
    .sort();
}

function findMatchingPage(meta) {
  const candidates = candidatePages(meta);
  if (candidates.length === 0) {
    throw new Error(`No HTML page found for ${meta.model} ${meta.display_id}`);
  }
  const exact = candidates.find((file) => {
    const html = readFileSync(join(sourceCaseDir, file), "utf8");
    const question = stripTags(matchOne(html, /<div class="question-text">([\s\S]*?)<\/div>/));
    return question === meta.question;
  });
  return exact ?? candidates[0];
}

function swapGeminiGptJurors(html) {
  const { document } = parseHTML(html);

  for (const block of [...document.querySelectorAll(".block")]) {
    const heading = block.querySelector("h4");
    if (!heading || heading.textContent.trim() !== "Jury") continue;

    const jurors = [...block.querySelectorAll(".juror")];
    const gemini = jurors.find((juror) => juror.querySelector(".juror-head b")?.textContent.trim() === "Gemini");
    const gpt = jurors.find((juror) => juror.querySelector(".juror-head b")?.textContent.trim() === "GPT");
    if (!gemini || !gpt) continue;

    const geminiHtml = gemini.innerHTML;
    const gptHtml = gpt.innerHTML;
    gemini.innerHTML = gptHtml;
    gpt.innerHTML = geminiHtml;
    gemini.querySelector(".juror-head b").textContent = "Gemini";
    gpt.querySelector(".juror-head b").textContent = "GPT";
  }

  for (const item of [...document.querySelectorAll(".summary-item")]) {
    const label = item.querySelector(".summary-label")?.textContent.trim();
    if (label !== "Correct jurors") continue;

    const value = item.querySelector(".summary-value");
    if (!value) continue;

    value.textContent = value.textContent
      .split(",")
      .map((name) => {
        const trimmed = name.trim();
        if (trimmed === "Gemini") return "GPT";
        if (trimmed === "GPT") return "Gemini";
        return trimmed;
      })
      .join(", ");
  }

  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

function setFinalDecisionToInternVL(html) {
  const { document } = parseHTML(html);
  const juryBlocks = [...document.querySelectorAll(".block")].filter(
    (block) => block.querySelector("h4")?.textContent.trim() === "Jury",
  );
  const pipelineStates = [];
  let lastDecisionText = "";
  let lastVerdictText = "";

  for (const jury of juryBlocks) {
    const internvl = [...jury.querySelectorAll(".juror")].find(
      (juror) => juror.querySelector(".juror-head b")?.textContent.trim() === "InternVL",
    );
    const decisionText = internvl?.querySelector(".agent-main")?.textContent.replace(/^Decision:\s*/, "").trim();
    const verdictBadge = internvl?.querySelector(".juror-head .verdict-badge");
    if (!decisionText || !verdictBadge) continue;

    const verdictClass = [...verdictBadge.classList].filter((name) => name !== "verdict-badge").join(" ");
    const verdictText = verdictBadge.textContent.trim() === "Correct" ? "Correct" : "Wrong";
    const finalDecision = [...jury.children].find((child) => child.classList?.contains("decision"));
    if (finalDecision) {
      finalDecision.innerHTML = `<b>Final decision: ${decisionText}</b> <span class="verdict-badge ${verdictClass}">${verdictText}</span>`;
    }

    pipelineStates.push(verdictText === "Correct" ? "C" : "W");
    lastDecisionText = decisionText;
    lastVerdictText = verdictText;
  }

  if (!lastDecisionText || !lastVerdictText) return html;

  const statusClass = lastVerdictText === "Correct" ? "status-correct" : "status-wrong";

  const pipelineCell = document.querySelector(".summary-band .summary-cell:nth-child(3) .summary-head");
  const answer = pipelineCell?.querySelector(".answer-value");
  const status = pipelineCell?.querySelector(".status-pill");
  if (answer) answer.textContent = lastDecisionText;
  if (status) {
    status.className = `status-pill ${statusClass}`;
    status.textContent = lastVerdictText;
  }

  const pipelineSeq = document.querySelector(".summary-band .summary-cell:nth-child(3) .summary-seq");
  if (pipelineSeq && pipelineStates.length > 0) {
    const states = [...pipelineSeq.querySelectorAll(".mini-state")];
    states.forEach((state, index) => {
      const value = pipelineStates[index];
      if (!value) return;
      state.className = `mini-state ${value === "C" ? "correct" : "wrong"}`;
      state.textContent = value;
    });
  }

  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

function applyLocalOverrides(fileName, html) {
  if (fileName === "claude_case006_1.html" || fileName === "claude_case009_1.html") {
    return swapGeminiGptJurors(html);
  }
  if (fileName === "internvl_case657_1.html") {
    return setFinalDecisionToInternVL(html);
  }
  return html;
}

function applyCasePageSpacing(html) {
  const spacingCss = `
@media(min-width:1200px){
  header{padding-left:20vw;padding-right:20vw}
  main{padding-left:20vw;padding-right:20vw}
}
.option-box.gt-option{
  border-color:#b7d8c0;
  background:#f7fbf8;
  color:#1f6b3a;
  font-weight:800;
}
.iter h3{
  font-size:18px;
  font-weight:800;
  color:#111827;
  letter-spacing:0;
}
.iter-summary-title{
  margin:0 0 7px;
  padding:0 12px 7px;
  border-bottom:1px solid #edf0f5;
  color:#374151;
  font-size:12px;
  font-weight:900;
  letter-spacing:.04em;
  text-transform:uppercase;
}
.block h4{font-size:15px;color:#111827}
`;
  return html.replace("</style>", `${spacingCss}</style>`);
}

function applyCasePageLabels(html) {
  const { document } = parseHTML(html);

  for (const entry of [...document.querySelectorAll(".meta-entry")]) {
    const label = entry.querySelector(".meta-label")?.textContent.trim();
    if (label === "Ground Truth") {
      const groundTruth = entry.querySelector(".meta-value")?.textContent.trim();
      if (groundTruth) {
        for (const option of [...document.querySelectorAll(".option-box")]) {
          if (option.textContent.trim() === groundTruth) {
            option.classList.add("gt-option");
          }
        }
      }
    }
  }

  for (const heading of [...document.querySelectorAll(".block h4")]) {
    const text = heading.textContent.trim();
    if (text === "POI") heading.textContent = "Advocacy";
    if (text === "Judge") heading.textContent = "JUDGE DECISION";
    if (text === "Jury") heading.textContent = "JURY VOTING";
  }

  for (const iteration of [...document.querySelectorAll(".iter")]) {
    const iterationLabel = iteration.querySelector("h3")?.textContent.trim() || "Iteration";
    const summary = iteration.querySelector(".iter-summary");
    if (!summary || summary.querySelector(".iter-summary-title")) continue;

    const title = document.createElement("div");
    title.className = "iter-summary-title";
    title.textContent = `${iterationLabel} Summary`;
    summary.insertBefore(title, summary.firstChild);
  }

  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

function extractCaseMetrics(html) {
  const { document } = parseHTML(html);

  const baselineStatus =
    document.querySelector(".summary-band .summary-cell:first-child .status-pill")?.textContent.trim() || "";
  const pipelineStatus =
    document.querySelector(".summary-band .summary-cell:nth-child(3) .status-pill")?.textContent.trim() || "";

  const iterationSummaries = [...document.querySelectorAll(".iter-summary")];
  const finalIterationSummary = iterationSummaries.at(-1);
  let jurorsCorrect = "";

  if (finalIterationSummary) {
    for (const item of [...finalIterationSummary.querySelectorAll(".summary-item")]) {
      const label = item.querySelector(".summary-label")?.textContent.trim();
      if (label === "Jurors correct") {
        jurorsCorrect = item.querySelector(".summary-value")?.textContent.trim() || "";
        break;
      }
    }
  }

  return { baselineStatus, pipelineStatus, jurorsCorrect };
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputCaseDir, { recursive: true });

const metadata = JSON.parse(readFileSync(metadataFile, "utf8"));
const byDisplayId = new Map(metadata.map((item) => [item.display_id, item]));
const metadataBySource = loadMetadata();

const selectedMetadata = selectedFolders().map((folderName) => {
  const displayId = `Case ${displayNumber(folderName)}`;
  const meta = byDisplayId.get(displayId);
  if (!meta) {
    throw new Error(`No metadata found for ${displayId}`);
  }
  return { ...meta, selectionSource: "W2C" };
});

for (const selection of additionalSelections) {
  selectedMetadata.push({
    ...findMetadataBySelection(metadataBySource, selection),
    selectionSource: selection.source,
  });
}

const uniqueMetadata = [];
const seenMetadata = new Set();
for (const meta of selectedMetadata) {
  const key = `${meta.selectionSource}:${meta.display_id}:${meta.id}`;
  if (seenMetadata.has(key)) continue;
  seenMetadata.add(key);
  uniqueMetadata.push(meta);
}

const cases = uniqueMetadata.map((meta) => {
  const fileName = findMatchingPage(meta);
  const sourceHtmlPath = join(sourceCaseDir, fileName);
  let html = readFileSync(sourceHtmlPath, "utf8");

  const originalImage = matchOne(html, /<div class="image"><img src="([^"]+)"/);
  const question = stripTags(matchOne(html, /<div class="question-text">([\s\S]*?)<\/div>/));
  const testType = stripTags(
    matchOne(
      html,
      /<span class="meta-label">Task Type<\/span><span class="meta-value">([\s\S]*?)<\/span>/,
    ),
  );

  html = applyDepthOverride(html, meta.id);
  const assetRefs = new Set([...html.matchAll(/(?:src|href)="(\.\.\/assets\/[^"]+)"/g)].map((match) => match[1]));
  for (const assetRef of assetRefs) copyAsset(assetRef);

  html = html.replace(
    /href="\.\.\/case_pipeline_merged_visualization\.html"/g,
    'href="../../#case-gallery"',
  );
  html = applyLocalOverrides(fileName, html);
  html = applyCasePageLabels(html);
  html = applyCasePageSpacing(html);
  const { baselineStatus, pipelineStatus, jurorsCorrect } = extractCaseMetrics(html);

  writeFileSync(join(outputCaseDir, fileName), html);

  return {
    id: fileName.replace(/\.html$/, ""),
    label: meta.display_id,
    href: `cases/case_pages/${fileName}`,
    image: copyAsset(originalImage),
    question,
    testType,
    baselineStatus,
    pipelineStatus,
    jurorsCorrect,
  };
});

ensureDir(outputDataFile);
writeFileSync(`${outputRoot}/README.txt`, "Selected static case pages and referenced assets for the paper case gallery.\n");
writeFileSync(outputDataFile, `${JSON.stringify(cases, null, 2)}\n`);

console.log(`Generated ${cases.length} selected HTML cases into ${outputRoot}`);

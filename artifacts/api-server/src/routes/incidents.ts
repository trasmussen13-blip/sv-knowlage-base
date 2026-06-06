import { Router } from "express";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import { readdirSync, statSync } from "fs";
import { CreateIncidentBody, GetIncidentParams, SearchIncidentsQueryParams } from "@workspace/api-zod";

const router = Router();

const CASES_DIR = resolve(process.cwd(), "cases");

function ensureCasesDir() {
  if (!existsSync(CASES_DIR)) {
    mkdirSync(CASES_DIR, { recursive: true });
  }
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function sanitizePlatform(platform: string): string {
  return platform.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

function buildMarkdown(id: string, data: Record<string, unknown>): string {
  const frontmatter = [
    "---",
    `id: "${id}"`,
    `platform: "${data.platform}"`,
    `date: "${today()}"`,
    `confidence: ${data.confidence}`,
    `system_layers_involved: [${(data.system_layers_involved as string[]).map((s) => `"${s}"`).join(", ")}]`,
    `device_layer: [${((data.device_layer as string[]) ?? []).map((s) => `"${s}"`).join(", ")}]`,
    `tags: [${((data.tags as string[]) ?? []).map((s) => `"${s}"`).join(", ")}]`,
    `intervention: "${String(data.intervention).replace(/"/g, '\\"')}"`,
    "---",
  ].join("\n");

  const contraPresent = ((data.contra_indicators as { present: string[]; absent: string[] })?.present ?? []).join("\n");
  const contraAbsent = ((data.contra_indicators as { present: string[]; absent: string[] })?.absent ?? []).join("\n");
  const symptoms = ((data.symptoms as string[]) ?? []).map((s) => `- ${s}`).join("\n");

  return [
    frontmatter,
    "",
    `# Incident ${id}`,
    "",
    "## Mechanism",
    String(data.mechanism),
    "",
    "## Symptoms",
    symptoms,
    "",
    "## Root Cause",
    String(data.root_cause),
    "",
    "## Contra Indicators",
    "",
    "### Present",
    contraPresent || "_none_",
    "",
    "### Absent",
    contraAbsent || "_none_",
    "",
    "## Intervention",
    String(data.intervention),
    "",
  ].join("\n");
}

function configureGit(): void {
  try {
    const token = process.env.GITHUB_TOKEN;
    const repoUrl = process.env.GITHUB_REPO_URL;
    if (!token || !repoUrl) return;

    // Set git identity
    execSync('git config user.email "incident-capture@simonsvoss.local"', { stdio: "pipe" });
    execSync('git config user.name "Incident Capture Bot"', { stdio: "pipe" });

    // Set authenticated remote (replace or add "incidents" remote)
    const authedUrl = repoUrl.replace("https://", `https://${token}@`);
    try {
      execSync(`git remote set-url incidents "${authedUrl}"`, { stdio: "pipe" });
    } catch {
      execSync(`git remote add incidents "${authedUrl}"`, { stdio: "pipe" });
    }
  } catch {
    // Non-fatal — push will fail gracefully later
  }
}

function tryPush(): { pushed: boolean; push_error: string | null } {
  try {
    const token = process.env.GITHUB_TOKEN;
    const repoUrl = process.env.GITHUB_REPO_URL;
    if (!token || !repoUrl) {
      return { pushed: false, push_error: "GITHUB_TOKEN or GITHUB_REPO_URL not configured" };
    }

    // Try to detect the default branch
    let branch = "main";
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: "pipe" }).toString().trim() || "main";
    } catch {
      // default to main
    }

    execSync(`git push incidents ${branch}`, { stdio: "pipe" });
    return { pushed: true, push_error: null };
  } catch (err) {
    return { pushed: false, push_error: String(err instanceof Error ? err.message : err) };
  }
}

// Configure git once on module load
configureGit();

// POST /incident
router.post("/incident", (req, res) => {
  const parsed = CreateIncidentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const id = randomUUID();
  const platformSlug = sanitizePlatform(data.platform);
  const dateStr = today();
  const fileName = `${dateStr}-${id}.md`;
  const platformDir = join(CASES_DIR, platformSlug);

  ensureCasesDir();
  if (!existsSync(platformDir)) {
    mkdirSync(platformDir, { recursive: true });
  }

  const filePath = join(platformDir, fileName);
  const relFilePath = `cases/${platformSlug}/${fileName}`;
  const markdown = buildMarkdown(id, data as unknown as Record<string, unknown>);

  writeFileSync(filePath, markdown, "utf8");

  // Git commit
  let pushResult: { pushed: boolean; push_error: string | null } = { pushed: false, push_error: null };
  try {
    execSync(`git add "${filePath}"`, { stdio: "pipe" });
    execSync(`git commit -m "incident: ${id} [${data.platform}]"`, { stdio: "pipe" });
    pushResult = tryPush();
  } catch (err) {
    pushResult = { pushed: false, push_error: String(err instanceof Error ? err.message : err) };
  }

  res.status(201).json({
    id,
    file_path: relFilePath,
    pushed: pushResult.pushed,
    push_error: pushResult.push_error,
  });
});

// GET /incident/:id
router.get("/incident/:id", (req, res) => {
  const parsed = GetIncidentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { id } = parsed.data;

  if (!existsSync(CASES_DIR)) {
    res.status(404).json({ error: "No incidents stored" });
    return;
  }

  // Walk all platform dirs looking for the id
  let found: { content: string; filePath: string } | null = null;
  for (const platformDir of readdirSync(CASES_DIR)) {
    const fullPlatformDir = join(CASES_DIR, platformDir);
    if (!statSync(fullPlatformDir).isDirectory()) continue;
    for (const file of readdirSync(fullPlatformDir)) {
      if (file.includes(id)) {
        const fullPath = join(fullPlatformDir, file);
        found = { content: readFileSync(fullPath, "utf8"), filePath: `cases/${platformDir}/${file}` };
        break;
      }
    }
    if (found) break;
  }

  if (!found) {
    res.status(404).json({ error: `Incident ${id} not found` });
    return;
  }

  const parsed2 = parseMarkdown(found.content, found.filePath);
  res.json(parsed2);
});

// GET /search?q=
router.get("/search", (req, res) => {
  const parsed = SearchIncidentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing query parameter 'q'" });
    return;
  }

  const { q } = parsed.data;
  const query = q.toLowerCase();
  const results: unknown[] = [];

  if (!existsSync(CASES_DIR)) {
    res.json({ query: q, results: [], total: 0 });
    return;
  }

  for (const platformDir of readdirSync(CASES_DIR)) {
    const fullPlatformDir = join(CASES_DIR, platformDir);
    if (!statSync(fullPlatformDir).isDirectory()) continue;
    for (const file of readdirSync(fullPlatformDir)) {
      if (!file.endsWith(".md")) continue;
      const fullPath = join(fullPlatformDir, file);
      const content = readFileSync(fullPath, "utf8");
      if (content.toLowerCase().includes(query)) {
        const parsed3 = parseMarkdown(content, `cases/${platformDir}/${file}`);
        // Build snippet: find the line with the match
        const lines = content.split("\n");
        const matchLine = lines.find((l) => l.toLowerCase().includes(query)) ?? "";
        results.push({
          id: parsed3.id,
          platform: parsed3.platform,
          file_path: parsed3.file_path,
          created_at: parsed3.created_at,
          confidence: parsed3.confidence,
          system_layers_involved: parsed3.system_layers_involved,
          tags: parsed3.tags,
          snippet: matchLine.trim().slice(0, 200),
        });
      }
    }
  }

  res.json({ query: q, results, total: results.length });
});

// Helper: parse YAML frontmatter from markdown
function parseMarkdown(content: string, filePath: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter: Record<string, unknown> = {};

  if (match) {
    const yamlLines = match[1].split("\n");
    for (const line of yamlLines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const rawVal = line.slice(colonIdx + 1).trim();

      if (rawVal.startsWith("[")) {
        // Array value
        frontmatter[key] = rawVal
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
      } else if (rawVal.startsWith('"')) {
        frontmatter[key] = rawVal.replace(/^"|"$/g, "");
      } else if (!isNaN(Number(rawVal)) && rawVal !== "") {
        frontmatter[key] = Number(rawVal);
      } else {
        frontmatter[key] = rawVal;
      }
    }
  }

  const dateMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);

  return {
    id: frontmatter.id ?? "",
    platform: frontmatter.platform ?? "",
    device_layer: frontmatter.device_layer ?? [],
    system_layers_involved: frontmatter.system_layers_involved ?? [],
    tags: frontmatter.tags ?? [],
    confidence: frontmatter.confidence ?? 0,
    intervention: frontmatter.intervention ?? "",
    created_at: dateMatch ? dateMatch[1] : "",
    file_path: filePath,
    // Body sections extracted from markdown
    mechanism: extractSection(content, "Mechanism"),
    symptoms: extractListSection(content, "Symptoms"),
    root_cause: extractSection(content, "Root Cause"),
    contra_indicators: {
      present: extractListSection(content, "Present"),
      absent: extractListSection(content, "Absent"),
    },
  };
}

function extractSection(content: string, heading: string): string {
  const regex = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

function extractListSection(content: string, heading: string): string[] {
  const section = extractSection(content, heading);
  if (!section || section === "_none_") return [];
  return section
    .split("\n")
    .map((l) => l.replace(/^- /, "").trim())
    .filter(Boolean);
}

export default router;

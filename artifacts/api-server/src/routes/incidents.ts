import { Router } from "express";
import { execFileSync } from "child_process";
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

/**
 * Shared env for all git operations — disables any interactive credential prompts
 * so git never hangs waiting for stdin.
 */
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "echo",
} as NodeJS.ProcessEnv;

function git(args: string[], opts?: { timeout?: number }): void {
  execFileSync("git", args, {
    stdio: "pipe",
    env: GIT_ENV,
    timeout: opts?.timeout ?? 10_000,
  });
}

function configureGit(): void {
  try {
    const token = process.env.GITHUB_TOKEN;
    const repoUrl = process.env.GITHUB_REPO_URL;
    if (!token || !repoUrl) return;

    git(["config", "user.email", "incident-capture@simonsvoss.local"]);
    git(["config", "user.name", "Incident Capture Bot"]);

    // Embed token in remote URL so git uses it without prompting
    const authedUrl = repoUrl.replace(/^https:\/\//, `https://${token}@`);
    try {
      git(["remote", "set-url", "incidents", authedUrl]);
    } catch {
      git(["remote", "add", "incidents", authedUrl]);
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

    let branch = "main";
    try {
      branch =
        execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          stdio: "pipe",
          env: GIT_ENV,
          timeout: 5_000,
        })
          .toString()
          .trim() || "main";
    } catch {
      // default to main
    }

    git(["push", "incidents", branch], { timeout: 30_000 });
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

  // Git commit — use argument arrays throughout, no shell interpolation of user data
  let pushResult: { pushed: boolean; push_error: string | null } = { pushed: false, push_error: null };
  try {
    git(["add", filePath]);
    git(["commit", "-m", `incident: ${id} [${platformSlug}]`]);
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

  res.json(parseMarkdown(found.content, found.filePath));
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
        const inc = parseMarkdown(content, `cases/${platformDir}/${file}`);
        const lines = content.split("\n");
        const matchLine = lines.find((l) => l.toLowerCase().includes(query)) ?? "";
        results.push({
          id: inc.id,
          platform: inc.platform,
          file_path: inc.file_path,
          created_at: inc.created_at,
          confidence: inc.confidence,
          system_layers_involved: inc.system_layers_involved,
          tags: inc.tags,
          snippet: matchLine.trim().slice(0, 200),
        });
      }
    }
  }

  res.json({ query: q, results, total: results.length });
});

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter + structured markdown body from a stored incident file.
 */
function parseMarkdown(content: string, filePath: string): Record<string, unknown> {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter: Record<string, unknown> = {};

  if (fmMatch) {
    for (const line of fmMatch[1].split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const rawVal = line.slice(colonIdx + 1).trim();

      if (rawVal.startsWith("[")) {
        frontmatter[key] = rawVal
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
      } else if (rawVal.startsWith('"')) {
        frontmatter[key] = rawVal.replace(/^"|"$/g, "");
      } else if (rawVal !== "" && !isNaN(Number(rawVal))) {
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
    mechanism: extractH2Section(content, "Mechanism"),
    symptoms: extractListFromH2(content, "Symptoms"),
    root_cause: extractH2Section(content, "Root Cause"),
    contra_indicators: {
      present: extractH3Section(content, "Present"),
      absent: extractH3Section(content, "Absent"),
    },
  };
}

/**
 * Extract the text body of a level-2 heading section (## Heading).
 * Stops at the next ## or ### or end of file.
 */
function extractH2Section(content: string, heading: string): string {
  const regex = new RegExp(`(?:^|\\n)## ${escapeRegex(heading)}\\n([\\s\\S]*?)(?=\\n## |\\n### |$)`);
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Extract bullet list items from a level-2 heading section.
 */
function extractListFromH2(content: string, heading: string): string[] {
  const section = extractH2Section(content, heading);
  if (!section || section === "_none_") return [];
  return section
    .split("\n")
    .map((l) => l.replace(/^- /, "").trim())
    .filter(Boolean);
}

/**
 * Extract the text body of a level-3 heading section (### Heading).
 * Stops at the next ## or ### or end of file.
 */
function extractH3Section(content: string, heading: string): string[] {
  const regex = new RegExp(`(?:^|\\n)### ${escapeRegex(heading)}\\n([\\s\\S]*?)(?=\\n## |\\n### |$)`);
  const match = content.match(regex);
  if (!match) return [];
  const body = match[1].trim();
  if (!body || body === "_none_") return [];
  return body
    .split("\n")
    .map((l) => l.replace(/^- /, "").trim())
    .filter(Boolean);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default router;

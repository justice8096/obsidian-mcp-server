import path from "node:path";
import { promises as fs } from "node:fs";
import matter from "gray-matter";
import { VAULT_PATH, MD_EXT } from "./constants.js";

/**
 * Error thrown for vault-level problems with an actionable message.
 */
export class VaultError extends Error {}

/**
 * Resolve a vault-relative path to an absolute path, guarding against
 * directory traversal outside the vault root.
 */
export function resolveInVault(relativePath: string): string {
  const normalized = relativePath.replace(/^[/\\]+/, "");
  const abs = path.resolve(VAULT_PATH, normalized);
  const root = path.resolve(VAULT_PATH);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new VaultError(
      `Path '${relativePath}' resolves outside the vault. Use a path relative to the vault root.`
    );
  }
  return abs;
}

/** Ensure a note path ends in .md (Obsidian notes are markdown). */
export function ensureMd(notePath: string): string {
  return notePath.toLowerCase().endsWith(MD_EXT) ? notePath : notePath + MD_EXT;
}

/** Return the vault-relative, forward-slash path for an absolute file. */
export function toRelative(absPath: string): string {
  return path.relative(VAULT_PATH, absPath).split(path.sep).join("/");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Read a note's full content. */
export async function readNote(notePath: string): Promise<string> {
  const abs = resolveInVault(ensureMd(notePath));
  if (!(await pathExists(abs))) {
    throw new VaultError(
      `Note not found: '${ensureMd(notePath)}'. Use obsidian_list_notes to discover available notes.`
    );
  }
  return fs.readFile(abs, "utf8");
}

/** Write (create or overwrite) a note. Refuses to overwrite unless allowed. */
export async function writeNote(
  notePath: string,
  content: string,
  overwrite: boolean
): Promise<{ path: string; created: boolean }> {
  const rel = ensureMd(notePath);
  const abs = resolveInVault(rel);
  const existed = await pathExists(abs);
  if (existed && !overwrite) {
    throw new VaultError(
      `Note '${rel}' already exists. Set overwrite=true to replace it, or use obsidian_append_to_note to add content.`
    );
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  return { path: toRelative(abs), created: !existed };
}

/** Append content to a note, creating it if missing. */
export async function appendToNote(
  notePath: string,
  content: string
): Promise<{ path: string; created: boolean }> {
  const rel = ensureMd(notePath);
  const abs = resolveInVault(rel);
  const existed = await pathExists(abs);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const prefix = existed && content.length > 0 ? "\n" : "";
  await fs.appendFile(abs, prefix + content, "utf8");
  return { path: toRelative(abs), created: !existed };
}

/** Recursively collect markdown files under a folder (vault-relative). */
export async function listNotes(
  folder: string,
  recursive: boolean
): Promise<string[]> {
  const base = folder ? resolveInVault(folder) : path.resolve(VAULT_PATH);
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      throw new VaultError(`Folder not found: '${folder}'.`);
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // skip .obsidian, .git, etc.
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(MD_EXT)) {
        out.push(toRelative(full));
      }
    }
  }

  await walk(base);
  return out.sort();
}

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

/** Case-insensitive substring search across markdown files. */
export async function searchVault(
  query: string,
  folder: string,
  limit: number
): Promise<SearchMatch[]> {
  const files = await listNotes(folder, true);
  const needle = query.toLowerCase();
  const matches: SearchMatch[] = [];

  for (const rel of files) {
    if (matches.length >= limit) break;
    const abs = resolveInVault(rel);
    const content = await fs.readFile(abs, "utf8");
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        matches.push({ path: rel, line: i + 1, text: lines[i].trim() });
        if (matches.length >= limit) break;
      }
    }
  }
  return matches;
}

/** Parse frontmatter and body from a note. */
export async function readFrontmatter(
  notePath: string
): Promise<{ frontmatter: Record<string, unknown>; bodyPreview: string }> {
  const raw = await readNote(notePath);
  const parsed = matter(raw);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    bodyPreview: parsed.content.trim().slice(0, 500),
  };
}

export interface ResolvedWikilink {
  link: string;
  target: string | null;
}

/**
 * Extract [[wikilinks]] from a note and resolve each to an actual vault file
 * by basename match. Handles [[Note|alias]] and [[Note#heading]] forms.
 */
export async function resolveWikilinks(
  notePath: string
): Promise<ResolvedWikilink[]> {
  const raw = await readNote(notePath);
  const allFiles = await listNotes("", true);
  const byBase = new Map<string, string>();
  for (const f of allFiles) {
    const base = path.basename(f, MD_EXT).toLowerCase();
    if (!byBase.has(base)) byBase.set(base, f);
  }

  const seen = new Set<string>();
  const results: ResolvedWikilink[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const inner = m[1];
    const linkTarget = inner.split("|")[0].split("#")[0].trim();
    if (!linkTarget || seen.has(linkTarget)) continue;
    seen.add(linkTarget);
    const base = path.basename(linkTarget, MD_EXT).toLowerCase();
    results.push({ link: linkTarget, target: byBase.get(base) ?? null });
  }
  return results;
}

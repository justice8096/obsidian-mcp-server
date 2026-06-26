import path from "node:path";
import os from "node:os";

// Vault root. Configure with OBSIDIAN_VAULT_PATH; falls back to ~/Obsidian.
const DEFAULT_VAULT = path.join(os.homedir(), "Obsidian");

export const VAULT_PATH = path.resolve(
  process.env.OBSIDIAN_VAULT_PATH || DEFAULT_VAULT
);

// Markdown file extension handled by the vault.
export const MD_EXT = ".md";

// Cap on characters returned in a single tool response to keep context manageable.
export const CHARACTER_LIMIT = 25000;

// Output format for tools that can return human- or machine-readable results.
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

export const SERVER_NAME = "obsidian-mcp-server";
export const SERVER_VERSION = "0.1.0";

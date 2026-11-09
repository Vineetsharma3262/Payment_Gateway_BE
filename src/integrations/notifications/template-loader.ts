import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * File-based email templates. One folder per template name under
 * `src/integrations/notifications/templates/<name>/` with `subject.txt`,
 * `body.html` and `body.txt`. Variables use `{{name}}` placeholders.
 *
 * The loader reads from disk at construction time and caches each template.
 * Missing files raise at startup, so a release that references a missing
 * template never ships.
 */
export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

interface TemplateFiles {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateStore {
  render(name: string, variables: Record<string, string>): RenderedTemplate;
  has(name: string): boolean;
  /** Enumerated template names, useful for health checks and tests. */
  names(): readonly string[];
}

const TEMPLATE_NAME_RE = /^[a-z0-9_-]+$/;

/** `{{name}}` → `variables.name`. Trimming + case-sensitive, like a Mustache subset. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (typeof value === 'string') return value;
    // Missing variables keep their placeholder visible so misspellings surface
    // in both logs and inboxes without pretending to be correct.
    return `{{${key}}}`;
  });
}

export class FileTemplateStore implements TemplateStore {
  private readonly cache = new Map<string, TemplateFiles>();

  constructor(
    private readonly rootDir: string,
    initialNames: readonly string[],
  ) {
    for (const name of initialNames) this.load(name);
  }

  render(name: string, variables: Record<string, string>): RenderedTemplate {
    const files = this.load(name);
    return {
      subject: renderTemplate(files.subject, variables).trim(),
      html: renderTemplate(files.html, variables),
      text: renderTemplate(files.text, variables),
    };
  }

  has(name: string): boolean {
    return this.cache.has(name);
  }

  names(): readonly string[] {
    return [...this.cache.keys()];
  }

  private load(name: string): TemplateFiles {
    const cached = this.cache.get(name);
    if (cached) return cached;
    if (!TEMPLATE_NAME_RE.test(name)) {
      throw new Error(`Unsafe template name "${name}"`);
    }
    const folder = join(this.rootDir, name);
    const files: TemplateFiles = {
      subject: readFileSync(join(folder, 'subject.txt'), 'utf-8'),
      html: readFileSync(join(folder, 'body.html'), 'utf-8'),
      text: readFileSync(join(folder, 'body.txt'), 'utf-8'),
    };
    this.cache.set(name, files);
    return files;
  }
}

export const TEMPLATE_STORE = Symbol('TemplateStore');

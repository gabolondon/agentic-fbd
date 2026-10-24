// Release notes for a root tag: the component versions from versions.yaml and that version's
// CHANGELOG.md section, both read as they were at the tag.
// Usage: node scripts/release-notes.mjs v0.2.0 > notes.md
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** [name, version] for every component, in manifest order. */
export function componentVersions(yaml) {
  const out = [];
  let inComponents = false;
  let name = null;
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (/^components:/.test(line)) inComponents = true;
    else if (/^\S/.test(line)) inComponents = false;
    if (!inComponents) continue;
    const component = /^ {2}([\w-]+):\s*$/.exec(line);
    if (component) name = component[1];
    const version = /^ {4}version:\s*(\S+)/.exec(line);
    if (version && name) out.push([name, version[1]]);
  }
  return out;
}

/** The body of `## [version]`, up to the next release heading. */
export function changelogSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start === -1) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();
}

export function releaseNotes(yaml, changelog, tag) {
  const version = tag.replace(/^v/, '');
  const rows = componentVersions(yaml).map(([n, v]) => `| ${n} | ${v} |`).join('\n');
  return [
    'Install or update the Claude Code plugin:',
    '',
    '```text',
    '/plugin marketplace add gabolondon/agentic-fbd',
    '/plugin install agentic-fbd@agentic-fbd',
    '```',
    '',
    '## Components',
    '',
    '| Component | Version |',
    '|---|---|',
    rows,
    '',
    '## Changes',
    '',
    changelogSection(changelog, version),
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const tag = process.argv[2];
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) {
    console.error('usage: node scripts/release-notes.mjs vX.Y.Z');
    process.exit(2);
  }
  const at = (file) => execFileSync('git', ['show', `${tag}:${file}`], { encoding: 'utf8' });
  process.stdout.write(releaseNotes(at('versions.yaml'), at('CHANGELOG.md'), tag));
}

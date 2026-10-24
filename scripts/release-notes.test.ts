import { describe, expect, it } from 'vitest';
import { changelogSection, componentVersions, releaseNotes } from './release-notes.mjs';

const versions = `# comment
project: agentic-fbd
version: 0.2.0            # root version

components:
  core:
    path: packages/core   # format types
    version: 0.1.0

  viewer:
    path: packages/viewer
    version: 0.2.0
    depends_on: [core]
`;

const changelog = `# Changelog — agentic-fbd

## [0.2.0] - 2026-10-24
_Previous release: 0.1.0_

### viewer 0.1.0 -> 0.2.0 (minor)
- Cream theme

## [0.1.0] - 2026-10-23
_Baseline: first versioned release_
`;

describe('release notes', () => {
  it('reads every component version from versions.yaml', () => {
    expect(componentVersions(versions)).toEqual([
      ['core', '0.1.0'],
      ['viewer', '0.2.0'],
    ]);
  });

  it('takes only the section of the released version from the changelog', () => {
    expect(changelogSection(changelog, '0.2.0')).toBe(
      '_Previous release: 0.1.0_\n\n### viewer 0.1.0 -> 0.2.0 (minor)\n- Cream theme',
    );
    expect(changelogSection(changelog, '0.1.0')).toBe('_Baseline: first versioned release_');
  });

  it('fails when the changelog has no section for the version', () => {
    expect(() => changelogSection(changelog, '0.3.0')).toThrow(/no section for 0\.3\.0/);
  });

  it('puts the component table before the changelog section', () => {
    const notes = releaseNotes(versions, changelog, 'v0.2.0');
    expect(notes).toContain('| core | 0.1.0 |\n| viewer | 0.2.0 |');
    expect(notes.indexOf('| core |')).toBeLessThan(notes.indexOf('### viewer'));
    expect(notes).not.toContain('## [0.1.0]');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate, validateText } from '../src/index.ts';
import { closestIds } from '../src/validate/similar.ts';
import { baseName, examplesDir, invalidDir, listJson, readJson, repoRoot } from './helpers.ts';

const explanationCodes = new Set(['missing-desc', 'missing-logic', 'missing-store', 'similar-store']);
const typeIssues = (issues: { level: string; code: string }[]) =>
  issues.filter((i) => !explanationCodes.has(i.code)).map((i) => [i.level, i.code]);

describe('validate', () => {
  for (const file of [...listJson(examplesDir), join(repoRoot, 'tests/fixtures/valid-fixture.logic.json')]) {
    it(`accepts ${baseName(file)} with no errors or warnings`, () => {
      const result = validate(readJson(file));
      expect(result.issues.filter((i) => i.level !== 'notice')).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }

  it('bundled examples give every state a store', () => {
    for (const file of listJson(examplesDir)) {
      const missing = validate(readJson(file)).issues.filter((i) => i.code === 'missing-store');
      expect(missing, baseName(file)).toEqual([]);
    }
  });

  for (const file of listJson(invalidDir, 'integrity-')) {
    const code = baseName(file).replace('integrity-', '').replace('.logic.json', '');
    it(`rejects ${baseName(file)} with a "${code}" error`, () => {
      const result = validateText(readFileSync(file, 'utf8'));
      expect(result.valid).toBe(false);
      const error = result.issues.find((i) => i.level === 'error' && i.code === code);
      expect(error, JSON.stringify(result.issues, null, 2)).toBeDefined();
      expect(error!.message.length).toBeGreaterThan(10);
    });
  }

  it('reports unparseable JSON as an error', () => {
    const result = validateText(readFileSync(join(invalidDir, 'json-not-json.logic.json'), 'utf8'));
    expect(result.valid).toBe(false);
    expect(result.doc).toBeNull();
    expect(result.issues[0]?.code).toBe('json');
  });

  it('allows several wires into one input', () => {
    const doc = readJson(join(examplesDir, 'other-free-text.logic.json')) as { blockTypes: Record<string, { body: { wires: { to: string }[] } }> };
    const into = doc.blockTypes.OtherOption!.body.wires.filter((w) => w.to === 'out.answer');
    expect(into.length).toBe(2);
    expect(validate(doc).valid).toBe(true);
  });

  it('flags a bare number into a named id as a warning, not an error', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'design' },
      types: { OptionId: 'number' },
      nodes: [
        { id: 'a', kind: 'function', label: 'A', outputs: { n: 'number' } },
        { id: 'b', kind: 'function', label: 'B', inputs: { id: 'OptionId' } },
      ],
      wires: [{ id: 'w', from: 'a.n', to: 'b.id' }],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    expect(typeIssues(result.issues)).toEqual([['warning', 'type-meaning']]);
  });

  it('treats undefined type names as opaque notices', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'understand' },
      nodes: [
        { id: 'a', kind: 'function', label: 'A', outputs: { r: 'Mystery' } },
        { id: 'b', kind: 'function', label: 'B', inputs: { r: 'number' } },
      ],
      wires: [{ id: 'w', from: 'a.r', to: 'b.r' }],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    expect(typeIssues(result.issues)).toEqual([['notice', 'undefined-type']]);
  });

  it('reports blocks without desc or logic as notices', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'understand' },
      nodes: [
        { id: 'a', kind: 'function', label: 'A', outputs: { r: 'number' } },
        { id: 'b', kind: 'result', label: 'B', desc: 'Shows B.', inputs: { r: 'number' } },
      ],
      wires: [{ id: 'w', from: 'a.r', to: 'b.r' }],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    expect(result.issues.map((i) => [i.level, i.code])).toEqual([
      ['notice', 'missing-desc'],
      ['notice', 'missing-logic'],
    ]);
  });

  it('accepts store and typeInfo', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'understand' },
      types: { Booking: { id: 'string' } },
      typeInfo: { Booking: { desc: 'd', code: { file: 'a.ts', symbol: 'Booking' } } },
      nodes: [{ id: 'cart', kind: 'state', label: 'Cart', valueType: 'Booking', store: 'Zustand store · lost on reload' }],
      wires: [],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    expect(result.issues.find((i) => i.code === 'missing-store')).toBeUndefined();
  });

  it('accepts notes on nodes and wires and trigger fields in before', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'design' },
      nodes: [
        {
          id: 't',
          kind: 'trigger',
          source: 'http',
          context: { from: 'POST /x' },
          label: 'T',
          desc: 'd',
          outputs: { x: 'string' },
          note: 'Should be a scheduled job.',
          change: 'modified',
          before: { source: 'user', context: { from: 'Form' } },
        },
        { id: 'f', kind: 'result', label: 'F', desc: 'd', inputs: { x: 'string' } },
      ],
      wires: [{ id: 'w', from: 't.x', to: 'f.x', note: 'Check this one.' }],
    };
    const result = validate(doc);
    expect(result.issues.filter((i) => i.level !== 'notice')).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('reports a state without store as a notice', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'understand' },
      nodes: [{ id: 'cart', kind: 'state', label: 'Cart', valueType: 'string' }],
      wires: [],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({ level: 'notice', code: 'missing-store', path: 'cart' }));
  });

  it('flags a new state that copies an existing one', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'design' },
      nodes: [
        { id: 'draft', kind: 'state', label: 'Draft', valueType: 'Draft', store: 'Zustand store' },
        { id: 'wizard', kind: 'state', label: 'Wizard', valueType: 'Draft', store: 'Redux store', change: 'new' },
      ],
      wires: [],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    const similar = result.issues.find((i) => i.code === 'similar-store');
    expect(similar).toMatchObject({ level: 'notice', path: 'wizard' });
    expect(similar!.message).toBe('new state "wizard" holds the same type as existing "draft"; reuse it if it holds the same data');
  });
});

describe('schema hints', () => {
  const subject = { id: 's', title: 'S', intent: 'I', mode: 'design' };
  const base = { version: '0.1', subject, nodes: [], wires: [] };
  const hintFor = (doc: unknown, message: string): string | undefined =>
    validate(doc).issues.find((i) => i.code === 'schema' && i.message.includes(message))?.hint;

  it('maps unknown top-level fields to where they belong', () => {
    expect(hintFor({ ...base, title: 'x' }, 'unknown field "title"')).toBe('move it to "subject.title"');
    expect(hintFor({ ...base, description: 'x' }, 'unknown field "description"')).toBe('move it to "subject.intent"');
    expect(hintFor({ ...base, layers: [] }, 'unknown field "layers"')).toBe('replace it with "nodes" entries of kind "group"');
    expect(hintFor({ ...base, meta: {} }, 'unknown field "meta"')).toBe('remove it');
  });

  it('says remove it for an unknown field that is not top-level, even when its name has a mapping', () => {
    const doc = { ...base, nodes: [{ id: 'a', kind: 'function', label: 'A', title: 'x' }] };
    expect(hintFor(doc, 'unknown field "title"')).toBe('remove it');
  });

  it('hints the version', () => {
    expect(hintFor({ ...base, version: '1.0' }, '/version')).toBe('set "version": "0.1"');
    const { version: _version, ...noVersion } = base;
    expect(hintFor(noVersion, 'missing required field "version"')).toBe('set "version": "0.1"');
  });

  it('hints a subject that is not an object', () => {
    expect(hintFor({ ...base, subject: 'x' }, '/subject')).toContain('"subject": { "id", "title", "intent", "mode" }');
  });

  it('hints a missing subject, nodes and wires', () => {
    const { subject: _subject, ...noSubject } = base;
    expect(hintFor(noSubject, 'missing required field "subject"')).toContain('"subject": { "id", "title", "intent", "mode" }');
    const { nodes: _nodes, ...noNodes } = base;
    expect(hintFor(noNodes, 'missing required field "nodes"')).toBe('add "nodes": [] at the top level');
    const { wires: _wires, ...noWires } = base;
    expect(hintFor(noWires, 'missing required field "wires"')).toBe('add "wires": [] at the top level');
  });

  it('hints a missing field below the top level', () => {
    const doc = { ...base, subject: { id: 's', title: 'S', intent: 'I' } };
    expect(hintFor(doc, 'missing required field "mode"')).toBe('add "mode" to "/subject"');
  });

  it('reports a non-object root with a hint and does not throw', () => {
    for (const root of [[], 'x', null, 3]) {
      const result = validate(root);
      expect(result.valid, JSON.stringify(root)).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      for (const issue of result.issues) {
        expect(issue.hint, JSON.stringify(root)).toBe('the file must be one JSON object: { "version": "0.1", "subject": {...}, "nodes": [], "wires": [] }');
      }
    }
  });

  it('gives every schema issue of the invalid fixtures a hint or none, never an empty one', () => {
    for (const file of listJson(invalidDir, 'schema-')) {
      for (const issue of validate(readJson(file)).issues) {
        if ('hint' in issue) expect(issue.hint).toBeTruthy();
      }
    }
  });
});

describe('wire hints', () => {
  const subject = { id: 's', title: 'S', intent: 'I', mode: 'design' };
  const fn = (id: string, ports: { inputs?: Record<string, string>; outputs?: Record<string, string> } = {}) => ({
    id,
    kind: 'function',
    label: id,
    ...ports,
  });
  const docWith = (nodes: unknown[], wires: unknown[], blockTypes?: unknown) => ({
    version: '0.1',
    subject,
    nodes,
    wires,
    ...(blockTypes === undefined ? {} : { blockTypes }),
  });
  const issueFor = (doc: unknown, code: string) => validate(doc).issues.find((i) => i.code === code);

  it('missing-port lists the ports on that side', () => {
    const doc = docWith(
      [fn('fetch', { outputs: { data: 'string', error: 'string' } }), fn('show', { inputs: { in: 'string' } })],
      [{ id: 'w1', from: 'fetch', to: 'show.in' }],
    );
    expect(issueFor(doc, 'missing-port')!.hint).toBe('use "fetch.<port>"; outputs of fetch: data, error');
  });

  it('missing-port on a node with no ports on that side says to declare them', () => {
    const doc = docWith([fn('fetch'), fn('show', { inputs: { in: 'string' } })], [{ id: 'w1', from: 'fetch', to: 'show.in' }]);
    expect(issueFor(doc, 'missing-port')!.hint).toBe('declare "outputs" on fetch, then use "fetch.<port>"');
    const toSide = docWith([fn('src', { outputs: { out: 'string' } }), fn('show')], [{ id: 'w1', from: 'src.out', to: 'show' }]);
    expect(issueFor(toSide, 'missing-port')!.hint).toBe('declare "inputs" on show, then use "show.<port>"');
  });

  it('unknown-node suggests a close id', () => {
    const doc = docWith(
      [fn('used-kits', { inputs: { in: 'string' } }), fn('src', { outputs: { out: 'string' } })],
      [{ id: 'w1', from: 'src.out', to: 'used_kit.in' }],
    );
    expect(issueFor(doc, 'unknown-node')!.hint).toBe('did you mean "used-kits"? Otherwise add a node with id "used_kit"');
  });

  it('unknown-node with no close id says to add the node or fix the wire', () => {
    const doc = docWith(
      [fn('src', { outputs: { out: 'string' } })],
      [{ id: 'w1', from: 'src.out', to: 'used_kit.in' }],
    );
    expect(issueFor(doc, 'unknown-node')!.hint).toBe('add a node with id "used_kit", or fix the wire');
  });

  it('unknown-node inside a blockType body suggests ids from that body only', () => {
    const doc = docWith(
      [fn('used-kits')],
      [],
      {
        Box: {
          label: 'Box',
          inputs: {},
          outputs: {},
          body: {
            nodes: [fn('used-kit', { inputs: { in: 'string' } }), fn('src', { outputs: { out: 'string' } })],
            wires: [{ id: 'w1', from: 'src.out', to: 'used_kit.in' }],
          },
        },
      },
    );
    const hint = issueFor(doc, 'unknown-node')!.hint;
    expect(hint).toBe('did you mean "used-kit"? Otherwise add a node with id "used_kit"');
    expect(hint).not.toContain('"used-kits"');
  });

  it('unknown-port lists the ports', () => {
    const doc = docWith(
      [fn('src', { outputs: { out: 'string' } }), fn('show', { inputs: { a: 'string', b: 'string' } })],
      [{ id: 'w1', from: 'src.out', to: 'show.c' }],
    );
    expect(issueFor(doc, 'unknown-port')!.hint).toBe('use one of: a, b');
  });

  it('unknown-port on a node with no ports on that side says to declare them', () => {
    const doc = docWith([fn('src', { outputs: { out: 'string' } }), fn('show')], [{ id: 'w1', from: 'src.out', to: 'show.c' }]);
    expect(issueFor(doc, 'unknown-port')!.hint).toBe('declare "inputs" on show, then use "show.<port>"');
  });

  it('adds no hint key to a wire issue that has none', () => {
    const doc = docWith(
      [fn('src', { outputs: { out: 'number' } }), fn('show', { inputs: { in: 'string' } })],
      [{ id: 'w1', from: 'src.out', to: 'show.in' }],
    );
    const mismatch = issueFor(doc, 'type-mismatch')!;
    expect(mismatch).toBeDefined();
    expect('hint' in mismatch).toBe(false);
  });
});

describe('unwired-block', () => {
  const subject = { id: 's', title: 'S', intent: 'I', mode: 'design' };
  const node = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
    id,
    kind,
    label: id,
    ...(kind === 'trigger' ? { source: 'user' } : {}),
    ...(kind === 'instance' ? { of: 'Step' } : {}),
    ...extra,
  });
  const STEP = { Step: { label: 'Step', inputs: { in: 'string' }, outputs: {} } };
  const docWith = (nodes: unknown[], wires: unknown[] = [], blockTypes: unknown = STEP) => ({
    version: '0.1',
    subject,
    nodes,
    wires,
    blockTypes,
  });
  const wire = (id: string, from: string, to: string, extra: Record<string, unknown> = {}) => ({ id, from, to, ...extra });
  const unwired = (doc: unknown) => validate(doc).issues.filter((i) => i.code === 'unwired-block');
  const HINT = 'wire it, or remove it if it is not part of this flow';

  it('flags a trigger with no outgoing wire, even when a wire reaches it', () => {
    const doc = docWith(
      [
        node('go', 'trigger', { source: 'user', outputs: { out: 'string' } }),
        node('quiet', 'trigger', { source: 'user' }),
        node('f', 'function', { inputs: { in: 'string' } }),
      ],
      [wire('w1', 'go.out', 'f.in')],
    );
    const issues = unwired(doc);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toBe('quiet');
    expect(issues[0]!.level).toBe('warning');
    expect(issues[0]!.message).toBe('trigger "quiet" has no outgoing wire');
    expect(issues[0]!.hint).toBe(HINT);
  });

  it('flags a result with no incoming wire', () => {
    const doc = docWith([node('done', 'result', { inputs: { in: 'string' } })]);
    const issues = unwired(doc);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toBe('done');
    expect(issues[0]!.message).toBe('result "done" has no incoming wire');
    expect(issues[0]!.hint).toBe(HINT);
  });

  it('flags any other block with no wire at all, one issue per node', () => {
    for (const kind of ['function', 'decision', 'external', 'state', 'group', 'instance']) {
      const issues = unwired(docWith([node('lonely', kind)]));
      expect(issues, kind).toHaveLength(1);
      expect(issues[0]!.path, kind).toBe('lonely');
      expect(issues[0]!.message, kind).toBe(`${kind} "lonely" is not connected to any wire`);
      expect(issues[0]!.hint, kind).toBe(HINT);
    }
  });

  it('does not flag wired triggers, results and functions', () => {
    const doc = docWith(
      [
        node('go', 'trigger', { outputs: { out: 'string' } }),
        node('f', 'function', { inputs: { in: 'string' }, outputs: { out: 'string' } }),
        node('done', 'result', { inputs: { in: 'string' } }),
      ],
      [wire('w1', 'go.out', 'f.in'), wire('w2', 'f.out', 'done.in')],
    );
    expect(unwired(doc)).toEqual([]);
  });

  it('counts a state named by bare id, as source or as target', () => {
    const doc = docWith(
      [
        node('go', 'trigger', { outputs: { out: 'string' } }),
        node('store', 'state', { valueType: 'string' }),
        node('f', 'function', { inputs: { in: 'string' } }),
      ],
      [wire('w1', 'go.out', 'store'), wire('w2', 'store', 'f.in')],
    );
    expect(unwired(doc)).toEqual([]);
  });

  it('treats an instance like a function: wired through its blockType ports', () => {
    const doc = docWith(
      [
        node('go', 'trigger', { outputs: { out: 'string' } }),
        node('use', 'instance', { of: 'Step' }),
        node('unused', 'instance', { of: 'Step' }),
      ],
      [wire('w1', 'go.out', 'use.in')],
    );
    expect(unwired(doc).map((i) => i.path)).toEqual(['unused']);
  });

  it('exempts a block marked change "removed"', () => {
    const doc = docWith([node('old', 'function', { change: 'removed' }), node('gone', 'trigger', { change: 'removed' }), node('end', 'result', { change: 'removed' })]);
    expect(validate(doc).valid).toBe(true);
    expect(unwired(doc)).toEqual([]);
  });

  it('exempts pins and everything inside blockType bodies', () => {
    const doc = docWith(
      [node('go', 'trigger', { outputs: { out: 'string' } }), node('use', 'instance', { of: 'Step' })],
      [wire('w1', 'go.out', 'use.in')],
      {
        Step: {
          label: 'Step',
          inputs: { in: 'string' },
          outputs: {},
          body: {
            nodes: [node('p', 'pin', { outputs: { in: 'string' } }), node('loose', 'function'), node('start', 'trigger'), node('end', 'result')],
            wires: [],
          },
        },
      },
    );
    expect(validate(doc).valid).toBe(true);
    expect(unwired(doc)).toEqual([]);
  });

  it('counts a group wired through its children (Review Focus 2)', () => {
    const doc = docWith(
      [
        node('go', 'trigger', { outputs: { out: 'string' } }),
        node('box', 'group'),
        node('inner', 'function', { parent: 'box', inputs: { in: 'string' }, outputs: { out: 'string' } }),
        node('done', 'result', { inputs: { in: 'string' } }),
      ],
      [wire('w1', 'go.out', 'inner.in'), wire('w2', 'inner.out', 'done.in')],
    );
    expect(unwired(doc)).toEqual([]);
  });

  it('counts nested groups through every ancestor', () => {
    const doc = docWith(
      [
        node('go', 'trigger', { outputs: { out: 'string' } }),
        node('outer', 'group'),
        node('mid', 'group', { parent: 'outer' }),
        node('leaf', 'function', { parent: 'mid', inputs: { in: 'string' } }),
      ],
      [wire('w1', 'go.out', 'leaf.in')],
    );
    expect(unwired(doc)).toEqual([]);
  });

  it('still flags an explored group whose children have no wire', () => {
    const doc = docWith([node('box', 'group'), node('inner', 'function', { parent: 'box' })]);
    expect(unwired(doc).map((i) => i.path).sort()).toEqual(['box', 'inner']);
  });

  it('is a warning: the document stays valid', () => {
    expect(validate(docWith([node('lonely', 'function')])).valid).toBe(true);
  });
});

describe('closestIds', () => {
  it('ranks a substring match as distance 1', () => {
    expect(closestIds('kit', ['used-kits', 'zzzzzzzz'])).toEqual(['used-kits']);
    expect(closestIds('used-kits-extra', ['used-kits'])).toEqual(['used-kits']);
  });

  it('keeps ids within max(2, floor(length / 3)) edits, nearest first', () => {
    expect(closestIds('abcd', ['abcx', 'abxy', 'axyz'])).toEqual(['abcx', 'abxy']);
    // length 12: the limit is 4
    expect(closestIds('abcdefghijkl', ['abcdefghwxyz', 'abcdefgvwxyz'])).toEqual(['abcdefghwxyz']);
    expect(closestIds('abcdefghijkl', ['abcdefghijxy', 'abcdefghwxyz', 'abcdefvwxyz'])).toEqual(['abcdefghijxy', 'abcdefghwxyz']);
  });

  it('returns at most max ids, default 3', () => {
    const ids = ['aa1', 'aa2', 'aa3', 'aa4'];
    expect(closestIds('aa0', ids)).toEqual(['aa1', 'aa2', 'aa3']);
    expect(closestIds('aa0', ids, 2)).toEqual(['aa1', 'aa2']);
  });

  it('returns nothing when no id is close', () => {
    expect(closestIds('fetch', ['render', 'save'])).toEqual([]);
    expect(closestIds('fetch', [])).toEqual([]);
  });
});

import type { LogicDoc } from '@agentic-fbd/core';

/** Every text in a starter begins with this marker, so a model sees where to write. `validate` rejects it. */
export const PLACEHOLDER = 'TODO';

/**
 * A small valid diagram to start from. Block and wire ids are fixed; every text is a placeholder.
 * `id` becomes the subject id, so it must be a valid id (no ".", "/" or spaces).
 */
export function starterDoc(shape: 'understand' | 'overview', id = 'subject'): LogicDoc {
  const subject = {
    id,
    title: `${PLACEHOLDER}: name of the feature or flow`,
    intent: `${PLACEHOLDER}: what this diagram should help you understand or decide`,
    mode: 'understand' as const,
  };
  const start = {
    id: 'start',
    kind: 'trigger' as const,
    label: `${PLACEHOLDER}: what starts this flow`,
    desc: `${PLACEHOLDER}: who or what triggers it, and when`,
    source: 'user' as const,
    outputs: { value: 'string' },
  };
  const done = {
    id: 'done',
    kind: 'result' as const,
    label: `${PLACEHOLDER}: what the flow produces`,
    desc: `${PLACEHOLDER}: where the outcome goes or what the caller sees`,
    inputs: { value: 'string' },
  };

  if (shape === 'understand') {
    return {
      version: '0.1',
      subject,
      nodes: [
        start,
        {
          id: 'step',
          kind: 'function',
          label: `${PLACEHOLDER}: what this step does`,
          desc: `${PLACEHOLDER}: what the step does, in one or two sentences`,
          logic: [`${PLACEHOLDER}: first thing the step does`, `${PLACEHOLDER}: next thing the step does`],
          inputs: { value: 'string' },
          outputs: { value: 'string' },
        },
        done,
      ],
      wires: [
        { id: 'w1', from: 'start.value', to: 'step.value' },
        { id: 'w2', from: 'step.value', to: 'done.value' },
      ],
    };
  }

  const system = (name: string, label: string): LogicDoc['nodes'][number] => ({
    id: name,
    kind: 'group',
    label: `${PLACEHOLDER}: ${label}`,
    desc: `${PLACEHOLDER}: what this system or module is responsible for`,
    explored: false,
    inputs: { value: 'string' },
    outputs: { value: 'string' },
  });
  return {
    version: '0.1',
    subject,
    nodes: [start, system('system-a', 'first system or module'), system('system-b', 'second system or module'), done],
    wires: [
      { id: 'w1', from: 'start.value', to: 'system-a.value' },
      { id: 'w2', from: 'system-a.value', to: 'system-b.value' },
      { id: 'w3', from: 'system-b.value', to: 'done.value' },
    ],
  };
}

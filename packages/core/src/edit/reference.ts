import type { LogicDoc } from '../format.ts';
import { endpointType, parseEndpoint } from '../model.ts';
import { parseType, typeToString } from '../types/parse.ts';
import type { ItemRef } from './applyEdit.ts';

/**
 * "Copy reference for agent": the file, then one line per node or wire, so a prompt can point at
 * exact blocks (design spec §6.9). The file comes first because a subject can span linked files.
 */
export function copyReference(doc: LogicDoc, filePath: string, targets: ItemRef[]): string {
  const lines = [filePath];
  for (const { scope, id } of targets) {
    const items = scope ? doc.blockTypes?.[scope]?.body : doc;
    const key = scope ? `${scope}/${id}` : id;
    const node = items?.nodes.find((n) => n.id === id);
    if (node) {
      const code = node.code ?? (node.kind === 'instance' && node.of ? doc.blockTypes?.[node.of]?.code : undefined);
      const where = code ? ` → ${code.file}${code.symbol ? ` · ${code.symbol}` : ''}` : '';
      lines.push(`- "${node.label}" (id: ${key}, ${node.kind})${where}`);
      continue;
    }
    const wire = items?.wires.find((w) => w.id === id);
    if (!wire) continue;
    const end = (ref: string, side: 'inputs' | 'outputs') => {
      const e = parseEndpoint(ref);
      const n = items!.nodes.find((x) => x.id === e.node);
      return n ? endpointType(doc, n, e.port, side, true) : undefined;
    };
    const type = end(wire.from, 'outputs') ?? end(wire.to, 'inputs');
    lines.push(`- wire ${key}: ${wire.from} → ${wire.to}${type === undefined ? '' : ` (${typeToString(parseType(type))})`}`);
  }
  return lines.join('\n');
}

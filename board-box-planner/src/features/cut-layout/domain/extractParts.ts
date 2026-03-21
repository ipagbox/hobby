import type { Project } from '../../../domain/model';
import { boardToCutPart, type CutMaterialGroup, type CutPartExtractionResult } from './types';

function createGroupId(material: string, thicknessMm: number): string {
  return `${material}__${thicknessMm}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function extractCutParts(project: Project): CutPartExtractionResult {
  const parts = project.boards.map(boardToCutPart);
  const grouped = new Map<string, CutMaterialGroup>();

  for (const part of parts) {
    const id = createGroupId(part.material, part.thicknessMm);
    const existing = grouped.get(id);
    if (existing) {
      existing.parts.push(part);
      continue;
    }
    grouped.set(id, {
      id,
      label: `${part.material} · ${part.thicknessMm} mm`,
      material: part.material,
      thicknessMm: part.thicknessMm,
      parts: [part],
    });
  }

  return {
    project,
    parts,
    groups: [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

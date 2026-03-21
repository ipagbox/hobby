import type { CutLayoutResult, CutLayoutSettings, CutMaterialGroup, CutPart, CutValidationIssue, CutSheetLayout, PackingAlgorithm } from './types';
import { packWithShelf } from '../algorithms/shelf';
import { packWithGuillotine } from '../algorithms/guillotine';
import { packWithMaxRects } from '../algorithms/maxRects';

export const PACKERS: Record<PackingAlgorithm, (group: CutMaterialGroup | null, settings: CutLayoutSettings) => CutLayoutResult> = {
  shelf: (group, settings) => packWithShelf(group, settings),
  guillotine: (group, settings) => packWithGuillotine(group, settings),
  maxrects: (group, settings) => packWithMaxRects(group, settings),
};

export function createEmptyLayoutResult(group: CutMaterialGroup | null): CutLayoutResult {
  return {
    group,
    sheets: [],
    unplacedParts: [],
    invalidParts: [],
    issues: [],
    summary: {
      totalParts: group?.parts.length ?? 0,
      placedParts: 0,
      unplacedParts: 0,
      invalidParts: 0,
      usedAreaMm2: 0,
      freeAreaMm2: 0,
      utilization: 0,
      sheetCount: 0,
    },
  };
}

export function resolveSelectedGroup(groups: CutMaterialGroup[], selectedGroupId: string | null): CutMaterialGroup | null {
  if (groups.length === 0) return null;
  return groups.find((group) => group.id === selectedGroupId) ?? groups[0];
}

export function computePartStatuses(result: CutLayoutResult): Record<string, { placed: boolean; sheetIndex: number | null }> {
  const status: Record<string, { placed: boolean; sheetIndex: number | null }> = {};
  result.group?.parts.forEach((part) => {
    status[part.id] = { placed: false, sheetIndex: null };
  });
  result.sheets.forEach((sheet) => {
    sheet.placements.forEach((placement) => {
      status[placement.partId] = { placed: true, sheetIndex: sheet.index };
    });
  });
  return status;
}

export function formatAreaMm2(areaMm2: number): string {
  return `${(areaMm2 / 1_000_000).toFixed(2)} m²`;
}

export function buildSummary(group: CutMaterialGroup | null, sheets: CutSheetLayout[], invalidParts: CutPart[], unplacedParts: CutPart[]): CutLayoutResult['summary'] {
  const totalParts = group?.parts.length ?? 0;
  const placedParts = sheets.reduce((sum, sheet) => sum + sheet.placements.length, 0);
  const usedAreaMm2 = sheets.reduce((sum, sheet) => sum + sheet.usedAreaMm2, 0);
  const freeAreaMm2 = sheets.reduce((sum, sheet) => sum + sheet.freeAreaMm2, 0);
  const totalSheetArea = sheets.reduce((sum, sheet) => sum + sheet.widthMm * sheet.heightMm, 0);
  return {
    totalParts,
    placedParts,
    unplacedParts: unplacedParts.length,
    invalidParts: invalidParts.length,
    usedAreaMm2,
    freeAreaMm2,
    utilization: totalSheetArea > 0 ? usedAreaMm2 / totalSheetArea : 0,
    sheetCount: sheets.length,
  };
}

export function validateParts(parts: CutPart[], settings: CutLayoutSettings): { valid: CutPart[]; invalid: CutPart[]; issues: CutValidationIssue[] } {
  const valid: CutPart[] = [];
  const invalid: CutPart[] = [];
  const issues: CutValidationIssue[] = [];
  for (const part of parts) {
    const hasInvalidDimensions = part.widthMm <= 0 || part.heightMm <= 0 || part.thicknessMm <= 0;
    if (hasInvalidDimensions) {
      invalid.push(part);
      issues.push({ partId: part.id, message: 'Part has zero or negative dimensions.', severity: 'error' });
      continue;
    }
    if (part.widthMm < settings.minimumPartSizeMm || part.heightMm < settings.minimumPartSizeMm) {
      issues.push({ partId: part.id, message: 'Part is below the minimum allowed size.', severity: 'warning' });
    }
    valid.push(part);
  }
  return { valid, invalid, issues };
}

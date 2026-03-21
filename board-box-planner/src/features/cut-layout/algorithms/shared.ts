import type { CutLayoutResult, CutLayoutSettings, CutMaterialGroup, CutPart, CutSheetLayout, PlacedPart } from '../domain/types';
import { buildSummary, createEmptyLayoutResult, validateParts } from '../domain/layoutUtils';

export interface PackRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CandidatePlacement extends PlacedPart {}

export interface SheetContext {
  widthMm: number;
  heightMm: number;
  usableWidthMm: number;
  usableHeightMm: number;
  placements: CandidatePlacement[];
  freeRects?: PackRect[];
  cursorY?: number;
  shelfHeight?: number;
  shelfX?: number;
}

export function getSpacing(settings: CutLayoutSettings): number {
  return settings.gapMm + settings.kerfMm;
}

export function createSheetContext(settings: CutLayoutSettings): SheetContext {
  const usableWidthMm = Math.max(settings.sheetWidthMm - settings.marginMm * 2, 0);
  const usableHeightMm = Math.max(settings.sheetHeightMm - settings.marginMm * 2, 0);
  return {
    widthMm: settings.sheetWidthMm,
    heightMm: settings.sheetHeightMm,
    usableWidthMm,
    usableHeightMm,
    placements: [],
    freeRects: [{ x: settings.marginMm, y: settings.marginMm, width: usableWidthMm, height: usableHeightMm }],
    cursorY: settings.marginMm,
    shelfHeight: 0,
    shelfX: settings.marginMm,
  };
}

export function partVariants(part: CutPart, settings: CutLayoutSettings): Array<{ width: number; height: number; rotated: boolean }> {
  const variants = [{ width: part.widthMm, height: part.heightMm, rotated: false }];
  if (settings.allowRotation && part.rotatable && part.widthMm !== part.heightMm) {
    variants.push({ width: part.heightMm, height: part.widthMm, rotated: true });
  }
  return variants;
}

export function finalizeResult(group: CutMaterialGroup | null, settings: CutLayoutSettings, sheets: SheetContext[], invalidParts: CutPart[], issues: CutLayoutResult['issues'], unplacedParts: CutPart[]): CutLayoutResult {
  const mappedSheets: CutSheetLayout[] = sheets
    .filter((sheet) => sheet.placements.length > 0)
    .map((sheet, index) => {
      const usedAreaMm2 = sheet.placements.reduce((sum, placement) => sum + placement.widthMm * placement.heightMm, 0);
      const sheetAreaMm2 = settings.sheetWidthMm * settings.sheetHeightMm;
      return {
        index,
        widthMm: settings.sheetWidthMm,
        heightMm: settings.sheetHeightMm,
        usableWidthMm: sheet.usableWidthMm,
        usableHeightMm: sheet.usableHeightMm,
        placements: sheet.placements.map((placement) => ({ ...placement, sheetIndex: index })),
        usedAreaMm2,
        freeAreaMm2: Math.max(sheetAreaMm2 - usedAreaMm2, 0),
        utilization: sheetAreaMm2 > 0 ? usedAreaMm2 / sheetAreaMm2 : 0,
      };
    });

  return {
    group,
    sheets: mappedSheets,
    invalidParts,
    issues,
    unplacedParts,
    summary: buildSummary(group, mappedSheets, invalidParts, unplacedParts),
  };
}

export function preparePacking(group: CutMaterialGroup | null, settings: CutLayoutSettings): { result?: CutLayoutResult; validParts: CutPart[]; invalidParts: CutPart[]; issues: CutLayoutResult['issues'] } {
  if (!group) {
    return { result: createEmptyLayoutResult(group), validParts: [], invalidParts: [], issues: [] };
  }
  if (settings.sheetWidthMm <= 0 || settings.sheetHeightMm <= 0) {
    return {
      result: {
        ...createEmptyLayoutResult(group),
        issues: [{ partId: 'sheet', message: 'Sheet dimensions must be positive.', severity: 'error' }],
      },
      validParts: [],
      invalidParts: [],
      issues: [],
    };
  }

  const { valid, invalid, issues } = validateParts(group.parts, settings);
  const sorted = [...valid].sort((a, b) => Math.max(b.widthMm, b.heightMm) - Math.max(a.widthMm, a.heightMm) || (b.widthMm * b.heightMm) - (a.widthMm * a.heightMm) || a.id.localeCompare(b.id));
  return { validParts: sorted, invalidParts: invalid, issues };
}

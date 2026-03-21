import type { CutLayoutResult, CutLayoutSettings, CutMaterialGroup } from '../domain/types';
import type { PackRect } from './shared';
import { createSheetContext, finalizeResult, getSpacing, partVariants, preparePacking } from './shared';

function intersects(a: PackRect, b: PackRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pruneFreeRects(freeRects: PackRect[]): PackRect[] {
  return freeRects.filter((rect, index) => !freeRects.some((other, otherIndex) => otherIndex !== index && rect.x >= other.x && rect.y >= other.y && rect.x + rect.width <= other.x + other.width && rect.y + rect.height <= other.y + other.height));
}

function splitFreeRects(freeRects: PackRect[], placed: PackRect, spacing: number): PackRect[] {
  const next: PackRect[] = [];
  const placedExpanded = { ...placed, width: placed.width + spacing, height: placed.height + spacing };
  for (const rect of freeRects) {
    if (!intersects(rect, placedExpanded)) {
      next.push(rect);
      continue;
    }
    if (placedExpanded.x > rect.x) {
      next.push({ x: rect.x, y: rect.y, width: placedExpanded.x - rect.x, height: rect.height });
    }
    if (placedExpanded.x + placedExpanded.width < rect.x + rect.width) {
      next.push({ x: placedExpanded.x + placedExpanded.width, y: rect.y, width: rect.x + rect.width - (placedExpanded.x + placedExpanded.width), height: rect.height });
    }
    if (placedExpanded.y > rect.y) {
      next.push({ x: rect.x, y: rect.y, width: rect.width, height: placedExpanded.y - rect.y });
    }
    if (placedExpanded.y + placedExpanded.height < rect.y + rect.height) {
      next.push({ x: rect.x, y: placedExpanded.y + placedExpanded.height, width: rect.width, height: rect.y + rect.height - (placedExpanded.y + placedExpanded.height) });
    }
  }
  return pruneFreeRects(next.filter((rect) => rect.width > 0 && rect.height > 0));
}

export function packWithMaxRects(group: CutMaterialGroup | null, settings: CutLayoutSettings): CutLayoutResult {
  const prepared = preparePacking(group, settings);
  if (prepared.result) return prepared.result;

  const spacing = getSpacing(settings);
  const sheets = [createSheetContext(settings)];
  const unplaced = [];

  for (const part of prepared.validParts) {
    let placed = false;
    for (const sheet of sheets) {
      let bestRectIndex = -1;
      let bestVariant: any = null;
      let bestScore = Number.POSITIVE_INFINITY;
      (sheet.freeRects ?? []).forEach((rect, index) => {
        for (const variant of partVariants(part, settings)) {
          if (variant.width > rect.width || variant.height > rect.height) continue;
          const leftoverHoriz = rect.width - variant.width;
          const leftoverVert = rect.height - variant.height;
          const score = leftoverHoriz * leftoverVert + Math.min(leftoverHoriz, leftoverVert);
          if (score < bestScore) {
            bestScore = score;
            bestRectIndex = index;
            bestVariant = variant;
          }
        }
      });

      if (bestRectIndex >= 0 && bestVariant) {
        const target = sheet.freeRects![bestRectIndex];
        const chosen = bestVariant;
        const placement = { x: target.x, y: target.y, width: chosen.width, height: chosen.height };
        sheet.placements.push({
          partId: part.id,
          sheetIndex: sheets.indexOf(sheet),
          xMm: placement.x,
          yMm: placement.y,
          widthMm: placement.width,
          heightMm: placement.height,
          rotated: chosen.rotated,
        });
        sheet.freeRects = splitFreeRects(sheet.freeRects!, placement, spacing);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const newSheet = createSheetContext(settings);
      sheets.push(newSheet);
      const target = newSheet.freeRects![0];
      const variant = partVariants(part, settings).find(({ width, height }) => width <= target.width && height <= target.height);
      if (!variant) {
        unplaced.push(part);
        continue;
      }
      const placement = { x: target.x, y: target.y, width: variant.width, height: variant.height };
      newSheet.placements.push({
        partId: part.id,
        sheetIndex: sheets.length - 1,
        xMm: placement.x,
        yMm: placement.y,
        widthMm: placement.width,
        heightMm: placement.height,
        rotated: variant.rotated,
      });
      newSheet.freeRects = splitFreeRects(newSheet.freeRects!, placement, spacing);
    }
  }

  return finalizeResult(group, settings, sheets, prepared.invalidParts, prepared.issues, unplaced);
}

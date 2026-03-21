import type { CutLayoutResult, CutLayoutSettings, CutMaterialGroup } from '../domain/types';
import type { PackRect } from './shared';
import { createSheetContext, finalizeResult, getSpacing, partVariants, preparePacking } from './shared';

function splitRect(rect: PackRect, width: number, height: number, spacing: number): PackRect[] {
  const rightWidth = rect.width - width - spacing;
  const bottomHeight = rect.height - height - spacing;
  const result: PackRect[] = [];
  if (rightWidth > 0) {
    result.push({ x: rect.x + width + spacing, y: rect.y, width: rightWidth, height });
  }
  if (bottomHeight > 0) {
    result.push({ x: rect.x, y: rect.y + height + spacing, width: rect.width, height: bottomHeight });
  }
  if (rightWidth > 0 && rect.height - height - spacing > 0) {
    result.push({ x: rect.x + width + spacing, y: rect.y + height + spacing, width: rightWidth, height: bottomHeight });
  }
  return result.filter((item) => item.width > 0 && item.height > 0);
}

export function packWithGuillotine(group: CutMaterialGroup | null, settings: CutLayoutSettings): CutLayoutResult {
  const prepared = preparePacking(group, settings);
  if (prepared.result) return prepared.result;

  const spacing = getSpacing(settings);
  const sheets = [createSheetContext(settings)];
  const unplaced = [];

  for (const part of prepared.validParts) {
    let placed = false;
    for (const sheet of sheets) {
      let bestIndex = -1;
      let bestVariant: any = null;
      let bestScore = Number.POSITIVE_INFINITY;
      (sheet.freeRects ?? []).forEach((rect, index) => {
        for (const variant of partVariants(part, settings)) {
          if (variant.width > rect.width || variant.height > rect.height) continue;
          const score = Math.min(rect.width - variant.width, rect.height - variant.height);
          if (score < bestScore) {
            bestScore = score;
            bestIndex = index;
            bestVariant = variant;
          }
        }
      });

      if (bestIndex >= 0 && bestVariant) {
        const rect = sheet.freeRects![bestIndex];
        const chosen = bestVariant;
        sheet.placements.push({
          partId: part.id,
          sheetIndex: sheets.indexOf(sheet),
          xMm: rect.x,
          yMm: rect.y,
          widthMm: chosen.width,
          heightMm: chosen.height,
          rotated: chosen.rotated,
        });
        sheet.freeRects!.splice(bestIndex, 1, ...splitRect(rect, chosen.width, chosen.height, spacing));
        placed = true;
        break;
      }
    }

    if (!placed) {
      const newSheet = createSheetContext(settings);
      sheets.push(newSheet);
      const fittingRect = newSheet.freeRects![0];
      const variant = partVariants(part, settings).find(({ width, height }) => width <= fittingRect.width && height <= fittingRect.height);
      if (!variant) {
        unplaced.push(part);
        continue;
      }
      newSheet.placements.push({
        partId: part.id,
        sheetIndex: sheets.length - 1,
        xMm: fittingRect.x,
        yMm: fittingRect.y,
        widthMm: variant.width,
        heightMm: variant.height,
        rotated: variant.rotated,
      });
      newSheet.freeRects = splitRect(fittingRect, variant.width, variant.height, spacing);
    }
  }

  return finalizeResult(group, settings, sheets, prepared.invalidParts, prepared.issues, unplaced);
}

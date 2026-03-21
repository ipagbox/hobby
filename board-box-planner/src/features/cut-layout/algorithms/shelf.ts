import type { CutLayoutResult, CutLayoutSettings, CutMaterialGroup } from '../domain/types';
import { createSheetContext, finalizeResult, getSpacing, partVariants, preparePacking } from './shared';

export function packWithShelf(group: CutMaterialGroup | null, settings: CutLayoutSettings): CutLayoutResult {
  const prepared = preparePacking(group, settings);
  if (prepared.result) return prepared.result;

  const spacing = getSpacing(settings);
  const sheets = [createSheetContext(settings)];
  const unplaced = [];

  for (const part of prepared.validParts) {
    let placed = false;
    for (const sheet of sheets) {
      for (const variant of partVariants(part, settings)) {
        const neededWidth = variant.width + (sheet.placements.length > 0 ? spacing : 0);
        const maxX = settings.marginMm + sheet.usableWidthMm;
        const maxY = settings.marginMm + sheet.usableHeightMm;
        const currentX = sheet.shelfX ?? settings.marginMm;
        const currentY = sheet.cursorY ?? settings.marginMm;
        const currentShelfHeight = sheet.shelfHeight ?? 0;
        const fitsCurrentShelf = currentX + neededWidth <= maxX && currentY + variant.height <= maxY;

        if (fitsCurrentShelf) {
          sheet.placements.push({
            partId: part.id,
            sheetIndex: sheets.indexOf(sheet),
            xMm: currentX,
            yMm: currentY,
            widthMm: variant.width,
            heightMm: variant.height,
            rotated: variant.rotated,
          });
          sheet.shelfX = currentX + variant.width + spacing;
          sheet.shelfHeight = Math.max(currentShelfHeight, variant.height);
          placed = true;
          break;
        }

        const nextShelfY = currentY + currentShelfHeight + spacing;
        const fitsNextShelf = settings.marginMm + variant.width <= maxX && nextShelfY + variant.height <= maxY;
        if (fitsNextShelf) {
          sheet.cursorY = nextShelfY;
          sheet.shelfX = settings.marginMm + variant.width + spacing;
          sheet.shelfHeight = variant.height;
          sheet.placements.push({
            partId: part.id,
            sheetIndex: sheets.indexOf(sheet),
            xMm: settings.marginMm,
            yMm: nextShelfY,
            widthMm: variant.width,
            heightMm: variant.height,
            rotated: variant.rotated,
          });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      const newSheet = createSheetContext(settings);
      sheets.push(newSheet);
      const variant = partVariants(part, settings).find(({ width, height }) => width <= newSheet.usableWidthMm && height <= newSheet.usableHeightMm);
      if (!variant) {
        unplaced.push(part);
        continue;
      }
      newSheet.placements.push({
        partId: part.id,
        sheetIndex: sheets.length - 1,
        xMm: settings.marginMm,
        yMm: settings.marginMm,
        widthMm: variant.width,
        heightMm: variant.height,
        rotated: variant.rotated,
      });
      newSheet.shelfX = settings.marginMm + variant.width + spacing;
      newSheet.shelfHeight = variant.height;
      newSheet.cursorY = settings.marginMm;
    }
  }

  return finalizeResult(group, settings, sheets, prepared.invalidParts, prepared.issues, unplaced);
}

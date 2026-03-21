import type { CutLayoutSettings } from './types';

export const PACKING_ALGORITHM_OPTIONS = [
  { id: 'shelf', label: 'Simple Row / Shelf', description: 'Places parts in rows from left to right.' },
  { id: 'guillotine', label: 'Guillotine Split', description: 'Splits free rectangles after each placement.' },
  { id: 'maxrects', label: 'Best Fit / MaxRects', description: 'Chooses tighter free rectangles for better usage.' },
] as const;

export function createDefaultCutLayoutSettings(): CutLayoutSettings {
  return {
    sheetWidthMm: 2440,
    sheetHeightMm: 1220,
    kerfMm: 3,
    marginMm: 10,
    gapMm: 4,
    allowRotation: true,
    minimumPartSizeMm: 20,
    selectedAlgorithm: 'maxrects',
    autoRecalculate: true,
    selectedGroupId: null,
  };
}

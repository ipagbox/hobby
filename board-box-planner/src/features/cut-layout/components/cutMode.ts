import { PACKING_ALGORITHM_OPTIONS } from '../domain/defaults';
import { computePartStatuses, formatAreaMm2 } from '../domain/layoutUtils';
import type { CutLayoutResult, CutLayoutSettings, CutMaterialGroup, CutPart } from '../domain/types';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderViewModeToggle(viewMode: 'project' | 'cut'): string {
  return `
    <div class="toolbar-group toolbar-group--view-mode" aria-label="View mode">
      <div class="toolbar-section-label">View Mode</div>
      <div class="segmented-control">
        <button type="button" class="segment ${viewMode === 'project' ? 'active' : ''}" data-view-mode="project">Project</button>
        <button type="button" class="segment ${viewMode === 'cut' ? 'active' : ''}" data-view-mode="cut">Cut</button>
      </div>
    </div>
  `;
}

export function renderCutBoardList(group: CutMaterialGroup | null, result: CutLayoutResult, selectedPartId: string | null): string {
  if (!group || group.parts.length === 0) {
    return '<p class="empty-state">No rectangular parts available for Cut mode.</p>';
  }
  const statuses = computePartStatuses(result);
  return group.parts.map((part) => {
    const status = statuses[part.id] ?? { placed: false, sheetIndex: null };
    return `
      <button class="board-row cut-part-row ${part.id === selectedPartId ? 'selected' : ''}" data-cut-part-id="${part.id}">
        <strong>${escapeHtml(part.label)}</strong>
        <span>${part.widthMm} × ${part.heightMm} × ${part.thicknessMm} mm</span>
        <small>Qty ${part.quantity} · ${status.placed ? `Placed on sheet ${Number(status.sheetIndex) + 1}` : 'Unplaced'}</small>
      </button>
    `;
  }).join('');
}

export function renderCutProperties(settings: CutLayoutSettings, groups: CutMaterialGroup[], selectedGroupId: string | null, result: CutLayoutResult): string {
  return `
    <div class="panel-header"><h2>Cut Layout</h2></div>
    <div class="cut-sidebar-section">
      <h3>Settings</h3>
      <div class="form-grid cut-grid">
        <label><span>Material group</span><select data-cut-setting="selectedGroupId">${groups.map((group) => `<option value="${group.id}" ${group.id === selectedGroupId ? 'selected' : ''}>${escapeHtml(group.label)}</option>`).join('')}</select></label>
        <label><span>Sheet width</span><input data-cut-setting="sheetWidthMm" type="number" min="1" step="1" value="${settings.sheetWidthMm}" /></label>
        <label><span>Sheet height</span><input data-cut-setting="sheetHeightMm" type="number" min="1" step="1" value="${settings.sheetHeightMm}" /></label>
        <label><span>Kerf</span><input data-cut-setting="kerfMm" type="number" min="0" step="0.1" value="${settings.kerfMm}" /></label>
        <label><span>Margin</span><input data-cut-setting="marginMm" type="number" min="0" step="1" value="${settings.marginMm}" /></label>
        <label><span>Gap</span><input data-cut-setting="gapMm" type="number" min="0" step="1" value="${settings.gapMm}" /></label>
        <label><span>Min part size</span><input data-cut-setting="minimumPartSizeMm" type="number" min="0" step="1" value="${settings.minimumPartSizeMm}" /></label>
        <label><span>Algorithm</span><select data-cut-setting="selectedAlgorithm">${PACKING_ALGORITHM_OPTIONS.map((option) => `<option value="${option.id}" ${option.id === settings.selectedAlgorithm ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>
        <label class="cut-checkbox"><input data-cut-setting="allowRotation" type="checkbox" ${settings.allowRotation ? 'checked' : ''} /> <span>Allow rotation</span></label>
        <label class="cut-checkbox"><input data-cut-setting="autoRecalculate" type="checkbox" ${settings.autoRecalculate ? 'checked' : ''} /> <span>Auto recalculate</span></label>
      </div>
      <button type="button" data-cut-action="recalculate">Recalculate</button>
    </div>
    <div class="cut-sidebar-section">
      <h3>Summary</h3>
      <dl class="cut-summary-list">
        <div><dt>Total parts</dt><dd>${result.summary.totalParts}</dd></div>
        <div><dt>Placed</dt><dd>${result.summary.placedParts}</dd></div>
        <div><dt>Unplaced</dt><dd>${result.summary.unplacedParts}</dd></div>
        <div><dt>Invalid</dt><dd>${result.summary.invalidParts}</dd></div>
        <div><dt>Used area</dt><dd>${formatAreaMm2(result.summary.usedAreaMm2)}</dd></div>
        <div><dt>Free area</dt><dd>${formatAreaMm2(result.summary.freeAreaMm2)}</dd></div>
        <div><dt>Utilization</dt><dd>${(result.summary.utilization * 100).toFixed(1)}%</dd></div>
        <div><dt>Sheets</dt><dd>${result.summary.sheetCount}</dd></div>
      </dl>
    </div>
    <div class="cut-sidebar-section">
      <h3>Warnings</h3>
      ${result.issues.length === 0 ? '<p class="empty-state">No warnings.</p>' : `<ul class="issue-list">${result.issues.map((issue) => `<li class="issue issue--${issue.severity}">${escapeHtml(issue.message)}</li>`).join('')}</ul>`}
    </div>
  `;
}

function partFill(index: number, selected: boolean): string {
  if (selected) return '#fb923c';
  const palette = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#f87171'];
  return palette[index % palette.length];
}

export function renderCutWorkspace(result: CutLayoutResult, activeSheetIndex: number, selectedPartId: string | null, zoom: number): string {
  if (!result.group) {
    return '<div class="cut-workspace__empty">No compatible material group found.</div>';
  }
  if (result.summary.totalParts === 0) {
    return '<div class="cut-workspace__empty">Project has no parts to lay out.</div>';
  }
  if (result.sheets.length === 0) {
    return '<div class="cut-workspace__empty">No sheets were generated. Adjust your settings and recalculate.</div>';
  }

  const safeSheetIndex = Math.min(Math.max(activeSheetIndex, 0), result.sheets.length - 1);
  const sheet = result.sheets[safeSheetIndex];
  const viewportWidth = 860;
  const viewportHeight = 560;
  const scale = Math.min(viewportWidth / Math.max(sheet.widthMm, 1), viewportHeight / Math.max(sheet.heightMm, 1)) * zoom;
  const statuses = computePartStatuses(result);

  return `
    <div class="cut-workspace__header">
      <div>
        <h2>${escapeHtml(result.group.label)}</h2>
        <p>Sheet ${safeSheetIndex + 1} of ${result.sheets.length} · ${sheet.widthMm} × ${sheet.heightMm} mm</p>
      </div>
      <div class="cut-sheet-nav">
        <button type="button" data-cut-action="prev-sheet" ${safeSheetIndex === 0 ? 'disabled' : ''}>Previous</button>
        <button type="button" data-cut-action="next-sheet" ${safeSheetIndex >= result.sheets.length - 1 ? 'disabled' : ''}>Next</button>
        <button type="button" data-cut-action="zoom-out">−</button>
        <button type="button" data-cut-action="fit-sheet">Fit</button>
        <button type="button" data-cut-action="zoom-in">+</button>
      </div>
    </div>
    <div class="cut-legend">
      <span><i class="legend-chip legend-chip--placed"></i>Placed</span>
      <span><i class="legend-chip legend-chip--selected"></i>Selected</span>
      <span><i class="legend-chip legend-chip--unplaced"></i>Unplaced / invalid</span>
      <span>Zoom ${(zoom * 100).toFixed(0)}%</span>
    </div>
    <div class="cut-canvas-scroll" data-cut-scroll>
      <svg class="cut-canvas" viewBox="0 0 ${sheet.widthMm * scale} ${sheet.heightMm * scale}" width="${sheet.widthMm * scale}" height="${sheet.heightMm * scale}" role="img" aria-label="Cut layout sheet ${safeSheetIndex + 1}">
        <rect x="0" y="0" width="${sheet.widthMm * scale}" height="${sheet.heightMm * scale}" class="sheet-outer" rx="18" ry="18"></rect>
        ${sheet.placements.map((placement, index) => {
          const part = result.group?.parts.find((item) => item.id === placement.partId);
          const selected = placement.partId === selectedPartId;
          const x = placement.xMm * scale;
          const y = placement.yMm * scale;
          const width = placement.widthMm * scale;
          const height = placement.heightMm * scale;
          const label = `${part?.label ?? placement.partId} ${placement.widthMm}×${placement.heightMm}${placement.rotated ? ' ↻' : ''}`;
          const showText = width > 80 && height > 38;
          return `
            <g class="cut-part ${selected ? 'is-selected' : ''}" data-cut-canvas-part-id="${placement.partId}">
              <title>${escapeHtml(label)}</title>
              <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${partFill(index, selected)}" class="cut-part-rect"></rect>
              ${showText ? `<text x="${x + 8}" y="${y + 18}" class="cut-part-label"><tspan x="${x + 8}" dy="0">${escapeHtml(part?.label ?? placement.partId)}</tspan><tspan x="${x + 8}" dy="15">${placement.widthMm} × ${placement.heightMm} mm</tspan></text>` : ''}
            </g>
          `;
        }).join('')}
      </svg>
    </div>
    <div class="cut-unplaced-block">
      <h3>Unplaced / Invalid parts</h3>
      ${(result.unplacedParts.length === 0 && result.invalidParts.length === 0) ? '<p class="empty-state">All parts in the selected group were placed.</p>' : `
        <div class="unplaced-list">
          ${[...result.unplacedParts, ...result.invalidParts].map((part: CutPart) => `
            <button type="button" class="unplaced-chip ${part.id === selectedPartId ? 'selected' : ''}" data-cut-part-id="${part.id}">
              ${escapeHtml(part.label)} · ${part.widthMm} × ${part.heightMm} × ${part.thicknessMm} mm
            </button>
          `).join('')}
        </div>
      `}
    </div>
    <div class="cut-sheet-stats">
      <span>Used ${formatAreaMm2(sheet.usedAreaMm2)}</span>
      <span>Free ${formatAreaMm2(sheet.freeAreaMm2)}</span>
      <span>Utilization ${(sheet.utilization * 100).toFixed(1)}%</span>
      <span>${Object.values(statuses).filter((entry) => entry.placed && entry.sheetIndex === safeSheetIndex).length} placed on this sheet</span>
    </div>
  `;
}

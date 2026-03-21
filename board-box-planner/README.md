# Board Box Planner

Board Box Planner is a lightweight local-first browser app for planning simple box-like furniture from rectangular boards and exporting the project as JSON.

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL in your browser.

## MVP features

- Three.js viewport with orbit, zoom, pan, axes, grid, reset camera, and quick view buttons.
- Orthogonal board modeling only with XY, XZ, and YZ orientations.
- Board list with selection from the list or 3D viewport.
- Properties panel for editing dimensions, position, material, role, notes, and orientation in millimeters.
- Toolbar actions for creating, duplicating, deleting, saving, loading, toggling grid visibility, and changing snap step.
- Sample cabinet project JSON included for quick testing.
- **View Mode** switch between the existing 3D **Project** workflow and the new 2D **Cut** planning workflow.
- Cut planning for rectangular parts with selectable **Shelf**, **Guillotine**, and **Best Fit / MaxRects** packing strategies.
- Multi-sheet planning with placed/unplaced part reporting, per-material/per-thickness grouping, and live utilization metrics.

## Cut mode

Cut mode derives rectangular cut parts from the project boards and lays them out on sheet goods for estimation and planning.

### What it does

- Keeps the current Project mode intact and lets you switch to Cut mode at any time.
- Extracts one rectangular cut part per board.
- Separates layouts by compatible material + thickness groups so mixed materials are not silently packed together.
- Draws the active sheet as a proportional 2D map with labeled placed parts.
- Shows multiple sheets when needed, with sheet navigation and zoom controls.
- Highlights selection both ways between the cut-part list and the sheet canvas.
- Reports invalid, too-small, and unplaced parts.

### Supported assumptions

- Rectangles only.
- 90° rotation is optional and configurable.
- Kerf, sheet-edge margin, and inter-part gap are all respected during placement.
- The current implementation is intended as a planning / estimation aid rather than a manufacturing-grade optimizer.

### Algorithms

- **Simple Row / Shelf** — fast baseline row-by-row placement.
- **Guillotine Split** — free-rectangle splitting suited to rectangular subdivision workflows.
- **Best Fit / MaxRects** — tighter placement heuristic for better average utilization.

### Current limitations

- No irregular nesting, CNC output, toolpaths, or cutting-sequence optimization.
- No manual rearrangement or drag-and-drop editing yet.
- No grain-direction restrictions yet, though the cut-part model is ready for future grain metadata.
- No export/print/CSV output yet.
- Labels are abbreviated automatically when rectangles become too small to render readable text.

### Future extension points

- Grain direction / texture direction constraints.
- Edge banding-aware planning.
- Manual sheet editing and lockable placements.
- Export to CSV, printable cut sheets, PDF, or DXF.
- Cost/material calculations and downstream manufacturing helpers.

## Testing

```bash
npm run test
npm run build
```

## Project structure

- `src/domain` — project and board types plus JSON serialization helpers.
- `src/state` — small app store for board/project editing and persistence actions.
- `src/scene` — Three.js scene wrapper and viewport selection logic.
- `src/ui` — application shell and DOM-based controls.
- `src/features/cut-layout` — cut-part extraction, packing algorithms, Cut mode UI rendering helpers, and tests.
- `src/assets` — sample project data.

## Current limitations

- Frontend-only MVP with no backend, accounts, or cloud sync.
- Boards are simple rectangular solids only; no drilling, hardware, chamfers, or boolean operations.
- Rotation is limited to orthogonal XY/XZ/YZ orientations in Project mode.
- Save/load uses JSON files only.

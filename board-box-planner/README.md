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

## Project structure

- `src/domain` — project and board types plus JSON serialization helpers.
- `src/state` — small app store for board/project editing and persistence actions.
- `src/scene` — Three.js scene wrapper and viewport selection logic.
- `src/ui` — application shell and DOM-based controls.
- `src/assets` — sample project data.

## Current limitations

- Frontend-only MVP with no backend, accounts, or cloud sync.
- Boards are simple rectangular solids only; no drilling, hardware, chamfers, or boolean operations.
- Rotation is limited to orthogonal XY/XZ/YZ orientations.
- Save/load uses JSON files only.

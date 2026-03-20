export const sampleProjectJson = `{
  "name": "Simple cabinet",
  "board_thickness_mm": 16,
  "settings": {
    "gridVisible": true,
    "snapStepMm": 10
  },
  "boards": [
    {
      "id": "left-side",
      "name": "Left side",
      "role": "side",
      "material": "Birch plywood",
      "width_mm": 720,
      "height_mm": 560,
      "thickness_mm": 16,
      "x_mm": 8,
      "y_mm": 360,
      "z_mm": 300,
      "orientation": "YZ",
      "note": "Outer left panel"
    },
    {
      "id": "right-side",
      "name": "Right side",
      "role": "side",
      "material": "Birch plywood",
      "width_mm": 720,
      "height_mm": 560,
      "thickness_mm": 16,
      "x_mm": 592,
      "y_mm": 360,
      "z_mm": 300,
      "orientation": "YZ",
      "note": "Outer right panel"
    },
    {
      "id": "top",
      "name": "Top",
      "role": "top",
      "material": "Birch plywood",
      "width_mm": 600,
      "height_mm": 560,
      "thickness_mm": 16,
      "x_mm": 300,
      "y_mm": 712,
      "z_mm": 300,
      "orientation": "XZ",
      "note": "Between side panels"
    },
    {
      "id": "bottom",
      "name": "Bottom",
      "role": "bottom",
      "material": "Birch plywood",
      "width_mm": 600,
      "height_mm": 560,
      "thickness_mm": 16,
      "x_mm": 300,
      "y_mm": 8,
      "z_mm": 300,
      "orientation": "XZ",
      "note": "Between side panels"
    },
    {
      "id": "shelf",
      "name": "Shelf",
      "role": "shelf",
      "material": "Birch plywood",
      "width_mm": 600,
      "height_mm": 520,
      "thickness_mm": 16,
      "x_mm": 300,
      "y_mm": 360,
      "z_mm": 320,
      "orientation": "XZ",
      "note": "Centered shelf"
    },
    {
      "id": "back",
      "name": "Back panel",
      "role": "back",
      "material": "Hardboard",
      "width_mm": 600,
      "height_mm": 720,
      "thickness_mm": 4,
      "x_mm": 300,
      "y_mm": 360,
      "z_mm": 2,
      "orientation": "XY",
      "note": "Thin back panel"
    }
  ]
}`;

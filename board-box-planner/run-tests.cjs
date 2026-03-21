const assert = require('node:assert/strict');
const { projectFromJson } = require('./dist-tests/domain/model.js');
const { sampleProjectJson } = require('./dist-tests/assets/sampleProject.js');
const { packWithShelf } = require('./dist-tests/features/cut-layout/algorithms/shelf.js');
const { packWithGuillotine } = require('./dist-tests/features/cut-layout/algorithms/guillotine.js');
const { packWithMaxRects } = require('./dist-tests/features/cut-layout/algorithms/maxRects.js');
const { renderCutBoardList, renderCutWorkspace } = require('./dist-tests/features/cut-layout/components/cutMode.js');
const { createDefaultCutLayoutSettings } = require('./dist-tests/features/cut-layout/domain/defaults.js');
const { extractCutParts } = require('./dist-tests/features/cut-layout/domain/extractParts.js');
const { resolveSelectedGroup } = require('./dist-tests/features/cut-layout/domain/layoutUtils.js');

function getGroupByMaterial(groups, material) {
  const group = groups.find((entry) => entry.material === material);
  if (!group) throw new Error(`Missing group for ${material}`);
  return group;
}
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); } catch (error) { console.error(`✗ ${name}`); throw error; }
}

test('extracts boards into material groups', () => {
  const project = projectFromJson(sampleProjectJson);
  const extraction = extractCutParts(project);
  assert.equal(extraction.parts.length, 6);
  assert.equal(extraction.groups.length, 2);
  assert.equal(getGroupByMaterial(extraction.groups, 'Birch plywood').parts.length, 5);
  assert.equal(getGroupByMaterial(extraction.groups, 'Hardboard').parts.length, 1);
});

test('packs sample cabinet boards onto a single birch sheet with maxrects', () => {
  const project = projectFromJson(sampleProjectJson);
  const extraction = extractCutParts(project);
  const settings = createDefaultCutLayoutSettings();
  const result = packWithMaxRects(getGroupByMaterial(extraction.groups, 'Birch plywood'), settings);
  assert.equal(result.summary.sheetCount, 1);
  assert.equal(result.summary.placedParts, 5);
  assert.equal(result.summary.unplacedParts, 0);
});

test('respects rotation toggles', () => {
  const project = projectFromJson('{"name":"Rotation","board_thickness_mm":18,"boards":[{"id":"a","name":"Tall","role":"side","material":"Birch","width_mm":1300,"height_mm":800,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"YZ","note":""}],"settings":{"gridVisible":true,"snapEnabled":true,"snapStepMm":10,"transparencyEnabled":false,"hideDoors":false,"openDoors":false}}');
  const extraction = extractCutParts(project);
  const group = resolveSelectedGroup(extraction.groups, null);
  const settingsOff = { ...createDefaultCutLayoutSettings(), sheetWidthMm: 1220, sheetHeightMm: 2440, allowRotation: false };
  const settingsOn = { ...settingsOff, allowRotation: true };
  assert.equal(packWithShelf(group, settingsOff).summary.unplacedParts, 1);
  assert.equal(packWithShelf(group, settingsOn).summary.placedParts, 1);
});

test('detects multiple sheets and unplaced oversized parts', () => {
  const project = projectFromJson('{"name":"Many","board_thickness_mm":18,"boards":[{"id":"a","name":"A","role":"side","material":"Birch","width_mm":1000,"height_mm":500,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"YZ","note":""},{"id":"b","name":"B","role":"side","material":"Birch","width_mm":1000,"height_mm":500,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"YZ","note":""},{"id":"c","name":"C","role":"side","material":"Birch","width_mm":1000,"height_mm":500,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"YZ","note":""},{"id":"oversized","name":"Too big","role":"top","material":"Birch","width_mm":3000,"height_mm":1500,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"XZ","note":""}],"settings":{"gridVisible":true,"snapEnabled":true,"snapStepMm":10,"transparencyEnabled":false,"hideDoors":false,"openDoors":false}}');
  const group = resolveSelectedGroup(extractCutParts(project).groups, null);
  const settings = { ...createDefaultCutLayoutSettings(), sheetWidthMm: 1220, sheetHeightMm: 1220 };
  const result = packWithGuillotine(group, settings);
  assert.ok(result.summary.sheetCount > 1);
  assert.ok(result.unplacedParts.some((part) => part.id === 'oversized'));
});

test('flags invalid and tiny parts', () => {
  const project = projectFromJson('{"name":"Invalid","board_thickness_mm":18,"boards":[{"id":"bad","name":"Bad","role":"custom","material":"Birch","width_mm":0,"height_mm":50,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"YZ","note":""},{"id":"tiny","name":"Tiny","role":"custom","material":"Birch","width_mm":10,"height_mm":10,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"YZ","note":""}],"settings":{"gridVisible":true,"snapEnabled":true,"snapStepMm":10,"transparencyEnabled":false,"hideDoors":false,"openDoors":false}}');
  const group = resolveSelectedGroup(extractCutParts(project).groups, null);
  const result = packWithMaxRects(group, createDefaultCutLayoutSettings());
  assert.equal(result.summary.invalidParts, 1);
  assert.ok(result.issues.some((issue) => issue.message.includes('minimum allowed size')));
});

test('switching algorithm can change the resulting layout metrics', () => {
  const project = projectFromJson('{"name":"Algo","board_thickness_mm":18,"boards":[{"id":"a","name":"A","role":"custom","material":"Birch","width_mm":700,"height_mm":500,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"YZ","note":""},{"id":"b","name":"B","role":"custom","material":"Birch","width_mm":700,"height_mm":500,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"YZ","note":""},{"id":"c","name":"C","role":"custom","material":"Birch","width_mm":500,"height_mm":700,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"YZ","note":""},{"id":"d","name":"D","role":"custom","material":"Birch","width_mm":500,"height_mm":700,"thickness_mm":18,"x_mm":0,"y_mm":0,"z_mm":0,"orientation":"YZ","note":""}],"settings":{"gridVisible":true,"snapEnabled":true,"snapStepMm":10,"transparencyEnabled":false,"hideDoors":false,"openDoors":false}}');
  const group = resolveSelectedGroup(extractCutParts(project).groups, null);
  const settings = { ...createDefaultCutLayoutSettings(), sheetWidthMm: 1400, sheetHeightMm: 1200 };
  const shelfResult = packWithShelf(group, settings);
  const maxResult = packWithMaxRects(group, settings);
  assert.ok(shelfResult.summary.sheetCount >= maxResult.summary.sheetCount);
});

test('renders selected state consistently in sidebar and workspace markup', () => {
  const project = projectFromJson(sampleProjectJson);
  const extraction = extractCutParts(project);
  const group = getGroupByMaterial(extraction.groups, 'Birch plywood');
  const result = packWithMaxRects(group, createDefaultCutLayoutSettings());
  const listHtml = renderCutBoardList(group, result, 'left-side');
  const workspaceHtml = renderCutWorkspace(result, 0, 'left-side', 1);
  assert.ok(listHtml.includes('data-cut-part-id="left-side"'));
  assert.ok(listHtml.includes('selected'));
  assert.ok(workspaceHtml.includes('data-cut-canvas-part-id="left-side"'));
  assert.ok(workspaceHtml.includes('is-selected'));
});

test('renders smoke-state messages for empty layouts', () => {
  const html = renderCutWorkspace({
    group: null,
    sheets: [],
    unplacedParts: [],
    invalidParts: [],
    issues: [],
    summary: { totalParts: 0, placedParts: 0, unplacedParts: 0, invalidParts: 0, usedAreaMm2: 0, freeAreaMm2: 0, utilization: 0, sheetCount: 0 },
  }, 0, null, 1);
  assert.ok(html.includes('No compatible material group found'));
});

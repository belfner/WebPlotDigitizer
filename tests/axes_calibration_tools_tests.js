/*
    WebPlotDigitizer - web based chart data extraction software (and more)

    Copyright (C) 2025 Ankit Rohatgi

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>
*/

QUnit.module(
    "AxesCornersTool tests", {
        beforeEach: function() {
            sinon.stub(wpd.graphicsWidget, "resetData");
            sinon.stub(wpd.graphicsWidget, "forceHandlerRepaint");
            sinon.stub(wpd.graphicsWidget, "updateZoomOnEvent");
            sinon.stub(wpd.graphicsWidget, "updateZoomToImagePosn");
            sinon.stub(wpd.graphicsWidget, "getZoomRatio").returns(1);
            sinon.stub(wpd.graphicsWidget, "getRotation").returns(0);
            sinon.stub(wpd.graphicsWidget, "getRotatedCoordinates").callsFake(function(from, to, x, y) {
                return {x: x, y: y};
            });
            sinon.stub(wpd.alignAxes, "updateCalibrationCompletion");
            this.undoManager = new wpd.UndoManager();
            sinon.stub(wpd.appData, "getUndoManager").returns(this.undoManager);
        },
        afterEach: function() {
            sinon.restore();
        }
    }
);

function _calMods(overrides) {
    return Object.assign({
        button: 0,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false
    }, overrides);
}

function _makeCalibration(maxPointCount) {
    const cal = new wpd.Calibration(2);
    cal.maxPointCount = maxPointCount;
    return cal;
}

// place a single point with a plain click-release (no drag)
function _clickPlace(tool, ev, x, y) {
    tool.onMouseDown(ev, {x: x, y: y}, {x: x, y: y});
    tool.onMouseUp(ev, {x: x, y: y}, {x: x, y: y});
}

QUnit.test("Left click adds points sequentially; undo/redo reverses each", function(assert) {
    const cal = _makeCalibration(4);
    const tool = new wpd.AxesCornersTool(cal, false, "xy");
    const ev = _calMods();

    // place the second point well outside the 50px hit radius so plain-left adds instead of grabbing
    _clickPlace(tool, ev, 10, 10);
    _clickPlace(tool, ev, 200, 200);
    assert.equal(cal.getCount(), 2, "two points added");
    assert.deepEqual({px: cal.getPoint(1).px, py: cal.getPoint(1).py}, {px: 200, py: 200}, "second point placed");

    this.undoManager.undo();
    assert.equal(cal.getCount(), 1, "undo removes the last added point");
    this.undoManager.redo();
    assert.equal(cal.getCount(), 2, "redo re-adds it");
});

QUnit.test("Calibration points are always movable before full placement", function(assert) {
    const cal = _makeCalibration(4);
    const tool = new wpd.AxesCornersTool(cal, false, "xy");
    _clickPlace(tool, _calMods(), 10, 10); // only 1 of 4 placed

    // plain left near the point auto-grabs and moves it (no "place all first" gate)
    const ev = _calMods();
    tool.onMouseDown(ev, {x: 10, y: 10}, {x: 10, y: 10});
    tool.onMouseMove(ev, {x: 40, y: 40}, {x: 30, y: 31});
    tool.onMouseUp(ev, {x: 40, y: 40}, {x: 30, y: 31});
    assert.deepEqual({px: cal.getPoint(0).px, py: cal.getPoint(0).py}, {px: 30, py: 31}, "point moved before full placement");
    assert.equal(cal.getCount(), 1, "move did not add a point");

    this.undoManager.undo();
    assert.deepEqual({px: cal.getPoint(0).px, py: cal.getPoint(0).py}, {px: 10, py: 10}, "undo restores position");
});

QUnit.test("Shift+left moves only on a hit; Ctrl+left is a no-op", function(assert) {
    const cal = _makeCalibration(4);
    const tool = new wpd.AxesCornersTool(cal, false, "xy");
    _clickPlace(tool, _calMods(), 10, 10);
    this.undoManager.clear();

    // Shift+left away from any point: no add, no move
    const shiftMiss = _calMods({shiftKey: true});
    tool.onMouseDown(shiftMiss, {x: 500, y: 500}, {x: 500, y: 500});
    tool.onMouseUp(shiftMiss, {x: 500, y: 500}, {x: 500, y: 500});
    assert.equal(cal.getCount(), 1, "shift+miss adds nothing");
    assert.false(this.undoManager.canUndo(), "shift+miss records nothing");

    // Ctrl+left on the point: no removal (calibration points are not removable)
    const ctrl = _calMods({ctrlKey: true});
    tool.onMouseDown(ctrl, {x: 10, y: 10}, {x: 10, y: 10});
    tool.onMouseUp(ctrl, {x: 10, y: 10}, {x: 10, y: 10});
    assert.equal(cal.getCount(), 1, "ctrl+left does not remove");
    assert.false(this.undoManager.canUndo(), "ctrl+left records nothing");
});

QUnit.test("Alt+left near a point forces a fresh placement instead of grabbing", function(assert) {
    const cal = _makeCalibration(4);
    const tool = new wpd.AxesCornersTool(cal, false, "xy");
    _clickPlace(tool, _calMods(), 10, 10);

    const alt = _calMods({altKey: true});
    tool.onMouseDown(alt, {x: 11, y: 11}, {x: 11, y: 11}); // near the existing point
    tool.onMouseUp(alt, {x: 11, y: 11}, {x: 11, y: 11});
    assert.equal(cal.getCount(), 2, "alt forces a new point rather than moving the nearby one");
    assert.deepEqual({px: cal.getPoint(0).px, py: cal.getPoint(0).py}, {px: 10, py: 10}, "original point unchanged");
});

QUnit.test("Pair-drag places two XY points atomically; undo pops both", function(assert) {
    const cal = _makeCalibration(4);
    const tool = new wpd.AxesCornersTool(cal, false, "xy");
    const ev = _calMods();

    // press at (5,6), drag past threshold, release at (25,26)
    tool.onMouseDown(ev, {x: 0, y: 0}, {x: 5, y: 6});
    tool.onMouseMove(ev, {x: 60, y: 60}, {x: 25, y: 26});
    tool.onMouseUp(ev, {x: 60, y: 60}, {x: 25, y: 26});

    assert.equal(cal.getCount(), 2, "pair-drag placed two points");
    assert.deepEqual({px: cal.getPoint(0).px, py: cal.getPoint(0).py}, {px: 5, py: 6}, "slot 0 at press position");
    assert.deepEqual({px: cal.getPoint(1).px, py: cal.getPoint(1).py}, {px: 25, py: 26}, "slot 1 at release position");

    this.undoManager.undo();
    assert.equal(cal.getCount(), 0, "undo pops both points as one step");
    this.undoManager.redo();
    assert.equal(cal.getCount(), 2, "redo restores both");
});

QUnit.test("Sub-threshold drag places a single point; polar never pair-drags", function(assert) {
    // sub-threshold: one point even with a tiny move
    const xyCal = _makeCalibration(4);
    const xyTool = new wpd.AxesCornersTool(xyCal, false, "xy");
    const ev = _calMods();
    xyTool.onMouseDown(ev, {x: 0, y: 0}, {x: 5, y: 6});
    xyTool.onMouseMove(ev, {x: 2, y: 2}, {x: 6, y: 7}); // below 5px threshold
    xyTool.onMouseUp(ev, {x: 2, y: 2}, {x: 6, y: 7});
    assert.equal(xyCal.getCount(), 1, "sub-threshold drag places a single point");

    // polar has no configured pairs: a clear drag still places only one point
    const polarCal = _makeCalibration(3);
    const polarTool = new wpd.AxesCornersTool(polarCal, false, "polar");
    polarTool.onMouseDown(ev, {x: 0, y: 0}, {x: 5, y: 6});
    polarTool.onMouseMove(ev, {x: 80, y: 80}, {x: 40, y: 41});
    polarTool.onMouseUp(ev, {x: 80, y: 80}, {x: 40, y: 41});
    assert.equal(polarCal.getCount(), 1, "polar drag places a single point (no pair-drag)");
});

QUnit.test("Arrow-key nudge is one undoable move per keypress", function(assert) {
    const cal = _makeCalibration(4);
    const tool = new wpd.AxesCornersTool(cal, false, "xy");
    _clickPlace(tool, _calMods(), 10, 10); // selects the placed point
    this.undoManager.clear();

    const upKey = {keyCode: 38, shiftKey: false, preventDefault: function() {}, stopPropagation: function() {}};
    tool.onKeyDown(upKey);
    assert.equal(cal.getPoint(0).py, 9.5, "up arrow nudged the point by half a pixel");
    assert.true(this.undoManager.canUndo(), "nudge is undoable");
    this.undoManager.undo();
    assert.equal(cal.getPoint(0).py, 10, "undo restores the nudge");
});

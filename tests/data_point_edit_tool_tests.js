/*
    WebPlotDigitizer - web based chart data extraction software (and more)

    Copyright (C) 2025 Ankit Rohatgi
    Copyright (C) 2026 belfner

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
    "DataPointEditTool tests", {
        beforeEach: function() {
            // stub the graphics/UI surface the tool touches
            sinon.stub(wpd.graphicsHelper, "drawPoint");
            sinon.stub(wpd.graphicsWidget, "resetData");
            sinon.stub(wpd.graphicsWidget, "forceHandlerRepaint");
            sinon.stub(wpd.graphicsWidget, "updateZoomOnEvent");
            sinon.stub(wpd.graphicsWidget, "updateZoomToImagePosn");
            // point drags route through these viewport helpers; the viewport DOM is absent under
            // karma, so clamp passes positions through and the cursor render is a no-op
            sinon.stub(wpd.graphicsWidget, "clampImageToViewport").callsFake(function(x, y) {
                return {x: x, y: y};
            });
            sinon.stub(wpd.graphicsWidget, "renderCursorAtImagePos");
            sinon.stub(wpd.dataPointCounter, "setCount");
            sinon.stub(wpd.events, "dispatch");
            this.undoManager = new wpd.UndoManager();
            sinon.stub(wpd.appData, "getUndoManager").returns(this.undoManager);
        },
        afterEach: function() {
            sinon.restore();
        }
    }
);

function _mods(overrides) {
    return Object.assign({
        button: 0,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false
    }, overrides);
}

QUnit.test("Left click adds a point (lightweight, plain dataset) and undo/redo reverses it", function(assert) {
    const axes = new wpd.ImageAxes();
    const dataset = new wpd.Dataset(1);
    const tool = new wpd.DataPointEditTool(axes, dataset);

    const ev = _mods();
    tool.onMouseDown(ev, {x: 10, y: 10}, {x: 5, y: 6});
    tool.onMouseUp(ev, {x: 10, y: 10}, {x: 5, y: 6});

    assert.equal(dataset.getCount(), 1, "point added on mouseup");
    assert.deepEqual(dataset.getPixel(0), {x: 5, y: 6, metadata: undefined}, "added at release position");

    // trailing click does not add a second point
    tool.onMouseClick(ev, {x: 10, y: 10}, {x: 5, y: 6});
    assert.equal(dataset.getCount(), 1, "trailing click is suppressed");

    assert.true(this.undoManager.canUndo(), "undo available after add");
    this.undoManager.undo();
    assert.equal(dataset.getCount(), 0, "undo removes the added point");
    this.undoManager.redo();
    assert.equal(dataset.getCount(), 1, "redo re-adds the point");
    assert.deepEqual(dataset.getPixel(0), {x: 5, y: 6, metadata: undefined}, "redo restores position");
});

QUnit.test("Shift+drag moves nearest point as one undoable step; Shift miss does not add", function(assert) {
    const axes = new wpd.ImageAxes();
    const dataset = new wpd.Dataset(1);
    const tool = new wpd.DataPointEditTool(axes, dataset);

    // seed one point via a plain add
    const addEv = _mods();
    tool.onMouseDown(addEv, {x: 10, y: 10}, {x: 5, y: 6});
    tool.onMouseUp(addEv, {x: 10, y: 10}, {x: 5, y: 6});
    this.undoManager.clear();

    // shift+drag from the point to a new position
    const shiftEv = _mods({shiftKey: true});
    tool.onMouseDown(shiftEv, {x: 10, y: 10}, {x: 5, y: 6});
    tool.onMouseMove(shiftEv, {x: 40, y: 40}, {x: 20, y: 21});
    tool.onMouseUp(shiftEv, {x: 40, y: 40}, {x: 20, y: 21});

    assert.deepEqual({x: dataset.getPixel(0).x, y: dataset.getPixel(0).y}, {x: 20, y: 21}, "point moved to release position");
    assert.true(this.undoManager.canUndo(), "move is undoable");
    this.undoManager.undo();
    assert.deepEqual({x: dataset.getPixel(0).x, y: dataset.getPixel(0).y}, {x: 5, y: 6}, "undo restores original position");
    this.undoManager.redo();
    assert.deepEqual({x: dataset.getPixel(0).x, y: dataset.getPixel(0).y}, {x: 20, y: 21}, "redo reapplies move");

    // shift+click with no nearby point does not add
    const emptyDataset = new wpd.Dataset(1);
    const emptyTool = new wpd.DataPointEditTool(axes, emptyDataset);
    const missEv = _mods({shiftKey: true});
    emptyTool.onMouseDown(missEv, {x: 10, y: 10}, {x: 500, y: 500});
    emptyTool.onMouseUp(missEv, {x: 10, y: 10}, {x: 500, y: 500});
    assert.equal(emptyDataset.getCount(), 0, "shift+click miss adds nothing");
});

QUnit.test("Ctrl+click removes nearest point (one step); miss is a no-op", function(assert) {
    const axes = new wpd.ImageAxes();
    const dataset = new wpd.Dataset(1);
    const tool = new wpd.DataPointEditTool(axes, dataset);

    dataset.addPixel(20, 21);

    // ctrl+click far from any point: no-op, no undo entry
    const ctrlEv = _mods({ctrlKey: true});
    tool.onMouseDown(ctrlEv, {x: 0, y: 0}, {x: 500, y: 500});
    tool.onMouseUp(ctrlEv, {x: 0, y: 0}, {x: 500, y: 500});
    assert.equal(dataset.getCount(), 1, "ctrl+click miss removes nothing");
    assert.false(this.undoManager.canUndo(), "ctrl+click miss creates no undo entry");

    // ctrl+click on the point removes it
    tool.onMouseDown(ctrlEv, {x: 30, y: 30}, {x: 20, y: 21});
    tool.onMouseUp(ctrlEv, {x: 30, y: 30}, {x: 20, y: 21});
    assert.equal(dataset.getCount(), 0, "ctrl+click removes the point");
    this.undoManager.undo();
    assert.equal(dataset.getCount(), 1, "undo restores the removed point");
    assert.deepEqual(dataset.getPixel(0), {x: 20, y: 21, metadata: undefined}, "restored with payload");
    this.undoManager.redo();
    assert.equal(dataset.getCount(), 0, "redo removes again");
});

QUnit.test("Bar-label add uses a full snapshot and undo restores the schema", function(assert) {
    const barAxes = new wpd.BarAxes();
    const dataset = new wpd.Dataset(1);
    sinon.stub(wpd.pointGroups, "getCurrentTupleIndex").returns(null);
    sinon.stub(wpd.pointGroups, "getCurrentGroupIndex").returns(0);

    const tool = new wpd.DataPointEditTool(barAxes, dataset);

    const ev = _mods();
    tool.onMouseDown(ev, {x: 10, y: 10}, {x: 2, y: 3});
    tool.onMouseUp(ev, {x: 10, y: 10}, {x: 2, y: 3});

    assert.equal(dataset.getCount(), 1, "bar point added");
    assert.deepEqual(dataset.getPixel(0).metadata, {label: "Bar0"}, "label metadata attached");
    assert.deepEqual(dataset.getMetadataKeys(), ["label"], "label metadata key created");

    this.undoManager.undo();
    assert.equal(dataset.getCount(), 0, "undo removes the bar point");
    assert.deepEqual(dataset.getMetadataKeys(), [], "undo restores the metadata-key schema");

    this.undoManager.redo();
    assert.equal(dataset.getCount(), 1, "redo re-adds the bar point");
    assert.deepEqual(dataset.getPixel(0).metadata, {label: "Bar0"}, "redo restores label metadata");
    assert.deepEqual(dataset.getMetadataKeys(), ["label"], "redo restores metadata-key schema");
});

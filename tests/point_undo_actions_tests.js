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

QUnit.module("Undo manager + point actions tests");

QUnit.test("Undo history is bounded at MAX_UNDO; oldest entries drop", function(assert) {
    const um = new wpd.UndoManager();
    const cap = wpd.UndoManager.MAX_UNDO;
    assert.equal(cap, 100, "MAX_UNDO is 100");

    for (let i = 0; i < cap + 5; i++) {
        um.insertAction(new wpd.ReversibleAction());
    }
    assert.equal(um._actions.length, cap, "stack never exceeds MAX_UNDO");

    let undos = 0;
    while (um.canUndo() && undos <= cap + 10) {
        um.undo();
        undos++;
    }
    assert.equal(undos, cap, "at most MAX_UNDO undo steps remain after the cap is hit");
});

QUnit.test("A new action clears the redo stack", function(assert) {
    const um = new wpd.UndoManager();
    um.insertAction(new wpd.ReversibleAction());
    um.insertAction(new wpd.ReversibleAction());
    um.undo();
    assert.true(um.canRedo(), "redo available after an undo");
    um.insertAction(new wpd.ReversibleAction());
    assert.false(um.canRedo(), "a new action discards the redo branch");
});

QUnit.test("updateUI does not throw when the sidebar buttons are absent", function(assert) {
    const um = new wpd.UndoManager();
    assert.equal(document.getElementById("image-editing-undo"), null, "undo button is absent in this harness");
    um.updateUI();
    um.insertAction(new wpd.ReversibleAction());
    assert.ok(true, "updateUI is null-safe");
});

QUnit.test("dropCalibrationActions removes only calibration actions and fixes the index", function(assert) {
    const um = new wpd.UndoManager();
    const make = function(isCal) {
        const a = new wpd.ReversibleAction();
        a.affectsCalibration = isCal;
        return a;
    };
    um.insertAction(make(false)); // dataset
    um.insertAction(make(true));  // calibration
    um.insertAction(make(true));  // calibration
    um.insertAction(make(false)); // dataset
    assert.equal(um._actions.length, 4, "four actions on the stack");

    um.dropCalibrationActions();
    assert.equal(um._actions.length, 2, "both calibration actions removed");
    assert.true(um.canUndo(), "remaining dataset actions still undoable");
    assert.false(um.canRedo(), "no redo branch");

    um.undo();
    um.undo();
    assert.false(um.canUndo(), "exactly the two dataset actions remained");
});

QUnit.test("Dataset move/remove actions round-trip", function(assert) {
    const dataset = new wpd.Dataset(1);
    const i0 = dataset.addPixel(1, 2);

    const move = new wpd.DatasetPointMoveAction(dataset, i0, {x: 1, y: 2}, {x: 8, y: 9});
    move.execute();
    assert.deepEqual({x: dataset.getPixel(0).x, y: dataset.getPixel(0).y}, {x: 8, y: 9}, "move execute applies new position");
    move.undo();
    assert.deepEqual({x: dataset.getPixel(0).x, y: dataset.getPixel(0).y}, {x: 1, y: 2}, "move undo restores old position");

    const payload = {x: 1, y: 2, metadata: undefined};
    const remove = new wpd.DatasetPointRemoveAction(dataset, 0, payload);
    remove.execute();
    assert.equal(dataset.getCount(), 0, "remove execute deletes the point");
    remove.undo();
    assert.equal(dataset.getCount(), 1, "remove undo reinserts the point");
    assert.deepEqual(dataset.getPixel(0), {x: 1, y: 2, metadata: undefined}, "reinserted with payload");
});

QUnit.test("Calibration add/move actions round-trip via snapshots", function(assert) {
    const cal = new wpd.Calibration(2);
    cal.maxPointCount = 4;

    const before = cal.getStateSnapshot();
    cal.addPoint(5, 6, 0, 0);
    const after = cal.getStateSnapshot();
    const add = new wpd.CalibrationPointAddAction(cal, before, after);
    assert.equal(cal.getCount(), 1, "point added");
    add.undo();
    assert.equal(cal.getCount(), 0, "calibration add undo pops the point");
    add.execute();
    assert.equal(cal.getCount(), 1, "calibration add redo restores the point");

    const move = new wpd.CalibrationPointMoveAction(cal, 0, {px: 5, py: 6}, {px: 20, py: 21});
    move.execute();
    assert.deepEqual({px: cal.getPoint(0).px, py: cal.getPoint(0).py}, {px: 20, py: 21}, "calibration move applies");
    move.undo();
    assert.deepEqual({px: cal.getPoint(0).px, py: cal.getPoint(0).py}, {px: 5, py: 6}, "calibration move undo restores");
});

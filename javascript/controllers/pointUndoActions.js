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

var wpd = wpd || {};

// Reversible actions for dataset point picking and axis calibration. Each carries an optional
// afterRestore callback invoked after undo and redo to repaint, refresh counters, point-group UI,
// and calibration-completion state. wpd.ReversibleAction is defined in controllers/actionBase.js
// (loaded earlier). The owning tool mutates the model first, then inserts an already-applied
// action; undo() reverses it and execute() re-applies it on redo.

function _wpdRunCallback(callback) {
    if (typeof callback === "function") {
        callback();
    }
}

function _wpdCloneMetadata(metadata) {
    if (metadata === null || metadata === undefined) {
        return metadata;
    }
    return JSON.parse(JSON.stringify(metadata));
}

// --- Dataset actions (lightweight inverse) ---
// DatasetPointAddAction / DatasetPointRemoveAction are reserved for adds/removes that do NOT change
// the dataset schema (no metadata-key creation/reordering) and are not part of a point group. Bar-
// label adds and grouped-point adds/removes mutate _pixelMetadataKeys and/or _tuples, so the owning
// tool must route those through DatasetPointsBatchAction (full before/after snapshot) instead.
// Point metadata is deep-cloned so later label/value-override edits cannot mutate the undo payload.

wpd.DatasetPointAddAction = class extends wpd.ReversibleAction {
    constructor(dataset, pixelIndex, pixel, afterRestore) {
        super();
        this._dataset = dataset;
        this._pixelIndex = pixelIndex;
        this._pixel = {x: pixel.x, y: pixel.y, metadata: _wpdCloneMetadata(pixel.metadata)};
        this._afterRestore = afterRestore;
    }

    execute() {
        // redo: reinsert the point at its original index
        this._dataset.insertPixel(this._pixelIndex, this._pixel.x, this._pixel.y,
            _wpdCloneMetadata(this._pixel.metadata));
        _wpdRunCallback(this._afterRestore);
    }

    undo() {
        this._dataset.removePixelAtIndex(this._pixelIndex);
        _wpdRunCallback(this._afterRestore);
    }
};

wpd.DatasetPointMoveAction = class extends wpd.ReversibleAction {
    constructor(dataset, pixelIndex, oldPosition, newPosition, afterRestore) {
        super();
        this._dataset = dataset;
        this._pixelIndex = pixelIndex;
        this._oldPosition = {x: oldPosition.x, y: oldPosition.y};
        this._newPosition = {x: newPosition.x, y: newPosition.y};
        this._afterRestore = afterRestore;
    }

    execute() {
        // redo: move to the new position
        this._dataset.setPixelAt(this._pixelIndex, this._newPosition.x, this._newPosition.y);
        _wpdRunCallback(this._afterRestore);
    }

    undo() {
        this._dataset.setPixelAt(this._pixelIndex, this._oldPosition.x, this._oldPosition.y);
        _wpdRunCallback(this._afterRestore);
    }
};

wpd.DatasetPointRemoveAction = class extends wpd.ReversibleAction {
    constructor(dataset, pixelIndex, pixel, afterRestore) {
        super();
        this._dataset = dataset;
        this._pixelIndex = pixelIndex;
        this._pixel = {x: pixel.x, y: pixel.y, metadata: _wpdCloneMetadata(pixel.metadata)};
        this._afterRestore = afterRestore;
    }

    execute() {
        // redo: remove the point again
        this._dataset.removePixelAtIndex(this._pixelIndex);
        _wpdRunCallback(this._afterRestore);
    }

    undo() {
        this._dataset.insertPixel(this._pixelIndex, this._pixel.x, this._pixel.y,
            _wpdCloneMetadata(this._pixel.metadata));
        _wpdRunCallback(this._afterRestore);
    }
};

// Full before/after snapshot action for algorithm runs, clear-all, and any single op with complex
// point-group side effects that lightweight inverse helpers cannot safely reverse.
wpd.DatasetPointsBatchAction = class extends wpd.ReversibleAction {
    constructor(dataset, beforeSnapshot, afterSnapshot, afterRestore) {
        super();
        this._dataset = dataset;
        this._beforeSnapshot = beforeSnapshot;
        this._afterSnapshot = afterSnapshot;
        this._afterRestore = afterRestore;
    }

    execute() {
        // redo: restore the post-operation state
        this._dataset.restoreStateSnapshot(this._afterSnapshot);
        _wpdRunCallback(this._afterRestore);
    }

    undo() {
        this._dataset.restoreStateSnapshot(this._beforeSnapshot);
        _wpdRunCallback(this._afterRestore);
    }
};

// --- Calibration actions ---
// Calibration storage is dense and append-ordered; points are never removed by the user. Add and
// pair-place restore a before/after snapshot (snapshots of a <=5 element calibration are cheap and
// avoid adding a removal API). Move is a lightweight index + old/new pixel pair. recalibrateAxes is
// an optional callback so that, if undo/redo runs after Complete, the axes transform is recomputed
// from the restored calibration.

wpd.CalibrationSnapshotAction = class extends wpd.ReversibleAction {
    constructor(calibration, beforeSnapshot, afterSnapshot, afterRestore, recalibrateAxes) {
        super();
        this._calibration = calibration;
        this._beforeSnapshot = beforeSnapshot;
        this._afterSnapshot = afterSnapshot;
        this._afterRestore = afterRestore;
        this._recalibrateAxes = recalibrateAxes;
    }

    _apply(snapshot) {
        this._calibration.restoreStateSnapshot(snapshot);
        _wpdRunCallback(this._recalibrateAxes);
        _wpdRunCallback(this._afterRestore);
    }

    execute() {
        this._apply(this._afterSnapshot);
    }

    undo() {
        this._apply(this._beforeSnapshot);
    }
};

// Single calibration point placement.
wpd.CalibrationPointAddAction = class extends wpd.CalibrationSnapshotAction {};

// Connected pair placed by a single click-drag-release gesture (two points, one atomic step).
wpd.CalibrationPointsBatchAction = class extends wpd.CalibrationSnapshotAction {};

wpd.CalibrationPointMoveAction = class extends wpd.ReversibleAction {
    constructor(calibration, pointIndex, oldPixel, newPixel, afterRestore, recalibrateAxes) {
        super();
        this._calibration = calibration;
        this._pointIndex = pointIndex;
        this._oldPixel = {px: oldPixel.px, py: oldPixel.py};
        this._newPixel = {px: newPixel.px, py: newPixel.py};
        this._afterRestore = afterRestore;
        this._recalibrateAxes = recalibrateAxes;
    }

    execute() {
        // redo: move to the new pixel position
        this._calibration.changePointPx(this._pointIndex, this._newPixel.px, this._newPixel.py);
        _wpdRunCallback(this._recalibrateAxes);
        _wpdRunCallback(this._afterRestore);
    }

    undo() {
        this._calibration.changePointPx(this._pointIndex, this._oldPixel.px, this._oldPixel.py);
        _wpdRunCallback(this._recalibrateAxes);
        _wpdRunCallback(this._afterRestore);
    }
};

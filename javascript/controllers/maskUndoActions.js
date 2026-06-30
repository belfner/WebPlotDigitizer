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

var wpd = wpd || {};

// Reversible mask edit (one brush stroke, one box, or a clear). The before/after mask states are
// stored RLE-encoded (contiguous index runs compress well) and decoded back into a Set on apply.
// Both undo() and execute() restore the detector mask model AND re-render the mask onto the data
// canvas, because grabMaskInto rebuilds the model by scanning the whole canvas: leaving the canvas
// stale would let the next grab clobber the restored model.
wpd.MaskEditAction = class extends wpd.ReversibleAction {
    constructor(autoDetector, beforeRle, afterRle) {
        super();
        this._autoDetector = autoDetector;
        this._beforeRle = beforeRle;
        this._afterRle = afterRle;
    }

    _apply(rleData) {
        this._autoDetector.setMask(new Set(wpd.rle.decode(rleData)));
        wpd.dataMask.renderMaskToCanvas(this._autoDetector);
    }

    execute() {
        this._apply(this._afterRle);
    }

    undo() {
        this._apply(this._beforeRle);
    }
};

// Encode a mask Set into the RLE form used by MaskEditAction snapshots.
wpd.maskToRle = function(mask) {
    let sorted = Array.from(mask.values()).sort(function(a, b) {
        return a - b;
    });
    return wpd.rle.encode(sorted);
};

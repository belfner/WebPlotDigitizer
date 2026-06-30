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

QUnit.module("Mask undo");

QUnit.test("maskToRle encodes a mask Set into sorted run-length pairs", function(assert) {
    let rle = wpd.maskToRle(new Set([4, 2, 3, 10]));
    assert.deepEqual(rle, [
        [2, 3],
        [10, 1]
    ], "contiguous indices collapse into runs, unsorted input is sorted first");
    assert.deepEqual(wpd.maskToRle(new Set()), [], "empty mask encodes to an empty array");
});

QUnit.test("MaskEditAction restores the detector mask on undo and redo", function(assert) {
    // Stub the canvas render so the action can run without a live graphicsWidget; count calls to
    // confirm the model restore is always paired with a re-render (the invariant that keeps the
    // canvas from clobbering the model on the next grab).
    let originalRender = wpd.dataMask.renderMaskToCanvas;
    let renderCalls = 0;
    wpd.dataMask.renderMaskToCanvas = function() {
        renderCalls++;
    };

    try {
        let detector = {
            mask: new Set([1, 2, 3]),
            setMask: function(m) {
                this.mask = m;
            }
        };

        let beforeRle = wpd.maskToRle(new Set([1, 2, 3]));
        let afterRle = wpd.maskToRle(new Set([7, 8]));
        let action = new wpd.MaskEditAction(detector, beforeRle, afterRle);

        action.execute();
        assert.deepEqual(Array.from(detector.mask).sort((a, b) => a - b), [7, 8],
            "execute applies the after state");

        action.undo();
        assert.deepEqual(Array.from(detector.mask).sort((a, b) => a - b), [1, 2, 3],
            "undo restores the before state");

        assert.strictEqual(renderCalls, 2, "every model restore re-renders the canvas");
    } finally {
        wpd.dataMask.renderMaskToCanvas = originalRender;
    }
});

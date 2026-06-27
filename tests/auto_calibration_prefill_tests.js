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

QUnit.module("Auto calibration prefill tests", {
    beforeEach: function() {
        // Detached DOM inputs that startXYWithPrefill / the XY calibrator read and write.
        this.ids = ['xy-axes-x1', 'xy-axes-x2', 'xy-axes-y1', 'xy-axes-y2',
            'xy-axes-xscale', 'xy-axes-yscale', 'xy-axes-calibrate', 'xy-axes-skip-rotation'
        ];
        this.els = [];
        for (let id of this.ids) {
            let el = document.createElement('input');
            el.id = id;
            document.body.appendChild(el);
            this.els.push(el);
        }

        // Stub the graphics/tree/sidebar side effects so the wizard setup does not touch the canvas.
        sinon.stub(wpd.tree, "selectPath");
        sinon.stub(wpd.sidebar, "show");
        sinon.stub(wpd.graphicsWidget, "setTool");
        sinon.stub(wpd.graphicsWidget, "setRepainter");
        sinon.stub(wpd.graphicsWidget, "forceHandlerRepaint");
        sinon.stub(wpd, "AxesCornersTool");
        sinon.stub(wpd, "AlignmentCornersRepainter");
    },
    afterEach: function() {
        sinon.restore();
        for (let el of this.els) {
            el.remove();
        }
    }
});

function makeFixtureSuggestion() {
    // Deliberately out of canonical order to prove startXYWithPrefill reorders by slot.
    return {
        status: 'ok',
        calibrationPoints: [{
                slot: 'Y2',
                px: {
                    x: 10,
                    y: 20
                },
                value: 50
            },
            {
                slot: 'X1',
                px: {
                    x: 10,
                    y: 200
                },
                value: 0
            },
            {
                slot: 'Y1',
                px: {
                    x: 10,
                    y: 200
                },
                value: 0
            },
            {
                slot: 'X2',
                px: {
                    x: 300,
                    y: 200
                },
                value: 100
            }
        ],
        scales: {
            x: 'linear',
            y: 'log'
        }
    };
}

QUnit.test("startXYWithPrefill adds four points in X1,X2,Y1,Y2 pixel order", function(assert) {
    let addPointSpy = sinon.spy(wpd.Calibration.prototype, "addPoint");

    wpd.alignAxes.startXYWithPrefill(makeFixtureSuggestion());

    assert.strictEqual(addPointSpy.callCount, 4, "exactly four calibration points added");
    assert.deepEqual(addPointSpy.getCall(0).args, [10, 200, 0, 0], "X1 pixel");
    assert.deepEqual(addPointSpy.getCall(1).args, [300, 200, 0, 0], "X2 pixel");
    assert.deepEqual(addPointSpy.getCall(2).args, [10, 200, 0, 0], "Y1 pixel");
    assert.deepEqual(addPointSpy.getCall(3).args, [10, 20, 0, 0], "Y2 pixel");
});

QUnit.test("startXYWithPrefill fills sidebar values and enables Calibrate", function(assert) {
    wpd.alignAxes.startXYWithPrefill(makeFixtureSuggestion());

    assert.strictEqual(document.getElementById('xy-axes-x1').value, '0', "X1 value");
    assert.strictEqual(document.getElementById('xy-axes-x2').value, '100', "X2 value");
    assert.strictEqual(document.getElementById('xy-axes-y1').value, '0', "Y1 value");
    assert.strictEqual(document.getElementById('xy-axes-y2').value, '50', "Y2 value");
    assert.strictEqual(document.getElementById('xy-axes-xscale').value, 'linear', "x scale");
    assert.strictEqual(document.getElementById('xy-axes-yscale').value, 'log', "y scale");
    assert.strictEqual(document.getElementById('xy-axes-calibrate').disabled, false,
        "Calibrate button enabled once all four points are placed");
});

QUnit.test("startXYWithPrefill uses a 2D XY calibration object", function(assert) {
    let calibrationSpy = sinon.spy(wpd, "Calibration");

    wpd.alignAxes.startXYWithPrefill(makeFixtureSuggestion());

    assert.true(calibrationSpy.calledWithNew(), "constructed a Calibration");
    assert.strictEqual(calibrationSpy.getCall(0).args[0], 2, "dimension argument is 2 (XY)");
});

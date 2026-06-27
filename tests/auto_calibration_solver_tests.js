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

QUnit.module("Auto calibration solver tests");

const solver = (typeof wpd !== 'undefined') ? wpd.autoCalibration.calibrationSolver : null;

QUnit.test("linear fit recovers the mapping and rejects an outlier", function(assert) {
    // value = 0.05*t - 2.5 ; t = 50,90,130,170 -> 0,2,4,6 ; plus an outlier tick.
    let pairs = [{
            t: 50,
            value: 0
        },
        {
            t: 90,
            value: 2
        },
        {
            t: 130,
            value: 4
        },
        {
            t: 170,
            value: 6
        },
        {
            t: 210,
            value: 99
        }
    ];
    let fit = solver.solveAxis(pairs);
    assert.strictEqual(fit.status, 'ok', "fit ok");
    assert.strictEqual(fit.scale, 'linear', "linear scale chosen");
    assert.strictEqual(fit.inliers.length, 4, "the outlier is rejected");
    assert.true(Math.abs(solver.valueAt(fit, 50) - 0) < 1e-6, "value at t=50 is 0");
    assert.true(Math.abs(solver.valueAt(fit, 170) - 6) < 1e-6, "value at t=170 is 6");
});

QUnit.test("log fit chosen for log-spaced values", function(assert) {
    let pairs = [{
            t: 50,
            value: 10
        },
        {
            t: 90,
            value: 100
        },
        {
            t: 130,
            value: 1000
        },
        {
            t: 170,
            value: 10000
        }
    ];
    let fit = solver.solveAxis(pairs);
    assert.strictEqual(fit.status, 'ok', "fit ok");
    assert.strictEqual(fit.scale, 'log', "log scale chosen");
    assert.strictEqual(fit.sign, 1, "positive sign");
    assert.true(Math.abs(solver.valueAt(fit, 50) - 10) < 1e-3, "value at t=50 ~ 10");
    assert.true(Math.abs(solver.valueAt(fit, 170) - 10000) < 1e-1, "value at t=170 ~ 10000");
});

QUnit.test("same-sign negative log axis", function(assert) {
    let pairs = [{
            t: 50,
            value: -10
        },
        {
            t: 90,
            value: -100
        },
        {
            t: 130,
            value: -1000
        },
        {
            t: 170,
            value: -10000
        }
    ];
    let fit = solver.solveAxis(pairs);
    assert.strictEqual(fit.status, 'ok', "fit ok");
    assert.strictEqual(fit.scale, 'log', "log scale chosen");
    assert.strictEqual(fit.sign, -1, "negative sign recorded");
    assert.true(Math.abs(solver.valueAt(fit, 50) - (-10)) < 1e-3, "value at t=50 ~ -10");
});

QUnit.test("mixed-sign values cannot form a log axis (falls back to linear or fails)", function(assert) {
    let pairs = [{
            t: 50,
            value: -10
        },
        {
            t: 90,
            value: 10
        }
    ];
    let fit = solver.solveAxis(pairs);
    // Two points always admit a linear fit; the key invariant is that log is not selected.
    assert.notStrictEqual(fit.scale, 'log', "log not selected for mixed signs");
});

QUnit.test("fewer than two pairs fails", function(assert) {
    assert.strictEqual(solver.solveAxis([{
        t: 10,
        value: 1
    }]).status, 'failed', "one pair fails");
    assert.strictEqual(solver.solveAxis([]).status, 'failed', "empty fails");
});

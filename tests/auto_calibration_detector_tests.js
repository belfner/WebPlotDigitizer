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

QUnit.module("Auto calibration detector tests");

// Build a synthetic L-shaped axis stroke set on a width x height grid: a bottom horizontal rule at
// y=yAxis from x=[xAxis..xRight], a left vertical rule at x=xAxis from y=[yTop..yAxis], plus optional
// downward tick marks on the x-axis and leftward tick marks on the y-axis.
function makeAxisStrokes(cfg) {
    const width = cfg.width;
    const set = new Set();
    const add = (x, y) => set.add(y * width + x);

    for (let x = cfg.xAxis; x <= cfg.xRight; x++) add(x, cfg.yAxis);
    for (let y = cfg.yTop; y <= cfg.yAxis; y++) add(cfg.xAxis, y);

    (cfg.xTicks || []).forEach((tx) => {
        for (let d = 1; d <= (cfg.tickLen || 5); d++) add(tx, cfg.yAxis + d);
    });
    (cfg.yTicks || []).forEach((ty) => {
        for (let d = 1; d <= (cfg.tickLen || 5); d++) add(cfg.xAxis - d, ty);
    });

    return {
        set: set,
        width: width,
        height: cfg.height
    };
}

QUnit.test("axisDetector finds the bottom-left axis rules and origin", function(assert) {
    let s = makeAxisStrokes({
        width: 200,
        height: 200,
        xAxis: 30,
        xRight: 180,
        yTop: 20,
        yAxis: 170
    });
    let result = wpd.autoCalibration.axisDetector.detect(s.set, s.width, s.height, {
        roi: {
            xmin: 0,
            ymin: 0,
            xmax: 199,
            ymax: 199
        }
    });

    assert.strictEqual(result.status, 'ok', "detection succeeds");
    assert.strictEqual(result.origin.x, 30, "origin x at the y-axis column");
    assert.strictEqual(result.origin.y, 170, "origin y at the x-axis row");
    assert.strictEqual(result.xAxis.p0.y, 170, "x-axis rule on the bottom row");
    assert.strictEqual(result.yAxis.p0.x, 30, "y-axis rule on the left column");
    assert.strictEqual(result.xAxis.p1.x, 180, "x-axis spans to the right end");
    assert.strictEqual(result.yAxis.p1.y, 20, "y-axis spans up to the top");
});

QUnit.test("axisDetector fails gracefully on an empty stroke set", function(assert) {
    let result = wpd.autoCalibration.axisDetector.detect(new Set(), 100, 100, {});
    assert.strictEqual(result.status, 'failed', "no strokes -> failed");
    assert.strictEqual(result.origin, null, "no origin");
});

QUnit.test("tickDetector recovers tick positions on both axes", function(assert) {
    let s = makeAxisStrokes({
        width: 200,
        height: 200,
        xAxis: 30,
        xRight: 180,
        yTop: 20,
        yAxis: 170,
        xTicks: [50, 90, 130, 170],
        yTicks: [40, 80, 120, 160],
        tickLen: 6
    });
    let axisResult = wpd.autoCalibration.axisDetector.detect(s.set, s.width, s.height, {
        roi: {
            xmin: 0,
            ymin: 0,
            xmax: 199,
            ymax: 199
        }
    });
    let ticks = wpd.autoCalibration.tickDetector.detect(s.set, s.width, s.height, axisResult, {});

    let xs = ticks.x.ticks.map(t => Math.round(t.t)).sort((a, b) => a - b);
    let ys = ticks.y.ticks.map(t => Math.round(t.t)).sort((a, b) => a - b);
    assert.deepEqual(xs, [50, 90, 130, 170], "x tick centroids");
    assert.deepEqual(ys, [40, 80, 120, 160], "y tick centroids");
    assert.strictEqual(ticks.x.pitch, 40, "x tick pitch");
    assert.strictEqual(ticks.y.pitch, 40, "y tick pitch");
});

QUnit.test("mergeClosePeaks collapses doubled ticks but keeps real ones", function(assert) {
    const merge = wpd.autoCalibration.tickDetector.mergeClosePeaks;

    // Real spacing ~50; two ticks split into 8px-apart doubles (62/112/120/162/212).
    let merged = merge([62, 112, 120, 162, 212], 0.5);
    assert.deepEqual(merged, [62, 116, 162, 212], "8px doubles merged to midpoint, real ticks kept");

    // Uniformly spaced ticks are untouched.
    assert.deepEqual(merge([40, 80, 120, 160], 0.5), [40, 80, 120, 160], "uniform ticks unchanged");

    // A run of three near-coincident peaks collapses to one (running midpoint: 100,105->102.5,110->106.25).
    assert.deepEqual(merge([100, 105, 110, 300, 500], 0.5), [106.25, 300, 500], "triple cluster collapses");

    // Fewer than two positions: returned as-is.
    assert.deepEqual(merge([77], 0.5), [77], "single position unchanged");
});

QUnit.test("run builds a suggestion with four points placed on outer ticks", function(assert) {
    let s = makeAxisStrokes({
        width: 200,
        height: 200,
        xAxis: 30,
        xRight: 180,
        yTop: 20,
        yAxis: 170,
        xTicks: [50, 90, 130, 170],
        yTicks: [40, 80, 120, 160],
        tickLen: 6
    });
    let axisResult = wpd.autoCalibration.axisDetector.detect(s.set, s.width, s.height, {
        roi: {
            xmin: 0,
            ymin: 0,
            xmax: 199,
            ymax: 199
        }
    });
    let tickResult = wpd.autoCalibration.tickDetector.detect(s.set, s.width, s.height, axisResult, {});
    let suggestion = wpd.autoCalibration.run.buildSuggestion(axisResult, tickResult);

    assert.strictEqual(suggestion.status, 'ok', "suggestion ok");
    assert.strictEqual(suggestion.calibrationPoints.length, 4, "four points");

    let bySlot = {};
    suggestion.calibrationPoints.forEach(cp => bySlot[cp.slot] = cp);
    // X1 = leftmost x tick, X2 = rightmost x tick (on the x-axis row).
    assert.strictEqual(Math.round(bySlot.X1.px.x), 50, "X1 at first x tick");
    assert.strictEqual(Math.round(bySlot.X2.px.x), 170, "X2 at last x tick");
    assert.strictEqual(bySlot.X1.px.y, 170, "X1 on the x-axis row");
    // Y1 = near origin (largest image-y), Y2 = top (smallest image-y).
    assert.strictEqual(Math.round(bySlot.Y1.px.y), 160, "Y1 at the bottom-most y tick");
    assert.strictEqual(Math.round(bySlot.Y2.px.y), 40, "Y2 at the top-most y tick");
    assert.strictEqual(bySlot.Y1.px.x, 30, "Y1 on the y-axis column");
    assert.strictEqual(bySlot.X1.value, '', "values left blank for manual/OCR fill");
});

QUnit.test("extractStrokes keeps dark masked pixels and drops light ones", function(assert) {
    // 4 pixels: idx0 dark, idx1 light, idx2 dark, idx3 transparent.
    let imageData = {
        width: 4,
        height: 1,
        data: [
            10, 10, 10, 255,
            240, 240, 240, 255,
            20, 20, 20, 255,
            0, 0, 0, 0
        ]
    };
    let mask = new Set([0, 1, 2, 3]);
    let strokes = wpd.autoCalibration.run.extractStrokes(imageData, mask, 128);
    assert.deepEqual(Array.from(strokes).sort((a, b) => a - b), [0, 2],
        "only opaque dark pixels are strokes");
});

QUnit.test("extractStrokes scans the whole image when no mask is drawn", function(assert) {
    // idx0 dark, idx1 light, idx2 dark, idx3 transparent.
    let imageData = {
        width: 4,
        height: 1,
        data: [
            10, 10, 10, 255,
            240, 240, 240, 255,
            20, 20, 20, 255,
            0, 0, 0, 0
        ]
    };
    // An empty mask and a null mask both fall back to scanning the full image for dark pixels.
    assert.deepEqual(
        Array.from(wpd.autoCalibration.run.extractStrokes(imageData, new Set(), 128)).sort((a, b) => a - b),
        [0, 2], "empty mask -> full-image dark pixels");
    assert.deepEqual(
        Array.from(wpd.autoCalibration.run.extractStrokes(imageData, null, 128)).sort((a, b) => a - b),
        [0, 2], "null mask -> full-image dark pixels");
});

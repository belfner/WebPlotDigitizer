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

QUnit.module("Auto-calibration bar single-axis");

// Build a review from explicit per-axis tick specs. Each spec is {x, y, value}; value may be a number
// (numeric label) or a string (categorical label, which parseValue treats as unlabeled). Axis rules
// are placed so x-ticks share the bottom rule and y-ticks share the left rule.
function makeBarReview(xTickSpecs, yTickSpecs) {
    const toTicks = (specs) => specs.map((s) => ({
        t: 0,
        px: {
            x: s.x,
            y: s.y
        },
        value: s.value
    }));
    const suggestion = {
        status: 'ok',
        scales: {
            x: 'linear',
            y: 'linear'
        },
        axisResult: {
            status: 'ok',
            xAxis: {
                p0: {
                    x: 100,
                    y: 300
                },
                p1: {
                    x: 500,
                    y: 300
                }
            },
            yAxis: {
                p0: {
                    x: 100,
                    y: 300
                },
                p1: {
                    x: 100,
                    y: 50
                }
            }
        },
        tickResult: {
            x: {
                ticks: toTicks(xTickSpecs)
            },
            y: {
                ticks: toTicks(yTickSpecs)
            }
        }
    };
    return new wpd.AutoCalibrationReview(suggestion);
}

QUnit.test("inferValueAxis: numeric axis wins, ties favor y", function(assert) {
    // Vertical bars: y numeric (values), x categorical strings.
    let vReview = makeBarReview(
        [{ x: 150, y: 300, value: "Apr" }, { x: 250, y: 300, value: "May" }, { x: 350, y: 300, value: "Jun" }],
        [{ x: 100, y: 300, value: 0 }, { x: 100, y: 200, value: 50 }, { x: 100, y: 100, value: 100 }]
    );
    assert.equal(wpd.autoCalibration.inferValueAxis(vReview), 'y', "vertical bars -> value axis y");

    // Horizontal bars: x numeric, y categorical.
    let hReview = makeBarReview(
        [{ x: 100, y: 300, value: 0 }, { x: 300, y: 300, value: 50 }, { x: 500, y: 300, value: 100 }],
        [{ x: 100, y: 120, value: "A" }, { x: 100, y: 200, value: "B" }, { x: 100, y: 280, value: "C" }]
    );
    assert.equal(wpd.autoCalibration.inferValueAxis(hReview), 'x', "horizontal bars -> value axis x");

    // Equal numeric counts on both axes -> tie favors y.
    let tieReview = makeBarReview(
        [{ x: 100, y: 300, value: 1 }, { x: 300, y: 300, value: 2 }],
        [{ x: 100, y: 200, value: 10 }, { x: 100, y: 100, value: 20 }]
    );
    assert.equal(wpd.autoCalibration.inferValueAxis(tieReview), 'y', "tie -> y");
});

QUnit.test("reviewFitStatusBar counts only the value axis", function(assert) {
    let review = makeBarReview(
        [{ x: 150, y: 300, value: "Apr" }, { x: 250, y: 300, value: "May" }],
        [{ x: 100, y: 300, value: 0 }, { x: 100, y: 200, value: 50 }, { x: 100, y: 100, value: 100 }]
    );
    let status = wpd.autoCalibration.reviewFitStatusBar(review, 'y');
    assert.equal(status.count, 3, "three labeled y ticks");
    assert.ok(status.ready, "ready with >=2 on value axis");

    // The categorical x axis is not numerically labeled, so as a value axis it is not ready.
    let xStatus = wpd.autoCalibration.reviewFitStatusBar(review, 'x');
    assert.equal(xStatus.count, 0, "no numeric x labels");
    assert.notOk(xStatus.ready, "x not ready as value axis");
});

QUnit.test("buildBarSuggestionFromReview (vertical, value=y): P1 lowest value, P2 highest", function(assert) {
    // value = 300 - y : (y=300,v=0)(y=200,v=100)(y=100,v=200)
    let review = makeBarReview(
        [{ x: 150, y: 300, value: "Apr" }, { x: 250, y: 300, value: "May" }],
        [{ x: 100, y: 300, value: 0 }, { x: 100, y: 200, value: 100 }, { x: 100, y: 100, value: 200 }]
    );
    let suggestion = wpd.autoCalibration.buildBarSuggestionFromReview(review, 'y');

    assert.equal(suggestion.status, 'ok', "status ok");
    assert.equal(suggestion.calibrationPoints.length, 2, "two calibration points");
    assert.equal(suggestion.rotated, false, "rotated stays false");
    assert.equal(suggestion.scale, 'linear', "linear scale");

    let bySlot = {};
    suggestion.calibrationPoints.forEach((cp) => {
        bySlot[cp.slot] = cp;
    });
    assert.ok(Math.abs(bySlot['P1'].value - 0) < 1e-6, "P1 carries lowest value 0");
    assert.ok(Math.abs(bySlot['P2'].value - 200) < 1e-6, "P2 carries highest value 200");
    assert.ok(Math.abs(bySlot['P1'].px.y - 300) < 1e-6, "P1 pixel at y=300 via fit");
    assert.ok(Math.abs(bySlot['P2'].px.y - 100) < 1e-6, "P2 pixel at y=100 via fit");
    assert.equal(bySlot['P1'].px.x, 100, "P1 stays on the y-axis rule");
});

QUnit.test("buildBarSuggestionFromReview orders by VALUE, not pixel coordinate", function(assert) {
    // Value decreases as x increases: (x=100,v=50)(x=200,v=30)(x=300,v=10). P1 must be the value=10
    // end (x=300), P2 the value=50 end (x=100) -- ordered by value, not by ascending x.
    let review = makeBarReview(
        [{ x: 100, y: 300, value: 50 }, { x: 200, y: 300, value: 30 }, { x: 300, y: 300, value: 10 }],
        [{ x: 100, y: 250, value: "A" }, { x: 100, y: 200, value: "B" }]
    );
    let suggestion = wpd.autoCalibration.buildBarSuggestionFromReview(review, 'x');

    let bySlot = {};
    suggestion.calibrationPoints.forEach((cp) => {
        bySlot[cp.slot] = cp;
    });
    assert.ok(Math.abs(bySlot['P1'].value - 10) < 1e-6, "P1 = lowest value 10");
    assert.ok(Math.abs(bySlot['P2'].value - 50) < 1e-6, "P2 = highest value 50");
    assert.ok(Math.abs(bySlot['P1'].px.x - 300) < 1e-6, "P1 pixel at the value=10 end (x=300)");
    assert.ok(Math.abs(bySlot['P2'].px.x - 100) < 1e-6, "P2 pixel at the value=50 end (x=100)");
    assert.equal(bySlot['P1'].px.y, 300, "P1 stays on the x-axis rule");
});

QUnit.test("buildBarSuggestionFromReview returns partial with fewer than two labeled value ticks", function(assert) {
    let review = makeBarReview(
        [{ x: 150, y: 300, value: "Apr" }, { x: 250, y: 300, value: "May" }],
        [{ x: 100, y: 300, value: 0 }, { x: 100, y: 200, value: "" }, { x: 100, y: 100, value: "" }]
    );
    let suggestion = wpd.autoCalibration.buildBarSuggestionFromReview(review, 'y');
    assert.equal(suggestion.status, 'partial', "partial without two labeled value ticks");
    assert.equal(suggestion.calibrationPoints.length, 0, "no calibration points");
});

QUnit.test("buildBarSuggestionFromReview keeps a RANSAC-rejected extreme outlier out of P1/P2", function(assert) {
    // value = 300 - y for four clean ticks; the fifth (y=100) is mislabeled 99999 and is the most
    // extreme value, but RANSAC rejects it, so P2 must be the clean value=150 end, not the outlier.
    let review = makeBarReview(
        [{ x: 150, y: 300, value: "Apr" }, { x: 250, y: 300, value: "May" }],
        [
            { x: 100, y: 300, value: 0 },
            { x: 100, y: 250, value: 50 },
            { x: 100, y: 200, value: 100 },
            { x: 100, y: 150, value: 150 },
            { x: 100, y: 100, value: 99999 }
        ]
    );
    let suggestion = wpd.autoCalibration.buildBarSuggestionFromReview(review, 'y');
    assert.equal(suggestion.status, 'ok', "status ok");

    let bySlot = {};
    suggestion.calibrationPoints.forEach((cp) => {
        bySlot[cp.slot] = cp;
    });
    assert.ok(Math.abs(bySlot['P1'].value - 0) < 1e-6, "P1 lowest clean value 0");
    assert.ok(Math.abs(bySlot['P2'].value - 150) < 1e-6, "P2 is the clean value=150 end, not 99999");
    assert.ok(Math.abs(bySlot['P2'].px.y - 150) < 1e-6, "P2 pixel at the clean tick (y=150)");
});

QUnit.test("buildBarSuggestionFromReview downgrades a negative log axis to linear", function(assert) {
    // All-negative decade labels fit a sign=-1 log model, but BarAxes cannot log-scale negatives, so
    // the suggestion must report linear scale (never NaN at calibration time).
    let review = makeBarReview(
        [{ x: 150, y: 300, value: "Apr" }, { x: 250, y: 300, value: "May" }],
        [{ x: 100, y: 300, value: -1 }, { x: 100, y: 200, value: -10 }, { x: 100, y: 100, value: -100 }]
    );
    let suggestion = wpd.autoCalibration.buildBarSuggestionFromReview(review, 'y');
    assert.equal(suggestion.status, 'ok', "status ok");
    assert.equal(suggestion.scale, 'linear', "negative log axis downgraded to linear");

    let bySlot = {};
    suggestion.calibrationPoints.forEach((cp) => {
        bySlot[cp.slot] = cp;
    });
    assert.ok(Math.abs(bySlot['P1'].value - (-100)) < 1e-6, "P1 lowest value -100");
    assert.ok(Math.abs(bySlot['P2'].value - (-1)) < 1e-6, "P2 highest value -1");
    assert.ok(isFinite(bySlot['P1'].px.y) && isFinite(bySlot['P2'].px.y), "finite pixel placement");
});

QUnit.test("buildBarSuggestionFromReview picks up a log value axis", function(assert) {
    // Decade ticks on y: (y=300,v=1)(y=200,v=10)(y=100,v=100) -> log fit.
    let review = makeBarReview(
        [{ x: 150, y: 300, value: "Apr" }, { x: 250, y: 300, value: "May" }],
        [{ x: 100, y: 300, value: 1 }, { x: 100, y: 200, value: 10 }, { x: 100, y: 100, value: 100 }]
    );
    let suggestion = wpd.autoCalibration.buildBarSuggestionFromReview(review, 'y');
    assert.equal(suggestion.status, 'ok', "status ok");
    assert.equal(suggestion.scale, 'log', "detects log value axis");

    let bySlot = {};
    suggestion.calibrationPoints.forEach((cp) => {
        bySlot[cp.slot] = cp;
    });
    assert.ok(Math.abs(bySlot['P1'].value - 1) < 1e-6, "P1 lowest value 1");
    assert.ok(Math.abs(bySlot['P2'].value - 100) < 1e-6, "P2 highest value 100");
});

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

QUnit.module("Auto-calibration review model");

// A detection-like suggestion: x-axis horizontal at y=300 (x in 100..500), y-axis vertical at x=100
// (y in 50..300). x-ticks every 100px with values 0,10,20,30,40 (z = 0.1*x - 10); y-ticks at
// y=300,200,100 with values 0,5,10 (z = -0.05*y + 15).
function makeReviewSuggestion() {
    return {
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
                pitch: 100,
                ticks: [{
                        t: 100,
                        px: {
                            x: 100,
                            y: 300
                        },
                        value: 0
                    },
                    {
                        t: 200,
                        px: {
                            x: 200,
                            y: 300
                        },
                        value: 10
                    },
                    {
                        t: 300,
                        px: {
                            x: 300,
                            y: 300
                        },
                        value: 20
                    },
                    {
                        t: 400,
                        px: {
                            x: 400,
                            y: 300
                        },
                        value: 30
                    },
                    {
                        t: 500,
                        px: {
                            x: 500,
                            y: 300
                        },
                        value: 40
                    }
                ]
            },
            y: {
                pitch: 100,
                ticks: [{
                        t: 300,
                        px: {
                            x: 100,
                            y: 300
                        },
                        value: 0
                    },
                    {
                        t: 200,
                        px: {
                            x: 100,
                            y: 200
                        },
                        value: 5
                    },
                    {
                        t: 100,
                        px: {
                            x: 100,
                            y: 100
                        },
                        value: 10
                    }
                ]
            }
        }
    };
}

QUnit.test("Constructs from suggestion: ticks copied, values preserved, sorted along axis", function(assert) {
    let review = new wpd.AutoCalibrationReview(makeReviewSuggestion());

    assert.equal(review.getTicks('x').length, 5, "five x ticks");
    assert.equal(review.getTicks('y').length, 3, "three y ticks");
    assert.equal(review.xAxisY(), 300, "x-axis rule y");
    assert.equal(review.yAxisX(), 100, "y-axis rule x");

    // x sorted by px.x ascending
    let xs = review.getTicks('x').map(t => t.px.x);
    assert.deepEqual(xs, [100, 200, 300, 400, 500], "x ticks sorted by x");
    // y sorted by px.y ascending
    let ys = review.getTicks('y').map(t => t.px.y);
    assert.deepEqual(ys, [100, 200, 300], "y ticks sorted by y");

    assert.equal(review.getTicks('x')[0].value, "0", "value coerced to string");

    // editing the review must not mutate the source suggestion
    let src = makeReviewSuggestion();
    let r2 = new wpd.AutoCalibrationReview(src);
    r2.setValue('x', 0, "999");
    assert.equal(src.tickResult.x.ticks[0].value, 0, "source suggestion untouched");
});

QUnit.test("nearestAxis picks the closer rule", function(assert) {
    let review = new wpd.AutoCalibrationReview(makeReviewSuggestion());
    // near the bottom rule (y close to 300)
    assert.equal(review.nearestAxis(300, 295), 'x', "near x-axis -> x");
    // near the left rule (x close to 100)
    assert.equal(review.nearestAxis(105, 150), 'y', "near y-axis -> y");
});

QUnit.test("addTick snaps to its axis, sorts, and selects", function(assert) {
    let review = new wpd.AutoCalibrationReview(makeReviewSuggestion());

    // add an x-tick between 200 and 300 at an off-rule y; it snaps onto y=300 and lands at index 2
    let sel = review.addTick('x', 250, 280);
    assert.equal(review.getTicks('x').length, 6, "x tick added");
    assert.equal(review.getTicks('x')[2].px.y, 300, "snapped onto x-axis rule");
    assert.equal(review.getTicks('x')[2].px.x, 250, "kept x position");
    assert.deepEqual(sel, {
        axis: 'x',
        index: 2
    }, "selection points at the new tick");

    // add a y-tick at an off-rule x; snaps onto x=100
    review.addTick('y', 140, 250);
    let added = review.getTicks('y').filter(t => t.px.y === 250)[0];
    assert.equal(added.px.x, 100, "snapped onto y-axis rule");
});

QUnit.test("moveTick snaps, removeTick deletes, findNearest hit-tests both axes", function(assert) {
    let review = new wpd.AutoCalibrationReview(makeReviewSuggestion());

    review.moveTick('x', 0, 130, 250); // off-rule y
    assert.equal(review.getTicks('x')[0].px.x, 130, "moved x");
    assert.equal(review.getTicks('x')[0].px.y, 300, "stayed on rule");

    let hit = review.findNearest(200, 300, 12.5);
    assert.deepEqual({
        axis: hit.axis,
        index: hit.index
    }, {
        axis: 'x',
        index: 1
    }, "finds x tick at 200");

    let miss = review.findNearest(250, 50, 12.5);
    assert.equal(miss, null, "no tick within threshold");

    review.removeTick('x', 1);
    assert.equal(review.getTicks('x').length, 4, "tick removed");
    assert.equal(review.selected, null, "selection cleared after remove");
});

QUnit.module("Auto-calibration buildSuggestionFromReview");

QUnit.test("parseReviewValue handles plain, scientific, and blank", function(assert) {
    assert.equal(wpd.autoCalibration.parseReviewValue("12.5"), 12.5, "plain float");
    assert.equal(wpd.autoCalibration.parseReviewValue(""), null, "blank -> null");
    assert.equal(wpd.autoCalibration.parseReviewValue("   "), null, "whitespace -> null");
    assert.equal(wpd.autoCalibration.parseReviewValue("abc"), null, "non-numeric -> null");
});

QUnit.test("reviewFitStatus counts labeled ticks per axis", function(assert) {
    let review = new wpd.AutoCalibrationReview(makeReviewSuggestion());
    let status = wpd.autoCalibration.reviewFitStatus(review);
    assert.equal(status.x.count, 5, "x labeled count");
    assert.equal(status.y.count, 3, "y labeled count");
    assert.ok(status.ready, "ready with >=2 per axis");

    // blank all but one x value -> not enough on x
    for (let i = 1; i < review.getTicks('x').length; i++) {
        review.setValue('x', i, "");
    }
    let status2 = wpd.autoCalibration.reviewFitStatus(review);
    assert.equal(status2.x.count, 1, "only one labeled x tick");
    assert.notOk(status2.ready, "not ready with <2 labeled on an axis");
});

QUnit.test("builds 4 corner points carrying clean tick values placed on the fitted model", function(assert) {
    let review = new wpd.AutoCalibrationReview(makeReviewSuggestion());
    let suggestion = wpd.autoCalibration.buildSuggestionFromReview(review);

    assert.equal(suggestion.status, 'ok', "status ok");
    assert.equal(suggestion.calibrationPoints.length, 4, "four corner points");

    let bySlot = {};
    suggestion.calibrationPoints.forEach(cp => {
        bySlot[cp.slot] = cp;
    });

    // X1 = left end (x=100, value 0), X2 = right end (x=500, value 40)
    assert.equal(bySlot['X1'].px.x, 100, "X1 on left tick");
    assert.ok(Math.abs((bySlot['X1'].value) - (0)) < 1e-6, "X1 value 0");
    assert.equal(bySlot['X2'].px.x, 500, "X2 on right tick");
    assert.ok(Math.abs((bySlot['X2'].value) - (40)) < 1e-6, "X2 value 40");

    // Y1 = bottom (origin) end (y=300, value 0), Y2 = top end (y=100, value 10)
    assert.equal(bySlot['Y1'].px.y, 300, "Y1 on bottom tick");
    assert.ok(Math.abs((bySlot['Y1'].value) - (0)) < 1e-6, "Y1 value 0");
    assert.equal(bySlot['Y2'].px.y, 100, "Y2 on top tick");
    assert.ok(Math.abs((bySlot['Y2'].value) - (10)) < 1e-6, "Y2 value 10");

    assert.equal(suggestion.scales.x, 'linear', "x scale linear");
    assert.equal(suggestion.scales.y, 'linear', "y scale linear");
});

QUnit.test("endpoints stay clean when an interior tick is mislabeled", function(assert) {
    let review = new wpd.AutoCalibrationReview(makeReviewSuggestion());
    // Corrupt one interior label; the outer corners carry the outermost labels and the RANSAC fit
    // rejects the outlier, so the endpoints stay true.
    review.setValue('x', 2, "999"); // x=300 should be 20
    let suggestion = wpd.autoCalibration.buildSuggestionFromReview(review);

    let bySlot = {};
    suggestion.calibrationPoints.forEach(cp => {
        bySlot[cp.slot] = cp;
    });
    assert.ok(Math.abs((bySlot['X1'].value) - (0)) < 1e-3, "X1 still ~0 despite outlier");
    assert.ok(Math.abs((bySlot['X2'].value) - (40)) < 1e-3, "X2 still ~40 despite outlier");
});

QUnit.test("returns partial when an axis lacks two labeled ticks", function(assert) {
    let review = new wpd.AutoCalibrationReview(makeReviewSuggestion());
    for (let i = 0; i < review.getTicks('y').length; i++) {
        review.setValue('y', i, ""); // blank all y values
    }
    let suggestion = wpd.autoCalibration.buildSuggestionFromReview(review);
    assert.equal(suggestion.status, 'partial', "partial without enough y labels");
    assert.equal(suggestion.calibrationPoints.length, 0, "no corner points");
});

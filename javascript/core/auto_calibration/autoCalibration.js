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
wpd.autoCalibration = wpd.autoCalibration || {};

// Orchestrates the XY auto-calibration pipeline: extract axis strokes from the masked region, detect
// the axis rules and tick marks, and produce an AutoCalibrationSuggestion that prefills the XY wizard
// with the four calibration points placed on detected ticks. Tick values are left for the user to
// type (manual-value assist); the OCR layer fills them automatically once it lands.
wpd.autoCalibration.config = {
    ocrWorkerUrl: "javascript/workers/autoCalibrationOcrWorker.js",
    tesseractAssetBaseUrl: "vendor/tesseract-wasm/",
    // Set true at runtime (wpd.autoCalibration.config.debugOcr = true) to log each tick-label crop's
    // per-page-seg-mode OCR text + confidence to the console on the next Detect.
    debugOcr: false
};

wpd.autoCalibration.run = (function() {

    // Bounding box of a Set of pixel indices, in image coordinates.
    function _bboxOfSet(pixelSet, width, height) {
        let xmin = width - 1;
        let ymin = height - 1;
        let xmax = 0;
        let ymax = 0;
        let any = false;
        for (let idx of pixelSet) {
            let x = idx % width;
            let y = (idx - x) / width;
            if (x < xmin) xmin = x;
            if (x > xmax) xmax = x;
            if (y < ymin) ymin = y;
            if (y > ymax) ymax = y;
            any = true;
        }
        if (!any) {
            return {
                xmin: 0,
                ymin: 0,
                xmax: width - 1,
                ymax: height - 1
            };
        }
        return {
            xmin: xmin,
            ymin: ymin,
            xmax: xmax,
            ymax: ymax
        };
    }

    // Dark-pixel strokes inside the mask, by luminance threshold. Used when the user has not opted
    // into color filtering (the mask alone is a filled region and would carry no line structure). When
    // no mask was drawn the whole image is the region, so the user can run detection straight away.
    function extractStrokes(imageData, mask, threshold) {
        const t = threshold != null ? threshold : 128;
        const strokes = new Set();
        const isDark = (idx) => {
            let a = imageData.data[idx * 4 + 3];
            if (a === 0) {
                return false; // transparent -> treated as background (white)
            }
            let r = imageData.data[idx * 4];
            let g = imageData.data[idx * 4 + 1];
            let b = imageData.data[idx * 4 + 2];
            // Rec. 601 luma
            return 0.299 * r + 0.587 * g + 0.114 * b < t;
        };
        if (mask == null || mask.size === 0) {
            const total = (imageData.data.length / 4) | 0;
            for (let idx = 0; idx < total; idx++) {
                if (isDark(idx)) {
                    strokes.add(idx);
                }
            }
        } else {
            for (let idx of mask) {
                if (isDark(idx)) {
                    strokes.add(idx);
                }
            }
        }
        return strokes;
    }

    function _outerPoints(ticks, fallbackA, fallbackB, byMaxFirst) {
        // Return [near, far] tick px positions. With >= 2 ticks use the extremes; otherwise fall back
        // to the provided axis endpoints. byMaxFirst orders the Y axis so the near (origin) end is the
        // larger image-y (lower on screen).
        if (ticks.length >= 2) {
            let sorted = ticks.slice().sort((p, q) => p.t - q.t);
            let first = sorted[0].px;
            let last = sorted[sorted.length - 1].px;
            return byMaxFirst ? [last, first] : [first, last];
        }
        return [fallbackA, fallbackB];
    }

    // Snap a calibration point's pixel onto the nearest detected tick mark along its axis, so the
    // endpoint lands on a tick (a whole-number gridline) instead of between ticks or at the bare axis
    // end. A no-op when the point already sits on the chosen tick or no ticks were detected.
    function _snapToNearestTick(px, ticks, axisKey) {
        if (ticks == null || ticks.length === 0) {
            return px;
        }
        const coord = axisKey === 'x' ? px.x : px.y;
        let best = ticks[0];
        let bestDist = Math.abs(ticks[0].t - coord);
        for (let i = 1; i < ticks.length; i++) {
            let dist = Math.abs(ticks[i].t - coord);
            if (dist < bestDist) {
                bestDist = dist;
                best = ticks[i];
            }
        }
        return best.px;
    }

    function buildSuggestion(axisResult, tickResult) {
        if (axisResult == null || axisResult.status !== 'ok') {
            return {
                status: 'failed',
                confidence: 0,
                calibrationPoints: [],
                scales: {
                    x: null,
                    y: null
                },
                overlay: {
                    axisLines: [],
                    ticks: []
                },
                axisResult: axisResult,
                tickResult: tickResult
            };
        }

        // X near = origin end of the x-axis; X far = the far end. Y near = origin (bottom); Y far = top.
        const xNearFallback = {
            x: axisResult.xAxis.p0.x,
            y: axisResult.xAxis.p0.y
        };
        const xFarFallback = {
            x: axisResult.xAxis.p1.x,
            y: axisResult.xAxis.p1.y
        };
        const yNearFallback = {
            x: axisResult.yAxis.p0.x,
            y: axisResult.yAxis.p0.y
        };
        const yFarFallback = {
            x: axisResult.yAxis.p1.x,
            y: axisResult.yAxis.p1.y
        };

        // Place the endpoints on the outermost ticks, then snap each onto the nearest tick mark so the
        // calibration points land exactly on tick gridlines (whole-number positions) rather than
        // between ticks or at the bare axis end.
        const xPts = _outerPoints(tickResult.x.ticks, xNearFallback, xFarFallback, false)
            .map((px) => _snapToNearestTick(px, tickResult.x.ticks, 'x'));
        const yPts = _outerPoints(tickResult.y.ticks, yNearFallback, yFarFallback, true)
            .map((px) => _snapToNearestTick(px, tickResult.y.ticks, 'y'));

        const calibrationPoints = [{
                slot: 'X1',
                px: xPts[0],
                value: ''
            },
            {
                slot: 'X2',
                px: xPts[1],
                value: ''
            },
            {
                slot: 'Y1',
                px: yPts[0],
                value: ''
            },
            {
                slot: 'Y2',
                px: yPts[1],
                value: ''
            }
        ];

        return {
            status: 'ok',
            confidence: axisResult.confidence,
            calibrationPoints: calibrationPoints,
            scales: {
                x: 'linear',
                y: 'linear'
            },
            overlay: {
                axisLines: [axisResult.xAxis, axisResult.yAxis],
                ticks: tickResult.x.ticks.concat(tickResult.y.ticks)
            },
            axisResult: axisResult,
            tickResult: tickResult
        };
    }

    function _roundValue(v) {
        if (!isFinite(v)) {
            return '';
        }
        return Math.round(v * 1e6) / 1e6;
    }

    // Fit one axis from its recognized (tick, value) pairs and write the fitted values onto that
    // axis's two calibration points, plus the detected scale. Pixels stay on the detected ticks; only
    // the values and scale come from OCR + the robust fit.
    function _applyAxisFit(suggestion, axisKey, pairs, slots) {
        if (pairs == null || pairs.length < 2) {
            return;
        }
        const fit = wpd.autoCalibration.calibrationSolver.solveAxis(pairs);
        if (fit.status !== 'ok') {
            return;
        }
        suggestion.scales[axisKey] = fit.scale;
        suggestion.calibrationPoints.forEach((cp) => {
            if (slots.indexOf(cp.slot) >= 0) {
                let t = axisKey === 'x' ? cp.px.x : cp.px.y;
                cp.value = _roundValue(wpd.autoCalibration.calibrationSolver.valueAt(fit, t));
            }
        });
        suggestion.axisFits = suggestion.axisFits || {};
        suggestion.axisFits[axisKey] = fit;
    }

    // Write each recognized value onto the tick it came from (matched by nearest tick coordinate), so
    // the editable review can show OCR values per tick. Ties each axis's pairs to that axis's ticks.
    function _attachOcrToTicks(tickResult, values) {
        const attach = function(ticks, pairs) {
            (pairs || []).forEach((pair) => {
                let best = -1;
                let bestDist = Infinity;
                for (let i = 0; i < ticks.length; i++) {
                    let d = Math.abs(ticks[i].t - pair.t);
                    if (d < bestDist) {
                        bestDist = d;
                        best = i;
                    }
                }
                if (best >= 0) {
                    ticks[best].value = pair.value;
                    ticks[best].ocrConfidence = pair.confidence;
                }
            });
        };
        attach(tickResult.x.ticks, values.x);
        attach(tickResult.y.ticks, values.y);
    }

    function _fillValuesWithOcr(suggestion, imageData, axisResult, tickResult, opts) {
        return wpd.autoCalibration.numericOcr
            .recognizeTickValues(imageData, axisResult, tickResult, opts)
            .then((values) => {
                _attachOcrToTicks(tickResult, values);
                _applyAxisFit(suggestion, 'x', values.x, ['X1', 'X2']);
                _applyAxisFit(suggestion, 'y', values.y, ['Y1', 'Y2']);
            });
    }

    function run(autoDetector, imageData, options) {
        const opts = options || {};
        const width = autoDetector.imageWidth || imageData.width;
        const height = autoDetector.imageHeight || imageData.height;

        let strokes;
        if (autoDetector.useColorFilter === true) {
            // User opted into color: the color-filtered foreground IS the stroke set, even when it is
            // empty (an empty result must surface as "no strokes detected", not silently fall back to
            // dark-pixel extraction, so the chosen data path is honored strictly).
            strokes = autoDetector.binaryData != null ? autoDetector.binaryData : new Set();
        } else {
            strokes = extractStrokes(imageData, autoDetector.mask, opts.luminanceThreshold);
        }

        const roi = _bboxOfSet(autoDetector.mask, width, height);
        const axisResult = wpd.autoCalibration.axisDetector.detect(strokes, width, height, {
            roi: roi
        });
        const tickResult = wpd.autoCalibration.tickDetector.detect(strokes, width, height, axisResult, {});
        const suggestion = buildSuggestion(axisResult, tickResult);

        // Optional OCR pass: read tick labels and fill in the values + scales. Any failure (missing
        // assets, unsupported runtime, no numeric labels) degrades to manual-value assist with the
        // points still placed on detected ticks.
        const ocrEnabled = opts.ocr !== false &&
            wpd.autoCalibration.numericOcr != null &&
            imageData != null && imageData.data != null;
        if (suggestion.status === 'ok' && ocrEnabled) {
            // Promise.resolve().then(...) so a SYNCHRONOUS throw from crop preparation or
            // new Worker(...) is normalized into a rejection and degrades to manual-value assist,
            // rather than escaping run() before the catch is attached.
            return Promise.resolve()
                .then(() => _fillValuesWithOcr(suggestion, imageData, axisResult, tickResult, opts))
                .then(() => suggestion)
                .catch((err) => {
                    suggestion.warnings = (suggestion.warnings || []).concat(['ocr-failed']);
                    suggestion.ocrError = (err && err.message) ? err.message : String(err);
                    return suggestion;
                });
        }
        return Promise.resolve(suggestion);
    }

    // Expose helpers for unit tests.
    run.extractStrokes = extractStrokes;
    run.buildSuggestion = buildSuggestion;

    return run;
})();

// Convert an edited AutoCalibrationReview into a suggestion the XY wizard can consume, and report the
// live fit readiness used to gate Apply. The robust per-axis fit is solved over every labeled tick the
// user kept, and the four X1/X2/Y1/Y2 corner points are placed on the outermost ticks with values read
// from that fit. This is the same reduce-N-ticks-to-4-corners path the detection pipeline uses, driven
// from the edited tick set instead of the raw detection.
(function() {

    // Parse a user-entered or OCR'd label into a number, trying the numeric grammar first (handles
    // scientific / times-ten / unicode forms) and falling back to a plain float. Returns null when the
    // text is empty or not numeric, so blank ticks are simply excluded from the fit.
    function parseValue(text) {
        if (text == null) {
            return null;
        }
        const str = String(text).trim();
        if (str === '') {
            return null;
        }
        if (wpd.autoCalibration.numericGrammar != null) {
            const candidates = wpd.autoCalibration.numericGrammar.parse(str);
            if (candidates.length > 0 && isFinite(candidates[0].value)) {
                return candidates[0].value;
            }
        }
        const f = parseFloat(str);
        return isFinite(f) ? f : null;
    }

    function _round(v) {
        if (!isFinite(v)) {
            return '';
        }
        return Math.round(v * 1e6) / 1e6;
    }

    // For one axis, collect the labeled (tick, value) pairs for the fit and the outermost two LABELED
    // ticks (by axis coordinate) that host the calibration corners. The corners must be labeled so each
    // carries a clean data value; unlabeled ticks contribute neither a pair nor a corner. axisKey
    // selects which pixel coordinate is the axis coordinate: x for the x-axis, y for the y-axis.
    function _axisPairsAndCorners(ticks, axisKey) {
        const coord = (px) => (axisKey === 'x' ? px.x : px.y);
        const pairs = [];
        let lo = null;
        let hi = null;
        (ticks || []).forEach((tick) => {
            const v = parseValue(tick.value);
            if (v === null) {
                return;
            }
            const c = coord(tick.px);
            if (lo === null || c < coord(lo.px)) {
                lo = tick;
            }
            if (hi === null || c > coord(hi.px)) {
                hi = tick;
            }
            pairs.push({
                t: c,
                value: v
            });
        });
        return {
            pairs: pairs,
            lo: lo,
            hi: hi
        };
    }

    // Number of labeled ticks per axis and whether each axis (and the whole review) has enough to fit.
    // A robust line fit needs at least two labeled ticks per axis.
    wpd.autoCalibration.reviewFitStatus = function(review) {
        const x = _axisPairsAndCorners(review.getTicks('x'), 'x');
        const y = _axisPairsAndCorners(review.getTicks('y'), 'y');
        return {
            x: {
                count: x.pairs.length,
                ok: x.pairs.length >= 2
            },
            y: {
                count: y.pairs.length,
                ok: y.pairs.length >= 2
            },
            ready: x.pairs.length >= 2 && y.pairs.length >= 2
        };
    };

    wpd.autoCalibration.buildSuggestionFromReview = function(review) {
        const solver = wpd.autoCalibration.calibrationSolver;
        const x = _axisPairsAndCorners(review.getTicks('x'), 'x');
        const y = _axisPairsAndCorners(review.getTicks('y'), 'y');

        const fitX = x.pairs.length >= 2 ? solver.solveAxis(x.pairs) : null;
        const fitY = y.pairs.length >= 2 ? solver.solveAxis(y.pairs) : null;

        if (fitX == null || fitX.status !== 'ok' || fitY == null || fitY.status !== 'ok' ||
            x.lo == null || x.hi == null || y.lo == null || y.hi == null) {
            return {
                status: 'partial',
                calibrationPoints: [],
                scales: {
                    x: null,
                    y: null
                }
            };
        }

        // X1 = left (smaller x) origin end, X2 = right far end. Y1 = bottom (larger image-y) origin
        // end, Y2 = top far end. Each corner keeps the outermost labeled tick's clean data value and is
        // placed where the robust fit puts that value (pixel = inverse fit), so the two corners lie on
        // the least-squares model and the endpoints read whole tick values rather than fit residuals.
        const xLoVal = _round(parseValue(x.lo.value));
        const xHiVal = _round(parseValue(x.hi.value));
        const yLoVal = _round(parseValue(y.lo.value));
        const yHiVal = _round(parseValue(y.hi.value));
        const xLoT = solver.pixelAt(fitX, xLoVal);
        const xHiT = solver.pixelAt(fitX, xHiVal);
        const yLoT = solver.pixelAt(fitY, yLoVal);
        const yHiT = solver.pixelAt(fitY, yHiVal);

        if (xLoT == null || xHiT == null || yLoT == null || yHiT == null) {
            return {
                status: 'partial',
                calibrationPoints: [],
                scales: {
                    x: null,
                    y: null
                }
            };
        }

        const calibrationPoints = [{
                slot: 'X1',
                px: {
                    x: xLoT,
                    y: x.lo.px.y
                },
                value: xLoVal
            },
            {
                slot: 'X2',
                px: {
                    x: xHiT,
                    y: x.hi.px.y
                },
                value: xHiVal
            },
            {
                slot: 'Y1',
                px: {
                    x: y.hi.px.x,
                    y: yHiT
                },
                value: yHiVal
            },
            {
                slot: 'Y2',
                px: {
                    x: y.lo.px.x,
                    y: yLoT
                },
                value: yLoVal
            }
        ];

        return {
            status: 'ok',
            calibrationPoints: calibrationPoints,
            scales: {
                x: fitX.scale,
                y: fitY.scale
            },
            axisFits: {
                x: fitX,
                y: fitY
            }
        };
    };

    // ----- Bar charts: single value-axis variant -----------------------------------------------
    // A bar plot has exactly one numeric value axis (the other axis is categorical). The detection
    // pipeline still finds both axis rules and their ticks, but only the value axis is calibrated. The
    // review restricts editing to that axis; these helpers infer the default value axis, gate Apply,
    // and reduce the labeled value-axis ticks to the two BarAxes calibration points P1/P2.

    // Labeled (axis-coordinate, value, source tick) entries on one axis, in tick-list order.
    function _labeledEntries(ticks, axisKey) {
        const coord = (px) => (axisKey === 'x' ? px.x : px.y);
        const entries = [];
        (ticks || []).forEach((tick) => {
            const v = parseValue(tick.value);
            if (v === null) {
                return;
            }
            entries.push({
                t: coord(tick.px),
                value: v,
                tick: tick
            });
        });
        return entries;
    }

    // Default value axis for a bar review: the axis with more numeric labels. This is a LOOSE signal
    // (parseValue falls back to parseFloat, so numeric-looking categories like years or "1st" count),
    // so it is only a weak default. Ties favor 'y' (vertical bars, value on Y, are the common case).
    // The manual Value-axis switch in the review is authoritative.
    wpd.autoCalibration.inferValueAxis = function(review) {
        const xCount = _labeledEntries(review.getTicks('x'), 'x').length;
        const yCount = _labeledEntries(review.getTicks('y'), 'y').length;
        return xCount > yCount ? 'x' : 'y';
    };

    // Number of labeled ticks on the chosen value axis and whether Apply is ready (a robust line fit
    // needs at least two labeled value-axis ticks). Bar analogue of reviewFitStatus.
    wpd.autoCalibration.reviewFitStatusBar = function(review, valueAxis) {
        const axisKey = valueAxis === 'x' ? 'x' : 'y';
        const count = _labeledEntries(review.getTicks(axisKey), axisKey).length;
        return {
            valueAxis: axisKey,
            count: count,
            ok: count >= 2,
            ready: count >= 2
        };
    };

    // Reduce the labeled value-axis ticks to the two BarAxes calibration points. P1 carries the lowest
    // value, P2 the highest; the points are ORDERED BY VALUE (not by pixel coordinate) because
    // BarAxes.calibrate infers bar orientation/direction from the P1->P2 vector, and BarExtractionAlgo
    // uses that direction to pick which bar edge to measure. Each point's value-axis coordinate is the
    // inverse fit at its clean value (so it lies on the least-squares model); its off-axis coordinate
    // is taken from the source tick so the point sits on the detected axis rule.
    wpd.autoCalibration.buildBarSuggestionFromReview = function(review, valueAxis) {
        const solver = wpd.autoCalibration.calibrationSolver;
        const axisKey = valueAxis === 'x' ? 'x' : 'y';
        const entries = _labeledEntries(review.getTicks(axisKey), axisKey);

        const partial = {
            status: 'partial',
            calibrationPoints: [],
            scale: null,
            rotated: false
        };

        if (entries.length < 2) {
            return partial;
        }

        const pairs = entries.map((e) => ({
            t: e.t,
            value: e.value
        }));
        const fit = solver.solveAxis(pairs);
        if (fit == null || fit.status !== 'ok') {
            return partial;
        }

        // Restrict the P1/P2 candidates to the fit's inliers (matched back by axis coordinate). A
        // RANSAC-rejected OCR outlier with an extreme value must not become an endpoint, since
        // pixelAt would then extrapolate that rejected value into a bad calibration point.
        const inlierTs = {};
        (fit.inliers || []).forEach((pt) => {
            inlierTs[pt.t] = true;
        });
        const inlierEntries = entries.filter((e) => inlierTs[e.t] === true);
        if (inlierEntries.length < 2) {
            return partial;
        }

        let loEntry = inlierEntries[0];
        let hiEntry = inlierEntries[0];
        inlierEntries.forEach((e) => {
            if (e.value < loEntry.value) {
                loEntry = e;
            }
            if (e.value > hiEntry.value) {
                hiEntry = e;
            }
        });
        if (loEntry.value === hiEntry.value) {
            return partial; // need two distinct inlier values to define the axis
        }

        const loVal = _round(loEntry.value);
        const hiVal = _round(hiEntry.value);
        const loT = solver.pixelAt(fit, loVal);
        const hiT = solver.pixelAt(fit, hiVal);
        if (loT == null || hiT == null) {
            return partial;
        }

        // BarAxes log scaling applies Math.log to the raw bar value (bar.js), which only supports
        // positive values (negatives give NaN, and pixelToData re-exponentiates to positive). Emit a
        // log suggestion only when both endpoints are positive; otherwise hand the wizard a linear
        // scale so calibration never degrades to NaN.
        let scale = fit.scale;
        if (scale === 'log' && (loVal <= 0 || hiVal <= 0)) {
            scale = 'linear';
        }

        const mkPx = (t, entry) => (axisKey === 'x' ? {
            x: t,
            y: entry.tick.px.y
        } : {
            x: entry.tick.px.x,
            y: t
        });

        const calibrationPoints = [{
                slot: 'P1',
                px: mkPx(loT, loEntry),
                value: loVal
            },
            {
                slot: 'P2',
                px: mkPx(hiT, hiEntry),
                value: hiVal
            }
        ];

        return {
            status: 'ok',
            valueAxis: axisKey,
            calibrationPoints: calibrationPoints,
            scale: scale,
            rotated: false,
            axisFit: fit
        };
    };

    // Exposed for unit tests.
    wpd.autoCalibration.parseReviewValue = parseValue;
})();

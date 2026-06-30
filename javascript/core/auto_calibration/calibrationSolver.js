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

// Robust pixel->value fit for one axis from (tick pixel position, OCR/typed value) pairs. An axis is
// modeled as z = m*t + b, where t is the pixel coordinate along the axis and z is the value
// (linear) or log10(|value|) (log). RANSAC over distinct pairs rejects OCR outliers; the better of
// the linear and log fits is returned. Pure module: no DOM, no canvas.
wpd.autoCalibration.calibrationSolver = (function() {

    function _median(values) {
        if (values.length === 0) {
            return 0;
        }
        let sorted = values.slice().sort((a, b) => a - b);
        let mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    function _medianTickSpacing(pairs) {
        let ts = pairs.map(p => p.t).sort((a, b) => a - b);
        let diffs = [];
        for (let i = 1; i < ts.length; i++) {
            let d = ts[i] - ts[i - 1];
            if (d > 0) diffs.push(d);
        }
        return diffs.length > 0 ? _median(diffs) : 0;
    }

    // Least-squares fit of z = m*t + b over the given points; returns {m, b} or null if degenerate.
    function _leastSquares(points) {
        let n = points.length;
        if (n < 2) return null;
        let sumT = 0,
            sumZ = 0,
            sumTT = 0,
            sumTZ = 0;
        for (let p of points) {
            sumT += p.t;
            sumZ += p.z;
            sumTT += p.t * p.t;
            sumTZ += p.t * p.z;
        }
        let denom = n * sumTT - sumT * sumT;
        if (denom === 0) return null;
        let m = (n * sumTZ - sumT * sumZ) / denom;
        let b = (sumZ - m * sumT) / n;
        return {
            m: m,
            b: b
        };
    }

    // RANSAC fit of a set of {t, z} points. Exhaustive over distinct pairs (tick counts are small).
    function _ransac(points, inlierThreshold) {
        let n = points.length;
        if (n < 2) {
            return null;
        }
        let best = null;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                let dt = points[j].t - points[i].t;
                let dz = points[j].z - points[i].z;
                if (dt === 0 || dz === 0) {
                    continue;
                }
                let m = dz / dt;
                let b = points[i].z - m * points[i].t;
                let inliers = [];
                let residualSum = 0;
                for (let k = 0; k < n; k++) {
                    // residual measured in pixel space: |t - (z - b)/m|
                    let predictedT = (points[k].z - b) / m;
                    let residual = Math.abs(points[k].t - predictedT);
                    if (residual <= inlierThreshold) {
                        inliers.push(points[k]);
                        residualSum += residual * residual;
                    }
                }
                if (best === null || inliers.length > best.inliers.length ||
                    (inliers.length === best.inliers.length && residualSum < best.residualSum)) {
                    best = {
                        m: m,
                        b: b,
                        inliers: inliers,
                        residualSum: residualSum
                    };
                }
            }
        }
        if (best === null) {
            return null;
        }
        // Refit on the inlier set for a better estimate.
        let refit = _leastSquares(best.inliers);
        if (refit !== null) {
            best.m = refit.m;
            best.b = refit.b;
        }
        return best;
    }

    function _fitForScale(pairs, scale, inlierThreshold) {
        let sign = 1;
        let points = [];
        if (scale === 'log') {
            // Require a single nonzero sign across the pairs for a log axis.
            let signs = pairs.filter(p => p.value !== 0).map(p => (p.value > 0 ? 1 : -1));
            if (signs.length === 0) {
                return null;
            }
            sign = signs[0];
            for (let s of signs) {
                if (s !== sign) {
                    return null; // mixed signs: not a single log axis
                }
            }
            for (let p of pairs) {
                if (p.value === 0) {
                    return null; // zero is invalid on a log axis
                }
                points.push({
                    t: p.t,
                    z: Math.log(Math.abs(p.value)) / Math.LN10,
                    value: p.value
                });
            }
        } else {
            for (let p of pairs) {
                points.push({
                    t: p.t,
                    z: p.value,
                    value: p.value
                });
            }
        }

        let fit = _ransac(points, inlierThreshold);
        if (fit === null || fit.inliers.length < 2 || fit.m === 0 || !isFinite(fit.m)) {
            return null;
        }
        let residualPx = Math.sqrt(fit.residualSum / fit.inliers.length);
        return {
            scale: scale,
            sign: sign,
            slope: fit.m,
            intercept: fit.b,
            inliers: fit.inliers,
            residualPx: residualPx,
            inlierCount: fit.inliers.length
        };
    }

    function solveAxis(pairs, options) {
        const opts = options || {};
        if (pairs == null || pairs.length < 2) {
            return {
                status: 'failed',
                scale: null,
                inliers: [],
                confidence: 0
            };
        }

        const spacing = _medianTickSpacing(pairs);
        const inlierThreshold = opts.inlierThreshold != null ?
            opts.inlierThreshold : Math.max(2, 0.03 * spacing);

        const linearFit = _fitForScale(pairs, 'linear', inlierThreshold);
        const logFit = _fitForScale(pairs, 'log', inlierThreshold);

        // Prefer linear unless log fits strictly more inliers, or the same inliers with a clearly
        // smaller pixel residual.
        let chosen = null;
        if (linearFit !== null && logFit !== null) {
            if (logFit.inlierCount > linearFit.inlierCount) {
                chosen = logFit;
            } else if (logFit.inlierCount === linearFit.inlierCount &&
                logFit.residualPx < linearFit.residualPx - 1e-6 &&
                linearFit.residualPx > 1) {
                chosen = logFit;
            } else {
                chosen = linearFit;
            }
        } else {
            chosen = linearFit || logFit;
        }

        if (chosen === null) {
            return {
                status: 'failed',
                scale: null,
                inliers: [],
                confidence: 0
            };
        }

        const confidence = Math.min(1, chosen.inlierCount / pairs.length) *
            (1 / (1 + chosen.residualPx));

        return {
            status: 'ok',
            scale: chosen.scale,
            sign: chosen.sign,
            slope: chosen.slope,
            intercept: chosen.intercept,
            inliers: chosen.inliers,
            residualPx: chosen.residualPx,
            confidence: confidence
        };
    }

    // Map a pixel coordinate along the axis to a data value using a solved fit.
    function valueAt(axisFit, t) {
        let z = axisFit.slope * t + axisFit.intercept;
        if (axisFit.scale === 'log') {
            return axisFit.sign * Math.pow(10, z);
        }
        return z;
    }

    // Inverse of valueAt: the pixel coordinate along the axis where the fit predicts a given data value.
    // Used to place a calibration corner on the fitted model at a clean tick value. Returns null when the
    // fit is degenerate (zero slope) or the value is off a log axis (wrong sign).
    function pixelAt(axisFit, value) {
        if (axisFit.slope === 0) {
            return null;
        }
        let z = value;
        if (axisFit.scale === 'log') {
            const ratio = value / axisFit.sign;
            if (ratio <= 0) {
                return null;
            }
            z = Math.log(ratio) / Math.LN10;
        }
        return (z - axisFit.intercept) / axisFit.slope;
    }

    return {
        solveAxis: solveAxis,
        valueAt: valueAt,
        pixelAt: pixelAt
    };
})();

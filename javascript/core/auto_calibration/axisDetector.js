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

// Detect the left (Y) and bottom (X) axis rules of an XY plot from a set of foreground stroke pixels.
// The strokes are the dark/colored axis pixels inside the user's mask region (the caller extracts
// them); this module is pure and operates only on a Set of pixel indices (index = y*width + x).
//
// Approach: build per-row and per-column projection profiles (foreground count and the longest
// contiguous run). The X axis is the bottom-most row with a long horizontal run; the Y axis is the
// left-most column with a long vertical run. Their intersection is the origin. Each axis line's
// extent is the contiguous run along that row/column.
wpd.autoCalibration.axisDetector = (function() {

    function _bucketStrokes(binaryData, width, height, roi) {
        // rowXs[y] = sorted array of x with a foreground pixel; colYs[x] = sorted array of y.
        const rowXs = new Map();
        const colYs = new Map();
        for (let idx of binaryData) {
            let x = idx % width;
            let y = (idx - x) / width;
            if (x < roi.xmin || x > roi.xmax || y < roi.ymin || y > roi.ymax) {
                continue;
            }
            if (!rowXs.has(y)) rowXs.set(y, []);
            if (!colYs.has(x)) colYs.set(x, []);
            rowXs.get(y).push(x);
            colYs.get(x).push(y);
        }
        return {
            rowXs: rowXs,
            colYs: colYs
        };
    }

    // Longest contiguous run (allowing a small gap) in a sorted integer array, returning
    // {length, start, end} for the run covering the most extent.
    function _longestRun(sortedVals, maxGap) {
        if (sortedVals.length === 0) {
            return {
                length: 0,
                start: 0,
                end: 0
            };
        }
        sortedVals.sort((a, b) => a - b);
        let bestStart = sortedVals[0];
        let bestEnd = sortedVals[0];
        let curStart = sortedVals[0];
        let prev = sortedVals[0];
        for (let i = 1; i < sortedVals.length; i++) {
            let v = sortedVals[i];
            if (v - prev <= maxGap + 1) {
                // still part of the current run
            } else {
                if (prev - curStart > bestEnd - bestStart) {
                    bestStart = curStart;
                    bestEnd = prev;
                }
                curStart = v;
            }
            prev = v;
        }
        if (prev - curStart > bestEnd - bestStart) {
            bestStart = curStart;
            bestEnd = prev;
        }
        return {
            length: bestEnd - bestStart + 1,
            start: bestStart,
            end: bestEnd
        };
    }

    function computeProjectionStats(binaryData, width, height, roi, maxGap) {
        const buckets = _bucketStrokes(binaryData, width, height, roi);
        const rowRuns = new Map();
        const colRuns = new Map();
        buckets.rowXs.forEach((xs, y) => {
            rowRuns.set(y, _longestRun(xs, maxGap));
        });
        buckets.colYs.forEach((ys, x) => {
            colRuns.set(x, _longestRun(ys, maxGap));
        });
        return {
            rowRuns: rowRuns,
            colRuns: colRuns
        };
    }

    function _pickAxisRow(rowRuns) {
        // Bottom-most row whose horizontal run is within 60% of the longest horizontal run.
        let maxLen = 0;
        rowRuns.forEach((run) => {
            if (run.length > maxLen) maxLen = run.length;
        });
        if (maxLen === 0) return null;
        let threshold = 0.6 * maxLen;
        let chosenY = null;
        let chosenRun = null;
        rowRuns.forEach((run, y) => {
            if (run.length >= threshold) {
                if (chosenY === null || y > chosenY) {
                    chosenY = y;
                    chosenRun = run;
                }
            }
        });
        return {
            pos: chosenY,
            run: chosenRun,
            maxLen: maxLen
        };
    }

    function _pickAxisCol(colRuns) {
        // Left-most column whose vertical run is within 60% of the longest vertical run.
        let maxLen = 0;
        colRuns.forEach((run) => {
            if (run.length > maxLen) maxLen = run.length;
        });
        if (maxLen === 0) return null;
        let threshold = 0.6 * maxLen;
        let chosenX = null;
        let chosenRun = null;
        colRuns.forEach((run, x) => {
            if (run.length >= threshold) {
                if (chosenX === null || x < chosenX) {
                    chosenX = x;
                    chosenRun = run;
                }
            }
        });
        return {
            pos: chosenX,
            run: chosenRun,
            maxLen: maxLen
        };
    }

    function detect(binaryData, width, height, options) {
        const opts = options || {};
        const roi = opts.roi || {
            xmin: 0,
            ymin: 0,
            xmax: width - 1,
            ymax: height - 1
        };
        const maxGap = opts.maxGap != null ? opts.maxGap : 2;

        const stats = computeProjectionStats(binaryData, width, height, roi, maxGap);
        const xAxis = _pickAxisRow(stats.rowRuns);
        const yAxis = _pickAxisCol(stats.colRuns);

        if (xAxis === null || yAxis === null || xAxis.run === null || yAxis.run === null) {
            return {
                status: 'failed',
                xAxis: null,
                yAxis: null,
                origin: null,
                plotBounds: roi,
                confidence: 0
            };
        }

        const xAxisY = xAxis.pos;
        const yAxisX = yAxis.pos;
        const origin = {
            x: yAxisX,
            y: xAxisY
        };

        // X axis line spans the horizontal run on its row; Y axis line spans the vertical run on its
        // column. p0 is at the origin end, p1 at the far end.
        const xAxisLine = {
            orientation: 'x',
            p0: {
                x: yAxisX,
                y: xAxisY
            },
            p1: {
                x: xAxis.run.end,
                y: xAxisY
            },
            score: xAxis.run.length / Math.max(1, roi.xmax - roi.xmin)
        };
        const yAxisLine = {
            orientation: 'y',
            p0: {
                x: yAxisX,
                y: xAxisY
            },
            p1: {
                x: yAxisX,
                y: yAxis.run.start
            },
            score: yAxis.run.length / Math.max(1, roi.ymax - roi.ymin)
        };

        const confidence = Math.min(1, 0.5 * (xAxisLine.score + yAxisLine.score));

        return {
            status: 'ok',
            xAxis: xAxisLine,
            yAxis: yAxisLine,
            origin: origin,
            plotBounds: {
                xmin: yAxisX,
                xmax: xAxis.run.end,
                ymin: yAxis.run.start,
                ymax: xAxisY
            },
            confidence: confidence
        };
    }

    return {
        detect: detect,
        computeProjectionStats: computeProjectionStats
    };
})();

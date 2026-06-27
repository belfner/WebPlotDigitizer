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

var wpd = wpd || {};
wpd.autoCalibration = wpd.autoCalibration || {};

// Detect tick marks along the X and Y axis rules found by axisDetector. For each axis a thin strip
// just outside the rule (below the X axis, left of the Y axis) is projected onto the axis direction;
// contiguous runs of foreground in that 1-D signal are the tick marks. Operates on the same Set of
// foreground stroke pixel indices (index = y*width + x).
wpd.autoCalibration.tickDetector = (function() {

    // Group contiguous keys (with values >= minCount) in a count map into runs, returning each run's
    // centroid coordinate.
    function _groupTicks(countMap, minCount, maxGap) {
        let keys = [];
        countMap.forEach((count, key) => {
            if (count >= minCount) {
                keys.push(key);
            }
        });
        keys.sort((a, b) => a - b);

        let ticks = [];
        if (keys.length === 0) {
            return ticks;
        }
        let runStart = keys[0];
        let prev = keys[0];
        let weightSum = countMap.get(keys[0]) * keys[0];
        let countSum = countMap.get(keys[0]);
        const flush = function() {
            ticks.push(weightSum / countSum);
        };
        for (let i = 1; i < keys.length; i++) {
            let k = keys[i];
            if (k - prev <= maxGap + 1) {
                weightSum += countMap.get(k) * k;
                countSum += countMap.get(k);
            } else {
                flush();
                weightSum = countMap.get(k) * k;
                countSum = countMap.get(k);
                runStart = k;
            }
            prev = k;
        }
        flush();
        return ticks;
    }

    // Collapse spurious doubled peaks: positions closer than mergeFactor * median spacing are merged
    // to their midpoint. A single tick can split into two nearby runs (a faint center pixel, anti-
    // aliasing, or a minor gridline caught in the strip), surfacing as duplicate ticks. Uniformly
    // spaced real ticks sit far enough apart to survive. One left-to-right pass collapses doubles and
    // longer clusters alike, since each position is compared against the running merged value.
    function _mergeClosePeaks(positions, mergeFactor) {
        if (positions.length < 2) {
            return positions;
        }
        const pitch = _medianPitch(positions);
        if (pitch == null || pitch <= 0) {
            return positions;
        }
        const minSeparation = Math.max(3, mergeFactor * pitch);
        const merged = [positions[0]];
        for (let i = 1; i < positions.length; i++) {
            const last = merged[merged.length - 1];
            if (positions[i] - last < minSeparation) {
                merged[merged.length - 1] = (last + positions[i]) / 2;
            } else {
                merged.push(positions[i]);
            }
        }
        return merged;
    }

    function _medianPitch(positions) {
        if (positions.length < 2) {
            return null;
        }
        let diffs = [];
        for (let i = 1; i < positions.length; i++) {
            diffs.push(positions[i] - positions[i - 1]);
        }
        diffs.sort((a, b) => a - b);
        let mid = Math.floor(diffs.length / 2);
        return diffs.length % 2 === 0 ? (diffs[mid - 1] + diffs[mid]) / 2 : diffs[mid];
    }

    function detect(binaryData, width, height, axisResult, options) {
        const opts = options || {};
        const stripDepth = opts.stripDepth != null ? opts.stripDepth : 12;
        const stripOffset = opts.stripOffset != null ? opts.stripOffset : 2;
        const minMarkPixels = opts.minMarkPixels != null ? opts.minMarkPixels : 2;
        const maxGap = opts.maxGap != null ? opts.maxGap : 1;
        const mergeFactor = opts.mergeFactor != null ? opts.mergeFactor : 0.5;

        const result = {
            x: {
                ticks: [],
                pitch: null
            },
            y: {
                ticks: [],
                pitch: null
            }
        };

        if (axisResult == null || axisResult.status !== 'ok') {
            return result;
        }

        const xAxisY = axisResult.xAxis.p0.y;
        const yAxisX = axisResult.yAxis.p0.x;
        const xStart = Math.min(axisResult.xAxis.p0.x, axisResult.xAxis.p1.x);
        const xEnd = Math.max(axisResult.xAxis.p0.x, axisResult.xAxis.p1.x);
        const yTop = Math.min(axisResult.yAxis.p0.y, axisResult.yAxis.p1.y);
        const yBottom = Math.max(axisResult.yAxis.p0.y, axisResult.yAxis.p1.y);

        // X-axis strip: rows just below the rule, projected onto columns.
        // Y-axis strip: columns just left of the rule, projected onto rows.
        const xColCount = new Map();
        const yRowCount = new Map();

        for (let idx of binaryData) {
            let x = idx % width;
            let y = (idx - x) / width;

            if (y >= xAxisY + stripOffset && y <= xAxisY + stripOffset + stripDepth &&
                x >= xStart && x <= xEnd) {
                xColCount.set(x, (xColCount.get(x) || 0) + 1);
            }

            if (x <= yAxisX - stripOffset && x >= yAxisX - stripOffset - stripDepth &&
                y >= yTop && y <= yBottom) {
                yRowCount.set(y, (yRowCount.get(y) || 0) + 1);
            }
        }

        const xTickPositions = _mergeClosePeaks(_groupTicks(xColCount, minMarkPixels, maxGap), mergeFactor);
        const yTickPositions = _mergeClosePeaks(_groupTicks(yRowCount, minMarkPixels, maxGap), mergeFactor);

        result.x.ticks = xTickPositions.map((tx) => ({
            t: tx,
            px: {
                x: tx,
                y: xAxisY
            }
        }));
        result.y.ticks = yTickPositions.map((ty) => ({
            t: ty,
            px: {
                x: yAxisX,
                y: ty
            }
        }));
        result.x.pitch = _medianPitch(xTickPositions);
        result.y.pitch = _medianPitch(yTickPositions);

        return result;
    }

    return {
        detect: detect,
        // exposed for unit tests
        mergeClosePeaks: _mergeClosePeaks
    };
})();

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

// Main-thread OCR wrapper around the vendored tesseract-wasm module worker. It prepares upscaled
// label crops near detected ticks, recognizes them in the worker, and post-filters the raw OCR text
// through the numeric grammar so only valid numeric candidates ever reach the solver.
wpd.autoCalibration.numericOcr = (function() {
    let worker = null;
    let requestCounter = 0;
    const pending = new Map();

    function _ensureWorker() {
        if (worker !== null) {
            return;
        }
        const workerUrl = new URL(wpd.autoCalibration.config.ocrWorkerUrl, location.href).href;
        worker = new Worker(workerUrl, {
            type: 'module'
        });
        worker.onmessage = function(ev) {
            const msg = ev.data;
            const entry = pending.get(msg.requestId);
            if (entry == null) {
                return;
            }
            pending.delete(msg.requestId);
            if (msg.type === 'recognized') {
                entry.resolve(msg.labels);
            } else {
                entry.reject(new Error(msg.error || 'OCR failed'));
            }
        };
        worker.onerror = function(err) {
            // Reject all in-flight requests; a worker-level error is not request-specific.
            pending.forEach((entry) => entry.reject(new Error('OCR worker error: ' + err.message)));
            pending.clear();
        };
    }

    // Page-segmentation modes tried per crop. 7 (single line) is the proven baseline and runs first;
    // 8 (single word) and 13 (raw line) read short multi-char labels; 10 (single character) is the one
    // that reads ISOLATED SINGLE digits (e.g. an x-axis labeled 0,1,2,...) which the line/word modes
    // reject as noise. The best numeric parse across modes is chosen on return, so order does not
    // affect the winner.
    const PSM_MODES = [7, 8, 13, 10];

    // Send prepared crops to the worker and resolve with raw label results.
    function recognize(crops, psmModes) {
        _ensureWorker();
        const assetBaseUrl = new URL(wpd.autoCalibration.config.tesseractAssetBaseUrl, location.href).href;
        const requestId = ++requestCounter;
        return new Promise((resolve, reject) => {
            pending.set(requestId, {
                resolve: resolve,
                reject: reject
            });
            worker.postMessage({
                type: 'recognize',
                requestId: requestId,
                assetBaseUrl: assetBaseUrl,
                psmModes: (psmModes != null && psmModes.length > 0) ? psmModes : PSM_MODES,
                crops: crops
            });
        });
    }

    function shutdown() {
        if (worker !== null) {
            worker.terminate();
            worker = null;
        }
        pending.clear();
    }

    function _clamp(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    // Find the bounding box of the label's ink inside a native-resolution crop. Rows are projected to an
    // ink count and segmented into bands wherever a run of >= gapRows blank rows appears; the band with
    // the most ink is the label's vertical extent (this drops a thin tick stub and a separate axis-title
    // band). Within that band, inked columns are grouped into runs separated by wide gaps so an adjacent
    // label cannot bleed in: when centerX is given the run nearest that column wins (the label centered
    // on the tick), when preferEdge is given the run nearest that crop edge wins ('right'/'left' -- the
    // y-axis label sits against the rule while any axis title is farther out), otherwise the run with the
    // most ink wins. Returns {x,y,w,h} in crop pixels, or null when the crop is blank.
    function _glyphInkBox(crop, lumaThr, gapRows, centerX, axisEdge, preferEdge, diag) {
        const w = crop.width;
        const h = crop.height;
        const data = crop.data;
        const rowInk = new Int32Array(h);
        const rowMinX = new Int32Array(h);
        const rowMaxX = new Int32Array(h);
        for (let y = 0; y < h; y++) {
            let count = 0;
            let minX = w;
            let maxX = -1;
            const base = y * w * 4;
            for (let x = 0; x < w; x++) {
                if (data[base + x * 4] < lumaThr) {
                    count++;
                    if (x < minX) {
                        minX = x;
                    }
                    maxX = x;
                }
            }
            rowInk[y] = count;
            rowMinX[y] = minX;
            rowMaxX[y] = maxX;
        }
        // Segment the rows into ink bands separated by >= gapRows blank rows.
        const bands = [];
        let y = 0;
        while (y < h) {
            if (rowInk[y] === 0) {
                y++;
                continue;
            }
            let top = y;
            let bot = y;
            let ink = 0;
            let gap = 0;
            while (y < h) {
                if (rowInk[y] > 0) {
                    ink += rowInk[y];
                    bot = y;
                    gap = 0;
                } else {
                    gap++;
                    if (gap >= gapRows) {
                        break;
                    }
                }
                y++;
            }
            bands.push({
                top: top,
                bot: bot,
                ink: ink
            });
        }
        if (bands.length === 0) {
            return null;
        }
        // Per-band geometry: column span (widest inked extent) and fill ratio (inked fraction of the
        // band's bounding box). A solid block like a color-spectrum bar fills nearly its whole box; a
        // thin tick-mark stub spans far fewer columns than the band is tall; text sits between.
        for (let bi = 0; bi < bands.length; bi++) {
            const b = bands[bi];
            let minX = w;
            let maxX = -1;
            for (let yy = b.top; yy <= b.bot; yy++) {
                if (rowMaxX[yy] >= 0) {
                    if (rowMinX[yy] < minX) {
                        minX = rowMinX[yy];
                    }
                    if (rowMaxX[yy] > maxX) {
                        maxX = rowMaxX[yy];
                    }
                }
            }
            const bh = b.bot - b.top + 1;
            b.span = maxX >= minX ? (maxX - minX + 1) : 0;
            // Ink density within the band's own ink span (not the full crop width). Sparse corner/axis
            // clutter near the origin is ~0.03 dense within its wide span, a compact glyph cluster is
            // ~0.1-0.5, and a solid block (a color-spectrum bar) is > 0.6. Measuring over the span, not
            // the crop width, separates a wide-but-sparse clutter strip from the digits.
            b.fill = b.span > 0 ? b.ink / (bh * b.span) : 0;
            b.isText = b.span >= 0.35 * bh && b.fill >= 0.08 && b.fill <= 0.6;
        }
        let maxInkBand = bands[0];
        for (let bi = 1; bi < bands.length; bi++) {
            if (bands[bi].ink > maxInkBand.ink) {
                maxInkBand = bands[bi];
            }
        }
        // Choose the row band holding the label. For an x-axis label the band starts at the axis, so the
        // label is the text band nearest that edge (the axis title and any color bar sit farther down):
        // pick the text-like band closest to the axis, skipping solid blocks and thin tick-mark stubs.
        // Otherwise (y-axis labels, vertically centered on the tick) the label is simply the densest band.
        let chosen = maxInkBand;
        if (axisEdge === 'top') {
            let found = null;
            for (let bi = 0; bi < bands.length; bi++) {
                if (bands[bi].isText && (found === null || bands[bi].top < found.top)) {
                    found = bands[bi];
                }
            }
            if (found !== null) {
                chosen = found;
            }
        }
        const bestTop = chosen.top;
        const bestBot = chosen.bot;
        if (diag != null) {
            diag.cropW = w;
            diag.cropH = h;
            diag.bands = bands.map((b) => ({
                top: b.top,
                bot: b.bot,
                span: b.span,
                fill: Math.round(b.fill * 100) / 100,
                isText: b.isText
            }));
            diag.chosenBand = {
                top: bestTop,
                bot: bestBot
            };
        }

        // Column ink within the chosen row band.
        const colInk = new Int32Array(w);
        for (let yy = bestTop; yy <= bestBot; yy++) {
            const base = yy * w * 4;
            for (let x = 0; x < w; x++) {
                if (data[base + x * 4] < lumaThr) {
                    colInk[x]++;
                }
            }
        }
        // Separate adjacent labels: a gap wider than ~0.6 of the band height splits one label from the
        // next, while inter-digit and decimal-point gaps stay within a run.
        const gapCols = Math.max(4, Math.round((bestBot - bestTop + 1) * 0.6));
        // When isolating by centerX (x-axis labels) or by preferEdge (y-axis labels), ignore runs too
        // narrow to be a glyph: a gridline or the axis rule passing through the band is a few px wide,
        // while a digit is a sizeable fraction of the band height. A secondary best (no width filter) is
        // the fallback if nothing qualifies.
        const minRunWidth = Math.max(4, Math.round((bestBot - bestTop + 1) * 0.2));
        const widthFiltered = centerX != null || preferEdge != null;
        let chosenL = -1;
        let chosenR = -1;
        let bestColScore = -Infinity;
        let fallbackL = -1;
        let fallbackR = -1;
        let bestFallbackScore = -Infinity;
        let x = 0;
        while (x < w) {
            if (colInk[x] === 0) {
                x++;
                continue;
            }
            let runL = x;
            let runR = x;
            let ink = 0;
            let gap = 0;
            while (x < w) {
                if (colInk[x] > 0) {
                    runR = x;
                    ink += colInk[x];
                    gap = 0;
                } else {
                    gap++;
                    if (gap >= gapCols) {
                        break;
                    }
                }
                x++;
            }
            // Higher score wins. With centerX: prefer the nearest run (negative distance). With
            // preferEdge: prefer the run nearest the axis-facing crop edge ('right' -> largest right
            // column, 'left' -> smallest left column). Otherwise: prefer the run with the most ink.
            let score;
            if (centerX != null) {
                const dist = centerX < runL ? runL - centerX : (centerX > runR ? centerX - runR : 0);
                score = -dist;
            } else if (preferEdge === 'right') {
                score = runR;
            } else if (preferEdge === 'left') {
                score = -runL;
            } else {
                score = ink;
            }
            if (score > bestFallbackScore) {
                bestFallbackScore = score;
                fallbackL = runL;
                fallbackR = runR;
            }
            if ((!widthFiltered || (runR - runL + 1) >= minRunWidth) && score > bestColScore) {
                bestColScore = score;
                chosenL = runL;
                chosenR = runR;
            }
        }
        if (chosenL < 0) {
            chosenL = fallbackL;
            chosenR = fallbackR;
        }
        if (chosenL < 0) {
            return null;
        }
        if (diag != null) {
            diag.chosenRun = {
                l: chosenL,
                r: chosenR
            };
            diag.centerX = centerX;
        }
        return {
            x: chosenL,
            y: bestTop,
            w: chosenR - chosenL + 1,
            h: bestBot - bestTop + 1
        };
    }

    // Most common color in a crop, used as the page background. Channels are quantized to 4 bits so
    // near-identical background pixels group into one bucket; the representative returned is an actual
    // pixel from the winning bucket. Lets OCR work on any background color, not just white.
    function _backgroundColor(cropImageData) {
        const d = cropImageData.data;
        const counts = new Map();
        let bestN = -1;
        let bg = [255, 255, 255];
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) {
                continue; // transparent -> not part of the background sample
            }
            const key = ((d[i] & 0xF0) << 16) | ((d[i + 1] & 0xF0) << 8) | (d[i + 2] & 0xF0);
            const n = (counts.get(key) || 0) + 1;
            counts.set(key, n);
            if (n > bestN) {
                bestN = n;
                bg = [d[i], d[i + 1], d[i + 2]];
            }
        }
        return bg;
    }

    // Otsu's method: the histogram threshold that maximizes between-class variance, i.e. best splits a
    // bimodal histogram (here: background pixels near distance 0, text pixels far away). Adapts to each
    // crop's contrast so no fixed cutoff is needed. hist is a 256-bin count array; total is its sum.
    function _otsuThreshold(hist, total) {
        let sum = 0;
        for (let i = 0; i < 256; i++) {
            sum += i * hist[i];
        }
        let sumB = 0;
        let wB = 0;
        let maxVar = -1;
        let threshold = 0;
        for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB === 0) {
                continue;
            }
            const wF = total - wB;
            if (wF === 0) {
                break;
            }
            sumB += t * hist[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            if (between > maxVar) {
                maxVar = between;
                threshold = t;
            }
        }
        return threshold;
    }

    // Render a crop as anti-aliased grayscale dark-text-on-white. Each pixel's color distance from the
    // detected background is the foreground signal; that distance is mapped to a continuous gray ramp
    // (background -> white, strongest ink -> black) rather than a hard 1-bit cut. The Tesseract 4/5 LSTM
    // recognizes from the grayscale image and was trained on anti-aliased text, so feeding it smooth gray
    // ramps (which preserve thin features like a decimal point and the true glyph shape) reads markedly
    // better than a pre-binarized bitmap, whose hard edges drop punctuation and distort glyphs (e.g.
    // "0.5" -> "05", an open-top "4" -> "A"); see Tesseract issues #1780/#3083 and the Scatteract paper.
    // An Otsu threshold over the distances sets a noise floor (so the colored background stays clean
    // white) and drives the blank / over-ink guards. Returns a new ImageData, or null when the crop has
    // negligible contrast (effectively blank) or its background was misjudged.
    function _toGrayscale(cropImageData, bg) {
        const d = cropImageData.data;
        const n = cropImageData.width * cropImageData.height;
        const dist = new Uint8Array(n);
        const hist = new Int32Array(256);
        let maxDist = 0;
        for (let p = 0; p < n; p++) {
            const i = p * 4;
            let dv = 0;
            if (d[i + 3] !== 0) {
                const dr = d[i] - bg[0];
                const dg = d[i + 1] - bg[1];
                const db = d[i + 2] - bg[2];
                const dd = Math.sqrt(dr * dr + dg * dg + db * db);
                dv = dd > 255 ? 255 : (dd | 0);
            }
            dist[p] = dv;
            hist[dv]++;
            if (dv > maxDist) {
                maxDist = dv;
            }
        }
        // A crop with no pixel far from its background carries no text; skip it.
        if (maxDist < 24) {
            return null;
        }
        const t = _otsuThreshold(hist, n);
        // Noise floor: distances at or below it are background (white). Set just below the Otsu split so
        // anti-aliased glyph edges (distances around the threshold) survive as gray ramps while the
        // colored-background texture is flattened to clean white. The ramp then spans [floor, maxDist].
        const floor = Math.max(8, Math.round(t * 0.4));
        const span = maxDist > floor ? (maxDist - floor) : 1;
        const out = new ImageData(cropImageData.width, cropImageData.height);
        const o = out.data;
        let inkCount = 0;
        for (let p = 0; p < n; p++) {
            if (dist[p] > t) {
                inkCount++;
            }
            let v;
            if (dist[p] <= floor) {
                v = 255;
            } else {
                // Linear ramp: floor -> white (255), maxDist -> black (0).
                v = Math.round(255 * (1 - (dist[p] - floor) / span));
                if (v < 0) {
                    v = 0;
                } else if (v > 255) {
                    v = 255;
                }
            }
            const i = p * 4;
            o[i] = v;
            o[i + 1] = v;
            o[i + 2] = v;
            o[i + 3] = 255;
        }
        // A label crop is mostly background; if most pixels read as ink the background was misjudged
        // (e.g. a crop dominated by a dark mark), so skip it rather than feed Tesseract a solid block.
        if (inkCount > n * 0.5) {
            return null;
        }
        return out;
    }

    // Remove the tick mark on the axis-facing edge of a label crop. The mark is a thin ink stub joined
    // to that edge, while the label digits are taller and separated from it by background. A connected
    // component grown inward from the edge is erased only when it is short enough to be a tick, so the
    // digits (and a real minus sign on the far edge) are left intact. edge is 'left' or 'right'.
    function _eraseAxisTick(grayData, edge) {
        const w = grayData.width;
        const h = grayData.height;
        const d = grayData.data;
        const maxTickH = Math.max(2, Math.round(h * 0.4));
        const visited = new Uint8Array(w * h);
        // Ink is dark on the grayscale crop; treat anything below mid-gray as part of a stroke.
        const isInk = (x, y) => d[(y * w + x) * 4] < 128;
        const col = edge === 'left' ? 0 : w - 1;
        for (let sy = 0; sy < h; sy++) {
            if (visited[sy * w + col] === 1 || !isInk(col, sy)) {
                continue;
            }
            const stack = [col, sy];
            const comp = [];
            let minY = h;
            let maxY = -1;
            while (stack.length > 0) {
                const cy = stack.pop();
                const cx = stack.pop();
                if (cx < 0 || cx >= w || cy < 0 || cy >= h) {
                    continue;
                }
                const k = cy * w + cx;
                if (visited[k] === 1 || !isInk(cx, cy)) {
                    continue;
                }
                visited[k] = 1;
                comp.push(cx, cy);
                if (cy < minY) {
                    minY = cy;
                }
                if (cy > maxY) {
                    maxY = cy;
                }
                stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
            }
            if ((maxY - minY + 1) <= maxTickH) {
                for (let p = 0; p < comp.length; p += 2) {
                    const i = (comp[p + 1] * w + comp[p]) * 4;
                    d[i] = 255;
                    d[i + 1] = 255;
                    d[i + 2] = 255;
                }
            }
        }
    }

    // Build an OCR-ready crop from a sub-rectangle of the source image: detect the background color,
    // render anti-aliased grayscale dark-on-white, tight-crop to the glyph ink, scale so the glyph is
    // glyphHeight px tall, and surround it with a small white border. Tesseract's layout analysis reports "Empty
    // page" when a small glyph floats in a large canvas (the official ImproveQuality guidance: crop to
    // the text with a ~10 px border), and its accuracy peaks near a ~30 px cap height, regressing for
    // much larger glyphs. A blind upscale of the whole band fails both ways; this normalizes the
    // glyph-to-canvas ratio. Requires a DOM canvas. Returns null for an empty rectangle or a blank crop.
    function _cropNormalize(sourceCanvas, rect, opts) {
        if (rect.w <= 0 || rect.h <= 0) {
            return null;
        }
        const targetH = opts.glyphHeight != null ? opts.glyphHeight : 32;
        // White border around the glyph. The official ImproveQuality guidance is ~10 px; a larger border
        // around a short isolated token (a 2-4 char tick label) is a documented "Empty page" trigger.
        const pad = opts.outPad != null ? opts.outPad : 10;
        const maxScale = opts.maxScale != null ? opts.maxScale : 10;

        // Draw the band at native resolution and render grayscale against its background color.
        const native = document.createElement('canvas');
        native.width = rect.w;
        native.height = rect.h;
        const nctx = native.getContext('2d');
        nctx.drawImage(sourceCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        const nativeData = nctx.getImageData(0, 0, rect.w, rect.h);
        const bg = _backgroundColor(nativeData);
        const grayData = _toGrayscale(nativeData, bg);
        if (grayData === null) {
            return null;
        }
        // Strip the axis-side tick mark so it is not read as a stray minus sign (y-axis labels sit left
        // of the rule, with the leftward tick landing on the crop's right edge).
        if (opts.tickEdge != null) {
            _eraseAxisTick(grayData, opts.tickEdge);
        }

        const grayCanvas = document.createElement('canvas');
        grayCanvas.width = rect.w;
        grayCanvas.height = rect.h;
        grayCanvas.getContext('2d').putImageData(grayData, 0, 0);

        // Locate the glyph ink in the grayscale crop (dark text -> luma below the threshold). centerX
        // isolates the label centered on the tick from an adjacent label that shares the band; axisEdge
        // picks the text band nearest the axis (the label) over a deeper band's axis title.
        const box = _glyphInkBox(grayData, 128, 3, opts.centerX, opts.axisEdge, opts.preferEdge, opts.diag);
        if (box === null) {
            return null;
        }

        const scale = Math.min(maxScale, targetH / box.h);
        const gw = Math.max(1, Math.round(box.w * scale));
        const gh = Math.max(1, Math.round(box.h * scale));
        const out = document.createElement('canvas');
        out.width = gw + 2 * pad;
        out.height = gh + 2 * pad;
        const octx = out.getContext('2d');
        octx.fillStyle = 'rgb(255,255,255)';
        octx.fillRect(0, 0, out.width, out.height);
        // High-quality (bicubic-like) resampling keeps small-digit strokes clean when upscaling.
        octx.imageSmoothingEnabled = true;
        if (octx.imageSmoothingQuality != null) {
            octx.imageSmoothingQuality = 'high';
        }
        octx.drawImage(grayCanvas, box.x, box.y, box.w, box.h, pad, pad, gw, gh);
        return octx.getImageData(0, 0, out.width, out.height);
    }

    // Fraction of dark (inked) pixels in a crop. Blank label zones (mostly paper) are skipped so the
    // OCR engine is not invoked on empty crops, which avoids per-crop "Empty page" log spam and work.
    function _inkRatio(cropImageData) {
        const data = cropImageData.data;
        let ink = 0;
        const pixels = cropImageData.width * cropImageData.height;
        for (let i = 0; i < data.length; i += 4) {
            let luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (luma < 128) {
                ink++;
            }
        }
        return pixels > 0 ? ink / pixels : 0;
    }

    // Build label crops below each x-tick and left of each y-tick. Returns an array of crop messages
    // tagged with their axis and tick index so values can be paired back to ticks.
    function prepareTickLabelCrops(imageData, axisResult, tickResult, options) {
        const opts = options || {};
        // Glyph normalization parameters passed through to _cropNormalize. The crop is tight-cropped to
        // the label ink and scaled to glyphHeight px tall with an outPad white border.
        const cropOpts = {
            glyphHeight: opts.glyphHeight,
            outPad: opts.outPad,
            maxScale: opts.maxScale
        };
        // y-axis labels sit left of the rule; the leftward tick mark lands on the crop's right edge, and
        // the label ink sits against the rule (right edge) while any axis title is farther left, so the
        // glyph run nearest the right edge is the label.
        const yCropOpts = Object.assign({}, cropOpts, {
            tickEdge: 'right',
            preferEdge: 'right'
        });
        const labelOffset = opts.labelOffset != null ? opts.labelOffset : 2;
        const minInkRatio = opts.minInkRatio != null ? opts.minInkRatio : 0.0025;
        const width = imageData.width;
        const height = imageData.height;

        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = width;
        sourceCanvas.height = height;
        sourceCanvas.getContext('2d').putImageData(imageData, 0, 0);

        const crops = [];

        // half-width of an x label box from the tick pitch (fall back to a fixed width)
        const xPitch = tickResult.x.pitch != null ? tickResult.x.pitch : 40;
        const xHalf = Math.max(12, Math.round(xPitch * 0.45));
        // Vertical depth of the x-axis label band below the rule. Scales with the tick pitch so the full
        // digit height is captured at high image resolutions (a fixed depth clips tall digits, and a
        // bottom-clipped "4" reads as "A"); _glyphInkBox then picks the band nearest the axis, so a depth
        // that also reaches the axis title still locks onto the label.
        const labelDepth = opts.labelDepth != null ? opts.labelDepth :
            Math.max(48, Math.round(xPitch * 0.3));
        const xAxisY = axisResult.xAxis.p0.y;
        tickResult.x.ticks.forEach((tick, i) => {
            const x0 = _clamp(Math.round(tick.t - xHalf), 0, width - 1);
            const x1 = _clamp(Math.round(tick.t + xHalf), 0, width - 1);
            const y0 = _clamp(xAxisY + labelOffset, 0, height - 1);
            const y1 = _clamp(xAxisY + labelOffset + labelDepth, 0, height - 1);
            if (x1 <= x0 || y1 <= y0) {
                return;
            }
            const rect = {
                x: x0,
                y: y0,
                w: x1 - x0,
                h: y1 - y0
            };
            const diag = {};
            const cropImageData = _cropNormalize(sourceCanvas, rect, Object.assign({}, cropOpts, {
                centerX: tick.t - x0,
                axisEdge: 'top',
                diag: diag
            }));
            if (cropImageData === null || _inkRatio(cropImageData) < minInkRatio) {
                return; // skip empty/blank label zones
            }
            crops.push({
                id: 'x' + i,
                axis: 'x',
                tickIndex: i,
                bbox: rect,
                imageData: cropImageData,
                diag: diag
            });
        });

        const yPitch = tickResult.y.pitch != null ? tickResult.y.pitch : 40;
        const yHalf = Math.max(10, Math.round(yPitch * 0.45));
        // Width of the y-label band, left of the rule. Scales with the tick pitch so labels are not
        // clipped at high image resolutions; the tight-crop trims the surrounding background back off.
        const labelWidth = opts.yLabelWidth != null ? opts.yLabelWidth :
            Math.max(80, Math.round(yPitch * 1.4));
        const yAxisX = axisResult.yAxis.p0.x;
        tickResult.y.ticks.forEach((tick, i) => {
            const x1 = _clamp(yAxisX - labelOffset, 0, width - 1);
            const x0 = _clamp(yAxisX - labelOffset - labelWidth, 0, width - 1);
            const y0 = _clamp(Math.round(tick.t - yHalf), 0, height - 1);
            const y1 = _clamp(Math.round(tick.t + yHalf), 0, height - 1);
            if (x1 <= x0 || y1 <= y0) {
                return;
            }
            const rect = {
                x: x0,
                y: y0,
                w: x1 - x0,
                h: y1 - y0
            };
            const diag = {};
            const cropImageData = _cropNormalize(sourceCanvas, rect, Object.assign({}, yCropOpts, {
                diag: diag
            }));
            if (cropImageData === null || _inkRatio(cropImageData) < minInkRatio) {
                return; // skip empty/blank label zones
            }
            crops.push({
                id: 'y' + i,
                axis: 'y',
                tickIndex: i,
                bbox: rect,
                imageData: cropImageData,
                diag: diag
            });
        });

        return crops;
    }

    // OCR the tick labels and return, per axis, the {t, value, confidence} pairs whose text parsed to
    // a numeric value. t is the tick coordinate along the axis (x for the x-axis, y for the y-axis).
    function recognizeTickValues(imageData, axisResult, tickResult, options) {
        const opts = options || {};
        const debug = wpd.autoCalibration.config.debugOcr === true;
        const crops = prepareTickLabelCrops(imageData, axisResult, tickResult, options);
        if (debug) {
            console.log('[auto-cal OCR] prepared', crops.length, 'crops from',
                tickResult.x.ticks.length, 'x +', tickResult.y.ticks.length, 'y ticks');
        }
        if (crops.length === 0) {
            return Promise.resolve({
                x: [],
                y: []
            });
        }
        // Strip imageData out of the crop record before pairing (kept only for the worker payload).
        return recognize(crops, opts.psmModes).then((labels) => {
            const byId = new Map();
            crops.forEach(c => byId.set(c.id, c));
            const result = {
                x: [],
                y: []
            };
            labels.forEach((label) => {
                const crop = byId.get(label.id);
                if (crop == null) {
                    return;
                }
                const best = _bestNumericParse(label);
                if (debug) {
                    // Per-crop OCR trace: enable with wpd.autoCalibration.config.debugOcr = true, then
                    // re-run Detect. Shows each page-seg mode's raw text and confidence, and the chosen
                    // numeric value (or null), so crop/recognition issues are visible without a rebuild.
                    const modes = (label.candidates || []).map(
                        (c) => 'psm' + c.psm + '="' + c.text + '"@' + Math.round(c.confidence));
                    console.log('[auto-cal OCR]', label.id, label.axis, crop.bbox,
                        modes.join(' '), '->', best === null ? null : best.candidates[0].value);
                }
                if (best === null) {
                    return; // no page-seg mode produced a numeric read -> never reaches the solver
                }
                const tick = (crop.axis === 'x' ? tickResult.x.ticks : tickResult.y.ticks)[crop.tickIndex];
                result[crop.axis].push({
                    t: tick.t,
                    value: best.candidates[0].value,
                    candidates: best.candidates,
                    confidence: best.confidence
                });
            });
            if (debug) {
                const labelById = new Map();
                labels.forEach((l) => labelById.set(l.id, l));
                _renderDebugCrops(crops, labelById);
            }
            return result;
        }).catch((err) => {
            if (debug) {
                console.warn('[auto-cal OCR] recognize failed:', (err && err.message) ? err.message : err);
            }
            throw err;
        });
    }

    // Debug aid (gated on wpd.autoCalibration.config.debugOcr): render every prepared crop with its
    // recognized text into a fixed overlay so the exact pixels fed to OCR are visible. This is how a
    // crop-geometry problem (the band missing the labels) is told apart from a recognition problem.
    function _renderDebugCrops(crops, labelsById) {
        let container = document.getElementById('auto-cal-ocr-debug');
        if (container === null) {
            container = document.createElement('div');
            container.id = 'auto-cal-ocr-debug';
            container.style.cssText = 'position:fixed;left:0;bottom:0;max-height:45%;width:100%;' +
                'overflow:auto;background:#fff;border-top:2px solid #000;z-index:99999;' +
                'font:11px monospace;padding:4px';
            document.body.appendChild(container);
        }
        while (container.firstChild !== null) {
            container.removeChild(container.firstChild);
        }
        crops.forEach((c) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:inline-block;margin:3px;text-align:center;vertical-align:top';
            const cv = document.createElement('canvas');
            cv.width = c.imageData.width;
            cv.height = c.imageData.height;
            cv.style.cssText = 'border:1px solid #ccc;max-width:150px;height:auto';
            cv.getContext('2d').putImageData(c.imageData, 0, 0);
            wrap.appendChild(cv);
            const cap = document.createElement('div');
            const lbl = labelsById.get(c.id);
            cap.textContent = c.id + ': "' + (lbl != null ? lbl.rawText : '?') + '"';
            wrap.appendChild(cap);
            // Per-mode candidate dump so a single screenshot of this strip shows what each page-seg
            // mode (and the tile pass) actually read, distinguishing a recognition problem from a
            // crop-geometry one without needing the browser console.
            if (lbl != null && lbl.candidates != null) {
                const modes = document.createElement('div');
                modes.style.cssText = 'font-size:9px;color:#555;white-space:pre-wrap;max-width:150px';
                modes.textContent = lbl.candidates.map((cd) =>
                    cd.psm + ':"' + cd.text + '"@' + Math.round(cd.confidence)).join('\n');
                wrap.appendChild(modes);
            }
            // Band/run geometry the glyph-box picked, so a wrong selection in a crowded crop (a gridline
            // or neighbor caught instead of the digits) is visible on the strip.
            if (c.diag != null && c.diag.bands != null) {
                const dg = document.createElement('div');
                dg.style.cssText = 'font-size:9px;color:#a00;white-space:pre-wrap;max-width:150px';
                const bandStr = c.diag.bands.map((b) =>
                    '[' + b.top + '-' + b.bot + ' sp' + b.span + ' f' + b.fill + (b.isText ? ' T' : '') + ']'
                ).join('\n');
                const chosen = c.diag.chosenBand;
                const run = c.diag.chosenRun;
                dg.textContent = 'crop ' + c.diag.cropW + 'x' + c.diag.cropH + ' cX' + c.diag.centerX +
                    '\n' + bandStr +
                    '\npick y' + chosen.top + '-' + chosen.bot + ' x' + run.l + '-' + run.r;
                wrap.appendChild(dg);
            }
            container.appendChild(wrap);
        });
    }

    // Pick the best numeric reading for a label by consensus across the page-seg-mode candidates the
    // worker tried. Each candidate's text is run through the numeric grammar; candidates that parse to
    // the same value have their OCR confidences summed, and the value with the largest summed
    // confidence wins. Summing (rather than taking the single highest-confidence candidate) makes the
    // reading robust to a lone outlier mode: when several modes agree on "0.5" they outvote one mode
    // that dropped the decimal point and read "05". Returns {candidates, confidence} or null when no
    // mode read a number.
    function _bestNumericParse(label) {
        const texts = (label.candidates != null && label.candidates.length > 0) ?
            label.candidates : [{
                text: label.rawText,
                confidence: label.confidence
            }];
        const votes = new Map();
        texts.forEach((cand) => {
            const parsed = wpd.autoCalibration.numericGrammar.parse(cand.text);
            if (parsed.length === 0) {
                return;
            }
            const conf = cand.confidence != null ? cand.confidence : 0;
            const value = parsed[0].value;
            let vote = votes.get(value);
            if (vote == null) {
                vote = {
                    candidates: parsed,
                    weight: 0,
                    count: 0
                };
                votes.set(value, vote);
            }
            vote.weight += conf;
            vote.count += 1;
        });
        let best = null;
        votes.forEach((vote) => {
            if (best === null || vote.weight > best.weight) {
                best = vote;
            }
        });
        if (best === null) {
            return null;
        }
        return {
            candidates: best.candidates,
            confidence: best.weight / best.count
        };
    }

    return {
        recognize: recognize,
        prepareTickLabelCrops: prepareTickLabelCrops,
        recognizeTickValues: recognizeTickValues,
        shutdown: shutdown
    };
})();

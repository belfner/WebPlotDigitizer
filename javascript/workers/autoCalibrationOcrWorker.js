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

// Module Web Worker that runs the vendored tesseract-wasm OCR engine inline. It is served verbatim
// (not concatenated into wpd.min.js), so it can use ES module dynamic import of the vendored library
// without going through the app bundler/minifier. The main thread (numericOcr.js) passes an absolute
// asset base URL so this worker's location does not matter.
//
// Protocol:
//   in  { type:'recognize', requestId, assetBaseUrl, psmModes:[13,8,7], crops:[{id,bbox,axis,imageData}] }
//   out { type:'recognized', requestId, labels:[{id,bbox,axis,rawText,confidence,candidates:[{psm,text,confidence}]}] }
//   out { type:'error', requestId, error }

// The vendored tesseract-wasm engine routes its C++ stderr through the Emscripten module's `printErr`
// callback, which defaults to `console.warn` (createOCREngine never forwards a custom one). Per-crop
// recognition of tiny isolated tick labels makes Tesseract's layout analysis emit a flood of benign
// diagnostics ("Empty page!!", resolution estimates, diacritic counts), one per pass. Filter those
// specific lines out of the worker's console while passing every other warning/log through unchanged,
// so a genuine Emscripten abort or library warning is still visible.
const _OCR_NOISE = /^(Empty page!!|Estimating resolution|Detected \d+ diacritics|Warning[.:]? Invalid resolution|page \d+ skipped)/;

function _filterConsole(method) {
    const original = self.console[method].bind(self.console);
    self.console[method] = function(...args) {
        if (args.length === 1 && typeof args[0] === 'string' && _OCR_NOISE.test(args[0])) {
            return;
        }
        original(...args);
    };
}
_filterConsole('warn');
_filterConsole('log');

let enginePromise = null;

// Rebuild a transferable {width,height,data} into a real ImageData so it can be drawn onto a canvas.
function _toImageData(img) {
    if (typeof ImageData !== 'undefined' && img instanceof ImageData) {
        return img;
    }
    return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}

// Tile a crop horizontally `copies` times with `gap` px of white spacing so the engine sees a short
// line of the label repeated. Isolated single digits read empty under the LSTM engine across page-seg
// modes 7/8/10/13, and short labels read inconsistently in isolation, but both reappear once repeated
// into a line; the smallest repeating unit of the recognized string then recovers the label.
function _tileHorizontally(imageData, copies, gap) {
    const w = imageData.width;
    const h = imageData.height;
    const outW = w * copies + gap * (copies + 1);
    const dst = new OffscreenCanvas(outW, h);
    const dctx = dst.getContext('2d');
    dctx.fillStyle = 'white';
    dctx.fillRect(0, 0, outW, h);
    const src = new OffscreenCanvas(w, h);
    src.getContext('2d').putImageData(imageData, 0, 0);
    for (let i = 0; i < copies; i++) {
        dctx.drawImage(src, gap + i * (w + gap), 0);
    }
    return dctx.getImageData(0, 0, outW, h);
}

// Smallest repeating unit of a tiled recognition. A tiled crop reads as its label repeated, so the
// label is recovered as the shortest prefix whose exact repetition reproduces the string: "2.02.02.0"
// -> "2.0", "000" -> "0", "1" -> "1". Returns the whole string when no exact period divides it (noisy
// reads), which simply fails the numeric parse and lets other candidates win.
function _repeatUnit(text) {
    const n = text.length;
    if (n === 0) {
        return '';
    }
    for (let L = 1; L <= n; L++) {
        if (n % L !== 0) {
            continue;
        }
        const unit = text.slice(0, L);
        let ok = true;
        for (let i = L; i < n; i += L) {
            if (text.slice(i, i + L) !== unit) {
                ok = false;
                break;
            }
        }
        if (ok) {
            return unit;
        }
    }
    return text;
}

// Replace the unicode dashes the engine emits for a minus sign (figure/en/em dash and horizontal bar
// 0x2012-0x2015, and the minus sign 0x2212) with an ASCII hyphen so negative labels parse.
function _dashToHyphen(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        out += ((c >= 0x2012 && c <= 0x2015) || c === 0x2212) ? '-' : s[i];
    }
    return out;
}

// Run one tiled recognition pass: repeat the crop `copies` times into a short line, read it as a single
// line (PSM 7), and recover the label as the recognized string's smallest repeating unit. The unit is
// only trusted when it genuinely collapsed (repeats at least twice), otherwise an empty string is
// returned so a non-collapsing noisy read cannot beat the direct candidates. Returns {text, confidence}.
function _tilePass(engine, imageData, copies, gap) {
    const tiled = _tileHorizontally(imageData, copies, gap);
    const tr = _recognizeOnce(engine, tiled, 7);
    const unit = _repeatUnit(tr.text);
    const collapsed = unit.length > 0 && unit.length * 2 <= tr.text.length;
    return {
        text: collapsed ? unit : '',
        confidence: tr.confidence
    };
}

// Run one recognition pass at a given page-seg mode and return the recognized text plus a confidence.
function _recognizeOnce(engine, imageData, psm) {
    engine.setVariable('tessedit_pageseg_mode', String(psm));
    engine.loadImage(imageData);
    // getText() returns the recognized string regardless of layout granularity. A single isolated
    // character is recognized but produces no "word" box, so getTextBoxes('word') alone misses it;
    // getText() still returns it. The word boxes are kept only for a confidence signal.
    const words = engine.getTextBoxes('word');
    const fullText = (engine.getText() || '').replace(/\s+/g, '');
    const boxText = words.map(w => w.text).join('');
    const text = _dashToHyphen((fullText !== '' ? fullText : boxText).trim());
    const confidence = words.length > 0 ?
        words.reduce((s, w) => s + w.confidence, 0) / words.length :
        (text !== '' ? 1 : 0);
    return {
        text: text,
        confidence: confidence
    };
}

async function getEngine(assetBaseUrl) {
    if (enginePromise !== null) {
        return enginePromise;
    }
    enginePromise = (async function() {
        const lib = await import(assetBaseUrl + 'lib.js');
        const wasmName = lib.supportsFastBuild && lib.supportsFastBuild() ?
            'tesseract-core.wasm' : 'tesseract-core-fallback.wasm';
        const wasmResp = await fetch(assetBaseUrl + wasmName);
        if (!wasmResp.ok) {
            throw new Error('failed to load ' + wasmName + ' (' + wasmResp.status + ')');
        }
        const wasmBinary = await wasmResp.arrayBuffer();
        const engine = await lib.createOCREngine({
            wasmBinary: wasmBinary
        });

        const modelResp = await fetch(assetBaseUrl + 'eng.traineddata');
        if (!modelResp.ok) {
            throw new Error('failed to load eng.traineddata (' + modelResp.status + ')');
        }
        engine.loadModel(new Uint8Array(await modelResp.arrayBuffer()));
        return engine;
    })();
    return enginePromise;
}

self.onmessage = async function(ev) {
    const msg = ev.data;
    if (msg == null || msg.type !== 'recognize') {
        return;
    }
    try {
        const engine = await getEngine(msg.assetBaseUrl);

        // Recognition tuning for short numeric tick labels (see Tesseract ImproveQuality docs):
        //  - user_defined_dpi pins the DPI so Tesseract stops guessing it from the crop size (a wrong
        //    low estimate hurts accuracy and is the source of the "Estimating resolution" log lines).
        //  - load_system_dawg / load_freq_dawg disable the word dictionaries; tick labels are numbers,
        //    not words, so the dictionaries only bias recognition.
        engine.setVariable('user_defined_dpi', '300');
        engine.setVariable('load_system_dawg', '0');
        engine.setVariable('load_freq_dawg', '0');

        // Page-segmentation modes to try per crop; the main thread keeps the best numeric parse. Short
        // isolated tick labels read better under raw-line / single-word modes than single-line alone.
        const psmModes = (Array.isArray(msg.psmModes) && msg.psmModes.length > 0) ?
            msg.psmModes : [7, 8, 13, 10];

        const labels = [];
        for (let crop of msg.crops) {
            const imageData = _toImageData(crop.imageData);
            const candidates = [];
            let bestText = '';
            let bestConf = -1;
            for (let psm of psmModes) {
                const r = _recognizeOnce(engine, imageData, psm);
                candidates.push({
                    psm: psm,
                    text: r.text,
                    confidence: r.confidence
                });
                if (r.text !== '' && r.confidence > bestConf) {
                    bestConf = r.confidence;
                    bestText = r.text;
                }
            }
            // Always add a tiled pass: the LSTM engine drops isolated single glyphs (single-digit axis
            // labels) and reads short labels inconsistently in isolation, but reliably once the crop is
            // repeated into a short line. The recognized string is the label repeated, so its smallest
            // repeating unit recovers the label ("2.02.02.0" -> "2.0", "000" -> "0").
            // Two tile widths: a tight 3-copy line and a wider 5-copy line with a larger gap. The wider
            // line gives the LSTM more horizontal context, which recovers labels the 3-copy tile drops
            // (a thin decimal point or a sparse glyph). Each contributes a candidate; the main thread
            // picks the numeric value with the strongest consensus across all of them.
            const tileConfigs = [
                [3, 12],
                [5, 16]
            ];
            for (let ti = 0; ti < tileConfigs.length; ti++) {
                const copies = tileConfigs[ti][0];
                const tp = _tilePass(engine, imageData, copies, tileConfigs[ti][1]);
                candidates.push({
                    psm: 'tile' + copies,
                    text: tp.text,
                    confidence: tp.confidence
                });
                if (tp.text !== '' && tp.confidence > bestConf) {
                    bestConf = tp.confidence;
                    bestText = tp.text;
                }
            }
            labels.push({
                id: crop.id,
                bbox: crop.bbox,
                axis: crop.axis,
                rawText: bestText,
                confidence: bestConf < 0 ? 0 : bestConf,
                candidates: candidates
            });
        }
        self.postMessage({
            type: 'recognized',
            requestId: msg.requestId,
            labels: labels
        });
    } catch (err) {
        self.postMessage({
            type: 'error',
            requestId: msg.requestId,
            error: (err && err.message) ? err.message : String(err)
        });
    }
};

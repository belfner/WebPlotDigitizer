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

// Session controller for the XY auto-calibration assist. It owns a transient AutoDetectionData
// (never stored in plotData) so the shared mask and color tools can drive an isolated detector. The
// detected suggestion is applied by prefilling the normal XY calibration wizard; the user always
// confirms and commits through the existing Calibrate path.
wpd.autoCalibrationController = (function() {
    // Mask control ids, matching wpd.dataMask.defaultMaskControlIds shape, but scoped to the
    // auto-calibration sidebar so masking never touches the active dataset detector.
    const maskIds = {
        box: 'auto-cal-box-mask',
        pen: 'auto-cal-pen-mask',
        erase: 'auto-cal-erase-mask',
        view: 'auto-cal-view-mask',
        paintContainer: 'auto-cal-mask-paint-container',
        eraseContainer: 'auto-cal-mask-erase-container',
        paintThickness: 'auto-cal-paintThickness',
        eraseThickness: 'auto-cal-eraseThickness',
        clear: 'auto-cal-clearMaskBtn'
    };

    const colorIds = {
        colorButton: 'auto-cal-color-button',
        modeSelect: 'auto-cal-color-detection-mode-select',
        distance: 'auto-cal-color-distance-value',
        filterButton: 'auto-cal-filter-colors-btn',
        useColorFilter: 'auto-cal-use-color-filter',
        pickerContainer: 'auto-cal-color-picker-container'
    };

    let session = null;

    function _setStatus(message) {
        let $status = document.getElementById('auto-cal-status');
        if ($status !== null) {
            $status.innerText = message;
        }
    }

    function _setApplyEnabled(enabled) {
        let $apply = document.getElementById('auto-cal-apply');
        if ($apply !== null) {
            $apply.disabled = !enabled;
        }
    }

    function _clearPressedStates() {
        const ids = [maskIds.box, maskIds.pen, maskIds.erase, maskIds.view, colorIds.filterButton];
        for (let id of ids) {
            let $el = document.getElementById(id);
            if ($el !== null) {
                $el.classList.remove('pressed-button');
            }
        }
        let $paint = document.getElementById(maskIds.paintContainer);
        if ($paint !== null) {
            $paint.style.display = 'none';
        }
        let $erase = document.getElementById(maskIds.eraseContainer);
        if ($erase !== null) {
            $erase.style.display = 'none';
        }
    }

    function openForXYCalibration() {
        // Discard any prior session before starting a fresh one.
        teardown();

        session = {
            detector: new wpd.AutoDetectionData({
                useColorFilter: false
            }),
            runToken: 0,
            suggestion: null,
            state: 'masking'
        };

        wpd.sidebar.show('auto-calibration-sidebar');
        wpd.graphicsWidget.removeTool();
        wpd.graphicsWidget.removeRepainter();
        wpd.graphicsWidget.resetData();

        // Color controls start with the data-path toggle off and the preview cleared.
        wpd.colorPicker.init({
            autoDetector: session.detector,
            ids: colorIds
        });
        _clearPressedStates();
        _setApplyEnabled(false);
        _setStatus(wpd.gettext('auto-cal-select-region'));
    }

    // ---- Mask controls (delegate to the shared mask tools, targeting the transient detector) ----

    function markBox() {
        if (session === null) return;
        wpd.dataMask.markBox({
            autoDetector: session.detector,
            ids: maskIds
        });
    }

    function markPen() {
        if (session === null) return;
        wpd.dataMask.markPen({
            autoDetector: session.detector,
            ids: maskIds
        });
    }

    function eraseMarks() {
        if (session === null) return;
        wpd.dataMask.eraseMarks({
            autoDetector: session.detector,
            ids: maskIds
        });
    }

    function viewMask() {
        if (session === null) return;
        wpd.dataMask.viewMask({
            autoDetector: session.detector,
            ids: maskIds
        });
    }

    function clearMask() {
        if (session === null) return;
        wpd.dataMask.clearMask({
            autoDetector: session.detector
        });
    }

    // ---- Color controls (delegate to the shared color picker, targeting the transient detector) ----

    function pickColor() {
        if (session === null) return;
        wpd.colorPicker.startPicker({
            autoDetector: session.detector,
            ids: colorIds
        });
    }

    function changeDetectionMode() {
        if (session === null) return;
        wpd.colorPicker.changeDetectionMode({
            autoDetector: session.detector,
            ids: colorIds
        });
    }

    function changeColorDistance() {
        if (session === null) return;
        wpd.colorPicker.changeColorDistance({
            autoDetector: session.detector,
            ids: colorIds
        });
    }

    function testColorDetection() {
        if (session === null) return;
        wpd.colorPicker.testColorDetection({
            autoDetector: session.detector,
            ids: colorIds
        });
    }

    function toggleUseColorFilter() {
        if (session === null) return;
        wpd.colorPicker.changeUseColorFilter({
            autoDetector: session.detector,
            ids: colorIds
        });
    }

    // ---- Detection ----

    function run() {
        if (session === null) {
            return;
        }

        // Flush an in-progress mask drawing into the transient detector. Only grab when a mask tool
        // is the active repainter (dataMaskPainter): the mask tools already flush the ROI on each
        // completed draw and on removal, so the detector mask is otherwise current. Crucially, never
        // grab when the color-filter preview (colorFilterRepainter) or any stale overlay is on the
        // canvas, since that yellow layer is the filtered foreground, not the ROI, and grabbing it
        // would collapse the selected region.
        let repainter = wpd.graphicsWidget.getRepainter();
        let maskToolActive = repainter != null && repainter.painterName === 'dataMaskPainter';
        if (maskToolActive) {
            wpd.dataMask.grabMask(session.detector);
        }
        // With no mask drawn the whole image is the region: the mask-only path extracts dark strokes
        // from the full image so the user can jump straight to detection. The color-filter path needs a
        // drawn region to bound the filtered foreground, so it still asks for one.
        const noMask = session.detector.mask == null || session.detector.mask.size === 0;
        if (noMask && session.detector.useColorFilter === true) {
            _setStatus(wpd.gettext('auto-cal-select-region'));
            _setApplyEnabled(false);
            return;
        }

        // Tear down any active tool and overlay (mask or color preview) and clear the data layer so a
        // later re-run cannot scan a stale overlay as the mask.
        wpd.graphicsWidget.removeTool();
        wpd.graphicsWidget.removeRepainter();
        wpd.graphicsWidget.resetData();

        let ctx = wpd.graphicsWidget.getAllContexts();
        let imageSize = wpd.graphicsWidget.getImageSize();
        // Guard against a not-yet-sized canvas: getImageData throws IndexSizeError on a zero
        // dimension. Without a loaded image there is nothing to detect.
        if (imageSize.width <= 0 || imageSize.height <= 0) {
            _setStatus(wpd.gettext('auto-cal-detection-failed'));
            _setApplyEnabled(false);
            return;
        }
        let imageData = ctx.oriImageCtx.getImageData(0, 0, imageSize.width, imageSize.height);
        // Retain the image data so label re-scans during review do not re-read the canvas.
        session.imageData = imageData;
        session.detector.imageWidth = imageSize.width;
        session.detector.imageHeight = imageSize.height;
        session.detector.generateBinaryData(imageData);

        const runToken = ++session.runToken;

        if (wpd.autoCalibration == null || typeof wpd.autoCalibration.run !== 'function') {
            // Detection pipeline is not wired yet (lands in a later update). Masking and color
            // selection already work; surface that clearly instead of failing silently.
            _setStatus(wpd.gettext('auto-cal-detection-unavailable'));
            _setApplyEnabled(false);
            return;
        }

        _setStatus(wpd.gettext('auto-cal-detecting'));
        _setApplyEnabled(false);
        wpd.busyNote.show();

        // Wrap the run() call in Promise.resolve().then(...) so a synchronous throw (e.g. OCR worker
        // startup) is routed into .catch() instead of escaping and leaving the busy state stuck.
        Promise.resolve()
            .then(function() {
                return wpd.autoCalibration.run(session.detector, imageData, {});
            })
            .then(function(suggestion) {
                wpd.busyNote.close();
                // Ignore stale completions if the user re-ran or closed the session meanwhile.
                if (session === null || runToken !== session.runToken) {
                    return;
                }
                _handleSuggestion(suggestion);
            })
            .catch(function(err) {
                wpd.busyNote.close();
                if (session === null || runToken !== session.runToken) {
                    return;
                }
                console.error('auto-calibration run failed', err);
                _setStatus(wpd.gettext('auto-cal-detection-failed'));
                _setApplyEnabled(false);
            });
    }

    function _handleSuggestion(suggestion) {
        session.suggestion = suggestion;
        if (suggestion == null || suggestion.status !== 'ok' ||
            suggestion.axisResult == null || suggestion.tickResult == null) {
            session.review = null;
            _showReviewContainer(false);
            _setStatus(wpd.gettext('auto-cal-partial'));
            _setApplyEnabled(false);
            return;
        }

        // Hand the detection to an editable review: the user can add/move/delete ticks and edit label
        // values on the canvas and in the sidebar table before committing.
        session.review = new wpd.AutoCalibrationReview(suggestion);
        session.axisResult = suggestion.axisResult;

        wpd.graphicsWidget.setRepainter(new wpd.AutoCalibrationRepainter(session.review));
        wpd.graphicsWidget.setTool(new wpd.AutoCalibrationEditTool(session.review, _onReviewChanged));
        wpd.graphicsWidget.forceHandlerRepaint();

        _showReviewContainer(true);
        _renderTickTable();
        _updateFitStatus();
    }

    // ---- Editable review ----

    function _showReviewContainer(visible) {
        let $container = document.getElementById('auto-cal-review-container');
        if ($container !== null) {
            $container.style.display = visible ? 'block' : 'none';
        }
    }

    // Called by the edit tool after every change. 'structure' (add/move/delete) rebuilds the table;
    // 'select' only re-highlights. Either way the fit and Apply state are re-evaluated.
    function _onReviewChanged(kind) {
        if (session === null || session.review === null) {
            return;
        }
        if (kind === 'structure') {
            _renderTickTable();
        } else {
            _highlightSelectedRow();
        }
        _updateFitStatus();
    }

    function _updateFitStatus() {
        if (session === null || session.review === null) {
            return;
        }
        const status = wpd.autoCalibration.reviewFitStatus(session.review);
        const counts = ' (X: ' + status.x.count + ', Y: ' + status.y.count + ')';
        if (status.ready) {
            _setStatus(wpd.gettext('auto-cal-review') + counts);
        } else {
            _setStatus(wpd.gettext('auto-cal-need-labels') + counts);
        }
        _setApplyEnabled(status.ready);
    }

    // Editing a single value never reorders rows, so only the canvas labels and fit need refreshing
    // (re-rendering the table would steal focus from the input being typed into).
    function editTickValue(axis, index, value) {
        if (session === null || session.review === null) {
            return;
        }
        session.review.setValue(axis, index, value);
        wpd.graphicsWidget.forceHandlerRepaint();
        _updateFitStatus();
    }

    function deleteTick(axis, index) {
        if (session === null || session.review === null) {
            return;
        }
        session.review.removeTick(axis, index);
        wpd.graphicsWidget.forceHandlerRepaint();
        _renderTickTable();
        _updateFitStatus();
    }

    function selectTick(axis, index) {
        if (session === null || session.review === null) {
            return;
        }
        session.review.selectTick(axis, index);
        wpd.graphicsWidget.forceHandlerRepaint();
        _highlightSelectedRow();
    }

    function _highlightSelectedRow() {
        let $container = document.getElementById('auto-cal-tick-table-container');
        if ($container === null) {
            return;
        }
        const selected = session.review.selected;
        let rows = $container.querySelectorAll('tr[data-axis]');
        for (let i = 0; i < rows.length; i++) {
            let row = rows[i];
            let isSel = selected !== null && row.getAttribute('data-axis') === selected.axis &&
                parseInt(row.getAttribute('data-index'), 10) === selected.index;
            row.style.background = isSel ? 'rgba(0,200,0,0.18)' : '';
        }
    }

    function _appendAxisRows($table, axis, label) {
        const ticks = session.review.getTicks(axis);
        let header = document.createElement('tr');
        let th = document.createElement('td');
        th.colSpan = 3;
        th.style.fontWeight = 'bold';
        th.style.paddingTop = '4px';
        th.appendChild(document.createTextNode(label));
        header.appendChild(th);
        $table.appendChild(header);

        for (let i = 0; i < ticks.length; i++) {
            let tick = ticks[i];
            let coord = axis === 'x' ? tick.px.x : tick.px.y;

            let row = document.createElement('tr');
            row.setAttribute('data-axis', axis);
            row.setAttribute('data-index', String(i));
            row.style.cursor = 'pointer';
            row.onclick = (function(a, idx) {
                return function(ev) {
                    if (ev.target != null && ev.target.tagName === 'INPUT') {
                        return; // editing the value field, not selecting the row
                    }
                    selectTick(a, idx);
                };
            })(axis, i);

            let pxCell = document.createElement('td');
            pxCell.style.paddingRight = '6px';
            pxCell.style.color = '#888';
            pxCell.appendChild(document.createTextNode(Math.round(coord) + 'px'));
            row.appendChild(pxCell);

            let valCell = document.createElement('td');
            let input = document.createElement('input');
            input.type = 'text';
            input.size = 6;
            input.value = (tick.value != null) ? String(tick.value) : '';
            input.onchange = (function(a, idx) {
                return function() {
                    editTickValue(a, idx, this.value);
                };
            })(axis, i);
            valCell.appendChild(input);
            row.appendChild(valCell);

            let delCell = document.createElement('td');
            let del = document.createElement('input');
            del.type = 'button';
            del.value = 'x';
            del.style.width = '22px';
            del.title = wpd.gettext('auto-cal-delete-tick');
            del.onclick = (function(a, idx) {
                return function(ev) {
                    ev.stopPropagation();
                    deleteTick(a, idx);
                };
            })(axis, i);
            delCell.appendChild(del);
            row.appendChild(delCell);

            $table.appendChild(row);
        }
    }

    function _renderTickTable() {
        let $container = document.getElementById('auto-cal-tick-table-container');
        if ($container === null || session.review === null) {
            return;
        }
        while ($container.firstChild != null) {
            $container.removeChild($container.firstChild);
        }
        let table = document.createElement('table');
        table.style.width = '100%';
        _appendAxisRows(table, 'x', wpd.gettext('auto-cal-x-axis'));
        _appendAxisRows(table, 'y', wpd.gettext('auto-cal-y-axis'));
        $container.appendChild(table);
        _highlightSelectedRow();
    }

    // Re-run OCR over the ticks that still have no value, keeping any value already read or typed
    // (the cache: confirmed labels are not re-recognized). New ticks added during review get scanned.
    function rescanLabels() {
        if (session === null || session.review === null || session.imageData == null ||
            session.axisResult == null || wpd.autoCalibration.numericOcr == null) {
            return;
        }

        const blanks = {
            x: _blankTicks('x'),
            y: _blankTicks('y')
        };
        if (blanks.x.length === 0 && blanks.y.length === 0) {
            return;
        }
        const tickResult = {
            x: {
                ticks: blanks.x.map((b) => b.tick),
                pitch: session.suggestion.tickResult.x.pitch
            },
            y: {
                ticks: blanks.y.map((b) => b.tick),
                pitch: session.suggestion.tickResult.y.pitch
            }
        };

        const runToken = ++session.runToken;
        _setStatus(wpd.gettext('auto-cal-scanning'));
        wpd.busyNote.show();
        Promise.resolve()
            .then(function() {
                return wpd.autoCalibration.numericOcr.recognizeTickValues(
                    session.imageData, session.axisResult, tickResult, {});
            })
            .then(function(values) {
                wpd.busyNote.close();
                if (session === null || runToken !== session.runToken) {
                    return;
                }
                _applyScannedValues('x', blanks.x, values.x);
                _applyScannedValues('y', blanks.y, values.y);
                wpd.graphicsWidget.forceHandlerRepaint();
                _renderTickTable();
                _updateFitStatus();
            })
            .catch(function(err) {
                wpd.busyNote.close();
                if (session === null || runToken !== session.runToken) {
                    return;
                }
                console.error('auto-calibration label scan failed', err);
                _updateFitStatus();
            });
    }

    function _blankTicks(axis) {
        const ticks = session.review.getTicks(axis);
        const out = [];
        for (let i = 0; i < ticks.length; i++) {
            if (ticks[i].value == null || String(ticks[i].value).trim() === '') {
                out.push({
                    index: i,
                    tick: {
                        t: axis === 'x' ? ticks[i].px.x : ticks[i].px.y,
                        px: {
                            x: ticks[i].px.x,
                            y: ticks[i].px.y
                        }
                    }
                });
            }
        }
        return out;
    }

    function _applyScannedValues(axis, blanks, pairs) {
        (pairs || []).forEach((pair) => {
            // match a recognized value back to the blank tick whose coordinate is nearest
            let best = -1;
            let bestDist = Infinity;
            for (let i = 0; i < blanks.length; i++) {
                let d = Math.abs(blanks[i].tick.t - pair.t);
                if (d < bestDist) {
                    bestDist = d;
                    best = i;
                }
            }
            if (best >= 0) {
                session.review.setValue(axis, blanks[best].index, pair.value);
            }
        });
    }

    // ---- Apply ----

    function applyDetected() {
        if (session === null || session.review === null) {
            return;
        }
        const suggestion = wpd.autoCalibration.buildSuggestionFromReview(session.review);
        applySuggestion(suggestion);
    }

    function applySuggestion(suggestion) {
        if (suggestion == null || suggestion.status !== 'ok' ||
            suggestion.calibrationPoints == null || suggestion.calibrationPoints.length !== 4) {
            return;
        }

        // Hand off to the normal XY wizard with points and values prefilled. The transient detector
        // is dropped; the user confirms/drags and commits with the standard Calibrate button.
        // (PR3 captures the pre-apply model snapshot here for atomic undo.)
        _clearPressedStates();
        _showReviewContainer(false);
        session = null;
        wpd.alignAxes.startXYWithPrefill(suggestion);
    }

    function reset() {
        if (session === null) {
            return;
        }
        session.detector.setMask(new Set());
        session.detector.binaryData = new Set();
        session.suggestion = null;
        session.review = null;
        session.imageData = null;
        session.runToken++;
        wpd.graphicsWidget.removeTool();
        wpd.graphicsWidget.removeRepainter();
        wpd.graphicsWidget.resetData();
        _clearPressedStates();
        _showReviewContainer(false);
        _setApplyEnabled(false);
        _setStatus(wpd.gettext('auto-cal-select-region'));
    }

    function teardown() {
        if (session === null) {
            return;
        }
        session = null;
        wpd.graphicsWidget.removeTool();
        wpd.graphicsWidget.removeRepainter();
        wpd.graphicsWidget.resetData();
        _clearPressedStates();
        _showReviewContainer(false);
    }

    return {
        openForXYCalibration: openForXYCalibration,
        markBox: markBox,
        markPen: markPen,
        eraseMarks: eraseMarks,
        viewMask: viewMask,
        clearMask: clearMask,
        pickColor: pickColor,
        changeDetectionMode: changeDetectionMode,
        changeColorDistance: changeColorDistance,
        testColorDetection: testColorDetection,
        toggleUseColorFilter: toggleUseColorFilter,
        run: run,
        editTickValue: editTickValue,
        deleteTick: deleteTick,
        selectTick: selectTick,
        rescanLabels: rescanLabels,
        applyDetected: applyDetected,
        applySuggestion: applySuggestion,
        reset: reset,
        teardown: teardown
    };
})();

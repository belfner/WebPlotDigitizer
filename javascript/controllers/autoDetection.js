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
wpd.autoExtraction = (function() {
    function start() {
        wpd.colorPicker.init();
        wpd.algoManager.updateAlgoList();
    }

    return {
        start: start
    };
})();

// Manage auto extract algorithms
wpd.algoManager = (function() {
    var axes, dataset;

    // Monotonic token used to ignore stale/cancelled async (template-matcher) completions: only the
    // most recent run is allowed to record its undo action.
    let _algoRunToken = 0;

    function _insertAlgoBatchIfChanged(undoManager, targetDataset, beforeSnapshot, afterSnapshot) {
        // One atomic undo step per algorithm run. A run that did not change the dataset records
        // nothing. Redo restores the captured after-snapshot; it never re-runs the algorithm.
        // undoManager is captured at run start so an async completion records into the manager that
        // was active when the run mutated the dataset, even if the user switched page/file since.
        if (JSON.stringify(beforeSnapshot) === JSON.stringify(afterSnapshot)) {
            return;
        }
        const afterRestore = function() {
            wpd.graphicsWidget.resetData();
            wpd.graphicsWidget.forceHandlerRepaint();
            wpd.dataPointCounter.setCount(targetDataset.getCount());
        };
        undoManager.insertAction(
            new wpd.DatasetPointsBatchAction(targetDataset, beforeSnapshot, afterSnapshot, afterRestore));
    }

    function updateAlgoList() {

        dataset = wpd.tree.getActiveDataset();
        axes = wpd.appData.getPlotData().getAxesForDataset(dataset);

        let innerHTML = '';
        let $algoOptions = document.getElementById('auto-extract-algo-name');

        // Averaging Window
        if (!(axes instanceof wpd.BarAxes)) {
            innerHTML +=
                '<option value="averagingWindow">' + wpd.gettext('averaging-window') + '</option>';
        }

        // Bar Extraction
        if (axes instanceof wpd.BarAxes) {
            innerHTML +=
                '<option value="barExtraction">' + wpd.gettext('bar-extraction') + '</option>';
        }

        innerHTML += '<option value="templateMatcher">' + wpd.gettext('template-matcher') + '</option>';

        // X Step w/ Interpolation and X Step
        if (axes instanceof wpd.XYAxes) {
            innerHTML += '<option value="XStepWithInterpolation">' +
                wpd.gettext('x-step-with-interpolation') + '</option>';
            innerHTML += '<option value="XStep">' + wpd.gettext('x-step') + '</option>';
        }

        // CustomIndependents
        if (axes instanceof wpd.XYAxes) {
            innerHTML += '<option value="CustomIndependents">' + wpd.gettext('custom-independents') + '</option>';
        }

        // Blob Detector
        if (!(axes instanceof wpd.BarAxes)) {
            innerHTML +=
                '<option value="blobDetector">' + wpd.gettext('blob-detector') + '</option>';
        }


        // Histogram
        if (axes instanceof wpd.XYAxes) {
            innerHTML += '<option value="histogram">' + wpd.gettext('histogram') + '</option>';
        }

        $algoOptions.innerHTML = innerHTML;

        let autoDetector = getAutoDetectionData();
        if (autoDetector.algorithm != null) {
            if (autoDetector.algorithm instanceof wpd.AveragingWindowAlgo) {
                $algoOptions.value = "averagingWindow";
            } else if (autoDetector.algorithm instanceof wpd.XStepWithInterpolationAlgo) {
                $algoOptions.value = "XStepWithInterpolation";
            } else if (autoDetector.algorithm instanceof wpd.CustomIndependents) {
                $algoOptions.value = "CustomIndependents";
            } else if (autoDetector.algorithm instanceof wpd.AveragingWindowWithStepSizeAlgo) {
                $algoOptions.value = "XStep";
            } else if (autoDetector.algorithm instanceof wpd.BlobDetectorAlgo) {
                $algoOptions.value = "blobDetector";
            } else if (autoDetector.algorithm instanceof wpd.BarExtractionAlgo) {
                if (axes instanceof wpd.XYAxes) {
                    $algoOptions.value = "histogram";
                } else {
                    $algoOptions.value = "barExtraction";
                }
            } else if (autoDetector.algorithm instanceof wpd.TemplateMatcherAlgo) {
                $algoOptions.value = "templateMatcher";
            }
            renderParameters(autoDetector.algorithm);
        } else {
            applyAlgoSelection();
        }
    }

    function getAutoDetectionData() {
        let ds = wpd.tree.getActiveDataset();
        return wpd.appData.getPlotData().getAutoDetectionDataForDataset(ds);
    }

    function applyAlgoSelection() {
        let $algoOptions = document.getElementById('auto-extract-algo-name');
        let selectedValue = $algoOptions.value;
        let autoDetector = getAutoDetectionData();

        if (selectedValue === 'averagingWindow') {
            autoDetector.algorithm = new wpd.AveragingWindowAlgo();
        } else if (selectedValue === 'XStepWithInterpolation') {
            autoDetector.algorithm = new wpd.XStepWithInterpolationAlgo();
        } else if (selectedValue === 'CustomIndependents') {
            autoDetector.algorithm = new wpd.CustomIndependents();
        } else if (selectedValue === 'XStep') {
            autoDetector.algorithm = new wpd.AveragingWindowWithStepSizeAlgo();
        } else if (selectedValue === 'blobDetector') {
            autoDetector.algorithm = new wpd.BlobDetectorAlgo();
        } else if (selectedValue === 'barExtraction' || selectedValue === 'histogram') {
            autoDetector.algorithm = new wpd.BarExtractionAlgo();
        } else if (selectedValue == 'templateMatcher') {
            autoDetector.algorithm = new wpd.TemplateMatcherAlgo();
        } else {
            autoDetector.algorithm = new wpd.AveragingWindowAlgo();
        }

        renderParameters(autoDetector.algorithm);
    }

    function renderParameters(algo) {
        let $paramContainer = document.getElementById('algo-parameter-container');
        let algoParams = algo.getParamList(axes);
        let algoParamKeys = Object.keys(algoParams);
        let tableString = "<table>";

        for (let pi = 0; pi < algoParamKeys.length; pi++) {
            let algoParam = algoParams[algoParamKeys[pi]];
            tableString += '<tr><td>' + algoParam[0] +
                '</td><td><input type="text" size=3 id="algo-param-' + algoParamKeys[pi] +
                '" class="algo-params" value="' + algoParam[2] + '"/></td><td>' +
                algoParam[1] + '</td></tr>';
        }

        tableString += "</table>";
        $paramContainer.innerHTML = tableString;
        let autoDetector = getAutoDetectionData();
        renderSpecialControls(autoDetector.algorithm);
    }

    function renderSpecialControls(algo) {
        // hide all custom controls first
        const $algoControls = document.querySelectorAll('.algo-controls');
        for (let $ctrl of $algoControls) {
            $ctrl.style.display = 'none';
        }

        // now enable the ones we need
        if (algo instanceof wpd.TemplateMatcherAlgo) {
            const $ctrls = document.getElementById('template-matcher-controls');
            $ctrls.style.display = "inline-block";
        } else if (algo instanceof wpd.CustomIndependents) {
            const $ctrls = document.getElementById('custom-indeps-controls');
            $ctrls.style.display = "inline-block";
        }
    }

    function selectTemplate(mode) {
        const autoDetector = getAutoDetectionData();
        const algo = autoDetector.algorithm;
        if (algo instanceof wpd.TemplateMatcherAlgo) {
            const ctx = wpd.graphicsWidget.getAllContexts();
            const imageSize = wpd.graphicsWidget.getImageSize();
            const imageData = ctx.oriImageCtx.getImageData(0, 0, imageSize.width, imageSize.height);
            autoDetector.imageWidth = imageSize.width;
            autoDetector.imageHeight = imageSize.height;
            autoDetector.generateBinaryData(imageData);
            if (mode === "point") {
                wpd.graphicsWidget.setTool(new wpd.TemplateMatcherPointTool(algo, autoDetector));
            } else {
                wpd.graphicsWidget.setTool(new wpd.TemplateMatcherBoxTool(algo, autoDetector));
            }
        }
    }

    function run() {
        wpd.busyNote.show();
        document.getElementById('algo-run-btn').disabled = true;
        let autoDetector = getAutoDetectionData();
        let algo = autoDetector.algorithm;
        let repainter = new wpd.DataPointsRepainter(axes, dataset);
        let $paramFields = document.getElementsByClassName('algo-params');
        let ctx = wpd.graphicsWidget.getAllContexts();
        let imageSize = wpd.graphicsWidget.getImageSize();

        let algoParams = {};
        for (let pi = 0; pi < $paramFields.length; pi++) {
            let paramId = $paramFields[pi].id;
            let paramVar = paramId.replace('algo-param-', '');
            algoParams[paramVar] = $paramFields[pi].value;
        }
        algo.setParams(algoParams);

        wpd.graphicsWidget.removeTool();

        let imageData = ctx.oriImageCtx.getImageData(0, 0, imageSize.width, imageSize.height);
        autoDetector.imageWidth = imageSize.width;
        autoDetector.imageHeight = imageSize.height;
        autoDetector.generateBinaryData(imageData);
        wpd.graphicsWidget.setRepainter(repainter);

        const isTemplateMatching = algo instanceof wpd.TemplateMatcherAlgo;
        // Capture state before the run so the whole run collapses into one atomic undo step. For the
        // async template matcher, the after-snapshot and the action insertion happen in the
        // completion callback; the run token rejects a stale completion.
        const targetDataset = dataset;
        const targetUndoManager = wpd.appData.getUndoManager();
        const beforeSnapshot = targetDataset.getStateSnapshot();
        const runToken = ++_algoRunToken;
        if (isTemplateMatching) {
            algo.setOnCompleteCallback(() => {
                if (runToken === _algoRunToken) {
                    const afterSnapshot = targetDataset.getStateSnapshot();
                    _insertAlgoBatchIfChanged(targetUndoManager, targetDataset, beforeSnapshot, afterSnapshot);
                }
                wpd.graphicsWidget.forceHandlerRepaint();
                wpd.dataPointCounter.setCount(dataset.getCount());
                document.getElementById('algo-run-btn').disabled = false;
                wpd.busyNote.close();
            });
            algo.run(autoDetector, dataset, axes, imageData);
        } else {
            algo.run(autoDetector, dataset, axes, imageData);
            const afterSnapshot = targetDataset.getStateSnapshot();
            _insertAlgoBatchIfChanged(targetUndoManager, targetDataset, beforeSnapshot, afterSnapshot);
            wpd.graphicsWidget.forceHandlerRepaint();
            wpd.dataPointCounter.setCount(dataset.getCount());
            document.getElementById('algo-run-btn').disabled = false;
            wpd.busyNote.close();
        }
        return true;
    }

    function getCustomXValues() {
        wpd.popup.show('custom-indeps-dialog');
        const $x = document.getElementById('custom-indeps-x-input');
        // todo populate this with the algo values
        let autoDetector = getAutoDetectionData();
        let algo = autoDetector.algorithm;
        if (!algo instanceof wpd.CustomIndependents) {
            console.error("incorrect algo type!");
            return
        }
        $x.value = algo.getXVals();
    }

    function setCustomXValues() {
        const $x = document.getElementById('custom-indeps-x-input');
        let autoDetector = getAutoDetectionData();
        let algo = autoDetector.algorithm;
        if (!algo instanceof wpd.CustomIndependents) {
            console.error("incorrect algo type!");
            return
        }
        algo.setXVals($x.value);
        wpd.popup.close('custom-indeps-dialog');
        // save it to the algo values
    }

    return {
        updateAlgoList: updateAlgoList,
        applyAlgoSelection: applyAlgoSelection,
        run: run,
        selectTemplate: selectTemplate,
        getCustomXValues: getCustomXValues,
        setCustomXValues: setCustomXValues,
    };
})();

wpd.dataMask = (function() {
    // DOM ids for the acquire-data sidebar mask controls. The auto-calibration session passes its
    // own id map so its mask controls drive an independent transient detector.
    const defaultMaskControlIds = {
        box: 'box-mask',
        pen: 'pen-mask',
        erase: 'erase-mask',
        view: 'view-mask',
        brushContainer: 'mask-brush-container',
        brushThickness: 'brushThickness',
        clear: 'clearMaskBtn'
    };

    function getActiveAutoDetectionData() {
        let ds = wpd.tree.getActiveDataset();
        return wpd.appData.getPlotData().getAutoDetectionDataForDataset(ds);
    }

    function resolveAutoDetectionData(autoDetector) {
        // A null/undefined target resolves to the active dataset detector, so no-arg callers keep
        // their existing behavior.
        if (autoDetector == null) {
            return getActiveAutoDetectionData();
        }
        return autoDetector;
    }

    function grabMaskInto(autoDetector) {
        // Mask is just a list of pixels with the yellow color in the data layer
        let ctx = wpd.graphicsWidget.getAllContexts();
        let imageSize = wpd.graphicsWidget.getImageSize();
        let maskDataPx = ctx.oriDataCtx.getImageData(0, 0, imageSize.width, imageSize.height);
        let maskData = new Set();

        for (let i = 0; i < maskDataPx.data.length; i += 4) {
            // Yellow RGB identifies a masked pixel; the alpha check excludes pixels that erase
            // (destination-out) zeroed out but whose RGB channels were left at yellow.
            if (maskDataPx.data[i] === 255 && maskDataPx.data[i + 1] === 255 &&
                maskDataPx.data[i + 2] === 0 && maskDataPx.data[i + 3] > 0) {
                maskData.add(i / 4);
            }
        }

        autoDetector.setMask(maskData);
    }

    // Re-render the active mask overlay from the detector model after an undo/redo restores it.
    // Only acts when the data-mask painter is the active repainter: resetData() clears oriData
    // and dispatches the active painter's onRedraw, so running it while a different painter (e.g.
    // the grid mask) is active would re-grab the just-cleared layer and clobber that unrelated
    // mask. When the data-mask view is not active the restored model is repainted later by
    // MaskPainter.onAttach, so a no-op here is safe. The painter's own grab is suppressed across
    // the resetData repaint so it repaints detector.mask instead of scanning the cleared canvas.
    function renderMaskToCanvas() {
        let repainter = wpd.graphicsWidget.getRepainter();
        if (repainter == null || repainter.painterName !== 'dataMaskPainter') {
            return;
        }
        repainter.preventGrab = true;
        try {
            wpd.graphicsWidget.resetData();
        } finally {
            repainter.preventGrab = false;
        }
    }

    // A mask edit is undoable only when it targets the active dataset detector. Auto-calibration
    // masks a transient detector that is torn down with the session; recording a global undo for
    // it would let a later Ctrl+Z repaint a stale mask. Callers may also opt out via recordUndo.
    function _shouldRecordUndo(detector, recordUndo) {
        if (recordUndo === false) {
            return false;
        }
        return detector === getActiveAutoDetectionData();
    }

    // Snapshot the resolved detector's current mask as an RLE blob, for a MaskEditAction's before
    // state. Captured at gesture start, before any painting.
    function snapshotMask(autoDetector) {
        return wpd.maskToRle(resolveAutoDetectionData(autoDetector).mask);
    }

    // Record one mask gesture (brush stroke, box, or clear) as an undoable action. beforeRle is
    // the snapshot from snapshotMask(); the after state is read from the detector model, which the
    // caller has already flushed via grabMask. No-op edits (before === after) are not recorded.
    function recordMaskEdit(autoDetector, beforeRle, recordUndo) {
        let detector = resolveAutoDetectionData(autoDetector);
        if (!_shouldRecordUndo(detector, recordUndo)) {
            return;
        }
        let afterRle = wpd.maskToRle(detector.mask);
        if (JSON.stringify(beforeRle) === JSON.stringify(afterRle)) {
            return;
        }
        wpd.appData.getUndoManager().insertAction(
            new wpd.MaskEditAction(detector, beforeRle, afterRle));
    }

    function grabMask(autoDetector) {
        grabMaskInto(resolveAutoDetectionData(autoDetector));
    }

    function markBox(options) {
        let tool = new wpd.BoxMaskTool(options || {});
        wpd.graphicsWidget.setTool(tool);
    }

    function markBrush(options) {
        let tool = new wpd.BrushMaskTool(options || {});
        wpd.graphicsWidget.setTool(tool);
    }

    // Pen and Erase are the same brush tool with a different default mode; the un-prefixed button
    // launches paint, the erase button launches erase. Right-button still flips per stroke.
    function markPen(options) {
        let opts = options || {};
        opts.initialMode = 'paint';
        markBrush(opts);
    }

    function eraseMarks(options) {
        let opts = options || {};
        opts.initialMode = 'erase';
        markBrush(opts);
    }

    function viewMask(options) {
        // The mask overlay is shown both by the View tool and by the Box/Pen/Erase draw tools,
        // which press the View button as a side effect. Clicking View while any of them shows the
        // overlay turns it off and deactivates the active mask tool (its onRemove commits the mask
        // via grabMask and clears the pressed buttons).
        let repainter = wpd.graphicsWidget.getRepainter();
        if (repainter != null && repainter.painterName === 'dataMaskPainter') {
            wpd.graphicsWidget.removeTool();
            wpd.graphicsWidget.removeRepainter();
            wpd.graphicsWidget.resetData();
            return;
        }
        let tool = new wpd.ViewMaskTool(options || {});
        wpd.graphicsWidget.setTool(tool);
    }

    function clearMask(options) {
        const opts = options || {};
        // Snapshot before clearing so undo can restore the cleared mask. resetData + grab leaves
        // the model empty (the re-grab scans the cleared canvas), which is the desired clear result.
        let beforeRle = snapshotMask(opts.autoDetector);
        wpd.graphicsWidget.resetData();
        grabMask(opts.autoDetector);
        recordMaskEdit(opts.autoDetector, beforeRle, opts.recordUndo);
    }

    return {
        defaultMaskControlIds: defaultMaskControlIds,
        getActiveAutoDetectionData: getActiveAutoDetectionData,
        resolveAutoDetectionData: resolveAutoDetectionData,
        grabMask: grabMask,
        grabMaskInto: grabMaskInto,
        renderMaskToCanvas: renderMaskToCanvas,
        snapshotMask: snapshotMask,
        recordMaskEdit: recordMaskEdit,
        markBox: markBox,
        markBrush: markBrush,
        markPen: markPen,
        eraseMarks: eraseMarks,
        viewMask: viewMask,
        clearMask: clearMask
    };
})();

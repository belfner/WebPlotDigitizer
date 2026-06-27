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

QUnit.module("Auto calibration apply undo tests", {
    beforeEach: function() {
        wpd.appData.reset();
        // Single-file, single-page model so the apply action exercises only the plotData + file
        // manager paths (no page manager).
        sinon.stub(wpd.appData, "isMultipage").returns(false);

        this.ids = ['xy-axes-x1', 'xy-axes-x2', 'xy-axes-y1', 'xy-axes-y2',
            'xy-axes-xscale', 'xy-axes-yscale', 'xy-axes-calibrate', 'xy-axes-skip-rotation'
        ];
        this.els = [];
        for (let id of this.ids) {
            let el = document.createElement('input');
            el.id = id;
            document.body.appendChild(el);
            this.els.push(el);
        }
        // FileManager._init() touches #navSeparator; provide it so a fresh manager initializes.
        this.$navSeparator = document.createElement('div');
        this.$navSeparator.id = 'navSeparator';
        document.body.appendChild(this.$navSeparator);
        this.els.push(this.$navSeparator);
        // Start from a clean file manager (appData.reset does not recreate it). A manager cached by
        // an earlier test captured a null $navSeparator at construction; repair it before _init().
        let fm = wpd.appData.getFileManager();
        fm.$navSeparator = this.$navSeparator;
        fm._init();

        sinon.stub(wpd.tree, "selectPath");
        sinon.stub(wpd.tree, "refresh");
        sinon.stub(wpd.sidebar, "show");
        sinon.stub(wpd.sidebar, "clear");
        sinon.stub(wpd.graphicsWidget, "setTool");
        sinon.stub(wpd.graphicsWidget, "setRepainter");
        sinon.stub(wpd.graphicsWidget, "removeTool");
        sinon.stub(wpd.graphicsWidget, "removeRepainter");
        sinon.stub(wpd.graphicsWidget, "resetData");
        sinon.stub(wpd.graphicsWidget, "forceHandlerRepaint");
        sinon.stub(wpd.events, "dispatch");
        sinon.stub(wpd, "AxesCornersTool");
        sinon.stub(wpd, "AlignmentCornersRepainter");
    },
    afterEach: function() {
        sinon.restore();
        for (let el of this.els) {
            el.remove();
        }
        wpd.appData.reset();
    }
});

function linearFixtureSuggestion() {
    return {
        status: 'ok',
        calibrationPoints: [{
                slot: 'X1',
                px: {
                    x: 10,
                    y: 200
                },
                value: 0
            },
            {
                slot: 'X2',
                px: {
                    x: 300,
                    y: 200
                },
                value: 100
            },
            {
                slot: 'Y1',
                px: {
                    x: 10,
                    y: 200
                },
                value: 0
            },
            {
                slot: 'Y2',
                px: {
                    x: 10,
                    y: 20
                },
                value: 50
            }
        ],
        scales: {
            x: 'linear',
            y: 'linear'
        }
    };
}

QUnit.test("AutoCalibrationApplyAction undo removes and redo re-adds axes and dataset", function(assert) {
    let plotData = wpd.appData.getPlotData();
    let fileManager = wpd.appData.getFileManager();

    let axes = new wpd.XYAxes();
    axes.name = "Test XY";
    let dataset = new wpd.Dataset();
    dataset.name = "Default Dataset";

    // Simulate the committed state an apply would produce.
    plotData.addAxes(axes);
    plotData.addDataset(dataset);
    plotData.setAxesForDataset(dataset, axes);
    fileManager.addAxesToCurrentFile([axes]);
    fileManager.addDatasetsToCurrentFile([dataset]);

    let action = new wpd.AutoCalibrationApplyAction(axes, dataset);

    assert.strictEqual(action.affectsCalibration, undefined,
        "action does not set affectsCalibration (survives dropCalibrationActions)");

    action.undo();
    assert.strictEqual(plotData.getAxesColl().indexOf(axes), -1, "axes removed on undo");
    assert.strictEqual(plotData.getDatasets().indexOf(dataset), -1, "dataset removed on undo");
    assert.strictEqual(fileManager.axesByFile[fileManager.currentIndex].indexOf(axes), -1,
        "axes removed from file mapping on undo");

    action.execute();
    assert.true(plotData.getAxesColl().indexOf(axes) > -1, "axes re-added on redo");
    assert.true(plotData.getDatasets().indexOf(dataset) > -1, "dataset re-added on redo");
    assert.strictEqual(plotData.getAxesForDataset(dataset), axes, "dataset re-linked to axes on redo");
    assert.true(fileManager.axesByFile[fileManager.currentIndex].indexOf(axes) > -1,
        "axes restored to file mapping on redo");
});

QUnit.test("apply via align inserts exactly one surviving undo action", function(assert) {
    let plotData = wpd.appData.getPlotData();
    let undoManager = wpd.appData.getUndoManager();

    // A calibration-point edit action that the commit must drop.
    let pointAction = new wpd.ReversibleAction();
    pointAction.affectsCalibration = true;
    undoManager.insertAction(pointAction);

    wpd.alignAxes.startXYWithPrefill(linearFixtureSuggestion());
    wpd.alignAxes.align();

    assert.strictEqual(undoManager._actions.length, 1, "exactly one action remains after commit");
    assert.true(undoManager._actions[0] instanceof wpd.AutoCalibrationApplyAction,
        "the surviving action is the auto-cal apply action");
    assert.notStrictEqual(undoManager._actions[0].affectsCalibration, true,
        "apply action is not flagged affectsCalibration");
    assert.strictEqual(undoManager._actions.indexOf(pointAction), -1,
        "the calibration-point action was dropped");

    let axesAfterApply = plotData.getAxesCount();
    assert.strictEqual(axesAfterApply, 1, "one axes created by the apply");

    // One undo reverts the whole applied calibration.
    undoManager.undo();
    assert.strictEqual(plotData.getAxesCount(), 0, "undo removes the applied axes");
    assert.strictEqual(plotData.getDatasetCount(), 0, "undo removes the created default dataset");

    // Redo re-applies it.
    undoManager.redo();
    assert.strictEqual(plotData.getAxesCount(), 1, "redo restores the axes");
    assert.strictEqual(plotData.getDatasetCount(), 1, "redo restores the default dataset");
});

QUnit.test("auto-cal apply intent is one-shot: a second commit records no apply action", function(assert) {
    let undoManager = wpd.appData.getUndoManager();
    let applyActionSpy = sinon.spy(wpd, "AutoCalibrationApplyAction");

    // First commit consumes the auto-cal intent and records exactly one apply action.
    wpd.alignAxes.startXYWithPrefill(linearFixtureSuggestion());
    wpd.alignAxes.align();

    // A second align() (without re-arming via startXYWithPrefill) must not re-fire the apply action;
    // align() reset the intent flag at commit time. This is the same flag that a manual start clears.
    wpd.alignAxes.align();

    assert.strictEqual(applyActionSpy.callCount, 1,
        "exactly one apply action constructed across two commits");
    assert.strictEqual(undoManager._actions.length, 1, "only the first commit recorded an apply action");
});

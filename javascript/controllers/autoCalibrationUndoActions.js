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

// One atomic undo step for an applied auto-calibration. Applying auto-calibration commits a new
// XYAxes (and, on the first axes, a Default Dataset) through the normal calibration path; this action
// captures those created objects so a single Ctrl+Z removes them and a redo re-adds the same, still
// calibrated, objects.
//
// The XYAxes keeps its calibration in its own closure state, so removing and re-adding the same
// object reference restores the calibration with no re-fit. The per-axes deep snapshot the design
// memo allowed for a future "recalibrate existing axes" path is unnecessary for the add-new-axes
// flow auto-calibration uses in v1.
//
// This action deliberately does NOT set affectsCalibration, so wpd.alignAxes.align()'s
// dropCalibrationActions() (which only drops calibration-POINT edits) keeps it on the undo stack.
wpd.AutoCalibrationApplyAction = class extends wpd.ReversibleAction {
    constructor(axes, dataset) {
        super();
        this._axes = axes;
        // dataset is the Default Dataset created with the first axes, or null when an existing
        // dataset was already present and no new one was created.
        this._dataset = dataset;
    }

    _refreshAfterUndo() {
        wpd.graphicsWidget.removeTool();
        wpd.graphicsWidget.removeRepainter();
        wpd.graphicsWidget.resetData();
        wpd.sidebar.clear();
        wpd.tree.refresh();
        wpd.tree.selectPath("/" + wpd.gettext("axes"));
        wpd.appData.getUndoManager().updateUI();
    }

    _refreshAfterRedo() {
        wpd.graphicsWidget.removeTool();
        wpd.graphicsWidget.removeRepainter();
        wpd.graphicsWidget.resetData();
        wpd.sidebar.clear();
        wpd.tree.refresh();
        let dsNames = wpd.appData.getPlotData().getDatasetNames();
        if (dsNames.length > 0) {
            wpd.tree.selectPath("/" + wpd.gettext("datasets") + "/" + dsNames[0]);
        } else {
            wpd.tree.selectPath("/" + wpd.gettext("axes"));
        }
        wpd.appData.getUndoManager().updateUI();
    }

    undo() {
        const plotData = wpd.appData.getPlotData();
        const fileManager = wpd.appData.getFileManager();

        if (this._dataset != null) {
            plotData.deleteDataset(this._dataset);
            fileManager.deleteDatasetsFromCurrentFile([this._dataset]);
            if (wpd.appData.isMultipage()) {
                wpd.appData.getPageManager().deleteDatasetsFromCurrentPage([this._dataset]);
            }
            wpd.events.dispatch("wpd.dataset.delete", {
                dataset: this._dataset
            });
        }

        plotData.deleteAxes(this._axes);
        fileManager.deleteAxesFromCurrentFile([this._axes]);
        if (wpd.appData.isMultipage()) {
            wpd.appData.getPageManager().deleteAxesFromCurrentPage([this._axes]);
        }
        wpd.events.dispatch("wpd.axes.delete", {
            axes: this._axes
        });

        this._refreshAfterUndo();
    }

    execute() {
        const plotData = wpd.appData.getPlotData();
        const fileManager = wpd.appData.getFileManager();

        plotData.addAxes(this._axes);
        fileManager.addAxesToCurrentFile([this._axes]);
        if (wpd.appData.isMultipage()) {
            wpd.appData.getPageManager().addAxesToCurrentPage([this._axes]);
        }
        wpd.events.dispatch("wpd.axes.add", {
            axes: this._axes
        });

        if (this._dataset != null) {
            plotData.addDataset(this._dataset);
            plotData.setAxesForDataset(this._dataset, this._axes);
            fileManager.addDatasetsToCurrentFile([this._dataset]);
            if (wpd.appData.isMultipage()) {
                wpd.appData.getPageManager().addDatasetsToCurrentPage([this._dataset]);
            }
            wpd.events.dispatch("wpd.dataset.add", {
                dataset: this._dataset
            });
        }

        this._refreshAfterRedo();
    }
};

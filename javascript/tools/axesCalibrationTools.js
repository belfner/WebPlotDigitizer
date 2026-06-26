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

// GIMP-style axis calibration editor. Points are always movable (no "place all points first"
// gate); modifiers are captured on mousedown. Left = add (auto-grabs a nearby point to move it
// unless Alt is held to force a fresh placement); Shift+left = explicit move; Ctrl/Cmd+left = no-op
// (calibration points are never removed - re-place by moving). A click-drag-release places a
// connected pair of points (XY/Bar/Map) in one atomic step while both endpoints are unplaced. Every
// add/move/pair is one undo step; arrow keys nudge the selected point as one undo step per keypress.
wpd.AxesCornersTool = class {
    constructor(calibration, reloadTool, axesTypeString) {
        this._calibration = calibration;
        this._reloadTool = reloadTool;
        this._axesTypeString = axesTypeString;
        this._pairs = wpd.alignAxes.getCalibrationPointPairs(axesTypeString) || [];
        this._helpers = wpd.pointEditHelpers;

        this._mods = null;
        this._mode = 'noop'; // 'add' | 'move' | 'noop'
        this._gestureActive = false;
        this._suppressNextClick = false;
        this._moveIndex = -1;
        this._moveOldPx = null;
        this._pressImagePos = null;
        this._pressPos = null;
        this._pendingPair = null;
        this._isDraggingAdd = false;

        // repaint calibration points and re-evaluate the Complete button on undo/redo
        this._afterRestore = function() {
            wpd.graphicsWidget.resetData();
            wpd.graphicsWidget.forceHandlerRepaint();
            wpd.alignAxes.updateCalibrationCompletion();
        };

        if (!reloadTool) {
            wpd.graphicsWidget.resetData();
        }
    }

    _undoManager() {
        return wpd.appData.getUndoManager();
    }

    _beginMove(index) {
        this._mode = 'move';
        this._moveIndex = index;
        const p = this._calibration.getPoint(index);
        this._moveOldPx = {px: p.px, py: p.py};
        this._calibration.unselectAll();
        this._calibration.selectPoint(index);
    }

    _eligiblePair(nextSlot) {
        // pair-drag is allowed only if a configured pair starts at the next slot to place and both
        // endpoints are still unplaced (dense append order: unplaced index >= getCount())
        for (const pair of this._pairs) {
            if (pair[0] === nextSlot && pair[1] >= this._calibration.getCount()) {
                return pair;
            }
        }
        return null;
    }

    onMouseDown(ev, pos, imagePos) {
        if (ev.button !== 0) {
            return; // left button only; middle-mouse pan handled by the widget
        }
        this._mods = this._helpers.captureModifiers(ev);
        this._gestureActive = true;
        this._suppressNextClick = false;
        this._mode = 'noop';
        this._moveIndex = -1;
        this._moveOldPx = null;
        this._pressImagePos = imagePos;
        this._pressPos = pos;
        this._pendingPair = null;
        this._isDraggingAdd = false;

        if (this._helpers.isRemoveModifier(this._mods)) {
            return; // Ctrl/Cmd is a no-op in calibration
        }

        const nearest = this._calibration.findNearestPoint(imagePos.x, imagePos.y);

        if (this._mods.shiftKey) {
            if (nearest >= 0) {
                this._beginMove(nearest);
            }
            return; // Shift with no nearby point does nothing
        }

        // plain left: auto-grab a nearby point to move it, unless Alt forces a fresh placement
        if (nearest >= 0 && this._mods.altKey !== true) {
            this._beginMove(nearest);
            return;
        }

        // add the next point (Alt held, or no point nearby); all points already placed -> nothing
        const nextSlot = this._calibration.getCount();
        if (nextSlot >= this._calibration.maxPointCount) {
            return;
        }
        this._mode = 'add';
        this._pendingPair = this._eligiblePair(nextSlot);
    }

    onMouseMove(ev, pos, imagePos) {
        const nearest = this._calibration.findNearestPoint(imagePos.x, imagePos.y);
        if (ev.target != null && ev.target.style != null) {
            if (this._mode === 'move') {
                ev.target.style.cursor = "grabbing";
            } else {
                ev.target.style.cursor = nearest >= 0 ? "grab" : "crosshair";
            }
        }

        if (this._mode === 'move' && this._moveIndex >= 0) {
            this._calibration.changePointPx(this._moveIndex, imagePos.x, imagePos.y);
            wpd.graphicsWidget.forceHandlerRepaint();
        } else if (this._mode === 'add' && this._pendingPair != null && !this._isDraggingAdd) {
            if (this._helpers.exceedsDragThreshold(this._pressPos, pos)) {
                this._isDraggingAdd = true;
            }
        }
    }

    _commitMove(ev, imagePos) {
        if (this._moveIndex < 0 || this._moveOldPx == null) {
            return;
        }
        const newPx = {px: imagePos.x, py: imagePos.y};
        if (this._moveOldPx.px === newPx.px && this._moveOldPx.py === newPx.py) {
            return; // no actual movement
        }
        this._calibration.changePointPx(this._moveIndex, newPx.px, newPx.py);
        this._undoManager().insertAction(new wpd.CalibrationPointMoveAction(
            this._calibration, this._moveIndex, this._moveOldPx, newPx, this._afterRestore));
        wpd.graphicsWidget.forceHandlerRepaint();
        wpd.graphicsWidget.updateZoomOnEvent(ev);
        wpd.alignAxes.updateCalibrationCompletion();
    }

    _commitAdd(ev, pos, imagePos) {
        const nextSlot = this._calibration.getCount();
        if (nextSlot >= this._calibration.maxPointCount) {
            return;
        }
        const pair = this._pendingPair;
        // recompute the drag from the release position so a fast or off-canvas release (handled by
        // onDocumentMouseUp without an in-canvas mousemove) still triggers the pair placement
        const dragged = this._isDraggingAdd || this._helpers.exceedsDragThreshold(this._pressPos, pos);
        const canPairDrag = pair != null && dragged && pair[0] === nextSlot && pair[1] >= nextSlot;

        const before = this._calibration.getStateSnapshot();
        if (canPairDrag) {
            // slot A at the press position, slot B at the release position, one atomic step
            this._calibration.addPoint(this._pressImagePos.x, this._pressImagePos.y, 0, 0);
            this._calibration.addPoint(imagePos.x, imagePos.y, 0, 0);
            this._calibration.unselectAll();
            this._calibration.selectPoint(this._calibration.getCount() - 1);
            // snapshot AFTER selecting so redo restores the selection (arrow-nudge stays usable)
            const after = this._calibration.getStateSnapshot();
            this._undoManager().insertAction(new wpd.CalibrationPointsBatchAction(
                this._calibration, before, after, this._afterRestore));
        } else {
            this._calibration.addPoint(imagePos.x, imagePos.y, 0, 0);
            this._calibration.unselectAll();
            this._calibration.selectPoint(this._calibration.getCount() - 1);
            const after = this._calibration.getStateSnapshot();
            this._undoManager().insertAction(new wpd.CalibrationPointAddAction(
                this._calibration, before, after, this._afterRestore));
        }
        wpd.graphicsWidget.forceHandlerRepaint();
        wpd.graphicsWidget.updateZoomOnEvent(ev);
        wpd.alignAxes.updateCalibrationCompletion();
    }

    _finishGesture(ev, pos, imagePos) {
        if (!this._gestureActive) {
            return; // already handled (in-canvas mouseup runs before document mouseup)
        }
        this._gestureActive = false;
        this._suppressNextClick = true;

        if (this._mode === 'move') {
            this._commitMove(ev, imagePos);
        } else if (this._mode === 'add') {
            this._commitAdd(ev, pos, imagePos);
        }
        this._mode = 'noop';
        this._pendingPair = null;
        this._isDraggingAdd = false;
    }

    onMouseUp(ev, pos, imagePos) {
        this._finishGesture(ev, pos, imagePos);
    }

    onDocumentMouseUp(ev, pos, imagePos) {
        this._finishGesture(ev, pos, imagePos);
    }

    onMouseClick(ev, pos, imagePos) {
        // placement happens on mouseup; the trailing click is suppressed
        if (this._suppressNextClick) {
            this._suppressNextClick = false;
        }
    }

    onKeyDown(ev) {
        const selected = this._calibration.getSelectedPoints();
        if (selected.length === 0) {
            return;
        }
        const index = selected[0];
        const selPoint = this._calibration.getPoint(index);
        const pointPx = selPoint.px;
        const pointPy = selPoint.py;
        const stepSize = ev.shiftKey === true ? 5 / wpd.graphicsWidget.getZoomRatio() :
            0.5 / wpd.graphicsWidget.getZoomRatio();

        const currentRotation = wpd.graphicsWidget.getRotation();
        let {
            x,
            y
        } = wpd.graphicsWidget.getRotatedCoordinates(0, currentRotation, pointPx, pointPy);

        if (wpd.keyCodes.isUp(ev.keyCode)) {
            y = y - stepSize;
        } else if (wpd.keyCodes.isDown(ev.keyCode)) {
            y = y + stepSize;
        } else if (wpd.keyCodes.isLeft(ev.keyCode)) {
            x = x - stepSize;
        } else if (wpd.keyCodes.isRight(ev.keyCode)) {
            x = x + stepSize;
        } else {
            return;
        }

        ({
            x,
            y
        } = wpd.graphicsWidget.getRotatedCoordinates(currentRotation, 0, x, y));

        const oldPx = {px: pointPx, py: pointPy};
        this._calibration.changePointPx(index, x, y);
        this._undoManager().insertAction(new wpd.CalibrationPointMoveAction(
            this._calibration, index, oldPx, {px: x, py: y}, this._afterRestore));
        wpd.graphicsWidget.forceHandlerRepaint();
        wpd.graphicsWidget.updateZoomToImagePosn(x, y);
        ev.preventDefault();
        ev.stopPropagation();
    }
};

wpd.AlignmentCornersRepainter = class {
    constructor(calibration, axesTypeString) {
        this._calibration = calibration;
        this.painterName = 'AlignmentCornersReptainer';
        this._axesTypeString = axesTypeString;
    }

    onForcedRedraw() {
        // resetData() already invokes the registered repaintHandler.onRedraw()
        // (this repainter), so a single call repaints axes and points once.
        wpd.graphicsWidget.resetData();
    }

    onRedraw() {
        if (this._calibration == null) {
            return;
        }

        this.drawAxes();

        for (let i = 0; i < this._calibration.getCount(); i++) {
            let imagePos = this._calibration.getPoint(i);
            let imagePx = {
                x: imagePos.px,
                y: imagePos.py
            };

            let fillStyle = "rgba(200,0,0,1)";
            if (this._calibration.isPointSelected(i)) {
                fillStyle = "rgba(0,200,0,1)";
            }

            wpd.graphicsHelper.drawPoint(imagePx, fillStyle, this._calibration.labels[i],
                this._calibration.labelPositions[i]);
        }
    }

    _drawPairLine(i, j, strokeStyle) {
        // draw a guide between two calibration points once both have been placed
        if (i >= this._calibration.getCount() || j >= this._calibration.getCount()) {
            return;
        }
        const p1 = this._calibration.getPoint(i);
        const p2 = this._calibration.getPoint(j);
        wpd.graphicsHelper.drawLine({
            x: p1.px,
            y: p1.py
        }, {
            x: p2.px,
            y: p2.py
        }, strokeStyle);
    }

    drawAxes() {
        // pair guides appear incrementally as each pair's endpoints are placed
        if (this._axesTypeString === "xy") {
            this._drawPairLine(0, 1, "rgba(200,0,0,0.3)");
            this._drawPairLine(2, 3, "rgba(0,200,0,0.3)");
        }

        if (this._axesTypeString === "bar") {
            this._drawPairLine(0, 1, "rgba(200,0,0,0.3)");
        }

        if (this._axesTypeString === "map") {
            this._drawPairLine(0, 1, "rgba(200,0,0,0.3)");
        }

        if (this._axesTypeString === "ternary") {
            if (this._calibration.getCount() === 3) {
                let a = this._calibration.getPoint(0);
                let b = this._calibration.getPoint(1);
                let c = this._calibration.getPoint(2);
                wpd.graphicsHelper.drawLine({
                    x: a.px,
                    y: a.py
                }, {
                    x: b.px,
                    y: b.py
                }, "rgba(200,0,0,0.3)");
                wpd.graphicsHelper.drawLine({
                    x: b.px,
                    y: b.py
                }, {
                    x: c.px,
                    y: c.py
                }, "rgba(0,200,0,0.3)");
                wpd.graphicsHelper.drawLine({
                    x: c.px,
                    y: c.py
                }, {
                    x: a.px,
                    y: a.py
                }, "rgba(0,0,200,0.3)");
            }
        }
    }
};

wpd.CircularChartRecorderAlignmentRepainter = class {
    _calibration = null;
    painterName = 'CircularChartRecorderAlignmentRepainter';

    constructor(calibration) {
        this._calibration = calibration;
    }

    onForcedRedraw() {
        // resetData() already invokes the registered repaintHandler.onRedraw()
        // (this repainter), so a single call repaints the points once.
        wpd.graphicsWidget.resetData();
    }

    onRedraw() {
        if (this._calibration == null) {
            return;
        }
        for (let i = 0; i < this._calibration.getCount(); i++) {
            let imagePos = this._calibration.getPoint(i);
            let imagePx = {
                x: imagePos.px,
                y: imagePos.py
            };

            let fillStyle = "rgba(200,0,0,1)";
            if (this._calibration.isPointSelected(i)) {
                fillStyle = "rgba(0,200,0,1)";
            }
            wpd.graphicsHelper.drawPoint(imagePx, fillStyle, this._calibration.labels[i], this._calibration.labelPositions[i]);
        }

        // draw chart and pen circles
        if (this._calibration.getCount() == 5) {
            let cp = [];
            for (let i = 0; i < 5; i++) {
                cp.push(this._calibration.getPoint(i));
            }
            let penArcPts = [
                [cp[0].px, cp[0].py],
                [cp[1].px, cp[1].py],
                [cp[2].px, cp[2].py]
            ];
            let chartPts = [
                [cp[2].px, cp[2].py],
                [cp[3].px, cp[3].py],
                [cp[4].px, cp[4].py]
            ];
            let penCircle = wpd.getCircleFrom3Pts(penArcPts);
            let chartCircle = wpd.getCircleFrom3Pts(chartPts);
            wpd.graphicsHelper.drawCircle(penCircle, "rgba(0,200,0,0.5)");
            wpd.graphicsHelper.drawCircle(chartCircle, "rgba(200,0,0,1)");
        }
    }
};

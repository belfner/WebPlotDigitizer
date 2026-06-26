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
// (calibration points are never removed - re-place by moving). On press the first point is placed
// immediately; for a configured pair (XY/Bar/Map) dragging then previews the second point following
// the cursor (drawn on the transient hover layer) and commits it on release as part of the same
// atomic step. Every add/move/pair is one undo step; arrow keys nudge the selected point as one undo
// step per keypress.
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
        this._addBefore = null;

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
        this._addBefore = null;

        if (this._helpers.isRemoveModifier(this._mods)) {
            return; // Ctrl/Cmd is a no-op in calibration
        }

        const nearest = this._calibration.findNearestPoint(imagePos.x, imagePos.y, this._helpers.HIT_THRESHOLD);

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

        // place the first point immediately so it is visible on press. The before-snapshot is taken
        // first so the whole gesture (this point plus the pair's second point, if dragged) collapses
        // into a single undo step committed on mouseup.
        this._addBefore = this._calibration.getStateSnapshot();
        this._calibration.addPoint(imagePos.x, imagePos.y, 0, 0);
        this._calibration.unselectAll();
        this._calibration.selectPoint(this._calibration.getCount() - 1);
        wpd.graphicsWidget.forceHandlerRepaint();
    }

    _hoverOp(ev, nearest) {
        // the operation a click would perform right now, given the held modifiers and hover target
        const mods = this._helpers.captureModifiers(ev);
        if (this._helpers.isRemoveModifier(mods)) {
            return 'noop'; // Ctrl/Cmd never removes calibration points
        }
        if (mods.shiftKey) {
            return nearest >= 0 ? 'move' : 'noop';
        }
        if (mods.altKey) {
            return 'add'; // Alt forces a fresh placement even near a point
        }
        return nearest >= 0 ? 'move' : 'add'; // plain: auto-grab a nearby point, else add
    }

    onMouseMove(ev, pos, imagePos) {
        const nearest = this._calibration.findNearestPoint(imagePos.x, imagePos.y, this._helpers.HIT_THRESHOLD);
        if (ev.target != null && ev.target.style != null) {
            if (this._mode === 'move') {
                ev.target.style.cursor = "grabbing";
            } else if (this._mode === 'add') {
                ev.target.style.cursor = "crosshair"; // placing (possibly dragging the pair)
            } else {
                ev.target.style.cursor = this._helpers.cursorForOp(this._hoverOp(ev, nearest));
            }
        }

        if (this._mode === 'move' && this._moveIndex >= 0) {
            this._calibration.changePointPx(this._moveIndex, imagePos.x, imagePos.y);
            wpd.graphicsWidget.forceHandlerRepaint();
        } else if (this._mode === 'add' && this._pendingPair != null) {
            if (!this._isDraggingAdd && this._helpers.exceedsDragThreshold(this._pressPos, pos)) {
                this._isDraggingAdd = true;
            }
            if (this._isDraggingAdd) {
                this._drawAddPreview(imagePos);
            }
        }
    }

    _drawAddPreview(imagePos) {
        // live preview of the pair's second point following the cursor, on the transient hover layer
        // so the committed points and their repaint are untouched. The first point is already placed.
        const slotB = this._calibration.getCount(); // index the second point would occupy
        const label = this._calibration.labels[slotB];
        const anchorPx = wpd.graphicsWidget.imageToCanvasPx(this._pressImagePos.x, this._pressImagePos.y);
        const cursorPx = wpd.graphicsWidget.imageToCanvasPx(imagePos.x, imagePos.y);
        const dpr = window.devicePixelRatio;
        const fillStyle = "rgba(0,200,0,1)";
        const ctx = wpd.graphicsWidget.getAllContexts();

        wpd.graphicsWidget.resetHover();

        // guide line from the placed first point to the cursor
        ctx.hoverCtx.beginPath();
        ctx.hoverCtx.strokeStyle = "rgba(0,200,0,0.7)";
        ctx.hoverCtx.lineWidth = 2 * dpr;
        ctx.hoverCtx.moveTo(anchorPx.x, anchorPx.y);
        ctx.hoverCtx.lineTo(cursorPx.x, cursorPx.y);
        ctx.hoverCtx.stroke();

        // marker dot at the cursor
        ctx.hoverCtx.beginPath();
        ctx.hoverCtx.fillStyle = fillStyle;
        ctx.hoverCtx.strokeStyle = "rgb(255,255,255)";
        ctx.hoverCtx.lineWidth = dpr;
        ctx.hoverCtx.arc(cursorPx.x, cursorPx.y, 4 * dpr, 0, 2.0 * Math.PI, true);
        ctx.hoverCtx.fill();
        ctx.hoverCtx.stroke();

        // text label east of the cursor, matching the committed point style
        if (label != null) {
            ctx.hoverCtx.font = (dpr === 1) ? "15px sans-serif" : "32px sans-serif";
            const labelWidth = ctx.hoverCtx.measureText(label).width;
            ctx.hoverCtx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.hoverCtx.fillRect(cursorPx.x + 7 * dpr, cursorPx.y - 11 * dpr, labelWidth + 6 * dpr, 21 * dpr);
            ctx.hoverCtx.fillStyle = fillStyle;
            ctx.hoverCtx.fillText(label, cursorPx.x + 9 * dpr, cursorPx.y + 5 * dpr);
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
        // the first point was placed at press (slot A at the press position); clear its drag preview
        wpd.graphicsWidget.resetHover();
        if (this._addBefore == null) {
            return; // press never placed a point (full count reached on mousedown)
        }
        const before = this._addBefore;
        const pair = this._pendingPair;
        // recompute the drag from the release position so a fast or off-canvas release (handled by
        // onDocumentMouseUp without an in-canvas mousemove) still triggers the pair's second point
        const dragged = this._isDraggingAdd || this._helpers.exceedsDragThreshold(this._pressPos, pos);
        const canPairDrag = pair != null && dragged &&
            this._calibration.getCount() < this._calibration.maxPointCount;

        if (canPairDrag) {
            // slot B at the release position, completing the atomic pair started on mousedown
            this._calibration.addPoint(imagePos.x, imagePos.y, 0, 0);
        }
        this._calibration.unselectAll();
        this._calibration.selectPoint(this._calibration.getCount() - 1);
        // snapshot AFTER selecting so redo restores the selection (arrow-nudge stays usable)
        const after = this._calibration.getStateSnapshot();
        if (canPairDrag) {
            this._undoManager().insertAction(new wpd.CalibrationPointsBatchAction(
                this._calibration, before, after, this._afterRestore));
        } else {
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
        this._addBefore = null;
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

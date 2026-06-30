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

// Live overlay for the editable auto-calibration review: draws the two detected axis rules and the
// per-axis tick marks the user is editing, each labeled with its current value. The selected tick is
// highlighted. Coordinates are image-px, matching the AutoCalibrationReview model and the frame tool
// handlers receive. Paired with wpd.AutoCalibrationEditTool, which mutates the same review.
wpd.AutoCalibrationRepainter = class {
    // valueAxis ('x' | 'y') restricts the overlay to a single calibrated axis for bar charts: that
    // rule and its ticks are emphasized, the categorical rule is drawn faint and tickless. Omitted
    // (null) for XY, where both rules and tick sets are drawn equally.
    constructor(review, valueAxis) {
        this._review = review;
        this._valueAxis = (valueAxis === 'x' || valueAxis === 'y') ? valueAxis : null;
        this.painterName = 'autoCalibrationRepainter';
    }

    onForcedRedraw() {
        wpd.graphicsWidget.resetData();
    }

    onRedraw() {
        const review = this._review;
        if (review == null) {
            return;
        }

        if (this._valueAxis === null) {
            wpd.graphicsHelper.drawLine(review.xAxis.p0, review.xAxis.p1, "rgba(0,120,255,0.8)");
            wpd.graphicsHelper.drawLine(review.yAxis.p0, review.yAxis.p1, "rgba(0,120,255,0.8)");

            // x-tick values read below the rule ('S' falls through drawPoint's default = below);
            // y-tick values read to the left ('W').
            this._drawTicks('x', 'S');
            this._drawTicks('y', 'W');
            return;
        }

        // Bar: emphasize the value axis, fade the categorical axis, and show only value-axis ticks so
        // it is visually clear which axis the user is calibrating (and which one the switch flips to).
        const strong = "rgba(0,120,255,0.8)";
        const faint = "rgba(0,120,255,0.22)";
        wpd.graphicsHelper.drawLine(review.xAxis.p0, review.xAxis.p1,
            this._valueAxis === 'x' ? strong : faint);
        wpd.graphicsHelper.drawLine(review.yAxis.p0, review.yAxis.p1,
            this._valueAxis === 'y' ? strong : faint);
        this._drawTicks(this._valueAxis, this._valueAxis === 'x' ? 'S' : 'W');
    }

    _drawTicks(axis, labelPosition) {
        const review = this._review;
        const list = review.getTicks(axis);
        const selected = review.selected;
        for (let i = 0; i < list.length; i++) {
            const tick = list[i];
            const isSelected = selected != null && selected.axis === axis && selected.index === i;
            const fillStyle = isSelected ? "rgba(0,200,0,1)" : "rgba(0,120,255,0.9)";
            const label = (tick.value != null && tick.value !== '') ? String(tick.value) : null;
            wpd.graphicsHelper.drawPoint(tick.px, fillStyle, label, labelPosition);
        }
    }
};

// GIMP-style editor for the auto-calibration review ticks. Left-click on empty space adds a tick on
// the nearest axis rule (snapped onto the rule); left-click on a tick grabs it for a constrained drag
// along its axis; Ctrl/Cmd-click removes a tick; Alt forces a fresh add even near a tick. Arrow keys
// nudge the selected tick along its axis; Delete/Backspace removes it. Every structural change calls
// back through onChange so the controller can refresh the value table and re-evaluate Apply. Review
// edits are transient (pre-calibration) and intentionally stay out of the global undo stack; the
// committed Apply is the single undo step.
wpd.AutoCalibrationEditTool = class {
    // valueAxis ('x' | 'y') confines all editing (hit-test, add, move, delete, nudge) to one axis for
    // bar charts so the categorical axis ticks can never be mutated. Omitted (null) for XY.
    constructor(review, onChange, valueAxis) {
        this._review = review;
        this._onChange = (typeof onChange === 'function') ? onChange : function() {};
        this._helpers = wpd.pointEditHelpers;
        this._valueAxis = (valueAxis === 'x' || valueAxis === 'y') ? valueAxis : null;

        this._mods = null;
        this._mode = 'noop'; // 'add' | 'move' | 'remove' | 'noop'
        this._gestureActive = false;
        this._suppressNextClick = false;
        this._moveAxis = null;
        this._moveIndex = -1;
        this._movingTick = null;
        this._grabOffset = null;
    }

    // Drop a hit on the non-value axis when editing is confined to one axis (bar mode), so categorical
    // ticks are never grabbed, moved, or deleted.
    _restrictHit(hit) {
        if (hit == null) {
            return null;
        }
        if (this._valueAxis !== null && hit.axis !== this._valueAxis) {
            return null;
        }
        return hit;
    }

    onMouseDown(ev, pos, imagePos) {
        if (ev.button !== 0) {
            return; // left button only
        }
        this._mods = this._helpers.captureModifiers(ev);
        this._gestureActive = true;
        this._suppressNextClick = false;
        this._mode = 'noop';
        this._moveAxis = null;
        this._moveIndex = -1;
        this._movingTick = null;
        this._grabOffset = null;

        const hit = this._restrictHit(
            this._review.findNearest(imagePos.x, imagePos.y, this._helpers.HIT_THRESHOLD));

        if (this._helpers.isRemoveModifier(this._mods)) {
            this._mode = 'remove';
            if (hit != null) {
                this._review.removeTick(hit.axis, hit.index);
                this._onChange('structure');
                wpd.graphicsWidget.forceHandlerRepaint();
            }
            return;
        }

        if (hit != null && this._mods.altKey !== true) {
            this._mode = 'move';
            this._moveAxis = hit.axis;
            this._moveIndex = hit.index;
            this._movingTick = this._review.getTicks(hit.axis)[hit.index];
            this._grabOffset = {
                x: this._movingTick.px.x - imagePos.x,
                y: this._movingTick.px.y - imagePos.y
            };
            this._review.selectTick(hit.axis, hit.index);
            this._onChange('select');
            wpd.graphicsWidget.forceHandlerRepaint();
            return;
        }

        // add a new tick: on the value axis in bar mode, otherwise on the nearest axis rule
        this._mode = 'add';
        const axis = this._valueAxis !== null ?
            this._valueAxis : this._review.nearestAxis(imagePos.x, imagePos.y);
        this._review.addTick(axis, imagePos.x, imagePos.y);
        this._onChange('structure');
        wpd.graphicsWidget.forceHandlerRepaint();
    }

    _hoverOp(ev, hit) {
        const mods = this._helpers.captureModifiers(ev);
        if (this._helpers.isRemoveModifier(mods)) {
            return hit != null ? 'remove' : 'noop';
        }
        if (mods.altKey) {
            return 'add';
        }
        return hit != null ? 'move' : 'add';
    }

    onMouseMove(ev, pos, imagePos) {
        const hit = this._restrictHit(
            this._review.findNearest(imagePos.x, imagePos.y, this._helpers.HIT_THRESHOLD));
        if (ev.target != null && ev.target.style != null) {
            if (this._mode === 'move') {
                ev.target.style.cursor = "grabbing";
            } else if (this._mode === 'add') {
                ev.target.style.cursor = "crosshair";
            } else {
                ev.target.style.cursor = this._helpers.cursorForOp(this._hoverOp(ev, hit));
            }
        }

        if (this._mode === 'move' && this._movingTick != null) {
            const offset = this._grabOffset != null ? this._grabOffset : {
                x: 0,
                y: 0
            };
            const target = wpd.graphicsWidget.clampImageToViewport(
                imagePos.x + offset.x, imagePos.y + offset.y);
            this._review.moveTick(this._moveAxis, this._moveIndex, target.x, target.y);
            wpd.graphicsWidget.forceHandlerRepaint();
            const p = this._movingTick.px;
            wpd.graphicsWidget.renderCursorAtImagePos(p.x, p.y, ev);
        }
    }

    // Drawn-cursor glyph state for the widget overlay: near a tick -> move (Alt forces add), remove
    // modifier over a tick -> remove, otherwise add.
    getHoverMode(imagePos, modSource) {
        if (this._gestureActive && this._mode === 'move') {
            return {
                mode: 'move',
                near: true
            };
        }
        const mods = this._helpers.captureModifiers(modSource);
        const hit = this._restrictHit(
            this._review.findNearest(imagePos.x, imagePos.y, this._helpers.HIT_THRESHOLD));
        if (this._helpers.isRemoveModifier(mods)) {
            return hit != null ? {
                mode: 'remove',
                near: true
            } : {
                mode: 'noop',
                near: false
            };
        }
        if (hit != null && mods.altKey !== true) {
            return {
                mode: 'move',
                near: true
            };
        }
        return {
            mode: 'add',
            near: false
        };
    }

    isMoveGestureActive() {
        return this._gestureActive && this._mode === 'move' && this._movingTick != null;
    }

    _finishGesture(ev, pos, imagePos) {
        if (!this._gestureActive) {
            return; // in-canvas mouseup already handled this gesture
        }
        this._gestureActive = false;
        this._suppressNextClick = true;

        if (this._mode === 'move' && this._movingTick != null) {
            // re-sort now that the drag is done; the moved tick keeps its identity so selection and the
            // table follow it to its new ordered position
            const moved = this._movingTick;
            this._review.sortAxis(this._moveAxis);
            const newIndex = this._review.indexOfTick(this._moveAxis, moved);
            this._review.selectTick(this._moveAxis, newIndex);
            this._onChange('structure');
            wpd.graphicsWidget.forceHandlerRepaint();
            wpd.graphicsWidget.updateZoomToImagePosn(moved.px.x, moved.px.y);
        }
        this._mode = 'noop';
        this._moveAxis = null;
        this._moveIndex = -1;
        this._movingTick = null;
        this._grabOffset = null;
    }

    onMouseUp(ev, pos, imagePos) {
        this._finishGesture(ev, pos, imagePos);
    }

    onDocumentMouseUp(ev, pos, imagePos) {
        this._finishGesture(ev, pos, imagePos);
    }

    onMouseClick(ev, pos, imagePos) {
        if (this._suppressNextClick) {
            this._suppressNextClick = false;
        }
    }

    onKeyDown(ev) {
        const selected = this._review.selected;
        if (selected == null) {
            return;
        }
        if (this._valueAxis !== null && selected.axis !== this._valueAxis) {
            return; // never nudge/delete a categorical-axis tick in bar mode
        }
        const axis = selected.axis;
        const index = selected.index;
        const list = this._review.getTicks(axis);
        if (index < 0 || index >= list.length) {
            return;
        }

        if (wpd.keyCodes.isDel(ev.keyCode) || wpd.keyCodes.isBackspace(ev.keyCode)) {
            this._review.removeTick(axis, index);
            this._onChange('structure');
            wpd.graphicsWidget.forceHandlerRepaint();
            ev.preventDefault();
            ev.stopPropagation();
            return;
        }

        const stepSize = ev.shiftKey === true ? 5 / wpd.graphicsWidget.getZoomRatio() :
            0.5 / wpd.graphicsWidget.getZoomRatio();
        const px = list[index].px;
        let x = px.x;
        let y = px.y;

        // Constrain the nudge to the tick's axis: x-ticks move horizontally, y-ticks vertically.
        if (axis === 'x') {
            if (wpd.keyCodes.isLeft(ev.keyCode)) {
                x = x - stepSize;
            } else if (wpd.keyCodes.isRight(ev.keyCode)) {
                x = x + stepSize;
            } else {
                return;
            }
        } else {
            if (wpd.keyCodes.isUp(ev.keyCode)) {
                y = y - stepSize;
            } else if (wpd.keyCodes.isDown(ev.keyCode)) {
                y = y + stepSize;
            } else {
                return;
            }
        }

        const moved = list[index];
        this._review.moveTick(axis, index, x, y);
        this._review.sortAxis(axis);
        this._review.selectTick(axis, this._review.indexOfTick(axis, moved));
        this._onChange('structure');
        wpd.graphicsWidget.forceHandlerRepaint();
        wpd.graphicsWidget.updateZoomToImagePosn(moved.px.x, moved.px.y);
        ev.preventDefault();
        ev.stopPropagation();
    }
};

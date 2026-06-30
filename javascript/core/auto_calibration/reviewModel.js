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

// Editable model for the auto-calibration Detect result. It holds the two detected axis rules (fixed)
// and per-axis lists of tick marks the user can add, move, delete, and assign label values to. Each
// tick is constrained to lie on its axis rule, so an x-tick carries the rule's y and a free x; a
// y-tick carries the rule's x and a free y. The review feeds wpd.autoCalibration.buildSuggestionFromReview
// on Apply. Pure geometry/data with no DOM or canvas dependency.
wpd.AutoCalibrationReview = class {
    // Build from a suggestion produced by wpd.autoCalibration.run: its axisResult provides the rules
    // and its tickResult provides the initial ticks (with OCR values attached to tick.value when the
    // OCR pass ran). Ticks are copied so editing never mutates the source suggestion.
    constructor(suggestion) {
        const axisResult = (suggestion != null) ? suggestion.axisResult : null;
        const tickResult = (suggestion != null) ? suggestion.tickResult : null;

        this.xAxis = (axisResult != null) ? axisResult.xAxis : {
            p0: {
                x: 0,
                y: 0
            },
            p1: {
                x: 0,
                y: 0
            }
        };
        this.yAxis = (axisResult != null) ? axisResult.yAxis : {
            p0: {
                x: 0,
                y: 0
            },
            p1: {
                x: 0,
                y: 0
            }
        };

        const scales = (suggestion != null && suggestion.scales != null) ? suggestion.scales : {};
        this.scales = {
            x: scales.x === 'log' ? 'log' : 'linear',
            y: scales.y === 'log' ? 'log' : 'linear'
        };

        this.xTicks = [];
        this.yTicks = [];
        if (tickResult != null) {
            (tickResult.x.ticks || []).forEach((t) => {
                this.xTicks.push(this._copyTick(t));
            });
            (tickResult.y.ticks || []).forEach((t) => {
                this.yTicks.push(this._copyTick(t));
            });
        }
        this._sort('x');
        this._sort('y');

        // currently highlighted tick, as {axis, index}, or null
        this.selected = null;
    }

    _copyTick(t) {
        return {
            px: {
                x: t.px.x,
                y: t.px.y
            },
            value: (t.value != null) ? String(t.value) : ''
        };
    }

    getTicks(axis) {
        return axis === 'x' ? this.xTicks : this.yTicks;
    }

    // y of the (horizontal) x-axis rule; x of the (vertical) y-axis rule.
    xAxisY() {
        return this.xAxis.p0.y;
    }

    yAxisX() {
        return this.yAxis.p0.x;
    }

    // Which axis rule a free image point is closest to. The x-axis is ~horizontal so proximity is the
    // vertical gap to its rule; the y-axis is ~vertical so proximity is the horizontal gap to its rule.
    nearestAxis(x, y) {
        const dToX = Math.abs(y - this.xAxisY());
        const dToY = Math.abs(x - this.yAxisX());
        return dToX <= dToY ? 'x' : 'y';
    }

    // Project a free point onto an axis rule so the tick lands on the rule.
    snapToAxis(axis, x, y) {
        if (axis === 'x') {
            return {
                x: x,
                y: this.xAxisY()
            };
        }
        return {
            x: this.yAxisX(),
            y: y
        };
    }

    // Add a tick on the given axis at the snapped position, keep the list sorted along the axis, select
    // it, and return its {axis, index}.
    addTick(axis, x, y) {
        const tick = {
            px: this.snapToAxis(axis, x, y),
            value: ''
        };
        this.getTicks(axis).push(tick);
        this._sort(axis);
        const index = this.indexOfTick(axis, tick);
        this.selected = {
            axis: axis,
            index: index
        };
        return this.selected;
    }

    // Move a tick to a new snapped position. Does not re-sort (call sortAxis on gesture commit) so the
    // index stays valid for the duration of a drag.
    moveTick(axis, index, x, y) {
        const list = this.getTicks(axis);
        if (index < 0 || index >= list.length) {
            return;
        }
        list[index].px = this.snapToAxis(axis, x, y);
    }

    removeTick(axis, index) {
        const list = this.getTicks(axis);
        if (index < 0 || index >= list.length) {
            return;
        }
        list.splice(index, 1);
        this.selected = null;
    }

    setValue(axis, index, value) {
        const list = this.getTicks(axis);
        if (index < 0 || index >= list.length) {
            return;
        }
        list[index].value = (value != null) ? String(value) : '';
    }

    selectTick(axis, index) {
        const list = this.getTicks(axis);
        if (index < 0 || index >= list.length) {
            this.selected = null;
            return;
        }
        this.selected = {
            axis: axis,
            index: index
        };
    }

    // Sort the axis list along its primary direction (x for the x-axis, y for the y-axis) so the table
    // and corner selection read in order.
    sortAxis(axis) {
        this._sort(axis);
    }

    _sort(axis) {
        if (axis === 'x') {
            this.xTicks.sort((a, b) => a.px.x - b.px.x);
        } else {
            this.yTicks.sort((a, b) => a.px.y - b.px.y);
        }
    }

    // Index of a tick object within its axis list (by identity), or -1.
    indexOfTick(axis, tick) {
        return this.getTicks(axis).indexOf(tick);
    }

    // Nearest tick across both axes within threshold image-px, as {axis, index, dist}, or null.
    findNearest(x, y, threshold) {
        let best = null;
        ['x', 'y'].forEach((axis) => {
            const list = this.getTicks(axis);
            for (let i = 0; i < list.length; i++) {
                const p = list[i].px;
                const dx = p.x - x;
                const dy = p.y - y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= threshold && (best === null || dist < best.dist)) {
                    best = {
                        axis: axis,
                        index: i,
                        dist: dist
                    };
                }
            }
        });
        return best;
    }
};

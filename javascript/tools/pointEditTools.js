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

// Shared helpers for the GIMP-style point editing tools (dataset point picking and axis
// calibration). The graphics widget already hands tools normalized image coordinates and the raw
// MouseEvent, so modifier and gesture semantics live here and in the tools, not in the widget.
wpd.pointEditHelpers = {
    // Screen/CSS-px movement above which a press-drag-release counts as a drag rather than a click.
    DRAG_THRESHOLD: 5,

    // Image-px hit-test radius for grabbing/removing an existing point.
    HIT_THRESHOLD: 12.5,

    // Custom "remove" cursor: a red disc with a white X, hotspot at its center (12,12). No native
    // cursor reads as "delete", so this makes Ctrl/Cmd-to-remove unambiguous. Falls back to the
    // not-allowed keyword if SVG cursors are unavailable.
    REMOVE_CURSOR: "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='24'%20height='24'%3E%3Ccircle%20cx='12'%20cy='12'%20r='10'%20fill='%23d00'/%3E%3Cline%20x1='8'%20y1='8'%20x2='16'%20y2='16'%20stroke='%23fff'%20stroke-width='3'/%3E%3Cline%20x1='16'%20y1='8'%20x2='8'%20y2='16'%20stroke='%23fff'%20stroke-width='3'/%3E%3C/svg%3E\") 12 12, not-allowed",

    // Map a would-be click operation to the cursor that signals it.
    cursorForOp: function(op) {
        switch (op) {
            case 'add':
                return 'crosshair';
            case 'move':
                return 'grab';
            case 'remove':
                return wpd.pointEditHelpers.REMOVE_CURSOR;
            default:
                return 'default'; // the modifier would do nothing at this position
        }
    },

    // Capture button + modifier state on mousedown so the whole gesture uses one consistent
    // operation; a modifier released before mouseup must not flip add/move/remove.
    captureModifiers: function(ev) {
        return {
            button: ev.button,
            shiftKey: ev.shiftKey === true,
            ctrlKey: ev.ctrlKey === true,
            metaKey: ev.metaKey === true,
            altKey: ev.altKey === true
        };
    },

    // True when the pointer moved far enough from the press position to be a drag.
    exceedsDragThreshold: function(startPos, pos) {
        if (startPos == null || pos == null) {
            return false;
        }
        const dx = pos.x - startPos.x;
        const dy = pos.y - startPos.y;
        return Math.sqrt(dx * dx + dy * dy) > wpd.pointEditHelpers.DRAG_THRESHOLD;
    },

    // True when the ctrl or meta (Cmd) key was held: the "remove" modifier.
    isRemoveModifier: function(mods) {
        return mods.ctrlKey === true || mods.metaKey === true;
    }
};

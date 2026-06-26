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

    // Image-px hit-test radius. Matches the long-standing dataset/calibration feel.
    HIT_THRESHOLD: 50,

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

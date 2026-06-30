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

// Base class for all undoable actions. Defined here (loaded before imageEditing.js and
// pointUndoActions.js in both the build concat order and the HTML manifests) so subclasses can
// extend it at class-definition time.
//
// Contract: a tool MUTATES the model first, then inserts an already-applied action into the
// UndoManager. undo() reverses the mutation; execute() re-applies it on redo. insertAction() does
// not call execute().
wpd.ReversibleAction = class {
    constructor() {}
    execute() {}
    undo() {}
};

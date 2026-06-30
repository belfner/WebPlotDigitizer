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

// Each mask tool accepts an options object:
//   autoDetector : the AutoDetectionData to flush the painted mask into. null resolves to the
//                  active dataset detector at flush time, so no-arg callers keep current behavior.
//   ids          : DOM id map for the mask controls (defaults to the acquire-data sidebar ids).
//   clearToolbarOnRemove : whether onRemove() clears the toolbar (defaults to true).
//   recordUndo   : whether mask edits push an undoable MaskEditAction (defaults to true; the
//                  auto-calibration transient detector opts out).
//   initialMode  : brush default mode, 'paint' or 'erase' (defaults to 'paint').
wpd._resolveMaskToolOptions = function(options) {
    const opts = options || {};
    return {
        autoDetector: opts.autoDetector != null ? opts.autoDetector : null,
        ids: opts.ids != null ? opts.ids : wpd.dataMask.defaultMaskControlIds,
        clearToolbarOnRemove: opts.clearToolbarOnRemove !== false,
        recordUndo: opts.recordUndo !== false,
        initialMode: opts.initialMode === 'erase' ? 'erase' : 'paint'
    };
};

wpd.BoxMaskTool = class {
    constructor(options) {
        const opts = wpd._resolveMaskToolOptions(options);
        this._autoDetector = opts.autoDetector;
        this._ids = opts.ids;
        this._recordUndo = opts.recordUndo;
        // Right-button erases a box region; suppress the browser context menu while active.
        this.suppressContextMenu = true;
        this.isDrawing = false;
        this.erase = false;
        this.topImageCorner = null;
        this.topScreenCorner = null;
        this.moveTimer = null;
        this.screenPos = null;
        this.canvasPos = null;
        this.mouseOutPos = null;
        this.mouseOutImagePos = null;
        this._beforeRle = null;
    }

    mouseMoveHandler() {
        if (this.isDrawing === false) {
            return;
        }
        let ctx = wpd.graphicsWidget.getAllContexts();
        wpd.graphicsWidget.resetHover();
        ctx.hoverCtx.strokeStyle = "rgb(0,0,0)";
        ctx.hoverCtx.strokeRect(this.topScreenCorner.x, this.topScreenCorner.y,
            this.canvasPos.x - this.topScreenCorner.x,
            this.canvasPos.y - this.topScreenCorner.y);
    }

    mouseUpHandler(ev, pos, imagePos) {
        if (this.isDrawing === false) {
            return;
        }
        clearTimeout(this.moveTimer);
        let ctx = wpd.graphicsWidget.getAllContexts();
        this.isDrawing = false;
        wpd.graphicsWidget.resetHover();
        // Left-drag adds the rectangle (paint), right-drag removes it (erase). Paint uses
        // source-over yellow; erase uses destination-out to clear existing mask pixels.
        let op = this.erase ? "destination-out" : "source-over";
        let style = this.erase ? "rgba(0,0,0,1)" : "rgba(255,255,0,0.5)";
        ctx.dataCtx.globalCompositeOperation = op;
        ctx.oriDataCtx.globalCompositeOperation = op;
        ctx.dataCtx.fillStyle = style;
        let canvasPos = wpd.graphicsWidget.imageToCanvasPx(imagePos.x, imagePos.y);
        ctx.dataCtx.fillRect(this.topScreenCorner.x, this.topScreenCorner.y,
            canvasPos.x - this.topScreenCorner.x, canvasPos.y - this.topScreenCorner.y);
        ctx.oriDataCtx.fillStyle = style;
        ctx.oriDataCtx.fillRect(this.topImageCorner.x, this.topImageCorner.y,
            imagePos.x - this.topImageCorner.x,
            imagePos.y - this.topImageCorner.y);
        ctx.dataCtx.globalCompositeOperation = "source-over";
        ctx.oriDataCtx.globalCompositeOperation = "source-over";
        // Flush the freshly painted box into the target detector on each completed draw.
        wpd.dataMask.grabMask(this._autoDetector);
        wpd.dataMask.recordMaskEdit(this._autoDetector, this._beforeRle, this._recordUndo);
    }

    onAttach() {
        wpd.graphicsWidget.setRepainter(new wpd.MaskPainter(this._autoDetector, {
            ids: this._ids
        }));
        document.getElementById(this._ids.box).classList.add('pressed-button');
        document.getElementById(this._ids.view).classList.add('pressed-button');
    }

    onMouseDown(ev, pos, imagePos) {
        if (this.isDrawing === true)
            return;
        this.erase = ev.button === 2;
        this._beforeRle = wpd.dataMask.snapshotMask(this._autoDetector);
        this.isDrawing = true;
        this.topImageCorner = imagePos;
        this.topScreenCorner = wpd.graphicsWidget.imageToCanvasPx(imagePos.x, imagePos.y);
    }

    onMouseMove(ev, pos, imagePos) {
        if (this.isDrawing === false)
            return;
        this.canvasPos = wpd.graphicsWidget.imageToCanvasPx(imagePos.x, imagePos.y);
        this.mouseMoveHandler();
    };

    onMouseOut(ev, pos, imagePos) {
        if (this.isDrawing === true) {
            clearTimeout(this.moveTimer);
            this.mouseOutPos = pos;
            this.mouseOutImagePos = imagePos;
        }
    };

    onDocumentMouseUp(ev, pos, imagePos) {
        if (this.mouseOutPos != null && this.mouseOutImagePos != null) {
            this.mouseUpHandler(ev, this.mouseOutPos, this.mouseOutImagePos);
        } else {
            this.mouseUpHandler(ev, pos, imagePos);
        }
        this.mouseOutPos = null;
        this.mouseOutImagePos = null;
    };

    onMouseUp(ev, pos, imagePos) {
        this.mouseUpHandler(ev, pos, imagePos);
    };

    onRemove() {
        document.getElementById(this._ids.box).classList.remove('pressed-button');
        document.getElementById(this._ids.view).classList.remove('pressed-button');
        wpd.dataMask.grabMask(this._autoDetector);
    };

};

// One brush tool for both painting and erasing the mask. The default mode comes from which
// toolbar button launched it (pen -> paint, erase -> erase); the right mouse button flips the
// mode for the duration of a single stroke. Paint composites source-over yellow, erase composites
// destination-out. Strokes are drawn as round-capped segments between consecutive samples (plus a
// circle dab on mouse-down so a click leaves a dot), giving a continuous round footprint without
// the sample-dropping debounce the old tools used.
wpd.BrushMaskTool = (function() {
    var Tool = function(options) {
        const opts = wpd._resolveMaskToolOptions(options);
        const autoDetector = opts.autoDetector;
        const ids = opts.ids;
        const clearToolbarOnRemove = opts.clearToolbarOnRemove;
        const recordUndo = opts.recordUndo;
        const defaultMode = opts.initialMode;
        const modeButtonId = defaultMode === 'erase' ? ids.erase : ids.pen;

        var ctx = wpd.graphicsWidget.getAllContexts(),
            isDrawing = false,
            erase = false,
            beforeRle = null,
            thicknessScreen = 1,
            thicknessImage = 1,
            canvasPoints = [],
            imagePoints = [];

        // The contextmenu listener in graphicsWidget checks this flag so right-button erase is not
        // interrupted by the browser context menu.
        this.suppressContextMenu = true;

        function applyBrushStyle() {
            let op = erase ? "destination-out" : "source-over";
            // Paint at the same 50% alpha the committed mask overlay uses, so the chart stays
            // visible through the stroke while drawing. Erase composites destination-out at full
            // strength to fully remove mask pixels. 50% yellow over the transparent mask layer
            // still reads back as exact RGB (255,255,0) with alpha > 0, so grabMaskInto matches.
            let style = erase ? "rgba(0,0,0,1)" : "rgba(255,255,0,0.5)";
            ctx.dataCtx.globalCompositeOperation = op;
            ctx.oriDataCtx.globalCompositeOperation = op;
            ctx.dataCtx.strokeStyle = style;
            ctx.dataCtx.fillStyle = style;
            ctx.oriDataCtx.strokeStyle = style;
            ctx.oriDataCtx.fillStyle = style;
            ctx.dataCtx.lineWidth = thicknessScreen;
            ctx.oriDataCtx.lineWidth = thicknessImage;
            ctx.dataCtx.lineCap = "round";
            ctx.dataCtx.lineJoin = "round";
            ctx.oriDataCtx.lineCap = "round";
            ctx.oriDataCtx.lineJoin = "round";
        }

        function resetOp() {
            ctx.dataCtx.globalCompositeOperation = "source-over";
            ctx.oriDataCtx.globalCompositeOperation = "source-over";
            ctx.dataCtx.lineWidth = 1;
            ctx.oriDataCtx.lineWidth = 1;
        }

        // Clear only the on-screen mask layer, ignoring its current transform.
        function clearScreenData() {
            let c = ctx.dataCtx;
            c.save();
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.clearRect(0, 0, c.canvas.width, c.canvas.height);
            c.restore();
        }

        // Draw the whole accumulated stroke in one composite operation. A single stroke() of the
        // full polyline does not compound alpha where its round-capped segments overlap at joints
        // (which per-segment stroking does), so the live overlay stays at a uniform 50%. A lone
        // point (click without drag) leaves a round dab.
        function drawWholeStroke(targetCtx, points, radius) {
            targetCtx.beginPath();
            if (points.length === 1) {
                targetCtx.arc(points[0].x, points[0].y, radius, 0, 2 * Math.PI);
                targetCtx.fill();
                return;
            }
            targetCtx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                targetCtx.lineTo(points[i].x, points[i].y);
            }
            targetCtx.stroke();
        }

        // Repaint the committed mask from the backing layer, then lay the in-progress stroke over
        // it as one composite op. oriData is left untouched during the drag so it keeps holding
        // only the committed mask for this restore; the stroke is flushed to it at finishStroke.
        function renderLivePreview(screenPos) {
            clearScreenData();
            wpd.graphicsWidget.copyImageDataLayerToScreen();
            applyBrushStyle();
            drawWholeStroke(ctx.dataCtx, canvasPoints, thicknessScreen / 2);
            resetOp();
            drawHoverRing(screenPos);
        }

        function drawHoverRing(pos) {
            let lwidth = parseInt(document.getElementById(ids.brushThickness).value, 10);
            let radius = Math.max((lwidth / 2) * wpd.graphicsWidget.getZoomRatio(), 1);
            let canvasPos = wpd.graphicsWidget.screenToCanvasPx(pos.x, pos.y);
            // During an active stroke `erase` holds the effective per-stroke mode (right button
            // flips it); when idle, fall back to the tool's default mode. This keeps the ring
            // visible and correctly colored while erasing, where no paint change is drawn.
            let eraseMode = isDrawing === true ? erase : defaultMode === 'erase';
            wpd.graphicsWidget.resetHover();
            ctx.hoverCtx.strokeStyle = eraseMode ? "rgba(255,0,0,0.9)" :
                "rgba(255,200,0,0.9)";
            ctx.hoverCtx.lineWidth = 1;
            ctx.hoverCtx.beginPath();
            ctx.hoverCtx.arc(canvasPos.x, canvasPos.y, radius, 0, 2 * Math.PI);
            ctx.hoverCtx.stroke();
        }

        function finishStroke() {
            if (isDrawing === false) {
                return;
            }
            isDrawing = false;
            // Commit the whole stroke onto the backing layer in one composite op (the on-screen
            // preview was transient), then flush into the detector and record one undoable edit.
            applyBrushStyle();
            drawWholeStroke(ctx.oriDataCtx, imagePoints, thicknessImage / 2);
            resetOp();
            wpd.dataMask.grabMask(autoDetector);
            wpd.dataMask.recordMaskEdit(autoDetector, beforeRle, recordUndo);
            // Repaint the overlay from the committed model so the screen settles to a clean
            // uniform 50% (matching the persistent overlay).
            wpd.dataMask.renderMaskToCanvas();
        }

        this.onAttach = function() {
            wpd.graphicsWidget.setRepainter(new wpd.MaskPainter(autoDetector, {
                ids: ids
            }));
            document.getElementById(modeButtonId).classList.add('pressed-button');
            document.getElementById(ids.view).classList.add('pressed-button');
            document.getElementById(ids.brushContainer).style.display = 'block';
        };

        this.onMouseDown = function(ev, pos, imagePos) {
            if (isDrawing === true)
                return;
            // Right button flips the default mode for this stroke; left button uses the default.
            erase = ev.button === 2 ? defaultMode !== 'erase' : defaultMode === 'erase';
            let lwidth = parseInt(document.getElementById(ids.brushThickness).value, 10);
            thicknessScreen = lwidth * wpd.graphicsWidget.getZoomRatio();
            thicknessImage = lwidth;
            beforeRle = wpd.dataMask.snapshotMask(autoDetector);
            isDrawing = true;
            canvasPoints = [wpd.graphicsWidget.screenToCanvasPx(pos.x, pos.y)];
            imagePoints = [{
                x: imagePos.x,
                y: imagePos.y
            }];
            renderLivePreview(pos);
        };

        this.onMouseMove = function(ev, pos, imagePos) {
            if (isDrawing === true) {
                canvasPoints.push(wpd.graphicsWidget.screenToCanvasPx(pos.x, pos.y));
                imagePoints.push({
                    x: imagePos.x,
                    y: imagePos.y
                });
                renderLivePreview(pos);
            } else {
                drawHoverRing(pos);
            }
        };

        this.onMouseUp = function(ev, pos, imagePos) {
            finishStroke();
        };

        // A drag that releases outside the canvas still completes here (the document-level mouseup
        // fires even when the pointer has left the canvas). finishStroke is idempotent, so the
        // canvas mouseup and this document mouseup cannot double-commit.
        this.onDocumentMouseUp = function(ev, pos, imagePos) {
            finishStroke();
        };

        this.onMouseOut = function(ev, pos, imagePos) {
            // Clear only the preview ring; the stroke (if any) finishes on mouseup.
            wpd.graphicsWidget.resetHover();
        };

        this.onRemove = function() {
            document.getElementById(modeButtonId).classList.remove('pressed-button');
            document.getElementById(ids.view).classList.remove('pressed-button');
            document.getElementById(ids.brushContainer).style.display = 'none';
            wpd.graphicsWidget.resetHover();
            wpd.dataMask.grabMask(autoDetector);
            if (clearToolbarOnRemove) {
                wpd.toolbar.clear();
            }
        };
    };
    return Tool;
})();

wpd.ViewMaskTool = (function() {
    var Tool = function(options) {
        const opts = wpd._resolveMaskToolOptions(options);
        const autoDetector = opts.autoDetector;
        const ids = opts.ids;

        this.onAttach = function() {
            wpd.graphicsWidget.setRepainter(new wpd.MaskPainter(autoDetector, {
                ids: ids
            }));
            document.getElementById(ids.view).classList.add('pressed-button');
        };

        this.onRemove = function() {
            document.getElementById(ids.view).classList.remove('pressed-button');
            wpd.dataMask.grabMask(autoDetector);
        };
    };

    return Tool;
})();

wpd.MaskPainter = (function() {
    var Painter = function(autoDetector, options) {
        let ctx = wpd.graphicsWidget.getAllContexts();
        // A null/undefined detector resolves to the active dataset detector, preserving the
        // historical no-arg behavior. A transient detector (auto-calibration session) is repainted
        // and re-grabbed in isolation and never touches the active dataset mask.
        let targetDetector = wpd.dataMask.resolveAutoDetectionData(autoDetector);

        let painter = function() {
            if (targetDetector.mask == null || targetDetector.mask.size === 0) {
                return;
            }
            let imageSize = wpd.graphicsWidget.getImageSize();
            let imgData = ctx.oriDataCtx.getImageData(0, 0, imageSize.width, imageSize.height);

            for (let img_index of targetDetector.mask) {
                imgData.data[img_index * 4] = 255;
                imgData.data[img_index * 4 + 1] = 255;
                imgData.data[img_index * 4 + 2] = 0;
                imgData.data[img_index * 4 + 3] = 255 / 2;
            }

            ctx.oriDataCtx.putImageData(imgData, 0, 0);
            wpd.graphicsWidget.copyImageDataLayerToScreen();
        };

        this.preventGrab = false;

        this.painterName = 'dataMaskPainter';

        this.onRedraw = function() {
            if (wpd.graphicsWidget.isViewportRender()) {
                // pan/zoom: blit the cached mask layer, do not re-grab or rebuild
                wpd.graphicsWidget.copyImageDataLayerToScreen();
                return;
            }
            if (!this.preventGrab) {
                // Re-grab into the injected detector only. This never resolves to the active
                // dataset detector when a transient detector was injected.
                wpd.dataMask.grabMaskInto(targetDetector);
            }
            painter();
        };

        this.onAttach = function() {
            this.preventGrab = true;
            wpd.graphicsWidget.resetData();
            this.preventGrab = false;
        };
    };
    return Painter;
})();

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
wpd._resolveMaskToolOptions = function(options) {
    const opts = options || {};
    return {
        autoDetector: opts.autoDetector != null ? opts.autoDetector : null,
        ids: opts.ids != null ? opts.ids : wpd.dataMask.defaultMaskControlIds,
        clearToolbarOnRemove: opts.clearToolbarOnRemove !== false
    };
};

wpd.BoxMaskTool = class {
    constructor(options) {
        const opts = wpd._resolveMaskToolOptions(options);
        this._autoDetector = opts.autoDetector;
        this._ids = opts.ids;
        this.isDrawing = false;
        this.topImageCorner = null;
        this.topScreenCorner = null;
        this.moveTimer = null;
        this.screenPos = null;
        this.canvasPos = null;
        this.mouseOutPos = null;
        this.mouseOutImagePos = null;
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
        ctx.dataCtx.globalCompositeOperation = "xor";
        ctx.oriDataCtx.globalCompositeOperation = "xor";
        ctx.dataCtx.fillStyle = "rgba(255,255,0,0.5)";
        let canvasPos = wpd.graphicsWidget.imageToCanvasPx(imagePos.x, imagePos.y);
        ctx.dataCtx.fillRect(this.topScreenCorner.x, this.topScreenCorner.y,
            canvasPos.x - this.topScreenCorner.x, canvasPos.y - this.topScreenCorner.y);
        ctx.oriDataCtx.fillStyle = "rgba(255,255,0,0.5)";
        ctx.oriDataCtx.fillRect(this.topImageCorner.x, this.topImageCorner.y,
            imagePos.x - this.topImageCorner.x,
            imagePos.y - this.topImageCorner.y);
        // Flush the freshly painted box into the target detector on each completed draw.
        wpd.dataMask.grabMask(this._autoDetector);
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

wpd.PenMaskTool = (function() {
    var Tool = function(options) {
        const opts = wpd._resolveMaskToolOptions(options);
        const autoDetector = opts.autoDetector;
        const ids = opts.ids;
        const clearToolbarOnRemove = opts.clearToolbarOnRemove;
        var strokeWidth, ctx = wpd.graphicsWidget.getAllContexts(),
            isDrawing = false,
            moveTimer,
            screen_pos, canvas_pos, image_pos, mouseMoveHandler = function() {
                ctx.dataCtx.globalCompositeOperation = "xor";
                ctx.oriDataCtx.globalCompositeOperation = "xor";
                ctx.dataCtx.strokeStyle = "rgba(255,255,0,0.5)";
                ctx.dataCtx.lineTo(canvas_pos.x, canvas_pos.y);
                ctx.dataCtx.stroke();

                ctx.oriDataCtx.strokeStyle = "rgba(255,255,0,0.5)";
                ctx.oriDataCtx.lineTo(image_pos.x, image_pos.y);
                ctx.oriDataCtx.stroke();
                ctx.dataCtx.globalCompositeOperation = "source-over";
                ctx.oriDataCtx.globalCompositeOperation = "source-over";
            };

        this.onAttach = function() {
            wpd.graphicsWidget.setRepainter(new wpd.MaskPainter(autoDetector, {
                ids: ids
            }));
            document.getElementById(ids.pen).classList.add('pressed-button');
            document.getElementById(ids.view).classList.add('pressed-button');
            document.getElementById(ids.paintContainer).style.display = 'block';
        };

        this.onMouseDown = function(ev, pos, imagePos) {
            if (isDrawing === true)
                return;
            let lwidth = parseInt(document.getElementById(ids.paintThickness).value, 10);
            let canvasPos = wpd.graphicsWidget.screenToCanvasPx(pos.x, pos.y);
            isDrawing = true;
            ctx.dataCtx.globalCompositeOperation = "xor";
            ctx.oriDataCtx.globalCompositeOperation = "xor";
            ctx.dataCtx.strokeStyle = "rgba(255,255,0,0.5)";
            ctx.dataCtx.lineWidth = lwidth * wpd.graphicsWidget.getZoomRatio();
            ctx.dataCtx.beginPath();
            ctx.dataCtx.moveTo(canvasPos.x, canvasPos.y);

            ctx.oriDataCtx.strokeStyle = "rgba(255,255,0,0.5)";
            ctx.oriDataCtx.lineWidth = lwidth;
            ctx.oriDataCtx.beginPath();
            ctx.oriDataCtx.moveTo(imagePos.x, imagePos.y);
            ctx.dataCtx.globalCompositeOperation = "source-over";
            ctx.oriDataCtx.globalCompositeOperation = "source-over";
        };

        this.onMouseMove = function(ev, pos, imagePos) {
            if (isDrawing === false)
                return;
            screen_pos = pos;
            canvas_pos = wpd.graphicsWidget.screenToCanvasPx(pos.x, pos.y);
            image_pos = imagePos;
            clearTimeout(moveTimer);
            moveTimer = setTimeout(mouseMoveHandler, 2);
        };

        this.onMouseUp = function(ev, pos, imagePos) {
            clearTimeout(moveTimer);
            ctx.dataCtx.closePath();
            ctx.dataCtx.lineWidth = 1;
            ctx.oriDataCtx.closePath();
            ctx.oriDataCtx.lineWidth = 1;
            isDrawing = false;
            // Flush the freshly painted stroke into the target detector on each completed draw.
            wpd.dataMask.grabMask(autoDetector);
        };

        this.onMouseOut = function(ev, pos, imagePos) {
            this.onMouseUp(ev, pos, imagePos);
        };

        this.onRemove = function() {
            document.getElementById(ids.pen).classList.remove('pressed-button');
            document.getElementById(ids.view).classList.remove('pressed-button');
            document.getElementById(ids.paintContainer).style.display = 'none';
            wpd.dataMask.grabMask(autoDetector);
            if (clearToolbarOnRemove) {
                wpd.toolbar.clear();
            }
        };
    };
    return Tool;
})();

wpd.EraseMaskTool = (function() {
    var Tool = function(options) {
        const opts = wpd._resolveMaskToolOptions(options);
        const autoDetector = opts.autoDetector;
        const ids = opts.ids;
        const clearToolbarOnRemove = opts.clearToolbarOnRemove;
        var strokeWidth, ctx = wpd.graphicsWidget.getAllContexts(),
            isDrawing = false,
            moveTimer,
            screen_pos, canvas_pos, image_pos, mouseMoveHandler = function() {
                ctx.dataCtx.globalCompositeOperation = "destination-out";
                ctx.oriDataCtx.globalCompositeOperation = "destination-out";

                ctx.dataCtx.strokeStyle = "rgba(255,255,0,1)";
                ctx.dataCtx.lineTo(canvas_pos.x, canvas_pos.y);
                ctx.dataCtx.stroke();

                ctx.oriDataCtx.strokeStyle = "rgba(255,255,0,1)";
                ctx.oriDataCtx.lineTo(image_pos.x, image_pos.y);
                ctx.oriDataCtx.stroke();
                ctx.dataCtx.globalCompositeOperation = "source-over";
                ctx.oriDataCtx.globalCompositeOperation = "source-over";
            };

        this.onAttach = function() {
            wpd.graphicsWidget.setRepainter(new wpd.MaskPainter(autoDetector, {
                ids: ids
            }));
            document.getElementById(ids.erase).classList.add('pressed-button');
            document.getElementById(ids.view).classList.add('pressed-button');
            document.getElementById(ids.eraseContainer).style.display = 'block';
        };

        this.onMouseDown = function(ev, pos, imagePos) {
            if (isDrawing === true)
                return;
            let lwidth = parseInt(document.getElementById(ids.eraseThickness).value, 10);
            let canvasPos = wpd.graphicsWidget.screenToCanvasPx(pos.x, pos.y);
            isDrawing = true;
            ctx.dataCtx.globalCompositeOperation = "destination-out";
            ctx.oriDataCtx.globalCompositeOperation = "destination-out";

            ctx.dataCtx.strokeStyle = "rgba(0,0,0,1)";
            ctx.dataCtx.lineWidth = lwidth * wpd.graphicsWidget.getZoomRatio();
            ctx.dataCtx.beginPath();
            ctx.dataCtx.moveTo(canvasPos.x, canvasPos.y);

            ctx.oriDataCtx.strokeStyle = "rgba(0,0,0,1)";
            ctx.oriDataCtx.lineWidth = lwidth;
            ctx.oriDataCtx.beginPath();
            ctx.oriDataCtx.moveTo(imagePos.x, imagePos.y);
            ctx.dataCtx.globalCompositeOperation = "source-over";
            ctx.oriDataCtx.globalCompositeOperation = "source-over";
        };

        this.onMouseMove = function(ev, pos, imagePos) {
            if (isDrawing === false)
                return;
            screen_pos = pos;
            image_pos = imagePos;
            canvas_pos = wpd.graphicsWidget.screenToCanvasPx(pos.x, pos.y);
            clearTimeout(moveTimer);
            moveTimer = setTimeout(mouseMoveHandler, 2);
        };

        this.onMouseOut = function(ev, pos, imagePos) {
            this.onMouseUp(ev, pos, imagePos);
        };

        this.onMouseUp = function(ev, pos, imagePos) {
            clearTimeout(moveTimer);
            ctx.dataCtx.closePath();
            ctx.dataCtx.lineWidth = 1;
            ctx.oriDataCtx.closePath();
            ctx.oriDataCtx.lineWidth = 1;

            ctx.dataCtx.globalCompositeOperation = "source-over";
            ctx.oriDataCtx.globalCompositeOperation = "source-over";

            isDrawing = false;
            // Flush the remaining mask into the target detector on each completed erase.
            wpd.dataMask.grabMask(autoDetector);
        };

        this.onRemove = function() {
            document.getElementById(ids.erase).classList.remove('pressed-button');
            document.getElementById(ids.view).classList.remove('pressed-button');
            document.getElementById(ids.eraseContainer).style.display = 'none';
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

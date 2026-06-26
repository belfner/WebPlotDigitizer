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

/* 
    Multi-layered canvas widget to display plot, data, graphics etc. 

    coordinate frames:
        - screen: 
            - x,y pixels on the screen (relative to top-left origin of the canvas)
            - mouse events are in this frame
        - canvas: x,y pixels on the canvas before rotation, but after scaling
        - image: x,y pixels on the image

        flow: image -> scale -> canvas px -> rotate -> screen px
*/
var wpd = wpd || {};

wpd.graphicsWidget = (function() {
    let $mainCanvas = null; // original picture is displayed here
    let $dataCanvas = null; // data points
    let $drawCanvas = null; // selection region graphics etc
    let $hoverCanvas = null; // temp graphics while drawing
    let $topCanvas = null; // top level, handles mouse events
    let $oriImageCanvas = null;
    let $oriDataCanvas = null;
    let $tempImageCanvas = null;

    let $canvasDiv = null;
    let $graphicsContainer = null; // scrollable viewport that holds canvasDiv

    let mainCtx = null;
    let dataCtx = null;
    let drawCtx = null;
    let hoverCtx = null;
    let topCtx = null;

    let oriImageCtx = null;
    let oriDataCtx = null;
    let tempImageCtx = null;

    let width = 0.0;
    let height = 0.0;
    let originalWidth = 0.0;
    let originalHeight = 0.0;

    let aspectRatio = 1.0;
    let originalImageData = null;
    let zoomRatio = 1.0;
    let extendedCrosshair = false;
    let activeTool = null;
    let repaintHandler = null;
    let isCanvasInFocus = false;
    let rotation = 0;
    let dpRatio = 1;

    // Pan offset: display-image px (post-rotation) at the viewport's top-left
    // corner. The viewport renders a scaled window of the source starting here.
    let panX = 0;
    let panY = 0;

    // True while render() repaints for a pure view change (pan/zoom/resize). In
    // this mode handlers repaint on-screen layers only and leave the
    // image-resolution oriData layer (export/mask cache) untouched, so view
    // changes neither re-accumulate translucent strokes nor rebuild masks.
    let viewportRender = false;

    // Checkerboard fill shown in viewport margins that fall outside the image.
    let bgPattern = null;

    // Pan / resize re-renders are coalesced into one per animation frame.
    let renderFrameId = null;

    const WHEEL_ZOOM_STEP = 1.2; // zoom multiplier per wheel notch
    const MAX_ZOOM_RATIO = 8; // upper bound on screen px per image px (tune as needed)

    // Wheel zoom is coalesced into a single update per animation frame.
    let pendingZoomFactor = 1;
    let pendingZoomCursor = null;
    let zoomFrameId = null;

    // Middle-mouse drag panning state.
    let isPanning = false;
    let panStart = null;

    // Magnifier hover update is throttled to one per animation frame.
    let pendingHoverEvent = null;
    let hoverFrameId = null;

    function posn(ev) { // get screen pixel from event
        let mainCanvasPosition = $mainCanvas.getBoundingClientRect();
        return {
            x: parseInt(ev.pageX - (mainCanvasPosition.left + window.scrollX), 10),
            y: parseInt(ev.pageY - (mainCanvasPosition.top + window.scrollY), 10)
        };
    }

    // Display-image dimensions (image px), accounting for 90/270 rotation swap.
    function getDisplayDims() {
        return (rotation % 180 === 0) ?
            { w: originalWidth, h: originalHeight } :
            { w: originalHeight, h: originalWidth };
    }

    // Viewport size in device px (the backing-store resolution of each canvas).
    function getViewportDeviceSize() {
        const vp = wpd.layoutManager.getGraphicsViewportSize();
        return {
            w: Math.round(vp.width * dpRatio),
            h: Math.round(vp.height * dpRatio)
        };
    }

    // original-image px -> display-image px (post-rotation)
    function imageToDisplayPx(imageX, imageY) {
        return (rotation === 0) ? { x: imageX, y: imageY } :
            getRotatedCoordinates(0, rotation, imageX, imageY);
    }

    // display-image px -> original-image px
    function displayToImagePx(displayX, displayY) {
        return (rotation === 0) ? { x: displayX, y: displayY } :
            getRotatedCoordinates(rotation, 0, displayX, displayY);
    }

    // screen px (CSS, relative to viewport top-left) -> image px
    function screenToImagePx(screenX, screenY) {
        const displayX = panX + screenX * dpRatio / zoomRatio;
        const displayY = panY + screenY * dpRatio / zoomRatio;
        return displayToImagePx(displayX, displayY);
    }

    // image px -> canvas px (device px on the viewport-sized canvas)
    function imageToCanvasPx(imageX, imageY) {
        const d = imageToDisplayPx(imageX, imageY);
        return {
            x: (d.x - panX) * zoomRatio,
            y: (d.y - panY) * zoomRatio
        };
    }

    // image px -> screen px (CSS, relative to viewport top-left)
    function imageToScreenPx(imageX, imageY) {
        const c = imageToCanvasPx(imageX, imageY);
        return {
            x: c.x / dpRatio,
            y: c.y / dpRatio
        };
    }

    // screen px (CSS, relative to viewport top-left) -> canvas px (device px).
    // The displayed view already carries pan and rotation, so this is a pure
    // device-pixel scaling.
    function screenToCanvasPx(screenX, screenY) {
        return {
            x: screenX * dpRatio,
            y: screenY * dpRatio
        };
    }

    function imageToCanvasLength(imageLength) {
        return imageLength * zoomRatio;
    }

    function screenLength(imageLength) {
        return imageLength * zoomRatio / dpRatio;
    }

    // Matrix mapping original-image px -> viewport device px. Drives the image
    // blit and the image-resolution data/mask blit.
    function imageToDeviceMatrix() {
        const m = new DOMMatrix();
        m.scaleSelf(zoomRatio);
        m.translateSelf(-panX, -panY);
        m.multiplySelf(getRotationMatrix(rotation, originalWidth, originalHeight));
        return m;
    }

    function getDisplaySize() {
        return {
            width: width,
            height: height
        };
    }

    function getImageSize() {
        return {
            width: originalWidth,
            height: originalHeight
        };
    }

    function getAllContexts() {
        return {
            mainCtx: mainCtx,
            dataCtx: dataCtx,
            drawCtx: drawCtx,
            hoverCtx: hoverCtx,
            topCtx: topCtx,
            oriImageCtx: oriImageCtx,
            oriDataCtx: oriDataCtx
        };
    }

    // Size the five display canvases (and the holder div) to the viewport: device
    // px backing store, CSS px display size. Only touches the DOM when the size
    // actually changed (assigning canvas.width clears the canvas).
    function ensureCanvasSize() {
        const vp = wpd.layoutManager.getGraphicsViewportSize();
        const cssW = parseInt(vp.width, 10);
        const cssH = parseInt(vp.height, 10);
        const devW = Math.round(cssW * dpRatio);
        const devH = Math.round(cssH * dpRatio);
        if ($mainCanvas.width === devW && $mainCanvas.height === devH) {
            return;
        }
        const layers = [$mainCanvas, $dataCanvas, $drawCanvas, $hoverCanvas, $topCanvas];
        for (const layer of layers) {
            layer.width = devW;
            layer.height = devH;
            layer.style.width = cssW + 'px';
            layer.style.height = cssH + 'px';
        }
        $canvasDiv.style.width = cssW + 'px';
        $canvasDiv.style.height = cssH + 'px';
        width = devW;
        height = devH;
    }

    function resetAllLayers() {
        $mainCanvas.width = $mainCanvas.width;
        resetDrawingLayers();
    }

    function resetDrawingLayers() {
        $dataCanvas.width = $dataCanvas.width;
        $drawCanvas.width = $drawCanvas.width;
        $hoverCanvas.width = $hoverCanvas.width;
        $topCanvas.width = $topCanvas.width;
        $oriDataCanvas.width = $oriDataCanvas.width;
    }

    // Lazily build the checkerboard pattern used to fill viewport margins that
    // fall outside the image (visible near contain zoom on the non-limiting axis).
    function getBackgroundPattern() {
        if (bgPattern !== null) {
            return bgPattern;
        }
        const tile = document.createElement('canvas');
        const t = 12;
        tile.width = 2 * t;
        tile.height = 2 * t;
        const tctx = tile.getContext('2d');
        tctx.fillStyle = "#d6d6d6";
        tctx.fillRect(0, 0, 2 * t, 2 * t);
        tctx.fillStyle = "#bfbfbf";
        tctx.fillRect(0, 0, t, t);
        tctx.fillRect(t, t, t, t);
        bgPattern = mainCtx.createPattern(tile, 'repeat');
        return bgPattern;
    }

    // Repaint the image layer (cropped + scaled to the viewport) and the overlay
    // layers. Cost is O(viewport), independent of zoom level.
    function render() {
        if (originalImageData == null) {
            return;
        }
        ensureCanvasSize();

        // image layer: textured background, then the scaled/panned/rotated source
        const matrix = imageToDeviceMatrix();
        mainCtx.setTransform(1, 0, 0, 1, 0, 0);
        mainCtx.fillStyle = getBackgroundPattern();
        mainCtx.fillRect(0, 0, width, height);
        mainCtx.setTransform(matrix);
        mainCtx.drawImage($oriImageCanvas, 0, 0);
        mainCtx.setTransform(1, 0, 0, 1, 0, 0);

        // overlay layers: clear only the on-screen layers; the image-resolution
        // oriData layer persists as the export/mask cache. In viewportRender mode
        // the handlers redraw on-screen vectors only and blit the cached oriData
        // layer, so oriData is left untouched (no re-accumulation, masks are not
        // rebuilt, and the repaint stays O(viewport)).
        clearLayer($dataCanvas, dataCtx);
        clearLayer($drawCanvas, drawCtx);
        clearLayer($hoverCanvas, hoverCtx);
        clearLayer($topCanvas, topCtx);
        viewportRender = true;
        try {
            if (repaintHandler != null && repaintHandler.onRedraw != undefined) {
                repaintHandler.onRedraw();
            }
            if (activeTool != null && activeTool.onRedraw != undefined) {
                activeTool.onRedraw();
            }
        } finally {
            viewportRender = false;
        }
    }

    // True while a pan/zoom/resize repaint is in progress (see render()).
    function isViewportRender() {
        return viewportRender;
    }

    // Coalesce pan / resize re-renders to one per animation frame.
    function scheduleRender() {
        if (renderFrameId === null) {
            renderFrameId = requestAnimationFrame(function() {
                renderFrameId = null;
                render();
            });
        }
    }

    function forceHandlerRepaint() {
        if (repaintHandler != null && repaintHandler.onForcedRedraw != undefined) {
            repaintHandler.onForcedRedraw();
        }
    }

    function setRepainter(fhandle) {
        if (repaintHandler != null && repaintHandler.onRemove != undefined) {
            repaintHandler.onRemove();
        }
        resetDrawingLayers();
        repaintHandler = fhandle;
        if (repaintHandler != null && repaintHandler.onAttach != undefined) {
            repaintHandler.onAttach();
        }
    }

    function getRepainter() {
        return repaintHandler;
    }

    function removeRepainter() {
        if (repaintHandler != null && repaintHandler.onRemove != undefined) {
            repaintHandler.onRemove();
        }
        repaintHandler = null;
    }

    // Show the image-resolution data/mask layer (points, color filter, detection
    // mask) by cropping + scaling it into the viewport, matching the image blit.
    function copyImageDataLayerToScreen() {
        const matrix = imageToDeviceMatrix();
        dataCtx.setTransform(matrix);
        dataCtx.drawImage($oriDataCanvas, 0, 0);
        dataCtx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function getRotationMatrix(degrees, dx, dy) {
        // determine translation (moves origin)
        let xTranslation, yTranslation;
        switch (degrees) {
            case 90:
                xTranslation = dy ?? 0;
                yTranslation = 0;
                break;
            case 180:
                xTranslation = dx ?? 0;
                yTranslation = dy ?? 0;
                break;
            case 270:
                xTranslation = 0;
                yTranslation = dx ?? 0;
                break;
            default:
                xTranslation = 0;
                yTranslation = 0;
                break;
        }

        // convert degrees to radians
        const radians = degrees * Math.PI / 180;

        // define transformation matrix [a, b, c, d, e, f]
        // matrix format:
        //   a c e 0
        //   b d f 0
        //   0 0 1 0
        //   0 0 0 1
        return new DOMMatrix([
            Math.cos(radians),
            Math.sin(radians),
            -Math.sin(radians),
            Math.cos(radians),
            xTranslation,
            yTranslation,
        ]);
    };

    function rotateClockwise() {
        rotateAndResize(90);
    }

    function rotateCounterClockwise() {
        rotateAndResize(-90);
    }

    function rotateAndResize(deltaDegrees = 0) {
        // do nothing if delta degrees value is not a multiple of 90
        if (Math.abs(deltaDegrees) % 90 !== 0) {
            return;
        }

        // delta 0 means re-render the current view (e.g. after a page switch)
        if (deltaDegrees === 0) {
            zoomRatio = Math.max(zoomRatio, getContainZoomRatio());
            clampPan();
            render();
            return;
        }

        // add delta degrees to rotation
        // if rotation is 0 start at 360
        // modulo to make sure it is 0 <= d < 360
        rotation = ((rotation || 360) + deltaDegrees) % 360;

        // the displayed dimensions swap on 90/270, so re-fit the whole image
        zoomFit();

        wpd.events.dispatch("wpd.image.rotate", {
            rotation: rotation
        });
    }

    function getRotation() {
        return rotation;
    }

    function setRotation(degrees) {
        // normalize undefined/null to 0 so the rotation transform never sees NaN
        rotation = degrees || 0;
    }

    // Largest zoom ratio at which the WHOLE image fits in the viewport (contain
    // fit). Acts as the zoom-out floor: the limiting axis fits exactly, the other
    // axis shows a textured margin.
    function getContainZoomRatio() {
        const vp = getViewportDeviceSize();
        const dim = getDisplayDims();
        return Math.min(vp.w / dim.w, vp.h / dim.h);
    }

    // Clamp the pan offset. On an axis where the image fits within the viewport,
    // center the image (pan goes negative to inset it, leaving textured margins)
    // and lock the axis. On an axis where the image overflows, clamp so no empty
    // edge shows on that axis.
    function clampPan() {
        const vp = getViewportDeviceSize();
        const dim = getDisplayDims();
        const spanX = dim.w - vp.w / zoomRatio;
        const spanY = dim.h - vp.h / zoomRatio;
        panX = (spanX <= 0) ? spanX / 2 : Math.min(Math.max(panX, 0), spanX);
        panY = (spanY <= 0) ? spanY / 2 : Math.min(Math.max(panY, 0), spanY);
    }

    // Wheel zoom centered on the cursor. Events are accumulated and applied once
    // per animation frame to avoid rebuilding the canvases on every wheel notch.
    function zoomWheel(ev) {
        if (originalImageData == null) {
            return;
        }
        ev.preventDefault();

        const rect = $graphicsContainer.getBoundingClientRect();
        pendingZoomCursor = {
            x: ev.clientX - rect.left, // cursor offset within viewport (CSS px)
            y: ev.clientY - rect.top
        };
        pendingZoomFactor *= (ev.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP);

        if (zoomFrameId === null) {
            zoomFrameId = requestAnimationFrame(applyPendingZoom);
        }
    }

    // Apply the accumulated wheel zoom, keeping the image point under the cursor
    // fixed. Pan is clamped to keep the image within the viewport (edge align).
    function applyPendingZoom() {
        zoomFrameId = null;
        const factor = pendingZoomFactor;
        const cursor = pendingZoomCursor;
        pendingZoomFactor = 1;
        pendingZoomCursor = null;
        if (cursor == null || originalImageData == null) {
            return;
        }

        const oldZoom = zoomRatio;
        const containZoom = getContainZoomRatio();
        const maxZoom = Math.max(containZoom, MAX_ZOOM_RATIO);
        const newZoom = Math.max(containZoom, Math.min(oldZoom * factor, maxZoom));
        if (newZoom === oldZoom) {
            return;
        }

        // hold the display point under the cursor fixed across the zoom change
        const curDevX = cursor.x * dpRatio;
        const curDevY = cursor.y * dpRatio;
        panX = (panX + curDevX / oldZoom) - curDevX / newZoom;
        panY = (panY + curDevY / oldZoom) - curDevY / newZoom;
        zoomRatio = newZoom;
        clampPan();
        render();
    }

    function zoomFit() {
        // Contain the whole image in the viewport, centered.
        zoomRatio = getContainZoomRatio();
        clampPan();
        render();
    }

    function setZoomRatio(zratio) {
        zoomRatio = Math.max(zratio, getContainZoomRatio());
        clampPan();
        render();
    }

    function getZoomRatio() {
        return zoomRatio;
    }

    // Clear a single layer's full backing store without reallocating it (setting
    // .width reallocates, which is expensive when the canvas is large at high
    // zoom). The existing transform (rotation) is preserved.
    function clearLayer(canvas, ctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    function resetData() {
        // Refresh only the overlay layers. The image layer is unchanged when data
        // changes, so skip rotateAndResize (which reallocates every canvas and
        // re-blits the whole image - the dominant cost of placing/moving points).
        clearLayer($oriDataCanvas, oriDataCtx);
        clearLayer($dataCanvas, dataCtx);
        clearLayer($drawCanvas, drawCtx);
        clearLayer($hoverCanvas, hoverCtx);
        clearLayer($topCanvas, topCtx);

        if (repaintHandler != null && repaintHandler.onRedraw != undefined) {
            repaintHandler.onRedraw();
        }
        if (activeTool != null && activeTool.onRedraw != undefined) {
            activeTool.onRedraw();
        }
    }

    function clearData() {
        $oriDataCanvas.width = $oriDataCanvas.width;
        $dataCanvas.width = $dataCanvas.width;
    }

    function resetHover() {
        hoverCtx.clearRect(0, 0, $hoverCanvas.width, $hoverCanvas.height);
    }

    function toggleExtendedCrosshair(ev) { // called when backslash is hit
        if (ev.keyCode === 220) {
            ev.preventDefault();
            toggleExtendedCrosshairBtn();
        }
    }

    function toggleExtendedCrosshairBtn() { // called directly when toolbar button is hit
        extendedCrosshair = !(extendedCrosshair);
        let $crosshairBtn = document.getElementById('extended-crosshair-btn');
        if (extendedCrosshair) {
            $crosshairBtn.classList.add('pressed-button');
        } else {
            $crosshairBtn.classList.remove('pressed-button');
        }
        $topCanvas.width = $topCanvas.width;
    }

    function hoverOverCanvas(ev) {
        let pos = posn(ev);
        let xpos = pos.x * dpRatio;
        let ypos = pos.y * dpRatio;
        let imagePos = screenToImagePx(pos.x, pos.y);

        if (extendedCrosshair) {
            $topCanvas.width = $topCanvas.width;
            topCtx.strokeStyle = "rgba(0,0,0, 0.5)";
            topCtx.beginPath();
            topCtx.moveTo(xpos, 0);
            topCtx.lineTo(xpos, height);
            topCtx.moveTo(0, ypos);
            topCtx.lineTo(width, ypos);
            topCtx.stroke();
        }

        setZoomImage(imagePos.x, imagePos.y);
        wpd.zoomView.setCoords(imagePos.x, imagePos.y);
    }

    function getRotatedCoordinates(sourceDegrees, targetDegrees, x, y) {
        // get the delta degrees
        const deltaDegrees = targetDegrees - sourceDegrees;

        // short-circuit
        // return original x and y if delta degrees is not a multiple of 90
        if (Math.abs(deltaDegrees) % 90 !== 0) {
            return {
                x: x,
                y: y
            };
        }

        // determine source rotation image dimensions
        const dimensions = sourceDegrees % 180 === 0 ? {
            x: originalWidth,
            y: originalHeight
        } : {
            x: originalHeight,
            y: originalWidth
        };

        let rotatedX, rotatedY;
        switch (deltaDegrees) {
            case 90:
            case -270:
                rotatedX = dimensions.y - y;
                rotatedY = x;
                break;
            case 180:
            case -180:
                rotatedX = dimensions.x - x;
                rotatedY = dimensions.y - y;
                break;
            case 270:
            case -90:
                rotatedX = y;
                rotatedY = dimensions.x - x;
                break;
            case 360:
            case 0:
            default:
                rotatedX = x;
                rotatedY = y;
                break;
        }

        return {
            x: rotatedX,
            y: rotatedY
        };
    }

    function setZoomImage(ix, iy) {
        const zsize = wpd.zoomView.getSize();
        const zratio = wpd.zoomView.getZoomRatio();
        let zxmin = 0;
        let zymin = 0;
        let zxmax = zsize.width;
        let zymax = zsize.height;

        const iw = zsize.width / zratio;
        const ih = zsize.height / zratio;

        const ix0 = ix - iw / 2.0;
        const iy0 = iy - ih / 2.0;

        let ixmin = ix0;
        let iymin = iy0;
        let ixmax = ix0 + iw;
        let iymax = iy0 + ih;

        if (ix0 < 0) {
            ixmin = 0;
            zxmin = -ix0 * zratio;
        }
        if (iy0 < 0) {
            iymin = 0;
            zymin = -iy0 * zratio;
        }
        if (ix0 + iw >= originalWidth) {
            ixmax = originalWidth;
            zxmax = zxmax - zratio * (originalWidth - (ix0 + iw));
        }
        if (iy0 + ih >= originalHeight) {
            iymax = originalHeight;
            zymax = zymax - zratio * (originalHeight - (iy0 + ih));
        }
        // Magnifier shows the raw source image only. The data/overlay layer is
        // intentionally not read here: reading the just-modified data canvas back
        // on every point placement was a major source of placement lag.
        const idata = oriImageCtx.getImageData(parseInt(ixmin, 10), parseInt(iymin, 10),
            parseInt(ixmax - ixmin, 10), parseInt(iymax - iymin, 10));

        // Make this accurate to subpixel level
        const xcorr = zratio * (parseInt(ixmin, 10) - ixmin);
        const ycorr = zratio * (parseInt(iymin, 10) - iymin);

        wpd.zoomView.setZoomImage(idata, parseInt(zxmin + xcorr, 10), parseInt(zymin + ycorr, 10),
            parseInt(zxmax - zxmin, 10), parseInt(zymax - zymin, 10), getRotationMatrix(rotation, zxmax, zymax));
    }

    function updateZoomOnEvent(ev) {
        const pos = posn(ev);
        const imagePos = screenToImagePx(pos.x, pos.y);
        setZoomImage(imagePos.x, imagePos.y);
        wpd.zoomView.setCoords(imagePos.x, imagePos.y);
    }

    function updateZoomToImagePosn(x, y) {
        setZoomImage(x, y);
        wpd.zoomView.setCoords(x, y);
    }

    // Throttle the (expensive) magnifier update to one per animation frame, using
    // the most recent mouse position. Skipped entirely while panning.
    function hoverOverCanvasHandler(ev) {
        if (isPanning) {
            return;
        }
        pendingHoverEvent = ev;
        if (hoverFrameId === null) {
            hoverFrameId = requestAnimationFrame(function() {
                hoverFrameId = null;
                const hoverEvent = pendingHoverEvent;
                pendingHoverEvent = null;
                if (hoverEvent != null) {
                    hoverOverCanvas(hoverEvent);
                }
            });
        }
    }

    function dropHandler(ev) {
        wpd.busyNote.show();
        wpd.sidebar.clear();
        const allDrop = ev.dataTransfer.files;
        if (allDrop.length === 1) {
            wpd.imageManager.initializeFileManager(allDrop);
            wpd.appData.reset();
            wpd.imageManager.loadFromFile(allDrop[0]);
        } else {
            wpd.messagePopup.show(title = "Drag & Drop", msg = "Only one image can be dragged and dropped into the UI at a time");
            wpd.busyNote.close();
        }
    }

    function pasteHandler(ev) {
        if (ev.clipboardData !== undefined) {
            const items = ev.clipboardData.items;
            if (items !== undefined) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].kind === "file" && items[i].type.indexOf("image") !== -1) {
                        wpd.popup.close('loadNewImage');
                        wpd.busyNote.show();
                        wpd.sidebar.clear();
                        const imageFile = items[i].getAsFile();
                        wpd.imageManager.initializeFileManager([imageFile]);
                        wpd.appData.reset();
                        wpd.imageManager.loadFromFile(imageFile);
                    }
                }
            }
        }
    }

    function init() {
        dpRatio = window.devicePixelRatio;
        $mainCanvas = document.getElementById('mainCanvas');
        $dataCanvas = document.getElementById('dataCanvas');
        $drawCanvas = document.getElementById('drawCanvas');
        $hoverCanvas = document.getElementById('hoverCanvas');
        $topCanvas = document.getElementById('topCanvas');

        $oriImageCanvas = document.createElement('canvas');
        $oriDataCanvas = document.createElement('canvas');
        $tempImageCanvas = document.createElement('canvas');

        mainCtx = $mainCanvas.getContext('2d');
        dataCtx = $dataCanvas.getContext('2d');
        hoverCtx = $hoverCanvas.getContext('2d');
        topCtx = $topCanvas.getContext('2d');
        drawCtx = $drawCanvas.getContext('2d');

        // These offscreen layers are read back via getImageData frequently
        // (magnifier, color picker, auto-detection); willReadFrequently keeps
        // those readbacks on a fast CPU-backed path instead of stalling on GPU.
        oriImageCtx = $oriImageCanvas.getContext('2d', { willReadFrequently: true });
        oriDataCtx = $oriDataCanvas.getContext('2d', { willReadFrequently: true });
        tempImageCtx = $tempImageCanvas.getContext('2d');

        $canvasDiv = document.getElementById('canvasDiv');
        $graphicsContainer = document.getElementById('graphicsContainer');

        // The graphics container drives cursor-centered wheel zoom and viewport
        // resize handling. Guard the registration so init completes even when the
        // container is unavailable, such as the minimal DOM used by unit tests.
        if ($graphicsContainer != null) {
            // Wheel zoom centered on the cursor (replaces native scroll panning)
            $graphicsContainer.addEventListener('wheel', zoomWheel, {
                passive: false
            });

            // Re-fit / clamp / repaint when the viewport size actually changes. A
            // ResizeObserver fires after layoutManager applies its (debounced) height
            // change, avoiding a stale render against the pre-resize dimensions.
            if (typeof ResizeObserver !== 'undefined') {
                const ro = new ResizeObserver(function() {
                    if (originalImageData == null) {
                        return;
                    }
                    zoomRatio = Math.max(zoomRatio, getContainZoomRatio());
                    clampPan();
                    scheduleRender();
                });
                ro.observe($graphicsContainer);
            }
        }

        // Extended crosshair
        document.addEventListener('keydown', function(ev) {
            if (isCanvasInFocus) {
                toggleExtendedCrosshair(ev);
            }
        }, false);

        // hovering over canvas
        $topCanvas.addEventListener('mousemove', hoverOverCanvasHandler, false);

        // drag over canvas
        $topCanvas.addEventListener('dragover', function(evt) {
            evt.preventDefault();
        }, true);
        $topCanvas.addEventListener("drop", function(evt) {
            evt.preventDefault();
            dropHandler(evt);
        }, true);

        $topCanvas.addEventListener("mousemove", onMouseMove, false);
        $topCanvas.addEventListener("click", onMouseClick, false);
        $topCanvas.addEventListener("mouseup", onMouseUp, false);
        $topCanvas.addEventListener("mousedown", onMouseDown, false);
        $topCanvas.addEventListener("mouseout", onMouseOut, true);
        document.addEventListener("mousemove", onDocumentMouseMove, false);
        document.addEventListener("mouseup", onDocumentMouseUp, false);

        document.addEventListener("mousedown", function(ev) {
            if (ev.target === $topCanvas) {
                isCanvasInFocus = true;
            } else {
                isCanvasInFocus = false;
            }
        }, false);
        document.addEventListener("keydown", function(ev) {
            if (isCanvasInFocus) {
                onKeyDown(ev);
            }
        }, true);

        // Global undo/redo. Lives outside the isCanvasInFocus gate so Ctrl+Z works right after a
        // sidebar-triggered operation (e.g. an algorithm run) with no prior canvas mousedown.
        document.addEventListener("keydown", function(ev) {
            const target = ev.target;
            const tagName = (target != null && target.tagName != null) ? target.tagName.toUpperCase() : "";
            // Let native text editing handle undo inside form fields and editable popups.
            if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" ||
                (target != null && target.isContentEditable === true)) {
                return;
            }
            const isUndoRedoModifier = ev.ctrlKey || ev.metaKey;
            if (!isUndoRedoModifier) {
                return;
            }
            const key = ev.key;
            if (key === "z" || key === "Z") {
                ev.preventDefault();
                ev.stopPropagation();
                const undoManager = wpd.appData.getUndoManager();
                if (ev.shiftKey) {
                    undoManager.redo();
                } else {
                    undoManager.undo();
                }
            } else if (key === "y" || key === "Y") {
                ev.preventDefault();
                ev.stopPropagation();
                wpd.appData.getUndoManager().redo();
            }
        }, false);

        wpd.zoomView.initZoom();

        // Paste image from clipboard
        window.addEventListener('paste', function(event) {
            pasteHandler(event);
        }, false);
    }

    function loadImage(originalImage, savedRotation) {
        if ($mainCanvas == null) {
            init();
        }
        removeTool();
        removeRepainter();
        originalWidth = originalImage.width;
        originalHeight = originalImage.height;
        aspectRatio = originalWidth / (originalHeight * 1.0);
        $oriImageCanvas.width = originalWidth;
        $oriImageCanvas.height = originalHeight;
        $oriDataCanvas.width = originalWidth;
        $oriDataCanvas.height = originalHeight;
        oriImageCtx.drawImage(originalImage, 0, 0, originalWidth, originalHeight);
        originalImageData = oriImageCtx.getImageData(0, 0, originalWidth, originalHeight);
        setRotation(savedRotation);
        resetAllLayers();
        zoomFit();
        return originalImageData;
    }

    function loadImageFromData(idata, iwidth, iheight, keepZoom) {
        removeTool();
        removeRepainter();
        originalWidth = iwidth;
        originalHeight = iheight;
        aspectRatio = originalWidth / (originalHeight * 1.0);
        $oriImageCanvas.width = originalWidth;
        $oriImageCanvas.height = originalHeight;
        $oriDataCanvas.width = originalWidth;
        $oriDataCanvas.height = originalHeight;
        oriImageCtx.putImageData(idata, 0, 0);
        originalImageData = idata;
        resetAllLayers();

        if (!keepZoom) {
            zoomFit();
        } else {
            setZoomRatio(zoomRatio);
        }
    }

    function saveImage() {
        const exportCanvas = document.createElement('canvas');
        const exportCtx = exportCanvas.getContext('2d');
        exportCanvas.width = originalWidth;
        exportCanvas.height = originalHeight;
        exportCtx.drawImage($oriImageCanvas, 0, 0, originalWidth, originalHeight);
        const exportData = exportCtx.getImageData(0, 0, originalWidth, originalHeight);
        const dLayer = oriDataCtx.getImageData(0, 0, originalWidth, originalHeight);
        for (let di = 0; di < exportData.data.length; di += 4) {
            if (dLayer.data[di] != 0 || dLayer.data[di + 1] != 0 || dLayer.data[di + 2] != 0) {
                const alpha = dLayer.data[di + 3] / 255;
                exportData.data[di] = (1 - alpha) * exportData.data[di] + alpha * dLayer.data[di];
                exportData.data[di + 1] =
                    (1 - alpha) * exportData.data[di + 1] + alpha * dLayer.data[di + 1];
                exportData.data[di + 2] =
                    (1 - alpha) * exportData.data[di + 2] + alpha * dLayer.data[di + 2];
            }
        }
        exportCtx.putImageData(exportData, 0, 0);
        window.open(exportCanvas.toDataURL(), "_blank");
    }

    // run an external operation on the image data. this would normally mean a reset.
    function runImageOp(operFn) {
        let opResult = operFn(originalImageData, originalWidth, originalHeight);
        loadImageFromData(opResult.imageData, opResult.width, opResult.height, opResult.keepZoom);
    }

    function getImageData() {
        return originalImageData;
    }

    function getBase64Image() {
        return $oriImageCanvas.toDataURL();
    }

    function setTool(tool) {
        if (activeTool != null && activeTool.onRemove != undefined) {
            activeTool.onRemove();
        }
        activeTool = tool;
        if (activeTool != null && activeTool.onAttach != undefined) {
            activeTool.onAttach();
        }
    }

    function removeTool() {
        if (activeTool != null && activeTool.onRemove != undefined) {
            activeTool.onRemove();
        }
        activeTool = null;
    }

    function onMouseMove(ev) {
        if (isPanning) {
            return;
        }
        if (activeTool != null && activeTool.onMouseMove != undefined) {
            const pos = posn(ev);
            const imagePos = screenToImagePx(pos.x, pos.y);
            activeTool.onMouseMove(ev, pos, imagePos);
        }
    }

    // Pan the viewport while the middle mouse button is held. Scroll offsets are
    // clamped by the browser, so the image cannot be panned past its edges.
    function onDocumentMouseMove(ev) {
        if (!isPanning) {
            return;
        }
        panX = panStart.panX - (ev.clientX - panStart.x) * dpRatio / zoomRatio;
        panY = panStart.panY - (ev.clientY - panStart.y) * dpRatio / zoomRatio;
        clampPan();
        scheduleRender();
    }

    function onMouseClick(ev) {
        if (activeTool != null && activeTool.onMouseClick != undefined) {
            const pos = posn(ev);
            const imagePos = screenToImagePx(pos.x, pos.y);
            activeTool.onMouseClick(ev, pos, imagePos);
        }
    }

    function onDocumentMouseUp(ev) {
        if (isPanning && ev.button === 1) {
            isPanning = false;
            panStart = null;
            $graphicsContainer.style.cursor = '';
            return;
        }
        if (activeTool != null && activeTool.onDocumentMouseUp != undefined) {
            const pos = posn(ev);
            const imagePos = screenToImagePx(pos.x, pos.y);
            activeTool.onDocumentMouseUp(ev, pos, imagePos);
        }
    }

    function onMouseUp(ev) {
        if (activeTool != null && activeTool.onMouseUp != undefined) {
            const pos = posn(ev);
            const imagePos = screenToImagePx(pos.x, pos.y);
            activeTool.onMouseUp(ev, pos, imagePos);
        }
    }

    function onMouseDown(ev) {
        if (ev.button === 1) { // middle mouse button starts panning
            ev.preventDefault();
            isPanning = true;
            panStart = {
                x: ev.clientX,
                y: ev.clientY,
                panX: panX,
                panY: panY
            };
            $graphicsContainer.style.cursor = 'grabbing';
            return;
        }
        if (activeTool != null && activeTool.onMouseDown != undefined) {
            const pos = posn(ev);
            const imagePos = screenToImagePx(pos.x, pos.y);
            activeTool.onMouseDown(ev, pos, imagePos);
        }
    }

    function onMouseOut(ev) {
        if (activeTool != null && activeTool.onMouseOut != undefined) {
            const pos = posn(ev);
            const imagePos = screenToImagePx(pos.x, pos.y);
            activeTool.onMouseOut(ev, pos, imagePos);
        }
    }

    function onKeyDown(ev) {
        if (activeTool != null && activeTool.onKeyDown != undefined) {
            activeTool.onKeyDown(ev);
        }
    }

    // for use when downloading wpd project file
    // converts all images (except pdfs) to png
    function getImageFiles() {
        let imageFiles = [];
        for (const file of wpd.appData.getFileManager().getFiles()) {
            let imageFile;
            if (file.type === 'application/pdf') {
                imageFile = file;
            } else {
                imageFile = _convertToPNG(file);
            }
            imageFiles.push(imageFile);
        }
        return Promise.all(imageFiles);
    }

    function _convertToPNG(imageFile) {
        return new Promise((resolve, reject) => {
            // reject any non-image files
            if (imageFile.type.match("image.*")) {
                let reader = new FileReader();
                reader.onload = function() {
                    let url = reader.result;
                    new Promise((resolve, reject) => {
                        let image = new Image();
                        image.onload = function() {
                            $tempImageCanvas.width = image.width;
                            $tempImageCanvas.height = image.height;
                            tempImageCtx.drawImage(image, 0, 0, image.width, image.height);
                            resolve();
                        };
                        image.src = url;
                    }).then(() => {
                        let imageURL = $tempImageCanvas.toDataURL('image/png');
                        let bstr = atob(imageURL.split(',')[1]);
                        let n = bstr.length;
                        let u8arr = new Uint8Array(n);
                        while (n--) {
                            u8arr[n] = bstr.charCodeAt(n);
                        }
                        resolve(new File([u8arr], imageFile.name, {
                            type: 'image/png',
                            encoding: 'utf-8',
                        }));
                        tempImageCtx.clearRect(0, 0, $tempImageCanvas.width, $tempImageCanvas.height);
                    });
                };
                reader.readAsDataURL(imageFile);
            } else {
                reject();
            }
        });
    }

    return {
        zoomFit: zoomFit,
        toggleExtendedCrosshairBtn: toggleExtendedCrosshairBtn,
        setZoomRatio: setZoomRatio,
        getZoomRatio: getZoomRatio,

        rotateClockwise: rotateClockwise,
        rotateCounterClockwise: rotateCounterClockwise,
        rotateAndResize: rotateAndResize,
        getRotation: getRotation,
        setRotation: setRotation,
        getRotationMatrix: getRotationMatrix,
        getRotatedCoordinates: getRotatedCoordinates,

        runImageOp: runImageOp,

        setTool: setTool,
        removeTool: removeTool,

        getAllContexts: getAllContexts,
        isViewportRender: isViewportRender,
        resetData: resetData,
        clearData: clearData,
        resetHover: resetHover,
        screenToImagePx: screenToImagePx,
        imageToCanvasPx: imageToCanvasPx,
        imageToScreenPx: imageToScreenPx,
        screenToCanvasPx: screenToCanvasPx,
        screenLength: screenLength,
        imageToCanvasLength: imageToCanvasLength,

        updateZoomOnEvent: updateZoomOnEvent,
        updateZoomToImagePosn: updateZoomToImagePosn,

        getDisplaySize: getDisplaySize,
        getImageSize: getImageSize,

        copyImageDataLayerToScreen: copyImageDataLayerToScreen,
        setRepainter: setRepainter,
        removeRepainter: removeRepainter,
        forceHandlerRepaint: forceHandlerRepaint,
        getRepainter: getRepainter,

        saveImage: saveImage,
        loadImage: loadImage,

        getBase64Image: getBase64Image,
        getImageFiles: getImageFiles
    };
})();

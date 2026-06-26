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

wpd.colorSelectionWidget = (function() {
    let color = null;
    let parentElementId = null;
    let triggerElementId = null;
    let setColorDelegate = null;
    let isOpen = false;
    let $colorPickerWidget = null;

    function isPickerOpen(parentId) {
        return isOpen && (parentElementId === parentId);
    }

    function setParams(params) {
        color = params.color;
        parentElementId = params.parentElementId;
        triggerElementId = params.triggerElementId;
        setColorDelegate = params.setColorDelegate;
    }

    function apply() {
        document.getElementById('color-picker-red').value = color[0];
        document.getElementById('color-picker-green').value = color[1];
        document.getElementById('color-picker-blue').value = color[2];

        let $triggerBtn = document.getElementById(triggerElementId);
        $triggerBtn.style.backgroundColor =
            'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
        if (color[0] + color[1] + color[2] < 3 * 120) {
            $triggerBtn.style.color = 'rgb(255,255,255)';
        } else {
            $triggerBtn.style.color = 'rgb(0,0,0)';
        }
    }

    function closePicker() {
        if (isOpen) {
            wpd.graphicsWidget.removeTool();
            isOpen = false;
        }
    }

    function startPicker() {
        if (isOpen) {
            return;
        }
        const $parent = document.getElementById(parentElementId);
        if ($colorPickerWidget == null) {
            $colorPickerWidget = document.getElementById('color-picker-widget');
        }
        $parent.appendChild($colorPickerWidget);
        $colorPickerWidget.style.display = "block";
        document.getElementById('color-picker-red').value = color[0];
        document.getElementById('color-picker-green').value = color[1];
        document.getElementById('color-picker-blue').value = color[2];
        renderColorOptions();
        pickColor();
        isOpen = true;
    }

    function renderColorOptions() {
        let $container = document.getElementById('color-picker-dominant-colors');
        let topColors = wpd.appData.getPlotData().getTopColors();
        let colorCount = topColors.length > 10 ? 10 : topColors.length;
        let containerHtml = "";

        for (let colori = 0; colori < colorCount; colori++) {
            let colorString = 'rgb(' + topColors[colori].r + ',' + topColors[colori].g + ',' +
                topColors[colori].b + ');';
            let perc = topColors[colori].percentage.toFixed(3) + "%";
            containerHtml += '<div class="colorOptionBox" style="background-color: ' + colorString +
                '\" title=\"' + perc +
                '" onclick="wpd.colorSelectionWidget.selectTopColor(' + colori +
                ');"></div>';
        }

        $container.innerHTML = containerHtml;
    }

    function pickColor() {
        let tool = new wpd.ColorPickerTool();
        tool.onComplete = function(col) {
            color = col;
            setColorDelegate(col);
            apply();
        };
        tool.onRemove = () => {
            const $parent = document.getElementById(parentElementId);
            $colorPickerWidget.style.display = 'none';
            isOpen = false;
        };
        wpd.graphicsWidget.setTool(tool);
    }

    function setColor() {
        let gui_color = [];
        gui_color[0] = parseInt(document.getElementById('color-picker-red').value, 10);
        gui_color[1] = parseInt(document.getElementById('color-picker-green').value, 10);
        gui_color[2] = parseInt(document.getElementById('color-picker-blue').value, 10);
        color = gui_color;
        setColorDelegate(gui_color);
        apply();
    }

    function selectTopColor(colorIndex) {
        let gui_color = [];
        let topColors = wpd.appData.getPlotData().getTopColors();

        gui_color[0] = topColors[colorIndex].r;
        gui_color[1] = topColors[colorIndex].g;
        gui_color[2] = topColors[colorIndex].b;

        color = gui_color;
        setColorDelegate(gui_color);
        apply();
    }

    function paintFilteredColor(binaryData, maskPixels) {
        let ctx = wpd.graphicsWidget.getAllContexts();
        const imageSize = wpd.graphicsWidget.getImageSize();
        let dataLayer = ctx.oriDataCtx.getImageData(0, 0, imageSize.width, imageSize.height);

        // Highlight matching pixels yellow and dim the rest. When a mask has been
        // drawn the preview is limited to it; otherwise it covers the whole image
        // so the filter still gives visual confirmation for automatic extraction.
        const colorPixel = function(img_index) {
            if (binaryData.has(img_index)) {
                dataLayer.data[img_index * 4] = 255;
                dataLayer.data[img_index * 4 + 1] = 255;
                dataLayer.data[img_index * 4 + 2] = 0;
                dataLayer.data[img_index * 4 + 3] = 255;
            } else {
                dataLayer.data[img_index * 4] = 0;
                dataLayer.data[img_index * 4 + 1] = 0;
                dataLayer.data[img_index * 4 + 2] = 0;
                dataLayer.data[img_index * 4 + 3] = 120;
            }
        };

        if (maskPixels != null && maskPixels.size > 0) {
            for (let img_index of maskPixels) {
                colorPixel(img_index);
            }
        } else {
            const pixelCount = imageSize.width * imageSize.height;
            for (let img_index = 0; img_index < pixelCount; img_index++) {
                colorPixel(img_index);
            }
        }

        ctx.oriDataCtx.putImageData(dataLayer, 0, 0);
        wpd.graphicsWidget.copyImageDataLayerToScreen();
    }

    return {
        setParams: setParams,
        startPicker: startPicker,
        closePicker: closePicker,
        isOpen: isPickerOpen,
        pickColor: pickColor,
        setColor: setColor,
        selectTopColor: selectTopColor,
        paintFilteredColor: paintFilteredColor
    };
})();

wpd.colorPicker = (function() {
    function getAutoDetectionData() {
        let ds = wpd.tree.getActiveDataset();
        return wpd.appData.getPlotData().getAutoDetectionDataForDataset(ds);
    }

    function getFGPickerParams() {
        let ad = getAutoDetectionData();
        return {
            color: ad.fgColor,
            triggerElementId: 'color-button',
            parentElementId: 'dataset-color-picker-container',
            setColorDelegate: function(col) {
                ad.fgColor = col;
            }
        };
    }

    function getBGPickerParams() {
        let ad = getAutoDetectionData();
        return {
            color: ad.bgColor,
            triggerElementId: 'color-button',
            parentElementId: 'dataset-color-picker-container',
            setColorDelegate: function(col) {
                ad.bgColor = col;
            }
        };
    }

    function init() {
        let $colorBtn = document.getElementById('color-button');
        let $colorDistance = document.getElementById('color-distance-value');
        let autoDetector = getAutoDetectionData();
        let $modeSelector = document.getElementById('color-detection-mode-select');
        let color = null;

        if (autoDetector.colorDetectionMode === 'fg') {
            color = autoDetector.fgColor;
        } else {
            color = autoDetector.bgColor;
        }
        let color_distance = autoDetector.colorDistance;

        $colorBtn.style.backgroundColor = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
        $colorBtn.style.color = (color[0] + color[1] + color[2] < 3 * 120) ? "rgb(255,255,255)" : "rgb(0,0,0)";

        $colorDistance.value = color_distance;
        $modeSelector.value = autoDetector.colorDetectionMode;
    }

    function changeColorDistance() {
        let color_distance = parseFloat(document.getElementById('color-distance-value').value);
        getAutoDetectionData().colorDistance = color_distance;
        // Live-update: while the filter overlay is showing, re-run it so the new distance
        // is reflected immediately without toggling the button off and back on.
        if (isColorFilterActive()) {
            applyColorFilter();
        }
    }

    function isColorFilterActive() {
        let repainter = wpd.graphicsWidget.getRepainter();
        return repainter != null && repainter.painterName === 'colorFilterRepainter';
    }

    function applyColorFilter() {
        wpd.graphicsWidget.removeTool();
        wpd.graphicsWidget.removeRepainter();
        wpd.graphicsWidget.resetData();

        let ctx = wpd.graphicsWidget.getAllContexts();
        let autoDetector = getAutoDetectionData();
        let imageSize = wpd.graphicsWidget.getImageSize();

        let imageData = ctx.oriImageCtx.getImageData(0, 0, imageSize.width, imageSize.height);
        autoDetector.generateBinaryData(imageData);
        wpd.graphicsWidget.setRepainter(new wpd.ColorFilterRepainter());

        let $btn = document.getElementById('filter-colors-btn');
        if ($btn !== null) {
            $btn.classList.add('pressed-button');
        }
    }

    function clearColorFilter() {
        wpd.graphicsWidget.removeTool();
        wpd.graphicsWidget.removeRepainter();
        wpd.graphicsWidget.resetData();

        let $btn = document.getElementById('filter-colors-btn');
        if ($btn !== null) {
            $btn.classList.remove('pressed-button');
        }
    }

    function testColorDetection() {
        // Toggle: clicking Filter Colors again while the overlay is showing turns it back off.
        if (isColorFilterActive()) {
            clearColorFilter();
        } else {
            applyColorFilter();
        }
    }

    function startPicker() {
        wpd.graphicsWidget.removeTool();
        wpd.graphicsWidget.removeRepainter();
        wpd.graphicsWidget.resetData();
        // Tearing down the repainter clears the filter overlay, so reflect that on the toggle.
        let $btn = document.getElementById('filter-colors-btn');
        if ($btn !== null) {
            $btn.classList.remove('pressed-button');
        }
        if (getAutoDetectionData().colorDetectionMode === 'fg') {
            wpd.colorSelectionWidget.setParams(getFGPickerParams());
        } else {
            wpd.colorSelectionWidget.setParams(getBGPickerParams());
        }
        wpd.colorSelectionWidget.startPicker();
    }

    function changeDetectionMode() {
        let $modeSelector = document.getElementById('color-detection-mode-select');
        getAutoDetectionData().colorDetectionMode = $modeSelector.value;
        init();
        startPicker();
    }

    return {
        startPicker: startPicker,
        changeDetectionMode: changeDetectionMode,
        changeColorDistance: changeColorDistance,
        init: init,
        testColorDetection: testColorDetection
    };
})();

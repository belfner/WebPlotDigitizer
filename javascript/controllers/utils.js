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

wpd.utils = (function() {
    function toggleElementsDisplay(elements, hide) {
        for (const $el of elements) $el.hidden = hide;
    }

    function addToCollection(collection, key, objects) {
        if (!collection[key]) {
            collection[key] = [];
        }
        Array.prototype.push.apply(collection[key], objects);
    }

    function deleteFromCollection(collection, key, objects) {
        if (!collection[key]) return;
        objects.forEach(object => {
            const index = collection[key].indexOf(object);
            if (index > -1) {
                collection[key].splice(index, 1);
            }
        });
    }

    function invertObject(object) {
        let map = {};
        Object.entries(object).forEach(([index, collection]) => {
            collection.forEach(item => map[item.name] = parseInt(index, 10));
        });
        return map;
    }

    function filterCollection(collection, key, objects) {
        let filtered = [];
        if (collection[key]) {
            filtered = objects.filter(object => {
                return collection[key].indexOf(object) > -1;
            });
        }
        return filtered;
    }

    function findKey(collection, object) {
        for (const key in collection) {
            if (collection[key].indexOf(object) > -1) {
                return parseInt(key, 10);
            }
        }
    }

    function createOptionsHTML(labels, values, selectedValue) {
        if (labels.length !== values.length) {
            console.error('labels and values length mismatch');
        }

        let optionsHTML = '';
        for (let i = 0; i < labels.length; i++) {
            optionsHTML += '<option value="' + values[i] + '"';
            if (values[i] === selectedValue) optionsHTML += ' selected';
            optionsHTML += '>' + labels[i] + '</option>';
        }
        return optionsHTML;
    }

    function integerRange(count, start = 0) {
        return Array.apply(null, Array(count)).map((_, i) => i + start);
    }

    function isInteger(value) {
        return /^-?[1-9]\d*$|^0$/.test(value);
    }

    function toSentenceCase(string) {
        return string.charAt(0).toUpperCase() + string.substr(1).toLowerCase();
    }

    // Plain-decimal band for the live cursor readout: values with magnitude in
    // [PLAIN_LOW, PLAIN_HIGH) print in plain decimal notation; values smaller or
    // larger print in scientific notation. The band stays inside JS Number
    // toString limits (>= 1e-6, < 1e21) so the plain branch never re-introduces
    // exponential notation.
    const PLAIN_LOW = 1e-4;
    const PLAIN_HIGH = 1e6;
    const PLAIN_SIG_FIGS = 5;
    const SCI_MANTISSA_DIGITS = 4;

    // Format one calibrated coordinate value for the live cursor readout. Each
    // value is evaluated on its own magnitude, so axes format independently:
    // plain decimal (PLAIN_SIG_FIGS significant figures, trailing zeros stripped)
    // within the band, scientific (SCI_MANTISSA_DIGITS mantissa digits) outside.
    function formatLiveValue(value) {
        if (!Number.isFinite(value)) {
            return String(value);
        }
        if (value === 0) {
            return "0";
        }
        const magnitude = Math.abs(value);
        if (magnitude >= PLAIN_LOW && magnitude < PLAIN_HIGH) {
            return Number(value.toPrecision(PLAIN_SIG_FIGS)).toString();
        }
        return value.toExponential(SCI_MANTISSA_DIGITS);
    }

    return {
        addToCollection: addToCollection,
        createOptionsHTML: createOptionsHTML,
        deleteFromCollection: deleteFromCollection,
        filterCollection: filterCollection,
        findKey: findKey,
        formatLiveValue: formatLiveValue,
        integerRange: integerRange,
        invertObject: invertObject,
        isInteger: isInteger,
        toggleElementsDisplay: toggleElementsDisplay,
        toSentenceCase: toSentenceCase
    };
})();

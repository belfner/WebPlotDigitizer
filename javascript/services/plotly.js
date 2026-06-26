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

wpd.plotly = (function() {
    // NOTE: Plotly retired the chart-studio external-data import. A POST to
    // https://chart-studio.plotly.com/external now 308-redirects to a marketing
    // page that returns HTTP 405, so send() is non-functional in upstream
    // WebPlotDigitizer and in this fork. The Plotly export buttons are disabled
    // in templates/_popups.html; this code is retained for reference.
    function send(dataObject) {
        var formContainer = document.createElement('div'),
            formElement = document.createElement('form'),
            formData = document.createElement('textarea'),
            jsonString;

        formElement.setAttribute('method', 'post');
        formElement.setAttribute('action', 'https://chart-studio.plotly.com/external');
        formElement.setAttribute('target', '_blank');

        formData.setAttribute('name', 'data');
        formData.setAttribute('id', 'data');

        formElement.appendChild(formData);
        formContainer.appendChild(formElement);
        document.body.appendChild(formContainer);
        formContainer.style.display = 'none';

        jsonString = JSON.stringify(dataObject);

        formData.innerHTML = jsonString;
        formElement.submit();
        document.body.removeChild(formContainer);
    }

    return {
        send: send
    };
})();

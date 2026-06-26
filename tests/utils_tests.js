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

    Tests added 2026-06-25 by belfner for the live cursor readout number format.
*/

QUnit.module("Utils tests: formatLiveValue");

QUnit.test("Plain decimal within the band", function(assert) {
    assert.equal(wpd.utils.formatLiveValue(0), "0", "zero");
    assert.equal(wpd.utils.formatLiveValue(1), "1", "one");
    assert.equal(wpd.utils.formatLiveValue(10), "10", "ten stays plain (not 1e+1)");
    assert.equal(wpd.utils.formatLiveValue(0.5), "0.5", "half");
    assert.equal(wpd.utils.formatLiveValue(-42), "-42", "negative integer");
    assert.equal(wpd.utils.formatLiveValue(1234.5678), "1234.6", "5 significant figures");
    assert.equal(wpd.utils.formatLiveValue(123456), "123460", "5 significant figures, large");
});

QUnit.test("Band boundaries", function(assert) {
    assert.equal(wpd.utils.formatLiveValue(1e-4), "0.0001", "lower bound inclusive: plain");
    assert.equal(wpd.utils.formatLiveValue(9.9e-5), "9.9000e-5", "below lower bound: scientific");
    assert.equal(wpd.utils.formatLiveValue(999999), "1000000", "just under upper bound: plain (rounds up)");
    assert.equal(wpd.utils.formatLiveValue(1e6), "1.0000e+6", "upper bound exclusive: scientific");
});

QUnit.test("Scientific outside the band", function(assert) {
    assert.equal(wpd.utils.formatLiveValue(1e-9), "1.0000e-9", "very small: scientific");
    assert.equal(wpd.utils.formatLiveValue(-5e-5), "-5.0000e-5", "small negative: scientific");
    assert.equal(wpd.utils.formatLiveValue(2.5e12), "2.5000e+12", "very large: scientific");
});

QUnit.test("Non-finite values fall back", function(assert) {
    assert.equal(wpd.utils.formatLiveValue(NaN), "NaN", "NaN");
    assert.equal(wpd.utils.formatLiveValue(Infinity), "Infinity", "Infinity");
    assert.equal(wpd.utils.formatLiveValue(-Infinity), "-Infinity", "negative Infinity");
});

QUnit.test("Axis values format independently", function(assert) {
    // A small Y and a mid-range X should not influence each other's notation.
    assert.equal(wpd.utils.formatLiveValue(50), "50", "X in plain band");
    assert.equal(wpd.utils.formatLiveValue(3e-8), "3.0000e-8", "Y in scientific range");
});

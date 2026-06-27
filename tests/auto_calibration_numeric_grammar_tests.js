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

QUnit.module("Auto calibration numeric grammar tests");

function bestValue(text) {
    let candidates = wpd.autoCalibration.numericGrammar.parse(text);
    return candidates.length > 0 ? candidates[0].value : null;
}

function bestGrammar(text) {
    let candidates = wpd.autoCalibration.numericGrammar.parse(text);
    return candidates.length > 0 ? candidates[0].grammar : null;
}

QUnit.test("plain and signed decimals", function(assert) {
    assert.strictEqual(bestValue("10"), 10, "integer");
    assert.strictEqual(bestValue("-5"), -5, "negative");
    assert.strictEqual(bestValue("+3.0"), 3, "signed decimal");
    assert.strictEqual(bestValue("0.5"), 0.5, "decimal");
    assert.strictEqual(bestValue(".5"), 0.5, "leading-dot decimal");
    assert.strictEqual(bestGrammar("10"), "decimal", "decimal grammar");
});

QUnit.test("scientific notation", function(assert) {
    assert.strictEqual(bestValue("1.5e3"), 1500, "lowercase e");
    assert.strictEqual(bestValue("1.5E-3"), 0.0015, "uppercase E, negative exp");
    assert.strictEqual(bestGrammar("1.5e3"), "sci-e", "sci grammar");
});

QUnit.test("a x 10^b forms", function(assert) {
    assert.strictEqual(bestValue("2x10^3"), 2000, "ascii x and caret");
    assert.strictEqual(bestValue("2*10^3"), 2000, "asterisk");
    assert.true(Math.abs(bestValue("2 x 10^-4") - 0.0002) < 1e-12, "spaces and negative exp");
    assert.strictEqual(bestValue("2×10³"), 2000, "unicode times and superscript");
    assert.strictEqual(bestGrammar("2x10^3"), "times10", "times10 grammar");
});

QUnit.test("10^b forms", function(assert) {
    assert.strictEqual(bestValue("10^3"), 1000, "caret");
    assert.strictEqual(bestValue("10^-3"), 0.001, "negative exponent");
    assert.strictEqual(bestValue("10³"), 1000, "superscript");
    assert.strictEqual(bestGrammar("10^3"), "times10", "times10 grammar");
});

QUnit.test("base^n forms (non-10 base, e.g. log base 2)", function(assert) {
    assert.strictEqual(bestValue("2^-5"), 0.03125, "2^-5");
    assert.strictEqual(bestValue("2^10"), 1024, "2^10");
    assert.strictEqual(bestValue("2⁻⁵"), 0.03125, "superscript base-2");
    assert.strictEqual(bestGrammar("2^-5"), "base-exp", "base-exp grammar");
});

QUnit.test("normalization of separators and unicode minus", function(assert) {
    assert.strictEqual(bestValue("1,000"), 1000, "thousands separator stripped");
    assert.strictEqual(bestValue("−5"), -5, "unicode minus");
});

QUnit.test("non-numeric and empty inputs yield no candidates", function(assert) {
    assert.strictEqual(wpd.autoCalibration.numericGrammar.parse("abc").length, 0, "letters");
    assert.strictEqual(wpd.autoCalibration.numericGrammar.parse("12px").length, 0, "trailing unit");
    assert.strictEqual(wpd.autoCalibration.numericGrammar.parse("").length, 0, "empty");
    assert.strictEqual(wpd.autoCalibration.numericGrammar.parse(null).length, 0, "null");
});

QUnit.test("letter->digit confusions are salvaged at reduced confidence", function(assert) {
    // The LSTM reading a numeric label as text: lookalike letters map back to digits.
    assert.strictEqual(bestValue("A00"), 400, "A->4");
    assert.strictEqual(bestValue("l.5"), 1.5, "l->1");
    assert.strictEqual(bestValue("O.5"), 0.5, "O->0");
    let salvaged = wpd.autoCalibration.numericGrammar.parse("A00");
    assert.ok(salvaged[0].confidence < 0.95, "salvaged read carries reduced confidence");
    // A clean numeric read is untouched by the salvage path.
    assert.strictEqual(wpd.autoCalibration.numericGrammar.parse("400")[0].confidence, 0.95, "clean read full confidence");
});

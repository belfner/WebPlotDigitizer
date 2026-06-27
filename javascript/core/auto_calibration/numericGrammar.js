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
wpd.autoCalibration = wpd.autoCalibration || {};

// Numeric grammar for axis tick labels. parse() turns a single (already OCR'd) label string into the
// numeric value(s) it can represent, covering the tick-label forms charts actually use:
//   - signed decimals: 10, -5, 0.5, .5, +3.0
//   - scientific:      1.5e3, 1.5E-3
//   - a x 10^b:        2x10^3, 2*10^3, 2 x 10^3, 2x10^-4
//   - 10^b:            10^3, 10^-3, 10^6
//   - base^n:          2^-5, 2^10            (log axes with a non-10 base, e.g. matplotlib base-2)
// Unicode minus, multiplication symbols, and superscript exponents are normalized first. The OCR
// layer is responsible for character-confusion variants; this module parses one normalized string.
wpd.autoCalibration.numericGrammar = (function() {
    const SUPERSCRIPT = {
        '⁰': '0',
        '¹': '1',
        '²': '2',
        '³': '3',
        '⁴': '4',
        '⁵': '5',
        '⁶': '6',
        '⁷': '7',
        '⁸': '8',
        '⁹': '9',
        '⁻': '-',
        '⁺': '+'
    };

    const DECIMAL = /^([+-]?(?:\d+\.?\d*|\.\d+))$/;
    const SCI = /^([+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?\d+)$/;
    const TIMES10_A = /^([+-]?(?:\d+\.?\d*|\.\d+))x10\^([+-]?\d+)$/;
    const TIMES10 = /^([+-]?)10\^([+-]?\d+)$/;
    const BASE_EXP = /^([+-]?)(\d+)\^([+-]?\d+)$/;

    // Normalize unicode minus / multiplication symbols / superscripts and strip spaces and thousands
    // separators, converting a superscript run into a caret exponent (e.g. "10³" -> "10^3").
    function normalize(text) {
        if (text == null) {
            return '';
        }
        let out = '';
        let inSuper = false;
        for (let ch of String(text).trim()) {
            if (SUPERSCRIPT.hasOwnProperty(ch)) {
                if (!inSuper) {
                    out += '^';
                    inSuper = true;
                }
                out += SUPERSCRIPT[ch];
                continue;
            }
            inSuper = false;
            if (ch === '−') {
                out += '-'; // unicode minus
            } else if (ch === '×' || ch === '·' || ch === '*' || ch === 'X') {
                out += 'x'; // multiplication symbols -> ascii x
            } else if (ch === ' ' || ch === '\t') {
                // drop whitespace
            } else if (ch === ',') {
                // drop thousands separators (English-locale assumption)
            } else {
                out += ch;
            }
        }
        return out;
    }

    // Letter -> digit confusions the LSTM engine makes when it reads a numeric tick label as text.
    // Tick labels are numbers, so an alphabetic character in an otherwise-numeric string is an OCR
    // error; mapping the well-known lookalikes back to digits salvages reads like "A00" -> "400" or
    // "l.5" -> "1.5". Applied only as a fallback after a strict parse fails (see parse()).
    const CONFUSION = {
        'O': '0',
        'o': '0',
        'Q': '0',
        'D': '0',
        'U': '0',
        'l': '1',
        'I': '1',
        'i': '1',
        '|': '1',
        'L': '1',
        'Z': '2',
        'z': '2',
        'A': '4',
        'S': '5',
        's': '5',
        'b': '6',
        'G': '6',
        'T': '7',
        'B': '8',
        'g': '9',
        'q': '9'
    };

    // Replace confusable letters with their digit lookalikes. Returns null when the string carries no
    // alphabetic character to fix (nothing to salvage) so the caller does not double-count a clean read.
    function _salvageConfusions(norm) {
        let out = '';
        let changed = false;
        for (let ch of norm) {
            if (CONFUSION.hasOwnProperty(ch)) {
                out += CONFUSION[ch];
                changed = true;
            } else {
                out += ch;
            }
        }
        return changed ? out : null;
    }

    function _sign(s) {
        return s === '-' ? -1 : 1;
    }

    function _pushUnique(candidates, candidate) {
        if (!isFinite(candidate.value)) {
            return;
        }
        for (let existing of candidates) {
            if (existing.value === candidate.value) {
                return; // keep the first (higher-confidence) candidate for a given value
            }
        }
        candidates.push(candidate);
    }

    // Run the numeric forms against a normalized string, pushing each match into `candidates`. The
    // `confScale` factor lets a salvaged (confusion-corrected) reparse contribute the same shapes at a
    // reduced confidence so a clean read always outranks a salvaged one for the same value.
    function _matchForms(norm, original, candidates, confScale) {
        let m;
        if ((m = DECIMAL.exec(norm)) !== null) {
            _pushUnique(candidates, {
                text: original,
                value: parseFloat(m[1]),
                grammar: 'decimal',
                confidence: 0.95 * confScale
            });
        }
        if ((m = SCI.exec(norm)) !== null) {
            _pushUnique(candidates, {
                text: original,
                value: parseFloat(m[1]),
                grammar: 'sci-e',
                confidence: 0.92 * confScale
            });
        }
        if ((m = TIMES10_A.exec(norm)) !== null) {
            _pushUnique(candidates, {
                text: original,
                value: parseFloat(m[1]) * Math.pow(10, parseInt(m[2], 10)),
                grammar: 'times10',
                confidence: 0.9 * confScale
            });
        }
        if ((m = TIMES10.exec(norm)) !== null) {
            _pushUnique(candidates, {
                text: original,
                value: _sign(m[1]) * Math.pow(10, parseInt(m[2], 10)),
                grammar: 'times10',
                confidence: 0.9 * confScale
            });
        }
        if ((m = BASE_EXP.exec(norm)) !== null) {
            _pushUnique(candidates, {
                text: original,
                value: _sign(m[1]) * Math.pow(parseInt(m[2], 10), parseInt(m[3], 10)),
                grammar: 'base-exp',
                confidence: 0.85 * confScale
            });
        }
    }

    // Parse a single label string into zero or more numeric candidates, ordered by confidence.
    function parse(text, options) {
        const original = text == null ? '' : String(text);
        const norm = normalize(text);
        const candidates = [];

        if (norm.length === 0) {
            return candidates;
        }

        _matchForms(norm, original, candidates, 1);

        // Fallback: if the string did not parse cleanly, retry with letter->digit confusions applied
        // (e.g. the LSTM reading "400" as "A00"). Salvaged matches carry reduced confidence so a clean
        // numeric read elsewhere always wins for the same value.
        if (candidates.length === 0) {
            const salvaged = _salvageConfusions(norm);
            if (salvaged !== null) {
                _matchForms(salvaged, original, candidates, 0.5);
            }
        }

        return candidates;
    }

    return {
        parse: parse,
        normalize: normalize
    };
})();

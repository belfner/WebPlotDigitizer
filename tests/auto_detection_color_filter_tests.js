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

QUnit.module("Auto detection color filter tests", {
    afterEach: () => {
        sinon.restore();
    }
});

// Three RGBA pixels. With fgColor [0,0,255] and colorDistance 120, only pixel index 2 (an exact
// match) passes the color filter; the mask itself covers all three pixels.
function makeFixtureImageData() {
    return {
        width: 3,
        height: 1,
        data: [
            10, 10, 10, 255, // index 0: far from fg
            250, 250, 250, 255, // index 1: far from fg
            0, 0, 255, 255 // index 2: exact fg match
        ]
    };
}

QUnit.test("useColorFilter defaults to true", function(assert) {
    let ad = new wpd.AutoDetectionData();
    assert.strictEqual(ad.useColorFilter, true, "default is true");

    let adExplicitTrue = new wpd.AutoDetectionData({
        useColorFilter: true
    });
    assert.strictEqual(adExplicitTrue.useColorFilter, true, "explicit true honored");

    let adFalse = new wpd.AutoDetectionData({
        useColorFilter: false
    });
    assert.strictEqual(adFalse.useColorFilter, false, "explicit false honored");
});

QUnit.test("masked generation with useColorFilter true applies color distance filtering", function(assert) {
    let ad = new wpd.AutoDetectionData();
    ad.fgColor = [0, 0, 255];
    ad.colorDetectionMode = 'fg';
    ad.colorDistance = 120;
    ad.setMask(new Set([0, 1, 2]));

    ad.generateBinaryData(makeFixtureImageData());

    assert.deepEqual(Array.from(ad.binaryData).sort(), [2],
        "only the color-matching pixel survives the filter");
});

QUnit.test("masked generation with useColorFilter false returns the mask verbatim", function(assert) {
    let ad = new wpd.AutoDetectionData({
        useColorFilter: false
    });
    ad.fgColor = [0, 0, 255];
    ad.colorDetectionMode = 'fg';
    ad.colorDistance = 120;
    ad.setMask(new Set([0, 1, 2]));

    ad.generateBinaryData(makeFixtureImageData());

    assert.deepEqual(Array.from(ad.binaryData).sort((a, b) => a - b), [0, 1, 2],
        "binary data equals the mask exactly");

    // The returned set must be an independent copy, not the same Set reference.
    assert.notStrictEqual(ad.binaryData, ad.mask, "binaryData is a distinct Set from mask");
});

QUnit.test("serialize round-trips useColorFilter", function(assert) {
    let ad = new wpd.AutoDetectionData({
        useColorFilter: false
    });
    // serialize() returns null unless the algorithm itself serializes to a non-null payload.
    ad.algorithm = {
        serialize: () => ({
            algoType: "AveragingWindowAlgo"
        })
    };
    let json = ad.serialize();
    assert.strictEqual(json.useColorFilter, false, "serialized value reflects the flag");

    let restored = new wpd.AutoDetectionData();
    restored.deserialize(json);
    assert.strictEqual(restored.useColorFilter, false, "deserialized value matches");
});

QUnit.test("deserializing legacy JSON without useColorFilter defaults to true", function(assert) {
    let legacy = {
        fgColor: [0, 0, 255],
        bgColor: [255, 255, 255],
        imageWidth: 10,
        imageHeight: 10,
        mask: null,
        colorDetectionMode: 'fg',
        colorDistance: 120,
        algorithm: null,
        name: 0
    };
    let ad = new wpd.AutoDetectionData();
    ad.deserialize(legacy);
    assert.strictEqual(ad.useColorFilter, true,
        "absence of useColorFilter preserves always-filter behavior");
});

QUnit.module("Data mask retargeting tests", {
    afterEach: () => {
        sinon.restore();
    }
});

QUnit.test("resolveAutoDetectionData returns the injected detector unchanged", function(assert) {
    let transient = new wpd.AutoDetectionData({
        useColorFilter: false
    });
    assert.strictEqual(wpd.dataMask.resolveAutoDetectionData(transient), transient,
        "a non-null detector is returned as-is (transient session never resolves to active dataset)");
});

QUnit.test("resolveAutoDetectionData with no target resolves to the active dataset detector", function(assert) {
    let activeDetector = new wpd.AutoDetectionData();
    let fakeDataset = {};
    let fakePlotData = {
        getAutoDetectionDataForDataset: sinon.stub().returns(activeDetector)
    };
    sinon.stub(wpd.tree, "getActiveDataset").returns(fakeDataset);
    sinon.stub(wpd.appData, "getPlotData").returns(fakePlotData);

    assert.strictEqual(wpd.dataMask.resolveAutoDetectionData(null), activeDetector,
        "null target resolves to the active dataset's detector");
    assert.strictEqual(wpd.dataMask.resolveAutoDetectionData(), activeDetector,
        "undefined target resolves to the active dataset's detector");
    assert.true(fakePlotData.getAutoDetectionDataForDataset.calledWith(fakeDataset),
        "looked up the active dataset");
});

QUnit.test("defaultMaskControlIds maps to the acquire-data sidebar ids", function(assert) {
    let ids = wpd.dataMask.defaultMaskControlIds;
    assert.strictEqual(ids.box, 'box-mask', "box id");
    assert.strictEqual(ids.pen, 'pen-mask', "pen id");
    assert.strictEqual(ids.erase, 'erase-mask', "erase id");
    assert.strictEqual(ids.view, 'view-mask', "view id");
    assert.strictEqual(ids.paintContainer, 'mask-paint-container', "paint container id");
    assert.strictEqual(ids.eraseContainer, 'mask-erase-container', "erase container id");
});

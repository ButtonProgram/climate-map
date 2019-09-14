import { default as turfBooleanWithin } from '@turf/boolean-within';
import { feature as turfFeature } from '@turf/helpers';
import { flattenReduce as turfFlattenReduce } from '@turf/meta';
import Chart from 'chart.js';
import { linear_kryw_0_100_c71, linear_bgyw_20_98_c66 } from './colormap';
import { arcgisToGeoJSON } from '@esri/arcgis-to-geojson-utils';
import WMSCapabilities from 'ol/format/WMSCapabilities.js'

function assert(expr, message) {
    if (!expr) throw new Error(`Assertion error: ${message}`);
}

// This must be set, but the value is not needed here.
mapboxgl.accessToken = 'not-needed';

const map = new mapboxgl.Map({
    container: 'map', // container id
    // style,
    style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
    center: [28, 65], // starting position [lng, lat]
    zoom: 5, // starting zoom
});

// Suppress uninformative console error spam:
map.on('error', (e) => {
    if (e.error.message === '') return;
    console.error(e.error.message, e.error.stack, e.target);
})


const backgroundLayerGroups = { 'terramonitor': true }
const layerGroupState = {
    'terramonitor': true,
}

// Pretty print to precision:
const pp = (x, precision = 2) => (+x.toPrecision(precision)).toLocaleString();

// Set up event handlers for layer toggles, etc.
window.addEventListener('load', () => {
    const layerToggles = document.querySelectorAll('.layer-card input[name="onoffswitch"]');
    Array.from(layerToggles).forEach(el => {
        if (el.disabled) return;
        if (el.hasAttribute("data-special")) return; // disable automatic handling

        el.addEventListener('change', () => { toggleGroup(el.id); });

        // Populate layer state from DOM.
        layerGroupState[el.id] = el.checked;
        const known = el.id in layerGroups;
        if (!known) {
            console.log('ERROR: Unknown layer in menu .layer-cards:', el.id, el);
        }
    });

    const layerGroupElems = document.querySelectorAll('.layer-group > label > input');
    Array.from(layerGroupElems).forEach(el => {
        el.addEventListener('change', () => {
            el.parentElement.parentElement.classList.toggle('active');
        });
    });
})

const layerOriginalPaint = {}
const toggleBaseMapSymbols = () => {
    if (!initialMapLoaded) return;
    map.getStyle().layers.filter(x => x.type === 'symbol').forEach(layer => {
        invertLayerTextHalo(layer);
    })
}

const natura2000_mappings = {
    "natura2000-sac": { layer: "NaturaSAC_alueet", color: 'cyan' },
    "natura2000-sac-lines": { layer: "NaturaSAC_viivat", color: 'gray' },
    "natura2000-sci": { layer: "NaturaSCI_alueet", color: 'purple' },
    "natura2000-spa": { layer: "NaturaSPA_alueet", color: 'magenta' },
    "natura2000-impl-ma": { layer: "NaturaTotTapa_ma", color: '#ca9f74' },
    "natura2000-impl-r": { layer: "NaturaTotTapa_r", color: 'brown' },
}

const layerGroups = {
    'valio': [
        () => hideAllLayersMatchingFilter(x => !/valio/.test(x)),
        'valio-fields-boundary', 'valio-fields-fill', 'valio-plohko-co2',
        'mavi-plohko-removed-fill',
        'mavi-plohko-removed-outline',
    ],
    'forest-grid': ['metsaan-hila-c', 'metsaan-hila-sym', 'metsaan-hila-outline'],
    'forests': [
        () => hideAllLayersMatchingFilter(x => /mature-forests/.test(x)),

        'arvometsa-actionable-relative-raster',
        'arvometsa-actionable-relative-fill',
        'arvometsa-boundary',
        'arvometsa-actionable-relative-sym',
        // 'metsaan-stand-raster', 'metsaan-stand-fill', 'metsaan-stand-co2', 'metsaan-stand-outline',

        // Norway
        'nibio-ar50-forests-fill', 'nibio-ar50-forests-outline', 'nibio-ar50-forests-sym',
    ],
    'ethiopia-forests': [
        'ethiopia_forest_change_2003_2013-raster',
    ],
    'madagascar-land-cover': [
        'madagascar-2017-mosaic-raster',
    ],
    'arvometsa': [
        'arvometsa-fill',
        'arvometsa-boundary',
        'arvometsa-sym',
        'arvometsa-highlighted',
    ],
    'mature-forests': [
        () => hideAllLayersMatchingFilter(x => /^forests$/.test(x)),
        'metsaan-stand-mature-fill', 'metsaan-stand-outline', 'metsaan-stand-mature-sym', 'metsaan-stand-mature-raster',
    ],
    'zonation6': ['zonation-v6-raster'],
    'ete': ['metsaan-ete-all-c', 'metsaan-ete-all-outline', 'metsaan-ete-all-sym'],
    'ete-all-labels': [() => toggleEteCodes()],
    'terramonitor': ['terramonitor', () => toggleBaseMapSymbols()],
    'no2-raster': ['no2-raster', () => window.setNO2()],
    'mangrove-forests': ['mangrove-wms'],
    'natura2000': [
        ...Object.keys(natura2000_mappings).map(x => x),
        ...Object.keys(natura2000_mappings).map(x => `${x}-sym`),
    ],
    'fields': [
        'mavi-plohko-removed-fill', 'mavi-plohko-removed-outline',
        'nibio-soils-fill', 'nibio-soils-outline', 'nibio-soils-sym',
    ],
    'fields-peatland': [
        'mavi-plohko-peatland-fill',
        'mavi-plohko-peatland-outline',
        'mavi-plohko-peatland-co2',
    ],
    'fields-mineral': [
        'mavi-plohko-mineral-fill',
        'mavi-plohko-mineral-outline',
        'mavi-plohko-mineral-co2',
    ],
    'helsinki-buildings': [
        'helsinki-buildings-fill', 'helsinki-buildings-outline', 'helsinki-buildings-co2',
        'helsinki-puretut-fill', 'helsinki-puretut-outline', 'helsinki-puretut-sym',
    ],
    'building-energy-certificates': ['hel-energiatodistukset-fill', 'hel-energiatodistukset-outline', 'hel-energiatodistukset-sym'],
    'fmi-enfuser-airquality': ['fmi-enfuser-airquality'],
    'fmi-enfuser-pm2pm5': ['fmi-enfuser-pm2pm5'],
    'fmi-enfuser-pm10': ['fmi-enfuser-pm10'],
    'fmi-enfuser-no2': ['fmi-enfuser-no2'],
    'fmi-enfuser-ozone': ['fmi-enfuser-ozone'],
    'waqi': ['waqi-raster'],
    'hsy-solar-potential': ['hsy-solar-potential-fill', 'hsy-solar-potential-outline', 'hsy-solar-potential-sym'],
    'gtk-mp20k-maalajit': ['gtk-mp20k-maalajit-fill', 'gtk-mp20k-maalajit-outline', 'gtk-mp20k-maalajit-sym'],
    'cifor-peatdepth': ['cifor-peatdepth-raster'],
    'cifor-wetlands': ['cifor-wetlands-raster'],
    'gfw_tree_plantations': ['gfw_tree_plantations-fill', 'gfw_tree_plantations-outline', 'gfw_tree_plantations-sym'],
    'snow_cover_loss': ['snow_cover_loss-fill', 'snow_cover_loss-sym'],
    'corine_clc2018': ['corine_clc2018-fill', 'corine_clc2018-outline', 'corine_clc2018-sym'],

    'bogs': ['gtk-turvevarat-suot-fill', 'fi-mml-suot-fill'],

    'culverts': ['fi-vayla-tierummut-circle', 'fi-vayla-ratarummut-circle'],

    'berries-lingonberry': ['berries-lingonberry-raster'],
    'berries-bilberry': ['berries-bilberry-raster'],
};

function getFirstAncestorMatching(el, filter) {
    while (el !== null) {
        el = el.parentElement;
        if (el !== null && filter(el)) return el;
    }
    return null;
}

const toggleGroup = (group, forcedState = undefined) => {
    const oldState = layerGroupState[group];
    const newState = forcedState === undefined ? !oldState : forcedState;
    if (oldState === newState) return;

    const el = document.querySelector(`.layer-card input#${group}`)
    if (el) el.checked = newState

    if (!initialMapLoaded) return;

    layerGroups[group].forEach(layer => {
        if (typeof layer === 'function') {
            layer();
        } else {
            assert(layer in originalLayerDefs, JSON.stringify(layer));
            const {BEFORE} = originalLayerDefs[layer];
            assert(BEFORE, JSON.stringify(originalLayerDefs[layer]));
            map.moveLayer(layer, BEFORE); // Make this the topmost layer.
            map.setLayoutProperty(layer, 'visibility', newState ? 'visible' : 'none');
        }
    })
    layerGroupState[group] = newState;

    if (group in backgroundLayerGroups) return;

    const layerCard = getFirstAncestorMatching(el, el => el.classList.contains('layer-card'));
    if (!layerCard) {
        console.error('Could not find a .layer-card for layer:', group, el);
    }
    if (layerCard && layerCard.classList.contains('layer-active') !== newState) {
        layerCard.classList.toggle('layer-active');
    }
}

window.toggleSatellite = function () {
    toggleGroup('terramonitor');
    [...document.querySelectorAll('.satellite-button-container img')].forEach(x => x.toggleAttribute('hidden'));
}
window.toggleMenu = function () {
    [...document.querySelectorAll('.menu-toggle')].forEach(x => x.toggleAttribute('hidden'))
}


let eteAllState = false;
const eteBasicLabels = [
    "match",
    ["get", "featurecode"],
    70, "Gamekeeping area",
    95, "Potential METSO Habitat",
    98, "METSO Habitat",
    10120, "Gamekeeping area",
    15150, "METSO II",
    "",
]

function replaceLayer(layer) {
    // assert('BEFORE' in layer, `Layer ${layer.id} is missing a BEFORE declaration`);
    map.getLayer(layer.id) && map.removeLayer(layer.id);
    map.addLayer(layer, layer.BEFORE);
}

const setEteCodes = (codes) => {
    const id = 'metsaan-ete-all-sym'
    const layer = map.getStyle().layers.filter(x => x.id === id)[0]

    const eteAllLabels = [
        "match",
        ["get", "featurecode"],
        ...codes,
        "UNKNOWN habitat type",
    ];
    layer.layout['text-field'] = eteAllState ? eteBasicLabels : eteAllLabels;
    eteAllState = !eteAllState;
    map.removeLayer(id)
    addLayer(layer, visibility = layerGroupState.ete ? 'visible' : 'none')
    toggleGroup('ete', layerGroupState.ete);
}

const toggleEteCodes = () => {
    fetch('ete_codes.json').then(function (response) {
        response.json().then(e => {
            setEteCodes(e);
            toggleGroup('ete', true);
        })
    })
}


const hideAllLayersMatchingFilter = (filterFn) => {
    Object.keys(layerGroupState).forEach(group => {
        const layerIsInBackground = group in backgroundLayerGroups;
        if (layerIsInBackground) return;
        if (filterFn && !filterFn(group)) return;
        toggleGroup(group, false);
    })
}

const invertLayerTextHalo = (layer) => {
    layer.paint = { ...layer.paint }
    if (layer.paint && layer.paint["text-halo-width"]) {
        // Original style is something like:
        // text-color: "#999"
        // text-halo-blur: 1
        // text-halo-color: "rgb(242,243,240)"
        // text-halo-width: 2
        const props = {
            'text-halo-blur': 1,
            'text-halo-width': 2.5,
            'text-color': '#fff',
            'text-halo-color': '#000',
        }

        for (const [k,v] of Object.entries(props)) {
            map.setPaintProperty(layer.id, k, v, {validate: false});
        }
    }
}

const enableDefaultLayers = () => {
    Object.entries(layerGroupState).forEach(([group, enabled]) => {
        enabled && layerGroups[group].forEach(layer => {
            typeof layer === 'string' &&
                map.setLayoutProperty(layer, 'visibility', 'visible');
        });
    })
}


// NB: By using the '/' operator instead of '*', we get rid of float bugs like 1.2000000000004.
const roundToSignificantDigitsPos = (n, expr) => [
    // Multiply back by true scale
    '/',
    // Round to two significant digits:
    [
        'round', [
            '/',
            expr,
            ['^', 10, ['+', -n + 1, ['floor', ['log10', expr]]]],
        ],
    ],
    ['^', 10, ['-', n - 1, ['floor', ['log10', expr]]]],
]
const roundToSignificantDigits = (n, expr) => [
    'case',
    ['==', 0, expr], 0,
    ['>', 0, expr], ['*', -1, roundToSignificantDigitsPos(n, ['*', -1, expr])],
    roundToSignificantDigitsPos(n, expr),
]

// Ruokavirasto field plots CO2e formulas:
//
// histosol: 400t CO2eq/ha/20yrs -> 20t CO2e/ha/y -> 2kg/m2/y
//
// non-histosol: 2.2 CO2e/ha/year as an average for the period of 10 years.
// -> 0.22kg/m2/y
//
// NB: dataset attribute "pinta_ala" (area) is in "ares" (i.e. units of 100 m2), not m2 or hectares.

// NB: Duplicated logic because I don't know how to interpret
// Mapbox style expressions in outside contexts.
const fieldPlotCO2eFn = props => {
    const isHistosolType = t => [-104, 195511, 195512, 195513, 195514].indexOf(t) !== -1;
    const histosolRatio = (
        + (isHistosolType(props.soil_type1) ? props.soil_type1_ratio : 0)
        + (isHistosolType(props.soil_type2) ? props.soil_type2_ratio : 0)
    );
    const co2ePerHa = histosolRatio >= 0.4 ? 20 : 2.2;
    const areaHa = 1e-2 * props.pinta_ala;
    return areaHa * co2ePerHa; // tons per ha
}

const histosolCalc = roundToSignificantDigits(2, ['*', 20 * 1e-2, ['get', 'pinta_ala']]);
const nonHistosolCalc = roundToSignificantDigits(2, ['*', 2.2 * 1e-2, ['get', 'pinta_ala']]);

const fieldPlotHistosolMult = v => [
    'match', v,
    -104, 1, // Histosols
    195511, 1, // Lieju (Lj) RT
    195512, 1, // Saraturve (Ct) RT
    195513, 1, // Rahkaturve (St) RT
    195514, 1, // Turvetuotantoalue (Tu) RT
    0,
];
const fieldPlotHistosolRatio = [
    '+',
    ['*', fieldPlotHistosolMult(["get", "soil_type1"]), ["max", 0, ["get", "soil_type1_ratio"]]],
    ['*', fieldPlotHistosolMult(["get", "soil_type2"]), ["max", 0, ["get", "soil_type2_ratio"]]],
];

// Unit: tons of CO2e per hectare per annum.
const fieldPlotCO2ePerHectare = [
    "case", [">=", fieldPlotHistosolRatio, 0.4], 20, 2.2,
];

const fieldPlotTextField = [
    "step", ["zoom"],

    // 0 <= zoom < 15.5:
    [
        "case", [">=", fieldPlotHistosolRatio, 0.4], [
            "concat", histosolCalc, " t/y",
        ], [ // else: non-histosol (histosol_area < 50%)
            "concat", nonHistosolCalc, " t/y",
        ],
    ],

    // zoom >= 15.5:
    15.5,
    [
        "case", [">=", fieldPlotHistosolRatio, 0.4], [
            "concat",
            histosolCalc,
            "t CO2e/y",
            '\nsoil: histosol',
            // "\npeat:", ["/", ["round", ['*', 0.001, ['to-number', ["get", "histosol_area"], 0]]], 10], 'ha',
            "\narea: ", ["/", ["round", ['*', 0.1, ["get", "pinta_ala"]]], 10], "ha",
        ], [ // else: non-histosol (histosol_area < 50%)
            "concat",
            nonHistosolCalc,
            "t CO2e/y",
            '\nsoil: mineral',
            "\narea: ", ["/", ["round", ['*', 0.1, ["get", "pinta_ala"]]], 10], "ha",
        ],
    ],
];


const nC_to_CO2 = 44 / 12;

const fillOpacity = 0.65;

const colormapToStepExpr = (colormap, minValue, maxValue, expr) => {
    const cmapToRGBA = ([r, g, b]) => `rgb(${(r)},${g},${b})`;
    const cmap = colormap
        .map(x => x.map(c => Math.round(255 * c)))
        .map(cmapToRGBA);

    const delta = (maxValue - minValue) / (cmap.length - 1);
    const ret = ['step', expr];
    ret.push(cmap[0]);
    let value = minValue;
    for (const color of cmap.slice(1)) {
        ret.push(value);
        ret.push(color);
        value += delta;
    }
    return ret;
}

// 'Fire' aka linear_kryw_0_100_c71 is a perceptually uniform color map.
const fireColorMapStepExpr = colormapToStepExpr.bind(
    null,
    // The first few values are too white for my taste, hence the slice().
    linear_kryw_0_100_c71.reverse().slice(5)
);

const cetL9ColorMapStepExpr = colormapToStepExpr.bind(null, linear_bgyw_20_98_c66.reverse());


const areaCO2eFillColorInterp = expr => [
    'interpolate',
    ['linear'],
    expr,
    0, 'rgba(255, 255, 0, 0.65)',
    2, 'rgba(255, 165, 0, 0.55)',
    5, 'rgba(235, 0, 0, 0.65)',
];
const areaCO2eFillColorStep = expr => [
    'step',
    expr,
    'rgba(255, 255, 0, 0.65)',
    2, 'rgba(255, 165, 0, 0.5)',
    5, 'rgba(235, 0, 0, 0.65)',
];
const areaCO2eFillColor = areaCO2eFillColorInterp;

const fieldAreaCO2eFillColorNumeric = expr => [
    'interpolate',
    ['linear'],
    expr,
    0, 'hsla(52, 100%, 25%, 1)',
    5, 'hsla(52, 100%, 50%, 1)',
];

const fieldColorHistosol = 'rgb(148, 114, 81)';
const fieldColorDefault = 'hsla(52, 100%, 50%, 1)';

// const arvometsaAreaCO2eFillColor = expr => cetL9ColorMapStepExpr(-5, 15, expr);
const arvometsaAreaCO2eFillColor = expr => [
    'interpolate',
    ['linear'],
    expr,
    -5, 'hsla(159, 100%, 75%, 1)',
    0, 'hsla(159, 100%, 50%, 1)',
    15, 'hsla(159, 100%, 25%, 1)',
];


const originalLayerDefs = {};
const addLayer = (layer, visibility = 'none') => {
    assert('BEFORE' in layer, `Layer ${layer.id} is missing a BEFORE declaration`);
    assert(map.getLayer(layer.BEFORE), `getLayer(${layer.BEFORE}) failed`);

    const layout = layer.layout || {}
    layout.visibility = visibility
    layer.paint = layer.paint || {};
    if (layer.type === 'raster')
        layer.paint['raster-resampling'] = layer.paint['raster-resampling'] || 'nearest';
    map.addLayer({ layout, ...layer }, layer.BEFORE);
    originalLayerDefs[layer.id] = layer;
}

const originalSourceDefs = {}
const addSource = (name, source) => {
    map.addSource(name, source);
    originalSourceDefs[name] = source;
}



const gtkLukeSoilTypes = {
    // Placeholder value:
    "-1": null,

    // LUKE.fi soil types (soilOfFinland2015):
    "-101": 'Anthrosols',
    "-102": 'Arenosols/Podzols',
    "-103": 'Gleysols',
    "-104": 'Histosols',
    "-105": 'Leptosols',
    "-106": 'Podzols',
    "-107": 'Podzols/Arenosols',
    "-108": 'Regosols',
    "-109": 'Stagnosols',

    // GTK.fi soil types (mp20k_maalajit):
    195111: 'Kalliomaa (Ka) RT',
    195112: 'Rakka (RaKa) RT',
    195113: 'Rapakallio (RpKa) RT',
    195213: 'Soramoreeni (SrMr) RT',
    195214: 'Hiekkamoreeni (Mr) RT',
    195215: 'Hienoainesmoreeni (HMr) RT',
    195311: 'Lohkareita (Lo) RT',
    195312: 'Kiviä (Ki) RT',
    195313: 'Sora (Sr) RT',
    195314: 'Hiekka (Hk) RT',
    195315: 'karkea Hieta (KHt) RT',
    195411: 'hieno Hieta (HHt) RT',
    195412: 'Hiesu (Hs) RT',
    195413: 'Savi (Sa) RT',
    195511: 'Lieju (Lj) RT',
    195512: 'Saraturve (Ct) RT',
    195513: 'Rahkaturve (St) RT',
    195514: 'Turvetuotantoalue (Tu) RT',
    195601: 'Täytemaa (Ta)',
    195602: 'Kartoittamaton (0)',
    195603: 'Vesi (Ve)',
    19531421: 'liejuinen Hiekka (LjHk) RT',
    19531521: 'liejuinen Hieta (karkea) (LjHt) RT',
    19541121: 'liejuinen hieno Hieta (LjHHt) RT',
    19541221: 'Liejuhiesu (LjHs) RT',
    19541321: 'Liejusavi (LjSa) RT',
};

const genericPopupHandler = (layer, fn) => {
    if (Array.isArray(layer)) {
        return layer.forEach(l => genericPopupHandler(l, fn));
    }
    map.on('click', layer, fn);
    map.on('mouseenter', layer, function () {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layer, function () {
        map.getCanvas().style.cursor = '';
    });
}

// kg/ha/year
const turkuAuraJokiEmissions = {
    untreated: {
        totN: 16.5, totP: 1.3, PP: 1.0, DRP: 0.4, solidMatter: 696,
    },
    treated: {
        totN: 4.5, totP: 1.86, PP: 0.95, DRP: 0.91, solidMatter: 570,
    },
};

// Simplified to be small enough to be included inline.
// SELECT ST_AsGeoJSON(ST_Simplify(wkb_geometry,0.01)) FROM aura_joki_value; -- EPSG:4326
//
// The region was obtained from:
// https://metsakeskus.maps.arcgis.com/apps/webappviewer/index.html?id=4ab572bdb631439d82f8aa8e0284f663
// Also http://paikkatieto.ymparisto.fi/value/ (but it crashes the browser pretty easily!)
const turkuAuraJokiValue = { "type": "Polygon", "coordinates": [[[22.6103877990383, 60.6344856066462], [22.5870539729996, 60.6103588211101], [22.6233478269874, 60.5751045114842], [22.6081371120958, 60.5626995848525], [22.6246074790853, 60.5589631167027], [22.611648617642, 60.5406368750108], [22.6314716339555, 60.5150340334038], [22.6092672609967, 60.4938538962352], [22.4821141856954, 60.4683242152806], [22.4659206330005, 60.450887946384], [22.3802794072847, 60.4674571656726], [22.3552912683436, 60.4536851421538], [22.3834536221754, 60.4463719123733], [22.3751925022249, 60.4285164369009], [22.3333390617128, 60.4151056439502], [22.3043323282709, 60.4346888430041], [22.2864479797805, 60.4347006782323], [22.2854431135939, 60.416082779118], [22.2287674601729, 60.4333815276613], [22.2759013480459, 60.4641676815831], [22.2655255299015, 60.4711140245897], [22.2847212938923, 60.495795969575], [22.2673139070335, 60.5176149346882], [22.3275866631243, 60.5391575071753], [22.2614068872664, 60.5673420543226], [22.2678055710792, 60.5790404344835], [22.3609367082758, 60.5887055316531], [22.3772772685066, 60.603266563484], [22.3587439869585, 60.6056855294338], [22.4099654349429, 60.6259246878061], [22.3993092976892, 60.6329568465254], [22.4175178677525, 60.6469925120255], [22.5366813830571, 60.6510082108548], [22.5450098508632, 60.6360496225363], [22.6117183453645, 60.6535058093237], [22.6103877990383, 60.6344856066462]]] };
const turkuAuraJokiValueFeature = turfFeature(turkuAuraJokiValue);

const setupPopupHandlerForMaviPeltolohko = layerName => {
    genericPopupHandler(layerName, ev => {
        const f = ev.features[0];
        const { soil_type1, soil_type1_ratio, soil_type2, soil_type2_ratio, pinta_ala } = f.properties;
        const areaHa = 0.01 * +pinta_ala;

        // Sometimes there's overlapping data so the sum is > 100%.
        // However, the data itself is coarse-grained so normalizing
        // the ratios to 100% is justified.
        // The error is within the bounds of data accuracy anyway
        // (and this only applies to small % of cases anyway).
        const normalizedSoilRatio = (
            soil_type2_ratio <= 0 ? 1 : soil_type1_ratio / (soil_type1_ratio + soil_type2_ratio)
        );
        const normalizedSoilRatioPct = Math.round(100 * normalizedSoilRatio);
        let html = '<strong>Field plot</strong><br/>'
        if (soil_type1 !== -1) {
            html += `
                Primary soil: ${gtkLukeSoilTypes[soil_type1]} (${normalizedSoilRatioPct} %)
                <br/>
            `;
        }
        if (soil_type2 !== -1 && normalizedSoilRatioPct <= 99) {
            html += `
            Secondary soil: ${gtkLukeSoilTypes[soil_type2]} (${100 - normalizedSoilRatioPct} %)
            <br/>
            `;
        }
        html += `
            Area: ${pp(areaHa, 3)} hectares
            <br/>
            Emission reduction potential: ${pp(fieldPlotCO2eFn(f.properties))} tons CO₂e per year
        `;

        // Simplification: The field is in the catchment area if any part of it is.
        const inTurkuAurajokiCatchmentArea = turfFlattenReduce(
            turfFeature(f.geometry),
            (v, feature) => v || turfBooleanWithin(feature, turkuAuraJokiValueFeature),
            false
        );

        const e = turkuAuraJokiEmissions;
        if (inTurkuAurajokiCatchmentArea) {
            html += `
            <hr/>
            <abbr class="tooltip" title="Väisänen & Puustinen (toim.), 2010">Current material emissions to the Aura river</abbr>:<br/>
            Nitrogen: ${pp(e.untreated.totN * areaHa)} kg per year<br/>
            Phosphorus: ${pp(e.untreated.totP * areaHa)} kg per year<br/>
            Solid matter: ${pp(e.untreated.solidMatter * areaHa)} kg per year<br/>

            <abbr class="tooltip" title="Puustinen ym. (2005), Puustinen (2013)">Potential emission reductions</abbr>:<br/>
            Nitrogen: ${pp((e.untreated.totN - e.treated.totN) * areaHa)} kg per year<br/>
            Phosphorus: ${pp((e.untreated.totP - e.treated.totP) * areaHa)} kg per year (a small increase)<br/>
            Solid matter: ${pp((e.untreated.solidMatter - e.treated.solidMatter) * areaHa)} kg per year<br/>
            `;
        }

        new mapboxgl.Popup({ maxWidth: '360px' })
            .setLngLat(ev.lngLat)
            .setHTML(html)
            .addTo(map);
    });
}



const metsaanFiSoilTypes = [
    [10, 'Rough or medium grade soil of heathland', 'Keskikarkea tai karkea kangasmaa'],
    [11, 'Rough moraine', 'Karkea moreeni'],
    [12, '', 'Karkea lajittunut maalaji'],
    [20, '', 'Hienojakoinen kangasmaa'],
    [21, '', 'Hienoainesmoreeni'],
    [22, '', 'Hienojakoinen lajittunut maalaji'],
    [23, '', 'Silttipitoinen maalaji'],
    [24, 'Clay', 'Savimaa'],
    [30, 'Stony rough or medium grade soil of heathland', 'Kivinen keskikarkea tai karkea kangasmaa'],
    [31, 'Stony rough moraine', 'Kivinen karkea moreeni'],
    [32, '', 'Kivinen karkea lajittunut maalaji'],
    [40, '', 'Kivinen hienojakoinen kangasmaa'],
    [50, 'Rocky groud', 'Kallio tai kivikko'],
    [60, 'Peatland', 'Turvemaa'],
    [61, 'Carex peat', 'Saraturve'],
    [62, 'Sphagnum-peat', 'Rahkaturve'],
    [63, '', 'Puuvaltainen turve'],
    [64, '', 'Eroosioherkkä saraturve (von Post luokka yli 5)'],
    [65, '', 'Eroosioherkkä rahkaturve (von Post luokka yli 5)'],
    [66, '', 'Maatumaton saraturve (von Post luokka enintään 5)'],
    [67, '', 'Maatumaton rahkaturve (von Post luokka enintään 5)'],
    [70, 'Mold soil', 'Multamaa'],
    [80, 'Silt', 'Liejumaa'],
];


const metsaanFiDatasources = [
    { 'id': 1, 'code': '1', 'description': 'Maastossa mitattu' },
    { 'id': 2, 'code': '2', 'description': 'Kaukokartoitettu' },
    { 'id': 3, 'code': '3', 'description': 'Maastossa mitattu ja laskennallisesti kasvatettu' },
    { 'id': 4, 'code': '4', 'description': 'Kaukokartoitettu ja laskennallisesti kasvatettu' },
    { 'id': 5, 'code': '5', 'description': 'Taimikon perustamistiedosta laskennallisesti tuotettu uusi puusto' },
    { 'id': 6, 'code': '6', 'description': 'Kasvatettu laskennallisesti toteutuneen metsänhoitotyön perusteella' },
    { 'id': 7, 'code': '7', 'description': 'Kasvatettu laskennallisesti toteutuneen hakkuun perusteella' },
    { 'id': 8, 'code': '9', 'description': 'Puustotieto muodostettu eri lähteitä yhdistäen / ei määritelty' },
    { 'id': 9, 'code': '10', 'description': 'Metsävaratiedonkeruu' },
    { 'id': 10, 'code': '11', 'description': 'Metsävaratiedonkeruu, Aarni' },
    { 'id': 11, 'code': '12', 'description': 'Metsävaratiedonkeruu, Luotsi' },
    { 'id': 12, 'code': '13', 'description': 'Metsävaratiedonkeruu, TASO' },
    { 'id': 13, 'code': '14', 'description': 'Metsävaratiedonkeruu, muu MV-järjestelmä' },
    { 'id': 14, 'code': '20', 'description': 'Metsäsuunnittelu' },
    { 'id': 15, 'code': '21', 'description': 'Metsäsuunnittelu, uusi MS-järjestelmä' },
    { 'id': 16, 'code': '22', 'description': 'Metsäsuunnittelu, Luotsi' },
    { 'id': 17, 'code': '23', 'description': 'Metsäsuunnittelu, TASO' },
    { 'id': 18, 'code': '24', 'description': 'Metsäsuunnittelu, muu MS-järjestelmä' },
    { 'id': 19, 'code': '30', 'description': 'Arvokas elinympäristö' },
    { 'id': 20, 'code': '31', 'description': 'Arvokas elinympäristö, metsälaki' },
    { 'id': 21, 'code': '32', 'description': 'Arvokas elinympäristö, luonnonsuojelulaki' },
    { 'id': 22, 'code': '33', 'description': 'Arvokas elinympäristö, metsäsertifiointi' },
    { 'id': 23, 'code': '34', 'description': 'Arvokas elinympäristö, muu arvokas elinympäristö' },
    { 'id': 24, 'code': '35', 'description': 'Arvokas elinympäristö, METSO' },
    { 'id': 25, 'code': '36', 'description': 'Arvokas elinympäristö, ympäristötukikohde' },
    { 'id': 26, 'code': '101', 'description': 'Maastossa mitattu' },
    { 'id': 27, 'code': '102', 'description': 'Kaukokartoitettu' },
    { 'id': 28, 'code': '103', 'description': 'Taimikon perustamisilmoitus' },
    { 'id': 29, 'code': '104', 'description': 'Metsänkäyttöilmoitus' },
    { 'id': 30, 'code': '105', 'description': 'Monilähde-VMI' },
    { 'id': 31, 'code': '109', 'description': 'Metsävaratieto, ei määritelty' },
    { 'id': 32, 'code': '202', 'description': 'MKI-kuvio, suunniteltu hakkuu' },
    { 'id': 33, 'code': '212', 'description': 'MKI-kuvio, suunniteltu uudistaminen' },
    { 'id': 34, 'code': '213', 'description': 'MKI-kuvio, perustamistieto' },
    { 'id': 35, 'code': '201', 'description': 'TP-kuvio' },
    { 'id': 36, 'code': '203', 'description': 'TPI-kuvio' },
    { 'id': 37, 'code': '204', 'description': 'Kemera-kuvio' },
    { 'id': 38, 'code': '205', 'description': 'Luotsi-kuvio' },
    { 'id': 39, 'code': '206', 'description': 'Metsänomistaja' },
    { 'id': 40, 'code': '207', 'description': 'Toimija' },
    { 'id': 41, 'code': '208', 'description': 'Muu' },
];

const metsaanFiDevelopmentClass = {
    "02": 'Young growing forest',
    "03": 'Grown up growing forest',
    "04": 'Mature forest',
    "05": 'Shelterwood forest',
    "A0": 'Open land',
    "ER": 'Uneven-aged forest',
    "S0": 'Seed-tree stand',
    "T1": 'Recently planted forest under 1,3 m',
    "T2": 'Recently planted forest over 1,3 m',
    "Y1": 'Recently planted fores with hold-over trees',
};
const metsaanFiFertilityClass = {
    1: 'Grove, fen, grovy fen (and grassy peatland)',
    2: 'Grovy heathland, analogous fen and grovy peatland',
    3: 'Green heathland, analogous fen and blueberry peatland',
    4: 'dryish heathland, analogous fen and lingonberry peatland',
    5: 'dry heathland, analogous fen and shrub dry peatland',
    6: 'Barren heathland, analogous fen (and lichen peatland)',
    7: 'rocky groud and sandy ground',
    8: 'peak forest and fell',
};
const metsaanFiMainGroups = {
    1: 'Forest land',
    2: 'Low-productive forest land',
    3: 'Wasteland',
    4: 'Other forest management land',
    5: 'Lot',
    6: 'Agricultural land',
    7: 'Other land',
    8: 'Water land',
};
const metsaanFiSubgroups = {
    1: 'Heathland',
    2: 'Spruce peatland',
    3: 'Pine peatland',
    4: 'Peat bog',
    5: 'Fen',
};
const metsaanFiTreeSpecies = {
    1: "Pine",
    2: "Spruce",
    3: "Silver birch",
    4: "Downy birch",
    5: "Asp",
    6: "Grey alder",
    7: "Black alder",
    8: "Other coniferous tree",
    9: "Other deciduous tree",
    10: "Oregon pine",
    11: "Common juniper",
    12: "Contorta pine",
    13: "European white elm",
    14: "Larch",
    15: "Small-leaved lime",
    16: "Black spruce",
    17: "Willow",
    18: "Rowan",
    19: "Fir",
    20: "Goat willow",
    21: "Ash",
    22: "Swiss pine",
    23: "Serbian spruce",
    24: "Oak",
    25: "Bird cherry",
    26: "Maple",
    27: "Curly birch",
    28: "Scots elm",
    29: "Deciduous tree",
    30: "Coniferous tree",
}
const metsaanFiAccessibilityClassifier = {
    1: 'All-year available',
    2: 'With melt soil but not during possible frost damage',
    3: 'Also smelt ground, but not rasputitsa',
    4: 'Only when soil is frozen',
    5: 'Not defined',
}


const setupPopupHandlerForMetsaanFiStandData = layerName => {
    genericPopupHandler(layerName, e => {
        const f = e.features[0];
        const p = f.properties;

        const soilTypeInfo = metsaanFiSoilTypes.filter(x => x[0] === p.soiltype)[0];
        let _id = null, soilEn = '', soilFi = '';
        if (soilTypeInfo) {
            [_id, soilEn, soilFi] = soilTypeInfo;
        }

        const ditching = p.ditch_completed_at || p.ditchingyear ?
            `Completed at: ${p.ditch_completion_date || p.ditchingyear}` :
            '';

        const html = `
            <table>
            <tr><th>Main tree species</th><td>${metsaanFiTreeSpecies[p.maintreespecies] || ''}</td></tr>
            <tr><th>Average tree age</th><td>${p.meanage} years</td></tr>
            <tr><th>Average tree trunk diameter</th><td>${p.meandiameter} cm</td></tr>
            <tr><th>Average tree height</th><td>${p.meanheight} m</td></tr>
            <tr><th>Soil</th><td>${soilEn || soilFi || ''}</td></tr>
            <tr><th>Area</th><td>${pp(p.area, 3)} hectares</td></tr>
            <tr><th>Accessibility</th><td>${metsaanFiAccessibilityClassifier[p.accessibility] || ''}</td></tr>
            <tr><th>Approx. tree stem count</th><td>${pp(p.stemcount * p.area)}</td></tr>
            <!-- <tr><th>TODO(Probably/Not/Yes/No): Mature enough for regeneration felling?</th><td>${p.regeneration_felling_prediction}</td></tr> -->
            <tr><th>Development class</th><td>${metsaanFiDevelopmentClass[p.developmentclass] || ''}</td></tr>
            <tr><th>Fertility classifier</th><td>${metsaanFiFertilityClass[p.fertilityclass] || ''}</td></tr>
            <tr><th>Main group</th><td>${metsaanFiMainGroups[p.maingroup] || ''}</td></tr>
            <tr><th>Subgroup</th><td>${metsaanFiSubgroups[p.subgroup] || ''}</td></tr>
            <tr><th>Ditching</th><td>${ditching}</td></tr>
            <tr><th>Data source</th><td>${metsaanFiDatasources.filter(x => x.id === p.datasource)[0].description || ''}</td></tr>
            <tr><th>Identifier</th><td>StandID=${p.standid}</td></tr>
        `;

        new mapboxgl.Popup({ maxWidth: '360px' })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
    });
}

let initialMapLoaded = false;
map.on('load', () => {
    initialMapLoaded = true;

    const emptyGeoJson = { type: 'geojson', data: { "type": "FeatureCollection", features: [], } };

    // Add empty pseudo-layers to make Z-ordering much easier:
    map.addLayer({ id: 'BACKGROUND', type: 'fill', source: emptyGeoJson });
    map.addLayer({ id: 'FILL', type: 'fill', source: emptyGeoJson, BEFORE: 'BACKGROUND' });
    map.addLayer({ id: 'OUTLINE', type: 'fill', source: emptyGeoJson, BEFORE: 'FILL' }); // Outlines go on top of fills, etc. But below labels
    map.addLayer({ id: 'BG_LABEL', type: 'fill', source: emptyGeoJson, BEFORE: 'OUTLINE' }); // Background map labels are less important than custom labels
    map.addLayer({ id: 'LABEL', type: 'fill', source: emptyGeoJson, BEFORE: 'BG_LABEL' }); // Labels go on top of almost everything
    map.addLayer({ id: 'TOP', type: 'fill', source: emptyGeoJson, BEFORE: 'LABEL' }); // TOP goes on top of labels too

    const originalMapLayerIds = {}

    addLayer({
        'id': 'terramonitor',
        'type': 'raster',
        'source': {
            'type': 'raster',
            'tiles': [
                `https://tm2.terramonitor.com/${process.env.TERRAMONITOR_KEY}/rgb/{z}/{x}/{y}.png`,
            ],
            'tileSize': 256,
            // "maxzoom": 16, // After zoom level 16 the images (used to) get blurrier
            attribution: '<a href="https://www.terramonitor.com">© Terramonitor</a>',
        },
        'paint': {},
        BEFORE: 'BACKGROUND',
    });


    map.getStyle().layers.forEach(x => originalMapLayerIds[x.id] = true)


    addSource('metsaan-hila', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/metsaan-hila/{z}/{x}/{y}.pbf"],
        "maxzoom": 15,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://www.metsaan.fi">© Finnish Forest Centre</a>',
    });
    addLayer({
        'id': 'metsaan-hila-c',
        'source': 'metsaan-hila',
        'source-layer': 'metsaan-hila',
        'type': 'fill',
        'paint': {
            'fill-color': [
                'interpolate',
                ['linear'],
                ['get', 'age'],
                0, 'rgb(218,248,85)', // green
                70, 'rgb(252,113,34)', // orange
                100, 'rgb(245,17,72)', // red
            ],
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'metsaan-hila-outline',
        'source': 'metsaan-hila',
        'source-layer': 'metsaan-hila',
        'type': 'line',
        "minzoom": 14,
        'paint': {
            'line-opacity': 0.75,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'metsaan-hila-sym',
        'source': 'metsaan-hila',
        'source-layer': 'metsaan-hila',
        'type': 'symbol',
        "minzoom": 15,
        // 'maxzoom': zoomThreshold,
        "paint": {},
        "layout": {
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": 'Age:{age} Avg.Diameter:{meandiameter}',
            "text-size": 10,
        },
        BEFORE: 'LABEL',
    })


    addSource('natura2000', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/natura2000/{z}/{x}/{y}.pbf"],
        "maxzoom": 11,
        bounds: [19, 59, 32, 71], // Finland
        // SYKE applies Creative Commons By 4.0 International license for open datasets.
        attribution: '<a href=https://www.syke.fi/en-US/Open_information">SYKE</a>',
    });
    Object.entries(natura2000_mappings).map(([baseName, x]) => {
        addLayer({
            'id': baseName,
            'source': 'natura2000',
            'source-layer': x.layer,
            'type': 'fill',
            'paint': {
                'fill-color': x.color,
                'fill-opacity': 0.45,
            },
            BEFORE: 'FILL',
        })
        addLayer({
            'id': `${baseName}-sym`,
            'source': 'natura2000',
            'source-layer': x.layer,
            'type': 'symbol',
            "layout": {
                "text-font": ["Open Sans Regular"],
                "text-field": [
                    "case",
                    ["has", "nimiSuomi"], ["coalesce", ["get", "nimiSuomi"], ""],
                    ["has", "nimiRuotsi"], ["coalesce", ["get", "nimiRuotsi"], ""],
                    ["has", "nimi"], ["coalesce", ["get", "nimi"], ""],
                    ""
                ],
            },
            paint: {
                'text-color': "#999",
                'text-halo-blur': 1,
                'text-halo-color': "rgb(242,243,240)",
                'text-halo-width': 2,
            },
            BEFORE: 'LABEL',
        })
    })


    addSource('metsaan-ete', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/metsaan-ete/{z}/{x}/{y}.pbf"],
        "maxzoom": 12,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://www.metsaan.fi">© Finnish Forest Centre</a>',
    });
    addLayer({
        'id': 'metsaan-ete-all-c',
        'source': 'metsaan-ete',
        'source-layer': 'metsaan-ete',
        'type': 'fill',
        'paint': {
            'fill-color': 'cyan',
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'metsaan-ete-all-outline',
        'source': 'metsaan-ete',
        'source-layer': 'metsaan-ete',
        'type': 'line',
        "minzoom": 12,
        'paint': {
            'line-opacity': 1,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'metsaan-ete-all-sym',
        'source': 'metsaan-ete',
        'source-layer': 'metsaan-ete',
        'type': 'symbol',
        "layout": {
            "text-font": ["Open Sans Regular"],
            "text-field": eteBasicLabels,
        },
        paint: {
            'text-color': "#999",
            'text-halo-blur': 1,
            'text-halo-color': "rgb(242,243,240)",
            'text-halo-width': 2,
        },
        BEFORE: 'LABEL',
    })


    addSource('mavi-peltolohko', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/mavi-peltolohko/{z}/{x}/{y}.pbf"],
        "maxzoom": 11,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://www.ruokavirasto.fi/">© Finnish Food Authority</a>',
    });

    addLayer({
        'id': 'mavi-plohko-fill',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'type': 'fill',
        'paint': {
            'fill-color': ["case", [">=", fieldPlotHistosolRatio, 0.4], fieldColorHistosol, fieldColorDefault],
            // 'fill-color': fieldAreaCO2eFillColor(fieldPlotCO2ePerHectare),
            // 'fill-color': '#FFC300',
            // 'fill-opacity': fillOpacity, // Set by fill-color rgba
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'mavi-plohko-outline',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'type': 'line',
        "minzoom": 11,
        'paint': {
            'line-opacity': 0.75,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'mavi-plohko-co2',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'type': 'symbol',
        minzoom: 14.5,
        'paint': {},
        'layout': {
            "text-font": ["Open Sans Regular"],
            'text-field': fieldPlotTextField,
        },
        BEFORE: 'LABEL',
    })

    addLayer({
        'id': 'mavi-plohko-mineral-fill',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'filter': ["<", fieldPlotHistosolRatio, 0.4],
        'type': 'fill',
        'paint': {
            'fill-color': ["case", [">=", fieldPlotHistosolRatio, 0.4], fieldColorHistosol, fieldColorDefault],
            // 'fill-color': fieldAreaCO2eFillColor(fieldPlotCO2ePerHectare),
            // 'fill-color': '#FFC300',
            // 'fill-opacity': fillOpacity, // Set by fill-color rgba
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'mavi-plohko-mineral-outline',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'filter': ["<", fieldPlotHistosolRatio, 0.4],
        'type': 'line',
        "minzoom": 11,
        'paint': {
            'line-opacity': 0.75,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'mavi-plohko-mineral-co2',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'filter': ["<", fieldPlotHistosolRatio, 0.4],
        'type': 'symbol',
        minzoom: 14.5,
        'paint': {},
        'layout': {
            "text-font": ["Open Sans Regular"],
            'text-field': fieldPlotTextField,
        },
        BEFORE: 'LABEL',
    })

    addLayer({
        'id': 'mavi-plohko-peatland-fill',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'filter': [">=", fieldPlotHistosolRatio, 0.4],
        'type': 'fill',
        'paint': {
            'fill-color': ["case", [">=", fieldPlotHistosolRatio, 0.4], fieldColorHistosol, fieldColorDefault],
            // 'fill-color': fieldAreaCO2eFillColor(fieldPlotCO2ePerHectare),
            // 'fill-color': '#FFC300',
            // 'fill-opacity': fillOpacity, // Set by fill-color rgba
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'mavi-plohko-peatland-outline',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'filter': [">=", fieldPlotHistosolRatio, 0.4],
        'type': 'line',
        "minzoom": 11,
        'paint': {
            'line-opacity': 0.75,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'mavi-plohko-peatland-co2',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'filter': [">=", fieldPlotHistosolRatio, 0.4],
        'type': 'symbol',
        minzoom: 14.5,
        'paint': {},
        'layout': {
            "text-font": ["Open Sans Regular"],
            'text-field': fieldPlotTextField,
        },
        BEFORE: 'LABEL',
    })

    setupPopupHandlerForMaviPeltolohko(['mavi-plohko-fill', 'mavi-plohko-peatland-fill', 'mavi-plohko-mineral-fill']);

    addSource('mavi-peltolohko-removed', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/mavi-peltolohko-removed-2017b/{z}/{x}/{y}.pbf.gz?v=4"],
        "maxzoom": 11,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://www.ruokavirasto.fi/">© Finnish Food Authority</a>',
    });
    addLayer({
        'id': 'mavi-plohko-removed-fill',
        'source': 'mavi-peltolohko-removed',
        'source-layer': 'default',
        'type': 'fill',
        'paint': {
            'fill-color': [
                'case', ['has', 'soil_type1_ratio'], [
                    "case", [">=", fieldPlotHistosolRatio, 0.4],
                    'rgb(150, 52, 52)', // histosol
                    'rgb(194, 21, 207)', // mineral land
                ],
                'rgb(150, 52, 52)', // default -- TODO: update dataset with soil info later
            ],
            // 'fill-color': 'rgb(150, 52, 52)',
            // 'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'mavi-plohko-removed-outline',
        'source': 'mavi-peltolohko-removed',
        'source-layer': 'default',
        'type': 'line',
        "minzoom": 11,
        'paint': {
            'line-opacity': 0.75,
        },
        BEFORE: 'OUTLINE',
    })
    genericPopupHandler('mavi-plohko-removed-fill', e => {
        const f = e.features[0];
        const { pinta_ala, ymparys, lohko } = f.properties;
        const areaHa = 0.01 * +pinta_ala;

        const html = `<strong>A former field plot</strong>
        <br/><strong>Area</strong>: ${areaHa.toFixed(1)} hectares
        <br/><strong>Perimeter</strong>: ${(+ymparys).toFixed(0)} metres
        <br/><strong>Plot ID:</strong>: ${lohko}
        `
        new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
    });


    addSource('helsinki-buildings', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/helsinki-buildings/{z}/{x}/{y}.pbf"],
        "maxzoom": 14,
        // Bounds source: https://koordinates.com/layer/4257-finland-11000000-administrative-regions/
        // select ST_Extent(ST_Transform(ST_SetSRID(geom,3067), 4326))
        // from "finland-11000000-administrative-regions" where kunta_ni1='Helsinki';
        bounds: [24, 59, 26, 61],
        attribution: '<a href="https://www.hel.fi">© City of Helsinki</a>',
    });
    addLayer({
        'id': 'helsinki-buildings-fill',
        'source': 'helsinki-buildings',
        'source-layer': 'Rakennukset_alue',
        'type': 'fill',
        'paint': {
            'fill-color': 'cyan',
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'helsinki-buildings-outline',
        'source': 'helsinki-buildings',
        'source-layer': 'Rakennukset_alue',
        'type': 'line',
        "minzoom": 11,
        'paint': {
            'line-opacity': 0.75,
        },
        BEFORE: 'OUTLINE',
    })

    // (60 kWh/m3)  * (0.250 CO2e kg/kWh) -> 15kg/m3
    addLayer({
        'id': 'helsinki-buildings-co2',
        'source': 'helsinki-buildings',
        'source-layer': 'Rakennukset_alue',
        'type': 'symbol',
        "minzoom": 16,
        'paint': {},
        "layout": {
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-size": 20,
            "text-field": [
                "case", ["has", "i_raktilav"], [
                    'let',
                    "co2", ['/', ['*', 15, ['to-number', ["get", "i_raktilav"], 0]], 1000],
                    [
                        'concat',
                        roundToSignificantDigits(2, ['var', 'co2']), // kg -> tons
                        ' t CO2e/y',
                    ],
                ], "",
            ],
        },
        BEFORE: 'LABEL',
    })


    addSource('helsinki-puretut', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/hel-puretut/{z}/{x}/{y}.pbf.gz?v=0"],
        "maxzoom": 14,
        // Bounds source: https://koordinates.com/layer/4257-finland-11000000-administrative-regions/
        // select ST_Extent(ST_Transform(ST_SetSRID(geom,3067), 4326))
        // from "finland-11000000-administrative-regions" where kunta_ni1='Helsinki';
        bounds: [24, 59, 26, 61],
        attribution: '<a href="https://www.hel.fi">© City of Helsinki</a>',
    });
    addLayer({
        'id': 'helsinki-puretut-fill',
        'source': 'helsinki-puretut',
        'source-layer': 'default',
        'type': 'fill',
        'paint': {
            'fill-color': 'red',
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'helsinki-puretut-outline',
        'source': 'helsinki-puretut',
        'source-layer': 'default',
        'type': 'line',
        "minzoom": 11,
        'paint': {
            'line-opacity': 0.75,
        },
        BEFORE: 'OUTLINE',
    })

    addLayer({
        'id': 'helsinki-puretut-sym',
        'source': 'helsinki-puretut',
        'source-layer': 'default',
        'type': 'symbol',
        "minzoom": 16,
        'paint': {},
        "layout": {
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-size": 20,
            "text-field": "",
        },
        BEFORE: 'LABEL',
    })
    genericPopupHandler('helsinki-puretut-fill', e => {
        const htmlParts = [];
        const buildingIdMap = {};
        e.features.forEach(f => {
            const p = f.properties;
            const buildingIdText = p.vtj_prt && p.ratu
                ? `${p.vtj_prt} (${p.ratu})`
                : p.vtj_prt || p.ratu;
            const s = `
            <p>
            XXX_BUILDING_ID_TEMPLATE_XXX
            <address>
            ${p.osoite}<br/>
            ${p.postinumero}
            </address>
            <strong>Demolition requested by:</strong> <address>
            ${p.hakija}<br/>
            ${p.hakija_osoite}<br/>
            ${p.hakija_postinumero}<br/>
            </address>
            <strong>Demolition permit valid until:</strong> ${p.lupa_voimassa_asti}
            </p>
            `;
            // Deduplicate info texts:
            if (htmlParts.indexOf(s) === -1) {
                htmlParts.push(s);
            }
            buildingIdMap[s] = buildingIdMap[s] || [];
            if (buildingIdText) buildingIdMap[s].push(buildingIdText);
        })

        const html = htmlParts.reduce((a, b) => a + b.replace(
            'XXX_BUILDING_ID_TEMPLATE_XXX',
            buildingIdMap[b]
                ? buildingIdMap[b].reduce((a, b) => a ? `${a}, ${b}` : `<strong>Building ID:</strong> ${b}`, '')
                : ''
        ), '')

        new mapboxgl.Popup({ maxWidth: '360px' })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
    });


    addSource('metsaan-stand', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/stand2/{z}/{x}/{y}.pbf.gz?v=2"],
        "minzoom": 12,
        "maxzoom": 13,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://www.metsaan.fi">© Finnish Forest Centre</a>',
    });

    // // TODO: maybe enable this in the future?
    // const fillColorCO2e = areaCO2eFillColor([
    //     'case',
    //     ['has', 'co2'],
    //     [
    //         'let',
    //         'co2', ['to-number', ['get', 'co2'], 0],
    //         'area', ['*', 1e-4, ['to-number', ['get', 'st_area'], 0]],
    //         [
    //             'case', ['==', ['var', 'area'], 0], 0,
    //             ['/', ['var', 'co2'], ['var', 'area']],
    //         ],
    //     ],
    //     0,
    // ]);
    // The original fill color. Consistent with the raster overview images at the moment.
    const fillColorFertilityClass = [
        'interpolate',
        ['linear'],
        ['get', 'fertilityclass'],
        1, 'rgba(245,17,72,0.8)', // red
        4, 'rgba(252,113,34,0.8)', // orange
        // 8, 'rgba(218,248,85,0.8)',
        6, 'rgba(218,248,85,0.8)', // green
    ];
    const fillRegenerationFelling = [
        'case', ['>=', 0.5, ['get', 'regeneration_felling_prediction']],
        'rgba(73, 25, 2320, 0.65)',
        'rgba(206, 244, 66, 0.35)',
    ];
    addLayer({
        'id': 'metsaan-stand-fill',
        'source': 'metsaan-stand',
        'source-layer': 'stand',
        'type': 'fill',
        'paint': {
            'fill-color': fillColorFertilityClass,
            // 'fill-opacity': fillOpacity, // Set by fill-color rgba
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'metsaan-stand-outline',
        'source': 'metsaan-stand',
        'source-layer': 'stand',
        'type': 'line',
        "minzoom": 11,
        // 'maxzoom': zoomThreshold,
        'paint': {
            'line-opacity': 0.5,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'metsaan-stand-co2',
        'source': 'metsaan-stand',
        'source-layer': 'stand',
        'type': 'symbol',
        "minzoom": 15.5,
        // 'maxzoom': zoomThreshold,
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": [
                "case", ["has", "co2"], [
                    "case", ["<", ["to-number", ["get", "co2"], 0], 0.1], "", [
                        "concat",
                        ["get", "co2"],
                        "t CO2e/y",
                    ],
                ], "",
            ],
        },
        BEFORE: 'LABEL',
    })


    const arcgisSources = {};
    const arcgisLayers = {};
    const arcgisLayerCache = {};


    function wmsGetAllLayers(wmsCapabilities) {
        if ('Name' in wmsCapabilities) {
            return [[wmsCapabilities.Name, wmsCapabilities.Style[0].Name]];
        } else if ('Layer' in wmsCapabilities) {
            return wmsGetAllLayers(wmsCapabilities.Layer);
        } else if (wmsCapabilities instanceof Array) {
            return Array.concat(...wmsCapabilities.map(wmsGetAllLayers));
        } else {
            console.error('Unknown WMS type:', wmsCapabilities);
        }
    }

    async function genericArcgisWMSServer(serviceRestUrl, bbox) {
        console.log('Showing ArcGIS WMS Server:', serviceRestUrl);

        // const serviceRestUrl = 'http://geogis.kiev.ua/arcgis/rest/services/Aukc/Boreholes/MapServer';
        const idx = serviceRestUrl.toLowerCase().indexOf('/rest/');
        const soapUrl = serviceRestUrl.slice(0, idx) + serviceRestUrl.slice(idx + 5) // only remove the first occurrence of '/rest'
        const tileSize = 256;

        // const serviceInfo = await cachedFetchJSON(`${serviceRestUrl}?f=pjson`);
        // format can be one of: PNG, PNG32, PNG8, JPEG, LERC, MIXED, ...
        // const imageFormat = serviceInfo.format === 'JPEG' ? 'image/jpeg' : 'image/png';
        const imageFormat = 'image/png';

        const parser = new WMSCapabilities();
        const capabilitiesUrl = `${soapUrl}/WMSServer?request=GetCapabilities&service=WMS`
        const response = await cachedFetchText(capabilitiesUrl);
        const capabilities = parser.read(response);
        console.log('WMS server capabilities:', capabilities);

        // TODO: this is a bit questionable
        // const layerData = Array.concat(...capabilities.Capability.Layer.Layer.map(x => x.Layer));

        const layersAndStyles = wmsGetAllLayers(capabilities.Capability);
        const layers = layersAndStyles.map(x => x[0]);
        const styles = layersAndStyles.map(x => x[1]);
        // const layers = layerData.map(x => x.Name).join(',');
        // const styles = layerData.map(x => x.Style[0].Name).join(','); // TODO: get legend URLs also?
        const url2 = `${soapUrl}/WMSServer?bbox={bbox-epsg-3857}&format=${imageFormat}&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=${tileSize}&height=${tileSize}&layers=${layers}&styles=${styles}`;

        if (map.getLayer(serviceRestUrl)) {
            map.getLayer(serviceRestUrl) && map.removeLayer(serviceRestUrl);
            return; // Toggle visibility
        }
        map.getSource(serviceRestUrl) && map.removeSource(serviceRestUrl);
        map.addSource(serviceRestUrl, {
            type: 'raster',
            'tiles': [url2],
            tileSize,
            // "maxzoom": 18, // TODO figure out some sensible value here
            bounds: bbox,
        });

        map.addLayer({
            id: serviceRestUrl,
            source: serviceRestUrl,
            'type': 'raster',
            paint: {
                'raster-opacity': 0.7,
            },
            BEFORE: 'FILL',
        }, 'FILL');
        arcgisLayers[serviceRestUrl] = true;

        // Fetch legend last. Any failure here is non-fatal.
        // TODO: show the legend somewhere.
        const legend = await cachedFetchJSON(`${serviceRestUrl}/legend?f=pjson`);
    }

    function getViewportGeoEnvelope() {
        const bounds = map.getBounds();
        return {
            xmin: bounds.getWest(),
            xmax: bounds.getEast(),
            ymin: bounds.getSouth(),
            ymax: bounds.getNorth(),
        };
    }

    const __cachedFetchJSON_cache = {};
    async function cachedFetchJSON(url) {
        if (url in __cachedFetchJSON_cache) {
            return __cachedFetchJSON_cache[url];
        }
        const response = await fetch(url);
        __cachedFetchJSON_cache[url] = await response.json();
        return __cachedFetchJSON_cache[url];
    }

    const __cachedFetchText_cache = {};
    async function cachedFetchText(url) {
        if (url in __cachedFetchText_cache) {
            return __cachedFetchText_cache[url];
        }
        const response = await fetch(url);
        __cachedFetchText_cache[url] = await response.text();
        return __cachedFetchText_cache[url];
    }

    function boundsIntersect(b1, b2) {
        const noIntersection = (
            b1[0] > b2[2] ||
            b2[0] > b1[2] ||
            b1[1] > b2[3] ||
            b2[1] > b1[3]
        );
        return !noIntersection;
    }

    async function genericArcgisFeatureServer(layerUrl, bbox, x) {
        // const layerUrl = 'https://services5.arcgis.com/QJebCdoMf4PF8fJP/ArcGIS/rest/services/Strava_Commuters/FeatureServer/0';

        // NB: this is tricky. WFS is not supported by mapbox-gl,
        // and we'd have to refresh the features each time we move around in the map
        // (unless there are sufficiently few features in total!)
        // const url2 = `${url}?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&layers=0&styles=default`;

        console.log('Showing ArcGIS Feature Server:', layerUrl);
        const layerInfo = await cachedFetchJSON(`${layerUrl}?f=pjson`);

        // PBF is apparently not MVT :/
        // https://community.esri.com/thread/226299-feature-service-layer-query-pbf-format-mapbox-vt-spec-compliant
        const preferredFormats = ['geoJSON', 'JSON'];
        const supportedQueryFormats = layerInfo.supportedQueryFormats === null ? [] : layerInfo.supportedQueryFormats.split(', ')
        const queryFormat = preferredFormats.filter(x => supportedQueryFormats.indexOf(x) !== -1)[0];

        if (supportedQueryFormats.length && !queryFormat) {
            console.error('Unsupported query format:', layerInfo.supportedQueryFormats);
            return;
        } else if (!queryFormat) {
            console.error('No supportedQueryFormats:', layerInfo);
            // No formats to use whatsoever
            return;
        }

        if (layerInfo.capabilities.indexOf('Query') === -1) {
            console.error('Layer does not support querying!', layerInfo);
            // TODO: do something about this. Display a UI error?
        }

        // returnCountOnly would also work but requires arcgis 10.0 or 10.6+
        if (!(layerUrl in arcgisLayerCache)) {
            const countUrl = `${layerUrl}/query/?where=1=1&f=pjson&returnIdsOnly=true`;
            const response = await fetch(countUrl);
            const { error, objectIds } = await response.json();
            if (error) {
                console.error('Unexpected error while querying data:', error)
                arcgisLayerCache[layerUrl] = { hasMoreData: true }; // TODO
            } else {
                arcgisLayerCache[layerUrl] = { hasMoreData: objectIds.length > layerInfo.maxRecordCount };
            }
        }
        const hasMoreData = arcgisLayerCache[layerUrl].hasMoreData;

        const formatString = queryFormat === 'JSON' ? 'pjson' : queryFormat.toLowerCase();
        const queryUrl = `${layerUrl}/query?where=1=1&f=${formatString}&outSR=4326&outFields=*`;
        let data;
        if (hasMoreData) {
            // TODO: When a FeatureServer like this is in use,
            // display a button for refetching active FeatureServer layers.
            const viewportEnvelope = getViewportGeoEnvelope();
            const v = viewportEnvelope
            const viewportBounds = [v.xmin, v.ymin, v.xmax, v.ymax];
            if (!boundsIntersect(viewportBounds, bbox)) {
                console.log('Layer does not intersect with viewport: Not showing:', layerUrl)
                // TODO: Maybe just skip the request altogether?
                return;
            }

            const queryParams = `
            geometry=${encodeURIComponent(JSON.stringify(viewportEnvelope))}
            &geometryType=esriGeometryEnvelope
            &inSR=4326
            &spatialRel=esriSpatialRelIntersects
            `.trim().replace(/\s+/g, '');

            const response = await fetch(`${queryUrl}&${queryParams}`);
            data = await response.json();
        } else {
            data = await cachedFetchJSON(queryUrl);
        }

        let source;
        if (queryFormat === 'geoJSON') {
            // hasMoreData = data.properties && data.properties.exceededTransferLimit;
            source = {
                type: 'geojson',
                "data": data,
            };
        } else if (queryFormat === 'JSON') {
            // hasMoreData = data.exceededTransferLimit;
            source = {
                type: 'geojson',
                data: arcgisToGeoJSON(data),
            };
        } else {
            console.error('Unknown queryFormat:', queryFormat);
            return;
        }

        const layerTypes = ['point', 'line', 'edge', 'poly'];
        for (const type of layerTypes) {
            const id = `${layerUrl}--${type}`;
            map.getLayer(id) && map.removeLayer(id);
        }
        if (map.getSource(layerUrl)) {
            map.getSource(layerUrl) && map.removeSource(layerUrl);
            return true; // Toggle visibility
        }
        addSource(layerUrl, source);

        // TODO: try to style these like the original style?
        // TODO: refresh these when the viewpoint changes, or manually?
        // TODO follow rendered coloring where possible?
        // TODO auto-color polygons/lines/points by the only numeric non-ID attribute, if there is just one.
        // TODO display organization info, or at least the data owner info
        map.addLayer({
            id: `${layerUrl}--poly`,
            source: layerUrl,
            'type': 'fill',
            paint: {
                'fill-color': 'cyan',
                'fill-opacity': 0.7,
            },
            "filter": ["==", "$type", "Polygon"],
            BEFORE: 'FILL',
        }, 'FILL');
        map.addLayer({
            id: `${layerUrl}--edge`,
            source: layerUrl,
            'type': 'line',
            paint: {
                'line-color': 'black',
                'line-opacity': 0.5,
            },
            "filter": ["==", "$type", "Polygon"],
            BEFORE: 'OUTLINE',
        }, 'OUTLINE');
        map.addLayer({
            id: `${layerUrl}--point`,
            source: layerUrl,
            'type': 'circle',
            paint: {
                'circle-color': 'green',
                'circle-opacity': 0.7,
                'circle-radius': 15,
            },
            "filter": ["==", "$type", "Point"],
            BEFORE: 'FILL',
        }, 'FILL');
        map.addLayer({
            id: `${layerUrl}--line`,
            source: layerUrl,
            'type': 'line',
            paint: {
                'line-width': 8,
                'line-color': 'red',
                'line-opacity': 0.7,
            },
            "filter": ["==", "$type", "LineString"],
            BEFORE: 'OUTLINE',
        }, 'OUTLINE');

        arcgisSources[layerUrl] = true;
        for (const type of layerTypes) {
            arcgisLayers[`${layerUrl}--${type}`] = true;

            if (type === 'edge') continue;
            genericPopupHandler(`${layerUrl}--${type}`, e => {
                const f = e.features[0];

                let layerName;
                if (x.layer && x.layer.name) {
                    layerName = x.layer.name;
                } else if (x.service) {
                    layerName = x.service.layers[0].name;
                }
                const title = `${x.service && x.service.name || ''} ${layerName || ''}`.trim();
                let html = `
                <strong>${title}</strong>
                <table class="dataset-query-attributes"><thead>
                    <tr><th>Attribute</th><th>Value</th></tr>
                </thead><tbody>
                `;
                for (const [k, v] of Object.entries(f.properties)) {
                    if (v === null || v === '' || v === 'null') continue;
                    if (typeof v === 'string' && v.trim() === '') continue;
                    // TODO escape values, except for img tags
                    // TODO turn "obvious" URLs into a href tags.
                    // TODO maybe have special handling for SHAPE_* attributes
                    html += `<tr><td>${k}</td><td>${v}</td></tr>`;
                }
                html += '</tbody></table>'

                new mapboxgl.Popup({ maxWidth: '420px' })
                    .setLngLat(e.lngLat)
                    .setHTML(html)
                    .addTo(map);
            });
        }
        return true;
    }

    async function genericArcgisTileServer(serviceRestUrl, bbox) {
        console.log('Showing ArcGIS Tile Server:', serviceRestUrl);
        // const serviceRestUrl = 'http://ags.cuzk.cz/arcgis/rest/services/jmena_statu/MapServer';

        const url2 = `${serviceRestUrl}/tile/{z}/{y}/{x}?blankTile=true`; // blankTile=false would cause a lot of 404 warnings in the logs

        const serviceInfo = await cachedFetchJSON(`${serviceRestUrl}?f=pjson`);

        const minzoom = Math.min(...serviceInfo.tileInfo.lods.map(x => x.level));
        const maxzoom = Math.max(...serviceInfo.tileInfo.lods.map(x => x.level));
        const tileSize = serviceInfo.tileInfo.rows

        if (map.getLayer(serviceRestUrl)) {
            map.getLayer(serviceRestUrl) && map.removeLayer(serviceRestUrl);
            return; // Toggle visibility
        }

        map.getSource(serviceRestUrl) && map.removeSource(serviceRestUrl);
        map.addSource(serviceRestUrl, {
            type: 'raster',
            'tiles': [url2],
            tileSize,
            minzoom,
            maxzoom,
            bounds: bbox,
        });

        map.addLayer({
            id: serviceRestUrl,
            source: serviceRestUrl,
            'type': 'raster',
            paint: {
                'raster-opacity': 0.7,
            },
            BEFORE: 'FILL',
        }, 'FILL');
        arcgisLayers[serviceRestUrl] = true;
    }

    // Forecasts are made using data from the National Forest Inventory at http://kartta.metla.fi/
    // License: http://kartta.metla.fi/MVMI-Lisenssi.pdf
    addSource('berries-lingonberry', {
        type: 'raster',
        'tiles': ['https://map.buttonprogram.org/marjakartta-puolukka/{z}/{x}/{y}.png?v=6'],
        'tileSize': 256,
        "maxzoom": 12,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://luke.fi/">© Natural Resources Institute Finland (Luke)</a>',
    })
    addLayer({
        'id': 'berries-lingonberry-raster',
        'source': 'berries-lingonberry',
        'type': 'raster',
        paint: {
            'raster-opacity': 0.7,
        },
        BEFORE: 'FILL',
    });

    addSource('berries-bilberry', {
        type: 'raster',
        'tiles': ['https://map.buttonprogram.org/marjakartta-mustikka/{z}/{x}/{y}.png?v=6'],
        'tileSize': 256,
        "maxzoom": 12,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://luke.fi/">© Natural Resources Institute Finland (Luke)</a>',
    })
    addLayer({
        'id': 'berries-bilberry-raster',
        'source': 'berries-bilberry',
        'type': 'raster',
        paint: {
            'raster-opacity': 0.7,
        },
        BEFORE: 'FILL',
    });


    addSource('arvometsa', {
        "type": "vector",
        "tiles": [`https://map.buttonprogram.org/arvometsa/{z}/{x}/{y}.pbf.gz?v=0`],
        "maxzoom": 14,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://www.metsaan.fi">© Finnish Forest Centre</a>',
    });

    const arvometsaDatasetClasses = [
        'arvometsa_eihakata',
        'arvometsa_jatkuva',
        'arvometsa_alaharvennus',
        'arvometsa_ylaharvennus',
        'arvometsa_maxhakkuu',
    ];
    const arvometsaDatasetTitles = [
        'No cuttings',
        'Continuous cover forestry',
        'Thin from below – clearfell',
        'Thin from above – extended rotation',
        'Removal of tree cover',
    ];
    const ARVOMETSA_TRADITIONAL_FORESTRY_METHOD = 2; // Thin from below – clearfell

    // Make sure the graphs are rendered the first time the layer is enabled.
    const arvometsaInit = e => {
        window.replaceArvometsa();
        e.target.removeEventListener('change', arvometsaInit);
    }
    document.querySelector('input#arvometsa').addEventListener('change', arvometsaInit);

    document.querySelectorAll('.arvometsa-projections > label > input').forEach(e => {

        e.addEventListener('change', e => {
            window.arvometsaDataset = arvometsaDatasetClasses.indexOf(e.target.value);
            window.replaceArvometsa();
        })
    });

    document.querySelectorAll('.arvometsa li span').forEach(e => {
        const classes = [...e.parentElement.parentElement.classList];
        const attr = classes.filter(x => /arvometsa-/.test(x))[0].split(/-/)[1];
        const years = e.textContent.trim();
        const suffix = years === 'Now' ? '0' : years[0];
        e.addEventListener('click', () => {
            // window.arvometsaAttr = attr + suffix;
            window.replaceArvometsa();
        })
    })

    const arvometsaSumMethodAttrs = (method, attrPrefix) => [
        'let', 'p', ['concat', 'm', method, '_'], [
            '*', 1 / 50, [
                '+',
                ['get', ['concat', ['var', 'p'], `${attrPrefix}1`]],
                ['get', ['concat', ['var', 'p'], `${attrPrefix}2`]],
                ['get', ['concat', ['var', 'p'], `${attrPrefix}3`]],
                ['get', ['concat', ['var', 'p'], `${attrPrefix}4`]],
                ['get', ['concat', ['var', 'p'], `${attrPrefix}5`]],
            ],
        ],
    ];

    const arvometsaBestMethodCumulativeSumCbt = arvometsaSumMethodAttrs(['get', 'best_method'], 'cbt');
    const arvometsaBestMethodVsOther = (method, attrPrefix) => [
        '-',
        arvometsaSumMethodAttrs(method, attrPrefix),
        arvometsaSumMethodAttrs(ARVOMETSA_TRADITIONAL_FORESTRY_METHOD, attrPrefix),
    ];

    const pickedRelativeMethod = ['get', 'best_method'];
    const arvometsaRelativeCO2eValueExpr = arvometsaBestMethodVsOther(pickedRelativeMethod, 'cbt');


    // const arvometsaRelativeCO2eFillColor = expr => fireColorMapStepExpr(0, 50 / nC_to_CO2, expr);

    const arvometsaRelativeCO2eFillColor = expr => [
        'interpolate',
        ['linear'],
        expr,
        0, 'hsla(159, 100%, 25%, 1)',
        50 / nC_to_CO2, 'hsla(159, 100%, 50%, 1)',
    ];


    addLayer({
        'id': 'arvometsa-actionable-relative-fill',
        // 'minzoom': 10,
        'source': 'arvometsa',
        'source-layer': 'default',
        'type': 'fill',
        'paint': {
            'fill-color': [
                'case', ['has', 'm0_cbt1'],
                arvometsaRelativeCO2eFillColor(arvometsaRelativeCO2eValueExpr),
                'black',
            ],
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'arvometsa-actionable-relative-sym',
        'source': 'arvometsa',
        'source-layer': 'default',
        'type': 'symbol',
        "minzoom": 15.5,
        paint: {
            "text-color": "#000",
        },
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": [
                "case", ["has", 'm0_cbt1'], [
                    "concat",
                    "stand CO2e: ",
                    roundToSignificantDigits(2, ['*', ['get', 'area'], arvometsaRelativeCO2eValueExpr]),
                    " t/y",
                    [
                        'case', ['>', 0, arvometsaRelativeCO2eValueExpr],
                        '\n(net carbon source)',
                        '',
                    ],
                ], "",
            ],
        },
        BEFORE: 'LABEL',
    })


    // window.arvometsaAttr = 'DEFAULT';
    window.arvometsaDataset = -1; // Best method [No cuttings]
    window.arvometsaInterval = null;

    const arvometsaCumulativeCO2eValueExpr = arvometsaBestMethodCumulativeSumCbt;

    // Keep saved features separate from anything related to rendering and data loading.
    let arvometsaSavedFeatures = {};

    addLayer({
        'id': 'arvometsa-fill',
        'source': 'arvometsa',
        'source-layer': 'default',
        'type': 'fill',
        'paint': {
            'fill-color': arvometsaAreaCO2eFillColor(arvometsaCumulativeCO2eValueExpr),
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'arvometsa-boundary',
        'minzoom': 12,
        'source': 'arvometsa',
        'source-layer': 'default',
        'type': 'line',
        'paint': {
            'line-opacity': 0.5,
        },
        BEFORE: 'OUTLINE',
    })
    // Dummy initial symbol layer to prevent warnings:
    addLayer({
        'id': 'arvometsa-sym',
        'source': 'arvometsa',
        'source-layer': 'default',
        'type': 'symbol',
        BEFORE: 'LABEL',
    })

    const arvometsaHighlighted = {
        'id': 'arvometsa-highlighted',
        "type": 'fill',
        "source": "arvometsa",
        "source-layer": "default",
        "paint": {
            "fill-outline-color": "#484896",
            "fill-color": "#6e599f",
            "fill-opacity": 0.75
        },
        "filter": ["in", "standid"],
        BEFORE: 'OUTLINE',
    }
    addLayer(arvometsaHighlighted)

    map.on('click', 'arvometsa-fill', function (e) {
        const selectedEnabled = document.querySelector('#arvometsa-toggle-forest-parcel-select').checked
        if (!selectedEnabled) return;

        // Toggle select features +-5 pixels around the clicked point.
        const bbox = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
        const features = map.queryRenderedFeatures(bbox, { layers: ['arvometsa-fill'] });

        const ids = features.map(f => f.properties.standid);

        const curFilter = map.getFilter("arvometsa-highlighted").slice(2)
        const newFilter = ['in', 'standid']
        .concat(curFilter.filter(id => ids.indexOf(id) === -1))
        .concat(ids.filter(id => curFilter.indexOf(id) === -1))

        map.setFilter("arvometsa-highlighted", newFilter);
        // Save new features
        for (const feature of features) {
            arvometsaSavedFeatures[feature.properties.standid] = feature.properties;
        }
        // Only copy over currently selected features:
        const newFeatures = {}
        for (const id of newFilter.slice(2)) {
            newFeatures[id] = arvometsaSavedFeatures[id];
        }

        // Replace the graphs immediately:
        arvometsaSavedFeatures = newFeatures;
        arvometsaManualUpdateGraphs();
    });

    const baseAttrs = `
    cbf1 cbf2 cbf3 cbf4 cbf5
    cbt1 cbt2 cbt3 cbt4 cbt5
    bio0 bio1 bio2 bio3 bio4 bio5
    maa0 maa1 maa2 maa3 maa4 maa5
    npv2 npv3 npv4
   `.trim();

    const abbrTitles = {
        cbf: 'Forest CO2e balance (trees + soil)',
        cbt: 'Forestry CO2e balance (trees + soil + products)',
        bio: 'Carbon stock in trees',
        maa: 'Carbon stock in soil',
        npv: 'Net present value of wood production (3% discounting)',
    }

    const harvestedWoodAttrs = [
        [0, 1, 2, 3, 4].map(x => `kasittely_${x}_tukki`).join(' '),
        [0, 1, 2, 3, 4].map(x => `kasittely_${x}_kuitu`).join(' '),
    ]

    const setupArvometsaPopupHandler = () => {
        const createPopup = (e, html) => (
            new mapboxgl.Popup({ maxWidth: '360px' })
                .setLngLat(e.lngLat)
                .setHTML(html)
                .addTo(map)
        );

        // TODO: maybe make the popup respond to global controls
        genericPopupHandler(['arvometsa-fill'], (e) => {
            const selectorEnabled = document.querySelector('#arvometsa-toggle-forest-parcel-select').checked
            if (selectorEnabled) return;

            const f = e.features[0];
            const p = f.properties;
            const carbonStockAttrPrefixes = ['bio', 'maa'];
            const cumulativeFlag = document.getElementById('arvometsa-cumulative').checked;

            function getUnit(prefix) {
                if (prefix === 'harvested-wood') {
                    return 'm³';
                } else if (carbonStockAttrPrefixes.indexOf(prefix) !== -1) {
                    return 'tons carbon';
                } else if (isCumulative(prefix)) {
                    return 'tons CO2e';
                } else {
                    return 'tons CO2e/y';
                }
            }
            function isCumulative(prefix) {
                // carbon stock is not counted cumulatively.
                const isCarbonStock = carbonStockAttrPrefixes.indexOf(prefix) !== -1;
                return cumulativeFlag && !isCarbonStock
            }

            const attrValues = {};

            let npv;
            const attrGroups = baseAttrs.split('\n').concat(harvestedWoodAttrs);
            const m = window.arvometsaDataset === -1 ? p.best_method : window.arvometsaDataset;
            const mAlt = ARVOMETSA_TRADITIONAL_FORESTRY_METHOD;

            const co2eBalance = [1, 2, 3, 4, 5].map(x => p[`m${m}_cbt${x}`]).reduce((x, y) => x + y, 0);
            const co2eBalanceAlt = [1, 2, 3, 4, 5].map(x => p[`m${mAlt}_cbt${x}`]).reduce((x, y) => x + y, 0);

            const years = 50;
            const co2eDiff = (co2eBalance - co2eBalanceAlt) / years;
            const co2eStr = `${pp(p.area * co2eDiff)} tons CO2e/y <small>or ${pp(co2eDiff)} tons CO2e/ha/y</small>`;
            const co2eBalanceStr = `${pp(p.area * co2eBalance / years)} tons CO2e/y <small>or ${pp(co2eBalance / years)} tons CO2e/ha/y</small>`;

            attrGroups.forEach(attrGroup => {
                const prefix = (
                    attrGroup.indexOf('kasittely') !== -1
                        ? attrGroup.trim().split(/[_ ]/)[2]
                        : attrGroup.trim().slice(0, 3)
                );
                const attrs = attrGroup.trim().split(/ /).map(attr => `m${m}_${attr}`);

                if (prefix === 'npv') {
                    // NPV does not really apply for CBF i.e. "no cuttings"
                    const value = metsaanFiTreeSpecies === 0 ? null : p[`m${m}_npv3`];
                    npv = value === 0 || value ? `${pp(value)} €` : '-';
                    return;
                }

                const attrV = [];
                for (const attr of attrs) {
                    const prev = isCumulative(prefix) && attrV.length > 0 ? attrV[attrV.length - 1] : 0;
                    attrV.push(prev + p[attr]);
                }
                attrValues[prefix] = attrV;
            });

            let html = `
            <strong>Forest parcel</strong><br/>
            Area: ${pp(p.area, 3)} hectares<br/>
            Net present value of wood production: ${npv}<br/>
            <strong>Shown:</strong> ${cumulativeFlag ? 'Cumulative carbon balance' : 'Incremental carbon balance per decade'}<br/>

            <strong>Potential CO2e savings with ${arvometsaDatasetTitles[m]}:</strong> ${co2eStr}<br/>
            <strong>Forestry CO2 balance with ${arvometsaDatasetTitles[m]}:</strong> ${co2eBalanceStr}<br/>
            `;

            const chartTitles = {
                cbf: 'Forest CO2e balance (trees + soil)',
                cbt: 'Forestry CO2e balance (trees + soil + products)',
                bio: 'Forest carbon stock (trees + soil)',
                'harvested-wood': 'Harvested wood (m<sup>3</sup>)',
            }
            for (const prefix of ['cbf', 'cbt', 'bio', 'harvested-wood']) {
                assert(prefix in chartTitles, `Missing message for: ${prefix}`);
                html += `
                <strong>${chartTitles[prefix]}</strong>
                <canvas class="arvometsa-popup-${prefix}"></canvas><br/>
                `;
            }
            const popup = createPopup(e, html);
            const popupElem = popup._content;

            for (const prefix of ['cbf', 'cbt', 'bio', 'harvested-wood']) {
                let datasets;
                const unit = getUnit(prefix);
                const stacked = true;
                switch (prefix) {
                    case 'cbf':
                        datasets = [{
                            label: 'CO2e balance',
                            backgroundColor: 'green',
                            data: attrValues.cbf,
                        }];
                        break;
                    case 'cbt':
                        datasets = [{
                            label: 'CO2e balance',
                            backgroundColor: 'rgb(63, 90, 0)',
                            data: attrValues.cbt,
                        }];
                        break;
                    case 'bio':
                        datasets = [{
                            label: 'Soil',
                            backgroundColor: '#815f1c',
                            data: attrValues.maa,
                        }, {
                            label: 'Trees',
                            backgroundColor: '#00af5a',
                            data: attrValues.bio,
                        }];
                        break;
                    case 'harvested-wood':
                        datasets = [{
                            label: 'Sawlog',
                            backgroundColor: 'brown',
                            data: attrValues.tukki,
                        }, {
                            label: 'Pulpwood',
                            backgroundColor: 'green',
                            data: attrValues.kuitu,
                        }];
                        break;
                }

                const labels = {
                    'cbf': ['10', '20', '30', '40', '50'],
                    'cbt': ['10', '20', '30', '40', '50'],
                    'bio': ['0', '10', '20', '30', '40', '50'],
                    'harvested-wood': ['10', '20', '30', '40', '50'],
                }


                let outputElem = popupElem.querySelector(`canvas.arvometsa-popup-${prefix}`);

                const chart = null; // arvometsaGraphs[prefix];
                const labelCallback = function (tooltipItem, data) {
                    const label = data.datasets[tooltipItem.datasetIndex].label;
                    const v = pp(tooltipItem.yLabel, 2);
                    return `${label}: ${v} ${unit}`;
                };
                if (chart) {
                    let changed = chart.options.arvometsaCumulative !== isCumulative(prefix);
                    chart.data.datasets.forEach((dataset, i) => {
                        changed |= JSON.stringify(dataset.data) !== JSON.stringify(datasets[i].data);
                        dataset.data = datasets[i].data;
                    });
                    chart.options.arvometsaCumulative = isCumulative(prefix);
                    chart.options.tooltips.callbacks.label = labelCallback;
                    if (changed) {
                        chart.update();
                    }
                } else {
                    const options = {
                        arvometsaCumulative: isCumulative(prefix),
                        animation: { duration: 0 },
                        scales: {
                            xAxes: [{
                                stacked,
                                scaleLabel: { display: true, labelString: 'years from now' },
                            }],
                            yAxes: [{
                                stacked,
                                ticks: {
                                    beginAtZero: true,
                                    callback: (value, _index, _values) => value.toLocaleString(),
                                },
                            }],
                        },
                        tooltips: {
                            callbacks: { label: labelCallback },
                        },
                    };
                    new Chart(outputElem, {
                        type: 'bar',
                        data: { labels: labels[prefix], datasets },
                        options,
                    });
                }
            }
        })
    }

    let arvometsaManualUpdateGraphs = () => {};
    const arvometsaGraphs = {};
    window.replaceArvometsa = () => {
        // Ensure the UI state is consistent with the activation of this:
        document.querySelector('input#arvometsa').checked = true;

        // const attr = window.arvometsaAttr;
        const dataset = window.arvometsaDataset;
        // const mAttr = `m${dataset}_${attr}`

        if (window.arvometsaInterval !== null) {
            window.clearInterval(window.arvometsaInterval);
        }

        setupArvometsaPopupHandler();

        const co2eValueExpr = (
            dataset === -1
                ? arvometsaBestMethodCumulativeSumCbt
                : arvometsaSumMethodAttrs(dataset, 'cbt')
        );

        // attr like 'cbt1', 'cbt2', 'bio0', 'maa0'
        {
            const layer = {
                'id': 'arvometsa-fill',
                'source': 'arvometsa',
                'source-layer': 'default',
                'type': 'fill',
                'paint': {
                    'fill-color': arvometsaAreaCO2eFillColor(co2eValueExpr),
                },
                BEFORE: 'FILL',
            };
            replaceLayer(layer);
        }
        const layer = {
            'id': 'arvometsa-sym',
            'source': 'arvometsa',
            'source-layer': 'default',
            'type': 'symbol',
            "minzoom": 15.5,
            // 'maxzoom': zoomThreshold,
            "paint": {},
            "layout": {
                "text-size": 20,
                "symbol-placement": "point",
                "text-font": ["Open Sans Regular"],
                "text-field": [
                    "case", ["has", 'm0_cbt1'], [
                        "concat",
                        "stand CO2e: ",
                        roundToSignificantDigits(2, ['*', ['get', 'area'], co2eValueExpr]),
                        " t/y",
                        [
                            'case', ['>', 0, ['*', ['get', 'area'], co2eValueExpr]],
                            '\n(net carbon source)',
                            '',
                        ],
                    ], "",
                ],
            },
            BEFORE: 'LABEL',
        };
        replaceLayer(layer);



        function sleep(time) {
            return new Promise((resolve) => setTimeout(resolve, time));
        }

        const getArvometsaFunctionalDependencies = () => {
            const bounds = map.getBounds();
            const dataset = window.arvometsaDataset;
            const cumulativeFlag = document.getElementById('arvometsa-cumulative').checked;
            const numFeatures = map.queryRenderedFeatures({ layers: ['arvometsa-fill'] }).length;
            return [bounds.getNorth(), bounds.getSouth(), bounds.getEast(), bounds.getWest(), dataset, cumulativeFlag, numFeatures];
        }
        const getArvometsaFunctionalDependenciesForSelectedParcels = () => {
            const dataset = window.arvometsaDataset;
            const cumulativeFlag = document.getElementById('arvometsa-cumulative').checked;
            const selectedFeatures = Object.keys(arvometsaSavedFeatures);
            return [dataset, cumulativeFlag].concat(selectedFeatures);
        }
        let arvometsaPrevState = [];
        const updateGraphs = () => {
            const selectorEnabled = document.querySelector('#arvometsa-toggle-forest-parcel-select').checked

            const newState = selectorEnabled
                ? getArvometsaFunctionalDependenciesForSelectedParcels()
                : getArvometsaFunctionalDependencies();

            const allSame =
                arvometsaPrevState.length === newState.length &&
                arvometsaPrevState.map((x, i) => x === newState[i]).reduce((a, b) => a && b, true);

            if (allSame) return; // nothing to do

            arvometsaPrevState = newState;

            const dataset = window.arvometsaDataset;
            const totals = { area: 0 };
            (harvestedWoodAttrs.join(' ') + ' ' + baseAttrs).split(/\s+/).forEach(attr => {
                const mAttr = `m${dataset}_${attr}`;
                totals[mAttr] = 0;
            });

            const reMatchAttr = /m-?\d_(.*)/;
            const props = selectorEnabled
                ? Object.values(arvometsaSavedFeatures)
                : map.queryRenderedFeatures({ "layers": ['arvometsa-fill'] }).map(x => x.properties);

            props.forEach(p => {
                if (p.m0_cbt1 === null || p.m0_cbt1 === undefined) return;
                if (!p.area) return; // hypothetical
                totals.area += p.area;
                if (dataset === -1) {
                    for (const a in totals) {
                        if (a === 'area') continue;
                        const attr = `m${p.best_method}_${reMatchAttr.exec(a)[1]}`;
                        if (!(attr in p)) {
                            console.error('Invalid attr:', attr, 'orig:', a, 'props:', p)
                        }
                        totals[a] += p[attr] * p.area;
                    }
                    return;
                }
                for (const a in totals) {
                    if (a in p && a !== 'area') totals[a] += p[a] * p.area;
                }
            });

            const carbonStockAttrPrefixes = ['bio', 'maa'];
            const cumulativeFlag = document.getElementById('arvometsa-cumulative').checked;

            function getUnit(prefix) {
                if (prefix === 'harvested-wood') {
                    return 'm³';
                } else if (carbonStockAttrPrefixes.indexOf(prefix) !== -1) {
                    return 'tons carbon';
                } else if (isCumulative(prefix)) {
                    return 'tons CO2e';
                } else {
                    return 'tons CO2e/y';
                }
            }
            function isCumulative(prefix) {
                // carbon stock is not counted cumulatively.
                const isCarbonStock = carbonStockAttrPrefixes.indexOf(prefix) !== -1;
                return cumulativeFlag && !isCarbonStock
            }

            const attrValues = {};

            const attrGroups = baseAttrs.split('\n').concat(harvestedWoodAttrs);
            attrGroups.forEach(attrGroup => {
                const prefix = (
                    attrGroup.indexOf('kasittely') !== -1
                        ? attrGroup.trim().split(/[_ ]/)[2]
                        : attrGroup.trim().slice(0, 3)
                );
                const attrs = attrGroup.trim().split(/ /).map(attr => `m${dataset}_${attr}`);

                if (prefix === 'npv') {
                    const outputElem = document.querySelector(`output.arvometsa-npv`);
                    // NPV does not really apply for CBF i.e. "no cuttings"
                    const value = dataset === 0 ? null : totals[`m${dataset}_npv3`];
                    const out = value === 0 || value ? `${pp(value)} €` : '-';
                    if (outputElem.sourceHTML !== out)
                        outputElem.innerHTML = outputElem.sourceHTML = out;
                    return;
                }

                const attrV = [];
                for (const attr of attrs) {
                    const prev = isCumulative(prefix) && attrV.length > 0 ? attrV[attrV.length - 1] : 0;
                    attrV.push(prev + totals[attr]);
                }
                attrValues[prefix] = attrV;
            });



            for (const prefix of ['cbf', 'cbt', 'bio', 'harvested-wood']) {
                let datasets;
                const unit = getUnit(prefix);
                const stacked = true;
                switch (prefix) {
                    case 'cbf':
                        datasets = [{
                            label: 'CO2e balance',
                            backgroundColor: 'green',
                            data: attrValues.cbf,
                        }];
                        break;
                    case 'cbt':
                        datasets = [{
                            label: 'CO2e balance',
                            backgroundColor: 'rgb(63, 90, 0)',
                            data: attrValues.cbt,
                        }];
                        break;
                    case 'bio':
                        datasets = [{
                            label: 'Soil',
                            backgroundColor: '#815f1c',
                            data: attrValues.maa,
                        }, {
                            label: 'Trees',
                            backgroundColor: '#00af5a',
                            data: attrValues.bio,
                        }];
                        break;
                    case 'harvested-wood':
                        datasets = [{
                            label: 'Sawlog',
                            backgroundColor: 'brown',
                            data: attrValues.tukki,
                        }, {
                            label: 'Pulpwood',
                            backgroundColor: 'green',
                            data: attrValues.kuitu,
                        }];
                        break;
                }

                const labels = {
                    'cbf': ['10', '20', '30', '40', '50'],
                    'cbt': ['10', '20', '30', '40', '50'],
                    'bio': ['0', '10', '20', '30', '40', '50'],
                    'harvested-wood': ['10', '20', '30', '40', '50'],
                }


                let outputElem = document.querySelector(`canvas.arvometsa-${prefix}`);

                const chart = arvometsaGraphs[prefix];
                const labelCallback = function (tooltipItem, data) {
                    const label = data.datasets[tooltipItem.datasetIndex].label;
                    const v = pp(tooltipItem.yLabel, 2);
                    return `${label}: ${v} ${unit}`;
                };
                if (chart) {
                    let changed = chart.options.arvometsaCumulative !== isCumulative(prefix);
                    chart.data.datasets.forEach((dataset, i) => {
                        changed |= JSON.stringify(dataset.data) !== JSON.stringify(datasets[i].data);
                        dataset.data = datasets[i].data;
                    });
                    chart.options.arvometsaCumulative = isCumulative(prefix);
                    chart.options.tooltips.callbacks.label = labelCallback;
                    if (changed) {
                        chart.update();
                    }
                } else {
                    const options = {
                        arvometsaCumulative: isCumulative(prefix),
                        animation: { duration: 0 },
                        scales: {
                            xAxes: [{
                                stacked,
                                scaleLabel: { display: true, labelString: 'years from now' },
                            }],
                            yAxes: [{
                                stacked,
                                ticks: {
                                    beginAtZero: true,
                                    callback: (value, _index, _values) => value.toLocaleString(),
                                },
                            }],
                        },
                        tooltips: {
                            callbacks: { label: labelCallback },
                        },
                    };
                    arvometsaGraphs[prefix] = new Chart(outputElem, {
                        type: 'bar',
                        data: { labels: labels[prefix], datasets },
                        options,
                    });
                }
            }

            const totalArea = `${pp(totals.area, 3)} hectares`;
            const outputElem = document.querySelector(`output.arvometsa-area`);
            if (outputElem.sourceHTML !== totalArea)
                outputElem.innerHTML = outputElem.sourceHTML = totalArea;

        }

        window.arvometsaInterval = window.setInterval(updateGraphs, 1000);
        // Need to sleep a little first;
        // to allow mapbox GL to compute something first? Maybe it's a bug.
        sleep(200).then(updateGraphs);
        arvometsaManualUpdateGraphs = updateGraphs;
    };


    addSource('arvometsa-actionable-relative-raster', {
        "type": 'raster',
        'tiles': ['https://map.buttonprogram.org/arvometsa/{z}/{x}/{y}.png?v=0'],
        'tileSize': 512,
        "maxzoom": 13,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://www.metsaan.fi">© Finnish Forest Centre</a>',
    });

    addLayer({
        'id': 'arvometsa-actionable-relative-raster',
        'source': 'arvometsa-actionable-relative-raster',
        'type': 'raster',
        'minzoom': 0,
        'maxzoom': 13,
        BEFORE: 'FILL',
    });


    addLayer({
        'id': 'metsaan-stand-mature-fill',
        'source': 'metsaan-stand',
        'source-layer': 'stand',
        'type': 'fill',
        minzoom: 12,
        'paint': {
            // 'fill-color': fillColorFertilityClass,
            'fill-color': fillRegenerationFelling,
            // 'fill-opacity': fillOpacity, // Set by fill-color rgba
        },
        BEFORE: 'FILL',
    })
    const treeSpeciesText = speciesId => [
        "match", speciesId,
        ...(Object.entries(metsaanFiTreeSpecies).reduce((x, y) => [...x, +y[0], y[1]], [])),
        "Unknown",
    ]
    addLayer({
        'id': 'metsaan-stand-mature-sym',
        'source': 'metsaan-stand',
        'source-layer': 'stand',
        'type': 'symbol',
        "minzoom": 15.5,
        // 'maxzoom': zoomThreshold,
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": [
                "concat",
                "Main species: ", treeSpeciesText(["get", "maintreespecies"]),
                "\navg.age: ", ["get", "meanage"],
                "\navg.diameter: ", ["get", "meandiameter"], " cm",
            ],
        },
        BEFORE: 'LABEL',
    })

    addSource('metsaan-stand-mature-raster', {
        "type": 'raster',
        'tiles': ['https://map.buttonprogram.org/stand2-mature/{z}/{x}/{y}.png'],
        'tileSize': 512,
        "maxzoom": 12,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://www.metsaan.fi">© Finnish Forest Centre</a>',
    });

    addLayer({
        'id': 'metsaan-stand-mature-raster',
        'source': 'metsaan-stand-mature-raster',
        'type': 'raster',
        'minzoom': 0,
        'maxzoom': 12,
        BEFORE: 'FILL',
    })


    setupPopupHandlerForMetsaanFiStandData('arvometsa-actionable-relative-fill');
    setupPopupHandlerForMetsaanFiStandData('metsaan-stand-mature-fill');

    const no2Tileset = Number.parseInt(window.location.search.substring(1)) || 0
    const timestampHour = Math.round(+new Date() / 1e6)
    addSource('no2-tiles', {
        "type": 'raster',
        "tiles": ["https://map.buttonprogram.org/atmoshack/mbtiles-dump/" + no2Tileset + "/{z}/{x}/{y}.png?v=5&_=" + timestampHour],
        "maxzoom": 5,
        attribution: '<a href="https://www.esa.int/ESA">ESA</a>',
    });

    addLayer({
        'id': 'no2-raster',
        'source': 'no2-tiles',
        'type': 'raster',
        'minzoom': 0,
        'maxzoom': 10,
        paint: {
            'raster-opacity': 0.7,
        },
        BEFORE: 'FILL',
    })


    addLayer({
        'id': 'mangrove-wms',
        'type': 'raster',
        'source': {
            'type': 'raster',
            'tiles': [
                'https://gis.unep-wcmc.org/arcgis/services/marine/GMW_001_MangroveDistribition_2010/MapServer/WMSServer?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&layers=0&styles=default',
            ],
            'tileSize': 256,
            bounds: [-175.3, -38.8, 179.9, 33.8],
            // Creative Commons Attribution 4.0 Unported (CC BY 4.0)
            // http://data.unep-wcmc.org/pdfs/45/WCMC-043-GlobalCH-IFCPS6-2017.pdf
            attribution: '<a href="https://www.eorc.jaxa.jp/ALOS/en/kyoto/mangrovewatch.htm">Global Mangrove Watch</a>',
        },
        'paint': {},
        BEFORE: 'FILL',
    })


    const zonationVersions = [1, 2, 3, 4, 5, 6]
    zonationVersions.map(v => {
        const sourceName = `zonation-v${v}`
        const id = `${sourceName}-raster`
        addSource(sourceName, {
            "type": 'raster',
            "tiles": [`https://map.buttonprogram.org/suot/zonation/MetZa2018_VMA0${v}/{z}/{x}/{y}.png?v=7`],
            "minzoom": 5,
            "maxzoom": 9,
            bounds: [19, 59, 32, 71], // Finland
            // Creative Commons 4.0
            // © SYKE Datasources: Finnish Forest Centre, Metsähallitus, Natural Resources Institute Finland, Finnish Environment Institute, National Land Survey of Finland, Hansen/UMD/Google/USGS/NASA
            attribution: '<a href="http://metatieto.ymparisto.fi:8080/geoportal/catalog/search/resource/details.page?uuid=%7B8E4EA3B2-A542-4C39-890C-DD7DED33AAE1%7D">© SYKE Datasources</a>',
        });
        addLayer({
            id,
            'source': sourceName,
            'type': 'raster',
            'minzoom': 0,
            // 'maxzoom': 10,
            paint: {
                'raster-opacity': 0.6,
            },
            BEFORE: 'FILL',
        })
    })


    const fmiEnfuserSets = {
        'airquality': 'index_of_airquality_194',
        'no2': 'mass_concentration_of_nitrogen_dioxide_in_air_4902',
        'pm10': 'mass_concentration_of_pm10_ambient_aerosol_in_air_4904',
        'pm2pm5': 'mass_concentration_of_pm2p5_ambient_aerosol_in_air_4905',
        'ozone': 'mass_concentration_of_ozone_in_air_4903',
    }

    for (const key in fmiEnfuserSets) {
        const sourceName = `fmi-enfuser-${key}`;
        const varName = fmiEnfuserSets[key];
        addSource(sourceName, {
            "type": 'raster',
            "tiles": [`https://map.buttonprogram.org/fmi-enfuser/${varName}/{z}/{x}/{y}.png?v=2`],
            "minzoom": 9,
            "maxzoom": 13,
            bounds: [24.579, 60.132, 25.200, 60.368], // Helsinki (FMI dataset bounds anyway)
            attribution: '<a href="https://en.ilmatieteenlaitos.fi/environmental-information-fusion-service">© Finnish Meteorological Institute</a>',
        });
        addLayer({
            id: sourceName,
            'source': sourceName,
            'type': 'raster',
            paint: {
                'raster-opacity': 0.8,
            },
            BEFORE: 'FILL',
        })
    }


    // https://www.hsy.fi/fi/asiantuntijalle/avoindata/Sivut/AvoinData.aspx?dataID=41
    // https://www.hsy.fi/fi/asiantuntijalle/avoindata/lisenssi/Sivut/default.aspx
    // CC 4.0 BY, ByAttribution
    addSource('hsy-solar-potential', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/hsy-aurinkosahkopotentiaali/{z}/{x}/{y}.pbf"],
        "minzoom": 1,
        "maxzoom": 14,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://www.hsy.fi/">© HSY</a>',
    });

    addLayer({
        'id': 'hsy-solar-potential-fill',
        'source': 'hsy-solar-potential',
        'source-layer': 'solarpower_potential',
        'type': 'fill',
        'paint': {
            'fill-color': [
                "case", ["has", "ELEC"], [
                    "case", ["<", 0, ["get", "ELEC"]],
                    '#92b565',
                    'gray',
                ],
                'gray',
            ],
            // areaCO2eFillColor(['*', 1e-3, ['get', 'CO2']]), // The variable CO2 is not documented at all!
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'hsy-solar-potential-outline',
        'source': 'hsy-solar-potential',
        'source-layer': 'solarpower_potential',
        'type': 'line',
        "minzoom": 11,
        // 'maxzoom': zoomThreshold,
        'paint': {
            'line-opacity': 0.5,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'hsy-solar-potential-sym',
        'source': 'hsy-solar-potential',
        'source-layer': 'solarpower_potential',
        'type': 'symbol',
        "minzoom": 17,
        // 'maxzoom': zoomThreshold,
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": [
                "case", ["has", "ELEC"], [
                    "case", ["<", 0, ["get", "ELEC"]], [
                        "concat",
                        // roundToSignificantDigits(2, ['*', 1e-3, ["get", "CO2"]]), // TODO: Get documentation for this!
                        // "t CO2e/y",
                        // "\nElectricity generation: ",
                        roundToSignificantDigits(2, ['*', 1e-3, ["get", "ELEC"]]),
                        " MWh/year"
                    ],
                    "",
                ],
                "",
            ],
        },
        BEFORE: 'LABEL',
    })


    addSource('cifor-peatdepth', {
        "type": 'raster',
        "tiles": ["https://map.buttonprogram.org/cifor/TROP-SUBTROP_PeatDepthV2_2016_CIFOR/{z}/{x}/{y}.png?v=3"],
        bounds: [-180, -60, 180, 40],
        "minzoom": 0,
        "maxzoom": 10,
        attribution: '<a href="https://www.cifor.org/">© Center for International Forestry Research (CIFOR)</a>',
    });
    addSource('cifor-wetlands', {
        "type": 'raster',
        "tiles": ["https://map.buttonprogram.org/cifor/TROP-SUBTROP_WetlandV2_2016_CIFOR/{z}/{x}/{y}.png?v=3"],
        bounds: [-180, -60, 180, 40],
        "minzoom": 0,
        "maxzoom": 10,
        attribution: '<a href="https://www.cifor.org/">© Center for International Forestry Research (CIFOR)</a>',
    });
    addLayer({
        'id': 'cifor-peatdepth-raster',
        'source': 'cifor-peatdepth',
        'type': 'raster',
        paint: {
            'raster-opacity': 0.7,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'cifor-wetlands-raster',
        'source': 'cifor-wetlands',
        'type': 'raster',
        paint: {
            'raster-opacity': 0.7,
        },
        BEFORE: 'FILL',
    })



    addSource('gtk-mp20k-maalajit', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/mp20k_maalajit/{z}/{x}/{y}.pbf?v=2"],
        "minzoom": 0,
        "maxzoom": 12,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="http://www.gtk.fi/">© Geological Survey of Finland</a>',
    });
    addLayer({
        'id': 'gtk-mp20k-maalajit-fill',
        'source': 'gtk-mp20k-maalajit',
        'source-layer': 'mp20k_maalajit',
        'type': 'fill',
        'paint': {
            'fill-color': 'rgb(188, 167, 177)',
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'gtk-mp20k-maalajit-outline',
        'source': 'gtk-mp20k-maalajit',
        'source-layer': 'mp20k_maalajit',
        'type': 'line',
        "minzoom": 9,
        'paint': {
            'line-opacity': 0.5,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'gtk-mp20k-maalajit-sym',
        'source': 'gtk-mp20k-maalajit',
        'source-layer': 'mp20k_maalajit',
        'type': 'symbol',
        "minzoom": 14,
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": [
                'case', ['==', ['get', 'pintamaalaji'], ['get', 'pohjamaalaji']],
                ['get', 'pintamaalaji'],
                [
                    'concat',
                    'topsoil: ', ['get', 'pintamaalaji'],
                    '\nsubsoil: ', ['get', 'pohjamaalaji'],
                ],
            ],
        },
        BEFORE: 'LABEL',
    })


    const waqiAqis = [
        'usepa-aqi',  // Plots markers based on the composite AQI calculated with the US EPA standard.
        'usepa-pm25', // PM2.5 based AQI - if a station does not have PM2.5 reading, then it is not plotted.
        'usepa-10',   // Same as above, but for PM10.
        'usepa-o3',   // Same as above, but for Ozone (based on the 1 hour breakpoints).
        'usepa-no2',  // Same as above, but for Nitrogen Dioxide.
        'usepa-so2',  // Same as above, but for Sulfur Dioxide.
        'usepa-co',   // Same as above, but for Carbon Monoxide.
        'asean-pm10', // Asean PM10 raw PM10 concentration (explanations).
    ]
    const waqiAqi = 'usepa-aqi';
    addSource('waqi', {
        "type": 'raster',
        "tiles": [`https://tiles.waqi.info/tiles/${waqiAqi}/{z}/{x}/{y}.png?token=${process.env.WAQI_TOKEN}`],
        attribution: '<a href="https://www.cifor.org/">© The World Air Quality Project</a>',
    });
    addLayer({
        'id': 'waqi-raster',
        'source': 'waqi',
        'type': 'raster',
        paint: {
            'raster-opacity': 1.0,
        },
        BEFORE: 'FILL',
    });


    addSource('gfw_tree_plantations', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/gfw_tree_plantations/{z}/{x}/{y}.pbf"],
        "minzoom": 0,
        "maxzoom": 12,
        attribution: '<a href="https://www.globalforestwatch.org/">© Global Forest Watch</a>',
    });
    addLayer({
        'id': 'gfw_tree_plantations-fill',
        'source': 'gfw_tree_plantations',
        'source-layer': 'gfw_plantations',
        'type': 'fill',
        'paint': {
            'fill-color': [
                'case', ['<', 0.4, ['get', 'peat_ratio']],
                'rgb(214, 7, 7)',
                'rgb(109, 41, 7)',
            ],
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'gfw_tree_plantations-outline',
        'source': 'gfw_tree_plantations',
        'source-layer': 'gfw_plantations',
        'type': 'line',
        "minzoom": 9,
        'paint': {
            'line-opacity': 0.5,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'gfw_tree_plantations-sym',
        'source': 'gfw_tree_plantations',
        'source-layer': 'gfw_plantations',
        'type': 'symbol',
        "minzoom": 14,
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": ['get', 'spec3'],
        },
        BEFORE: 'LABEL',
    })

    genericPopupHandler('gfw_tree_plantations-fill', e => {
        const f = e.features[0];
        const { image, spec_simp, type_text, area_ha, peat_ratio, avg_peatdepth } = f.properties;

        const images = image.replace(/\.(tif|img|_)/g, '').toUpperCase().split(/[,; ]+/);
        let results = '';
        images.forEach(x => {
            if (!/LGN\d/.test(x)) return;
            const base = x.replace(/LGN.*/, 'LGN0');
            // Most of the source images seem to fall in these categories.
            const candidates = [0, 1, 2].map(x => {
                results += `\n<li><a target="_blank" href="https://earthexplorer.usgs.gov/metadata/12864/${base + x}/">${base + x}</a></li>`;
            });
        })

        const peatInfo = peat_ratio < 0.4 ? '' : `<strong>Tropical peatland</strong><br/>\nAverage peat depth: ${avg_peatdepth.toFixed(1)} metres<br/>`;

        const co2eStr = peat_ratio < 0.4 ? '' : `Emission reduction potential when ground water level is raised by 40 cm: <strong>${pp(19.4 * area_ha)}</strong> tons CO2e/year<br/>`;

        let html = `
            <strong>Tree plantation (Global Forest Watch)</strong><br/>
            ${spec_simp}
            <br/>
            ${type_text}
            <br/>
            ${peatInfo}
            Area:${pp(area_ha, 3)} hectares
            <br/>
            ${co2eStr}
            Landsat source ID: <code>${image}</code>
            <br/>
        `
        if (results) html += `Potential Landsat source images: <ul>${results}</ul>`;

        new mapboxgl.Popup({ maxWidth: '360px' })
            .setLngLat(e.lngLat)
            // Upstream X-Frame-Options prevents this iframe trick.
            // .setHTML(`<iframe sandbox src="https://earthexplorer.usgs.gov/metadata/12864/${image}/"></iframe>`)
            .setHTML(html)
            .addTo(map);
    });





    const snowCoverLossDays = ['-', ["get", "avg_snow_cover_1980_1990"], ["get", "avg_snow_cover_1996_2016"]];
    addSource('snow_cover_loss', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/snow_cover_loss_2016/{z}/{x}/{y}.pbf"],
        "maxzoom": 3,
    });
    addLayer({
        'id': 'snow_cover_loss-fill',
        'source': 'snow_cover_loss',
        'source-layer': 'snow_cover_loss_1980_through_2016',
        'type': 'fill',
        'paint': {
            'fill-color': [
                'interpolate',
                ['linear'],
                snowCoverLossDays,
                0, 'rgb(255,255,255)',
                8, 'rgb(128,128,128)',
                15, 'rgb(252,113,34)', // orange
                21, 'rgb(245,17,72)', // red
            ],
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'snow_cover_loss-sym',
        'source': 'snow_cover_loss',
        'source-layer': 'snow_cover_loss_1980_through_2016',
        'type': 'symbol',
        "minzoom": 10,
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": [
                "concat",
                // "Snow cover lost per year: ", snowCoverLossDays,
                // "\n",
                "Days with snow (1980..1990): ", ["get", "avg_snow_cover_1980_1990"],
                "\n",
                "Days with snow (1996..2016): ", ["get", "avg_snow_cover_1996_2016"],
            ],
        },
        BEFORE: 'LABEL',
    })


    addSource('corine_clc2018', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/corine_clc2018_subset/{z}/{x}/{y}.pbf.gz"],
        "maxzoom": 10,
    });
    addLayer({
        'id': 'corine_clc2018-fill',
        'source': 'corine_clc2018',
        'source-layer': 'Clc2018_FI20m_subset',
        'type': 'fill',
        // filter: ['any', ['==', ['get', 'dn'], 20], ['==', ['get', 'dn'], 22],  ['==', ['get', 'dn'], 19]],
        filter: ['!=', ['get', 'dn'], 255],
        'paint': {
            'fill-color': [
                "match",
                ["get", "dn"],
                17, 'yellow', // pellot
                18, 'red', // Hedelmäpuu- ja marjapensasviljelmät
                19, 'orange', //Laidunmaat
                20, 'green', //Luonnon laidunmaat
                21, 'teal', //Maataloustukijärjestelmän ulkopuoliset maatalousmaat
                22, 'maroon', //Puustoiset pelto- ja laidunmaat

                31, 'blue',
                32, 'purple',

                43, 'brown',
                44, 'black',

                'white',
            ],
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'corine_clc2018-outline',
        'source': 'corine_clc2018',
        'source-layer': 'Clc2018_FI20m_subset',
        'type': 'line',
        "minzoom": 6,
        'paint': {
            'line-opacity': 0.5,
        },
        BEFORE: 'OUTLINE',
    })

    const corine2018ValueToLabel = v => [
        "match", v,
        1, "Continuous urban fabric",
        2, "Discontinuous urban fabric",
        3, "Commercial units",
        4, "Industrial units",
        5, "Road and rail networks and associated land",
        6, "Port areas",
        7, "Airports",
        8, "Mineral extraction sites",
        9, "Open cast mines",
        10, "Dump sites",
        11, "Construction sites",
        12, "Green urban areas",
        13, "Summer cottages",
        14, "Sport and leisure areas",
        15, "Golf courses",
        16, "Racecourses",
        17, "Non-irrigated arable land",
        18, "Fruit trees and berry plantations",
        19, "Pastures",
        20, "Natural pastures",
        21, "Arable land outside farming subsidies",
        22, "Agro-forestry areas",
        23, "Broad-leaved forest on mineral soil",
        24, "Broad-leaved forest on peatland",
        25, "Coniferous forest on mineral soil",
        26, "Coniferous forest on peatland",
        27, "Coniferous forest on rocky soil",
        28, "Mixed forest on mineral soil",
        29, "Mixed forest on peatland",
        30, "Mixed forest on rocky soil",
        31, "Natural grassland",
        32, "Moors and heathland ",
        33, "Transitional woodland/shrub  cc <10%  ",
        34, "Transitional woodland/shrub, cc 10-30%,on mineral soil",
        35, "Transitional woodland/shrub, cc 10-30%,  on peatland",
        36, "Transitional woodland/shrub, cc 10-30%,  on rocky soil",
        37, "Transitional woodland/shrub under power lines",
        38, "Beaches, dunes, and sand plains ",
        39, "Bare rock",
        40, "Sparsely vegetated areas",
        41, "Inland marshes, terrestrial",
        42, "Inland marshes, aquatic",
        43, "Peatbogs",
        44, "Peat production sites",
        45, "Salt marshes, terrestrial",
        46, "Salt marshes, aquatic",
        47, "Water courses",
        48, "Water bodies",
        49, "Sea and ocean",
        "",
    ]
    addLayer({
        'id': 'corine_clc2018-sym',
        'source': 'corine_clc2018',
        'source-layer': 'Clc2018_FI20m_subset',
        'type': 'symbol',
        "minzoom": 14,
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": [
                'concat',
                corine2018ValueToLabel(['get', 'dn']),
                '\n', roundToSignificantDigits(2, ['*', 1e-4, ['get', 'st_area']]), ' ha',
            ],
        },
        BEFORE: 'LABEL',
    })


    // https://www.nibio.no/tjenester/nedlasting-av-kartdata/dokumentasjon/jordsmonn/_/attachment/inline/f67020d0-cf9f-4085-aaaa-3b1a231826cc:5d04023805e4bf08580857f779517265ad4fdc19/Dokumentasjon%20jordsmonn%2020160525.pdf

    // Soil granularity? Something like that
    const nibioSoilTexture = v => [
        "match", v,
        1, "Sand",

        2, "Silty sand", // <10% clay, 40..85% sand, <50% silt
        3, "Silt", // <12% clay, >50% silt
        4, "Moderate clay silt", // 10..25% clay, 25..50% silt

        // [25..40% clay, 25..50% silt] or
        // or 40..60% clay and <=50% silt
        // or >60% clay
        5, "Medium-high clay content",

        6, "Organic", // >=20% organic material,
        0, "Unclassified",
        9, "Unclassified",
    ];

    // WRB codes from NIBIO data:
    const wrbCodeToLabel = v => [
        "match", v,
        "FL", "Fluvisol",
        "CM", "Cambisol",
        "PH", "Phaeozem",
        "UM", "Umbrisol",
        "HS", "Histosol",
        "AB", "Albeluvisol",
        "GL", "Gleysol",
        "ST", "Stagnosol",
        "PL", "Planosol",
        "RG", "Regosol",
        "AR", "Arenosol",
        "PZ", "Podzol",
        "LP", "Leptosol",
        "AT", "Anthrosol",
        "RGah", "Fill soil", // I think? Original NIBIO: "Planeringer/Fyllinger"
        "TC", "Technosol",
        "",
    ];

    {
        const isHistosol = ["==", ['get', 'wrbgrupper'], 'HS'];
        // Unit: tons of CO2e per hectare per annum.
        const fieldPlotCO2ePerHectare = ["case", isHistosol, 20, 2.2];
        const histosolCalc = roundToSignificantDigits(2, ['*', 20 * 1e-4, ['get', 'st_area']]);
        const nonHistosolCalc = roundToSignificantDigits(2, ['*', 2.2 * 1e-4, ['get', 'st_area']]);

        const fieldPlotTextField = [
            "step", ["zoom"],

            // 0 <= zoom < 15.5:
            [
                "case", isHistosol, [
                    "concat", histosolCalc, " t/y",
                ], [ // else: non-histosol (histosol_area < 50%)
                    "concat", nonHistosolCalc, " t/y",
                ],
            ],

            // zoom >= 15.5:
            15.5,
            [
                "case", isHistosol, [
                    "concat",
                    histosolCalc,
                    "t CO2e/y",
                    '\nsoil: histosol',
                    // "\npeat:", ["/", ["round", ['*', 0.001, ['to-number', ["get", "histosol_area"], 0]]], 10], 'ha',
                    "\narea: ", ["/", ["round", ['*', 1e-3, ["get", "st_area"]]], 10], "ha",
                ], [ // else: non-histosol (histosol_area < 50%)
                    "concat",
                    nonHistosolCalc,
                    "t CO2e/y",
                    '\nsoil: mineral',
                    "\narea: ", ["/", ["round", ['*', 1e-3, ["get", "st_area"]]], 10], "ha",
                ],
            ],
        ];


        addSource('nibio-soils', {
            "type": "vector",
            "tiles": ["https://map.buttonprogram.org/nibio-jordsmonn/{z}/{x}/{y}.pbf.gz?v=1"],
            "minzoom": 0,
            "maxzoom": 12,
            // bounds: [19, 59, 32, 71], // Finland
            attribution: '<a href="https://nibio.no/">© NIBIO</a>',
        });
        addLayer({
            'id': 'nibio-soils-fill',
            'source': 'nibio-soils',
            'source-layer': 'default',
            'type': 'fill',
            'paint': {
                'fill-color': ['case', isHistosol, fieldColorHistosol, fieldColorDefault],
                // 'fill-color': fieldAreaCO2eFillColor(fieldPlotCO2ePerHectare),
                // 'fill-color': 'yellow',
                // 'fill-opacity': fillOpacity,
            },
            BEFORE: 'FILL',
        })
        addLayer({
            'id': 'nibio-soils-outline',
            'source': 'nibio-soils',
            'source-layer': 'default',
            'type': 'line',
            "minzoom": 9,
            'paint': {
                'line-opacity': 0.5,
            },
            BEFORE: 'OUTLINE',
        })
        addLayer({
            'id': 'nibio-soils-sym',
            'source': 'nibio-soils',
            'source-layer': 'default',
            'type': 'symbol',
            "minzoom": 14,
            "paint": {},
            "layout": {
                "text-size": 20,
                "symbol-placement": "point",
                "text-font": ["Open Sans Regular"],
                "text-field": fieldPlotTextField, // wrbCodeToLabel(["get", "wrbgrupper"]),
                //     'case', ['==', ['get', 'pintamaalaji'], ['get', 'pohjamaalaji']],
                //     ['get', 'pintamaalaji'],
                //     [
                //         'concat',
                //         'topsoil: ', ['get', 'pintamaalaji'],
                //         '\nsubsoil: ', ['get', 'pohjamaalaji'],
                //     ],
                // ],
            },
            BEFORE: 'LABEL',
        })
    }


    addSource('nibio-ar50', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/nibio-ar50/{z}/{x}/{y}.pbf.gz?v=1"],
        "minzoom": 0,
        "maxzoom": 12,
        // bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="https://nibio.no/">© NIBIO</a>',
    });
    addLayer({
        'id': 'nibio-ar50-fill',
        'source': 'nibio-ar50',
        'source-layer': 'default',
        'type': 'fill',
        'paint': {
            'fill-color': 'rgba(200,0,0,0.5)',
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'nibio-ar50-outline',
        'source': 'nibio-ar50',
        'source-layer': 'default',
        'type': 'line',
        "minzoom": 9,
        'paint': {
            'line-opacity': 0.5,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'nibio-ar50-sym',
        'source': 'nibio-ar50',
        'source-layer': 'default',
        'type': 'symbol',
        "minzoom": 14,
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": '',
        },
        BEFORE: 'LABEL',
    })

    // AR50: arealtype (ARTYPE)
    // Class	Description
    // 10	Built: residential, urban, urban, transport, industrial, etc.
    // 20	Agriculture: Full-grown soil, surface cultivation soil and inland pasture
    // 30	Forest: Forest-covered area
    // 50	Snaemark(?): with natural vegetation cover that is not forest
    // 60	?: Area that on the surface has the mark of marsh
    // 70	?: Ice and snow that do not melt during the summer
    // 81	Fresh water: River and lake
    // 82	Ocean
    // 99	Not mapped
    addLayer({
        'id': 'nibio-ar50-forests-fill',
        'source': 'nibio-ar50',
        'source-layer': 'default',
        filter: ['==', ['get', 'arealtype'], 30],
        'type': 'fill',
        'paint': {
            'fill-color': 'rgba(200,2000,0,0.5)',
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'nibio-ar50-forests-outline',
        'source': 'nibio-ar50',
        'source-layer': 'default',
        filter: ['==', ['get', 'arealtype'], 30],
        'type': 'line',
        "minzoom": 9,
        'paint': {
            'line-opacity': 0.5,
        },
        BEFORE: 'OUTLINE',
    })
    addLayer({
        'id': 'nibio-ar50-forests-sym',
        'source': 'nibio-ar50',
        'source-layer': 'default',
        filter: ['==', ['get', 'arealtype'], 30],
        'type': 'symbol',
        "minzoom": 14,
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": '',
        },
        BEFORE: 'LABEL',
    })


    addSource('hel-energiatodistukset', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/hel-energiatodistukset/{z}/{x}/{y}.pbf?v=3"],
        "maxzoom": 14,
        // Bounds source: https://koordinates.com/layer/4257-finland-11000000-administrative-regions/
        // select ST_Extent(ST_Transform(ST_SetSRID(geom,3067), 4326))
        // from "finland-11000000-administrative-regions" where kunta_ni1='Helsinki';
        bounds: [24, 59, 26, 61],
        attribution: '<a href="https://www.hel.fi">© City of Helsinki</a>',
    });
    addLayer({
        'id': 'hel-energiatodistukset-fill',
        'source': 'hel-energiatodistukset',
        'source-layer': 'energiatodistukset',
        'type': 'fill',
        'paint': {
            'fill-color': [
                'match', ['get', 'e_luokka'],
                'A', '#1F964A',
                'B', '#7DAD46',
                'C', '#CCD040',
                'D', '#FFEA43',
                'E', '#ECB234',
                'F', '#D2621F',
                'G', '#C70016',
                'white',
            ],
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'hel-energiatodistukset-outline',
        'source': 'hel-energiatodistukset',
        'source-layer': 'energiatodistukset',
        'type': 'line',
        "minzoom": 11,
        'paint': {
            'line-opacity': 0.75,
        },
        BEFORE: 'OUTLINE',
    })

    addLayer({
        'id': 'hel-energiatodistukset-sym',
        'source': 'hel-energiatodistukset',
        'source-layer': 'energiatodistukset',
        'type': 'symbol',
        "minzoom": 14,
        'paint': {},
        "layout": {
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-size": 20,
            "text-field": [
                "case", ["has", "e_luokka"], ["get", "e_luokka"], ""
            ],
        },
        BEFORE: 'LABEL',
    })

    genericPopupHandler('hel-energiatodistukset-fill', e => {
        let html = '';
        e.features.forEach(f => {
            const p = f.properties;

            const energyUse = p.e_luku * p.lämmitetty_nettoala
            const energyPerVolume = p.i_raktilav
                ? `<br/>Energy use per m³: ${pp(energyUse / p.i_raktilav)} kWh per year`
                : '';

            const url = `https://www.energiatodistusrekisteri.fi/public_html?energiatodistus-id=${p.todistustunnus}&command=access&t=energiatodistus&p=energiatodistukset`
            html += `
            <p>
            Certificate ID: <a href="${url}">${p.todistustunnus}</a><br/>
            Total energy consumption: ${pp(energyUse)} kWh per year<br/>
            Energy use per m²: ${p.e_luku} kWh per year
            ${energyPerVolume}
            </p>
            `
        })

        new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
    });


    addSource('fi-mml-suot', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/fi-mml-suot/{z}/{x}/{y}.pbf.gz?v=5"],
        "minzoom": 0,
        "maxzoom": 11,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="http://mml.fi/">© National Land Survey of Finland</a>',
    });

    addLayer({
        'id': 'fi-mml-suot-fill',
        'source': 'fi-mml-suot',
        'source-layer': 'default',
        'type': 'fill',
        'paint': {
            'fill-color': 'orange',
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })

    /* Attributes in 'gtk-turvevarat':
    suon_id suon_nimi n e korkeus_mmpy_min korkeus_mmpy_max
    korkeustiedon_lahde kunta tutkimusvuosi luonnontilaisuusluokka
    luonnontilaisuusluokka_txt turvekerroksen_keskisyvyys_m
    suon_turvemaara_mm3 turpeen_keskimaatuneisuus yli150_pinta_ala_ha
    yli150_turvemaara_mm3 yli150_h14_turvemaara_mm3 tuhka_p
    tuhka_txt rikki_p rikki_txt kuiva_aine_kg_suom3 kuiva_aine_txt
    lampoarvo_teholl_mj_kg lampoarvo_teholl_txt lampoarvo_50pkost_mj_kg
    lampoarvo_50pkost_txt vesipitoisuus_p vesipitoisuus_txt ph
    ph_txt suon_pinta_ala_ha paaturvelaji rahkaturpeet_p saraturpeet_p
    ruskosammalturpeet_p savi_p hiesu_p hieta_p hiekka_p sora_p kallio_p
    moreeni_p avosuot korvet letot rameet turvekankaat muut ei_maaritetty

    + 'photos_json'
    */

    /* Attribute luonnontilaisuusluokka:
    Source: http://gtkdata.gtk.fi/Turvevarojen_tilinpito/luonnontilaisuusluokat.html

    5	Suolla ja sen välittömässä läheisyydessä ei häiriötekijöitä. Suokasvillisuus vallitsee aluskasvillisuudessa (pl. Luontaisesti ruoppaiset tai pohjakerrokseltaan sulkeutumattomat suotyypit). Osassa keidassoiden laiteita voi olla vähäisiä kasvillisuuden muutoksia. Vedenpinta kullekin suopinnan tasolle tyypillisissä rajoissa.
    4	Suon välittömässä läheisyydessä tai reunassa häiriö(itä), esim. ojia, tie tms., jotka eivät aiheuta näkyvää muutosta suolla. Osassa keidassoiden laiteita voi kuitenkin olla vesitalouden muutoksia. Suokasvillisuus vallitsee aluskasvillisuudessa (pl. Luontaisesti ruoppaiset tai pohjakerrokseltaan sulkeutumattomat suotyypit). Osassa keidassoiden laiteita voi olla vähäisiä kasvillisuuden muutoksia. Vedenpinta kullekin suopinnan tasolle tyypillisissä rajoissa.
    3	Valtaosa suosta ojittamatonta. Aapasuon reunaojitus ei kauttaaltaan estä vesien valumista suolle eikä luonnollista vaihettumista kangasmetsään (tms.); merkittävää kuivahtamista ei suon muissa osissa. Keidassoiden laideosissa voi olla laajalti vesitalouden muutoksia. Suokasvillisuudessa ei muutoksia suon reunavyöhykettä lukuun ottamatta. Keidassoilla laiteella puuvartisten kasvien osuus voi olla merkittävästi lisääntynyt. Suoveden pinta alentunut ojien tuntumassa, joskus myös suon pinta.
    2	Suolla ojitettuja ja ojittamattomia osia. Ojitus estää hydrologisen yhteyden suon ja ympäristön välillä. Osalla ojittamatonta alaa kuivahtamista. Keidassoilla ojitus on muuttanut myös reunaluisun ja keskustan vesitaloutta. Suolle tyypillinen kasvistoaines kärsinyt; varpuisuus voi olla lisääntynyt välipinnoilla; merkkejä puuston kasvun lisääntymisestä tai taimettumisesta. Osalla suon ojittamatonta alaa kasvillisuusmuutoksia. Keidassoiden keskiosien muutokset voivat laidetta lukuun ottamatta olla vähäisiä. Suoveden pinta voi olla hivenen alentunut kauempanakin ojista, jos ne ovat "puhkaisseet" laajoja rimpiä tai keidassoiden kuljuja taikka allikoita. Suon ennallistamisen tai suolle tulevien pisto-ojien aiheuttamat taikka esim. penkkateiden patoamat vettymät kuuluvat tähän luokkaan.
    1	Vesitalous muuttunut kauttaaltaan, kasvillisuusmuutokset selviä. Puuston kasvu selvästi lisääntynyt ja/ tai alue taimettunut/ metsittynyt. Kasvillisuusmuutokset voivat kauttaaltaan ojitetuillakin alueilla olla hitaita. Alue voi olla myös jäkälöitynyt tai karhunsammaloitunut vailla merkittävää puustokerrosta.
    0	Muuttunut peruuttamattomasti: vesitalous muuttunut, kasvillisuuden muutos edennyt pitkälle. Kasvillisuus muuttunut kauttaaltaan ja sen kehitys osissa tapauksista edennyt turvekangasvaiheeseen. Suoveden pinta kauttaaltaan alentunut.
    */

    const gtkTurveVaratLuonnontilaisuusluokka = {
        "-1": 'Unclassified',
        0: 'Irreversible changes',
        1: 'Water flow thoroughly changed and there are clear changes to the vegetation',
        2: 'Contains drained and non-drained parts',
        3: 'Most of the bog is non-drained',
        4: 'Immediate vicinity of the bog contains non-visible sources of disruption like ditches and roads',
        5: 'The bog is in its natural state',
    }

    addSource('gtk-turvevarat', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/gtk-turvevarat-suot/{z}/{x}/{y}.pbf.gz?v=5"],
        "minzoom": 0,
        "maxzoom": 14,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="http://www.gtk.fi/">© Geological Survey of Finland</a>',
    });

    addLayer({
        'id': 'gtk-turvevarat-suot-fill',
        'source': 'gtk-turvevarat',
        'source-layer': 'default',
        'type': 'fill',
        'paint': {
            'fill-color': [
                'case', ['==', null, ['get', 'photos_json']], 'red', 'orange',
            ],
            // 'fill-color': fillColorFertilityClass,
            // 'fill-color': fillRegenerationFelling,
            'fill-opacity': fillOpacity,
        },
        BEFORE: 'FILL',
    })
    genericPopupHandler('gtk-turvevarat-suot-fill', e => {
        let html = '';
        e.features.forEach(f => {
            const p = f.properties;
            html += `
            Name: ${p.suon_nimi}<br/>
            Surveyed: ${p.tutkimusvuosi}<br/>
            Area: ${p.suon_pinta_ala_ha} ha<br/>
            Peat volume: ${p.suon_turvemaara_mm3} million cubic metres<br/>
            Average peat depth: ${p.turvekerroksen_keskisyvyys_m} metres<br/>
            Evaluation of how close the bog is to its natural state (class ${
                p.luonnontilaisuusluokka === -1 ? '?' : p.luonnontilaisuusluokka
                } out of 5):<br/> ${gtkTurveVaratLuonnontilaisuusluokka[p.luonnontilaisuusluokka]}<br/>
            `;

            if (!p.photos_json) return;

            html += '<div style="overflow:scroll; max-height: 500px">';
            const photos = JSON.parse(p.photos_json);
            photos.forEach(x => {
                const { kuva_id, kuvausaika, kuvaaja } = x;
                const imageURL = `https://gtkdata.gtk.fi/Turvevarojen_tilinpito/Turve_valokuvat/${kuva_id}.jpg`;
                html += `<p>
                <a target="_blank" href="${imageURL}">
                    <img style="max-width:200px; max-height:150px;" src="${imageURL}"/>
                </a>
                <br/>
                Date: ${kuvausaika.toLowerCase() === 'tuntematon' ? 'Unknown' : kuvausaika}
                <br/>
                Photographer: ${kuvaaja}
                </p>`;
            })
            html += '</div>';
        })

        new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
    });



    addSource('fi-vayla-tierummut', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/vayla.fi/TL509_0-tiles/{z}/{x}/{y}.pbf"],
        "minzoom": 0,
        "maxzoom": 9,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="http://vayla.fi/">© Finnish Transport Infrastructure Agency</a>',
    });

    const culvertCircleRadius = [
        "step", ["zoom"],
        1, // 0..2: 1px
        3, 2,
        6, 4,
        9, ['min', 60, ['^', 1.7, ['-', ["zoom"], 7]]],
    ]
    addLayer({
        'id': 'fi-vayla-tierummut-circle',
        'source': 'fi-vayla-tierummut',
        'source-layer': 'default',
        'type': 'circle',
        'paint': {
            'circle-color': 'black',
            'circle-radius': culvertCircleRadius,
            'circle-opacity': fillOpacity,
        },
        BEFORE: 'OUTLINE',
    })

    addSource('fi-vayla-ratarummut', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/vayla.fi/rata_rumpu_0-tiles/{z}/{x}/{y}.pbf"],
        "minzoom": 0,
        "maxzoom": 6,
        bounds: [19, 59, 32, 71], // Finland
        attribution: '<a href="http://vayla.fi/">© Finnish Transport Infrastructure Agency</a>',
    });

    addLayer({
        'id': 'fi-vayla-ratarummut-circle',
        'source': 'fi-vayla-ratarummut',
        'source-layer': 'default',
        'type': 'circle',
        'paint': {
            'circle-color': 'brown',
            'circle-radius': culvertCircleRadius,
            'circle-opacity': fillOpacity,
        },
        BEFORE: 'OUTLINE',
    })

    const fiVaylaTierumpuTyyppi = {
        1: 'poikkirumpu',
        2: 'yksityistieliittymärumpu',
        3: 'tuplarumpu',
        4: 'tulvarumpu',
        5: 'eläintunneli < 2 m',
        6: 'muu rumputyyppi (esim. pintavesiputki)',
        7: 'katuliittymärumpu',
        8: 'yksityistieliittymärumpu puuttuu tai sitä ei löydy',
        9: 'katuliittymärumpu puuttuu tai sitä ei löydy',
    };
    const fiVaylaTierumpuMateriaali = {
        11: 'betoni',
        12: 'muovi',
        13: 'teräs',
        14: 'kivi',
        9: 'muu materiaali',
    };

    genericPopupHandler('fi-vayla-tierummut-circle', e => {
        let html = '<div style="overflow:scroll; max-height: 500px">';
        e.features.forEach(f => {
            const p = f.properties;
            let puoli = ''
            switch (p.PUOLI) {
                case 9: puoli = 'Sijainti: Tien poikkisuunnassa<br/>';
                case 1: puoli = 'Sijainti: Tien oikealla puolella<br/>';
                case 2: puoli = 'Sijainti: Tien vasemmalla puolella<br/>';
                default: puoli = '';
            }
            html += `
            <strong>Tierumpu</strong><br/>
            ${puoli}
            Korkeus merenpinnasta: ${p.altitude.toFixed(2)} m<br/>
            Tyyppi: ${fiVaylaTierumpuTyyppi[p.RUMPUTYY] || ''}<br/>
            Pituus: ${p.RUMPUPIT} m<br/>
            Koko: ${p.RUMPUKOKO} mm<br/>
            Yksilöivä tunniste: ${p.TUNNISTE}<br/>
            Rakennettu: ${p.ALKUPVM}<br/>
            `;

        })
        html += '</div>';

        new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
    });
    genericPopupHandler('fi-vayla-ratarummut-circle', e => {
        let html = '<div style="overflow:scroll; max-height: 500px">';
        e.features.forEach(f => {
            const p = f.properties;
            html += `
            <strong>Ratarumpu</strong><br/>
            Nimi: ${p.RUMPUNIMI}<br/>
            Tila: ${p.RUMPU_TILA}<br/>
            Pituus: ${p.PITUUS} m<br/>
            Aukon halkaisija: ${p.HALKAISIJA} m<br/>
            Yksilöivä tunniste: ${p.OBJECTID}<br/>
            Rakennettu: ${p.ALKUPVM}<br/>
            `;

        })
        html += '</div>';

        new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
    });



    addSource('ethiopia_forest_change_2003_2013', {
        "type": 'raster',
        'tiles': ['https://map.buttonprogram.org/eth_forest_change_2000-2013_20161019/{z}/{x}/{y}.png?v=1'],
        'tileSize': 512,
        "minzoom": 0,
        "maxzoom": 12,
        // bounds: [2, 31, 17, 53], // Ethiopia -- Somehow this breaks higher zooms???
    });

    addLayer({
        'id': 'ethiopia_forest_change_2003_2013-raster',
        'source': 'ethiopia_forest_change_2003_2013',
        'type': 'raster',
        BEFORE: 'FILL',
    });



    addSource('madagascar-2017-mosaic', {
        "type": 'raster',
        'tiles': ['https://map.buttonprogram.org/madagascar-mosaic/{z}/{x}/{y}.png?v=0'],
        'tileSize': 512,
        "minzoom": 0,
        "maxzoom": 13,
        // bounds: [-27, 37, -9, 54], // Madagascar
    });

    addLayer({
        'id': 'madagascar-2017-mosaic-raster',
        'source': 'madagascar-2017-mosaic',
        'type': 'raster',
        BEFORE: 'FILL',
    });




    enableDefaultLayers();

    // Ensure all symbol layers appear on top of satellite imagery.
    map.getStyle().layers.filter(x => x.type === 'symbol').forEach(layer => {
        // Rework Stadia default style to look nicer on top of satellite imagery
        layerOriginalPaint[layer.id] = { ...layer.paint }
        invertLayerTextHalo(layer)
        layer.BEFORE = layer.BEFORE || 'BG_LABEL';
        map.moveLayer(layer.id, layer.BEFORE)
    });



    const queryPointsSource = {
        type: 'geojson',
        data: { "type": "FeatureCollection", features: [], },
    };

    const refreshQueryPointsUI = () => {
        // These must be removed first before removing/replacing the dependent source.
        map.getLayer('query-points-included') && map.removeLayer('query-points-included');
        map.getLayer('query-points-excluded') && map.removeLayer('query-points-excluded');

        map.getSource('query-points') && map.removeSource('query-points');
        map.addSource('query-points', queryPointsSource);

        map.addLayer({
            "id": "query-points-included",
            "type": "circle",
            filter: ['==', ['get', 'type'], 'included'],
            "source": "query-points",
            "paint": {
                "circle-radius": 20,
                "circle-color": "green"
            },
            BEFORE: 'TOP',
        }, 'TOP');

        map.addLayer({
            "id": "query-points-excluded",
            "type": "circle",
            filter: ['!=', ['get', 'type'], 'included'],
            "source": "query-points",
            "paint": {
                "circle-radius": 20,
                "circle-color": "red"
            },
            BEFORE: 'TOP',
        }, 'TOP');
    }

    const clearQueryPoints = event => {
        event.preventDefault();
        queryPointsSource.data.features = [];
        queryResultsElem.setAttribute('hidden', '');
        refreshQueryPointsUI();
        map.getLayer('dataset-query-results-outline') && map.removeLayer('dataset-query-results-outline');
    }


    const queryResultsElem = document.querySelector('#dataset-query-results');
    const datasetQueryEnabledElem = document.querySelector('#dataset-query');
    document.querySelectorAll('.dataset-query-clear-points').forEach(el => {
        el.addEventListener('click', clearQueryPoints);
    });

    const addQueryPoint = async function (e) {
        if (!datasetQueryEnabledElem.checked) return;
        if (isDatasetQueryViewMode()) return; // Disable while viewing datasets.

        const { lat, lng } = e.lngLat;
        const queryPointMode = document.querySelector('input[name="dataset-query-point-type"]:checked').value;
        queryPointsSource.data.features.push({
            "type": "Feature",
            "properties": { "type": queryPointMode },
            "geometry": {
                "type": "Point",
                "coordinates": [lng, lat],
            },
        });
        refreshQueryPointsUI();
        await refreshDatasetQuery(1);
    }

    datasetQueryEnabledElem.addEventListener('change', e => {
        if (!datasetQueryEnabledElem.checked) clearQueryPoints(e);
    })

    const sanitizeInputHTML = html => {
        const elem = document.createElement("div");
        elem.innerHTML = html;
        return elem.textContent || elem.innerText || '';
    };

    const isDatasetQueryViewMode = () => {
        for (const layer in arcgisLayers) {
            if (map.getLayer(layer)) return true;
        }
        return false;
    }

    const updateDatasetQueryResultsList = (page, results) => {
        queryResultsElem.removeAttribute('hidden');
        window.setDatasetQueryPage = async p => { await refreshDatasetQuery(p); };

        let pagination = '';
        if (page > 2) pagination += `<a class="pagination" href="#" onclick="setDatasetQueryPage(1);">Page 1</a> … `
        if (page > 1) pagination += `<a class="pagination" href="#" onclick="setDatasetQueryPage(${page - 1});">Page ${page - 1}</a> `
        pagination += ` Page ${page} `;
        if (results.length === 100) pagination += ` <a class="pagination" href="#" onclick="setDatasetQueryPage(${page + 1});">Page ${page + 1}</a>`

        let html = `${pagination}<hr/>`;
        for (const [idx, x] of Object.entries(results)) {
            const thumbnailUrl = encodeURI(`${x.service_url}/info/thumbnail`).replace('"', '\"');
            const thumbnailImg = x.service_url && `<img class="dataset-query-thumbnail" onerror="this.style.display='none';" src="${thumbnailUrl}" />`

            let layerName;
            if (x.layer && x.layer.name) {
                layerName = x.layer.name;
            } else if (x.service) {
                layerName = x.service.layers[0].name;
            }

            html += `
            <p class="dataset-query-result">
            <strong>${x.service && x.service.name || ''} ${layerName || ''}</strong><br/>
            ${x.orgName ? (x.orgName + '<br/>') : ''}
            ${x.service && x.service.description ? (sanitizeInputHTML(x.service.description) + '<br/>') : ''}
            <button class="button" data-idx="${idx}">Show data on map</button>
            ${thumbnailImg}
            </p>
            `;
        }
        html += `<hr/>${pagination}`;

        async function showData(x) {
            const bbox = x.bbox;
            const exts = x.service && x.service.supportedExtensions || '';
            if (exts.indexOf('WMSServer') !== -1) {
                await genericArcgisWMSServer(x.service_url, bbox, x);
            } else if (x.service.tileInfo) {
                await genericArcgisTileServer(x.service_url, bbox, x);
            } else if (exts.indexOf('FeatureServer') !== -1) {
                await genericArcgisFeatureServer(x.url, bbox, x);
            } else if (x.layer && x.layer.type === 'Feature Layer') {
                await genericArcgisFeatureServer(x.url, bbox, x);
            } else {
                console.error('Unsupported type??', exts, x)
            }

            // Hide and show result bounds as necessary:

            const queryPointsVisibility = isDatasetQueryViewMode() ? 'none' : 'visible';
            const queryPointsLayers = ['query-points-included', 'query-points-excluded', 'dataset-query-results-outline'];
            for (const layer of queryPointsLayers) {
                map.setLayoutProperty(layer, 'visibility', queryPointsVisibility);
            }
        }
        queryResultsElem.innerHTML = html;
        queryResultsElem.querySelectorAll('button').forEach(e => {
            e.addEventListener('click', event => {
                const el = event.target;
                const idx = el.getAttribute('data-idx');
                if (showData(results[idx])) {
                    el.classList.toggle('active')
                    el.innerText = el.classList.contains('active') ? 'Hide data' : 'Show data on map';
                }
            })
        })
    };

    let datasetQueryNum = 0;
    let latestDatasetResultsNum = 0;
    const refreshDatasetQuery = async function (pageNum) {
        const f = queryPointsSource.data.features;
        const pointsInc = f.filter(x => x.properties.type === 'included').map(x => x.geometry.coordinates);
        const pointsExc = f.filter(x => x.properties.type !== 'included').map(x => x.geometry.coordinates);
        const included = pointsInc.reduce((v, point) => `${v},${point[0]},${point[1]}`, '').slice(1);
        const excluded = pointsExc.reduce((v, point) => `${v},${point[0]},${point[1]}`, '').slice(1);

        const currentQuery = datasetQueryNum++;
        // TODO: abort pending queries
        const response = await fetch(`https://mapsearch.curiosity.consulting/query?included=${included}&excluded=${excluded}&page=${pageNum}`);

        const results = await response.json();

        if (latestDatasetResultsNum > currentQuery) return; // Hack: discard late-arriving responses.
        latestDatasetResultsNum = currentQuery;

        if (!datasetQueryEnabledElem.checked) return; // Hack: disabled already, so discard any results.

        const features = results.map(x => ({
            "type": "Feature",
            "properties": { "type": x },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [x.bbox[0], x.bbox[1]],
                    [x.bbox[2], x.bbox[1]],
                    [x.bbox[2], x.bbox[3]],
                    [x.bbox[0], x.bbox[3]],
                    [x.bbox[0], x.bbox[1]],
                ]],
            },
        }));

        map.getLayer('dataset-query-results-outline') && map.removeLayer('dataset-query-results-outline');
        map.getSource('dataset-query-results') && map.removeSource('dataset-query-results');
        map.addSource('dataset-query-results', {
            type: 'geojson',
            data: { "type": "FeatureCollection", features: features, },
        });

        map.addLayer({
            'id': 'dataset-query-results-outline',
            'source': 'dataset-query-results',
            'type': 'line',
            'paint': {
                'line-width': 2.5,
                'line-opacity': 0.5,
            },
            BEFORE: 'TOP',
        }, 'TOP');

        updateDatasetQueryResultsList(pageNum, results);
    };

    map.on('click', addQueryPoint);

});  // /map onload


const privateDatasets = {}

privateDatasets.valio = (_map, secret) => {
    addSource('valio_fields', {
        "type": "vector",
        "tiles": [`https://map.buttonprogram.org/private/${secret}/valio_fields/{z}/{x}/{y}.pbf?v=3`],
        bounds: [19, 59, 32, 71], // Finland
        "maxzoom": 11,
    });

    addLayer({
        'id': 'valio-fields-fill',
        'source': 'valio_fields',
        'source-layer': 'valio_fields',
        'type': 'fill',
        'paint': {
            'fill-color': ["case", [">=", fieldPlotHistosolRatio, 0.4], fieldColorHistosol, fieldColorDefault],
            // 'fill-color': fieldAreaCO2eFillColor(fieldPlotCO2ePerHectare),
            // 'fill-opacity': fillOpacity, // Set by fill-color rgba
        },
        BEFORE: 'FILL',
    })
    addLayer({
        'id': 'valio-fields-boundary',
        'source': 'valio_fields',
        'source-layer': 'valio_fields',
        'type': 'line',
        'paint': {
            'line-opacity': 0.75,
        },
        "minzoom": 11,
        BEFORE: 'OUTLINE',
    })

    addLayer({
        'id': 'valio-plohko-co2',
        'source': 'valio_fields',
        'source-layer': 'valio_fields',
        // 'source-layer': 'suopellot',
        'type': 'symbol',
        "minzoom": 14.5,
        // 'maxzoom': zoomThreshold,
        "paint": {},
        "layout": {
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-size": 20,
            // NB: 400t CO2eq/ha/20yrs -> 2kg/m2/y
            // round(0.0002*total_area) -> reduce precision -> *10 -> 2kg/m2
            "text-field": fieldPlotTextField,
        },
        BEFORE: 'LABEL',
    })

    setupPopupHandlerForMaviPeltolohko('valio-fields-fill');
};


window.enablePrivateDatasets = (secrets = []) => {
    if (secrets.length === 0) return;
    map.on('load', () => {
        secrets.forEach(secret => {
            const name = secret.split('-')[0];
            const addLayerFn = privateDatasets[name];
            console.log('Enabled private dataset:', name)
            addLayerFn(map, secret);
            document.querySelector(`#layer-card-${name}`).removeAttribute('hidden');

            if (name === 'valio') {
                // Enable the Valio fields and the Biodiversity layers by default only.
                hideAllLayersMatchingFilter(x => /./.test(x));
                toggleGroup('valio');
                toggleGroup('zonation6');
            }
        });

        // Ensure we add the new layers to the general bookkeeping.
        map.getStyle().layers.filter(x => x.type === 'symbol').forEach(layer => {
            if (layer.id in layerOriginalPaint) return;
            layerOriginalPaint[layer.id] = { ...layer.paint }
        });
    });
}


let reqCounter = 0
let lastRequestSeen = 0
window.setNO2 = function (currentRequestNum, e, lat, lon) {
    const elem = document.getElementById('no2')
    if (!layerGroupState['no2-raster'] || !currentRequestNum) {
        elem.innerHTML = ''
        return
    }

    // A quick and dirty mechanism to monotonically show only latest entries in spite of AJAX non-determinism.
    if (lastRequestSeen > currentRequestNum) return
    lastRequestSeen = Math.max(lastRequestSeen, currentRequestNum)

    const plusCode = '' // !OpenLocationCode ? '' : `, ${OpenLocationCode.encode(lat, lon, 6)}`
    const coords = ` at Latitude:${lat}, Longitude:${lon}${plusCode}`

    if (e.error || e.no2_concentration === null || e.no2_concentration === undefined) {
        elem.innerHTML = `NO2: ${e.error}${coords}`
    } else {
        const n = e.no2_concentration
        elem.innerHTML = `NO2: ${pp(n * 1e6, 2)} µmol/m²${coords}`
    }
}


const updateNO2Reading = function (e) {
    if (!layerGroupState['no2-raster']) return
    const x = e.lngLat
    const lat = x.lat.toFixed(2)
    const lon = x.lng.toFixed(2)
    const url = `https://map.buttonprogram.org/query_no2?latitude=${lat}&longitude=${lon}&v=9`
    const currentRequestNum = ++reqCounter
    fetch(url)
        .then(function (response) {
            response.json().then(e => window.setNO2(currentRequestNum, e, lat, lon))
        })

    // console.log(e.point.x, e.point.y, e.lngLat.lat, e.lngLat.lng)
    // var features = map.queryRenderedFeatures(e.point);
    // console.log(features)
}

map.on('mousemove', updateNO2Reading);
map.on('click', updateNO2Reading); // for mobile devices etc.



// TODO: export pre-multiplied alpha colors:
// https://github.com/mapbox/mapbox-gl-native/issues/193#issuecomment-43077841
// > A color component can be from 0 to N where N is the alpha component of the color.
// > So a color like rgba(1, 1, 1, 0.5) turns into a premultiplied color of rgba(0.5, 0.5, 0.5, 0.5),
// > i.e. N is 0.5 here because alpha is 0.5.

window.exportLayerGroup = groupName => {
    const e = { "version": 8, "name": "export", sources: {}, layers: [] }
    e.layers = layerGroups[groupName]
        .filter(x => typeof x === 'string')
        .map(x => originalLayerDefs[x])
        .filter(x => x.type !== 'symbol')
        .filter(x => x.type !== 'raster')
        ;
    e.layers.forEach(({ source }) => {
        e.sources[source] = originalSourceDefs[source];
    });

    console.log(JSON.stringify(e));
}


const queryKiinteistoTunnus = async query => {
    const q = query
        .replace(/\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .split('#')[0]
        .trim();
    // Valid formats for kiinteistötunnus (property identifier): 00589500020002 or 5-895-2-2
    let re = /^([0-9]{1,3})(-[0-9]+){1,3}$/.exec(q) || /^([0-9]{3})[0-9]{11}$/.exec(q)
    if (!re) return { matches: 0 };
    const ktunnus = re[1].padStart(3, '0'); // '5' -> '005'
    const response = await fetch(`https://map.buttonprogram.org/kiinteistorekisteri/lookup/${ktunnus}.geojson.gz`);
    const geojson = await response.json();
    let fs = geojson.features
        .filter(f => f.properties.tpteksti.startsWith(q) || f.properties.tunnus.startsWith(q))

    let exact = false;
    // Display the closest possible match:
    if (fs.filter(f => f.properties.tpteksti === q).length > 0) {
        fs = fs.filter(f => f.properties.tpteksti === q);
        exact = true;
    }
    if (fs.filter(f => f.properties.tunnus === q).length > 0) {
        fs = fs.filter(f => f.properties.tunnus === q);
        exact = true;
    }
    const coords = fs.map(f => f.geometry.coordinates);

    if (coords.length === 0) return { matches: 0 };

    const bounds = coords
        .reduce(
            ([a, b, c, d], [lon, lat]) =>
                [Math.min(lon, a), Math.min(lat, b), Math.max(lon, c), Math.max(lat, d)]
            , coords[0].concat(coords[0]) // Initial value
        );

    return { nQuery: q, bounds, matches: coords.length, fs, sampleId: fs[0].properties.tpteksti, exact }
}


const enableMMLPalstatLayer = () => {
    if (map.getLayer('fi-mml-palstat-outline')) return;

    map.addSource('fi-mml-palstat', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/palstat/{z}/{x}/{y}.pbf.gz?v=0"],
        "minzoom": 14,
        "maxzoom": 14,
        bounds: [19, 59, 32, 71], // Finland
    });

    map.addLayer({
        'id': 'fi-mml-palstat-outline',
        'source': 'fi-mml-palstat',
        'source-layer': 'default',
        'type': 'line',
        'paint': {
            'line-opacity': 0.7,
            'line-width': 2,
        },
        BEFORE: 'OUTLINE',
    }, 'OUTLINE')

    map.addLayer({
        'id': 'fi-mml-palstat-sym',
        'source': 'fi-mml-palstat',
        'source-layer': 'default',
        'type': 'symbol',
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": ['get', 'tpteksti'],
        },
        BEFORE: 'LABEL',
    }, 'LABEL')

}

const kiinteistorekisteriTunnusGeocoder = async query => {
    const { nQuery, bounds, matches, fs, sampleId, exact } = await queryKiinteistoTunnus(query);
    if (matches === 0) return [];

    if (matches === 1) return [{
        place_name: `[P] ${sampleId}`,
        center: bounds.slice(0,2),
    }];

    // Multiple exact matches:
    // These may be road segments OR some other properties
    // scattered around in geographically discontiguous parts.
    if (exact) {
        const rePart = /#([0-9]+)/.exec(query);
        const queryPartNumber = rePart ? +rePart[1] : null;

        const res = [{
            place_name: `[P] ${nQuery} (All parts, total:${matches})`,
            bbox: bounds,
        }];

        const parts = fs
            .map((f, i) => ({
                partNumber: i + 1,
                place_name: `[P] ${f.properties.tpteksti} #${i + 1}`,
                center: f.geometry.coordinates,
            }))
            .filter(f => queryPartNumber === null || ("" + f.partNumber).startsWith("" + queryPartNumber))

        return res.concat(parts);
    }

    // Multiple partial matches (e.g. matching prefix like "5-2" for "5-2-9901-2" etc.)
    const results = fs
    .map(f => ({
        place_name: `[P] ${f.properties.tpteksti}`,
        center: f.geometry.coordinates,
    }))

    return [{
        place_name: `[P] ${nQuery} (${matches} matching properties)`,
        bbox: bounds,
    }].concat(results)
}


// Only add the geocoding widget if it's been loaded.
if (MapboxGeocoder !== undefined) {
    const geocoder = new MapboxGeocoder({
        accessToken: process.env.GEOCODING_ACCESS_TOKEN,
        countries: 'fi',
        localGeocoder: kiinteistorekisteriTunnusGeocoder,
        mapboxgl,
    })
    map.addControl(geocoder);

    // Monkey-patch the geocoder to deal with async local queries:
    const geocoderOrigGeocode = geocoder._geocode;
    const geocoderOrigZoom = geocoder.options.zoom;
    geocoder._geocode = async searchInput => {
        let localResults = [];
        try {
            localResults = await kiinteistorekisteriTunnusGeocoder(searchInput);
            if (localResults.length > 0) {
                enableMMLPalstatLayer();
                // Don't invoke the external API here. It would have no useful results anyway.
                geocoder.options.localGeocoderOnly = true;
                geocoder.options.zoom = 14;
            }
        } catch (e) {
            console.error(e);
        }
        // A reasonable limit for Property Registry queries
        geocoder.options.localGeocoder = (_dummyQuery) => localResults;
        geocoderOrigGeocode.call(geocoder, searchInput);

        geocoder.options.localGeocoderOnly = false;
        geocoder.options.zoom = geocoderOrigZoom;
    }
}

map.addControl(new mapboxgl.NavigationControl());

map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: {
        enableHighAccuracy: true,
    },
    trackUserLocation: true,
}));

map.addControl(new mapboxgl.ScaleControl(), 'bottom-right');

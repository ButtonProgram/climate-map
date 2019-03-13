const backgroundLayerGroups = { 'terramonitor': true }
const layerGroupState = {
    'terramonitor': true,
}


// Set up event handlers for layer toggles, etc.
window.addEventListener('load', function() {
    [...document.querySelectorAll('.layer-card input')].forEach(el => {
        if (el.disabled) return;

        el.addEventListener('change', () => window.toggleGroup(el.id));

        // Populate layer state from DOM.
        layerGroupState[el.id] = el.checked;
        const known = el.id in layerGroups;
        if (!known) {
            console.log('ERROR: Unknown layer in menu .layer-cards:', el.id, el);
        }
    })
})

window.layerOriginalPaint = {}
window.toggleBaseMapSymbols = function() {
    map.getStyle().layers.filter(x => x.type === 'symbol').forEach(layer => {
        if (layerGroupState.terramonitor) {
            layer.paint = window.layerOriginalPaint[layer.id];
        } else {
            window.invertLayerTextHalo(layer);
        }
        map.removeLayer(layer.id);
        map.addLayer(layer);
    })
}

const natura2000_mappings = {
    "natura2000-sac": {layer:"NaturaSAC_alueet", color: 'cyan'},
    "natura2000-sac-lines": {layer:"NaturaSAC_viivat", color: 'gray'},
    "natura2000-sci": {layer:"NaturaSCI_alueet", color: 'purple'},
    "natura2000-spa": {layer:"NaturaSPA_alueet", color: 'magenta'},
    "natura2000-impl-ma": {layer:"NaturaTotTapa_ma", color: '#ca9f74'},
    "natura2000-impl-r": {layer:"NaturaTotTapa_r", color: 'brown'},
}

const layerGroups = {
    'peatland-co2': ['peatland-co2', 'peatland-co2-sym', 'peatland-outline'],
    'valio': [
    () => window.hideAll(x=>!/valio/.test(x)),
    'valio-fields-boundary', 'valio-fields-fill', 'valio-plohko-co2-sym',
    ],
    'histosol-field-co2': ['histosol-plohko-fill', 'histosol-plohko-co2-sym', 'histosol-plohko-outline'],
    'forest-grid': ['metsaan-hila-c', 'metsaan-hila-sym', 'metsaan-hila-outline'],
    'privately-owned-forests': ['metsaan-stand-others-c'],
    'zonation6': ['zonation-v6-raster'],
    'ete': ['metsaan-ete-all-c', 'metsaan-ete-all-outline', 'metsaan-ete-all-sym'],
    'ete-all-labels': [() => window.toggleEteCodes()],
    'terramonitor': ['terramonitor', () => window.toggleBaseMapSymbols()],
    'no2-raster': ['no2-raster', () => window.setNO2()],
    'mangrove-forests': ['mangrove-wms'],
    'natura2000': [
        ...Object.keys(natura2000_mappings).map(x => x),
        ...Object.keys(natura2000_mappings).map(x => `${x}-sym`),
    ],
    'mavi-fields': ['mavi-plohko-fill', 'mavi-plohko-outline'],
};
window.toggleSatellite = function() {
    [...document.querySelectorAll('.satellite-button-container img')].forEach(x => x.toggleAttribute('hidden'));
    window.toggleGroup('terramonitor')
}
window.toggleMenu = function() {
    [...document.querySelectorAll('.menu-toggle')].forEach(x => x.toggleAttribute('hidden'))
}

window.toggleGroup = function(group, forcedState=undefined) {
    const oldState = layerGroupState[group];
    const newState = forcedState === undefined ? !oldState : forcedState;
    if (oldState === newState) return;

    const el = document.querySelector(`.layer-card input#${group}`)
    if (el) el.checked = newState

    layerGroups[group].forEach(layer => {
        if (typeof layer === 'function') {
            layer();
        } else {
            map.setLayoutProperty(layer, 'visibility', newState ? 'visible' : 'none')
        }
    })
    layerGroupState[group] = newState;
}


let eteAllState = false;
const eteBasicLabels = [
    "match",
    ["get","featurecode"],
    70, "Gamekeeping area",
    95, "Potential METSO Habitat",
    98, "METSO Habitat",
    10120, "Gamekeeping area",
    15150, "METSO II",
    "",
]

window.setEteCodes = function(codes) {
    const id = 'metsaan-ete-all-sym'
    const layer = map.getStyle().layers.filter(x => x.id ===id)[0]

    const eteAllLabels = [
        "match",
        ["get","featurecode"],
        ...codes,
        "UNKNOWN habitat type",
    ];
    layer.layout['text-field'] = eteAllState ? eteBasicLabels : eteAllLabels;
    eteAllState = !eteAllState;
    map.removeLayer(id)
    addLayer(layer, visibility=layerGroupState.ete ? 'visible' : 'none')
    toggleGroup('ete', forcedState=layerGroupState.ete);
}

window.toggleEteCodes = function() {
    fetch('ete_codes.json').then(function(response) {
        response.json().then(e => {
            window.setEteCodes(e);
            window.toggleGroup('ete', forcedState=true);
        })
    })
}


window.hideAll = function (filterFn) {
    Object.keys(layerGroupState).forEach(group => {
        const layerIsInBackground = group in backgroundLayerGroups;
        if (layerIsInBackground) return;
        if (filterFn && !filterFn(group)) return;
        window.toggleGroup(group, forcedState=false);
    })
}

window.invertLayerTextHalo = function(layer) {
    layer.paint = {...layer.paint}
    if (layer.paint && layer.paint["text-halo-width"]) {
        // Original style is something like:
        // text-color: "#999"
        // text-halo-blur: 1
        // text-halo-color: "rgb(242,243,240)"
        // text-halo-width: 2
        layer.paint['text-halo-blur'] = 1
        layer.paint['text-halo-width'] = 2.5
        layer.paint['text-color'] = '#fff'
        layer.paint['text-halo-color'] = '#000'
    }
}

window.enableDefaultLayers = function() {
    Object.entries(layerGroupState).forEach(([group, enabled]) => {
        enabled && layerGroups[group].forEach(layer => {
            typeof layer === 'string' &&
            map.setLayoutProperty(layer, 'visibility', 'visible');
        });
    })
}


// This must be set, but the value is not needed here.
mapboxgl.accessToken = 'not-needed';

const style = {
    "version": 8,
    "glyphs": "https://map.buttonprogram.org/suot/font/{fontstack}/{range}.pbf",
    "layers": [
    {
        "id": "background",
        "type": "background",
        "paint": {
            "background-color": "#ddeeff"
        }
    },
    ]
}

const map = new mapboxgl.Map({
    container: 'map', // container id
    // style,
    style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
    center: [28, 65], // starting position [lng, lat]
    zoom: 5, // starting zoom
    attributionControl: false,
});
window.map = map;

map.addControl(new mapboxgl.NavigationControl());

function addLayer(map, layer, visibility='none') {
    const layout = layer.layout || {}
    layout.visibility = visibility
    map.addLayer({ layout, ...layer })
}

map.on('load', function () {
    const originalMapLayerIds = {}

    addLayer(map, {
        'id': 'terramonitor',
        'type': 'raster',
        'source': {
            'type': 'raster',
            'tiles': [
            'https://maps.terramonitor.com/9c2040ec0fb91cfdfd723496515d759a77b363ee/pro/wms?bbox={bbox-epsg-3857}&format=image/jpeg&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&layers=rgb&styles=',
            ],
            'tileSize': 256,
            // "maxzoom": 16, // After zoom level 16 the images (used to) get blurrier
        },
        'paint': {},
    });


    // Custom attribution for Terramonitor since the WMS source doesn't present show one automatically.
    map.addControl(new mapboxgl.AttributionControl({
        customAttribution: '' +
            '<a href="https://www.terramonitor.com">© Terramonitor</a>' +
            ' | <a href="http://mavi.fi">© Maaseutuvirasto 2018</a>'
    }));


    map.getStyle().layers.forEach(x => originalMapLayerIds[x.id] = true)


    map.addSource('metsaan-stand-others', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/stand-others/{z}/{x}/{y}.pbf"],
        "maxzoom": 13,
    });
    addLayer(map, {
        'id': 'metsaan-stand-others-c',
        'source': 'metsaan-stand-others',
        'source-layer': 'stand-others',
        'type': 'fill',
        'paint': {
            'fill-color': 'brown',
            'fill-opacity': 0.5
        },
    });


    map.addSource('metsaan-hila', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/metsaan-hila/{z}/{x}/{y}.pbf"],
        "maxzoom": 15,
    });
    addLayer(map, {
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
            'fill-opacity': 0.9
        },
    })
    addLayer(map, {
        'id': 'metsaan-hila-outline',
        'source': 'metsaan-hila',
        'source-layer': 'metsaan-hila',
        'type': 'line',
        "minzoom": 14,
        'paint': {
            'line-opacity': 0.75,
        }
    })
    addLayer(map, {
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
        }
    })


    map.addSource('natura2000', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/natura2000/{z}/{x}/{y}.pbf"],
        "maxzoom": 11,
    });
    Object.entries(natura2000_mappings).map(([baseName, x]) => {
        addLayer(map, {
            'id': baseName,
            'source': 'natura2000',
            'source-layer': x.layer,
            'type': 'fill',
            'paint': {
                'fill-color': x.color,
                'fill-opacity': 0.45,
            },
        })
        addLayer(map, {
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
        })
    })


    map.addSource('metsaan-ete', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/metsaan-ete/{z}/{x}/{y}.pbf"],
        "maxzoom": 12,
    });
    addLayer(map, {
        'id': 'metsaan-ete-all-c',
        'source': 'metsaan-ete',
        'source-layer': 'metsaan-ete',
        'type': 'fill',
        'paint': {
            'fill-color': 'cyan',
            'fill-opacity': 0.7,
        },
    })
    addLayer(map, {
        'id': 'metsaan-ete-all-outline',
        'source': 'metsaan-ete',
        'source-layer': 'metsaan-ete',
        'type': 'line',
        "minzoom": 12,
        'paint': {
            'line-opacity': 1,
        }
    })
    addLayer(map, {
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
    })


    map.addSource('mavi-peltolohko', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/mavi-peltolohko/{z}/{x}/{y}.pbf"],
        "maxzoom": 11,
    });
    addLayer(map, {
        'id': 'mavi-plohko-fill',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'type': 'fill',
        'paint': {
            'fill-color': '#FFC300',
            'fill-opacity': 0.65,
        }
    })
    addLayer(map, {
        'id': 'mavi-plohko-outline',
        'source': 'mavi-peltolohko',
        'source-layer': 'plohko_cd_2017B_2_MapInfo',
        'type': 'line',
        "minzoom": 11,
        'paint': {
            'line-opacity': 0.75,
        }
    })


    map.addSource('histosol_plohko', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/peltolohko/histosol_plohko/{z}/{x}/{y}.pbf"],
        "maxzoom": 11,
    });
    addLayer(map, {
        'id': 'histosol-plohko-fill',
        'source': 'histosol_plohko',
        'source-layer': 'suopellot',
        'type': 'fill',
        'paint': {
            'fill-color': 'red',
            'fill-opacity': 1
        }
    })
    addLayer(map, {
        'id': 'histosol-plohko-outline',
        'source': 'histosol_plohko',
        'source-layer': 'suopellot',
        'type': 'line',
        "minzoom": 11,
        'paint': {
            'line-opacity': 0.75,
        }
    })
    addLayer(map, {
        'id': 'histosol-plohko-co2-sym',
        'source': 'histosol_plohko',
        'source-layer': 'suopellot',
        'type': 'symbol',
        "minzoom": 12,
        // 'maxzoom': zoomThreshold,
        "paint": {},
        "layout": {
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            // NB: 400t CO2eq/ha/20yrs -> 2kg/m2/y
            // round(0.0002*total_area) -> reduce precision -> *10 -> 2kg/m2
            "text-field":
            ["let", "suffix", "t CO2e/y",
            ["concat",
            ["to-string",
            ["*", 10,
            ["round", ["*", 0.0002, ["get", "total_area"]]],
            ]],
            ["var", "suffix"]]],

            "text-size": 20,
        }
    })


    map.addSource('stand-suot', {
        "type": "vector",
        "tiles": ["https://map.buttonprogram.org/stand-suot/{z}/{x}/{y}.pbf"],
        "maxzoom": 12,
    });
    addLayer(map, {
        'id': 'peatland-co2',
        'source': 'stand-suot',
        'source-layer': 'stand-suot',
        // 'maxzoom': zoomThreshold,
        'type': 'fill',
        // 'filter': ['==', 'isState', true],
        'paint': {
            'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'fertilityclass'],
            1, 'rgb(245,17,72)', // red
            4, 'rgb(252,113,34)', // orange
            // 8, 'rgb(218,248,85)',
            6, 'rgb(218,248,85)', // green
            ],
            // 'fill-outline-color': [
            //     'interpolate',
            //     ['linear'],
            //     ['get', 'drainagestate'],
            //     6, 'rgb(89, 122, 155)',
            //     // 7, 'rgb(252,113,34)',
            //     // 8, 'rgb(218,248,85)',
            //     9, 'rgb(0, 77, 153)',
            // ],
            'fill-opacity': 0.9
        },
    })
    addLayer(map, {
        'id': 'peatland-outline',
        'source': 'stand-suot',
        'source-layer': 'stand-suot',
        'type': 'line',
        "minzoom": 11,
        'paint': {
            'line-opacity': 0.75,
        }
    })
    addLayer(map, {
        'id': 'peatland-co2-sym',
        'source': 'stand-suot',
        'source-layer': 'stand-suot',
        'type': 'symbol',
        "minzoom": 12,
        // 'maxzoom': zoomThreshold,
        "paint": {},
        "layout": {
            "text-size": 20,
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-field": [
                "case", ["has", "co2"], [
                    "let", "suffix", "t CO2e/y", [
                        "concat", [
                            "to-string",
                            ["/", [
                                "round", [
                                    "*", 1.5,
                                    ["get", "co2"]]], 10]
                        ],
                        ["var", "suffix"],
                    ],
                ], ""
            ],
        }
    })


    const no2Tileset = Number.parseInt( window.location.search.substring(1) ) || 0
    const timestampHour = Math.round(+new Date() / 1e6)
    map.addSource('no2-tiles', {
        "type": "raster",
        "tiles": ["https://map.buttonprogram.org/atmoshack/mbtiles-dump/" + no2Tileset + "/{z}/{x}/{y}.png?v=5&_=" + timestampHour],
        "maxzoom": 5,
    });

    addLayer(map, {
        'id': 'no2-raster',
        'source': 'no2-tiles',
        'type': 'raster',
        'minzoom': 0,
        'maxzoom': 10,
    })


    addLayer(map, {
        'id': 'mangrove-wms',
        'type': 'raster',
        'source': {
            'type': 'raster',
            'tiles': [
            'https://gis.unep-wcmc.org/arcgis/services/marine/GMW_001_MangroveDistribition_2010/MapServer/WMSServer?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&layers=0&styles=default',
            ],
            'tileSize': 256
        },
        'paint': {}
    })


    const zonationVersions = [1,2,3,4,5,6]
    zonationVersions.map(v => {
        const sourceName = `zonation-v${v}`
        const id = `${sourceName}-raster`
        map.addSource(sourceName, {
            "type": "raster",
            "tiles": [`https://map.buttonprogram.org/suot/zonation/MetZa2018_VMA0${v}/{z}/{x}/{y}.png?v=5`],
            "minzoom": 5,
            "maxzoom": 9,
        });
        addLayer(map, {
            id,
            'source': sourceName,
            'type': 'raster',
            'minzoom': 0,
            // 'maxzoom': 10,
        })
        map.setPaintProperty(id, 'raster-opacity', 0.6)
    })


    window.enableDefaultLayers();

    map.setPaintProperty('no2-raster', 'raster-opacity', 0.7);
    // map.setPaintProperty('terramonitor', 'raster-opacity', 0.6)
    // map.setPaintProperty('peatland-co2', 'opacity', 0.6)


    // Ensure all symbol layers appear on top of satellite imagery.
    map.getStyle().layers.filter(x => x.type === 'symbol').forEach(layer => {
        // Rework Stadia default style to look nicer on top of satellite imagery
        window.layerOriginalPaint[layer.id] = {...layer.paint}
        window.invertLayerTextHalo(layer)
        map.removeLayer(layer.id)
        map.addLayer(layer)
        // map.moveLayer(layer.id)
    });

});  // /map onload


const privateDatasets = {}

privateDatasets.valio = (map, secret) => {
    map.addSource('valio_fields', {
        "type": "vector",
        "tiles": [`https://map.buttonprogram.org/private/${secret}/valio_fields/{z}/{x}/{y}.pbf`],
        "maxzoom": 11,
    });

    addLayer(map, {
        'id': 'valio-fields-fill',
        'source': 'valio_fields',
        'source-layer': 'valio_fields',
        'type': 'fill',
        'paint': {
            'fill-color': [
            'interpolate',
            ['linear'],
            ['to-number', ['get', 'histosol_ratio'], 0],
            0, 'yellow',
            1, 'red',
            ],
        }
    })
    addLayer(map, {
        'id': 'valio-fields-boundary',
        'source': 'valio_fields',
        'source-layer': 'valio_fields',
        'type': 'line',
        'paint': {
            'line-opacity': 0.75,
        },
        "minzoom": 11,
    })
    addLayer(map, {
        'id': 'valio-plohko-co2-sym',
        'source': 'valio_fields',
        'source-layer': 'valio_fields',
        // 'source-layer': 'suopellot',
        'type': 'symbol',
        "minzoom": 12,
        // 'maxzoom': zoomThreshold,
        "paint": {},
        "layout": {
            "symbol-placement": "point",
            "text-font": ["Open Sans Regular"],
            "text-size": 20,
            // NB: 400t CO2eq/ha/20yrs -> 2kg/m2/y
            // round(0.0002*total_area) -> reduce precision -> *10 -> 2kg/m2
            "text-field": [
                "case",
                ["has", "histosol_area"], ["let", "suffix", "t CO2e/y",
                    ["concat",
                        ["to-string",
                            ["*", 10,
                                ["round", ["*", 0.0002, ["get", "total_area"]]],
                            ]],
                        ["var", "suffix"],
                        "\npeat:", ["/",["round",['*', 0.001, ['to-number',["get", "histosol_area"],0]]],10],
                        "ha\ntotal:", ["/",["round",['*', 0.001, ["get", "total_area"]]],10],"ha",
                    ],
                ],
                "",
            ],
        }
    })
};


window.enablePrivateDatasets = function(secrets=[]) {
    if (secrets.length === 0) return;
    window.map.on('load', () => {
        secrets.forEach(secret => {
            const name = secret.split('-')[0];
            const addLayerFn = privateDatasets[name];
            console.log('Enabled private dataset:', name)
            addLayerFn(map, secret);
            document.querySelector(`#layer-card-${name}`).removeAttribute('hidden');
        })
    })
}


let reqCounter = 0
let lastRequestSeen = 0
window.setNO2 = function(currentRequestNum, e, lat, lon) {
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
        elem.innerHTML = `NO2: ${(n*1e6).toFixed(1)} µmol/m<sup>2</sup>${coords}`
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
    .then(function(response) {
        response.json().then(e => window.setNO2(currentRequestNum, e, lat, lon))
    })

    // console.log(e.point.x, e.point.y, e.lngLat.lat, e.lngLat.lng)
    // var features = map.queryRenderedFeatures(e.point);
    // console.log(features)
}

map.on('mousemove', updateNO2Reading);
map.on('click', updateNO2Reading); // for mobile devices etc.

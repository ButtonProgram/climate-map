import {
  addLayer,
  addSource,
  removeSource,
  removeLayer,
  addImage,
} from "src/map/map";
import { registerGroup, unregisterGroup } from "src/map/layer_groups";
import { fillOpacity } from "../../utils";
import { genericPopupHandler, createPopup } from "../../map";

import { addDataset, removeDataset } from "./common";
import Marker from "../../marker.svg";

const marker = new Image(50, 50);
marker.src = Marker;

const URL_PREFIX = `${process.env.REACT_APP_API_URL}/user/data?file=`;

const addValioCarbonGrassFields = (token: string) => {
  addSource("valio-carbon-grass-fields", {
    type: "geojson",
    data: `${URL_PREFIX}valio-carbon-grass-fields/fields.geojson&token=${token}`,
  });

  addSource("valio-carbon-grass-fields-centroids", {
    type: "geojson",
    data: `${URL_PREFIX}valio-carbon-grass-fields/centroids.geojson&token=${token}`,
  });

  addLayer({
    id: "valio-carbon-grass-fields-fill",
    source: "valio-carbon-grass-fields",
    type: "fill",
    paint: {
      "fill-color": "yellow",
      "fill-opacity": fillOpacity,
    },
    BEFORE: "FILL",
  });

  addLayer({
    id: `valio-carbon-grass-fields-outline`,
    source: "valio-carbon-grass-fields",
    type: "line",
    paint: {
      "line-opacity": 1,
      "line-width": 1,
    },
    BEFORE: "OUTLINE",
  });

  addLayer({
    id: `valio-carbon-grass-fields-label`,
    source: "valio-carbon-grass-fields-centroids",
    type: "symbol",
    maxzoom: 13,
    minzoom: 4,
    layout: {
      "text-font": ["Open Sans Regular"],
      "text-size": 20,
      "text-offset": [0, 0.8],
      "text-field": ["get", "id"],
    },
    paint: {
      "text-halo-width": 2,
      "text-halo-blur": 1,
      "text-halo-color": "rgb(242,243,240)",
    },
    filter: ["!in", "TILATUNNUS"],
    BEFORE: "TOP",
  });

  addImage("marker", marker);

  addLayer({
    id: "valio-carbon-grass-fields-pin",
    source: "valio-carbon-grass-fields-centroids",
    type: "symbol",
    maxzoom: 13,
    layout: {
      visibility: "visible",
      "symbol-placement": "point",
      "icon-image": "marker",
      "icon-anchor": "bottom",
      "icon-ignore-placement": true,
      "icon-allow-overlap": true,
    },
    filter: ["!in", "TILATUNNUS"],
    BEFORE: "FILL",
  });

  genericPopupHandler("valio-carbon-grass-fields-fill", (ev) => {
    let html = "";
    for (const f of ev.features) {
      const p = f.properties;

      html += `
        <p>
        Vuosi: ${p["VUOSI"]}<br>
        Peruslohko: ${p["PERUSLOHKO"]}<br>
        Tilatunnus: ${p["TILATUNNUS"]}<br>
        Pinta-ala: ${p["PINTA_ALA"] / 100} ha<br>
        Nimet: ${p["asia 4691 v2_Nimet"]}<br>
        Peltolohkojen nimet: ${p["asia 4691 v2_Peltolohkojen nimet"]}<br>
        </p>
        `;
    }

    createPopup(ev, html);
  });

  registerGroup("valio-carbon-grass-fields", [
    "valio-carbon-grass-fields-fill",
    "valio-carbon-grass-fields-outline",
    "valio-carbon-grass-fields-label",
    "valio-carbon-grass-fields-pin",
  ]);
};

const removeValioCarbonGrassFields = () => {
  for (const layer of [
    "valio-carbon-grass-fields-fill",
    "valio-carbon-grass-fields-outline",
    "valio-carbon-grass-fields-label",
    "valio-carbon-grass-fields-pin",
  ]) {
    removeLayer(layer);
  }

  removeSource("valio-carbon-grass-fields");
  unregisterGroup("valio-carbon-grass-fields");
};

addDataset("valio-carbon-grass-fields", addValioCarbonGrassFields);
removeDataset("valio-carbon-grass-fields", removeValioCarbonGrassFields);

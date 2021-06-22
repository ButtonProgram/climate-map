import {
  Button,
  Checkbox,
  Container,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  Paper,
  Select,
} from "@material-ui/core";
import Chart from "chart.js/auto";
import { Expression } from "mapbox-gl";
import { NavLink } from "react-router-dom";
import { useObservable } from "micro-observables";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import React, { useEffect, useRef, useState } from "react";

import * as Analytics from "src/map/analytics";

import {
  arvometsaAreaCO2eFillColor,
  arvometsaBestMethodCumulativeSumCbt,
  arvometsaSumMethodAttrs,
  arvometsaTextfieldExpression,
  layerOptions,
} from "../../map/layers/forests/fi_arvometsa";
import {
  fitBounds,
  genericPopupHandler,
  querySourceFeatures,
  setFilter,
  setLayoutProperty,
  setPaintProperty,
} from "../../map/map";
import {
  assert,
  execWithMapLoaded,
  getGeoJsonGeometryBounds,
  pp,
} from "../../map/utils";
import { setOverlayMessage } from "../OverlayMessages";
import * as SelectedFeatureState from "./ArvometsaSelectedLayer";
import { HeaderTable, SimpleTable } from "./ForestArvometsaTable";
import { setIsSidebarOpen } from "../State";
import { setSearchPlaceholder } from "../NavBar/NavBarSearch";

import arvometsaLogo from "./arvometsa_logo.png";

const LAYER_ID = "arvometsa";
const LAYER_TITLE = `Finland's forests`;

const CO2_TONS_PER_PERSON = 7.0; // EU-27 in 2018

const nC_to_CO2 = 44 / 12;

const arvometsaBestMethodVsOther: (
  method: number | Expression,
  attrPrefix: string
) => Expression = (method, attrPrefix) => [
  "-",
  arvometsaSumMethodAttrs(method, attrPrefix),
  arvometsaSumMethodAttrs(ARVOMETSA_TRADITIONAL_FORESTRY_METHOD, attrPrefix),
];

const updateMapDetails = ({ dataset, carbonBalanceDifferenceFlag }) => {
  const co2eValueExpr =
    dataset === BEST_METHOD_FOR_EACH
      ? arvometsaBestMethodCumulativeSumCbt
      : arvometsaSumMethodAttrs(dataset, "cbt");

  const arvometsaRelativeCO2eValueExpr = arvometsaBestMethodVsOther(
    dataset,
    "cbt"
  );

  const fillColor = carbonBalanceDifferenceFlag
    ? arvometsaAreaCO2eFillColor(arvometsaRelativeCO2eValueExpr)
    : arvometsaAreaCO2eFillColor(co2eValueExpr);

  execWithMapLoaded(() => {
    for (const type of Object.keys(layerOptions)) {
      setPaintProperty(`${type}-fill`, "fill-color", fillColor);
    }
    setLayoutProperty(
      "arvometsa-sym",
      "text-field",
      arvometsaTextfieldExpression(co2eValueExpr)
    );
  });
};

const arvometsaDatasetClasses = [
  "arvometsa_eihakata",
  "arvometsa_jatkuva",
  "arvometsa_alaharvennus",
  "arvometsa_ylaharvennus",
  "arvometsa_maxhakkuu",
];
const BEST_METHOD_FOR_EACH = -1;

const ARVOMETSA_TRADITIONAL_FORESTRY_METHOD_KEY = "arvometsa_alaharvennus";
const ARVOMETSA_TRADITIONAL_FORESTRY_METHOD = 2; // Thin from below – clearfell

const carbonStockAttrPrefixes = ["bio", "maa"];

const baseAttrs = `
cbf1 cbf2 cbf3 cbf4 cbf5
cbt1 cbt2 cbt3 cbt4 cbt5
bio0 bio1 bio2 bio3 bio4 bio5
maa0 maa1 maa2 maa3 maa4 maa5
npv2 npv3 npv4
lho0 lho1 lho2 lho3 lho4 lho5
mus0 mus1 mus2 mus3 mus4 mus5
puo0 puo1 puo2 puo3 puo4 puo5
tat0 tat1 tat2 tat3 tat4 tat5
rou0 rou1 rou2 rou3 rou4 rou5
sha0 sha1 sha2 sha3 sha4 sha5
mai0 mai1 mai2 mai3 mai4 mai5
`.trim();

// These attributes are omitted from the data since they are always 0.
const omittedConstantAttrs = {
  m0_kasittely_0_kuitu: true,
  m0_kasittely_1_kuitu: true,
  m0_kasittely_2_kuitu: true,
  m0_kasittely_3_kuitu: true,
  m0_kasittely_4_kuitu: true,
  m0_kasittely_0_tukki: true,
  m0_kasittely_1_tukki: true,
  m0_kasittely_2_tukki: true,
  m0_kasittely_3_tukki: true,
  m0_kasittely_4_tukki: true,
  m4_kasittely_1: true,
  m4_kasittely_2: true,
  m4_kasittely_3: true,
  m4_kasittely_4: true,
  m4_kasittely_1_kuitu: true,
  m4_kasittely_2_kuitu: true,
  m4_kasittely_3_kuitu: true,
  m4_kasittely_4_kuitu: true,
  m4_kasittely_1_tukki: true,
  m4_kasittely_2_tukki: true,
  m4_kasittely_3_tukki: true,
  m4_kasittely_4_tukki: true,
};

const harvestedWoodAttrs = [
  [0, 1, 2, 3, 4].map((x) => `kasittely_${x}_tukki`).join(" "),
  [0, 1, 2, 3, 4].map((x) => `kasittely_${x}_kuitu`).join(" "),
];

const getChartDatasets = (prefix: string, attrValues: any) => {
  switch (prefix) {
    case "cbt":
      return [
        {
          label: "Soil",
          backgroundColor: "#364858",
          data: attrValues.soilCB,
        },
        {
          label: "Trees",
          backgroundColor: "#51c0c0",
          data: attrValues.treeCB,
        },
        {
          label: "Products",
          backgroundColor: "#fa6388",
          data: attrValues.productsCB,
        },
      ];
    case "bio":
      return [
        {
          label: "Soil",
          backgroundColor: "#364858",
          data: attrValues.maa,
        },
        {
          label: "Trees",
          backgroundColor: "#51c0c0",
          data: attrValues.bio,
        },
      ];
    case "harvested-wood":
      return [
        {
          label: "Sawlog",
          backgroundColor: "#51c0c0",
          data: attrValues.tukki,
        },
        {
          label: "Pulpwood",
          backgroundColor: "#364858",
          data: attrValues.kuitu,
        },
      ];
    default:
      assert(false, `Invalid prefix: ${prefix}`);
  }
};

function getUnitPerArea(
  prefix: string,
  cumulative: boolean,
  perHectareFlag: boolean
) {
  const baseUnit = getUnit(prefix, cumulative);
  const unit = perHectareFlag ? `${baseUnit}/ha` : baseUnit;
  return unit;
}

function getUnit(prefix: string, cumulative: boolean) {
  if (prefix === "harvested-wood") {
    return "m³";
  } else if (carbonStockAttrPrefixes.indexOf(prefix) !== -1) {
    return "tons C";
  } else if (cumulative) {
    return "tons CO₂eq";
  } else {
    return "tons CO₂eq/y";
  }
}

const getDatasetAttributes = ({ dataset, cumulativeFlag, totals }) => {
  const attrGroups = baseAttrs.split("\n").concat(harvestedWoodAttrs);

  const dsAttrValues = {
    cbf: [],
    cbt: [],
    bio: [],
    maa: [],
    tukki: [],
    kuitu: [],
    productsCB: [],
    soilCB: [],
    treeCB: [],
  };

  for (const attrGroup of attrGroups) {
    const prefix =
      attrGroup.indexOf("kasittely") !== -1
        ? attrGroup.trim().split(/[_ ]/)[2]
        : attrGroup.trim().slice(0, 3);
    const attrs = attrGroup
      .trim()
      .split(/ /)
      .map((attr) => `m${dataset}_${attr}`);

    if (prefix === "npv") continue; // Cannot accumulate NPV values

    const attrV: number[] = [];
    for (const attr of attrs) {
      const isCarbonStock = carbonStockAttrPrefixes.indexOf(prefix) !== -1;
      const cumulative = cumulativeFlag && !isCarbonStock;

      const prev = cumulative && attrV.length > 0 ? attrV[attrV.length - 1] : 0;
      attrV.push(prev + totals[attr]);
    }
    dsAttrValues[prefix] = attrV;
  }

  // Soil carbon content is the absolute amount of carbon in the soil, so it's not cumulative or per decade.
  // Here, we make it one of those:
  if (cumulativeFlag) {
    dsAttrValues.soilCB = dsAttrValues.maa
      .slice(1)
      .map((v, _) => v - dsAttrValues.maa[0]);
  } else {
    dsAttrValues.soilCB = dsAttrValues.maa
      .slice(1)
      .map((v, i) => v - dsAttrValues.maa[i]);
  }
  // tons carbon -> tons CO₂e approx TODO: verify
  dsAttrValues.soilCB = dsAttrValues.soilCB.map((x) => x * nC_to_CO2);

  dsAttrValues.productsCB = dsAttrValues.cbt.map(
    (cbtValue, i) => cbtValue - dsAttrValues.cbf[i]
  );
  dsAttrValues.treeCB = dsAttrValues.cbf.map(
    (cbfValue, i) => cbfValue - dsAttrValues.soilCB[i]
  );

  return dsAttrValues;
};

const getTotals = ({ dataset, perHectareFlag, allFeatureProps }) => {
  const totals = { area: 0, st_area: 0 };
  const totalBaseAttrs = (harvestedWoodAttrs.join(" ") + " " + baseAttrs).split(
    /\s+/
  );
  for (const dsNum of [dataset, ARVOMETSA_TRADITIONAL_FORESTRY_METHOD]) {
    for (const attr of totalBaseAttrs) {
      totals[`m${dsNum}_${attr}`] = 0;
    }
  }
  const areaProportionalAttrs = Object.keys(totals).filter(
    (x) => x !== "area" && x !== "st_area"
  );

  const reMatchAttr = /m-?\d_(.*)/;

  const seenIds = {};

  // In principle, multiple features' data can be aggregated here.
  // In practice, we just use one at the moment.
  for (const p of allFeatureProps) {
    // Degenerate cases:
    if (p.m0_cbt1 === null || p.m0_cbt1 === undefined) {
      continue;
    }
    if (!p.area) {
      continue;
    } // hypothetical

    // Duplicates are possible, so we must only aggregate only once per ID:
    const id = p.localid || p.standid;
    if (id in seenIds) {
      continue;
    }
    seenIds[id] = true;

    totals.area += p.area;
    totals.st_area += p.st_area || p.area;

    if (dataset === BEST_METHOD_FOR_EACH) {
      for (const a of areaProportionalAttrs) {
        const attr = `m${p.best_method}_${reMatchAttr.exec(a)[1]}`;
        if (!(attr in p) && !(attr in omittedConstantAttrs)) {
          console.error("Invalid attr:", attr, "orig:", a, "props:", p);
        }
        totals[a] += p[attr] * p.area;
      }
      continue;
    }

    for (const a of areaProportionalAttrs) {
      if (a in p) {
        totals[a] += p[a] * p.area;
      }
    }
  }

  if (perHectareFlag) {
    for (const a in totals) {
      if (a !== "area" && a !== "st_area") {
        totals[a] /= totals.area;
      }
    }
  }

  return totals;
};

const getChartProps = ({
  prefix,
  cumulativeFlag,
  perHectareFlag,
  attrValues,
}) => {
  // carbon stock is not counted cumulatively.
  const isCarbonStock = carbonStockAttrPrefixes.indexOf(prefix) !== -1;
  const cumulative = cumulativeFlag && !isCarbonStock;

  const unit = getUnitPerArea(prefix, cumulative, perHectareFlag);
  const stacked = true;

  const datasets = getChartDatasets(prefix, attrValues);

  // I.e. the decades
  const prefixLabels = {
    cbf: ["10", "20", "30", "40", "50"],
    cbt: ["10", "20", "30", "40", "50"],
    bio: ["0", "10", "20", "30", "40", "50"],
    "harvested-wood": ["10", "20", "30", "40", "50"],
  };

  const labelCallback = function (
    tooltipItem: Chart.ChartTooltipItem,
    data: Chart.ChartData
  ) {
    const label = data.datasets[tooltipItem.datasetIndex].label;
    const v = pp(+tooltipItem.yLabel, 2);
    return `${label}: ${v} ${unit}`;
  };

  const chartUpdateFunction = (chart) => {
    chart.data.datasets.forEach((ds: Chart.ChartDataSets, i: number) => {
      ds.data = datasets[i].data;
    });
    chart.options.tooltips.callbacks.label = labelCallback;
    chart.update();
  };

  const options = {
    animation: { duration: 0 },
    scales: {
      xAxes: [
        {
          stacked,
          scaleLabel: { display: true, labelString: "years from now" },
        },
      ],
      yAxes: [
        {
          stacked,
          ticks: {
            maxTicksLimit: 8,
            beginAtZero: true,
            callback: (value, _index, _values) => value.toLocaleString(),
          },
        },
      ],
    },
    tooltips: {
      callbacks: { label: labelCallback },
    },
  };
  const chartOptions = {
    type: "bar",
    data: { labels: prefixLabels[prefix], datasets },
    options,
  };

  return { chartOptions, chartUpdateFunction };
};

const getNpvText = ({
  carbonBalanceDifferenceFlag,
  perHectareFlag,
  totals,
  dataset,
}) => {
  // The comparison is too confusing IMO. Disabled for now.
  // const npvComparison = (
  //   carbonBalanceDifferenceFlag
  //     ? totals[`m${ARVOMETSA_TRADITIONAL_FORESTRY_METHOD}_npv3`]
  //     : 0
  // )
  const npvComparison = 0;
  const npvValue =
    dataset === 0 ? null : totals[`m${dataset}_npv3`] - npvComparison;
  return npvValue === 0 || npvValue
    ? `${pp(npvValue)} €${perHectareFlag ? " per ha" : ""}`
    : "-";
};

// Like Python all():
const all: (xs: boolean[]) => boolean = (xs) =>
  xs.reduce((a, b) => a && b, true);

const getChartTitleSingleLayer = (
  selectedFeatureLayer: string,
  featureProps: any[],
  multiple: boolean
) => {
  assert(selectedFeatureLayer, "selectedFeatureLayer must be set");
  if (selectedFeatureLayer === "arvometsa-fill") {
    const name = featureProps.map((p) => p.standid).join(", ");
    if (multiple) return `Multiple forest parcels selected: standids = ${name}`;
    return `Forest parcel (standid: ${name})`;
  } else if (selectedFeatureLayer === "arvometsa-property-fill") {
    const name = featureProps.map((p) => p.tpteksti).join(", ");
    if (multiple) return `Multiple properties selected: ${name}`;
    return `Property with forest (${name})`;
  } else {
    assert(
      all(featureProps.map((p) => p.name_fi)),
      `Expected name_fi: ${selectedFeatureLayer}`
    );
    const name = featureProps.map((p) => p.name_fi || p.name_sv).join(", ");
    if (multiple) return `Multiple administrative areas selected: ${name}`;
    return name;
  }
};

const getChartTitle = (
  selectedFeatureLayers: string[],
  featureProps: any[]
) => {
  if (featureProps.length === 0) return "No area selected";

  assert(
    selectedFeatureLayers.length > 0,
    "selectedFeatureLayer must be non-empty"
  );
  const uniqueLayers = Array.from(new Set(selectedFeatureLayers));
  if (uniqueLayers.length > 1)
    return "Areas selected across multiple scales: double-counting an area is possible";

  return getChartTitleSingleLayer(
    uniqueLayers[0],
    featureProps,
    selectedFeatureLayers.length > 1
  );
};

export const ArvometsaChart = (props: any) => {
  // i.e. which projection/scenario is in use:
  const {
    scenarioName,
    cumulativeFlag,
    perHectareFlag,
    carbonBalanceDifferenceFlag,
  } = props;
  // NB: an unknown scenarioName is also valid; dataset==-1 -> compare against the best option
  const dataset = arvometsaDatasetClasses.indexOf(scenarioName);

  const selectedFeatures = useObservable(SelectedFeatureState.selectedFeatures);
  // -> layer, feature

  useEffect(() => {
    updateMapDetails({ dataset, carbonBalanceDifferenceFlag });
  }, [dataset, carbonBalanceDifferenceFlag]);

  if (selectedFeatures.length === 0) return null;

  const allFeatureProps = selectedFeatures.map((x) => x.feature.properties);
  const totals = getTotals({ dataset, perHectareFlag, allFeatureProps });

  const attrValues = getDatasetAttributes({ dataset, cumulativeFlag, totals });
  if (carbonBalanceDifferenceFlag) {
    const traditional = getDatasetAttributes({
      dataset: ARVOMETSA_TRADITIONAL_FORESTRY_METHOD,
      cumulativeFlag,
      totals,
    });
    for (const attr in attrValues) {
      attrValues[attr] = attrValues[attr].map(
        (v: number, i: number) => v - traditional[attr][i]
      );
    }
  }

  const selectedLayersOfFeatures = selectedFeatures.map((x) => x.layer);
  const title = getChartTitle(selectedLayersOfFeatures, allFeatureProps);
  const npvText = getNpvText({
    carbonBalanceDifferenceFlag,
    perHectareFlag,
    totals,
    dataset,
  });

  const chartProps = { cumulativeFlag, perHectareFlag, attrValues };
  const cbt = getChartProps({ ...chartProps, prefix: "cbt" });
  const bio = getChartProps({ ...chartProps, prefix: "bio" });
  const wood = getChartProps({ ...chartProps, prefix: "harvested-wood" });

  return (
    <div>
      <h1 id="arvometsa-title">{title}</h1>
      <ChartComponent {...cbt} />
      <ChartComponent {...bio} />
      <ChartComponent {...wood} />
      <h1 id="arvometsa-npv">{npvText}</h1>
      <h1 id="arvometsa-area-forest">{pp(totals.area, 3)} hectares</h1>
      <h1 id="arvometsa-area-total">{pp(1e-4 * totals.st_area, 3)} hectares</h1>
    </div>
  );
};

const ChartComponent = (props) => {
  const canvasRef: React.MutableRefObject<HTMLCanvasElement> = useRef(null);
  const [chart, setChart] = useState(null);

  const { chartOptions, chartUpdateFunction } = props;

  const componentIsMounted = useRef(true);
  useEffect(() => {
    return () => {
      componentIsMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const chartRef = canvasRef.current.getContext("2d");
    const chart2 = chart || new Chart(chartRef, chartOptions);
    if (chart !== chart2) setChart(chart2);
    if (chartUpdateFunction) chartUpdateFunction(chart2);
    // We only need to destroy the instance when unmounting the component:
    if (!componentIsMounted.current) return chart2.destroy;
  }, [canvasRef, chart, chartOptions, chartUpdateFunction, componentIsMounted]);

  const classes = { graphContainer: "a" };
  return (
    <div className={classes.graphContainer}>
      <canvas id="myChart" ref={canvasRef} />
    </div>
  );
};

for (const sourceName of Object.keys(layerOptions)) {
  const layerName = `${sourceName}-fill`;
  // eslint-disable-next-line no-loop-func
  genericPopupHandler(layerName, (ev) => {
    const feature = ev.features[0];

    // Only copy over currently selected features:
    const idName = layerOptions[sourceName].id;
    const id = feature.properties[idName];

    // A bit of a hack: Ensure feature.id refers to some meaningful identifier for highlighting etc.
    feature.id = id;

    assert(
      id !== null && id !== undefined,
      `Feature has no id: ${JSON.stringify(feature.properties)}`
    );

    const bounds = querySourceFeatures(sourceName, "default")
      .filter((f) => f.properties[idName] === id)
      .map(
        (f) =>
          f.bbox || getGeoJsonGeometryBounds((f.geometry as any).coordinates)
      )
      .reduce(
        ([a1, b1, c1, d1], [a2, b2, c2, d2]) => [
          Math.min(a1, a2),
          Math.min(b1, b2),
          Math.max(c1, c2),
          Math.max(d1, d2),
        ],
        [999, 999, -999, -999] // fallback bounds
      );

    const prevSelectedFeatures = SelectedFeatureState.selectedFeatures.get();
    SelectedFeatureState.selectFeature({ layer: layerName, feature, bounds });

    const oldIds = prevSelectedFeatures.map((x) => x.feature.id);
    const newIds = oldIds.includes(id)
      ? oldIds.filter((x) => x !== id)
      : oldIds.concat(id);

    const newFilter = ["in", idName, ...newIds];
    setFilter(`${sourceName}-highlighted`, newFilter);
    console.debug(`${sourceName}-highlighted`, newFilter);

    // Open the report panel immediately when a feature was selected and nothing was selected prior to it.
    if (feature && prevSelectedFeatures.length === 0) setIsSidebarOpen(true);

    if (newIds.includes(id)) Analytics.setParams({ highlightedFeatureId: id });
  });
}

const onChangeCheckbox = (
  callback: React.Dispatch<React.SetStateAction<boolean>>
) => {
  return (event: any) => {
    callback((event.target as HTMLInputElement).checked);
  };
};
const onChangeValue = (callback: React.Dispatch<React.SetStateAction<any>>) => {
  return (event: any) => {
    callback((event.target as HTMLInputElement).value);
  };
};

// Substitute in some official titles for shorter ones:
const titleRenames = {
  "Etelä-Suomen aluehallintovirasto": "Etelä-Suomi",
  "Itä-Suomen aluehallintovirasto": "Itä-Suomi",
  "Länsi- ja Sisä-Suomen aluehallintovirasto": "Länsi-Suomi",
  "Lapin aluehallintovirasto": "Lappi",
  "Lounais-Suomen aluehallintovirasto": "Lounais-Suomi",
  "Pohjois-Suomen aluehallintovirasto": "Pohjois-Suomi",
};

const getCombinedBounds = (xs: any[]) =>
  xs.reduce(
    ([a1, b1, c1, d1], [a2, b2, c2, d2]) => [
      Math.min(a1, a2),
      Math.min(b1, b2),
      Math.max(c1, c2),
      Math.max(d1, d2),
    ],
    [999, 999, -999, -999] // fallback bounds
  );

function ArvometsaUI() {
  const [reportPanelOpen, setReportPanelOpen] = useState(true);

  const [scenario, setScenario] = useState("arvometsa_alaharvennus");
  const [perHectareFlag, setPerHectareFlag] = useState(true);
  const [cumulativeFlag, setCumulativeFlag] = useState(true);
  const [carbonBalanceDifferenceFlag, setCarbonBalanceDifferenceFlag] =
    useState(true);

  Analytics.setParams({
    reportPanelOpen,
    scenario,
    perHectareFlag,
    cumulativeFlag,
    carbonBalanceDifferenceFlag,
  });

  // i.e. which projection/scenario is in use:
  // NB: an unknown scenarioName is also valid; dataset==-1 -> compare against the best option
  const dataset = arvometsaDatasetClasses.indexOf(scenario);

  // const { layer, feature, bounds } = useObservable(SelectedFeatureState.selectedFeatures)
  const selectedFeatures = useObservable(SelectedFeatureState.selectedFeatures);
  const hasFeature = selectedFeatures.length > 0;

  // Eliminate confusing options (all zeroes)
  if (
    scenario === ARVOMETSA_TRADITIONAL_FORESTRY_METHOD_KEY &&
    carbonBalanceDifferenceFlag
  )
    setCarbonBalanceDifferenceFlag(false);

  useEffect(() => {
    updateMapDetails({ dataset, carbonBalanceDifferenceFlag });
  }, [dataset, carbonBalanceDifferenceFlag]);

  useEffect(() => {
    setOverlayMessage(!hasFeature, {
      layer: LAYER_ID,
      message: "Zoom in and click a forest area for carbon report",
    });
    setSearchPlaceholder({
      layer: LAYER_ID,
      placeholder: "Look up by property ID",
    });
  }, [hasFeature]);

  const allFeatureProps = selectedFeatures.map((x) => x.feature.properties);
  const totals = getTotals({ dataset, perHectareFlag, allFeatureProps });

  const attrValues = getDatasetAttributes({ dataset, cumulativeFlag, totals });
  if (carbonBalanceDifferenceFlag) {
    const traditional = getDatasetAttributes({
      dataset: ARVOMETSA_TRADITIONAL_FORESTRY_METHOD,
      cumulativeFlag,
      totals,
    });
    for (const attr in attrValues) {
      attrValues[attr] = attrValues[attr].map(
        (v: number, i: number) => v - traditional[attr][i]
      );
    }
  }

  const selectedLayersOfFeatures = selectedFeatures.map((x) => x.layer);
  const title = getChartTitle(selectedLayersOfFeatures, allFeatureProps);
  const npvText = getNpvText({
    carbonBalanceDifferenceFlag,
    perHectareFlag,
    totals,
    dataset,
  });

  const chartProps = { cumulativeFlag, perHectareFlag, attrValues };
  const cbt = getChartProps({ ...chartProps, prefix: "cbt" });
  const bio = getChartProps({ ...chartProps, prefix: "bio" });
  const wood = getChartProps({ ...chartProps, prefix: "harvested-wood" });

  const getAverageCarbonBalanceFigure = (totals) => {
    const averageCarbonBalanceDecade =
      totals[`m${dataset}_cbt1`] -
      (carbonBalanceDifferenceFlag
        ? totals[`m${ARVOMETSA_TRADITIONAL_FORESTRY_METHOD}_cbt1`]
        : 0);
    // per decade -> per year
    return averageCarbonBalanceDecade / 10;
  };

  const averageCarbonBalance = getAverageCarbonBalanceFigure(totals);
  const unit = perHectareFlag ? "tons CO₂e/ha/y" : "tons CO₂e/y";
  const averageCarbonBalanceText = isNaN(averageCarbonBalance)
    ? ""
    : `${averageCarbonBalance > 0 ? "+" : ""}${pp(
        averageCarbonBalance,
        2
      )} ${unit}`;

  const totalsOverall = getTotals({
    dataset,
    perHectareFlag: false,
    allFeatureProps,
  });
  const averageCarbonBalanceOverall =
    getAverageCarbonBalanceFigure(totalsOverall);

  const headerTitle = titleRenames[title] || title;
  const headerOnClick = () => {
    if (!hasFeature) setIsSidebarOpen(false);
  };
  const headerRows = [
    {
      name: (
        <div
          onClick={headerOnClick}
          style={{ cursor: hasFeature ? "initial" : "pointer" }}
        >
          {headerTitle}
          {!hasFeature && (
            <span>
              <br />
              <strong>click to show the map</strong>
            </span>
          )}
        </div>
      ),
      value: `${pp(1e-4 * totals.st_area, 3)} ha`,
    },
  ];

  const tableRows = [
    { name: "Forest area", value: `${pp(totals.area, 3)} ha` },
    // { name: 'Main tree species', value: 'Pine' },
    // { name: 'Forest age', value: `${pp(123, 2)} years` },
    // { name: 'Biomass volume', value: `${pp(123.45, 2)} m³/ha` },
    { name: "Average carbon balance*", value: averageCarbonBalanceText },
    { name: "Net present value (3% discounting)", value: npvText },
  ];

  const bounds = getCombinedBounds(selectedFeatures.map((x) => x.bounds));
  const onFitLayerBounds = () => {
    if (bounds) {
      fitBounds(bounds, 0.4, 0.15);
    }
  };

  const showReport = reportPanelOpen && hasFeature;

  const tableTitle = (
    <NavLink
      to="/"
      className="neutral-link"
      style={{ display: "flex", fontSize: "20px", lineHeight: "21px" }}
    >
      <ExpandMoreIcon style={{ transform: "rotate(90deg)" }} />
      {LAYER_TITLE}
    </NavLink>
  );

  return (
    <div
      className={
        showReport ? "grid-parent" : "grid-parent grid-parent-report-closed"
      }
    >
      <Paper className="grid-col1" elevation={5} style={{ paddingTop: "20px" }}>
        <Container>
          <HeaderTable
            title={tableTitle}
            rows={headerRows}
            onFitLayerBounds={onFitLayerBounds}
          />
          <br />
          <Paper>
            <FormControlLabel
              style={{ padding: "4px 10px" }}
              control={<Checkbox />}
              label="Show values per hectare"
              checked={perHectareFlag}
              onChange={(event) => {
                onChangeCheckbox(setPerHectareFlag)(event);
                setReportPanelOpen(true);
              }}
            />
          </Paper>
          <br />
          <SimpleTable rows={tableRows} /> {/* area stats */}
          <p>* Assuming even-age forestry</p>
          <p>
            * Carbon balance means changes in soil, trees, and wood products.
            When the carbon balance is positive, more carbon is being stored
            than released.
          </p>
          <p hidden={!hasFeature}>
            Equals {pp(averageCarbonBalanceOverall / CO2_TONS_PER_PERSON, 1)}{" "}
            times average 👤 CO2 emissions
          </p>
          <h1>Forestry projections</h1>
          <Divider />
          <FormControl style={{ width: "100%" }}>
            <InputLabel htmlFor="forestry-scenario">Forestry method</InputLabel>
            <Select
              native
              inputProps={{
                name: "forestry-scenario",
                id: "forestry-scenario",
              }}
              value={scenario}
              onChange={(event) => {
                onChangeValue(setScenario)(event);
                setReportPanelOpen(true);
              }}
            >
              <option value="arvometsa_eihakata"> No cuttings </option>
              <option value="arvometsa_jatkuva">
                {" "}
                Continuous cover forestry{" "}
              </option>
              <option value="arvometsa_ylaharvennus">
                {" "}
                Thin from above – extended rotation{" "}
              </option>
              <option value="arvometsa_alaharvennus">
                {" "}
                Thin from below – clearfell{" "}
              </option>
              <option value="arvometsa_maxhakkuu">
                {" "}
                Removal of tree cover{" "}
              </option>
            </Select>
          </FormControl>
          <br />
          <br />
          <Button
            variant="contained"
            color="primary"
            disabled={!hasFeature}
            onClick={() => setReportPanelOpen(true)}
          >
            Open report
          </Button>
          <br />
          <br />
          <NavLink to="/">
            <Button variant="contained" color="secondary">
              Go back
            </Button>
          </NavLink>
          <p style={{ fontSize: "1.5em", textAlign: "center" }}>
            Scientific forest model by
            <br />
            <a href="https://arvometsa.fi">
              <img
                alt="Arvometsä"
                src={arvometsaLogo}
                style={{ height: "120px" }}
              />
            </a>
          </p>
        </Container>
      </Paper>

      <Paper className="grid-col2" elevation={2} hidden={!showReport}>
        <Container>
          <Paper>
            <FormControlLabel
              style={{ padding: "4px 10px" }}
              control={<Checkbox />}
              label="Show cumulative carbon balance"
              checked={cumulativeFlag}
              onChange={onChangeCheckbox(setCumulativeFlag)}
            />
          </Paper>
          <br />
          <Paper>
            <FormControlLabel
              style={{ padding: "4px 10px" }}
              control={<Checkbox />}
              label="Show carbon balance improvement potential compared to the prevalent forestry practice"
              checked={carbonBalanceDifferenceFlag}
              onChange={onChangeCheckbox(setCarbonBalanceDifferenceFlag)}
              disabled={scenario === ARVOMETSA_TRADITIONAL_FORESTRY_METHOD_KEY}
            />
          </Paper>
          <br />
          <abbr title="Carbon dioxide equivalent">
            CO<sub>2</sub>eq
          </abbr>{" "}
          carbon balance (
          {getUnitPerArea("cbt", cumulativeFlag, perHectareFlag)})
          <ChartComponent {...cbt} />
          <br />
          Forest carbon stock
          <br />
          <small>
            in {getUnitPerArea("bio", cumulativeFlag, perHectareFlag)}; multiply
            by 3.67 to get CO<sub>2</sub>eq amounts
          </small>
          <ChartComponent {...bio} />
          <br />
          Harvested wood (
          {getUnitPerArea("harvested-wood", cumulativeFlag, perHectareFlag)})
          <ChartComponent {...wood} />
          <br />
          <Button
            variant="contained"
            color="primary"
            onClick={() => Analytics.pageview("layers/fi-forest/methodology")}
          >
            Read about the methodology
          </Button>
          <br />
          <br />
          <Button
            variant="contained"
            color="secondary"
            onClick={() => setReportPanelOpen(false)}
          >
            Close report
          </Button>
        </Container>
      </Paper>
    </div>
  );
}

export default ArvometsaUI;

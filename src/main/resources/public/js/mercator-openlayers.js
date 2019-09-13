/*****************************************************************************
***
*** Mercator-OpenLayers.js
***
*** Author: Gary W. Johnson
*** Copyright: 2017-2019 Spatial Informatics Group, LLC
*** License: LGPLv3
***
*** Description: This library provides a set of functions for
*** interacting with embedded web maps in an API agnostic manner. This
*** file contains the OpenLayers 5 implementation.
***
******************************************************************************
***
*** OpenLayers imports
***
*****************************************************************************/

import "ol/ol.css";

import BingMaps                                   from "ol/source/BingMaps";
import Circle                                     from "ol/geom/Circle";
import CircleStyle                                from "ol/style/Circle";
import Cluster                                    from "ol/source/Cluster";
import DragBox                                    from "ol/interaction/DragBox";
import Feature                                    from "ol/Feature";
import Fill                                       from "ol/style/Fill";
import GeoJSON                                    from "ol/format/GeoJSON";
import Icon                                       from "ol/style/Icon";
import KML                                        from "ol/format/KML";
import LineString                                 from "ol/geom/LineString";
import Map                                        from "ol/Map";
import Overlay                                    from "ol/Overlay";
import Point                                      from "ol/geom/Point";
import RegularShape                               from "ol/style/RegularShape";
import ScaleLine                                  from "ol/control/ScaleLine";
import Select                                     from "ol/interaction/Select";
import Stroke                                     from "ol/style/Stroke";
import Style                                      from "ol/style/Style";
import Text                                       from "ol/style/Text";
import TileLayer                                  from "ol/layer/Tile";
import TileWMS                                    from "ol/source/TileWMS";
import VectorLayer                                from "ol/layer/Vector";
import VectorSource                               from "ol/source/Vector";
import View                                       from "ol/View";
import XYZ                                        from "ol/source/XYZ";
import { createEmpty as createEmptyExtent }       from "ol/extent";
import { defaults as ControlDefaults }            from "ol/control";
import { fromExtent, fromCircle }                 from "ol/geom/Polygon";
import { fromLonLat, transform, transformExtent } from "ol/proj";
import { platformModifierKeyOnly }                from "ol/events/condition";

/******************************************************************************
***
*** Toplevel namespace object
***
*****************************************************************************/

const mercator = {};

/*****************************************************************************
***
*** Lon/Lat Reprojection
***
*** The default map projection for most web maps (e.g., OpenLayers,
*** OpenStreetMap, Google Maps, MapQuest, and Bing Maps) is "Web
*** Mercator" (EPSG:3857).
***
*****************************************************************************/

// [Pure] Returns the passed in [longitude, latitude] values
// reprojected to Web Mercator as [x, y].
mercator.reprojectToMap = (longitude, latitude) =>
    transform([Number(longitude), Number(latitude)], "EPSG:4326", "EPSG:3857");

// [Pure] Returns the passed in [x, y] values reprojected to WGS84 as
// [longitude, latitude].
mercator.reprojectFromMap = (x, y) =>
    transform([Number(x), Number(y)], "EPSG:3857", "EPSG:4326");

// [Pure] Returns a bounding box for the globe in Web Mercator as
// [llx, lly, urx, ury].
mercator.getFullExtent = () => {
    const llxy = mercator.reprojectToMap(-180.0, -89.999999);
    const urxy = mercator.reprojectToMap(180.0, 90.0);
    return [llxy[0], llxy[1], urxy[0], urxy[1]];
};

// [Pure] Returns a bounding box for the current map view in WGS84
// lat/lon as [llx, lly, urx, ury].
mercator.getViewExtent = (mapConfig) => {
    const size = mapConfig.map.getSize();
    const extent = mapConfig.view.calculateExtent(size);
    return transformExtent(extent, "EPSG:3857", "EPSG:4326");
};

// [Pure] Returns the minimum distance in meters from the view center
// to the view extent.
mercator.getViewRadius = (mapConfig) => {
    const size = mapConfig.map.getSize();
    const [llx, lly, urx, ury] = mapConfig.view.calculateExtent(size);
    const width = Math.abs(urx - llx);
    const height = Math.abs(ury - lly);
    return Math.min(width, height) / 2.0;
};

/*****************************************************************************
***
*** Create map source and layer objects from JSON descriptions
***
*****************************************************************************/

// [Pure] If text is valid JSON, return the parsed value. Otherwise
// return the text unmodified.
mercator.maybeParseJson = (text) => {
    try {
        return JSON.parse(text);
    } catch (e) {
        return text;
    }
};

// FIXME: Remove mercator.currentMap once mercator.sendGeeQuery() has
// been simplified.
mercator.currentMap = null;

// [Side Effects] Makes an AJAX call to get the GEE mapid and token
// and then updates the temporary XYZ layer's source URL.
mercator.sendGeeQuery = (sourceConfig) => {
    const theID = Math.random().toString(36).substr(2, 16) + "_" + Math.random().toString(36).substr(2, 9); // FIXME: id should be set as the layer title
    if (sourceConfig.create) { // FIXME: When would sourceConfig.create not be true?
        sourceConfig.geeParams.visParams = mercator.maybeParseJson(sourceConfig.geeParams.visParams); // FIXME: Is this necessary?
        fetch(sourceConfig.path ? "thegateway" : sourceConfig.geeUrl, // FIXME: What does fetch("thegateway") do? There's no route for this.
              {
                  method: "POST",
                  headers: {
                      "Accept":       "application/json",
                      "Content-Type": "application/json",
                      "mapConfig":    sourceConfig, // FIXME: Why isn't this passed in body? Is it needed?
                      "LayerId":      theID,        // FIXME: LayerId -> layerId, Why isn't this passed in body? Is it needed?
                  },
                  body: JSON.stringify({
                      dateFrom:      sourceConfig.geeParams.startDate,
                      dateTo:        sourceConfig.geeParams.endDate,
                      bands:         sourceConfig.geeParams.visParams.bands,
                      min:           sourceConfig.geeParams.visParams.min,
                      max:           sourceConfig.geeParams.visParams.max,
                      cloudLessThan: sourceConfig.geeParams.visParams.cloudLessThan ? parseInt(sourceConfig.geeParams.visParams.cloudLessThan) : "", // FIXME: "" should be an integer
                      visParams:     sourceConfig.geeParams.visParams,
                      path:          sourceConfig.geeParams.path,
                      imageName:     sourceConfig.geeParams.ImageAsset || sourceConfig.geeParams.ImageCollectionAsset,
                  }),
              })
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(data => {
                if (data.mapid && data.token) {
                    // FIXME: Use this instead:
                    // mercator.updateLayerSource(mapConfig,
                    //                            theID,
                    //                            sourceConfig => {
                    //                                sourceConfig.url = "https://earthengine.googleapis.com/map/" + data.mapid + "/{z}/{x}/{y}?token=" + data.token;
                    //                                return sourceConfig;
                    //                            },
                    //                            null); // or this
                    // FIXME: Remove mercator.currentMap once this code has been deleted.
                    const tempLayer = mercator.currentMap.getLayers().find(layer => theID === layer.getSource().get("id"));
                    tempLayer.setSource(new XYZ({
                        url: "https://earthengine.googleapis.com/map/" + data.mapid + "/{z}/{x}/{y}?token=" + data.token,
                    }));
                } else {
                    console.warn("Wrong data returned for GEE layer " + theID + ".");
                }
            })
            .catch(response => {
                console.log("Error loading GEE imagery:");
                console.log(response);
            });
    }
    return theID;
};

// [Pure] Returns a new ol.source.* object or null if the sourceConfig
// is invalid.
mercator.createSource = (sourceConfig, imageryId, documentRoot) =>
    ["DigitalGlobe", "EarthWatch"].includes(sourceConfig.type) ?
    new XYZ({
        url: documentRoot + "/get-tile?imageryId=" + imageryId + "&z={z}&x={x}&y={-y}",
        attribution: "© DigitalGlobe, Inc",
    })
    : sourceConfig.type === "Planet" ?
    new XYZ({
        url: documentRoot
            + "/get-tile?imageryId=" + imageryId
            + "&z={z}&x={x}&y={y}&tile={0-3}&month=" + sourceConfig.month
            + "&year=" + sourceConfig.year,
        attribution: "© Planet Labs, Inc",
    })
    : sourceConfig.type === "BingMaps" ?
    new BingMaps({
        imagerySet: sourceConfig.imageryId,
        key: sourceConfig.accessToken,
        maxZoom: 19,
    })
    : sourceConfig.type === "GeoServer" ?
    new TileWMS({
        serverType: "geoserver",
        url: documentRoot + "/get-tile",
        params: { LAYERS: "none", imageryId: imageryId },
    })
    : sourceConfig.type === "GeeGateway" ?
    new XYZ({
        id: mercator.sendGeeQuery(sourceConfig), // FIXME: theID should be the layer title
        url: "https://earthengine.googleapis.com/map/temp/{z}/{x}/{y}?token=",
    })
    : null;

// [Pure] Returns a new TileLayer object or null if the layerConfig is
// invalid.
mercator.createLayer = (layerConfig, documentRoot) => {
    layerConfig.sourceConfig.create = true; // FIXME: Remove this once udpating GEE layers is moved to geo-dash.js.
    const source = mercator.createSource(layerConfig.sourceConfig, layerConfig.id, documentRoot);
    return source
        ? new TileLayer({
            title: layerConfig.title,
            visible: false,
            // extent: layerConfig.extent || mercator.getFullExtent(),
            source: source,
        })
        : null;
};

/*****************************************************************************
***
*** Functions to verify map input arguments
***
*****************************************************************************/

// [Pure] Predicate
mercator.verifyDivName = (divName) => document.getElementById(divName) != null;

// [Pure] Predicate
mercator.verifyCenterCoords = ([lon, lat]) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;

// [Pure] Predicate
mercator.verifyZoomLevel = (zoomLevel) => zoomLevel >= 0 && zoomLevel <= 20;

// [Pure] Predicate
mercator.verifyLayerConfig = (layerConfig) => {
    const layerKeys = Object.keys(layerConfig);
    return layerKeys.includes("title")
        && layerKeys.includes("extent")
        && layerKeys.includes("sourceConfig")
        && mercator.createSource(layerConfig.sourceConfig, layerConfig.id, "") != null;
};

// [Pure] Predicate
mercator.verifyLayerConfigs = (layerConfigs) => layerConfigs.every(mercator.verifyLayerConfig);

// [Pure] Returns the first error message generated while testing the
// input arguments or null if all tests pass.
mercator.verifyMapInputs = (divName, centerCoords, zoomLevel, layerConfigs) =>
    !mercator.verifyDivName(divName)             ? "Invalid divName -> " + divName
    : !mercator.verifyCenterCoords(centerCoords) ? "Invalid centerCoords -> " + centerCoords
    : !mercator.verifyZoomLevel(zoomLevel)       ? "Invalid zoomLevel -> " + zoomLevel
    : !mercator.verifyLayerConfigs(layerConfigs) ? "Invalid layerConfigs -> " + layerConfigs
    : null;

/*****************************************************************************
***
*** Create a new map instance
***
*****************************************************************************/

// [Side Effects] Logs an error message to the console and returns
// null if the inputs are invalid. Otherwise, displays a map in the
// named div and returns its configuration object.
//
// Example call:
// const mapConfig = mercator.createMap("some-div-id", [102.0, 17.0], 5,
//                                    [{title: "DigitalGlobeRecentImagery",
//                                      extent: null,
//                                      sourceConfig: {type: "DigitalGlobe",
//                                                     imageryId: "digitalglobe.nal0g75k",
//                                                     accessToken: "your-digital-globe-access-token-here"}},
//                                     {title: "BingAerial",
//                                      extent: null,
//                                      sourceConfig: {type: "BingMaps",
//                                                     imageryId: "Aerial",
//                                                     accessToken: "your-bing-maps-access-token-here"}},
//                                     {title: "DigitalGlobeWMSImagery",
//                                      extent: null,
//                                      sourceConfig: {type: "GeoServer",
//                                                     geoserverUrl: "https://services.digitalglobe.com/mapservice/wmsaccess",
//                                                     geoserverParams: {VERSION: "1.1.1",
//                                                                       LAYERS: "DigitalGlobe:Imagery",
//                                                                       CONNECTID: "your-digital-globe-connect-id-here"}}}]);
mercator.createMap = (divName, centerCoords, zoomLevel, layerConfigs, documentRoot) => {
    const errorMsg = mercator.verifyMapInputs(divName, centerCoords, zoomLevel, layerConfigs);
    if (errorMsg) {
        console.error(errorMsg);
        return null;
    } else {
        // Create each of the layers that will be shown in the map from layerConfigs
        const layers = layerConfigs.map(l => mercator.createLayer(l, documentRoot));

        // Add a scale line to the default map controls
        const controls = ControlDefaults().extend([new ScaleLine()]);

        // Create the map view using the passed in centerCoords and zoomLevel
        const view = new View({
            projection: "EPSG:3857",
            center: fromLonLat(centerCoords),
            extent: mercator.getFullExtent(),
            zoom: zoomLevel,
        });

        // Create the new map object
        const map = new Map({
            target: divName,
            layers: layers,
            controls: controls,
            view: view,
        });

        // FIXME: Remove mercator.currentMap once Billy's GEE layers are updated from geo-dash.js
        mercator.currentMap = map;

        // Return the map configuration object
        return {
            init: {
                divName: divName,
                centerCoords: centerCoords,
                zoomLevel: zoomLevel,
                layerConfigs: layerConfigs,
            },
            controls: controls,
            documentRoot: documentRoot,
            layers: map.getLayers(),
            map: map,
            view: view,
        };
    }
};

/*****************************************************************************
***
*** Destroy a map instance
***
*****************************************************************************/

// [Side Effects] Removes the mapConfig's map from its container div.
// Returns null.
mercator.destroyMap = (mapConfig) => {
    document.getElementById(mapConfig.init.divName).innerHTML = "";
    return null;
};

/*****************************************************************************
***
*** Reset a map instance to its initial state
***
*****************************************************************************/

// [Side Effects] Returns a new mapConfig object created with the
// initialization-time values of the passed-in mapConfig. Removes the
// original mapConfig's map from its container div and renders the new
// mapConfig's map into it instead.
//
// Example call:
// const newMapConfig = mercator.resetMap(mapConfig);
mercator.resetMap = (mapConfig) => {
    mercator.destroyMap(mapConfig);
    return mercator.createMap(mapConfig.init.divName,
                              mapConfig.init.centerCoords,
                              mapConfig.init.zoomLevel,
                              mapConfig.init.layerConfigs,
                              mapConfig.documentRoot);
};

/*****************************************************************************
***
*** Functions to switch the visible basemap imagery and zoom to a layer
***
*****************************************************************************/

// [Side Effects] Hides all raster layers in mapConfig except those
// with title === layerTitle.
mercator.setVisibleLayer = (mapConfig, layerTitle) => {
    mapConfig.layers.forEach(layer => {
        if (layer.getVisible() === true && layer instanceof TileLayer) {
            layer.setVisible(false);
        }
        if (layer.get("title") === layerTitle) {
            layer.setVisible(true);
        }
    });
    return mapConfig;
};

// [Pure] Returns the map layer with title === layerTitle or null if no
// such layer exists.
mercator.getLayerByTitle = (mapConfig, layerTitle) =>
    mapConfig.layers.getArray().find(layer => layer.get("title") === layerTitle);

// [Pure] Returns the initial layerConfig for the map layer with title
// === layerTitle or null if no such layer exists.
mercator.getLayerConfigByTitle = (mapConfig, layerTitle) =>
    mapConfig.init.layerConfigs.find(layerConfig => layerConfig.title === layerTitle);

// [Side Effects] Finds the map layer with title === layerTitle and
// applies transformer to its initial sourceConfig to create a new
// source for the layer.
mercator.updateLayerSource = (mapConfig, layerTitle, transformer, caller) => {
    const layer = mercator.getLayerByTitle(mapConfig, layerTitle);
    const layerConfig = mercator.getLayerConfigByTitle(mapConfig, layerTitle);
    if (layer && layerConfig) {
        layer.setSource(mercator.createSource(transformer.call(caller, layerConfig.sourceConfig),
                                              layerConfig.id,
                                              mapConfig.documentRoot));
    }
};

// [Side Effects] Finds the map layer with title === layerTitle and
// appends newParams to its source's WMS params object.
//
// Example call:
// const mapConfig2 = mercator.updateLayerWmsParams(mapConfig,
//                                                "DigitalGlobeWMSImagery",
//                                                {COVERAGE_CQL_FILTER: "(acquisitionDate>='" + imageryYear + "-01-01')"
//                                                                 + "AND(acquisitionDate<='" + imageryYear + "-12-31')",
//                                                 FEATUREPROFILE: stackingProfile});
mercator.updateLayerWmsParams = (mapConfig, layerTitle, newParams) => {
    const layer = mercator.getLayerByTitle(mapConfig, layerTitle);
    if (layer) {
        const mergedParams = Object.assign({}, layer.getSource().getParams(), newParams);
        layer.getSource().updateParams(mergedParams);
    }
    return mapConfig;
};

// [Side Effects] Zooms the map view to contain the passed in extent.
mercator.zoomMapToExtent = function (mapConfig, extent, maxZoom) {
    if (extent) {
        if (extent[0] <= -13630599.62775418 && extent[1] <= -291567.89923496445 && extent[2] >= 20060974.510472793 && extent[3] >= 10122013.145404479) {
            extent = [-13630599.62775418, -291567.89923496445, 20060974.510472793, 10122013.145404479];
        }
    }
    mapConfig.view.fit(extent,
                       mapConfig.map.getSize(),
                       { maxZoom: maxZoom || 19 });
    return mapConfig;
};

// [Side Effects] Zooms the map view to contain the layer with
// title === layerTitle.
mercator.zoomMapToLayer = function (mapConfig, layerTitle, maxZoom) {
    const layer = mercator.getLayerByTitle(mapConfig, layerTitle);
    if (layer) {
        mercator.zoomMapToExtent(mapConfig, layer.getSource().getExtent(), maxZoom);
    }
    return mapConfig;
};

/*****************************************************************************
***
*** Functions to create map styles
***
*****************************************************************************/

// [Pure] Returns a style object that displays the image at imageSrc.
mercator.getIconStyle = function (imageSrc) {
    return new Style({ image: new Icon({ src: imageSrc }) });
};

// [Pure] Returns a style object that displays a circle with the
// specified radius, fillColor, borderColor, and borderWidth. If text
// and textFillColor are also passed, they will be used to overlay
// text on the circle.
mercator.getCircleStyle = function (radius, fillColor, borderColor, borderWidth, text, textFillColor) {
    if (!text || !textFillColor) {
        return new Style({
            image: new CircleStyle({
                radius: radius,
                fill: fillColor ? new Fill({ color: fillColor }) : null,
                stroke: new Stroke({
                    color: borderColor,
                    width: borderWidth,
                }),
            }),
        });
    } else {
        return new Style({
            image: new CircleStyle({
                radius: radius,
                fill: fillColor ? new Fill({ color: fillColor }) : null,
                stroke: new Stroke({
                    color: borderColor,
                    width: borderWidth,
                }),
            }),
            text: new Text({
                text: text.toString(),
                fill: new Fill({ color: textFillColor }),
            }),
        });
    }
};

// [Pure] Returns a style object that displays a shape with the
// specified number of points, radius, rotation, fillColor,
// borderColor, and borderWidth. A triangle has 3 points. A square has
// 4 points with rotation pi/4. A star has 5 points.
mercator.getRegularShapeStyle = function (radius, points, rotation, fillColor, borderColor, borderWidth) {
    return new Style({
        image: new RegularShape({
            radius: radius,
            points: points,
            rotation: rotation || 0,
            fill: fillColor ? new Fill({ color: fillColor }) : null,
            stroke: new Stroke({
                color: borderColor,
                width: borderWidth,
            }),
        }),
    });
};

// [Pure] Returns a style object that displays any shape to which it
// is applied wth the specified fillColor, borderColor, and
// borderWidth.
mercator.getPolygonStyle = function (fillColor, borderColor, borderWidth) {
    return new Style({
        fill: fillColor ? new Fill({ color: fillColor }) : null,
        stroke: new Stroke({
            color: borderColor,
            width: borderWidth,
        }),
    });
};

const ceoMapStyles = {
    icon:          mercator.getIconStyle("favicon.ico"),
    ceoIcon:       mercator.getIconStyle("img/ceoicon.png"),
    redPoint:      mercator.getCircleStyle(5, null, "#8b2323", 2),
    bluePoint:     mercator.getCircleStyle(5, null, "#23238b", 2),
    yellowPoint:   mercator.getCircleStyle(5, null, "yellow", 2),
    redCircle:     mercator.getCircleStyle(5, null, "red", 2),
    yellowCircle:  mercator.getCircleStyle(5, null, "yellow", 2),
    greenCircle:   mercator.getCircleStyle(5, null, "green", 2),
    blackCircle:   mercator.getCircleStyle(6, null, "#000000", 2),
    whiteCircle:   mercator.getCircleStyle(6, null, "white", 2),
    redSquare:     mercator.getRegularShapeStyle(6, 4, Math.PI / 4, null, "red", 2),
    yellowSquare:  mercator.getRegularShapeStyle(6, 4, Math.PI / 4, null, "yellow", 2),
    greenSquare:   mercator.getRegularShapeStyle(6, 4, Math.PI / 4, null, "green", 2),
    cluster:       mercator.getCircleStyle(5, "#8b2323", "#ffffff", 1),
    yellowPolygon: mercator.getPolygonStyle(null, "yellow", 3),
    blackPolygon:  mercator.getPolygonStyle(null, "#000000", 3),
    whitePolygon:  mercator.getPolygonStyle(null, "#ffffff", 3),
};

/*****************************************************************************
***
*** Functions to draw project boundaries and plot buffers
***
*****************************************************************************/

// [Side Effects] Adds a new vector layer to the mapConfig's map object.
mercator.addVectorLayer = function (mapConfig, layerTitle, vectorSource, style) {
    const vectorLayer = new VectorLayer({
        title: layerTitle,
        source: vectorSource,
        style: style,
    });
    mapConfig.map.addLayer(vectorLayer);
    return mapConfig;
};

// [Side Effects] Removes the layer with title === layerTitle from
// mapConfig's map object.
mercator.removeLayerByTitle = function (mapConfig, layerTitle) {
    const layer = mercator.getLayerByTitle(mapConfig, layerTitle);
    if (layer) {
        mapConfig.map.removeLayer(layer);
    }
    return mapConfig;
};

// [Pure] Returns a geometry object representing the shape described
// in the passed in GeoJSON string. If reprojectToMap is true,
// reproject the created geometry from WGS84 to Web Mercator before
// returning.
mercator.parseGeoJson = function (geoJson, reprojectToMap) {
    const format = new GeoJSON();
    const geometry = format.readGeometry(geoJson);
    if (reprojectToMap) {
        return geometry.transform("EPSG:4326", "EPSG:3857");
    } else {
        return geometry;
    }
};

// [Pure] Returns a new vector source containing the passed in geometry.
mercator.geometryToVectorSource = function (geometry) {
    return new VectorSource({
        features: [
            new Feature({ geometry: geometry }),
        ],
    });
};

// [Pure] Returns a polygon geometry matching the passed in
// parameters.
mercator.getPlotPolygon = function (center, size, shape) {
    const coords = mercator.parseGeoJson(center, true).getCoordinates();
    const centerX = coords[0];
    const centerY = coords[1];
    const radius = size / 2;
    if (shape === "circle") {
        return new Circle([centerX, centerY], radius);
    } else {
        return fromExtent([centerX - radius,
                           centerY - radius,
                           centerX + radius,
                           centerY + radius]);
    }
};

// [Pure] Returns a bounding box for the plot in Web Mercator as [llx,
// lly, urx, ury].
mercator.getPlotExtent = function (center, size, shape) {
    const geometry = mercator.getPlotPolygon(center, size, shape);
    return transformExtent(geometry.getExtent(), "EPSG:3857", "EPSG:4326");
};

// [Pure] Returns a new vector source containing the passed in plots.
// Features are constructed from each plot using its id and center
// fields.
mercator.plotsToVectorSource = function (plots) {
    const features = plots.map(
        function (plot) {
            const geometry = mercator.parseGeoJson(plot.center, true);
            return new Feature({ plotId: plot.id, geometry: geometry });
        }
    );
    return new VectorSource({ features: features });
};

// [Side Effects] Adds three vector layers to the mapConfig's map
// object: "flaggedPlots" in red, "analyzedPlots" in green, and
// "unanalyzedPlots" in yellow.
mercator.addPlotOverviewLayers = function (mapConfig, plots, shape) {
    mercator.addVectorLayer(mapConfig,
                            "flaggedPlots",
                            mercator.plotsToVectorSource(plots.filter(function (plot) {
                                return plot.flagged === true;
                            })),
                            shape === "circle" ? ceoMapStyles.redCircle : ceoMapStyles.redSquare);
    mercator.addVectorLayer(mapConfig,
                            "analyzedPlots",
                            mercator.plotsToVectorSource(plots.filter(function (plot) {
                                return plot.analyses > 0 && plot.flagged === false;
                            })),
                            shape === "circle" ? ceoMapStyles.greenCircle : ceoMapStyles.greenSquare);
    mercator.addVectorLayer(mapConfig,
                            "unanalyzedPlots",
                            mercator.plotsToVectorSource(plots.filter(function (plot) {
                                return plot.analyses === 0 && plot.flagged === false;
                            })),
                            shape === "circle" ? ceoMapStyles.yellowCircle : ceoMapStyles.yellowSquare);
    return mapConfig;
};

/*****************************************************************************
***
*** Functions to setup select interactions for click and click-and-drag events
***
*****************************************************************************/

// [Pure] Returns the map interaction with title === interactionTitle
// or null if no such interaction exists.
mercator.getInteractionByTitle = function (mapConfig, interactionTitle) {
    return mapConfig.map.getInteractions().getArray().find(
        function (interaction) {
            return interaction.get("title") === interactionTitle;
        }
    );
};

// [Side Effects] Removes the interaction with title === interactionTitle from
// mapConfig's map object.
mercator.removeInteractionByTitle = function (mapConfig, interactionTitle) {
    const interaction = mercator.getInteractionByTitle(mapConfig, interactionTitle);
    if (interaction) {
        mapConfig.map.removeInteraction(interaction);
    }
    return mapConfig;
};

// [Pure] Returns a new click select interaction with title =
// interactionTitle that is associated with the passed in layer. When
// a feature is selected, its style is stored in featureStyles and
// then cleared on the map. When a feature is deselected, its saved
// style is restored on the map.
mercator.makeClickSelect = function (interactionTitle, layer, featureStyles, setSampleId) {
    const select = new Select({ layers: [layer] });
    select.set("title", interactionTitle);
    const action = function (event) {
        setSampleId(event.selected.length === 1 ? event.selected[0].get("sampleId") : -1);
        event.selected.forEach(function (feature) {
            featureStyles[feature.get("sampleId")] = feature.getStyle() !== null ? feature.getStyle() : featureStyles[feature.get("sampleId")];
            feature.setStyle(null);
        });
        event.deselected.forEach(function (feature) {
            feature.setStyle(featureStyles[feature.get("sampleId")]);
        });
    };
    select.on("select", action);
    return select;
};

// [Pure] Returns a new dragBox select interaction with title =
// interactionTitle that is associated with the passed in layer. When
// a feature is selected, its style is stored in featureStyles and
// then cleared on the map. When a feature is deselected, its saved
// style is restored on the map.
mercator.makeDragBoxSelect = function (interactionTitle, layer, featureStyles, selectedFeatures, setSampleId) {
    const dragBox = new DragBox({ condition: platformModifierKeyOnly });
    dragBox.set("title", interactionTitle);
    const boxstartAction = function () {
        selectedFeatures.forEach(function (feature) {
            feature.setStyle(featureStyles[feature.get("sampleId")]);
        });
        selectedFeatures.clear();
    };

    const boxendAction = function () {
        const extent = dragBox.getGeometry().getExtent();
        const saveStyle = function (feature) {
            selectedFeatures.push(feature);
            featureStyles[feature.get("sampleId")] = feature.getStyle() !== null ? feature.getStyle() : featureStyles[feature.get("sampleId")];
            feature.setStyle(null);
            return false;
        };
        layer.getSource().forEachFeatureIntersectingExtent(extent, saveStyle);

        setSampleId(selectedFeatures.getLength() === 1 ? selectedFeatures.getArray()[0].get("sampleId") : -1);
    };
    dragBox.on("boxstart", boxstartAction);
    dragBox.on("boxend", boxendAction);
    return dragBox;
};
// [Side Effects] Adds a click select interaction and a dragBox select
// interaction to mapConfig's map object associated with the layer
// with title === layerTitle.
mercator.enableSelection = function (mapConfig, layerTitle, setSampleId) {
    const layer = mercator.getLayerByTitle(mapConfig, layerTitle);
    const featureStyles = {}; // holds saved styles for features selected by either interaction
    const clickSelect = mercator.makeClickSelect("clickSelect", layer, featureStyles, setSampleId);
    const selectedFeatures = clickSelect.getFeatures();
    const dragBoxSelect = mercator.makeDragBoxSelect("dragBoxSelect", layer, featureStyles, selectedFeatures, setSampleId);
    mapConfig.map.addInteraction(clickSelect);
    mapConfig.map.addInteraction(dragBoxSelect);
    return mapConfig;
};

// [Side Effects] Removes the click select and dragBox select
// interactions from mapConfig's map object.
mercator.disableSelection = function (mapConfig) {
    mercator.removeInteractionByTitle(mapConfig, "clickSelect");
    mercator.removeInteractionByTitle(mapConfig, "dragBoxSelect");
    return mapConfig;
};

/*****************************************************************************
***
*** Functions to draw sample points inside a plot
***
*****************************************************************************/

// [Side Effects] Adds a new vector layer called
// point:<longitude>:<latitude> to mapConfig's map object containing a
// single point geometry feature at the passed in coordinates.
mercator.addPointLayer = function (mapConfig, longitude, latitude) {
    mercator.addVectorLayer(mapConfig,
                            "point:" + longitude + ":" + latitude,
                            mercator.geometryToVectorSource(new Point(mercator.reprojectToMap(longitude, latitude))),
                            ceoMapStyles.redPoint);
    return mapConfig;
};

// [Pure] Returns a new vector source containing the passed in
// samples. Features are constructed from each sample using its id,
// point, and geom fields.
mercator.samplesToVectorSource = function (samples) {
    const features = samples.map(
        function (sample) {
            return new Feature({
                sampleId: sample.id,
                geometry: mercator.parseGeoJson(sample.geom || sample.point, true),
                shape: sample.geom ? "polygon" : "point",
            });
        }
    );
    return new VectorSource({ features: features });
};

// [Pure] Returns an ol.Collection containing the features selected by
// the currently enabled click select and dragBox select interactions.
mercator.getSelectedSamples = function (mapConfig) {
    const clickSelect = mercator.getInteractionByTitle(mapConfig, "clickSelect");
    if (clickSelect) {
        return clickSelect.getFeatures();
    } else {
        return null;
    }
};

mercator.getAllFeatures = function (mapConfig, layerTitle) {
    const layer = mercator.getLayerByTitle(mapConfig, layerTitle);
    if (layer) {
        return layer.getSource().getFeatures();
    } else {
        return null;
    }
};

// [Side Effects] Sets the sample's style to be a circle with a black
// border and filled with the passed in color. If color is null, the
// circle will be filled with gray.
mercator.highlightSampleGeometry = function (sample, color) {
    if (sample.get("shape") === "point") {
        sample.setStyle(mercator.getCircleStyle(6, color, color, 2));
    } else {
        sample.setStyle(mercator.getPolygonStyle(null, color, 6));
    }
    return sample;
};

/*****************************************************************************
***
*** Bounding Box Selector for Admin Page
***
*****************************************************************************/

// [Pure] Returns a new dragBox draw interaction with title =
// interactionTitle that is associated with the passed in layer. When
// a new box is dragged on the map, any previous dragBox polygons are
// removed, and the current box is added to the map layer as a new
// feature. If a callBack function is provided, it will be called
// after the new box is added to the map layer.
mercator.makeDragBoxDraw = function (interactionTitle, layer, callBack) {
    const dragBox = new DragBox({
        title: interactionTitle,
        condition: platformModifierKeyOnly,
    });
    const boxendAction = function () {
        layer.getSource().clear();
        layer.getSource().addFeature(new Feature({ geometry: dragBox.getGeometry() }));
        if (callBack != null) {
            callBack.call(null, dragBox);
        }
    };
    dragBox.set("title", interactionTitle);
    dragBox.on("boxend", boxendAction);
    return dragBox;
};

// [Side Effects] Adds a dragBox draw interaction to mapConfig's map
// object associated with a newly created empty vector layer called
// "dragBoxLayer".
mercator.enableDragBoxDraw = function (mapConfig, callBack) {
    const drawLayer = new VectorLayer({
        title: "dragBoxLayer",
        source: new VectorSource({ features: [] }),
        style: ceoMapStyles.yellowPolygon,
    });
    const dragBox = mercator.makeDragBoxDraw("dragBoxDraw", drawLayer, callBack);
    mapConfig.map.addLayer(drawLayer);
    mapConfig.map.addInteraction(dragBox);
    return mapConfig;
};

// [Side Effects] Removes the dragBox draw interaction and its
// associated layer from mapConfig's map object.
mercator.disableDragBoxDraw = function (mapConfig) {
    mercator.removeInteractionByTitle(mapConfig, "dragBoxDraw");
    mercator.removeLayerByTitle(mapConfig, "dragBoxLayer");
    return mapConfig;
};

// [Pure] Returns the extent of the rectangle drawn by the passed-in
// dragBox in lat/lon coords (EPSG:4326).
mercator.getDragBoxExtent = function (dragBox) {
    return dragBox.getGeometry().clone().transform("EPSG:3857", "EPSG:4326").getExtent();
};

/*****************************************************************************
***
*** Functions to draw project markers on an overview map
***
*****************************************************************************/

// [Side Effects] Adds a new empty overlay to mapConfig's map object
// with id set to overlayTitle.
mercator.addOverlay = function (mapConfig, overlayTitle, element) {
    const overlay = new Overlay({
        id: overlayTitle,
        element: element,
    });//?element:document.createElement("div")});
    mapConfig.map.addOverlay(overlay);
    return mapConfig;
};

// [Pure] Returns the map overlay with id === overlayTitle or null if
// no such overlay exists.
mercator.getOverlayByTitle = function (mapConfig, overlayTitle) {
    return mapConfig.map.getOverlayById(overlayTitle);
};

// [Pure] Returns a new ol.source.Cluster given the unclusteredSource and clusterDistance.
mercator.makeClusterSource = function (unclusteredSource, clusterDistance) {
    return new Cluster({
        source: unclusteredSource,
        distance: clusterDistance,
    });
};

// [Pure] Returns true if the feature is a cluster, false otherwise.
mercator.isCluster = function (feature) {
    return feature && feature.get("features") && feature.get("features").length > 0;
};

// [Pure] Returns the minimum extent that bounds all of the
// subfeatures in the passed in clusterFeature.
mercator.getClusterExtent = function (clusterFeature) {
    const clusterPoints = clusterFeature.get("features").map(
        function (subFeature) {
            return subFeature.getGeometry().getCoordinates();
        }
    );
    return (new LineString(clusterPoints)).getExtent();
};

// [Pure] Returns a new vector source containing points for each of
// the centers of the passed in projects. Features are constructed
// from each project using its id, name, description, and numPlots
// fields.
mercator.projectsToVectorSource = function (projects) {
    const features = projects.map(
        function (project) {
            const bounds = mercator.parseGeoJson(project.boundary, false).getExtent();
            const minX = bounds[0];
            const minY = bounds[1];
            const maxX = bounds[2];
            const maxY = bounds[3];
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const geometry = new Point([centerX, centerY]).transform("EPSG:4326", "EPSG:3857");
            return new Feature({
                geometry:    geometry,
                projectId:   project.id,
                name:        project.name,
                description: project.description,
                numPlots:    project.numPlots,
            });
        }
    );
    return new VectorSource({ features: features });
};

// [Side Effects] Adds a new vector layer called "currentPlots" to
// mapConfig's map object that clusters the passed in plots. Clicking
// on clusters with more than one plot zooms the map view to the
// extent covered by these plots. If a cluster only contains one plot,
// the callBack function will be called on the cluster feature.
mercator.addPlotLayer = function (mapConfig, plots, callBack) {
    const plotSource = mercator.plotsToVectorSource(plots);
    const clusterSource = new Cluster({
        source:   plotSource,
        distance: 40,
    });

    mercator.addVectorLayer(mapConfig,
                            "currentPlots",
                            clusterSource,
                            function (feature) {
                                const numPlots = feature.get("features").length;
                                return mercator.getCircleStyle(10, "#3399cc", "#ffffff", 1, numPlots, "#ffffff");
                            });

    const clickHandler = function (event) {
        mapConfig.map.forEachFeatureAtPixel(event.pixel,
                                            function (feature) {
                                                if (mercator.isCluster(feature)) {
                                                    if (feature.get("features").length > 1) {
                                                        mercator.zoomMapToExtent(mapConfig,
                                                                                 mercator.getClusterExtent(feature));
                                                    } else {
                                                        mercator.removeLayerByTitle(mapConfig, "currentPlots");
                                                        mapConfig.map.un("click", clickHandler);
                                                        callBack.call(null, feature);
                                                    }
                                                }
                                            }, { hitTolerance:10 });
    };
    mapConfig.map.on("click", clickHandler);

    return mapConfig;
};

/*****************************************************************************
***
*** Functions to export plot and sample features as KML
***
*****************************************************************************/

mercator.asPolygonFeature = function (feature) {
    return feature.getGeometry().getType() === "Circle"
        ? new Feature({ geometry: fromCircle(feature.getGeometry()) })
        : feature;
};

mercator.getKMLFromFeatures = function (features) {
    return (new KML()).writeFeatures(features, { featureProjection: "EPSG:3857" });
};

/*****************************************************************************
***
*** FIXMEs
***
*****************************************************************************/
//
// FIXME: Move ceoMapStyles out of Mercator.js
// FIXME: change calls from remove_plot_layer to mercator.removeLayerByTitle(mapConfig, layerTitle)
// FIXME: change calls from draw_polygon to:
//        mercator.removeLayerByTitle(mapConfig, "currentAOI");
//        mercator.addVectorLayer(mapConfig,
//                                "currentAOI",
//                                mercator.geometryToVectorSource(mercator.parseGeoJson(polygon, true)),
//                                ceoMapStyles.yellowPolygon);
//        mercator.zoomMapToLayer(mapConfig, "currentAOI");
// FIXME: change calls from polygon_extent to mercator.parseGeoJson(polygon, false).getExtent()
// FIXME: change calls from get_plot_extent to mercator.getPlotExtent
// FIXME: change calls from draw_plot to:
//        mercator.removeLayerByTitle(mapConfig, "currentPlot");
//        mercator.addVectorLayer(mapConfig,
//                                "currentPlot",
//                                mercator.geometryToVectorSource(mercator.getPlotPolygon(center, size, shape)),
//                                ceoMapStyles.yellowPolygon);
//        mercator.zoomMapToLayer(mapConfig, "currentPlot");
// FIXME: change calls from draw_plots to mercator.addPlotOverviewLayers
// FIXME: for plots shown with draw_plots, change references to their plot_id field to plotId
// FIXME: change calls from enable_selection to mercator.enableSelection
// FIXME: change calls from disable_selection to mercator.disableSelection
// FIXME: change calls from remove_sample_layer to mercator.removeLayerByTitle(mapConfig, "currentSamples");
// FIXME: change calls from remove_plots_layer to mercator.removeLayerByTitle(mapConfig, "currentPlots");
// FIXME: change calls from draw_points to:
//        mercator.disableSelection(mapConfig);
//        mercator.removeLayerByTitle(mapConfig, "currentSamples");
//        mercator.addVectorLayer(mapConfig,
//                                "currentSamples",
//                                mercator.samplesToVectorSource(samples),
//                                ceoMapStyles.redPoint);
//        mercator.enableSelection(mapConfig, "currentSamples");
//        mercator.zoomMapToLayer(mapConfig, "currentSamples");
// FIXME: change references for points created with draw_points from sample_id to sampleId
// FIXME: change calls from get_selected_samples to mercator.getSelectedSamples
// FIXME: change calls from highlight_sample to mercator.highlightSampleGeometry
// FIXME: change calls from enable_dragbox_draw to enableDragBoxDraw(mapConfig, displayDragBoxBounds)
// FIXME: change calls from disable_dragbox_draw to disableDragBoxDraw
// FIXME: change calls from draw_project_points to:
//        mercator.removeLayerByTitle(mapConfig, "currentPlots");
//        mercator.addPlotLayer(mapConfig, plots);

export {
    mercator,
    ceoMapStyles,
};

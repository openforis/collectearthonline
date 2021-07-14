import "../css/geo-dash.css";

import React from "react";
import ReactDOM from "react-dom";
import _ from "lodash";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import {Feature, Map, View} from "ol";
import {buffer as ExtentBuffer} from "ol/extent";
import {Circle, Polygon, Point} from "ol/geom";
import {Tile as TileLayer, Vector as VectorLayer} from "ol/layer";
import {transform as projTransform} from "ol/proj";
import {Vector, XYZ} from "ol/source";
import {Style, Stroke} from "ol/style";
import {getArea as sphereGetArea} from "ol/sphere";

import {mercator} from "./utils/mercator";
import {UnicodeIcon, formatDateISO} from "./utils/generalUtils";
import {GeoDashNavigationBar} from "./components/PageComponents";

function getGatewayPath(widget, collectionName) {
    const fts = {
        "LANDSAT5": "Landsat5Filtered",
        "LANDSAT7": "Landsat7Filtered",
        "LANDSAT8": "Landsat8Filtered",
        "Sentinel2": "FilteredSentinel"
    };
    return (widget.filterType && widget.filterType.length > 0)
        ? fts[widget.filterType]
        : (widget.ImageAsset && widget.ImageAsset.length > 0)
            ? "image"
            : (widget.ImageCollectionAsset && widget.ImageCollectionAsset.length > 0)
                ? "ImageCollectionAsset"
                : (widget.featureCollection && widget.featureCollection.length > 0)
                    ? "getTileUrlFromFeatureCollection"
                    : (widget.properties && widget.properties[0] === "ImageCollectionCustom")
                        ? "meanImageByMosaicCollections"
                        : (collectionName.trim().length > 0)
                            ? "cloudMaskImageByMosaicCollection"
                            : "ImageCollectionbyIndex";
}

class Geodash extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            widgets: [],
            callbackComplete: false,
            left: 0,
            ptop: 0,
            institutionId: this.getParameterByName("institutionId") ? this.getParameterByName("institutionId") : "3",
            projAOI: this.getParameterByName("aoi"),
            projPairAOI: "",
            projectId: this.getParameterByName("projectId"),
            mapCenter:null,
            mapZoom:null,
            imageryList:[],
            initCenter:null,
            initZoom:null,
            vectorSource: null
        };
        const theSplit = decodeURI(this.state.projAOI)
            .replace("[", "")
            .replace("]", "")
            .split(",");
        this.state.projPairAOI = "[["
            + theSplit[0] + ","
            + theSplit[1] + "],["
            + theSplit[2] + ","
            + theSplit[1] + "],["
            + theSplit[2] + ","
            + theSplit[3] + "],["
            + theSplit[0] + ","
            + theSplit[3] + "],["
            + theSplit[0] + ","
            + theSplit[1] + "]]";
    }

    componentDidMount() {
        Promise.all([this.getInstitutionImagery(), this.getWidgetsByProjectId(), this.getVectorSource()])
            .then(data => this.setState({widgets: data[1], vectorSource: data[2], callbackComplete: true}))
            .catch(response => {
                console.log(response);
                alert("Error initializing Geo-Dash. See console for details.");
            });
    }

    getInstitutionImagery = () => fetch(`/get-institution-imagery?institutionId=${this.state.institutionId}`)
        .then(response => (response.ok ? response.json() : Promise.reject(response)))
        .then(data => this.setState({imageryList: data}));

    getWidgetsByProjectId = () => fetch(`/geo-dash/get-by-projid?projectId=${this.state.projectId}`)
        .then(response => (response.ok ? response.json() : Promise.reject(response)))
        .then(data => data.widgets.map(widget => {
            widget.isFull = false;
            widget.opacity = 0.9;
            widget.sliderType = widget.swipeAsDefault ? "swipe" : "opacity";
            widget.swipeValue = 1.0;
            return widget;
        }));

    getVectorSource = () => {
        const plotShape = this.getParameterByName("plotShape");
        const radius = this.getParameterByName("bradius");
        const center = this.getParameterByName("bcenter");
        const plotId = this.getParameterByName("plotId");
        if (plotShape === "polygon") {
            return fetch(`/get-plot-sample-geom?plotId=${plotId}`)
                .then(response => (response.ok ? response.json() : Promise.reject(response)))
                .then(plotJsonObject => {
                    const features = [plotJsonObject.plotGeom, ...(plotJsonObject.sampleGeoms || [])]
                        .filter(e => e)
                        .map(geom => new Feature({geometry: mercator.parseGeoJson(geom, true)}));
                    return Promise.resolve(new Vector({features}));
                });
        } else if (plotShape === "square") {
            const pointFeature = new Feature(
                new Point(projTransform(JSON.parse(center).coordinates, "EPSG:4326", "EPSG:3857"))
            );
            const pointExtent = pointFeature.getGeometry().getExtent();
            const bufferedExtent = new ExtentBuffer(pointExtent, parseInt(radius));
            return Promise.resolve(new Vector({
                features: [new Feature(new Polygon(
                    [[[bufferedExtent[0], bufferedExtent[1]],
                      [bufferedExtent[0], bufferedExtent[3]],
                      [bufferedExtent[2], bufferedExtent[3]],
                      [bufferedExtent[2], bufferedExtent[1]],
                      [bufferedExtent[0], bufferedExtent[1]]]]
                ))]
            }));
        } else if (plotShape === "circle") {
            return Promise.resolve(new Vector({
                features: [new Feature(new Circle(
                    projTransform(JSON.parse(center).coordinates, "EPSG:4326", "EPSG:3857"), radius
                ))]
            }));
        } else {
            return Promise.resolve(new Vector({features: []}));
        }
    };

    getParameterByName = (name, url) => {
        const regex = new RegExp("[?&]" + name.replace(/[[\]]/g, "\\$&") + "(=([^&#]*)|&|#|$)");
        const results = regex.exec(decodeURIComponent(url || window.location.href));
        return results
            ? results[2]
                ? decodeURIComponent(results[2].replace(/\+/g, " "))
                : ""
            : null;
    };

    handleFullScreen = widget => {
        const widgets = [...this.state.widgets];
        const index = widgets.indexOf(widget);
        widgets[index] = {...widget};
        widgets[index].isFull = !widgets[index].isFull;
        this.setState(
            {widgets},
            () => this.updateSize(widget)
        );
    };

    handleSliderChange = widget => {
        const widgets = [...this.state.widgets];
        const index = widgets.indexOf(widget);
        widgets[index] = {...widget};
        widgets[index].sliderType = widgets[index].sliderType === "opacity" ? "swipe" : "opacity";
        this.setState({widgets});
    };

    handleSwipeChange = (widget, evt) => {
        const widgets = [...this.state.widgets];
        const index = widgets.indexOf(widget);
        widgets[index] = {...widget, swipeValue: Number(evt.target.value)};
        this.setState({widgets});
    };

    setCenterAndZoom = (center, zoom) => {
        if (this.state.initCenter) {
            this.setState({
                mapCenter:center,
                mapZoom:zoom
            });
        } else {
            this.setState({
                initCenter:center,
                initZoom:zoom,
                mapCenter:center,
                mapZoom:zoom
            });
        }
    };

    resetCenterAndZoom = () => {
        this.setCenterAndZoom(this.state.initCenter, this.state.initZoom);
    };

    updateSize = which => {
        if (which.isFull) {
            document.body.classList.remove("bodyfull");
        } else {
            document.body.classList.add("bodyfull");
        }
        const doc = document.documentElement;
        if ((window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0) === 0 && (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0) === 0) {
            window.scrollTo(this.state.left, this.state.ptop);
            this.setState({left: 0, ptop: 0});
        } else {
            this.setState({left: (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0), ptop: (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0)});
            window.scrollTo(0, 0);
        }
    };

    render() {
        return (
            <div className="container-fluid">
                <Widgets
                    callbackComplete={this.state.callbackComplete}
                    getParameterByName={this.getParameterByName}
                    imageryList={this.state.imageryList}
                    initCenter={this.mapCenter}
                    mapCenter={this.state.mapCenter}
                    mapZoom={this.state.mapZoom}
                    onFullScreen={this.handleFullScreen}
                    onSliderChange={this.handleSliderChange}
                    onSwipeChange={this.handleSwipeChange}
                    projAOI={this.state.projAOI}
                    projPairAOI={this.state.projPairAOI}
                    resetCenterAndZoom={this.resetCenterAndZoom}
                    setCenterAndZoom={this.setCenterAndZoom}
                    vectorSource={this.state.vectorSource}
                    widgets={this.state.widgets}
                />
            </div>
        );
    }
}

const Widgets = props => {
    if (props.widgets.length > 0) {
        return (
            <div className="row placeholders">
                {props.widgets.map(widget => (
                    <Widget
                        key={widget.id}
                        getParameterByName={props.getParameterByName}
                        id={widget.id}
                        imageryList={props.imageryList}
                        initCenter={props.initCenter}
                        mapCenter={props.mapCenter}
                        mapZoom={props.mapZoom}
                        onFullScreen={props.onFullScreen}
                        onSliderChange={props.onSliderChange}
                        onSwipeChange={props.onSwipeChange}
                        projAOI={props.projAOI}
                        projPairAOI={props.projPairAOI}
                        resetCenterAndZoom={props.resetCenterAndZoom}
                        setCenterAndZoom={props.setCenterAndZoom}
                        vectorSource={props.vectorSource}
                        widget={widget}
                    />
                ))}
            </div>
        );
    } else {
        return (
            <div className="row placeholders">
                <div className="placeholder columnSpan3 rowSpan2" style={{gridArea: "1 / 1 / span 2 / span 12"}}>
                    <h1 id="noWidgetMessage">
                        {props.callbackComplete
                            ? "The Administrator has not configured any Geo-Dash Widgets for this project"
                            : "Retrieving Geo-Dash configuration for this project"}
                    </h1>
                </div>
            </div>
        );
    }
};

class Widget extends React.Component {
    constructor(props) {
        super(props);
        this.imageCollectionList = ["ImageElevation",
                                    "ImageCollectionCustom",
                                    "addImageCollection",
                                    "ndviImageCollection",
                                    "ImageCollectionNDVI",
                                    "ImageCollectionEVI",
                                    "ImageCollectionEVI2",
                                    "ImageCollectionNDWI",
                                    "ImageCollectionNDMI",
                                    "ImageCollectionLANDSAT5",
                                    "ImageCollectionLANDSAT7",
                                    "ImageCollectionLANDSAT8",
                                    "ImageCollectionSentinel2"];
        this.graphControlList = ["customTimeSeries",
                                 "timeSeriesGraph",
                                 "ndviTimeSeries",
                                 "ndwiTimeSeries",
                                 "eviTimeSeries",
                                 "evi2TimeSeries",
                                 "ndmiTimeSeries",
                                 "mekong_tc_l_c"];
    }

    generateGridColumn = (x, w) => (x + 1) + " / span " + w;

    generateGridRow = (y, h) => (y + 1) + " / span " + h;

    getWidgetHtml = (widget, onSliderChange, onSwipeChange) => (
        <div
            className={`placeholder columnSpan3 rowSpan${widget.layout.h} ${widget.isFull && "fullwidget"}`}
            style={{
                gridColumn: this.generateGridColumn(widget.layout.x, widget.layout.w),
                gridRow: this.generateGridRow(widget.layout.y, widget.layout.h)
            }}
        >
            {this.getCommonWidgetLayout(widget, onSliderChange, onSwipeChange)}
        </div>
    );

    getCommonWidgetLayout = (widget, onSliderChange, onSwipeChange) => (
        <div className="panel panel-default" id={"widget_" + widget.id}>
            <div className="panel-heading">
                <ul className="list-inline panel-actions pull-right">
                    <li style={{display: "inline"}}>{widget.name}</li>
                    <li style={{display: "inline"}}>
                        <button
                            className="list-inline panel-actions panel-fullscreen"
                            onClick={() => this.props.onFullScreen(this.props.widget)}
                            style={{color: "#31BAB0"}}
                            title="Toggle Fullscreen"
                            type="button"
                        >
                            {widget.isFull ? <UnicodeIcon icon="collapse"/> : <UnicodeIcon icon="expand"/>}
                        </button>
                    </li>
                    {this.getResetMapButton(widget)}
                </ul>
            </div>
            <div className="widget-container" id={"widget-container_" + widget.id}>
                {this.getWidgetInnerHtml(widget, onSliderChange, onSwipeChange)}
            </div>
        </div>
    );

    getResetMapButton = widget => {
        if (this.isMapWidget(widget)) {
            return (
                <li style={{display: "inline"}}>
                    <button
                        className="list-inline panel-actions panel-fullscreen"
                        onClick={() => this.props.resetCenterAndZoom()}
                        style={{marginRight: "10px"}}
                        title="Recenter"
                        type="button"
                    >
                        <img alt="Collect Earth Online" src="img/geodash/ceoicon.png"/>
                    </button>
                </li>
            );
        }
    };

    getWidgetInnerHtml = (widget, onSliderChange, onSwipeChange) => {
        if (this.isMapWidget(widget)) {
            return (
                <div className="front">
                    <MapWidget
                        getParameterByName={this.props.getParameterByName}
                        imageryList={this.props.imageryList}
                        mapCenter={this.props.mapCenter}
                        mapZoom={this.props.mapZoom}
                        onSliderChange={onSliderChange}
                        onSwipeChange={onSwipeChange}
                        projAOI={this.props.projAOI}
                        projPairAOI={this.props.projPairAOI}
                        resetCenterAndZoom={this.props.resetCenterAndZoom}
                        setCenterAndZoom={this.props.setCenterAndZoom}
                        syncMapWidgets={this.syncMapWidgets}
                        vectorSource={this.props.vectorSource}
                        widget={widget}
                    />
                </div>
            );
        } else if (this.graphControlList.includes(widget.properties[0])) {
            return (
                <div className="front">
                    <GraphWidget
                        getParameterByName={this.props.getParameterByName}
                        initCenter={this.props.initCenter}
                        projPairAOI={this.props.projPairAOI}
                        widget={widget}
                    />
                </div>
            );
        } else if (widget.properties[0] === "getStats") {
            return (
                <div className="front">
                    <StatsWidget
                        projPairAOI={this.props.projPairAOI}
                        widget={widget}
                    />
                </div>
            );
        } else if (widget.properties[0] === "DegradationTool") {
            return (
                <div className="front">
                    <DegradationWidget
                        getParameterByName={this.props.getParameterByName}
                        imageryList={this.props.imageryList}
                        initCenter={this.props.initCenter}
                        mapCenter={this.props.mapCenter}
                        mapZoom={this.props.mapZoom}
                        onSliderChange={onSliderChange}
                        onSwipeChange={onSwipeChange}
                        projAOI={this.props.projAOI}
                        projPairAOI={this.props.projPairAOI}
                        resetCenterAndZoom={this.props.resetCenterAndZoom}
                        setCenterAndZoom={this.props.setCenterAndZoom}
                        syncMapWidgets={this.syncMapWidgets}
                        vectorSource={this.props.vectorSource}
                        widget={widget}
                    />
                </div>
            );
        } else {
            return (
                <img
                    alt="Blank Widget"
                    className="img-responsive"
                    height="200"
                    src="data:image/gif;base64,R0lGODlhAQABAIAAAHd3dwAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=="
                    width="200"
                />
            );
        }
    };

    isMapWidget = widget => this.imageCollectionList.includes(widget.properties[0])
        || (widget.dualImageCollection)
        || (widget.ImageAsset && widget.ImageAsset.length > 0)
        || (widget.ImageCollectionAsset && widget.ImageCollectionAsset.length > 0)
        || (widget.featureCollection && widget.featureCollection.length > 0);

    render() {
        const {widget} = this.props;
        // TODO this probably can be return this.getWidgetHtml()
        return (
            <>
                {this.getWidgetHtml(widget, this.props.onSliderChange, this.props.onSwipeChange)}
            </>
        );
    }
}

class DegradationWidget extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedDate: "",
            degDataType: "landsat"
        };
    }

    handleDegDataType = dataType => {
        this.setState({
            degDataType: dataType
        });
    };

    handleSelectDate = date => {
        this.setState({selectedDate: date});
    };

    render() {
        return (
            <div id={"degradation_" + this.props.widget.id} style={{width: "100%", minHeight: "200px"}}>
                <div
                    style={{
                        display: "table",
                        position: "absolute",
                        width: "100%",
                        height: "calc(100% - 45px)"
                    }}
                >
                    <div style={{display: "table-row", height: "65%"}}>
                        <div style={{display: "table-cell", position: "relative"}}>
                            <div className="front">
                                <MapWidget
                                    degDataType={this.state.degDataType}
                                    getParameterByName={this.props.getParameterByName}
                                    handleDegDataType={this.handleDegDataType}
                                    imageryList={this.props.imageryList}
                                    isDegradation
                                    mapCenter={this.props.mapCenter}
                                    mapZoom={this.props.mapZoom}
                                    onSliderChange={this.props.onSliderChange}
                                    onSwipeChange={this.props.onSwipeChange}
                                    projAOI={this.props.projAOI}
                                    projPairAOI={this.props.projPairAOI}
                                    resetCenterAndZoom={this.props.resetCenterAndZoom}
                                    selectedDate={this.state.selectedDate}
                                    setCenterAndZoom={this.props.setCenterAndZoom}
                                    syncMapWidgets={this.syncMapWidgets}
                                    vectorSource={this.props.vectorSource}
                                    widget={this.props.widget}
                                />
                            </div>
                        </div>
                    </div>
                    <div style={{display: "table-row"}}>
                        <div style={{display: "table-cell", position: "relative"}}>
                            <div className="front">
                                <GraphWidget
                                    degDataType={this.state.degDataType}
                                    getParameterByName={this.props.getParameterByName}
                                    handleSelectDate={this.handleSelectDate}
                                    initCenter={this.props.initCenter}
                                    projPairAOI={this.props.projPairAOI}
                                    widget={this.props.widget}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

class MapWidget extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            mapRef: null,
            opacity: 0.9, // FIXME, opacity is being kept separately here even though it is also part of widget
            geeTimeOut: null,
            stretch: 321
        };
    }

    componentDidMount() {
        const {projPairAOI, widget} = this.props;
        let {projAOI} = this.props;

        const {sourceConfig, id, attribution} = this.props.imageryList.find(imagery =>
            imagery.id === widget.basemapId) || this.props.imageryList[0];
        const basemapLayer = new TileLayer({
            source: mercator.createSource(sourceConfig, id, attribution)
        });
        const plotSampleLayer = new VectorLayer({
            source: this.props.vectorSource,
            style: new Style({
                stroke: new Stroke({
                    color: "yellow",
                    width: 3
                }),
                fill: null
            }),
            zIndex: 100
        });

        const mapdiv = "widgetmap_" + widget.id;
        const map = new Map({
            layers: [basemapLayer, plotSampleLayer],
            target: mapdiv,
            view: new View({
                center: [0, 0],
                projection: "EPSG:3857",
                zoom: 4
            }),
            id: "widgetmapobject_" + widget.id
        });
        map.getView().on("propertychange", onpropertychange);

        function onpropertychange() {
            map.dispatchEvent("movestart");
            const view = map.getView();
            view.un("propertychange", onpropertychange);
            map.on("moveend", () => {
                view.on("propertychange", onpropertychange);
            });
        }

        map.on("movestart", this.pauseGeeLayer);
        map.on("moveend", e => {
            this.props.setCenterAndZoom(e.map.getView().getCenter(), e.map.getView().getZoom());
            this.resumeGeeLayer(e);
        });

        if (projAOI === "") {
            projAOI = [-108.30322265625, 21.33544921875, -105.347900390625, 23.53271484375];
        } else if (typeof projAOI === "string") {
            projAOI = JSON.parse(projAOI);
        }
        map.getView().fit(
            projTransform(
                [projAOI[0], projAOI[1]], "EPSG:4326", "EPSG:3857"
            ).concat(projTransform(
                [projAOI[2], projAOI[3]], "EPSG:4326", "EPSG:3857"
            )),
            map.getSize()
        );

        if (!this.props.mapCenter) {
            this.props.setCenterAndZoom(map.getView().getCenter(), map.getView().getZoom());
        }

        this.setState({
            mapRef: map
        });

        const postObject = {};
        let collectionName = "";
        let dateFrom = "";
        let dateTo = "";
        let requestedIndex = "";
        let url = "";
        let path = "";
        let dualImageObject = null;
        let bands = "";
        if (widget.properties.length === 5) {
            bands = widget.properties[4];
        }
        widget.bands = bands;

        if (widget.properties[0] === "DegradationTool") {
            postObject.imageDate = this.props.selectedDate;
            postObject.stretch = this.props.degDataType && this.props.degDataType === "landsat"
                ? this.state.stretch
                : "SAR";
            path = "getDegraditionTileUrl";
        } else if (widget.dualImageCollection) {
            const firstImage = widget.dualImageCollection[0];
            const secondImage = widget.dualImageCollection[1];
            collectionName = firstImage.collectionType;
            requestedIndex = this.getRequestedIndex(collectionName);
            collectionName = this.convertCollectionName(collectionName);

            dateFrom = firstImage.startDate;
            dateTo = firstImage.endDate;
            const shortWidget = {};
            shortWidget.filterType = firstImage.filterType;
            shortWidget.properties = [];
            shortWidget.properties.push(collectionName);
            shortWidget.ImageAsset = firstImage.imageAsset;
            shortWidget.ImageCollectionAsset = firstImage.ImageCollectionAsset;
            url = "/geo-dash/gateway-request";
            path = getGatewayPath(shortWidget, collectionName);
            shortWidget.visParams = firstImage.visParams;
            shortWidget.min = firstImage.min != null ? firstImage.min : "";
            shortWidget.max = firstImage.max != null ? firstImage.max : "";
            shortWidget.band = firstImage.band != null ? firstImage.band : "";
            postObject.visParams = this.getImageParams(shortWidget);

            if (postObject.visParams.cloudLessThan) {
                postObject.bands = postObject.visParams.bands;
                postObject.min = postObject.visParams.min;
                postObject.max = postObject.visParams.max;
                postObject.cloudLessThan = parseInt(postObject.visParams.cloudLessThan);
            }
            // Create the fetch object for the second call here
            dualImageObject = {};
            dualImageObject.collectionName = secondImage.collectionType;
            dualImageObject.index = this.getRequestedIndex(dualImageObject.collectionName);
            dualImageObject.collectionName = this.convertCollectionName(dualImageObject.collectionName);
            dualImageObject.dateFrom = secondImage.startDate;
            dualImageObject.dateTo = secondImage.endDate;
            dualImageObject.geometry = JSON.parse(projPairAOI);

            const shortWidget2 = {};
            shortWidget2.filterType = secondImage.filterType;
            shortWidget2.properties = [];
            shortWidget2.properties.push(dualImageObject.collectionName);
            shortWidget2.ImageAsset = secondImage.imageAsset;
            shortWidget2.ImageCollectionAsset = secondImage.ImageCollectionAsset;
            dualImageObject.url = "/geo-dash/gateway-request";
            dualImageObject.path = getGatewayPath(shortWidget2, dualImageObject.collectionName);
            shortWidget2.visParams = secondImage.visParams;
            shortWidget2.min = secondImage.min != null ? secondImage.min : "";
            shortWidget2.max = secondImage.max != null ? secondImage.max : "";
            shortWidget2.band = secondImage.band != null ? secondImage.band : "";
            if (shortWidget2.visParams && shortWidget2.visParams.cloudLessThan != null) {
                dualImageObject.bands = shortWidget2.visParams.bands;
                dualImageObject.min = shortWidget2.visParams.min;
                dualImageObject.max = shortWidget2.visParams.max;
                dualImageObject.cloudLessThan = parseInt(shortWidget2.visParams.cloudLessThan);
            }

            dualImageObject.visParams = this.getImageParams(shortWidget2);
            // work on image asset here there will be a variable imageAsset in the dualImageCollection in which case we should call the gateway /image with imageParams
            if (firstImage.imageAsset) {
                postObject.ImageAsset = firstImage.imageAsset;
                postObject.imageName = firstImage.imageAsset;
                postObject.visParams = firstImage.visParams;
            }
            if (secondImage.imageAsset) {
                dualImageObject.ImageAsset = secondImage.imageAsset;
                dualImageObject.imageName = secondImage.imageAsset;
                dualImageObject.visParams = secondImage.visParams;
            }
            if (firstImage.ImageCollectionAsset) {
                postObject.ImageCollectionAsset = firstImage.ImageCollectionAsset;
                postObject.imageName = firstImage.ImageCollectionAsset;
                postObject.visParams = firstImage.visParams;
            }
            if (secondImage.ImageCollectionAsset) {
                dualImageObject.ImageCollectionAsset = secondImage.ImageCollectionAsset;
                dualImageObject.imageName = secondImage.ImageCollectionAsset;
                dualImageObject.visParams = secondImage.visParams;
            }
        } else {
            collectionName = widget.properties[1];
            dateFrom = widget.properties[2].trim() ? widget.properties[2].trim() : widget.startDate;
            dateTo = widget.properties[3].trim() ? widget.properties[3].trim() : widget.endDate;
            requestedIndex = this.getRequestedIndex(widget.properties[0]);
            if (widget.properties[0] === "ImageElevation") {
                widget.ImageAsset = "USGS/SRTMGL1_003";
            }
            url = "/geo-dash/gateway-request";
            path = getGatewayPath(widget, collectionName);
            postObject.visParams = this.getImageParams(widget);
            postObject.featureCollection = widget.featureCollection;
            postObject.matchID = this.props.getParameterByName("visiblePlotId");
            postObject.field = widget.field;

            if (postObject.visParams.cloudLessThan) {
                postObject.bands = postObject.visParams.bands;
                postObject.min = postObject.visParams.min;
                postObject.max = postObject.visParams.max;
                postObject.cloudLessThan = parseInt(postObject.visParams.cloudLessThan);
            }
            if (widget.ImageAsset) {
                postObject.imageName = widget.ImageAsset;
                postObject.ImageAsset = widget.ImageAsset;
            } else if (widget.ImageCollectionAsset) {
                postObject.ImageCollectionAsset = widget.ImageCollectionAsset;
                postObject.imageName = widget.ImageCollectionAsset;
            }
        }

        postObject.collectionName = collectionName;
        postObject.dateFrom = dateFrom;
        postObject.dateTo = dateTo;
        postObject.geometry = JSON.parse(projPairAOI);
        postObject.index = requestedIndex;
        postObject.path = path;
        // see if we need to fetch or just add the tile server
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - 1);
        if (typeof (Storage) !== "undefined"
            && (this.checkForCache(postObject, widget, false)
                || (widget.dualImageCollection && dualImageObject && this.checkForCache(dualImageObject, widget, true)))) {
            this.fetchMapInfo(postObject, url, widget, dualImageObject);
        }
        window.addEventListener("resize", this.handleResize);
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.widget.isFull !== prevProps.widget.isFull) {
            this.state.mapRef.updateSize();
        }

        if (this.props.mapCenter !== prevProps.mapCenter || this.props.mapZoom !== prevProps.mapZoom) {
            this.centerAndZoomMap(this.props.mapCenter, this.props.mapZoom);
        }

        if (this.props.selectedDate !== prevProps.selectedDate
            || this.state.stretch !== prevState.stretch
            || this.props.degDataType !== prevProps.degDataType) {
            if (this.props.widget.properties[0] === "DegradationTool" && this.props.selectedDate !== "") {
                const postObject = {};
                postObject.imageDate = this.props.selectedDate;
                postObject.stretch = this.props.degDataType && this.props.degDataType === "landsat"
                    ? this.state.stretch
                    : "SAR";
                postObject.dataType = this.props.degDataType;
                postObject.path = "getDegraditionTileUrl";
                postObject.geometry = JSON.parse(this.props.projPairAOI);
                const map = this.state.mapRef;
                try {
                    map.getLayers().getArray()
                        .filter(layer => layer.get("id") !== undefined
                            && layer.get("id") === "widgetmap_" + this.props.widget.id)
                        .forEach(layer => map.removeLayer(layer));
                } catch (e) {
                    console.log("removal error");
                }
                if (typeof (Storage) !== "undefined"
                    && this.checkForCache(postObject, this.props.widget, false)) {
                    this.fetchMapInfo(postObject, "/geo-dash/gateway-request", this.props.widget, null);
                }
            }
        }
    }

    checkForCache = (postObject, widget, isSecond) => {
        const visParams = JSON.stringify(postObject.visParams);
        return (localStorage.getItem(postObject.ImageAsset + visParams)
            ? this.createTileServerFromCache(postObject.ImageAsset + visParams, widget.id, isSecond)
            : localStorage.getItem(postObject.ImageCollectionAsset + visParams)
                ? this.createTileServerFromCache(postObject.ImageCollectionAsset + visParams, widget.id, isSecond)
                : postObject.index && localStorage.getItem(postObject.index + visParams + postObject.dateFrom + postObject.dateTo)
                    ? this.createTileServerFromCache(postObject.index + visParams + postObject.dateFrom + postObject.dateTo, widget.id, isSecond)
                    : postObject.path && localStorage.getItem(postObject.path + visParams + postObject.dateFrom + postObject.dateTo)
                        ? this.createTileServerFromCache(postObject.path + visParams + postObject.dateFrom + postObject.dateTo, widget.id, isSecond)
                        : localStorage.getItem(JSON.stringify(postObject))
                            ? this.createTileServerFromCache(JSON.stringify(postObject), widget.id, isSecond)
                            : true);
    };

    fetchMapInfo = (postObject, url, widget, dualImageObject) => {
        if (postObject.path === "getDegraditionTileUrl" && url.trim() === "") {
            return;
        }
        fetch(url, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(postObject)
        })
            .then(res => {
                if (res.ok) {
                    return res.json();
                } else {
                    Promise.reject();
                }
            })
            .then(data => {
                if (data && data.hasOwnProperty("url")) {
                    data.lastGatewayUpdate = new Date();
                    const visParams = JSON.stringify(postObject.visParams);
                    if (postObject.ImageAsset && visParams) {
                        localStorage.setItem(postObject.ImageAsset + visParams, JSON.stringify(data));
                    } else if (postObject.ImageCollectionAsset && visParams) {
                        localStorage.setItem(postObject.ImageCollectionAsset + visParams, JSON.stringify(data));
                    } else if (postObject.index && visParams + postObject.dateFrom + postObject.dateTo) {
                        localStorage.setItem(postObject.index + visParams + postObject.dateFrom + postObject.dateTo, JSON.stringify(data));
                    } else if (postObject.path && visParams + postObject.dateFrom + postObject.dateTo) {
                        localStorage.setItem(postObject.path + visParams + postObject.dateFrom + postObject.dateTo, JSON.stringify(data));
                    } else {
                        localStorage.setItem(JSON.stringify(postObject), JSON.stringify(data));
                    }
                    this.addTileServer(data.url, "widgetmap_" + widget.id);
                    return true;
                } else {
                    console.warn("Wrong Data Returned");
                    return false;
                }
            })
            .then(isValid => {
                if (isValid) {
                    if (widget.dualLayer) {
                        postObject.dateFrom = widget.dualStart;
                        postObject.dateTo = widget.dualEnd;

                        fetch(url, {
                            method: "POST",
                            headers: {
                                "Accept": "application/json",
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify(postObject)
                        })
                            .then(res => res.json())
                            .then(data => {
                                if (data.hasOwnProperty("url")) {
                                    data.lastGatewayUpdate = new Date();
                                    const visParams = JSON.stringify(postObject.visParams);
                                    if (postObject.ImageAsset && visParams) {
                                        localStorage.setItem(postObject.ImageAsset + visParams, JSON.stringify(data));
                                    } else if (postObject.ImageCollectionAsset && visParams) {
                                        localStorage.setItem(postObject.ImageCollectionAsset + visParams, JSON.stringify(data));
                                    } else if (postObject.index && visParams + postObject.dateFrom + postObject.dateTo) {
                                        localStorage.setItem(postObject.index + visParams + postObject.dateFrom + postObject.dateTo, JSON.stringify(data));
                                    } else {
                                        localStorage.setItem(JSON.stringify(postObject), JSON.stringify(data));
                                    }
                                    this.addDualLayer(data.url, data.token, "widgetmap_" + widget.id);
                                }
                            });
                    } else if (dualImageObject) {
                        let workingObject;
                        try {
                            workingObject = JSON.parse(dualImageObject);
                        } catch (e) {
                            workingObject = dualImageObject;
                        }
                        if (workingObject != null) {
                            fetch(workingObject.url, {
                                method: "POST",
                                headers: {
                                    "Accept": "application/json",
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify(workingObject)
                            })
                                .then(res => res.json())
                                .then(data => {
                                    if (data.hasOwnProperty("url")) {
                                        data.lastGatewayUpdate = new Date();
                                        const visParams = JSON.stringify(dualImageObject.visParams);
                                        if (dualImageObject.ImageAsset && visParams) {
                                            localStorage.setItem(dualImageObject.ImageAsset + visParams, JSON.stringify(data));
                                        } else if (dualImageObject.ImageCollectionAsset && visParams) {
                                            localStorage.setItem(dualImageObject.ImageCollectionAsset + visParams, JSON.stringify(data));
                                        } else if (dualImageObject.index && visParams + dualImageObject.dateFrom + dualImageObject.dateTo) {
                                            localStorage.setItem(dualImageObject.index + visParams + dualImageObject.dateFrom + dualImageObject.dateTo, JSON.stringify(data));
                                        } else {
                                            localStorage.setItem(JSON.stringify(dualImageObject), JSON.stringify(data));
                                        }
                                        this.addDualLayer(data.url, data.token, "widgetmap_" + widget.id);
                                    } else {
                                        console.warn("Wrong Data Returned");
                                    }
                                });
                        }
                    }
                }
            })
            .catch(error => {
                console.log(error);
            });
    };

    getImageParams = widget => {
        if (widget.visParams) {
            if (typeof widget.visParams === "string") {
                try {
                    return JSON.parse(widget.visParams);
                } catch (e) {
                    return widget.visParams;
                }
            } else {
                return widget.visParams;
            }
        } else if (widget.type === "polygonCompare") {
            return {};
        } else {
            return {
                min: (widget.min && widget.min > 0) ? widget.min : null,
                max: (widget.max && widget.max > 0) ? widget.max : null,
                bands: widget.bands
            };
        }
    };

    pauseGeeLayer = e => {
        const layers = e.target.getLayers().getArray();
        layers.forEach(lyr => {
            if (lyr.get("id") && lyr.get("id").indexOf("widget") === 0) {
                lyr.setVisible(false);
            }
        });
    };

    getRequestedIndex = collectionName => (
        ["ImageCollectionNDVI",
         "ImageCollectionEVI",
         "ImageCollectionEVI2",
         "ImageCollectionNDMI",
         "ImageCollectionNDWI"].includes(collectionName)
            ? collectionName.replace("ImageCollection", "")
            : "");

    convertCollectionName = collectionName => (
        ["ImageCollectionNDVI",
         "ImageCollectionEVI",
         "ImageCollectionEVI2",
         "ImageCollectionNDMI",
         "ImageCollectionNDWI"].includes(collectionName)
            ? ""
            : collectionName);

    addSecondMapLayer = (url, token, widgetid) => {
        if (this.state.mapRef) {
            this.addDualLayer(url, token, widgetid);
        } else {
            setTimeout(() => {
                this.addDualLayer(url, token, widgetid);
            }, 1000);
        }
    };

    centerAndZoomMap = (center, zoom) => {
        const map = this.state.mapRef;
        map.getView().setCenter(center);
        map.getView().setZoom(zoom);
    };

    createTileServerFromCache = (storageItem, widgetId, isSecond) => {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - 1);
        const mapinfo = JSON.parse(localStorage.getItem(storageItem));
        if (new Date(mapinfo.lastGatewayUpdate) > currentDate) {
            if (isSecond) {
                this.addSecondMapLayer(mapinfo.url, mapinfo.token, "widgetmap_" + widgetId);
            } else {
                this.addTileServer(mapinfo.url, "widgetmap_" + widgetId);
            }
            return false;
        }
        return true;
    };

    getSliderControl = () => {
        const {widget, onSliderChange, onSwipeChange} = this.props;

        if (widget.dualLayer || widget.dualImageCollection) {
            return (
                <div>
                    <div className="toggleSwitchContainer">
                        <img
                            alt="Opacity"
                            height="20px"
                            onClick={() => onSliderChange(widget)}
                            src="img/geodash/opacity.png"
                            style={{
                                opacity: widget.sliderType === "opacity" ? "1.0" : "0.25",
                                cursor: "pointer"
                            }}
                            title="Opacity"
                            width="40px"
                        />
                        <br/>
                        <img
                            alt="Swipe"
                            height="20px"
                            onClick={() => onSliderChange(widget)}
                            src="img/geodash/swipe.png"
                            style={{
                                opacity: widget.sliderType === "swipe" ? "1.0" : "0.25",
                                cursor: "pointer"
                            }}
                            title="Swipe"
                            width="40px"
                        />
                    </div>
                    <input
                        className="mapRange dual"
                        id={"rangeWidget_" + widget.id}
                        max="1"
                        min="0"
                        onChange={evt => this.onOpacityChange(evt)}
                        step=".01"
                        style={{display: widget.sliderType === "opacity" ? "block" : "none"}}
                        type="range"
                        value={this.state.opacity}
                    />
                    <input
                        className="mapRange dual"
                        id={"swipeWidget_" + widget.id}
                        max="1"
                        min="0"
                        onChange={evt => onSwipeChange(widget, evt)}
                        step=".01"
                        style={{display: widget.sliderType === "swipe" ? "block" : "none"}}
                        type="range"
                        value={this.props.widget.swipeValue}
                    />
                </div>
            );
        } else {
            return (
                <input
                    className="mapRange"
                    id={"rangeWidget_" + widget.id}
                    max="1"
                    min="0"
                    onChange={evt => this.onOpacityChange(evt)}
                    step=".01"
                    type="range"
                    value={this.state.opacity}
                />
            );
        }
    };

    onOpacityChange = evt => {
        try {
            const opacity = Number(evt.target.value);
            this.setState({opacity});
            this.state.mapRef.getLayers().forEach(lyr => {
                if (lyr.get("id") && lyr.get("id").includes(this.props.widget.id)) {
                    lyr.setOpacity(opacity);
                }
            });
        } catch (e) {
            console.log(e.message);
        }
    };

    handleResize = () => {
        try {
            this.state.mapRef.updateSize();
        } catch (e) {
            console.log("resize issue");
        }
    };

    resumeGeeLayer = e => {
        try {
            if (this.state && this.state.geeTimeOut) {
                window.clearTimeout(this.state.geeTimeOut);
                this.setState({geeTimeOut: null});
            }
            this.setState({
                geeTimeOut: window.setTimeout(() => {
                    const layers = e.target.getLayers().getArray();
                    layers.forEach(lyr => {
                        if (lyr.get("id") && lyr.get("id").indexOf("widget") === 0) {
                            lyr.setVisible(true);
                        }
                    });
                }, Math.floor(Math.random() * (1250 - 950 + 1) + 950))
            });
        } catch (err) {
            console.log(err.message);
        }
    };

    addTileServer = (url, mapdiv) => {
        window.setTimeout(() => {
            const source = new XYZ({
                url
            });
            source.on("tileloaderror", error => {
                try {
                    window.setTimeout(() => {
                        error.tile.attempt = error.tile.attempt ? error.tile.attempt + 1 : 1;
                        if (error.tile.attempt < 5) error.tile.load();
                    }, Math.floor(Math.random() * (1250 - 950 + 1) + 950));
                } catch (e) {
                    console.log(e.message);
                }
            });
            this.state.mapRef.addLayer(new TileLayer({
                source,
                id: mapdiv
            }));
        }, Math.floor(Math.random() * (300 - 200 + 1) + 200));
    };

    addDualLayer = (url, token, mapdiv) => {
        const googleLayer = new TileLayer({
            source: new XYZ({
                url
            }),
            id: mapdiv + "_dual"
        });
        this.state.mapRef.addLayer(googleLayer);
        const swipe = document.getElementById("swipeWidget_" + mapdiv.replace("widgetmap_", ""));
        googleLayer.on("prerender", event => {
            const ctx = event.context;
            const width = ctx.canvas.width * (swipe.value);
            ctx.save();
            ctx.beginPath();
            ctx.rect(width, 0, ctx.canvas.width - width, ctx.canvas.height);
            ctx.clip();
        });

        googleLayer.on("postrender", event => {
            const ctx = event.context;
            ctx.restore();
        });
        swipe.addEventListener("input", () => {
            this.state.mapRef.render();
        }, false);
    };

    setStretch = evt => this.setState({stretch: parseInt(evt.target.value)});

    toggleDegDataType = checked => this.props.handleDegDataType(checked ? "sar" : "landsat");

    getStretchToggle = () => (this.props.degDataType === "landsat"
        ? (
            <div className="col-6">
                <span className="ctrlText font-weight-bold">Bands: </span>
                <select
                    className="form-control"
                    onChange={evt => this.setStretch(evt)}
                    style={{
                        maxWidth: "65%",
                        display: "inline-block",
                        fontSize: ".8rem",
                        height: "30px"
                    }}
                >
                    <option value={321}>R,G,B</option>
                    <option value={543}>SWIR,NIR,R</option>
                    <option value={453}>NIR,SWIR,R</option>
                </select>
            </div>
        )
        : this.props.isDegradation
            ? (
                <div className="col-6">
                    <span className="ctrlText font-weight-bold">Band Combination: </span>
                    <span className="ctrlText">VV, VH, VV/VH </span>
                </div>
            )
            : "");

    getDegDataTypeToggle = () => (
        <div className="col-6" style={{display: this.props.isDegradation ? "block" : "none"}}>
            <span className="ctrlText font-weight-bold">Data: </span>
            <span className="ctrlText">LANDSAT </span>
            <label className="switch">
                <input onChange={evt => this.toggleDegDataType(evt.target.checked)} type="checkbox"/>
                <span className="switchslider round"/>
            </label>
            <span className="ctrlText"> SAR</span>
        </div>
    );

    render() {
        return (
            <>
                <div
                    className="minmapwidget"
                    id={"widgetmap_" + this.props.widget.id}
                    style={{width:"100%", minHeight:"200px"}}
                />
                {this.getSliderControl()}
                <div className="row">
                    {this.getStretchToggle()}
                    {this.getDegDataTypeToggle()}
                </div>
            </>
        );
    }
}

class GraphWidget extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            graphRef: null,
            selectSarGraphBand: "VV",
            chartDataSeriesLandsat: [],
            chartDataSeriesSar: [],
            nonDegChartData: []
        };
    }

    componentDidMount() {
        this.loadGraph();
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.degDataType
            && (prevProps.degDataType !== this.props.degDataType
                || prevState.selectSarGraphBand !== this.state.selectSarGraphBand)) {
            this.loadGraph();
        }
        this.handleResize();
    }

    loadGraph = () => {
        const {chartDataSeriesLandsat, chartDataSeriesSar, selectSarGraphBand, graphRef} = this.state;
        const {widget, degDataType, getParameterByName, projPairAOI, handleSelectDate} = this.props;

        if (degDataType === "landsat" && chartDataSeriesLandsat.length > 0) {
            graphRef.update({series: _.cloneDeep(chartDataSeriesLandsat)});
        } else if (degDataType === "sar"
            && chartDataSeriesSar.hasOwnProperty(selectSarGraphBand)
            && chartDataSeriesSar[selectSarGraphBand].length > 0) {
            graphRef.update({series: _.cloneDeep(chartDataSeriesSar[selectSarGraphBand])});
        } else {
            const centerPoint = JSON.parse(getParameterByName("bcenter")).coordinates;
            const widgetType = widget.type || "";
            const collectionName = widget.properties[1];
            const indexName = widget.properties[4];
            const path = widgetType === "DegradationTool" ? "getImagePlotDegradition"
                : collectionName.trim() === "timeSeriesAssetForPoint" ? "timeSeriesAssetForPoint"
                    : collectionName.trim().length > 0 ? "timeSeriesIndex"
                        : "timeSeriesIndex2";
            fetch("/geo-dash/gateway-request", {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    collectionNameTimeSeries: collectionName,
                    geometry: JSON.parse(projPairAOI),
                    indexName: widget.graphBand || indexName,
                    dateFromTimeSeries: widget.properties[2].trim().length === 10
                        ? widget.properties[2].trim()
                        : "2000-01-01",
                    dateToTimeSeries: widget.properties[3].trim().length === 10
                        ? widget.properties[3].trim()
                        : formatDateISO(new Date()),
                    reducer: widget.graphReducer != null ? widget.graphReducer.toLowerCase() : "",
                    scale: 30,
                    path,
                    point: centerPoint,
                    start: widget.startDate || "",
                    end: widget.endDate || "",
                    band: widget.graphBand || "",
                    dataType: degDataType || ""
                })
            })
                .then(res => res.json())
                .then(res => {
                    if (res.errMsg) {
                        console.warn(res.errMsg);
                    } else if (res.hasOwnProperty("timeseries")) {
                        if (res.timeseries.length === 0) {
                            console.log("no data");
                        } else if (Object.keys(res.timeseries[0][1]).length === 0) {
                            const thisDataSeries = {
                                type: "area",
                                name: widget.graphBand || indexName,
                                data: res.timeseries
                                    .filter(v => v[0]).map(v => [v[0], v[1]]).sort((a, b) => a[0] - b[0]),
                                color: "#31bab0"
                            };
                            this.setState({nonDegChartData : [thisDataSeries]});
                        } else {
                            // this is where degData ends up
                            const theKeys = Object.keys(res.timeseries[0][1]);
                            const compiledData = [];
                            res.timeseries.forEach(d => {
                                for (let i = 0; i < theKeys.length; i += 1) {
                                    const tempData = [];
                                    const anObject = {};
                                    anObject[theKeys[i]] = d[1][theKeys[i]];
                                    tempData.push(d[0]);
                                    tempData.push(anObject);
                                    if (compiledData.length - 1 < i) {
                                        compiledData[i] = [];
                                    }
                                    compiledData[i].push(tempData);
                                }
                            });
                            compiledData.forEach((d, index) => {
                                const cdata = this.convertData(d);
                                const mSortData = this.sortMultiData(cdata);
                                const thisDataSeries = {
                                    type: "scatter",
                                    name: theKeys[index],
                                    data: mSortData,
                                    valueDecimals: 20,
                                    connectNulls: true,
                                    color: "#31bab0",
                                    allowPointSelect: true,
                                    point: {
                                        cursor: "pointer",
                                        events: {
                                            select: e => {
                                                handleSelectDate(formatDateISO(new Date(e.target.x)));
                                            }
                                        }
                                    },
                                    tooltip: {
                                        pointFormat: "<span style=\"color:{series.color}\">{point.x:%Y-%m-%d}</span>: <b>{point.y:.6f}</b><br/>",
                                        valueDecimals: 20,
                                        split: false,
                                        xDateFormat: "%Y-%m-%d"
                                    }
                                };
                                if (degDataType === "landsat") {
                                    this.setState({
                                        chartDataSeriesLandsat: [
                                            ...this.state.chartDataSeriesLandsat,
                                            thisDataSeries
                                        ]
                                    });
                                } else {
                                    this.setState({
                                        chartDataSeriesSar: {
                                            ...this.state.chartDataSeriesSar,
                                            [theKeys[index]]: [thisDataSeries]
                                        }
                                    });
                                }
                            });
                        }
                    } else {
                        console.warn("Wrong Data Returned");
                    }
                })
                .catch(error => console.log(error));
            window.addEventListener("resize", this.handleResize);
        }
    };

    multiComparator = (a, b) => ((a[0] < b[0]) ? -1
        : (a[0] > b[0])
            ? 1
            : 0);

    sortMultiData = data => data.sort(this.multiComparator);

    convertData = data => data.map(d => [d[0], d[1][Object.keys(d[1])[0]]]);

    handleResize = () => {
        try {
            if (this.state.graphRef && this.state.graphRef.bounds) {
                const gwidget = document.getElementById("widgetgraph_" + this.props.widget.id);
                this.state.graphRef.setSize(gwidget.clientWidth, gwidget.clientHeight, true);
            }
        } catch (e) {
            console.log("handleResize error:");
            console.log(e.message);
        }
    };

    onSelectSarGraphBand = newValue => this.setState({selectSarGraphBand: newValue});

    getSarBandOption = () => {
        const selectOptions = [
            {label: "VV", value: "VV"},
            {label: "VH", value: "VH"},
            {label: "VV/VH", value: "VV/VH"}
        ];
        return (
            <select
                className="form-control"
                onChange={evt => this.onSelectSarGraphBand(evt.target.value)}
                style={{
                    maxWidth: "85%",
                    display: this.props.widget.type === "DegradationTool" && this.props.degDataType === "sar"
                        ? "inline-block" : "none",
                    fontSize: ".9rem",
                    height: "30px"
                }}
            >
                {selectOptions.map(el => <option key={el.value} value={el.value}>{el.label}</option>)}
            </select>
        );
    };

    getChartOptions = () => {
        const {widget, degDataType} = this.props;
        const {chartDataSeriesLandsat, chartDataSeriesSar, selectSarGraphBand, nonDegChartData} = this.state;
        return {
            chart: {zoomType: "x"},
            title: {text: ""},
            subtitle: {
                text: document.ontouchstart === undefined
                    ? "Click and drag in the plot area to zoom in"
                    : "Pinch the chart to zoom in"
            },
            xAxis: {type: "datetime"},
            yAxis: {
                title: {text: widget.properties[4]}
            },
            legend: {enabled: true},
            credits: {enabled: false},
            plotOptions: {
                area: {
                    connectNulls: widget.properties[4].toLowerCase() === "custom",
                    fillColor: {
                        linearGradient: {
                            x1: 0,
                            y1: 0,
                            x2: 0,
                            y2: 1
                        },
                        stops: [
                            [0, Highcharts.Color(Highcharts.getOptions().colors[0]).setOpacity(0).get("rgba")],
                            [1, Highcharts.Color(Highcharts.getOptions().colors[0]).setOpacity(0).get("rgba")]
                        ]
                    },
                    marker: {radius: 2},
                    lineWidth: 1,
                    states: {
                        hover: {lineWidth: 1}
                    },
                    threshold: null
                },
                scatter: {
                    marker: {radius: 2}
                }
            },
            tooltip: {
                pointFormat: "<span style=\"color:{series.color}\">{series.name}</span>: <b>{point.y:.6f}</b><br/>",
                valueDecimals: 20,
                split: false,
                xDateFormat: "%Y-%m-%d"
            },
            series:
                widget.type === "DegradationTool"
                    ? degDataType === "landsat" && chartDataSeriesLandsat.length > 0
                        ? _.cloneDeep(chartDataSeriesLandsat)
                        : degDataType === "sar" && chartDataSeriesSar.hasOwnProperty(selectSarGraphBand)
                            && chartDataSeriesSar[selectSarGraphBand].length > 0
                            ? _.cloneDeep(chartDataSeriesSar[selectSarGraphBand])
                            : []
                    : _.cloneDeep(nonDegChartData)
        };
    };

    render() {
        const {widget, degDataType} = this.props;
        const {chartDataSeriesSar, chartDataSeriesLandsat, selectSarGraphBand, nonDegChartData} = this.state;
        return (
            <div className="minmapwidget" id={"widgetgraph_" + widget.id}>
                <div className="minmapwidget graphwidget normal" id={"graphcontainer_" + widget.id}>
                    {(widget.type === "DegradationTool"
                        && degDataType === "sar"
                        && chartDataSeriesSar.hasOwnProperty(selectSarGraphBand)
                        && chartDataSeriesSar[selectSarGraphBand].length > 0)
                    || (widget.type === "DegradationTool"
                        && degDataType === "landsat"
                        && chartDataSeriesLandsat.length > 0)
                    || nonDegChartData.length > 0
                        ? (
                            <HighchartsReact
                                callback={thisChart => this.setState({graphRef: thisChart})}
                                highcharts={Highcharts}
                                options={this.getChartOptions()}
                            />
                        ) : (
                            <img
                                alt="Loading"
                                src="img/geodash/ceo-loading.gif"
                                style={{
                                    position: "absolute",
                                    bottom: "50%",
                                    left: "50%"
                                }}
                            />
                        )}
                </div>
                <h3 id={"widgettitle_" + widget.id}>{widget.properties[4]}</h3>
                {this.getSarBandOption()}
            </div>
        );
    }
}

class StatsWidget extends React.Component {
    constructor(props) {
        super(props);
        this.state = {totalPop:"", area:"", elevation:""};
    }

    componentDidMount() {
        const {projPairAOI} = this.props;
        fetch("/geo-dash/gateway-request", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                paramValue: JSON.parse(projPairAOI),
                path: "getStats"
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.errMsg) {
                    console.warn(data.errMsg);
                } else {
                    this.setState({
                        totalPop: this.numberWithCommas(data.pop),
                        area: this.numberWithCommas(this.calculateArea(JSON.parse(projPairAOI)), 2) + " ha",
                        elevation: this.numberWithCommas(data.minElev)
                            + " - "
                            + this.numberWithCommas(data.maxElev)
                            + " m"
                    });
                }
            })
            .catch(error => console.log(error));
    }

    numberWithCommas = (x, decimalPlaces = 0) => {
        if (typeof x === "number") {
            try {
                const [quot, rem] = x.toString().split(".");
                const withCommas = quot.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                return (rem && decimalPlaces > 0)
                    ? [withCommas, rem.slice(0, decimalPlaces)].join(".")
                    : withCommas;
            } catch (e) {
                console.warn(e.message);
                return "N/A";
            }
        } else {
            return "N/A";
        }
    };

    calculateArea = poly => {
        try {
            return sphereGetArea(new Polygon([poly]), {projection: "EPSG:4326"}) / 10000;
        } catch (e) {
            return "N/A";
        }
    };

    render() {
        const {widget} = this.props;
        const stats = this.state.totalPop;
        const {area} = this.state;
        const {elevation} = this.state;
        return (
            <div className="minmapwidget" id={"widgetstats_" + widget.id} style={{padding: "20px"}}>
                <div>
                    <div className="form-group">
                        <div className="input-group">
                            <div className="input-group-addon">
                                <img
                                    alt="Population"
                                    src="img/geodash/icon-population.png"
                                    style={{
                                        width: "50px",
                                        height: "50px",
                                        borderRadius: "25px",
                                        backgroundColor: "#31bab0"
                                    }}
                                />
                            </div>
                            <label
                                htmlFor={"totalPop_" + widget.id}
                                style={{color: "#787878", padding: "10px 20px"}}
                            >
                                Total population
                            </label>
                            <h3
                                id={"totalPop_" + widget.id}
                                style={{
                                    color: "#606060",
                                    fontSize: "16px",
                                    fontWeight: "bold",
                                    paddingTop: "12px"
                                }}
                            >
                                {stats}
                            </h3>
                        </div>
                    </div>
                    <div className="form-group">
                        <div className="input-group">
                            <div className="input-group-addon">
                                <img
                                    alt="Area"
                                    src="img/geodash/icon-area.png"
                                    style={{
                                        width: "50px",
                                        height: "50px",
                                        borderRadius: "25px",
                                        backgroundColor: "#31bab0"
                                    }}
                                />
                            </div>
                            <label
                                htmlFor={"totalArea_" + widget.id}
                                style={{color: "#787878", padding: "10px 20px"}}
                            >
                                Area
                            </label>
                            <h3
                                id={"totalArea_" + widget.id}
                                style={{
                                    color: "#606060",
                                    fontSize: "16px",
                                    fontWeight: "bold",
                                    paddingTop: "12px"
                                }}
                            >{area}
                            </h3>
                        </div>
                    </div>
                    <div className="form-group">
                        <div className="input-group">
                            <div className="input-group-addon">
                                <img
                                    alt="Elevation"
                                    src="img/geodash/icon-elevation.png"
                                    style={{
                                        width: "50px",
                                        height: "50px",
                                        borderRadius: "25px",
                                        backgroundColor: "#31bab0"
                                    }}
                                />
                            </div>
                            <label
                                htmlFor={"elevationRange_" + widget.id}
                                style={{color: "#787878", padding: "10px 20px"}}
                            >
                                Elevation
                            </label>
                            <h3
                                id={"elevationRange_" + widget.id}
                                style={{
                                    color: "#606060",
                                    fontSize: "16px",
                                    fontWeight: "bold",
                                    paddingTop: "12px"
                                }}
                            >
                                {elevation}
                            </h3>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export function pageInit(args) {
    ReactDOM.render(
        <GeoDashNavigationBar
            page={() => <Geodash/>}
            userName={args.userName || "guest"}
            visiblePlotId={args.visiblePlotId ? parseInt(args.visiblePlotId) : -1}
        />,
        document.getElementById("app")
    );
}

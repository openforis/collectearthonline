import "../css/geo-dash.css";

import React from "react";
import ReactDOM from "react-dom";
import _ from "lodash";
import RGL, {WidthProvider} from "react-grid-layout";
import {GeoDashNavigationBar} from "./components/PageComponents";

const ReactGridLayout = WidthProvider(RGL);

class WidgetLayoutEditor extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            layout: [],
            widgets: [],
            imagery: [],
            widgetBasemap: -1,
            selectedProjectId: 0,
            projectList: [],
            projectFilter:"",
            selectedWidgetType: "-1",
            selectedDataType: "-1",
            widgetTitle: "",
            imageCollection: "",
            featureCollection: "",
            matchField: "",
            graphBand: "",
            graphBandDeg: "NDFI",
            graphReducer: "Min",
            imageParams: "",
            dualLayer: false,
            swipeAsDefault: false,
            startDate: "",
            endDate: "",
            startDate2: "",
            endDate2: "",
            widgetBands: "",
            widgetMin: "",
            widgetMax: "",
            widgetCloudScore: "",
            imageCollectionDual: "",
            selectedDataTypeDual: "-1",
            imageParamsDual: "",
            startDateDual: "",
            endDateDual: "",
            widgetBandsDual: "",
            widgetMinDual: "",
            widgetMaxDual: "",
            widgetCloudScoreDual: "",
            formReady: false,
            wizardStep: 1,
            projectId: this.getParameterByName("projectId"),
            institutionID: this.getParameterByName("institutionId")
                ? this.getParameterByName("institutionId")
                : "1",
            theURI: "/geo-dash"
        };
    }

    componentDidMount() {
        this.fetchProject(this.state.projectId, true)
            .catch(response => {
                console.log(response);
                alert("Error downloading the widget list. See console for details.");
            });
        this.getInstitutionImagery(this.state.institutionID);
        this.getProjectList();
    }

    getInstitutionImagery = institutionId => {
        fetch(`/get-institution-imagery?institutionId=${institutionId}`)
            .then(response => (response.ok ? response.json() : Promise.reject(response)))
            .then(data => {
                this.setState({
                    imagery: data,
                    widgetBasemap: data[0].id
                });
            })
            .catch(response => {
                console.log(response);
                alert("Error downloading the imagery list. See console for details.");
            });
    };

    getParameterByName = (name, url) => {
        const regex = new RegExp("[?&]" + name.replace(/[[\]]/g, "\\$&") + "(=([^&#]*)|&|#|$)");
        const results = regex.exec(decodeURIComponent(url || window.location.href)); // regex.exec(url);
        return results
            ? results[2]
                ? decodeURIComponent(results[2].replace(/\+/g, " "))
                : ""
            : null;
    };

    getImageByType = imageType => (imageType === "getStats" ? "/img/geodash/statssample.gif"
        : (!imageType || imageType.toLowerCase().includes("image")) ? "/img/geodash/mapsample.gif"
            : (imageType.toLowerCase().includes("degradationtool")) ? "/img/geodash/degsample.gif"
                : "/img/geodash/graphsample.gif");

    serveItUp = (url, widget) => {
        fetch(
            url,
            {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    dashID: this.state.dashboardID,
                    widgetJSON: JSON.stringify(widget)
                })
            }
        )
            .then(response => {
                if (!response.ok) {
                    console.log(response);
                }
            });
    };

    deleteWidgetFromServer = widget => {
        this.serveItUp(`${this.state.theURI}/delete-widget?widgetId=${widget.id}`, widget);
    };

    generateDOM = () => {
        const x = "x";
        return _.map(this.state.widgets, widget => (
            <div
                key={widget.layout.i}
                className="front widgetEditor-widgetBackground"
                data-grid={widget.layout}
                onDragEnd={this.onDragEnd}
                onDragStart={this.onDragStart}
                style={{backgroundImage: "url(" + this.getImageByType(widget.properties[0]) + ")"}}
            >
                <h3 className="widgetEditor title">{widget.name}
                    <span
                        className="remove"
                        onClick={e => {
                            e.stopPropagation();
                            this.onRemoveItem(widget.layout.i);
                        }}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        {x}
                    </span>
                </h3>
                <span className="text text-danger">Sample Image</span>
            </div>
        ));
    };

    onWidgetTypeSelectChanged = event => {
        this.setState({
            selectedWidgetType: event.target.value,
            selectedDataType: "-1",
            widgetTitle: "",
            imageCollection: event.target.value === "ImageElevation" ? "USGS/SRTMGL1_003" : "",
            featureCollection: "",
            matchField: "",
            graphBand: "",
            graphBandDeg: "NDFI",
            graphReducer: "Min",
            imageParams: "",
            dualLayer: false,
            swipeAsDefault: false,
            startDate:"",
            endDate:"",
            startDate2:"",
            endDate2:"",
            widgetBands:"",
            widgetMin:"",
            widgetMax:"",
            widgetCloudScore:"",
            imageCollectionDual: "",
            imageParamsDual: "",
            startDateDual:"",
            endDateDual:"",
            widgetBandsDual:"",
            widgetMinDual:"",
            widgetMaxDual:"",
            widgetCloudScoreDual:"",
            formReady: event.target.value === "statistics"
                || event.target.value === "imageAsset"
                || event.target.value === "imageCollectionAsset"
                || event.target.value === "ImageElevation",
            wizardStep: 1,
            availableBands:"",
            availableBandsDual:""
        });
    };

    onDragStart = e => {
        e.preventDefault();
        e.stopPropagation();
        this.props.onMouseDown(e);
    };

    onDragEnd = e => {
        e.preventDefault();
        e.stopPropagation();
        this.props.onMouseUp(e);
    };

    getBandsFromGateway = (isDual, isCollection) => {
        const value = isDual ? this.state.imageCollectionDual : this.state.imageCollection;
        if (value !== "") {
            const postObject = {
                path: "getAvailableBands",
                ...(isCollection ? {imageCollection: value} : {image: value})
            };
            fetch("/geo-dash/gateway-request", {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(postObject)
            })
                .then(res => (res.ok ? res.json() : Promise.reject()))
                .then(data => {
                    if (data.hasOwnProperty("bands")) {
                        if (isDual) {
                            this.setState({
                                availableBandsDual: data.bands.join(", ")
                            });
                        } else {
                            this.setState({
                                availableBands: data.bands.join(", ")
                            });
                        }
                    }
                });
        }
    };

    onDataTypeSelectChanged = event => {
        this.setState({
            availableBands: "",
            selectedDataType: event.target.value
        });
    };

    onCancelNewWidget = () => {
        this.props.closeDialogs();
        this.setState({
            selectedWidgetType: "-1",
            selectedDataTypeDual: "-1",
            selectedDataType: "-1",
            widgetTitle: "",
            imageCollection: "",
            featureCollection: "",
            matchField: "",
            graphBand: "",
            graphBandDeg: "NDFI",
            graphReducer: "Min",
            imageParams: "",
            dualLayer: false,
            swipeAsDefault: false,
            startDate:"",
            endDate:"",
            startDate2:"",
            endDate2:"",
            widgetBands:"",
            widgetMin:"",
            widgetMax:"",
            widgetCloudScore:"",
            imageCollectionDual: "",
            imageParamsDual: "",
            startDateDual:"",
            endDateDual:"",
            widgetBandsDual:"",
            widgetMinDual:"",
            widgetMaxDual:"",
            widgetCloudScoreDual:"",
            formReady: false,
            wizardStep: 1,
            availableBands:"",
            availableBandsDual:""
        });
    };

    onNextWizardStep = () => {
        this.setState({wizardStep: 2});
    };

    onPrevWizardStep = () => {
        this.setState({wizardStep: 1});
    };

    onCreateNewWidget = () => {
        const widget = {};
        const id = this.state.widgets.length > 0
            ? (Math.max(...this.state.widgets.map(o => o.id))) + 1
            : 0;
        const name = this.state.widgetTitle;
        widget.id = id;
        widget.name = name;
        const maxY = Math.max(...this.state.widgets.map(o => (o.layout.y || 0)));
        const yval = maxY > -1 ? maxY + 1 : 0;
        widget.layout = {
            i: id.toString(),
            x: 0,
            y: yval, // puts it at the bottom
            w: 3,
            h: 1,
            minW: 3
        };
        if (this.state.selectedWidgetType === "DualImageCollection") {
            widget.properties = ["", "", "", "", ""];
            widget.filterType = "";
            widget.visParams = {};
            widget.dualImageCollection = [];
            widget.swipeAsDefault = this.state.swipeAsDefault;
            widget.basemapId = this.state.widgetBasemap;
            const img1 = {};
            const img2 = {};
            img1.collectionType = "ImageCollection" + this.state.selectedDataType;
            img2.collectionType = "ImageCollection" + this.state.selectedDataTypeDual;
            img1.startDate = this.state.startDate;
            img1.endDate = this.state.endDate;
            img2.startDate = this.state.startDateDual;
            img2.endDate = this.state.endDateDual;
            if (["LANDSAT5", "LANDSAT7", "LANDSAT8", "Sentinel2"].includes(this.state.selectedDataType)) {
                img1.filterType = this.state.selectedDataType !== null ? this.state.selectedDataType : "";
                img1.visParams = {
                    bands: this.state.widgetBands,
                    min: this.state.widgetMin,
                    max: this.state.widgetMax,
                    cloudLessThan: this.state.widgetCloudScore
                };
            }
            if (["LANDSAT5", "LANDSAT7", "LANDSAT8", "Sentinel2"].includes(this.state.selectedDataTypeDual)) {
                img2.filterType = this.state.selectedDataTypeDual !== null ? this.state.selectedDataTypeDual : "";
                img2.visParams = {
                    bands: this.state.widgetBandsDual,
                    min: this.state.widgetMinDual,
                    max: this.state.widgetMaxDual,
                    cloudLessThan: this.state.widgetCloudScoreDual
                };
            }
            if (this.state.selectedDataType === "imageAsset") {
                // add image asset parameters
                img1.visParams = JSON.parse(this.state.imageParams);
                img1.imageAsset = this.state.imageCollection;
            }
            if (this.state.selectedDataType === "imageCollectionAsset") {
                // add image asset parameters
                img1.visParams = JSON.parse(this.state.imageParams);
                img1.ImageCollectionAsset = this.state.imageCollection;
            }
            if (this.state.selectedDataTypeDual === "imageAsset") {
                // add dual image asset parameters
                img2.visParams = JSON.parse(this.state.imageParamsDual);
                img2.imageAsset = this.state.imageCollectionDual;
            }
            if (this.state.selectedDataTypeDual === "imageCollectionAsset") {
                // add dual image asset parameters
                img2.visParams = JSON.parse(this.state.imageParamsDual);
                img2.ImageCollectionAsset = this.state.imageCollectionDual;
            }
            widget.dualImageCollection.push(img1);
            widget.dualImageCollection.push(img2);
        } else if (this.state.selectedWidgetType === "imageAsset" || this.state.selectedWidgetType === "ImageElevation") {
            widget.properties = ["", "", "", "", ""];
            widget.filterType = "";
            widget.visParams = this.state.imageParams === "" ? {} : JSON.parse(this.state.imageParams);
            widget.ImageAsset = this.state.imageCollection;
            widget.basemapId = this.state.widgetBasemap;
        } else if (this.state.selectedWidgetType === "imageCollectionAsset") {
            widget.properties = ["", "", "", "", ""];
            widget.filterType = "";
            widget.visParams = JSON.parse(this.state.imageParams);
            widget.ImageCollectionAsset = this.state.imageCollection;
            widget.basemapId = this.state.widgetBasemap;
        } else if (this.state.selectedWidgetType === "DegradationTool") {
            widget.type = "DegradationTool";
            widget.properties = ["DegradationTool", "", "", "", ""];
            widget.filterType = "";
            widget.startDate = this.state.startDate;
            widget.endDate = this.state.endDate;
            widget.graphBand = this.state.graphBandDeg === "" ? "NDFI" : this.state.graphBandDeg;
            widget.basemapId = this.state.widgetBasemap;
        } else if (this.state.selectedWidgetType === "polygonCompare") {
            widget.type = "polygonCompare";
            widget.properties = ["featureCollection", "", "", "", ""];
            widget.featureCollection = this.state.featureCollection;
            widget.visParams = this.state.visParams;
            widget.field = this.state.matchField;
            widget.basemapId = this.state.widgetBasemap;
        } else {
            const wType = this.state.selectedWidgetType === "TimeSeries"
                ? this.state.selectedDataType.toLowerCase() + this.state.selectedWidgetType
                : this.state.selectedWidgetType === "ImageCollection"
                    ? this.state.selectedWidgetType + this.state.selectedDataType
                    : this.state.selectedWidgetType === "statistics"
                        ? "getStats"
                        : this.state.selectedWidgetType === "ImageElevation"
                            ? "ImageElevation"
                            : "custom";
            let prop1 = "";
            const properties = [];
            const prop4 = this.state.selectedDataType !== null ? this.state.selectedDataType : "";
            if (this.state.selectedDataType === "Custom") {
                // more work to do to label the type and add
                prop1 = this.state.imageCollection;
                widget.visParams = this.state.imageParams;
                widget.graphBand = this.state.graphBand;
                widget.graphReducer = this.state.graphReducer;
            }
            if (["ImageCollection", "ImageElevation"].includes(this.state.selectedWidgetType)) {
                widget.basemapId = this.state.widgetBasemap;
            }
            properties[0] = wType;
            properties[1] = prop1;
            properties[2] = this.state.startDate;
            properties[3] = this.state.endDate;
            properties[4] = prop4;

            widget.properties = properties;
            if (["LANDSAT5", "LANDSAT7", "LANDSAT8", "Sentinel2"].includes(this.state.selectedDataType)) {
                widget.filterType = this.state.selectedDataType;
                widget.visParams = {
                    bands: this.state.widgetBands,
                    min: this.state.widgetMin,
                    max: this.state.widgetMax,
                    cloudLessThan: this.state.widgetCloudScore
                };
            }
            widget.dualLayer = this.state.dualLayer;
            if (widget.dualLayer) {
                widget.dualStart = this.state.startDate2;
                widget.dualEnd = this.state.endDate2;
            }
        }

        fetch(
            this.state.theURI + "/create-widget",
            {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    projectId: this.state.projectId,
                    dashID: this.state.dashboardID,
                    widgetJSON: JSON.stringify(widget)
                })
            }
        )
            .then(response => {
                if (response.ok) {
                    this.props.closeDialogs();
                    this.setState({
                        widgets: [...this.state.widgets, widget],
                        selectedWidgetType: "-1",
                        selectedDataTypeDual: "-1",
                        selectedDataType: "-1",
                        widgetTitle: "",
                        imageCollection: "",
                        featureCollection: "",
                        matchField: "",
                        graphBand: "",
                        graphBandDeg: "NDFI",
                        graphReducer: "Min",
                        imageParams: "",
                        dualLayer: false,
                        swipeAsDefault: false,
                        startDate:"",
                        endDate:"",
                        startDate2:"",
                        endDate2:"",
                        widgetBands:"",
                        widgetMin:"",
                        widgetMax:"",
                        widgetCloudScore:"",
                        formReady: false
                    });
                } else {
                    console.log("Error adding custom imagery to institution. See console for details.");
                }
            });
    };

    onDataBasemapSelectChanged = event => {
        this.setState({widgetBasemap: parseInt(event.target.value)});
    };

    onWidgetTitleChange = event => {
        this.setState({widgetTitle: event.target.value});
    };

    onImageCollectionChange = event => {
        this.setState({
            imageCollection: event.target.value,
            availableBands: ""
        });
    };

    onFeatureCollectionChange = event => {
        this.setState({featureCollection: event.target.value});
    };

    onMatchFieldChange = event => {
        this.setState({
            matchField: event.target.value,
            formReady: true
        });
    };

    onGraphBandChange = event => {
        this.setState({graphBand: event.target.value});
    };

    onGraphBandDegChange = event => {
        this.setState({graphBandDeg: event.target.value});
    };

    onGraphReducerChanged = event => {
        this.setState({graphReducer: event.target.value});
    };

    onImageParamsChange = event => {
        this.setState({imageParams: event.target.value.replace(/\s/g, "")});
    };

    onswipeAsDefaultChange = event => {
        this.setState({swipeAsDefault: event.target.checked});
    };

    onWidgetDualLayerChange = event => {
        this.setState({dualLayer: event.target.checked});
    };

    onWidgetBandsChange = event => {
        this.setState({widgetBands: event.target.value.replace(/\s/g, "")});
    };

    onWidgetMinChange = event => {
        this.setState({widgetMin: event.target.value});
    };

    onWidgetMaxChange = event => {
        this.setState({widgetMax: event.target.value});
    };

    onStartDateChanged = event => {
        this.setState({
            startDate: event.target ? event.target.value : ""
        }, this.setFormStateByDates);
    };

    onEndDateChanged = event => {
        this.setState({
            endDate: event.target ? event.target.value : ""
        }, this.setFormStateByDates);
    };

    onWidgetCloudScoreChange = event => {
        this.setState({widgetCloudScore: event.target.value});
    };

    onImageCollectionChangeDual = event => {
        this.setState({
            imageCollectionDual: event.target.value,
            availableBandsDual: ""
        });
    };

    onImageParamsChangeDual = event => {
        this.setState({imageParamsDual: event.target.value.replace(/\s/g, "")});
    };

    onWidgetBandsChangeDual = event => {
        this.setState({widgetBandsDual: event.target.value.replace(/\s/g, "")});
    };

    onWidgetMinChangeDual = event => {
        this.setState({widgetMinDual: event.target.value});
    };

    onWidgetMaxChangeDual = event => {
        this.setState({widgetMaxDual: event.target.value});
    };

    onWidgetCloudScoreChangeDual = event => {
        this.setState({widgetCloudScoreDual: event.target.value});
    };

    onStartDateChangedDual = event => {
        this.setState({
            startDateDual: event.target ? event.target.value : ""
        }, () => this.setFormStateByDates(true));
    };

    onEndDateChangedDual = event => {
        this.setState({
            endDateDual: event.target ? event.target.value : ""
        }, () => this.setFormStateByDates(true));
    };

    onDataTypeSelectChangedDual = event => {
        this.setState({
            availableBandsDual: "",
            selectedDataTypeDual: event.target.value.trim(),
            formReady: true
        });
    };

    setFormStateByDates = isDual => {
        const ed = isDual ? new Date(this.state.endDateDual) : new Date(this.state.endDate);
        const sd = isDual ? new Date(this.state.startDateDual) : new Date(this.state.startDate);
        let isFormReady = null;
        if (!this.state.dualLayer) {
            isFormReady = ed > sd && this.state.formReady !== true
                ? true
                : ed < sd && this.state.formReady === true
                    ? false : null;
        } else {
            const ed2 = new Date(this.state.endDate2);
            const sd2 = new Date(this.state.startDate2);
            isFormReady = ed > sd
                && ed2 > sd2
                && this.state.formReady !== true
                ? true
                : (ed < sd || ed2 < sd2)
                        && this.state.formReady === true
                    ? false : null;
        }
        if (isFormReady !== null) {
            this.setState({formReady: isFormReady});
        }
    };

    onStartDate2Changed = event => {
        this.setState({
            startDate2: event.target ? event.target.value : ""
        }, this.setFormStateByDates);
    };

    onEndDate2Changed = event => {
        this.setState({
            endDate2: event.target ? event.target.value : ""
        }, this.setFormStateByDates);
    };

    getProjectList = () => {
        fetch("/get-template-projects")
            .then(response => (response.ok ? response.json() : Promise.reject(response)))
            .then(data => this.setState({projectList: data}))
            .catch(response => {
                console.log(response);
                alert("Error retrieving the project list. See console for details.");
            });
    };

    setWidgetLayoutTemplate = id => {
        this.setState({selectedProjectId: id});
        this.state.widgets.forEach(widget => {
            this.deleteWidgetFromServer(widget);
        });
        this.getWidgetTemplateByProjectId(id);
    };

    fetchProject = (id, setDashboardID) => fetch(this.state.theURI + "/get-by-projid?projectId=" + id)
        .then(response => (response.ok ? response.json() : Promise.reject(response)))
        .then(data => {
            this.setState({
                dashboardID: setDashboardID ? data.dashboardID : this.state.dashboardID,
                widgets: data.widgets,
                layout: data.widgets.map(dw => ({...dw.layout, minW: 3, w: Math.max(dw.layout.w, 3)}))
            });
        });

    getWidgetTemplateByProjectId = id => {
        this.fetchProject(id)
            .then(() => {
                this.state.widgets.forEach(widget => {
                    this.addTemplateWidget(widget);
                });
            })
            .catch(response => {
                console.log(response);
                alert("Error downloading the widget list. See console for details.");
            });
    };

    addTemplateWidget = widget => {
        fetch(this.state.theURI + "/create-widget",
              {
                  method: "POST",
                  headers: {
                      "Accept": "application/json",
                      "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                      projectId: this.state.projectId,
                      dashID: this.state.dashboardID,
                      widgetJSON: JSON.stringify(widget)
                  })
              })
            .catch(response => {
                console.log(response);
            });
    };

    getNewWidgetForm = () => (this.props.addDialog
        ? (
            <>
                <div className="modal fade show" style={{display: "block"}}>
                    <div className="modal-dialog" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title" id="exampleModalLabel">Create Widget</h5>
                                <button
                                    aria-label="Close"
                                    className="close"
                                    data-dismiss="modal"
                                    onClick={this.onCancelNewWidget}
                                    type="button"
                                >
                                    <span aria-hidden="true">×</span>
                                </button>
                            </div>
                            <div className="modal-body">
                                <form>
                                    <div className="form-group">
                                        <label htmlFor="widgetTypeSelect">Type</label>
                                        <select
                                            className="form-control"
                                            id="widgetTypeSelect"
                                            name="widgetTypeSelect"
                                            onChange={e => this.onWidgetTypeSelectChanged(e, "i am anything")}
                                            value={this.state.selectedWidgetType}
                                        >
                                            <option value="-1">Please select type</option>
                                            <option
                                                label="Image Collection"
                                                value="ImageCollection"
                                            >
                                                    Image Collection
                                            </option>
                                            <option
                                                label="Time Series Graph"
                                                value="TimeSeries"
                                            >
                                                    Time Series Graph
                                            </option>
                                            <option
                                                label="Statistics"
                                                value="statistics"
                                            >
                                                    Statistics
                                            </option>
                                            <option
                                                label="Dual Image Collection"
                                                value="DualImageCollection"
                                            >
                                                    Dual Image Collection
                                            </option>
                                            <option
                                                label="Image Asset"
                                                value="imageAsset"
                                            >
                                                    Image Asset
                                            </option>
                                            <option
                                                label="Image Collection Asset"
                                                value="imageCollectionAsset"
                                            >
                                                    Image Collection Asset
                                            </option>
                                            <option
                                                label="SRTM Digital Elevation Data 30m"
                                                value="ImageElevation"
                                            >
                                                    SRTM Digital Elevation Data 30m
                                            </option>
                                            <option
                                                label="Degradation Tool"
                                                value="DegradationTool"
                                            >
                                                    Degradation Tool
                                            </option>
                                            <option
                                                label="Polygon Compare"
                                                value="polygonCompare"
                                            >
                                                    Polygon Compare
                                            </option>
                                        </select>
                                    </div>
                                    {this.getBasemapSelector()}
                                    {this.getDataTypeSelectionControl()}
                                    {this.getSwipeOpacityDefault()}
                                    {this.getDataForm()}
                                </form>
                            </div>
                            <div className="modal-footer">
                                {this.getFormButtons()}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="modal-backdrop fade show"> </div>
            </>
        ) : this.props.copyDialog
            ? (
                <>
                    <div className="modal fade show" style={{display: "block"}}>
                        <div className="modal-dialog" role="document">
                            <div className="modal-content">
                                <div className="modal-header">
                                    <h5
                                        className="modal-title"
                                        id="exampleModalLabel"
                                    >Copy Widget Layout
                                    </h5>
                                    <button
                                        aria-label="Close"
                                        className="close"
                                        data-dismiss="modal"
                                        onClick={this.onCancelNewWidget}
                                        type="button"
                                    >
                                        <span aria-hidden="true">×</span>
                                    </button>
                                </div>
                                <div className="modal-body">
                                    <form>
                                        <div className="form-group">
                                            <label
                                                htmlFor="project-filter"
                                            >Template Filter (Name or ID)
                                            </label>
                                            <input
                                                className="form-control form-control-sm"
                                                id="project-filter"
                                                onChange={e => this.setState({projectFilter: e.target.value})}
                                                type="text"
                                                value={this.state.projectFilter}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="project-template">From Project</label>
                                            <select
                                                className="form-control form-control-sm"
                                                id="project-template"
                                                name="project-template"
                                                onChange={e => this.setWidgetLayoutTemplate(parseInt(e.target.value))}
                                                size="1"
                                                value={this.state.selectedProjectId}
                                            >
                                                <option key={0} value={0}>None</option>
                                                {this.state.projectList
                                                    .filter(({id, name}) => (id + name.toLocaleLowerCase())
                                                        .includes(this.state.projectFilter.toLocaleLowerCase()))
                                                    .map(({id, name}) =>
                                                        <option key={id} value={id}>{id} - {name}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <span>
                                                Warning, selecting a template project will overwrite
                                                existing widgets immediately.
                                            </span>
                                        </div>
                                    </form>
                                </div>
                                <div className="modal-footer">
                                    <button
                                        className="btn btn-secondary"
                                        data-dismiss="modal"
                                        onClick={this.onCancelNewWidget}
                                        type="button"
                                    >Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="modal-backdrop fade show"> </div>
                </>
            ) : "");

    getFormButtons = () => (
        <>
            <button
                className="btn btn-secondary"
                data-dismiss="modal"
                onClick={this.onCancelNewWidget}
                type="button"
            >Cancel
            </button>
            <button
                className="btn btn-primary"
                disabled={!this.state.formReady}
                onClick={this.onCreateNewWidget}
                type="button"
            >Create
            </button>
        </>
    );

    getBasemapSelector = () => {
        if (["ImageCollection",
             "DualImageCollection",
             "imageAsset",
             "imageCollectionAsset",
             "ImageElevation",
             "DegradationTool",
             "polygonCompare"].includes(this.state.selectedWidgetType)) {
            return (
                <div className="form-group">
                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                        <label htmlFor="widgetIndicesSelect">Basemap</label>
                        <button
                            className="btn btn-sm btn-secondary mb-1"
                            onClick={() => this.getInstitutionImagery(this.state.institutionID)}
                            type="button"
                        >
                            Refresh
                        </button>
                    </div>
                    <select
                        className="form-control"
                        id="widgetIndicesSelect"
                        name="widgetIndicesSelect"
                        onChange={this.onDataBasemapSelectChanged}
                        value={this.state.widgetBasemap}
                    >
                        {this.state.imagery && this.state.imagery
                            .map(({id, title}) => <option key={id} value={id}>{title}</option>)}
                    </select>
                </div>
            );
        }
    };

    getDataTypeSelectionControl = () => {
        if (["-1", "imageAsset", "imageCollectionAsset", "ImageElevation", "DegradationTool"].includes(this.state.selectedWidgetType)) {
            return <br/>;
        } else if (this.state.selectedWidgetType === "statistics") {
            return (
                <div className="form-group">
                    <label htmlFor="widgetTitle">Title</label>
                    <input
                        className="form-control"
                        id="widgetTitle"
                        name="widgetTitle"
                        onChange={this.onWidgetTitleChange}
                        placeholder="Enter title"
                        type="text"
                        value={this.state.widgetTitle}
                    />
                </div>
            );
        } else if (this.state.selectedWidgetType === "ImageCollection") {
            return (
                <>
                    <label htmlFor="widgetIndicesSelect">Data</label>
                    <select
                        className="form-control"
                        id="widgetIndicesSelect"
                        name="widgetIndicesSelect"
                        onChange={this.onDataTypeSelectChanged}
                        value={this.state.selectedDataType}
                    >
                        <option className="" value="-1">Please select type</option>
                        <option label="NDVI" value="NDVI">NDVI</option>
                        <option label="EVI" value="EVI">EVI</option>
                        <option label="EVI 2" value="EVI2">EVI 2</option>
                        <option label="NDMI" value="NDMI">NDMI</option>
                        <option label="NDWI" value="NDWI">NDWI</option>
                        <option label="LANDSAT 5" value="LANDSAT5">LANDSAT 5</option>
                        <option label="LANDSAT 7" value="LANDSAT7">LANDSAT 7</option>
                        <option label="LANDSAT 8" value="LANDSAT8">LANDSAT 8</option>
                        <option label="Sentinel-2" value="Sentinel2">Sentinel-2</option>
                        <option label="Custom widget" value="Custom">Custom widget</option>
                    </select>
                </>
            );
        } else if (this.state.selectedWidgetType === "DualImageCollection") {
            if (this.state.wizardStep === 1) {
                return (
                    <>
                        <h3 className="mt-4 text-center text-info">Dual imageCollection Step 1</h3>
                        <label htmlFor="widgetIndicesSelect">Data</label>
                        <select
                            className="form-control"
                            id="widgetIndicesSelect"
                            name="widgetIndicesSelect"
                            onChange={this.onDataTypeSelectChanged}
                            value={this.state.selectedDataType}
                        >
                            <option className="" value="-1">Please select type</option>
                            <option label="NDVI" value="NDVI">NDVI</option>
                            <option label="EVI" value="EVI">EVI</option>
                            <option label="EVI 2" value="EVI2">EVI 2</option>
                            <option label="NDMI" value="NDMI">NDMI</option>
                            <option label="NDWI" value="NDWI">NDWI</option>
                            <option label="LANDSAT 5" value="LANDSAT5">LANDSAT 5</option>
                            <option label="LANDSAT 7" value="LANDSAT7">LANDSAT 7</option>
                            <option label="LANDSAT 8" value="LANDSAT8">LANDSAT 8</option>
                            <option label="Sentinel-2" value="Sentinel2">Sentinel-2</option>
                            <option label="Image Asset" value="imageAsset">Image Asset</option>
                            <option label="Image Collection Asset" value="imageCollectionAsset">Image Collection Asset</option>
                            <option label="Custom widget" value="Custom">Custom widget</option>
                        </select>
                    </>
                );
            } else {
                return (
                    <>

                        <h3 className="mt-4 text-center text-info">Dual imageCollection Step 2</h3>
                        <label htmlFor="widgetIndicesSelect2">Data 2</label>
                        <select
                            className="form-control"
                            id="widgetIndicesSelect"
                            name="widgetIndicesSelect2"
                            onChange={this.onDataTypeSelectChangedDual}
                            value={this.state.selectedDataTypeDual}
                        >
                            <option className="" value="-1">Please select type</option>
                            <option label="NDVI" value="NDVI">NDVI 2</option>
                            <option label="EVI" value="EVI">EVI</option>
                            <option label="EVI 2" value="EVI2">EVI 2</option>
                            <option label="NDMI" value="NDMI">NDMI</option>
                            <option label="NDWI" value="NDWI">NDWI</option>
                            <option label="LANDSAT 5" value="LANDSAT5">LANDSAT 5</option>
                            <option label="LANDSAT 7" value="LANDSAT7">LANDSAT 7</option>
                            <option label="LANDSAT 8" value="LANDSAT8">LANDSAT 8</option>
                            <option label="Sentinel-2" value="Sentinel2">Sentinel-2</option>
                            <option label="Image Asset" value="imageAsset">Image Asset</option>
                            <option label="Image Collection Asset" value="imageCollectionAsset">Image Collection Asset</option>
                            <option label="Custom widget" value="Custom">Custom widget</option>
                        </select>

                    </>
                );
            }
        } else if (this.state.selectedWidgetType === "polygonCompare") {
            return "";
        } else {
            return (
                <>
                    <label htmlFor="widgetIndicesSelect">Data</label>
                    <select
                        className="form-control"
                        id="widgetIndicesSelect"
                        name="widgetIndicesSelect"
                        onChange={this.onDataTypeSelectChanged}
                        value={this.state.selectedDataType}
                    >
                        <option className="" value="-1">Please select type</option>
                        <option label="NDVI" value="NDVI">NDVI</option>
                        <option label="EVI" value="EVI">EVI</option>
                        <option label="EVI 2" value="EVI2">EVI 2</option>
                        <option label="NDMI" value="NDMI">NDMI</option>
                        <option label="NDWI" value="NDWI">NDWI</option>
                        <option label="Custom widget" value="Custom">Custom widget</option>
                    </select>
                </>
            );
        }
    };

    getTitleBlock = () => (
        <div className="form-group">
            <label htmlFor="widgetTitle">Title</label>
            <input
                className="form-control"
                id="widgetTitle"
                name="widgetTitle"
                onChange={this.onWidgetTitleChange}
                placeholder="Enter title"
                type="text"
                value={this.state.widgetTitle}
            />
        </div>
    );

    getSwipeOpacityDefault = () => (this.state.selectedWidgetType === "DualImageCollection"
        ? (
            <div className="form-group">
                <label htmlFor="SwipeOpacityDefault">Swipe as default</label>
                <input
                    checked={this.state.swipeAsDefault}
                    className="form-control widgetWizardCheckbox"
                    id="SwipeOpacityDefault"
                    onChange={this.onswipeAsDefaultChange}
                    type="checkbox"
                />
            </div>
        )
        : "");

    getImageParamsBlock = () => (
        <div className="form-group">
            <label htmlFor="imageParams">Image Parameters (json format)</label>
            <textarea
                className="form-control"
                onChange={this.onImageParamsChange}
                placeholder={"{\"bands\": \"B4, B3, B2\", \n\"min\":0, \n\"max\": 0.3}"}
                rows="4"
                style={{overflow: "hidden", overflowWrap: "break-word", resize: "vertical"}}
                value={this.state.imageParams}
            />
        </div>
    );

    getInstitutionImageryInfo = () => (
        <div>
        Adding imagery to basemaps is available on the&nbsp;
            <a href={`/review-institution?institutionId=${this.state.institutionID}`} rel="noreferrer noopener" target="_blank">
            institution review page
            </a>
        &nbsp;in the imagery tab.
        </div>
    );

    getNextStepButton = () => (this.state.selectedWidgetType === "DualImageCollection"
        ? (
            <button
                className="btn btn-secondary"
                data-dismiss="modal"
                onClick={this.onNextWizardStep}
                type="button"
            >
                Step 2 &rArr;
            </button>
        ) : "");

    getDualImageCollectionTimeSpanOption = () => {
        if (this.state.selectedWidgetType === "DualImageCollection") {
            return (
                <div className="form-group">
                    <label htmlFor="widgetDualLayer">Dual time span</label>
                    <input
                        checked={this.state.dualLayer}
                        className="form-control widgetWizardCheckbox"
                        id="widgetDualLayer"
                        name="widgetDualLayer"
                        onChange={this.onWidgetDualLayerChange}
                        type="checkbox"
                    />
                </div>
            );
        }
    };

    getDateRangeControl = () => (
        <div className="input-group input-daterange" id="range_new_cooked">
            <input
                className="form-control"
                id="sDate_new_cooked"
                onChange={this.onStartDateChanged}
                placeholder="YYYY-MM-DD"
                type="date"
                value={this.state.startDate}
            />
            <div className="input-group-addon">to</div>
            <input
                className="form-control"
                id="eDate_new_cooked"
                onChange={this.onEndDateChanged}
                placeholder="YYYY-MM-DD"
                type="date"
                value={this.state.endDate}
            />
        </div>
    );

    getDualLayerDateRangeControl = () => ((this.state.dualLayer === true)
        ? (
            <div>
                <label>Select the Date Range for the top layer</label>
                <div className="input-group input-daterange" id="range_new_cooked2">
                    <input
                        className="form-control"
                        id="sDate_new_cooked2"
                        onChange={this.onStartDate2Changed}
                        placeholder="YYYY-MM-DD"
                        type="date"
                        value={this.state.startDate2}
                    />
                    <div className="input-group-addon">to</div>
                    <input
                        className="form-control"
                        id="eDate_new_cooked2"
                        onChange={this.onEndDate2Changed}
                        placeholder="YYYY-MM-DD"
                        type="date"
                        value={this.state.endDate2}
                    />
                </div>
            </div>
        ) : "");

    getAvailableBandsControl = (isDual, isCollection) => (
        <>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <label>Available Bands</label>
                <button className="btn btn-sm btn-secondary mb-1" onClick={() => this.getBandsFromGateway(isDual, isCollection)} type="button">Refresh</button>
            </div>
            <label>{isDual
                ? this.state.availableBandsDual || "Click on refresh to see the Available Bands."
                : this.state.availableBands || "Click on refresh to see the Available Bands."}
            </label>
        </>
    );

    getDataForm = () => {
        if (this.state.selectedWidgetType === "ImageElevation") {
            return (
                <>
                    {this.getTitleBlock()}
                    {this.getImageParamsBlock()}
                </>
            );
        }
        if (this.state.selectedWidgetType === "polygonCompare") {
            return (
                <>
                    {this.getTitleBlock()}
                    <div className="form-group">
                        <label htmlFor="featureCollection">GEE Feature Collection Asset</label>
                        <input
                            className="form-control"
                            id="featureCollection"
                            name="featureCollection"
                            onChange={this.onFeatureCollectionChange}
                            placeholder="users/username/collectionName"
                            type="text"
                            value={this.state.featureCollection}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="matchField">Field to match PLOTID</label>
                        <input
                            className="form-control"
                            id="matchField"
                            name="matchField"
                            onChange={this.onMatchFieldChange}
                            placeholder="OBJECTID"
                            type="text"
                            value={this.state.matchField}
                        />
                    </div>
                    {this.getImageParamsBlock()}
                </>
            );
        }
        if (this.state.selectedWidgetType === "DegradationTool") {
            return (
                <>
                    {this.getTitleBlock()}
                    <div>
                        <label>Available Bands: </label><br/>
                        <label>SWIR1,NIR,RED,GREEN,BLUE,SWIR2,NDFI</label>
                    </div>
                    <div className="form-group">
                        <label htmlFor="graphBand">Band to graph</label>
                        <select
                            className="form-control"
                            id="graphBandDegSelect"
                            name="graphBandDeg"
                            onChange={this.onGraphBandDegChange}
                            value={this.state.graphBandDeg}
                        >
                            <option label="NDFI" value="NDFI">NDFI</option>
                            <option label="SWIR1" value="SWIR1">SWIR1</option>
                            <option label="NIR" value="NIR">NIR</option>
                            <option label="RED" value="RED">RED</option>
                            <option label="GREEN" value="GREEN">GREEN</option>
                            <option label="BLUE" value="BLUE">BLUE</option>
                            <option label="SWIR2" value="SWIR2">SWIR2</option>
                        </select>
                    </div>
                    <label>Select the Date Range you would like</label>
                    {this.getDateRangeControl()}
                </>
            );
        }
        if (this.state.selectedWidgetType === "imageAsset" || this.state.selectedWidgetType === "imageCollectionAsset") {
            const [label, placeholder, isCollection] = this.state.selectedWidgetType === "imageAsset"
                ? ["GEE Image Asset", "LANDSAT/LC8_L1T_TOA/LC81290502015036LGN00", false]
                : ["GEE Collection Image Asset", "LANDSAT/LC8_L1T_TOA", true];
            return (
                <>
                    {this.getTitleBlock()}
                    <div className="form-group">
                        <label htmlFor="imageCollection">{label}</label>
                        <input
                            className="form-control"
                            id="imageCollection"
                            name="imageCollection"
                            onChange={this.onImageCollectionChange}
                            placeholder={placeholder}
                            type="text"
                            value={this.state.imageCollection}
                        />
                    </div>
                    {this.getAvailableBandsControl(false, isCollection)}
                    {this.getImageParamsBlock()}
                    {this.getInstitutionImageryInfo()}
                </>
            );
        } else if (this.state.selectedDataType === "-1") {
            return "";
        } else if (["LANDSAT5", "LANDSAT7", "LANDSAT8", "Sentinel2"].includes(this.state.selectedDataType) && this.state.wizardStep === 1) {
            // need to get available bands
            return (
                <>
                    {this.getTitleBlock()}
                    <label>Select the Date Range you would like</label>
                    {this.getDateRangeControl()}
                    {this.getDualImageCollectionTimeSpanOption()}
                    {this.getDualLayerDateRangeControl()}
                    {this.getAvailableBandsControl(false, true)}
                    <div className="form-group">
                        <label htmlFor="widgetBands">Bands</label>
                        <input
                            className="form-control"
                            id="widgetBands"
                            name="widgetBands"
                            onChange={this.onWidgetBandsChange}
                            placeholder="xx,xx,xx"
                            type="text"
                            value={this.state.widgetBands}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="widgetMin">Min</label>
                        <input
                            className="form-control"
                            id="widgetMin"
                            name="widgetMin"
                            onChange={this.onWidgetMinChange}
                            placeholder="-1"
                            type="text"
                            value={this.state.widgetMin}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="widgetMax">Max</label>
                        <input
                            className="form-control"
                            id="widgetMax"
                            name="widgetMax"
                            onChange={this.onWidgetMaxChange}
                            placeholder="100"
                            type="text"
                            value={this.state.widgetMax}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="widgetCloudScore">Cloud Score</label>
                        <input
                            className="form-control"
                            id="widgetCloudScore"
                            name="widgetCloudScore"
                            onChange={this.onWidgetCloudScoreChange}
                            placeholder="90"
                            type="text"
                            value={this.state.widgetCloudScore}
                        />
                    </div>
                    {this.getNextStepButton()}
                </>
            );
        } else if (["LANDSAT5", "LANDSAT7", "LANDSAT8", "Sentinel2"].includes(this.state.selectedDataTypeDual) && this.state.wizardStep === 2) {
            return (
                <>
                    <label>Select the Date Range you would like</label>
                    <div className="input-group input-daterange" id="range_new_cooked">
                        <input
                            className="form-control"
                            id="sDate_new_cookedDual"
                            onChange={this.onStartDateChangedDual}
                            placeholder="YYYY-MM-DD"
                            type="date"
                            value={this.state.startDateDual}
                        />
                        <div className="input-group-addon">to</div>
                        <input
                            className="form-control"
                            id="eDate_new_cookedDual"
                            onChange={this.onEndDateChangedDual}
                            placeholder="YYYY-MM-DD"
                            type="date"
                            value={this.state.endDateDual}
                        />
                    </div>
                    {this.getAvailableBandsControl(true, true)}
                    <div className="form-group">
                        <label htmlFor="widgetBands">Bands</label>
                        <input
                            className="form-control"
                            id="widgetBands"
                            name="widgetBands"
                            onChange={this.onWidgetBandsChangeDual}
                            type="text"
                            value={this.state.widgetBandsDual}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="widgetMin">Min</label>
                        <input
                            className="form-control"
                            id="widgetMin"
                            name="widgetMin"
                            onChange={this.onWidgetMinChangeDual}
                            type="text"
                            value={this.state.widgetMinDual}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="widgetMax">Max</label>
                        <input
                            className="form-control"
                            id="widgetMax"
                            name="widgetMax"
                            onChange={this.onWidgetMaxChangeDual}
                            type="text"
                            value={this.state.widgetMaxDual}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="widgetCloudScore">Cloud Score</label>
                        <input
                            className="form-control"
                            id="widgetCloudScore"
                            name="widgetCloudScore"
                            onChange={this.onWidgetCloudScoreChangeDual}
                            type="text"
                            value={this.state.widgetCloudScoreDual}
                        />
                    </div>
                    <button
                        className="btn btn-secondary"
                        data-dismiss="modal"
                        onClick={this.onPrevWizardStep}
                        type="button"
                    >
                        &lArr; Step 1
                    </button>
                </>
            );
        } else if (((this.state.selectedDataType === "imageCollectionAsset"
                        || this.state.selectedDataType === "imageAsset")
                        && this.state.selectedWidgetType === "DualImageCollection")
                        && this.state.wizardStep === 1) {
            const [label, placeholder, isCollection] = this.state.selectedWidgetType === "imageAsset"
                ? ["GEE Image Asset", "LANDSAT/LC8_L1T_TOA/LC81290502015036LGN00", false]
                : ["GEE Collection Image Asset", "LANDSAT/LC8_L1T_TOA", true];
            return (
                <>
                    {this.getTitleBlock()}
                    <div className="form-group">
                        <label htmlFor="imageCollection">{label}</label>
                        <input
                            className="form-control"
                            id="imageCollection"
                            name="imageCollection"
                            onChange={this.onImageCollectionChange}
                            placeholder={placeholder}
                            type="text"
                            value={this.state.imageCollection}
                        />
                    </div>
                    {this.getAvailableBandsControl(false, isCollection)}
                    <div className="form-group">
                        <label htmlFor="imageParams">Image Parameters (json format)</label>
                        <textarea
                            className="form-control"
                            onChange={this.onImageParamsChange}
                            placeholder={"{\"bands\": \"B4, B3, B2\", \n\"min\":0, \n\"max\": 0.3}"}
                            rows="4"
                            style={{overflow: "hidden", overflowWrap: "break-word", resize: "vertical"}}
                            value={this.state.imageParams}
                        />
                    </div>
                    {this.getInstitutionImageryInfo()}
                    {this.getNextStepButton()}
                </>
            );
        } else if (((this.state.selectedDataTypeDual === "imageCollectionAsset"
                        || this.state.selectedDataTypeDual === "imageAsset")
                        && this.state.selectedWidgetType === "DualImageCollection")
                        && this.state.wizardStep === 2) {
            const [label, placeholder, isCollection] = this.state.selectedWidgetType === "imageAsset"
                ? ["GEE Image Asset", "LANDSAT/LC8_L1T_TOA/LC81290502015036LGN00", false]
                : ["GEE Collection Image Asset", "LANDSAT/LC8_L1T_TOA", true];
            return (
                <>
                    <div className="form-group">
                        <label htmlFor="imageCollection">{label}</label>
                        <input
                            className="form-control"
                            id="imageCollection"
                            name="imageCollection"
                            onChange={this.onImageCollectionChangeDual}
                            placeholder={placeholder}
                            type="text"
                            value={this.state.imageCollectionDual}
                        />
                    </div>
                    {this.getAvailableBandsControl(true, isCollection)}
                    <div className="form-group">
                        <label htmlFor="imageParams">Image Parameters (json format)</label>
                        <textarea
                            className="form-control"
                            onChange={this.onImageParamsChangeDual}
                            placeholder={"{\"bands\": \"B4, B3, B2\", \n\"min\":0, \n\"max\": 0.3}"}
                            rows="4"
                            style={{overflow: "hidden", overflowWrap: "break-word", resize: "vertical"}}
                            value={this.state.imageParamsDual}
                        />
                    </div>
                    {this.getInstitutionImageryInfo()}
                    <button
                        className="btn btn-secondary"
                        data-dismiss="modal"
                        onClick={this.onPrevWizardStep}
                        type="button"
                    >
                        &lArr; Step 1
                    </button>
                </>
            );
        } else if ((this.state.selectedWidgetType === "ImageCollection"
                        || this.state.selectedWidgetType === "DualImageCollection")
                        && this.state.selectedDataType === "Custom"
                        && this.state.wizardStep === 1) {
            return (
                <>
                    {this.getTitleBlock()}
                    <div className="form-group">
                        <label htmlFor="imageCollection">GEE Image Collection</label>
                        <input
                            className="form-control"
                            id="imageCollection"
                            name="imageCollection"
                            onChange={this.onImageCollectionChange}
                            placeholder="LANDSAT/LC8_L1T_TOA"
                            type="text"
                            value={this.state.imageCollection}
                        />
                    </div>
                    {this.getAvailableBandsControl(false, true)}
                    <div className="form-group">
                        <label htmlFor="imageParams">Image Parameters (json format)</label>
                        <textarea
                            className="form-control"
                            onChange={this.onImageParamsChange}
                            placeholder={"{\"bands\": \"B4, B3, B2\", \n\"min\":0, \n\"max\": 0.3}"}
                            rows="4"
                            style={{overflow: "hidden", overflowWrap: "break-word", resize: "vertical"}}
                            value={this.state.imageParams}
                        />

                    </div>
                    <label>Select the Date Range you would like</label>
                    {this.getDateRangeControl()}
                    {this.getInstitutionImageryInfo()}
                    {this.getNextStepButton()}
                </>
            );
        } else if ((this.state.selectedWidgetType === "ImageCollection"
                        || this.state.selectedWidgetType === "DualImageCollection")
                        && this.state.selectedDataTypeDual === "Custom"
                        && this.state.wizardStep === 2) {
            return (
                <>
                    <div className="form-group">
                        <label htmlFor="imageCollection">GEE Image Collection</label>
                        <input
                            className="form-control"
                            id="imageCollection"
                            name="imageCollection"
                            onChange={this.onImageCollectionChangeDual}
                            placeholder="LANDSAT/LC8_L1T_TOA"
                            type="text"
                            value={this.state.imageCollectionDual}
                        />
                    </div>
                    {this.getAvailableBandsControl(true, true)}
                    <div className="form-group">
                        <label htmlFor="imageParams">Image Parameters (json format)</label>
                        <textarea
                            className="form-control"
                            onChange={this.onImageParamsChangeDual}
                            placeholder={"{\"bands\": \"B4, B3, B2\", \n\"min\":0, \n\"max\": 0.3}"}
                            rows="4"
                            style={{overflow: "hidden", overflowWrap: "break-word", resize: "vertical"}}
                            value={this.state.imageParamsDual}
                        />

                    </div>
                    <label>Select the Date Range you would like</label>
                    <div className="input-group input-daterange form-group" id="range_new_cooked">
                        <input
                            className="form-control"
                            id="sDate_new_cookedDual"
                            onChange={this.onStartDateChangedDual}
                            placeholder="YYYY-MM-DD"
                            type="date"
                            value={this.state.startDateDual}
                        />
                        <div className="input-group-addon">to</div>
                        <input
                            className="form-control"
                            id="eDate_new_cookedDual"
                            onChange={this.onEndDateChangedDual}
                            placeholder="YYYY-MM-DD"
                            type="date"
                            value={this.state.endDateDual}
                        />
                    </div>
                    {this.getInstitutionImageryInfo()}
                    <button
                        className="btn btn-secondary"
                        data-dismiss="modal"
                        onClick={this.onPrevWizardStep}
                        type="button"
                    >
                        &lArr; Step 1
                    </button>
                </>
            );
        } else if ((this.state.selectedWidgetType === "ImageCollection"
                        || this.state.selectedWidgetType === "DualImageCollection")
                        && this.state.wizardStep === 1) {
            if (this.state.dualLayer === true) {
                return (
                    <>
                        {this.getTitleBlock()}
                        <label>Select the Date Range you would like</label>
                        {this.getDateRangeControl()}
                        {this.getDualImageCollectionTimeSpanOption()}
                        <div>
                            <label>Select the Date Range you would like</label>
                            <div className="input-group input-daterange" id="range_new_cooked2">
                                <input
                                    className="form-control"
                                    id="sDate_new_cooked2"
                                    onChange={this.onStartDate2Changed}
                                    placeholder="YYYY-MM-DD"
                                    type="date"
                                    value={this.state.startDate2}
                                />
                                <div className="input-group-addon">to</div>
                                <input
                                    className="form-control"
                                    id="eDate_new_cooked2"
                                    onChange={this.onEndDate2Changed}
                                    placeholder="YYYY-MM-DD"
                                    type="date"
                                    value={this.state.endDate2}
                                />
                            </div>
                        </div>
                        {this.getNextStepButton()}
                    </>
                );
            } else {
                return (
                    <>
                        {this.getTitleBlock()}
                        <label>Select the Date Range you would like</label>
                        {this.getDateRangeControl()}
                        {this.getDualImageCollectionTimeSpanOption()}
                        {this.getNextStepButton()}
                    </>
                );
            }
        } else if ((this.state.selectedWidgetType === "ImageCollection"
                        || this.state.selectedWidgetType === "DualImageCollection")
                        && this.state.wizardStep === 2) {
            return (
                <>
                    <label>Select the Date Range you would like</label>
                    <div className="input-group input-daterange form-group" id="range_new_cooked">
                        <input
                            className="form-control"
                            id="sDate_new_cookedDual"
                            onChange={this.onStartDateChangedDual}
                            placeholder="YYYY-MM-DD"
                            type="date"
                            value={this.state.startDateDual}
                        />
                        <div className="input-group-addon">to</div>
                        <input
                            className="form-control"
                            id="eDate_new_cookedDual"
                            onChange={this.onEndDateChangedDual}
                            placeholder="YYYY-MM-DD"
                            type="date"
                            value={this.state.endDateDual}
                        />
                    </div>
                    <button
                        className="btn btn-secondary"
                        data-dismiss="modal"
                        onClick={this.onPrevWizardStep}
                        type="button"
                    >
                        &lArr; Step 1
                    </button>
                </>
            );
        } else if (this.state.selectedWidgetType === "TimeSeries" && this.state.selectedDataType === "Custom") {
            return (
                <>
                    {this.getTitleBlock()}
                    <div className="form-group">
                        <label htmlFor="imageCollection">GEE Image Collection</label>
                        <input
                            className="form-control"
                            id="imageCollection"
                            name="imageCollection"
                            onChange={this.onImageCollectionChange}
                            placeholder="LANDSAT/LC8_L1T_TOA"
                            type="text"
                            value={this.state.imageCollection}
                        />
                    </div>
                    {this.getAvailableBandsControl(false, true)}
                    <div className="form-group">
                        <label htmlFor="graphBand">Band to graph</label>
                        <input
                            className="form-control"
                            id="graphBand"
                            name="graphBand"
                            onChange={this.onGraphBandChange}
                            placeholder="B5"
                            type="text"
                            value={this.state.graphBand}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="graphReducer">Reducer</label>
                        <select
                            className="form-control"
                            id="widgetIndicesSelect"
                            name="graphReducer"
                            onChange={this.onGraphReducerChanged}
                            value={this.state.graphReducer}
                        >
                            <option label="Min" value="Min">Min</option>
                            <option label="Max" value="Max">Max</option>
                            <option label="Mean" value="Mean">Mean</option>
                        </select>
                    </div>
                    <label>Select the Date Range you would like</label>
                    {this.getDateRangeControl()}
                </>
            );
        } else if (this.state.wizardStep === 2) {
            return <p>Secondary data form here</p>;
        } else {
            console.log("nothing doing!");
            return (
                <>
                    {this.getTitleBlock()}
                    <label>Select the Date Range you would like</label>
                    {this.getDateRangeControl()}
                </>
            );
        }
    };

    onRemoveItem = i => {
        const removedWidget = _.filter(this.state.widgets, w => w.layout.i === i.toString());
        this.deleteWidgetFromServer(removedWidget[0]);
        this.setState({
            widgets: _.reject(this.state.widgets, widget => widget.layout.i === i.toString()),
            layout: _.reject(this.state.layout, layout => layout.i === i.toString())
        });
    };

    sameLayout = (layout1, layout2) => layout1.x === layout2.x
        && layout1.y === layout2.y
        && layout1.h === layout2.h
        && layout1.w === layout2.w;

    onLayoutChange = layout => {
        const newWidgets = this.state.widgets.map((stateWidget, idx) => {
            if (this.sameLayout(stateWidget.layout, layout[idx])) {
                return stateWidget;
            } else {
                const {x, y, h, w, i} = layout[idx];
                const newWidget = {...stateWidget, layout: {x, y, h, w, i}};
                this.serveItUp(`${this.state.theURI}/update-widget?widgetId=${newWidget.id}`, newWidget);
                return newWidget;
            }
        });
        this.setState({
            widgets: newWidgets,
            layout
        });
    };

    render() {
        const {layout} = this.state;
        return (
            <>
                <ReactGridLayout
                    className="layout"
                    cols={12}
                    graphReducer="Min"
                    isDraggable
                    isResizable
                    items={0}
                    layout={layout}
                    onLayoutChange={this.onLayoutChange}
                    rowHeight={300}
                >
                    {this.generateDOM()}
                </ReactGridLayout>
                {this.getNewWidgetForm()}
            </>
        );
    }
}

export function pageInit(args) {
    ReactDOM.render(
        <GeoDashNavigationBar
            page={(addDialog, copyDialog, closeDialogs) => (
                <WidgetLayoutEditor
                    addDialog={addDialog}
                    closeDialogs={closeDialogs}
                    copyDialog={copyDialog}
                />
            )}
            userName={args.userName || ""}
        />,
        document.getElementById("app")
    );
}

import React from "react";

import {mercator} from "../utils/mercator.js";

export default class AOIMap extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            mapConfig: null,
        };
    }

    componentDidMount() {
        if (this.props.context.institutionImagery.length > 0) this.initProjectMap();
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.context.institutionImagery.length > 0
            && this.props.context.institutionImagery !== prevProps.context.institutionImagery) {
            this.initProjectMap();
        }

        const mapChange = prevState.mapConfig !== this.state.mapConfig;
        if (this.state.mapConfig) {
            if (mapChange || prevProps.context.boundary !== this.props.context.boundary) {
                this.updateBoundary();
            }

            if (mapChange || prevProps.context.imageryId !== this.props.context.imageryId) {
                this.updateBaseMapImagery();
            }

            if (mapChange || prevProps.context.plots !== this.props.context.plots) {
                if (this.props.context.plots.length > 0) {
                    this.showPlots();
                } else {
                    this.hidePlots();
                }
            }
        }
    }

    initProjectMap = () => {
        const newMapConfig = mercator.createMap("project-map", [0.0, 0.0], 1, this.props.context.institutionImagery);
        this.setState({mapConfig: newMapConfig}, () => {
            // TODO: These updates may need to move back to didUpdate for RO modes
            this.updateBaseMapImagery();
            if (this.props.context.boundary) this.updateBoundary();
            if (this.props.canDrag) this.showDragBoxDraw();
        });
    };

    updateBaseMapImagery = () => {
        mercator.setVisibleLayer(this.state.mapConfig,
                                 this.props.context.imageryId || this.props.context.institutionImagery[0].id);
    };

    updateBoundary = () => {
        // Display a bounding box with the project's AOI on the map and zoom to it
        mercator.removeLayerById(this.state.mapConfig, "currentAOI");
        if (this.props.context.boundary) {
            mercator.addVectorLayer(
                this.state.mapConfig,
                "currentAOI",
                mercator.geometryToVectorSource(mercator.parseGeoJson(this.props.context.boundary, true)),
                mercator.ceoMapStyles("geom", "yellow")
            );
            mercator.zoomMapToLayer(this.state.mapConfig, "currentAOI");
        }
    };

    showDragBoxDraw = (clearBox) => {
        if (clearBox) mercator.removeLayerById(this.state.mapConfig, "currentAOI");
        const displayDragBoxBounds = (dragBox) => {
            mercator.removeLayerById(this.state.mapConfig, "currentAOI");
            const boundary = mercator.geometryToGeoJSON(dragBox.getGeometry().clone(), "EPSG:4326", "EPSG:3857");
            this.props.context.setProjectState({boundary: boundary});
        };
        mercator.enableDragBoxDraw(this.state.mapConfig, displayDragBoxBounds);
    };

    hideDragBoxDraw = () => {
        mercator.disableDragBoxDraw(this.state.mapConfig);
    }

    showPlots = () => {
        mercator.removeLayerById(this.state.mapConfig, "projectPlots");
        mercator.addVectorLayer(
            this.state.mapConfig,
            "projectPlots",
            mercator.plotsToVectorSource(this.props.context.plots),
            mercator.ceoMapStyles(this.props.context.plotShape, "yellow")
        );
    };

    hidePlots = () => {
        mercator.removeLayerById(this.state.mapConfig, "projectPlots");
    }

    render() {
        return <div id="project-map" style={{height: "25rem", width: "100%"}}>
            {this.props.canDrag &&
                <div className="col small text-center mb-2">
                    Hold CTRL and click-and-drag a bounding box on the map
                </div>
            }
        </div>;
    }
}

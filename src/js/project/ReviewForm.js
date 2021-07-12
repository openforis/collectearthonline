import React from "react";

import AOIMap from "./AOIMap";
import {ImageryReview} from "./ImagerySelection";
import {OverviewReview} from "./Overview";
import {AOIReview, PlotReview} from "./PlotDesign";
import {SampleReview} from "./SampleDesign";
import SurveyCardList from "./SurveyCardList";
import {SurveyRulesList} from "./SurveyRules";
import SvgIcon from "../components/SvgIcon";

import {ProjectContext} from "./constants";

export default function ReviewForm() {
    const context = React.useContext(ProjectContext);
    const renderSectionHeader = (title, step) => (
        <div
            className="header my-2 p-2 d-flex flex-row justify-content-center align-items-center"
            style={{
                background: "#31bab0",
                margin:"0 -15px 10px -15px",
                padding: "1rem",
                fontSize: "1.1rem",
                fontWeight: 500
            }}
        >
            <h2
                className="text-truncate"
                style={{
                    color: "white",
                    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji','Segoe UI Symbol'",
                    fontSize: "1.25rem",
                    margin: "0 1rem"
                }}
            >
                {title}
            </h2>
            <button
                className="btn btn-sm btn-outline-info"
                onClick={() => context.setContextState({designMode: "wizard", wizardStep: step})}
                style={{padding: "0.2rem 0.4rem 0.7rem"}}
                type="button"
            >
                <SvgIcon color="white" icon="edit" size="1rem"/>
            </button>
        </div>
    );

    return (
        <div className="px-2 pb-2" id="project-design-form">
            {renderSectionHeader("Overview", "overview")}
            <OverviewReview/>
            <div id="collection-review">
                {renderSectionHeader("Collection Design", "imagery")}
                <AOIMap canDrag={false} context={context}/>
                <div className="row" style={{borderBottom: "1px solid lightgray"}}>
                    <div className="col-6 pt-3" style={{borderRight: "1px solid lightgray"}}>
                        <h2>Imagery Selection</h2>
                        <ImageryReview/>
                    </div>
                    <div className="col-6 pt-3">
                        <h2>AOI Boundary</h2>
                        <AOIReview/>
                    </div>
                </div>
                <div className="row">
                    <div className="col-6 pt-3" style={{borderRight: "1px solid lightgray"}}>
                        <h2>Plot Design</h2>
                        <PlotReview/>
                    </div>
                    <div className="col-6 pt-3">
                        <h2>Sample Design</h2>
                        <SampleReview/>
                    </div>
                </div>
            </div>
            {renderSectionHeader("Survey Questions", "questions")}
            <div id="survey-review">
                <SurveyCardList {...context} inDesignMode={false}/>
                <SurveyRulesList {...context} inDesignMode={false}/>
            </div>
        </div>
    );
}

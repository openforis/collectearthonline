import React, {Fragment} from "react";

import {UnicodeIcon, removeEnumerator, intersection, isNumber} from "../utils/generalUtils";
import {CollapsibleTitle} from "./FormComponents";
import SurveyQuestionRules from "./SurveyQuestionRules";
import SvgIcon from "./SvgIcon";
import {mercator} from "../utils/mercator";

export class SurveyCollection extends React.Component {
    ruleFunctions = {
        "text-match": this.checkRuleTextMatch,
        "numeric-range": this.checkRuleNumericRange,
        "sum-of-answers": this.checkRuleSumOfAnswers,
        "matching-sums": this.checkRuleMatchingSums,
        "incompatible-answers": this.checkRuleIncompatibleAnswers
    };

    constructor(props) {
        super(props);
        this.state = {
            currentNodeIndex: 0,
            topLevelNodeIds: [],
            showSurveyQuestions: true,
            drawTool: "Point"
        };
    }

    componentDidMount() {
        this.calculateTopLevelNodes();
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.state.currentNodeIndex !== prevState.currentNodeIndex) {
            this.props.setSelectedQuestion(this.getNodeById(this.state.topLevelNodeIds[this.state.currentNodeIndex]));
        }

        if (this.props.selectedQuestion.id !== prevProps.selectedQuestion.id
            && this.props.selectedQuestion.parentQuestion === -1) {
            this.setState({currentNodeIndex: this.state.topLevelNodeIds.indexOf(this.props.selectedQuestion.id)});
        }

        if (prevProps.surveyQuestions !== this.props.surveyQuestions) {
            this.calculateTopLevelNodes();
        }
    }

    calculateTopLevelNodes = () => {
        this.setState({
            topLevelNodeIds: this.props.surveyQuestions
                .filter(sq => sq.parentQuestion === -1)
                .sort((a, b) => a.id - b.id)
                .map(sq => sq.id)
        });
    };

    prevSurveyQuestionTree = () => {
        if (this.state.currentNodeIndex > 0) {
            this.setState({currentNodeIndex: this.state.currentNodeIndex - 1});
        } else {
            alert("There are no previous questions.");
        }
    };

    nextSurveyQuestionTree = () => {
        if (this.state.currentNodeIndex < this.state.topLevelNodeIds.length - 1) {
            this.setState({currentNodeIndex: this.state.currentNodeIndex + 1});
        } else {
            alert("There are no more questions.");
        }
    };

    setSurveyQuestionTree = index => this.setState({currentNodeIndex: index});

    getNodeById = id => this.props.surveyQuestions.find(sq => sq.id === id)
        || {question: "", answers: [], answered: [], visible: []};

    checkAllSubAnswers = currentQuestionId => {
        const {surveyQuestions} = this.props;
        const {visible, answered} = this.getNodeById(currentQuestionId);
        const childQuestions = surveyQuestions.filter(sq => sq.parentQuestion === currentQuestionId);
        return visible.length === answered.length
            && childQuestions.every(cq => this.checkAllSubAnswers(cq.id));
    };

    getTopColor = node => (this.checkAllSubAnswers(node.id)
        ? "0px 0px 6px 4px #3bb9d6 inset"
        : node.answered.length > 0
            ? "0px 0px 6px 4px yellow inset"
            : "0px 0px 6px 4px red inset");

    setDrawTool = newTool => {
        this.setState({drawTool: newTool});
        if (this.props.mapConfig) mercator.changeDrawTool(this.props.mapConfig, "drawLayer", newTool);
    };

    clearAll = drawTool => {
        if (this.props.answerMode === "draw" && confirm("Do you want to clear all samples from the draw area?")) {
            const {mapConfig} = this.props;
            mercator.disableDrawing(mapConfig);
            mercator.removeLayerById(mapConfig, "currentSamples");
            mercator.removeLayerById(mapConfig, "drawLayer");
            mercator.addVectorLayer(mapConfig,
                                    "drawLayer",
                                    null,
                                    mercator.ceoMapStyles("draw", "orange"));
            mercator.enableDrawing(mapConfig, "drawLayer", drawTool);
        } else if (confirm("Do you want to clear all answers?")) {
            this.props.resetPlotValues();
        }
    };

    buttonStyle = selected => ({
        padding: "4px",
        margin: ".25rem",
        ...(selected ? {border: "2px solid black", borderRadius: "4px"} : {})
    });

    unansweredColor = () => (
        <div className="PlotNavigation__change-color d-flex justify-content-center mb-2">
            Unanswered Color
            <div className="form-check form-check-inline">
                <input
                    checked={this.props.unansweredColor === "black"}
                    className="form-check-input ml-2"
                    id="radio1"
                    name="color-radios"
                    onChange={() => this.props.setUnansweredColor("black")}
                    type="radio"
                />
                <label className="form-check-label" htmlFor="radio1">Black</label>
            </div>
            <div className="form-check form-check-inline">
                <input
                    checked={this.props.unansweredColor === "white"}
                    className="form-check-input"
                    id="radio2"
                    name="color-radios"
                    onChange={() => this.props.setUnansweredColor("white")}
                    type="radio"
                />
                <label className="form-check-label" htmlFor="radio2">White</label>
            </div>
        </div>
    );

    checkRuleTextMatch = (surveyRule, questionToSet, answerId, answerText) => {
        if (surveyRule.questionId === questionToSet.id
            && !RegExp(surveyRule.regex).test(answerText)) {
            return `Text match validation failed.\r\n\nPlease enter an answer that matches the expression: ${surveyRule.regex}`;
        } else {
            return null;
        }
    };

    checkRuleNumericRange = (surveyRule, questionToSet, answerId, answerText) => {
        if (surveyRule.questionId === questionToSet.id
            && (!isNumber(answerText)
                || answerText < surveyRule.min
                || answerText > surveyRule.max)) {
            return `Numeric range validation failed.\r\n\n Please select a value between ${surveyRule.min} and ${surveyRule.max}`;
        } else {
            return null;
        }
    };

    checkRuleSumOfAnswers = (surveyRule, questionToSet, answerId, answerText) => {
        if (surveyRule.questions.includes(questionToSet.id)) {
            const answeredQuestions = this.props.surveyQuestions
                .filter(q => surveyRule.questions.includes(q.id) && q.answered.length > 0 && q.id !== questionToSet.id);
            if (surveyRule.questions.length === answeredQuestions.length + 1) {
                const sampleIds = this.props.getSelectedSampleIds(questionToSet);
                const answeredSampleIds = answeredQuestions.map(q => q.answered.map(a => a.sampleId));
                const commonSampleIds = answeredSampleIds.reduce(intersection, sampleIds);
                if (commonSampleIds.length > 0) {
                    return commonSampleIds.map(sampleId => {
                        const answeredSum = answeredQuestions
                            .map(q => q.answered.find(ques => ques.sampleId === sampleId).answerText)
                            .reduce((sum, num) => sum + parseInt(num), 0);
                        if (answeredSum + parseInt(answerText) !== surveyRule.validSum) {
                            return "Sum of answers validation failed.\r\n\n"
                                + `Sum for questions [${surveyRule.questionsText.toString()}] must be ${(surveyRule.validSum).toString()}.\r\n\n`
                                + `An acceptable answer for "${questionToSet.question}" is ${(surveyRule.validSum - answeredSum).toString()}.`;
                        } else {
                            return null;
                        }
                    }).find(res => res !== null);
                } else {
                    return null;
                }
            } else {
                return null;
            }
        } else {
            return null;
        }
    };

    checkRuleMatchingSums = (surveyRule, questionToSet, answerId, answerText) => {
        if (surveyRule.questionSetIds1.includes(questionToSet.id)
                || surveyRule.questionSetIds2.includes(questionToSet.id)) {
            const answeredQuestions1 = this.props.surveyQuestions
                .filter(q => surveyRule.questionSetIds1.includes(q.id)
                    && q.answered.length > 0 && q.id !== questionToSet.id);
            const answeredQuestions2 = this.props.surveyQuestions
                .filter(q => surveyRule.questionSetIds2.includes(q.id)
                    && q.answered.length > 0 && q.id !== questionToSet.id);
            if (surveyRule.questionSetIds1.length + surveyRule.questionSetIds2.length
                    === answeredQuestions1.length + answeredQuestions2.length + 1) {
                const sampleIds = this.props.getSelectedSampleIds(questionToSet);
                const answeredSampleIds1 = answeredQuestions1.map(q => q.answered.map(a => a.sampleId));
                const commonSampleIds1 = answeredSampleIds1.reduce(intersection, sampleIds);
                const answeredSampleIds2 = answeredQuestions2.map(q => q.answered.map(a => a.sampleId));
                const commonSampleIds2 = answeredSampleIds2.reduce(intersection, sampleIds);
                const commonSampleIds = intersection(commonSampleIds1, commonSampleIds2);
                if (commonSampleIds.length > 0) {
                    const sampleSums = commonSampleIds.map(sampleId => {
                        const sum1 = answeredQuestions1
                            .map(q => q.answered.find(a => a.sampleId === sampleId).answerText)
                            .reduce((sum, num) => sum + parseInt(num), 0);
                        const sum2 = answeredQuestions2
                            .map(q => q.answered.find(a => a.sampleId === sampleId).answerText)
                            .reduce((sum, num) => sum + parseInt(num), 0);
                        return [sum1, sum2];
                    });
                    const q1Value = surveyRule.questionSetIds1.includes(questionToSet.id) ? parseInt(answerText) : 0;
                    const q2Value = surveyRule.questionSetIds2.includes(questionToSet.id) ? parseInt(answerText) : 0;
                    const invalidSum = sampleSums.find(sums => sums[0] + q1Value !== sums[1] + q2Value);
                    if (invalidSum) {
                        return "Matching sums validation failed.\r\n\n"
                            + `Totals of the question sets [${surveyRule.questionSetText1.toString()}] and [${surveyRule.questionSetText2.toString()}] do not match.\r\n\n`
                            + `An acceptable answer for "${questionToSet.question}" is ${Math.abs(invalidSum[0] - invalidSum[1])}.`;
                    } else {
                        return null;
                    }
                } else {
                    return null;
                }
            } else {
                return null;
            }
        } else {
            return null;
        }
    };

    checkRuleIncompatibleAnswers = (surveyRule, questionToSet, answerId, _answerText) => {
        if (surveyRule.question1 === questionToSet.id && surveyRule.answer1 === answerId) {
            const ques2 = this.props.surveyQuestions.find(q => q.id === surveyRule.question2);
            if (ques2.answered.some(ans => ans.answerId === surveyRule.answer2)) {
                const ques1Ids = this.props.getSelectedSampleIds(questionToSet);
                const ques2Ids = ques2.answered.filter(ans => ans.answerId === surveyRule.answer2).map(a => a.sampleId);
                const commonSampleIds = intersection(ques1Ids, ques2Ids);
                if (commonSampleIds.length > 0) {
                    return "Incompatible answers validation failed.\r\n\n"
                        + `Answer "${surveyRule.answerText1}" from question "${surveyRule.questionText1}" is incompatible with\r\n`
                        + `answer "${surveyRule.answerText2}" from question "${surveyRule.questionText2}".\r\n\n`;
                } else {
                    return null;
                }
            } else {
                return null;
            }
        } else if (surveyRule.question2 === questionToSet.id && surveyRule.answer2 === answerId) {
            const ques1 = this.props.surveyQuestions.find(q => q.id === surveyRule.question1);
            if (ques1.answered.some(ans => ans.answerId === surveyRule.answer1)) {
                const ques2Ids = this.props.getSelectedSampleIds(questionToSet);
                const ques1Ids = ques1.answered.filter(ans => ans.answerId === surveyRule.answer1).map(a => a.sampleId);
                const commonSampleIds = intersection(ques1Ids, ques2Ids);
                if (commonSampleIds.length > 0) {
                    return "Incompatible answers validation failed.\r\n\n"
                        + `Answer "${surveyRule.answerText2}" from question "${surveyRule.questionText2}" is incompatible with\r\n`
                        + `answer "${surveyRule.answerText1}" from question "${surveyRule.questionText1}".\r\n\n`;
                } else {
                    return null;
                }
            } else {
                return null;
            }
        } else {
            return null;
        }
    };

    rulesViolated = (questionToSet, answerId, answerText) => this.props.surveyRules
        && this.props.surveyRules
            .map(surveyRule => this.ruleFunctions[surveyRule.ruleType](surveyRule, questionToSet, answerId, answerText))
            .find(msg => msg);

    validateAndSetCurrentValue = (questionToSet, answerId, answerText) => {
        const ruleError = this.rulesViolated(questionToSet, answerId, answerText);
        if (ruleError) {
            alert(ruleError);
        } else {
            this.props.setCurrentValue(questionToSet, answerId, answerText);
        }
    };

    renderQuestions = () => (
        <div className="SurveyQuestions__questions mx-1">
            {this.unansweredColor()}
            {this.props.flagged
                ? (
                    <>
                        <div style={{color: "red", fontSize: "1.5rem"}}>This plot has been flagged.</div>
                        <div className="my-2">
                            <div className="slide-container">
                                <label>Flagged Reason</label>
                                <textarea
                                    className="form-control"
                                    onChange={e =>
                                        this.props.setFlaggedReason(e.target.value)}
                                    value={this.props.flaggedReason}
                                />
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="SurveyQuestions__top-questions">
                            <button
                                className="btn btn-outline-lightgreen m-2"
                                disabled={this.state.currentNodeIndex === 0}
                                id="prev-survey-question"
                                onClick={this.prevSurveyQuestionTree}
                                style={{opacity: this.state.currentNodeIndex === 0 ? "0.25" : "1.0"}}
                                type="button"
                            >
                                {"<"}
                            </button>
                            {this.state.topLevelNodeIds.map((nodeId, i) => (
                                <button
                                    key={nodeId}
                                    className="btn btn-outline-lightgreen m-2"
                                    id="top-select"
                                    onClick={() => this.setSurveyQuestionTree(i)}
                                    style={{
                                        boxShadow:
                                    `${(i === this.state.currentNodeIndex)
                                        ? "0px 0px 2px 2px black inset,"
                                        : ""}
                                    ${this.getTopColor(this.getNodeById(nodeId))}`
                                    }}
                                    title={removeEnumerator(this.getNodeById(nodeId).question)}
                                    type="button"
                                >
                                    {i + 1}
                                </button>
                            ))}
                            <button
                                className="btn btn-outline-lightgreen"
                                disabled={this.state.currentNodeIndex === this.state.topLevelNodeIds.length - 1}
                                id="next-survey-question"
                                onClick={this.nextSurveyQuestionTree}
                                style={{
                                    opacity: this.state.currentNodeIndex === this.state.topLevelNodeIds.length - 1
                                        ? "0.25"
                                        : "1.0"
                                }}
                                type="button"
                            >
                                {">"}
                            </button>
                        </div>
                        {this.state.topLevelNodeIds.length > 0 && (
                            <SurveyQuestionTree
                                hierarchyLabel=""
                                selectedQuestion={this.props.selectedQuestion}
                                selectedSampleId={this.props.selectedSampleId}
                                setSelectedQuestion={this.props.setSelectedQuestion}
                                surveyNode={this.getNodeById(this.state.topLevelNodeIds[this.state.currentNodeIndex])}
                                surveyQuestions={this.props.surveyQuestions}
                                surveyRules={this.props.surveyRules}
                                validateAndSetCurrentValue={this.validateAndSetCurrentValue}
                            />
                        )}
                    </>
                )}
        </div>
    );

    renderDrawTools = () => (
        <div style={{display: "flex", flexDirection: "column"}}>
            <div
                onClick={() => this.setDrawTool("Point")}
                style={{alignItems: "center", cursor: "pointer", display: "flex"}}
                title="Click anywhere to add a new point."
            >
                <span style={this.buttonStyle(this.state.drawTool === "Point")}>
                    <SvgIcon icon="point" size="2rem"/>
                </span>
                Point tool
            </div>
            <div
                onClick={() => this.setDrawTool("LineString")}
                style={{alignItems: "center", cursor: "pointer", display: "flex"}}
                title="Click anywhere to start drawing. A new point along the line string can be added with a single click. Right click or double click to finish drawing."
            >
                <span style={this.buttonStyle(this.state.drawTool === "LineString")}>
                    <SvgIcon icon="lineString" size="2rem"/>
                </span>
                LineString tool
            </div>
            <div
                onClick={() => this.setDrawTool("Polygon")}
                style={{alignItems: "center", cursor: "pointer", display: "flex"}}
                title="Click anywhere to start drawing. A new vertex can be added with a singe click. Right click, double click, or complete the polygon to finish drawing."
            >
                <span style={this.buttonStyle(this.state.drawTool === "Polygon")}>
                    <SvgIcon icon="polygon" size="2rem"/>
                </span>
                Polygon tool
            </div>
            <ul style={{textAlign: "left"}}>
                How To:
                <li>To modify an existing feature, hold ctrl and click to drag</li>
                <li>To delete a feature, hold ctrl and right click on it</li>
                <li>To save changes, switch back to question mode and answer remaining questions</li>
            </ul>
        </div>
    );

    renderFlagClearButtons = () => (
        <div className="mb-2 d-flex justify-content-between">
            <input
                className="btn btn-outline-red btn-sm col mr-1"
                onClick={this.props.toggleFlagged}
                type="button"
                value={this.props.flagged ? "Unflag Plot" : "Flag Plot"}
            />
            <input
                className="btn btn-outline-red btn-sm col"
                onClick={this.clearAll}
                type="button"
                value="Clear All"
            />
        </div>
    );

    render() {
        return (
            <fieldset className="justify-content-center text-center">
                <CollapsibleTitle
                    showGroup={this.state.showSurveyQuestions}
                    title="Survey Questions"
                    toggleShow={() => this.setState({showSurveyQuestions: !this.state.showSurveyQuestions})}
                />
                {this.props.allowDrawnSamples && (
                    <div style={{display: "flex", justifyContent: "center"}}>
                        <span
                            onClick={() => this.props.setAnswerMode("question", this.state.drawTool)}
                            style={this.buttonStyle(this.props.answerMode === "question")}
                            title="Answer questions"
                        >
                            <SvgIcon icon="question" size="2rem"/>
                        </span>
                        <span
                            onClick={() => this.props.setAnswerMode("draw", this.state.drawTool)}
                            style={this.buttonStyle(this.props.answerMode === "draw")}
                            title="Draw sample points"
                        >
                            <SvgIcon icon="draw" size="2rem"/>
                        </span>
                    </div>
                )}
                {this.state.showSurveyQuestions
                    ? this.props.surveyQuestions.length > 0
                        ? (
                            <>
                                {this.props.answerMode === "question"
                                    ? this.renderQuestions()
                                    : this.renderDrawTools()}
                                {this.props.collectConfidence && !this.props.flagged && (
                                    <div className="row mb-3">
                                        <div className="col-12">
                                            <div className="slide-container">
                                                <input
                                                    className="slider"
                                                    max="100"
                                                    min="0"
                                                    onChange={e => this.props.setConfidence(parseInt(e.target.value))}
                                                    type="range"
                                                    value={this.props.confidence}
                                                />
                                                <label>Plot Confidence: {this.props.confidence}</label>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {this.renderFlagClearButtons()}
                            </>
                        ) : <h3>This project is missing survey questions!</h3>
                    : null}
            </fieldset>
        );
    }
}

class SurveyQuestionTree extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            showAnswers: true
        };
    }

    toggleShowAnswers = () => this.setState({showAnswers: !this.state.showAnswers});

    render() {
        const {
            hierarchyLabel,
            surveyNode,
            surveyQuestions,
            surveyRules,
            selectedQuestion,
            selectedSampleId,
            setSelectedQuestion,
            validateAndSetCurrentValue
        } = this.props;
        const {showAnswers} = this.state;

        const childNodes = surveyQuestions
            .filter(node => node.parentQuestion === surveyNode.id);

        const shadowColor = surveyNode.answered.length === 0
            ? "0px 0px 6px 4px red inset"
            : surveyNode.answered.length === surveyNode.visible.length
                ? "0px 0px 6px 5px #3bb9d6 inset"
                : "0px 0px 6px 4px yellow inset";

        return (
            <fieldset className="mb-1 justify-content-center text-center">
                <div className="SurveyQuestionTree__question-buttons btn-block my-2 d-flex">
                    <button
                        className="text-center btn btn-outline-lightgreen btn-sm text-bold px-3 py-2 mr-1"
                        onClick={this.toggleShowAnswers}
                        type="button"
                    >
                        {showAnswers ? <span>-</span> : <span>+</span>}
                    </button>
                    <SurveyQuestionRules surveyNodeId={surveyNode.id} surveyRules={surveyRules}/>
                    <button
                        className="text-center btn btn-outline-lightgreen btn-sm col overflow-hidden text-truncate"
                        onClick={() => setSelectedQuestion(surveyNode)}
                        style={{
                            boxShadow: `${(surveyNode.id === selectedQuestion.id)
                                ? "0px 0px 2px 2px black inset,"
                                : ""}
                                    ${shadowColor}`
                        }}
                        title={removeEnumerator(surveyNode.question)}
                        type="button"
                    >
                        {hierarchyLabel + removeEnumerator(surveyNode.question)}
                    </button>
                </div>

                {showAnswers && (
                    <SurveyAnswers
                        selectedSampleId={selectedSampleId}
                        surveyNode={surveyNode}
                        surveyQuestions={surveyQuestions}
                        validateAndSetCurrentValue={validateAndSetCurrentValue}
                    />
                )}
                {childNodes.map(childNode => (
                    <Fragment key={childNode.id}>
                        {surveyQuestions.find(sq => sq.id === childNode.id).visible.length > 0
                        && (
                            <SurveyQuestionTree
                                hierarchyLabel={hierarchyLabel + "- "}
                                selectedQuestion={selectedQuestion}
                                selectedSampleId={selectedSampleId}
                                setSelectedQuestion={setSelectedQuestion}
                                surveyNode={childNode}
                                surveyQuestions={surveyQuestions}
                                validateAndSetCurrentValue={validateAndSetCurrentValue}
                            />
                        )}
                    </Fragment>
                ))}
            </fieldset>
        );
    }
}

function AnswerButton({surveyNode, surveyNode: {answers, answered}, selectedSampleId, validateAndSetCurrentValue}) {
    return (
        <ul className="samplevalue justify-content-center">
            {answers.map(ans => (
                <li key={ans.id} className="mb-1">
                    <button
                        className="btn btn-outline-darkgray btn-sm btn-block pl-1 overflow-hidden text-truncate"
                        id={ans.answer + "_" + ans.id}
                        name={ans.answer + "_" + ans.id}
                        onClick={() => validateAndSetCurrentValue(surveyNode, ans.id, ans.answer)}
                        style={{
                            boxShadow: answered.some(a => a.answerId === ans.id && a.sampleId === selectedSampleId)
                                ? "0px 0px 8px 3px black inset"
                                : answered.some(a => a.answerId === ans.id)
                                    ? "0px 0px 8px 3px grey inset"
                                    : "initial"
                        }}
                        title={ans.answer}
                        type="button"
                    >
                        <div
                            className="circle mr-2"
                            style={{
                                backgroundColor: ans.color,
                                border: "1px solid",
                                float: "left",
                                marginTop: "4px"
                            }}
                        />
                        <span className="small">{ans.answer}</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

function AnswerRadioButton({
    surveyNode,
    surveyNode: {answers, answered},
    selectedSampleId,
    validateAndSetCurrentValue
}) {
    return (
        <ul className="samplevalue justify-content-center">
            {answers.map(ans => (
                <li key={ans.id} className="mb-1">
                    <button
                        className="btn btn-outline-darkgray btn-sm btn-block pl-1 overflow-hidden text-truncate"
                        id={ans.answer + "_" + ans.id}
                        name={ans.answer + "_" + ans.id}
                        onClick={() => validateAndSetCurrentValue(surveyNode, ans.id, ans.answer)}
                        title={ans.answer}
                        type="button"
                    >
                        <div
                            className="circle ml-1"
                            style={{
                                border: "1px solid black",
                                float: "left",
                                marginTop: "4px",
                                boxShadow: "0px 0px 0px 3px " + ans.color,
                                backgroundColor: answered.some(a =>
                                    a.answerId === ans.id && a.sampleId === selectedSampleId)
                                    ? "black"
                                    : answered.some(a => a.answerId === ans.id)
                                        ? "#e8e8e8"
                                        : "white"
                            }}
                        />
                        <span className="small">{ans.answer}</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

class AnswerInput extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            newInput: ""
        };
    }

    componentDidMount() {
        this.resetInputText();
    }

    componentDidUpdate(prevProps) {
        if (this.props.surveyNode.id !== prevProps.surveyNode.id) {
            const matchingNode = this.props.surveyNode.answered
                .find(a => a.answerId === this.props.surveyNode.answers[0].id);
            this.setState({newInput: matchingNode ? matchingNode.answerText : this.defaultVal()});
        }
        if (this.props.selectedSampleId !== prevProps.selectedSampleId) {
            this.resetInputText();
        }
    }

    defaultVal = () => {
        const {dataType} = this.props.surveyNode;
        return dataType === "number" ? 0 : "";
    };

    resetInputText = () => {
        const matchingNode = this.props.surveyNode.answered
            .find(a => a.answerId === this.props.surveyNode.answers[0].id
                  && a.sampleId === this.props.selectedSampleId);
        this.setState({
            newInput: matchingNode ? matchingNode.answerText : this.defaultVal()
        });
    };

    updateInputValue = value => this.setState({newInput: value});

    render() {
        const {surveyNode, surveyNode: {answers, dataType}, validateAndSetCurrentValue} = this.props;
        const {newInput} = this.state;
        return answers[0]
            ? (
                <div className="d-inline-flex">
                    <div className="pr-2 pt-2">
                        <div
                            className="circle"
                            style={{
                                backgroundColor: answers[0].color,
                                border: "1px solid"
                            }}
                        />
                    </div>
                    <input
                        className="form-control mr-2"
                        id={answers[0].answer + "_" + answers[0].id}
                        name={answers[0].answer + "_" + answers[0].id}
                        onChange={e => this.updateInputValue(dataType === "number"
                            ? Number(e.target.value)
                            : e.target.value)}
                        placeholder={answers[0].answer}
                        type={dataType}
                        value={newInput}
                    />
                    <input
                        className="text-center btn btn-outline-lightgreen btn-sm"
                        id="save-input"
                        name="save-input"
                        onClick={() => validateAndSetCurrentValue(surveyNode, answers[0].id, newInput)}
                        type="button"
                        value="Save"
                    />
                </div>
            ) : null;
    }
}

class AnswerDropDown extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            showDropdown: false
        };
    }

    componentDidUpdate(prevProps) {
        if (this.props.surveyNode !== prevProps.surveyNode) {
            this.setState({showDropdown: false});
        }
    }

    toggleDropDown = () => this.setState({showDropdown: !this.state.showDropdown});

    render() {
        const {surveyNode, surveyNode: {answers, answered}, selectedSampleId, validateAndSetCurrentValue} = this.props;
        const {showDropdown} = this.state;
        const options = answers.map((ans, uid) => (
            <div
                key={uid}
                className="d-inline-flex py-2 border-bottom"
                onMouseDown={() => validateAndSetCurrentValue(surveyNode, ans.id, ans.answer)}
                style={{backgroundColor: answered.some(a => a.answerId === ans.id) ? "#e8e8e8" : "#f1f1f1"}}
            >
                <div className="col-1">
                    <span
                        className="dot"
                        style={{
                            height: "15px",
                            width: "15px",
                            backgroundColor: ans.color,
                            borderRadius: "50%",
                            display: "inline-block"
                        }}
                    />
                </div>
                <div className="col-11 text-left">
                    {ans.answer}
                </div>
            </div>
        ));

        return (
            <div className="mb-1 d-flex flex-column align-items-start">
                <div className="dropdown-selector ml-3 d-flex pl-0 col-12">
                    <div className="SelectedItem d-inline-flex border col-8">
                        {answers.map(ans =>
                            answered.some(a =>
                                a.answerId === ans.id && a.sampleId === selectedSampleId) && (
                                <Fragment key={ans.id}>
                                    <div className="col-1 mt-2">
                                        <span
                                            className="dot"
                                            style={{
                                                height: "15px",
                                                width: "15px",
                                                backgroundColor: ans.color,
                                                borderRadius: "50%",
                                                display: "inline-block"
                                            }}
                                        />
                                    </div>
                                    <div className="col-11 text-left mt-1">
                                        {ans.answer}
                                    </div>
                                </Fragment>
                            ))}
                    </div>
                    <button
                        className="dropbtn"
                        onBlur={() => this.setState({showDropdown: false})}
                        onClick={this.toggleDropDown}
                        style={{
                            backgroundColor: "#31BAB0",
                            color: "white",
                            padding: "8px 16px",
                            border: "none",
                            cursor: "pointer"
                        }}
                        type="button"
                    >
                        <UnicodeIcon icon="downCaret"/>
                    </button>
                </div>
                <div
                    className="dropdown-content col-8"
                    id="dropdown-placeholder"
                >
                    <div
                        className="dropdown-content flex-column container"
                        id="myDropdown"
                        style={{
                            display: showDropdown ? "flex" : "none",
                            position: "absolute",
                            backgroundColor: "#f1f1f1",
                            overflow: "auto",
                            boxShadow: "0px 8px 16px 0px rgba(0,0,0,0.2)",
                            zIndex: "10",
                            cursor: "pointer"
                        }}
                    >
                        {options}
                    </div>
                </div>
            </div>
        );
    }
}

function SurveyAnswers(props) {
    const type = (props.surveyNode.componentType || "button").toLowerCase();
    return {
        radiobutton: <AnswerRadioButton {...props}/>,
        input: <AnswerInput {...props}/>,
        dropdown: <AnswerDropDown {...props}/>,
        button: <AnswerButton {...props}/>
    }[type];
}

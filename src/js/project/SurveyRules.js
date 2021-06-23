import React, {useContext} from "react";

import {isNumber, sameContents, UnicodeIcon} from "../utils/generalUtils";
import {ProjectContext} from "./constants";

import {
    EqualToSumRule,
    IncompatibleRule,
    MatchingSumsRule,
    MinMaxRule,
    RegexRule
} from "../components/SurveyQuestionRules";

const getNextId = array => array.reduce((maxId, obj) => Math.max(maxId, obj.id), 0) + 1;

export const SurveyRuleDesign = () => {
    const {setProjectDetails, surveyRules} = useContext(ProjectContext);
    return (
        <div id="survey-rule-design">
            <SurveyRulesList
                inDesignMode
                setProjectDetails={setProjectDetails}
                surveyRules={surveyRules}
            />
            <SurveyRulesForm/>
        </div>
    );
};

export class SurveyRulesList extends React.Component {
    deleteSurveyRule = ruleId => {
        const newSurveyRules = this.props.surveyRules.filter(rule => rule.id !== ruleId);
        this.props.setProjectDetails({surveyRules: newSurveyRules});
    };

    // TODO update the remove buttons with SVG
    removeButton = ruleId => (
        <span
            className="btn btn-sm btn-outline-red px-3 mt-0 mr-3 mb-3"
            onClick={() => this.deleteSurveyRule(ruleId)}
            title="Delete Rule"
        >
            <UnicodeIcon icon="trash"/>
        </span>
    );

    renderRuleRow = r => {
        const {inDesignMode} = this.props;
        return (
            <div key={r.id} style={{display: "flex", alignItems: "center"}}>
                {inDesignMode && this.removeButton(r.id)}
                {(r.questionId
                    ? r.regex
                        ? <RegexRule key={r.id} {...r}/>
                        : <MinMaxRule key={r.id} {...r}/>
                    : r.questions
                        ? <EqualToSumRule key={r.id} {...r}/>
                        : r.questionSetIds1
                            ? <MatchingSumsRule key={r.id} {...r}/>
                            : <IncompatibleRule key={r.id} {...r}/>
                )}
            </div>
        );
    };

    render() {
        const {surveyRules} = this.props;
        return (
            <>
                <h2>Rules</h2>
                {(surveyRules || []).length > 0
                    ? (
                        <div>{surveyRules.map(this.renderRuleRow)}</div>
                    ) : <label className="ml-3">No rules have been created for this survey.</label>}
            </>
        );
    }
}

export class SurveyRulesForm extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            selectedRuleType: "text-match"
        };
    }

    render() {
        const {selectedRuleType} = this.state;
        return (
            <div className="mt-3 d-flex justify-content-center">
                <div style={{display: "flex", flexFlow: "column", width: "25rem"}}>
                    <h2>New Rule</h2>
                    <div className="form-group">
                        <label>Rule Type</label>
                        <select
                            className="form-control form-control-sm"
                            onChange={e => this.setState({selectedRuleType: e.target.value})}
                            value={selectedRuleType}
                        >
                            <option value="text-match">Text Regex Match</option>
                            <option value="numeric-range">Numeric Range</option>
                            <option value="sum-of-answers">Sum of Answers</option>
                            <option value="matching-sums">Matching Sums</option>
                            <option value="incompatible-answers">Incompatible Answers</option>
                        </select>
                    </div>
                    {{
                        "text-match": <TextMatch/>,
                        "numeric-range": <NumericRange/>,
                        "sum-of-answers": <SumOfAnswers/>,
                        "matching-sums": <MatchingSums/>,
                        "incompatible-answers": <IncompatibleAnswers/>
                    }[selectedRuleType]}
                </div>
            </div>
        );
    }
}

export class TextMatch extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            regex: "",
            questionId: -1
        };
    }

    addSurveyRule = () => {
        const {surveyRules, surveyQuestions, setProjectDetails} = this.context;
        const {questionId, regex} = this.state;
        const conflictingRule = surveyRules.find(rule => rule.ruleType === "text-match"
            && rule.questionId === questionId);
        const errorMessages = [
            conflictingRule && "A text regex match rule already exists for this question. (Rule " + conflictingRule.id + ")",
            questionId < 1 && "You must select a question.",
            regex.length === 0 && "The regex string is missing."
        ].filter(m => m);
        if (errorMessages.length > 0) {
            alert(errorMessages.map(s => "- " + s).join("\n"));
        } else {
            setProjectDetails({
                surveyRules: [...surveyRules, {
                    id: getNextId(surveyRules),
                    ruleType: "text-match",
                    questionId,
                    questionsText: [surveyQuestions.find(q => q.id === questionId).question],
                    regex
                }]
            });
        }
    };

    render() {
        const {questionId, regex} = this.state;
        const availableQuestions = this.context.surveyQuestions
            .filter(q => q.componentType === "input" && q.dataType === "text");
        return availableQuestions.length > 0
            ? (
                <>
                    <div className="form-group">
                        <label>Survey Question</label>
                        <select
                            className="form-control form-control-sm"
                            onChange={e => this.setState({questionId: Number(e.target.value)})}
                            value={questionId}
                        >
                            <option value={-1}>- Select Question -</option>
                            {availableQuestions.map(question =>
                                <option key={question.id} value={question.id}>{question.question}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Enter regular expression</label>
                        <input
                            className="form-control form-control-sm"
                            onChange={e => this.setState({regex: e.target.value})}
                            placeholder="Regular expression"
                            type="text"
                            value={regex}
                        />
                    </div>
                    <div className="d-flex justify-content-end">
                        <input
                            className="btn btn-lightgreen"
                            onClick={this.addSurveyRule}
                            type="button"
                            value="Add Survey Rule"
                        />
                    </div>
                </>
            ) : <label>This rule requires a question of type input-text.</label>;
    }
}
TextMatch.contextType = ProjectContext;

export class NumericRange extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            questionId: -1,
            min: 0,
            max: 0
        };
    }

    addSurveyRule = () => {
        const {surveyRules, surveyQuestions, setProjectDetails} = this.context;
        const {questionId, min, max} = this.state;
        const conflictingRule = surveyRules.find(rule => rule.ruleType === "numeric-range"
            && rule.questionId === questionId);
        const errorMessages = [
            conflictingRule && "A numeric range rule already exists for this question. (Rule " + conflictingRule.id + ")",
            questionId < 1 && "You must select a question.",
            (max <= min) && "Max must be larger than min."
        ].filter(m => m);
        if (errorMessages.length > 0) {
            alert(errorMessages.map(s => "- " + s).join("\n"));
        } else {
            setProjectDetails({
                surveyRules: [...surveyRules, {
                    id: getNextId(surveyRules),
                    ruleType: "numeric-range",
                    questionId,
                    questionsText: [surveyQuestions.find(q => q.id === questionId).question],
                    min,
                    max
                }]
            });
        }
    };

    render() {
        const {questionId, min, max} = this.state;
        const availableQuestions = this.context.surveyQuestions
            .filter(q => q.componentType === "input" && q.dataType === "number");
        return availableQuestions.length > 0
            ? (
                <>
                    <div className="form-group">
                        <label>Survey Question</label>
                        <select
                            className="form-control form-control-sm"
                            onChange={e => this.setState({questionId: Number(e.target.value)})}
                            value={questionId}
                        >
                            <option value={-1}>- Select Question -</option>
                            {availableQuestions.map(question =>
                                <option key={question.id} value={question.id}>{question.question}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Enter minimum</label>
                        <input
                            className="form-control form-control-sm"
                            onChange={e => this.setState({min: Number(e.target.value)})}
                            placeholder="Minimum value"
                            type="number"
                            value={min}
                        />
                    </div>
                    <div className="form-group">
                        <label>Enter maximum</label>
                        <input
                            className="form-control form-control-sm"
                            onChange={e => this.setState({max: Number(e.target.value)})}
                            placeholder="Maximum value"
                            type="number"
                            value={max}
                        />
                    </div>
                    <div className="d-flex justify-content-end">
                        <input
                            className="btn btn-lightgreen"
                            onClick={this.addSurveyRule}
                            type="button"
                            value="Add Survey Rule"
                        />
                    </div>
                </>
            ) : <label>This rule requires a question of type input-number.</label>;
    }
}
NumericRange.contextType = ProjectContext;

export class SumOfAnswers extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            validSum: 0,
            questionIds: []
        };
    }

    addSurveyRule = () => {
        const {surveyRules, surveyQuestions, setProjectDetails} = this.context;
        const {questionIds, validSum} = this.state;
        const conflictingRule = surveyRules.find(rule => rule.ruleType === "sum-of-answers"
            && sameContents(questionIds, rule.questions));
        const errorMessages = [
            conflictingRule && "A sum of answers rule already exists for these questions. (Rule " + conflictingRule.id + ")",
            (questionIds.length < 2) && "Sum of answers rule requires the selection of two or more questions.",
            !isNumber(validSum) && "You must ender a valid sum number."
        ].filter(m => m);
        if (errorMessages.length > 0) {
            alert(errorMessages.map(s => "- " + s).join("\n"));
        } else {
            setProjectDetails({
                surveyRules: [...surveyRules, {
                    id: getNextId(surveyRules),
                    ruleType: "sum-of-answers",
                    questions: questionIds,
                    questionsText: surveyQuestions
                        .filter(q => questionIds.includes(q.id))
                        .map(q => q.question),
                    validSum
                }]
            });
        }
    };

    render() {
        const {questionIds, validSum} = this.state;
        const availableQuestions = this.context.surveyQuestions.filter(q => q.dataType === "number");
        return availableQuestions.length > 1
            ? (
                <>
                    <div className="form-group">
                        <label>Select survey question</label>
                        <select
                            className="form-control form-control-sm overflow-auto"
                            multiple="multiple"
                            onChange={e => this.setState({
                                questionIds: Array.from(e.target.selectedOptions, i => Number(i.value))
                            })}
                            value={questionIds}
                        >
                            {availableQuestions.map(question =>
                                <option key={question.id} value={question.id}>{question.question}</option>)}
                        </select>
                        <small className="form-text text-muted">Hold ctrl/cmd and select multiple questions</small>
                    </div>
                    <div className="form-group">
                        <label>Enter valid sum</label>
                        <input
                            className="form-control form-control-sm"
                            onChange={e => this.setState({validSum: Number(e.target.value)})}
                            placeholder="Valid sum"
                            type="number"
                            value={validSum}
                        />
                    </div>
                    <div className="d-flex justify-content-end">
                        <input
                            className="btn btn-lightgreen"
                            onClick={this.addSurveyRule}
                            type="button"
                            value="Add Survey Rule"
                        />
                    </div>
                </>
            ) : <label>There must be at least 2 number questions for this rule type.</label>;
    }
}
SumOfAnswers.contextType = ProjectContext;

export class MatchingSums extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            questionSetIds1: [],
            questionSetIds2: []
        };
    }

    addSurveyRule = () => {
        const {surveyRules, surveyQuestions, setProjectDetails} = this.context;
        const {questionSetIds1, questionSetIds2} = this.state;
        const conflictingRule = surveyRules.find(rule => rule.ruleType === "matching-sums"
            && sameContents(questionSetIds1, rule.questionSetIds1)
            && sameContents(questionSetIds2, rule.questionSetIds2));
        const errorMessages = [
            conflictingRule && "A matching sums rule already exists for these questions. (Rule " + conflictingRule.id + ")",
            (questionSetIds1.length < 2 && questionSetIds2.length < 2)
                && "Matching sums rule requires that at least one of the question sets contain two or more questions.",
            questionSetIds1.length === 0 && "You must select at least one question from the first set.",
            questionSetIds2.length === 0 && "You must select at least one question from the second set.",
            questionSetIds1.some(id => questionSetIds2.includes(id))
                && "Question set 1 and 2 cannot contain the same question."
        ].filter(m => m);
        if (errorMessages.length > 0) {
            alert(errorMessages.map(s => "- " + s).join("\n"));
        } else {
            setProjectDetails({
                surveyRules: [...surveyRules, {
                    id: getNextId(surveyRules),
                    ruleType: "matching-sums",
                    questionSetIds1,
                    questionSetIds2,
                    questionSetText1: surveyQuestions
                        .filter(q => questionSetIds1.includes(q.id))
                        .map(q => q.question),
                    questionSetText2: surveyQuestions
                        .filter(q => questionSetIds2.includes(q.id))
                        .map(q => q.question)
                }]
            });
        }
    };

    render() {
        const {questionSetIds1, questionSetIds2} = this.state;
        const availableQuestions = this.context.surveyQuestions.filter(q => q.dataType === "number");
        return availableQuestions.length > 1
            ? (
                <>
                    <div className="form-group">
                        <label>Select first question set</label>
                        <select
                            className="form-control form-control-sm overflow-auto"
                            multiple="multiple"
                            onChange={e => this.setState({
                                questionSetIds1: Array.from(e.target.selectedOptions, i => Number(i.value))
                            })}
                            value={questionSetIds1}
                        >
                            {availableQuestions.map(question =>
                                <option key={question.id} value={question.id}>{question.question}</option>)}
                        </select>
                        <small className="form-text text-muted">Hold ctrl/cmd and select multiple questions</small>
                    </div>
                    <div className="form-group">
                        <label>Select second question set</label>
                        <select
                            className="form-control form-control-sm overflow-auto"
                            multiple="multiple"
                            onChange={e => this.setState({
                                questionSetIds2: Array.from(e.target.selectedOptions, i => Number(i.value))
                            })}
                            value={questionSetIds2}
                        >
                            {availableQuestions.map(question =>
                                <option key={question.id} value={question.id}>{question.question}</option>)}
                        </select>
                        <small className="form-text text-muted">Hold ctrl/cmd and select multiple questions</small>
                    </div>
                    <div className="d-flex justify-content-end">
                        <input
                            className="btn btn-lightgreen"
                            onClick={this.addSurveyRule}
                            type="button"
                            value="Add Survey Rule"
                        />
                    </div>
                </>
            ) : <label>There must be at least 2 number questions for this rule type.</label>;
    }
}
MatchingSums.contextType = ProjectContext;

export class IncompatibleAnswers extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            questionId1: -1,
            questionId2: -1,
            answerId1: -1,
            answerId2: -1
        };
    }

    checkPair = (q1, a1, q2, a2) => q1 === q2 && a1 === a2;

    checkEquivalent = (q1, a1, q2, a2, q3, a3, q4, a4) =>
        (this.checkPair(q1, a1, q3, a3) && this.checkPair(q2, a2, q4, a4))
            || (this.checkPair(q1, a1, q4, a4) && this.checkPair(q2, a2, q3, a3));

    addSurveyRule = () => {
        const {surveyRules, surveyQuestions, setProjectDetails} = this.context;
        const {questionId1, answerId1, questionId2, answerId2} = this.state;
        const conflictingRule = surveyRules.find(({question1, answer1, question2, answer2, ruleType}) => ruleType === "incompatible-answers"
            && this.checkEquivalent(
                question1,
                answer1,
                question2,
                answer2,
                questionId1,
                answerId1,
                questionId2,
                answerId2
            ));
        const errorMessages = [
            conflictingRule
                && "An incompatible answers rule already exists for these question / answer pairs. (Rule "
                + conflictingRule.id
                + ")",
            (questionId1 === questionId2) && "You must select two different questions.",
            questionId1 < 1 && "You must select a valid first question.",
            questionId2 < 1 && "You must select a valid second question.",
            (answerId1 < 1 || answerId2 < 1) && "You must select an answer for each question."
        ].filter(m => m);
        if (errorMessages.length > 0) {
            alert(errorMessages.map(s => "- " + s).join("\n"));
        } else {
            const q1 = surveyQuestions.find(q => q.id === questionId1);
            const q2 = surveyQuestions.find(q => q.id === questionId2);
            setProjectDetails({
                surveyRules: [...surveyRules, {
                    id: getNextId(surveyRules),
                    ruleType: "incompatible-answers",
                    question1: questionId1,
                    question2: questionId2,
                    answer1: answerId1,
                    answer2: answerId2,
                    questionText1: q1.question,
                    questionText2: q2.question,
                    answerText1: q1.answers.find(a => a.id === answerId1).answer,
                    answerText2: q2.answers.find(a => a.id === answerId2).answer
                }]
            });
        }
    };

    safeFindAnswers = questionId => {
        const question = this.context.surveyQuestions.find(q => q.id === questionId);
        const answers = question && question.answers;
        return answers || [];
    };

    render() {
        const {questionId1, answerId1, questionId2, answerId2} = this.state;
        const availableQuestions = this.context.surveyQuestions.filter(q => q.componentType !== "input");
        return availableQuestions.length > 1
            ? (
                <>
                    <strong className="mb-2" style={{textAlign: "center"}}>Select the incompatible questions and answers</strong>
                    <div className="form-group">
                        <label>Question 1</label>
                        <select
                            className="form-control form-control-sm"
                            onChange={e => this.setState({
                                questionId1: Number(e.target.value),
                                answerId1: -1
                            })}
                            value={questionId1}
                        >
                            <option value="-1">- Select Question 1 -</option>
                            {availableQuestions.map(question =>
                                <option key={question.id} value={question.id}>{question.question}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Answer 1</label>
                        <select
                            className="form-control form-control-sm"
                            onChange={e => this.setState({answerId1: Number(e.target.value)})}
                            value={answerId1}
                        >
                            <option value="-1">- Select Answer 1 -</option>
                            {this.safeFindAnswers(questionId1).map(answer =>
                                <option key={answer.id} value={answer.id}>{answer.answer}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Question 2</label>
                        <select
                            className="form-control form-control-sm"
                            onChange={e => this.setState({
                                questionId2: Number(e.target.value),
                                answerId2: -1
                            })}
                            value={questionId2}
                        >
                            <option value="-1">- Select Question 2 -</option>
                            {availableQuestions.map(question =>
                                <option key={question.id} value={question.id}>{question.question}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Answer 2</label>
                        <select
                            className="form-control form-control-sm"
                            onChange={e => this.setState({answerId2: Number(e.target.value)})}
                            value={answerId2}
                        >
                            <option value="-1">- Select Answer 2 -</option>
                            {this.safeFindAnswers(questionId2).map(answer =>
                                <option key={answer.id} value={answer.id}>{answer.answer}</option>)}
                        </select>
                    </div>
                    <div className="d-flex justify-content-end">
                        <input
                            className="btn btn-lightgreen"
                            onClick={this.addSurveyRule}
                            type="button"
                            value="Add Survey Rule"
                        />
                    </div>
                </>
            ) : <label>There must be at least 2 questions where type is not input for this rule.</label>;
    }
}
IncompatibleAnswers.contextType = ProjectContext;

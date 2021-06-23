import React from "react";

import SvgIcon from "./SvgIcon";
import {pluralize, truncate} from "../utils/generalUtils";

/**
 * Helper Components
 **/
function truncjoin(qs) {
    return qs.map(q => truncate(q, 15)).join(", ");
}

function Badge({text}) {
    return (
        <div className="badge badge-light tooltip_wrapper" style={{color: "black"}}>
            {truncate(text, 10)}
            {text.length > 10 && (<div className="tooltip_content">{text}</div>)}
        </div>
    );
}

function Question({text}) {
    const textIsArray = Array.isArray(text);
    return (
        <i className="tooltip_wrapper" style={{color: "black"}}>
            &quot;{(textIsArray ? truncjoin(text) : truncate(text, 15))}&quot;
            {(textIsArray || text.length >= 15)
                && (
                    <span className="tooltip_content" style={{fontSize: "0.8rem"}}>
                        {textIsArray ? text.join(", ") : text}
                    </span>
                )}
        </i>
    );
}

export function EqualToSumRule({questionsText, validSum}) {
    return (
        <div className="d-flex flex-column mb-3">
            <div><strong>Sum of Answers</strong></div>
            <div>Answers to <Question text={questionsText}/> should sum up to {validSum}.</div>
        </div>
    );
}

export function IncompatibleRule({answerText1, answerText2, questionText1, questionText2}) {
    return (
        <div className="d-flex flex-column mb-3">
            <div><strong>Incompatible Answers</strong></div>
            <div>
                Answer <Badge text={answerText1}/> from <Question text={questionText1}/> is
                incompatible with <Badge text={answerText2}/> from <Question text={questionText2}/>
            </div>
        </div>
    );
}

export function MatchingSumsRule({questionSetText1, questionSetText2}) {
    return (
        <div className="d-flex flex-column mb-3">
            <div><strong>Matching Sums</strong></div>
            <div>
                Sum of <Question text={questionSetText1}/> should be equal to sum of <Question text={questionSetText2}/>
            </div>
        </div>
    );
}

export function MinMaxRule({questionsText, min, max}) {
    return (
        <div className="d-flex flex-column mb-3">
            <div><strong>Min/Max Values</strong></div>
            <div>Answer to <Question text={questionsText}/> should be between: {min} and {max}.</div>
        </div>
    );
}

export function RegexRule({questionsText, regex}) {
    return (
        <div className="d-flex flex-column mb-3">
            <div><strong>Text Match</strong></div>
            <div>Answer to <Question text={questionsText}/> should match the pattern: <pre style={{display: "inline"}}>{regex}</pre></div>
        </div>
    );
}

export default class SurveyQuestionRules extends React.Component {
    constructor(props) {
        super(props);
        this.state = {showModal: false};
    }

    getRulesById = (id, surveyRules = []) => surveyRules
        .filter(rule =>
            (rule.questionId && rule.questionId === id)
            || (rule.questions && rule.questions.includes(id))
            || (rule.questionSetIds1 && (rule.questionSetIds1.includes(id) || rule.questionSetIds2.includes(id)))
            || (rule.question1 && (rule.question1 === id || rule.question2 === id)))
        .map(r => (r.questionId
            ? r.regex
                ? <RegexRule key={r.id} {...r}/>
                : <MinMaxRule key={r.id} {...r}/>
            : r.questions
                ? <EqualToSumRule key={r.id} {...r}/>
                : r.questionSetIds1
                    ? <MatchingSumsRule key={r.id} {...r}/>
                    : <IncompatibleRule key={r.id} {...r}/>));

    render() {
        const {showModal} = this.state;
        const {surveyNodeId, surveyRules} = this.props;
        const rules = this.getRulesById(surveyNodeId, surveyRules);

        return (
            rules.length > 0
              && (
                  <>
                      <button
                          className="text-center btn btn-outline-lightgreen mr-1 tooltip_wrapper"
                          onClick={() => this.setState({showModal: true})}
                          type="button"
                      >
                          <SvgIcon icon="rule" size="1.5rem"/>
                          <div className="tooltip_content survey_tree">
                              {`This question has ${rules.length} ${pluralize(rules.length, "rule", "rules")}. Click to see the rule list.`}
                          </div>
                      </button>
                      <div
                          aria-hidden="true"
                          className="modal fade show"
                          onClick={() => this.setState({showModal: false})}
                          role="dialog"
                          style={{display: (showModal ? "block" : "none"), background: "rgba(0,0,0,0.3)"}}
                          tabIndex="-1"
                      >
                          <div className="modal-dialog" role="document">
                              <div className="modal-content text-left" onClick={e => e.stopPropagation()}>
                                  <div className="modal-header" >
                                      <h5 className="modal-title">
                                      Survey Rules
                                      </h5>
                                      <button
                                          aria-label="Close"
                                          className="close"
                                          data-dismiss="modal"
                                          onClick={() => this.setState({showModal: false})}
                                          type="button"
                                      >
                                          <span aria-hidden="true">
                                              <SvgIcon icon="close" size="1.25rem"/>
                                          </span>
                                      </button>
                                  </div>
                                  <div className="modal-body text-left">
                                      {rules}
                                  </div>
                                  <div className="modal-footer">
                                      <button
                                          className="btn btn-secondary"
                                          onClick={() => this.setState({showModal: false})}
                                          type="button"
                                      >
                                      Close
                                      </button>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </>
              )
        );
    }
}

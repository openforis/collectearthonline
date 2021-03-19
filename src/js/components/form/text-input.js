import React from "react";
import PropTypes from "prop-types";

class TextInput extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            touched: false,
            shouldValidate: props.isRequired || props.validate,
        };
    }

    validate = (value) => {
        if (this.props.validate) {
            this.props.validate(value);
        } else if (this.props.isRequired) {
            return value !== "";
        } else {
            return true;
        }
    };

    render() {
        return (
            <div className={["form-group", this.props.className.split(" ")].join(" ")}>
                <label htmlFor={this.props.name} style={{fontWeight: (this.props.isBold ? "500" : "")}}>{this.props.label}<span style={{color: "red"}} >{this.props.isRequired ? "*" : ""}</span></label>
                <input
                    aria-describedby={this.props.name + "HelpBlock"}
                    className={this.state.touched && this.state.shouldValidate ? (this.validate(this.props.value) ? "form-control is-valid" : "form-control is-invalid") : "form-control"}
                    id={this.props.name}
                    maxLength={this.props.maxLength}
                    name={this.props.name}
                    onBlur={() => this.setState({touched: true})}
                    onChange={this.props.onChange}
                    placeholder={this.props.placeholder}
                    required={this.props.isRequired}
                    type="text"
                    value={this.props.value}
                />
                <div className="invalid-feedback">
                    {this.props.invalidText}
                </div>
                <small
                    className="form-text text-muted"
                    id={name + "HelpBlock"}
                >
                    {this.props.helpText}
                </small>
            </div>
        );
    }
}

TextInput.propTypes = {
    className: PropTypes.string,
    helpText: PropTypes.string,
    isRequired: PropTypes.bool,
    label: PropTypes.string,
    name: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    validate: PropTypes.func,
    value: PropTypes.string,
    maxLength: PropTypes.string,
};

TextInput.defaultProps = {
    className: "",
    invalidText: "Text must be at least 8 characters.",
    maxLength: "100",
    isRequired: false,
};

export default TextInput;

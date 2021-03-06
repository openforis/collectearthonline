import React from "react";
import ReactDOM from "react-dom";
import {NavigationBar} from "./components/PageComponents";
import {getQueryString} from "./utils/generalUtils";

class Register extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            email: "",
            password: "",
            passwordConfirmation: "",
            acceptTOS: false
        };
    }

    register = () => {
        if (!this.state.acceptTOS) {
            alert("You must accept the terms of service to continue.");
        } else {
            fetch("/register",
                  {
                      method: "POST",
                      headers: {
                          "Content-Type": "application/x-www-form-urlencoded"
                      },
                      body: getQueryString(this.state)
                  })
                .then(response => Promise.all([response.ok, response.json()]))
                .then(data => {
                    if (data[0] && data[1] === "") {
                        alert("You have successfully created an account.");
                        window.location = "/home";
                    } else {
                        alert(data[1]);
                    }
                })
                .catch(err => console.log(err));
        }
    };

    render() {
        return (
            <div className="d-flex justify-content-center">
                <div className="card card-lightgreen" id="register-form">
                    <div className="card-header card-header-lightgreen">Register a new account</div>
                    <div className="card-body">
                        <form
                            onSubmit={e => {
                                e.preventDefault();
                                this.register();
                            }}
                        >
                            <div className="form-group">
                                <label htmlFor="email">Email address</label>
                                <input
                                    autoComplete="off"
                                    className="form-control"
                                    id="email"
                                    onChange={e => this.setState({email: e.target.value})}
                                    placeholder="Email"
                                    type="email"
                                    value={this.state.email}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="password">Enter your password</label>
                                <input
                                    autoComplete="off"
                                    className="form-control"
                                    id="password"
                                    onChange={e => this.setState({password: e.target.value})}
                                    placeholder="Password"
                                    type="password"
                                    value={this.state.password}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="password-confirmation">Confirm your password</label>
                                <input
                                    autoComplete="off"
                                    className="form-control"
                                    id="password-confirmation"
                                    onChange={e => this.setState({passwordConfirmation: e.target.value})}
                                    placeholder="Password confirmation"
                                    type="password"
                                    value={this.state.passwordConfirmation}
                                />
                            </div>
                            <div className="form-check mb-3">
                                <input
                                    checked={this.state.acceptTOS}
                                    className="form-check-input"
                                    id="tos-check"
                                    onChange={() => this.setState({acceptTOS: !this.state.acceptTOS})}
                                    type="checkbox"
                                />
                                <label className="form-check-label" htmlFor="tos-check">
                                    I agree to the <a href="/terms" target="_blank">Terms of Service</a>.
                                </label>
                            </div>
                            <button className="btn btn-lightgreen float-right mb-2" type="submit">
                                Register
                            </button>
                        </form>
                    </div>
                </div>
            </div>

        );
    }
}

export function pageInit(args) {
    ReactDOM.render(
        <NavigationBar userId={-1} userName="">
            <Register/>
        </NavigationBar>,
        document.getElementById("app")
    );
}

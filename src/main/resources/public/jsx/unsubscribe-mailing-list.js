import React from "react";
import ReactDOM from "react-dom";
import { NavigationBar } from "./components/PageComponents";

class UnsubscribeMailingList extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            email: "",
        };
    }

    onChangeEmail = (event) => {
        this.setState({ email: event.target.value });
    };

    submitUnsubscribe = () => {
        if (confirm("Are you sure you want to unsubscribe from mailing list?")) {
            const { email } = this.state;
            fetch("/unsubscribe-mailing-list", {
                method: "POST",
                body: JSON.stringify({
                    email,
                }),
            })
                .then(response => {
                    if (response.ok) {
                        this.setState({ email: "" });
                        alert("Your email has been subscribed from mailing list.\n\n");
                    } else {
                        Promise.reject(response);
                    }
                })
                .catch(() => {
                    alert("There was an issue subscribing from mailing list.\n\n");
                });
        }
    };

    render() {
        return (
            <div className="container absolute-center">
                <div className="row justify-content-center">
                    <div className="col-lg-4 col-md-6 col-sm-10 pb-3" id="login">
                        <form action="${root}/login" method="post">
                            <h2 className="header">Unsubscribe from Mailing List</h2>
                            <div className="form-group">
                                <label htmlFor="email">Email address</label>
                                <input
                                    id="email"
                                    name="email"
                                    placeholder="Enter email"
                                    type="email"
                                    value={this.state.email}
                                    className="form-control"
                                    onChange={this.onChangeEmail}
                                />
                            </div>
                            <button
                                type="button"
                                className="btn bg-lightgreen float-right mb-2"
                                onClick={this.submitUnsubscribe}
                            >
                                Unsubscribe
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

}

export function renderUnsubscribeMailingListPage(args) {
    ReactDOM.render(
        <NavigationBar userName={args.userName} userId={args.userId}>
            <UnsubscribeMailingList />
        </NavigationBar>,
        document.getElementById("unsubscribe-mailing-list")
    );
}

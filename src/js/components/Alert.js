import React from "react";
import PropTypes from "prop-types";
import Modal from "./Modal";

/**
 * Component for a Alert modal.
 *
 * @component
 * @example
 * function MyComponent() {
 *     const [state, setState] = useState({showAlert: true});
 *     const title = "Completed"
 *     const body = "Your changes have been saved."
 *     return (
 *        {state.showAlert && (
 *            <Alert
 *                title={title}
 *                onClose={() => setState({showAlert: false})}
 *                body={body}
 *            />
 *        )}
 *     );
 * }
 */
export default function Alert({title, body, closeText, onClose}) {
    return (
        <Modal
            closeText={closeText}
            onClose={onClose}
            title={title}
        >
            <p>{body}</p>
        </Modal>
    );
}

Alert.propTypes = {
    body: PropTypes.string.isRequired,
    closeText: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired
};

Alert.defaultProps = {
    closeText: "OK"
};

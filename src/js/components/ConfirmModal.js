import React from "react";
import PropTypes from "prop-types";
import Modal from "./Modal";

/**
 * Component for Confirm Modal. Use `danger` to set the color of the confirm
 * button to red.
 *
 * @component
 * @example
 * function MyComponent() {
 *     const [state, setState] = useState({showConfirm: true});
 *     const title = "Warning"
 *     const body = "Are you sure you want to delete this?"
 *     return (
 *        {state.showConfirm && (
 *            <ConfirmModal
 *                danger
 *                title={title}
 *                onClose={() => setState({showConfirm: false})}
 *                onConfirm={() => this.deleteItem()}
 *                body={body}
 *            />
 *        )}
 *     );
 * }
 */
export default function ConfirmModal({title, body, confirmText, closeText, danger, onClose, onConfirm}) {
    return (
        <Modal
            closeText={closeText}
            confirmText={confirmText}
            danger={danger}
            onClose={onClose}
            onConfirm={onConfirm}
            title={title}
        >
            <p>{body}</p>
        </Modal>
    );
}

ConfirmModal.propTypes = {
    body: PropTypes.string.isRequired,
    closeText: PropTypes.string,
    confirmText: PropTypes.string,
    danger: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired
};

ConfirmModal.defaultProps = {
    closeText: "No, I'm not sure",
    confirmText: "Yes, I'm sure",
    danger: false
};

import React, {useState} from "react";

export default function RequiredInput({label, maxLength, onChange, value, textarea}) {
    const [touched, setTouched] = useState(false);

    return (
        <>
            <label htmlFor="institution-name">
                <span style={{color: "red"}}>*</span>{label}
            </label>
            {textarea ? (
                <textarea
                    className="form-control"
                    id="institution-description"
                    maxLength={maxLength}
                    onBlur={() => setTouched(true)}
                    onChange={onChange}
                    required
                    rows="4"
                    value={value}
                />
            ) : (
                <input
                    className="form-control mb-1 mr-sm-2"
                    id="institution-name"
                    maxLength={maxLength}
                    onBlur={() => setTouched(true)}
                    onChange={onChange}
                    required
                    style={touched && value.length === 0 ? {borderColor: "red"} : {}}
                    type="text"
                    value={value}
                />
            )}
            {touched && value.length === 0 && (
                <div className="invalid-feedback" style={{display: "block"}}>
                    {`${label} is required.`}
                </div>
            )}
        </>
    );
}

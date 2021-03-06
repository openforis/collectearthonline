import React from "react";
import {encodeFileAsBase64} from "../utils/generalUtils";

export default function InstitutionEditor({
    title,
    name,
    description,
    url,
    acceptTOS,
    buttonGroup,
    setInstitutionDetails
}) {
    return (
        <div className="row justify-content-center" id="institution-details">
            <div className="col-xl-6 col-lg-6 border pb-3 mb-2" id="institution-edit">
                <h2 className="header">
                    {title}
                </h2>
                <div className="mb-3">
                    <label htmlFor="institution-name">Name</label>
                    <input
                        className="form-control mb-1 mr-sm-2"
                        id="institution-name"
                        maxLength="400"
                        onChange={e => setInstitutionDetails("name", e.target.value)}
                        type="text"
                        value={name}
                    />
                </div>
                <div className="mb-3">
                    <label htmlFor="institution-url">URL</label>
                    <input
                        className="form-control mb-1 mr-sm-2"
                        id="institution-url"
                        maxLength="400"
                        onChange={e => setInstitutionDetails("url", e.target.value)}
                        type="text"
                        value={url}
                    />
                </div>
                <div className="mb-3">
                    <label htmlFor="institution-logo">Logo</label>
                    <input
                        accept="image/*"
                        className="form-control mb-1 mr-sm-2"
                        id="institution-logo"
                        onChange={e => {
                            setInstitutionDetails("logo", e.target.files[0].name);
                            encodeFileAsBase64(e.target.files[0], r => setInstitutionDetails("base64Image", r));
                        }}
                        type="file"
                    />
                </div>
                <div className="mb-3">
                    <label htmlFor="institution-description">Description</label>
                    <textarea
                        className="form-control"
                        id="institution-description"
                        maxLength="2000"
                        onChange={e => setInstitutionDetails("description", e.target.value)}
                        rows="4"
                        value={description}
                    />
                </div>
                {acceptTOS !== undefined && (
                    <div className="form-check mb-3">
                        <input
                            checked={acceptTOS}
                            className="form-check-input"
                            id="tos-check"
                            onChange={() => setInstitutionDetails("acceptTOS", !acceptTOS)}
                            type="checkbox"
                        />
                        <label className="form-check-label" htmlFor="tos-check">
                            I agree to the <a href="/terms" target="_blank">Terms of Service</a>.
                        </label>
                    </div>
                )}
                {buttonGroup()}
            </div>
        </div>
    );
}

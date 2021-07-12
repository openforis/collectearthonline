import React from "react";
import ReactDOM from "react-dom";

import Alert from "./components/Alert";
import ConfirmModal from "./components/ConfirmModal";
import InstitutionEditor from "./components/InstitutionEditor";
import {LoadingModal, NavigationBar} from "./components/PageComponents";
import {
    sortAlphabetically,
    capitalizeFirst,
    UnicodeIcon,
    KBtoBase64Length,
    safeLength
} from "./utils/generalUtils";
import {imageryOptions} from "./imagery/imageryOptions";

class ReviewInstitution extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            imageryCount: 0,
            usersCount: 0,
            projectList: null,
            isAdmin: false,
            selectedTab: 0,
            modalMessage: null
        };
    }

    componentDidMount() {
        // Load the projectList
        this.getProjectList();
    }

    processModal = (message, callBack) => {
        this.setState({modalMessage: message},
                      () => callBack()
                          .finally(() => this.setState({modalMessage: null})));
    };

    getProjectList = () => {
        // get projects
        this.processModal(
            "Loading institution data",
            () => fetch(`/get-institution-projects?institutionId=${this.props.institutionId}`)
                .then(response => (response.ok ? response.json() : Promise.reject(response)))
                .then(data => this.setState({projectList: data}))
                .catch(response => {
                    console.log(response);
                    alert("Error retrieving the project info. See console for details.");
                })
        );
    };

    archiveProject = projectId => {
        if (confirm("Do you REALLY want to delete this project? This operation cannot be undone.")) {
            fetch(`/archive-project?projectId=${projectId}`, {method: "POST"})
                .then(response => {
                    if (response.ok) {
                        this.getProjectList();
                        alert("Project " + projectId + " has been deleted.");
                    } else {
                        console.log(response);
                        alert("Error deleting project. See console for details.");
                    }
                });
        }
    };

    setImageryCount = newCount => this.setState({imageryCount: newCount});

    setUsersCount = newCount => this.setState({usersCount: newCount});

    setIsAdmin = isAdmin => this.setState({isAdmin});

    headerTab = (name, count, index, disabled = false) => (
        <div className="col-lg-4 col-xs-12">
            <div
                className={disabled ? "disabled-group" : ""}
                onClick={() => this.setState({selectedTab: index})}
            >
                <h2
                    className="header"
                    style={{borderRadius: "5px", cursor: disabled ? "not-allowed" : "pointer"}}
                >
                    {name}
                    <span className="badge badge-pill badge-light ml-2">
                        {count}
                    </span>
                    <span className="float-right">
                        {index === this.state.selectedTab && "\u25BC"}
                    </span>
                </h2>
            </div>
        </div>
    );

    render() {
        return (
            <div className="ReviewInstitution">
                <InstitutionDescription
                    institutionId={this.props.institutionId}
                    isAdmin={this.state.isAdmin}
                    setIsAdmin={this.setIsAdmin}
                    userId={this.props.userId}
                />
                <div className="row justify-content-center">
                    <div className="col-lg-7 col-xs-12 align-items-center mb-5">
                        <div className="row">
                            {this.headerTab("Projects", this.state.projectList
                                ? this.state.projectList.length
                                : 0, 0)}
                            {this.headerTab("Imagery", this.state.imageryCount, 1)}
                            {this.headerTab("Users", this.state.usersCount, 2, this.props.userId < 0)}
                        </div>
                        <ProjectList
                            deleteProject={this.archiveProject}
                            institutionId={this.props.institutionId}
                            isAdmin={this.state.isAdmin}
                            isVisible={this.state.selectedTab === 0}
                            projectList={this.state.projectList}
                        />
                        <ImageryList
                            institutionId={this.props.institutionId}
                            isAdmin={this.state.isAdmin}
                            isVisible={this.state.selectedTab === 1}
                            setImageryCount={this.setImageryCount}
                            userId={this.props.userId}
                        />
                        {this.props.userId > 0 && (
                            <UserList
                                institutionId={this.props.institutionId}
                                isAdmin={this.state.isAdmin}
                                isVisible={this.state.selectedTab === 2}
                                processModal={this.processModal}
                                setUsersCount={this.setUsersCount}
                                userId={this.props.userId}
                            />
                        )}
                    </div>
                </div>
                {this.state.modalMessage && <LoadingModal message={this.state.modalMessage}/>}
            </div>
        );
    }
}

class InstitutionDescription extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            institutionDetails: {
                name: "",
                base64Image: "",
                url: "",
                description: "",
                institutionAdmin: false
            },
            newInstitutionDetails: {
                name: "",
                base64Image: "",
                url: "",
                description: ""
            },
            editMode: false
        };
    }

    componentDidMount() {
        this.getInstitutionDetails();
    }

    getInstitutionDetails = () => {
        fetch(`/get-institution-by-id?institutionId=${this.props.institutionId}`)
            .then(response => (response.ok ? response.json() : Promise.reject(response)))
            .then(data => {
                this.setState({
                    institutionDetails: data,
                    newInstitutionDetails: {
                        name: data.name,
                        url: data.url,
                        description: data.description,
                        base64Image: ""
                    }
                });
                this.props.setIsAdmin(data.institutionAdmin);
            })
            .catch(response => {
                console.log(response);
                alert("Error retrieving the institution details. See console for details.");
            });
    };

    updateInstitution = () => {
        if (this.state.newInstitutionDetails.base64Image.length > KBtoBase64Length(500)) {
            alert("Institution logos must be smaller than 500kb");
        } else {
            fetch(
                `/update-institution?institutionId=${this.props.institutionId}`,
                {
                    method: "POST",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        institutionId: this.props.institutionId,
                        name: this.state.newInstitutionDetails.name,
                        base64Image: this.state.newInstitutionDetails.base64Image,
                        url: this.state.newInstitutionDetails.url,
                        description: this.state.newInstitutionDetails.description
                    })
                }
            )
                .then(response => Promise.all([response.ok, response.json()]))
                .then(data => {
                    if (data[0] && data[1] === "") {
                        this.getInstitutionDetails();
                        this.setState({editMode: false});
                    } else {
                        alert(data[1]);
                    }
                })
                .catch(() => alert("Error updating institution details."));
        }
    };

    toggleEditMode = () => this.setState({editMode: !this.state.editMode});

    updateNewInstitutionDetails = (key, newValue) => this.setState({
        newInstitutionDetails: {
            ...this.state.newInstitutionDetails,
            [key]: newValue
        }
    });

    deleteInstitution = () => {
        if (confirm("This action will also delete all of the projects associated with this institution.\n\n"
                    + "This action is irreversible.\n\n"
                    + "Do you REALLY want to delete this institution?")) {
            fetch(`/archive-institution?institutionId=${this.props.institutionId}`, {method: "POST"})
                .then(response => {
                    if (response.ok) {
                        alert("Institution " + this.state.institutionDetails.name + " has been deleted.");
                        window.location = "/home";
                    } else {
                        console.log(response);
                        alert("Error deleting institution. See console for details.");
                    }
                });
        }
    };

    gotoInstitutionDashboard = () => {
        window.open(`/institution-dashboard?institutionId=${this.props.institutionId}`);
    };

    renderEditButtonGroup = () => (
        <div className="row">
            <div className="col-6">
                <button
                    className="btn btn-sm btn-outline-lightgreen btn-block mt-0"
                    onClick={this.updateInstitution}
                    type="button"
                >
                    <UnicodeIcon icon="save"/> Save Changes
                </button>
            </div>
            <div className="col-6">
                <button
                    className="btn btn-sm btn-outline-red btn-block mt-0"
                    onClick={this.toggleEditMode}
                    type="button"
                >
                    <UnicodeIcon icon="noAction"/> Cancel Changes
                </button>
            </div>
        </div>
    );

    httpAddress = url => (url.includes("://") ? url : "https://" + url);

    render() {
        return this.state.editMode
            ? (
                <InstitutionEditor
                    buttonGroup={this.renderEditButtonGroup}
                    description={this.state.newInstitutionDetails.description}
                    name={this.state.newInstitutionDetails.name}
                    setInstitutionDetails={this.updateNewInstitutionDetails}
                    title="Create New Institution"
                    url={this.state.newInstitutionDetails.url}
                />
            ) : (
                <div className="row justify-content-center" id="institution-details">
                    <div className="col-8" id="institution-view">
                        <div className="row mb-4">
                            <div className="col-md-3" id="institution-logo-container">
                                <img
                                    alt={this.state.institutionDetails.name}
                                    onClick={() => window.open(this.httpAddress(this.state.institutionDetails.url))}
                                    src={safeLength(this.state.institutionDetails.base64Image) > 1
                                        ? `data:*/*;base64,${this.state.institutionDetails.base64Image}`
                                        : "/img/ceo-logo.png"}
                                    style={{maxWidth: "100%"}}
                                />
                            </div>
                            <div className="col-md-8">
                                <h1>
                                    <a href={this.state.institutionDetails.url}>
                                        {this.state.institutionDetails.name}
                                    </a>
                                </h1>
                                <hr/>
                                <p className="pt-2" style={{textIndent: "25px"}}>
                                    {this.state.institutionDetails.description}
                                </p>
                            </div>
                        </div>
                        {this.props.isAdmin && (
                            <div className="row justify-content-center mb-2" id="institution-controls">
                                <div className="col-3">
                                    <button
                                        className="btn btn-sm btn-outline-lightgreen btn-block mt-0"
                                        id="edit-institution"
                                        onClick={this.toggleEditMode}
                                        type="button"
                                    >
                                        <UnicodeIcon icon="edit"/> Edit
                                    </button>
                                </div>
                                <div className="col-3">
                                    <button
                                        className="btn btn-sm btn-outline-red btn-block mt-0"
                                        id="delete-institution"
                                        onClick={this.deleteInstitution}
                                        type="button"
                                    >
                                        <UnicodeIcon icon="trash"/> Delete
                                    </button>
                                </div>
                                <div className="col-3">
                                    <button
                                        className="btn btn-sm btn-outline-lightgreen btn-block mt-0"
                                        id="institution-dashboard"
                                        onClick={this.gotoInstitutionDashboard}
                                        type="button"
                                    >
                                Go to Dashboard
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
    }
}

class ImageryList extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            imageryToEdit: null,
            imageryList: []
        };
    }

    //    Life Cycle Methods    //

    componentDidMount() {
        this.getImageryList();
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.state.imageryList.length !== prevState.imageryList.length) {
            this.props.setImageryCount(this.state.imageryList.length);
        }
    }

    //    Remote Calls    //

    getImageryList = () => {
        fetch(`/get-institution-imagery?institutionId=${this.props.institutionId}`)
            .then(response => (response.ok ? response.json() : Promise.reject(response)))
            .then(data => this.setState({imageryList: data}))
            .catch(response => {
                this.setState({imageryList: []});
                console.log(response);
                this.showAlert({title: "Error", body: "Error retrieving the imagery list. See console for details."});
            });
    };

    selectAddImagery = () => this.setState({imageryToEdit: {id: -1}});

    selectEditImagery = imageryId => {
        const imagery = this.state.imageryList.find(i => i.id === imageryId);
        if (imageryOptions.find(io => io.type === imagery.sourceConfig.type)) {
            this.setState({imageryToEdit: imagery});
        } else {
            this.showAlert({title: "Imagery Not Supported", body: "This imagery type is no longer supported and cannot be edited."});
        }
    };

    deleteImagery = imageryId => {
        this.setState({showDeleteImageryModal: false});
        fetch(
            "/archive-institution-imagery",
            {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    institutionId: this.props.institutionId,
                    imageryId
                })
            }
        )
            .then(response => {
                if (response.ok) {
                    this.getImageryList();
                    this.showAlert({title: "Imagery Deleted", body: "Imagery has been successfully deleted."});
                } else {
                    console.log(response);
                    this.showAlert({title: "Error", body: "Error deleting imagery. See console for details."});
                }
            });
    };

    toggleVisibility = (imageryId, currentVisibility) => {
        const toVisibility = currentVisibility === "private" ? "public" : "private";
        if (this.props.userId === 1
                && confirm(`Do you want to change the visibility from ${currentVisibility} to ${toVisibility}?`
                    + `${toVisibility === "private"
                        && "  This will remove the imagery from other institutions' projects."}`)) {
            fetch("/update-imagery-visibility",
                  {
                      method: "POST",
                      headers: {
                          "Accept": "application/json",
                          "Content-Type": "application/json"
                      },
                      body: JSON.stringify({
                          institutionId: this.props.institutionId,
                          visibility: toVisibility,
                          imageryId
                      })
                  })
                .then(response => {
                    if (response.ok) {
                        this.getImageryList();
                        this.showAlert({title: "Imagery Updated", body: "Imagery visibility has been successfully updated."});
                    } else {
                        console.log(response);
                        alert({title: "Error", body: "Error updating imagery visibility. See console for details."});
                    }
                });
        }
    };

    //    State Modifications    //

    hideEditMode = () => this.setState({imageryToEdit: null});

    //    Helper Functions    //

    titleIsTaken = (newTitle, idToExclude) =>
        this.state.imageryList.some(i => i.title === newTitle && i.id !== idToExclude);

    showDeleteImageryModal = id =>
        this.setState({showDeleteImageryModal: true, deleteImageryId: id});

    showAlert = ({title, body, closeText}) => this.setState({
        showAlert: true,
        alertTitle: title,
        alertBody: body,
        alertCloseText: closeText
    });

    hideAlert = () => this.setState({
        showAlert: false,
        alertTitle: null,
        alertBody: null,
        alertCloseText: null
    });

    render() {
        return this.props.isVisible && (
            this.state.imageryToEdit
                ? (
                    <NewImagery
                        getImageryList={this.getImageryList}
                        hideEditMode={this.hideEditMode}
                        imageryToEdit={this.state.imageryToEdit}
                        institutionId={this.props.institutionId}
                        titleIsTaken={this.titleIsTaken}
                    />
                ) : (
                    <>
                        <div className="mb-3">
                            This is a list of available imagery for this institution.
                            For each project you can select to use some or all of these imagery.
                        </div>
                        {this.props.isAdmin && (
                            <div className="row">
                                <div className="col-lg-12 mb-1">
                                    <button
                                        className="btn btn-sm btn-block btn-outline-yellow py-2 font-weight-bold"
                                        id="add-imagery-button"
                                        onClick={this.selectAddImagery}
                                        type="button"
                                    >
                                        <UnicodeIcon backgroundColor="#f1c00f" icon="add"/>Add New Imagery
                                    </button>

                                </div>
                            </div>
                        )}
                        {this.state.imageryList.length === 0
                            ? <h3>Loading imagery...</h3>
                            : this.state.imageryList.map(({id, title, institution, visibility}) => (
                                <Imagery
                                    key={id}
                                    canEdit={this.props.isAdmin && this.props.institutionId === institution}
                                    deleteImagery={() => this.showDeleteImageryModal(id)}
                                    selectEditImagery={() => this.selectEditImagery(id)}
                                    title={title}
                                    toggleVisibility={() => this.toggleVisibility(id, visibility)}
                                    visibility={visibility}
                                />
                            ))}
                        {this.state.showDeleteImageryModal && (
                            <ConfirmModal
                                body="Are you sure you want to delete this imagery? This is irreversible."
                                closeText="Cancel"
                                danger
                                onClose={() => this.setState({showDeleteImageryModal: false})}
                                onConfirm={() => this.deleteImagery(this.state.deleteImageryId)}
                                title="Warning: Removing Imagery"
                            />
                        )}
                        {this.state.showAlert && (
                            <Alert
                                body={this.state.alertBody}
                                closeText={this.state.alertCloseText}
                                onClose={this.hideAlert}
                                title={this.state.alertTitle}
                            />
                        )}
                    </>
                )
        );
    }
}

class NewImagery extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            newImageryTitle: "",
            newImageryAttribution: "",
            selectedType: 0,
            newImageryParams: {},
            addToAllProjects: false
        };
    }

    componentDidMount() {
        const {imageryToEdit} = this.props;
        if (imageryToEdit.id !== -1) {
            const {type, ...imageryParams} = imageryToEdit.sourceConfig;
            const selectedType = imageryOptions.findIndex(io => io.type === type);
            this.setState({
                newImageryTitle: imageryToEdit.title,
                newImageryAttribution: imageryToEdit.attribution,
                selectedType,
                newImageryParams: this.getImageryParams(type, imageryParams)
            });
        } else {
            this.imageryTypeChangeHandler(0);
        }
    }

    getImageryParams = (type, imageryParams) => {
        // TODO, this should be made generic based on parent / child relationship
        // SecureWatch is not defined in imageryOptions in a way that will facilitate this.
        if (type === "GeoServer") {
            const {geoserverUrl, geoserverParams: {LAYERS, ...cleanGeoserverParams}} = imageryParams;
            return {
                geoserverUrl,
                LAYERS,
                geoserverParams: JSON.stringify(cleanGeoserverParams)
            };
        } else if (type === "SecureWatch") {
            const {geoserverParams: {CONNECTID}, startDate, endDate, baseUrl} = imageryParams;
            return {
                connectid: CONNECTID,
                startDate,
                endDate,
                baseUrl
            };
        } else {
            return imageryParams;
        }
    };

    //    Remote Calls    //

    sanitizeParams = (type, imageryParams) => {
        const sanitizedParams = {...imageryParams};
        imageryOptions[type].params.forEach(param => {
            if (param.sanitizer) {
                sanitizedParams[param.key] = param.sanitizer(sanitizedParams[param.key]);
            }
        });
        return sanitizedParams;
    };

    validateParams = (type, imageryParams) => {
        const parameterErrors = imageryOptions[type].params
            .map(param => (param.required !== false
                    && (!imageryParams[param.key] || imageryParams[param.key].length === 0)
                    && `${param.display} is required.`)
                || (param.validator && param.validator(imageryParams[param.key])));
        const imageryError = imageryOptions[type].validator && imageryOptions[type].validator(imageryParams);
        return [...parameterErrors, imageryError].filter(error => error);
    };

    uploadCustomImagery = isNew => {
        const sanitizedParams = this.sanitizeParams(this.state.selectedType, this.state.newImageryParams);
        const messages = this.validateParams(this.state.selectedType, sanitizedParams);
        if (messages.length > 0) {
            alert(messages.join(", "));
        } else {
            const sourceConfig = this.buildSecureWatch(this.stackParams(sanitizedParams)); // TODO define SecureWatch so stack params works correctly.
            if (this.state.newImageryTitle.length === 0 || this.state.newImageryAttribution.length === 0) {
                alert("You must include a title and attribution.");
            } else if (this.props.titleIsTaken(this.state.newImageryTitle, this.props.imageryToEdit.id)) {
                alert("The title '" + this.state.newImageryTitle + "' is already taken.");
            } else {
                fetch(isNew ? "/add-institution-imagery" : "/update-institution-imagery",
                      {
                          method: "POST",
                          headers: {
                              "Accept": "application/json",
                              "Content-Type": "application/json"
                          },
                          body: JSON.stringify({
                              institutionId: this.props.institutionId,
                              imageryId: this.props.imageryToEdit.id,
                              imageryTitle: this.state.newImageryTitle,
                              imageryAttribution: this.state.newImageryAttribution,
                              addToAllProjects: this.state.addToAllProjects,
                              sourceConfig
                          })
                      }).then(response => {
                    if (response.ok) {
                        this.props.getImageryList();
                        this.props.hideEditMode();
                    } else {
                        console.log(response);
                        alert("Error uploading imagery data. See console for details.");
                    }
                });
            }
        }
    };

    //    Helper Functions    //

    stackParams = params => {
        try {
            const imageryParams = imageryOptions[this.state.selectedType].params;
            return Object.keys(params)
                .sort(a => (imageryParams.find(p => p.key === a).parent ? 1 : -1)) // Sort params that require a parent to the bottom
                .reduce((a, c) => {
                    const parentStr = imageryParams.find(p => p.key === c).parent;
                    if (parentStr) {
                        const parentObj = JSON.parse(a[parentStr] || "{}");
                        return {...a, [parentStr]: {...parentObj, [c]: params[c]}};
                    } else {
                        return {...a, [c]: params[c]};
                    }
                }, {type: imageryOptions[this.state.selectedType].type});
        } catch (e) {
            return {};
        }
    };

    // TODO this shouldn't be needed if SecureWatch is defined correctly in imageryOptions
    buildSecureWatch = sourceConfig => {
        if (sourceConfig.type === "SecureWatch") {
            sourceConfig.geoserverUrl = `${sourceConfig.baseUrl}/mapservice/wmsaccess`;
            const geoserverParams = {
                "VERSION": "1.1.1",
                "STYLES": "",
                "LAYERS": "DigitalGlobe:Imagery",
                "CONNECTID": sourceConfig.connectid
            };
            sourceConfig.geoserverParams = geoserverParams;
            delete sourceConfig.connectid;
            return sourceConfig;
        } else {
            return sourceConfig;
        }
    };

    //    Render Functions    //

    formInput = (title, type, value, callback, link = null, options = {}) => (
        <div key={title} className="mb-3">
            <label>{title}</label> {link}
            <input
                autoComplete="off"
                className="form-control"
                onChange={e => callback(e)}
                type={type}
                value={value || ""}
                {...options}
            />
        </div>
    );

    formSelect = (title, value, callback, options, link = null) => (
        <div key={title} className="mb-3">
            <label>{title}</label> {link}
            <select
                className="form-control"
                onChange={e => callback(e)}
                value={value}
            >
                {options}
            </select>
        </div>
    );

    formTextArea = (title, value, callback, link = null, options = {}) => (
        <div key={title} className="mb-3">
            <label>{title}</label> {link}
            <textarea
                className="form-control"
                onChange={e => callback(e)}
                value={value || ""}
                {...options}
            />
        </div>
    );

    accessTokenLink = (url, key) => (url && key === "accessToken"
        ? (
            <a href={imageryOptions[this.state.selectedType].url} rel="noreferrer noopener" target="_blank">
                Click here for help.
            </a>
        ) : null);

    formTemplate = o => (
        o.type === "select"
            ? this.formSelect(
                o.display,
                this.state.newImageryParams[o.key],
                e => this.setState({
                    newImageryParams: {
                        ...this.state.newImageryParams,
                        [o.key]: e.target.value
                    },
                    newImageryAttribution: imageryOptions[this.state.selectedType].type === "BingMaps"
                        ? "Bing Maps API: " + e.target.value + " | © Microsoft Corporation"
                        : this.state.newImageryAttribution
                }),
                o.options.map(el => <option key={el.value} value={el.value}>{el.label}</option>),
                this.accessTokenLink(imageryOptions[this.state.selectedType].url, o.key)
            )
            : ["textarea", "JSON"].includes(o.type)
                ? this.formTextArea(
                    o.display,
                    this.state.newImageryParams[o.key],
                    e => this.setState({
                        newImageryParams: {...this.state.newImageryParams, [o.key]: e.target.value}
                    }),
                    this.accessTokenLink(imageryOptions[this.state.selectedType].url, o.key),
                    o.options ? o.options : {}
                )
                : this.formInput(
                    o.display,
                    o.type || "text",
                    this.state.newImageryParams[o.key],
                    e => this.setState({
                        newImageryParams: {...this.state.newImageryParams, [o.key]: e.target.value}
                    }),
                    this.accessTokenLink(imageryOptions[this.state.selectedType].url, o.key),
                    o.options ? o.options : {}
                )
    );

    // Imagery Type Change Handler //

    // TODO, this can be generalized back into imageryOptions
    getImageryAttribution = type => (type === "BingMaps"
        ? "Bing Maps API: Aerial | © Microsoft Corporation"
        : type.includes("Planet")
            ? "Planet Labs Global Mosaic | © Planet Labs, Inc"
            : type === "SecureWatch"
                ? "SecureWatch Imagery | © Maxar Technologies Inc."
                : ["Sentinel1", "Sentinel2"].includes(type) || type.includes("GEE")
                    ? "Google Earth Engine | © Google LLC"
                    : type.includes("MapBox")
                        ? "© Mapbox"
                        : type === "OSM"
                            ? "Open Street Map"
                            : "");

    imageryTypeChangeHandler = val => {
        const defaultState = imageryOptions[val].params.reduce((acc, cur) => ({
            ...acc,
            [cur.key]: cur.type === "select" ? cur.options[0].value : ""
        }), {});
        this.setState({
            selectedType: val,
            newImageryParams: defaultState,
            newImageryAttribution: this.getImageryAttribution(imageryOptions[val].type)
        });
    };

    render() {
        const isNewImagery = this.props.imageryToEdit.id === -1;
        return (
            <div className="mb-2 p-4 border rounded">
                {/* Selection for imagery type */}
                <div className="mb-3">
                    <label>Select Type</label>
                    <select
                        className="form-control"
                        disabled={!isNewImagery}
                        onChange={e => this.imageryTypeChangeHandler(e.target.value)}
                        value={this.state.selectedType}
                    >
                        {imageryOptions.map((o, i) => <option key={i} value={i}>{o.label || o.type}</option>)}
                    </select>
                </div>
                {/* Add fields. Include same for all and unique to selected type. */}
                {this.formInput("Title",
                                "text",
                                this.state.newImageryTitle,
                                e => this.setState({newImageryTitle: e.target.value}))}
                {/* This should be generalized into the imageryOptions */}
                {["GeoServer", "xyz"].includes(imageryOptions[this.state.selectedType].type)
                    && this.formInput(
                        "Attribution",
                        "text",
                        this.state.newImageryAttribution,
                        e => this.setState({newImageryAttribution: e.target.value})
                    )}
                {imageryOptions[this.state.selectedType].params.map(o => this.formTemplate(o))}
                {/* Action buttons for save and quit */}
                <div className="btn-group-vertical btn-block">
                    <div>
                        <input
                            checked={this.state.addToAllProjects}
                            className="mr-3"
                            id="add-to-all"
                            onChange={() => this.setState({addToAllProjects: !this.state.addToAllProjects})}
                            type="checkbox"
                        />
                        <label
                            htmlFor="add-to-all"
                        >
                            Add Imagery to All Projects When Saving
                        </label>
                    </div>
                    <button
                        className="btn btn-sm btn-block btn-outline-yellow btn-group py-2 font-weight-bold"
                        id="add-imagery-button"
                        onClick={() => this.uploadCustomImagery(isNewImagery)}
                        type="button"
                    >
                        {isNewImagery
                            ? <><UnicodeIcon backgroundColor="#f1c00f" icon="add"/>Add New Imagery</>
                            : <><UnicodeIcon backgroundColor="#f1c00f" icon="edit"/>Save Imagery Changes</>}
                    </button>
                    <button
                        className="btn btn-sm btn-block btn-outline-red btn-group py-2 font-weight-bold"
                        onClick={this.props.hideEditMode}
                        type="button"
                    >
                        <UnicodeIcon icon="noAction"/>Discard
                    </button>
                </div>
            </div>
        );
    }
}

function Imagery({title, canEdit, visibility, toggleVisibility, selectEditImagery, deleteImagery}) {
    return (
        <div className="row mb-1 d-flex">
            <div className="col-2 pr-0">
                <div
                    className="btn btn-sm btn-outline-lightgreen btn-block"
                    onClick={toggleVisibility}
                >
                    {visibility === "private" ? "Institution" : "Public"}
                </div>
            </div>
            <div className="col overflow-hidden">
                <button
                    className="btn btn-outline-lightgreen btn-sm btn-block text-truncate"
                    title={title}
                    type="button"
                >
                    {title}
                </button>
            </div>
            {canEdit && (
                <>
                    <div className="pr-3">
                        <button
                            className="btn btn-outline-yellow btn-sm btn-block px-3"
                            id="edit-imagery"
                            onClick={selectEditImagery}
                            type="button"
                        >
                            <UnicodeIcon icon="edit"/>
                        </button>
                    </div>
                    <div className="pr-3">
                        <button
                            className="btn btn-outline-red btn-sm btn-block px-3"
                            id="delete-imagery"
                            onClick={deleteImagery}
                            type="button"
                        >
                            <UnicodeIcon icon="trash"/>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

function ProjectList({isAdmin, institutionId, projectList, isVisible, deleteProject}) {
    return (
        <div style={!isVisible ? {display: "none"} : {}}>
            <div className="mb-3">
                This is a list of all institution projects. The color around the name shows its progress.
                Red indicates that it has no plots collected, yellow indicates that some plots have been
                collected, and green indicates that all plots have been selected.
            </div>
            {isAdmin && (
                <div className="row mb-3">
                    <div className="col">
                        <button
                            className="btn btn-sm btn-block btn-outline-yellow py-2 font-weight-bold"
                            id="create-project"
                            onClick={() => window.location.assign(`/create-project?institutionId=${institutionId}`)}
                            type="button"
                        >
                            <UnicodeIcon backgroundColor="#f1c00f" icon="add"/>Create New Project
                        </button>
                    </div>
                </div>
            )}
            {projectList === null
                ? <h3>Loading projects...</h3>
                : projectList.length === 0
                    ? <h3>There are no projects</h3>
                    : projectList.map((project, uid) => (
                        <Project
                            key={uid}
                            deleteProject={deleteProject}
                            isAdmin={isAdmin}
                            project={project}
                        />
                    ))}
        </div>
    );
}

function Project({project, isAdmin, deleteProject}) {
    return (
        <div className="row mb-1 d-flex">
            <div className="col-2 pr-0">
                <div className="btn btn-sm btn-outline-lightgreen btn-block">
                    {capitalizeFirst(project.privacyLevel)}
                </div>
            </div>
            <div className="col overflow-hidden">
                <button
                    className="btn btn-sm btn-outline-lightgreen btn-block text-truncate"
                    onClick={() => window.location.assign(`/collection?projectId=${project.id}`)}
                    style={{
                        boxShadow: project.percentComplete === 0.0
                            ? "0px 0px 6px 1px red inset"
                            : project.percentComplete >= 100.0
                                ? "0px 0px 6px 2px #3bb9d6 inset"
                                : "0px 0px 6px 1px yellow inset"
                    }}
                    title={project.name}
                    type="button"
                >
                    {project.name}
                </button>
            </div>
            {isAdmin
                && (
                    <div className="d-flex">
                        <span
                            className="btn btn-sm btn-outline-yellow btn-block px-3 mr-1"
                            onClick={() => window.location.assign(`/review-project?projectId=${project.id}`)}
                            title="Edit Project"
                        >
                            <UnicodeIcon icon="edit"/>
                        </span>
                        <span
                            className="btn btn-sm btn-outline-red btn-block px-3 mt-0 mr-1"
                            onClick={() => deleteProject(project.id)}
                            title="Delete Project"
                        >
                            <UnicodeIcon icon="trash"/>
                        </span>
                        <span
                            className="btn btn-sm btn-outline-lightgreen btn-block px-3 mt-0 mr-1"
                            onClick={() => window.open(`/dump-project-aggregate-data?projectId=${project.id}`, "_blank")}
                            title="Download Plot Data"
                        >
                        P
                        </span>
                        <span
                            className="btn btn-sm btn-outline-lightgreen btn-block px-3 mt-0"
                            onClick={() => window.open(`/dump-project-raw-data?projectId=${project.id}`, "_blank")}
                            title="Download Sample Data"
                        >
                        S
                        </span>
                    </div>
                )}
        </div>
    );
}

class UserList extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            institutionUserList: []
        };
    }

    componentDidMount() {
        this.getInstitutionUserList();
    }

    getInstitutionUserList = () => {
        fetch(`/get-institution-users?institutionId=${this.props.institutionId}`)
            .then(response => (response.ok ? response.json() : Promise.reject(response)))
            .then(data => {
                this.props.setUsersCount(
                    data.filter(user => user.institutionRole !== "pending").length
                );
                this.setState({institutionUserList: data});
            })
            .catch(response => {
                this.setState({institutionUserList: []});
                console.log(response);
                alert("Error retrieving the user list. See console for details.");
            });
    };

    updateUserInstitutionRole = (accountId, newUserEmail, newInstitutionRole) => {
        const existingRole = (this.state.institutionUserList.find(u => u.id === accountId) || {}).institutionRole;
        const adminCount = this.state.institutionUserList.filter(user => user.institutionRole === "admin").length;
        if (existingRole === "admin" && adminCount === 1) {
            alert("You cannot modify the last admin of an institution.");
        } else {
            this.props.processModal(
                "Updating user",
                () => fetch(
                    "/update-user-institution-role",
                    {
                        method: "POST",
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            accountId,
                            newUserEmail,
                            institutionId: this.props.institutionId,
                            institutionRole: newInstitutionRole
                        })
                    }
                )
                    .then(response => (response.ok ? response.json() : Promise.reject(response)))
                    .then(message => {
                        alert(message);
                        this.getInstitutionUserList();
                    })
                    .catch(response => {
                        console.log(response);
                        alert("Error updating institution details. See console for details.");
                    })
            );
        }
    };

    requestMembership = () => {
        fetch("/request-institution-membership",
              {
                  method: "POST",
                  headers: {
                      "Accept": "application/json",
                      "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                      institutionId: this.props.institutionId
                  })
              })
            .then(response => (response.ok ? response.json() : Promise.reject(response)))
            .then(message => {
                alert(message);
                this.getInstitutionUserList();
            })
            .catch(response => {
                console.log(response);
                alert("Error requesting institution membership. See console for details.");
            });
    };

    currentIsInstitutionMember = () => this.props.userId === 1
        || this.state.institutionUserList.some(iu => iu.id === this.props.userId);

    isInstitutionMember = userEmail => this.state.institutionUserList.some(iu => iu.email === userEmail);

    render() {
        return this.props.isVisible && (
            <>
                <div className="mb-3">
                    This is a list of all institution users.
                    An institution admin can create and update projects and imagery for the institution.
                    Members can view projects with the visibility Institution or higher.
                </div>
                <NewUserButtons
                    currentIsInstitutionMember={this.currentIsInstitutionMember()}
                    isAdmin={this.props.isAdmin}
                    isInstitutionMember={this.isInstitutionMember}
                    requestMembership={this.requestMembership}
                    updateUserInstitutionRole={this.updateUserInstitutionRole}
                    userId={this.props.userId}
                />
                {this.state.institutionUserList
                    .filter(iu => iu.id === this.props.userId
                        || this.props.isAdmin
                        || iu.institutionRole === "admin")
                    .sort((a, b) => sortAlphabetically(a.email, b.email))
                    .sort((a, b) => sortAlphabetically(a.institutionRole, b.institutionRole))
                    .map(iu => (
                        <User
                            key={iu}
                            isAdmin={this.props.isAdmin}
                            updateUserInstitutionRole={this.updateUserInstitutionRole}
                            user={iu}
                        />
                    ))}
            </>
        );
    }
}

function User({user, isAdmin, updateUserInstitutionRole}) {
    return (
        <div className="row">
            {!isAdmin && (
                <div className="col-2 mb-1 pr-0">
                    <div className="btn btn-sm btn-outline-lightgreen btn-block">
                        {capitalizeFirst(user.institutionRole)}
                    </div>
                </div>
            )}
            <div className="col mb-1 overflow-hidden">
                <button
                    className="btn btn-sm btn-outline-lightgreen btn-block text-truncate"
                    onClick={() => window.location.assign(`/account?accountId=${user.id}`)}
                    title={user.email}
                    type="button"
                >
                    {user.email}
                </button>
            </div>
            {isAdmin && (
                <div className="col-lg-3 mb-1 pl-0">
                    <select
                        className="custom-select custom-select-sm"
                        onChange={e => updateUserInstitutionRole(user.id, null, e.target.value)}
                        size="1"
                        value={user.institutionRole}
                    >
                        {user.institutionRole === "pending" && <option value="pending">Pending</option>}
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="not-member">Remove</option>
                    </select>
                </div>
            )}
        </div>
    );
}

class NewUserButtons extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            newUserEmail: ""
        };
    }

    checkUserEmail = () => {
        if (this.state.newUserEmail === "") {
            alert("Please enter an existing user's email address.");
            return false;
        } else if (this.props.isInstitutionMember(this.state.newUserEmail)) {
            alert(this.state.newUserEmail + " is already a member of this institution.");
            return false;
        } else {
            return true;
        }
    };

    addUser = () => this.props.updateUserInstitutionRole(null, this.state.newUserEmail, "member");

    render() {
        return (
            <>
                {this.props.isAdmin && (
                    <div className="row mb-1">
                        <div className="col-9 pr-3">
                            <input
                                autoComplete="off"
                                className="form-control form-control-sm py-2"
                                onChange={e => this.setState({newUserEmail: e.target.value})}
                                placeholder="Email"
                                type="email"
                                value={this.state.newUserEmail}
                            />
                        </div>
                        <div className="col-3 pl-0">
                            <button
                                className="btn btn-sm btn-outline-yellow btn-block py-2 font-weight-bold"
                                onClick={() => this.checkUserEmail() && this.addUser()}
                                type="button"
                            >
                                <UnicodeIcon backgroundColor="#f1c00f" icon="add"/>Add User
                            </button>
                        </div>
                    </div>
                )}
                {(this.props.userId > 0 && !this.props.currentIsInstitutionMember) && (
                    <div>
                        <button
                            className="btn btn-sm btn-outline-yellow btn-block mb-2"
                            id="request-membership-button"
                            onClick={this.props.requestMembership}
                            type="button"
                        >
                            <UnicodeIcon backgroundColor="#f1c00f" icon="add"/>Request membership
                        </button>
                    </div>
                )}
            </>
        );
    }
}

export function pageInit(args) {
    ReactDOM.render(
        <NavigationBar userId={args.userId} userName={args.userName}>
            <ReviewInstitution
                institutionId={parseInt(args.institutionId || "-1")}
                userId={args.userId || -1}
            />
        </NavigationBar>,
        document.getElementById("app")
    );
}

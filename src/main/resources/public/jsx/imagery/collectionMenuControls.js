import React from "react";

export function PlanetMenus({
    imageryYearPlanet,
    setImageryYearPlanet,
    imageryMonthPlanet,
    setImageryMonthPlanet,
    imageryMonthNamePlanet,
}) {
    return (
        <div className="PlanetsMenu my-2">
            <div className="slidecontainer form-control form-control-sm">
                <input
                    type="range"
                    min="2016"
                    max={new Date().getFullYear()}
                    value={imageryYearPlanet}
                    className="slider"
                    id="myRange"
                    onChange={e => setImageryYearPlanet(parseInt(e.target.value))}
                />
                <p>Year: <span id="demo">{imageryYearPlanet}</span></p>
            </div>
            <div className="slidecontainer form-control form-control-sm">
                <input
                    type="range"
                    min="1"
                    max="12"
                    value={imageryMonthPlanet}
                    className="slider"
                    id="myRangemonth"
                    onChange={e => setImageryMonthPlanet(parseInt(e.target.value))}
                />
                <p>Month: <span id="demo">{imageryMonthNamePlanet}</span></p>
            </div>
        </div>
    );
}

export function PlanetDailyMenus({
    imageryStartDatePlanetDaily,
    setImageryDatePlanetDaily,
    imageryEndDatePlanetDaily,
}) {
    return (
        <div className="PlanetsDailyMenu my-2">
            <label>Start Date</label>
            <div className="slidecontainer form-control form-control-sm">
                <input
                    type="date"
                    id="planetDailyStartDate"
                    value={imageryStartDatePlanetDaily}
                    max={new Date().toJSON().split("T")[0]}
                    min="2010-01-01"
                    style={{ width: "100%" }}
                    onChange={e => setImageryDatePlanetDaily(e.target)}
                />
            </div>
            <label>End Date</label>
            <div className="slidecontainer form-control form-control-sm">
                <input
                    type="date"
                    id="planetDailyEndDate"
                    value={imageryEndDatePlanetDaily}
                    max={new Date().toJSON().split("T")[0]}
                    min="2010-01-01"
                    style={{ width: "100%" }}
                    onChange={e => setImageryDatePlanetDaily(e.target)}
                />
            </div>
        </div>
    );
}

export function SecureWatchMenus({ imagerySecureWatchAvailableDates, onChangeSecureWatchSingleLayer }) {
    return (
        <div className="SecureWatchMenu my-2 mb-3">
            <div className="form-control form-control-sm">
                <label>Available Layers</label>
                {imagerySecureWatchAvailableDates && imagerySecureWatchAvailableDates.length > 0
                    ?
                        <select
                            className="form-control form-control-sm"
                            onChange={e => onChangeSecureWatchSingleLayer(e.target)}
                            id="securewatch-option-select"
                        >
                            {imagerySecureWatchAvailableDates.map((obj, uid) =>
                                <option key={uid} value={obj.featureId} date={obj.acquisitionDate} cloud={obj.cloudCover}>
                                    {obj.acquisitionDate + " (" + (obj.cloudCover * 100).toFixed(2) + "% cloudy)"}
                                </option>
                            )}
                        </select>
                    :
                        <select
                            className="form-control form-control-sm"
                            id="securewatch-option-select"
                            disabled
                        >
                            <option>
                                {imagerySecureWatchAvailableDates
                                    ? "No available layers"
                                    : "Loading dates..."
                                }
                            </option>
                        </select>
                }
            </div>
        </div>
    );
}

export function Sentinel1Menus({
    imageryYearSentinel1,
    setImageryYearSentinel,
    imageryMonthSentinel1,
    setImageryMonthSentinel,
    bandCombinationSentinel1,
    setBandCombinationSentinel,
}) {
    const bandCombinationOptions = [
        { label: "VH,VV,VH/VV", value: "VH,VV,VH/VV" },
        { label: "VH,VV,VV/VH", value: "VH,VV,VV/VH" },
        { label: "VV,VH,VV/VH", value: "VV,VH,VV/VH" },
        { label: "VV,VH,VH/VV", value: "VV,VH,VH/VV" },
    ];

    return (
        <div className="Sentinel1Menu my-2">
            <div className="slidecontainer form-control form-control-sm">
                <input
                    type="range"
                    min="2014"
                    max={new Date().getFullYear()}
                    value={imageryYearSentinel1}
                    className="slider"
                    id="sentinel1-year"
                    onChange={e => setImageryYearSentinel(e.target)}
                />
                <p>Year: <span>{imageryYearSentinel1}</span></p>
            </div>
            <div className="slidecontainer form-control form-control-sm">
                <input
                    type="range"
                    min="1"
                    max="12"
                    value={imageryMonthSentinel1}
                    className="slider"
                    id="sentinel1-month"
                    onChange={e => setImageryMonthSentinel(e.target)}
                />
                <p>Month: <span id="demo">{imageryMonthSentinel1}</span></p>
            </div>
            <div className="form-control form-control-sm" >
                <div className="mb-3">
                    <label>Band Combination</label>
                    <select
                        className="form-control"
                        id="sentinel1-bandCombination"
                        value={bandCombinationSentinel1}
                        onChange={e => setBandCombinationSentinel(e.target)}
                    >
                        {bandCombinationOptions.map(el => <option value={el.value} key={el.value}>{el.label}</option>)}
                    </select>
                </div>
            </div>
        </div>
    );
}

export function Sentinel2Menus({
    imageryYearSentinel2,
    setImageryYearSentinel,
    imageryMonthSentinel2,
    setImageryMonthSentinel,
    bandCombinationSentinel2,
    setBandCombinationSentinel,
}) {
    const bandCombinationOptions = [
        { label: "True Color", value: "TrueColor" },
        { label: "False Color Infrared", value: "FalseColorInfrared" },
        { label: "False Color Urban", value: "FalseColorUrban" },
        { label: "Agriculture", value: "Agriculture" },
        { label: "Healthy Vegetation", value: "HealthyVegetation" },
        { label: "Short Wave Infrared", value: "ShortWaveInfrared" },
    ];

    return (
        <div className="Sentinel2Menu my-2">
            <div className="slidecontainer form-control form-control-sm">
                <input
                    type="range"
                    min="2015"
                    max={new Date().getFullYear()}
                    value={imageryYearSentinel2}
                    className="slider"
                    id="sentinel2-year"
                    onChange={e => setImageryYearSentinel(e.target)}
                />
                <p>Year: <span>{imageryYearSentinel2}</span></p>
            </div>
            <div className="slidecontainer form-control form-control-sm">
                <input
                    type="range"
                    min="1"
                    max="12"
                    value={imageryMonthSentinel2}
                    className="slider"
                    id="sentinel2-month"
                    onChange={e => setImageryMonthSentinel(e.target)}
                />
                <p>Month: <span id="demo">{imageryMonthSentinel2}</span></p>
            </div>
            <div className="form-control form-control-sm" >
                <div className="mb-3">
                    <label>Band Combination</label>
                    <select
                        className="form-control"
                        id="sentinel2-bandCombination"
                        value={bandCombinationSentinel2}
                        onChange={e => setBandCombinationSentinel(e.target)}
                    >
                        {bandCombinationOptions.map(el => <option value={el.value} key={el.value}>{el.label}</option>)}
                    </select>
                </div>
            </div>
        </div>
    );
}

export function GEEImageMenus({ geeImageryVisParams, setGEEImageryVisParams, updateGEEImagery }) {
    return (
        <div className="GEEImageMenu my-2">
            <div className="form-control form-control-sm">
                <label>Visualization Parameters</label>
                <textarea
                    className="form-control"
                    id="geeImageVisParams"
                    value={geeImageryVisParams}
                    onChange={e => setGEEImageryVisParams(e.target.value)}
                >
                    {geeImageryVisParams}
                </textarea>
                <br />
                <button
                    type="button"
                    className="btn bg-lightgreen btn-sm btn-block"
                    id="update-gee-image-button"
                    onClick={updateGEEImagery}
                >
                    Update Image
                </button>
            </div>
        </div>
    );
}

export function GEEImageCollectionMenus({
    geeImageCollectionStartDate,
    setGEEImageCollectionStartDate,
    geeImageCollectionEndDate,
    setGEEImageCollectionEndDate,
    geeImageCollectionVisParams,
    setGEEImageCollectionVisParams,
    updateGEEImageCollection,
}) {
    return (
        <div className="GEEImageCollectionMenu my-2">
            <div className="form-control form-control-sm">
                <label>Start Date</label>
                <div className="slidecontainer form-control form-control-sm">
                    <input
                        type="date"
                        id="geeImageCollectionStartDate"
                        value={geeImageCollectionStartDate}
                        max={new Date().toJSON().split("T")[0]}
                        style={{ width: "100%" }}
                        onChange={e => setGEEImageCollectionStartDate(e.target.value)}
                    />
                </div>
                <label>End Date</label>
                <div className="slidecontainer form-control form-control-sm">
                    <input
                        type="date"
                        id="geeImageCollectionEndDate"
                        value={geeImageCollectionEndDate}
                        max={new Date().toJSON().split("T")[0]}
                        style={{ width: "100%" }}
                        onChange={e => setGEEImageCollectionEndDate(e.target.value)}
                    />
                </div>
                <label>Visualization Parameters</label>
                <textarea
                    className="form-control"
                    id="geeImageCollectionVisParams"
                    value={geeImageCollectionVisParams}
                    onChange={e => setGEEImageCollectionVisParams(e.target.value)}
                >
                    {geeImageCollectionVisParams}
                </textarea>
                <br />
                <button
                    type="button"
                    className="btn bg-lightgreen btn-sm btn-block"
                    id="update-gee-image-button"
                    onClick={updateGEEImageCollection}
                >
                    Update Image
                </button>
            </div>
        </div>
    );
}

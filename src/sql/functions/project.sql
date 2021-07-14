-- NAMESPACE: project
-- REQUIRES: clear

--
--  WIDGET FUNCTIONS
--

-- Adds a project_widget to the database
CREATE OR REPLACE FUNCTION add_project_widget(_project_id integer, _dashboard_id uuid, _widget jsonb)
 RETURNS integer AS $$

    INSERT INTO project_widgets
        (project_rid, dashboard_id, widget)
    VALUES
        (_project_id, _dashboard_id , _widget)
    RETURNING widget_uid

$$ LANGUAGE SQL;

-- Deletes a project_widget from the database
CREATE OR REPLACE FUNCTION delete_project_widget_by_widget_id(_widget_uid integer, _dashboard_id uuid)
 RETURNS integer AS $$

    DELETE FROM project_widgets
    WHERE dashboard_id = _dashboard_id
        AND CAST(jsonb_extract_path_text(widget, 'id') as int) = _widget_uid
    RETURNING widget_uid

$$ LANGUAGE SQL;

-- Gets project widgets by project id from the database
CREATE OR REPLACE FUNCTION get_project_widgets_by_project_id(_project_id integer)
 RETURNS table (
    widget_id        integer,
    project_id       integer,
    dashboard_id     uuid,
    widget           jsonb,
    project_title    text
 ) AS $$

    SELECT widget_uid, project_uid, dashboard_id, widget, p.name
    FROM project_widgets pw
    INNER JOIN projects p
        ON project_uid = project_rid
    WHERE project_rid = _project_id

$$ LANGUAGE SQL;

-- Updates a project_widget from the database
CREATE OR REPLACE FUNCTION update_project_widget_by_widget_id(_widget_uid integer, _dash_id uuid, _widget jsonb)
 RETURNS integer AS $$

    UPDATE project_widgets
    SET widget = _widget
    WHERE CAST(jsonb_extract_path_text(widget, 'id') as int) = _widget_uid
        AND dashboard_id = _dash_id
    RETURNING widget_uid

$$ LANGUAGE SQL;

--
--  MODIFY PROJECT FUNCTIONS
--

-- Create a project
CREATE OR REPLACE FUNCTION create_project(
    _institution_id         integer,
    _name                   text,
    _description            text,
    _privacy_level          text,
    _imagery_id             integer,
    _boundary               jsonb,
    _plot_distribution      text,
    _num_plots              integer,
    _plot_spacing           real,
    _plot_shape             text,
    _plot_size              real,
    _sample_distribution    text,
    _samples_per_plot       integer,
    _sample_resolution      real,
    _allow_drawn_samples    boolean,
    _survey_questions       jsonb,
    _survey_rules           jsonb,
    _token_key              text,
    _options                jsonb
 ) RETURNS integer AS $$

    INSERT INTO projects (
        institution_rid,
        availability,
        name,
        description,
        privacy_level,
        imagery_rid,
        boundary,
        plot_distribution,
        num_plots,
        plot_spacing,
        plot_shape,
        plot_size,
        sample_distribution,
        samples_per_plot,
        sample_resolution,
        allow_drawn_samples,
        survey_questions,
        survey_rules,
        created_date,
        token_key,
        options
    ) VALUES (
        _institution_id,
        'unpublished',
        _name,
        _description,
        _privacy_level,
        _imagery_id,
        ST_SetSRID(ST_GeomFromGeoJSON(_boundary), 4326),
        _plot_distribution,
        _num_plots,
        _plot_spacing,
        _plot_shape,
        _plot_size,
        _sample_distribution,
        _samples_per_plot,
        _sample_resolution,
        _allow_drawn_samples,
        _survey_questions,
        _survey_rules,
        now(),
        _token_key,
        _options
    )
    RETURNING project_uid

$$ LANGUAGE SQL;

-- Publish project
CREATE OR REPLACE FUNCTION publish_project(_project_id integer)
 RETURNS integer AS $$

    UPDATE projects
    SET availability = 'published',
        published_date = Now()
    WHERE project_uid = _project_id
    RETURNING _project_id

$$ LANGUAGE SQL;

-- Close project
CREATE OR REPLACE FUNCTION close_project(_project_id integer)
 RETURNS integer AS $$

    UPDATE projects
    SET availability = 'closed',
        closed_date = Now()
    WHERE project_uid = _project_id
    RETURNING _project_id

$$ LANGUAGE SQL;

-- Archive project
CREATE OR REPLACE FUNCTION archive_project(_project_id integer)
 RETURNS integer AS $$

    UPDATE projects
    SET availability = 'archived',
        archived_date = Now()
    WHERE project_uid = _project_id
    RETURNING _project_id

$$ LANGUAGE SQL;

-- Delete project and external file
CREATE OR REPLACE FUNCTION delete_project(_project_id integer)
 RETURNS void AS $$

 BEGIN
    -- Delete plots first for efficiency
    DELETE FROM plots
    WHERE plot_uid IN (
        SELECT plot_uid
        FROM projects
        INNER JOIN plots
            ON project_uid = project_rid
            AND project_uid = _project_id
    );

    DELETE FROM projects WHERE project_uid = _project_id;

 END

$$ LANGUAGE PLPGSQL;

-- Update select set of project fields
CREATE OR REPLACE FUNCTION update_project(
    _project_id             integer,
    _name                   text,
    _description            text,
    _privacy_level          text,
    _imagery_id             integer,
    _boundary               jsonb,
    _plot_distribution      text,
    _num_plots              integer,
    _plot_spacing           real,
    _plot_shape             text,
    _plot_size              real,
    _sample_distribution    text,
    _samples_per_plot       integer,
    _sample_resolution      real,
    _allow_drawn_samples    boolean,
    _survey_questions       jsonb,
    _survey_rules           jsonb,
    _options                jsonb
 ) RETURNS void AS $$

    UPDATE projects
    SET name = _name,
        description = _description,
        privacy_level = _privacy_level,
        imagery_rid = _imagery_id,
        boundary = ST_SetSRID(ST_GeomFromGeoJSON(_boundary), 4326),
        plot_distribution = _plot_distribution,
        num_plots = _num_plots,
        plot_spacing = _plot_spacing,
        plot_shape = _plot_shape,
        plot_size = _plot_size,
        sample_distribution = _sample_distribution,
        samples_per_plot = _samples_per_plot,
        sample_resolution = _sample_resolution,
        allow_drawn_samples = _allow_drawn_samples,
        survey_questions = _survey_questions,
        survey_rules = _survey_rules,
        options = _options
    WHERE project_uid = _project_id

$$ LANGUAGE SQL;

-- Update counts after plots are created
CREATE OR REPLACE FUNCTION update_project_counts(_project_id integer)
 RETURNS void AS $$

    WITH project_plots AS (
        SELECT project_uid, plot_uid, sample_uid
        FROM projects p
        INNER JOIN plots pl
            ON pl.project_rid = project_uid
        INNER JOIN samples s
            ON plot_uid = s.plot_rid
        WHERE project_uid = _project_id
    )

    UPDATE projects
    SET num_plots = plots,
        samples_per_plot = samples
    FROM (
        SELECT COUNT(DISTINCT plot_uid) as plots,
            (CASE WHEN COUNT(DISTINCT plot_uid) = 0 THEN
                0
            ELSE
                COUNT(sample_uid) / COUNT(DISTINCT plot_uid)
            END) as samples
        FROM project_plots
    ) a
    WHERE project_uid = _project_id

$$ LANGUAGE SQL;

-- Calculates boundary from for csv / shp data
CREATE OR REPLACE FUNCTION set_boundary(_project_id integer, _m_buffer real)
 RETURNS void AS $$

    UPDATE projects SET boundary = b
    FROM (
        SELECT ST_Envelope(ST_Buffer(ST_SetSRID(ST_Extent(plot_geom) , 4326)::geography , _m_buffer)::geometry) as b
        FROM plots
        WHERE project_rid = _project_id
    ) bb
    WHERE project_uid = _project_id

$$ LANGUAGE SQL;

-- Copy plot data and sample data
CREATE OR REPLACE FUNCTION copy_project_plots_samples(_old_project_uid integer, _new_project_uid integer)
 RETURNS integer AS $$

    WITH project_plots AS (
        SELECT plot_geom,
            visible_id,
            extra_plot_info,
            plot_uid as plid_old,
            row_number() OVER(order by plot_uid) as rowid
        FROM projects p
        INNER JOIN plots pl
            ON project_rid = project_uid
            AND project_rid = _old_project_uid
    ), inserting AS (
        INSERT INTO plots
            (project_rid, plot_geom, visible_id, extra_plot_info)
        SELECT _new_project_uid, plot_geom, visible_id, extra_plot_info
        FROM project_plots
        RETURNING plot_uid as plid
    ), new_ordered AS (
        SELECT plid, row_number() OVER(order by plid) as rowid FROM inserting
    ), combined AS (
        SELECT * from new_ordered inner join project_plots USING (rowid)
    ), inserting_samples AS (
        INSERT INTO samples
            (plot_rid,  sample_geom, visible_id, extra_sample_info)
        SELECT plid, sample_geom, visible_id, extra_sample_info
        FROM (
            SELECT plid, sample_geom, s.visible_id, extra_sample_info
            FROM combined c
            INNER JOIN samples s
                ON c.plid_old = s.plot_rid
        ) B
        RETURNING sample_uid
    )

    SELECT COUNT(1)::int FROM inserting_samples

$$ LANGUAGE SQL;

-- Copy other project fields that may not have been correctly passed from UI
CREATE OR REPLACE FUNCTION copy_project_plots_stats(_old_project_uid integer, _new_project_uid integer)
 RETURNS void AS $$

    UPDATE projects
    SET boundary = n.boundary,
        imagery_rid = n.imagery_rid,
        plot_distribution = n.plot_distribution,
        num_plots = n.num_plots,
        plot_spacing = n.plot_spacing,
        plot_shape = n.plot_shape,
        plot_size = n.plot_size,
        sample_distribution = n.sample_distribution,
        samples_per_plot = n.samples_per_plot,
        sample_resolution = n.sample_resolution
    FROM (SELECT
            boundary,             imagery_rid,
            plot_distribution,    num_plots,
            plot_spacing,         plot_shape,
            plot_size,            sample_distribution,
            samples_per_plot,     sample_resolution
         FROM projects
         WHERE project_uid = _old_project_uid) n
    WHERE
        project_uid = _new_project_uid

$$ LANGUAGE SQL;

-- Combines individual functions needed to copy all plot and sample information
CREATE OR REPLACE FUNCTION copy_template_plots(_old_project_uid integer, _new_project_uid integer)
 RETURNS void AS $$

    SELECT * FROM copy_project_plots_samples(_old_project_uid, _new_project_uid);
    SELECT * FROM copy_project_plots_stats(_old_project_uid, _new_project_uid);

$$ LANGUAGE SQL;

-- VALIDATIONS

-- Check if a project was created where plots have no samples
-- This only checks plots with external data. It assumes that auto generated samples generate correctly
CREATE OR REPLACE FUNCTION plots_missing_samples(_project_id integer)
 RETURNS table (visible_id integer) AS $$

    SELECT pl.visible_id
    FROM projects p
    INNER JOIN plots pl
        ON pl.project_rid = project_uid
    LEFT JOIN samples s
        ON plot_uid = s.plot_rid
    WHERE project_uid = _project_id
        AND sample_uid IS NULL

$$ LANGUAGE SQL;

--
-- USING PROJECT FUNCTIONS
--

CREATE OR REPLACE FUNCTION valid_boundary(_boundary geometry)
 RETURNS boolean AS $$

    SELECT EXISTS(
        SELECT 1
        WHERE _boundary IS NOT NULL
            AND ST_Contains(ST_MakeEnvelope(-180, -90, 180, 90, 4326), _boundary)
            AND ST_XMax(_boundary) > ST_XMin(_boundary)
            AND ST_YMax(_boundary) > ST_YMin(_boundary)
    )

$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION valid_project_boundary(_project_id integer)
 RETURNS boolean AS $$

    SELECT * FROM valid_boundary((SELECT boundary FROM projects WHERE project_uid = _project_id))

$$ LANGUAGE SQL;

-- Returns a row in projects by id
CREATE OR REPLACE FUNCTION select_project_by_id(_project_id integer)
 RETURNS table (
    project_id             integer,
    institution_id         integer,
    imagery_id             integer,
    availability           text,
    name                   text,
    description            text,
    privacy_level          text,
    boundary               text,
    plot_distribution      text,
    num_plots              integer,
    plot_spacing           real,
    plot_shape             text,
    plot_size              real,
    sample_distribution    text,
    samples_per_plot       integer,
    sample_resolution      real,
    allow_drawn_samples    boolean,
    survey_questions       jsonb,
    survey_rules           jsonb,
    options                jsonb,
    created_date           date,
    published_date         date,
    closed_date            date,
    has_geo_dash           boolean,
    token_key              text
 ) AS $$

    SELECT project_uid,
        institution_rid,
        imagery_rid,
        availability,
        name,
        description,
        privacy_level,
        ST_AsGeoJSON(boundary),
        plot_distribution,
        num_plots,
        plot_spacing,
        plot_shape,
        plot_size,
        sample_distribution,
        samples_per_plot,
        sample_resolution,
        allow_drawn_samples,
        survey_questions,
        survey_rules,
        options,
        created_date,
        published_date,
        closed_date,
        count(widget_uid) > 1,
        token_key
    FROM projects
    LEFT JOIN project_widgets
        ON project_rid = project_uid
    WHERE project_uid = _project_id
        AND availability <> 'archived'
    GROUP BY project_uid

$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION user_project(_user_id integer, _role_id integer, _privacy_level text, _availability text)
 RETURNS boolean AS $$

    SELECT (_role_id = 1 AND _availability <> 'archived')
            OR (_availability = 'published'
                AND (_privacy_level = 'public'
                    OR (_user_id > 0 AND _privacy_level = 'users')
                    OR (_role_id = 2 AND _privacy_level = 'institution')))

$$ LANGUAGE SQL IMMUTABLE;

-- Returns all projects the user can see. This is used only on the home page
CREATE OR REPLACE FUNCTION select_user_home_projects(_user_id integer)
 RETURNS table (
    project_id        integer,
    institution_id    integer,
    name              text,
    description       text,
    centroid          text,
    num_plots         integer,
    editable          boolean
 ) AS $$

    SELECT project_uid,
        p.institution_rid,
        name,
        description,
        ST_AsGeoJSON(ST_Centroid(boundary)),
        num_plots,
        (CASE WHEN role_rid IS NULL THEN FALSE ELSE role_rid = 1 END) AS editable
    FROM projects as p
    LEFT JOIN institution_users iu
        ON user_rid = _user_id
        AND p.institution_rid = iu.institution_rid
    WHERE user_project(_user_id, role_rid, p.privacy_level, p.availability)
        AND valid_boundary(boundary) = TRUE
    ORDER BY project_uid

$$ LANGUAGE SQL;

-- Returns percent of plots collected.
CREATE OR REPLACE FUNCTION project_percent_complete(_project_id integer)
 RETURNS real AS $$

    SELECT (
        CASE WHEN count(distinct(plot_uid)) > 0
        THEN (100.0 * count(user_plot_uid) / count(distinct(plot_uid))::real)
        ELSE 0
        END
    )::real
    FROM plots
    LEFT JOIN user_plots
        ON plot_uid = plot_rid
    WHERE project_rid = _project_id

$$ LANGUAGE SQL;

-- Returns all rows in projects for a user_id and institution_rid with roles
CREATE OR REPLACE FUNCTION select_institution_projects(_user_id integer, _institution_id integer)
 RETURNS table (
    project_id       integer,
    name             text,
    num_plots        integer,
    privacy_level    text,
    pct_complete     real
 ) AS $$

    SELECT project_uid,
        name,
        num_plots,
        privacy_level,
        (SELECT project_percent_complete(project_uid))
    FROM projects as p
    LEFT JOIN institution_users iu
        ON user_rid = _user_id
        AND p.institution_rid = iu.institution_rid
    WHERE p.institution_rid = _institution_id
        AND user_project(_user_id, role_rid, p.privacy_level, p.availability)
    ORDER BY project_uid

$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION select_template_projects(_user_id integer)
 RETURNS table (
     project_id    integer,
     name          text
 ) AS $$

    SELECT project_uid, name
    FROM projects as p
    LEFT JOIN institution_users iu
        ON user_rid = _user_id
        AND p.institution_rid = iu.institution_rid
    WHERE (role_rid = 1 AND p.availability <> 'archived')
        OR (role_rid = 2
            AND p.privacy_level IN ('public', 'institution', 'users')
            AND p.availability = 'published')
        OR (_user_id > 0
            AND p.privacy_level IN ('public', 'users')
            AND p.availability = 'published')
        OR (p.privacy_level IN ('public')
            AND p.availability = 'published')
    ORDER BY project_uid

$$ LANGUAGE SQL;

-- Returns project users (SQL helper functions)
CREATE OR REPLACE FUNCTION select_project_users(_project_id integer)
 RETURNS table (
    user_uid integer
 ) AS $$

    WITH matching_projects AS (
        SELECT *
        FROM projects
        WHERE project_uid = _project_id
    ), matching_institutions AS (
        SELECT *
        FROM projects p
        INNER JOIN institutions i
            ON p.institution_rid = institution_uid
        WHERE project_uid = _project_id
    ), matching_institution_users AS (
        SELECT *
        FROM matching_institutions mi
        INNER JOIN institution_users ui
            ON mi.institution_uid = ui.institution_rid
        INNER JOIN users u
            ON user_uid = ui.user_rid
        INNER JOIN roles r
            ON role_uid = ui.role_rid
    )

    SELECT user_uid
    FROM matching_projects
    CROSS JOIN users
    WHERE privacy_level = 'public'

    UNION ALL
    SELECT user_uid
    FROM matching_institution_users
    WHERE privacy_level = 'private'
        AND title = 'admin'

    UNION ALL
    SELECT user_uid
    FROM matching_institution_users
    WHERE privacy_level = 'institution'
        AND availability = 'published'
        AND title = 'member'

$$ LANGUAGE SQL;

-- Returns project statistics
-- Overlapping queries, consider condensing. Query time is not an issue.
CREATE OR REPLACE FUNCTION select_project_statistics(_project_id integer)
 RETURNS table (
    flagged_plots       integer,
    assigned_plots      integer,
    unassigned_plots    integer,
    members             integer,
    contributors        integer,
    created_date        date,
    published_date      date,
    closed_date         date,
    archived_date       date,
    user_stats          text
 ) AS $$

    WITH project_plots AS (
        SELECT project_uid,
            plot_uid,
            (CASE WHEN collection_time IS NULL OR collection_start IS NULL THEN 0
                ELSE EXTRACT(EPOCH FROM (collection_time - collection_start)) END) as seconds,
            (CASE WHEN collection_time IS NULL OR collection_start IS NULL THEN 0 ELSE 1 END) as timed,
            u.email as email
        FROM user_plots up
        INNER JOIN plots pl
            ON up.plot_rid = plot_uid
        INNER JOIN projects p
            ON pl.project_rid = project_uid
        INNER JOIN users u
            ON up.user_rid = user_uid
        WHERE project_uid = _project_id
    ), user_groups AS (
        SELECT email,
            SUM(seconds)::int as seconds,
            COUNT(plot_uid) as plots,
            SUM(timed):: int as timedPlots
        FROM project_plots
        GROUP BY email
        ORDER BY email DESC
    ), user_agg as (
        SELECT
            format('[%s]',
                   string_agg(
                       format('{"user":"%s", "seconds":%s, "plots":%s, "timedPlots":%s}'
                              , email, seconds, plots, timedPlots), ', ')) as user_stats
        FROM user_groups
    ), members AS (
        SELECT COUNT(distinct user_uid) as members
        FROM select_project_users(_project_id)
    ), plotsum AS (
        SELECT SUM(coalesce(flagged::int, 0)) as flagged,
            SUM((user_plot_uid IS NOT NULL)::int) as assigned,
            plot_uid
        FROM projects prj
        INNER JOIN plots pl
          ON project_uid = pl.project_rid
        LEFT JOIN user_plots up
            ON up.plot_rid = pl.plot_uid
        GROUP BY project_uid, plot_uid
        HAVING project_uid = _project_id
    ), sums AS (
        SELECT MAX(prj.created_date) as created_date,
            MAX(prj.published_date) as published_date,
            MAX(prj.closed_date) as closed_date,
            MAX(prj.archived_date) as archived_date,
            (CASE WHEN SUM(ps.flagged::int) IS NULL THEN 0 ELSE SUM(ps.flagged::int) END) as flagged,
            (CASE WHEN SUM(ps.assigned::int) IS NULL THEN 0 ELSE SUM(ps.assigned::int) END) as assigned,
            COUNT(distinct pl.plot_uid) as plots
        FROM projects prj
        INNER JOIN plots pl
          ON project_uid = pl.project_rid
        LEFT JOIN plotsum ps
          ON ps.plot_uid = pl.plot_uid
        WHERE project_uid = _project_id
    ), users_count AS (
        SELECT COUNT (DISTINCT user_rid) as users
        FROM projects prj
        INNER JOIN plots pl
          ON project_uid = pl.project_rid
            AND project_uid = _project_id
        LEFT JOIN user_plots up
          ON up.plot_rid = plot_uid
    )

    SELECT CAST(flagged as int) as flagged_plots,
        CAST(assigned as int) assigned_plots,
        CAST(GREATEST(0, (plots-flagged-assigned)) as int) as unassigned_plots,
        CAST(members as int) as members,
        CAST(users_count.users as int) as contributors,
        created_date, published_date, closed_date, archived_date,
        user_stats
    FROM members, sums, users_count, user_agg

$$ LANGUAGE SQL;

--
--  PLOT FUNCTIONS
--

-- Flag plot
CREATE OR REPLACE FUNCTION flag_plot(_plot_id integer, _user_id integer, _collection_start timestamp, _flagged_reason text)
 RETURNS integer AS $$

    DELETE
    FROM sample_values
    WHERE user_plot_rid = (
        SELECT user_plot_uid
        FROM user_plots
        WHERE user_rid = _user_id
            AND plot_rid = _plot_id
    );

    INSERT INTO user_plots
        (user_rid, plot_rid, flagged, collection_start, collection_time, flagged_reason)
    VALUES
        (_user_id, _plot_id, true, _collection_start, Now(), _flagged_reason)
    ON CONFLICT (user_rid, plot_rid) DO
        UPDATE
        SET flagged = excluded.flagged,
            user_rid = excluded.user_rid,
            confidence = NULL,
            collection_start = excluded.collection_start,
            collection_time = Now(),
            flagged_reason = excluded.flagged_reason

    RETURNING _plot_id

$$ LANGUAGE SQL;

-- Select plots but only return a maximum number
CREATE OR REPLACE FUNCTION select_limited_project_plots(_project_id integer, _maximum integer)
 RETURNS table (
    plot_id     integer,
    center      text,
    flagged     boolean,
    assigned    integer
 ) AS $$

    SELECT plot_uid,
        ST_AsGeoJSON(ST_Centroid(plot_geom)) as center,
        CASE WHEN flagged IS NULL THEN FALSE ELSE flagged END,
        CASE WHEN user_plot_uid IS NULL THEN 0 ELSE 1 END
    FROM plots
    LEFT JOIN user_plots
        ON plot_uid = plot_rid
    WHERE project_rid = _project_id
    LIMIT _maximum;

$$ LANGUAGE SQL;

-- Returns plot geom for the geodash
CREATE OR REPLACE FUNCTION select_plot_geom(_plot_id integer)
 RETURNS text AS $$

    SELECT ST_AsGeoJSON(plot_geom)
    FROM plots p
    WHERE p.plot_uid = _plot_id

$$ LANGUAGE SQL;

-- Select plots
CREATE OR REPLACE FUNCTION select_project_collection_plots(_project_id integer)
 RETURNS table (
    plot_id            integer,
    user_id            integer,
    flagged            boolean,
    flagged_reason     text,
    confidence         integer,
    visible_id         integer,
    plot_geom          text,
    extra_plot_info    jsonb
 ) AS $$

    SELECT plot_uid,
        user_rid,
        flagged,
        flagged_reason,
        confidence,
        visible_id,
        ST_AsGeoJSON(plot_geom),
        extra_plot_info
    FROM plots pl
    LEFT JOIN user_plots
        ON plot_uid = plot_rid
    WHERE project_rid = _project_id

$$ LANGUAGE SQL;

-- Check if plot exists by visible_id
CREATE OR REPLACE FUNCTION plot_exists(_project_id integer, _visible_id integer)
 RETURNS boolean AS $$

    SELECT count(visible_id) > 0
    FROM plots
    WHERE project_rid = _project_id
        AND visible_id = _visible_id

$$ LANGUAGE SQL;

-- FIXME, I dont think we need 6 functions for navigating plots.
-- This return type is so the 6 functions match return types.
DROP TYPE IF EXISTS collection_return;
CREATE TYPE collection_return AS (
    plot_id            integer,
    flagged            boolean,
    flagged_reason     text,
    confidence         integer,
    visible_id         integer,
    plot_geom          text,
    extra_plot_info    jsonb
);

-- Returns next unanalyzed plot
CREATE OR REPLACE FUNCTION select_next_unassigned_plot(_project_id integer, _visible_id integer)
 RETURNS setOf collection_return AS $$

    SELECT plot_id,
        flagged,
        flagged_reason,
        confidence,
        visible_id,
        plot_geom,
        extra_plot_info
    FROM select_project_collection_plots(_project_id)
    LEFT JOIN plot_locks pl
        ON plot_id = pl.plot_rid
    WHERE visible_id > _visible_id
        AND user_id IS NULL
        AND (pl.lock_end IS NULL
            OR localtimestamp > pl.lock_end)
    ORDER BY visible_id ASC
    LIMIT 1

$$ LANGUAGE SQL;

-- Returns next user analyzed plot
CREATE OR REPLACE FUNCTION select_next_user_plot(
    _project_id    integer,
    _visible_id    integer,
    _user_id       integer,
    _review_all    boolean
 ) RETURNS setOf collection_return AS $$

    SELECT plot_id,
        flagged,
        flagged_reason,
        confidence,
        visible_id,
        plot_geom,
        extra_plot_info
    FROM select_project_collection_plots(_project_id)
    WHERE visible_id > _visible_id
        AND ((_review_all AND user_id IS NOT NULL)
             OR user_id = _user_id)
    ORDER BY visible_id ASC
    LIMIT 1

$$ LANGUAGE SQL;

-- Returns prev unanalyzed plot
CREATE OR REPLACE FUNCTION select_prev_unassigned_plot(_project_id integer, _visible_id integer)
 RETURNS setOf collection_return AS $$

    SELECT plot_id,
        flagged,
        flagged_reason,
        confidence,
        visible_id,
        plot_geom,
        extra_plot_info
    FROM select_project_collection_plots(_project_id)
    LEFT JOIN plot_locks pl
        ON plot_id = pl.plot_rid
    WHERE visible_id < _visible_id
        AND user_id IS NULL
        AND (pl.lock_end IS NULL
            OR localtimestamp > pl.lock_end)
    ORDER BY visible_id DESC
    LIMIT 1

$$ LANGUAGE SQL;

-- Returns prev user analyzed plot
CREATE OR REPLACE FUNCTION select_prev_user_plot(
    _project_id    integer,
    _visible_id    integer,
    _user_id       integer,
    _review_all    boolean
 ) RETURNS setOf collection_return AS $$

    SELECT plot_id,
        flagged,
        flagged_reason,
        confidence,
        visible_id,
        plot_geom,
        extra_plot_info
    FROM select_project_collection_plots(_project_id) as spp
    WHERE visible_id < _visible_id
        AND ((_review_all AND user_id IS NOT NULL)
             OR user_id = _user_id)
    ORDER BY visible_id DESC
    LIMIT 1

$$ LANGUAGE SQL;

-- Returns unanalyzed plots by plot id
CREATE OR REPLACE FUNCTION select_by_id_unassigned_plot(_project_id integer, _visible_id integer)
 RETURNS setOf collection_return AS $$

    SELECT plot_id,
        flagged,
        flagged_reason,
        confidence,
        visible_id,
        plot_geom,
        extra_plot_info
    FROM select_project_collection_plots(_project_id) as spp
    LEFT JOIN plot_locks pl
        ON plot_id = pl.plot_rid
    WHERE visible_id = _visible_id
        AND user_id IS NULL
        AND (pl.lock_end IS NULL
            OR localtimestamp > pl.lock_end)

$$ LANGUAGE SQL;

-- Returns user analyzed plots by plot id
CREATE OR REPLACE FUNCTION select_by_id_user_plot(
    _project_id    integer,
    _visible_id    integer,
    _user_id       integer,
    _review_all    boolean
 ) RETURNS setOf collection_return AS $$

    SELECT plot_id,
        flagged,
        flagged_reason,
        confidence,
        visible_id,
        plot_geom,
        extra_plot_info
    FROM select_project_collection_plots(_project_id)
    WHERE visible_id = _visible_id
        AND ((_review_all AND user_id IS NOT NULL)
             OR user_id = _user_id)

$$ LANGUAGE SQL;

-- Lock plot to user
CREATE OR REPLACE FUNCTION lock_plot(_plot_id integer, _user_id integer, _lock_end timestamp)
 RETURNS VOID AS $$

    INSERT INTO plot_locks
        (user_rid, plot_rid, lock_end)
    VALUES
        (_user_id, _plot_id, _lock_end)

$$ LANGUAGE SQL;

-- Reset time on lock
CREATE OR REPLACE FUNCTION lock_plot_reset(_plot_id integer, _user_id integer, _lock_end timestamp)
 RETURNS VOID AS $$

    UPDATE plot_locks pl
    SET lock_end = _lock_end
    WHERE pl.plot_rid = _plot_id
        AND pl.user_rid = _user_id

$$ LANGUAGE SQL;

-- Remove all locks from user and old locks
CREATE OR REPLACE FUNCTION unlock_plots(_user_id integer)
 RETURNS VOID AS $$

    DELETE FROM plot_locks pl
    WHERE pl.user_rid = _user_id
        OR pl.lock_end < localtimestamp

$$ LANGUAGE SQL;

--
--  SAMPLE FUNCTIONS
--

-- Create project plot sample with no external file data
CREATE OR REPLACE FUNCTION create_project_plot_sample(_plot_id integer, _sample_geom jsonb)
 RETURNS integer AS $$

    INSERT INTO samples
        (plot_rid, sample_geom)
    VALUES
        (_plot_id, ST_SetSRID(ST_GeomFromGeoJSON(_sample_geom), 4326))
    RETURNING sample_uid

$$ LANGUAGE SQL;

-- Select samples for a plot.
CREATE OR REPLACE FUNCTION select_plot_samples(_plot_id integer)
 RETURNS table (
    sample_id        integer,
    sample_geom      text,
    saved_answers    jsonb
 ) AS $$

    SELECT sample_uid,
        ST_AsGeoJSON(sample_geom) as sample_geom,
        (CASE WHEN sv.saved_answers IS NULL THEN '{}' ELSE sv.saved_answers END)
    FROM samples
    LEFT JOIN sample_values sv
        ON sample_uid = sv.sample_rid
    WHERE samples.plot_rid = _plot_id

$$ LANGUAGE SQL;

-- Select just sample geoms.
CREATE OR REPLACE FUNCTION select_plot_sample_geoms(_plot_id integer)
 RETURNS table (sample_geom text) AS $$

    SELECT ST_AsGeoJSON(sample_geom)
    FROM samples s
    WHERE s.plot_rid = _plot_id

$$ LANGUAGE SQL;

-- FIXME this can probably be eliminate with a rewrite to update_user_samples
-- Returns user plots table id if available
CREATE OR REPLACE FUNCTION check_user_plots(_plot_id integer)
 RETURNS integer AS $$

    SELECT user_plot_uid
    FROM user_plots up
    WHERE up.plot_rid = _plot_id

$$ LANGUAGE SQL;

-- FIXME _project_id is not used
-- Add user sample value selections
CREATE OR REPLACE FUNCTION add_user_samples(
    _project_id          integer,
    _plot_id             integer,
    _user_id             integer,
    _confidence          integer,
    _collection_start    timestamp,
    _samples             jsonb,
    _images              jsonb
 ) RETURNS integer AS $$

    WITH user_plot_table AS (
        INSERT INTO user_plots
            (user_rid, plot_rid, confidence, collection_start, collection_time)
        VALUES
            (_user_id, _plot_id, _confidence, _collection_start, Now())
        RETURNING user_plot_uid
    ), new_sample_values AS (
        SELECT CAST(key as integer) as sample_id, value FROM jsonb_each(_samples)
    ), image_values AS (
        SELECT sample_id, id as imagery_id, attributes as imagery_attributes
        FROM (SELECT CAST(key as integer) as sample_id, value FROM jsonb_each(_images)) a
        CROSS JOIN LATERAL
        jsonb_to_record(a.value) as (id int, attributes text)
    )

    INSERT INTO sample_values
        (user_plot_rid, sample_rid, imagery_rid, imagery_attributes, saved_answers)
    (SELECT user_plot_uid, nsv.sample_id, iv.imagery_id, iv.imagery_attributes::jsonb, nsv.value
        FROM user_plot_table AS upt, samples AS s
            INNER JOIN new_sample_values as nsv
                ON sample_uid = nsv.sample_id
            INNER JOIN image_values as iv
                ON sample_uid = iv.sample_id
        WHERE s.plot_rid = _plot_id)

    RETURNING sample_value_uid

$$ LANGUAGE SQL;

-- FIXME _project_id is not used
-- Update user sample value selections
CREATE OR REPLACE FUNCTION update_user_samples(
    _user_plots_uid      integer,
    _project_id          integer,
    _plot_id             integer,
    _user_id             integer,
    _confidence          integer,
    _collection_start    timestamp,
    _samples             jsonb,
    _images              jsonb
 ) RETURNS integer AS $$

    WITH user_plot_table AS (
        UPDATE user_plots
            SET confidence = _confidence,
                collection_start = _collection_start,
                collection_time = localtimestamp,
                flagged = FALSE,
                flagged_reason = null
        WHERE user_plot_uid = _user_plots_uid
        RETURNING user_plot_uid
    ), new_sample_values AS (
        SELECT CAST(key as integer) as sample_id, value FROM jsonb_each(_samples)
    ), image_values AS (
        SELECT sample_id, id as imagery_id, attributes as imagery_attributes
        FROM (SELECT CAST(key as integer) as sample_id, value FROM jsonb_each(_images)) a
        CROSS JOIN LATERAL
        jsonb_to_record(a.value) as (id int, attributes text)
    ), plot_samples AS (
        SELECT user_plot_uid, nsv.sample_id, iv.imagery_id, iv.imagery_attributes::jsonb, nsv.value
        FROM user_plot_table AS upt, samples AS s
        INNER JOIN new_sample_values as nsv ON sample_uid = nsv.sample_id
        INNER JOIN image_values as iv ON sample_uid = iv.sample_id
        WHERE s.plot_rid = _plot_id
    )

    INSERT INTO sample_values
        (user_plot_rid, sample_rid, imagery_rid, imagery_attributes, saved_answers)
        (SELECT user_plot_uid, sample_id, imagery_id, imagery_attributes, value FROM plot_samples)
    ON CONFLICT (user_plot_rid, sample_rid) DO
        UPDATE
        SET user_plot_rid = excluded.user_plot_rid,
            imagery_rid = excluded.imagery_rid,
            imagery_attributes = excluded.imagery_attributes,
            saved_answers = excluded.saved_answers

    RETURNING sample_values.sample_rid

$$ LANGUAGE SQL;

--
--  RESETTING COLLECTION
--

-- For clearing user plots for a single plot
CREATE OR REPLACE FUNCTION delete_user_plot_by_plot(_plot_id integer)
 RETURNS void AS $$

    DELETE FROM user_plots WHERE plot_rid = _plot_id

$$ LANGUAGE SQL;

-- For clearing samples for a single plot
CREATE OR REPLACE FUNCTION delete_samples_by_plot(_plot_id integer)
 RETURNS void AS $$

    DELETE FROM samples WHERE plot_rid = _plot_id

$$ LANGUAGE SQL;

-- For clearing all plots in a project
CREATE OR REPLACE FUNCTION delete_plots_by_project(_project_id integer)
 RETURNS void AS $$

    DELETE FROM plots WHERE project_rid = _project_id

$$ LANGUAGE SQL;

-- For clearing all user plots in a project
CREATE OR REPLACE FUNCTION delete_user_plots_by_project(_project_id integer)
 RETURNS void AS $$

    DELETE FROM user_plots WHERE plot_rid IN (SELECT plot_uid FROM plots WHERE project_rid = _project_id)

$$ LANGUAGE SQL;

-- For clearing all samples in a project
CREATE OR REPLACE FUNCTION delete_all_samples_by_project(_project_id integer)
 RETURNS void AS $$

    DELETE FROM samples WHERE plot_rid IN (SELECT plot_uid FROM plots WHERE project_rid = _project_id)

$$ LANGUAGE SQL;

-- Get all plots and centers to recreate samples.
CREATE OR REPLACE FUNCTION get_plot_centers_by_project(_project_id integer)
 RETURNS table (
    plot_id       integer,
    visible_id    integer,
    lon           double precision,
    lat           double precision
 ) AS $$

    SELECT plot_uid,
        visible_id,
        ST_X(ST_Centroid(plot_geom)) AS lon,
        ST_Y(ST_Centroid(plot_geom)) AS lat
    FROM plots
    WHERE project_rid = _project_id

$$ LANGUAGE SQL;

--
--  AGGREGATE FUNCTIONS
--

-- Returns project aggregate data
-- TODO, return WKT geom
CREATE OR REPLACE FUNCTION dump_project_plot_data(_project_id integer)
 RETURNS table (
    plot_id                    integer,
    center_lon                 double precision,
    center_lat                 double precision,
    size_m                     text,
    shape                      real,
    email                      text,
    flagged                    boolean,
    flagged_reason             text,
    confidence                 integer,
    collection_time            timestamp,
    analysis_duration          numeric,
    samples                    text,
    common_securewatch_date    text,
    total_securewatch_dates    integer,
    extra_plot_info            jsonb
 ) AS $$

    SELECT plot_uid,
        ST_X(ST_Centroid(plot_geom)) AS lon,
        ST_Y(ST_Centroid(plot_geom)) AS lat,
        plot_shape,
        plot_size,
        email,
        flagged,
        flagged_reason,
        confidence,
        collection_time,
        ROUND(EXTRACT(EPOCH FROM (collection_time - collection_start))::numeric, 1) AS analysis_duration,
        FORMAT('[%s]', STRING_AGG(
            (CASE WHEN saved_answers IS NULL THEN
                FORMAT('{"%s":"%s"}', 'id', sample_uid)
            ELSE
                FORMAT('{"%s":"%s", "%s":%s}', 'id', sample_uid, 'saved_answers', saved_answers)
            END),', '
        )) AS samples,
        MODE() WITHIN GROUP (ORDER BY imagery_attributes->>'imagerySecureWatchDate') AS common_securewatch_date,
        COUNT(DISTINCT(imagery_attributes->>'imagerySecureWatchDate'))::int AS total_securewatch_dates,
        extra_plot_info
    FROM projects p
    INNER JOIN plots pl
        ON project_uid = pl.project_rid
    INNER JOIN samples s
        ON s.plot_rid = pl.plot_uid
    LEFT JOIN user_plots up
        ON up.plot_rid = pl.plot_uid
    LEFT JOIN sample_values sv
        ON sv.sample_rid = s.sample_uid
    LEFT JOIN users u
        ON u.user_uid = up.user_rid
    WHERE project_rid = _project_id
    GROUP BY project_uid, plot_uid, user_plot_uid, email, extra_plot_info
    ORDER BY plot_uid

$$ LANGUAGE SQL;

-- Returns project raw data
CREATE OR REPLACE FUNCTION dump_project_sample_data(_project_id integer)
 RETURNS table (
        plot_id               integer,
        sample_id             integer,
        lon                   double precision,
        lat                   double precision,
        email                 text,
        flagged               boolean,
        collection_time       timestamp,
        analysis_duration     numeric,
        imagery_title         text,
        imagery_attributes    text,
        sample_geom           text,
        saved_answers         jsonb,
        extra_plot_info       jsonb,
        extra_sample_info     jsonb
 ) AS $$

    SELECT plot_uid,
        sample_uid,
        ST_X(ST_Centroid(sample_geom)) AS lon,
        ST_Y(ST_Centroid(sample_geom)) AS lat,
        email,
        flagged,
        collection_time,
        ROUND(EXTRACT(EPOCH FROM (collection_time - collection_start))::numeric, 1) AS analysis_duration,
        title AS imagery_title,
        imagery_attributes::text,
        ST_AsText(sample_geom),
        saved_answers,
        extra_plot_info,
        extra_sample_info
    FROM plots pl
    INNER JOIN samples s
        ON s.plot_rid = pl.plot_uid
    LEFT JOIN user_plots up
        ON up.plot_rid = pl.plot_uid
    LEFT JOIN sample_values sv
        ON sample_uid = sv.sample_rid
    LEFT JOIN imagery
        ON imagery_uid = sv.imagery_rid
    LEFT JOIN users u
        ON u.user_uid = up.user_rid
    WHERE pl.project_rid = _project_id
    ORDER BY plot_uid, sample_uid

$$ LANGUAGE SQL;

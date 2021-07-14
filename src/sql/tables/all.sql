-- NAMESPACE: all

--
-- Create tables
--

-- Stores information about users
CREATE TABLE users (
    user_uid         SERIAL PRIMARY KEY,
    email            text NOT NULL UNIQUE,
    password         varchar(72) NOT NULL,
    administrator    boolean DEFAULT FALSE,
    reset_key        text DEFAULT NULL,
    verified         boolean DEFAULT FALSE
);

-- Stores information about institutions
CREATE TABLE institutions (
    institution_uid    SERIAL PRIMARY KEY,
    name               text NOT NULL,
    logo_data          bytea,
    description        text NOT NULL,
    url                text NOT NULL,
    archived           boolean DEFAULT FALSE,
    created_date       date DEFAULT NOW(),
    archived_date      date
);

-- Stores text values for roles
CREATE TABLE roles (
    role_uid    SERIAL PRIMARY KEY,
    title       text NOT NULL
);

-- Creates a relationship between users and institutions
-- institutions -> many institution_users <- users
CREATE TABLE institution_users (
    inst_user_uid      SERIAL PRIMARY KEY,
    institution_rid    integer NOT NULL REFERENCES institutions (institution_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    user_rid           integer NOT NULL REFERENCES users (user_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    role_rid           integer NOT NULL REFERENCES roles (role_uid),
    CONSTRAINT per_institution_per_plot UNIQUE(institution_rid, user_rid)
);

-- Stores imagery data
-- 1 institution -> many imagery
CREATE TABLE imagery (
    imagery_uid        SERIAL PRIMARY KEY,
    institution_rid    integer REFERENCES institutions (institution_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    visibility         text NOT NULL,
    title              text NOT NULL,
    attribution        text NOT NULL,
    extent             jsonb,
    source_config      jsonb,
    archived           boolean DEFAULT FALSE,
    created_date       date DEFAULT NOW(),
    archived_date      date
);

-- Stores information about projects
-- Each project must be associated with an institution
CREATE TABLE projects (
    project_uid            SERIAL PRIMARY KEY,
    institution_rid        integer NOT NULL REFERENCES institutions (institution_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    availability           text,
    name                   text NOT NULL,
    description            text,
    privacy_level          text,
    boundary               geometry(Polygon,4326),
    plot_distribution      text,
    num_plots              integer,
    plot_spacing           real,
    plot_shape             text,
    plot_size              real,
    sample_distribution    text,
    samples_per_plot       integer,
    sample_resolution      real,
    survey_questions       jsonb,
    survey_rules           jsonb,
    created_date           date,
    published_date         date,
    closed_date            date,
    archived_date          date,
    ts_start_year          integer DEFAULT 1985,
    ts_end_year            integer,
    ts_target_day          integer DEFAULT 215,
    ts_plot_size           integer DEFAULT 1,
    token_key              text DEFAULT NULL,
    options                jsonb NOT NULL DEFAULT '{}'::jsonb,
    imagery_rid            integer REFERENCES imagery (imagery_uid),
    allow_drawn_samples    boolean
);

-- Stores project imagery
-- 1 project -> many imagery
CREATE TABLE project_imagery (
    project_imagery_uid    SERIAL PRIMARY KEY,
    project_rid            integer REFERENCES projects(project_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    imagery_rid            integer REFERENCES imagery (imagery_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT per_project_per_imagery UNIQUE(project_rid, imagery_rid)
);

-- Stores information about plot packet
CREATE TABLE packets (
    packet_uid      serial PRIMARY KEY,
    project_rid     integer NOT NULL REFERENCES projects(project_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    title           varchar(12) NOT NULL,
    created_date    timestamp NOT NULL DEFAULT current_timestamp
);

CREATE TABLE packet_users (
    packet_user_uid    serial PRIMARY KEY,
    packet_rid         integer NOT NULL REFERENCES packets(packet_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    user_rid           integer NOT NULL REFERENCES users(user_uid) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 1 project -> many |plots ->                                     many samples|
--                   |plots -> many user_plots -> many sample_values <- samples|
--                                       ^- users|


-- Stores plot information, including a reference to external plot data if it exists
-- 1 PROJECT -> MANY |PLOTS ->                                     many samples|
--                   |plots -> many user_plots -> many sample_values <- samples|
--                                       ^- users|
CREATE TABLE plots (
    plot_uid           SERIAL PRIMARY KEY,
    project_rid        integer NOT NULL REFERENCES projects (project_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    plot_geom          geometry(geometry,4326),
    visible_id         integer,
    extra_plot_info    jsonb
);

CREATE TABLE packet_plots (
    packet_plot_uid    serial PRIMARY KEY,
    packet_rid         integer NOT NULL REFERENCES packets(packet_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    plot_rid           integer NOT NULL REFERENCES plots(plot_uid) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Stores sample information, including a reference to external sample data if it exists
-- 1 project -> many |PLOTS ->                                     MANY SAMPLES|
--                   |plots -> many user_plots -> many sample_values <- samples|
--                                       ^- users|
CREATE TABLE samples (
    sample_uid           SERIAL PRIMARY KEY,
    plot_rid             integer NOT NULL REFERENCES plots (plot_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    sample_geom          geometry(geometry,4326),
    visible_id           integer,
    extra_sample_info    jsonb
);

-- Stores information about a plot as data is collected, including the user who collected it
-- By other means we restrict it to 1 user_plot per plot
-- 1 project -> many |plots ->                                     many samples|
--                   |PLOTS -> MANY USER_PLOTS -> many sample_values <- samples|
--                                       ^- USERS|
CREATE TABLE user_plots (
    user_plot_uid       SERIAL PRIMARY KEY,
    user_rid            integer NOT NULL REFERENCES users (user_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    plot_rid            integer NOT NULL REFERENCES plots (plot_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    packet_rid          integer NULL REFERENCES packets (packet_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    flagged             boolean DEFAULT FALSE,
    confidence          integer CHECK (confidence >= 0 AND confidence <= 100),
    collection_start    timestamp,
    collection_time     timestamp,
    flagged_reason      text,
    CONSTRAINT per_user_per_plot UNIQUE(user_rid, plot_rid)
);

-- Stores collected data for a single sample
-- By other means we restrict to 1 sample_value per sample
-- 1 project -> many |plots ->                                     many samples|
--                   |plots -> many USER_PLOTS -> MANY SAMPLE_VALUES <- SAMPLES|
--                                       ^- users|
CREATE TABLE sample_values (
    sample_value_uid      SERIAL PRIMARY KEY,
    user_plot_rid         integer NOT NULL REFERENCES user_plots (user_plot_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    sample_rid            integer NOT NULL REFERENCES samples (sample_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    imagery_rid           integer REFERENCES imagery (imagery_uid),
    imagery_attributes    jsonb,
    saved_answers         jsonb,
    CONSTRAINT per_sample_per_user UNIQUE(sample_rid, user_plot_rid)
);

-- Stores active user information for a plot
-- many plots <-> many users, although by other means we restrict it to 1 user to 1 plot
CREATE TABLE plot_locks (
    user_rid    integer NOT NULL REFERENCES users(user_uid),
    plot_rid    integer NOT NULL REFERENCES plots(plot_uid) ON DELETE CASCADE,
    lock_end    timestamp,
    PRIMARY KEY(user_rid, plot_rid)
);

-- Stores widget information for a project
-- 1 project -> many widgets
CREATE TABLE project_widgets (
    widget_uid      SERIAL PRIMARY KEY,
    project_rid     integer NOT NULL REFERENCES projects (project_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    dashboard_id    uuid,
    widget          jsonb
);

-- Stores timesync comment for plot
CREATE TABLE plot_comments (
    plot_comments_uid     bigserial PRIMARY KEY,
    project_rid           integer NOT NULL REFERENCES projects(project_uid) ON UPDATE CASCADE,
    plot_rid              integer NOT NULL REFERENCES plots(plot_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    user_rid              integer NOT NULL REFERENCES users(user_uid) ON UPDATE CASCADE,
    packet_rid            integer DEFAULT NULL REFERENCES packets(packet_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    comment               text,
    is_example            integer DEFAULT NULL,
    is_complete           integer DEFAULT NULL,
    is_wetland            integer DEFAULT NULL,
    uncertainty           integer DEFAULT NULL,
    last_modified_date    timestamp NOT NULL DEFAULT current_timestamp
);

-- Stores vertex information
CREATE TABLE vertex (
    vertex_uid        bigserial PRIMARY KEY,
    project_rid       integer NOT NULL REFERENCES projects(project_uid) ON UPDATE CASCADE,
    plot_rid          integer NOT NULL REFERENCES plots(plot_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    user_rid          integer NOT NULL REFERENCES users(user_uid) ON UPDATE CASCADE,
    packet_rid        integer DEFAULT NULL REFERENCES packets(packet_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    image_year        integer DEFAULT NULL,
    image_julday      integer DEFAULT NULL,
    image_id          text,
    landuse           jsonb,
    landcover         jsonb,
    change_process    jsonb,
    reflectance       jsonb,
    is_vertex         boolean,
    comments          varchar(255) DEFAULT NULL,
    last_modified     timestamp NOT NULL DEFAULT current_timestamp,
    history_flag      integer DEFAULT 0
);

-- Stores user preference for selected image for interpretation
CREATE TABLE image_preference (
    image_preference_uid    serial PRIMARY KEY,
    project_rid             integer NOT NULL REFERENCES projects(project_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    plot_rid                integer NOT NULL REFERENCES plots(plot_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    user_rid                integer NOT NULL REFERENCES users(user_uid) ON UPDATE CASCADE,
    packet_rid              integer DEFAULT NULL REFERENCES packets(packet_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    image_id                text,
    image_year              integer NOT NULL,
    image_julday            integer NOT NULL,
    priority                integer NOT NULL
);

-- Indices
CREATE INDEX project_widgets_dashboard_id      ON project_widgets (dashboard_id);

-- Indices on FK
CREATE INDEX plots_projects_rid                ON plots (project_rid);
CREATE INDEX samples_plot_rid                  ON samples (plot_rid);
CREATE INDEX imagery_institution_rid           ON imagery (institution_rid);
CREATE INDEX institution_users_institution_rid ON institution_users (institution_rid);
CREATE INDEX institution_users_user_rid        ON institution_users (user_rid);
CREATE INDEX user_plots_plot_rid               ON user_plots (plot_rid);
CREATE INDEX user_plots_user_rid               ON user_plots (user_rid);
CREATE INDEX sample_values_user_plot_rid       ON sample_values (user_plot_rid);
CREATE INDEX sample_values_sample_rid          ON sample_values (sample_rid);
CREATE INDEX sample_values_imagery_rid         ON sample_values (imagery_rid);
CREATE INDEX project_widgets_project_rid       ON project_widgets (project_rid);

-- Indices for TimeSync related tables
CREATE UNIQUE INDEX packets_project_rid_title ON packets USING btree(project_rid, title);
CREATE UNIQUE INDEX packet_users_packet_rid_user_rid ON packet_users USING btree(packet_rid, user_rid);
CREATE UNIQUE INDEX packet_plots_packet_rid_plot_rid ON packet_plots USING btree(packet_rid, plot_rid);
CREATE UNIQUE INDEX plot_comments_project_plot_user_packet ON plot_comments USING btree(project_rid, plot_rid, user_rid, packet_rid);
CREATE INDEX vertex_project_plot_user_packet ON vertex USING btree(project_rid, plot_rid, user_rid, packet_rid);
CREATE UNIQUE INDEX image_preference_project_plot_user_packet_year ON image_preference (project_rid, plot_rid, user_rid, packet_rid, image_year);

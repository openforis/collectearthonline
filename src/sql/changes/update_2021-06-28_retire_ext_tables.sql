-- Add new columns
ALTER TABLE plots ADD COLUMN plot_geom geometry(geometry,4326);
ALTER TABLE plots ADD COLUMN visible_id integer;
ALTER TABLE plots ADD COLUMN extra_plot_info jsonb;
ALTER TABLE samples ADD COLUMN visible_id integer;
ALTER TABLE samples ADD COLUMN extra_sample_info jsonb;

-- Migrate data
CREATE OR REPLACE FUNCTION merge_ext_plots(_project_id integer)
 RETURNS void AS $$

 DECLARE
    i1 integer;
    i2 integer;
    _plots_ext_table text;
 BEGIN
    SELECT plots_ext_table INTO _plots_ext_table FROM projects WHERE project_uid = _project_id;
    IF _plots_ext_table IS NULL OR _plots_ext_table = '' THEN RETURN; END IF;

    EXECUTE 'SELECT * FROM information_schema.columns
                WHERE table_name = ''' || _plots_ext_table || '''
                AND (column_name = ''lon'' OR column_name = ''lat'')
                AND data_type = ''double precision''';
    GET DIAGNOSTICS i1 = ROW_COUNT;
    IF i1 = 2 THEN EXECUTE
        'ALTER table ext_tables.' || _plots_ext_table || ' ADD COLUMN IF NOT EXISTS plotid integer;

        UPDATE plots p
        SET plot_geom = a.plot_geom,
            visible_id = a.plotid,
            extra_plot_info = a.row
        FROM (
            SELECT plot_uid,
                plotid::integer as plotid,
                ST_SetSRID(ST_MakePoint(lon, lat), 4326) as plot_geom,
                row_to_json(xxx)::jsonb - ''lat'' - ''lon'' - ''gid'' - ''plotid'' as row
            FROM plots p
            INNER JOIN ext_tables.' || _plots_ext_table || ' xxx
               ON ext_id = gid
            WHERE project_rid = ' || _project_id
        || ') a
        WHERE p.plot_uid = a.plot_uid';
    END IF;

    EXECUTE 'SELECT * FROM information_schema.columns
                WHERE table_name = ''' || _plots_ext_table || '''
                AND column_name = ''geom''';
    GET DIAGNOSTICS i2 = ROW_COUNT;
    IF i2 = 1 THEN EXECUTE
        'ALTER table ext_tables.' || _plots_ext_table || ' ADD COLUMN IF NOT EXISTS plotid integer;

        UPDATE plots p
        SET plot_geom = a.plot_geom,
            visible_id = a.plotid,
            extra_plot_info = a.row
        FROM (
            SELECT plot_uid,
                plotid::integer as plotid,
                ST_Force2D(geom) as plot_geom,
                row_to_json(xxx)::jsonb - ''geom'' - ''gid'' - ''plotid'' as row
            FROM plots p
            INNER JOIN ext_tables.' || _plots_ext_table || ' xxx
               ON ext_id = gid
            WHERE project_rid = ' || _project_id
        || ') a
        WHERE p.plot_uid = a.plot_uid';
    END IF;
 END

$$ LANGUAGE PLPGSQL;

DO $$

 DECLARE
    pid RECORD;
 BEGIN
    FOR pid IN SELECT * FROM projects WHERE plots_ext_table IS NOT NULL
    LOOP
        PERFORM merge_ext_plots(pid.project_uid);
    END LOOP;
 END

$$ LANGUAGE PLPGSQL;

CREATE OR REPLACE FUNCTION merge_ext_samples(_project_id integer)
 RETURNS void AS $$

 DECLARE
    i1 integer;
    i2 integer;
    _samples_ext_table text;
 BEGIN
    SELECT samples_ext_table INTO _samples_ext_table FROM projects WHERE project_uid = _project_id;
    IF _samples_ext_table IS NULL OR _samples_ext_table = '' THEN RETURN; END IF;

    EXECUTE 'SELECT * FROM information_schema.columns
                WHERE table_name = ''' || _samples_ext_table || '''
                AND (column_name = ''lon'' OR column_name = ''lat'')
                AND data_type = ''double precision''';
    GET DIAGNOSTICS i1 = ROW_COUNT;
    IF i1 = 2 THEN EXECUTE
        'ALTER table ext_tables.' || _samples_ext_table || ' ADD COLUMN IF NOT EXISTS sampleid integer;

        UPDATE samples p
        SET sample_geom = a.sample_geom,
            visible_id = a.sampleid,
            extra_sample_info = a.row
        FROM (
            SELECT sample_uid,
                sampleid::integer as sampleid,
                ST_SetSRID(ST_MakePoint(lon, lat), 4326) as sample_geom,
                row_to_json(xxx)::jsonb - ''lat'' - ''lon'' - ''gid'' - ''plotid'' - ''sampleid'' as row
            FROM plots
            INNER JOIN samples s
                ON plot_uid = plot_rid
            INNER JOIN ext_tables.' || _samples_ext_table || ' xxx
               ON s.ext_id = gid
            WHERE project_rid = ' || _project_id
        || ') a
        WHERE p.sample_uid = a.sample_uid';
    END IF;

    EXECUTE 'SELECT * FROM information_schema.columns
                WHERE table_name = ''' || _samples_ext_table || '''
                AND column_name = ''geom''';
    GET DIAGNOSTICS i2 = ROW_COUNT;
    IF i2 = 1 THEN EXECUTE
        'ALTER table ext_tables.' || _samples_ext_table || ' ADD COLUMN IF NOT EXISTS sampleid integer;

        UPDATE samples p
        SET sample_geom = a.sample_geom,
            visible_id = a.sampleid,
            extra_sample_info = a.row
        FROM (
            SELECT sample_uid,
                sampleid::integer as sampleid,
                ST_Force2D(geom) as sample_geom,
                row_to_json(xxx)::jsonb - ''geom'' - ''gid'' - ''plotid'' - ''sampleid'' as row
            FROM plots
            INNER JOIN samples s
                ON plot_uid = plot_rid
            INNER JOIN ext_tables.' || _samples_ext_table || ' xxx
               ON s.ext_id = gid
            WHERE project_rid = ' || _project_id
        || ') a
        WHERE p.sample_uid = a.sample_uid';
    END IF;
 END

$$ LANGUAGE PLPGSQL;

DO $$

 DECLARE
    pid RECORD;
 BEGIN
    FOR pid IN SELECT * FROM projects WHERE samples_ext_table IS NOT NULL
    LOOP
        PERFORM merge_ext_samples(pid.project_uid);
    END LOOP;
 END

$$ LANGUAGE PLPGSQL;

-- Fill in missing
UPDATE plots
SET plot_geom = center
WHERE plot_geom IS NULL;

-- Use row over query to update visible ids.
UPDATE plots p
SET visible_id = row_num
FROM (
    SELECT plot_uid,
    row_number() OVER(PARTITION BY project_rid ORDER BY plot_uid)::int AS row_num
    FROM plots
    WHERE visible_id IS NULL
    ORDER BY project_rid, plot_uid
) AS np
WHERE p.plot_uid = np.plot_uid;

-- There are too many samples for the simple query for samples.
CREATE TABLE temp_samp (
    sample_uid    integer,
    vis_id        integer
);

INSERT INTO temp_samp
SELECT sample_uid,
    row_number() OVER(PARTITION BY project_rid ORDER BY sample_uid)::int AS row_num
FROM plots
INNER JOIN samples s
    ON plot_uid = plot_rid
WHERE s.visible_id IS NULL;

CREATE INDEX su ON temp_samp (sample_uid);

UPDATE samples p
SET visible_id = vis_id
FROM temp_samp t
WHERE p.sample_uid = t.sample_uid;

DROP TABLE temp_samp;

-- Drop old columns
ALTER TABLE plots DROP COLUMN center;
ALTER TABLE plots DROP COLUMN ext_id;
ALTER TABLE samples DROP COLUMN ext_id;
ALTER TABLE projects DROP COLUMN plots_ext_table;
ALTER TABLE projects DROP COLUMN samples_ext_table;

-- Drop old tables
DO $$

 DECLARE
    pid RECORD;
 BEGIN
    FOR pid IN SELECT * FROM projects LIMIT 10000
    LOOP
        EXECUTE
        'DROP TABLE IF EXISTS ext_tables.project_' || pid.project_uid || '_plots_csv;'
        'DROP TABLE IF EXISTS ext_tables.project_' || pid.project_uid || '_plots_shp;'
        'DROP TABLE IF EXISTS ext_tables.project_' || pid.project_uid || '_samples_csv;'
        'DROP TABLE IF EXISTS ext_tables.project_' || pid.project_uid || '_samples_shp;';
    END LOOP;
 END

$$ LANGUAGE PLPGSQL;

DO $$

 DECLARE
    pid RECORD;
 BEGIN
    FOR pid IN SELECT * FROM projects
    LOOP
        EXECUTE
        'DROP TABLE IF EXISTS ext_tables.project_' || pid.project_uid || '_plots_csv;'
        'DROP TABLE IF EXISTS ext_tables.project_' || pid.project_uid || '_plots_shp;'
        'DROP TABLE IF EXISTS ext_tables.project_' || pid.project_uid || '_samples_csv;'
        'DROP TABLE IF EXISTS ext_tables.project_' || pid.project_uid || '_samples_shp;';
    END LOOP;
 END

$$ LANGUAGE PLPGSQL;

DROP schema ext_tables CASCADE;

VACUUM FULL;

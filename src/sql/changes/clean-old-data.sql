-- Validate and then move to functions where it can run every time the server is re-deployed

-- Archive malformed projects
SELECT (SELECT archive_project(project_uid))
FROM projects
WHERE survey_questions->0 IS NULL
    OR survey_questions IS NULL
    OR survey_questions = 'null'

-- Archive old projects
SELECT archive_project(project_uid)
FROM (
    SELECT project_uid, availability,
        EXTRACT(days FROM now() - created_date) as p_age,
        CASE WHEN COUNT(DISTINCT(user_plot_uid)) = 0 THEN 0
            ELSE COUNT(DISTINCT(user_plot_uid)) / COUNT(DISTINCT(plot_uid))
            END as complete
    FROM projects
    LEFT JOIN plots
        ON project_uid = project_rid
    LEFT JOIN user_plots up
        ON plot_uid = up.plot_rid
    GROUP BY project_uid
) A
WHERE (p_age > 180
        AND ((availability = 'unpublished' AND complete < 0.05)
            OR (availability = 'closed' AND complete < 0.05)
            OR (availability = 'published' AND complete = 0)))
    OR (p_age > 270 AND complete < 0.05);

-- Delete archived projects
SELECT delete_project(project_uid)
FROM (
    SELECT project_uid,
        availability,
        archived_date,
        EXTRACT(days from now() - archived_date) as p_age
    FROM projects
) a
WHERE availability = 'archived'
    AND (p_age > 180 OR archived_date is NULL);

-- Archive empty institutions
SELECT archive_institution(institution_uid)
FROM (
    SELECT institution_uid,
        count(project_uid) p_cnt,
        EXTRACT(days from now() - i.created_date) as i_age
    FROM institutions i
    LEFT JOIN projects
    ON institution_uid = institution_rid
        AND availability <> 'archived'
    GROUP BY institution_uid
    ORDER BY p_cnt desc
) a
WHERE (i_age > 180 OR institution_uid < 500)
    AND p_cnt = 0;

-- Delete archived institutions
DELETE FROM institutions
WHERE institution_uid IN
(
    SELECT institution_uid
    FROM (
        SELECT institution_uid,
            archived,
            archived_date,
            EXTRACT(days from now() - archived_date) as i_age
        FROM institutions
    ) a
    WHERE i_age > 180
        AND archived = TRUE
);

REINDEX DATABASE ceo;
VACUUM FULL;

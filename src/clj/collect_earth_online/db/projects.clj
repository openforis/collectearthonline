(ns collect-earth-online.db.projects
  (:import java.text.SimpleDateFormat
           java.util.Date
           java.util.UUID)
  (:require [clojure.string     :as str]
            [clojure.set        :as set]
            [clojure.java.io    :as io]
            [clojure.java.shell :as sh]
            [collect-earth-online.utils.type-conversion :as tc]
            [collect-earth-online.utils.part-utils      :as pu]
            [collect-earth-online.database :refer [call-sql sql-primitive]]
            [collect-earth-online.views    :refer [data-response]]))

;;; Constants

(def tmp-dir  (System/getProperty "java.io.tmpdir"))
(def path-env (System/getenv "PATH"))

;;; Auth Functions

(defn- check-auth-common [user-id project-id token-key sql-query]
  (or (and token-key
           (= token-key (:token_key (first (call-sql "select_project_by_id" {:log? false} project-id)))))
      (sql-primitive (call-sql sql-query {:log? false} user-id project-id))))

(defn can-collect? [user-id project-id token-key]
  (check-auth-common user-id project-id token-key "can_user_collect_project"))

(defn is-proj-admin? [user-id project-id token-key]
  (check-auth-common user-id project-id token-key "can_user_edit_project"))

;;; Data Functions

(def default-options {:showGEEScript       false
                      :showPlotInformation false
                      :collectConfidence   false
                      :autoLaunchGeoDash   true})

(defn get-home-projects [{:keys [params]}]
  (data-response (mapv (fn [{:keys [project_id institution_id name description num_plots centroid editable]}]
                         {:id            project_id
                          :institutionId institution_id
                          :name          name
                          :description   description
                          :numPlots      num_plots
                          :centroid      centroid
                          :editable      editable})
                       (call-sql "select_user_home_projects" (:userId params -1)))))

(defn get-institution-projects [{:keys [params]}]
  (let [user-id        (:userId params -1)
        institution-id (tc/val->int (:institutionId params))]
    (data-response (mapv (fn [{:keys [project_id name privacy_level pct_complete num_plots]}]
                           {:id              project_id
                            :name            name
                            :numPlots        num_plots
                            :privacyLevel    privacy_level
                            :percentComplete pct_complete})
                         (call-sql "select_institution_projects" user-id institution-id)))))

(defn get-template-projects [{:keys [params]}]
  (let [user-id (:userId params -1)]
    (data-response (mapv (fn [{:keys [project_id name]}]
                           {:id   project_id
                            :name name})
                         (call-sql "select_template_projects" user-id)))))

(defn- build-project-by-id [user-id project-id]
  (let [project (first (call-sql "select_project_by_id" project-id))]
    {:id                 (:project_id project)     ; TODO dont return known values
     :institution        (:institution_id project) ; TODO legacy variable name, update to institutionId
     :imageryId          (:imagery_id project)
     :availability       (:availability project)
     :name               (:name project)
     :description        (:description project)
     :privacyLevel       (:privacy_level project)
     :boundary           (:boundary project)
     :plotDistribution   (:plot_distribution project)
     :numPlots           (:num_plots project)
     :plotSpacing        (:plot_spacing project)
     :plotShape          (:plot_shape project)
     :plotSize           (:plot_size project)
     :sampleDistribution (:sample_distribution project)
     :samplesPerPlot     (:samples_per_plot project)
     :sampleResolution   (:sample_resolution project)
     :allowDrawnSamples  (:allow_drawn_samples project)
     :surveyQuestions    (tc/jsonb->clj (:survey_questions project) [])
     :surveyRules        (tc/jsonb->clj (:survey_rules project) [])
     :projectOptions     (merge default-options (tc/jsonb->clj (:options project)))
     :createdDate        (str (:created_date project))
     :publishedDate      (str (:published_date project))
     :closedDate         (str (:closed_date project))
     :isProjectAdmin     (is-proj-admin? user-id project-id nil)}))

(defn get-project-by-id [{:keys [params]}]
  (let [user-id    (:userId params -1)
        project-id (tc/val->int (:projectId params))]
    (data-response (build-project-by-id user-id project-id))))

(defn get-template-by-id [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))
        project (first (call-sql "select_project_by_id" project-id))]
    (data-response {:imageryId          (:imagery_id project)
                    :name               (:name project)
                    :description        (:description project)
                    :boundary           (:boundary project)
                    :plotDistribution   (:plot_distribution project)
                    :numPlots           (:num_plots project)
                    :plotSpacing        (:plot_spacing project)
                    :plotShape          (:plot_shape project)
                    :plotSize           (:plot_size project)
                    :sampleDistribution (:sample_distribution project)
                    :samplesPerPlot     (:samples_per_plot project)
                    :sampleResolution   (:sample_resolution project)
                    :allowDrawnSamples  (:allow_drawn_samples project)
                    :surveyQuestions    (tc/jsonb->clj (:survey_questions project) [])
                    :surveyRules        (tc/jsonb->clj (:survey_rules project) [])
                    :projectOptions     (merge default-options (tc/jsonb->clj (:options project)))})))

(defn get-project-stats [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))
        stats      (first (call-sql "select_project_statistics" project-id))]
    (data-response {:flaggedPlots    (:flagged_plots stats)
                    :analyzedPlots   (:assigned_plots stats) ;TODO why don't these variable match? unanalyzed is not a word, but unassigned is.
                    :unanalyzedPlots (:unassigned_plots stats)
                    :members         (:members stats)
                    :contributors    (:contributors stats)
                    :createdDate     (str (:created_date stats))
                    :publishedDate   (str (:published_date stats))
                    :closedDate      (str (:closed_date stats))
                    :userStats       (tc/jsonb->clj (:user_stats stats))})))

;;; Create/Update Common

(defn- get-first-public-imagery []
  (sql-primitive (call-sql "select_first_public_imagery")))

;; TODO use bulk insert statement
(defn- insert-project-imagery [project-id imagery-list]
  (doseq [imagery imagery-list]
    (call-sql "insert_project_imagery" project-id imagery)))

;;; Create Project

(defn- init-throw [message]
  (throw (ex-info message {:causes [message]})))

(defn- try-catch-throw [try-fn message]
  (try (try-fn)
       (catch Exception e
         (let [causes (conj (:causes (ex-data e) []) message)]
           (throw (ex-info message {:causes causes}))))))

;; Check plot limits

(defn- count-gridded-points [left bottom right top spacing]
  (let [x-range (- right left)
        y-range (- top bottom)
        x-steps (+ (Math/floor (/ x-range spacing)) 1)
        y-steps (+ (Math/floor (/ y-range spacing)) 1)]
    (* x-steps y-steps)))

(defn- count-gridded-sample-set [plot-size sample-resolution]
  (Math/pow (Math/floor (/ plot-size sample-resolution)) 2))

(defn- check-plot-limits [plots plot-limit samples-per-plot per-plot-limit sample-limit]
  (cond
    (= 0 plots)
    (init-throw "You cannot create a project with 0 plots.")

    (= 0 samples-per-plot)
    (init-throw "You cannot create a project with 0 samples per plot.")

    (> plots plot-limit)
    (init-throw (str "This action will create "
                     plots
                     " plots. The maximum allowed for the selected plot distribution is "
                     plot-limit
                     "."))

    (> samples-per-plot per-plot-limit)
    (init-throw (str "This action will create "
                     samples-per-plot
                     " samples per plot. The maximum allowed for the selected sample distribution is "
                     per-plot-limit
                     "."))

    (> (* plots samples-per-plot) sample-limit)
    (init-throw (str "This action will create "
                     (* plots samples-per-plot)
                     " total samples. The maximum allowed for the selected distribution types is "
                     sample-limit
                     "."))))

;; Geo JSON

(defn- make-geo-json-point [lon lat]
  (tc/clj->jsonb {:type        "Point"
                  :coordinates [lon lat]}))

(defn- make-geo-json-polygon [lon-min lat-min lon-max lat-max]
  (tc/clj->jsonb {:type        "Polygon"
                  :coordinates [[[lon-min lat-min]
                                 [lon-min lat-max]
                                 [lon-max lat-max]
                                 [lon-max lat-min]
                                 [lon-min lat-min]]]}))

;; Create random and gridded points

(defn- random-with-buffer [side size buffer]
  (+ side
     (* (Math/floor (* (Math/random) size (/ buffer))) buffer)
     (/ buffer 2.0)))

(defn- distance [x1 y1 x2 y2]
  (Math/sqrt (+ (Math/pow (- x2 x1) 2.0)
                (Math/pow (- y2 y1) 2.0))))

(defn- pad-bounds [left bottom right top buffer]
  [(+ left buffer) (+ bottom buffer) (- right buffer) (- top buffer)])

;; TODO Use postGIS so arbitrary bounds can be uploaded
(defn- create-random-points-in-bounds [left bottom right top num-points]
  (let [x-range (- right left)
        y-range (- top bottom)
        buffer  (/ x-range 50.0)]
    (->> (repeatedly (fn [] [(random-with-buffer left x-range buffer) (random-with-buffer bottom y-range buffer)]))
         (take num-points)
         (map #(pu/EPSG:3857->4326 %)))))

;; TODO Use postGIS so arbitrary bounds can be set
(defn- create-gridded-points-in-bounds [left bottom right top spacing]
  (let [x-range   (- right left)
        y-range   (- top bottom)
        x-steps   (Math/floor (/ x-range spacing))
        y-steps   (Math/floor (/ y-range spacing))
        x-padding (/ (- x-range (* x-steps spacing)) 2.0)
        y-padding (/ (- y-range (* y-steps spacing)) 2.0)]
    (->> (for [x (range (+ 1 x-steps))
               y (range (+ 1 y-steps))]
           [(+ (* x spacing) left x-padding) (+ (* y spacing) bottom y-padding)])
         (map #(pu/EPSG:3857->4326 %)))))

;; TODO Use postGIS so can be done with shp files
(defn- create-random-sample-set [plot-center plot-shape plot-size samples-per-plot]
  (let [[center-x center-y] (pu/EPSG:4326->3857 plot-center)
        radius (/ plot-size 2.0)
        left   (- center-x radius)
        right  (+ center-x radius)
        top    (+ center-y radius)
        bottom (- center-y radius)
        buffer (/ radius 50.0)]
    (if (= "circle" plot-shape)
      (->> (repeatedly (fn [] [(random-with-buffer left plot-size buffer) (random-with-buffer bottom plot-size buffer)]))
           (take (* 10 samples-per-plot)) ; just as a safety net, so no thread can get stuck
           (filter (fn [[x y]]
                     (< (distance center-x center-y x y)
                        (- radius (/ buffer 2.0)))))
           (take samples-per-plot)
           (map #(pu/EPSG:3857->4326 %)))
      (create-random-points-in-bounds left bottom right top samples-per-plot))))

(defn- create-gridded-sample-set [plot-center plot-shape plot-size sample-resolution]
  (if (>= sample-resolution plot-size)
    [plot-center]
    (let [[center-x center-y] (pu/EPSG:4326->3857 plot-center)
          radius  (/ plot-size 2.0)
          left    (- center-x radius)
          bottom  (- center-y radius)
          steps   (Math/floor (/ plot-size sample-resolution))
          padding (/ (- plot-size (* steps sample-resolution)) 2.0)]
      (->> (for [x (range (+ 1 steps))
                 y (range (+ 1 steps))]
             [(+ (* x sample-resolution) left padding) (+ (* y sample-resolution) bottom padding)])
           (filter (fn [[x y]] (or (= "square" plot-shape)
                                   (< (distance center-x center-y x y) radius))))
           (map #(pu/EPSG:3857->4326 %))))))

;; Upload files

(defn find-file-by-ext [folder-name ext]
  (->> (io/file folder-name)
       (file-seq)
       (map #(.getName %))
       (remove #(= folder-name %))
       (filter #(= ext (peek (str/split % #"\."))))
       (first)))

(defn format-simple
  "Use any char after % for format."
  [f-str & args]
  (apply format (str/replace f-str #"(%[^ ])" "%s") args))

(defn parse-as-sh-cmd
  "Split string into an array for use with clojure.java.shell/sh."
  [s]
  (loop [chars (seq s)
         acc   []]
    (if (empty? chars)
      acc
      (if (= \` (first chars))
        (recur (->> chars (rest) (drop-while #(not= \` %)) (rest))
               (->> chars (rest) (take-while #(not= \` %)) (apply str) (str/trim) (conj acc)))
        (recur (->> chars (drop-while #(not= \` %)))
               (->> chars (take-while #(not= \` %)) (apply str) (str/trim) (#(str/split % #" ")) (remove str/blank?) (into acc)))))))

(defn sh-wrapper [dir env & commands]
  (sh/with-sh-dir dir
    (sh/with-sh-env (merge {:PATH path-env} env)
      (doseq [cmd commands]
        (let [{:keys [exit err]} (apply sh/sh (parse-as-sh-cmd cmd))]
          (when-not (= 0 exit)
            (init-throw err)))))))

(defn sh-wrapper-stdout [dir env cmd]
  (sh/with-sh-dir dir
    (sh/with-sh-env (merge {:PATH path-env} env)
      (let [{:keys [exit err out]} (apply sh/sh (parse-as-sh-cmd cmd))]
        (if (= 0 exit)
          out
          (init-throw err))))))

(defn sh-wrapper-stdin [dir env cmd stdin]
  (sh/with-sh-dir dir
    (sh/with-sh-env (merge {:PATH path-env} env)
      (let [{:keys [exit err]} (apply sh/sh (conj (parse-as-sh-cmd cmd)
                                                  :in stdin))]
        (when-not (= 0 exit)
          (init-throw err))))))

(defn- type-columns [headers]
  (->> headers
       (map #(str % (cond
                      (#{"LON" "LAT"} %)         " float"
                      (#{"PLOTID" "SAMPLEID"} %) " integer"
                      :else                      " text")))
       (str/join ",")))

(defmulti get-file-data (fn [distribution _ _ _] (keyword distribution)))

(defmethod get-file-data :shp [_ type ext-file folder-name]
  (sh-wrapper folder-name {} (str "7z e -y " ext-file " -o" type))
  (let [[info body _] (-> (sh-wrapper-stdout (str folder-name type)
                                             {}
                                             (format-simple "shp2pgsql -s 4326 -t 2D -D %1"
                                                            (find-file-by-ext (str folder-name type) "shp")))
                          (str/split #"stdin;\n|\n\\\."))
        column-string (as-> info i
                        (str/replace i #"\n" "")
                        (re-find #"(?<=CREATE TABLE.*gid serial,).*?(?=\);)" i)
                        (str i ",\"geom\" geometry(geometry, 4326)"))
        columns       (as-> column-string i
                        (str/split i #",\"")
                        (map (fn [col]
                               (-> (first (str/split col #" "))
                                   (str/replace #"\"" "")
                                   (str/upper-case)))
                             i))]
    [columns column-string body]))

(defmethod get-file-data :csv [_ _ ext-file _]
  (let [[header-row body] (str/split (slurp ext-file) #"\r\n|\n|\r" 2)]
    (when (not (str/includes? header-row ","))
      (init-throw "The CSV file must use commas for the delimiter. This error may indicate that the csv file contains only one column."))
    (let [headers (as-> header-row hr
                    (str/split hr #",")
                    (mapv #(-> %
                               (str/upper-case)
                               (str/replace "\uFEFF" "")
                               (str/replace #"-| " "_")
                               (str/replace #"^(X|LONGITUDE|LONG|CENTER_X)$" "LON")
                               (str/replace #"^(Y|LATITUDE|CENTER_Y)$" "LAT"))
                          hr))]
      [headers (type-columns headers) (str/replace body #"," "\t")])))

(defmethod get-file-data :default [distribution _ _ _]
  (throw (str "No such distribution (" distribution ") defined for ceo.db.projects/get-file-data")))

(defn- check-headers [headers must-include]
  (let [header-set      (set headers)
        header-diff     (set/difference must-include header-set)
        invalid-headers (seq (remove #(re-matches #"^[a-zA-Z_][a-zA-Z0-9_]*$" %) headers))]
    (when (seq header-diff)
      (init-throw (str "The required header field(s) " (str/join ", " header-diff) " are missing.")))
    (when invalid-headers
      (init-throw (str "One or more columns contains invalid characters: " (str/join ", " invalid-headers))))))

(defn- load-external-data [distribution project-id ext-file type must-include]
  (when (#{"csv" "shp"} distribution)
    (let [folder-name (str tmp-dir "/ceo-tmp-" project-id "/")]
      (try-catch-throw #(let [table-name                   (str "project_" project-id "_" type "_" distribution)
                              [headers column-string body] (get-file-data distribution type ext-file folder-name)]
                          (when (nil? body)
                            (init-throw (str "The " type " file contains no rows of data.")))
                          (check-headers headers must-include)
                          (call-sql "create_new_table"
                                    table-name
                                    (str "gid serial primary key," column-string))
                          (sh-wrapper-stdin folder-name
                                            {:PASSWORD "ceo"}
                                            (format-simple "psql -h localhost -U ceo -d ceo -c `\\copy ext_tables.%1(%2) FROM stdin`"
                                                           table-name (str/join "," headers))
                                            body)
                          (if (= "plots" type)
                            (call-sql "select_partial_table_by_name" table-name)
                            (call-sql "select_partial_sample_table_by_name" table-name))
                          table-name)
                       (str (str/capitalize type) " " distribution " file failed to load.")))))

(defn- create-project-samples [plot-id
                               sample-distribution
                               plot-center
                               plot-shape
                               plot-size
                               samples-per-plot
                               sample-resolution]
  ;; TODO Right now you have to have a sample shape or csv file if you have a plot shape file.
  ;;      Update create random / gridded to work on boundary so any plot type can have random and gridded.
  (doseq [[x y] (case sample-distribution
                  "center"
                  [plot-center]

                  "random"
                  (create-random-sample-set plot-center plot-shape plot-size samples-per-plot)

                  "gridded"
                  (create-gridded-sample-set plot-center plot-shape plot-size sample-resolution)

                  [])]
    (call-sql "create_project_plot_sample"
              {:log? false}
              plot-id
              (make-geo-json-point x y))))

(defn- create-project-plots [project-id
                             lon-min
                             lat-min
                             lon-max
                             lat-max
                             plot-distribution
                             num-plots
                             plot-spacing
                             plot-shape
                             plot-size
                             sample-distribution
                             samples-per-plot
                             sample-resolution
                             plot-file-name
                             plot-file-base64
                             sample-file-name
                             sample-file-base64
                             allow-drawn-samples?]
  (let [write-dir    (str tmp-dir "/ceo-tmp-" project-id "/")
        plots-file   (and (#{"csv" "shp"} plot-distribution)
                          (str write-dir
                               (pu/write-file-part-base64 plot-file-name
                                                          plot-file-base64
                                                          write-dir
                                                          (str "project-" project-id "-plots"))))
        samples-file (and (#{"csv" "shp"} sample-distribution)
                          (str write-dir
                               (pu/write-file-part-base64 sample-file-name
                                                          sample-file-base64
                                                          write-dir
                                                          (str "project-" project-id "-samples"))))]
    (if (#{"csv" "shp"} plot-distribution)
      (do
        (let [plot-table       (load-external-data plot-distribution project-id plots-file "plots" #{"PLOTID"})
              sample-table     (load-external-data sample-distribution project-id samples-file "samples" #{"PLOTID" "SAMPLEID"})
              counts           (try-catch-throw #(first (call-sql "ext_table_count" project-id plot-table sample-table))
                                                "SQL Error: cannot count data.")
              ext-plot-count   (:plot_count counts)
              ext-sample-count (:sample_count counts)]
          (check-plot-limits ext-plot-count
                             50000.0
                             (case sample-distribution
                               "gridded" (count-gridded-sample-set plot-size sample-resolution)
                               "random"  samples-per-plot
                               "center"  1.0
                               "none"    1.0
                               (/ ext-sample-count ext-plot-count))
                             200.0
                             350000.0)
          (try-catch-throw  #(call-sql "update_project_tables" project-id plot-table sample-table)
                            "SQL Error: cannot update project table."))
        (if (#{"csv" "shp"} sample-distribution)
          (try-catch-throw #(call-sql "samples_from_plots_with_files" project-id)
                           "Error importing samples file after importing plots file.")
          (try-catch-throw #(doseq [plot (call-sql "add_file_plots" project-id)]
                              (create-project-samples (:plot_uid plot)
                                                      sample-distribution
                                                      [(:lon plot) (:lat plot)]
                                                      plot-shape
                                                      plot-size
                                                      samples-per-plot
                                                      sample-resolution))
                           "Error adding plot file with generated samples."))
        (try-catch-throw #(call-sql "cleanup_project_tables" project-id plot-size)
                         "SQL Error: cannot clean external tables.")
        ;; The SQL function only checks against plots with external tables.
        (when (not allow-drawn-samples?)
          (let [bad-plots (map :plot_id (call-sql "plots_missing_samples" project-id))]
            (when (seq bad-plots)
              (init-throw (str "The uploaded plot and sample files do not have correctly overlapping data. "
                               (count bad-plots)
                               " plots have no samples. The first 10 are: ["
                               (str/join ", " (take 10 bad-plots))
                               "]"))))))
      (let [[[left bottom] [top right]] (pu/EPSG:4326->3857 [lon-min lat-min] [lon-max lat-max])
            [left bottom right top] (pad-bounds left bottom top right (/ 2.0 plot-size))]
        (check-plot-limits (if (= "gridded" plot-distribution)
                             (count-gridded-points left bottom right top plot-spacing)
                             num-plots)
                           5000.0
                           (case sample-distribution
                             "gridded" (count-gridded-sample-set plot-size sample-resolution)
                             "random"  samples-per-plot
                             "center"  1.0
                             "none"    1.0)
                           200.0
                           50000.0)
        ;; TODO use bulk insert, or use postGIS to generate points.
        (doseq [plot-center (if (= "gridded" plot-distribution)
                              (create-gridded-points-in-bounds left bottom right top plot-spacing)
                              (create-random-points-in-bounds left bottom right top num-plots))]
          (let [plot-id (sql-primitive (call-sql "create_project_plot"
                                                 {:log? false}
                                                 project-id
                                                 (make-geo-json-point (first plot-center) (second plot-center))))]
            (create-project-samples plot-id
                                    sample-distribution
                                    plot-center
                                    plot-shape
                                    plot-size
                                    samples-per-plot
                                    sample-resolution)))))
    (call-sql "update_project_counts" project-id)
    (when-not (sql-primitive (call-sql "valid_project_boundary" project-id))
      (init-throw (str "The project boundary is invalid. "
                       "This can come from improper coordinates or projection when uploading shape or csv data.")))))

(defn create-project [{:keys [params]}]
  (let [institution-id       (tc/val->int (:institutionId params))
        imagery-id           (or (:imageryId params) (get-first-public-imagery))
        name                 (:name params)
        description          (:description params)
        privacy-level        (:privacyLevel params)
        lon-min              (tc/val->double (:lonMin params))
        lat-min              (tc/val->double (:latMin params))
        lon-max              (tc/val->double (:lonMax params))
        lat-max              (tc/val->double (:latMax params))
        boundary             (make-geo-json-polygon lon-min
                                                    lat-min
                                                    lon-max
                                                    lat-max)
        plot-distribution    (:plotDistribution params)
        num-plots            (tc/val->int (:numPlots params))
        plot-spacing         (tc/val->float (:plotSpacing params))
        plot-shape           (:plotShape params)
        plot-size            (tc/val->float (:plotSize params))
        sample-distribution  (:sampleDistribution params)
        samples-per-plot     (tc/val->int (:samplesPerPlot params))
        sample-resolution    (tc/val->float (:sampleResolution params))
        allow-drawn-samples? (or (= sample-distribution "none")
                                 (tc/val->bool (:allowDrawnSamples params)))
        survey-questions     (tc/clj->jsonb (:surveyQuestions params))
        survey-rules         (tc/clj->jsonb (:surveyRules params))
        project-options      (tc/clj->jsonb (:projectOptions params default-options))
        project-template     (tc/val->int (:projectTemplate params))
        use-template-plots   (tc/val->bool (:useTemplatePlots params))
        use-template-widgets (tc/val->bool (:useTemplateWidgets params))
        plot-file-name       (:plotFileName params)
        plot-file-base64     (:plotFileBase64 params)
        sample-file-name     (:sampleFileName params)
        sample-file-base64   (:sampleFileBase64 params)
        token-key            (str (UUID/randomUUID))
        project-id           (sql-primitive (call-sql "create_project"
                                                      institution-id
                                                      name
                                                      description
                                                      privacy-level
                                                      imagery-id
                                                      boundary
                                                      plot-distribution
                                                      num-plots
                                                      plot-spacing
                                                      plot-shape
                                                      plot-size
                                                      sample-distribution
                                                      samples-per-plot
                                                      sample-resolution
                                                      allow-drawn-samples?
                                                      survey-questions
                                                      survey-rules
                                                      token-key
                                                      project-options))]
    (try
      (if-let [imagery-list (:projectImageryList params)]
        (insert-project-imagery project-id imagery-list)
        (call-sql "add_all_institution_imagery" project-id))
      ;; TODO this can be a simple SQL query once we drop the dashboard ID
      (when (and (pos? project-template) use-template-widgets)
        (let [new-uuid (tc/str->pg-uuid (str (UUID/randomUUID)))]
          (doseq [{:keys [widget]} (call-sql "get_project_widgets_by_project_id" project-template)]
            (call-sql "add_project_widget"
                      project-id
                      new-uuid
                      widget))))
      (if (and (pos? project-template) use-template-plots)
        (call-sql "copy_template_plots" project-template project-id)
        (create-project-plots project-id
                              lon-min
                              lat-min
                              lon-max
                              lat-max
                              plot-distribution
                              num-plots
                              plot-spacing
                              plot-shape
                              plot-size
                              sample-distribution
                              samples-per-plot
                              sample-resolution
                              plot-file-name
                              plot-file-base64
                              sample-file-name
                              sample-file-base64
                              allow-drawn-samples?))
      (data-response {:projectId project-id
                      :tokenKey  token-key})
      (catch Exception e
        (try
          (call-sql "delete_project" project-id)
          (catch Exception _))
        (data-response (if-let [causes (:causes (ex-data e))]
                         (str "-" (str/join "\n-" causes))
                         "Unknown server error."))))))

;;; Update Project

(defn reset-collected-samples [project-id]
  (let [project (first (call-sql "select_project_by_id" project-id))
        sample-distribution  (:sample_distribution project)
        allow-drawn-samples? (:allow_drawn_samples project)]
    (cond
      (not allow-drawn-samples?)
      (call-sql "delete_user_plots_by_project" project-id)

      (#{"csv" "shp"} sample-distribution)
      (do
        ;; TODO this can be done more efficiently.  Update when we update how external data is stored.
        (call-sql "delete_all_samples_by_project" project-id)
        (call-sql "delete_user_plots_by_project"  project-id)
        (call-sql "samples_from_ext_tables" project-id))

      :else
      (let [plot-shape        (:plot_shape project)
            plot-size         (tc/val->float (:plot_size project))
            samples-per-plot  (tc/val->int (:samples_per_plot project))
            sample-resolution (tc/val->float (:sample_resolution project))]
        (doseq [{:keys [plot_id lon lat]} (call-sql "get_deleted_user_plots_by_project" project-id)]
          (create-project-samples plot_id
                                  sample-distribution
                                  [lon lat]
                                  plot-shape
                                  plot-size
                                  samples-per-plot
                                  sample-resolution))))))

(defn recreate-samples [project-id
                        sample-distribution
                        plot-shape
                        plot-size
                        samples-per-plot
                        sample-resolution
                        sample-file-name
                        sample-file-base64]
  (try
    (if (#{"csv" "shp"} sample-distribution)
      (let [write-dir     (str tmp-dir "/ceo-tmp-" project-id "/")
            samples-file  (str write-dir
                               (pu/write-file-part-base64 sample-file-name
                                                          sample-file-base64
                                                          write-dir
                                                          (str "project-" project-id "-samples")))
            samples-table (load-external-data sample-distribution
                                              project-id
                                              samples-file
                                              "samples"
                                              #{"PLOTID" "SAMPLEID"})]
        (try-catch-throw #(call-sql "samples_from_plots_with_files" project-id)
                         "Error importing samples file.")
        (try-catch-throw #(call-sql "update_project_sample_table" project-id samples-table)
                         "SQL Error: cannot update project table."))
      (doseq [{:keys [plot_id lon lat]} (call-sql "get_plot_centers_by_project" project-id)]
        (create-project-samples plot_id
                                sample-distribution
                                [lon lat]
                                plot-shape
                                plot-size
                                samples-per-plot
                                sample-resolution)))
    (catch Exception e
      (data-response (if-let [causes (:causes (ex-data e))]
                       (str/join "\n" causes)
                       "Unknown server error.")))))

(defn- exterior-ring [coords]
  (map (fn [[a b]] [(tc/val->double a) (tc/val->double b)])
       (first coords)))

(defn- same-ring? [[start1 :as ring1] ring2]
  (and (some #(= start1 %) ring2)
       (or (= ring1 ring2)
           (= ring1 (reverse ring2))
           (= ring1 (take (count ring1) (drop-while #(not= start1 %) (cycle (rest ring2)))))
           (= ring1 (take (count ring1) (drop-while #(not= start1 %) (cycle (reverse (rest ring2)))))))))

;; NOTE: This only works for polygons (and only compares their
;;       exterior rings). If you need to compare linestrings or points, you
;;       will need a different function.
(defn- same-polygon-boundary? [geom1 geom2]
  (and (= "polygon" (str/lower-case (:type geom1)) (str/lower-case (:type geom2)))
       (same-ring? (exterior-ring (:coordinates geom1))
                   (exterior-ring (:coordinates geom2)))))

(defn update-project [{:keys [params]}]
  (let [project-id           (tc/val->int (:projectId params))
        imagery-id           (or (:imageryId params) (get-first-public-imagery))
        name                 (:name params)
        description          (:description params)
        privacy-level        (:privacyLevel params)
        lon-min              (tc/val->double (:lonMin params))
        lat-min              (tc/val->double (:latMin params))
        lon-max              (tc/val->double (:lonMax params))
        lat-max              (tc/val->double (:latMax params))
        boundary             (make-geo-json-polygon lon-min
                                                    lat-min
                                                    lon-max
                                                    lat-max)
        plot-distribution    (:plotDistribution params)
        num-plots            (tc/val->int (:numPlots params))
        plot-spacing         (tc/val->float (:plotSpacing params))
        plot-shape           (:plotShape params)
        plot-size            (tc/val->float (:plotSize params))
        sample-distribution  (:sampleDistribution params)
        samples-per-plot     (tc/val->int (:samplesPerPlot params))
        sample-resolution    (tc/val->float (:sampleResolution params))
        allow-drawn-samples? (or (= sample-distribution "none")
                                 (tc/val->bool (:allowDrawnSamples params)))
        survey-questions     (tc/clj->jsonb (:surveyQuestions params))
        survey-rules         (tc/clj->jsonb (:surveyRules params))
        update-survey        (tc/val->bool (:updateSurvey params))
        project-options      (tc/clj->jsonb (:projectOptions params default-options))
        plot-file-name       (:plotFileName params)
        plot-file-base64     (:plotFileBase64 params)
        sample-file-name     (:sampleFileName params)
        sample-file-base64   (:sampleFileBase64 params)
        original-project     (first (call-sql "select_project_by_id" project-id))]
    (if original-project
      (do
        (call-sql "update_project"
                  project-id
                  name
                  description
                  privacy-level
                  imagery-id
                  boundary
                  plot-distribution
                  num-plots
                  plot-spacing
                  plot-shape
                  plot-size
                  sample-distribution
                  samples-per-plot
                  sample-resolution
                  allow-drawn-samples?
                  survey-questions
                  survey-rules
                  project-options)
        (when-let [imagery-list (:projectImageryList params)]
          (call-sql "delete_project_imagery" project-id)
          (insert-project-imagery project-id imagery-list))
        (cond
          (not= "unpublished" (:availability original-project))
          nil

          (or (not= plot-distribution (:plot_distribution original-project))
              (if (#{"csv" "shp"} plot-distribution)
                plot-file-base64
                (or (not (same-polygon-boundary? (tc/jsonb->clj boundary) (tc/jsonb->clj (:boundary original-project))))
                    (not= num-plots (:num_plots original-project))
                    (not= plot-shape (:plot_shape original-project))
                    (not= plot-size (:plot_size original-project))
                    (not= plot-spacing (:plot_spacing original-project)))))
          (do
            (call-sql "delete_plots_by_project" project-id)
            (when (#{"csv" "shp"} (:plot_distribution original-project))
              (call-sql "delete_project_tables" project-id))
            (create-project-plots project-id
                                  lon-min
                                  lat-min
                                  lon-max
                                  lat-max
                                  plot-distribution
                                  num-plots
                                  plot-spacing
                                  plot-shape
                                  plot-size
                                  sample-distribution
                                  samples-per-plot
                                  sample-resolution
                                  plot-file-name
                                  plot-file-base64
                                  sample-file-name
                                  sample-file-base64
                                  allow-drawn-samples?))

          (or (not= sample-distribution (:sample_distribution original-project))
              (if (#{"csv" "shp"} sample-distribution)
                sample-file-base64
                (or (not= samples-per-plot (:samples_per_plot original-project))
                    (not= sample-resolution (:sample_resolution original-project)))))
          (do
            (call-sql "delete_all_samples_by_project" project-id)
            (when (#{"csv" "shp"} (:sample_distribution original-project))
              (call-sql "delete_project_sample_table" project-id))
            (recreate-samples project-id
                              sample-distribution
                              plot-shape
                              plot-size
                              samples-per-plot
                              sample-resolution
                              sample-file-name
                              sample-file-base64))

          ;; NOTE: Old stored questions can have a different format than when passed from the UI.
          ;;       This is why we check whether the survey questions are different on the front (for now).
          (or update-survey
              (and (:allow_drawn_samples original-project) (not allow-drawn-samples?)))
          (reset-collected-samples project-id))
        (data-response ""))
      (data-response (str "Project " project-id " not found.")))))

(defn publish-project [{:keys [params]}]
  (let [user-id      (:userId params -1)
        project-id   (tc/val->int (:projectId params))
        clear-saved? (tc/val->bool (:clearSaved params))]
    (when clear-saved? (reset-collected-samples project-id))
    (call-sql "publish_project" project-id)
    (data-response (build-project-by-id user-id project-id))))

(defn close-project [{:keys [params]}]
  (let [user-id    (:userId params -1)
        project-id (tc/val->int (:projectId params))]
    (call-sql "close_project" project-id)
    (data-response (build-project-by-id user-id project-id))))

(defn archive-project [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))]
    (call-sql "archive_project" project-id)
    (data-response "")))

;;; Dump Data common

(defn- csv-quotes [string]
  (if (and (string? string) (str/includes? string ","))
    (str "\"" string "\"")
    string))

(defn- prefix-keys [prefix in-map]
  (pu/mapm (fn [[key val]]
             [(str prefix (name key)) val])
           in-map))

(defn map->csv [row-map key-set default]
  (reduce (fn [acc cur]
            (conj acc (csv-quotes (get row-map cur default))))
          []
          key-set))

(defn- prepare-file-name [project-name data-type]
  (str/join "-"
            ["ceo"
             (str/replace project-name #"[ |,]" "-")
             data-type
             "data"
             (.format (SimpleDateFormat. "YYYY-MM-dd") (Date.))]))

;;; Dump Aggregate Data

(defn- get-value-distribution-headers
  "Returns a list of every question answer combo like
   (question1:answer1 question1:answer2 question2:answer1)"
  [survey-questions]
  (->> survey-questions
       (mapcat (fn [group]
                 (let [question-label (name (get group :question))]
                   (map (fn [answer]
                          (str question-label ":" (name (get answer :answer))))
                        (get group :answers)))))))

(defn- count-answer [sample-size question-answers]
  (pu/mapm (fn [[question answers]]
             [question (* 100.0 (count answers) (/ sample-size))])
           (group-by str question-answers)))

(defn- get-value-distribution
  "Count the answers given, and return a map of {'question:answers' count}"
  [samples]
  (count-answer (count samples)
                (mapcat (fn [sample]
                          (map (fn [[question-label answer]]
                                 (str (name question-label) ":" (:answer answer)))
                               (:saved_answers sample)))
                        samples)))

(defn- get-ext-plot-headers
  "Gets external plot headers"
  [project-id]
  (->> (call-sql "get_plot_headers" project-id)
       (map :column_names)
       (remove #(#{"GID" "GEOM" "PLOT_GEOM" "LAT" "LON"} (str/upper-case %)))
       (mapv #(str "pl_" %))))

(defn- format-time [pg-time]
  (when pg-time
    (.format (SimpleDateFormat. "YYYY-MM-dd HH:mm")
             pg-time)))

(def plot-base-headers [:plot_id
                        :center_lon
                        :center_lat
                        :size_m
                        :shape
                        :sample_points
                        :email
                        :flagged
                        :flagged_reason
                        :confidence
                        :collection_time
                        :analysis_duration
                        :common_securewatch_date
                        :total_securewatch_dates])

(defn- remove-vector-items [vector & items]
  (->> vector
       (remove (set items))
       (vec)))

(defn dump-project-aggregate-data [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))]
    (if-let [project-info (first (call-sql "select_project_by_id" project-id))]
      (let [survey-questions (tc/jsonb->clj (:survey_questions project-info))
            confidence?      (-> project-info
                                 (:options)
                                 (tc/jsonb->clj)
                                 (:collectConfidence))
            text-headers     (concat (remove-vector-items plot-base-headers
                                                          (when-not confidence? :confidence))
                                     (get-ext-plot-headers project-id))
            number-headers   (get-value-distribution-headers survey-questions)
            headers-out      (->> (concat text-headers number-headers)
                                  (map #(-> % name csv-quotes))
                                  (str/join ",")
                                  (str "\uFEFF")) ; Prefix headers with a UTF-8 tag
            data-rows        (map (fn [row]
                                    (let [samples       (tc/jsonb->clj (:samples row))
                                          ext-plot-data (tc/jsonb->clj (:ext_plot_data row))]
                                      (str/join ","
                                                (concat (map->csv (merge (-> row
                                                                             (assoc  :sample_points
                                                                                     (count samples))
                                                                             (update :collection_time format-time)
                                                                             (update :analysis_duration #(when % (str % " secs"))))
                                                                         (prefix-keys "pl_" ext-plot-data))
                                                                  text-headers
                                                                  "")
                                                        (map->csv (get-value-distribution samples)
                                                                  number-headers
                                                                  0)))))
                                  (call-sql "dump_project_plot_data" project-id))]
        {:headers {"Content-Type" "text/csv"
                   "Content-Disposition" (str "attachment; filename="
                                              (prepare-file-name (:name project-info) "plot")
                                              ".csv")}
         :body (str/join "\n" (cons headers-out data-rows))})
      (data-response "Project not found."))))

(defn- get-ext-sample-headers
  "Gets external sample headers"
  [project-id]
  (->> (call-sql "get_sample_headers" project-id)
       (map :column_names)
       (remove #(#{"GID" "GEOM" "LAT" "LON" "SAMPLE_GEOM"} (str/upper-case %)))
       (map #(str "smpl_" %))))

(defn- extract-answers [value]
  (if value
    (reduce (fn [acc [k v]] (merge acc {(name k) (:answer v)})) {} value)
    ""))

(def sample-base-headers [:plot_id
                          :sample_id
                          :lon
                          :lat
                          :email
                          :flagged
                          :collection_time
                          :analysis_duration
                          :imagery_title
                          :imagery_attributions
                          :sample_geom])

(defn dump-project-raw-data [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))]
    (if-let [project-info (first (call-sql "select_project_by_id" project-id))]
      (let [survey-questions (tc/jsonb->clj (:survey_questions project-info))
            text-headers     (concat sample-base-headers
                                     (get-ext-plot-headers project-id)
                                     (get-ext-sample-headers project-id)
                                     (map :question survey-questions))
            headers-out      (->> text-headers
                                  (map #(-> % name csv-quotes))
                                  (str/join ",")
                                  (str "\uFEFF")) ; Prefix headers with a UTF-8 tag
            data-rows        (map (fn [row]
                                    (let [saved-answers   (tc/jsonb->clj (:saved_answers row))
                                          ext-plot-data   (tc/jsonb->clj (:ext_plot_data row))
                                          ext-sample-data (tc/jsonb->clj (:ext_sample_data row))]
                                      (str/join ","
                                                (map->csv (merge (-> row
                                                                     (update :collection_time format-time)
                                                                     (update :analysis_duration #(when % (str % " secs"))))
                                                                 (prefix-keys "pl_" ext-plot-data)
                                                                 (prefix-keys "smpl_" ext-sample-data)
                                                                 (extract-answers saved-answers))
                                                          text-headers
                                                          ""))))
                                  (call-sql "dump_project_sample_data" project-id))]
        {:headers {"Content-Type" "text/csv"
                   "Content-Disposition" (str "attachment; filename="
                                              (prepare-file-name (:name project-info) "sample")
                                              ".csv")}
         :body (str/join "\n" (cons headers-out data-rows))})
      (data-response "Project not found."))))

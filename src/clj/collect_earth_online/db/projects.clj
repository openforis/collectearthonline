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
            [collect-earth-online.database :refer [call-sql
                                                   sql-primitive
                                                   p-insert-rows!
                                                   insert-rows!]]
            [collect-earth-online.logging  :refer [log]]
            [collect-earth-online.views    :refer [data-response]]))

;;;
;;; Constants
;;;

(def tmp-dir  (System/getProperty "java.io.tmpdir"))
(def path-env (System/getenv "PATH"))

;;;
;;; Auth functions
;;;

(defn- check-auth-common [user-id project-id token-key sql-query]
  (or (and token-key
           (= token-key (:token_key (first (call-sql "select_project_by_id" {:log? false} project-id)))))
      (sql-primitive (call-sql sql-query {:log? false} user-id project-id))))

(defn can-collect? [user-id project-id token-key]
  (check-auth-common user-id project-id token-key "can_user_collect_project"))

(defn is-proj-admin? [user-id project-id token-key]
  (check-auth-common user-id project-id token-key "can_user_edit_project"))

;;;
;;; Get data functions
;;;

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
     :hasGeoDash         (:has_geo_dash project)
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

;;;
;;; Create project helper functions
;;;

(defn- get-first-public-imagery []
  (sql-primitive (call-sql "select_first_public_imagery")))

;; TODO use bulk insert statement
(defn- insert-project-imagery! [project-id imagery-list]
  (doseq [imagery imagery-list]
    (call-sql "insert_project_imagery" project-id imagery)))

;; Errors

(defn- init-throw [message]
  (throw (ex-info message {:causes [message]})))

(defn- try-catch-throw [try-fn message]
  (try (try-fn)
       (catch Exception e
         (log (str (ex-message e)))
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

(defn- check-plot-limits [plots plot-limit]
  (cond
    (= 0 plots)
    (init-throw "You cannot create a project with 0 plots.")

    (> plots plot-limit)
    (init-throw (str "This action will create "
                     plots
                     " plots. The maximum allowed for the selected plot distribution is "
                     plot-limit
                     "."))))

(defn- check-sample-limits [samples sample-limit samples-per-plot per-plot-limit]
  (cond
    (= 0 samples-per-plot)
    (init-throw "You cannot create a project with 0 samples per plot.")

    (> samples-per-plot per-plot-limit)
    (init-throw (str "This action will create "
                     samples-per-plot
                     " samples per plot. The maximum allowed for the selected sample distribution is "
                     per-plot-limit
                     "."))

    (> samples sample-limit)
    (init-throw (str "This action will create "
                     samples
                     " total samples. The maximum allowed for the selected distribution types is "
                     sample-limit
                     "."))))

;;;
;;; Spacial plots generator
;;;

;; Geo JSON

(defn- make-wkt-point [lon lat]
  (format "POINT(%s %s)" lon lat))

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

(defn- generate-point-samples [plots
                               plot-count
                               plot-shape
                               plot-size
                               sample-distribution
                               samples-per-plot
                               sample-resolution]
  (let [samples-per-plot (case sample-distribution
                           "gridded" (count-gridded-sample-set plot-size sample-resolution)
                           "random"  samples-per-plot
                           "center"  1.0
                           "none"    1.0)]
    (check-sample-limits (* plot-count samples-per-plot)
                         50000.0
                         samples-per-plot
                         200.0)
    (mapcat (fn [{:keys [plot_id visible_id lon lat]}]
              (let [plot-center    [lon lat]
                    visible-offset (-> (dec visible_id)
                                       (* samples-per-plot)
                                       (inc))]
                (map-indexed (fn [idx [lon lat]]
                               {:plot_rid    plot_id
                                :visible_id  (+ idx visible-offset)
                                :sample_geom (tc/str->pg (make-wkt-point lon lat) "geometry")})
                             (case sample-distribution
                               "center"
                               [plot-center]

                               "random"
                               (create-random-sample-set plot-center plot-shape plot-size samples-per-plot)

                               "gridded"
                               (create-gridded-sample-set plot-center plot-shape plot-size sample-resolution)

                               []))))
            plots)))

(defn- generate-point-plots [project-id
                             lon-min
                             lat-min
                             lon-max
                             lat-max
                             plot-distribution
                             num-plots
                             plot-spacing
                             plot-size]
  (let [[[left bottom] [top right]] (pu/EPSG:4326->3857 [lon-min lat-min] [lon-max lat-max])
        [left bottom right top]     (pad-bounds left bottom top right (/ 2.0 plot-size))]
    (check-plot-limits (if (= "gridded" plot-distribution)
                         (count-gridded-points left bottom right top plot-spacing)
                         num-plots)
                       5000.0)
    (map-indexed (fn [idx [lon lat]]
                   {:project_rid project-id
                    :visible_id  (inc idx)
                    :plot_geom   (tc/str->pg (make-wkt-point lon lat) "geometry")})
                 (if (= "gridded" plot-distribution)
                   (create-gridded-points-in-bounds left bottom right top plot-spacing)
                   (create-random-points-in-bounds left bottom right top num-plots)))))

;;;
;;; External files generator
;;;

(defn- find-file-by-ext [folder-name ext]
  (->> (io/file folder-name)
       (file-seq)
       (map #(.getName %))
       (remove #(= folder-name %))
       (filter #(= ext (peek (str/split % #"\."))))
       (first)))

(defn- format-simple
  "Use any char after % for format."
  [f-str & args]
  (apply format (str/replace f-str #"(%[^ ])" "%s") args))

(defn- parse-as-sh-cmd
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

(defn- sh-wrapper [dir env & commands]
  (sh/with-sh-dir dir
    (sh/with-sh-env (merge {:PATH path-env} env)
      (doseq [cmd commands]
        (let [{:keys [exit err]} (apply sh/sh (parse-as-sh-cmd cmd))]
          (when-not (= 0 exit)
            (init-throw err)))))))

(defn- sh-wrapper-stdout [dir env cmd]
  (sh/with-sh-dir dir
    (sh/with-sh-env (merge {:PATH path-env} env)
      (let [{:keys [exit err out]} (apply sh/sh (parse-as-sh-cmd cmd))]
        (if (= 0 exit)
          out
          (init-throw err))))))

(defmulti get-file-data (fn [distribution _ _ _] (keyword distribution)))

(defmethod get-file-data :shp [_ design-type ext-file folder-name]
  (sh-wrapper folder-name {} (str "7z e -y " ext-file " -o" design-type))
  (let [[info body-text _] (-> (sh-wrapper-stdout (str folder-name design-type)
                                                  {}
                                                  (format-simple "shp2pgsql -s 4326 -t 2D -D %1"
                                                                 (find-file-by-ext (str folder-name design-type) "shp")))
                               (str/split #"stdin;\n|\n\\\."))
        geom-key    (keyword (str design-type "_geom"))
        header-keys (as-> info i
                      (str/replace i #"\n" "")
                      (re-find #"(?<=CREATE TABLE.*gid serial,).*?(?=\);)" i)
                      (str/replace i #"\"" "")
                      (str/lower-case i)
                      (str/split i #",")
                      (mapv (fn [col] (first (str/split col #" "))) i)
                      (conj i geom-key)
                      (map (fn [h]
                             (keyword (if (= (str design-type "id") h)
                                        "visible_id"
                                        h)))
                           i))
        body        (map (fn [row]
                           (as-> row r
                             (str/split r #"\t")
                             (zipmap header-keys r)
                             (update r geom-key tc/str->pg "geometry")
                             (update r :visible_id tc/val->int)))
                         (str/split body-text #"\r\n|\n|\r"))]
    [header-keys body]))

(defmethod get-file-data :csv [_ design-type ext-file folder-name]
  (let [rows       (str/split (slurp (str folder-name ext-file)) #"\r\n|\n|\r")
        header-row (first rows)]
    (when (not (str/includes? header-row ","))
      (init-throw "The CSV file must use commas for the delimiter. This error may indicate that the csv file contains only one column."))
    (let [geom-key    (keyword (str design-type "_geom"))
          header-keys (as-> header-row hr
                        (str/split hr #",")
                        (mapv #(-> %
                                   (str/lower-case)
                                   (str/replace #"-| " "_")
                                   (str/replace #"^(x|longitude|long|center_x)$" "lon")
                                   (str/replace #"^(y|latitude|center_y)$" "lat")
                                   (str/replace (re-pattern (str "^" design-type "id$")) "visible_id")
                                   (keyword))
                              hr))
          body        (map (fn [row]
                             (as-> row r
                               (str/split r #",")
                               (zipmap header-keys r)
                               (assoc r geom-key (tc/str->pg (make-wkt-point (:lon r) (:lat r)) "geometry"))
                               (update r :visible_id tc/val->int)
                               (dissoc r :lon :lat)))
                           (rest rows))]
      [header-keys body])))

(defmethod get-file-data :default [distribution _ _ _]
  (throw (str "No such distribution (" distribution ") defined for ceo.db.projects/get-file-data")))

(defn- check-headers [headers primary-key design-type]
  (let [header-diff     (set/difference (set primary-key) (set headers))
        invalid-headers (seq (remove #(re-matches #"^[a-zA-Z_][a-zA-Z0-9_]*$" (name %)) headers))]
    (when (seq header-diff)
      (init-throw (str "The required header field(s) "
                       (as-> header-diff h
                         (map name h)
                         (str/join "', '" h)
                         (str/replace h #"visible_" design-type)
                         (str "'" h "'"))
                       " are missing.")))
    (when invalid-headers
      (init-throw (str "One or more headers contains invalid characters: " (str/join ", " invalid-headers))))))

(defn- load-external-data! [project-id distribution file-name file-base64 design-type primary-key]
  (when (#{"csv" "shp"} distribution)
    (let [folder-name (str tmp-dir "/ceo-tmp-" project-id "/")
          saved-file  (pu/write-file-part-base64 file-name
                                                 file-base64
                                                 folder-name
                                                 (str "project-" project-id "-" design-type))]
      (try-catch-throw #(let [[headers body] (get-file-data distribution design-type saved-file folder-name)]
                          (when-not (seq? body)
                            (init-throw (str "The " design-type " file contains no rows of data.")))

                          (check-headers headers primary-key design-type)

                          (let [duplicates (->> body
                                                (group-by (apply juxt primary-key))
                                                (filter (fn [[_ v]] (> (count v) 1))))]
                            (when (seq duplicates)
                              (init-throw (str "The " design-type " file contains duplicate primary keys. "
                                               (count duplicates)
                                               " duplicates exists. The first 10 are:\n"
                                               (->> duplicates
                                                    (map (fn [[k _]]
                                                           (str "["
                                                                (str/join ", "
                                                                          (->> k
                                                                               (zipmap primary-key)
                                                                               (map (fn [[k2 v2]]
                                                                                      (str k2 ": " v2)))))
                                                                "]")))
                                                    (take 10)
                                                    (str/join "\n"))))))
                          body)
                       (str (str/capitalize design-type) " " distribution " file failed to load.")))))

(defn- split-ext [row ext-key main-keys]
  (assoc (select-keys row main-keys)
         ext-key
         (tc/clj->jsonb (apply dissoc row main-keys))))

(defn- generate-file-samples [plots
                              plot-count
                              project-id
                              sample-distribution
                              sample-file-name
                              sample-file-base64]
  (let [ext-samples  (load-external-data! project-id
                                          sample-distribution
                                          sample-file-name
                                          sample-file-base64
                                          "sample"
                                          [:plotid :visible_id])
        sample-count (count ext-samples)
        plot-keys    (persistent!
                      (reduce (fn [acc {:keys [plot_id visible_id]}]
                                (assoc! acc (str visible_id) plot_id))
                              (transient {})
                              plots))]
    (check-sample-limits sample-count
                         350000.0
                         (/ sample-count plot-count)
                         200.0)
    ;; TODO check for samples with no plots - OR - ensure that PG errors pass through.
    (map (fn [s]
           (-> s
               (assoc :plot_rid (get plot-keys (:plotid s)))
               (dissoc :plotid)
               (split-ext :extra_sample_info [:plot_rid :visible_id :sample_geom]))) ext-samples)))

(defn- generate-file-plots [project-id
                            plot-distribution
                            plot-file-name
                            plot-file-base64]
  (let [ext-plots (load-external-data! project-id
                                       plot-distribution
                                       plot-file-name
                                       plot-file-base64
                                       "plot"
                                       [:visible_id])]
    (check-plot-limits (count ext-plots)
                       50000.0)
    (map (fn [p]
           (-> p
               (assoc :project_rid project-id)
               (split-ext :extra_plot_info [:project_rid :visible_id :plot_geom])))
         ext-plots)))

;;;
;;; Create project
;;;

(defn- create-project-samples! [project-id
                                plot-shape
                                plot-size
                                sample-distribution
                                samples-per-plot
                                sample-resolution
                                sample-file-name
                                sample-file-base64
                                allow-drawn-samples?]
  (let [plots      (call-sql "get_plot_centers_by_project" project-id)
        plot-count (count plots)
        samples    (if (#{"csv" "shp"} sample-distribution)
                     (generate-file-samples plots
                                            plot-count
                                            project-id
                                            sample-distribution
                                            sample-file-name
                                            sample-file-base64)
                     (generate-point-samples plots
                                             plot-count
                                             plot-shape
                                             plot-size
                                             sample-distribution
                                             samples-per-plot
                                             sample-resolution))]
    (p-insert-rows! "samples" samples)
    (if allow-drawn-samples?
      (when (#{"csv" "shp"} sample-distribution)
        ;; FIXME, Create a copy of external sample so they can be restored.
        (log "Restoring external samples for user drawn samples is temporarily broken"))
      (let [bad-plots (map :visible_id (call-sql "plots_missing_samples" project-id))]
        (when (seq bad-plots)
          (init-throw (str "The uploaded plot and sample files do not have correctly overlapping data. "
                           (count bad-plots)
                           " plots have no samples. The first 10 PLOTIDs are: ["
                           (str/join ", " (take 10 bad-plots))
                           "]")))))))

(defn- create-project-plots! [project-id
                              lon-min
                              lat-min
                              lon-max
                              lat-max
                              plot-distribution
                              num-plots
                              plot-spacing
                              plot-shape
                              plot-size
                              plot-file-name
                              plot-file-base64
                              sample-distribution
                              samples-per-plot
                              sample-resolution
                              sample-file-name
                              sample-file-base64
                              allow-drawn-samples?]
  ;; Create plots
  (let [plots (if (#{"csv" "shp"} plot-distribution)
                (generate-file-plots project-id
                                     plot-distribution
                                     plot-file-name
                                     plot-file-base64)
                (generate-point-plots project-id
                                      lon-min
                                      lat-min
                                      lon-max
                                      lat-max
                                      plot-distribution
                                      num-plots
                                      plot-spacing
                                      plot-size))]
    (insert-rows! "plots" plots))

  ;; Validate plots after insert
  (when (#{"csv" "shp"} plot-distribution)
    (try-catch-throw #(call-sql "set_boundary"
                                project-id
                                (if (= plot-distribution "shp") 0 plot-size))
                     "SQL Error: cannot create a project AOI."))
  (when-not (sql-primitive (call-sql "valid_project_boundary" project-id))
    (init-throw (str "The project boundary is invalid. "
                     "This can come from improper coordinates or projection when uploading shape or csv data.")))

  ;; Create samples from plots
  (create-project-samples! project-id
                           plot-shape
                           plot-size
                           sample-distribution
                           samples-per-plot
                           sample-resolution
                           sample-file-name
                           sample-file-base64
                           allow-drawn-samples?)

  ;; Final clean up
  (call-sql "update_project_counts" project-id))

(defn create-project! [{:keys [params]}]
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
      ;; Create or copy plots
      (if (and (pos? project-template) use-template-plots)
        (call-sql "copy_template_plots" project-template project-id)
        (create-project-plots! project-id
                               lon-min
                               lat-min
                               lon-max
                               lat-max
                               plot-distribution
                               num-plots
                               plot-spacing
                               plot-shape
                               plot-size
                               plot-file-name
                               plot-file-base64
                               sample-distribution
                               samples-per-plot
                               sample-resolution
                               sample-file-name
                               sample-file-base64
                               allow-drawn-samples?))
      ;; Save project imagery
      (if-let [imagery-list (:projectImageryList params)]
        (insert-project-imagery! project-id imagery-list)
        (call-sql "add_all_institution_imagery" project-id)) ; API backwards compatibility
      ;; Copy template widgets
      ;; TODO this can be a simple SQL query once we drop the dashboard ID
      (when (and (pos? project-template) use-template-widgets)
        (let [new-uuid (tc/str->pg-uuid (str (UUID/randomUUID)))]
          (doseq [{:keys [widget]} (call-sql "get_project_widgets_by_project_id" project-template)]
            (call-sql "add_project_widget"
                      project-id
                      new-uuid
                      widget))))
      ;; Return new ID and token
      (data-response {:projectId project-id
                      :tokenKey  token-key})
      (catch Exception e
        ;; Delete new project on error
        (try
          (call-sql "delete_project" project-id)
          (catch Exception _))
        (let [causes (:causes (ex-data e))]
          ;; Log unknown errors
          (when-not causes (log (ex-message e)))
          ;; Return error stack to user
          (data-response (if causes
                           (str "-" (str/join "\n-" causes))
                           "Unknown server error.")))))))

;;;
;;; Update project
;;;

(defn reset-collected-samples! [project-id]
  (let [project (first (call-sql "select_project_by_id" project-id))
        sample-distribution  (:sample_distribution project)
        allow-drawn-samples? (:allow_drawn_samples project)]
    (call-sql "delete_user_plots_by_project" project-id)
    ;; samples must also be deleted when allow-drawn-samples? because the user has drawn them.
    (cond
      (not allow-drawn-samples?)
      nil

      (#{"csv" "shp"} sample-distribution)
      (do
        ;; FIXME
        (init-throw "Restoring external samples for user drawn samples is temporarily broken.")
        (call-sql "delete_all_samples_by_project" project-id)
        #_(call-sql "copy_saved_samples" project-id))

      :else
      (let [plot-shape        (:plot_shape project)
            plot-size         (tc/val->float (:plot_size project))
            samples-per-plot  (tc/val->int (:samples_per_plot project))
            sample-resolution (tc/val->float (:sample_resolution project))]
        (call-sql "delete_all_samples_by_project" project-id)
        (create-project-samples! project-id
                                 plot-shape
                                 plot-size
                                 sample-distribution
                                 samples-per-plot
                                 sample-resolution
                                 nil
                                 nil
                                 allow-drawn-samples?)))))

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

(defn update-project! [{:keys [params]}]
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
          (insert-project-imagery! project-id imagery-list))
        (cond
          (not= "unpublished" (:availability original-project))
          nil

          (or (not= plot-distribution (:plot_distribution original-project))
              (if (#{"csv" "shp"} plot-distribution)
                plot-file-base64
                (or (not (same-polygon-boundary? (tc/jsonb->clj boundary) (tc/jsonb->clj (:boundary original-project))))
                    (not= num-plots    (:num_plots original-project))
                    (not= plot-shape   (:plot_shape original-project))
                    (not= plot-size    (:plot_size original-project))
                    (not= plot-spacing (:plot_spacing original-project)))))
          (do
            (call-sql "delete_plots_by_project" project-id)
            (create-project-plots! project-id
                                   lon-min
                                   lat-min
                                   lon-max
                                   lat-max
                                   plot-distribution
                                   num-plots
                                   plot-spacing
                                   plot-shape
                                   plot-size
                                   plot-file-name
                                   plot-file-base64
                                   sample-distribution
                                   samples-per-plot
                                   sample-resolution
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
            (create-project-samples! project-id
                                     plot-shape
                                     plot-size
                                     sample-distribution
                                     samples-per-plot
                                     sample-resolution
                                     sample-file-name
                                     sample-file-base64
                                     allow-drawn-samples?))

          ;; NOTE: Old stored questions can have a different format than when passed from the UI.
          ;;       This is why we check whether the survey questions are different on the front (for now).
          (or update-survey
              (and (:allow_drawn_samples original-project) (not allow-drawn-samples?)))
          (reset-collected-samples! project-id))
        (data-response ""))
      (data-response (str "Project " project-id " not found.")))))

(defn publish-project! [{:keys [params]}]
  (let [user-id      (:userId params -1)
        project-id   (tc/val->int (:projectId params))
        clear-saved? (tc/val->bool (:clearSaved params))]
    (when clear-saved? (reset-collected-samples! project-id))
    (call-sql "publish_project" project-id)
    (data-response (build-project-by-id user-id project-id))))

(defn close-project! [{:keys [params]}]
  (let [user-id    (:userId params -1)
        project-id (tc/val->int (:projectId params))]
    (call-sql "close_project" project-id)
    (data-response (build-project-by-id user-id project-id))))

(defn archive-project! [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))]
    (call-sql "archive_project" project-id)
    (data-response "")))

;;;
;;; Dump data common helper functions
;;;

(defn- csv-quotes [string]
  (if (and (string? string) (str/includes? string ","))
    (str "\"" string "\"")
    string))

(defn- get-ext-headers
  "Gets external headers"
  [rows ext-key prefix]
  (->> rows
       (first)
       (ext-key)
       (tc/jsonb->clj)
       (keys)
       (mapv #(str prefix (name %)))))

(defn- prefix-keys [prefix in-map]
  (pu/mapm (fn [[key val]]
             [(str prefix (name key)) val])
           in-map))

(defn- map->csv [row-map key-set default]
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

(defn- format-time [pg-time]
  (when pg-time
    (.format (SimpleDateFormat. "YYYY-MM-dd HH:mm")
             pg-time)))

(defn- remove-vector-items [coll & items]
  (->> coll
       (remove (set items))
       (vec)))

;;;
;;; Dump aggregate
;;;

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

(defn dump-project-aggregate-data! [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))]
    (if-let [project-info (first (call-sql "select_project_by_id" project-id))]
      (let [plots            (call-sql "dump_project_plot_data" project-id)
            survey-questions (tc/jsonb->clj (:survey_questions project-info))
            confidence?      (-> project-info
                                 (:options)
                                 (tc/jsonb->clj)
                                 (:collectConfidence))
            text-headers     (concat (remove-vector-items plot-base-headers
                                                          (when-not confidence? :confidence))
                                     (get-ext-headers plots :extra_plot_info "pl_"))
            number-headers   (get-value-distribution-headers survey-questions)
            headers-out      (->> (concat text-headers number-headers)
                                  (map #(-> % name csv-quotes))
                                  (str/join ",")
                                  (str "\uFEFF")) ; Prefix headers with a UTF-8 tag
            data-rows        (map (fn [row]
                                    (let [samples         (tc/jsonb->clj (:samples row))
                                          extra-plot-info (tc/jsonb->clj (:extra_plot_info row))]
                                      (str/join ","
                                                (concat (map->csv (merge (-> row
                                                                             (assoc  :sample_points
                                                                                     (count samples))
                                                                             (update :collection_time format-time)
                                                                             (update :analysis_duration #(when % (str % " secs"))))
                                                                         (prefix-keys "pl_" extra-plot-info))
                                                                  text-headers
                                                                  "")
                                                        (map->csv (get-value-distribution samples)
                                                                  number-headers
                                                                  0)))))
                                  plots)]
        {:headers {"Content-Type" "text/csv"
                   "Content-Disposition" (str "attachment; filename="
                                              (prepare-file-name (:name project-info) "plot")
                                              ".csv")}
         :body (str/join "\n" (cons headers-out data-rows))})
      (data-response "Project not found."))))

;;;
;;; Dump raw
;;;

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

(defn dump-project-raw-data! [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))]
    (if-let [project-info (first (call-sql "select_project_by_id" project-id))]
      (let [samples          (call-sql "dump_project_sample_data" project-id)
            survey-questions (tc/jsonb->clj (:survey_questions project-info))
            text-headers     (concat sample-base-headers
                                     (get-ext-headers samples :extra_plot_info "pl_")
                                     (get-ext-headers samples :extra_sample_info "smpl_")
                                     (map :question survey-questions))
            headers-out      (->> text-headers
                                  (map #(-> % name csv-quotes))
                                  (str/join ",")
                                  (str "\uFEFF")) ; Prefix headers with a UTF-8 tag
            data-rows        (map (fn [row]
                                    (let [saved-answers     (tc/jsonb->clj (:saved_answers row))
                                          extra-plot-info   (tc/jsonb->clj (:extra_plot_info row))
                                          extra-sample-info (tc/jsonb->clj (:extra_sample_info row))]
                                      (str/join ","
                                                (map->csv (merge (-> row
                                                                     (update :collection_time format-time)
                                                                     (update :analysis_duration #(when % (str % " secs"))))
                                                                 (prefix-keys "pl_" extra-plot-info)
                                                                 (prefix-keys "smpl_" extra-sample-info)
                                                                 (extract-answers saved-answers))
                                                          text-headers
                                                          ""))))
                                  samples)]
        {:headers {"Content-Type" "text/csv"
                   "Content-Disposition" (str "attachment; filename="
                                              (prepare-file-name (:name project-info) "sample")
                                              ".csv")}
         :body (str/join "\n" (cons headers-out data-rows))})
      (data-response "Project not found."))))

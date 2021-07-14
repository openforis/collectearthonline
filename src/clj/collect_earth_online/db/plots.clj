(ns collect-earth-online.db.plots
  (:import java.sql.Timestamp)
  (:require [clojure.set :as set]
            [collect-earth-online.utils.type-conversion :as tc]
            [collect-earth-online.database    :refer [call-sql sql-primitive]]
            [collect-earth-online.db.projects :refer [is-proj-admin?]]
            [collect-earth-online.views       :refer [data-response]]))

(defn- time-plus-five-min []
  (Timestamp. (+ (System/currentTimeMillis) (* 5 60 1000))))

(defn get-project-plots [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))
        max-plots  (tc/val->int (:max params) 100000)] ; 100000 loads in ~1.5 seconds.
    (data-response (mapv (fn [{:keys [plot_id center flagged assigned]}]
                           {:id       plot_id
                            :center   center
                            :flagged  flagged
                            :analyses assigned})
                         (call-sql "select_limited_project_plots" project-id max-plots)))))

(defn get-plot-sample-geom [{:keys [params]}]
  (let [plot-id (tc/val->int (:plotId params))]
    (data-response (if-let [plot-geom (sql-primitive (call-sql "select_plot_geom" plot-id))]
                     {:plotGeom     plot-geom
                      :samplesGeoms (mapv :sample_geom
                                          (call-sql "select_plot_sample_geoms" plot-id))}
                     ""))))

(defn- unlock-plots [user-id]
  (call-sql "unlock_plots" {:log? false} user-id))

(defn reset-plot-lock [{:keys [params]}]
  (let [plot-id (tc/val->int (:plotId params))
        user-id (:userId params -1)]
    (call-sql "lock_plot_reset" {:log? false} plot-id user-id (time-plus-five-min))
    (data-response "")))

(defn release-plot-locks [{:keys [params]}]
  (unlock-plots (:userId params -1))
  (data-response ""))

(defn- prepare-samples-array [plot-id]
  (mapv (fn [{:keys [sample_id sample_geom saved_answers]}]
          {:id           sample_id
           :sampleGeom   sample_geom
           :savedAnswers (tc/jsonb->clj saved_answers)})
        (call-sql "select_plot_samples" plot-id)))

(defn- get-collection-plot [params method]
  (let [navigation-mode (:navigationMode params "unanalyzed")
        project-id      (tc/val->int (:projectId params))
        visible-id      (tc/val->int (:visibleId params))
        user-id         (:userId params -1)
        review-all?     (and (= "all" navigation-mode)
                             (is-proj-admin? user-id project-id nil))]
    (data-response (if-let [plot-info (first (if (= "unanalyzed" navigation-mode)
                                               (call-sql (str "select_" method "unassigned_plot")
                                                         project-id
                                                         visible-id)
                                               (call-sql (str "select_" method "user_plot")
                                                         project-id
                                                         visible-id
                                                         user-id
                                                         review-all?)))]
                     (let [{:keys [plot_id
                                   flagged
                                   confidence
                                   flagged_reason
                                   plot_geom
                                   extra_plot_info
                                   visible_id]} plot-info]
                       (unlock-plots user-id)
                       (call-sql "lock_plot"
                                 (:plot_id plot-info)
                                 user-id
                                 (time-plus-five-min))
                       {:id            plot_id
                        :flagged       flagged
                        :flaggedReason (or flagged_reason "")
                        :confidence    (or confidence 100)
                        :visibleId     visible_id
                        :plotGeom      plot_geom
                        :extraPlotInfo (tc/jsonb->clj extra_plot_info {})
                        :samples       (prepare-samples-array plot_id)})
                     "done"))))

(defn get-plot-by-id [{:keys [params]}]
  (let  [project-id (tc/val->int (:projectId params))
         visible-id (tc/val->int (:visibleId params))]
    (if (sql-primitive (call-sql "plot_exists" project-id visible-id))
      (get-collection-plot params "by_id_")
      (data-response "not-found"))))

(defn get-next-plot [{:keys [params]}]
  (get-collection-plot params "next_"))

(defn get-prev-plot [{:keys [params]}]
  (get-collection-plot params "prev_"))

(defn add-user-samples [{:keys [params]}]
  (let [project-id       (tc/val->int (:projectId params))
        plot-id          (tc/val->int (:plotId params))
        user-id          (:userId params -1)
        confidence       (tc/val->int (:confidence params))
        collection-start (tc/val->long (:collectionStart params))
        user-samples     (:userSamples params)
        user-images      (:userImages params)
        plot-samples     (:plotSamples params)
        user-plot-id     (when (not plot-samples)
                           (sql-primitive (call-sql "check_user_plots" plot-id)))
        id-translation   (when plot-samples
                           (call-sql "delete_user_plot_by_plot" plot-id)
                           (call-sql "delete_samples_by_plot" plot-id)
                           (reduce (fn [acc {:keys [id sampleGeom]}]
                                     (let [new-id (sql-primitive (call-sql "create_project_plot_sample"
                                                                           {:log? false}
                                                                           plot-id
                                                                           (tc/json->jsonb sampleGeom)))]
                                       (assoc acc (str id) (str new-id))))
                                   {}
                                   plot-samples))]
    (if (some seq (vals user-samples))
      (apply call-sql
             (concat (if user-plot-id
                       ["update_user_samples" user-plot-id]
                       ["add_user_samples"])
                     [project-id
                      plot-id
                      user-id
                      (when (pos? confidence) confidence)
                      (Timestamp. collection-start)
                      (tc/clj->jsonb (set/rename-keys user-samples id-translation))
                      (tc/clj->jsonb (set/rename-keys user-images id-translation))]))
      (call-sql "delete_user_plot_by_plot" plot-id))
    (unlock-plots user-id)
    (data-response "")))

(defn flag-plot [{:keys [params]}]
  (let [plot-id          (tc/val->int (:plotId params))
        user-id          (:userId params -1)
        collection-start (tc/val->long (:collectionStart params))
        flagged-reason   (:flaggedReason params)]
    (call-sql "flag_plot" plot-id user-id (Timestamp. collection-start) flagged-reason)
    (unlock-plots user-id)
    (data-response "")))

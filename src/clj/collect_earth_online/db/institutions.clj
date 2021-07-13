(ns collect-earth-online.db.institutions
  (:require [clojure.string :as str]
            [collect-earth-online.utils.type-conversion :as tc]
            [collect-earth-online.database         :refer [call-sql sql-primitive]]
            [collect-earth-online.views            :refer [data-response]]))

;;; Constants

(def ^:private max-name-lenth 400)
(def ^:private max-description-length 2000)

(defn is-inst-admin? [user-id institution-id]
  (and (pos? user-id)
       (pos? institution-id)
       (sql-primitive (call-sql "is_institution_admin" {:log? false} user-id institution-id))))

(defn get-all-institutions [{:keys [params]}]
  (->> (call-sql "select_all_institutions" (:userId params -1))
       (mapv (fn [{:keys [institution_id name is_member]}]
               {:id       institution_id
                :name     name
                :isMember is_member}))
       (data-response)))

(defn get-institution-by-id [{:keys [params]}]
  (let [institution-id (tc/val->int (:institutionId params))
        user-id        (:userId params -1)]
    (if-let [institution (first (call-sql "select_institution_by_id" institution-id user-id))]
      (data-response (let [{:keys [name base64_image url description institution_admin]} institution]
                       {:name             name
                        :url              url
                        :description      description
                        :institutionAdmin institution_admin
                        :base64Image      base64_image})) ; base64Image is last so it does not appear in the logs.
      (data-response (str "Institution " institution-id " is not found.")))))

(defn- check-inputs [name description]
  (cond
    (or (nil? name) (= name ""))
    (data-response (str "Name is required."))

    (> (count description) max-name-lenth)
    (data-response (str "Institution name must not exceed " max-name-lenth " characters."))

    (or (nil? description) (= description ""))
    (data-response (str "Description is required."))

    (> (count description) max-description-length)
    (data-response (str "Institution description must not exceed " max-description-length " characters."))))

(defn- get-create-errors [name description]
  (let [input-error (check-inputs name description)]
    (cond
      input-error
      input-error

      (sql-primitive (call-sql "institution_name_taken" name -1))
      (data-response (str "Institution with the name " name " already exists.")))))

(defn create-institution [{:keys [params]}]
  (let [user-id      (:userId params -1)
        name         (:name params)
        base64-image (:base64Image params)
        url          (:url params)
        description  (:description params)]
    (if-let [error-message (get-create-errors name description)]
      (data-response error-message)
      (if-let [institution-id (sql-primitive (call-sql "add_institution" name url description))]
        (do
          (when (pos? (count base64-image))
            (call-sql "update_institution_logo" {:log? false} institution-id (second (str/split base64-image #","))))
          (doseq [admin-id (set [user-id 1])]
            (call-sql "add_institution_user" institution-id admin-id 1))
          (data-response institution-id))
        (data-response "")))))

(defn- get-update-errors [institution-id user-id name description]
  (let [input-error (check-inputs name description)]
    (cond
      input-error
      input-error

      (nil? (first (call-sql "select_institution_by_id" institution-id user-id)))
      (str "Institution " institution-id " is not found.")

      (sql-primitive (call-sql "institution_name_taken" name institution-id))
      (str "Institution with the name " name " already exists."))))

(defn update-institution [{:keys [params]}]
  (let [user-id        (:userId params -1)
        institution-id (tc/val->int (:institutionId params))
        name           (:name params)
        base64-image   (:base64Image params)
        url            (:url params)
        description    (:description params)]
    (if-let [error-message (get-update-errors institution-id user-id name description)]
      (data-response error-message)
      (do
        (call-sql "update_institution" institution-id name url description)
        (when (pos? (count base64-image))
          (call-sql "update_institution_logo" {:log? false} institution-id (second (str/split base64-image #","))))
        (data-response "")))))

(defn archive-institution [{:keys [params]}]
  (let [institution-id (tc/val->int (:institutionId params))]
    (call-sql "archive_institution" institution-id)
    (data-response "")))

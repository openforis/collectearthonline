(ns collect-earth-online.db.users
  (:import java.time.format.DateTimeFormatter
           java.time.LocalDateTime
           java.util.UUID)
  (:require [clojure.string :as str]
            [collect-earth-online.utils.type-conversion :as tc]
            [collect-earth-online.database   :refer [call-sql sql-primitive]]
            [collect-earth-online.utils.mail :refer [email? send-mail get-base-url]]
            [collect-earth-online.views      :refer [data-response]]))

(defn login [{:keys [params]}]
  (let [{:keys [email password]} params]
    (if-let [user (first (call-sql "check_login" {:log? false} email password))]
      (data-response ""
                     {:session {:userId   (:user_id user)
                                :userName email
                                :userRole (if (:administrator user) "admin" "user")}}) ; TODO user 1 is the only superuser
      (data-response "Invalid email/password combination."))))

(defn- get-register-errors [email password password-confirmation]
  (cond (not (email? email))
        (str email " is not a valid email address.")

        (< (count password) 8)
        "Password must be at least 8 characters."

        (not= password password-confirmation)
        "Password and Password confirmation do not match."

        (sql-primitive (call-sql "email_taken" email -1))
        (str "Account " email " already exists.")

        :else nil))

(defn register [{:keys [params]}]
  (let [email                 (:email params)
        password              (:password params)
        password-confirmation (:passwordConfirmation params)]
    (if-let [error-msg (get-register-errors email password password-confirmation)]
      (data-response error-msg)
      (let [user-id   (sql-primitive (call-sql "add_user" email password))
            timestamp (-> (DateTimeFormatter/ofPattern "yyyy/MM/dd HH:mm:ss")
                          (.format (LocalDateTime/now)))
            email-msg (format (str "Dear %s,\n\n"
                                   "Thank you for signing up for CEO!\n\n"
                                   "Your Account Summary Details:\n\n"
                                   "  Email: %s\n"
                                   "  Created on: %s\n\n"
                                   "Kind Regards,\n"
                                   "  The CEO Team")
                              email email timestamp)]
        (try
          (send-mail email nil nil "Welcome to CEO!" email-msg "text/plain")
          (catch Exception _))
        (data-response ""
                       {:session {:userId   user-id
                                  :userName email
                                  :userRole "user"}})))))

(defn logout [_]
  (data-response "" {:session nil}))

(defn- get-update-account-errors [user-id current-email current-password new-email password password-confirmation]
  (cond (str/blank? current-password)
        "Current Password required"

        (empty? (call-sql "check_login" current-email current-password))
        "Invalid current password."

        (not (or (str/blank? new-email) (email? new-email)))
        (str new-email " is not a valid email address.")

        (and (not (str/blank? new-email))
             (sql-primitive (call-sql "email_taken" new-email user-id)))
        (str "An account with the email " new-email " already exists.")

        (and (not (str/blank? password)) (< (count password) 8))
        "New Password must be at least 8 characters."

        (not= password password-confirmation)
        "New Password and Password confirmation do not match."

        :else nil))

(defn update-account [{:keys [params]}]
  (let [user-id               (:userId params -1)
        current-email         (:userName params)
        current-password      (:currentPassword params)
        new-email             (:email params)
        password              (:password params)
        password-confirmation (:passwordConfirmation params)]
    (if-let [error-msg (get-update-account-errors user-id current-email current-password
                                                  new-email password password-confirmation)]
      (data-response error-msg)
      ;; TODO: Create a single "update_user_information" sql function, use userid instead of email
      (let [updated-email (if (or (str/blank? new-email) (= new-email current-email))
                            current-email
                            (sql-primitive (call-sql "set_user_email" current-email new-email)))]
        (when-not (str/blank? password)
          (call-sql "update_password" updated-email password))
        (data-response "" {:session {:userName updated-email}})))))

(defn password-request [{:keys [params]}]
  (let [reset-key (str (UUID/randomUUID))
        email     (sql-primitive (call-sql "set_password_reset_key" (:email params) reset-key))
        email-msg (format (str "Hi %s,\n\n"
                               "  To reset your password, simply click the following link:\n\n"
                               "  %spassword-reset?email=%s&passwordResetKey=%s")
                          email (get-base-url) email reset-key)]
    (if email
      (try
        (send-mail email nil nil "Password reset on CEO" email-msg "text/plain")
        (data-response "")
        (catch Exception _
          (data-response (str "A user with the email "
                              email
                              " was found, but there was a server error.  Please contact support@sig-gis.com."))))
      (data-response "There is no user with that email address."))))

(defn- get-password-reset-errors [email reset-key password password-confirmation user]
  (cond (nil? user)
        "There is no user with that email address."

        (not= reset-key (:reset_key user))
        (str "Invalid reset key for user " email ".")

        (< (count password) 8)
        "Password must be at least 8 characters."

        (not= password password-confirmation)
        "Password and Password confirmation do not match."

        :else nil))

(defn password-reset [{:keys [params]}]
  (let [email                 (:email params)
        reset-key             (:passwordResetKey params)
        password              (:password params)
        password-confirmation (:passwordConfirmation params)
        user                  (first (call-sql "get_user" email))]
    (if-let [error-msg (get-password-reset-errors email reset-key password password-confirmation user)]
      (data-response error-msg)
      (do
        (call-sql "update_password" email password)
        (data-response "")))))

(defn get-institution-users [{:keys [params]}]
  (let [institution-id (tc/val->int (:institutionId params))
        all-users      (mapv (fn [{:keys [user_id email institution_role]}]
                               {:id              user_id
                                :email           email
                                :institutionRole institution_role})
                             (call-sql "get_all_users_by_institution_id" institution-id))]
    (data-response all-users)))

(defn get-user-stats [{:keys [params]}]
  (let [account-id (tc/val->int (:accountId params))]
    (if-let [stats (first (call-sql "get_user_stats" account-id))]
      (data-response {:totalProjects (:total_projects stats)
                      :totalPlots    (:total_plots stats)
                      :averageTime   (:average_time stats)
                      :perProject    (tc/jsonb->clj (:per_project stats))})
      (data-response {}))))

(defn update-institution-role [{:keys [params]}]
  (let [new-user-email   (:newUserEmail params)
        account-id       (if-let [id (:accountId params)]
                           (tc/val->int id)
                           (-> (call-sql "get_user" new-user-email) (first) (:user_id -1)))
        institution-id   (tc/val->int (:institutionId params))
        institution-role (:institutionRole params)
        email            (:email (first (call-sql "get_user_by_id" account-id)))]
    (cond
      (nil? email)
      (data-response (str "User " new-user-email " not found."))

      (= institution-role "not-member")
      (do
        (call-sql "remove_institution_user_role" institution-id account-id)
        (data-response (str "User " email " has been removed.")))

      :else
      (let [institution-name (:name (first (call-sql "select_institution_by_id" institution-id -1)))
            timestamp        (-> (DateTimeFormatter/ofPattern "yyyy/MM/dd HH:mm:ss")
                                 (.format (LocalDateTime/now)))
            inst-user-id     (sql-primitive (call-sql "update_institution_user_role"
                                                      institution-id
                                                      account-id
                                                      institution-role))
            email-msg        (format (str "Dear %s,\n\n"
                                          "You have been assigned the role of %s for %s on %s.\n\n"
                                          "Kind Regards,\n"
                                          "  The CEO Team")
                                     email institution-role institution-name timestamp)]
        (when-not inst-user-id (call-sql "add_institution_user" institution-id account-id institution-role))
        (try
          (send-mail email nil nil "User Role Assignment" email-msg "text/plain")
          (data-response (str email " has been assigned role " institution-role "."))
          (catch Exception _
            (data-response (str email
                                " has been assigned role "
                                institution-role
                                ", but the email notification has failed."))))))))

(defn request-institution-membership [{:keys [params]}]
  (let [user-id        (:userId params -1)
        institution-id (tc/val->int (:institutionId params))]
    (if (pos? user-id)
      (do
        (call-sql "add_institution_user" institution-id user-id 3)
        (let [institution-name (:name (first (call-sql "select_institution_by_id" institution-id -1)))
              timestamp        (-> (DateTimeFormatter/ofPattern "yyyy/MM/dd HH:mm:ss")
                                   (.format (LocalDateTime/now)))
              user-email       (:email (first (call-sql "get_user_by_id" user-id)))
              admin-emails     (->> (call-sql "get_all_users_by_institution_id" institution-id)
                                    (filter (fn [{:keys [institution_role]}] (= institution_role "admin")))
                                    (map :email))
              email-msg       (format (str "User %s has requested the access to institution \"%s\" on %s.\n\n"
                                           "To access the institution page, simply click the following link:\n\n"
                                           "%sreview-institution?institutionId=%s")
                                      user-email
                                      institution-name
                                      timestamp
                                      (get-base-url)
                                      institution-id)]
          (try
            (send-mail admin-emails nil nil "CEO Membership Request" email-msg "text/plain")
            (data-response (str "Membership has been requested for user " user-email "."))
            (catch Exception _
              (data-response (str user-email
                                  " has requested the membership to "
                                  institution-name
                                  ", but the email notification has failed."))))))
      (data-response "You must be logged into request membership."))))

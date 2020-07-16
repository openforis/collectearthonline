(ns org.openforis.ceo.db.users
  (:import java.time.format.DateTimeFormatter
           java.time.LocalDateTime
           java.util.UUID)
  (:require [clojure.string :as str]
            [org.openforis.ceo.database :refer [call-sql sql-primitive]]
            [org.openforis.ceo.utils.mail :refer [email? send-mail mail-config]]))

(defn login [{:keys [params]}]
  (let [{:keys [email password]} params]
    (if-let [user (first (call-sql "check_login" email password))]
      ;; Authentication successful
      {:status  200
       :headers {"Content-Type" "text/plain"}
       :body    ""
       :session {:userId   (:user_id user)
                 :userName email
                 :userRole (if (:administrator user) "admin" "user")}}
      ;; Authentication failed
      {:status  200
       :headers {"Content-Type" "text/plain"}
       :body    "Invalid email/password combination."})))

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
        password-confirmation (:passwordConfirmation params)
        on-mailing-list?      (boolean (:onMailingList params))]
    (if-let [error-msg (get-register-errors email password password-confirmation)]
      {:status  200
       :headers {"Content-Type" "text/plain"}
       :body    error-msg}
      (let [user-id   (sql-primitive (call-sql "add_user" email password on-mailing-list?))
            timestamp (-> (DateTimeFormatter/ofPattern "yyyy/MM/dd HH:mm:ss")
                          (.format (LocalDateTime/now)))
            email-msg     (format (str/join "\n"
                                            ["Dear %s,\n"
                                             "Thank you for signing up for CEO!\n"
                                             "Your Account Summary Details:\n"
                                             "  Email: %s"
                                             "  Created on: %s\n"
                                             "Kind Regards,"
                                             "  The CEO Team"])
                                  email email timestamp)]
        (send-mail [email] nil nil "Welcome to CEO!" email-msg "text/plain")
        {:status  200
         :headers {"Content-Type" "text/plain"}
         :body    ""
         :session {:userId   user-id
                   :userName email
                   :userRole "user"}}))))

(defn logout [_]
  {:status  200
   :headers {"Content-Type" "text/plain"}
   :body    ""
   :session nil})

(defn- get-update-account-errors [stored-email email password password-confirmation current-password]
  (cond (str/blank? current-password)
        "Current Password required"

        (not (or (str/blank? email) (email? email)))
        (str email " is not a valid email address.")

        (and (not (str/blank? password)) (< (count password) 8))
        "New Password must be at least 8 characters."

        (not= password password-confirmation)
        "New Password and Password confirmation do not match."

        (empty? (call-sql "check_login" stored-email current-password))
        "Invalid current password."

        :else nil))

(defn- update-email [user-id old-email new-email]
  (if (sql-primitive (call-sql "email_taken" new-email user-id))
    {:status  200
     :headers {"Content-Type" "text/plain"}
     :body    (str "An account with the email " new-email " already exists.")}
    (do
      (call-sql "set_user_email" old-email new-email)
      {:status  200
       :headers {"Content-Type" "text/plain"}
       :body    ""
       :session {:userName new-email}})))

(defn update-account [{:keys [params]}]
  (let [user-id               (Integer/parseInt (or (:userId params) "-1"))
        stored-email          (:userName params)
        email                 (:email params)
        password              (:password params)
        password-confirmation (:passwordConfirmation params)
        current-password      (:currentPassword params)
        on-mailing-list?      (boolean (:onMailingList params))]
    (if-let [error-msg (get-update-account-errors stored-email email password password-confirmation current-password)]
      {:status  200
       :headers {"Content-Type" "text/plain"}
       :body    error-msg}
      (do
        (when (and (not (str/blank? email)) (not= email stored-email))
          (update-email user-id stored-email email))
        (when (not (str/blank? password))
          (call-sql "update_password" stored-email password))
        (call-sql "set_mailing_list" user-id on-mailing-list?)
        {:status  200
         :headers {"Content-Type" "text/plain"}
         :body    ""}))))

(defn get-password-reset-key [request]
  (let [email (-> request :params :email)]
    (if (first (call-sql "get_user" email))
      (let [reset-key (str (UUID/randomUUID))]
        (if (sql-primitive (call-sql "set_password_reset_key" email reset-key))
          (let [email-msg (format (str/join "\n"
                                            ["Hi %s,\n"
                                             "  To reset your password, simply click the following link:\n"
                                             "  %spassword-reset?email=%s&password-reset-key=%s"])
                                  email (:base-url @mail-config) email reset-key)]
            (send-mail [email] nil nil "Password reset on CEO" email-msg "text/plain")
            {:status  200
             :headers {"Content-Type" "text/plain"}
             :body    ""})
          {:status  200
           :headers {"Content-Type" "text/plain"}
           :body    "Failed to create a reset key. Please try again later"}))
      {:status  200
       :headers {"Content-Type" "text/plain"}
       :body    "There is no user with that email address."})))

(defn- get-reset-password-errors [password password-confirmation]
  (cond (< (count password) 8)
        "Password must be at least 8 characters."

        (not= password password-confirmation)
        "Password and Password confirmation do not match."

        :else nil))

(defn reset-password [{:keys [params]}]
  (let [email                 (:email params)
        reset-key             (:passwordResetKey params)
        password              (:password params)
        password-confirmation (:passwordConfirmation params)]
    (if-let [error-msg (get-reset-password-errors password password-confirmation)]
      {:status  200
       :headers {"Content-Type" "text/plain"}
       :body    error-msg}
      (if-let [user (first (call-sql "get_user" email))]
        (if (= reset-key (:reset_key user))
          (do
            (call-sql "update_password" email password)
            {:status  200
             :headers {"Content-Type" "text/plain"}
             :body    ""})
          {:status  200
           :headers {"Content-Type" "text/plain"}
           :body    (str "Invalid reset key for user " email ".")})
        {:status  200
         :headers {"Content-Type" "text/plain"}
         :body    "There is no user with that email address."}))))

(defn get-all-users [request])

(defn get-institution-users [request])

(defn get-user-details [request])

(defn get-user-stats [request])

(defn update-project-user-stats [request])

(defn get-institution-roles [user-id]) ; Returns {int -> string}

(defn update-institution-role [request])

(defn request-institution-membership [request])

(defn submit-email-for-mailing-list [request])

(defn unsubscribe-from-mailing-list [request])

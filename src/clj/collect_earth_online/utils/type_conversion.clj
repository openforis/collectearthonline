(ns collect-earth-online.utils.type-conversion
  (:import org.postgresql.util.PGobject)
  (:require [clojure.data.json :refer [read-str write-str]]))

(defn val->int
  ([val]
   (val->int val (int -1)))
  ([val default]
   (cond
     (instance? Integer val) val
     (number? val)           (int val)
     :else                   (try
                               (Integer/parseInt val)
                               (catch Exception _ (int default))))))

(defn val->long
  ([val]
   (val->long val (long -1)))
  ([val default]
   (cond
     (instance? Long val) val
     (number? val)       (long val)
     :else               (try
                           (Long/parseLong val)
                           (catch Exception _ (long default))))))

;; Warning Postgres type float is equivalent to java Double, and Postgres real is equivalent to java Float
(defn val->float
  ([val]
   (val->float val (float -1.0)))
  ([val default]
   (cond
     (instance? Float val) val
     (number? val)        (float val)
     :else                (try
                            (Float/parseFloat val)
                            (catch Exception _ (float default))))))

;; Warning Postgres type float is equivalent to java Double, and Postgres real is equivalent to java Float
(defn val->double
  ([val]
   (val->double val (double -1.0)))
  ([val default]
   (cond
     (instance? Double val) val
     (number? val)          (double val)
     :else                  (try
                              (Double/parseDouble val)
                              (catch Exception _ (double default))))))

(defn val->bool
  ([val]
   (val->bool val false))
  ([val default]
   (if (instance? Boolean val)
     val
     (try
       (Boolean/parseBoolean val)
       (catch Exception _ (boolean default))))))

;; TODO: This is a temporary fix for survey questions
(defn- keyword-str [str]
  (if (and (string? str) (re-matches #"[\p{L}*+!_?-][\p{L}\d*+!_?-]*" str))
    (keyword str)
    str))

(defn json->clj
  ([json]
   (json->clj json nil))
  ([json default]
   (try
     (read-str json :key-fn keyword-str)
     (catch Exception _ default))))

(def jsonb->json str)

(defn jsonb->clj
  ([jsonb]
   (jsonb->clj jsonb nil))
  ([jsonb default]
   (-> jsonb jsonb->json (json->clj default))))

(def clj->json write-str)

(defn clj->jsonb [clj]
  (doto (PGobject.)
    (.setType "jsonb")
    (.setValue (clj->json clj))))

(defn json->jsonb [json]
  (-> json json->clj clj->jsonb))

(defn str->pg-uuid [str]
  (doto (PGobject.)
    (.setType "uuid")
    (.setValue str)))

;; TODO use general form for the above two
(defn str->pg [str pg-type]
  (doto (PGobject.)
    (.setType pg-type)
    (.setValue str)))

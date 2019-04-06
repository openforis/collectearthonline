CREATE ROLE ceo WITH LOGIN CREATEDB PASSWORD 'ceo'; --ommit after created once
DROP DATABASE IF EXISTS ceo;
CREATE DATABASE ceo WITH OWNER ceo;
\c ceo
CREATE EXTENSION postgis;
CREATE EXTENSION pgcrypto;
\q
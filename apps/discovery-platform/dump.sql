--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1 (Debian 15.1-1.pgdg110+1)
-- Dumped by pg_dump version 15.1 (Debian 15.1-1.pgdg110+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_table_access_method = heap;


--
-- Name: funding_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.funding_requests (
    id integer NOT NULL,
    registered_node character varying(255) NOT NULL,
    request_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.funding_requests OWNER TO postgres;

--
-- Name: funding_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.funding_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.funding_requests_id_seq OWNER TO postgres;

--
-- Name: funding_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.funding_requests_id_seq OWNED BY public.funding_requests.id;


--
-- Name: quotas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quotas (
    id integer NOT NULL,
    client character varying(255) NOT NULL,
    quota integer NOT NULL,
    action_taker character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.quotas OWNER TO postgres;

--
-- Name: quotas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.quotas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.quotas_id_seq OWNER TO postgres;

--
-- Name: quotas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.quotas_id_seq OWNED BY public.quotas.id;


--
-- Name: registered_nodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.registered_nodes (
    id character varying(255) NOT NULL,
    has_exit_node boolean DEFAULT false NOT NULL,
    chain_id integer NOT NULL,
    hoprd_api_endpoint character varying(255) NOT NULL,
    hoprd_api_port integer NOT NULL,
    exit_node_pub_key character varying(255),
    total_amount_funded numeric NOT NULL,
    honesty_score numeric NOT NULL,
    reason character varying(255),
    status character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.registered_nodes OWNER TO postgres;

--
-- Name: funding_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.funding_requests ALTER COLUMN id SET DEFAULT nextval('public.funding_requests_id_seq'::regclass);


--
-- Name: quotas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quotas ALTER COLUMN id SET DEFAULT nextval('public.quotas_id_seq'::regclass);


--
-- Name: funding_requests funding_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.funding_requests
    ADD CONSTRAINT funding_requests_pkey PRIMARY KEY (id);


--
-- Name: quotas quotas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quotas
    ADD CONSTRAINT quotas_pkey PRIMARY KEY (id);


--
-- Name: registered_nodes registered_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.registered_nodes
    ADD CONSTRAINT registered_nodes_pkey PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--

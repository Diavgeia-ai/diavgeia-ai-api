#!/bin/bash

# Load environment variables from .env file
set -o allexport
source .env
set +o allexport

# Set the PGPASSWORD environment variable
export PGPASSWORD="$POSTGRES_PASSWORD"

# Connect to the database and run schema.sql
psql -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" -p "$POSTGRES_PORT" -f $1

# Unset the PGPASSWORD environment variable
unset PGPASSWORD
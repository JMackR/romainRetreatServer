#!/bin/bash

subgraphs=("users" "groups" "search" "content" "system")

# Inside the federation network each service listens on container port 4000 (see docker-compose.federation.yml).
url_users="http://users:4000/graphql"
url_groups="http://groups:4000/graphql"
url_search="http://search:4000/graphql"
url_content="http://content:4000/graphql"
url_system="http://system:4000/graphql"

schema_users="subgraphs/users/src/users.graphql"
schema_groups="subgraphs/groups/src/groups.graphql"
schema_search="subgraphs/search/src/search.graphql"
schema_content="subgraphs/content/src/content.graphql"
schema_system="subgraphs/system/src/system.graphql"

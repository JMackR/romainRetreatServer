#!/bin/bash

subgraphs=("users" "groups" "search" "content" "system")

url_users="http://localhost:4001/graphql"
url_groups="http://localhost:4002/graphql"
url_search="http://localhost:4003/graphql"
url_content="http://localhost:4004/graphql"
url_system="http://localhost:4005/graphql"

schema_users="subgraphs/users/src/users.graphql"
schema_groups="subgraphs/groups/src/groups.graphql"
schema_search="subgraphs/search/src/search.graphql"
schema_content="subgraphs/content/src/content.graphql"
schema_system="subgraphs/system/src/system.graphql"

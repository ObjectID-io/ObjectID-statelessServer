"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchObjectsByType = void 0;
const graphql_1 = require("@iota/iota-sdk/graphql");
const _2025_2_1 = require("@iota/iota-sdk/graphql/schemas/2025.2");
const searchObjectsByType = async (objectType, after, graphqlProvider) => {
    const gqlClient = new graphql_1.IotaGraphQLClient({
        url: graphqlProvider,
    });
    const querystring = `
  query ($type: String!, $after: String) {
    objects(filter: { type: $type }, after: $after) {
      edges {
        cursor
        node {
          address
          asMoveObject {
            contents {
              type {
                repr
              }
              data
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
  `;
    try {
        const queryObjects = (0, _2025_2_1.graphql)(querystring);
        const allEdges = [];
        let cursor = after;
        let hasNextPage = true;
        while (hasNextPage) {
            const result = await gqlClient.query({
                query: queryObjects,
                variables: { type: objectType, after: cursor },
            });
            if (!result || !result.data || !result.data.objects || !Array.isArray(result.data.objects.edges)) {
                throw new Error("No data returned from the GraphQL query.");
            }
            allEdges.push(...result.data.objects.edges);
            const pageInfo = result.data.objects.pageInfo;
            hasNextPage = Boolean(pageInfo?.hasNextPage);
            cursor = pageInfo?.endCursor ?? null;
            if (!hasNextPage || !cursor) {
                hasNextPage = false;
            }
        }
        return allEdges;
    }
    catch (err) {
        if (err instanceof Error) {
            console.error("General Error:", err.message);
        }
        const graphQLError = err;
        if (graphQLError.networkError) {
            console.error("Network Error:", graphQLError.networkError);
            return [];
        }
        if (graphQLError.graphQLErrors) {
            console.error("GraphQL Errors:", graphQLError.graphQLErrors);
            return [];
        }
        return [];
    }
};
exports.searchObjectsByType = searchObjectsByType;

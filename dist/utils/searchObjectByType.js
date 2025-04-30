"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchObjectsByType = void 0;
const graphql_1 = require("@iota/iota-sdk/graphql");
const _2025_2_1 = require("@iota/iota-sdk/graphql/schemas/2025.2");
const searchObjectsByType = async (objectType, graphqlProvider) => {
    const gqlClient = new graphql_1.IotaGraphQLClient({
        url: graphqlProvider,
    });
    const querystring = `
      query ($type: String!) {
        objects(filter: { type: $type }) {
          edges {
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
        }
      }
    `;
    try {
        const queryObjects = (0, _2025_2_1.graphql)(querystring);
        const result = await gqlClient.query({
            query: queryObjects,
            variables: { type: objectType },
        });
        if (!result ||
            !result.data ||
            !result.data.objects ||
            !result.data.objects.edges) {
            throw new Error("No data returned from the GraphQL query.");
        }
        return result.data.objects.edges;
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

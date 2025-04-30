import { IotaGraphQLClient } from "@iota/iota-sdk/graphql";
import { graphql } from "@iota/iota-sdk/graphql/schemas/2025.2";
import {} from "@iota/iota-sdk/graphql";

// Tipi per la gestione dei dati
export interface StructField {
  name: string;
  value: { Address?: number[]; String?: string; Number?: string };
}

export interface ObjectEdge {
  node: {
    address: string;
    asMoveObject?: {
      contents?: {
        type?: {
          repr?: string;
        };
        data?: {
          Struct: StructField[];
        };
      };
    };
  };
}

export interface QueryResult {
  objects: {
    edges: ObjectEdge[];
  };
}

export const searchObjectsByType = async (
  objectType: string,
  graphqlProvider: string
) => {

  const gqlClient = new IotaGraphQLClient({
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
    const queryObjects = graphql(querystring);

    const result = await gqlClient.query<QueryResult>({
      query: queryObjects,
      variables: { type: objectType },
    });

    if (
      !result ||
      !result.data ||
      !result.data.objects ||
      !result.data.objects.edges
    ) {
      throw new Error("No data returned from the GraphQL query.");
    }

    return result.data.objects.edges;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("General Error:", err.message);
    }

    type GraphQLErrorType = {
      networkError?: Record<string, unknown>;
      graphQLErrors?: Array<Record<string, unknown>>;
    };

    const graphQLError = err as GraphQLErrorType;

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

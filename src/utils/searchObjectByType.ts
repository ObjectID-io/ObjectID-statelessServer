import { IotaGraphQLClient } from "@iota/iota-sdk/graphql";
import { graphql } from "@iota/iota-sdk/graphql/schemas/2025.2";
import {} from "@iota/iota-sdk/graphql";

export interface StructField {
  name: string;
  value: { Address?: number[]; String?: string; Number?: string };
}

export interface ObjectEdge {
  cursor?: string;
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
    pageInfo?: {
      hasNextPage?: boolean;
      endCursor?: string | null;
    };
  };
}

export const searchObjectsByType = async (objectType: string, after: string | null, graphqlProvider: string) => {
  const gqlClient = new IotaGraphQLClient({
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
    const queryObjects = graphql(querystring);
    const allEdges: ObjectEdge[] = [];
    let cursor = after;
    let hasNextPage = true;

    while (hasNextPage) {
      const result = await gqlClient.query<QueryResult>({
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

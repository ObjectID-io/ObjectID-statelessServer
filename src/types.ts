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
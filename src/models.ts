export interface User {
  groups: string[];
}

export interface RelationshipChange {
  item: string;
  type: "category" | "product";
  action: "add" | "delete";
  parent: string;
}

export interface AccessEntry {
  path: string;
  type: "product" | "group" | "category";
  allowed: string[];
}

export type DatabaseRunResult = {
  success: boolean;
  meta?: Record<string, unknown>;
};

export type DatabaseAllResult<Row> = {
  results: Row[];
  success: boolean;
  meta?: Record<string, unknown>;
};

export interface DatabasePreparedStatement {
  bind(...values: unknown[]): DatabasePreparedStatement;
  all<Row = Record<string, unknown>>(): Promise<DatabaseAllResult<Row>>;
  first<Row = Record<string, unknown>>(column?: string): Promise<Row | null>;
  run(): Promise<DatabaseRunResult>;
}

export interface DatabaseAdapter {
  prepare(sql: string): DatabasePreparedStatement;
  batch(statements: DatabasePreparedStatement[]): Promise<DatabaseRunResult[]>;
}

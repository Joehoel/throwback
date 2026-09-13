import type { DatabaseSync } from "node:sqlite";
import { Schema } from "effect";

const Row = Schema.Record(Schema.String, Schema.Unknown);

const SqlParameter = Schema.Union([Schema.String, Schema.Number, Schema.BigInt, Schema.Null]);

type SqlParameter = typeof SqlParameter.Type;

function meta(changes = 0): D1Meta & Record<string, unknown> {
  return {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: changes,
    last_row_id: 0,
    changed_db: changes > 0,
    changes,
  };
}

class SqliteD1PreparedStatement implements D1PreparedStatement {
  private readonly database: DatabaseSync;
  private readonly query: string;
  private readonly parameters: readonly SqlParameter[];

  public constructor(
    database: DatabaseSync,
    query: string,
    parameters: readonly SqlParameter[] = [],
  ) {
    this.database = database;
    this.query = query;
    this.parameters = parameters;
  }

  public bind(...values: unknown[]): D1PreparedStatement {
    return new SqliteD1PreparedStatement(
      this.database,
      this.query,
      values.map((value) => Schema.decodeUnknownSync(SqlParameter)(value)),
    );
  }

  public first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const value = this.database.prepare(this.query).get(...this.parameters);

    if (value === undefined) {
      return Promise.resolve(null);
    }

    const row = Schema.decodeUnknownSync(Row)(value);

    // SAFETY: This test adapter mirrors D1's caller-selected generic result type after SQLite returned a row.
    return Promise.resolve((columnName === undefined ? row : row[columnName]) as T);
  }

  public run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = this.database.prepare(this.query).run(...this.parameters);

    return Promise.resolve({
      success: true,
      meta: meta(Number(result.changes)),
      results: [],
    });
  }

  public all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const rows = this.database
      .prepare(this.query)
      .all(...this.parameters)
      .map((row) => Schema.decodeUnknownSync(Row)(row));

    return Promise.resolve({
      success: true,
      meta: meta(),
      // SAFETY: SQLite rows are decoded records; D1's API leaves the row generic under caller control.
      results: rows as T[],
    });
  }

  public raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  public raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  public raw<T = unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<T[] | [string[], ...T[]]> {
    const statement = this.database.prepare(this.query);
    const rows = statement.all(...this.parameters);
    const columnNames = statement.columns().map((column) => column.name);

    const values = rows.map((row) => {
      const record = Schema.decodeUnknownSync(Row)(row);

      return columnNames.map((column) => record[column]);
    });

    // SAFETY: Values are emitted in SQLite column order, matching D1PreparedStatement.raw's generic contract.
    const typedValues = values as T[];

    return Promise.resolve(
      options?.columnNames === true ? [columnNames, ...typedValues] : typedValues,
    );
  }
}

class SqliteD1Session implements D1DatabaseSession {
  private readonly database: DatabaseSync;

  public constructor(database: DatabaseSync) {
    this.database = database;
  }

  public prepare(query: string): D1PreparedStatement {
    return new SqliteD1PreparedStatement(this.database, query);
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- D1DatabaseSession requires this operation on each session value.
  public batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return Promise.all(statements.map((statement) => statement.all<T>()));
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- This local session has no replica bookmark to return.
  public getBookmark(): string | null {
    return null;
  }
}

function batchStatements<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
  return Promise.all(statements.map((statement) => statement.all<T>()));
}

/** Create a faithful local D1 query surface over Node's in-memory SQLite. */
export function makeSqliteD1(database: DatabaseSync): D1Database {
  return {
    prepare: (query) => new SqliteD1PreparedStatement(database, query),
    batch: batchStatements,
    exec: async (query) => {
      database.exec(query);

      return { count: 1, duration: 0 };
    },
    withSession: () => new SqliteD1Session(database),
    dump: async () => new ArrayBuffer(0),
  };
}

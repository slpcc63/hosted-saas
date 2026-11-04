const localDatabaseUrl =
  "postgresql://postgres:postgres@127.0.0.1:5432/slpcc63?sslmode=disable";

type DatabaseEnvironment = {
  DATABASE_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
  TCM_QA_DATABASE_URL?: string;
};

export function selectDatabaseUrl(
  environment: DatabaseEnvironment = process.env as DatabaseEnvironment
) {
  return environment.TCM_QA_DATABASE_URL ??
    environment.DATABASE_URL ??
    environment.DATABASE_URL_UNPOOLED ??
    localDatabaseUrl;
}

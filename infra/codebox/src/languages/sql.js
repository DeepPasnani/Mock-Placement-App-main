export default {
  id: 82,
  name: 'SQL (SQLite 3)',
  is_archived: false,
  // The backend (backend/src/services/codebox.js -> buildSubmissionSource)
  // concatenates the test case's schema/sample-data (sent as `stdin`) with
  // the student's query into a single source string before it ever reaches
  // Codebox, so by the time it gets here `main.sql` already contains both
  // the setup statements and the query, in that order. No separate stdin
  // handling is needed on this side.
  source_file: 'main.sql',
  compile_cmd: null,
  run_cmd: 'sqlite3 :memory: < main.sql',
  image: 'codebox/sqlite:3',
};

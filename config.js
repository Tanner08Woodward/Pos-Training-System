// config.js: where the shared database lives.
// These keys are PUBLIC by design (Supabase "anon" key): the database only
// allows what supabase/schema.sql permits (save results; read with the
// manager code). Never put a "service_role" or secret key in this file.
var AppConfig = {
  supabaseUrl: "https://rupvgdamqcpeanalload.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1cHZnZGFtcWNwZWFuYWxsb2FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NjYwMjEsImV4cCI6MjEwNjQ0MjAyMX0.7BqDyDoL-Mj6SxYqDH5DLhxHhyFnGqsu3nN1z6wVIfU",
};

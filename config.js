// config.js: where the shared database lives.
// This key is PUBLIC by design (Supabase publishable key): the database only
// allows what supabase/schema.sql permits (save results; read with the
// manager code). Never put a "service_role" or secret key in this file.
var AppConfig = {
  supabaseUrl: "https://rupvgdamqcpeanalload.supabase.co",
  supabasePublishableKey: "sb_publishable_1JAOVVnF2K8se317E49DAQ_8xrqZEBs",
};

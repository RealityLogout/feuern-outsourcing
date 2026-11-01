// Public configuration only. The database and owner passphrase stay on Oracle.
// The GitHub Pages frontend talks securely to the DNS-only Oracle API hostname.
export const BACKEND_ORIGIN = 'https://hsc-api.feuernoutsourcing.online';
export const apiUrl = (path) => BACKEND_ORIGIN + '/hsc-result-finder/api/' + path;

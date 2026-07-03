// Ambiente de produção (padrão). A API é servida atrás do mesmo host, com o
// Nginx fazendo proxy de /api para o serviço backend (ver apps/web/nginx.conf).
export const environment = {
  production: true,
  apiUrl: "/api",
};

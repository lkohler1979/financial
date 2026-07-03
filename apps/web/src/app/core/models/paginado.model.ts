export interface Paginado<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

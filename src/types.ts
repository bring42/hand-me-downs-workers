export interface UnifiedRecord {
  uid: string;
  source: string;
  source_id: string | number;
  title: string;
  creator: string;
  date_display: string;
  date_start: number | null;
  date_end: number | null;
  medium: string;
  dimensions: string;
  classification: string;
  department: string;
  credit_line: string;
  description: string;
  culture: string;
  image_url: string;
  image_thumb: string;
  additional_images: string[];
  image_count: number;
  object_url: string;
  rights: string;
}

export interface Department {
  name: string;
  count?: number;
  id?: number | string;
}

export interface SearchResult {
  source: string;
  total: number;
  records: UnifiedRecord[];
}

export interface Env {
  RIJKS_API_KEY?: string;
  CACHE?: KVNamespace;
}

export interface SourceModule {
  search(query: string, limit: number): Promise<UnifiedRecord[]>;
  departments(): Promise<Department[]>;
  departmentRecords(name: string, limit: number): Promise<UnifiedRecord[]>;
  idRecords(ids: string[]): Promise<UnifiedRecord[]>;
}
